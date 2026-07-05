import {
  buildTaskPageMarkdown,
  taskPageSlug,
} from '../src/services/task-gbrain';
import {
  isWorkTask,
  workTaskSchema,
  type Task,
  type WorkTask,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-07-05T00:00:00.000Z';

const makeWorkTask = (overrides: Record<string, unknown>): WorkTask =>
  workTaskSchema.parse({
    assigneeSlackUserIds: [],
    createdAt: NOW,
    dependentTaskIds: [],
    dependsOnTaskIds: [],
    id: 'TASK1',
    kind: 'work',
    requesterSlackUserIds: [],
    status: 'active',
    title: 'A task',
    updatedAt: NOW,
    workspaceId: 'T123',
    ...overrides,
  });

test('taskPageSlug lowercases uppercase Slack-derived task ids', () => {
  assert.equal(
    taskPageSlug('slack_C0ADR86EXRP_1782981217_994749'),
    'tasks/slack_c0adr86exrp_1782981217_994749'
  );
});

test('buildTaskPageMarkdown emits only lowercase wikilinks', () => {
  const task = makeWorkTask({
    assigneeSlackUserIds: ['U05QC9RAC4Q'],
    channelId: 'C0ADR86EXRP',
    dependentTaskIds: ['TASK_DOWNSTREAM_XYZ'],
    dependsOnTaskIds: ['TASK_UPSTREAM_ABC'],
    id: 'slack_C0ADR86EXRP_1782981217_994749',
    title: 'Wire up GBrain slug normalization',
  });

  const linked: WorkTask[] = [
    makeWorkTask({ id: 'TASK_UPSTREAM_ABC', title: 'Upstream blocker' }),
    makeWorkTask({ id: 'TASK_DOWNSTREAM_XYZ', title: 'Downstream blocked' }),
  ];
  const tasksById = new Map<string, Task>(
    [task, ...linked].filter(isWorkTask).map((t) => [t.id, t])
  );

  const markdown = buildTaskPageMarkdown({ task, tasksById });

  const wikilinks = [...markdown.matchAll(/\[\[([^\]]+)\]\]/g)].map(
    (match) => match[1]
  );
  assert.ok(wikilinks.length > 0, 'expected at least one wikilink');
  for (const link of wikilinks) {
    assert.equal(
      link,
      link.toLowerCase(),
      `wikilink is not lowercase: [[${link}]]`
    );
  }
});
