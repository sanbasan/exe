import { handleAuthenticatedRoute } from '#app/server/http';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{ readonly workspaceId: string }>;
}

export const GET = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const { workspaceId } = await params;
    const scope = request.nextUrl.searchParams.get('scope');

    if (scope === 'all') {
      return api.listWorkspaceChannelReviewStates(context, { workspaceId });
    }

    return api.listChannelReviewStates(context, { workspaceId });
  });
