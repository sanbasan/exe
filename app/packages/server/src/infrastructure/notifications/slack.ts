import type {
  Clock,
  SlackGateway,
  SlackMessageReference,
  WorkspaceRepository,
} from '#server/ports';
import { withSlackBotToken } from '#server/services/slack-bot-token';
import type { Workspace } from '@exe/domain';
import type { KnownBlock } from '@slack/types';
import { WebClient } from '@slack/web-api';

const openDirectMessageChannel = async ({
  client,
  slackUserId,
}: {
  readonly client: WebClient;
  readonly slackUserId: string;
}): Promise<string> => {
  const response = await client.conversations.open({ users: slackUserId });
  const channelId = response.channel?.id;

  if (channelId === undefined || channelId.length === 0) {
    throw new Error(`Failed to open Slack DM for ${slackUserId}.`);
  }

  return channelId;
};

export const sendSlackDirectMessage = ({
  blocks,
  clock,
  encryptionKey,
  slackGateway,
  slackUserId,
  text,
  workspace,
  workspaceRepository,
}: {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly blocks?: readonly KnownBlock[];
  readonly slackGateway: SlackGateway;
  readonly slackUserId: string;
  readonly text: string;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<SlackMessageReference> =>
  withSlackBotToken({
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    run: async ({ botToken }): Promise<SlackMessageReference> => {
      const client = new WebClient(botToken);
      const channelId = await openDirectMessageChannel({ client, slackUserId });
      const response = await client.chat.postMessage({
        ...(blocks === undefined ? {} : { blocks: [...blocks] }),
        channel: channelId,
        text,
        unfurl_links: false,
        unfurl_media: false,
      });
      const messageTs = response.ts;

      if (messageTs === undefined || messageTs.length === 0) {
        throw new Error('Slack postMessage response is missing ts.');
      }

      return { channelId, messageTs };
    },
    slackGateway,
    workspace,
    workspaceRepository,
  });

export const sendSlackChannelMessage = ({
  blocks,
  channelId,
  clock,
  encryptionKey,
  slackGateway,
  text,
  threadTs,
  unfurlLinks,
  workspace,
  workspaceRepository,
}: {
  readonly blocks: readonly KnownBlock[];
  readonly channelId: string;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly text: string;
  readonly threadTs?: string;
  readonly unfurlLinks?: boolean;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<string> =>
  withSlackBotToken({
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    run: ({ botToken }) =>
      slackGateway.postMessage({
        blocks,
        botToken,
        channelId,
        text,
        ...(threadTs === undefined ? {} : { threadTs }),
        ...(unfurlLinks === undefined ? {} : { unfurlLinks }),
      }),
    slackGateway,
    workspace,
    workspaceRepository,
  });
