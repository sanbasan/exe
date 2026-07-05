import { dateTimeSchema, environmentSchema, userIdSchema } from './common';
import { z } from 'zod';

export const deviceTokenKindSchema = z.enum(['fcm', 'voip']);

export const deviceTokenSchema = z
  .object({
    createdAt: dateTimeSchema,
    environment: environmentSchema,
    id: z.string().min(1),
    kind: deviceTokenKindSchema,
    platform: z.literal('ios'),
    token: z.string().min(1),
    updatedAt: dateTimeSchema,
    userId: userIdSchema,
  })
  .strict();

export type DeviceToken = z.infer<typeof deviceTokenSchema>;

export type DeviceTokenKind = z.infer<typeof deviceTokenKindSchema>;
