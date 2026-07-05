import { workTaskSchema, type WorkTask, type WorkTaskDraft } from './task';

// Empty assignee/requester arrays are allowed: external work (a client
// confirmation, a vendor deliverable) is modeled as a task with no assignee.
export const createWorkTaskFromDraft = ({
  draft,
  id,
  now,
  sourceMeetingId,
  startAt,
  workspaceId,
}: {
  readonly draft: WorkTaskDraft;
  readonly id: string;
  readonly now: string;
  readonly sourceMeetingId?: string;
  readonly startAt?: string;
  readonly workspaceId: string;
}): WorkTask =>
  workTaskSchema.parse({
    assigneeSlackUserIds: draft.assigneeSlackUserIds,
    ...(draft.channelId === undefined ? {} : { channelId: draft.channelId }),
    createdAt: now,
    ...(draft.description === undefined
      ? {}
      : { description: draft.description }),
    ...(draft.dueAt === undefined ? {} : { dueAt: draft.dueAt }),
    id,
    kind: 'work',
    requesterSlackUserIds: draft.requesterSlackUserIds,
    ...(sourceMeetingId === undefined ? {} : { sourceMeetingId }),
    ...(startAt === undefined ? {} : { startAt }),
    status: 'active',
    title: draft.title,
    updatedAt: now,
    workspaceId,
  });
