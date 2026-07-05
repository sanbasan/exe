import type {
  CallSessionRepository,
  ChannelBlockRepository,
  ChannelRepository,
  ChannelReviewStateRepository,
  Clock,
  IdGenerator,
  LiveKitGateway,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { getWorkspaceForUser } from '#server/workspace-access';
import type { CallSessionWithAgenda } from './call-session-types';
import { buildLiveKitRoomName } from './call-session-utils';
import { listChannelsVisibleToSlackUser } from './channel-access';
import type { ChannelVisibilityService } from './channel-visibility-service';
import {
  buildCallAgenda,
  callSessionSchema,
  type CallPurpose,
} from '@exe/domain';

const warmUpAgentWorkerBestEffort = ({
  liveKitGateway,
}: {
  readonly liveKitGateway: LiveKitGateway;
}): void => {
  void Promise.resolve()
    .then(() => liveKitGateway.warmUpAgentWorker())
    .catch((): null => null);
};

export const createCallSessionCreator = ({
  callSessionRepository,
  channelBlockRepository,
  channelRepository,
  channelReviewStateRepository,
  channelVisibility,
  clock,
  idGenerator,
  liveKitGateway,
  liveKitRoomNamePrefix,
  taskRepository,
  userProfileRepository,
  workspaceRepository,
}: {
  readonly callSessionRepository: CallSessionRepository;
  readonly channelBlockRepository: ChannelBlockRepository;
  readonly channelRepository: ChannelRepository;
  readonly channelReviewStateRepository: ChannelReviewStateRepository;
  readonly channelVisibility: ChannelVisibilityService;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly liveKitGateway: LiveKitGateway;
  readonly liveKitRoomNamePrefix: string;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): ((params: {
  readonly callScheduleId?: string;
  readonly focusTaskId?: string;
  readonly purpose: CallPurpose;
  readonly scheduledRunAt?: string;
  readonly sessionId?: string;
  readonly userId: string;
  readonly workspaceId: string;
}) => Promise<CallSessionWithAgenda>) => {
  const createCall = async ({
    callScheduleId,
    focusTaskId,
    purpose,
    scheduledRunAt,
    sessionId: requestedSessionId,
    userId,
    workspaceId,
  }: {
    readonly callScheduleId?: string;
    readonly focusTaskId?: string;
    readonly purpose: CallPurpose;
    readonly scheduledRunAt?: string;
    readonly sessionId?: string;
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<CallSessionWithAgenda> => {
    const { linkedSlackUser, userProfile, workspace } =
      await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });
    const sessionId = requestedSessionId ?? idGenerator.generateId();
    const now = clock.now();
    const liveKitRoomName = buildLiveKitRoomName({
      prefix: liveKitRoomNamePrefix,
      sessionId,
    });
    const [allBlocks, allChannels, reviewStates, tasks] = await Promise.all([
      channelBlockRepository.listByWorkspace({ workspaceId }),
      channelRepository.listByWorkspace({ workspaceId }),
      channelReviewStateRepository.listByWorkspace({ workspaceId }),
      taskRepository.listByWorkspace({ workspaceId }),
    ]);
    const visibility = await channelVisibility.getVisibilityForSlackUser({
      slackUserId: linkedSlackUser.slackUserId,
      workspace,
    });
    const channels = listChannelsVisibleToSlackUser({
      channels: allChannels,
      visibility,
    });
    const visibleChannelIds = new Set(
      channels.map((channel) => channel.channelId)
    );
    const blocks =
      visibility === 'all'
        ? allBlocks
        : allBlocks.filter((block) => visibleChannelIds.has(block.channelId));
    const agenda = buildCallAgenda({
      blocks,
      channels,
      language: workspace.language,
      now,
      ...(focusTaskId === undefined ? {} : { focusTaskId }),
      purpose,
      slackUserId: linkedSlackUser.slackUserId,
      ...(userProfile.displayName === undefined
        ? {}
        : { speakerName: userProfile.displayName }),
      reviewStates,
      tasks,
      timezone: workspace.timezone,
    });
    const session = callSessionSchema.parse({
      ...(callScheduleId === undefined ? {} : { callScheduleId }),
      createdAt: now,
      ...(focusTaskId === undefined ? {} : { focusTaskId }),
      id: sessionId,
      liveKitRoomName,
      purpose,
      ...(scheduledRunAt === undefined ? {} : { scheduledRunAt }),
      status: 'created',
      updatedAt: now,
      userId,
      workspaceId,
    });

    await callSessionRepository.create({ session });
    warmUpAgentWorkerBestEffort({ liveKitGateway });

    return { agenda, session };
  };

  return createCall;
};
