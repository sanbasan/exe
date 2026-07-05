import {
  buildTasksCreatedFromCallRootBlocks,
  buildTasksCreatedFromCallRootFallbackText,
} from '../src/message/task-created-from-call';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const getBlockText = (block: unknown): string => {
  const record = block as {
    readonly text?: { readonly text: string };
  };

  return record.text?.text ?? '';
};

void test('Japanese task-created-from-call root message includes session date, speaker, and task count', () => {
  const blocks = buildTasksCreatedFromCallRootBlocks({
    language: 'ja',
    sessionStartedAt: '2026-07-01T11:00:00.000Z',
    speakerSlackUserId: 'U_SPEAKER',
    taskCount: 2,
    timezone: 'Asia/Tokyo',
  });

  assert.equal(blocks.length, 1);
  assert.equal(
    getBlockText(blocks[0]),
    ':memo: 07/01 (水) 20:00 の <@U_SPEAKER> さんとの通話セッションでタスクが2件追加されました。'
  );
  assert.equal(
    buildTasksCreatedFromCallRootFallbackText({
      language: 'ja',
      sessionStartedAt: '2026-07-01T11:00:00.000Z',
      speakerSlackUserId: 'U_SPEAKER',
      taskCount: 2,
      timezone: 'Asia/Tokyo',
    }),
    '07/01 (水) 20:00 の <@U_SPEAKER> さんとの通話セッションでタスクが2件追加されました。'
  );
});

void test('English task-created-from-call root message supports singular task count', () => {
  const blocks = buildTasksCreatedFromCallRootBlocks({
    language: 'en',
    sessionStartedAt: '2026-07-01T11:00:00.000Z',
    speakerSlackUserId: 'U_SPEAKER',
    taskCount: 1,
    timezone: 'Asia/Tokyo',
  });

  assert.equal(blocks.length, 1);
  assert.equal(
    getBlockText(blocks[0]),
    ':memo: A task was added from the call session with <@U_SPEAKER> on Jul 1 (Wed) 8:00 PM.'
  );
  assert.equal(
    buildTasksCreatedFromCallRootFallbackText({
      language: 'en',
      sessionStartedAt: '2026-07-01T11:00:00.000Z',
      speakerSlackUserId: 'U_SPEAKER',
      taskCount: 1,
      timezone: 'Asia/Tokyo',
    }),
    'A task was added from the call session with <@U_SPEAKER> on Jul 1 (Wed) 8:00 PM.'
  );
});
