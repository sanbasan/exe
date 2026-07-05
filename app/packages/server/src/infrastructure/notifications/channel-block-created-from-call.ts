import type {
  ChannelBlockCreatedFromCallMessageReference,
  Clock,
  SlackGateway,
  WorkspaceRepository,
} from '#server/ports';
import { withSlackBotToken } from '#server/services/slack-bot-token';
import type { ChannelBlock, Workspace } from '@exe/domain';
import {
  buildChannelBlockMessageBlocks,
  buildChannelBlocksCreatedFromCallRootBlocks,
  buildChannelBlocksCreatedFromCallRootFallbackText,
} from '@exe/slack';

interface ChannelBlockCreatedFromCallDeps {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

// Posts one channel anchor for blocks created during a call session, then
// posts each block card as a reply in that anchor thread.
export const sendChannelBlocksCreatedFromCall = ({
  blocks,
  channelId,
  deps,
  sessionStartedAt,
  speakerSlackUserId,
  workspace,
}: {
  readonly blocks: readonly ChannelBlock[];
  readonly channelId: string;
  readonly deps: ChannelBlockCreatedFromCallDeps;
  readonly sessionStartedAt: string;
  readonly speakerSlackUserId: string;
  readonly workspace: Workspace;
}): Promise<readonly ChannelBlockCreatedFromCallMessageReference[]> => {
  if (blocks.length === 0) {
    return Promise.resolve([]);
  }

  return withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: async ({
      botToken,
    }): Promise<readonly ChannelBlockCreatedFromCallMessageReference[]> => {
      const threadTs = await deps.slackGateway.postMessage({
        blocks: buildChannelBlocksCreatedFromCallRootBlocks({
          blockCount: blocks.length,
          language: workspace.language,
          sessionStartedAt,
          speakerSlackUserId,
          timezone: workspace.timezone,
        }),
        botToken,
        channelId,
        text: buildChannelBlocksCreatedFromCallRootFallbackText({
          blockCount: blocks.length,
          language: workspace.language,
          sessionStartedAt,
          speakerSlackUserId,
          timezone: workspace.timezone,
        }),
        unfurlLinks: false,
      });
      return Promise.all(
        blocks.map(async (block) => {
          const messageTs = await deps.slackGateway.postMessage({
            blocks: buildChannelBlockMessageBlocks({
              block,
              language: workspace.language,
            }),
            botToken,
            channelId,
            text: block.title,
            threadTs,
            unfurlLinks: false,
          });

          return {
            blockId: block.id,
            channelId,
            messageTs,
            threadTs,
          };
        })
      );
    },
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};
