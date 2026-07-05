import {
  dateTimeSchema,
  slackTeamIdSchema,
  slackUserIdSchema,
  userIdSchema,
  workspaceIdSchema,
} from './common';
import { z } from 'zod';

export const linkedSlackUserSchema = z
  .object({
    slackTeamId: slackTeamIdSchema,
    slackUserId: slackUserIdSchema,
    // ISO timestamp of the last live Slack membership confirmation. Optional
    // for backward compatibility with profiles written before live
    // verification existed; treated as "never verified" (stale) when absent.
    verifiedAt: dateTimeSchema.optional(),
    workspaceId: workspaceIdSchema,
  })
  .strict();

export const userProfileSchema = z
  .object({
    createdAt: dateTimeSchema,
    displayName: z.string().min(1).optional(),
    email: z.email(),
    id: userIdSchema,
    // ISO timestamp of the last FULL workspace discovery (a scan of every
    // workspace) at login. Used to bound staleness of the candidate index:
    // once older than the discovery TTL, login re-scans all workspaces instead
    // of trusting the index, catching memberships the index never learned of.
    // Optional for backward compatibility (absent => treated as never).
    lastFullDiscoveryAt: dateTimeSchema.optional(),
    slackUsers: z.array(linkedSlackUserSchema),
    updatedAt: dateTimeSchema,
    workspaceIds: z.array(workspaceIdSchema),
  })
  .strict();

export type LinkedSlackUser = z.infer<typeof linkedSlackUserSchema>;

export type UserProfile = z.infer<typeof userProfileSchema>;
