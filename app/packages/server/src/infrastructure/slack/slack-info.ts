import type {
  SlackChannelInfo,
  SlackUserConversations,
  SlackWorkspaceInfo,
} from '#server/ports';
import { isRecoverableSlackAuthError } from '#server/utils';
import { isSlackUserNotFoundError } from './user-lookup';
import { slackWorkspaceTeamSchema } from '@exe/domain';
import { WebClient } from '@slack/web-api';

const SLACK_CONVERSATIONS_LIST_PAGE_SIZE = 200;
const SLACK_USERS_CONVERSATIONS_PAGE_SIZE = 200;

interface SlackConversationListChannel {
  readonly id?: string;
  readonly is_archived?: boolean;
  readonly is_im?: boolean;
  readonly is_member?: boolean;
  readonly is_mpim?: boolean;
  readonly is_private?: boolean;
  readonly name?: string;
  readonly name_normalized?: string;
}

export const getSlackChannelInfo = async ({
  botToken,
  channelId,
}: {
  readonly botToken: string;
  readonly channelId: string;
}): Promise<SlackChannelInfo | null> => {
  const response = await new WebClient(botToken).conversations.info({
    channel: channelId,
  });
  const id = response.channel?.id;
  const name = response.channel?.name ?? response.channel?.name_normalized;
  const isIm = response.channel?.is_im === true;

  if (id === undefined) {
    return null;
  }

  // Slack app DMs have no name; callers substitute a display name for them.
  if (isIm) {
    return { id, isIm: true, name: name ?? id };
  }

  return name === undefined
    ? null
    : {
        id,
        isIm: false,
        ...(response.channel?.is_private === undefined
          ? {}
          : { isPrivate: response.channel.is_private }),
        name,
      };
};

const toSlackChannelInfo = (
  channel: SlackConversationListChannel
): SlackChannelInfo | null => {
  const id = channel.id;
  const name = channel.name ?? channel.name_normalized;

  if (id === undefined || name === undefined) {
    return null;
  }

  return {
    id,
    isArchived: channel.is_archived === true,
    isIm: channel.is_im === true,
    isMember: channel.is_member === true,
    isMpim: channel.is_mpim === true,
    ...(channel.is_private === undefined
      ? {}
      : { isPrivate: channel.is_private }),
    name,
  };
};

export const listSlackBotJoinedChannels = async ({
  botToken,
  cursor,
}: {
  readonly botToken: string;
  readonly cursor?: string;
}): Promise<readonly SlackChannelInfo[]> => {
  const response = await new WebClient(botToken).conversations.list({
    exclude_archived: true,
    limit: SLACK_CONVERSATIONS_LIST_PAGE_SIZE,
    types: 'public_channel,private_channel',
    ...(cursor === undefined ? {} : { cursor }),
  });
  const channels = (response.channels ?? []).flatMap(
    (channel): readonly SlackChannelInfo[] => {
      const channelInfo = toSlackChannelInfo(channel);

      return channelInfo === null ||
        channelInfo.isArchived === true ||
        channelInfo.isIm ||
        channelInfo.isMember !== true ||
        channelInfo.isMpim === true
        ? []
        : [channelInfo];
    }
  );
  const nextCursor = response.response_metadata?.next_cursor;

  if (nextCursor === undefined || nextCursor.length === 0) {
    return channels;
  }

  return [
    ...channels,
    ...(await listSlackBotJoinedChannels({ botToken, cursor: nextCursor })),
  ];
};

const toSlackUserConversationsError = (
  error: unknown
): SlackUserConversations => {
  if (isRecoverableSlackAuthError(error)) {
    throw error;
  }

  return isSlackUserNotFoundError(error)
    ? { status: 'user_not_found' }
    : { status: 'indeterminate' };
};

export const listSlackUserJoinedChannelIds = ({
  botToken,
  slackUserId,
}: {
  readonly botToken: string;
  readonly slackUserId: string;
}): Promise<SlackUserConversations> => {
  const listPages = async ({
    cursor,
  }: {
    readonly cursor?: string;
  } = {}): Promise<readonly string[]> => {
    const response = await new WebClient(botToken).users.conversations({
      exclude_archived: true,
      limit: SLACK_USERS_CONVERSATIONS_PAGE_SIZE,
      types: 'public_channel,private_channel',
      user: slackUserId,
      ...(cursor === undefined ? {} : { cursor }),
    });
    const channelIds = (response.channels ?? []).flatMap(
      (channel): readonly string[] =>
        channel.id === undefined ? [] : [channel.id]
    );
    const nextCursor = response.response_metadata?.next_cursor;

    if (nextCursor === undefined || nextCursor.length === 0) {
      return channelIds;
    }

    return [...channelIds, ...(await listPages({ cursor: nextCursor }))];
  };

  return listPages()
    .then(
      (channelIds): SlackUserConversations => ({ channelIds, status: 'ok' })
    )
    .catch(
      (error: unknown): SlackUserConversations =>
        toSlackUserConversationsError(error)
    );
};

export const getSlackWorkspaceInfo = async ({
  botToken,
}: {
  readonly botToken: string;
}): Promise<SlackWorkspaceInfo | null> => {
  const response = await new WebClient(botToken).team.info();

  return response.team === undefined
    ? null
    : slackWorkspaceTeamSchema.parse(response.team);
};
