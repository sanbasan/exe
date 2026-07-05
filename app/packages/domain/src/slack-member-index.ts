import {
  dateTimeSchema,
  slackTeamIdSchema,
  slackUserIdSchema,
  workspaceIdSchema,
} from './common';
import { z } from 'zod';

// A single (workspace, slack user) membership observation used as a candidate
// cache: "which workspaces is this email a member of?". Slack remains the
// source of truth — entries are confirmed live before access is granted — but
// this index lets login narrow the set of workspaces to verify instead of
// scanning every workspace. Email is stored normalized (trimmed + lowercased)
// to match the login lookup key.
export const slackMemberIndexEntrySchema = z
  .object({
    email: z.email(),
    slackTeamId: slackTeamIdSchema,
    slackUserId: slackUserIdSchema,
    updatedAt: dateTimeSchema,
    workspaceId: workspaceIdSchema,
  })
  .strict();

export type SlackMemberIndexEntry = z.infer<typeof slackMemberIndexEntrySchema>;
