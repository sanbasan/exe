import { handleAuthenticatedRoute } from '#app/server/http';
import type { NextRequest, NextResponse } from 'next/server';

export const GET = (request: NextRequest): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, ({ api, context }) => api.getMe(context));
