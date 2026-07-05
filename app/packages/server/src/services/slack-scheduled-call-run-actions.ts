import {
  resolveActionableScheduledCallRun,
  updateScheduledCallRunMessage,
  type ScheduledCallRunActionDeps,
} from './slack-scheduled-call-run-shared';
import { slackActionIds } from '@exe/slack';

/**
 * Handles the "Skip this run" button. The button carries the signed call-run
 * reference directly in its value.
 */
export const handleSkipScheduledCallRunAction = async ({
  actionId,
  channelId,
  deps,
  messageTs,
  slackTeamId,
  slackUserId,
  value,
}: {
  readonly actionId: string;
  readonly channelId?: string;
  readonly deps: ScheduledCallRunActionDeps;
  readonly messageTs?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly value?: string;
}): Promise<void> => {
  if (actionId !== slackActionIds.skipScheduledCallRun || value === undefined) {
    return;
  }

  const resolved = await resolveActionableScheduledCallRun({
    ...(channelId === undefined ? {} : { channelId }),
    deps,
    ...(messageTs === undefined ? {} : { messageTs }),
    reference: value,
    report: true,
    slackTeamId,
    slackUserId,
  });

  if (resolved === null) {
    return;
  }

  await deps.callSessionService.transitionCall({
    callSessionId: resolved.session.id,
    status: 'skipped',
    workspaceId: resolved.session.workspaceId,
  });

  await updateScheduledCallRunMessage({
    ...(channelId === undefined ? {} : { channelId }),
    deps,
    kind: 'skipped',
    ...(messageTs === undefined ? {} : { messageTs }),
    resolved,
    workspace: resolved.workspace,
  });
};
