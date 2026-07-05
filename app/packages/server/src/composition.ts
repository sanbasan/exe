/* eslint-disable max-lines -- Server composition wires all services, repositories, gateways, and workflows together. */
import type { GBrainQueryGateway } from '#server/infrastructure/gbrain/gbrain-query-gateway';
import type {
  AuthGateway,
  CallEventRepository,
  CallNotificationRepository,
  CallScheduleRepository,
  CallSessionRepository,
  ChannelBlockRepository,
  ChannelEventRepository,
  ChannelRepository,
  ChannelReviewStateRepository,
  Clock,
  DeviceTokenRepository,
  EmailGateway,
  GBrainAdminGateway,
  GBrainIngestGateway,
  IdGenerator,
  LiveKitGateway,
  LiveKitVmGateway,
  MeetingRepository,
  NotificationGateway,
  OverdueTaskNotificationRepository,
  SignInCodeRepository,
  SlackGateway,
  SlackMemberIndexRepository,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import {
  createAuthService,
  createCallScheduleService,
  createCallSessionService,
  createChannelService,
  createChannelVisibilityService,
  createDeviceTokenService,
  createLiveKitTokenService,
  createMeetingService,
  createSlackService,
  createTaskGraphService,
  createTaskService,
  createWorkspaceService,
  type AppReviewSignInConfig,
  type AuthService,
  type CallLatestInfoComposer,
  type CallOverviewComposer,
  type CallProseComposer,
  type CallScheduleService,
  type CallSessionService,
  type ChannelService,
  type ChannelLatestInfoSynthesizer,
  type ChannelVisibilityService,
  type DeviceTokenService,
  type LiveKitTokenService,
  type MeetingComposer,
  type MeetingService,
  type SlackService,
  type TaskGraphService,
  type TaskService,
  type WorkspaceService,
} from '#server/services';
import type { HandoffComposer } from '#server/services/handoff-composer';
import { reportServerError } from '#server/utils';
import {
  finalizeEndedCalls,
  notifyMissedCalls,
  notifyOverdueTasks,
  sendCallPrenotifications,
  sendScheduledCallDueNotifications,
  sleepIdleLiveKitVm,
  startOverloadCalls,
  startScheduledCalls,
} from '#server/workflows';
import type { CallWorkflowDeps } from '#server/workflows/deps';

export interface ServerCompositionDeps {
  readonly appUrl: string;
  readonly appReviewSignIn?: AppReviewSignInConfig;
  readonly authGateway: AuthGateway;
  readonly callEventRepository: CallEventRepository;
  readonly callLatestInfoComposer: CallLatestInfoComposer;
  readonly callNotificationRepository: CallNotificationRepository;
  readonly callOverviewComposer: CallOverviewComposer;
  readonly callProseComposer: CallProseComposer;
  readonly callScheduleRepository: CallScheduleRepository;
  readonly callSessionRepository: CallSessionRepository;
  readonly channelBlockRepository: ChannelBlockRepository;
  readonly channelEventRepository: ChannelEventRepository;
  readonly channelLatestInfoSynthesizer: ChannelLatestInfoSynthesizer;
  readonly channelRepository: ChannelRepository;
  readonly channelReviewStateRepository: ChannelReviewStateRepository;
  readonly clock: Clock;
  readonly deviceTokenRepository: DeviceTokenRepository;
  readonly emailGateway: EmailGateway;
  readonly gbrainAdminGateway: GBrainAdminGateway;
  readonly gbrainIngestGateway: GBrainIngestGateway;
  readonly gbrainQueryGateway: GBrainQueryGateway;
  readonly handoffComposer: HandoffComposer;
  readonly idGenerator: IdGenerator;
  readonly encryptionKey?: string;
  readonly meetingComposer: MeetingComposer;
  readonly meetingRepository: MeetingRepository;
  readonly liveKitAgentName: string;
  readonly liveKitGateway: LiveKitGateway;
  readonly liveKitRoomNamePrefix: string;
  readonly liveKitVmAutoStopEnabled: boolean;
  readonly liveKitVmGateway: LiveKitVmGateway;
  readonly liveKitVmIdleGraceMinutes: number;
  readonly notificationGateway: NotificationGateway;
  readonly overdueTaskNotificationRepository: OverdueTaskNotificationRepository;
  readonly signInCodeRepository: SignInCodeRepository;
  readonly slackGateway: SlackGateway;
  readonly slackMemberIndexRepository: SlackMemberIndexRepository;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}

export interface ServerServices {
  readonly auth: AuthService;
  readonly callSchedule: CallScheduleService;
  readonly callSession: CallSessionService;
  readonly channel: ChannelService;
  readonly channelVisibility: ChannelVisibilityService;
  readonly deviceToken: DeviceTokenService;
  readonly latestInfoComposer: CallLatestInfoComposer;
  readonly liveKitToken: LiveKitTokenService;
  readonly meeting: MeetingService;
  readonly proseComposer: CallProseComposer;
  readonly slack: SlackService;
  readonly task: TaskService;
  readonly taskGraph: TaskGraphService;
  readonly workspace: WorkspaceService;
}

export interface ServerWorkflows {
  readonly finalizeEndedCalls: () => Promise<void>;
  readonly notifyMissedCalls: () => Promise<void>;
  readonly notifyOverdueTasks: (params: {
    readonly at: string;
  }) => Promise<void>;
  readonly sendCallPrenotifications: (params: {
    readonly at: string;
  }) => Promise<void>;
  readonly sendScheduledCallDueNotifications: (params: {
    readonly at: string;
  }) => Promise<void>;
  readonly sleepIdleLiveKitVm: () => Promise<void>;
  readonly startOverloadCalls: (params: {
    readonly at: string;
  }) => Promise<void>;
  readonly startScheduledCalls: (params: {
    readonly at: string;
  }) => Promise<void>;
}

export interface ServerComposition {
  readonly services: ServerServices;
  readonly workflows: ServerWorkflows;
}

const createWorkflowDeps = ({
  callSessionService,
  channelService,
  deps,
}: {
  readonly callSessionService: CallSessionService;
  readonly channelService: ChannelService;
  readonly deps: ServerCompositionDeps;
}): CallWorkflowDeps => ({
  callEventRepository: deps.callEventRepository,
  callNotificationRepository: deps.callNotificationRepository,
  callOverviewComposer: deps.callOverviewComposer,
  callScheduleRepository: deps.callScheduleRepository,
  callSessionRepository: deps.callSessionRepository,
  callSessionService,
  channelBlockRepository: deps.channelBlockRepository,
  channelEventRepository: deps.channelEventRepository,
  channelLatestInfoSynthesizer: deps.channelLatestInfoSynthesizer,
  channelRepository: deps.channelRepository,
  channelReviewStateRepository: deps.channelReviewStateRepository,
  channelService,
  clock: deps.clock,
  deviceTokenRepository: deps.deviceTokenRepository,
  ...(deps.encryptionKey === undefined
    ? {}
    : { encryptionKey: deps.encryptionKey }),
  errorReporter: { report: reportServerError },
  gbrainIngestGateway: deps.gbrainIngestGateway,
  gbrainQueryGateway: deps.gbrainQueryGateway,
  handoffComposer: deps.handoffComposer,
  idGenerator: deps.idGenerator,
  liveKitVmAutoStopEnabled: deps.liveKitVmAutoStopEnabled,
  liveKitVmGateway: deps.liveKitVmGateway,
  liveKitVmIdleGraceMinutes: deps.liveKitVmIdleGraceMinutes,
  notificationGateway: deps.notificationGateway,
  overdueTaskNotificationRepository: deps.overdueTaskNotificationRepository,
  slackGateway: deps.slackGateway,
  taskRepository: deps.taskRepository,
  userProfileRepository: deps.userProfileRepository,
  workspaceRepository: deps.workspaceRepository,
});

export const createServerComposition = (
  deps: ServerCompositionDeps
): ServerComposition => {
  const auth = createAuthService({
    ...(deps.appReviewSignIn === undefined
      ? {}
      : { appReviewSignIn: deps.appReviewSignIn }),
    authGateway: deps.authGateway,
    clock: deps.clock,
    emailGateway: deps.emailGateway,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    idGenerator: deps.idGenerator,
    signInCodeRepository: deps.signInCodeRepository,
    slackGateway: deps.slackGateway,
    slackMemberIndexRepository: deps.slackMemberIndexRepository,
    userProfileRepository: deps.userProfileRepository,
    workspaceRepository: deps.workspaceRepository,
  });
  const channelVisibility = createChannelVisibilityService({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    slackGateway: deps.slackGateway,
    workspaceRepository: deps.workspaceRepository,
  });
  const callSession = createCallSessionService({
    callEventRepository: deps.callEventRepository,
    callScheduleRepository: deps.callScheduleRepository,
    callSessionRepository: deps.callSessionRepository,
    channelBlockRepository: deps.channelBlockRepository,
    channelRepository: deps.channelRepository,
    channelReviewStateRepository: deps.channelReviewStateRepository,
    channelVisibility,
    clock: deps.clock,
    idGenerator: deps.idGenerator,
    liveKitGateway: deps.liveKitGateway,
    liveKitRoomNamePrefix: deps.liveKitRoomNamePrefix,
    taskRepository: deps.taskRepository,
    userProfileRepository: deps.userProfileRepository,
    workspaceRepository: deps.workspaceRepository,
  });
  const callSchedule = createCallScheduleService({
    callScheduleRepository: deps.callScheduleRepository,
    clock: deps.clock,
    idGenerator: deps.idGenerator,
    userProfileRepository: deps.userProfileRepository,
    workspaceRepository: deps.workspaceRepository,
  });
  const deviceToken = createDeviceTokenService({
    clock: deps.clock,
    deviceTokenRepository: deps.deviceTokenRepository,
  });
  const liveKitToken = createLiveKitTokenService({
    callSessionRepository: deps.callSessionRepository,
    liveKitAgentName: deps.liveKitAgentName,
    liveKitGateway: deps.liveKitGateway,
    userProfileRepository: deps.userProfileRepository,
    workspaceRepository: deps.workspaceRepository,
  });
  const channel = createChannelService({
    channelBlockRepository: deps.channelBlockRepository,
    channelEventRepository: deps.channelEventRepository,
    channelRepository: deps.channelRepository,
    channelReviewStateRepository: deps.channelReviewStateRepository,
    channelVisibility,
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    idGenerator: deps.idGenerator,
    slackGateway: deps.slackGateway,
    userProfileRepository: deps.userProfileRepository,
    workspaceRepository: deps.workspaceRepository,
  });
  const slack = createSlackService({
    appUrl: deps.appUrl,
    callNotificationRepository: deps.callNotificationRepository,
    callScheduleRepository: deps.callScheduleRepository,
    callSessionRepository: deps.callSessionRepository,
    callSessionService: callSession,
    channelBlockRepository: deps.channelBlockRepository,
    channelVisibility,
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    channelEventRepository: deps.channelEventRepository,
    channelRepository: deps.channelRepository,
    channelReviewStateRepository: deps.channelReviewStateRepository,
    deviceTokenRepository: deps.deviceTokenRepository,
    gbrainAdminGateway: deps.gbrainAdminGateway,
    idGenerator: deps.idGenerator,
    notificationGateway: deps.notificationGateway,
    overdueTaskNotificationRepository: deps.overdueTaskNotificationRepository,
    slackGateway: deps.slackGateway,
    slackMemberIndexRepository: deps.slackMemberIndexRepository,
    taskRepository: deps.taskRepository,
    userProfileRepository: deps.userProfileRepository,
    workspaceRepository: deps.workspaceRepository,
  });
  const task = createTaskService({
    channelRepository: deps.channelRepository,
    channelVisibility,
    clock: deps.clock,
    taskRepository: deps.taskRepository,
    userProfileRepository: deps.userProfileRepository,
    workspaceRepository: deps.workspaceRepository,
  });
  const workspace = createWorkspaceService({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    slackGateway: deps.slackGateway,
    userProfileRepository: deps.userProfileRepository,
    workspaceRepository: deps.workspaceRepository,
  });
  const taskGraph = createTaskGraphService({
    callSessionService: callSession,
    clock: deps.clock,
    deviceTokenRepository: deps.deviceTokenRepository,
    gbrainIngestGateway: deps.gbrainIngestGateway,
    idGenerator: deps.idGenerator,
    notificationGateway: deps.notificationGateway,
    taskRepository: deps.taskRepository,
    userProfileRepository: deps.userProfileRepository,
    workspaceRepository: deps.workspaceRepository,
  });
  const meeting = createMeetingService({
    channelRepository: deps.channelRepository,
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    gbrainIngestGateway: deps.gbrainIngestGateway,
    idGenerator: deps.idGenerator,
    meetingComposer: deps.meetingComposer,
    meetingRepository: deps.meetingRepository,
    notificationGateway: deps.notificationGateway,
    slackGateway: deps.slackGateway,
    taskGraph,
    taskRepository: deps.taskRepository,
    userProfileRepository: deps.userProfileRepository,
    workspaceRepository: deps.workspaceRepository,
  });
  const workflowDeps = createWorkflowDeps({
    callSessionService: callSession,
    channelService: channel,
    deps,
  });

  return {
    services: {
      auth,
      callSchedule,
      callSession,
      channel,
      channelVisibility,
      deviceToken,
      latestInfoComposer: deps.callLatestInfoComposer,
      liveKitToken,
      meeting,
      proseComposer: deps.callProseComposer,
      slack,
      task,
      taskGraph,
      workspace,
    },
    workflows: {
      finalizeEndedCalls: (): Promise<void> =>
        finalizeEndedCalls({ deps: workflowDeps }),
      notifyMissedCalls: (): Promise<void> =>
        notifyMissedCalls({ deps: workflowDeps }),
      notifyOverdueTasks: ({ at }): Promise<void> =>
        notifyOverdueTasks({ at, deps: workflowDeps }),
      sendCallPrenotifications: ({ at }): Promise<void> =>
        sendCallPrenotifications({ at, deps: workflowDeps }),
      sendScheduledCallDueNotifications: ({ at }): Promise<void> =>
        sendScheduledCallDueNotifications({ at, deps: workflowDeps }),
      sleepIdleLiveKitVm: (): Promise<void> =>
        sleepIdleLiveKitVm({ deps: workflowDeps }),
      startOverloadCalls: ({ at }): Promise<void> =>
        startOverloadCalls({ at, deps: workflowDeps }),
      startScheduledCalls: ({ at }): Promise<void> =>
        startScheduledCalls({ at, deps: workflowDeps }),
    },
  };
};
