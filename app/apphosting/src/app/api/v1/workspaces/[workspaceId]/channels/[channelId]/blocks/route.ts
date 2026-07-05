import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { createChannelBlockRequestSchema } from '#app/server/schemas';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly channelId: string;
    readonly workspaceId: string;
  }>;
}

export const POST = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const [{ channelId, workspaceId }, input] = await Promise.all([
      params,
      parseJsonBody({ request, schema: createChannelBlockRequestSchema }),
    ]);

    return api.createChannelBlock(context, {
      channelId,
      input: {
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        title: input.title,
      },
      workspaceId,
    });
  });
