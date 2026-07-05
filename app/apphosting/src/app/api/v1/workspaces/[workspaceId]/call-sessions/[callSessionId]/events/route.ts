import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { callEventRequestSchema } from '#app/server/schemas';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly callSessionId: string;
    readonly workspaceId: string;
  }>;
}

export const GET = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const { callSessionId, workspaceId } = await params;

    return api.listCallEvents(context, { callSessionId, workspaceId });
  });

export const POST = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const [{ callSessionId, workspaceId }, input] = await Promise.all([
      params,
      parseJsonBody({ request, schema: callEventRequestSchema }),
    ]);

    return api.recordCallEvent(context, {
      callSessionId,
      payload: input.payload,
      type: input.type,
      workspaceId,
    });
  });
