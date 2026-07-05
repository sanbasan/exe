// Read-side twin of the GBrain ingest gateway: searches the per-workspace
// brain via the router's POST /query. Kept as its own small gateway so read
// access can be injected independently of ingest.

const QUERY_TIMEOUT_MS = 20_000;

export interface GBrainQueryResult {
  readonly chunkText?: string;
  readonly slug: string;
}

export interface GBrainQueryGateway {
  readonly isEnabled: () => boolean;
  readonly query: (params: {
    readonly limit: number;
    readonly query: string;
    readonly workspaceId: string;
  }) => Promise<readonly GBrainQueryResult[]>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseSearchResults = (body: unknown): readonly GBrainQueryResult[] => {
  if (!isRecord(body)) {
    return [];
  }

  const results = body['results'];

  if (!Array.isArray(results)) {
    return [];
  }

  return results.flatMap((item: unknown): readonly GBrainQueryResult[] => {
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

const disabledGateway: GBrainQueryGateway = {
  isEnabled: (): boolean => false,
  query: (): Promise<readonly GBrainQueryResult[]> => Promise.resolve([]),
};

export const createGBrainQueryGateway = ({
  baseUrl,
  ingestToken,
}: {
  readonly baseUrl: string;
  readonly ingestToken?: string;
}): GBrainQueryGateway => {
  if (ingestToken === undefined || ingestToken.length === 0) {
    return disabledGateway;
  }

  const origin = baseUrl.replace(/\/+$/u, '');

  return {
    isEnabled: (): boolean => true,
    query: async ({
      limit,
      query,
      workspaceId,
    }): Promise<readonly GBrainQueryResult[]> => {
      const response = await fetch(`${origin}/query`, {
        body: JSON.stringify({ limit, query, workspaceId }),
        headers: {
          authorization: `Bearer ${ingestToken}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: globalThis.AbortSignal.timeout(QUERY_TIMEOUT_MS),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');

        throw new Error(
          `GBrain query failed: ${String(response.status)} ${detail}`.trim()
        );
      }

      const body: unknown = await response.json();

      return parseSearchResults(body);
    },
  };
};
