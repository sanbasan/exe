import { sendTaskPatchThreadNotice } from '../src/infrastructure/notifications/task-notifications';
import type { Clock, SlackGateway, WorkspaceRepository } from '../src/ports';
import {
  workTaskSchema,
  workspaceSchema,
  type TaskPatch,
  type Workspace,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-30T00:00:00.000Z';
const WORKSPACE_ID = 'T123';

const workspace = workspaceSchema.parse({
  admin: { emails: [], slackUserIds: [] },
  botUserId: 'UBOT',
  createdAt: NOW,
  encryptedBotToken: 'bot-token',
  id: WORKSPACE_ID,
  language: 'en',
  name: 'Workspace',
  slackTeamId: WORKSPACE_ID,
  timezone: 'Asia/Tokyo',
  updatedAt: NOW,
});

const workspaceRepository: WorkspaceRepository = {
  acquireTokenRefreshLock: async () => true,
  getById: async (): Promise<Workspace> => workspace,
  listAll: async () => [workspace],
  listByIds: async () => [workspace],
  releaseTokenRefreshLock: async () => {},
  updateTokens: async () => {},
  upsert: async () => {},
};

const previousTask = workTaskSchema.parse({
  assigneeSlackUserIds: ['UASSIGNEE'],
  channelId: 'C123',
  completedAt: null,
  createdAt: NOW,
  dueAt: '2026-06-30T11:00:00.000Z',
  id: 'TASK1',
  kind: 'work',
  messageTs: '1710000000.222222',
  requesterSlackUserIds: ['UREQUESTER'],
  status: 'active',
  threadTs: '1710000000.111111',
  title: 'Improve focus by using push-to-talk',
  updatedAt: NOW,
  workspaceId: WORKSPACE_ID,
});

const updatedTask = workTaskSchema.parse({
  ...previousTask,
  dueAt: '2026-07-01T10:24:00.000Z',
  updatedAt: '2026-06-30T00:01:00.000Z',
});

const patch: TaskPatch = {
  after: {
    dueAt: '2026-07-01T10:24:00.000Z',
    kind: 'work',
  },
  before: {
    dueAt: '2026-06-30T11:00:00.000Z',
    kind: 'work',
  },
  reason: 'User wants to change from the default deadline.',
  taskId: 'TASK1',
};

class RecordingSlackGateway {
  public messages: Parameters<SlackGateway['postMessage']>[0][] = [];

  public getWorkspaceInfo = async () => ({ domain: 'example' });

  public postMessage = async (
    message: Parameters<SlackGateway['postMessage']>[0]
  ): Promise<string> => {
    this.messages = [...this.messages, message];

    return '3000.000000';
  };
}

const clock: Clock = { now: () => NOW };

test('task patch thread notice links the title and omits the reason block', async () => {
  const slackGateway = new RecordingSlackGateway();

  await sendTaskPatchThreadNotice({
    deps: {
      clock,
      slackGateway: slackGateway as unknown as SlackGateway,
      workspaceRepository,
    },
    patch,
    previousTask,
    task: updatedTask,
    workspace,
  });

  assert.equal(slackGateway.messages.length, 1);

  const message = slackGateway.messages[0];
  const expectedText =
    ':memo: Updated the due date for <https://example.slack.com/archives/C123/p1710000000222222?thread_ts=1710000000.111111&cid=C123|*Improve focus by using push-to-talk*>\n*Due:* Jun 30 (Tue) 8:00 PM → Jul 1 (Wed) 7:24 PM';

  assert.equal(message.text, expectedText);
  assert.equal(message.threadTs, '1710000000.111111');
  assert.equal(message.unfurlLinks, false);
  assert.equal(message.blocks.length, 1);
  assert.deepEqual(message.blocks[0], {
    text: {
      text: expectedText,
      type: 'mrkdwn',
    },
    type: 'section',
  });
  assert.doesNotMatch(message.text, /Reason:/u);
});
