/* eslint-disable no-process-env -- Config boundary is the only place that reads runtime environment variables. */

export const secretKeys = {
  gbrain: ['GBRAIN_ROUTER_ADMIN_TOKEN'],
  gemini: ['GEMINI_API_KEY'],
  generated: ['ENCRYPTION_KEY'],
  livekit: ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'],
  push: ['APNS_AUTH_KEY', 'APNS_KEY_ID', 'APNS_TEAM_ID'],
  sendgrid: ['SENDGRID_API_KEY'],
  slack: ['SLACK_CLIENT_SECRET', 'SLACK_SIGNING_SECRET'],
} as const;

// Node's test runner sets NODE_TEST_CONTEXT in the child process it spawns
// per test file; tests must never report to Sentry (intentional failure-path
// errors like "boom" would pollute the dev project as real issues).
const isTestRun =
  process.env['NODE_TEST_CONTEXT'] !== undefined ||
  process.env['NODE_ENV'] === 'test';

// Cloud Functions don't set EXE_ENV (only apphosting does), so derive the
// environment from the runtime project id: projects named `*-prod` are prod,
// everything else is dev. GOOGLE_CLOUD_PROJECT is always present in the GCP
// runtime.
const getDefaultEnvironment = ({
  projectId,
}: {
  readonly projectId?: string;
}): string => (projectId?.endsWith('-prod') === true ? 'prod' : 'dev');

const parsePositiveInteger = ({
  fallback,
  value,
}: {
  readonly fallback: number;
  readonly value?: string;
}): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parseBoolean = ({
  fallback,
  value,
}: {
  readonly fallback: boolean;
  readonly value?: string;
}): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const optionalNonEmptyValue = (value: string): string | undefined => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
};

const projectId =
  process.env['GOOGLE_CLOUD_PROJECT'] ??
  process.env['GCLOUD_PROJECT'] ??
  process.env['GCP_PROJECT'];
const appReviewTestAccountEmail =
  process.env['APP_REVIEW_TEST_ACCOUNT_EMAIL'] === undefined
    ? undefined
    : optionalNonEmptyValue(process.env['APP_REVIEW_TEST_ACCOUNT_EMAIL']);
const appReviewTestSignInCode =
  process.env['APP_REVIEW_TEST_SIGN_IN_CODE'] === undefined
    ? undefined
    : optionalNonEmptyValue(process.env['APP_REVIEW_TEST_SIGN_IN_CODE']);

export const serverConfig = {
  apns: {
    authKey: process.env['APNS_AUTH_KEY'],
    bundleId: process.env['APNS_BUNDLE_ID'] ?? 'com.example.exe',
    keyId: process.env['APNS_KEY_ID'],
    teamId: process.env['APNS_TEAM_ID'],
  },
  app: {
    appStoreUrl: process.env['APP_STORE_URL'],
    environment:
      process.env['EXE_ENV'] ??
      getDefaultEnvironment({
        ...(projectId === undefined ? {} : { projectId }),
      }),
    publicUrl: process.env['NEXT_PUBLIC_APP_URL'] ?? process.env['APP_URL'],
    sentryDsn: isTestRun ? undefined : process.env['SENTRY_DSN'],
    sentryRelease: process.env['SENTRY_RELEASE'],
  },
  appReview: {
    testAccountEmail: appReviewTestAccountEmail,
    testSignInCode: appReviewTestSignInCode,
  },
  firebase: {
    config: process.env['FIREBASE_CONFIG'],
    projectId,
  },
  gbrain: {
    adminToken: process.env['GBRAIN_ROUTER_ADMIN_TOKEN'],
    baseUrl: process.env['GBRAIN_BASE_URL'],
    // Ingest/extract-facts bearer token; when absent the ingest gateway
    // no-ops so environments without GBrain keep working.
    ingestToken: process.env['GBRAIN_INGEST_TOKEN'],
  },
  gemini: {
    // Agent VMs only render GOOGLE_API_KEY (shared with the realtime Gemini
    // Live plugin), so fall back to it for server-side Gemini calls too.
    apiKey: process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'],
    // Non-lite family so a lite-tier capacity shortage doesn't take out both.
    fallbackModel: process.env['GEMINI_FALLBACK_MODEL'] ?? 'gemini-2.5-flash',
    // Flash-tier on purpose: composers are simple rewrite tasks where in-call
    // latency matters, and they run with thinkingBudget 0, which Pro models
    // reject (Pro minimum is 128).
    latestInfoModel:
      process.env['GEMINI_LATEST_INFO_MODEL'] ?? 'gemini-3.1-flash-lite',
    // Full flash tier: meeting recordings are audio-in + long transcription
    // out, where the lite tier is not reliable enough.
    meetingModel: process.env['GEMINI_MEETING_MODEL'] ?? 'gemini-2.5-flash',
    model: process.env['GEMINI_MODEL'] ?? 'gemini-3.1-flash-lite',
  },
  livekit: {
    agentName: process.env['LIVEKIT_AGENT_NAME'] ?? 'exe-task-review-agent',
    apiKey: process.env['LIVEKIT_API_KEY'],
    apiSecret: process.env['LIVEKIT_API_SECRET'],
    roomNamePrefix: process.env['LIVEKIT_ROOM_NAME_PREFIX'] ?? 'exe-',
    wsUrl:
      process.env['LIVEKIT_WS_URL'] ??
      process.env['LIVEKIT_URL'] ??
      process.env['NEXT_PUBLIC_LIVEKIT_WS_URL'],
  },
  livekitVm: {
    autoStopEnabled: parseBoolean({
      fallback: false,
      ...(process.env['LIVEKIT_VM_AUTO_STOP_ENABLED'] === undefined
        ? {}
        : { value: process.env['LIVEKIT_VM_AUTO_STOP_ENABLED'] }),
    }),
    idleGraceMinutes: parsePositiveInteger({
      fallback: 10,
      ...(process.env['LIVEKIT_VM_IDLE_GRACE_MINUTES'] === undefined
        ? {}
        : { value: process.env['LIVEKIT_VM_IDLE_GRACE_MINUTES'] }),
    }),
    instanceName:
      process.env['VM_INSTANCE_NAME'] ??
      process.env['LIVEKIT_VM_INSTANCE_NAME'],
    projectId:
      process.env['VM_PROJECT'] ??
      process.env['LIVEKIT_VM_PROJECT'] ??
      projectId,
    zone:
      process.env['VM_ZONE'] ??
      process.env['LIVEKIT_VM_ZONE'] ??
      'asia-northeast1-b',
  },
  security: {
    encryptionKey: process.env['ENCRYPTION_KEY'],
  },
  sendgrid: {
    apiKey: process.env['SENDGRID_API_KEY'],
    fromEmail: process.env['SENDGRID_FROM_EMAIL'] ?? 'noreply@example.com',
  },
  slack: {
    appId: process.env['SLACK_APP_ID'],
    clientId: process.env['SLACK_CLIENT_ID'],
    clientSecret: process.env['SLACK_CLIENT_SECRET'],
    signingSecret: process.env['SLACK_SIGNING_SECRET'],
  },
} as const;

export const getRequiredConfigValue = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value?: string;
}): string => {
  if (value === undefined || value.length === 0) {
    throw new Error(`${label} is required.`);
  }

  return value;
};
