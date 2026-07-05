import {
  forbiddenError,
  invalidRequestError,
  notFoundError,
} from '#server/errors';
import type {
  Clock,
  SlackGateway,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { withSlackBotToken } from './slack-bot-token';
import { assertSlackUserLookup } from './workspace-admin-validation';
import {
  canManageWorkspaceSettings,
  normalizeEmail,
  toWorkspaceSummary,
  workspaceSchema,
  type UserProfile,
  type Workspace,
  type WorkspaceSummary,
} from '@exe/domain';

export interface WorkspaceAdminMethods {
  readonly addAdminForUser: (params: {
    readonly adminEmail: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<WorkspaceSummary>;
  readonly deleteAdminForUser: (params: {
    readonly adminEmail: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<WorkspaceSummary>;
  readonly registerFirstAdminForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<WorkspaceSummary>;
}

const getWorkspaceForAdminAction = async ({
  userId,
  userProfileRepository,
  workspaceId,
  workspaceRepository,
}: {
  readonly userId: string;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceId: string;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<{
  readonly slackUserId: string;
  readonly userProfile: UserProfile;
  readonly workspace: Workspace;
}> => {
  const userProfile = await userProfileRepository.getById({ userId });

  if (userProfile === null) {
    throw notFoundError(`User profile ${userId} was not found.`);
  }

  const link = userProfile.slackUsers.find(
    (candidate) => candidate.workspaceId === workspaceId
  );

  if (link === undefined) {
    throw forbiddenError(
      `User ${userId} cannot access workspace ${workspaceId}.`
    );
  }

  const workspace = await workspaceRepository.getById({ workspaceId });

  if (workspace === null) {
    throw notFoundError(`Workspace ${workspaceId} was not found.`);
  }

  return { slackUserId: link.slackUserId, userProfile, workspace };
};

const toSummaryForSlackUser = ({
  slackUserId,
  workspace,
}: {
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): WorkspaceSummary => toWorkspaceSummary({ slackUserId, workspace });

const assertCanManageWorkspace = ({
  slackUserId,
  workspace,
}: {
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): void => {
  if (!canManageWorkspaceSettings({ slackUserId, workspace })) {
    throw forbiddenError(
      `Slack user ${slackUserId} cannot manage workspace ${workspace.id}.`
    );
  }
};

const buildWorkspaceWithAdmin = ({
  admin,
  clock,
  workspace,
}: {
  readonly admin: Workspace['admin'];
  readonly clock: Clock;
  readonly workspace: Workspace;
}): Workspace =>
  workspaceSchema.parse({
    ...workspace,
    admin,
    updatedAt: clock.now(),
  });

export const createWorkspaceAdminMethods = ({
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
}): WorkspaceAdminMethods => ({
  addAdminForUser: async ({
    adminEmail,
    userId,
    workspaceId,
  }): Promise<WorkspaceSummary> => {
    const { slackUserId, workspace } = await getWorkspaceForAdminAction({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });

    assertCanManageWorkspace({ slackUserId, workspace });

    const email = normalizeEmail(adminEmail);
    const admin = assertSlackUserLookup({
      identifier: email,
      lookup: await withSlackBotToken({
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        run: ({ botToken }) =>
          slackGateway.lookupUserByEmail({ botToken, email }),
        slackGateway,
        workspace,
        workspaceRepository,
      }),
    });

    if (admin.slackUserId === slackUserId) {
      throw invalidRequestError('Cannot add yourself as admin');
    }

    const updatedWorkspace = buildWorkspaceWithAdmin({
      admin: {
        emails: [
          ...new Set([...workspace.admin.emails, normalizeEmail(admin.email)]),
        ],
        slackUserIds: [
          ...new Set([...workspace.admin.slackUserIds, admin.slackUserId]),
        ],
      },
      clock,
      workspace: workspaceSchema.parse({
        ...workspace,
        channelOwnerEditors: {
          emails: workspace.channelOwnerEditors.emails.filter(
            (candidate) => candidate !== normalizeEmail(admin.email)
          ),
          slackUserIds: workspace.channelOwnerEditors.slackUserIds.filter(
            (candidate) => candidate !== admin.slackUserId
          ),
        },
      }),
    });

    await workspaceRepository.upsert({ workspace: updatedWorkspace });

    return toSummaryForSlackUser({ slackUserId, workspace: updatedWorkspace });
  },
  deleteAdminForUser: async ({
    adminEmail,
    userId,
    workspaceId,
  }): Promise<WorkspaceSummary> => {
    const { slackUserId, workspace } = await getWorkspaceForAdminAction({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });

    assertCanManageWorkspace({ slackUserId, workspace });

    const email = normalizeEmail(adminEmail);
    const admin = assertSlackUserLookup({
      identifier: email,
      lookup: await withSlackBotToken({
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        run: ({ botToken }) =>
          slackGateway.lookupUserByEmail({ botToken, email }),
        slackGateway,
        workspace,
        workspaceRepository,
      }),
    });

    if (admin.slackUserId === slackUserId) {
      throw invalidRequestError('Cannot delete yourself as admin');
    }

    const updatedWorkspace = buildWorkspaceWithAdmin({
      admin: {
        emails: workspace.admin.emails.filter(
          (candidate) => candidate !== normalizeEmail(admin.email)
        ),
        slackUserIds: workspace.admin.slackUserIds.filter(
          (candidate) => candidate !== admin.slackUserId
        ),
      },
      clock,
      workspace,
    });

    await workspaceRepository.upsert({ workspace: updatedWorkspace });

    return toSummaryForSlackUser({ slackUserId, workspace: updatedWorkspace });
  },
  registerFirstAdminForUser: async ({
    userId,
    workspaceId,
  }): Promise<WorkspaceSummary> => {
    const { slackUserId, userProfile, workspace } =
      await getWorkspaceForAdminAction({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });

    if (workspace.admin.emails.length > 0) {
      throw invalidRequestError('Admins already exist');
    }

    const admin = assertSlackUserLookup({
      identifier: userProfile.email,
      lookup: await withSlackBotToken({
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        run: ({ botToken }) =>
          slackGateway.lookupUserByEmail({
            botToken,
            email: userProfile.email,
          }),
        slackGateway,
        workspace,
        workspaceRepository,
      }),
    });

    if (admin.slackUserId !== slackUserId) {
      throw forbiddenError(
        `User ${userId} is not linked to Slack user ${admin.slackUserId}.`
      );
    }

    const updatedWorkspace = buildWorkspaceWithAdmin({
      admin: {
        emails: [normalizeEmail(admin.email)],
        slackUserIds: [admin.slackUserId],
      },
      clock,
      workspace: workspaceSchema.parse({
        ...workspace,
        channelOwnerEditors: {
          emails: workspace.channelOwnerEditors.emails.filter(
            (candidate) => candidate !== normalizeEmail(admin.email)
          ),
          slackUserIds: workspace.channelOwnerEditors.slackUserIds.filter(
            (candidate) => candidate !== admin.slackUserId
          ),
        },
      }),
    });

    await workspaceRepository.upsert({ workspace: updatedWorkspace });

    return toSummaryForSlackUser({ slackUserId, workspace: updatedWorkspace });
  },
});
