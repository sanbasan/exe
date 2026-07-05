import { handleAuthenticatedRoute } from '#app/server/http';
import { invalidRequestError } from '@exe/server';
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

    if (scope === 'follow-ups-for-me') {
      return api.listFollowUpTasks(context, { workspaceId });
    }

    if (scope === null || scope === 'mine') {
      return api.listWorkTasks(context, { workspaceId });
    }

    if (scope === 'requested') {
      return api.listRequestedWorkTasks(context, { workspaceId });
    }

    throw invalidRequestError('Unsupported task scope.');
  });
