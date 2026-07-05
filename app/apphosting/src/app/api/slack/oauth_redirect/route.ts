import { reportServerError } from '#app/server/error-reporting';
import { publicPageConfig } from '#app/server/public-config';
import { createFirebaseServerComposition } from '@exe/server';
import { after, NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COMPLETE_PATH = '/slack/oauth/complete';

const buildCompleteUrl = (request: NextRequest): URL =>
  new URL(COMPLETE_PATH, publicPageConfig.appUrl ?? request.nextUrl.origin);

// Stateless OAuth callback: Slack's own consent screen is the authorization
// gate, and the workspace is keyed by the team id returned in the trusted
// token-exchange response (not by any request parameter), so there is nothing
// session-bound for a CSRF `state` to protect. Omitting state lets the install
// succeed from every entry point — the Slack app-management "Install to
// Workspace"/"Reinstall" button and the App Directory, which cannot carry an
// app-generated state. `redirect_uri` is intentionally NOT passed to
// oauth.v2.access: the management-console flow does not submit one, and Slack
// resolves the single configured redirect URL on its own.
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const code = request.nextUrl.searchParams.get('code');
  const redirectUrl = buildCompleteUrl(request);

  if (code === null || code.length === 0) {
    redirectUrl.searchParams.set('status', 'error');
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const composition = createFirebaseServerComposition();

    const workspaceId = await composition.services.slack.installWorkspace({
      code,
    });

    // Seed the membership index from the workspace's current members after the
    // redirect is sent, so a large member list never delays the install flow.
    after(async (): Promise<void> => {
      try {
        await composition.services.slack.backfillWorkspaceMemberIndex({
          workspaceId,
        });
      } catch (error: unknown) {
        await reportServerError({
          context: { route: 'slack/oauth_redirect.backfill' },
          error,
        });
      }
    });

    redirectUrl.searchParams.set('status', 'ok');
  } catch (error: unknown) {
    await reportServerError({
      context: { route: 'slack/oauth_redirect' },
      error,
    });
    redirectUrl.searchParams.set('status', 'error');
  }

  return NextResponse.redirect(redirectUrl);
};
