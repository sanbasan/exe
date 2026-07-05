import {
  dateTimeSchema,
  slackChannelIdSchema,
  slackMessageTsSchema,
  workspaceIdSchema,
} from './common';
import { z } from 'zod';

export const overdueTaskNotificationSchema = z
  .object({
    createdAt: dateTimeSchema,
    id: z.string().min(1),
    slack: z
      .object({
        channelId: slackChannelIdSchema,
        messageTs: slackMessageTsSchema,
        threadTs: slackMessageTsSchema,
      })
      .strict(),
    taskId: z.string().min(1),
    updatedAt: dateTimeSchema,
    workspaceId: workspaceIdSchema,
  })
  .strict();

export type OverdueTaskNotification = z.infer<
  typeof overdueTaskNotificationSchema
>;
