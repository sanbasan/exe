/* eslint-disable max-lines -- Task schemas, patches, and selectors are kept together as one domain contract. */
import {
  dateTimeSchema,
  slackChannelIdSchema,
  slackMessageTsSchema,
  slackUserIdSchema,
  workspaceIdSchema,
} from './common';
import { z } from 'zod';

export const taskKindSchema = z.enum(['follow_up', 'work']);

export const taskStatusSchema = z.enum([
  'active',
  'blocked',
  'cancelled',
  'completed',
]);

const slackUserIdsSchema = z.array(slackUserIdSchema);

export const workTaskSchema = z
  .object({
    assigneeSlackUserIds: slackUserIdsSchema,
    channelId: slackChannelIdSchema.optional(),
    completedAt: dateTimeSchema.nullable().default(null),
    createdAt: dateTimeSchema,
    dueAt: dateTimeSchema.optional(),
    id: z.string().min(1),
    kind: z.literal('work'),
    messageTs: slackMessageTsSchema.optional(),
    requesterSlackUserIds: slackUserIdsSchema,
    status: taskStatusSchema,
    threadTs: slackMessageTsSchema.optional(),
    title: z.string().min(1),
    updatedAt: dateTimeSchema,
    workspaceId: workspaceIdSchema,
  })
  .strip();

export const followUpTaskSchema = z
  .object({
    assigneeSlackUserIds: slackUserIdsSchema,
    channelId: slackChannelIdSchema.optional(),
    completedAt: dateTimeSchema.nullable().default(null),
    createdAt: dateTimeSchema,
    followUpAnswer: z.string().min(1).optional(),
    followUpQuestion: z.string().min(1),
    id: z.string().min(1),
    kind: z.literal('follow_up'),
    messageTs: slackMessageTsSchema.optional(),
    requesterSlackUserIds: slackUserIdsSchema,
    sourceTaskId: z.string().min(1).optional(),
    status: taskStatusSchema,
    threadTs: slackMessageTsSchema.optional(),
    title: z.string().min(1),
    updatedAt: dateTimeSchema,
    workspaceId: workspaceIdSchema,
  })
  .strip();

export const taskSchema = z.discriminatedUnion('kind', [
  followUpTaskSchema,
  workTaskSchema,
]);

export const workTaskPatchSchema = z
  .object({
    assigneeSlackUserIds: slackUserIdsSchema.optional(),
    channelId: slackChannelIdSchema.optional(),
    dueAt: dateTimeSchema.nullable().optional(),
    kind: z.literal('work'),
    requesterSlackUserIds: slackUserIdsSchema.optional(),
    status: taskStatusSchema.optional(),
    title: z.string().min(1).optional(),
  })
  .strip();

export const followUpTaskPatchSchema = z
  .object({
    assigneeSlackUserIds: slackUserIdsSchema.optional(),
    channelId: slackChannelIdSchema.optional(),
    followUpAnswer: z.string().min(1).optional(),
    followUpQuestion: z.string().min(1).optional(),
    kind: z.literal('follow_up'),
    requesterSlackUserIds: slackUserIdsSchema.optional(),
    status: taskStatusSchema.optional(),
    title: z.string().min(1).optional(),
  })
  .strip();

export const taskPatchPayloadSchema = z.discriminatedUnion('kind', [
  followUpTaskPatchSchema,
  workTaskPatchSchema,
]);

// Session-local draft ID assigned when a proposal is recorded during a call.
// A later proposal with the same draftId supersedes the earlier one, and a
// *_discarded call event with the draftId removes it from post-call apply.
const draftIdSchema = z.string().min(1);

export const taskPatchSchema = z
  .object({
    after: taskPatchPayloadSchema,
    before: taskPatchPayloadSchema.optional(),
    draftId: draftIdSchema.optional(),
    reason: z.string().min(1).optional(),
    taskId: z.string().min(1),
  })
  .strict();

export const followUpTaskDraftSchema = z
  .object({
    assigneeSlackUserIds: slackUserIdsSchema.optional(),
    channelId: slackChannelIdSchema.optional(),
    draftId: draftIdSchema.optional(),
    followUpQuestion: z.string().min(1),
    requesterSlackUserIds: slackUserIdsSchema,
    sourceTaskId: z.string().min(1).optional(),
    title: z.string().min(1),
  })
  .strip();

export const workTaskDraftSchema = z
  .object({
    assigneeSlackUserIds: slackUserIdsSchema,
    channelId: slackChannelIdSchema.optional(),
    draftId: draftIdSchema.optional(),
    dueAt: dateTimeSchema.optional(),
    requesterSlackUserIds: slackUserIdsSchema,
    title: z.string().min(1),
  })
  .strip();

export type FollowUpTask = z.infer<typeof followUpTaskSchema>;

export type FollowUpTaskDraft = z.infer<typeof followUpTaskDraftSchema>;

export type FollowUpTaskPatch = z.infer<typeof followUpTaskPatchSchema>;

export type Task = z.infer<typeof taskSchema>;

export type TaskKind = z.infer<typeof taskKindSchema>;

export type TaskPatch = z.infer<typeof taskPatchSchema>;

export type TaskPatchPayload = z.infer<typeof taskPatchPayloadSchema>;

export type TaskStatus = z.infer<typeof taskStatusSchema>;

export type WorkTask = z.infer<typeof workTaskSchema>;

export type WorkTaskPatch = z.infer<typeof workTaskPatchSchema>;

export type WorkTaskDraft = z.infer<typeof workTaskDraftSchema>;

const ensurePatchMatchesTask = ({
  patch,
  task,
}: {
  readonly patch: TaskPatch;
  readonly task: Task;
}): void => {
  if (task.id !== patch.taskId) {
    throw new Error('Task patch target does not match task id.');
  }

  if (task.kind !== patch.after.kind) {
    throw new Error('Task patch kind does not match task kind.');
  }

  if (patch.before !== undefined && task.kind !== patch.before.kind) {
    throw new Error('Task patch before kind does not match task kind.');
  }
};

export const isOpenTaskStatus = (status: TaskStatus): boolean =>
  status === 'active' || status === 'blocked';

export const isFollowUpTask = (task: Task): task is FollowUpTask =>
  task.kind === 'follow_up';

export const isWorkTask = (task: Task): task is WorkTask =>
  task.kind === 'work';

export const getOpenFollowUpTasksForAssignee = ({
  slackUserId,
  tasks,
}: {
  readonly slackUserId: string;
  readonly tasks: readonly Task[];
}): readonly FollowUpTask[] =>
  tasks
    .filter(isFollowUpTask)
    .filter(
      (task) =>
        task.assigneeSlackUserIds.includes(slackUserId) &&
        isOpenTaskStatus(task.status)
    )
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));

export const getOpenWorkTasksForAssignee = ({
  slackUserId,
  tasks,
}: {
  readonly slackUserId: string;
  readonly tasks: readonly Task[];
}): readonly WorkTask[] =>
  tasks
    .filter(isWorkTask)
    .filter(
      (task) =>
        task.assigneeSlackUserIds.includes(slackUserId) &&
        isOpenTaskStatus(task.status)
    )
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));

export const getOpenWorkTasksForRequester = ({
  slackUserId,
  tasks,
}: {
  readonly slackUserId: string;
  readonly tasks: readonly Task[];
}): readonly WorkTask[] =>
  tasks
    .filter(isWorkTask)
    .filter(
      (task) =>
        task.requesterSlackUserIds.includes(slackUserId) &&
        isOpenTaskStatus(task.status)
    )
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));

const normalizeWorkTaskCompletedAt = ({
  now,
  task,
}: {
  readonly now: string;
  readonly task: WorkTask;
}): WorkTask =>
  workTaskSchema.parse({
    ...task,
    completedAt: task.status === 'completed' ? (task.completedAt ?? now) : null,
  });

const normalizeFollowUpTaskCompletedAt = ({
  now,
  task,
}: {
  readonly now: string;
  readonly task: FollowUpTask;
}): FollowUpTask =>
  followUpTaskSchema.parse({
    ...task,
    completedAt: task.status === 'completed' ? (task.completedAt ?? now) : null,
  });

export const applyTaskPatch = ({
  now,
  patch,
  task,
}: {
  readonly now: string;
  readonly patch: TaskPatch;
  readonly task: Task;
}): Task => {
  ensurePatchMatchesTask({ patch, task });

  switch (task.kind) {
    case 'follow_up':
      return normalizeFollowUpTaskCompletedAt({
        now,
        task: followUpTaskSchema.parse({
          ...task,
          ...patch.after,
          kind: 'follow_up',
          updatedAt: now,
        }),
      });
    case 'work': {
      const patchedTask = {
        ...task,
        ...patch.after,
        kind: 'work',
        updatedAt: now,
      };
      if (patch.after.kind === 'work' && patch.after.dueAt === null) {
        Reflect.deleteProperty(patchedTask, 'dueAt');
      }
      return normalizeWorkTaskCompletedAt({
        now,
        task: workTaskSchema.parse(patchedTask),
      });
    }
  }
};

export const answerFollowUpTask = ({
  answer,
  now,
  task,
}: {
  readonly answer: string;
  readonly now: string;
  readonly task: FollowUpTask;
}): FollowUpTask =>
  followUpTaskSchema.parse({
    ...task,
    completedAt: now,
    followUpAnswer: answer,
    status: 'completed',
    updatedAt: now,
  });
