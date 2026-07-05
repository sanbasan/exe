import type {
  Clock,
  SlackGateway,
  SlackMemberIndexRepository,
  WorkspaceRepository,
} from '#server/ports';
import { withSlackBotToken } from './slack-bot-token';
import { normalizeEmail, slackMemberIndexEntrySchema } from '@exe/domain';

export interface SlackMemberIndexSyncDeps {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly slackMemberIndexRepository: SlackMemberIndexRepository;
  readonly workspaceRepository: WorkspaceRepository;
}

// Seed the membership index for a workspace from its current Slack member list.
// Idempotent (upserts), so safe to re-run.
export const backfillWorkspaceMemberIndex = async ({
  deps,
  workspaceId,
}: {
  readonly deps: SlackMemberIndexSyncDeps;
  readonly workspaceId: string;
}): Promise<void> => {
  const workspace = await deps.workspaceRepository.getById({ workspaceId });

  if (workspace === null) {
    return;
  }

  const members = await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.listWorkspaceMembers({
        botToken,
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
  const updatedAt = deps.clock.now();

  await Promise.all(
    members.flatMap((member) => {
      const email = member.profile?.email;
      const slackUserId = member.id;

      return typeof email !== 'string' || typeof slackUserId !== 'string'
        ? []
        : [
            deps.slackMemberIndexRepository.upsert({
              entry: slackMemberIndexEntrySchema.parse({
                email: normalizeEmail(email),
                slackTeamId: workspace.slackTeamId,
                slackUserId,
                updatedAt,
                workspaceId: workspace.id,
              }),
            }),
          ];
    })
  );
};

// Reflect a Slack team_join / user_change event into the membership index.
// Removes the entry only on a DEFINITIVE non-member signal (deactivated or a
// bot). A missing email is treated as a no-op — user_change events fire for many
// benign profile changes and frequently omit the email, so absence must NOT be
// read as "evict an active member" (the periodic full re-scan keeps the index
// honest). Upserts an active human member that has an email.
export const syncSlackMember = async ({
  deleted,
  deps,
  email,
  isBot,
  slackTeamId,
  slackUserId,
}: {
  readonly deleted?: boolean;
  readonly deps: SlackMemberIndexSyncDeps;
  readonly email?: string;
  readonly isBot?: boolean;
  readonly slackTeamId: string;
  readonly slackUserId: string;
}): Promise<void> => {
  // workspace.id === slackTeamId in this codebase.
  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace === null) {
    return;
  }

  if (deleted === true || isBot === true) {
    await deps.slackMemberIndexRepository.deleteEntry({
      slackUserId,
      workspaceId: workspace.id,
    });

    return;
  }

  const normalizedEmail =
    email === undefined ? undefined : normalizeEmail(email);

  // No email in this event payload: leave the existing row untouched.
  if (normalizedEmail === undefined || normalizedEmail.length === 0) {
    return;
  }

  await deps.slackMemberIndexRepository.upsert({
    entry: slackMemberIndexEntrySchema.parse({
      email: normalizedEmail,
      slackTeamId: workspace.slackTeamId,
      slackUserId,
      updatedAt: deps.clock.now(),
      workspaceId: workspace.id,
    }),
  });
};
