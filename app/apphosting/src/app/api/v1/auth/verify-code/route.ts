import { handlePublicRoute, parseJsonBody } from '#app/server/http';
import { verifyCodeRequestSchema } from '#app/server/schemas';
import { createFirebaseServerComposition } from '@exe/server';
import type { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const POST = (request: NextRequest): Promise<NextResponse> =>
  handlePublicRoute(request, async () => {
    const input = await parseJsonBody({
      request,
      schema: verifyCodeRequestSchema,
    });
    const customToken =
      await createFirebaseServerComposition().services.auth.verifyCode({
        code: input.code,
        email: input.email,
      });

    return { customToken };
  });
