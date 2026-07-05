import { notFoundError } from '#server/errors';
import { getWorkspaceForUser } from '#server/workspace-access';
import { listChannelsVisibleToSlackUser } from './channel-access';
import { getAccessibleChannelAndWorkspace } from './channel-review-helpers';
import type {
  ChannelService,
  ChannelServiceDeps,
  CreateChannelBlockInput,
  UpdateChannelBlockInput,
} from './channel-service-contract';
import { channelBlockSchema, type ChannelBlock } from '@exe/domain';

type ChannelBlockMethods = Pick<
  ChannelService,
  | 'createChannelBlockForSlackUser'
  | 'createChannelBlockForUser'
  | 'deleteChannelBlockForSlackUser'
  | 'deleteChannelBlockForUser'
  | 'listChannelBlocksForUser'
  | 'resolveChannelBlockForSlackUser'
  | 'resolveChannelBlockForUser'
  | 'updateChannelBlockForSlackUser'
  | 'updateChannelBlockForUser'
>;

export const createChannelBlockMethods = (
  deps: ChannelServiceDeps
): ChannelBlockMethods => {
  const {
    channelBlockRepository,
    channelRepository,
    channelVisibility,
    clock,
    idGenerator,
    userProfileRepository,
    workspaceRepository,
  } = deps;

  const assertChannelAccess = (params: {
    readonly channelId: string;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }): Promise<unknown> =>
    getAccessibleChannelAndWorkspace({
      ...params,
      channelRepository,
      channelVisibility,
      workspaceRepository,
    });

  const resolveSlackUserId = async ({
    userId,
    workspaceId,
  }: {
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<string> => {
    const { linkedSlackUser } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });

    return linkedSlackUser.slackUserId;
  };

  const getAccessibleChannelBlock = async ({
    blockId,
    slackUserId,
    workspaceId,
  }: {
    readonly blockId: string;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }): Promise<ChannelBlock> => {
    const block = await channelBlockRepository.getById({
      blockId,
      workspaceId,
    });

    if (block === null) {
      throw notFoundError(`Channel block ${blockId} was not found.`);
    }

    await assertChannelAccess({
      channelId: block.channelId,
      slackUserId,
      workspaceId,
    });

    return block;
  };

  const createChannelBlockForSlackUser = async ({
    channelId,
    input,
    slackUserId,
    workspaceId,
  }: {
    readonly channelId: string;
    readonly input: CreateChannelBlockInput;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }): Promise<ChannelBlock> => {
    await assertChannelAccess({ channelId, slackUserId, workspaceId });
    const now = clock.now();
    const block = channelBlockSchema.parse({
      channelId,
      createdAt: now,
      createdBySlackUserId: slackUserId,
      description: input.description ?? input.title,
      id: idGenerator.generateId(),
      status: 'active',
      title: input.title,
      updatedAt: now,
      workspaceId,
    });

    await channelBlockRepository.create({ block });

    return block;
  };

  const resolveChannelBlockForSlackUser = async ({
    blockId,
    slackUserId,
    workspaceId,
  }: {
    readonly blockId: string;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }): Promise<ChannelBlock> => {
    const block = await getAccessibleChannelBlock({
      blockId,
      slackUserId,
      workspaceId,
    });
    const now = clock.now();
    const resolved = channelBlockSchema.parse({
      ...block,
      resolvedAt: now,
      status: 'resolved',
      updatedAt: now,
    });

    await channelBlockRepository.update({ block: resolved });

    return resolved;
  };

  const updateChannelBlockForSlackUser = async ({
    blockId,
    input,
    slackUserId,
    workspaceId,
  }: {
    readonly blockId: string;
    readonly input: UpdateChannelBlockInput;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }): Promise<ChannelBlock> => {
    const block = await getAccessibleChannelBlock({
      blockId,
      slackUserId,
      workspaceId,
    });
    const now = clock.now();
    const updated = channelBlockSchema.parse({
      ...block,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.title === undefined ? {} : { title: input.title }),
      updatedAt: now,
    });

    await channelBlockRepository.update({ block: updated });

    return updated;
  };

  const deleteChannelBlockForSlackUser = async ({
    blockId,
    slackUserId,
    workspaceId,
  }: {
    readonly blockId: string;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }): Promise<ChannelBlock> => {
    const block = await getAccessibleChannelBlock({
      blockId,
      slackUserId,
      workspaceId,
    });

    await channelBlockRepository.delete({ blockId, workspaceId });

    return block;
  };

  return {
    createChannelBlockForSlackUser,
    createChannelBlockForUser: async ({
      channelId,
      input,
      userId,
      workspaceId,
    }): Promise<ChannelBlock> =>
      createChannelBlockForSlackUser({
        channelId,
        input,
        slackUserId: await resolveSlackUserId({ userId, workspaceId }),
        workspaceId,
      }),
    deleteChannelBlockForSlackUser,
    deleteChannelBlockForUser: async ({
      blockId,
      userId,
      workspaceId,
    }): Promise<ChannelBlock> =>
      deleteChannelBlockForSlackUser({
        blockId,
        slackUserId: await resolveSlackUserId({ userId, workspaceId }),
        workspaceId,
      }),
    listChannelBlocksForUser: async ({
      userId,
      workspaceId,
    }): Promise<readonly ChannelBlock[]> => {
      const { linkedSlackUser, workspace } = await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });
      const [blocks, channels] = await Promise.all([
        channelBlockRepository.listByWorkspace({ workspaceId }),
        channelRepository.listByWorkspace({ workspaceId }),
      ]);
      const visibility = await channelVisibility.getVisibilityForSlackUser({
        slackUserId: linkedSlackUser.slackUserId,
        workspace,
      });
      const visibleChannelIds = new Set(
        listChannelsVisibleToSlackUser({ channels, visibility }).map(
          (channel) => channel.channelId
        )
      );

      return blocks.filter((block) => visibleChannelIds.has(block.channelId));
    },
    resolveChannelBlockForSlackUser,
    resolveChannelBlockForUser: async ({
      blockId,
      userId,
      workspaceId,
    }): Promise<ChannelBlock> =>
      resolveChannelBlockForSlackUser({
        blockId,
        slackUserId: await resolveSlackUserId({ userId, workspaceId }),
        workspaceId,
      }),
    updateChannelBlockForSlackUser,
    updateChannelBlockForUser: async ({
      blockId,
      input,
      userId,
      workspaceId,
    }): Promise<ChannelBlock> =>
      updateChannelBlockForSlackUser({
        blockId,
        input,
        slackUserId: await resolveSlackUserId({ userId, workspaceId }),
        workspaceId,
      }),
  };
};
