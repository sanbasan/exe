import type {
  Clock,
  SlackGateway,
  SlackUserInfo,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import {
  assertCanManageWorkspaceSettings,
  getWorkspaceForUser,
} from '#server/workspace-access';
import { withSlackBotToken } from './slack-bot-token';
import { assertSlackUserLookup } from './workspace-admin-validation';
import {
  normalizeEmail,
  toWorkspaceSummary,
  workspaceSchema,
  type Workspace,
  type WorkspaceSummary,
} from '@exe/domain';

export interface WorkspaceAccountMethods {
  readonly putAccountsForUser: (params: {
    readonly adminSlackUserIds: readonly string[];
    readonly channelOwnerEditorSlackUserIds: readonly string[];
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<WorkspaceSummary>;
}

const getUniqueSlackUserIds = (slackUserIds: readonly string[]): string[] => [
  ...new Set(slackUserIds.map((id) => id.trim()).filter((id) => id.length > 0)),
];

const getSlackUserInfoById = async ({
  clock,
  encryptionKey,
  slackGateway,
  slackUserId,
  workspace,
  workspaceRepository,
}: {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly slackUserId: string;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<SlackUserInfo> =>
  assertSlackUserLookup({
    identifier: slackUserId,
    lookup: await withSlackBotToken({
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      run: ({ botToken }) =>
        slackGateway.getUserInfo({
          botToken,
          slackUserId,
        }),
      slackGateway,
      workspace,
      workspaceRepository,
    }),
  });

const listSlackUserInfoByIds = ({
  clock,
  encryptionKey,
  slackGateway,
  slackUserIds,
  workspace,
  workspaceRepository,
}: {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly slackUserIds: readonly string[];
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<readonly SlackUserInfo[]> =>
  Promise.all(
    slackUserIds.map((slackUserId) =>
      getSlackUserInfoById({
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        slackGateway,
        slackUserId,
        workspace,
        workspaceRepository,
      })
    )
  );

const toWorkspaceAdmin = ({
  slackUserIds,
  users,
}: {
  readonly slackUserIds: readonly string[];
  readonly users: readonly SlackUserInfo[];
}): Workspace['admin'] => ({
  emails: getUniqueSlackUserIds(
    users.map((user) => normalizeEmail(user.email))
  ),
  slackUserIds: [...slackUserIds],
});

export const createWorkspaceAccountMethods = ({
  clock,
  encryptionKey,
  slackGateway,
  userProfileRepository,
  workspaceRepository,
}: {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): WorkspaceAccountMethods => ({
  putAccountsForUser: async ({
    adminSlackUserIds: selectedAdminSlackUserIds,
    channelOwnerEditorSlackUserIds: selectedChannelOwnerEditorSlackUserIds,
    userId,
    workspaceId,
  }): Promise<WorkspaceSummary> => {
    const { linkedSlackUser, workspace } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });

    assertCanManageWorkspaceSettings({ linkedSlackUser, workspace });

    const adminSlackUserIds = getUniqueSlackUserIds([
      linkedSlackUser.slackUserId,
      ...selectedAdminSlackUserIds,
    ]);
    const adminSlackUserIdSet = new Set(adminSlackUserIds);
    const channelOwnerEditorSlackUserIds = getUniqueSlackUserIds(
      selectedChannelOwnerEditorSlackUserIds.filter(
        (editorSlackUserId) => !adminSlackUserIdSet.has(editorSlackUserId)
      )
    );
    const [admins, channelOwnerEditors] = await Promise.all([
      listSlackUserInfoByIds({
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        slackGateway,
        slackUserIds: adminSlackUserIds,
        workspace,
        workspaceRepository,
      }),
      listSlackUserInfoByIds({
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        slackGateway,
        slackUserIds: channelOwnerEditorSlackUserIds,
        workspace,
        workspaceRepository,
      }),
    ]);
    const updatedWorkspace = workspaceSchema.parse({
      ...workspace,
      admin: toWorkspaceAdmin({
        slackUserIds: adminSlackUserIds,
        users: admins,
      }),
      channelOwnerEditors: toWorkspaceAdmin({
        slackUserIds: channelOwnerEditorSlackUserIds,
        users: channelOwnerEditors,
      }),
      updatedAt: clock.now(),
    });

    await workspaceRepository.upsert({ workspace: updatedWorkspace });

    return toWorkspaceSummary({
      slackUserId: linkedSlackUser.slackUserId,
      workspace: updatedWorkspace,
    });
  },
});
