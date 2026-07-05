import type {
  Clock,
  SlackGateway,
  SlackUserInfo,
  WorkspaceRepository,
} from '#server/ports';
import { publishSlackAppHome, type SlackAppHomeDeps } from './slack-app-home';
import { withSlackBotToken } from './slack-bot-token';
import { assertSlackUserLookup } from './workspace-admin-validation';
import {
  canManageWorkspaceSettings,
  normalizeEmail,
  workspaceSchema,
  type Workspace,
} from '@exe/domain';
import {
  buildManageAdminsModal,
  parseManageAdminsChannelOwnerEditors,
  parseManageAdminsUsers,
  slackActionIds,
  slackViewIds,
} from '@exe/slack';

interface SlackManageAdminsDeps {
  readonly appHomeDeps: SlackAppHomeDeps;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

const assertCanManageAdmins = ({
  slackUserId,
  workspace,
}: {
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): boolean => canManageWorkspaceSettings({ slackUserId, workspace });

const getSlackUserInfo = ({
  deps,
  slackUserId,
  workspace,
}: {
  readonly deps: SlackManageAdminsDeps;
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): Promise<SlackUserInfo> =>
  withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: async ({ botToken }) =>
      assertSlackUserLookup({
        identifier: slackUserId,
        lookup: await deps.slackGateway.getUserInfo({ botToken, slackUserId }),
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });

const getDisplayName = (userInfo: SlackUserInfo): string =>
  userInfo.displayName ?? userInfo.realName ?? userInfo.slackUserId;

const getUniqueSlackUserIds = (
  slackUserIds: readonly string[]
): readonly string[] => [...new Set(slackUserIds)];

export const openSlackManageAdmins = async ({
  actionId,
  deps,
  slackTeamId,
  slackUserId,
  triggerId,
}: {
  readonly actionId: string;
  readonly deps: SlackManageAdminsDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly triggerId?: string;
}): Promise<void> => {
  if (actionId !== slackActionIds.openManageAdmins || triggerId === undefined) {
    return;
  }

  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (
    workspace === null ||
    !assertCanManageAdmins({ slackUserId, workspace })
  ) {
    return;
  }

  const currentUserInfo = await getSlackUserInfo({
    deps,
    slackUserId,
    workspace,
  });

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.openView({
        botToken,
        triggerId,
        view: buildManageAdminsModal({
          adminSlackUserIds: getUniqueSlackUserIds(
            workspace.admin.slackUserIds
          ),
          channelOwnerEditorSlackUserIds: getUniqueSlackUserIds(
            workspace.channelOwnerEditors.slackUserIds
          ),
          currentUserDisplayName: getDisplayName(currentUserInfo),
          currentUserSlackUserId: slackUserId,
          language: workspace.language,
        }),
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

const buildUpdatedWorkspace = async ({
  deps,
  selectedAdminSlackUserIds,
  selectedChannelOwnerEditorSlackUserIds,
  slackUserId,
  workspace,
}: {
  readonly deps: SlackManageAdminsDeps;
  readonly selectedAdminSlackUserIds: readonly string[];
  readonly selectedChannelOwnerEditorSlackUserIds: readonly string[];
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): Promise<Workspace> => {
  const adminSlackUserIds = getUniqueSlackUserIds([
    slackUserId,
    ...selectedAdminSlackUserIds,
  ]);
  const adminSlackUserIdSet = new Set(adminSlackUserIds);
  const channelOwnerEditorSlackUserIds = getUniqueSlackUserIds(
    selectedChannelOwnerEditorSlackUserIds.filter(
      (editorSlackUserId) => !adminSlackUserIdSet.has(editorSlackUserId)
    )
  );
  const admins = await Promise.all(
    adminSlackUserIds.map((adminSlackUserId) =>
      getSlackUserInfo({
        deps,
        slackUserId: adminSlackUserId,
        workspace,
      })
    )
  );
  const channelOwnerEditors = await Promise.all(
    channelOwnerEditorSlackUserIds.map((editorSlackUserId) =>
      getSlackUserInfo({
        deps,
        slackUserId: editorSlackUserId,
        workspace,
      })
    )
  );

  return workspaceSchema.parse({
    ...workspace,
    admin: {
      emails: getUniqueSlackUserIds(
        admins.map((admin) => normalizeEmail(admin.email))
      ),
      slackUserIds: adminSlackUserIds,
    },
    channelOwnerEditors: {
      emails: getUniqueSlackUserIds(
        channelOwnerEditors.map((editor) => normalizeEmail(editor.email))
      ),
      slackUserIds: channelOwnerEditorSlackUserIds,
    },
    updatedAt: deps.clock.now(),
  });
};

export const saveSlackManageAdmins = async ({
  callbackId,
  deps,
  slackTeamId,
  slackUserId,
  stateValues,
}: {
  readonly callbackId: string;
  readonly deps: SlackManageAdminsDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly stateValues: unknown;
}): Promise<void> => {
  if (callbackId !== slackViewIds.manageAdmins) {
    return;
  }

  const selectedAdminUsers = parseManageAdminsUsers(stateValues);
  const selectedChannelOwnerEditors =
    parseManageAdminsChannelOwnerEditors(stateValues);

  if (selectedAdminUsers === null || selectedChannelOwnerEditors === null) {
    return;
  }

  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (
    workspace === null ||
    !assertCanManageAdmins({ slackUserId, workspace })
  ) {
    return;
  }

  const updatedWorkspace = await buildUpdatedWorkspace({
    deps,
    selectedAdminSlackUserIds: selectedAdminUsers,
    selectedChannelOwnerEditorSlackUserIds: selectedChannelOwnerEditors,
    slackUserId,
    workspace,
  });

  await deps.workspaceRepository.upsert({ workspace: updatedWorkspace });
  await publishSlackAppHome({
    deps: deps.appHomeDeps,
    slackTeamId,
    slackUserId,
  });
};
