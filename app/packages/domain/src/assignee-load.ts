import { isOpenTaskStatus, isWorkTask, type Task } from './task';

// Workspace-wide, channel-crossing load model: a person's load is their open
// work-task count. Someone is overloaded when they hold at least
// OVERLOAD_MIN_TASKS open tasks AND at least 1.5x the average load across
// everyone who holds any open task. The same rule drives the red Gantt nodes
// on the web and the morning rebalance workflow.

export const OVERLOAD_MIN_TASKS = 3;

export const OVERLOAD_AVERAGE_MULTIPLIER = 1.5;

export const countOpenTasksByAssignee = ({
  tasks,
}: {
  readonly tasks: readonly Task[];
}): ReadonlyMap<string, number> => {
  const openAssignees = tasks
    .filter(isWorkTask)
    .filter((task) => isOpenTaskStatus(task.status))
    .flatMap((task) => task.assigneeSlackUserIds);

  return new Map(
    [...new Set(openAssignees)].map((slackUserId) => [
      slackUserId,
      openAssignees.filter((id) => id === slackUserId).length,
    ])
  );
};

export const getOverloadThreshold = ({
  counts,
}: {
  readonly counts: ReadonlyMap<string, number>;
}): number => {
  if (counts.size === 0) {
    return OVERLOAD_MIN_TASKS;
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const average = total / counts.size;
  return Math.max(
    OVERLOAD_MIN_TASKS,
    Math.ceil(average * OVERLOAD_AVERAGE_MULTIPLIER)
  );
};

export const getOverloadedAssignees = ({
  tasks,
}: {
  readonly tasks: readonly Task[];
}): readonly string[] => {
  const counts = countOpenTasksByAssignee({ tasks });
  const threshold = getOverloadThreshold({ counts });
  return [...counts.entries()]
    .filter(([, count]) => count >= threshold)
    .toSorted((left, right) => right[1] - left[1])
    .map(([slackUserId]) => slackUserId);
};
