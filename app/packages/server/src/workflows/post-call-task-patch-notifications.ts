import { notFoundError } from '#server/errors';
import { deleteSlackOverdueTaskNotifications } from '#server/services/slack-overdue-task-notifications';
import { updateSlackTaskMessage } from '#server/services/slack-task-edit-helpers';
import type { CallWorkflowDeps } from './deps';
import {
  isOpenTaskStatus,
  isWorkTask,
  type CallSession,
  type Task,
  type TaskPatch,
  type Workspace,
} from '@exe/domain';

const isDueAtChanged = ({
  previousTask,
  task,
}: {
  readonly previousTask: Task;
  readonly task: Task;
}): boolean =>
  isWorkTask(previousTask) &&
  isWorkTask(task) &&
  previousTask.dueAt !== task.dueAt;

const shouldDeleteOverdueNotifications = ({
  previousTask,
  task,
}: {
  readonly previousTask: Task;
  readonly task: Task;
}): boolean =>
  isWorkTask(task) &&
  (!isOpenTaskStatus(task.status) || isDueAtChanged({ previousTask, task }));

// Rewrite the posted task card so the applied patch (title, assignees, due
// date, status) is visible on the card itself. Best-effort: a Slack failure is
// reported but must not abort the rest of the post-call finalization.
const refreshTaskCardBestEffort = ({
  deps,
  previousTask,
  task,
  workspace,
}: {
  readonly deps: CallWorkflowDeps;
  readonly previousTask: Task;
  readonly task: Task;
  readonly workspace: Workspace;
}): Promise<void> =>
  updateSlackTaskMessage({
    deps: {
      clock: deps.clock,
      ...(deps.encryptionKey === undefined
        ? {}
        : { encryptionKey: deps.encryptionKey }),
      slackGateway: deps.slackGateway,
      workspaceRepository: deps.workspaceRepository,
    },
    ...(isWorkTask(previousTask) && previousTask.dueAt !== undefined
      ? { previousDueAt: previousTask.dueAt }
      : {}),
    task,
    workspace,
  }).catch(async (error: unknown) => {
    await deps.errorReporter
      .report({
        context: { route: 'workflows/finalizeEndedCalls/task-card' },
        error,
      })
      .catch((): void => undefined);
  });

export const notifyPatchApplied = async ({
  deps,
  patch,
  previousTask,
  session,
  task,
}: {
  readonly deps: CallWorkflowDeps;
  readonly patch: TaskPatch;
  readonly previousTask: Task;
  readonly session: CallSession;
  readonly task: Task;
}): Promise<void> => {
  const deleteOverdue = shouldDeleteOverdueNotifications({
    previousTask,
    task,
  })
    ? deleteSlackOverdueTaskNotifications({
        deps: {
          clock: deps.clock,
          ...(deps.encryptionKey === undefined
            ? {}
            : { encryptionKey: deps.encryptionKey }),
          overdueTaskNotificationRepository:
            deps.overdueTaskNotificationRepository,
          slackGateway: deps.slackGateway,
          workspaceRepository: deps.workspaceRepository,
        },
        taskId: task.id,
        workspaceId: task.workspaceId,
      })
    : Promise.resolve();
  const dueAtChanged = isDueAtChanged({ previousTask, task });
  const hasCard = task.channelId !== undefined && task.messageTs !== undefined;

  if (!dueAtChanged && !hasCard) {
    await deleteOverdue;
    return;
  }

  const workspace = await deps.workspaceRepository.getById({
    workspaceId: session.workspaceId,
  });

  if (workspace === null) {
    throw notFoundError(`Workspace ${session.workspaceId} was not found.`);
  }

  await Promise.all([
    ...(hasCard
      ? [refreshTaskCardBestEffort({ deps, previousTask, task, workspace })]
      : []),
    ...(dueAtChanged
      ? [
          deps.notificationGateway.sendTaskPatchThreadNotice({
            patch,
            previousTask,
            task,
            workspace,
          }),
        ]
      : []),
    deleteOverdue,
  ]);
};
