import type {
  CallScheduleRepository,
  ChannelBlockRepository,
  ChannelRepository,
  ChannelReviewStateRepository,
  Clock,
  IdGenerator,
  OverdueTaskNotificationRepository,
  SlackGateway,
  SlackUserInfo,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
  WorkspaceTokenFields,
} from '../src/ports';
import { handleSlackTaskStatusAction } from '../src/services/slack-task-actions';
import {
  workTaskSchema,
  workspaceSchema,
  type Task,
  type Workspace,
} from '@exe/domain';
import { slackActionIds } from '@exe/slack';
import type { KnownBlock, View } from '@slack/types';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-30T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const ASSIGNEE_USER = 'UASSIGNEE';
const REQUESTER_USER = 'UREQUESTER';

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  public workspace: Workspace;

  public constructor(workspace: Workspace) {
    this.workspace = workspace;
  }

  public acquireTokenRefreshLock = async (): Promise<boolean> => true;

  public getById = async ({
    workspaceId,
  }: {
    readonly workspaceId: string;
  }): Promise<Workspace | null> =>
    workspaceId === this.workspace.id ? this.workspace : null;

  public listAll = async (): Promise<readonly Workspace[]> => [this.workspace];

  public listByIds = async (): Promise<readonly Workspace[]> => [
    this.workspace,
  ];

  public releaseTokenRefreshLock = async (): Promise<void> => {};

  public updateTokens = async ({
    tokens,
  }: {
    readonly tokens: WorkspaceTokenFields;
    readonly workspaceId: string;
  }): Promise<void> => {
    this.workspace = workspaceSchema.parse({ ...this.workspace, ...tokens });
  };

  public upsert = async ({
    workspace,
  }: {
    readonly workspace: Workspace;
  }): Promise<void> => {
    this.workspace = workspace;
  };
}

class InMemoryTaskRepository implements TaskRepository {
  public task: Task;

  public constructor(task: Task) {
    this.task = task;
  }

  public create = async ({ task }: { readonly task: Task }): Promise<void> => {
    this.task = task;
  };

  public getById = async ({
    taskId,
  }: {
    readonly taskId: string;
    readonly workspaceId: string;
  }): Promise<Task | null> => (taskId === this.task.id ? this.task : null);

  public listByAssignee = async ({
    slackUserId,
  }: {
    readonly slackUserId: string;
    readonly workspaceId: string;
  }): Promise<readonly Task[]> =>
    this.task.assigneeSlackUserIds.includes(slackUserId) ? [this.task] : [];

  public listByRequester = async ({
    slackUserId,
  }: {
    readonly slackUserId: string;
    readonly workspaceId: string;
  }): Promise<readonly Task[]> =>
    this.task.requesterSlackUserIds.includes(slackUserId) ? [this.task] : [];

  public listByWorkspace = async (): Promise<readonly Task[]> => [this.task];

  public update = async ({ task }: { readonly task: Task }): Promise<void> => {
    this.task = task;
  };
}

class RecordingSlackGateway {
  public publishedHomeViews: {
    readonly userId: string;
    readonly view: View;
  }[] = [];

  public updatedMessages: {
    readonly channelId: string;
    readonly messageTs: string;
    readonly text: string;
  }[] = [];

  public getUserInfo = async ({
    slackUserId,
  }: {
    readonly botToken: string;
    readonly slackUserId: string;
  }) => ({
    status: 'ok' as const,
    user: {
      email: `${slackUserId.toLowerCase()}@example.com`,
      slackUserId,
    } satisfies SlackUserInfo,
  });

  public getWorkspaceInfo = async () => ({ domain: 'example' });

  public publishHomeView = async ({
    userId,
    view,
  }: {
    readonly botToken: string;
    readonly userId: string;
    readonly view: View;
  }): Promise<void> => {
    this.publishedHomeViews = [...this.publishedHomeViews, { userId, view }];
  };

  public updateMessage = async ({
    channelId,
    messageTs,
    text,
  }: {
    readonly blocks: readonly KnownBlock[];
    readonly botToken: string;
    readonly channelId: string;
    readonly messageTs: string;
    readonly text: string;
  }): Promise<void> => {
    this.updatedMessages = [
      ...this.updatedMessages,
      { channelId, messageTs, text },
    ];
  };
}

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { generateId: () => 'id-1' };

const emptyCallScheduleRepository: CallScheduleRepository = {
  getById: async () => null,
  getByUser: async () => null,
  listEnabled: async () => [],
  upsert: async () => {},
};

const emptyChannelBlockRepository: ChannelBlockRepository = {
  create: async () => {},
  delete: async () => {},
  getById: async () => null,
  listByWorkspace: async () => [],
  update: async () => {},
};

const emptyChannelRepository: ChannelRepository = {
  getById: async () => null,
  listByWorkspace: async () => [],
  upsert: async () => {},
};

const emptyChannelReviewStateRepository: ChannelReviewStateRepository = {
  getByChannelAndUser: async () => null,
  listByWorkspace: async () => [],
  upsert: async () => {},
};

const emptyUserProfileRepository: UserProfileRepository = {
  getById: async () => null,
  listByWorkspace: async () => [],
  upsert: async () => {},
};

const emptyOverdueTaskNotificationRepository: OverdueTaskNotificationRepository =
  {
    create: async () => {},
    deleteByTask: async () => {},
    listByTask: async () => [],
  };

const buildWorkspace = (overrides: Partial<Workspace> = {}): Workspace =>
  workspaceSchema.parse({
    admin: { emails: ['admin@example.com'], slackUserIds: ['UADMIN'] },
    botUserId: 'UBOT',
    channelOwnerEditors: { emails: [], slackUserIds: [] },
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

const buildTask = (overrides: Partial<Task> = {}): Task =>
  workTaskSchema.parse({
    assigneeSlackUserIds: [ASSIGNEE_USER],
    channelId: 'C123',
    completedAt: null,
    createdAt: NOW,
    id: 'TASK1',
    kind: 'work',
    messageTs: '1000.000',
    requesterSlackUserIds: [REQUESTER_USER],
    status: 'active',
    title: 'Ship the release fix',
    updatedAt: NOW,
    workspaceId: WORKSPACE_ID,
    ...overrides,
  });

test('complete task action refreshes App Home after updating task status', async () => {
  const slackGateway = new RecordingSlackGateway();
  const taskRepository = new InMemoryTaskRepository(buildTask());
  const workspaceRepository = new InMemoryWorkspaceRepository(buildWorkspace());
  const appHomeDeps = {
    appUrl: 'https://example.com',
    callScheduleRepository: emptyCallScheduleRepository,
    channelBlockRepository: emptyChannelBlockRepository,
    channelRepository: emptyChannelRepository,
    channelReviewStateRepository: emptyChannelReviewStateRepository,
    channelVisibility: {
      getVisibilityForSlackUser: async () => 'all' as const,
    },
    clock,
    idGenerator,
    slackGateway: slackGateway as unknown as SlackGateway,
    taskRepository,
    userProfileRepository: emptyUserProfileRepository,
    workspaceRepository,
  };

  await handleSlackTaskStatusAction({
    actionId: slackActionIds.completeTask,
    appHomeDeps,
    clock,
    overdueTaskNotificationRepository: emptyOverdueTaskNotificationRepository,
    slackGateway: slackGateway as unknown as SlackGateway,
    slackTeamId: WORKSPACE_ID,
    slackUserId: ASSIGNEE_USER,
    taskRepository,
    value: 'TASK1',
    workspaceRepository,
  });

  assert.equal(taskRepository.task.status, 'completed');
  assert.equal(taskRepository.task.completedAt, NOW);
  assert.equal(slackGateway.updatedMessages.length, 1);
  assert.deepEqual(slackGateway.updatedMessages[0], {
    channelId: 'C123',
    messageTs: '1000.000',
    text: 'Ship the release fix',
  });
  assert.equal(slackGateway.publishedHomeViews.length, 1);
  assert.equal(slackGateway.publishedHomeViews[0].userId, ASSIGNEE_USER);
  assert.doesNotMatch(
    JSON.stringify(slackGateway.publishedHomeViews[0].view),
    /Ship the release fix/u
  );
});
