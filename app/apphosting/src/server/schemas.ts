import {
  deviceTokenKindSchema,
  environmentSchema,
  followUpTaskDraftSchema,
  languageSchema,
  channelStatusSchema,
  taskPatchSchema,
  workTaskDraftSchema,
} from '@exe/domain';
import { z } from 'zod';

export const putCallScheduleInputSchema = z
  .object({
    enabled: z.boolean(),
    excludedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)),
    preNotifyMinutes: z.number().int().min(0),
    timeOfDay: z.string().regex(/^\d{2}:\d{2}$/u),
    timezone: z.string().min(1),
    weekdays: z.array(z.number().int().min(0).max(6)),
  })
  .strict();

export const deviceTokenRegistrationSchema = z
  .object({
    environment: environmentSchema,
    kind: deviceTokenKindSchema,
    token: z.string().min(1),
  })
  .strict();

export const liveKitTokenRequestSchema = z
  .object({
    callSessionId: z.string().min(1),
    workspaceId: z.string().min(1),
  })
  .strict();

export const createMeetingRequestSchema = z
  .object({
    audioBase64: z.string().min(1),
    channelId: z.string().min(1).optional(),
    durationSeconds: z.number().optional(),
    mimeType: z.string().min(1),
    participantSlackUserIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const createWorkTaskRequestSchema = z
  .object({
    assigneeSlackUserIds: z.array(z.string().min(1)).default([]),
    channelId: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    dueAt: z.string().min(1).optional(),
    requesterSlackUserIds: z.array(z.string().min(1)).optional(),
    startAt: z.string().min(1).optional(),
    title: z.string().min(1),
  })
  .strict();

export const addTaskDependencyRequestSchema = z
  .object({
    blockerTaskId: z.string().min(1),
  })
  .strict();

export const patchChannelRequestSchema = z
  .object({
    assigneeSlackUserIds: z.array(z.string().min(1)).optional(),
    latestInfo: z.string().min(1).optional(),
    status: channelStatusSchema.optional(),
    watcherSlackUserIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const createChannelBlockRequestSchema = z
  .object({
    description: z.string().min(1).optional(),
    title: z.string().min(1),
  })
  .strict();

export const updateChannelBlockRequestSchema = z
  .object({
    description: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
  })
  .strict();

export const recordChannelReviewRequestSchema = z
  .object({
    lastSelfReport: z.string().min(1).optional(),
    nextCheckAt: z.string().min(1).optional(),
    nextCheckReason: z.string().min(1).optional(),
    statusText: z.string().min(1).optional(),
  })
  .strict();

export const watchedChannelsRequestSchema = z
  .object({
    channelIds: z.array(z.string().min(1)),
  })
  .strict();

export const workspaceAccountsRequestSchema = z
  .object({
    adminSlackUserIds: z.array(z.string().min(1)),
    channelOwnerEditorSlackUserIds: z.array(z.string().min(1)),
  })
  .strict();

export const workspaceAdminRequestSchema = z
  .object({
    email: z.email(),
  })
  .strict();

export const callEventRequestSchema = z.discriminatedUnion('type', [
  z
    .object({
      payload: z.object({ drafts: z.array(followUpTaskDraftSchema) }).strict(),
      type: z.literal('follow_up_task_draft_approved'),
    })
    .strict(),
  z
    .object({
      payload: z.object({ patches: z.array(taskPatchSchema) }).strict(),
      type: z.literal('task_patch_approved'),
    })
    .strict(),
  z
    .object({
      payload: z
        .object({ workTaskDrafts: z.array(workTaskDraftSchema) })
        .strict(),
      type: z.literal('work_task_draft_approved'),
    })
    .strict(),
]);

export const startManualReviewCallRequestSchema = z
  .object({
    mode: z.enum(['auto', 'manual_review', 'scheduled_review']).optional(),
  })
  .strict();

export const callSessionTransitionRequestSchema = z
  .object({
    status: z.enum(['ended', 'failed']),
  })
  .strict();

export const sendCodeRequestSchema = z
  .object({
    email: z.email(),
    language: languageSchema.optional(),
  })
  .strict();

export const verifyCodeRequestSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/u),
    email: z.email(),
  })
  .strict();

export { taskPatchSchema };
