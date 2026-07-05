import { buildCallDecisions } from '#agent/gbrain/decisions';
import type { CallEvent } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const WORKSPACE_ID = 'workspace_1';
const SESSION_ID = 'session_abc';

const event = ({
  payload,
  type,
}: {
  readonly payload: CallEvent['payload'];
  readonly type: CallEvent['type'];
}): CallEvent => ({
  callSessionId: SESSION_ID,
  createdAt: '2026-06-15T01:00:10.000Z',
  id: type,
  payload,
  type,
  workspaceId: WORKSPACE_ID,
});

void test('buildCallDecisions derives lines, outcome tags, and channels', () => {
  const events: readonly CallEvent[] = [
    event({
      payload: {
        workTaskDrafts: [
          {
            assigneeSlackUserIds: ['U_YAMADA'],
            requesterSlackUserIds: ['U_SPEAKER'],
            title: 'レビュー基盤の刷新',
          },
        ],
      },
      type: 'work_task_draft_proposed',
    }),
    event({
      payload: {
        latestInfoDrafts: [
          {
            channelId: 'C_DEV',
            channelName: 'dev-exe',
            latestInfo: '進捗更新',
          },
        ],
      },
      type: 'latest_info_draft_proposed',
    }),
  ];

  const decisions = buildCallDecisions({
    agenda: null,
    events,
    language: 'ja',
    memberNames: new Map([['U_YAMADA', '山田']]),
  });

  assert.deepEqual(decisions.lines, [
    '- 作業タスク作成: レビュー基盤の刷新(担当: 山田)',
    '- 最新情報更新: #dev-exe',
  ]);
  assert.deepEqual(decisions.outcomeTags, [
    'task-created',
    'latest-info-updated',
  ]);
  assert.deepEqual(decisions.channelNames, ['dev-exe']);
});

void test('buildCallDecisions returns empty results for an empty call', () => {
  const decisions = buildCallDecisions({
    agenda: null,
    events: [],
    language: 'en',
    memberNames: new Map<string, string>(),
  });

  assert.deepEqual(decisions.lines, []);
  assert.deepEqual(decisions.outcomeTags, []);
  assert.deepEqual(decisions.channelNames, []);
});
