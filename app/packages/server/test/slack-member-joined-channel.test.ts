import type {
  ChannelRepository,
  Clock,
  SlackChannelInfo,
  SlackGateway,
  WorkspaceRepository,
  WorkspaceTokenFields,
} from '../src/ports';
import { ensureSlackChannel } from '../src/services/slack-channel';
import { handleSlackMemberJoinedChannel } from '../src/services/slack-member-joined-channel';
import { channelSchema, workspaceSchema, type Channel } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-07-01T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const BOT_USER = 'UBOT';
const INVITER_USER = 'UINVITER';
const MENTION_USER = 'UMENTION';

class InMemoryChannelRepository implements ChannelRepository {
  public channels: Channel[];

  public constructor(channels: readonly Channel[] = []) {
    this.channels = [...channels];
  }

  public getById = async ({
    channelId,
    workspaceId,
  }: {
    readonly channelId: string;
    readonly workspaceId: string;
  }): Promise<Channel | null> =>
    this.channels.find(
      (channel) =>
        channel.channelId === channelId && channel.workspaceId === workspaceId
    ) ?? null;

  public listByWorkspace = async ({
    workspaceId,
  }: {
    readonly workspaceId: string;
  }): Promise<readonly Channel[]> =>
    this.channels.filter((channel) => channel.workspaceId === workspaceId);

  public upsert = async ({
    channel,
  }: {
    readonly channel: Channel;
  }): Promise<void> => {
    const index = this.channels.findIndex(
      (existing) =>
        existing.channelId === channel.channelId &&
        existing.workspaceId === channel.workspaceId
    );

    if (index === -1) {
      this.channels = [...this.channels, channel];
      return;
    }

    this.channels = this.channels.with(index, channel);
  };
}

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  public constructor(public workspace = buildWorkspace()) {}

  public acquireTokenRefreshLock = async (): Promise<boolean> => true;

  public getById = async (): Promise<typeof this.workspace> => this.workspace;

  public listAll = async (): Promise<readonly (typeof this.workspace)[]> => [
    this.workspace,
  ];

  public listByIds = async (): Promise<readonly (typeof this.workspace)[]> => [
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
    readonly workspace: typeof this.workspace;
  }): Promise<void> => {
    this.workspace = workspace;
  };
}

class RecordingSlackGateway {
  public constructor(
    private readonly channels: ReadonlyMap<string, SlackChannelInfo>
  ) {}

  public getChannelInfo = async ({
    channelId,
  }: {
    readonly botToken: string;
    readonly channelId: string;
  }): Promise<SlackChannelInfo | null> => this.channels.get(channelId) ?? null;
}

const clock: Clock = { now: () => NOW };

const buildWorkspace = () =>
  workspaceSchema.parse({
    admin: { emails: ['admin@example.com'], slackUserIds: ['UADMIN'] },
    botUserId: BOT_USER,
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

const buildChannel = (overrides: Partial<Channel> = {}): Channel =>
  channelSchema.parse({
    assigneeSlackUserIds: ['UASSIGNEE'],
    channelId: 'C123',
    createdAt: '2026-06-30T00:00:00.000Z',
    createdBySlackUserId: 'UCREATOR',
    name: 'old-name',
    status: 'active',
    updatedAt: '2026-06-30T00:00:00.000Z',
    watcherSlackUserIds: ['UWATCHER'],
    workspaceId: WORKSPACE_ID,
    ...overrides,
  });

const buildDeps = ({
  channels = [],
  slackChannels = new Map<string, SlackChannelInfo>([
    ['C123', { id: 'C123', isIm: false, name: 'project' }],
  ]),
}: {
  readonly channels?: readonly Channel[];
  readonly slackChannels?: ReadonlyMap<string, SlackChannelInfo>;
} = {}) => {
  const channelRepository = new InMemoryChannelRepository(channels);
  const slackGateway = new RecordingSlackGateway(slackChannels);
  const workspaceRepository = new InMemoryWorkspaceRepository();

  return {
    channelRepository,
    deps: {
      channelRepository,
      clock,
      slackGateway: slackGateway as unknown as SlackGateway,
      workspaceRepository,
    },
    slackGateway,
    workspaceRepository,
  };
};

test('bot member_joined_channel saves a new channel with inviter as owner', async () => {
  const { channelRepository, deps } = buildDeps();

  await handleSlackMemberJoinedChannel({
    channelId: 'C123',
    deps,
    inviterSlackUserId: INVITER_USER,
    slackTeamId: WORKSPACE_ID,
    slackUserId: BOT_USER,
  });

  assert.equal(channelRepository.channels.length, 1);
  assert.equal(channelRepository.channels[0]?.name, 'project');
  assert.deepEqual(channelRepository.channels[0]?.assigneeSlackUserIds, [
    INVITER_USER,
  ]);
  assert.equal(
    channelRepository.channels[0]?.createdBySlackUserId,
    INVITER_USER
  );
});

test('bot member_joined_channel without inviter saves a channel with no owners', async () => {
  const { channelRepository, deps } = buildDeps();

  await handleSlackMemberJoinedChannel({
    channelId: 'C123',
    deps,
    slackTeamId: WORKSPACE_ID,
    slackUserId: BOT_USER,
  });

  assert.equal(channelRepository.channels.length, 1);
  assert.deepEqual(channelRepository.channels[0]?.assigneeSlackUserIds, []);
  assert.equal(channelRepository.channels[0]?.createdBySlackUserId, BOT_USER);
});

test('member_joined_channel is no-op for non-bot users', async () => {
  const { channelRepository, deps } = buildDeps();

  await handleSlackMemberJoinedChannel({
    channelId: 'C123',
    deps,
    inviterSlackUserId: INVITER_USER,
    slackTeamId: WORKSPACE_ID,
    slackUserId: 'UOTHER',
  });

  assert.deepEqual(channelRepository.channels, []);
});

test('member_joined_channel refreshes existing channel name without overwriting metadata', async () => {
  const existing = buildChannel({
    assigneeSlackUserIds: ['UOWNER'],
    latestInfo: 'Still waiting on legal.',
    latestInfoUpdatedAt: '2026-06-30T01:00:00.000Z',
    name: 'old-project',
    status: 'archived',
    watcherSlackUserIds: ['UWATCHER'],
  });
  const { channelRepository, deps } = buildDeps({
    channels: [existing],
    slackChannels: new Map([
      ['C123', { id: 'C123', isIm: false, name: 'new-project' }],
    ]),
  });

  await handleSlackMemberJoinedChannel({
    channelId: 'C123',
    deps,
    inviterSlackUserId: INVITER_USER,
    slackTeamId: WORKSPACE_ID,
    slackUserId: BOT_USER,
  });

  assert.deepEqual(channelRepository.channels[0], {
    ...existing,
    name: 'new-project',
    status: 'active',
    updatedAt: NOW,
  });
});

test('app mention channel ensure keeps mention user as initial owner', async () => {
  const { channelRepository, deps, workspaceRepository } = buildDeps();

  await ensureSlackChannel({
    channelId: 'C123',
    channelRepository,
    clock,
    slackGateway: deps.slackGateway,
    slackUserId: MENTION_USER,
    workspace: workspaceRepository.workspace,
    workspaceRepository,
  });

  assert.deepEqual(channelRepository.channels[0]?.assigneeSlackUserIds, [
    MENTION_USER,
  ]);
  assert.equal(
    channelRepository.channels[0]?.createdBySlackUserId,
    MENTION_USER
  );
});
