import type { Clock, SlackGateway, WorkspaceRepository } from '#server/ports';
import { withSlackBotToken } from './slack-bot-token';
import type { ChannelBlock, Workspace } from '@exe/domain';
import { buildChannelBlockMessageBlocks } from '@exe/slack';

// Rewrites the posted block card in place so it reflects the block's current
// state (or a deleted marker). No-op for blocks that were never posted.
export const updateSlackChannelBlockMessage = async ({
  block,
  clock,
  deleted,
  encryptionKey,
  slackGateway,
  workspace,
  workspaceRepository,
}: {
  readonly block: ChannelBlock;
  readonly clock: Clock;
  readonly deleted?: boolean;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<void> => {
  const messageTs = block.messageTs;

  if (messageTs === undefined) {
    return;
  }

  await withSlackBotToken({
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    run: async ({ botToken }): Promise<void> => {
      await slackGateway.updateMessage({
        blocks: buildChannelBlockMessageBlocks({
          block,
          ...(deleted === undefined ? {} : { deleted }),
          language: workspace.language,
        }),
        botToken,
        channelId: block.channelId,
        messageTs,
        text: block.title,
      });
    },
    slackGateway,
    workspace,
    workspaceRepository,
  });
};
