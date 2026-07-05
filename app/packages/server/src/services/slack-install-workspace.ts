import type {
  Clock,
  SlackGateway,
  SlackOAuthInstallation,
  WorkspaceRepository,
} from '#server/ports';
import { buildWorkspaceFromInstallation } from './slack-workspace-utils';
import { assertSlackUserLookup } from './workspace-admin-validation';
import {
  hasWorkspaceAdmins,
  normalizeEmail,
  workspaceSchema,
  type Workspace,
} from '@exe/domain';

const assignInstallerAsFirstAdmin = async ({
  installation,
  slackGateway,
  workspace,
}: {
  readonly installation: SlackOAuthInstallation;
  readonly slackGateway: SlackGateway;
  readonly workspace: Workspace;
}): Promise<Workspace> => {
  const installer = assertSlackUserLookup({
    identifier: installation.authedUserId,
    lookup: await slackGateway.getUserInfo({
      botToken: installation.accessToken,
      slackUserId: installation.authedUserId,
    }),
  });
  const installerEmail = normalizeEmail(installer.email);

  return workspaceSchema.parse({
    ...workspace,
    admin: {
      emails: [installerEmail],
      slackUserIds: [installer.slackUserId],
    },
    channelOwnerEditors: {
      emails: workspace.channelOwnerEditors.emails.filter(
        (email) => email !== installerEmail
      ),
      slackUserIds: workspace.channelOwnerEditors.slackUserIds.filter(
        (slackUserId) => slackUserId !== installer.slackUserId
      ),
    },
  });
};

export const installSlackWorkspace = async ({
  clock,
  code,
  encryptionKey,
  redirectUri,
  slackGateway,
  workspaceRepository,
}: {
  readonly clock: Clock;
  readonly code: string;
  readonly encryptionKey?: string;
  readonly redirectUri?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<string> => {
  const installation = await slackGateway.exchangeCodeForInstallation({
    code,
    ...(redirectUri === undefined ? {} : { redirectUri }),
  });
  const existingWorkspace = await workspaceRepository.getById({
    workspaceId: installation.teamId,
  });
  const workspace = buildWorkspaceFromInstallation({
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    ...(existingWorkspace === null ? {} : { existingWorkspace }),
    installation,
  });
  const workspaceWithAdmin = hasWorkspaceAdmins(workspace)
    ? workspace
    : await assignInstallerAsFirstAdmin({
        installation,
        slackGateway,
        workspace,
      });

  await workspaceRepository.upsert({ workspace: workspaceWithAdmin });

  return workspaceWithAdmin.id;
};
