import { workspaceIdSchema } from './common';
import { z } from 'zod';

export const universalLinkIntentSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('manual_review'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      channelId: z.string().min(1),
      kind: z.literal('open_channel'),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('open_task'),
      taskId: z.string().min(1),
      workspaceId: workspaceIdSchema,
    })
    .strict(),
]);

export type UniversalLinkIntent = z.infer<typeof universalLinkIntentSchema>;
