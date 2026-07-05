import type {
  CallNotificationRepository,
  CallScheduleRepository,
  CallSessionRepository,
  ChannelBlockRepository,
  ChannelEventRepository,
  Clock,
  DeviceTokenRepository,
  GBrainAdminGateway,
  IdGenerator,
  ChannelRepository,
  ChannelReviewStateRepository,
  NotificationGateway,
  OverdueTaskNotificationRepository,
  SlackFile,
  SlackGateway,
  SlackMemberIndexRepository,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import type { CallSessionService } from './call-session-service';
import type { ChannelVisibilityService } from './channel-visibility-service';
import { publishSlackAppHome, type SlackAppHomeDeps } from './slack-app-home';
import { installSlackWorkspace } from './slack-install-workspace';
import { createSlackInteractionHandlers } from './slack-interactions';
import {
  backfillWorkspaceMemberIndex,
  type SlackMemberIndexSyncDeps,
  syncSlackMember,
} from './slack-member-index-sync';
import {
  handleSlackMemberJoinedChannel,
  type SlackMemberJoinedChannelDeps,
} from './slack-member-joined-channel';
import { handleSlackUserMessage } from './slack-user-message';

export interface SlackUserMessageInput {
  readonly botId?: string;
  readonly channelId: string;
  readonly channelType?: string;
  readonly files?: readonly SlackFile[];
  readonly messageTs: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly subtype?: string;
  readonly text: string;
  readonly threadTs?: string;
  readonly type: 'app_mention' | 'message';
}

export interface SlackService {
  readonly backfillWorkspaceMemberIndex: (params: {
    readonly workspaceId: string;
  }) => Promise<void>;
  readonly handleBlockAction: (params: {
    readonly actionId: string;
    readonly blockId?: string;
    readonly channelId?: string;
    readonly messageTs?: string;
    readonly selectedOptionValue?: string;
    readonly slackTeamId: string;
    readonly slackUserId: string;
    readonly triggerId?: string;
    readonly value?: string;
    readonly viewHash?: string;
    readonly viewId?: string;
  }) => Promise<void>;
  readonly handleUserMessage: (params: SlackUserMessageInput) => Promise<void>;
  readonly handleMemberJoinedChannel: (params: {
    readonly channelId: string;
    readonly inviterSlackUserId?: string;
    readonly slackTeamId: string;
    readonly slackUserId: string;
  }) => Promise<void>;
  readonly handleViewSubmission: (params: {
    readonly callbackId: string;
    readonly privateMetadata?: string;
    readonly slackTeamId: string;
    readonly slackUserId: string;
    readonly stateValues: unknown;
  }) => Promise<void>;
  readonly installWorkspace: (params: {
    readonly code: string;
    readonly redirectUri?: string;
  }) => Promise<string>;
  readonly publishAppHome: (params: {
    readonly slackTeamId: string;
    readonly slackUserId: string;
  }) => Promise<void>;
  readonly syncSlackMember: (params: {
    readonly deleted?: boolean;
    readonly email?: string;
    readonly isBot?: boolean;
    readonly slackTeamId: string;
    readonly slackUserId: string;
  }) => Promise<void>;
}

export const createSlackService = ({
  appUrl,
  callNotificationRepository,
  callScheduleRepository,
  callSessionRepository,
  callSessionService,
  channelBlockRepository,
  channelEventRepository,
  channelRepository,
  channelReviewStateRepository,
  channelVisibility,
  clock,
  deviceTokenRepository,
  encryptionKey,
  gbrainAdminGateway,
  idGenerator,
  notificationGateway,
  overdueTaskNotificationRepository,
  slackGateway,
  slackMemberIndexRepository,
  taskRepository,
  userProfileRepository,
  workspaceRepository,
}: {
  readonly appUrl: string;
  readonly callNotificationRepository: CallNotificationRepository;
  readonly callScheduleRepository: CallScheduleRepository;
  readonly callSessionRepository: CallSessionRepository;
  readonly callSessionService: CallSessionService;
  readonly channelBlockRepository: ChannelBlockRepository;
  readonly channelReviewStateRepository: ChannelReviewStateRepository;
  readonly channelVisibility: ChannelVisibilityService;
  readonly clock: Clock;
  readonly deviceTokenRepository: DeviceTokenRepository;
  readonly encryptionKey?: string;
  readonly gbrainAdminGateway: GBrainAdminGateway;
  readonly idGenerator: IdGenerator;
  readonly channelEventRepository: ChannelEventRepository;
  readonly channelRepository: ChannelRepository;
  readonly notificationGateway: NotificationGateway;
  readonly overdueTaskNotificationRepository: OverdueTaskNotificationRepository;
  readonly slackGateway: SlackGateway;
  readonly slackMemberIndexRepository: SlackMemberIndexRepository;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): SlackService => {
  const appHomeDeps: SlackAppHomeDeps = {
    appUrl,
    callScheduleRepository,
    channelBlockRepository,
    channelReviewStateRepository,
    channelVisibility,
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    channelRepository,
    idGenerator,
    slackGateway,
    taskRepository,
    userProfileRepository,
    workspaceRepository,
  };
  const memberIndexDeps: SlackMemberIndexSyncDeps = {
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    slackGateway,
    slackMemberIndexRepository,
    workspaceRepository,
  };
  const memberJoinedChannelDeps: SlackMemberJoinedChannelDeps = {
    channelRepository,
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    slackGateway,
    workspaceRepository,
  };
  const interactionHandlers = createSlackInteractionHandlers({
    appHomeDeps,
    callNotificationRepository,
    callScheduleRepository,
    callSessionRepository,
    callSessionService,
    channelRepository,
    clock,
    deviceTokenRepository,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    gbrainAdminGateway,
    notificationGateway,
    overdueTaskNotificationRepository,
    slackGateway,
    taskRepository,
    userProfileRepository,
    workspaceRepository,
  });

  return {
    backfillWorkspaceMemberIndex: ({ workspaceId }): Promise<void> =>
      backfillWorkspaceMemberIndex({ deps: memberIndexDeps, workspaceId }),
    handleBlockAction: interactionHandlers.handleBlockAction,
    handleMemberJoinedChannel: (params): Promise<void> =>
      handleSlackMemberJoinedChannel({
        channelId: params.channelId,
        deps: memberJoinedChannelDeps,
        ...(params.inviterSlackUserId === undefined
          ? {}
          : { inviterSlackUserId: params.inviterSlackUserId }),
        slackTeamId: params.slackTeamId,
        slackUserId: params.slackUserId,
      }),
    handleUserMessage: (params): Promise<void> =>
      handleSlackUserMessage({
        appUrl,
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        channelEventRepository,
        channelRepository,

        idGenerator,
        params,
        slackGateway,
        taskRepository,
        workspaceRepository,
      }),
    handleViewSubmission: interactionHandlers.handleViewSubmission,
    installWorkspace: ({ code, redirectUri }): Promise<string> =>
      installSlackWorkspace({
        clock,
        code,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        ...(redirectUri === undefined ? {} : { redirectUri }),
        slackGateway,
        workspaceRepository,
      }),
    publishAppHome: ({ slackTeamId, slackUserId }): Promise<void> =>
      publishSlackAppHome({ deps: appHomeDeps, slackTeamId, slackUserId }),
    syncSlackMember: (params): Promise<void> =>
      syncSlackMember({ deps: memberIndexDeps, ...params }),
  };
};
