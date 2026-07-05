import { getCurrentIdToken } from '#app/web/firebase-client';

export interface ApiError extends Error {
  readonly status: number;
}

export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST';

export interface RequestOptions {
  readonly auth: boolean;
  readonly body?: unknown;
  readonly method: HttpMethod;
  readonly path: string;
}

const createApiError = ({
  message,
  status,
}: {
  readonly message: string;
  readonly status: number;
}): ApiError => Object.assign(new Error(message), { status });

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof Error &&
  'status' in error &&
  typeof error.status === 'number';

const parseErrorMessage = async ({
  response,
}: {
  readonly response: Response;
}): Promise<string> => {
  try {
    const json: unknown = await response.json();
    if (typeof json === 'object' && json !== null && 'error' in json) {
      const { error } = json;
      if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof error.message === 'string'
      ) {
        return error.message;
      }
    }
  } catch (error: unknown) {
    void error;
  }
  return `Request failed (${String(response.status)}).`;
};

const buildHeaders = ({
  hasBody,
  token,
}: {
  readonly hasBody: boolean;
  readonly token: string | null;
}): Record<string, string> => ({
  ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
  ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
});

const executeRequest = ({
  body,
  method,
  path,
  token,
}: {
  readonly body?: unknown;
  readonly method: HttpMethod;
  readonly path: string;
  readonly token: string | null;
}): Promise<Response> => {
  const hasBody = body !== undefined;
  return fetch(path, {
    headers: buildHeaders({ hasBody, token }),
    method,
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
  });
};

const retryOn401 = async ({
  body,
  method,
  path,
  response,
}: {
  readonly body?: unknown;
  readonly method: HttpMethod;
  readonly path: string;
  readonly response: Response;
}): Promise<Response> => {
  if (response.status !== 401) {
    return response;
  }
  const refreshed = await getCurrentIdToken({ forceRefresh: true });
  return executeRequest({ body, method, path, token: refreshed });
};

export const requestJson = async ({
  auth,
  body,
  method,
  path,
}: RequestOptions): Promise<unknown> => {
  const token = auth ? await getCurrentIdToken({ forceRefresh: false }) : null;
  const firstResponse = await executeRequest({ body, method, path, token });
  const response = auth
    ? await retryOn401({ body, method, path, response: firstResponse })
    : firstResponse;
  if (!response.ok) {
    throw createApiError({
      message: await parseErrorMessage({ response }),
      status: response.status,
    });
  }
  if (response.status === 204) {
    return undefined;
  }
  const json: unknown = await response.json();
  return json;
};
