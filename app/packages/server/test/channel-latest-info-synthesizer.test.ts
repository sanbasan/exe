import {
  createChannelLatestInfoSynthesizer,
  parseLatestInfoOutput,
  type ChannelLatestInfoSynthesisInput,
} from '../src/services/channel-latest-info-synthesizer';
import {
  channelBlockSchema,
  channelReviewStateSchema,
  channelSchema,
  workTaskSchema,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-07-01T11:30:00.000Z';
const WORKSPACE_ID = 'T123';

const input: ChannelLatestInfoSynthesisInput = {
  activeBlocks: [
    channelBlockSchema.parse({
      channelId: 'C_TARGET',
      createdAt: '2026-06-20T00:00:00.000Z',
      createdBySlackUserId: 'U_SESSION',
      description: 'API review is still pending.',
      id: 'BLOCK_ACTIVE',
      status: 'active',
      title: 'API review pending',
      updatedAt: '2026-06-20T00:00:00.000Z',
      workspaceId: WORKSPACE_ID,
    }),
  ],
  channel: channelSchema.parse({
    assigneeSlackUserIds: ['U_SESSION'],
    channelId: 'C_TARGET',
    createdAt: '2026-06-01T00:00:00.000Z',
    createdBySlackUserId: 'U_SESSION',
    latestInfo: '旧情報',
    name: 'project',
    status: 'active',
    updatedAt: '2026-06-01T00:00:00.000Z',
    watcherSlackUserIds: [],
    workspaceId: WORKSPACE_ID,
  }),
  completedWorkTasks: [
    workTaskSchema.parse({
      assigneeSlackUserIds: ['U_SESSION'],
      channelId: 'C_TARGET',
      completedAt: '2026-07-01T10:00:00.000Z',
      createdAt: '2026-06-30T00:00:00.000Z',
      id: 'TASK_DONE',
      kind: 'work',
      requesterSlackUserIds: ['U_SESSION'],
      status: 'completed',
      title: '検証を完了する',
      updatedAt: '2026-07-01T10:00:00.000Z',
      workspaceId: WORKSPACE_ID,
    }),
  ],
  endedAt: NOW,
  language: 'ja',
  lookbackStartedAt: '2026-06-28T11:30:00.000Z',
  resolvedBlocks: [],
  statusReports: [
    channelReviewStateSchema.parse({
      channelId: 'C_TARGET',
      createdAt: '2026-07-01T11:00:00.000Z',
      id: 'C_TARGET:U_SESSION',
      slackUserId: 'U_SESSION',
      statusText: '実装は完了し、APIレビュー待ちです。',
      statusUpdatedAt: '2026-07-01T11:10:00.000Z',
      updatedAt: '2026-07-01T11:10:00.000Z',
      workspaceId: WORKSPACE_ID,
    }),
  ],
};

void test('latest-info synthesizer uses the configured latest-info model and JSON prompt contract', async () => {
  const calls: unknown[] = [];
  const synthesizer = createChannelLatestInfoSynthesizer({
    generate: async (params) => {
      calls.push(params);

      return {
        text: '{"latestInfo":"実装は完了し、APIレビュー待ちです。\\n次の作業に向けて調整中です。"}',
      };
    },
    model: 'gemini-2.5-pro',
  });

  const latestInfo = await synthesizer.synthesize(input);

  assert.equal(
    latestInfo,
    '実装は完了し、APIレビュー待ちです。 次の作業に向けて調整中です。'
  );
  assert.equal(calls.length, 1);

  const call = calls[0] as {
    readonly config: {
      readonly responseMimeType?: string;
      readonly systemInstruction?: unknown;
    };
    readonly contents: readonly {
      readonly parts: readonly { readonly text: string }[];
    }[];
    readonly model: string;
  };

  assert.equal(call.model, 'gemini-2.5-pro');
  assert.equal(call.config.responseMimeType, 'application/json');
  assert.match(String(call.config.systemInstruction), /次回確認/u);
  assert.match(call.contents[0].parts[0].text, /"workspaceLanguage": "ja"/u);
  assert.match(call.contents[0].parts[0].text, /API review pending/u);
});

void test('parseLatestInfoOutput treats truncated JSON output as a compose failure', () => {
  assert.equal(
    parseLatestInfoOutput({
      text: '{"latestInfo":"The project is currently paused',
    }),
    null
  );
});

void test('parseLatestInfoOutput keeps plain prose that ignores the JSON contract', () => {
  assert.equal(
    parseLatestInfoOutput({ text: '  Development is\n  ongoing.  ' }),
    'Development is ongoing.'
  );
});
