import { createCallProseComposer } from '../src/services/call-prose-composer';
import type { LatestInfoGenerateContent } from '../src/services/channel-latest-info-synthesizer';
import {
  callEventSchema,
  channelSchema,
  workspaceSchema,
  type CallEvent,
  type Channel,
  type Workspace,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const WORKSPACE_ID = 'T123';
const CALL_SESSION_ID = 'call-1';

const workspace: Workspace = workspaceSchema.parse({
  admin: { emails: [], slackUserIds: [] },
  botUserId: 'U_BOT',
  createdAt: '2026-06-01T00:00:00.000Z',
  encryptedBotToken: 'bot-token',
  id: WORKSPACE_ID,
  language: 'ja',
  name: 'Workspace',
  slackTeamId: WORKSPACE_ID,
  timezone: 'Asia/Tokyo',
  updatedAt: '2026-06-01T00:00:00.000Z',
});

const channel: Channel = channelSchema.parse({
  assigneeSlackUserIds: ['U_SESSION'],
  channelId: 'C_TARGET',
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBySlackUserId: 'U_SESSION',
  latestInfo: '実装は完了し、APIレビュー待ちです。',
  name: 'project',
  status: 'active',
  updatedAt: '2026-06-01T00:00:00.000Z',
  watcherSlackUserIds: [],
  workspaceId: WORKSPACE_ID,
});

const transcriptEvents: readonly CallEvent[] = [
  callEventSchema.parse({
    callSessionId: CALL_SESSION_ID,
    createdAt: '2026-07-01T11:00:00.000Z',
    id: 'event-1',
    payload: { text: 'ランチェックリストのタスクを作っておいて。' },
    type: 'transcript',
    workspaceId: WORKSPACE_ID,
  }),
  callEventSchema.parse({
    callSessionId: CALL_SESSION_ID,
    createdAt: '2026-07-01T11:00:05.000Z',
    id: 'event-2',
    payload: { text: '控えておきます。' },
    type: 'agent_message',
    workspaceId: WORKSPACE_ID,
  }),
];

const buildComposer = ({
  events = transcriptEvents,
  generate,
}: {
  readonly events?: readonly CallEvent[];
  readonly generate: LatestInfoGenerateContent;
}): ReturnType<typeof createCallProseComposer> =>
  createCallProseComposer({
    callEventRepository: {
      listByCallSessionId: () => Promise.resolve([...events]),
    },
    channelRepository: {
      getById: () => Promise.resolve(channel),
    },
    generate,
    model: 'gemini-2.5-pro',
    workspaceRepository: {
      getById: () => Promise.resolve(workspace),
    },
  });

void test('composeWorkTaskTitle sends the transcript and hint and returns the composed title', async () => {
  const calls: unknown[] = [];
  const composer = buildComposer({
    generate: (params) => {
      calls.push(params);

      return Promise.resolve({
        text: '{"title":"ローンチチェックリストを準備する"}',
      });
    },
  });

  const composed = await composer.composeWorkTaskTitle({
    callSessionId: CALL_SESSION_ID,
    hint: 'ランチェックリスト',
    speakerName: 'Taro',
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(composed, { title: 'ローンチチェックリストを準備する' });
  assert.equal(calls.length, 1);

  const call = calls[0] as {
    readonly config: { readonly systemInstruction?: unknown };
    readonly contents: readonly {
      readonly parts: readonly { readonly text: string }[];
    }[];
    readonly model: string;
  };

  assert.equal(call.model, 'gemini-2.5-pro');
  assert.match(String(call.config.systemInstruction), /日本語だけで/u);

  const prompt = call.contents[0]?.parts[0]?.text ?? '';

  assert.match(prompt, /ランチェックリストのタスクを作っておいて/u);
  assert.match(prompt, /Taro:/u);
  assert.match(prompt, /exe:/u);
  assert.match(prompt, /"hint": "ランチェックリスト"/u);
});

void test('composeWorkTaskTitle returns null without generating when the transcript is empty', async () => {
  const composer = buildComposer({
    events: [],
    generate: () => {
      assert.fail('generate should not be called for an empty transcript.');
    },
  });

  const composed = await composer.composeWorkTaskTitle({
    callSessionId: CALL_SESSION_ID,
    hint: 'ランチェックリスト',
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(composed, null);
});

void test('composeWorkTaskTitle returns null when the model output is not parseable', async () => {
  const composer = buildComposer({
    generate: () => Promise.resolve({ text: 'not json' }),
  });

  const composed = await composer.composeWorkTaskTitle({
    callSessionId: CALL_SESSION_ID,
    hint: 'ランチェックリスト',
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(composed, null);
});

void test('composeFollowUpTask returns the composed title and question', async () => {
  const composer = buildComposer({
    generate: () =>
      Promise.resolve({
        text: '{"followUpQuestion":"今週中にリリースできますか？","title":"リリース時期の確認"}',
      }),
  });

  const composed = await composer.composeFollowUpTask({
    callSessionId: CALL_SESSION_ID,
    hint: 'リリース時期',
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(composed, {
    followUpQuestion: '今週中にリリースできますか？',
    title: 'リリース時期の確認',
  });
});

void test('composeWorkTaskPatch drops empty optional fields', async () => {
  const composer = buildComposer({
    generate: () =>
      Promise.resolve({
        text: '{"reason":"クライアント確認待ちのため。","title":""}',
      }),
  });

  const composed = await composer.composeWorkTaskPatch({
    callSessionId: CALL_SESSION_ID,
    changeSummary: 'dueAt → 2026-07-10',
    taskTitle: '仕様書レビュー',
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(composed, { reason: 'クライアント確認待ちのため。' });
});

void test('composeChannelReview includes the channel context and maps empty self report to undefined', async () => {
  const calls: unknown[] = [];
  const composer = buildComposer({
    generate: (params) => {
      calls.push(params);

      return Promise.resolve({
        text: '{"lastSelfReport":"","statusText":"実装は完了し、リリース準備中です。"}',
      });
    },
  });

  const composed = await composer.composeChannelReview({
    callSessionId: CALL_SESSION_ID,
    channelId: 'C_TARGET',
    hint: 'リリース準備',
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(composed, {
    statusText: '実装は完了し、リリース準備中です。',
  });

  const call = calls[0] as {
    readonly contents: readonly {
      readonly parts: readonly { readonly text: string }[];
    }[];
  };
  const prompt = call.contents[0]?.parts[0]?.text ?? '';

  assert.match(prompt, /"name": "project"/u);
  assert.match(prompt, /実装は完了し、APIレビュー待ちです。/u);
});

void test('composeFollowUpAnswer passes the task context and returns the answer', async () => {
  const calls: unknown[] = [];
  const composer = buildComposer({
    generate: (params) => {
      calls.push(params);

      return Promise.resolve({
        text: '{"answer":"今週金曜にリリース予定とのことです。"}',
      });
    },
  });

  const composed = await composer.composeFollowUpAnswer({
    callSessionId: CALL_SESSION_ID,
    followUpQuestion: '今週中にリリースできますか？',
    taskTitle: 'リリース時期の確認',
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(composed, {
    answer: '今週金曜にリリース予定とのことです。',
  });

  const call = calls[0] as {
    readonly contents: readonly {
      readonly parts: readonly { readonly text: string }[];
    }[];
  };
  const prompt = call.contents[0]?.parts[0]?.text ?? '';

  assert.match(prompt, /リリース時期の確認/u);
  assert.match(prompt, /今週中にリリースできますか？/u);
});
