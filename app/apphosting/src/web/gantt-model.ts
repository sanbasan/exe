import type { SlackMember } from '#app/web/api-schemas';
import { isOpenTaskStatus, type WorkTask } from '@exe/domain';

export interface OverloadInfo {
  readonly counts: ReadonlyMap<string, number>;
  readonly overloaded: ReadonlySet<string>;
  readonly threshold: number;
}

// Per-assignee open (active|blocked) work-task load. An assignee is flagged
// overloaded when their open count reaches a threshold that scales with the
// team average, floored at 3 so tiny teams do not trip on one busy person.
export const computeOverload = (tasks: readonly WorkTask[]): OverloadInfo => {
  const openAssignments = tasks
    .filter((task) => isOpenTaskStatus(task.status))
    .flatMap((task) => task.assigneeSlackUserIds);
  const counts = new Map(
    [...Map.groupBy(openAssignments, (userId) => userId)].map(
      ([userId, assignments]) => [userId, assignments.length] as const
    )
  );
  const average = counts.size > 0 ? openAssignments.length / counts.size : 0;
  const threshold = Math.max(3, Math.ceil(average * 1.5));
  const overloaded = new Set(
    [...counts]
      .filter(([, count]) => count >= threshold)
      .map(([userId]) => userId)
  );
  return { counts, overloaded, threshold };
};

export const isTaskOverloaded = ({
  overloaded,
  task,
}: {
  readonly overloaded: ReadonlySet<string>;
  readonly task: WorkTask;
}): boolean =>
  isOpenTaskStatus(task.status) &&
  task.assigneeSlackUserIds.some((userId) => overloaded.has(userId));

export const buildMemberMap = (
  members: readonly SlackMember[]
): ReadonlyMap<string, string> =>
  new Map(
    members.map((member) => [member.slackUserId, member.displayName] as const)
  );

export const memberLabel = ({
  memberMap,
  slackUserId,
}: {
  readonly memberMap: ReadonlyMap<string, string>;
  readonly slackUserId: string;
}): string => memberMap.get(slackUserId) ?? slackUserId;

// Tasks ordered for display: earliest start first, then alphabetical by title
// so the vertical order is stable across refetches.
export const sortTasksForDisplay = (
  tasks: readonly WorkTask[]
): readonly WorkTask[] =>
  tasks.toSorted((left, right) => {
    const leftStart = left.startAt ?? left.createdAt;
    const rightStart = right.startAt ?? right.createdAt;
    if (leftStart !== rightStart) {
      return leftStart.localeCompare(rightStart);
    }
    return left.title.localeCompare(right.title);
  });
