import {
  followUpTaskSchema,
  type FollowUpTask,
  type FollowUpTaskDraft,
} from './task';

export const createFollowUpTaskFromDraft = ({
  draft,
  id,
  now,
  workspaceId,
}: {
  readonly draft: FollowUpTaskDraft;
  readonly id: string;
  readonly now: string;
  readonly workspaceId: string;
}): FollowUpTask => {
  if (
    draft.assigneeSlackUserIds === undefined ||
    draft.assigneeSlackUserIds.length === 0
  ) {
    throw new Error('Follow-up task requires assigneeSlackUserIds.');
  }

  return followUpTaskSchema.parse({
    ...(draft.channelId === undefined ? {} : { channelId: draft.channelId }),
    ...(draft.sourceTaskId === undefined
      ? {}
      : { sourceTaskId: draft.sourceTaskId }),
    assigneeSlackUserIds: draft.assigneeSlackUserIds,
    createdAt: now,
    followUpQuestion: draft.followUpQuestion,
    id,
    kind: 'follow_up',
    requesterSlackUserIds: draft.requesterSlackUserIds,
    status: 'active',
    title: draft.title,
    updatedAt: now,
    workspaceId,
  });
};
