import { handleAuthenticatedRoute } from '#app/server/http';
import { createFirebaseServerComposition } from '@exe/server';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{ readonly workspaceId: string }>;
}

export const GET = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ context }) => {
    const { workspaceId } = await params;
    const { services } = createFirebaseServerComposition();
    const tasks = await services.taskGraph.listAllForUser({
      userId: context.userId,
      workspaceId,
    });

    return { tasks };
  });
