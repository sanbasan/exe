import { getWorkspaceForUser } from '#server/workspace-access';
import { listChannelsVisibleToSlackUser } from './channel-access';
import {
  assertNextCheckReasonWhenFarOut,
  getAccessibleChannelAndWorkspace,
} from './channel-review-helpers';
import type {
  ChannelService,
  ChannelServiceDeps,
  RecordChannelReviewInput,
} from './channel-service-contract';
import {
  buildNextChannelReviewState,
  type ChannelReviewState,
} from '@exe/domain';

type ChannelReviewMethods = Pick<
  ChannelService,
  | 'listChannelReviewStatesForUser'
  | 'listChannelReviewStatesForWorkspace'
  | 'recordChannelReviewForSlackUser'
  | 'recordChannelReviewForUser'
>;

export const createChannelReviewMethods = (
  deps: ChannelServiceDeps
): ChannelReviewMethods => {
  const {
    channelRepository,
    channelReviewStateRepository,
    channelVisibility,
    clock,
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

  const recordChannelReviewForSlackUser = async ({
    channelId,
    input,
    slackUserId,
    workspaceId,
  }: {
    readonly channelId: string;
    readonly input: RecordChannelReviewInput;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }): Promise<ChannelReviewState> => {
    await assertChannelAccess({ channelId, slackUserId, workspaceId });
    const now = clock.now();

    assertNextCheckReasonWhenFarOut({
      now,
      ...(input.nextCheckAt === undefined
        ? {}
        : { nextCheckAt: input.nextCheckAt }),
      ...(input.nextCheckReason === undefined
        ? {}
        : { nextCheckReason: input.nextCheckReason }),
    });

    const existing = await channelReviewStateRepository.getByChannelAndUser({
      channelId,
      slackUserId,
      workspaceId,
    });
    const state = buildNextChannelReviewState({
      channelId,
      existing,
      ...(input.lastSelfReport === undefined
        ? {}
        : { lastSelfReport: input.lastSelfReport }),
      ...(input.nextCheckAt === undefined
        ? {}
        : { nextCheckAt: input.nextCheckAt }),
      ...(input.nextCheckReason === undefined
        ? {}
        : { nextCheckReason: input.nextCheckReason }),
      now,
      slackUserId,
      ...(input.statusText === undefined
        ? {}
        : { statusText: input.statusText }),
      workspaceId,
    });

    await channelReviewStateRepository.upsert({ state });

    return state;
  };

  return {
    listChannelReviewStatesForUser: async ({
      userId,
      workspaceId,
    }): Promise<readonly ChannelReviewState[]> => {
      const slackUserId = await resolveSlackUserId({ userId, workspaceId });
      const states = await channelReviewStateRepository.listByWorkspace({
        workspaceId,
      });

      return states.filter((state) => state.slackUserId === slackUserId);
    },
    listChannelReviewStatesForWorkspace: async ({
      userId,
      workspaceId,
    }): Promise<readonly ChannelReviewState[]> => {
      const { linkedSlackUser, workspace } = await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });
      const [channels, states] = await Promise.all([
        channelRepository.listByWorkspace({ workspaceId }),
        channelReviewStateRepository.listByWorkspace({ workspaceId }),
      ]);
      const visibility = await channelVisibility.getVisibilityForSlackUser({
        slackUserId: linkedSlackUser.slackUserId,
        workspace,
      });

      if (visibility === 'all') {
        return states;
      }

      const visibleChannelIds = new Set(
        listChannelsVisibleToSlackUser({ channels, visibility }).map(
          (channel) => channel.channelId
        )
      );

      return states.filter((state) => visibleChannelIds.has(state.channelId));
    },
    recordChannelReviewForSlackUser,
    recordChannelReviewForUser: async ({
      channelId,
      input,
      userId,
      workspaceId,
    }): Promise<ChannelReviewState> =>
      recordChannelReviewForSlackUser({
        channelId,
        input,
        slackUserId: await resolveSlackUserId({ userId, workspaceId }),
        workspaceId,
      }),
  };
};
