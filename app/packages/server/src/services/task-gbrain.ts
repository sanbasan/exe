import type { GBrainIngestGateway } from '#server/gateways';
import { reportServerError } from '#server/utils';
import { isWorkTask, type Task, type WorkTask } from '@exe/domain';

// GBrain projections for tasks: every create / update / dependency change
// upserts the task's page (slug tasks/<taskId>) so the workspace brain always
// reflects the live task graph.

// Lowercased: `gbrain put` fails on uppercase slugs (the page write and its
// tag/chunk reconcile disagree on the slug key). Slack-derived task ids embed
// uppercase channel ids, so normalize here (and in every wikilink) instead.
export const taskPageSlug = (taskId: string): string =>
  `tasks/${taskId.toLowerCase()}`;

const frontmatterValue = (value: string): string =>
  JSON.stringify(value.replaceAll('\n', ' '));

export const buildTaskPageMarkdown = ({
  task,
  tasksById,
}: {
  readonly task: WorkTask;
  readonly tasksById: ReadonlyMap<string, Task>;
}): string => {
  const titleOf = (taskId: string): string => {
    const linked = tasksById.get(taskId);

    return linked === undefined
      ? taskId
      : `${linked.title} ([[${taskPageSlug(taskId)}]])`;
  };
  const lines = [
    '---',
    'type: task',
    `title: ${frontmatterValue(task.title)}`,
    `status: ${task.status}`,
    `source: exe-task`,
    ...(task.channelId === undefined ? [] : [`channel: ${task.channelId}`]),
    ...(task.dueAt === undefined ? [] : [`due_at: ${task.dueAt}`]),
    ...(task.startAt === undefined ? [] : [`start_at: ${task.startAt}`]),
    `updated_at: ${task.updatedAt}`,
    '---',
    '',
    `# ${task.title}`,
    '',
    `- Status: ${task.status}`,
    `- Assignees: ${
      task.assigneeSlackUserIds.length === 0
        ? '(external / unassigned)'
        : task.assigneeSlackUserIds
            .map(
              (slackUserId) => `[[wiki/people/${slackUserId.toLowerCase()}]]`
            )
            .join(', ')
    }`,
    ...(task.description === undefined
      ? []
      : ['', '## Description', '', task.description]),
    ...(task.dependsOnTaskIds.length === 0
      ? []
      : [
          '',
          '## Blocked by',
          '',
          ...task.dependsOnTaskIds.map((taskId) => `- ${titleOf(taskId)}`),
        ]),
    ...(task.dependentTaskIds.length === 0
      ? []
      : [
          '',
          '## Blocks',
          '',
          ...task.dependentTaskIds.map((taskId) => `- ${titleOf(taskId)}`),
        ]),
  ];

  return lines.join('\n');
};

// Fire-and-forget: GBrain must never take down a task write.
export const ingestTaskPagesBestEffort = ({
  gbrainIngestGateway,
  tasks,
  tasksById,
  workspaceId,
}: {
  readonly gbrainIngestGateway: GBrainIngestGateway;
  readonly tasks: readonly Task[];
  readonly tasksById: ReadonlyMap<string, Task>;
  readonly workspaceId: string;
}): void => {
  if (!gbrainIngestGateway.isEnabled()) {
    return;
  }

  tasks.filter(isWorkTask).forEach((task) => {
    void gbrainIngestGateway
      .ingestPage({
        markdown: buildTaskPageMarkdown({ task, tasksById }),
        slug: taskPageSlug(task.id),
        workspaceId,
      })
      .catch((error: unknown) => {
        void reportServerError({
          context: { route: `gbrain/task-page/${workspaceId}` },
          error,
        });
      });
  });
};
