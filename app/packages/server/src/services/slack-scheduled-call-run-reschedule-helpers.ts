import type {
  ResolvedScheduledCallRun,
  ScheduledCallRunActionDeps,
} from './slack-scheduled-call-run-shared';
import {
  callScheduleSchema,
  type CallSchedule,
  type Workspace,
} from '@exe/domain';
import { formatSlackDateTime } from '@exe/slack';

export const SCHEDULED_CALL_RUN_MINUTE_MS = 60_000;

type ActionableRun = Extract<ResolvedScheduledCallRun, { status: 'ok' }>;

/**
 * Repoints the schedule's `nextRunAt` to the new run time and skips the existing
 * `created` session so the workflow re-creates and fires the call at the new
 * time. Because the skipped session no longer matches `schedule.nextRunAt`, the
 * skip transition does not advance the schedule past the new time.
 */
export const applyReschedule = async ({
  deps,
  newRunAt,
  resolved,
}: {
  readonly deps: ScheduledCallRunActionDeps;
  readonly newRunAt: string;
  readonly resolved: ActionableRun;
}): Promise<void> => {
  const now = deps.clock.now();
  const reschedule = (schedule: CallSchedule): CallSchedule =>
    callScheduleSchema.parse({
      ...schedule,
      nextRunAt: newRunAt,
      updatedAt: now,
    });

  await deps.callScheduleRepository.upsert({
    schedule: reschedule(resolved.schedule),
  });

  if (resolved.session.status === 'created') {
    await deps.callSessionService.transitionCall({
      callSessionId: resolved.session.id,
      status: 'skipped',
      workspaceId: resolved.session.workspaceId,
    });
  }
};

export const skipScheduledRun = async ({
  deps,
  resolved,
}: {
  readonly deps: ScheduledCallRunActionDeps;
  readonly resolved: ActionableRun;
}): Promise<void> => {
  if (resolved.session.status !== 'created') {
    return;
  }

  await deps.callSessionService.transitionCall({
    callSessionId: resolved.session.id,
    status: 'skipped',
    workspaceId: resolved.session.workspaceId,
  });
};

export const formatScheduledRunTime = ({
  isoDateTime,
  workspace,
}: {
  readonly isoDateTime: string;
  readonly workspace: Workspace;
}): string =>
  formatSlackDateTime({
    isoDateTime,
    language: workspace.language,
    timezone: workspace.timezone,
  });
