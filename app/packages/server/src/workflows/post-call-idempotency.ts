import {
  buildCallNotificationId,
  tryCreateCallNotification,
} from './call-notification-workflow-utils';
import type { CallWorkflowDeps } from './deps';
import type {
  CallSession,
  FollowUpTask,
  FollowUpTaskDraft,
  WorkTaskDraft,
} from '@exe/domain';
import { createHash } from 'node:crypto';

const createStableHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);

export const buildApprovedFollowUpTaskId = ({
  draft,
  session,
}: {
  readonly draft: FollowUpTaskDraft;
  readonly session: CallSession;
}): string => `follow_up_${session.id}_${createStableHash(draft)}`;

export const buildApprovedWorkTaskId = ({
  draft,
  session,
}: {
  readonly draft: WorkTaskDraft;
  readonly session: CallSession;
}): string => `work_${session.id}_${createStableHash(draft)}`;

export const tryClaimCallSummaryNotification = ({
  deps,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly session: CallSession;
}): Promise<boolean> =>
  tryCreateCallNotification({
    deps,
    record: {
      callSessionId: session.id,
      createdAt: deps.clock.now(),
      id: buildCallNotificationId([
        'call_summary',
        session.workspaceId,
        session.id,
        session.userId,
      ]),
      kind: 'call_summary',
      userId: session.userId,
      workspaceId: session.workspaceId,
    },
  });

export const tryClaimFollowUpAnswerNotification = ({
  deps,
  requesterSlackUserId,
  session,
  task,
}: {
  readonly deps: CallWorkflowDeps;
  readonly requesterSlackUserId: string;
  readonly session: CallSession;
  readonly task: FollowUpTask;
}): Promise<boolean> =>
  tryCreateCallNotification({
    deps,
    record: {
      callSessionId: session.id,
      createdAt: deps.clock.now(),
      id: buildCallNotificationId([
        'follow_up_answer',
        session.workspaceId,
        session.id,
        task.id,
        requesterSlackUserId,
      ]),
      kind: 'follow_up_answer',
      userId: requesterSlackUserId,
      workspaceId: session.workspaceId,
    },
  });
