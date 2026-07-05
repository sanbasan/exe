/* eslint-disable max-lines -- Call session service coordinates multiple API methods around one state machine. */
import { forbiddenError, invalidRequestError } from '#server/errors';
import type {
  CallEventRepository,
  CallScheduleRepository,
  CallSessionRepository,
  ChannelBlockRepository,
  ChannelReviewStateRepository,
  Clock,
  IdGenerator,
  LiveKitGateway,
  ChannelRepository,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { getWorkspaceForUser } from '#server/workspace-access';
import { assertUserCallEventAuthorized } from './call-event-authorization';
import { createCallSessionCreator } from './call-session-creator';
import {
  advanceScheduleForSession,
  findManualScheduledRun,
  getOrCreateScheduledReviewCall,
  shouldAdvanceScheduleForStatus,
} from './call-session-scheduled-runs';
import type {
  CallSessionService,
  CallSessionWithAgenda,
} from './call-session-types';
import {
  getCallSessionForUserOrThrow,
  getCallSessionOrThrow,
  getEndedAtPatch,
} from './call-session-utils';
import { listChannelsVisibleToSlackUser } from './channel-access';
import type { ChannelVisibilityService } from './channel-visibility-service';
import {
  buildCallAgenda,
  callEventSchema,
  callSessionSchema,
  canTransitionCallStatus,
  type CallAgenda,
  type CallEvent,
  type CallEventPayload,
  type CallEventType,
  type CallSession,
  type CallStatus,
} from '@exe/domain';

export type { CallSessionService, CallSessionWithAgenda };

export const createCallSessionService = ({
  callEventRepository,
  callScheduleRepository,
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
  readonly callEventRepository: CallEventRepository;
  readonly callScheduleRepository: CallScheduleRepository;
  readonly callSessionRepository: CallSessionRepository;
  readonly channelBlockRepository: ChannelBlockRepository;
  readonly channelReviewStateRepository: ChannelReviewStateRepository;
  readonly channelVisibility: ChannelVisibilityService;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly liveKitGateway: LiveKitGateway;
  readonly liveKitRoomNamePrefix: string;
  readonly channelRepository: ChannelRepository;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): CallSessionService => {
  const getSession = ({
    callSessionId,
    workspaceId,
  }: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }): Promise<CallSession> =>
    getCallSessionOrThrow({
      callSessionId,
      callSessionRepository,
      workspaceId,
    });

  const getSessionForUser = ({
    callSessionId,
    userId,
    workspaceId,
  }: {
    readonly callSessionId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<CallSession> =>
    getCallSessionForUserOrThrow({
      callSessionId,
      callSessionRepository,
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });

  const createCall = createCallSessionCreator({
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
  });

  const getAgendaForSession = async ({
    callSessionId,
    workspaceId,
  }: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }): Promise<CallAgenda> => {
    const session = await getSession({ callSessionId, workspaceId });
    const { linkedSlackUser, userProfile, workspace } =
      await getWorkspaceForUser({
        userId: session.userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
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

    return buildCallAgenda({
      blocks,
      channels,
      language: workspace.language,
      now: clock.now(),
      ...(session.focusTaskId === undefined
        ? {}
        : { focusTaskId: session.focusTaskId }),
      purpose: session.purpose,
      slackUserId: linkedSlackUser.slackUserId,
      ...(userProfile.displayName === undefined
        ? {}
        : { speakerName: userProfile.displayName }),
      reviewStates,
      tasks,
      timezone: workspace.timezone,
    });
  };

  const createScheduledReviewCall = (params: {
    readonly schedule: import('@exe/domain').CallSchedule;
    readonly scheduledRunAt?: string;
  }): Promise<CallSessionWithAgenda> =>
    getOrCreateScheduledReviewCall({
      callSessionRepository,
      createCall,
      getAgendaForSession,
      getSession,
      ...params,
    });

  const transitionCall = async ({
    callSessionId,
    status,
    workspaceId,
  }: {
    readonly callSessionId: string;
    readonly status: CallStatus;
    readonly workspaceId: string;
  }): Promise<CallSession> => {
    const session = await getSession({ callSessionId, workspaceId });
    const now = clock.now();

    if (!canTransitionCallStatus({ from: session.status, to: status })) {
      throw invalidRequestError(
        `Cannot transition call session from ${session.status} to ${status}.`
      );
    }

    const nextSession = callSessionSchema.parse({
      ...session,
      ...(status === 'active' && session.startedAt === undefined
        ? { startedAt: now }
        : {}),
      ...getEndedAtPatch({ now, session, status }),
      status,
      updatedAt: now,
    });

    await callSessionRepository.update({ session: nextSession });

    if (shouldAdvanceScheduleForStatus(status)) {
      await advanceScheduleForSession({
        callScheduleRepository,
        now,
        session: nextSession,
      });
    }

    return nextSession;
  };

  const recordEvent = async ({
    callSessionId,
    payload,
    type,
    workspaceId,
  }: {
    readonly callSessionId: string;
    readonly payload: CallEventPayload;
    readonly type: CallEventType;
    readonly workspaceId: string;
  }): Promise<CallEvent> => {
    await getSession({ callSessionId, workspaceId });
    const event = callEventSchema.parse({
      callSessionId,
      createdAt: clock.now(),
      id: idGenerator.generateId(),
      payload,
      type,
      workspaceId,
    });

    await callEventRepository.create({ event });

    return event;
  };

  const listEvents = async ({
    callSessionId,
    workspaceId,
  }: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }): Promise<readonly CallEvent[]> => {
    await getSession({ callSessionId, workspaceId });

    return callEventRepository.listByCallSessionId({
      callSessionId,
      workspaceId,
    });
  };

  return {
    activateCall: ({ callSessionId, workspaceId }): Promise<CallSession> =>
      transitionCall({ callSessionId, status: 'active', workspaceId }),
    createManualReviewCall: async ({
      focusTaskId,
      mode = 'auto',
      userId,
      workspaceId,
    }): Promise<CallSessionWithAgenda> => {
      const schedule = await findManualScheduledRun({
        callScheduleRepository,
        clock,
        mode,
        userId,
        workspaceId,
      });

      if (schedule === null) {
        return createCall({
          ...(focusTaskId === undefined ? {} : { focusTaskId }),
          purpose: 'manual_review',
          userId,
          workspaceId,
        });
      }

      const { session } = await createScheduledReviewCall({
        schedule,
      });
      const activeSession =
        session.status === 'created'
          ? await transitionCall({
              callSessionId: session.id,
              status: 'active',
              workspaceId: session.workspaceId,
            })
          : session;

      return {
        agenda: await getAgendaForSession({
          callSessionId: activeSession.id,
          workspaceId: activeSession.workspaceId,
        }),
        session: activeSession,
      };
    },
    createScheduledReviewCall,
    getAgendaForSession,
    getById: getSession,
    getForUser: ({
      callSessionId,
      userId,
      workspaceId,
    }): Promise<CallSession> =>
      getSessionForUser({ callSessionId, userId, workspaceId }),
    listEvents,
    listEventsForUser: async ({
      callSessionId,
      userId,
      workspaceId,
    }): Promise<readonly CallEvent[]> => {
      await getSessionForUser({ callSessionId, userId, workspaceId });

      return listEvents({ callSessionId, workspaceId });
    },
    recordEvent,
    recordEventForUser: async ({
      callSessionId,
      payload,
      type,
      userId,
      workspaceId,
    }): Promise<CallEvent> => {
      const { linkedSlackUser, workspace } = await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });
      const session = await getSession({ callSessionId, workspaceId });

      if (session.userId !== userId) {
        throw forbiddenError(
          'Call session does not belong to the current user.'
        );
      }

      await assertUserCallEventAuthorized({
        channelRepository,
        channelVisibility,
        payload,
        slackUserId: linkedSlackUser.slackUserId,
        taskRepository,
        type,
        workspace,
      });

      return recordEvent({ callSessionId, payload, type, workspaceId });
    },
    transitionCall,
    transitionCallForUser: async ({
      callSessionId,
      status,
      userId,
      workspaceId,
    }): Promise<CallSession> => {
      await getSessionForUser({ callSessionId, userId, workspaceId });

      return transitionCall({ callSessionId, status, workspaceId });
    },
  };
};
