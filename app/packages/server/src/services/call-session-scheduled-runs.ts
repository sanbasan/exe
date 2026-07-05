import { invalidRequestError } from '#server/errors';
import type {
  CallScheduleRepository,
  CallSessionRepository,
  Clock,
} from '#server/ports';
import type { CallSessionWithAgenda } from './call-session-types';
import { calculateNextRunAt, callScheduleSchema } from '@exe/domain';
import type {
  CallAgenda,
  CallSchedule,
  CallSession,
  CallStatus,
} from '@exe/domain';

const MINUTE_MS = 60_000;
const MANUAL_SCHEDULED_START_AHEAD_MINUTES = 60;
const MANUAL_SCHEDULED_START_GRACE_MINUTES = 10;
const FIRESTORE_ALREADY_EXISTS_CODE = 6;
const DOCUMENT_ID_PATTERN = /[^A-Za-z0-9_-]/gu;

const toDocumentIdPart = (value: string): string =>
  value.replace(DOCUMENT_ID_PATTERN, '_');

export const buildScheduledCallSessionId = ({
  schedule,
  scheduledRunAt,
}: {
  readonly schedule: CallSchedule;
  readonly scheduledRunAt: string;
}): string =>
  `scheduled_call_${[
    schedule.workspaceId,
    schedule.userId,
    schedule.id,
    scheduledRunAt,
  ]
    .map(toDocumentIdPart)
    .join('_')}`;

const isAlreadyExistsError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return (
    error.code === FIRESTORE_ALREADY_EXISTS_CODE ||
    error.code === 'already-exists'
  );
};

const getEpochMs = (dateTime: string): number => {
  const epochMs = new Date(dateTime).getTime();

  if (Number.isNaN(epochMs)) {
    throw invalidRequestError(`Invalid scheduled run time: ${dateTime}.`);
  }

  return epochMs;
};

export const shouldAdvanceScheduleForStatus = (status: CallStatus): boolean =>
  status === 'active' ||
  status === 'failed' ||
  status === 'missed' ||
  status === 'skipped';

const isManualScheduledRunWindow = ({
  now,
  schedule,
}: {
  readonly now: string;
  readonly schedule: CallSchedule;
}): boolean => {
  if (!schedule.enabled || schedule.nextRunAt === undefined) {
    return false;
  }

  const nowMs = getEpochMs(now);
  const runAtMs = getEpochMs(schedule.nextRunAt);
  const windowStartMs =
    runAtMs -
    Math.max(schedule.preNotifyMinutes, MANUAL_SCHEDULED_START_AHEAD_MINUTES) *
      MINUTE_MS;
  const windowEndMs =
    runAtMs + MANUAL_SCHEDULED_START_GRACE_MINUTES * MINUTE_MS;

  return windowStartMs <= nowMs && nowMs < windowEndMs;
};

const toExistingSessionWithAgenda = async ({
  getAgendaForSession,
  session,
}: {
  readonly getAgendaForSession: (params: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }) => Promise<CallAgenda>;
  readonly session: CallSession;
}): Promise<CallSessionWithAgenda> => ({
  agenda: await getAgendaForSession({
    callSessionId: session.id,
    workspaceId: session.workspaceId,
  }),
  session,
});

export const getOrCreateScheduledReviewCall = async ({
  callSessionRepository,
  createCall,
  getAgendaForSession,
  getSession,
  schedule,
  scheduledRunAt = schedule.nextRunAt,
}: {
  readonly callSessionRepository: CallSessionRepository;
  readonly createCall: (params: {
    readonly callScheduleId?: string;
    readonly focusTaskId?: string;
    readonly purpose: 'scheduled_review';
    readonly scheduledRunAt?: string;
    readonly sessionId?: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<CallSessionWithAgenda>;
  readonly getAgendaForSession: (params: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }) => Promise<CallAgenda>;
  readonly getSession: (params: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }) => Promise<CallSession>;
  readonly schedule: CallSchedule;
  readonly scheduledRunAt?: string;
}): Promise<CallSessionWithAgenda> => {
  if (scheduledRunAt === undefined) {
    throw invalidRequestError('Scheduled review call requires nextRunAt.');
  }

  const sessionId = buildScheduledCallSessionId({ schedule, scheduledRunAt });
  const existing = await callSessionRepository.getById({
    callSessionId: sessionId,
    workspaceId: schedule.workspaceId,
  });

  if (existing !== null) {
    return toExistingSessionWithAgenda({
      getAgendaForSession,
      session: existing,
    });
  }

  return createCall({
    callScheduleId: schedule.id,
    purpose: 'scheduled_review',
    scheduledRunAt,
    sessionId,
    userId: schedule.userId,
    workspaceId: schedule.workspaceId,
  }).catch(async (error: unknown): Promise<CallSessionWithAgenda> => {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }

    return toExistingSessionWithAgenda({
      getAgendaForSession,
      session: await getSession({
        callSessionId: sessionId,
        workspaceId: schedule.workspaceId,
      }),
    });
  });
};

export const advanceScheduleForSession = async ({
  callScheduleRepository,
  now,
  session,
}: {
  readonly callScheduleRepository: CallScheduleRepository;
  readonly now: string;
  readonly session: CallSession;
}): Promise<void> => {
  if (
    session.callScheduleId === undefined ||
    session.scheduledRunAt === undefined
  ) {
    return;
  }

  const schedule = await callScheduleRepository.getById({
    callScheduleId: session.callScheduleId,
    workspaceId: session.workspaceId,
  });

  if (schedule?.nextRunAt !== session.scheduledRunAt) {
    return;
  }

  const baseSchedule = callScheduleSchema.parse({
    createdAt: schedule.createdAt,
    enabled: schedule.enabled,
    excludedDates: schedule.excludedDates,
    id: schedule.id,
    preNotifyMinutes: schedule.preNotifyMinutes,
    timeOfDay: schedule.timeOfDay,
    timezone: schedule.timezone,
    updatedAt: now,
    userId: schedule.userId,
    weekdays: schedule.weekdays,
    workspaceId: schedule.workspaceId,
  });
  const nextRunAt = calculateNextRunAt({
    after: new Date(session.scheduledRunAt),
    schedule: baseSchedule,
  });

  await callScheduleRepository.upsert({
    schedule: callScheduleSchema.parse({
      ...baseSchedule,
      ...(nextRunAt === null ? {} : { nextRunAt }),
    }),
  });
};

export const findManualScheduledRun = async ({
  callScheduleRepository,
  clock,
  mode,
  userId,
  workspaceId,
}: {
  readonly callScheduleRepository: CallScheduleRepository;
  readonly clock: Clock;
  readonly mode: 'auto' | 'manual_review' | 'scheduled_review';
  readonly userId: string;
  readonly workspaceId: string;
}): Promise<CallSchedule | null> => {
  if (mode === 'manual_review') {
    return null;
  }

  const schedule = await callScheduleRepository.getByUser({
    userId,
    workspaceId,
  });

  if (
    schedule?.nextRunAt === undefined ||
    (mode === 'auto' &&
      !isManualScheduledRunWindow({ now: clock.now(), schedule }))
  ) {
    return null;
  }

  return schedule;
};
