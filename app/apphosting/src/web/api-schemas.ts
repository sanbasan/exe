import {
  meetingSchema,
  taskSchema,
  type Meeting,
  type Task,
} from '@exe/domain';
import { z } from 'zod';

export const workspaceSummarySchema = z
  .object({
    id: z.string().min(1),
    language: z.string().min(1),
    name: z.string().min(1),
    timezone: z.string().min(1),
  })
  .loose();

export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const channelSummarySchema = z
  .object({
    channelId: z.string().min(1),
    name: z.string().min(1),
  })
  .loose();

export type ChannelSummary = z.infer<typeof channelSummarySchema>;

export interface SlackMember {
  readonly displayName: string;
  readonly slackUserId: string;
}

const slackMemberRawSchema = z
  .object({
    deleted: z.boolean().optional(),
    id: z.string().min(1),
    is_bot: z.boolean().optional(),
    name: z.string().optional(),
    profile: z
      .object({
        display_name: z.string().optional(),
        real_name: z.string().optional(),
      })
      .loose()
      .nullable()
      .optional(),
    real_name: z.string().optional(),
  })
  .loose();

type SlackMemberRaw = z.infer<typeof slackMemberRawSchema>;

const firstNonEmpty = ({
  values,
}: {
  readonly values: readonly (string | undefined)[];
}): string | undefined =>
  values
    .find((value) => value !== undefined && value.trim().length > 0)
    ?.trim();

const normalizeMembers = ({
  members,
}: {
  readonly members: readonly SlackMemberRaw[];
}): readonly SlackMember[] =>
  members
    .filter((member) => member.deleted !== true && member.is_bot !== true)
    .map((member) => ({
      displayName:
        firstNonEmpty({
          values: [
            member.profile?.display_name,
            member.real_name,
            member.profile?.real_name,
            member.name,
          ],
        }) ?? member.id,
      slackUserId: member.id,
    }));

const rawMemberListSchema = z.array(slackMemberRawSchema);

export const workspacesResponseSchema = z.union([
  z.array(workspaceSummarySchema),
  z
    .object({ workspaces: z.array(workspaceSummarySchema) })
    .transform((value) => value.workspaces),
]);

export const channelsResponseSchema = z.union([
  z.array(channelSummarySchema),
  z
    .object({ channels: z.array(channelSummarySchema) })
    .transform((value) => value.channels),
]);

export const membersResponseSchema = z
  .union([
    rawMemberListSchema,
    z
      .object({ members: rawMemberListSchema })
      .transform((value) => value.members),
    z
      .object({ slackMembers: rawMemberListSchema })
      .transform((value) => value.slackMembers),
  ])
  .transform((members) => normalizeMembers({ members }));

export const tasksResponseSchema = z.union([
  z.array(taskSchema),
  z.object({ tasks: z.array(taskSchema) }).transform((value) => value.tasks),
]);

export const taskResponseSchema = z.union([
  z.object({ task: taskSchema }).transform((value) => value.task),
  taskSchema,
]);

export const meetingsResponseSchema = z.union([
  z.array(meetingSchema),
  z
    .object({ meetings: z.array(meetingSchema) })
    .transform((value) => value.meetings),
]);

export const meetingResponseSchema = z.union([
  z.object({ meeting: meetingSchema }).transform((value) => value.meeting),
  meetingSchema,
]);

export type { Meeting, Task };
