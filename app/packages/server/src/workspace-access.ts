import { forbiddenError, notFoundError } from '#server/errors';
import type {
  Clock,
  SlackGateway,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { withSlackBotToken } from './services/slack-bot-token';
import {
  canManageWorkspaceSettings,
  type LinkedSlackUser,
  type UserProfile,
  userProfileSchema,
  type Workspace,
} from '@exe/domain';

export const getWorkspaceForUser = async ({
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
  readonly linkedSlackUser: LinkedSlackUser;
  readonly userProfile: UserProfile;
  readonly workspace: Workspace;
}> => {
  const userProfile = await userProfileRepository.getById({ userId });

  if (userProfile === null) {
    throw notFoundError(`User profile ${userId} was not found.`);
  }

  const linkedSlackUser = userProfile.slackUsers.find(
    (candidate) => candidate.workspaceId === workspaceId
  );

  if (linkedSlackUser === undefined) {
    throw forbiddenError(
      `User ${userId} cannot access workspace ${workspaceId}.`
    );
  }

  const workspace = await workspaceRepository.getById({ workspaceId });

  if (workspace === null) {
    throw notFoundError(`Workspace ${workspaceId} was not found.`);
  }

  return { linkedSlackUser, userProfile, workspace };
};

// Outcome of re-verifying one cached link at the listing boundary:
// - keep:   link is still valid (live member, transient/indeterminate error, or
//           decrypt failure) AND its workspace doc is available to surface.
// - retain: link is kept but its workspace doc could not be read this request,
//           so it cannot be surfaced (a cache-read miss must NOT prune access).
// - prune:  Slack definitively says the user is no longer a member.
type VerifiedLink =
  | {
      readonly kind: 'keep';
      readonly link: LinkedSlackUser;
      readonly workspace: Workspace;
    }
  | { readonly kind: 'prune' }
  | { readonly kind: 'retain'; readonly link: LinkedSlackUser };

const reverifyLink = ({
  clock,
  email,
  encryptionKey,
  link,
  slackGateway,
  verifiedAt,
  workspace,
  workspaceRepository,
}: {
  readonly clock: Clock;
  readonly email: string;
  readonly encryptionKey?: string;
  readonly link: LinkedSlackUser;
  readonly slackGateway: SlackGateway;
  readonly verifiedAt: string;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<VerifiedLink> =>
  Promise.resolve()
    .then(() =>
      withSlackBotToken({
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        run: ({ botToken }) =>
          slackGateway.verifyMembershipByEmail({
            botToken,
            email,
          }),
        slackGateway,
        workspace,
        workspaceRepository,
      })
    )
    .then((membership): VerifiedLink => {
      if (membership.status === 'not_member') {
        return { kind: 'prune' };
      }

      if (membership.status === 'member') {
        return {
          kind: 'keep',
          link: {
            slackTeamId: workspace.slackTeamId,
            slackUserId: membership.slackUserId,
            verifiedAt,
            workspaceId: workspace.id,
          },
          workspace,
        };
      }

      // indeterminate: retain the existing link unchanged (fail open).
      return { kind: 'keep', link, workspace };
    })
    // Any failure (incl. a decrypt throw on a corrupt token) is indeterminate.
    .catch((): VerifiedLink => ({ kind: 'keep', link, workspace }));

const linkKey = (link: LinkedSlackUser): string =>
  `${link.workspaceId}:${link.slackUserId}:${link.verifiedAt ?? ''}`;

const sameLinks = ({
  next,
  previous,
}: {
  readonly next: readonly LinkedSlackUser[];
  readonly previous: readonly LinkedSlackUser[];
}): boolean =>
  JSON.stringify(next.map(linkKey).toSorted()) ===
  JSON.stringify(previous.map(linkKey).toSorted());

// Listing is an access boundary: re-confirm each cached link against Slack (the
// source of truth) and return only the confirmed ones, pruning workspaces the
// user has left. A definitive `not_member` is dropped; an indeterminate result,
// a decrypt failure, or an unreadable workspace doc all retain the cached link
// so a transient problem never silently hides a workspace. The corrected
// profile is persisted (compared by content, not length) so later per-request
// checks read the cleaned cache.
export const listWorkspacesForUser = async ({
  clock,
  encryptionKey,
  slackGateway,
  userId,
  userProfileRepository,
  workspaceRepository,
}: {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly userId: string;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<{
  readonly userProfile: UserProfile;
  readonly workspaces: readonly Workspace[];
}> => {
  const userProfile = await userProfileRepository.getById({ userId });

  if (userProfile === null) {
    throw notFoundError(`User profile ${userId} was not found.`);
  }

  const workspaces = await workspaceRepository.listByIds({
    workspaceIds: [
      ...new Set(userProfile.slackUsers.map((link) => link.workspaceId)),
    ],
  });
  const verifiedAt = clock.now();

  const verified = await Promise.all(
    userProfile.slackUsers.map((link): Promise<VerifiedLink> => {
      const workspace = workspaces.find(
        (candidate) => candidate.id === link.workspaceId
      );

      return workspace === undefined
        ? Promise.resolve({ kind: 'retain', link })
        : reverifyLink({
            clock,
            email: userProfile.email,
            ...(encryptionKey === undefined ? {} : { encryptionKey }),
            link,
            slackGateway,
            verifiedAt,
            workspace,
            workspaceRepository,
          });
    })
  );

  const keptLinks = verified.flatMap((entry) =>
    entry.kind === 'prune' ? [] : [entry.link]
  );
  const confirmedWorkspaces = verified.flatMap((entry) =>
    entry.kind === 'keep' ? [entry.workspace] : []
  );
  const workspaceIds = [
    ...new Set(keptLinks.map((link) => link.workspaceId)),
  ].toSorted();

  const unchanged =
    sameLinks({ next: keptLinks, previous: userProfile.slackUsers }) &&
    JSON.stringify(workspaceIds) ===
      JSON.stringify([...userProfile.workspaceIds].toSorted());

  if (unchanged) {
    return { userProfile, workspaces: confirmedWorkspaces };
  }

  const updatedProfile = userProfileSchema.parse({
    ...userProfile,
    slackUsers: keptLinks,
    updatedAt: verifiedAt,
    workspaceIds,
  });

  await userProfileRepository.upsert({ userProfile: updatedProfile });

  return { userProfile: updatedProfile, workspaces: confirmedWorkspaces };
};

export const assertCanManageWorkspaceSettings = ({
  linkedSlackUser,
  workspace,
}: {
  readonly linkedSlackUser: LinkedSlackUser;
  readonly workspace: Workspace;
}): void => {
  if (
    !canManageWorkspaceSettings({
      slackUserId: linkedSlackUser.slackUserId,
      workspace,
    })
  ) {
    throw forbiddenError(
      `Slack user ${linkedSlackUser.slackUserId} cannot manage workspace settings.`
    );
  }
};
