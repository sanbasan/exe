import type { CallWorkflowDeps } from './deps';
import {
  isOpenTaskStatus,
  isWorkTask,
  overdueTaskNotificationSchema,
  type Task,
  type WorkTask,
  type Workspace,
} from '@exe/domain';

const OVERDUE_NOTIFICATION_INTERVAL_MS = 23 * 60 * 60 * 1000 + 30 * 60 * 1000;

const parseNumber = (value: string): number => {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return parsed;
};

const getPartValue = ({
  parts,
  type,
}: {
  readonly parts: readonly Intl.DateTimeFormatPart[];
  readonly type: Intl.DateTimeFormatPartTypes;
}): string => parts.find((part) => part.type === type)?.value ?? '';

const toSortableLocalDateTime = ({
  isoDateTime,
  timezone,
}: {
  readonly isoDateTime: string;
  readonly timezone: string;
}): string | null => {
  const date = new Date(isoDateTime);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(date);
  const year = getPartValue({ parts, type: 'year' });
  const month = getPartValue({ parts, type: 'month' });
  const day = getPartValue({ parts, type: 'day' });
  const hour = getPartValue({ parts, type: 'hour' });
  const minute = getPartValue({ parts, type: 'minute' });

  parseNumber(year);
  parseNumber(month);
  parseNumber(day);
  parseNumber(hour);
  parseNumber(minute);

  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const isTaskOverdue = ({
  at,
  task,
  timezone,
}: {
  readonly at: string;
  readonly task: WorkTask;
  readonly timezone: string;
}): boolean => {
  if (task.dueAt === undefined) {
    return false;
  }

  const dueAt = toSortableLocalDateTime({
    isoDateTime: task.dueAt,
    timezone,
  });
  const now = toSortableLocalDateTime({ isoDateTime: at, timezone });

  return dueAt !== null && now !== null && dueAt < now;
};

const isNotifiedWithinInterval = ({
  at,
  notificationCreatedAt,
}: {
  readonly at: string;
  readonly notificationCreatedAt: string;
}): boolean => {
  const atMs = new Date(at).getTime();
  const createdAtMs = new Date(notificationCreatedAt).getTime();

  if (Number.isNaN(atMs) || Number.isNaN(createdAtMs)) {
    return false;
  }

  return atMs - createdAtMs < OVERDUE_NOTIFICATION_INTERVAL_MS;
};

const isOverdueWorkTask = ({
  at,
  task,
  workspace,
}: {
  readonly at: string;
  readonly task: Task;
  readonly workspace: Workspace;
}): boolean =>
  isWorkTask(task) &&
  isOpenTaskStatus(task.status) &&
  isTaskOverdue({ at, task, timezone: workspace.timezone });

const shouldNotifyTask = async ({
  at,
  deps,
  task,
}: {
  readonly at: string;
  readonly deps: CallWorkflowDeps;
  readonly task: WorkTask;
}): Promise<boolean> => {
  const notifications = await deps.overdueTaskNotificationRepository.listByTask(
    {
      taskId: task.id,
      workspaceId: task.workspaceId,
    }
  );
  const latestNotification = notifications[0];

  return latestNotification === undefined
    ? true
    : !isNotifiedWithinInterval({
        at,
        notificationCreatedAt: latestNotification.createdAt,
      });
};

const notifyTask = async ({
  at,
  deps,
  task,
  workspace,
}: {
  readonly at: string;
  readonly deps: CallWorkflowDeps;
  readonly task: WorkTask;
  readonly workspace: Workspace;
}): Promise<void> => {
  if (!(await shouldNotifyTask({ at, deps, task }))) {
    return;
  }

  const result = await deps.notificationGateway.sendOverdueTaskNotification({
    task,
    workspace,
  });

  if (result === null) {
    return;
  }

  const now = deps.clock.now();

  await deps.overdueTaskNotificationRepository.create({
    notification: overdueTaskNotificationSchema.parse({
      createdAt: now,
      id: deps.idGenerator.generateId(),
      slack: {
        channelId: result.channelId,
        messageTs: result.messageTs,
        threadTs: result.threadTs,
      },
      taskId: task.id,
      updatedAt: now,
      workspaceId: workspace.id,
    }),
  });
};

const notifyWorkspaceOverdueTasks = async ({
  at,
  deps,
  workspace,
}: {
  readonly at: string;
  readonly deps: CallWorkflowDeps;
  readonly workspace: Workspace;
}): Promise<void> => {
  const tasks = await deps.taskRepository.listByWorkspace({
    workspaceId: workspace.id,
  });
  const overdueTasks = tasks.filter((task): task is WorkTask =>
    isOverdueWorkTask({ at, task, workspace })
  );

  await Promise.all(
    overdueTasks.map((task) => notifyTask({ at, deps, task, workspace }))
  );
};

export const notifyOverdueTasks = async ({
  at,
  deps,
}: {
  readonly at: string;
  readonly deps: CallWorkflowDeps;
}): Promise<void> => {
  const workspaces = await deps.workspaceRepository.listAll();

  await Promise.all(
    workspaces.map((workspace) =>
      notifyWorkspaceOverdueTasks({ at, deps, workspace })
    )
  );
};
