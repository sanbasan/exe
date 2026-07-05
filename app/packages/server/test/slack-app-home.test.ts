import type { SlackAppHomeDeps } from '../src/services/slack-app-home';
import { getShownHomeChannels } from '../src/services/slack-app-home';
import type { Channel, WorkTask } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-30T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const SLACK_USER_ID = 'U123';

const buildWorkspace = () =>
  ({
    admin: { emails: [], slackUserIds: [] },
    botUserId: 'UBOT',
    channelOwnerEditors: { emails: [], slackUserIds: [] },
    createdAt: NOW,
    encryptedBotToken: 'token',
    id: WORKSPACE_ID,
    language: 'ja' as const,
    name: 'Workspace',
    slackTeamId: WORKSPACE_ID,
    timezone: 'Asia/Tokyo',
    updatedAt: NOW,
  }) as unknown as Parameters<typeof getShownHomeChannels>[0]['workspace'];

const buildChannel = (overrides: Partial<Channel>): Channel => ({
  assigneeSlackUserIds: [SLACK_USER_ID],
  channelId: 'C123',
  createdAt: NOW,
  createdBySlackUserId: SLACK_USER_ID,
  name: 'project',
  status: 'active',
  updatedAt: NOW,
  watcherSlackUserIds: [],
  workspaceId: WORKSPACE_ID,
  ...overrides,
});

const buildWorkTask = (overrides: Partial<WorkTask>): WorkTask => ({
  assigneeSlackUserIds: [SLACK_USER_ID],
  channelId: 'D123',
  completedAt: null,
  createdAt: NOW,
  id: 'TASK1',
  kind: 'work',
  requesterSlackUserIds: [SLACK_USER_ID],
  status: 'active',
  title: 'DM task',
  updatedAt: NOW,
  workspaceId: WORKSPACE_ID,
  ...overrides,
});

const buildDeps = (
  getChannelInfo: SlackAppHomeDeps['slackGateway']['getChannelInfo']
): SlackAppHomeDeps =>
  ({
    clock: { now: () => NOW },
    slackGateway: { getChannelInfo },
    workspaceRepository: {
      getById: async () => buildWorkspace(),
    },
  }) as unknown as SlackAppHomeDeps;

test('app home resolves exe DM tasks into an exe pseudo-channel via Slack API', async () => {
  const deps = buildDeps(async ({ channelId }) => ({
    id: channelId,
    isIm: true,
    name: channelId,
  }));

  const channels = await getShownHomeChannels({
    assignedChannels: [],
    channels: [],
    deps,
    requestedWorkTasks: [],
    slackUserId: SLACK_USER_ID,
    workspace: buildWorkspace(),
    workTasks: [buildWorkTask({})],
  });

  assert.deepEqual(
    channels.map((channel) => ({
      channelId: channel.channelId,
      name: channel.name,
      status: channel.status,
    })),
    [{ channelId: 'D123', name: 'exe', status: 'active' }]
  );
});

test('app home resolves untracked public channel tasks via Slack API name', async () => {
  const deps = buildDeps(async ({ channelId }) => ({
    id: channelId,
    isIm: false,
    name: 'untracked-name',
  }));

  const channels = await getShownHomeChannels({
    assignedChannels: [],
    channels: [],
    deps,
    requestedWorkTasks: [],
    slackUserId: SLACK_USER_ID,
    workspace: buildWorkspace(),
    workTasks: [buildWorkTask({ channelId: 'C999', id: 'TASK_PUB' })],
  });

  assert.deepEqual(
    channels.map((channel) => [channel.channelId, channel.name]),
    [['C999', 'untracked-name']]
  );
});

test('app home keeps tracked channels and does not re-resolve them via Slack API', async () => {
  let calls = 0;
  const deps = buildDeps(async ({ channelId }) => {
    calls += 1;

    return { id: channelId, isIm: true, name: channelId };
  });
  const projectChannel = buildChannel({ channelId: 'C999', name: 'project' });

  const channels = await getShownHomeChannels({
    assignedChannels: [projectChannel],
    channels: [projectChannel],
    deps,
    requestedWorkTasks: [],
    slackUserId: SLACK_USER_ID,
    workspace: buildWorkspace(),
    workTasks: [
      buildWorkTask({ channelId: 'C999', id: 'TASK_CHANNEL' }),
      buildWorkTask({ channelId: 'D123', id: 'TASK_DM' }),
    ],
  });

  assert.deepEqual(
    channels.map((channel) => [channel.channelId, channel.name]),
    [
      ['C999', 'project'],
      ['D123', 'exe'],
    ]
  );
  assert.equal(calls, 1);
});
