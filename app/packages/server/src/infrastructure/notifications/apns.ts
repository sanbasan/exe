import {
  sendHttp2Request,
  toError,
  type ApnsHttp2Response,
} from './apns-http2';
import type { CallSession, DeviceToken } from '@exe/domain';
import { createSign } from 'node:crypto';

export interface ApnsConfig {
  readonly authKey?: string;
  readonly bundleId: string;
  readonly keyId?: string;
  readonly teamId?: string;
}

interface VoipPushResult {
  readonly failedToken: string | null;
}

const base64url = (value: Buffer | string): string =>
  Buffer.from(value).toString('base64url');

const normalizeAuthKey = (authKey: string): string =>
  authKey.replaceAll('\\n', '\n').trim();

const createProviderToken = ({
  authKey,
  issuedAt,
  keyId,
  teamId,
}: {
  readonly authKey: string;
  readonly issuedAt: number;
  readonly keyId: string;
  readonly teamId: string;
}): string => {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = base64url(JSON.stringify({ iat: issuedAt, iss: teamId }));
  const signingInput = `${header}.${payload}`;
  const signature = createSign('SHA256')
    .update(signingInput)
    .sign({ key: normalizeAuthKey(authKey) }, 'base64url');

  return `${signingInput}.${signature}`;
};

const toDiagnosticPart = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value?: string;
}): readonly string[] =>
  value === undefined || value.length === 0 ? [] : [`${label}=${value}`];

const warnApnsDeliveryFailure = ({
  apnsId,
  reason,
  status,
}: ApnsHttp2Response): void => {
  const diagnostic = [
    `status=${String(status)}`,
    ...toDiagnosticPart({
      label: 'reason',
      ...(reason === undefined ? {} : { value: reason }),
    }),
    ...toDiagnosticPart({
      label: 'apnsId',
      ...(apnsId === undefined ? {} : { value: apnsId }),
    }),
  ].join(' ');

  process.emitWarning(`APNs VoIP push failed: ${diagnostic}`, {
    code: 'EXE_APNS_VOIP_PUSH_FAILED',
    type: 'ExeWarning',
  });
};

const warnApnsDeliveryError = (error: Error): void => {
  process.emitWarning(`APNs VoIP push request failed: ${error.message}`, {
    code: 'EXE_APNS_VOIP_PUSH_REQUEST_FAILED',
    type: 'ExeWarning',
  });
};

const shouldRemoveToken = ({ reason, status }: ApnsHttp2Response): boolean =>
  status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered';

const hostForEnvironment = (environment: DeviceToken['environment']): string =>
  environment === 'dev' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';

const oppositeHost = (host: string): string =>
  host === 'api.push.apple.com'
    ? 'api.sandbox.push.apple.com'
    : 'api.push.apple.com';

const warnApnsEnvironmentFallback = ({
  environment,
  host,
}: {
  readonly environment: DeviceToken['environment'];
  readonly host: string;
}): void => {
  process.emitWarning(
    `APNs VoIP push delivered via fallback host ${host}; registered environment (${environment}) does not match the token's APNs environment.`,
    {
      code: 'EXE_APNS_VOIP_PUSH_FALLBACK_USED',
      type: 'ExeWarning',
    }
  );
};

const sendVoipPush = async ({
  config,
  session,
  token,
}: {
  readonly config: ApnsConfig;
  readonly session: CallSession;
  readonly token: DeviceToken;
}): Promise<VoipPushResult> => {
  if (
    config.authKey === undefined ||
    config.keyId === undefined ||
    config.teamId === undefined
  ) {
    process.emitWarning(
      'APNs credentials are incomplete; skipping VoIP push.',
      {
        code: 'EXE_APNS_CONFIG_INCOMPLETE',
        type: 'ExeWarning',
      }
    );

    return { failedToken: null };
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const jwt = createProviderToken({
    authKey: config.authKey,
    issuedAt,
    keyId: config.keyId,
    teamId: config.teamId,
  });
  const sendTo = (host: string): Promise<ApnsHttp2Response> =>
    sendHttp2Request({
      body: JSON.stringify({
        callSessionId: session.id,
        liveKitRoomName: session.liveKitRoomName,
        type: 'call_session_created',
        workspaceId: session.workspaceId,
      }),
      headers: {
        'apns-expiration': String(issuedAt + 60),
        'apns-priority': '10',
        'apns-push-type': 'voip',
        'apns-topic': `${config.bundleId}.voip`,
        authorization: `bearer ${jwt}`,
      },
      host,
      path: `/3/device/${token.token}`,
    }).catch((error: unknown): ApnsHttp2Response => {
      warnApnsDeliveryError(toError(error));

      return {
        body: '',
        status: 0,
      };
    });

  const primaryHost = hostForEnvironment(token.environment);
  const response = await sendTo(primaryHost);

  if (response.status === 200) {
    return { failedToken: null };
  }

  // 登録された environment と実際の APNs 環境がずれている端末(Xcode 直
  // インストール等)を救うため、BadDeviceToken のときだけ反対側のホストへ
  // 一度だけ再送する。
  if (response.reason === 'BadDeviceToken') {
    const fallbackHost = oppositeHost(primaryHost);
    const fallbackResponse = await sendTo(fallbackHost);

    if (fallbackResponse.status === 200) {
      warnApnsEnvironmentFallback({
        environment: token.environment,
        host: fallbackHost,
      });

      return { failedToken: null };
    }

    warnApnsDeliveryFailure(fallbackResponse);

    return {
      failedToken: shouldRemoveToken(fallbackResponse) ? token.token : null,
    };
  }

  warnApnsDeliveryFailure(response);

  return { failedToken: shouldRemoveToken(response) ? token.token : null };
};

export const sendIncomingCallVoipPushes = async ({
  config,
  session,
  tokens,
}: {
  readonly config: ApnsConfig;
  readonly session: CallSession;
  readonly tokens: readonly DeviceToken[];
}): Promise<readonly string[]> => {
  const results = await Promise.all(
    tokens.map((token) => sendVoipPush({ config, session, token }))
  );

  return results
    .map((result) => result.failedToken)
    .filter((token): token is string => token !== null);
};
