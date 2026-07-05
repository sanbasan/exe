import type {
  ChannelRepository,
  Clock,
  SlackGateway,
  TaskRepository,
  WorkspaceRepository,
  WorkspaceTokenFields,
} from '../src/ports';
import { openSlackChannelSettings } from '../src/services/slack-channel-settings';
import type { Channel, Task, Workspace } from '@exe/domain';
import {
  buildTaskOverflowActionValue,
  slackViewIds,
  taskOverflowActions,
} from '@exe/slack';
import type { View } from '@slack/types';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-28T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const ADMIN_USER = 'UADMIN';
const EDITOR_USER = 'UEDITOR';
const ASSIGNEE_USER = 'UASSIGNEE';

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  public constructor(private readonly workspace: Workspace) {}

  public acquireTokenRefreshLock = async (): Promise<boolean> => true;

  public getById = async (): Promise<Workspace> => this.workspace;

  public listAll = async (): Promise<readonly Workspace[]> => [this.workspace];

  public listByIds = async (): Promise<readonly Workspace[]> => [
    this.workspace,
  ];

  public releaseTokenRefreshLock = async (): Promise<void> => {};

  public updateTokens = async (_params: {
    readonly tokens: WorkspaceTokenFields;
    readonly workspaceId: string;
  }): Promise<void> => {};

  public upsert = async (_params: {
    readonly workspace: Workspace;
  }): Promise<void> => {};
}

class InMemoryChannelRepository implements ChannelRepository {
  public constructor(private readonly channel: Channel) {}

  public getById = async (): Promise<Channel> => this.channel;

  public listByWorkspace = async (): Promise<readonly Channel[]> => [
    this.channel,
  ];

  public upsert = async (_params: {
    readonly channel: Channel;
  }): Promise<void> => {};
}

class InMemoryTaskRepository implements TaskRepository {
  public constructor(private readonly task: Task) {}

  public create = async (_params: { readonly task: Task }): Promise<void> => {};

  public getById = async (): Promise<Task> => this.task;

  public listByAssignee = async (): Promise<readonly Task[]> => [];

  public listByRequester = async (): Promise<readonly Task[]> => [];

  public listByWorkspace = async (): Promise<readonly Task[]> => [];

  public update = async (_params: { readonly task: Task }): Promise<void> => {};
}

class RecordingSlackGateway {
  public openViews: { readonly triggerId: string; readonly view: View }[] = [];

  public openView = async ({
    triggerId,
    view,
  }: {
    readonly botToken: string;
    readonly triggerId: string;
    readonly view: View;
  }): Promise<void> => {
    this.openViews = [...this.openViews, { triggerId, view }];
  };
}

const clock: Clock = { now: () => NOW };

const buildWorkspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  admin: { emails: ['admin@example.com'], slackUserIds: [ADMIN_USER] },
  botUserId: 'UBOT',
  channelOwnerEditors: {
    emails: ['editor@example.com'],
    slackUserIds: [EDITOR_USER],
  },
  createdAt: NOW,
  encryptedBotToken: 'bot-token',
  id: WORKSPACE_ID,
  language: 'ja',
  name: 'Workspace',
  slackTeamId: WORKSPACE_ID,
  timezone: 'Asia/Tokyo',
  updatedAt: NOW,
  ...overrides,
});

const buildChannel = (overrides: Partial<Channel> = {}): Channel => ({
  assigneeSlackUserIds: [ASSIGNEE_USER],
  channelId: 'C123',
  createdAt: NOW,
  createdBySlackUserId: ASSIGNEE_USER,
  name: 'general',
  status: 'active',
  updatedAt: NOW,
  watcherSlackUserIds: [],
  workspaceId: WORKSPACE_ID,
  ...overrides,
});

const buildTask = (overrides: Partial<Task> = {}): Task => ({
  assigneeSlackUserIds: [ASSIGNEE_USER],
  channelId: 'C123',
  completedAt: null,
  createdAt: NOW,
  id: 'TASK1',
  kind: 'work',
  requesterSlackUserIds: ['UREQUESTER'],
  status: 'active',
  title: 'Task',
  updatedAt: NOW,
  workspaceId: WORKSPACE_ID,
  ...overrides,
});

const buildDeps = ({
  channel = buildChannel(),
  task = buildTask(),
  workspace = buildWorkspace(),
}: {
  readonly channel?: Channel;
  readonly task?: Task;
  readonly workspace?: Workspace;
} = {}) => {
  const slackGateway = new RecordingSlackGateway();

  return {
    deps: {
      channelRepository: new InMemoryChannelRepository(channel),
      clock,
      slackGateway: slackGateway as unknown as SlackGateway,
      taskRepository: new InMemoryTaskRepository(task),
      workspaceRepository: new InMemoryWorkspaceRepository(workspace),
    },
    slackGateway,
  };
};

test('channel settings opens from task overflow for channel-owner editors', async () => {
  const { deps, slackGateway } = buildDeps();

  await openSlackChannelSettings({
    actionId: 'exe.task_overflow',
    deps,
    selectedOptionValue: buildTaskOverflowActionValue({
      action: taskOverflowActions.channelSettings,
      taskId: 'TASK1',
    }),
    slackTeamId: WORKSPACE_ID,
    slackUserId: EDITOR_USER,
    triggerId: 'trigger-1',
  });

  assert.equal(slackGateway.openViews.length, 1);
  assert.equal(
    slackGateway.openViews[0].view.callback_id,
    slackViewIds.channelSettings
  );
});

test('channel settings does not open without channel-owner edit permission', async () => {
  const { deps, slackGateway } = buildDeps();

  await openSlackChannelSettings({
    actionId: 'exe.task_overflow',
    deps,
    selectedOptionValue: buildTaskOverflowActionValue({
      action: taskOverflowActions.channelSettings,
      taskId: 'TASK1',
    }),
    slackTeamId: WORKSPACE_ID,
    slackUserId: ASSIGNEE_USER,
    triggerId: 'trigger-1',
  });

  assert.equal(slackGateway.openViews.length, 0);
});
