import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { addTaskDependencyRequestSchema } from '#app/server/schemas';
import { createFirebaseServerComposition } from '@exe/server';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly taskId: string;
    readonly workspaceId: string;
  }>;
}

export const POST = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ context }) => {
    const [{ taskId, workspaceId }, body] = await Promise.all([
      params,
      parseJsonBody({ request, schema: addTaskDependencyRequestSchema }),
    ]);
    const { services } = createFirebaseServerComposition();

    return services.taskGraph.addDependencyForUser({
      blockedTaskId: taskId,
      blockerTaskId: body.blockerTaskId,
      userId: context.userId,
      workspaceId,
    });
  });
