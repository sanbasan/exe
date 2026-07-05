import { notFoundError } from '#server/errors';
import { getWorkspaceForUser } from '#server/workspace-access';
import {
  assertCanAccessChannel,
  listChannelsVisibleToSlackUser,
} from './channel-access';
import type {
  ChannelService,
  ChannelServiceDeps,
} from './channel-service-contract';
import {
  getAssignedActiveChannelsForUser,
  getWatchedChannelsForUser,
  type Channel,
  type ChannelEvent,
} from '@exe/domain';

type ChannelReadMethods = Pick<
  ChannelService,
  | 'getChannelForUser'
  | 'listAssignedChannelsForUser'
  | 'listChannelEventsForUser'
  | 'listChannelsForUser'
  | 'listWatchedChannelsForUser'
>;

export const createChannelReadMethods = ({
  channelEventRepository,
  channelRepository,
  channelVisibility,
  userProfileRepository,
  workspaceRepository,
}: ChannelServiceDeps): ChannelReadMethods => ({
  getChannelForUser: async ({
    channelId,
    userId,
    workspaceId,
  }): Promise<Channel> => {
    const { linkedSlackUser, workspace } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });
    const channel = await channelRepository.getById({ channelId, workspaceId });

    if (channel === null) {
      throw notFoundError(`Channel ${channelId} was not found.`);
    }

    const visibility = await channelVisibility.getVisibilityForSlackUser({
      slackUserId: linkedSlackUser.slackUserId,
      workspace,
    });

    assertCanAccessChannel({ channel, visibility });

    return channel;
  },
  listAssignedChannelsForUser: async ({
    userId,
    workspaceId,
  }): Promise<readonly Channel[]> => {
    const { linkedSlackUser, workspace } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });
    const channels = await channelRepository.listByWorkspace({ workspaceId });
    const visibility = await channelVisibility.getVisibilityForSlackUser({
      slackUserId: linkedSlackUser.slackUserId,
      workspace,
    });

    return getAssignedActiveChannelsForUser({
      channels: listChannelsVisibleToSlackUser({ channels, visibility }),
      slackUserId: linkedSlackUser.slackUserId,
    });
  },
  listChannelEventsForUser: async ({
    channelId,
    userId,
    workspaceId,
  }): Promise<readonly ChannelEvent[]> => {
    const { linkedSlackUser, workspace } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });
    const channel = await channelRepository.getById({ channelId, workspaceId });

    if (channel === null) {
      throw notFoundError(`Channel ${channelId} was not found.`);
    }

    const visibility = await channelVisibility.getVisibilityForSlackUser({
      slackUserId: linkedSlackUser.slackUserId,
      workspace,
    });

    assertCanAccessChannel({ channel, visibility });

    return channelEventRepository.listByChannel({ channelId, workspaceId });
  },
  listChannelsForUser: async ({
    userId,
    workspaceId,
  }): Promise<readonly Channel[]> => {
    const { linkedSlackUser, workspace } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });
    const channels = await channelRepository.listByWorkspace({ workspaceId });
    const visibility = await channelVisibility.getVisibilityForSlackUser({
      slackUserId: linkedSlackUser.slackUserId,
      workspace,
    });
    const activeChannels = channels.filter(
      (channel) => channel.status === 'active'
    );

    return listChannelsVisibleToSlackUser({
      channels: activeChannels,
      visibility,
    });
  },
  listWatchedChannelsForUser: async ({
    userId,
    workspaceId,
  }): Promise<readonly Channel[]> => {
    const { linkedSlackUser, workspace } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });
    const channels = await channelRepository.listByWorkspace({ workspaceId });
    const visibility = await channelVisibility.getVisibilityForSlackUser({
      slackUserId: linkedSlackUser.slackUserId,
      workspace,
    });

    return getWatchedChannelsForUser({
      channels: listChannelsVisibleToSlackUser({ channels, visibility }),
      slackUserId: linkedSlackUser.slackUserId,
    });
  },
});
