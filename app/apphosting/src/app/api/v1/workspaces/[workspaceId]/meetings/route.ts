import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { createMeetingRequestSchema } from '#app/server/schemas';
import { createFirebaseServerComposition } from '@exe/server';
import { after } from 'next/server';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{ readonly workspaceId: string }>;
}

export const GET = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ context }) => {
    const { workspaceId } = await params;
    const { services } = createFirebaseServerComposition();
    const meetings = await services.meeting.listForUser({
      userId: context.userId,
      workspaceId,
    });

    return { meetings };
  });

export const POST = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ context }) => {
    const [{ workspaceId }, body] = await Promise.all([
      params,
      parseJsonBody({ request, schema: createMeetingRequestSchema }),
    ]);
    const { services } = createFirebaseServerComposition();
    const meeting = await services.meeting.createForUser({
      ...(body.channelId === undefined ? {} : { channelId: body.channelId }),
      ...(body.durationSeconds === undefined
        ? {}
        : { durationSeconds: body.durationSeconds }),
      ...(body.participantSlackUserIds === undefined
        ? {}
        : { participantSlackUserIds: body.participantSlackUserIds }),
      userId: context.userId,
      workspaceId,
    });

    // Heavy transcription/extraction pipeline runs after the response is sent.
    // process() never rejects; it records failures on the meeting document.
    after(() =>
      services.meeting.process({
        audioBase64: body.audioBase64,
        meetingId: meeting.id,
        mimeType: body.mimeType,
        workspaceId,
      })
    );

    return { meeting };
  });
