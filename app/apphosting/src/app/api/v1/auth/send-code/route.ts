import { handlePublicRoute, parseJsonBody } from '#app/server/http';
import { sendCodeRequestSchema } from '#app/server/schemas';
import { createFirebaseServerComposition } from '@exe/server';
import type { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const POST = (request: NextRequest): Promise<NextResponse> =>
  handlePublicRoute(request, async () => {
    const input = await parseJsonBody({
      request,
      schema: sendCodeRequestSchema,
    });

    await createFirebaseServerComposition().services.auth.sendCode({
      email: input.email,
      ...(input.language === undefined ? {} : { language: input.language }),
    });

    return { sent: true };
  });
