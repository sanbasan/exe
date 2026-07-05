import { z } from 'zod';

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected YYYY-MM-DD');

export const dateTimeSchema = z.string().min(1);

export const environmentSchema = z.enum(['dev', 'prod']);

export const languageSchema = z.enum(['en', 'ja']);

export const nonEmptyStringSchema = z.string().min(1);

export const slackChannelIdSchema = nonEmptyStringSchema;

export const slackMessageTsSchema = nonEmptyStringSchema;

export const slackTeamIdSchema = nonEmptyStringSchema;

export const slackUserIdSchema = nonEmptyStringSchema;

export const userIdSchema = nonEmptyStringSchema;

export const workspaceIdSchema = nonEmptyStringSchema;

export type DateOnly = z.infer<typeof dateOnlySchema>;

export type DateTime = z.infer<typeof dateTimeSchema>;

export type Environment = z.infer<typeof environmentSchema>;

export type Language = z.infer<typeof languageSchema>;

export type SlackChannelId = z.infer<typeof slackChannelIdSchema>;

export type SlackMessageTs = z.infer<typeof slackMessageTsSchema>;

export type SlackTeamId = z.infer<typeof slackTeamIdSchema>;

export type SlackUserId = z.infer<typeof slackUserIdSchema>;

export type UserId = z.infer<typeof userIdSchema>;

export type WorkspaceId = z.infer<typeof workspaceIdSchema>;
