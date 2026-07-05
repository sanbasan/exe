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
} from '../src/ports';
import { createChannelBlockMethods } from '../src/services/channel-block-methods';
import type { ChannelServiceDeps } from '../src/services/channel-service-contract';
import type { ChannelVisibilityService } from '../src/services/channel-visibility-service';
import {
  channelBlockSchema,
  workspaceSchema,
  type Channel,
  type ChannelBlock,
  type UserProfile,
  type Workspace,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const CREATED_AT = '2026-06-29T00:00:00.000Z';
const NOW = '2026-06-30T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const SLACK_USER_ID = 'UOWNER1';

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

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { generateId: () => 'id-1' };

const emptyChannelEventRepository: ChannelEventRepository = {
  create: async () => {},
  listByChannel: async () => [],
};

const emptyChannelReviewStateRepository: ChannelReviewStateRepository = {
  getByChannelAndUser: async () => null,
  listByWorkspace: async () => [],
  upsert: async () => {},
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
    createdAt: CREATED_AT,
    encryptedBotToken: 'bot-token',
    id: WORKSPACE_ID,
    language: 'ja',
    name: 'Workspace',
    slackTeamId: WORKSPACE_ID,
    timezone: 'Asia/Tokyo',
    updatedAt: CREATED_AT,
  });

const buildWorkspaceRepository = (
  workspace: Workspace
): WorkspaceRepository => ({
  acquireTokenRefreshLock: async () => true,
  getById: async ({ workspaceId }) =>
    workspaceId === workspace.id ? workspace : null,
  listAll: async () => [workspace],
  listByIds: async () => [workspace],
  releaseTokenRefreshLock: async () => {},
  updateTokens: async () => {},
  upsert: async () => {},
});

const buildChannel = (): Channel => ({
  assigneeSlackUserIds: [SLACK_USER_ID],
  channelId: 'C123',
  createdAt: CREATED_AT,
  createdBySlackUserId: SLACK_USER_ID,
  latestInfo: '進行中',
  name: 'project',
  status: 'active',
  updatedAt: CREATED_AT,
  watcherSlackUserIds: [],
  workspaceId: WORKSPACE_ID,
});

const buildChannelRepository = (channel: Channel): ChannelRepository => ({
  getById: async ({ channelId }) =>
    channelId === channel.channelId ? channel : null,
  listByWorkspace: async () => [channel],
  upsert: async () => {},
});

const buildChannelBlock = (): ChannelBlock =>
  channelBlockSchema.parse({
    channelId: 'C123',
    createdAt: CREATED_AT,
    createdBySlackUserId: SLACK_USER_ID,
    description: '資料待ち',
    id: 'BLOCK1',
    status: 'active',
    title: '承認待ち',
    updatedAt: CREATED_AT,
    workspaceId: WORKSPACE_ID,
  });

const memberChannelVisibility: ChannelVisibilityService = {
  getVisibilityForSlackUser: async () => ({
    isGuest: false,
    joinedChannelIds: new Set(['C123']),
  }),
};

const nonMemberChannelVisibility: ChannelVisibilityService = {
  getVisibilityForSlackUser: async () => ({
    isGuest: false,
    joinedChannelIds: new Set(['C_OTHER']),
  }),
};

const buildDeps = (
  channelBlockRepository: ChannelBlockRepository,
  channelVisibility: ChannelVisibilityService = memberChannelVisibility
): ChannelServiceDeps => ({
  channelBlockRepository,
  channelEventRepository: emptyChannelEventRepository,
  channelRepository: buildChannelRepository(buildChannel()),
  channelReviewStateRepository: emptyChannelReviewStateRepository,
  channelVisibility,
  clock,
  idGenerator,
  slackGateway: {} as unknown as SlackGateway,
  userProfileRepository: emptyUserProfileRepository,
  workspaceRepository: buildWorkspaceRepository(buildWorkspace()),
});

test('updateChannelBlockForSlackUser updates title and description', async () => {
  const repository = new InMemoryChannelBlockRepository([buildChannelBlock()]);
  const methods = createChannelBlockMethods(buildDeps(repository));

  const updated = await methods.updateChannelBlockForSlackUser({
    blockId: 'BLOCK1',
    input: { description: '先方の返答待ち', title: 'レビュー待ち' },
    slackUserId: SLACK_USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(updated.title, 'レビュー待ち');
  assert.equal(updated.description, '先方の返答待ち');
  assert.equal(updated.updatedAt, NOW);
  assert.equal(updated.createdAt, CREATED_AT);
  assert.equal(updated.status, 'active');
  assert.deepEqual(repository.blocks.get('BLOCK1'), updated);
});

test('updateChannelBlockForSlackUser keeps omitted fields unchanged', async () => {
  const repository = new InMemoryChannelBlockRepository([buildChannelBlock()]);
  const methods = createChannelBlockMethods(buildDeps(repository));

  const updated = await methods.updateChannelBlockForSlackUser({
    blockId: 'BLOCK1',
    input: { title: 'レビュー待ち' },
    slackUserId: SLACK_USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(updated.title, 'レビュー待ち');
  assert.equal(updated.description, '資料待ち');
  assert.equal(updated.updatedAt, NOW);
});

test('updateChannelBlockForSlackUser rejects an unknown block', async () => {
  const repository = new InMemoryChannelBlockRepository([]);
  const methods = createChannelBlockMethods(buildDeps(repository));

  await assert.rejects(
    methods.updateChannelBlockForSlackUser({
      blockId: 'MISSING',
      input: { title: 'レビュー待ち' },
      slackUserId: SLACK_USER_ID,
      workspaceId: WORKSPACE_ID,
    }),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'not_found'
  );
});

test('updateChannelBlockForSlackUser rejects a user without channel access', async () => {
  const repository = new InMemoryChannelBlockRepository([buildChannelBlock()]);
  const methods = createChannelBlockMethods(
    buildDeps(repository, nonMemberChannelVisibility)
  );

  await assert.rejects(
    methods.updateChannelBlockForSlackUser({
      blockId: 'BLOCK1',
      input: { title: 'レビュー待ち' },
      slackUserId: 'USTRANGER',
      workspaceId: WORKSPACE_ID,
    }),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'forbidden'
  );
});

test('deleteChannelBlockForSlackUser deletes the block', async () => {
  const repository = new InMemoryChannelBlockRepository([buildChannelBlock()]);
  const methods = createChannelBlockMethods(buildDeps(repository));

  const deleted = await methods.deleteChannelBlockForSlackUser({
    blockId: 'BLOCK1',
    slackUserId: SLACK_USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(deleted.id, 'BLOCK1');
  assert.equal(repository.blocks.has('BLOCK1'), false);
});

test('deleteChannelBlockForSlackUser rejects an unknown block', async () => {
  const repository = new InMemoryChannelBlockRepository([]);
  const methods = createChannelBlockMethods(buildDeps(repository));

  await assert.rejects(
    methods.deleteChannelBlockForSlackUser({
      blockId: 'MISSING',
      slackUserId: SLACK_USER_ID,
      workspaceId: WORKSPACE_ID,
    }),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'not_found'
  );
});

test('deleteChannelBlockForSlackUser rejects a user without channel access', async () => {
  const repository = new InMemoryChannelBlockRepository([buildChannelBlock()]);
  const methods = createChannelBlockMethods(
    buildDeps(repository, nonMemberChannelVisibility)
  );

  await assert.rejects(
    methods.deleteChannelBlockForSlackUser({
      blockId: 'BLOCK1',
      slackUserId: 'USTRANGER',
      workspaceId: WORKSPACE_ID,
    }),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'forbidden'
  );
  assert.equal(repository.blocks.has('BLOCK1'), true);
});
