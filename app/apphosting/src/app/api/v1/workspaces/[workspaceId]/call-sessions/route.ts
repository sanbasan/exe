import { handleAuthenticatedRoute } from '#app/server/http';
import { startManualReviewCallRequestSchema } from '#app/server/schemas';
import { invalidRequestError } from '@exe/server';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{ readonly workspaceId: string }>;
}

const readOptionalInput = async (
  request: NextRequest
): Promise<ReturnType<typeof startManualReviewCallRequestSchema.parse>> => {
  const body = await request.text();

  if (body.trim().length === 0) {
    return {};
  }

  try {
    return startManualReviewCallRequestSchema.parse(JSON.parse(body));
  } catch {
    throw invalidRequestError('Request body is invalid.');
  }
};

export const POST = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const [{ workspaceId }, input] = await Promise.all([
      params,
      readOptionalInput(request),
    ]);

    return api.startManualReviewCall(context, {
      ...(input.mode === undefined ? {} : { mode: input.mode }),
      workspaceId,
    });
  });
