import { buildTaskMessageBlocks } from '../src';
import { taskOverflowActions } from '../src/contracts';
import type { WorkTask } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const buildTask = (overrides: Partial<WorkTask> = {}): WorkTask => ({
  assigneeSlackUserIds: ['UASSIGNEE'],
  channelId: 'C123',
  completedAt: null,
  createdAt: '2026-06-28T00:00:00.000Z',
  id: 'TASK1',
  kind: 'work',
  requesterSlackUserIds: ['UREQUESTER'],
  status: 'active',
  title: 'Task',
  updatedAt: '2026-06-28T00:00:00.000Z',
  workspaceId: 'T123',
  ...overrides,
});

test('task overflow menu exposes channel settings for channel tasks', () => {
  const blocks = buildTaskMessageBlocks({
    assignees: [],
    language: 'ja',
    requesters: [],
    task: buildTask(),
    timezone: 'Asia/Tokyo',
  });
  const firstBlock = blocks.at(0);

  assert.equal(firstBlock?.type, 'section');
  assert.equal(firstBlock?.accessory?.type, 'overflow');
  assert.deepEqual(
    firstBlock.accessory.options.map((option) =>
      option.value?.slice(0, option.value.indexOf(':'))
    ),
    [
      taskOverflowActions.edit,
      taskOverflowActions.cancel,
      taskOverflowActions.channelSettings,
    ]
  );
});
