import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { updateChannelBlockRequestSchema } from '#app/server/schemas';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly blockId: string;
    readonly workspaceId: string;
  }>;
}

export const DELETE = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const { blockId, workspaceId } = await params;

    return api.deleteChannelBlock(context, { blockId, workspaceId });
  });

export const PATCH = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const [{ blockId, workspaceId }, input] = await Promise.all([
      params,
      parseJsonBody({ request, schema: updateChannelBlockRequestSchema }),
    ]);

    return api.updateChannelBlock(context, {
      blockId,
      input: {
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.title === undefined ? {} : { title: input.title }),
      },
      workspaceId,
    });
  });
