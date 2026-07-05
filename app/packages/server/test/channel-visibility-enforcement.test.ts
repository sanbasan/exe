import type {
  ChannelBlockRepository,
  ChannelEventRepository,
  ChannelRepository,
  ChannelReviewStateRepository,
  Clock,
  IdGenerator,
  SlackGateway,
  UserProfileRepository,
  WorkspaceRepository,
  WorkspaceTokenFields,
} from '../src/ports';
import { createChannelService } from '../src/services/channel-service';
import type { ChannelServiceDeps } from '../src/services/channel-service-contract';
import type { ChannelVisibilityService } from '../src/services/channel-visibility-service';
import {
  channelBlockSchema,
  channelReviewStateSchema,
  userProfileSchema,
  workspaceSchema,
  type Channel,
  type ChannelBlock,
  type ChannelReviewState,
  type UserProfile,
  type Workspace,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-30T00:00:00.000Z';
const WORKSPACE_ID = 'T1';
const USER_ID = 'user-1';
const SLACK_USER_ID = 'U1';

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { generateId: () => 'id-1' };

class InMemoryChannelRepository implements ChannelRepository {
  public channels: Map<string, Channel>;

  public constructor(channels: readonly Channel[]) {
    this.channels = new Map(
      channels.map((channel) => [channel.channelId, channel])
    );
  }

  public getById = async ({
    channelId,
  }: {
    readonly channelId: string;
    readonly workspaceId: string;
  }): Promise<Channel | null> => this.channels.get(channelId) ?? null;

  public listByWorkspace = async (): Promise<readonly Channel[]> => [
    ...this.channels.values(),
  ];

  public upsert = async ({
    channel,
  }: {
    readonly channel: Channel;
  }): Promise<void> => {
    this.channels.set(channel.channelId, channel);
  };
}

class InMemoryChannelBlockRepository implements ChannelBlockRepository {
  public blocks: Map<string, ChannelBlock>;

  public constructor(blocks: readonly ChannelBlock[]) {
    this.blocks = new Map(blocks.map((block) => [block.id, block]));
  }

  public create = async ({
    block,
  }: {
    readonly block: ChannelBlock;
  }): Promise<void> => {
    this.blocks.set(block.id, block);
  };

  public delete = async ({
    blockId,
  }: {
    readonly blockId: string;
    readonly workspaceId: string;
  }): Promise<void> => {
    this.blocks.delete(blockId);
  };

  public getById = async ({
    blockId,
  }: {
    readonly blockId: string;
    readonly workspaceId: string;
  }): Promise<ChannelBlock | null> => this.blocks.get(blockId) ?? null;

  public listByWorkspace = async (): Promise<readonly ChannelBlock[]> => [
    ...this.blocks.values(),
  ];

  public update = async ({
    block,
  }: {
    readonly block: ChannelBlock;
  }): Promise<void> => {
    this.blocks.set(block.id, block);
  };
}

const emptyChannelEventRepository: ChannelEventRepository = {
  create: async () => {},
  listByChannel: async () => [],
};

const emptyChannelReviewStateRepository: ChannelReviewStateRepository = {
  getByChannelAndUser: async () => null,
  listByWorkspace: async () => [],
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

const buildUserProfile = (): UserProfile =>
  userProfileSchema.parse({
    createdAt: NOW,
    email: 'user@example.com',
    id: USER_ID,
    slackUsers: [
      {
        slackTeamId: WORKSPACE_ID,
        slackUserId: SLACK_USER_ID,
        verifiedAt: NOW,
        workspaceId: WORKSPACE_ID,
      },
    ],
    updatedAt: NOW,
    workspaceIds: [WORKSPACE_ID],
  });

const buildUserProfileRepository = (): UserProfileRepository => {
  const profile = buildUserProfile();

  return {
    getById: async ({ userId }) => (userId === USER_ID ? profile : null),
    listByWorkspace: async (): Promise<readonly UserProfile[]> => [profile],
    upsert: async () => {},
  };
};

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

// X: private, the user has joined it via Slack.
// Z: public, the user has not explicitly joined it but any non-guest member
//    could self-join, so it is visible.
// W: private, the user has neither joined it nor can self-join it.
const buildChannel = (
  channelId: string,
  overrides: Partial<Channel> = {}
): Channel => ({
  assigneeSlackUserIds: [],
  channelId,
  createdAt: NOW,
  createdBySlackUserId: SLACK_USER_ID,
  name: channelId,
  status: 'active',
  updatedAt: NOW,
  watcherSlackUserIds: [],
  workspaceId: WORKSPACE_ID,
  ...overrides,
});

const CHANNEL_X = buildChannel('CX', { isPrivate: true });
const CHANNEL_Z = buildChannel('CZ', { isPrivate: false });
const CHANNEL_W = buildChannel('CW', { isPrivate: true });

const buildChannelBlock = (channelId: string, id: string): ChannelBlock =>
  channelBlockSchema.parse({
    channelId,
    createdAt: NOW,
    createdBySlackUserId: SLACK_USER_ID,
    description: 'blocked',
    id,
    status: 'active',
    title: 'blocked',
    updatedAt: NOW,
    workspaceId: WORKSPACE_ID,
  });

const guestVisibility: ChannelVisibilityService = {
  getVisibilityForSlackUser: async () => ({
    isGuest: true,
    joinedChannelIds: new Set(['CX']),
  }),
};

const memberVisibility: ChannelVisibilityService = {
  getVisibilityForSlackUser: async () => ({
    isGuest: false,
    joinedChannelIds: new Set(['CX']),
  }),
};

const adminVisibility: ChannelVisibilityService = {
  getVisibilityForSlackUser: async () => 'all',
};

const buildDeps = ({
  channelBlockRepository,
  channelRepository,
  channelReviewStateRepository,
  channelVisibility,
}: {
  readonly channelBlockRepository: ChannelBlockRepository;
  readonly channelRepository: ChannelRepository;
  readonly channelReviewStateRepository?: ChannelReviewStateRepository;
  readonly channelVisibility: ChannelVisibilityService;
}): ChannelServiceDeps => ({
  channelBlockRepository,
  channelEventRepository: emptyChannelEventRepository,
  channelRepository,
  channelReviewStateRepository:
    channelReviewStateRepository ?? emptyChannelReviewStateRepository,
  channelVisibility,
  clock,
  idGenerator,
  slackGateway: {} as unknown as SlackGateway,
  userProfileRepository: buildUserProfileRepository(),
  workspaceRepository: new InMemoryWorkspaceRepository(buildWorkspace()),
});

const buildReviewState = (channelId: string, id: string): ChannelReviewState =>
  channelReviewStateSchema.parse({
    channelId,
    createdAt: NOW,
    id,
    slackUserId: 'UOTHER',
    statusText: `status for ${channelId}`,
    updatedAt: NOW,
    workspaceId: WORKSPACE_ID,
  });

test('guest visibility only surfaces the joined channel, even when a public channel exists', async () => {
  const channelRepository = new InMemoryChannelRepository([
    CHANNEL_X,
    CHANNEL_Z,
  ]);
  const channelBlockRepository = new InMemoryChannelBlockRepository([]);
  const service = createChannelService(
    buildDeps({
      channelBlockRepository,
      channelRepository,
      channelVisibility: guestVisibility,
    })
  );

  const channels = await service.listChannelsForUser({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(
    channels.map((channel) => channel.channelId),
    ['CX']
  );
});

test('non-guest member sees the joined channel and public channels, but not private ones', async () => {
  const channelRepository = new InMemoryChannelRepository([
    CHANNEL_X,
    CHANNEL_Z,
    CHANNEL_W,
  ]);
  const channelBlockRepository = new InMemoryChannelBlockRepository([]);
  const service = createChannelService(
    buildDeps({
      channelBlockRepository,
      channelRepository,
      channelVisibility: memberVisibility,
    })
  );

  const channels = await service.listChannelsForUser({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(channels.map((channel) => channel.channelId).toSorted(), [
    'CX',
    'CZ',
  ]);

  await assert.rejects(
    service.getChannelForUser({
      channelId: 'CW',
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    }),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'forbidden'
  );
});

test("visibility 'all' (workspace admin) sees every channel without filtering", async () => {
  const channelRepository = new InMemoryChannelRepository([
    CHANNEL_X,
    CHANNEL_Z,
    CHANNEL_W,
  ]);
  const channelBlockRepository = new InMemoryChannelBlockRepository([]);
  const service = createChannelService(
    buildDeps({
      channelBlockRepository,
      channelRepository,
      channelVisibility: adminVisibility,
    })
  );

  const channels = await service.listChannelsForUser({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(channels.map((channel) => channel.channelId).toSorted(), [
    'CW',
    'CX',
    'CZ',
  ]);

  const channel = await service.getChannelForUser({
    channelId: 'CW',
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(channel.channelId, 'CW');
});

test('listChannelBlocksForUser returns only blocks of visible channels', async () => {
  const channelRepository = new InMemoryChannelRepository([
    CHANNEL_X,
    CHANNEL_W,
  ]);
  const channelBlockRepository = new InMemoryChannelBlockRepository([
    buildChannelBlock('CX', 'BLOCK_X'),
    buildChannelBlock('CW', 'BLOCK_W'),
  ]);
  const service = createChannelService(
    buildDeps({
      channelBlockRepository,
      channelRepository,
      channelVisibility: memberVisibility,
    })
  );

  const blocks = await service.listChannelBlocksForUser({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(
    blocks.map((block) => block.id),
    ['BLOCK_X']
  );
});

void test('listChannelReviewStatesForWorkspace returns only states of visible channels', async () => {
  const channelRepository = new InMemoryChannelRepository([
    CHANNEL_X,
    CHANNEL_Z,
    CHANNEL_W,
  ]);
  const channelReviewStateRepository: ChannelReviewStateRepository = {
    getByChannelAndUser: async () => null,
    listByWorkspace: async () => [
      buildReviewState('CX', 'STATE_X'),
      buildReviewState('CZ', 'STATE_Z'),
      buildReviewState('CW', 'STATE_W'),
    ],
    upsert: async () => {},
  };
  const service = createChannelService(
    buildDeps({
      channelBlockRepository: new InMemoryChannelBlockRepository([]),
      channelRepository,
      channelReviewStateRepository,
      channelVisibility: memberVisibility,
    })
  );

  const states = await service.listChannelReviewStatesForWorkspace({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(
    states.map((state) => state.id),
    ['STATE_X', 'STATE_Z']
  );
});

test('putWatchedChannelsForUser silently ignores requests to watch an invisible channel', async () => {
  const channelRepository = new InMemoryChannelRepository([
    CHANNEL_X,
    CHANNEL_W,
  ]);
  const channelBlockRepository = new InMemoryChannelBlockRepository([]);
  const service = createChannelService(
    buildDeps({
      channelBlockRepository,
      channelRepository,
      channelVisibility: memberVisibility,
    })
  );

  const watched = await service.putWatchedChannelsForUser({
    channelIds: ['CX', 'CW'],
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(
    watched.map((channel) => channel.channelId),
    ['CX']
  );
  assert.equal(
    channelRepository.channels
      .get('CW')
      ?.watcherSlackUserIds.includes(SLACK_USER_ID),
    false
  );
});

test('putWatchedChannelsForUser still allows unwatching a channel that is no longer visible', async () => {
  const channelRepository = new InMemoryChannelRepository([
    CHANNEL_X,
    buildChannel('CW', {
      isPrivate: true,
      watcherSlackUserIds: [SLACK_USER_ID],
    }),
  ]);
  const channelBlockRepository = new InMemoryChannelBlockRepository([]);
  const service = createChannelService(
    buildDeps({
      channelBlockRepository,
      channelRepository,
      channelVisibility: memberVisibility,
    })
  );

  const watched = await service.putWatchedChannelsForUser({
    channelIds: [],
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.deepEqual(watched, []);
  assert.equal(
    channelRepository.channels
      .get('CW')
      ?.watcherSlackUserIds.includes(SLACK_USER_ID),
    false
  );
});
