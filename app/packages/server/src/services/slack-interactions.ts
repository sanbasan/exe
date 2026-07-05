/* eslint-disable max-lines -- Slack interaction dispatcher intentionally keeps all action routing together. */
import type {
  CallNotificationRepository,
  CallSessionRepository,
  CallScheduleRepository,
  ChannelRepository,
  Clock,
  DeviceTokenRepository,
  GBrainAdminGateway,
  NotificationGateway,
  OverdueTaskNotificationRepository,
  SlackGateway,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import type { CallSessionService } from './call-session-service';
import type { SlackAppHomeDeps } from './slack-app-home';
import {
  openSlackCallScheduleSettings,
  saveSlackCallScheduleSettings,
} from './slack-call-schedule-settings';
import { handleSlackChannelBlockResolveAction } from './slack-channel-block-actions';
import {
  openSlackChannelOwnerEditor,
  saveSlackChannelOwnerEditor,
  updateSlackChannelOwnerEditor,
} from './slack-channel-owner-editor';
import {
  openSlackChannelSettings,
  saveSlackChannelSettings,
} from './slack-channel-settings';
import {
  openSlackChannelWatchSettings,
  saveSlackChannelWatchSettings,
} from './slack-channel-watch-settings';
import {
  createSlackGbrainToken,
  openSlackGbrainTokens,
  revokeSlackGbrainToken,
} from './slack-gbrain-connect';
import {
  openSlackManageAdmins,
  saveSlackManageAdmins,
} from './slack-manage-admins';
import { handleSkipScheduledCallRunAction } from './slack-scheduled-call-run-actions';
import {
  handleRescheduleScheduledCallRunAction,
  openScheduledCallRunRescheduleModal,
  saveScheduledCallRunRescheduleModal,
} from './slack-scheduled-call-run-reschedule';
import { handleSlackTaskStatusAction } from './slack-task-actions';
import { handleSlackTaskChangeCallAction } from './slack-task-change-call';
import {
  openSlackTaskEditModal,
  saveSlackTaskEditModal,
} from './slack-task-edit';
import {
  openSlackWorkspaceSettings,
  saveSlackWorkspaceSettings,
} from './slack-workspace-settings';

interface SlackInteractionDeps {
  readonly appHomeDeps: SlackAppHomeDeps;
  readonly callNotificationRepository: CallNotificationRepository;
  readonly callScheduleRepository: CallScheduleRepository;
  readonly callSessionRepository: CallSessionRepository;
  readonly callSessionService: CallSessionService;
  readonly channelRepository: ChannelRepository;
  readonly clock: Clock;
  readonly deviceTokenRepository: DeviceTokenRepository;
  readonly encryptionKey?: string;
  readonly gbrainAdminGateway: GBrainAdminGateway;
  readonly notificationGateway: NotificationGateway;
  readonly overdueTaskNotificationRepository: OverdueTaskNotificationRepository;
  readonly slackGateway: SlackGateway;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}

export interface SlackBlockActionInput {
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
}

export interface SlackViewSubmissionInput {
  readonly callbackId: string;
  readonly privateMetadata?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly stateValues: unknown;
}

interface SlackInteractionHandlers {
  readonly handleBlockAction: (params: SlackBlockActionInput) => Promise<void>;
  readonly handleViewSubmission: (
    params: SlackViewSubmissionInput
  ) => Promise<void>;
}

export const createSlackInteractionHandlers = ({
  appHomeDeps,
  callNotificationRepository,
  callScheduleRepository,
  callSessionRepository,
  callSessionService,
  channelRepository,
  clock,
  deviceTokenRepository,
  encryptionKey,
  gbrainAdminGateway,
  notificationGateway,
  overdueTaskNotificationRepository,
  slackGateway,
  taskRepository,
  userProfileRepository,
  workspaceRepository,
}: SlackInteractionDeps): SlackInteractionHandlers => {
  const channelOwnerEditorDeps = {
    channelRepository,
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    slackGateway,
    workspaceRepository,
  };
  const channelSettingsDeps = {
    channelRepository,
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    slackGateway,
    taskRepository,
    workspaceRepository,
  };
  const taskEditDeps = {
    appHomeDeps,
    channelRepository,
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    overdueTaskNotificationRepository,
    slackGateway,
    taskRepository,
    workspaceRepository,
  };
  const taskChangeCallDeps = {
    callSessionService,
    deviceTokenRepository,
    notificationGateway,
    taskRepository,
    userProfileRepository,
    workspaceRepository,
  };
  const workspaceAdminDeps = {
    appHomeDeps,
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    slackGateway,
    workspaceRepository,
  };
  const gbrainTokensDeps = {
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    gbrainAdminGateway,
    slackGateway,
    workspaceRepository,
  };
  const scheduledCallRunDeps = {
    callNotificationRepository,
    callScheduleRepository,
    callSessionRepository,
    callSessionService,
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    slackGateway,
    userProfileRepository,
    workspaceRepository,
  };

  return {
    handleBlockAction: async ({
      actionId,
      blockId,
      channelId,
      messageTs,
      selectedOptionValue,
      slackTeamId,
      slackUserId,
      triggerId,
      value,
      viewHash,
      viewId,
    }): Promise<void> => {
      const selectedOptionParam =
        selectedOptionValue === undefined ? {} : { selectedOptionValue };
      const triggerParam = triggerId === undefined ? {} : { triggerId };
      const valueParam = value === undefined ? {} : { value };
      const viewHashParam = viewHash === undefined ? {} : { viewHash };
      const viewIdParam = viewId === undefined ? {} : { viewId };

      await openSlackCallScheduleSettings({
        actionId,
        deps: appHomeDeps,
        slackTeamId,
        slackUserId,
        ...triggerParam,
      });

      await openSlackChannelOwnerEditor({
        actionId,
        deps: channelOwnerEditorDeps,
        slackTeamId,
        slackUserId,
        ...triggerParam,
      });

      await openSlackChannelSettings({
        actionId,
        deps: channelSettingsDeps,
        ...selectedOptionParam,
        slackTeamId,
        slackUserId,
        ...triggerParam,
        ...valueParam,
      });

      await updateSlackChannelOwnerEditor({
        actionId,
        deps: channelOwnerEditorDeps,
        ...selectedOptionParam,
        slackTeamId,
        slackUserId,
        ...viewHashParam,
        ...viewIdParam,
      });

      await openSlackManageAdmins({
        actionId,
        deps: workspaceAdminDeps,
        slackTeamId,
        slackUserId,
        ...triggerParam,
      });

      await openSlackWorkspaceSettings({
        actionId,
        deps: workspaceAdminDeps,
        slackTeamId,
        slackUserId,
        ...triggerParam,
      });

      await openSlackGbrainTokens({
        actionId,
        deps: gbrainTokensDeps,
        slackTeamId,
        slackUserId,
        ...triggerParam,
      });

      await createSlackGbrainToken({
        actionId,
        deps: gbrainTokensDeps,
        slackTeamId,
        slackUserId,
        ...viewIdParam,
      });

      await revokeSlackGbrainToken({
        actionId,
        deps: gbrainTokensDeps,
        slackTeamId,
        slackUserId,
        ...valueParam,
        ...viewIdParam,
      });

      await openSlackTaskEditModal({
        actionId,
        deps: taskEditDeps,
        ...selectedOptionParam,
        slackTeamId,
        slackUserId,
        ...triggerParam,
        ...valueParam,
      });

      await handleSlackTaskStatusAction({
        actionId,
        appHomeDeps,
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        ...selectedOptionParam,
        overdueTaskNotificationRepository,
        slackGateway,
        slackTeamId,
        slackUserId,
        taskRepository,
        ...valueParam,
        workspaceRepository,
      });

      await handleSlackChannelBlockResolveAction({
        actionId,
        deps: appHomeDeps,
        slackTeamId,
        slackUserId,
        ...valueParam,
      });

      await handleSlackTaskChangeCallAction({
        actionId,
        deps: taskChangeCallDeps,
        slackTeamId,
        slackUserId,
        ...valueParam,
      });

      await handleSkipScheduledCallRunAction({
        actionId,
        ...(channelId === undefined ? {} : { channelId }),
        deps: scheduledCallRunDeps,
        ...(messageTs === undefined ? {} : { messageTs }),
        slackTeamId,
        slackUserId,
        ...valueParam,
      });

      await handleRescheduleScheduledCallRunAction({
        actionId,
        ...(blockId === undefined ? {} : { blockId }),
        ...(channelId === undefined ? {} : { channelId }),
        deps: scheduledCallRunDeps,
        ...(messageTs === undefined ? {} : { messageTs }),
        ...selectedOptionParam,
        slackTeamId,
        slackUserId,
      });

      await openScheduledCallRunRescheduleModal({
        actionId,
        ...(channelId === undefined ? {} : { channelId }),
        deps: scheduledCallRunDeps,
        ...(messageTs === undefined ? {} : { messageTs }),
        slackTeamId,
        slackUserId,
        ...triggerParam,
        ...valueParam,
      });

      await openSlackChannelWatchSettings({
        actionId,
        deps: appHomeDeps,
        slackTeamId,
        slackUserId,
        ...triggerParam,
        ...valueParam,
      });
    },
    handleViewSubmission: async ({
      callbackId,
      privateMetadata,
      slackTeamId,
      slackUserId,
      stateValues,
    }): Promise<void> => {
      const privateMetadataParam =
        privateMetadata === undefined ? {} : { privateMetadata };

      await saveSlackCallScheduleSettings({
        callbackId,
        deps: appHomeDeps,
        slackTeamId,
        slackUserId,
        stateValues,
      });

      await saveSlackChannelOwnerEditor({
        callbackId,
        deps: channelOwnerEditorDeps,
        ...privateMetadataParam,
        slackTeamId,
        slackUserId,
        stateValues,
      });

      await saveSlackChannelSettings({
        callbackId,
        deps: channelSettingsDeps,
        ...privateMetadataParam,
        slackTeamId,
        slackUserId,
        stateValues,
      });

      await saveSlackManageAdmins({
        callbackId,
        deps: workspaceAdminDeps,
        slackTeamId,
        slackUserId,
        stateValues,
      });

      await saveSlackWorkspaceSettings({
        callbackId,
        deps: workspaceAdminDeps,
        slackTeamId,
        slackUserId,
        stateValues,
      });

      await saveSlackTaskEditModal({
        callbackId,
        deps: taskEditDeps,
        ...privateMetadataParam,
        slackTeamId,
        slackUserId,
        stateValues,
      });

      await saveSlackChannelWatchSettings({
        callbackId,
        deps: appHomeDeps,
        ...privateMetadataParam,
        slackTeamId,
        slackUserId,
        stateValues,
      });

      await saveScheduledCallRunRescheduleModal({
        callbackId,
        deps: scheduledCallRunDeps,
        ...privateMetadataParam,
        slackTeamId,
        slackUserId,
        stateValues,
      });
    },
  };
};
