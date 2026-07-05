import { handleAuthenticatedRoute } from '#app/server/http';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly workspaceId: string;
  }>;
}

export const GET = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const { workspaceId } = await params;

    return api.getSlackTeam(context, { workspaceId });
  });
