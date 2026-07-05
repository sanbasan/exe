import { handleAuthenticatedRoute } from '#app/server/http';
import { createFirebaseServerComposition } from '@exe/server';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly meetingId: string;
    readonly workspaceId: string;
  }>;
}

export const GET = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ context }) => {
    const { meetingId, workspaceId } = await params;
    const { services } = createFirebaseServerComposition();
    const meeting = await services.meeting.getForUser({
      meetingId,
      userId: context.userId,
      workspaceId,
    });

    return { meeting };
  });
