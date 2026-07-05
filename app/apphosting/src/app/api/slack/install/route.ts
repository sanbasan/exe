import { getRequiredConfigValue, serverConfig } from '@exe/server';
import { NextResponse } from 'next/server';

const BOT_SCOPES = [
  'app_mentions:read',
  'bookmarks:read',
  'bookmarks:write',
  'canvases:read',
  'canvases:write',
  'channels:history',
  'channels:join',
  'channels:read',
  'channels:write.topic',
  'chat:write',
  'groups:history',
  'groups:read',
  'groups:write.topic',
  'im:history',
  'im:read',
  'lists:read',
  'lists:write',
  'mpim:history',
  'mpim:read',
  'reactions:read',
  'team.billing:read',
  'team:read',
  'users:read',
  'users:read.email',
] as const;

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';

// Stateless "Add to Slack" entry point: redirects to Slack's authorize screen
// using the app's single configured redirect URL. No CSRF `state` and no
// explicit `redirect_uri` are sent, so this stays consistent with the
// management-console install button and the stateless oauth_redirect callback.
export const GET = (): NextResponse => {
  const authorizeUrl = new URL(SLACK_AUTHORIZE_URL);

  authorizeUrl.searchParams.set(
    'client_id',
    getRequiredConfigValue({
      label: 'SLACK_CLIENT_ID',
      ...(serverConfig.slack.clientId === undefined
        ? {}
        : { value: serverConfig.slack.clientId }),
    })
  );
  authorizeUrl.searchParams.set('scope', BOT_SCOPES.join(','));

  return NextResponse.redirect(authorizeUrl);
};
