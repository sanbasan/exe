import type { GBrainConfig } from '#agent/gbrain/config';
import type { GBrainPage } from '#agent/gbrain/page';

// Thin HTTP client for the GBrain ingest router. Posts one call page to the
// per-workspace brain, and (for in-call queries) searches / reads pages back.
// The router (see gbrain/) enforces workspace isolation by routing
// `workspaceId` to its own dedicated database.

export interface GBrainSearchResult {
  readonly chunkText?: string;
  readonly slug: string;
}

// The ingest URL points at the router's `/ingest` endpoint; the sibling read
// endpoints live at the same origin, so derive them from it (no extra env).
const routerUrl = (config: GBrainConfig, path: string): string =>
  new URL(path, config.ingestUrl).toString();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const ingestPage = async ({
  config,
  page,
  workspaceId,
}: {
  readonly config: GBrainConfig;
  readonly page: GBrainPage;
  readonly workspaceId: string;
}): Promise<void> => {
  const response = await fetch(config.ingestUrl, {
    body: JSON.stringify({
      markdown: page.markdown,
      slug: page.slug,
      workspaceId,
    }),
    headers: {
      authorization: `Bearer ${config.ingestToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: globalThis.AbortSignal.timeout(config.timeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    throw new Error(
      `GBrain ingest failed: ${String(response.status)} ${detail}`.trim()
    );
  }
};

// Distill post-call text into the workspace's hot-memory facts. Uses the
// query timeout: the router call is LLM-backed and slower than ingest.
export const extractFacts = async ({
  config,
  sessionId,
  text,
  workspaceId,
}: {
  readonly config: GBrainConfig;
  readonly sessionId?: string;
  readonly text: string;
  readonly workspaceId: string;
}): Promise<void> => {
  const response = await fetch(routerUrl(config, '/extract_facts'), {
    body: JSON.stringify({
      ...(sessionId === undefined ? {} : { sessionId }),
      text,
      workspaceId,
    }),
    headers: {
      authorization: `Bearer ${config.ingestToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: globalThis.AbortSignal.timeout(config.queryTimeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    throw new Error(
      `GBrain extract_facts failed: ${String(response.status)} ${detail}`.trim()
    );
  }
};

const parseSearchResults = (body: unknown): readonly GBrainSearchResult[] => {
  if (!isRecord(body)) {
    return [];
  }

  const results = body['results'];

  if (!Array.isArray(results)) {
    return [];
  }

  return results.flatMap((item: unknown): readonly GBrainSearchResult[] => {
    if (!isRecord(item)) {
      return [];
    }

    const slug = item['slug'];

    if (typeof slug !== 'string' || slug.length === 0) {
      return [];
    }

    const chunkText = item['chunk_text'];

    return [
      {
        slug,
        ...(typeof chunkText === 'string' ? { chunkText } : {}),
      },
    ];
  });
};

// Search the per-workspace brain. Returns defensively-parsed snippets; malformed
// or unexpected router output degrades to an empty list rather than throwing.
export const queryBrain = async ({
  config,
  limit,
  query,
  workspaceId,
}: {
  readonly config: GBrainConfig;
  readonly limit: number;
  readonly query: string;
  readonly workspaceId: string;
}): Promise<readonly GBrainSearchResult[]> => {
  const response = await fetch(routerUrl(config, '/query'), {
    body: JSON.stringify({ limit, query, workspaceId }),
    headers: {
      authorization: `Bearer ${config.ingestToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: globalThis.AbortSignal.timeout(config.queryTimeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    throw new Error(
      `GBrain query failed: ${String(response.status)} ${detail}`.trim()
    );
  }

  const body: unknown = await response.json();

  return parseSearchResults(body);
};

const parsePageMarkdown = (body: unknown): string | null => {
  if (!isRecord(body)) {
    return null;
  }

  const markdown = body['markdown'];

  return typeof markdown === 'string' && markdown.length > 0 ? markdown : null;
};

// Read one full page from the per-workspace brain by slug. Returns the page's
// full markdown, or null when the router reports the page does not exist (404)
// or the payload is unusable.
export const fetchBrainPage = async ({
  config,
  slug,
  workspaceId,
}: {
  readonly config: GBrainConfig;
  readonly slug: string;
  readonly workspaceId: string;
}): Promise<string | null> => {
  const response = await fetch(routerUrl(config, '/page'), {
    body: JSON.stringify({ slug, workspaceId }),
    headers: {
      authorization: `Bearer ${config.ingestToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: globalThis.AbortSignal.timeout(config.queryTimeoutMs),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    throw new Error(
      `GBrain page fetch failed: ${String(response.status)} ${detail}`.trim()
    );
  }

  const body: unknown = await response.json();

  return parsePageMarkdown(body);
};
