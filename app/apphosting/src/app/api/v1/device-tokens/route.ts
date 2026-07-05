import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { deviceTokenRegistrationSchema } from '#app/server/schemas';
import type { NextRequest, NextResponse } from 'next/server';

export const POST = (request: NextRequest): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const input = await parseJsonBody({
      request,
      schema: deviceTokenRegistrationSchema,
    });

    return api.registerDeviceToken(context, input);
  });
