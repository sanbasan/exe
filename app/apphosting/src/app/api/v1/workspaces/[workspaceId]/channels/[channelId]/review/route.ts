import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { recordChannelReviewRequestSchema } from '#app/server/schemas';
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
      parseJsonBody({ request, schema: recordChannelReviewRequestSchema }),
    ]);

    return api.recordChannelReview(context, {
      channelId,
      input: {
        ...(input.lastSelfReport === undefined
          ? {}
          : { lastSelfReport: input.lastSelfReport }),
        ...(input.nextCheckAt === undefined
          ? {}
          : { nextCheckAt: input.nextCheckAt }),
        ...(input.nextCheckReason === undefined
          ? {}
          : { nextCheckReason: input.nextCheckReason }),
        ...(input.statusText === undefined
          ? {}
          : { statusText: input.statusText }),
      },
      workspaceId,
    });
  });
