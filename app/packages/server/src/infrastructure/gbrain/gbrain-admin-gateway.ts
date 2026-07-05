import type {
  GBrainAdminGateway,
  GBrainConnection,
  GBrainToken,
} from '#server/ports';
import { z } from 'zod';

const gbrainTokenSchema = z.object({
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  name: z.string(),
});

const gbrainTokenListSchema = z.object({
  tokens: z.array(gbrainTokenSchema),
});

const gbrainConnectionSchema = z.object({
  connect: z.string(),
  mcpUrl: z.string(),
  token: z.string(),
});

interface GBrainAdminResponse {
  readonly data: unknown;
  readonly ok: boolean;
}

export const createGBrainAdminGateway = ({
  adminToken,
  baseUrl,
}: {
  readonly adminToken: string;
  readonly baseUrl: string;
}): GBrainAdminGateway => {
  const request = async (
    method: string,
    path: string,
    body?: unknown
  ): Promise<GBrainAdminResponse> => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        authorization: `Bearer ${adminToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await response.json().catch(() => null);

    return { data, ok: response.ok };
  };

  const workspacePath = (workspaceId: string): string =>
    `/admin/w/${encodeURIComponent(workspaceId)}`;

  return {
    listTokens: async ({ workspaceId }): Promise<readonly GBrainToken[]> => {
      const { data, ok } = await request(
        'GET',
        `${workspacePath(workspaceId)}/tokens`
      );
      const parsed = gbrainTokenListSchema.safeParse(data);

      return ok && parsed.success ? parsed.data.tokens : [];
    },
    mintToken: async ({
      name,
      workspaceId,
    }): Promise<GBrainConnection | null> => {
      const { data, ok } = await request(
        'POST',
        `${workspacePath(workspaceId)}/token`,
        { name }
      );
      const parsed = gbrainConnectionSchema.safeParse(data);

      return ok && parsed.success ? parsed.data : null;
    },
    revokeToken: async ({ name, workspaceId }): Promise<boolean> => {
      const { ok } = await request(
        'POST',
        `${workspacePath(workspaceId)}/token/${encodeURIComponent(name)}/revoke`
      );

      return ok;
    },
  };
};
