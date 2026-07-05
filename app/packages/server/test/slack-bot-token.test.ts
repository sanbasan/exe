import type {
  Clock,
  SlackGateway,
  SlackUserLookup,
  WorkspaceRepository,
  WorkspaceTokenFields,
} from '../src/ports';
import {
  getSlackBotToken,
  withSlackBotToken,
} from '../src/services/slack-bot-token';
import { workspaceSchema, type Workspace } from '@exe/domain';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

const NOW = '2026-06-27T00:00:00.000Z';
const FAR_FUTURE = '2026-06-27T01:00:00.000Z';
const EXPIRED = '2026-06-26T23:59:00.000Z';

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
    botTokenExpiresAt: EXPIRED,
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

const authError = (slackError: string): Error => {
  const error = new Error(slackError);

  Object.defineProperty(error, 'data', {
    value: { error: slackError },
  });

  return error;
};

const createSlackGateway = (params?: {
  readonly refresh?: SlackGateway['refreshBotToken'];
}): SlackGateway => ({
  exchangeCodeForInstallation: async () => {
    throw new Error('not implemented');
  },
  getChannelInfo: async () => null,
  getReplies: async () => [],
  getUserInfo: async (): Promise<SlackUserLookup> => ({
    status: 'indeterminate',
  }),
  getWorkspaceInfo: async () => null,
  listBotJoinedChannels: async () => [],
  listUserJoinedChannelIds: async () => ({ channelIds: [], status: 'ok' }),
  listWorkspaceMembers: async () => [],
  lookupUserByEmail: async (): Promise<SlackUserLookup> => ({
    status: 'indeterminate',
  }),
  openView: async () => {},
  postMessage: async () => '1.0',
  publishHomeView: async () => {},
  refreshBotToken:
    params?.refresh ??
    (async () => ({
      accessToken: 'token-new',
      expiresInSeconds: 3600,
      refreshToken: 'refresh-new',
    })),
  updateMessage: async () => {},
  verifyMembershipByEmail: async () => ({ status: 'indeterminate' }),
});

test('concurrent refreshes are serialized so Slack refresh is called once', async () => {
  let refreshCalls = 0;
  const workspaceRepository = new InMemoryWorkspaceRepository(buildWorkspace());
  const slackGateway = createSlackGateway({
    refresh: async () => {
      refreshCalls += 1;

      return {
        accessToken: 'token-new',
        expiresInSeconds: 3600,
        refreshToken: 'refresh-new',
      };
    },
  });

  const tokens = await Promise.all(
    [1, 2, 3].map(() =>
      getSlackBotToken({
        clock,
        slackGateway,
        workspace: workspaceRepository.workspace,
        workspaceRepository,
      })
    )
  );

  assert.deepEqual(tokens, ['token-new', 'token-new', 'token-new']);
  assert.equal(refreshCalls, 1);
});

test('a caller waiting on another live lock returns the saved refreshed token', async () => {
  let refreshCalls = 0;
  const workspaceRepository = new InMemoryWorkspaceRepository(buildWorkspace());

  workspaceRepository.lock = {
    expiresAt: '2026-06-27T00:00:30.000Z',
    ownerId: 'other-worker',
    updatedAt: NOW,
  };

  const token = await getSlackBotToken({
    clock,
    slackGateway: createSlackGateway({
      refresh: async () => {
        refreshCalls += 1;

        return { accessToken: 'unexpected' };
      },
    }),
    sleepMilliseconds: async () => {
      await workspaceRepository.updateTokens({
        tokens: {
          botTokenExpiresAt: FAR_FUTURE,
          encryptedBotRefreshToken: 'refresh-new',
          encryptedBotToken: 'token-written-by-other-worker',
          updatedAt: NOW,
        },
        workspaceId: workspaceRepository.workspace.id,
      });
    },
    workspace: workspaceRepository.workspace,
    workspaceRepository,
  });

  assert.equal(token, 'token-written-by-other-worker');
  assert.equal(refreshCalls, 0);
});

test('an expired token refresh lock can be acquired by a new owner', async () => {
  const workspaceRepository = new InMemoryWorkspaceRepository(buildWorkspace());

  workspaceRepository.lock = {
    expiresAt: '2026-06-26T23:59:59.000Z',
    ownerId: 'stale-worker',
    updatedAt: EXPIRED,
  };

  const acquired = await workspaceRepository.acquireTokenRefreshLock({
    expiresAt: '2026-06-27T00:00:30.000Z',
    now: NOW,
    ownerId: 'new-worker',
    workspaceId: workspaceRepository.workspace.id,
  });

  assert.equal(acquired, true);
  assert.equal(workspaceRepository.lock?.ownerId, 'new-worker');
});

test('the token refresh lock is released when Slack refresh throws', async () => {
  const workspaceRepository = new InMemoryWorkspaceRepository(buildWorkspace());

  await assert.rejects(
    getSlackBotToken({
      clock,
      slackGateway: createSlackGateway({
        refresh: async () => {
          throw new Error('refresh failed');
        },
      }),
      workspace: workspaceRepository.workspace,
      workspaceRepository,
    }),
    /refresh failed/u
  );

  assert.equal(workspaceRepository.lock, null);
});

test('partial token updates do not overwrite other workspace fields', async () => {
  const workspaceRepository = new InMemoryWorkspaceRepository(
    buildWorkspace({
      admin: { emails: ['owner@example.com'], slackUserIds: ['U_OWNER'] },
      timezone: 'America/Los_Angeles',
    })
  );

  await getSlackBotToken({
    clock,
    slackGateway: createSlackGateway(),
    workspace: workspaceRepository.workspace,
    workspaceRepository,
  });

  assert.deepEqual(workspaceRepository.workspace.admin, {
    emails: ['owner@example.com'],
    slackUserIds: ['U_OWNER'],
  });
  assert.equal(workspaceRepository.workspace.timezone, 'America/Los_Angeles');
});

test('reactive retry uses a saved newer token without refreshing', async () => {
  let refreshCalls = 0;
  const staleWorkspace = buildWorkspace({ botTokenExpiresAt: FAR_FUTURE });
  const workspaceRepository = new InMemoryWorkspaceRepository(
    buildWorkspace({
      botTokenExpiresAt: FAR_FUTURE,
      encryptedBotToken: 'token-newer-in-store',
    })
  );
  const usedTokens: string[] = [];
  const result = await withSlackBotToken({
    clock,
    run: async ({ botToken }) => {
      usedTokens.push(botToken);

      if (usedTokens.length === 1) {
        throw authError('token_revoked');
      }

      return 'ok';
    },
    slackGateway: createSlackGateway({
      refresh: async () => {
        refreshCalls += 1;

        return { accessToken: 'unexpected' };
      },
    }),
    workspace: staleWorkspace,
    workspaceRepository,
  });

  assert.equal(result, 'ok');
  assert.deepEqual(usedTokens, ['token-old', 'token-newer-in-store']);
  assert.equal(refreshCalls, 0);
});

test('reactive retry force-refreshes when the saved token is still stale', async () => {
  let refreshCalls = 0;
  const workspaceRepository = new InMemoryWorkspaceRepository(
    buildWorkspace({ botTokenExpiresAt: FAR_FUTURE })
  );
  const usedTokens: string[] = [];
  const result = await withSlackBotToken({
    clock,
    run: async ({ botToken }) => {
      usedTokens.push(botToken);

      if (usedTokens.length === 1) {
        throw authError('invalid_auth');
      }

      return 'ok';
    },
    slackGateway: createSlackGateway({
      refresh: async () => {
        refreshCalls += 1;

        return {
          accessToken: 'token-force-refreshed',
          expiresInSeconds: 3600,
          refreshToken: 'refresh-force-refreshed',
        };
      },
    }),
    workspace: workspaceRepository.workspace,
    workspaceRepository,
  });

  assert.equal(result, 'ok');
  assert.deepEqual(usedTokens, ['token-old', 'token-force-refreshed']);
  assert.equal(refreshCalls, 1);
});

test('reactive retry does not swallow a second Slack auth failure', async () => {
  const workspaceRepository = new InMemoryWorkspaceRepository(
    buildWorkspace({ botTokenExpiresAt: FAR_FUTURE })
  );

  await assert.rejects(
    withSlackBotToken({
      clock,
      run: async () => {
        throw authError('token_revoked');
      },
      slackGateway: createSlackGateway(),
      workspace: workspaceRepository.workspace,
      workspaceRepository,
    }),
    /token_revoked/u
  );
});

const listFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);

      return entry.isDirectory() ? listFiles(path) : Promise.resolve([path]);
    })
  );

  return children.flat();
};

test('regression: direct Slack bot token decrypt is confined to token provider', async () => {
  const files = (await listFiles(join(process.cwd(), 'src'))).filter((path) =>
    path.endsWith('.ts')
  );
  const offenders = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');

    if (
      source.includes('decrypt({') &&
      !file.includes('slack-bot-token-') &&
      !file.endsWith(join('utils', 'encryption.ts'))
    ) {
      offenders.push(file);
    }
  }

  assert.deepEqual(offenders, []);
});

test('regression: App Home uses token wrapper instead of one reused token', async () => {
  const source = await readFile(
    join(process.cwd(), 'src/services/slack-app-home.ts'),
    'utf8'
  );

  assert.equal(source.includes('getSlackBotToken'), false);
  assert.equal(source.includes('withSlackBotToken'), true);
  assert.equal(source.includes('const botToken ='), false);
});
