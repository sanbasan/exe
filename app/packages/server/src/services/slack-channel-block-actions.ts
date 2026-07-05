import { getAccessibleChannelAndWorkspace } from './channel-review-helpers';
import { publishSlackAppHome, type SlackAppHomeDeps } from './slack-app-home';
import { updateSlackChannelBlockMessage } from './slack-channel-block-message';
import { channelBlockSchema } from '@exe/domain';
import { slackActionIds } from '@exe/slack';

export const handleSlackChannelBlockResolveAction = async ({
  actionId,
  deps,
  slackTeamId,
  slackUserId,
  value,
}: {
  readonly actionId: string;
  readonly deps: SlackAppHomeDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly value?: string;
}): Promise<void> => {
  if (actionId !== slackActionIds.resolveChannelBlock || value === undefined) {
    return;
  }

  const block = await deps.channelBlockRepository.getById({
    blockId: value,
    workspaceId: slackTeamId,
  });

  if (block === null) {
    return;
  }

  const { workspace } = await getAccessibleChannelAndWorkspace({
    channelId: block.channelId,
    channelRepository: deps.channelRepository,
    channelVisibility: deps.channelVisibility,
    slackUserId,
    workspaceId: slackTeamId,
    workspaceRepository: deps.workspaceRepository,
  });

  const now = deps.clock.now();
  const resolved = channelBlockSchema.parse({
    ...block,
    resolvedAt: now,
    status: 'resolved',
    updatedAt: now,
  });

  await deps.channelBlockRepository.update({ block: resolved });
  await Promise.all([
    updateSlackChannelBlockMessage({
      block: resolved,
      clock: deps.clock,
      ...(deps.encryptionKey === undefined
        ? {}
        : { encryptionKey: deps.encryptionKey }),
      slackGateway: deps.slackGateway,
      workspace,
      workspaceRepository: deps.workspaceRepository,
    }),
    publishSlackAppHome({ deps, slackTeamId, slackUserId }),
  ]);
};
