import { handleAuthenticatedRoute } from '#app/server/http';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly blockId: string;
    readonly workspaceId: string;
  }>;
}

export const POST = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const { blockId, workspaceId } = await params;

    return api.resolveChannelBlock(context, { blockId, workspaceId });
  });
