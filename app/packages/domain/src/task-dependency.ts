import { isOpenTaskStatus, workTaskSchema, type WorkTask } from './task';

// A dependency edge "blocker → blocked" means the blocked task depends on the
// blocker. Both sides carry the edge (blocker.dependentTaskIds /
// blocked.dependsOnTaskIds) and must always be updated together.

const withoutId = (ids: readonly string[], id: string): readonly string[] =>
  ids.filter((existing) => existing !== id);

const withId = (ids: readonly string[], id: string): readonly string[] =>
  ids.includes(id) ? ids : [...ids, id];

export const addTaskDependency = ({
  blocked,
  blocker,
  now,
}: {
  readonly blocked: WorkTask;
  readonly blocker: WorkTask;
  readonly now: string;
}): { readonly blocked: WorkTask; readonly blocker: WorkTask } => {
  if (blocker.id === blocked.id) {
    throw new Error('A task cannot depend on itself.');
  }

  if (blocker.workspaceId !== blocked.workspaceId) {
    throw new Error('Task dependency must stay within one workspace.');
  }

  return {
    blocked: workTaskSchema.parse({
      ...blocked,
      dependsOnTaskIds: withId(blocked.dependsOnTaskIds, blocker.id),
      updatedAt: now,
    }),
    blocker: workTaskSchema.parse({
      ...blocker,
      dependentTaskIds: withId(blocker.dependentTaskIds, blocked.id),
      updatedAt: now,
    }),
  };
};

export const removeTaskDependency = ({
  blocked,
  blocker,
  now,
}: {
  readonly blocked: WorkTask;
  readonly blocker: WorkTask;
  readonly now: string;
}): { readonly blocked: WorkTask; readonly blocker: WorkTask } => ({
  blocked: workTaskSchema.parse({
    ...blocked,
    dependsOnTaskIds: withoutId(blocked.dependsOnTaskIds, blocker.id),
    updatedAt: now,
  }),
  blocker: workTaskSchema.parse({
    ...blocker,
    dependentTaskIds: withoutId(blocker.dependentTaskIds, blocked.id),
    updatedAt: now,
  }),
});

// Number of open tasks currently blocked by this task. Reaching the trigger
// threshold places an automatic call to the blocker's assignee.
export const BLOCKER_CALL_DEPENDENT_THRESHOLD = 2;

export const countOpenDependents = ({
  task,
  tasksById,
}: {
  readonly task: WorkTask;
  readonly tasksById: ReadonlyMap<string, WorkTask>;
}): number =>
  task.dependentTaskIds.filter((id) => {
    const dependent = tasksById.get(id);
    return dependent !== undefined && isOpenTaskStatus(dependent.status);
  }).length;

export const shouldTriggerBlockerCall = ({
  task,
  tasksById,
}: {
  readonly task: WorkTask;
  readonly tasksById: ReadonlyMap<string, WorkTask>;
}): boolean =>
  task.blockerCallAt === undefined &&
  isOpenTaskStatus(task.status) &&
  countOpenDependents({ task, tasksById }) >= BLOCKER_CALL_DEPENDENT_THRESHOLD;
