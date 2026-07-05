/* eslint-disable max-lines -- Scheduled-call action resolution and Slack message status updates are kept together. */
import type {
  CallNotificationRecord,
  CallNotificationRepository,
  CallScheduleRepository,
  CallSessionRepository,
  Clock,
  SlackMessageReference,
  SlackGateway,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { parseSignedScheduledCallRunValue } from '#server/utils/slack-scheduled-call-run-value';
import { buildScheduledCallSessionId } from './call-session-scheduled-runs';
import type { CallSessionService } from './call-session-service';
import { withSlackBotToken } from './slack-bot-token';
import type { CallSchedule, CallSession, Workspace } from '@exe/domain';
import {
  buildScheduledCallRunStatusBlocks,
  buildScheduledCallRunStatusText,
  type ScheduledCallRunStatusKind,
} from '@exe/slack';

export interface ScheduledCallRunActionDeps {
  readonly callNotificationRepository: CallNotificationRepository;
  readonly callScheduleRepository: CallScheduleRepository;
  readonly callSessionRepository: CallSessionRepository;
  readonly callSessionService: CallSessionService;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}

export type ResolvedScheduledCallRun =
  | {
      readonly schedule: CallSchedule;
      readonly scheduledRunAt: string;
      readonly session: CallSession;
      readonly status: 'ok';
      readonly workspace: Workspace;
    }
  | { readonly status: 'invalid'; readonly workspace: Workspace | null };

type ActionableScheduledCallRun = Extract<
  ResolvedScheduledCallRun,
  { status: 'ok' }
>;

const slackUserOwnsUser = async ({
  deps,
  slackUserId,
  userId,
  workspaceId,
}: {
  readonly deps: ScheduledCallRunActionDeps;
  readonly slackUserId: string;
  readonly userId: string;
  readonly workspaceId: string;
}): Promise<boolean> => {
  const profile = await deps.userProfileRepository.getById({ userId });

  return (
    profile?.slackUsers.some(
      (link) =>
        link.workspaceId === workspaceId && link.slackUserId === slackUserId
    ) ?? false
  );
};

/**
 * Validates the signed reference embedded in a scheduled-call DM and resolves the
 * schedule, run time, and the lazily-created `created` session for the run.
 */
export const resolveScheduledCallRun = async ({
  deps,
  reference,
  slackTeamId,
  slackUserId,
}: {
  readonly deps: ScheduledCallRunActionDeps;
  readonly reference: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
}): Promise<ResolvedScheduledCallRun> => {
  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace === null) {
    return { status: 'invalid', workspace: null };
  }

  const parsed = parseSignedScheduledCallRunValue({
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    value: reference,
  });

  if (parsed?.workspaceId !== slackTeamId) {
    return { status: 'invalid', workspace };
  }

  const schedule = await deps.callScheduleRepository.getById({
    callScheduleId: parsed.callScheduleId,
    workspaceId: parsed.workspaceId,
  });

  if (schedule === null) {
    return { status: 'invalid', workspace };
  }

  const session = await deps.callSessionRepository.getById({
    callSessionId: buildScheduledCallSessionId({
      schedule,
      scheduledRunAt: parsed.scheduledRunAt,
    }),
    workspaceId: parsed.workspaceId,
  });

  if (session === null) {
    return { status: 'invalid', workspace };
  }

  if (
    session.scheduledRunAt !== parsed.scheduledRunAt ||
    !(await slackUserOwnsUser({
      deps,
      slackUserId,
      userId: schedule.userId,
      workspaceId: parsed.workspaceId,
    }))
  ) {
    return { status: 'invalid', workspace };
  }

  return {
    schedule,
    scheduledRunAt: parsed.scheduledRunAt,
    session,
    status: 'ok',
    workspace,
  };
};

const hasSlackMessage = (
  record: CallNotificationRecord
): record is CallNotificationRecord & {
  readonly slackMessage: SlackMessageReference;
} => record.slackMessage !== undefined;

const dedupeSlackMessages = (
  messages: readonly SlackMessageReference[]
): readonly SlackMessageReference[] =>
  messages.filter(
    (message, index) =>
      messages.findIndex(
        (candidate) =>
          candidate.channelId === message.channelId &&
          candidate.messageTs === message.messageTs
      ) === index
  );

const getSavedScheduledCallRunMessageTargets = async ({
  deps,
  resolved,
}: {
  readonly deps: ScheduledCallRunActionDeps;
  readonly resolved?: ActionableScheduledCallRun;
}): Promise<readonly SlackMessageReference[]> => {
  if (resolved === undefined) {
    return [];
  }

  const notifications =
    await deps.callNotificationRepository.listByScheduledRun({
      targetRunAt: resolved.scheduledRunAt,
      userId: resolved.schedule.userId,
      workspaceId: resolved.workspace.id,
    });

  return notifications
    .filter(hasSlackMessage)
    .map((notification) => notification.slackMessage);
};

const getScheduledCallRunMessageTargets = async ({
  channelId,
  deps,
  messageTs,
  resolved,
}: {
  readonly channelId?: string;
  readonly deps: ScheduledCallRunActionDeps;
  readonly messageTs?: string;
  readonly resolved?: ActionableScheduledCallRun;
}): Promise<readonly SlackMessageReference[]> => {
  const direct =
    channelId === undefined || messageTs === undefined
      ? []
      : [{ channelId, messageTs }];
  const saved = await getSavedScheduledCallRunMessageTargets({
    deps,
    ...(resolved === undefined ? {} : { resolved }),
  });

  return dedupeSlackMessages([...direct, ...saved]);
};

export const updateScheduledCallRunMessage = async ({
  channelId,
  deps,
  kind,
  messageTs,
  resolved,
  time,
  workspace,
}: {
  readonly channelId?: string;
  readonly deps: ScheduledCallRunActionDeps;
  readonly kind: ScheduledCallRunStatusKind;
  readonly messageTs?: string;
  readonly resolved?: ActionableScheduledCallRun;
  readonly time?: string;
  readonly workspace: Workspace;
}): Promise<void> => {
  const messageTargets = await getScheduledCallRunMessageTargets({
    ...(channelId === undefined ? {} : { channelId }),
    deps,
    ...(messageTs === undefined ? {} : { messageTs }),
    ...(resolved === undefined ? {} : { resolved }),
  });

  if (messageTargets.length === 0) {
    return;
  }

  const text = buildScheduledCallRunStatusText({
    kind,
    language: workspace.language,
    ...(time === undefined ? {} : { time }),
  });
  const blocks = buildScheduledCallRunStatusBlocks({
    kind,
    language: workspace.language,
    ...(time === undefined ? {} : { time }),
  });

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      Promise.all(
        messageTargets.map((target) =>
          deps.slackGateway.updateMessage({
            blocks,
            botToken,
            channelId: target.channelId,
            messageTs: target.messageTs,
            text,
          })
        )
      ).then((): void => undefined),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

export const statusKindForNonCreatedSession = (
  session: CallSession
): ScheduledCallRunStatusKind => {
  switch (session.status) {
    case 'created':
    case 'ringing':
    case 'active':
    case 'ended':
      return session.status === 'ended' ? 'already_closed' : 'already_started';
    case 'failed':
    case 'missed':
      return 'already_closed';
    case 'skipped':
      return 'skipped';
  }
};

const reportScheduledCallRunStatus = ({
  channelId,
  deps,
  kind,
  messageTs,
  workspace,
}: {
  readonly channelId?: string;
  readonly deps: ScheduledCallRunActionDeps;
  readonly kind: ScheduledCallRunStatusKind;
  readonly messageTs?: string;
  readonly workspace: Workspace;
}): Promise<void> =>
  updateScheduledCallRunMessage({
    ...(channelId === undefined ? {} : { channelId }),
    deps,
    kind,
    ...(messageTs === undefined ? {} : { messageTs }),
    workspace,
  });

/**
 * Resolves a scheduled-call run that must still be in the `created` state and,
 * when `report` is true, replaces the DM with an explanatory status message for
 * invalid or already-progressed runs. Returns the resolved run only when it is
 * still actionable.
 */
export const resolveActionableScheduledCallRun = async ({
  channelId,
  deps,
  messageTs,
  reference,
  report,
  slackTeamId,
  slackUserId,
}: {
  readonly channelId?: string;
  readonly deps: ScheduledCallRunActionDeps;
  readonly messageTs?: string;
  readonly reference: string;
  readonly report: boolean;
  readonly slackTeamId: string;
  readonly slackUserId: string;
}): Promise<Extract<ResolvedScheduledCallRun, { status: 'ok' }> | null> => {
  const resolved = await resolveScheduledCallRun({
    deps,
    reference,
    slackTeamId,
    slackUserId,
  });

  if (resolved.status === 'ok' && resolved.session.status === 'created') {
    return resolved;
  }

  if (report && resolved.workspace !== null) {
    await reportScheduledCallRunStatus({
      ...(channelId === undefined ? {} : { channelId }),
      deps,
      kind:
        resolved.status === 'ok'
          ? statusKindForNonCreatedSession(resolved.session)
          : 'invalid',
      ...(messageTs === undefined ? {} : { messageTs }),
      workspace: resolved.workspace,
    });
  }

  return null;
};
