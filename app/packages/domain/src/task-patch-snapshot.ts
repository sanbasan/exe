import {
  followUpTaskPatchSchema,
  workTaskPatchSchema,
  type FollowUpTask,
  type FollowUpTaskPatch,
  type Task,
  type TaskPatchPayload,
  type WorkTask,
  type WorkTaskPatch,
} from './task';

const getFollowUpTaskPatchSnapshot = (task: FollowUpTask): FollowUpTaskPatch =>
  followUpTaskPatchSchema.parse({
    ...(task.followUpAnswer === undefined
      ? {}
      : { followUpAnswer: task.followUpAnswer }),
    ...(task.channelId === undefined ? {} : { channelId: task.channelId }),
    assigneeSlackUserIds: task.assigneeSlackUserIds,
    followUpQuestion: task.followUpQuestion,
    kind: 'follow_up',
    requesterSlackUserIds: task.requesterSlackUserIds,
    status: task.status,
    title: task.title,
  });

const getWorkTaskPatchSnapshot = (task: WorkTask): WorkTaskPatch =>
  workTaskPatchSchema.parse({
    ...(task.channelId === undefined ? {} : { channelId: task.channelId }),
    ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
    assigneeSlackUserIds: task.assigneeSlackUserIds,
    kind: 'work',
    requesterSlackUserIds: task.requesterSlackUserIds,
    status: task.status,
    title: task.title,
  });

export const getTaskPatchSnapshot = (task: Task): TaskPatchPayload => {
  switch (task.kind) {
    case 'follow_up':
      return getFollowUpTaskPatchSnapshot(task);
    case 'work':
      return getWorkTaskPatchSnapshot(task);
  }
};
