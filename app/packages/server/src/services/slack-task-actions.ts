import type {
  Clock,
  OverdueTaskNotificationRepository,
  SlackGateway,
  TaskRepository,
  WorkspaceRepository,
} from '#server/ports';
import { publishSlackAppHome, type SlackAppHomeDeps } from './slack-app-home';
import { withSlackBotToken } from './slack-bot-token';
import { deleteSlackOverdueTaskNotifications } from './slack-overdue-task-notifications';
import { buildSlackTaskMessageBlocks } from './slack-task-message-blocks';
import { buildWorkTaskWithStatus, getActionStatus } from './slack-task-utils';
import {
  canManageWorkspaceSettings,
  isWorkTask,
  type TaskStatus,
} from '@exe/domain';
import { parseTaskOverflowActionValue, taskOverflowActions } from '@exe/slack';

interface StatusActionTarget {
  readonly status: TaskStatus;
  readonly taskId: string;
}

const resolveStatusActionTarget = ({
  actionId,
  selectedOptionValue,
  value,
}: {
  readonly actionId: string;
  readonly selectedOptionValue?: string;
  readonly value?: string;
}): StatusActionTarget | null => {
  if (selectedOptionValue !== undefined) {
    const parsed = parseTaskOverflowActionValue(selectedOptionValue);

    if (parsed?.action === taskOverflowActions.cancel) {
      return { status: 'cancelled', taskId: parsed.taskId };
    }

    return null;
  }

  const status = getActionStatus(actionId);

  if (status === null || value === undefined) {
    return null;
  }

  return { status, taskId: value };
};

export const handleSlackTaskStatusAction = async ({
  actionId,
  appHomeDeps,
  clock,
  encryptionKey,
  overdueTaskNotificationRepository,
  selectedOptionValue,
  slackGateway,
  slackTeamId,
  slackUserId,
  taskRepository,
  value,
  workspaceRepository,
}: {
  readonly actionId: string;
  readonly appHomeDeps: SlackAppHomeDeps;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly overdueTaskNotificationRepository: OverdueTaskNotificationRepository;
  readonly selectedOptionValue?: string;
  readonly slackGateway: SlackGateway;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly taskRepository: TaskRepository;
  readonly value?: string;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<void> => {
  const target = resolveStatusActionTarget({
    actionId,
    ...(selectedOptionValue === undefined ? {} : { selectedOptionValue }),
    ...(value === undefined ? {} : { value }),
  });

  if (target === null) {
    return;
  }

  const [workspace, task] = await Promise.all([
    workspaceRepository.getById({ workspaceId: slackTeamId }),
    taskRepository.getById({
      taskId: target.taskId,
      workspaceId: slackTeamId,
    }),
  ]);

  if (workspace === null || task === null || !isWorkTask(task)) {
    return;
  }

  if (
    !task.assigneeSlackUserIds.includes(slackUserId) &&
    !task.requesterSlackUserIds.includes(slackUserId) &&
    !canManageWorkspaceSettings({ slackUserId, workspace })
  ) {
    return;
  }

  const now = clock.now();
  const updatedTask = buildWorkTaskWithStatus({
    now,
    status: target.status,
    task,
  });

  await taskRepository.update({ task: updatedTask });

  const updateMessage = async (): Promise<void> => {
    if (
      updatedTask.channelId === undefined ||
      updatedTask.messageTs === undefined
    ) {
      return;
    }

    const channelId = updatedTask.channelId;
    const messageTs = updatedTask.messageTs;

    await withSlackBotToken({
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      run: async ({ botToken }): Promise<void> => {
        await slackGateway.updateMessage({
          blocks: await buildSlackTaskMessageBlocks({
            botToken,
            language: workspace.language,
            slackGateway,
            task: updatedTask,
            timezone: workspace.timezone,
          }),
          botToken,
          channelId,
          messageTs,
          text: updatedTask.title,
        });
      },
      slackGateway,
      workspace,
      workspaceRepository,
    });
  };

  await Promise.all([
    updateMessage(),
    publishSlackAppHome({ deps: appHomeDeps, slackTeamId, slackUserId }),
    deleteSlackOverdueTaskNotifications({
      deps: {
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        overdueTaskNotificationRepository,
        slackGateway,
        workspaceRepository,
      },
      taskId: updatedTask.id,
      workspaceId: updatedTask.workspaceId,
    }),
  ]);
};
