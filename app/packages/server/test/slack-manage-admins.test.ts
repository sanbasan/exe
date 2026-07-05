import type {
  CallScheduleRepository,
  ChannelBlockRepository,
  ChannelRepository,
  ChannelReviewStateRepository,
  Clock,
  IdGenerator,
  SlackGateway,
  SlackUserInfo,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
  WorkspaceTokenFields,
} from '../src/ports';
import { saveSlackManageAdmins } from '../src/services/slack-manage-admins';
import type { Workspace } from '@exe/domain';
import { slackActionIds, slackBlockIds, slackViewIds } from '@exe/slack';
import type { View } from '@slack/types';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-28T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const ADMIN_USER = 'UADMIN';

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  public workspace: Workspace;

  public constructor(workspace: Workspace) {
    this.workspace = workspace;
  }

  public acquireTokenRefreshLock = async (): Promise<boolean> => true;

  public getById = async (): Promise<Workspace> => this.workspace;

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
    this.workspace = { ...this.workspace, ...tokens };
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
  public publishedViews: View[] = [];

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
    view,
  }: {
    readonly botToken: string;
    readonly userId: string;
    readonly view: View;
  }): Promise<void> => {
    this.publishedViews = [...this.publishedViews, view];
  };
}

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { generateId: () => 'id-1' };

const emptyCallScheduleRepository: CallScheduleRepository = {
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
const emptyTaskRepository: TaskRepository = {
  create: async () => {},
  getById: async () => null,
  listByAssignee: async () => [],
  listByRequester: async () => [],
  listByWorkspace: async () => [],
  update: async () => {},
};
const emptyUserProfileRepository: UserProfileRepository = {
  getById: async () => null,
  listByWorkspace: async () => [],
  upsert: async () => {},
};

const buildWorkspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  admin: { emails: ['uadmin@example.com'], slackUserIds: [ADMIN_USER] },
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

const selectedUsersState = ({
  admins,
  channelOwnerEditors,
}: {
  readonly admins: readonly string[];
  readonly channelOwnerEditors: readonly string[];
}): unknown => ({
  [slackBlockIds.manageAdminsUsers]: {
    [slackActionIds.manageAdminsUsers]: {
      selected_users: admins,
    },
  },
  [slackBlockIds.manageAdminsChannelOwnerEditors]: {
    [slackActionIds.manageAdminsChannelOwnerEditors]: {
      selected_users: channelOwnerEditors,
    },
  },
});

test('account management saves admins and channel-owner editors with admin precedence', async () => {
  const workspaceRepository = new InMemoryWorkspaceRepository(buildWorkspace());
  const slackGateway = new RecordingSlackGateway();
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
    taskRepository: emptyTaskRepository,
    userProfileRepository: emptyUserProfileRepository,
    workspaceRepository,
  };

  await saveSlackManageAdmins({
    callbackId: slackViewIds.manageAdmins,
    deps: {
      appHomeDeps,
      clock,
      slackGateway: slackGateway as unknown as SlackGateway,
      workspaceRepository,
    },
    slackTeamId: WORKSPACE_ID,
    slackUserId: ADMIN_USER,
    stateValues: selectedUsersState({
      admins: ['UADMIN2', 'UBOTH'],
      channelOwnerEditors: ['UEDITOR', 'UBOTH'],
    }),
  });

  assert.deepEqual(workspaceRepository.workspace.admin.slackUserIds, [
    ADMIN_USER,
    'UADMIN2',
    'UBOTH',
  ]);
  assert.deepEqual(
    workspaceRepository.workspace.channelOwnerEditors.slackUserIds,
    ['UEDITOR']
  );
  assert.equal(slackGateway.publishedViews.length, 1);
});
