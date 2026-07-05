import {
  dateTimeSchema,
  slackChannelIdSchema,
  slackMessageTsSchema,
  workspaceIdSchema,
} from './common';
import { z } from 'zod';

// A recording-only meeting captured from the web app: audio is transcribed,
// tasks and dependencies are extracted, and results are posted to Slack and
// GBrain. Distinct from call_sessions (agent voice calls).

export const meetingStatusSchema = z.enum([
  'completed',
  'failed',
  'processing',
]);

export const meetingDependencySchema = z
  .object({
    blockedTaskId: z.string().min(1),
    blockerTaskId: z.string().min(1),
  })
  .strip();

// Circleback-style structured notes composed from the transcript.
export const meetingNotesSchema = z
  .object({
    decisions: z.array(z.string()).default([]),
    keyPoints: z.array(z.string()).default([]),
    overview: z.string().optional(),
  })
  .strip();

export const meetingSchema = z
  .object({
    // Channel the meeting was filed under (requested or auto-assigned).
    channelId: slackChannelIdSchema.optional(),
    createdAt: dateTimeSchema,
    createdByUserId: z.string().min(1),
    createdTaskIds: z.array(z.string().min(1)).default([]),
    dependencies: z.array(meetingDependencySchema).default([]),
    durationSeconds: z.number().int().nonnegative().optional(),
    error: z.string().optional(),
    id: z.string().min(1),
    notes: meetingNotesSchema.optional(),
    // Participants chosen at recording time. Optional and not necessarily
    // exhaustive — used to name speakers and steer assignee inference.
    participantSlackUserIds: z.array(z.string().min(1)).default([]),
    // Channel explicitly chosen at recording time; absent means auto-assign.
    requestedChannelId: slackChannelIdSchema.optional(),
    slackMessageTs: slackMessageTsSchema.optional(),
    slackThreadTs: slackMessageTsSchema.optional(),
    status: meetingStatusSchema,
    summary: z.string().optional(),
    title: z.string().optional(),
    transcript: z.string().optional(),
    updatedAt: dateTimeSchema,
    updatedTaskIds: z.array(z.string().min(1)).default([]),
    workspaceId: workspaceIdSchema,
  })
  .strip();

export type Meeting = z.infer<typeof meetingSchema>;

export type MeetingNotes = z.infer<typeof meetingNotesSchema>;

export type MeetingDependency = z.infer<typeof meetingDependencySchema>;

export type MeetingStatus = z.infer<typeof meetingStatusSchema>;
