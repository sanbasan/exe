import { dateTimeSchema } from './common';
import { z } from 'zod';

export const signInCodeSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/u),
    createdAt: dateTimeSchema,
    email: z.email(),
    expiresAt: dateTimeSchema,
    id: z.string().min(1),
    updatedAt: dateTimeSchema,
  })
  .strict();

export type SignInCode = z.infer<typeof signInCodeSchema>;

export const isSignInCodeValid = ({
  now,
  signInCode,
}: {
  readonly now: string;
  readonly signInCode: SignInCode;
}): boolean => Date.parse(now) < Date.parse(signInCode.expiresAt);
