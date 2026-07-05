import type {
  ChannelRepository,
  Clock,
  OverdueTaskNotificationRepository,
  SlackGateway,
  TaskRepository,
  WorkspaceRepository,
} from '#server/ports';
import { syncChannelAssigneesForTaskBestEffort } from './channel-assignee-sync';
import { publishSlackAppHome, type SlackAppHomeDeps } from './slack-app-home';
import { withSlackBotToken } from './slack-bot-token';
import { deleteSlackOverdueTaskNotifications } from './slack-overdue-task-notifications';
import {
  buildUpdatedTask,
  resolveSubmittedDueAt,
  updateSlackTaskMessage,
} from './slack-task-edit-helpers';
import {
  canManageWorkspaceSettings,
  isWorkTask,
  type WorkTask,
  type Workspace,
} from '@exe/domain';
import {
  buildEditTaskModal,
  parseEditTaskModalPrivateMetadata,
  parseEditTaskSubmissionValues,
  parseTaskOverflowActionValue,
  slackActionIds,
  slackViewIds,
  taskOverflowActions,
} from '@exe/slack';

interface SlackTaskEditDeps {
  readonly appHomeDeps: SlackAppHomeDeps;
  readonly channelRepository: ChannelRepository;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly overdueTaskNotificationRepository: OverdueTaskNotificationRepository;
  readonly slackGateway: SlackGateway;
  readonly taskRepository: TaskRepository;
  readonly workspaceRepository: WorkspaceRepository;
}

interface TaskEditTarget {
  readonly taskId: string;
}

const getSubmittedUsersOrFallback = ({
  fallback,
  values,
}: {
  readonly fallback: readonly string[];
  readonly values: readonly string[];
}): readonly string[] => (values.length === 0 ? fallback : values);

const resolveEditTarget = ({
  actionId,
  selectedOptionValue,
  value,
}: {
  readonly actionId: string;
  readonly selectedOptionValue?: string;
  readonly value?: string;
}): TaskEditTarget | null => {
  if (actionId === slackActionIds.editTask && value !== undefined) {
    return { taskId: value };
  }

  if (selectedOptionValue === undefined) {
    return null;
  }

  const parsed = parseTaskOverflowActionValue(selectedOptionValue);

  return parsed?.action === taskOverflowActions.edit
    ? { taskId: parsed.taskId }
    : null;
};

const canEditTask = ({
  slackUserId,
  task,
  workspace,
}: {
  readonly slackUserId: string;
  readonly task: WorkTask;
  readonly workspace: Workspace;
}): boolean =>
  task.assigneeSlackUserIds.includes(slackUserId) ||
  task.requesterSlackUserIds.includes(slackUserId) ||
  canManageWorkspaceSettings({ slackUserId, workspace });

export const openSlackTaskEditModal = async ({
  actionId,
  deps,
  selectedOptionValue,
  slackTeamId,
  slackUserId,
  triggerId,
  value,
}: {
  readonly actionId: string;
  readonly deps: SlackTaskEditDeps;
  readonly selectedOptionValue?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly triggerId?: string;
  readonly value?: string;
}): Promise<void> => {
  if (triggerId === undefined) {
    return;
  }

  const target = resolveEditTarget({
    actionId,
    ...(selectedOptionValue === undefined ? {} : { selectedOptionValue }),
    ...(value === undefined ? {} : { value }),
  });

  if (target === null) {
    return;
  }

  const [workspace, task] = await Promise.all([
    deps.workspaceRepository.getById({ workspaceId: slackTeamId }),
    deps.taskRepository.getById({
      taskId: target.taskId,
      workspaceId: slackTeamId,
    }),
  ]);

  if (
    workspace === null ||
    task === null ||
    !isWorkTask(task) ||
    !canEditTask({ slackUserId, task, workspace })
  ) {
    return;
  }

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.openView({
        botToken,
        triggerId,
        view: buildEditTaskModal({
          language: workspace.language,
          task,
          timezone: workspace.timezone,
        }),
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

export const saveSlackTaskEditModal = async ({
  callbackId,
  deps,
  privateMetadata,
  slackTeamId,
  slackUserId,
  stateValues,
}: {
  readonly callbackId: string;
  readonly deps: SlackTaskEditDeps;
  readonly privateMetadata?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly stateValues: unknown;
}): Promise<void> => {
  if (callbackId !== slackViewIds.taskEdit || privateMetadata === undefined) {
    return;
  }

  const metadata = parseEditTaskModalPrivateMetadata(privateMetadata);
  const values = parseEditTaskSubmissionValues(stateValues);

  if (metadata === null || values.title === null) {
    return;
  }

  const [workspace, task] = await Promise.all([
    deps.workspaceRepository.getById({ workspaceId: slackTeamId }),
    deps.taskRepository.getById({
      taskId: metadata.taskId,
      workspaceId: slackTeamId,
    }),
  ]);

  if (
    workspace === null ||
    task === null ||
    !isWorkTask(task) ||
    !canEditTask({ slackUserId, task, workspace })
  ) {
    return;
  }

  const dueAtResolution = resolveSubmittedDueAt({
    dueDate: values.dueDate,
    dueTime: values.dueTime,
    timezone: workspace.timezone,
  });

  if (dueAtResolution.status === 'invalid') {
    return;
  }

  const previousDueAt = task.dueAt;
  const updatedTask = buildUpdatedTask({
    assigneeSlackUserIds: getSubmittedUsersOrFallback({
      fallback: task.assigneeSlackUserIds,
      values: values.assigneeSlackUserIds,
    }),
    dueAt: dueAtResolution.dueAt,
    now: deps.clock.now(),
    requesterSlackUserIds: getSubmittedUsersOrFallback({
      fallback: task.requesterSlackUserIds,
      values: values.requesterSlackUserIds,
    }),
    task,
    title: values.title,
  });

  await deps.taskRepository.update({ task: updatedTask });
  await syncChannelAssigneesForTaskBestEffort({
    channelRepository: deps.channelRepository,
    clock: deps.clock,
    previousTask: task,
    task: updatedTask,
  });
  await Promise.all([
    updateSlackTaskMessage({
      deps,
      ...(previousDueAt === undefined ? {} : { previousDueAt }),
      task: updatedTask,
      workspace,
    }),
    publishSlackAppHome({ deps: deps.appHomeDeps, slackTeamId, slackUserId }),
    deleteSlackOverdueTaskNotifications({
      deps,
      taskId: updatedTask.id,
      workspaceId: updatedTask.workspaceId,
    }),
  ]);
};
