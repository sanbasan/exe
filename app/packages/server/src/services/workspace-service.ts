import { notFoundError } from '#server/errors';
import type {
  Clock,
  SlackGateway,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import {
  getWorkspaceForUser,
  listWorkspacesForUser,
} from '#server/workspace-access';
import { withSlackBotToken } from './slack-bot-token';
import {
  createWorkspaceAccountMethods,
  type WorkspaceAccountMethods,
} from './workspace-account-methods';
import {
  createWorkspaceAdminMethods,
  type WorkspaceAdminMethods,
} from './workspace-admin-methods';
import {
  toWorkspaceSummary,
  type UserProfile,
  type SlackWorkspaceMember,
  type SlackWorkspaceTeam,
  type WorkspaceSummary,
} from '@exe/domain';

export interface WorkspaceService
  extends WorkspaceAccountMethods, WorkspaceAdminMethods {
  readonly getMe: (params: { readonly userId: string }) => Promise<UserProfile>;
  readonly getSlackTeamForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<SlackWorkspaceTeam | null>;
  readonly listForUser: (params: {
    readonly userId: string;
  }) => Promise<readonly WorkspaceSummary[]>;
  readonly listSlackMembersForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly SlackWorkspaceMember[]>;
}

export const createWorkspaceService = ({
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
}): WorkspaceService => ({
  ...createWorkspaceAdminMethods({
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    slackGateway,
    userProfileRepository,
    workspaceRepository,
  }),
  ...createWorkspaceAccountMethods({
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    slackGateway,
    userProfileRepository,
    workspaceRepository,
  }),
  getMe: async ({ userId }): Promise<UserProfile> => {
    const userProfile = await userProfileRepository.getById({ userId });

    if (userProfile === null) {
      throw notFoundError(`User profile ${userId} was not found.`);
    }

    return userProfile;
  },
  getSlackTeamForUser: async ({
    userId,
    workspaceId,
  }): Promise<SlackWorkspaceTeam | null> => {
    const { workspace } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });

    return withSlackBotToken({
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      run: ({ botToken }) => slackGateway.getWorkspaceInfo({ botToken }),
      slackGateway,
      workspace,
      workspaceRepository,
    });
  },
  listForUser: async ({ userId }): Promise<readonly WorkspaceSummary[]> => {
    const { userProfile, workspaces } = await listWorkspacesForUser({
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      slackGateway,
      userId,
      userProfileRepository,
      workspaceRepository,
    });

    return workspaces.map((workspace) => {
      const linkedSlackUser = userProfile.slackUsers.find(
        (candidate) => candidate.workspaceId === workspace.id
      );

      if (linkedSlackUser === undefined) {
        throw notFoundError(`Workspace ${workspace.id} link was not found.`);
      }

      return toWorkspaceSummary({
        slackUserId: linkedSlackUser.slackUserId,
        workspace,
      });
    });
  },
  listSlackMembersForUser: async ({
    userId,
    workspaceId,
  }): Promise<readonly SlackWorkspaceMember[]> => {
    const { workspace } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });

    return withSlackBotToken({
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      run: ({ botToken }) =>
        slackGateway.listWorkspaceMembers({
          botToken,
        }),
      slackGateway,
      workspace,
      workspaceRepository,
    });
  },
});
