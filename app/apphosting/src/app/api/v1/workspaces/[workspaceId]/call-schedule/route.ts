import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { putCallScheduleInputSchema } from '#app/server/schemas';
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

    return api.getCallSchedule(context, { workspaceId });
  });

export const PUT = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const { workspaceId } = await params;
    const input = await parseJsonBody({
      request,
      schema: putCallScheduleInputSchema,
    });

    return api.putCallSchedule(context, { input, workspaceId });
  });
