import { handleAuthenticatedRoute, parseJsonBody } from '#app/server/http';
import { workspaceAdminRequestSchema } from '#app/server/schemas';
import type { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  readonly params: Promise<{
    readonly workspaceId: string;
  }>;
}

export const POST = (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> =>
  handleAuthenticatedRoute(request, async ({ api, context }) => {
    const [{ workspaceId }, input] = await Promise.all([
      params,
      parseJsonBody({ request, schema: workspaceAdminRequestSchema }),
    ]);

    return api.addWorkspaceAdmin(context, {
      adminEmail: input.email,
      workspaceId,
    });
  });
