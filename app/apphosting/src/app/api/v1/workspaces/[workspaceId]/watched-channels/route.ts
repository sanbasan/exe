import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { watchedChannelsRequestSchema } from '#app/server/schemas';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{ readonly workspaceId: string }>;
}

export const PUT = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const [{ workspaceId }, input] = await Promise.all([
      params,
      parseJsonBody({ request, schema: watchedChannelsRequestSchema }),
    ]);

    return api.putWatchedChannels(context, {
      channelIds: input.channelIds,
      workspaceId,
    });
  });
