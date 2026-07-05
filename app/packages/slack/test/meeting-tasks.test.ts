import {
  buildMeetingTasksRootBlocks,
  buildMeetingTasksRootFallbackText,
  buildTaskDependencyNoticeBlocks,
  buildTaskDependencyNoticeFallbackText,
  buildTaskReassignedNoticeBlocks,
  buildTaskReassignedNoticeFallbackText,
} from '../src/message/meeting-tasks';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const getBlockText = (block: unknown): string => {
  const record = block as {
    readonly text?: { readonly text: string };
  };

  return record.text?.text ?? '';
};

void test('Japanese meeting-tasks root message pluralizes and handles zero', () => {
  const single = buildMeetingTasksRootBlocks({
    language: 'ja',
    meetingTitle: '定例会',
    taskCount: 1,
  });

  assert.equal(single.length, 1);
  assert.equal(
    getBlockText(single[0]),
    ':memo: 「定例会」内で、タスクが作成されました。'
  );

  assert.equal(
    buildMeetingTasksRootFallbackText({
      language: 'ja',
      meetingTitle: '定例会',
      taskCount: 3,
    }),
    ':memo: 「定例会」内で、3件のタスクが作成されました。'
  );

  assert.equal(
    buildMeetingTasksRootFallbackText({
      language: 'ja',
      meetingTitle: '定例会',
      taskCount: 0,
    }),
    ':studio_microphone: 「定例会」の録音を処理しました。'
  );
});

void test('English meeting-tasks root message pluralizes and handles zero', () => {
  assert.equal(
    buildMeetingTasksRootFallbackText({
      language: 'en',
      meetingTitle: 'Weekly Sync',
      taskCount: 1,
    }),
    ':memo: A task was created in "Weekly Sync".'
  );

  assert.equal(
    buildMeetingTasksRootFallbackText({
      language: 'en',
      meetingTitle: 'Weekly Sync',
      taskCount: 4,
    }),
    ':memo: 4 tasks were created in "Weekly Sync".'
  );

  assert.equal(
    buildMeetingTasksRootFallbackText({
      language: 'en',
      meetingTitle: 'Weekly Sync',
      taskCount: 0,
    }),
    ':studio_microphone: Recording "Weekly Sync" was processed.'
  );
});

void test('task dependency notice renders in both languages', () => {
  const jaBlocks = buildTaskDependencyNoticeBlocks({
    blockedTitle: 'デプロイ',
    blockerTitle: 'レビュー',
    language: 'ja',
  });

  assert.equal(jaBlocks.length, 1);
  assert.equal(
    getBlockText(jaBlocks[0]),
    ':link: 「デプロイ」は「レビュー」にブロックされています。'
  );

  assert.equal(
    buildTaskDependencyNoticeFallbackText({
      blockedTitle: 'Deploy',
      blockerTitle: 'Review',
      language: 'en',
    }),
    ':link: "Deploy" is blocked by "Review".'
  );
});

void test('task reassigned notice handles named and unassigned targets', () => {
  assert.equal(
    buildTaskReassignedNoticeFallbackText({
      fromDisplayName: 'Alice',
      language: 'en',
      taskTitle: 'Fix bug',
      toDisplayName: 'Bob',
    }),
    ':leftwards_arrow_with_hook: "Fix bug" was reassigned from Alice to Bob.'
  );

  assert.equal(
    buildTaskReassignedNoticeFallbackText({
      fromDisplayName: 'Alice',
      language: 'en',
      taskTitle: 'Fix bug',
    }),
    ':leftwards_arrow_with_hook: "Fix bug" was reassigned from Alice to unassigned.'
  );

  const jaBlocks = buildTaskReassignedNoticeBlocks({
    fromDisplayName: '太郎',
    language: 'ja',
    taskTitle: 'バグ修正',
  });

  assert.equal(jaBlocks.length, 1);
  assert.equal(
    getBlockText(jaBlocks[0]),
    ':leftwards_arrow_with_hook: 「バグ修正」の担当が 太郎 から 未割り当て に変更されました。'
  );

  assert.equal(
    buildTaskReassignedNoticeFallbackText({
      fromDisplayName: '太郎',
      language: 'ja',
      taskTitle: 'バグ修正',
      toDisplayName: '花子',
    }),
    ':leftwards_arrow_with_hook: 「バグ修正」の担当が 太郎 から 花子 に変更されました。'
  );
});
