import { withSlackBotToken } from './slack-bot-token';
import {
  applyReschedule,
  formatScheduledRunTime,
  SCHEDULED_CALL_RUN_MINUTE_MS,
  skipScheduledRun,
} from './slack-scheduled-call-run-reschedule-helpers';
import {
  resolveActionableScheduledCallRun,
  resolveScheduledCallRun,
  updateScheduledCallRunMessage,
  type ScheduledCallRunActionDeps,
} from './slack-scheduled-call-run-shared';
import {
  buildScheduledCallRunRescheduleModal,
  formatSlackDateInput,
  formatSlackTimeInput,
  getScheduledCallRunReschedulePresetMinutes,
  isScheduledCallRunReschedulePreset,
  localDateTimeToIso,
  parseScheduledCallRunRescheduleModalPrivateMetadata,
  parseScheduledCallRunRescheduleSubmission,
  parseScheduledCallRunReferenceFromBlockId,
  slackActionIds,
  slackViewIds,
} from '@exe/slack';

/**
 * Handles the quick-preset reschedule dropdown. The signed reference travels in
 * the surrounding actions block's `block_id` because `static_select` option
 * values are too short to hold it.
 */
export const handleRescheduleScheduledCallRunAction = async ({
  actionId,
  blockId,
  channelId,
  deps,
  messageTs,
  selectedOptionValue,
  slackTeamId,
  slackUserId,
}: {
  readonly actionId: string;
  readonly blockId?: string;
  readonly channelId?: string;
  readonly deps: ScheduledCallRunActionDeps;
  readonly messageTs?: string;
  readonly selectedOptionValue?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
}): Promise<void> => {
  if (
    actionId !== slackActionIds.rescheduleScheduledCallRun ||
    selectedOptionValue === undefined ||
    blockId === undefined ||
    !isScheduledCallRunReschedulePreset(selectedOptionValue)
  ) {
    return;
  }

  const reference = parseScheduledCallRunReferenceFromBlockId(blockId);

  if (reference === null) {
    return;
  }

  const resolved = await resolveActionableScheduledCallRun({
    ...(channelId === undefined ? {} : { channelId }),
    deps,
    ...(messageTs === undefined ? {} : { messageTs }),
    reference,
    report: true,
    slackTeamId,
    slackUserId,
  });

  if (resolved === null) {
    return;
  }

  const newRunAt = new Date(
    new Date(deps.clock.now()).getTime() +
      getScheduledCallRunReschedulePresetMinutes(selectedOptionValue) *
        SCHEDULED_CALL_RUN_MINUTE_MS
  ).toISOString();

  await applyReschedule({ deps, newRunAt, resolved });

  await updateScheduledCallRunMessage({
    ...(channelId === undefined ? {} : { channelId }),
    deps,
    kind: 'rescheduled',
    ...(messageTs === undefined ? {} : { messageTs }),
    resolved,
    time: formatScheduledRunTime({
      isoDateTime: newRunAt,
      workspace: resolved.workspace,
    }),
    workspace: resolved.workspace,
  });
};

/**
 * Opens the custom-time modal seeded with the current run's date/time.
 */
export const openScheduledCallRunRescheduleModal = async ({
  actionId,
  channelId,
  deps,
  messageTs,
  slackTeamId,
  slackUserId,
  triggerId,
  value,
}: {
  readonly actionId: string;
  readonly channelId?: string;
  readonly deps: ScheduledCallRunActionDeps;
  readonly messageTs?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly triggerId?: string;
  readonly value?: string;
}): Promise<void> => {
  if (
    actionId !== slackActionIds.openScheduledCallRunReschedule ||
    triggerId === undefined ||
    value === undefined
  ) {
    return;
  }

  const resolved = await resolveScheduledCallRun({
    deps,
    reference: value,
    slackTeamId,
    slackUserId,
  });

  if (resolved.status === 'invalid') {
    return;
  }

  const initialDate =
    formatSlackDateInput({
      isoDateTime: resolved.scheduledRunAt,
      timezone: resolved.workspace.timezone,
    }) ??
    formatSlackDateInput({
      isoDateTime: deps.clock.now(),
      timezone: resolved.workspace.timezone,
    }) ??
    '';
  const initialTime =
    formatSlackTimeInput({
      isoDateTime: resolved.scheduledRunAt,
      timezone: resolved.workspace.timezone,
    }) ?? '09:00';

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.openView({
        botToken,
        triggerId,
        view: buildScheduledCallRunRescheduleModal({
          ...(channelId === undefined ? {} : { channelId }),
          initialDate,
          initialTime,
          language: resolved.workspace.language,
          ...(messageTs === undefined ? {} : { messageTs }),
          reference: value,
          timezone: resolved.workspace.timezone,
        }),
      }),
    slackGateway: deps.slackGateway,
    workspace: resolved.workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

/**
 * Handles the custom-time modal submission. A chosen time at or before now is
 * treated as a skip; otherwise the run is rescheduled to the chosen time.
 */
export const saveScheduledCallRunRescheduleModal = async ({
  callbackId,
  deps,
  privateMetadata,
  slackTeamId,
  slackUserId,
  stateValues,
}: {
  readonly callbackId: string;
  readonly deps: ScheduledCallRunActionDeps;
  readonly privateMetadata?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly stateValues: unknown;
}): Promise<void> => {
  if (
    callbackId !== slackViewIds.scheduledCallRunReschedule ||
    privateMetadata === undefined
  ) {
    return;
  }

  const submission = parseScheduledCallRunRescheduleSubmission(stateValues);

  if (submission === null) {
    return;
  }

  const metadata =
    parseScheduledCallRunRescheduleModalPrivateMetadata(privateMetadata);
  const resolved = await resolveScheduledCallRun({
    deps,
    reference: metadata.reference,
    slackTeamId,
    slackUserId,
  });

  if (resolved.status === 'invalid' || resolved.session.status !== 'created') {
    return;
  }

  const newRunAt = localDateTimeToIso({
    date: submission.date,
    time: submission.time,
    timezone: resolved.workspace.timezone,
  });

  if (newRunAt === null) {
    return;
  }

  // A time at or before "now" means the user wants to skip this run.
  if (new Date(newRunAt).getTime() <= new Date(deps.clock.now()).getTime()) {
    await skipScheduledRun({ deps, resolved });
    await updateScheduledCallRunMessage({
      ...(metadata.channelId === undefined
        ? {}
        : { channelId: metadata.channelId }),
      deps,
      kind: 'skipped',
      ...(metadata.messageTs === undefined
        ? {}
        : { messageTs: metadata.messageTs }),
      resolved,
      workspace: resolved.workspace,
    });
    return;
  }

  await applyReschedule({ deps, newRunAt, resolved });
  await updateScheduledCallRunMessage({
    ...(metadata.channelId === undefined
      ? {}
      : { channelId: metadata.channelId }),
    deps,
    kind: 'rescheduled',
    ...(metadata.messageTs === undefined
      ? {}
      : { messageTs: metadata.messageTs }),
    resolved,
    time: formatScheduledRunTime({
      isoDateTime: newRunAt,
      workspace: resolved.workspace,
    }),
    workspace: resolved.workspace,
  });
};
