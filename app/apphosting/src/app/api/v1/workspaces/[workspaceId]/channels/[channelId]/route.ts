import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { patchChannelRequestSchema } from '#app/server/schemas';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly channelId: string;
    readonly workspaceId: string;
  }>;
}

export const GET = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const { channelId, workspaceId } = await params;

    return api.getChannel(context, { channelId, workspaceId });
  });

export const PATCH = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const [{ channelId, workspaceId }, input] = await Promise.all([
      params,
      parseJsonBody({ request, schema: patchChannelRequestSchema }),
    ]);

    return api.patchChannel(context, {
      channelId,
      input: {
        ...(input.assigneeSlackUserIds === undefined
          ? {}
          : { assigneeSlackUserIds: input.assigneeSlackUserIds }),
        ...(input.latestInfo === undefined
          ? {}
          : { latestInfo: input.latestInfo }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.watcherSlackUserIds === undefined
          ? {}
          : { watcherSlackUserIds: input.watcherSlackUserIds }),
      },
      workspaceId,
    });
  });
