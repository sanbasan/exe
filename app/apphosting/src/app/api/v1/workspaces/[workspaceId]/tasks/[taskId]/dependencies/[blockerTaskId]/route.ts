import { handleAuthenticatedRoute } from '#app/server/http';
import { createFirebaseServerComposition } from '@exe/server';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly blockerTaskId: string;
    readonly taskId: string;
    readonly workspaceId: string;
  }>;
}

export const DELETE = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ context }) => {
    const { blockerTaskId, taskId, workspaceId } = await params;
    const { services } = createFirebaseServerComposition();

    return services.taskGraph.removeDependencyForUser({
      blockedTaskId: taskId,
      blockerTaskId,
      userId: context.userId,
      workspaceId,
    });
  });
