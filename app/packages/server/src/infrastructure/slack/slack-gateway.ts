import { getRequiredConfigValue } from '#server/config';
import type {
  SlackBotTokenRefresh,
  SlackGateway,
  SlackOAuthInstallation,
  SlackUserLookup,
  SlackWorkspaceMember,
} from '#server/ports';
import { isRecoverableSlackAuthError } from '#server/utils';
import {
  deleteSlackMessage,
  postSlackMessage,
  updateSlackMessage,
} from './slack-chat';
import {
  getSlackChannelInfo,
  getSlackWorkspaceInfo,
  listSlackBotJoinedChannels,
  listSlackUserJoinedChannelIds,
} from './slack-info';
import { getSlackReplies } from './slack-messages';
import {
  isSlackUserNotFoundError,
  toSlackUserLookup,
  verifySlackMembershipByEmail,
} from './user-lookup';
import { slackWorkspaceMemberSchema } from '@exe/domain';
import { WebClient } from '@slack/web-api';

const SLACK_USERS_LIST_PAGE_SIZE = 200;

const collectWorkspaceMembers = async ({
  client,
  cursor,
}: {
  readonly client: WebClient;
  readonly cursor?: string;
}): Promise<readonly SlackWorkspaceMember[]> => {
  const response = await client.users.list({
    limit: SLACK_USERS_LIST_PAGE_SIZE,
    ...(cursor === undefined ? {} : { cursor }),
  });
  const pageMembers = (response.members ?? []).flatMap(
    (member): readonly SlackWorkspaceMember[] => {
      const email = member.profile?.email;

      return member.id !== undefined &&
        member.deleted !== true &&
        member.is_bot !== true &&
        typeof email === 'string' &&
        email.length > 0
        ? [slackWorkspaceMemberSchema.parse(member)]
        : [];
    }
  );
  const nextCursor = response.response_metadata?.next_cursor;

  if (nextCursor === undefined || nextCursor.length === 0) {
    return pageMembers;
  }

  return [
    ...pageMembers,
    ...(await collectWorkspaceMembers({ client, cursor: nextCursor })),
  ];
};

const getSlackOAuthConfig = ({
  clientId,
  clientSecret,
}: {
  readonly clientId?: string;
  readonly clientSecret?: string;
}): {
  readonly clientId: string;
  readonly clientSecret: string;
} => ({
  clientId: getRequiredConfigValue({
    label: 'SLACK_CLIENT_ID',
    ...(clientId === undefined ? {} : { value: clientId }),
  }),
  clientSecret: getRequiredConfigValue({
    label: 'SLACK_CLIENT_SECRET',
    ...(clientSecret === undefined ? {} : { value: clientSecret }),
  }),
});

const throwError = (error: unknown): never => {
  if (error instanceof Error) {
    throw error;
  }

  throw new Error('Slack API failed with a non-Error value.');
};

const toSlackUserLookupError = (error: unknown): SlackUserLookup => {
  if (isRecoverableSlackAuthError(error)) {
    throwError(error);
  }

  return isSlackUserNotFoundError(error)
    ? { status: 'user_not_found' }
    : { status: 'indeterminate' };
};

const toInstallation = (response: {
  readonly access_token?: string;
  readonly authed_user?: {
    readonly id?: string;
    readonly scope?: string;
  };
  readonly bot_user_id?: string;
  readonly expires_in?: number;
  readonly refresh_token?: string;
  readonly scope?: string;
  readonly team?: {
    readonly id?: string;
    readonly name?: string;
  };
}): SlackOAuthInstallation => {
  const accessToken = response.access_token;
  const authedUserId = response.authed_user?.id;
  const botUserId = response.bot_user_id;
  const teamId = response.team?.id;

  if (
    accessToken === undefined ||
    authedUserId === undefined ||
    botUserId === undefined ||
    teamId === undefined
  ) {
    throw new Error('Slack OAuth response is missing required fields.');
  }

  return {
    accessToken,
    authedUserId,
    botUserId,
    ...(response.expires_in === undefined
      ? {}
      : { expiresInSeconds: response.expires_in }),
    ...(response.refresh_token === undefined
      ? {}
      : { refreshToken: response.refresh_token }),
    teamId,
    ...(response.team?.name === undefined
      ? {}
      : { teamName: response.team.name }),
  };
};

const toTokenRefresh = (response: {
  readonly access_token?: string;
  readonly expires_in?: number;
  readonly refresh_token?: string;
}): SlackBotTokenRefresh => {
  const accessToken = response.access_token;

  if (accessToken === undefined) {
    throw new Error('Slack OAuth refresh response is missing access token.');
  }

  return {
    accessToken,
    ...(response.expires_in === undefined
      ? {}
      : { expiresInSeconds: response.expires_in }),
    ...(response.refresh_token === undefined
      ? {}
      : { refreshToken: response.refresh_token }),
  };
};

export const createSlackGateway = ({
  clientId,
  clientSecret,
}: {
  readonly clientId?: string;
  readonly clientSecret?: string;
}): SlackGateway => ({
  deleteMessage: deleteSlackMessage,
  exchangeCodeForInstallation: async ({
    code,
    redirectUri,
  }): Promise<SlackOAuthInstallation> => {
    const config = getSlackOAuthConfig({
      ...(clientId === undefined ? {} : { clientId }),
      ...(clientSecret === undefined ? {} : { clientSecret }),
    });
    const response = await new WebClient().oauth.v2.access({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      ...(redirectUri === undefined ? {} : { redirect_uri: redirectUri }),
    });

    return toInstallation(response);
  },
  getChannelInfo: getSlackChannelInfo,
  getReplies: getSlackReplies,
  getUserInfo: ({ botToken, slackUserId }): Promise<SlackUserLookup> =>
    new WebClient(botToken).users
      .info({ user: slackUserId })
      .then(
        (response): SlackUserLookup =>
          toSlackUserLookup({
            ...(response.user === undefined ? {} : { user: response.user }),
          })
      )
      .catch(
        (error: unknown): SlackUserLookup => toSlackUserLookupError(error)
      ),
  getWorkspaceInfo: getSlackWorkspaceInfo,
  listBotJoinedChannels: ({ botToken }) =>
    listSlackBotJoinedChannels({ botToken }),
  listUserJoinedChannelIds: ({ botToken, slackUserId }) =>
    listSlackUserJoinedChannelIds({ botToken, slackUserId }),
  listWorkspaceMembers: ({
    botToken,
  }): Promise<readonly SlackWorkspaceMember[]> =>
    collectWorkspaceMembers({ client: new WebClient(botToken) }),
  lookupUserByEmail: ({ botToken, email }): Promise<SlackUserLookup> =>
    new WebClient(botToken).users
      .lookupByEmail({ email })
      .then(
        (response): SlackUserLookup =>
          toSlackUserLookup({
            ...(response.user === undefined ? {} : { user: response.user }),
          })
      )
      .catch(
        (error: unknown): SlackUserLookup => toSlackUserLookupError(error)
      ),
  openView: async ({ botToken, triggerId, view }): Promise<void> => {
    await new WebClient(botToken).views.open({
      trigger_id: triggerId,
      view,
    });
  },
  postMessage: postSlackMessage,
  publishHomeView: async ({ botToken, userId, view }): Promise<void> => {
    await new WebClient(botToken).views.publish({
      user_id: userId,
      view,
    });
  },
  refreshBotToken: async ({ refreshToken }): Promise<SlackBotTokenRefresh> => {
    const config = getSlackOAuthConfig({
      ...(clientId === undefined ? {} : { clientId }),
      ...(clientSecret === undefined ? {} : { clientSecret }),
    });
    const response = await new WebClient().oauth.v2.access({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    return toTokenRefresh(response);
  },
  updateMessage: updateSlackMessage,
  updateView: async ({ botToken, hash, view, viewId }): Promise<void> => {
    await new WebClient(botToken).views.update({
      ...(hash === undefined ? {} : { hash }),
      view,
      view_id: viewId,
    });
  },
  verifyMembershipByEmail: verifySlackMembershipByEmail,
});
