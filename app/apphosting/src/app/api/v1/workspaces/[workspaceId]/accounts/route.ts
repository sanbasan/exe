import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { workspaceAccountsRequestSchema } from '#app/server/schemas';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly workspaceId: string;
  }>;
}

export const PUT = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const [{ workspaceId }, input] = await Promise.all([
      params,
      parseJsonBody({ request, schema: workspaceAccountsRequestSchema }),
    ]);

    return api.putAccounts(context, {
      adminSlackUserIds: input.adminSlackUserIds,
      channelOwnerEditorSlackUserIds: input.channelOwnerEditorSlackUserIds,
      workspaceId,
    });
  });
