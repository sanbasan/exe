import { invalidRequestError, notFoundError } from '#server/errors';
import { getWorkspaceForUser } from '#server/workspace-access';
import {
  assertCanAccessChannel,
  assertCanEditChannelMetadata,
} from './channel-access';
import type {
  ChannelService,
  ChannelServiceDeps,
  PatchChannelInput,
} from './channel-service-contract';
import {
  canAccessChannel,
  channelEventSchema,
  channelSchema,
  type Channel,
  type Workspace,
} from '@exe/domain';

type ChannelWriteMethods = Pick<
  ChannelService,
  | 'patchChannelForSlackUser'
  | 'patchChannelForUser'
  | 'putWatchedChannelsForUser'
  | 'updateChannelLatestInfoForSlackUser'
>;

const uniq = (values: readonly string[]): readonly string[] => [
  ...new Set(values),
];

const areSameStrings = (
  left: readonly string[],
  right: readonly string[]
): boolean => JSON.stringify(left) === JSON.stringify(right);

// Editing channel responsibility (assignees), status, or another person's watch
// state is a privileged change. Updating latest info is intentionally open to
// any workspace member: assignees are responsible for it, but anyone can record
// an update when they explicitly mention the channel.
const requiresEditPermission = (input: PatchChannelInput): boolean =>
  input.assigneeSlackUserIds !== undefined ||
  input.status !== undefined ||
  input.watcherSlackUserIds !== undefined;

const validateAssignees = ({
  input,
}: {
  readonly input: PatchChannelInput;
}): readonly string[] | undefined => {
  const assigneeSlackUserIds =
    input.assigneeSlackUserIds === undefined
      ? undefined
      : uniq(input.assigneeSlackUserIds);

  if (assigneeSlackUserIds?.length === 0 && input.status !== 'archived') {
    throw invalidRequestError('A channel update owner list cannot be empty.');
  }

  return assigneeSlackUserIds;
};

const buildUpdatedChannel = ({
  channel,
  clock,
  input,
}: {
  readonly channel: Channel;
  readonly clock: ChannelServiceDeps['clock'];
  readonly input: PatchChannelInput;
}): Channel => {
  const assigneeSlackUserIds = validateAssignees({ input });
  const now = clock.now();

  return channelSchema.parse({
    ...channel,
    ...(assigneeSlackUserIds === undefined ? {} : { assigneeSlackUserIds }),
    ...(input.latestInfo === undefined
      ? {}
      : { latestInfo: input.latestInfo, latestInfoUpdatedAt: now }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.watcherSlackUserIds === undefined
      ? {}
      : { watcherSlackUserIds: uniq(input.watcherSlackUserIds) }),
    updatedAt: now,
  });
};

const createLatestInfoEvent = async ({
  channel,
  deps,
  input,
  workspace,
}: {
  readonly channel: Channel;
  readonly deps: ChannelServiceDeps;
  readonly input: PatchChannelInput;
  readonly workspace: Workspace;
}): Promise<void> => {
  if (input.latestInfo === undefined) {
    return;
  }

  await deps.channelEventRepository.create({
    event: channelEventSchema.parse({
      body: input.latestInfo,
      channelId: channel.channelId,
      createdAt: deps.clock.now(),
      id: deps.idGenerator.generateId(),
      occurredAt: deps.clock.now(),
      source: 'call',
      title:
        workspace.language === 'ja' ? '最新情報を更新' : 'Updated latest info',
      type: 'external_summary',
      workspaceId: workspace.id,
    }),
  });
};

export const createChannelWriteMethods = (
  deps: ChannelServiceDeps
): ChannelWriteMethods => {
  const {
    channelRepository,
    channelVisibility,
    clock,
    userProfileRepository,
    workspaceRepository,
  } = deps;

  const getChannelAndWorkspace = async ({
    channelId,
    workspaceId,
  }: {
    readonly channelId: string;
    readonly workspaceId: string;
  }): Promise<{ readonly channel: Channel; readonly workspace: Workspace }> => {
    const [channel, workspace] = await Promise.all([
      channelRepository.getById({ channelId, workspaceId }),
      workspaceRepository.getById({ workspaceId }),
    ]);

    if (channel === null) {
      throw notFoundError(`Channel ${channelId} was not found.`);
    }

    if (workspace === null) {
      throw notFoundError(`Workspace ${workspaceId} was not found.`);
    }

    return { channel, workspace };
  };

  const patchChannelForSlackUser = async ({
    channelId,
    input,
    slackUserId,
    workspaceId,
  }: {
    readonly channelId: string;
    readonly input: PatchChannelInput;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }): Promise<Channel> => {
    const { channel, workspace } = await getChannelAndWorkspace({
      channelId,
      workspaceId,
    });
    const visibility = await channelVisibility.getVisibilityForSlackUser({
      slackUserId,
      workspace,
    });

    assertCanAccessChannel({ channel, visibility });

    if (requiresEditPermission(input)) {
      assertCanEditChannelMetadata({ channel, slackUserId, workspace });
    }

    const updatedChannel = buildUpdatedChannel({ channel, clock, input });

    await channelRepository.upsert({ channel: updatedChannel });
    await createLatestInfoEvent({
      channel: updatedChannel,
      deps,
      input,
      workspace,
    });

    return updatedChannel;
  };

  return {
    patchChannelForSlackUser,
    patchChannelForUser: async ({
      channelId,
      input,
      userId,
      workspaceId,
    }): Promise<Channel> => {
      const { linkedSlackUser } = await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });

      return patchChannelForSlackUser({
        channelId,
        input,
        slackUserId: linkedSlackUser.slackUserId,
        workspaceId,
      });
    },
    putWatchedChannelsForUser: async ({
      channelIds,
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
      const wantedChannelIds = new Set(channelIds);
      const slackUserId = linkedSlackUser.slackUserId;
      const visibility = await channelVisibility.getVisibilityForSlackUser({
        slackUserId,
        workspace,
      });
      const updates = channels.map((channel) => {
        const canWatch =
          wantedChannelIds.has(channel.channelId) &&
          (visibility === 'all' || canAccessChannel({ channel, visibility }));
        const nextWatchers = canWatch
          ? uniq([...channel.watcherSlackUserIds, slackUserId])
          : channel.watcherSlackUserIds.filter(
              (watcher) => watcher !== slackUserId
            );
        const changed = !areSameStrings(
          nextWatchers,
          channel.watcherSlackUserIds
        );

        return {
          changed,
          channel: channelSchema.parse({
            ...channel,
            updatedAt: changed ? clock.now() : channel.updatedAt,
            watcherSlackUserIds: nextWatchers,
          }),
        };
      });
      const updatedChannels = updates.map((update) => update.channel);

      await Promise.all(
        updates
          .filter((update) => update.changed)
          .map((update) =>
            channelRepository.upsert({ channel: update.channel })
          )
      );

      return updatedChannels.filter(
        (channel) =>
          channel.status === 'active' &&
          channel.watcherSlackUserIds.includes(slackUserId) &&
          !channel.assigneeSlackUserIds.includes(slackUserId)
      );
    },
    updateChannelLatestInfoForSlackUser: ({
      channelId,
      latestInfo,
      slackUserId,
      workspaceId,
    }): Promise<Channel> =>
      patchChannelForSlackUser({
        channelId,
        input: { latestInfo },
        slackUserId,
        workspaceId,
      }),
  };
};
