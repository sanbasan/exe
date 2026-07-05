/* eslint-disable max-lines -- Scheduled call workflow keeps the three deterministic cron stages together. */
import type {
  CallNotificationRecord,
  SlackMessageReference,
} from '#server/ports';
import { getWorkspaceForUser } from '#server/workspace-access';
import {
  buildCallNotificationId,
  tryCreateCallNotification,
} from './call-notification-workflow-utils';
import type { CallWorkflowDeps } from './deps';
import type { CallSchedule, CallSession, Workspace } from '@exe/domain';

interface ScheduledCallRun {
  readonly schedule: CallSchedule;
  readonly targetRunAt: string;
}

const MINUTE_MS = 60_000;
const SCHEDULED_CALL_FORCE_DELAY_MINUTES = 10;
const SCHEDULED_CALL_RING_TIMEOUT_MINUTES = 2;
const FINAL_OR_STARTED_STATUSES = new Set<CallSession['status']>([
  'active',
  'ended',
  'failed',
  'missed',
  'ringing',
  'skipped',
]);

const getEpochMs = (dateTime: string): number => {
  const epochMs = new Date(dateTime).getTime();

  if (Number.isNaN(epochMs)) {
    throw new Error(`Invalid DateTime: ${dateTime}`);
  }

  return epochMs;
};

const getForceCallAtMs = (run: ScheduledCallRun): number =>
  getEpochMs(run.targetRunAt) + SCHEDULED_CALL_FORCE_DELAY_MINUTES * MINUTE_MS;

const toRunnableSchedule = (
  schedule: CallSchedule
): ScheduledCallRun | null => {
  if (!schedule.enabled || schedule.nextRunAt === undefined) {
    return null;
  }

  return { schedule, targetRunAt: schedule.nextRunAt };
};

const isDueForPrenotification = ({
  atMs,
  run,
}: {
  readonly atMs: number;
  readonly run: ScheduledCallRun;
}): boolean => {
  const targetRunAtMs = getEpochMs(run.targetRunAt);
  const notifyAtMs = targetRunAtMs - run.schedule.preNotifyMinutes * MINUTE_MS;

  return notifyAtMs <= atMs && atMs < targetRunAtMs;
};

const isDueForDueNotification = ({
  atMs,
  run,
}: {
  readonly atMs: number;
  readonly run: ScheduledCallRun;
}): boolean => {
  const targetRunAtMs = getEpochMs(run.targetRunAt);

  return targetRunAtMs <= atMs && atMs < getForceCallAtMs(run);
};

const isDueForStart = ({
  atMs,
  run,
}: {
  readonly atMs: number;
  readonly run: ScheduledCallRun;
}): boolean => getForceCallAtMs(run) <= atMs;

const getRunnableSchedules = (
  schedules: readonly CallSchedule[]
): readonly ScheduledCallRun[] =>
  schedules
    .map(toRunnableSchedule)
    .filter((run): run is ScheduledCallRun => run !== null);

const getScheduledRunKey = (run: ScheduledCallRun): string =>
  JSON.stringify([
    run.schedule.workspaceId,
    run.schedule.userId,
    run.targetRunAt,
  ]);

const dedupeScheduledRuns = (
  runs: readonly ScheduledCallRun[]
): readonly ScheduledCallRun[] =>
  runs.filter(
    (run, index) =>
      runs.findIndex(
        (candidate) => getScheduledRunKey(candidate) === getScheduledRunKey(run)
      ) === index
  );

const buildScheduledRunNotificationRecord = ({
  deps,
  kind,
  run,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly kind:
    | 'prenotification'
    | 'scheduled_call_due'
    | 'scheduled_call_start';
  readonly run: ScheduledCallRun;
  readonly session: CallSession;
}): CallNotificationRecord => ({
  callScheduleId: run.schedule.id,
  callSessionId: session.id,
  createdAt: deps.clock.now(),
  id: buildCallNotificationId([
    kind,
    run.schedule.workspaceId,
    run.schedule.userId,
    run.targetRunAt,
  ]),
  kind,
  targetRunAt: run.targetRunAt,
  userId: run.schedule.userId,
  workspaceId: run.schedule.workspaceId,
});

const claimScheduledRunNotification = async ({
  deps,
  kind,
  run,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly kind:
    | 'prenotification'
    | 'scheduled_call_due'
    | 'scheduled_call_start';
  readonly run: ScheduledCallRun;
  readonly session: CallSession;
}): Promise<CallNotificationRecord | null> => {
  const exists = await deps.callNotificationRepository.exists({
    kind,
    targetRunAt: run.targetRunAt,
    userId: run.schedule.userId,
    workspaceId: run.schedule.workspaceId,
  });

  if (exists) {
    return null;
  }
  const record = buildScheduledRunNotificationRecord({
    deps,
    kind,
    run,
    session,
  });
  const claimed = await tryCreateCallNotification({
    deps,
    record,
  });

  return claimed ? record : null;
};

const saveScheduledRunNotificationMessage = ({
  deps,
  record,
  slackMessage,
}: {
  readonly deps: CallWorkflowDeps;
  readonly record: CallNotificationRecord;
  readonly slackMessage: SlackMessageReference;
}): Promise<void> =>
  deps.callNotificationRepository.updateSlackMessage({
    notificationId: record.id,
    slackMessage,
    workspaceId: record.workspaceId,
  });

const getOrCreateRunnableSession = async ({
  deps,
  run,
}: {
  readonly deps: CallWorkflowDeps;
  readonly run: ScheduledCallRun;
}): Promise<CallSession> => {
  const { session } = await deps.callSessionService.createScheduledReviewCall({
    schedule: run.schedule,
    scheduledRunAt: run.targetRunAt,
  });

  return session;
};

const isStoppedSession = (session: CallSession): boolean =>
  FINAL_OR_STARTED_STATUSES.has(session.status);

const getSlackContext = ({
  deps,
  run,
}: {
  readonly deps: CallWorkflowDeps;
  readonly run: ScheduledCallRun;
}): Promise<{
  readonly linkedSlackUser: { readonly slackUserId: string };
  readonly workspace: Workspace;
}> =>
  getWorkspaceForUser({
    userId: run.schedule.userId,
    userProfileRepository: deps.userProfileRepository,
    workspaceId: run.schedule.workspaceId,
    workspaceRepository: deps.workspaceRepository,
  });

const sendPrenotificationForRun = async ({
  deps,
  run,
}: {
  readonly deps: CallWorkflowDeps;
  readonly run: ScheduledCallRun;
}): Promise<void> => {
  const session = await getOrCreateRunnableSession({ deps, run });

  if (isStoppedSession(session)) {
    return;
  }

  const notification = await claimScheduledRunNotification({
    deps,
    kind: 'prenotification',
    run,
    session,
  });

  if (notification === null) {
    return;
  }

  const latestSession = await deps.callSessionService.getById({
    callSessionId: session.id,
    workspaceId: session.workspaceId,
  });

  if (latestSession.status !== 'created') {
    return;
  }

  const { linkedSlackUser, workspace } = await getSlackContext({ deps, run });

  const slackMessage = await deps.notificationGateway.sendCallPrenotification({
    schedule: run.schedule,
    session: latestSession,
    slackUserId: linkedSlackUser.slackUserId,
    targetRunAt: run.targetRunAt,
    workspace,
  });
  await saveScheduledRunNotificationMessage({
    deps,
    record: notification,
    slackMessage,
  });
};

const sendDueNotificationForRun = async ({
  deps,
  run,
}: {
  readonly deps: CallWorkflowDeps;
  readonly run: ScheduledCallRun;
}): Promise<void> => {
  const session = await getOrCreateRunnableSession({ deps, run });

  if (isStoppedSession(session)) {
    return;
  }

  const notification = await claimScheduledRunNotification({
    deps,
    kind: 'scheduled_call_due',
    run,
    session,
  });

  if (notification === null) {
    return;
  }

  const latestSession = await deps.callSessionService.getById({
    callSessionId: session.id,
    workspaceId: session.workspaceId,
  });

  if (latestSession.status !== 'created') {
    return;
  }

  const { linkedSlackUser, workspace } = await getSlackContext({ deps, run });

  const slackMessage =
    await deps.notificationGateway.sendScheduledCallDueNotification({
      schedule: run.schedule,
      session: latestSession,
      slackUserId: linkedSlackUser.slackUserId,
      targetRunAt: run.targetRunAt,
      workspace,
    });
  await saveScheduledRunNotificationMessage({
    deps,
    record: notification,
    slackMessage,
  });
};

const startCallForRun = async ({
  atMs,
  deps,
  run,
}: {
  readonly atMs: number;
  readonly deps: CallWorkflowDeps;
  readonly run: ScheduledCallRun;
}): Promise<void> => {
  const session = await getOrCreateRunnableSession({ deps, run });
  const ringingTimeoutAtMs =
    getForceCallAtMs(run) + SCHEDULED_CALL_RING_TIMEOUT_MINUTES * MINUTE_MS;

  if (session.status === 'ringing' && ringingTimeoutAtMs <= atMs) {
    await deps.callSessionService.transitionCall({
      callSessionId: session.id,
      status: 'missed',
      workspaceId: session.workspaceId,
    });
    return;
  }

  if (session.status !== 'created') {
    return;
  }

  const shouldStart = await claimScheduledRunNotification({
    deps,
    kind: 'scheduled_call_start',
    run,
    session,
  });

  if (shouldStart === null) {
    return;
  }

  const latestSession = await deps.callSessionService.getById({
    callSessionId: session.id,
    workspaceId: session.workspaceId,
  });

  if (latestSession.status !== 'created') {
    return;
  }

  const ringingSession = await deps.callSessionService.transitionCall({
    callSessionId: latestSession.id,
    status: 'ringing',
    workspaceId: latestSession.workspaceId,
  });
  const { workspace } = await getSlackContext({ deps, run });
  const tokens = await deps.deviceTokenRepository.listByUser({
    userId: run.schedule.userId,
  });
  const failedTokens = await deps.notificationGateway.sendIncomingCall({
    session: ringingSession,
    tokens,
    workspace,
  });

  await deps.deviceTokenRepository.removeByTokens({ tokens: failedTokens });
};

export const sendCallPrenotifications = async ({
  at,
  deps,
}: {
  readonly at: string;
  readonly deps: CallWorkflowDeps;
}): Promise<void> => {
  const atMs = getEpochMs(at);
  const schedules = await deps.callScheduleRepository.listEnabled();
  const targetRuns = dedupeScheduledRuns(
    getRunnableSchedules(schedules).filter((run) =>
      isDueForPrenotification({ atMs, run })
    )
  );

  await Promise.all(
    targetRuns.map((run) => sendPrenotificationForRun({ deps, run }))
  );
};

export const sendScheduledCallDueNotifications = async ({
  at,
  deps,
}: {
  readonly at: string;
  readonly deps: CallWorkflowDeps;
}): Promise<void> => {
  const atMs = getEpochMs(at);
  const schedules = await deps.callScheduleRepository.listEnabled();
  const targetRuns = dedupeScheduledRuns(
    getRunnableSchedules(schedules).filter((run) =>
      isDueForDueNotification({ atMs, run })
    )
  );

  await Promise.all(
    targetRuns.map((run) => sendDueNotificationForRun({ deps, run }))
  );
};

export const startScheduledCalls = async ({
  at,
  deps,
}: {
  readonly at: string;
  readonly deps: CallWorkflowDeps;
}): Promise<void> => {
  const atMs = getEpochMs(at);
  const schedules = await deps.callScheduleRepository.listEnabled();
  const targetRuns = dedupeScheduledRuns(
    getRunnableSchedules(schedules).filter((run) =>
      isDueForStart({ atMs, run })
    )
  );

  await Promise.all(
    targetRuns.map((run) => startCallForRun({ atMs, deps, run }))
  );
};
