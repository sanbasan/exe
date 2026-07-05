import { createCallOverviewComposer } from '../src/services/call-overview-composer';
import type { LatestInfoGenerateContent } from '../src/services/channel-latest-info-synthesizer';
import {
  callEventSchema,
  workspaceSchema,
  type CallEvent,
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

const transcriptEvents: readonly CallEvent[] = [
  callEventSchema.parse({
    callSessionId: CALL_SESSION_ID,
    createdAt: '2026-07-01T11:00:00.000Z',
    id: 'event-1',
    payload: { text: 'pj-a と pj-b の進捗を振り返りましょう。' },
    type: 'transcript',
    workspaceId: WORKSPACE_ID,
  }),
  callEventSchema.parse({
    callSessionId: CALL_SESSION_ID,
    createdAt: '2026-07-01T11:00:05.000Z',
    id: 'event-2',
    payload: { text: 'それでは pj-a から確認します。' },
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
}): ReturnType<typeof createCallOverviewComposer> =>
  createCallOverviewComposer({
    callEventRepository: {
      listByCallSessionId: () => Promise.resolve([...events]),
    },
    generate,
    model: 'gemini-2.5-pro',
    workspaceRepository: {
      getById: () => Promise.resolve(workspace),
    },
  });

void test('composeCallOverview sends the transcript with call context and returns the overview', async () => {
  const calls: unknown[] = [];
  const composer = buildComposer({
    generate: (params) => {
      calls.push(params);

      return Promise.resolve({
        text: '{"overview":"pj-a、pj-b の振り返りをした定例会"}',
      });
    },
  });

  const overview = await composer.composeCallOverview({
    callSessionId: CALL_SESSION_ID,
    createdTaskTitles: ['ローンチチェックリストを準備する'],
    purpose: 'scheduled_review',
    reviewedChannelNames: ['pj-a', 'pj-b'],
    updatedTaskTitles: [],
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(overview, 'pj-a、pj-b の振り返りをした定例会');
  assert.equal(calls.length, 1);

  const call = calls[0] as {
    readonly config: { readonly systemInstruction?: unknown };
    readonly contents: readonly {
      readonly parts: readonly { readonly text: string }[];
    }[];
    readonly model: string;
  };

  assert.equal(call.model, 'gemini-2.5-pro');
  assert.match(String(call.config.systemInstruction), /50文字以内/u);

  const prompt = call.contents[0]?.parts[0]?.text ?? '';

  assert.match(prompt, /pj-a と pj-b の進捗を振り返りましょう/u);
  assert.match(prompt, /定例のレビュー通話/u);
  assert.match(prompt, /ローンチチェックリストを準備する/u);
  assert.doesNotMatch(prompt, /updatedTasks/u);
});

void test('composeCallOverview returns null when the call has no transcript', async () => {
  const composer = buildComposer({
    events: [],
    generate: () => {
      throw new Error('generate must not be called without a transcript');
    },
  });

  const overview = await composer.composeCallOverview({
    callSessionId: CALL_SESSION_ID,
    createdTaskTitles: [],
    purpose: 'manual_review',
    reviewedChannelNames: [],
    updatedTaskTitles: [],
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(overview, null);
});

void test('composeCallOverview returns null on unusable model output', async () => {
  const composer = buildComposer({
    generate: () => Promise.resolve({ text: 'not json' }),
  });

  const overview = await composer.composeCallOverview({
    callSessionId: CALL_SESSION_ID,
    createdTaskTitles: [],
    purpose: 'follow_up_task',
    reviewedChannelNames: [],
    updatedTaskTitles: [],
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(overview, null);
});
