import type { GBrainIngestGateway } from '#server/gateways';

// Server-side twin of the agent's GBrain ingest client (app/agent/src/gbrain):
// posts pages and facts to the per-workspace brain via the ingest router.
// Endpoints live at the router origin: POST /ingest and POST /extract_facts.

const INGEST_TIMEOUT_MS = 10_000;

// extract_facts is LLM-backed on the router side and slower than ingest.
const EXTRACT_FACTS_TIMEOUT_MS = 45_000;

const postJson = async ({
  body,
  ingestToken,
  label,
  timeoutMs,
  url,
}: {
  readonly body: Record<string, unknown>;
  readonly ingestToken: string;
  readonly label: string;
  readonly timeoutMs: number;
  readonly url: string;
}): Promise<void> => {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${ingestToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: globalThis.AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    throw new Error(
      `GBrain ${label} failed: ${String(response.status)} ${detail}`.trim()
    );
  }
};

const disabledGateway: GBrainIngestGateway = {
  extractFacts: (): Promise<void> => Promise.resolve(),
  ingestPage: (): Promise<void> => Promise.resolve(),
  isEnabled: (): boolean => false,
};

export const createGBrainIngestGateway = ({
  baseUrl,
  ingestToken,
}: {
  readonly baseUrl: string;
  readonly ingestToken?: string;
}): GBrainIngestGateway => {
  if (ingestToken === undefined || ingestToken.length === 0) {
    return disabledGateway;
  }

  const origin = baseUrl.replace(/\/+$/u, '');

  return {
    extractFacts: ({ sessionId, text, workspaceId }): Promise<void> =>
      postJson({
        body: {
          ...(sessionId === undefined ? {} : { sessionId }),
          text,
          workspaceId,
        },
        ingestToken,
        label: 'extract_facts',
        timeoutMs: EXTRACT_FACTS_TIMEOUT_MS,
        url: `${origin}/extract_facts`,
      }),
    ingestPage: ({ markdown, slug, workspaceId }): Promise<void> =>
      postJson({
        body: { markdown, slug, workspaceId },
        ingestToken,
        label: 'ingest',
        timeoutMs: INGEST_TIMEOUT_MS,
        url: `${origin}/ingest`,
      }),
    isEnabled: (): boolean => true,
  };
};
