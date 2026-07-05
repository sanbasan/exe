import type {
  Clock,
  SlackGateway,
  SlackOAuthInstallation,
  WorkspaceRepository,
  WorkspaceTokenFields,
} from '../src/ports';
import { installSlackWorkspace } from '../src/services/slack-install-workspace';
import type { Workspace } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-28T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const INSTALLER_USER = 'UINSTALLER';

const clock: Clock = { now: () => NOW };

const installation: SlackOAuthInstallation = {
  accessToken: 'new-bot-token',
  authedUserId: INSTALLER_USER,
  botUserId: 'UBOT',
  teamId: WORKSPACE_ID,
  teamName: 'Workspace',
};

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  public workspace: Workspace | null;

  public constructor(workspace: Workspace | null) {
    this.workspace = workspace;
  }

  public acquireTokenRefreshLock = async (): Promise<boolean> => true;

  public getById = async (): Promise<Workspace | null> => this.workspace;

  public listAll = async (): Promise<readonly Workspace[]> =>
    this.workspace === null ? [] : [this.workspace];

  public listByIds = async (): Promise<readonly Workspace[]> =>
    this.workspace === null ? [] : [this.workspace];

  public releaseTokenRefreshLock = async (): Promise<void> => {};

  public updateTokens = async ({
    tokens,
  }: {
    readonly tokens: WorkspaceTokenFields;
    readonly workspaceId: string;
  }): Promise<void> => {
    if (this.workspace !== null) {
      this.workspace = { ...this.workspace, ...tokens };
    }
  };

  public upsert = async ({
    workspace,
  }: {
    readonly workspace: Workspace;
  }): Promise<void> => {
    this.workspace = workspace;
  };
}

class RecordingSlackGateway {
  public userInfoCalls: {
    readonly botToken: string;
    readonly slackUserId: string;
  }[] = [];

  public exchangeCodeForInstallation = async ({
    code,
  }: {
    readonly code: string;
  }): Promise<SlackOAuthInstallation> => {
    assert.equal(code, 'oauth-code');
    return installation;
  };

  public getUserInfo = async ({
    botToken,
    slackUserId,
  }: {
    readonly botToken: string;
    readonly slackUserId: string;
  }) => {
    this.userInfoCalls = [...this.userInfoCalls, { botToken, slackUserId }];

    return {
      status: 'ok' as const,
      user: {
        email: 'Installer@Example.com',
        slackUserId,
      },
    };
  };
}

const buildWorkspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  admin: { emails: [], slackUserIds: [] },
  botUserId: 'UOLD_BOT',
  channelOwnerEditors: { emails: [], slackUserIds: [] },
  createdAt: NOW,
  encryptedBotToken: 'old-bot-token',
  id: WORKSPACE_ID,
  language: 'ja',
  name: 'Workspace',
  slackTeamId: WORKSPACE_ID,
  timezone: 'Asia/Tokyo',
  updatedAt: NOW,
  ...overrides,
});

test('Slack install assigns installer as first admin when workspace has no admins', async () => {
  const workspaceRepository = new InMemoryWorkspaceRepository(
    buildWorkspace({
      channelOwnerEditors: {
        emails: ['installer@example.com', 'editor@example.com'],
        slackUserIds: [INSTALLER_USER, 'UEDITOR'],
      },
    })
  );
  const slackGateway = new RecordingSlackGateway();

  const workspaceId = await installSlackWorkspace({
    clock,
    code: 'oauth-code',
    slackGateway: slackGateway as unknown as SlackGateway,
    workspaceRepository,
  });

  assert.equal(workspaceId, WORKSPACE_ID);
  assert.deepEqual(workspaceRepository.workspace?.admin, {
    emails: ['installer@example.com'],
    slackUserIds: [INSTALLER_USER],
  });
  assert.deepEqual(workspaceRepository.workspace?.channelOwnerEditors, {
    emails: ['editor@example.com'],
    slackUserIds: ['UEDITOR'],
  });
  assert.deepEqual(slackGateway.userInfoCalls, [
    { botToken: 'new-bot-token', slackUserId: INSTALLER_USER },
  ]);
});

test('Slack install assigns installer as first admin for a new workspace', async () => {
  const workspaceRepository = new InMemoryWorkspaceRepository(null);
  const slackGateway = new RecordingSlackGateway();

  await installSlackWorkspace({
    clock,
    code: 'oauth-code',
    slackGateway: slackGateway as unknown as SlackGateway,
    workspaceRepository,
  });

  assert.deepEqual(workspaceRepository.workspace?.admin, {
    emails: ['installer@example.com'],
    slackUserIds: [INSTALLER_USER],
  });
});

test('Slack reinstall preserves existing admins', async () => {
  const existingAdmin = {
    emails: ['admin@example.com'],
    slackUserIds: ['UADMIN'],
  };
  const workspaceRepository = new InMemoryWorkspaceRepository(
    buildWorkspace({ admin: existingAdmin })
  );
  const slackGateway = new RecordingSlackGateway();

  await installSlackWorkspace({
    clock,
    code: 'oauth-code',
    slackGateway: slackGateway as unknown as SlackGateway,
    workspaceRepository,
  });

  assert.deepEqual(workspaceRepository.workspace?.admin, existingAdmin);
  assert.deepEqual(slackGateway.userInfoCalls, []);
});
