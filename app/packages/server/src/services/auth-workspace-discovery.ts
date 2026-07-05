import type {
  Clock,
  SlackGateway,
  SlackMemberIndexRepository,
  SlackMembership,
  WorkspaceRepository,
} from '#server/ports';
import { withSlackBotToken } from './slack-bot-token';
import {
  normalizeEmail,
  slackMemberIndexEntrySchema,
  type LinkedSlackUser,
  type UserProfile,
  type Workspace,
} from '@exe/domain';

// How long a profile's full workspace discovery stays trusted. Within this
// window login narrows candidates to the membership index unioned with the
// user's already-known workspaces; past it, login re-scans every workspace,
// catching memberships neither the index nor the profile observed (e.g. a
// workspace joined after the last login when Slack join events are not
// delivered). Keeps the brute-force cost off the common login path while
// bounding the worst-case "new workspace not yet visible" window.
const FULL_DISCOVERY_TTL_MINUTES = 60;

const isWithinFullDiscoveryTtl = ({
  now,
  since,
}: {
  readonly now: string;
  readonly since: string;
}): boolean =>
  Date.parse(now) - Date.parse(since) < FULL_DISCOVERY_TTL_MINUTES * 60 * 1000;

const memberIndexKey = ({
  slackUserId,
  workspaceId,
}: {
  readonly slackUserId: string;
  readonly workspaceId: string;
}): string => `${workspaceId}:${slackUserId}`;

const toLinkedSlackUser = ({
  slackUserId,
  verifiedAt,
  workspace,
}: {
  readonly slackUserId: string;
  readonly verifiedAt: string;
  readonly workspace: Workspace;
}): LinkedSlackUser => ({
  slackTeamId: workspace.slackTeamId,
  slackUserId,
  verifiedAt,
  workspaceId: workspace.id,
});

export interface WorkspaceDiscoveryDeps {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly slackMemberIndexRepository: SlackMemberIndexRepository;
  readonly workspaceRepository: WorkspaceRepository;
}

interface WorkspaceVerification {
  readonly membership: SlackMembership;
  readonly workspace: Workspace;
}

// Verify one workspace, isolating ALL failures (including a synchronous decrypt
// throw on a corrupt/legacy bot token) to that workspace as `indeterminate`, so
// a single bad token can never reject the whole login fan-out.
const verifyWorkspaceMembership = ({
  deps,
  email,
  workspace,
}: {
  readonly deps: WorkspaceDiscoveryDeps;
  readonly email: string;
  readonly workspace: Workspace;
}): Promise<WorkspaceVerification> =>
  Promise.resolve()
    .then(() =>
      withSlackBotToken({
        clock: deps.clock,
        ...(deps.encryptionKey === undefined
          ? {}
          : { encryptionKey: deps.encryptionKey }),
        run: ({ botToken }) =>
          deps.slackGateway.verifyMembershipByEmail({
            botToken,
            email,
          }),
        slackGateway: deps.slackGateway,
        workspace,
        workspaceRepository: deps.workspaceRepository,
      })
    )
    .then((membership): WorkspaceVerification => ({ membership, workspace }))
    .catch(
      (): WorkspaceVerification => ({
        membership: { status: 'indeterminate' },
        workspace,
      })
    );

const verifyWorkspaceMemberships = ({
  deps,
  email,
  workspaces,
}: {
  readonly deps: WorkspaceDiscoveryDeps;
  readonly email: string;
  readonly workspaces: readonly Workspace[];
}): Promise<readonly WorkspaceVerification[]> =>
  Promise.all(
    workspaces.map((workspace) =>
      verifyWorkspaceMembership({ deps, email, workspace })
    )
  );

// Reflect the live verification results into the candidate index: upsert every
// confirmed member and delete any existing entry for a workspace we got a
// DEFINITIVE answer for (member or not_member) whose (workspace, slackUserId)
// is not a confirmed member. That prunes both departures and orphaned rows left
// by a changed slackUserId, while never touching `indeterminate` workspaces.
// Best effort — the index is a cache, so a write failure must never break login.
const reconcileMemberIndex = ({
  deps,
  email,
  existingIndexEntries,
  updatedAt,
  verifications,
}: {
  readonly deps: WorkspaceDiscoveryDeps;
  readonly email: string;
  readonly existingIndexEntries: readonly {
    readonly slackUserId: string;
    readonly workspaceId: string;
  }[];
  readonly updatedAt: string;
  readonly verifications: readonly WorkspaceVerification[];
}): Promise<unknown> => {
  const conclusiveWorkspaceIds = new Set(
    verifications
      .filter(({ membership }) => membership.status !== 'indeterminate')
      .map(({ workspace }) => workspace.id)
  );
  const confirmedKeys = new Set(
    verifications.flatMap(({ membership, workspace }) =>
      membership.status === 'member'
        ? [
            memberIndexKey({
              slackUserId: membership.slackUserId,
              workspaceId: workspace.id,
            }),
          ]
        : []
    )
  );
  const upserts = verifications.flatMap(({ membership, workspace }) =>
    membership.status === 'member'
      ? [
          deps.slackMemberIndexRepository.upsert({
            entry: slackMemberIndexEntrySchema.parse({
              email,
              slackTeamId: workspace.slackTeamId,
              slackUserId: membership.slackUserId,
              updatedAt,
              workspaceId: workspace.id,
            }),
          }),
        ]
      : []
  );
  const deletes = existingIndexEntries
    .filter(
      (entry) =>
        conclusiveWorkspaceIds.has(entry.workspaceId) &&
        !confirmedKeys.has(
          memberIndexKey({
            slackUserId: entry.slackUserId,
            workspaceId: entry.workspaceId,
          })
        )
    )
    .map((entry) =>
      deps.slackMemberIndexRepository.deleteEntry({
        slackUserId: entry.slackUserId,
        workspaceId: entry.workspaceId,
      })
    );

  return Promise.all([...upserts, ...deletes]).catch(() => []);
};

// Slack is the source of truth for membership. Candidate workspaces come from
// the index UNIONED with the user's already-known workspaces when the index is
// fresh (bounded by FULL_DISCOVERY_TTL), otherwise from a full scan of every
// workspace; either way each candidate is confirmed live, so a workspace the
// user has left is pruned. A cached link is retained only when the live check
// is indeterminate (transient error). Returns the confirmed links plus whether
// a full scan was performed.
export const discoverLinkedSlackUsers = async ({
  deps,
  email,
  existingProfile,
}: {
  readonly deps: WorkspaceDiscoveryDeps;
  readonly email: string;
  readonly existingProfile: UserProfile | null;
}): Promise<{
  readonly fullDiscovery: boolean;
  readonly slackUsers: readonly LinkedSlackUser[];
}> => {
  const normalizedEmail = normalizeEmail(email);
  const existingSlackUsers = existingProfile?.slackUsers ?? [];
  const indexEntries = await deps.slackMemberIndexRepository.listByEmail({
    email: normalizedEmail,
  });
  const indexIsFresh =
    existingProfile?.lastFullDiscoveryAt !== undefined &&
    isWithinFullDiscoveryTtl({
      now: deps.clock.now(),
      since: existingProfile.lastFullDiscoveryAt,
    });
  const useIndex = indexIsFresh && indexEntries.length > 0;
  // Union the index with the user's already-known workspaces so a workspace the
  // user already had access to is always re-verified even if it is missing from
  // the index. A brand-new workspace absent from both is caught by the next
  // full re-scan (bounded by the TTL) or a delivered team_join event.
  const candidateWorkspaces = useIndex
    ? await deps.workspaceRepository.listByIds({
        workspaceIds: [
          ...new Set([
            ...indexEntries.map((entry) => entry.workspaceId),
            // useIndex implies indexIsFresh, which implies existingProfile is non-null.
            ...existingProfile.workspaceIds,
          ]),
        ],
      })
    : await deps.workspaceRepository.listAll();

  const verifiedAt = deps.clock.now();
  const verifications = await verifyWorkspaceMemberships({
    deps,
    email: normalizedEmail,
    workspaces: candidateWorkspaces,
  });

  await reconcileMemberIndex({
    deps,
    email: normalizedEmail,
    existingIndexEntries: indexEntries,
    updatedAt: verifiedAt,
    verifications,
  });

  const slackUsers = verifications.flatMap(
    ({ membership, workspace }): readonly LinkedSlackUser[] => {
      if (membership.status === 'member') {
        return [
          toLinkedSlackUser({
            slackUserId: membership.slackUserId,
            verifiedAt,
            workspace,
          }),
        ];
      }

      if (membership.status === 'indeterminate') {
        const existing = existingSlackUsers.find(
          (candidate) => candidate.workspaceId === workspace.id
        );

        return existing === undefined ? [] : [existing];
      }

      return [];
    }
  );

  return { fullDiscovery: !useIndex, slackUsers };
};
