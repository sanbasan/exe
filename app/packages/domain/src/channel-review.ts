import { channelSchema } from './channel';
import {
  dateTimeSchema,
  slackChannelIdSchema,
  slackUserIdSchema,
  workspaceIdSchema,
} from './common';
import { classifyDueAt } from './due-reminder';
import {
  isOpenTaskStatus,
  isWorkTask,
  workTaskSchema,
  type Task,
  type WorkTask,
} from './task';
import { z } from 'zod';

export const channelBlockStatusSchema = z.enum(['active', 'resolved']);

export const channelBlockSchema = z
  .object({
    channelId: slackChannelIdSchema,
    createdAt: dateTimeSchema,
    createdBySlackUserId: slackUserIdSchema,
    description: z.string().min(1),
    id: z.string().min(1),
    messageTs: z.string().min(1).optional(),
    resolvedAt: dateTimeSchema.optional(),
    status: channelBlockStatusSchema,
    threadTs: z.string().min(1).optional(),
    title: z.string().min(1),
    updatedAt: dateTimeSchema,
    workspaceId: workspaceIdSchema,
  })
  .strip();

export const channelReviewStateSchema = z
  .object({
    channelId: slackChannelIdSchema,
    createdAt: dateTimeSchema,
    id: z.string().min(1),
    lastCheckedAt: dateTimeSchema.optional(),
    lastSelfReport: z.string().min(1).optional(),
    nextCheckAt: dateTimeSchema.optional(),
    nextCheckReason: z.string().min(1).optional(),
    slackUserId: slackUserIdSchema,
    statusText: z.string().min(1).optional(),
    statusUpdatedAt: dateTimeSchema.optional(),
    updatedAt: dateTimeSchema,
    workspaceId: workspaceIdSchema,
  })
  .strict();

// A pending block change proposed during a call, applied automatically after
// the call (like task/latest-info drafts). "create" carries title/description;
// "update" carries the changed fields; "resolve"/"delete" carry only the
// blockId. channelId/channelName locate the block's channel for display.
export const channelBlockDraftActionSchema = z.enum([
  'create',
  'delete',
  'resolve',
  'update',
]);

export const channelBlockDraftSchema = z
  .object({
    action: channelBlockDraftActionSchema,
    blockId: z.string().min(1).optional(),
    channelId: slackChannelIdSchema,
    channelName: z.string().min(1),
    description: z.string().min(1).optional(),
    draftId: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
  })
  .strict();

// A pending channel-review status proposed during a call: the caller's own
// per-channel status (and optional next check), applied automatically after
// the call via recordChannelReviewForSlackUser.
export const channelReviewDraftSchema = z
  .object({
    channelId: slackChannelIdSchema,
    channelName: z.string().min(1),
    draftId: z.string().min(1).optional(),
    lastSelfReport: z.string().min(1).optional(),
    nextCheckAt: z.string().min(1).optional(),
    nextCheckReason: z.string().min(1).optional(),
    statusText: z.string().min(1),
  })
  .strict();

export const channelReviewAgendaItemSchema = z
  .object({
    activeBlocks: z.array(channelBlockSchema),
    assignedWorkTasks: z.array(workTaskSchema),
    channel: channelSchema,
    completedWorkTasksSinceLastCheck: z.array(workTaskSchema),
    otherActiveWorkTasks: z.array(workTaskSchema),
    requestedWorkTasks: z.array(workTaskSchema),
    reviewState: channelReviewStateSchema.optional(),
  })
  .strict();

export type ChannelBlock = z.infer<typeof channelBlockSchema>;

export type ChannelBlockDraft = z.infer<typeof channelBlockDraftSchema>;

export type ChannelBlockDraftAction = z.infer<
  typeof channelBlockDraftActionSchema
>;

export type ChannelBlockStatus = z.infer<typeof channelBlockStatusSchema>;

export type ChannelReviewDraft = z.infer<typeof channelReviewDraftSchema>;

export type ChannelReviewAgendaItem = z.infer<
  typeof channelReviewAgendaItemSchema
>;

export type ChannelReviewState = z.infer<typeof channelReviewStateSchema>;

const MS_PER_DAY = 86_400_000;

// A next-check date this far out (or more) requires an explicit reason,
// matching the "8日以上先の場合は理由を聞く" rule.
const FAR_OUT_NEXT_CHECK_DAYS = 8;

export const isFarOutNextCheck = ({
  from,
  nextCheckAt,
}: {
  readonly from: string;
  readonly nextCheckAt: string;
}): boolean => {
  const fromMs = new Date(from).getTime();
  const nextMs = new Date(nextCheckAt).getTime();

  if (Number.isNaN(fromMs) || Number.isNaN(nextMs)) {
    return false;
  }

  return nextMs - fromMs >= FAR_OUT_NEXT_CHECK_DAYS * MS_PER_DAY;
};

// Whether a channel is due for review in the regular call. Due when no next
// check is planned, or the planned date is today or in the past — evaluated as
// calendar days in the workspace timezone, so a next check "today at 23:00" is
// still due on a morning call. A future next-check date means the channel is
// skipped this time.
export const isChannelReviewDue = ({
  nextCheckAt,
  now,
  timezone,
}: {
  readonly nextCheckAt?: string;
  readonly now: string;
  readonly timezone: string;
}): boolean => {
  if (nextCheckAt === undefined) {
    return true;
  }

  const category = classifyDueAt({ dueAt: nextCheckAt, now, timezone });

  // null covers an unreadable stored date: never silently skip the channel.
  return category === null || category === 'overdue' || category === 'today';
};

export const channelReviewStateDocumentId = ({
  channelId,
  slackUserId,
}: {
  readonly channelId: string;
  readonly slackUserId: string;
}): string => `${channelId}:${slackUserId}`;

export const isActiveChannelBlock = (block: ChannelBlock): boolean =>
  block.status === 'active';

export const buildChannelReviewItems = ({
  activeChannels,
  blocks,
  openWorkTasks,
  requestedWorkTasks,
  reviewStates,
  slackUserId,
  tasks,
}: {
  readonly activeChannels: readonly import('./channel').Channel[];
  readonly blocks?: readonly ChannelBlock[];
  readonly openWorkTasks: readonly WorkTask[];
  readonly requestedWorkTasks: readonly WorkTask[];
  readonly reviewStates?: readonly ChannelReviewState[];
  readonly slackUserId: string;
  readonly tasks: readonly Task[];
}): readonly ChannelReviewAgendaItem[] => {
  const stateByChannelId = new Map(
    (reviewStates ?? [])
      .filter((state) => state.slackUserId === slackUserId)
      .map((state) => [state.channelId, state])
  );
  const activeBlocks = (blocks ?? []).filter(isActiveChannelBlock);
  const workTasks = tasks.filter(isWorkTask);

  return activeChannels
    .filter((channel) =>
      channel.assigneeSlackUserIds.some((assignee) => assignee === slackUserId)
    )
    .map((channel) => {
      const reviewState = stateByChannelId.get(channel.channelId);
      const lastCheckedAt = reviewState?.lastCheckedAt;

      return channelReviewAgendaItemSchema.parse({
        activeBlocks: activeBlocks.filter(
          (block) => block.channelId === channel.channelId
        ),
        assignedWorkTasks: openWorkTasks.filter(
          (task) => task.channelId === channel.channelId
        ),
        channel,
        completedWorkTasksSinceLastCheck: workTasks
          .filter(
            (task) =>
              task.channelId === channel.channelId &&
              task.assigneeSlackUserIds.includes(slackUserId) &&
              task.status === 'completed' &&
              task.completedAt !== null &&
              (lastCheckedAt === undefined || task.completedAt > lastCheckedAt)
          )
          .toSorted((left, right) =>
            (right.completedAt ?? '').localeCompare(left.completedAt ?? '')
          ),
        otherActiveWorkTasks: workTasks
          .filter(
            (task) =>
              task.channelId === channel.channelId &&
              isOpenTaskStatus(task.status) &&
              !task.assigneeSlackUserIds.includes(slackUserId)
          )
          .toSorted((left, right) =>
            left.createdAt.localeCompare(right.createdAt)
          ),
        requestedWorkTasks: requestedWorkTasks.filter(
          (task) => task.channelId === channel.channelId
        ),
        ...(reviewState === undefined ? {} : { reviewState }),
      });
    });
};

export const buildNextChannelReviewState = ({
  channelId,
  existing,
  lastSelfReport,
  nextCheckAt,
  nextCheckReason,
  now,
  slackUserId,
  statusText,
  workspaceId,
}: {
  readonly channelId: string;
  readonly existing: ChannelReviewState | null;
  readonly lastSelfReport?: string;
  readonly nextCheckAt?: string;
  readonly nextCheckReason?: string;
  readonly now: string;
  readonly slackUserId: string;
  readonly statusText?: string;
  readonly workspaceId: string;
}): ChannelReviewState => {
  const resolvedSelfReport = lastSelfReport ?? existing?.lastSelfReport;
  const resolvedStatusText = statusText ?? existing?.statusText;
  const resolvedStatusUpdatedAt =
    statusText === undefined ? existing?.statusUpdatedAt : now;

  return channelReviewStateSchema.parse({
    channelId,
    createdAt: existing?.createdAt ?? now,
    id: channelReviewStateDocumentId({ channelId, slackUserId }),
    lastCheckedAt: now,
    ...(resolvedSelfReport === undefined
      ? {}
      : { lastSelfReport: resolvedSelfReport }),
    ...(nextCheckAt === undefined ? {} : { nextCheckAt }),
    ...(nextCheckReason === undefined ? {} : { nextCheckReason }),
    slackUserId,
    ...(resolvedStatusText === undefined
      ? {}
      : { statusText: resolvedStatusText }),
    ...(resolvedStatusUpdatedAt === undefined
      ? {}
      : { statusUpdatedAt: resolvedStatusUpdatedAt }),
    updatedAt: now,
    workspaceId,
  });
};
