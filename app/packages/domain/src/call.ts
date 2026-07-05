/* eslint-disable max-lines -- Call schemas and agenda construction are kept together for domain contract reviewability. */
import { channelSchema, latestInfoDraftSchema, type Channel } from './channel';
import {
  buildChannelReviewItems,
  channelBlockDraftSchema,
  channelReviewAgendaItemSchema,
  channelReviewDraftSchema,
  type ChannelBlock,
  type ChannelReviewState,
} from './channel-review';
import {
  dateOnlySchema,
  dateTimeSchema,
  languageSchema,
  slackChannelIdSchema,
  slackUserIdSchema,
  userIdSchema,
  workspaceIdSchema,
} from './common';
import {
  followUpTaskDraftSchema,
  followUpTaskSchema,
  getOpenFollowUpTasksForAssignee,
  getOpenWorkTasksForAssignee,
  getOpenWorkTasksForRequester,
  isOpenTaskStatus,
  isWorkTask,
  taskPatchSchema,
  type Task,
  workTaskDraftSchema,
  workTaskSchema,
  type WorkTask,
} from './task';
import { z } from 'zod';

export const callPurposeSchema = z.enum([
  'follow_up_task',
  'manual_review',
  'scheduled_review',
]);

// Why an automatic outbound call was placed. 'blocker': a task started
// blocking 2+ open tasks. 'overload': the morning load check found the
// assignee holding too many open tasks. Optional so iOS decoding is
// unaffected (unknown keys are ignored, new enum values on existing fields
// would not be).
export const callTriggerSchema = z.enum(['blocker', 'overload']);

export const callStatusSchema = z.enum([
  'active',
  'created',
  'ended',
  'failed',
  'missed',
  'ringing',
  'skipped',
]);

export const callEventTypeSchema = z.enum([
  'agent_message',
  'channel_block_draft_discarded',
  'channel_block_draft_proposed',
  'channel_review_draft_discarded',
  'channel_review_draft_proposed',
  'follow_up_task_draft_discarded',
  'follow_up_task_draft_proposed',
  'follow_up_task_draft_approved',
  'latest_info_draft_discarded',
  'latest_info_draft_proposed',
  'summary',
  'task_patch_approved',
  'task_patch_applied',
  'task_patch_discarded',
  'task_patch_proposed',
  'transcript',
  'work_task_draft_discarded',
  'work_task_draft_proposed',
  'work_task_draft_approved',
]);

export const callScheduleSchema = z
  .object({
    createdAt: dateTimeSchema,
    enabled: z.boolean(),
    excludedDates: z.array(dateOnlySchema),
    id: z.string().min(1),
    nextRunAt: dateTimeSchema.optional(),
    preNotifyMinutes: z.number().int().min(0),
    timeOfDay: z.string().regex(/^\d{2}:\d{2}$/u),
    timezone: z.string().min(1),
    updatedAt: dateTimeSchema,
    userId: userIdSchema,
    weekdays: z.array(z.number().int().min(0).max(6)),
    workspaceId: workspaceIdSchema,
  })
  .strict();

export const callSessionSchema = z
  .object({
    callScheduleId: z.string().min(1).optional(),
    createdAt: dateTimeSchema,
    endedAt: dateTimeSchema.optional(),
    focusTaskId: z.string().min(1).optional(),
    id: z.string().min(1),
    liveKitRoomName: z.string().min(1),
    purpose: callPurposeSchema,
    scheduledRunAt: dateTimeSchema.optional(),
    startedAt: dateTimeSchema.optional(),
    status: callStatusSchema,
    summary: z.string().min(1).optional(),
    trigger: callTriggerSchema.optional(),
    updatedAt: dateTimeSchema,
    userId: userIdSchema,
    workspaceId: workspaceIdSchema,
  })
  .strict();

export const callEventPayloadSchema = z.union([
  z.object({ channelBlockDrafts: z.array(channelBlockDraftSchema) }).strict(),
  z.object({ channelReviewDrafts: z.array(channelReviewDraftSchema) }).strict(),
  z.object({ draftIds: z.array(z.string().min(1)) }).strict(),
  z.object({ drafts: z.array(followUpTaskDraftSchema) }).strict(),
  z.object({ latestInfoDrafts: z.array(latestInfoDraftSchema) }).strict(),
  z.object({ patches: z.array(taskPatchSchema) }).strict(),
  z.object({ summary: z.string().min(1) }).strict(),
  z.object({ text: z.string().min(1) }).strict(),
  z.object({ workTaskDrafts: z.array(workTaskDraftSchema) }).strict(),
]);

export const channelOpenWorkTasksSchema = z
  .object({
    channel: channelSchema,
    openWorkTasks: z.array(workTaskSchema),
  })
  .strict();

export const callEventSchema = z
  .object({
    callSessionId: z.string().min(1),
    createdAt: dateTimeSchema,
    id: z.string().min(1),
    payload: callEventPayloadSchema,
    type: callEventTypeSchema,
    workspaceId: workspaceIdSchema,
  })
  .strict();

export const callAgendaSchema = z
  .object({
    channelOpenWorkTasks: z.array(channelOpenWorkTasksSchema),
    channelReviews: z.array(channelReviewAgendaItemSchema),
    channels: z.array(channelSchema),
    focusTaskId: z.string().min(1).optional(),
    followUpTasks: z.array(followUpTaskSchema),
    language: languageSchema,
    now: dateTimeSchema,
    purpose: callPurposeSchema,
    requestedWorkTasks: z.array(workTaskSchema),
    slackUserId: slackUserIdSchema,
    // Display name of the person on this call. Used so synthesized channel
    // latest-info can attribute statements to who said them (and when).
    // Optional because a linked profile may not have a display name yet.
    speakerName: z.string().min(1).optional(),
    timezone: z.string().min(1),
    // Server-composed briefing for automatically triggered calls (blocker /
    // overload): tells the voice agent why the call was placed and what to
    // walk through. Rendered verbatim into the agent's prompt.
    triageNote: z.string().min(1).optional(),
    workTasks: z.array(workTaskSchema),
  })
  .strict();

// ─── GBrain integration — purgeable (app/agent/src/gbrain/PURGE.md): in-call
// workspace-memory search activity, streamed to the app's GBrain call tab. A
// search publishes `gbrain_search_started` when the query is issued and
// `gbrain_search_completed` (same id) when results are in. Searches of one
// agent run share a `lookupId`, and the searching agent may publish a
// human-readable `gbrain_lookup_findings` digest (plain-text bullets — the
// app renders them verbatim) for that lookup once it has read the results. ───
export const gbrainCallSearchStartedSchema = z
  .object({
    channelId: slackChannelIdSchema.optional(),
    id: z.string().min(1),
    lookupId: z.string().min(1).optional(),
    query: z.string().min(1),
  })
  .strict();

export const gbrainCallSearchResultSchema = z
  .object({
    slug: z.string().min(1),
    snippet: z.string().min(1).optional(),
  })
  .strict();

export const gbrainCallSearchCompletedSchema = z
  .object({
    channelId: slackChannelIdSchema.optional(),
    id: z.string().min(1),
    lookupId: z.string().min(1).optional(),
    query: z.string().min(1),
    results: z.array(gbrainCallSearchResultSchema),
    status: z.enum(['error', 'ok']),
  })
  .strict();

export const gbrainCallLookupFindingsSchema = z
  .object({
    bullets: z.array(z.string().min(1)).min(1).max(6),
    channelId: slackChannelIdSchema.optional(),
    lookupId: z.string().min(1),
  })
  .strict();

export const callDataChannelMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      agenda: callAgendaSchema,
      callSessionId: z.string().min(1),
      type: z.literal('agenda'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      search: gbrainCallSearchStartedSchema,
      type: z.literal('gbrain_search_started'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      search: gbrainCallSearchCompletedSchema,
      type: z.literal('gbrain_search_completed'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      findings: gbrainCallLookupFindingsSchema,
      type: z.literal('gbrain_lookup_findings'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      drafts: z.array(followUpTaskDraftSchema),
      type: z.literal('follow_up_task_draft_proposed'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      type: z.literal('work_task_draft_proposed'),
      workspaceId: workspaceIdSchema,
      workTaskDrafts: z.array(workTaskDraftSchema),
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      latestInfoDrafts: z.array(latestInfoDraftSchema),
      type: z.literal('latest_info_draft_proposed'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      channelBlockDrafts: z.array(channelBlockDraftSchema),
      type: z.literal('channel_block_draft_proposed'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      channelReviewDrafts: z.array(channelReviewDraftSchema),
      type: z.literal('channel_review_draft_proposed'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      patches: z.array(taskPatchSchema),
      type: z.literal('task_patch_proposed'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      summary: z.string().min(1),
      type: z.literal('summary'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      draftIds: z.array(z.string().min(1)),
      type: z.literal('follow_up_task_draft_discarded'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      draftIds: z.array(z.string().min(1)),
      type: z.literal('latest_info_draft_discarded'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      draftIds: z.array(z.string().min(1)),
      type: z.literal('channel_block_draft_discarded'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      draftIds: z.array(z.string().min(1)),
      type: z.literal('channel_review_draft_discarded'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      draftIds: z.array(z.string().min(1)),
      type: z.literal('task_patch_discarded'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      callSessionId: z.string().min(1),
      draftIds: z.array(z.string().min(1)),
      type: z.literal('work_task_draft_discarded'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
]);

export type CallAgenda = z.infer<typeof callAgendaSchema>;

export type CallDataChannelMessage = z.infer<
  typeof callDataChannelMessageSchema
>;

export type CallEvent = z.infer<typeof callEventSchema>;

export type CallEventPayload = CallEvent['payload'];

export type CallEventType = z.infer<typeof callEventTypeSchema>;

export type CallPurpose = z.infer<typeof callPurposeSchema>;

export type CallSchedule = z.infer<typeof callScheduleSchema>;

export type CallSession = z.infer<typeof callSessionSchema>;

export type CallStatus = z.infer<typeof callStatusSchema>;

export type CallTrigger = z.infer<typeof callTriggerSchema>;

export type ChannelOpenWorkTasks = z.infer<typeof channelOpenWorkTasksSchema>;

export type GBrainCallLookupFindings = z.infer<
  typeof gbrainCallLookupFindingsSchema
>;

export type GBrainCallSearchCompleted = z.infer<
  typeof gbrainCallSearchCompletedSchema
>;

export type GBrainCallSearchResult = z.infer<
  typeof gbrainCallSearchResultSchema
>;

export type GBrainCallSearchStarted = z.infer<
  typeof gbrainCallSearchStartedSchema
>;

const canTransitionFromActive = (to: CallStatus): boolean =>
  to === 'ended' || to === 'failed';

const canTransitionFromCreated = (to: CallStatus): boolean =>
  to === 'active' ||
  to === 'ended' ||
  to === 'failed' ||
  to === 'missed' ||
  to === 'ringing' ||
  to === 'skipped';

const canTransitionFromRinging = (to: CallStatus): boolean =>
  to === 'active' || to === 'ended' || to === 'failed' || to === 'missed';

export const canTransitionCallStatus = ({
  from,
  to,
}: {
  readonly from: CallStatus;
  readonly to: CallStatus;
}): boolean => {
  if (from === to) {
    return true;
  }

  switch (from) {
    case 'active':
      return canTransitionFromActive(to);
    case 'created':
      return canTransitionFromCreated(to);
    case 'ended':
    case 'failed':
    case 'missed':
    case 'skipped':
      return false;
    case 'ringing':
      return canTransitionFromRinging(to);
  }
};

const buildChannelOpenWorkTasks = ({
  activeChannels,
  openChannelWorkTasks,
}: {
  readonly activeChannels: readonly Channel[];
  readonly openChannelWorkTasks: readonly WorkTask[];
}): readonly ChannelOpenWorkTasks[] =>
  activeChannels.map((channel) =>
    channelOpenWorkTasksSchema.parse({
      channel,
      openWorkTasks: openChannelWorkTasks
        .filter((task) => task.channelId === channel.channelId)
        .toSorted((left, right) =>
          left.createdAt.localeCompare(right.createdAt)
        ),
    })
  );

export const buildCallAgenda = ({
  blocks,
  channels,
  focusTaskId,
  language,
  now,
  purpose,
  reviewStates,
  slackUserId,
  speakerName,
  tasks,
  timezone,
  triageNote,
}: {
  readonly blocks?: readonly ChannelBlock[];
  readonly channels: readonly Channel[];
  readonly focusTaskId?: string;
  readonly language: z.infer<typeof languageSchema>;
  readonly now: string;
  readonly purpose: CallPurpose;
  readonly reviewStates?: readonly ChannelReviewState[];
  readonly slackUserId: string;
  readonly speakerName?: string;
  readonly tasks: readonly Task[];
  readonly timezone: string;
  readonly triageNote?: string;
}): CallAgenda => {
  const activeChannels = channels.filter(
    (channel) => channel.status === 'active'
  );
  const openChannelWorkTasks = tasks
    .filter(isWorkTask)
    .filter(
      (task) => task.channelId !== undefined && isOpenTaskStatus(task.status)
    );
  const openWorkTasks = getOpenWorkTasksForAssignee({ slackUserId, tasks });
  const openWorkTaskIds = new Set(openWorkTasks.map((task) => task.id));
  const requestedWorkTasks = getOpenWorkTasksForRequester({
    slackUserId,
    tasks,
  }).filter((task) => !openWorkTaskIds.has(task.id));

  return callAgendaSchema.parse({
    channelOpenWorkTasks: buildChannelOpenWorkTasks({
      activeChannels,
      openChannelWorkTasks,
    }),
    channelReviews: buildChannelReviewItems({
      activeChannels,
      ...(blocks === undefined ? {} : { blocks }),
      openWorkTasks,
      requestedWorkTasks,
      ...(reviewStates === undefined ? {} : { reviewStates }),
      slackUserId,
      tasks,
    }),
    channels: activeChannels,
    followUpTasks: getOpenFollowUpTasksForAssignee({ slackUserId, tasks }),
    ...(focusTaskId === undefined ? {} : { focusTaskId }),
    language,
    now,
    purpose,
    requestedWorkTasks,
    slackUserId,
    ...(speakerName === undefined ? {} : { speakerName }),
    timezone,
    ...(triageNote === undefined ? {} : { triageNote }),
    workTasks: openWorkTasks,
  });
};
