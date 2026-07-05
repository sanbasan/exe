import type {
  CallScheduleRepository,
  ChannelBlockRepository,
  ChannelRepository,
  ChannelReviewStateRepository,
  Clock,
  IdGenerator,
  SlackGateway,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
  WorkspaceTokenFields,
} from '../src/ports';
import { handleSlackChannelBlockResolveAction } from '../src/services/slack-channel-block-actions';
import {
  channelBlockSchema,
  workspaceSchema,
  type Channel,
  type ChannelBlock,
  type Task,
  type UserProfile,
  type Workspace,
} from '@exe/domain';
import { slackActionIds } from '@exe/slack';
import type { KnownBlock, View } from '@slack/types';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-30T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const SLACK_USER_ID = 'UOWNER1';

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

class InMemoryChannelBlockRepository implements ChannelBlockRepository {
  public block: ChannelBlock;

  public constructor(block: ChannelBlock) {
    this.block = block;
  }

  public create = async ({
    block,
  }: {
    readonly block: ChannelBlock;
  }): Promise<void> => {
    this.block = block;
  };

  public delete = async (): Promise<void> => {};

  public getById = async ({
    blockId,
  }: {
    readonly blockId: string;
    readonly workspaceId: string;
  }): Promise<ChannelBlock | null> =>
    blockId === this.block.id ? this.block : null;

  public listByWorkspace = async (): Promise<readonly ChannelBlock[]> => [
    this.block,
  ];

  public update = async ({
    block,
  }: {
    readonly block: ChannelBlock;
  }): Promise<void> => {
    this.block = block;
  };
}

interface UpdateMessageCall {
  readonly blocks: readonly KnownBlock[];
  readonly channelId: string;
  readonly messageTs: string;
  readonly text: string;
}

class RecordingSlackGateway {
  public publishedViews: View[] = [];

  public updatedMessages: UpdateMessageCall[] = [];

  public getWorkspaceInfo = async () => ({ domain: 'example' });

  public publishHomeView = async ({
    view,
  }: {
    readonly botToken: string;
    readonly userId: string;
    readonly view: View;
  }): Promise<void> => {
    this.publishedViews = [...this.publishedViews, view];
  };

  public updateMessage = async ({
    blocks,
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
      { blocks, channelId, messageTs, text },
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

const buildChannelRepository = (channel: Channel): ChannelRepository => ({
  getById: async ({ channelId }) =>
    channelId === channel.channelId ? channel : null,
  listByWorkspace: async () => [channel],
  upsert: async () => {},
});

const emptyChannelReviewStateRepository: ChannelReviewStateRepository = {
  getByChannelAndUser: async () => null,
  listByWorkspace: async () => [],
  upsert: async () => {},
};

const emptyTaskRepository: TaskRepository = {
  create: async () => {},
  getById: async () => null,
  listByAssignee: async () => [],
  listByRequester: async () => [],
  listByWorkspace: async (): Promise<readonly Task[]> => [],
  update: async () => {},
};

const emptyUserProfileRepository: UserProfileRepository = {
  getById: async () => null,
  listByWorkspace: async (): Promise<readonly UserProfile[]> => [],
  upsert: async () => {},
};

const buildWorkspace = (): Workspace =>
  workspaceSchema.parse({
    admin: { emails: ['admin@example.com'], slackUserIds: [] },
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
  });

const buildChannel = (): Channel => ({
  assigneeSlackUserIds: [SLACK_USER_ID],
  channelId: 'C123',
  createdAt: NOW,
  createdBySlackUserId: SLACK_USER_ID,
  latestInfo: '進行中',
  name: 'project',
  status: 'active',
  updatedAt: NOW,
  watcherSlackUserIds: [],
  workspaceId: WORKSPACE_ID,
});

const buildChannelBlock = (
  overrides: Partial<ChannelBlock> = {}
): ChannelBlock =>
  channelBlockSchema.parse({
    channelId: 'C123',
    createdAt: NOW,
    createdBySlackUserId: SLACK_USER_ID,
    description: '資料待ち',
    id: 'BLOCK1',
    status: 'active',
    title: '承認待ち',
    updatedAt: NOW,
    workspaceId: WORKSPACE_ID,
    ...overrides,
  });

test('resolve channel block action resolves the block and refreshes App Home', async () => {
  const channel = buildChannel();
  const channelBlockRepository = new InMemoryChannelBlockRepository(
    buildChannelBlock()
  );
  const slackGateway = new RecordingSlackGateway();

  await handleSlackChannelBlockResolveAction({
    actionId: slackActionIds.resolveChannelBlock,
    deps: {
      appUrl: 'https://example.com',
      callScheduleRepository: emptyCallScheduleRepository,
      channelBlockRepository,
      channelRepository: buildChannelRepository(channel),
      channelReviewStateRepository: emptyChannelReviewStateRepository,
      channelVisibility: {
        getVisibilityForSlackUser: async () => 'all' as const,
      },
      clock,
      idGenerator,
      slackGateway: slackGateway as unknown as SlackGateway,
      taskRepository: emptyTaskRepository,
      userProfileRepository: emptyUserProfileRepository,
      workspaceRepository: new InMemoryWorkspaceRepository(buildWorkspace()),
    },
    slackTeamId: WORKSPACE_ID,
    slackUserId: SLACK_USER_ID,
    value: 'BLOCK1',
  });

  assert.equal(channelBlockRepository.block.status, 'resolved');
  assert.equal(channelBlockRepository.block.resolvedAt, NOW);
  assert.equal(slackGateway.publishedViews.length, 1);
  assert.doesNotMatch(
    JSON.stringify(slackGateway.publishedViews[0]),
    /承認待ち/u
  );
  assert.equal(slackGateway.updatedMessages.length, 0);
});

test('resolve channel block action rewrites the posted card when the block has a messageTs', async () => {
  const channel = buildChannel();
  const channelBlockRepository = new InMemoryChannelBlockRepository(
    buildChannelBlock({
      messageTs: '1700000000.000100',
      threadTs: '1699999999.000100',
    })
  );
  const slackGateway = new RecordingSlackGateway();

  await handleSlackChannelBlockResolveAction({
    actionId: slackActionIds.resolveChannelBlock,
    deps: {
      appUrl: 'https://example.com',
      callScheduleRepository: emptyCallScheduleRepository,
      channelBlockRepository,
      channelRepository: buildChannelRepository(channel),
      channelReviewStateRepository: emptyChannelReviewStateRepository,
      channelVisibility: {
        getVisibilityForSlackUser: async () => 'all' as const,
      },
      clock,
      idGenerator,
      slackGateway: slackGateway as unknown as SlackGateway,
      taskRepository: emptyTaskRepository,
      userProfileRepository: emptyUserProfileRepository,
      workspaceRepository: new InMemoryWorkspaceRepository(buildWorkspace()),
    },
    slackTeamId: WORKSPACE_ID,
    slackUserId: SLACK_USER_ID,
    value: 'BLOCK1',
  });

  assert.equal(slackGateway.updatedMessages.length, 1);
  assert.equal(slackGateway.updatedMessages[0].channelId, 'C123');
  assert.equal(slackGateway.updatedMessages[0].messageTs, '1700000000.000100');
  assert.match(
    JSON.stringify(slackGateway.updatedMessages[0].blocks),
    /:white_check_mark:/u
  );
});
