/* eslint-disable no-process-env -- GBrain integration reads its own runtime env at this isolated boundary; see app/agent/src/config.ts for the primary agent config boundary. */

// GBrain integration config. Purgeable: this whole `gbrain/` folder can be
// deleted to remove the integration (see gbrain/PURGE.md). When the env vars
// below are absent the integration is a no-op, so the agent runs unchanged.

export interface GBrainConfig {
  readonly ingestUrl: string;
  readonly ingestToken: string;
  readonly queryTimeoutMs: number;
  readonly timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_QUERY_TIMEOUT_MS = 30_000;

const parseTimeoutMs = (
  value?: string,
  fallback: number = DEFAULT_TIMEOUT_MS
): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

// Returns null when the integration is disabled (env not configured).
export const getGBrainConfig = (): GBrainConfig | null => {
  const ingestUrl = process.env['GBRAIN_INGEST_URL'];
  const ingestToken = process.env['GBRAIN_INGEST_TOKEN'];

  if (
    ingestUrl === undefined ||
    ingestUrl.length === 0 ||
    ingestToken === undefined ||
    ingestToken.length === 0
  ) {
    return null;
  }

  return {
    ingestToken,
    ingestUrl,
    queryTimeoutMs: parseTimeoutMs(
      process.env['GBRAIN_QUERY_TIMEOUT_MS'],
      DEFAULT_QUERY_TIMEOUT_MS
    ),
    timeoutMs: parseTimeoutMs(process.env['GBRAIN_INGEST_TIMEOUT_MS']),
  };
};
