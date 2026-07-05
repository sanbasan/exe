/* eslint-disable max-lines -- Notification gateway wiring keeps all outbound notification methods in one adapter. */
import type {
  Clock,
  NotificationGateway,
  SlackGateway,
  SlackMessageReference,
  WorkspaceRepository,
} from '#server/ports';
import { updateSlackChannelBlockMessage } from '#server/services/slack-channel-block-message';
import { buildSignedScheduledCallRunValue } from '#server/utils/slack-scheduled-call-run-value';
import { sendIncomingCallVoipPushes, type ApnsConfig } from './apns';
import { sendChannelBlocksCreatedFromCall as sendSlackChannelBlocksCreatedFromCall } from './channel-block-created-from-call';
import { getPrenotificationMessage, getScheduledCallDueMessage } from './copy';
import {
  sendMeetingTasksCreated as sendSlackMeetingTasksCreated,
  sendTaskCardToChannel as sendSlackTaskCardToChannel,
  sendTaskDependencyNotices as sendSlackTaskDependencyNotices,
} from './meeting-notifications';
import { sendSlackDirectMessage } from './slack';
import { sendTasksCreatedFromCall as sendSlackTasksCreatedFromCall } from './task-created-from-call';
import {
  sendOverdueTaskNotification as sendOverdueTaskSlackNotification,
  sendTaskPatchThreadNotice as sendSlackTaskPatchThreadNotice,
} from './task-notifications';
import {
  type CallSession,
  type DeviceToken,
  type Task,
  type Workspace,
} from '@exe/domain';
import {
  buildCallSummaryBlocks,
  buildCallSummaryFallbackText,
  buildFollowUpAnswerBlocks,
  buildFollowUpAnswerFallbackText,
  buildMissedCallBlocks,
  buildMissedCallFallbackText,
  buildScheduledCallRunBlocks,
} from '@exe/slack';

// Shown as the CallKit caller name on the incoming-call screen; without it
// iOS falls back to a generic title.
const incomingCallTitle = ({
  session,
  workspace,
}: {
  readonly session: CallSession;
  readonly workspace: Workspace;
}): string | undefined => {
  if (session.trigger === 'blocker') {
    return workspace.language === 'ja'
      ? 'ブロッカー確認の電話'
      : 'Blocker check-in';
  }

  if (session.trigger === 'overload') {
    return workspace.language === 'ja'
      ? 'タスク負荷の相談'
      : 'Workload check-in';
  }

  return undefined;
};

const selectTokens = ({
  kind,
  tokens,
}: {
  readonly kind: DeviceToken['kind'];
  readonly tokens: readonly DeviceToken[];
}): readonly DeviceToken[] => tokens.filter((token) => token.kind === kind);

export const dedupeDeviceTokens = (
  tokens: readonly DeviceToken[]
): readonly DeviceToken[] =>
  tokens.filter(
    (token, index) =>
      tokens.findIndex((candidate) => candidate.token === token.token) === index
  );

const selectUniqueTokens = ({
  kind,
  tokens,
}: {
  readonly kind: DeviceToken['kind'];
  readonly tokens: readonly DeviceToken[];
}): readonly DeviceToken[] =>
  dedupeDeviceTokens(selectTokens({ kind, tokens }));

const buildAppUrl = ({
  appUrl,
  path,
}: {
  readonly appUrl: string;
  readonly path: string;
}): string => new URL(path, appUrl).toString();

const buildCallAppUrl = ({
  appUrl,
  session,
}: {
  readonly appUrl: string;
  readonly session: CallSession;
}): string =>
  buildAppUrl({
    appUrl,
    path: `/workspaces/${session.workspaceId}/calls/${session.id}`,
  });

const buildWorkspaceAppUrl = ({
  appUrl,
  workspaceId,
}: {
  readonly appUrl: string;
  readonly workspaceId: string;
}): string =>
  buildAppUrl({
    appUrl,
    path: `/workspaces/${workspaceId}`,
  });

const buildTaskAppUrl = ({
  appUrl,
  task,
}: {
  readonly appUrl: string;
  readonly task: Task;
}): string =>
  buildAppUrl({
    appUrl,
    path: `/workspaces/${task.workspaceId}/tasks/${task.id}`,
  });

const buildScheduledCallRunDmBlocks = ({
  appUrl,
  encryptionKey,
  language,
  message,
  session,
  targetRunAt,
}: {
  readonly appUrl: string;
  readonly encryptionKey?: string;
  readonly language: 'en' | 'ja';
  readonly message: string;
  readonly session: CallSession;
  readonly targetRunAt: string;
}): ReturnType<typeof buildScheduledCallRunBlocks> => {
  // A scheduled-review run always carries its schedule id; fall back to the
  // session id only to keep the type total (the reschedule actions need a
  // schedule to advance, and non-scheduled sessions never reach this path).
  const callScheduleId = session.callScheduleId ?? session.id;

  return buildScheduledCallRunBlocks({
    joinUrl: buildCallAppUrl({ appUrl, session }),
    language,
    message,
    reference: buildSignedScheduledCallRunValue({
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      payload: {
        callScheduleId,
        scheduledRunAt: targetRunAt,
        workspaceId: session.workspaceId,
      },
    }),
  });
};

const sendScheduledCallRunDm = ({
  appUrl,
  clock,
  encryptionKey,
  message,
  session,
  slackGateway,
  slackUserId,
  targetRunAt,
  workspace,
  workspaceRepository,
}: {
  readonly appUrl: string;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly message: string;
  readonly session: CallSession;
  readonly slackGateway: SlackGateway;
  readonly slackUserId: string;
  readonly targetRunAt: string;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<SlackMessageReference> =>
  sendSlackDirectMessage({
    blocks: buildScheduledCallRunDmBlocks({
      appUrl,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      language: workspace.language,
      message,
      session,
      targetRunAt,
    }),
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    slackGateway,
    slackUserId,
    text: message,
    workspace,
    workspaceRepository,
  });

export const createNotificationGateway = ({
  apns,
  appUrl,
  clock,
  encryptionKey,
  slackGateway,
  workspaceRepository,
}: {
  readonly apns: ApnsConfig;
  readonly appUrl: string;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}): NotificationGateway => ({
  sendCallPrenotification: ({
    schedule,
    session,
    slackUserId,
    targetRunAt,
    workspace,
  }): Promise<SlackMessageReference> =>
    sendScheduledCallRunDm({
      appUrl,
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      message: getPrenotificationMessage(workspace.language)({
        schedule,
        timezone: workspace.timezone,
      }),
      session,
      slackGateway,
      slackUserId,
      targetRunAt,
      workspace,
      workspaceRepository,
    }),
  sendCallSummary: ({
    channelUpdates,
    overview,
    slackUserId,
    workspace,
  }): Promise<void> => {
    const updates = channelUpdates ?? [];

    return sendSlackDirectMessage({
      blocks: buildCallSummaryBlocks({
        language: workspace.language,
        ...(overview === undefined ? {} : { overview }),
        timezone: workspace.timezone,
        updates,
      }),
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      slackGateway,
      slackUserId,
      text: buildCallSummaryFallbackText({
        language: workspace.language,
        ...(overview === undefined ? {} : { overview }),
        updates,
      }),
      workspace,
      workspaceRepository,
    }).then((): void => undefined);
  },
  sendChannelBlocksCreatedFromCall: ({
    blocks,
    channelId,
    sessionStartedAt,
    speakerSlackUserId,
    workspace,
  }) =>
    sendSlackChannelBlocksCreatedFromCall({
      blocks,
      channelId,
      deps: {
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        slackGateway,
        workspaceRepository,
      },
      sessionStartedAt,
      speakerSlackUserId,
      workspace,
    }),
  sendFollowUpAnswer: ({
    requesterSlackUserId,
    task,
    workspace,
  }): Promise<void> =>
    sendSlackDirectMessage({
      blocks: buildFollowUpAnswerBlocks({
        language: workspace.language,
        task,
        taskUrl: buildTaskAppUrl({ appUrl, task }),
      }),
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      slackGateway,
      slackUserId: requesterSlackUserId,
      text: buildFollowUpAnswerFallbackText({
        language: workspace.language,
        task,
      }),
      workspace,
      workspaceRepository,
    }).then((): void => undefined),
  sendIncomingCall: ({
    session,
    tokens,
    workspace,
  }): Promise<readonly string[]> => {
    const title = incomingCallTitle({ session, workspace });

    return sendIncomingCallVoipPushes({
      config: apns,
      session,
      ...(title === undefined ? {} : { title }),
      tokens: selectUniqueTokens({ kind: 'voip', tokens }),
    });
  },
  sendMeetingTasksCreated: ({ channelId, meetingTitle, tasks, workspace }) =>
    sendSlackMeetingTasksCreated({
      channelId,
      deps: {
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        slackGateway,
        workspaceRepository,
      },
      meetingTitle,
      tasks,
      workspace,
    }),
  sendMissedCallNotice: ({ session, slackUserId, workspace }): Promise<void> =>
    sendSlackDirectMessage({
      blocks: buildMissedCallBlocks({
        appUrl: buildWorkspaceAppUrl({
          appUrl,
          workspaceId: session.workspaceId,
        }),
        language: workspace.language,
      }),
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      slackGateway,
      slackUserId,
      text: buildMissedCallFallbackText({ language: workspace.language }),
      workspace,
      workspaceRepository,
    }).then((): void => undefined),
  sendOverdueTaskNotification: ({ task, workspace }) =>
    sendOverdueTaskSlackNotification({
      deps: {
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        slackGateway,
        workspaceRepository,
      },
      task,
      workspace,
    }),
  sendScheduledCallDueNotification: ({
    schedule,
    session,
    slackUserId,
    targetRunAt,
    workspace,
  }): Promise<SlackMessageReference> =>
    sendScheduledCallRunDm({
      appUrl,
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      message: getScheduledCallDueMessage(workspace.language)({
        schedule,
        timezone: workspace.timezone,
      }),
      session,
      slackGateway,
      slackUserId,
      targetRunAt,
      workspace,
      workspaceRepository,
    }),
  sendTaskCardToChannel: ({ channelId, task, workspace }) =>
    sendSlackTaskCardToChannel({
      channelId,
      deps: {
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        slackGateway,
        workspaceRepository,
      },
      task,
      workspace,
    }),
  sendTaskDependencyNotices: ({
    blockedTitle,
    blockerTitle,
    targets,
    workspace,
  }) =>
    sendSlackTaskDependencyNotices({
      blockedTitle,
      blockerTitle,
      deps: {
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        slackGateway,
        workspaceRepository,
      },
      targets,
      workspace,
    }),
  sendTaskPatchThreadNotice: ({
    patch,
    previousTask,
    task,
    workspace,
  }): Promise<void> =>
    sendSlackTaskPatchThreadNotice({
      deps: {
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        slackGateway,
        workspaceRepository,
      },
      patch,
      previousTask,
      task,
      workspace,
    }),
  sendTasksCreatedFromCall: ({
    channelId,
    sessionStartedAt,
    speakerSlackUserId,
    tasks,
    workspace,
  }) =>
    sendSlackTasksCreatedFromCall({
      channelId,
      deps: {
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        slackGateway,
        workspaceRepository,
      },
      sessionStartedAt,
      speakerSlackUserId,
      tasks,
      workspace,
    }),
  updateChannelBlockMessage: ({ block, deleted, workspace }): Promise<void> =>
    updateSlackChannelBlockMessage({
      block,
      clock,
      ...(deleted === undefined ? {} : { deleted }),
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      slackGateway,
      workspace,
      workspaceRepository,
    }),
});
