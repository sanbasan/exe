import { listChannelsVisibleToSlackUser } from './channel-access';
import { publishSlackAppHome, type SlackAppHomeDeps } from './slack-app-home';
import { withSlackBotToken } from './slack-bot-token';
import { canAccessChannel } from '@exe/domain';
import {
  buildChannelWatchSettingsModal,
  parseChannelWatchSettingsSelectedChannels,
  slackActionIds,
  slackViewIds,
} from '@exe/slack';

const areSameStrings = (
  left: readonly string[],
  right: readonly string[]
): boolean => JSON.stringify(left) === JSON.stringify(right);

export const openSlackChannelWatchSettings = async ({
  actionId,
  deps,
  slackTeamId,
  slackUserId,
  triggerId,
}: {
  readonly actionId: string;
  readonly deps: SlackAppHomeDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly triggerId?: string;
  readonly value?: string;
}): Promise<void> => {
  if (
    actionId !== slackActionIds.openChannelWatchSettings ||
    triggerId === undefined
  ) {
    return;
  }

  const [workspace, channels] = await Promise.all([
    deps.workspaceRepository.getById({ workspaceId: slackTeamId }),
    deps.channelRepository.listByWorkspace({ workspaceId: slackTeamId }),
  ]);

  if (workspace === null) {
    return;
  }

  const visibility = await deps.channelVisibility.getVisibilityForSlackUser({
    slackUserId,
    workspace,
  });
  const visibleChannels = listChannelsVisibleToSlackUser({
    channels,
    visibility,
  });

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.openView({
        botToken,
        triggerId,
        view: buildChannelWatchSettingsModal({
          channels: visibleChannels.filter(
            (channel) => channel.status === 'active'
          ),
          language: workspace.language,
          slackUserId,
        }),
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

export const saveSlackChannelWatchSettings = async ({
  callbackId,
  deps,
  slackTeamId,
  slackUserId,
  stateValues,
}: {
  readonly callbackId: string;
  readonly deps: SlackAppHomeDeps;
  readonly privateMetadata?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly stateValues: unknown;
}): Promise<void> => {
  if (callbackId !== slackViewIds.channelWatchSettings) {
    return;
  }

  const selectedChannelIds =
    parseChannelWatchSettingsSelectedChannels(stateValues);

  if (selectedChannelIds === null) {
    return;
  }

  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace === null) {
    return;
  }

  const channels = await deps.channelRepository.listByWorkspace({
    workspaceId: slackTeamId,
  });
  const visibility = await deps.channelVisibility.getVisibilityForSlackUser({
    slackUserId,
    workspace,
  });
  const selected = new Set(selectedChannelIds);

  await Promise.all(
    channels.map((channel) => {
      const canWatch =
        selected.has(channel.channelId) &&
        (visibility === 'all' || canAccessChannel({ channel, visibility }));
      const nextWatchers = canWatch
        ? [...new Set([...channel.watcherSlackUserIds, slackUserId])]
        : channel.watcherSlackUserIds.filter(
            (watcher) => watcher !== slackUserId
          );

      if (areSameStrings(nextWatchers, channel.watcherSlackUserIds)) {
        return Promise.resolve();
      }

      return deps.channelRepository.upsert({
        channel: {
          ...channel,
          updatedAt: deps.clock.now(),
          watcherSlackUserIds: nextWatchers,
        },
      });
    })
  );

  await publishSlackAppHome({ deps, slackTeamId, slackUserId });
};
