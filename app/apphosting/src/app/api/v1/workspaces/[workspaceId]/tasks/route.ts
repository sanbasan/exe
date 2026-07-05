import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { createWorkTaskRequestSchema } from '#app/server/schemas';
import {
  createFirebaseServerComposition,
  invalidRequestError,
} from '@exe/server';
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

export const POST = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ context }) => {
    const [{ workspaceId }, body] = await Promise.all([
      params,
      parseJsonBody({ request, schema: createWorkTaskRequestSchema }),
    ]);
    const { services } = createFirebaseServerComposition();
    const task = await services.taskGraph.createWorkTaskForUser({
      input: {
        assigneeSlackUserIds: body.assigneeSlackUserIds,
        ...(body.channelId === undefined ? {} : { channelId: body.channelId }),
        ...(body.description === undefined
          ? {}
          : { description: body.description }),
        ...(body.dueAt === undefined ? {} : { dueAt: body.dueAt }),
        ...(body.requesterSlackUserIds === undefined
          ? {}
          : { requesterSlackUserIds: body.requesterSlackUserIds }),
        ...(body.startAt === undefined ? {} : { startAt: body.startAt }),
        title: body.title,
      },
      userId: context.userId,
      workspaceId,
    });

    return { task };
  });
