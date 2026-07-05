import { workTaskSchema, type WorkTask, type WorkTaskDraft } from './task';

export const createWorkTaskFromDraft = ({
  draft,
  id,
  now,
  workspaceId,
}: {
  readonly draft: WorkTaskDraft;
  readonly id: string;
  readonly now: string;
  readonly workspaceId: string;
}): WorkTask => {
  if (draft.assigneeSlackUserIds.length === 0) {
    throw new Error('Work task requires assigneeSlackUserIds.');
  }

  if (draft.requesterSlackUserIds.length === 0) {
    throw new Error('Work task requires requesterSlackUserIds.');
  }

  return workTaskSchema.parse({
    assigneeSlackUserIds: draft.assigneeSlackUserIds,
    ...(draft.channelId === undefined ? {} : { channelId: draft.channelId }),
    createdAt: now,
    ...(draft.dueAt === undefined ? {} : { dueAt: draft.dueAt }),
    id,
    kind: 'work',
    requesterSlackUserIds: draft.requesterSlackUserIds,
    status: 'active',
    title: draft.title,
    updatedAt: now,
    workspaceId,
  });
};
