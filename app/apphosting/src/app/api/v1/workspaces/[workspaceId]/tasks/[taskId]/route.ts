import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { taskPatchSchema } from '#app/server/schemas';
import { invalidRequestError } from '@exe/server';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly taskId: string;
    readonly workspaceId: string;
  }>;
}

export const GET = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const { taskId, workspaceId } = await params;

    return api.getTask(context, { taskId, workspaceId });
  });

export const PATCH = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const { taskId, workspaceId } = await params;
    const patch = await parseJsonBody({ request, schema: taskPatchSchema });

    if (patch.taskId !== taskId) {
      throw invalidRequestError('Task patch id does not match route task id.');
    }

    return api.patchTask(context, { patch, workspaceId });
  });
