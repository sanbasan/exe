import {
  buildFollowUpAnswerBlocks,
  buildFollowUpAnswerFallbackText,
  buildMissedCallBlocks,
  buildMissedCallFallbackText,
} from '../src';
import type { FollowUpTask } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const followUpTask: FollowUpTask = {
  assigneeSlackUserIds: ['UASSIGNEE'],
  completedAt: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-06-30T00:00:00.000Z',
  followUpAnswer: 'ER 図を共有済みです。',
  followUpQuestion: '前回以降に進んだことを教えてください。',
  id: 'FOLLOW_UP_1',
  kind: 'follow_up',
  requesterSlackUserIds: ['UREQUESTER'],
  status: 'completed',
  title: '三谷産業アプリの進捗確認',
  updatedAt: '2026-07-01T00:00:00.000Z',
  workspaceId: 'T123',
};

const sectionTexts = (blocks: ReturnType<typeof buildFollowUpAnswerBlocks>) =>
  blocks
    .filter((block) => block.type === 'section')
    .map((block) => block.text.text);

test('follow-up answer DM has title, question, answer, and task action', () => {
  const blocks = buildFollowUpAnswerBlocks({
    language: 'ja',
    task: followUpTask,
    taskUrl: 'https://example.com/workspaces/T123/tasks/FOLLOW_UP_1',
  });
  const actions = blocks.find((block) => block.type === 'actions');

  assert.deepEqual(sectionTexts(blocks), [
    '*確認依頼に回答がありました*\n三谷産業アプリの進捗確認',
    '*確認内容*\n前回以降に進んだことを教えてください。',
    '*回答*\nER 図を共有済みです。',
  ]);
  assert.ok(actions && actions.type === 'actions');
  assert.equal(actions.elements[0]?.type, 'button');
  assert.equal(
    buildFollowUpAnswerFallbackText({ language: 'ja', task: followUpTask }),
    '確認依頼に回答がありました: 三谷産業アプリの進捗確認\n\nER 図を共有済みです。'
  );
});

test('missed call DM has an app action and matching fallback text', () => {
  const blocks = buildMissedCallBlocks({
    appUrl: 'https://example.com/workspaces/T123',
    language: 'ja',
  });
  const actions = blocks.find((block) => block.type === 'actions');

  assert.match(sectionTexts(blocks)[0] ?? '', /タスク確認通話/u);
  assert.ok(actions && actions.type === 'actions');
  assert.equal(actions.elements[0]?.type, 'button');
  assert.equal(
    buildMissedCallFallbackText({ language: 'ja' }),
    'タスク確認通話に応答がありませんでした\n\nexe からの確認通話に応答がありませんでした。準備ができたら手動でタスク確認を開始できます。'
  );
});
