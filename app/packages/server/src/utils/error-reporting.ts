/* eslint-disable functional/immutable-data, functional/no-let, functional/no-loop-statements, security/detect-object-injection -- Event scrubbing mutates local accumulators and the Sentry event in place. */
import { serverConfig } from '#server/config';
import * as Sentry from '@sentry/node';
import type { ErrorEvent, Event } from '@sentry/node';

export interface ErrorReportContext {
  readonly route: string;
}

const redacted = '[Filtered]';
const maxScrubDepth = 5;
const sensitiveKeyPattern =
  /authorization|cookie|csrf|dsn|jwt|key|password|secret|session|token/i;
let didInitializeSentry = false;

type JsonRecord = Readonly<Record<string, unknown>>;
type QueryParams = [string, string][] | Record<string, string> | string;

const normalizeError = (
  error: unknown
): {
  readonly message: string;
  readonly stack?: string;
  readonly type: string;
} => {
  if (error instanceof Error) {
    return {
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
      type: error.name,
    };
  }

  return { message: String(error), type: 'Error' };
};

const errorForCapture = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const normalizeDsn = (dsn?: string): string | null => {
  if (dsn === undefined) {
    return null;
  }

  const trimmed = dsn.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith('TODO_') ||
    !URL.canParse(trimmed)
  ) {
    return null;
  }

  return trimmed;
};

const initializeSentryIfNeeded = (): boolean => {
  if (didInitializeSentry) {
    return Sentry.isEnabled();
  }

  didInitializeSentry = true;

  const dsn = normalizeDsn(serverConfig.app.sentryDsn);
  if (dsn === null) {
    return false;
  }

  Sentry.init({
    attachStacktrace: true,
    beforeSend: scrubErrorEvent,
    beforeSendTransaction: scrubEvent,
    debug: false,
    dsn,
    environment: serverConfig.app.environment,
    integrations: [
      Sentry.extraErrorDataIntegration({ depth: maxScrubDepth }),
      Sentry.rewriteFramesIntegration({ prefix: 'app:///' }),
      Sentry.zodErrorsIntegration(),
    ],
    ...(serverConfig.app.sentryRelease === undefined
      ? {}
      : { release: serverConfig.app.sentryRelease }),
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
  });

  return true;
};

export const reportServerError = async ({
  context,
  error,
}: {
  readonly context: ErrorReportContext;
  readonly error: unknown;
}): Promise<void> => {
  const normalized = normalizeError(error);

  process.stderr.write(
    `${JSON.stringify({
      error: {
        message: normalized.message,
        ...(normalized.stack === undefined ? {} : { stack: normalized.stack }),
        type: normalized.type,
      },
      level: 'error',
      route: context.route,
    })}\n`
  );

  if (!initializeSentryIfNeeded()) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag('route', context.route);
    scope.setContext('route', { path: context.route });
    Sentry.captureException(errorForCapture(error), {
      mechanism: {
        handled: true,
        type: 'exe.server',
      },
    });
  });

  await Sentry.flush(2000).then(
    (): void => undefined,
    (): void => undefined
  );
};

const scrubErrorEvent = (event: ErrorEvent): ErrorEvent => scrubEvent(event);

const scrubEvent = <TEvent extends Event>(event: TEvent): TEvent => {
  if (event.request !== undefined) {
    if (event.request.headers !== undefined) {
      event.request.headers = scrubStringRecord(event.request.headers);
    }

    if (event.request.cookies !== undefined) {
      event.request.cookies = scrubStringRecord(event.request.cookies);
    }

    if (event.request.query_string !== undefined) {
      event.request.query_string = scrubQuery(event.request.query_string);
    }

    if (event.request.data !== undefined) {
      event.request.data = scrubUnknown(event.request.data, 0);
    }
  }

  if (event.extra !== undefined) {
    event.extra = scrubRecord(event.extra, 0);
  }

  return event;
};

const scrubStringRecord = (
  record: Record<string, string>
): Record<string, string> => {
  const scrubbed: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    scrubbed[key] = sensitiveKeyPattern.test(key) ? redacted : value;
  }

  return scrubbed;
};

const scrubQueryEntries = (entries: [string, string][]): [string, string][] =>
  entries.map(([key, value]) => [
    key,
    sensitiveKeyPattern.test(key) ? redacted : value,
  ]);

const scrubRecord = (
  record: JsonRecord,
  depth: number
): Record<string, unknown> => {
  const scrubbed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    scrubbed[key] = sensitiveKeyPattern.test(key)
      ? redacted
      : scrubUnknown(value, depth + 1);
  }

  return scrubbed;
};

const scrubUnknown = (value: unknown, depth: number): unknown => {
  if (depth >= maxScrubDepth) {
    return '[Truncated]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubUnknown(item, depth + 1));
  }

  if (isRecord(value)) {
    return scrubRecord(value, depth);
  }

  return value;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const scrubQuery = (query: QueryParams): QueryParams => {
  if (typeof query === 'string') {
    return scrubQueryString(query);
  }

  if (Array.isArray(query)) {
    return scrubQueryEntries(query);
  }

  return Object.fromEntries(scrubQueryEntries(Object.entries(query)));
};

const scrubQueryString = (query: string): string => {
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) {
    if (sensitiveKeyPattern.test(key)) {
      params.set(key, redacted);
    }
  }

  return params.toString();
};
