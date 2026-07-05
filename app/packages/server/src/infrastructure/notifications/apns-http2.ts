import http2 from 'node:http2';

export interface ApnsHttp2Response {
  readonly apnsId?: string;
  readonly body: string;
  readonly reason?: string;
  readonly status: number;
}

export const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

const parseStatus = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number.parseInt(value, 10);
  }

  return 0;
};

const parseApnsReason = (body: string): string | undefined => {
  const match = /"reason"\s*:\s*"([^"]+)"/u.exec(body);

  return match?.[1];
};

const getStringHeader = ({
  value,
}: {
  readonly value?: number | readonly string[] | string;
}): string | undefined => (typeof value === 'string' ? value : undefined);

export const sendHttp2Request = ({
  body,
  headers,
  host,
  path,
}: {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly host: string;
  readonly path: string;
}): Promise<ApnsHttp2Response> =>
  new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`);
    /* eslint-disable functional/no-let -- Node HTTP/2 response state is populated by stream callbacks before completion. */
    let apnsId: string | undefined;
    let responseBody = '';
    let status = 0;
    /* eslint-enable functional/no-let */

    client.on('error', (error) => {
      client.close();
      reject(toError(error));
    });

    const request = client.request({
      ':method': 'POST',
      ':path': path,
      'content-type': 'application/json',
      ...headers,
    });

    request.on('response', (responseHeaders) => {
      apnsId = getStringHeader({
        ...(responseHeaders['apns-id'] === undefined
          ? {}
          : { value: responseHeaders['apns-id'] }),
      });
      status = parseStatus(responseHeaders[':status']);
    });

    request.on('data', (chunk: Buffer | string) => {
      responseBody = `${responseBody}${String(chunk)}`;
    });

    request.on('end', () => {
      client.close();
      const reason = parseApnsReason(responseBody);

      resolve({
        body: responseBody,
        ...(apnsId === undefined ? {} : { apnsId }),
        ...(reason === undefined ? {} : { reason }),
        status,
      });
    });

    request.on('error', (error) => {
      client.close();
      reject(toError(error));
    });
    request.end(body);
  });
