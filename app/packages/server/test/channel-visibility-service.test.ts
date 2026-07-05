import type {
  Clock,
  SlackGateway,
  SlackUserConversations,
  SlackUserLookup,
  WorkspaceRepository,
  WorkspaceTokenFields,
} from '../src/ports';
import type { ChannelVisibility } from '../src/services/channel-access';
import { createChannelVisibilityService } from '../src/services/channel-visibility-service';
import {
  workspaceSchema,
  type ChannelVisibilityContext,
  type Workspace,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-27T00:00:00.000Z';
const FAR_FUTURE = '2026-06-27T01:00:00.000Z';

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  public lock: null | {
    readonly expiresAt: string;
    readonly ownerId: string;
    readonly updatedAt: string;
  } = null;

  public workspace: Workspace;

  public constructor(workspace: Workspace) {
    this.workspace = workspace;
  }

  public acquireTokenRefreshLock = async ({
    expiresAt,
    now,
    ownerId,
  }: {
    readonly expiresAt: string;
    readonly now: string;
    readonly ownerId: string;
    readonly workspaceId: string;
  }): Promise<boolean> => {
    if (
      this.lock !== null &&
      Date.parse(this.lock.expiresAt) > Date.parse(now)
    ) {
      return false;
    }

    this.lock = { expiresAt, ownerId, updatedAt: now };

    return true;
  };

  public getById = async (): Promise<Workspace | null> => this.workspace;

  public listAll = async (): Promise<readonly Workspace[]> => [this.workspace];

  public listByIds = async (): Promise<readonly Workspace[]> => [
    this.workspace,
  ];

  public releaseTokenRefreshLock = async ({
    ownerId,
  }: {
    readonly ownerId: string;
    readonly workspaceId: string;
  }): Promise<void> => {
    if (this.lock?.ownerId === ownerId) {
      this.lock = null;
    }
  };

  public updateTokens = async ({
    tokens,
  }: {
    readonly tokens: WorkspaceTokenFields;
    readonly workspaceId: string;
  }): Promise<void> => {
    this.workspace = workspaceSchema.parse({
      ...this.workspace,
      ...tokens,
    });
  };

  public upsert = async ({
    workspace,
  }: {
    readonly workspace: Workspace;
  }): Promise<void> => {
    this.workspace = workspace;
  };
}

const clock: Clock = { now: () => NOW };

const buildWorkspace = (overrides: Partial<Workspace> = {}): Workspace =>
  workspaceSchema.parse({
    admin: { emails: ['admin@example.com'], slackUserIds: ['U_ADMIN'] },
    botTokenExpiresAt: FAR_FUTURE,
    botUserId: 'U_BOT',
    createdAt: NOW,
    encryptedBotRefreshToken: 'refresh-old',
    encryptedBotToken: 'token-old',
    id: 'T_WORKSPACE',
    language: 'ja',
    name: 'Workspace',
    slackTeamId: 'T_WORKSPACE',
    timezone: 'Asia/Tokyo',
    updatedAt: NOW,
    ...overrides,
  });

const okUser = (): SlackUserLookup => ({
  status: 'ok',
  user: {
    email: 'user@example.com',
    slackUserId: 'U_USER',
  },
});

const createSlackGateway = (params?: {
  readonly getUserInfo?: SlackGateway['getUserInfo'];
  readonly listUserJoinedChannelIds?: SlackGateway['listUserJoinedChannelIds'];
}): SlackGateway => ({
  deleteMessage: async () => {},
  exchangeCodeForInstallation: async () => {
    throw new Error('not implemented');
  },
  getChannelInfo: async () => null,
  getReplies: async () => [],
  getUserInfo:
    params?.getUserInfo ??
    (async (): Promise<SlackUserLookup> => ({
      status: 'indeterminate',
    })),
  getWorkspaceInfo: async () => null,
  listBotJoinedChannels: async () => [],
  listUserJoinedChannelIds:
    params?.listUserJoinedChannelIds ??
    (async (): Promise<SlackUserConversations> => ({
      status: 'indeterminate',
    })),
  listWorkspaceMembers: async () => [],
  lookupUserByEmail: async (): Promise<SlackUserLookup> => ({
    status: 'indeterminate',
  }),
  openView: async () => {},
  postMessage: async () => '1.0',
  publishHomeView: async () => {},
  refreshBotToken: async () => ({
    accessToken: 'token-new',
    expiresInSeconds: 3600,
    refreshToken: 'refresh-new',
  }),
  updateMessage: async () => {},
  updateView: async () => {},
  verifyMembershipByEmail: async () => ({ status: 'indeterminate' }),
});

const createService = ({
  slackGateway,
  workspace = buildWorkspace(),
}: {
  readonly slackGateway: SlackGateway;
  readonly workspace?: Workspace;
}) => ({
  service: createChannelVisibilityService({
    clock,
    slackGateway,
    workspaceRepository: new InMemoryWorkspaceRepository(workspace),
  }),
  workspace,
});

const expectVisibilityContext = (
  visibility: ChannelVisibility
): ChannelVisibilityContext => {
  if (visibility === 'all') {
    throw new Error('Expected channel visibility context.');
  }

  return visibility;
};

test('admin visibility bypasses Slack lookups', async () => {
  let getUserInfoCalls = 0;
  let listUserJoinedChannelIdsCalls = 0;
  const { service, workspace } = createService({
    slackGateway: createSlackGateway({
      getUserInfo: async () => {
        getUserInfoCalls += 1;

        return okUser();
      },
      listUserJoinedChannelIds: async () => {
        listUserJoinedChannelIdsCalls += 1;

        return { channelIds: ['C1'], status: 'ok' };
      },
    }),
  });

  const visibility = await service.getVisibilityForSlackUser({
    slackUserId: 'U_ADMIN',
    workspace,
  });

  assert.equal(visibility, 'all');
  assert.equal(getUserInfoCalls, 0);
  assert.equal(listUserJoinedChannelIdsCalls, 0);
});

test('non-admin member visibility includes joined channels', async () => {
  const { service, workspace } = createService({
    slackGateway: createSlackGateway({
      getUserInfo: async () => okUser(),
      listUserJoinedChannelIds: async () => ({
        channelIds: ['C1', 'C2'],
        status: 'ok',
      }),
    }),
  });

  const visibility = expectVisibilityContext(
    await service.getVisibilityForSlackUser({
      slackUserId: 'U_USER',
      workspace,
    })
  );

  assert.equal(visibility.isGuest, false);
  assert.deepEqual([...visibility.joinedChannelIds].sort(), ['C1', 'C2']);
});

test('guest user visibility keeps joined channels', async () => {
  const { service, workspace } = createService({
    slackGateway: createSlackGateway({
      getUserInfo: async () => ({ status: 'is_restricted' }),
      listUserJoinedChannelIds: async () => ({
        channelIds: ['C1', 'C2'],
        status: 'ok',
      }),
    }),
  });

  const visibility = expectVisibilityContext(
    await service.getVisibilityForSlackUser({
      slackUserId: 'U_GUEST',
      workspace,
    })
  );

  assert.equal(visibility.isGuest, true);
  assert.deepEqual([...visibility.joinedChannelIds].sort(), ['C1', 'C2']);
});

test('invisible user info produces empty guest visibility', async () => {
  const { service, workspace } = createService({
    slackGateway: createSlackGateway({
      getUserInfo: async () => ({ status: 'user_not_found' }),
      listUserJoinedChannelIds: async () => ({
        channelIds: ['C1', 'C2'],
        status: 'ok',
      }),
    }),
  });

  const visibility = expectVisibilityContext(
    await service.getVisibilityForSlackUser({
      slackUserId: 'U_MISSING',
      workspace,
    })
  );

  assert.equal(visibility.isGuest, true);
  assert.deepEqual([...visibility.joinedChannelIds], []);
});

test('missing user conversations produce empty guest visibility', async () => {
  const { service, workspace } = createService({
    slackGateway: createSlackGateway({
      getUserInfo: async () => okUser(),
      listUserJoinedChannelIds: async () => ({ status: 'user_not_found' }),
    }),
  });

  const visibility = expectVisibilityContext(
    await service.getVisibilityForSlackUser({
      slackUserId: 'U_MISSING',
      workspace,
    })
  );

  assert.equal(visibility.isGuest, true);
  assert.deepEqual([...visibility.joinedChannelIds], []);
});

test('indeterminate conversations reject visibility resolution', async () => {
  const { service, workspace } = createService({
    slackGateway: createSlackGateway({
      getUserInfo: async () => okUser(),
      listUserJoinedChannelIds: async () => ({ status: 'indeterminate' }),
    }),
  });

  await assert.rejects(
    service.getVisibilityForSlackUser({
      slackUserId: 'U_USER',
      workspace,
    }),
    /Slack channel visibility could not be resolved/u
  );
});

test('every lookup resolves live from Slack (no shared state)', async () => {
  let getUserInfoCalls = 0;
  let listUserJoinedChannelIdsCalls = 0;
  const { service, workspace } = createService({
    slackGateway: createSlackGateway({
      getUserInfo: async () => {
        getUserInfoCalls += 1;

        return okUser();
      },
      listUserJoinedChannelIds: async () => {
        listUserJoinedChannelIdsCalls += 1;

        return { channelIds: ['C1'], status: 'ok' };
      },
    }),
  });

  const first = service.getVisibilityForSlackUser({
    slackUserId: 'U_USER',
    workspace,
  });
  const second = service.getVisibilityForSlackUser({
    slackUserId: 'U_USER',
    workspace,
  });

  const [firstVisibility, secondVisibility] = (
    await Promise.all([first, second])
  ).map(expectVisibilityContext);

  assert.equal(getUserInfoCalls, 2);
  assert.equal(listUserJoinedChannelIdsCalls, 2);
  assert.deepEqual([...firstVisibility.joinedChannelIds], ['C1']);
  assert.deepEqual([...secondVisibility.joinedChannelIds], ['C1']);
});

test('settled visibility lookups are not cached', async () => {
  let listUserJoinedChannelIdsCalls = 0;
  const { service, workspace } = createService({
    slackGateway: createSlackGateway({
      getUserInfo: async () => okUser(),
      listUserJoinedChannelIds: async () => {
        listUserJoinedChannelIdsCalls += 1;

        return { channelIds: ['C1'], status: 'ok' };
      },
    }),
  });

  await service.getVisibilityForSlackUser({
    slackUserId: 'U_USER',
    workspace,
  });
  assert.equal(listUserJoinedChannelIdsCalls, 1);

  await service.getVisibilityForSlackUser({
    slackUserId: 'U_USER',
    workspace,
  });

  assert.equal(listUserJoinedChannelIdsCalls, 2);
});
