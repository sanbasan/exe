import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const FALLBACK_SIGNING_SECRET = 'exe-local-scheduled-call-run-value';

// Compact wire shape: single-character keys keep the encoded reference short
// enough to fit inside a Slack `block_id` (max 255 chars).
const compactScheduledCallRunValueSchema = z
  .object({
    r: z.string().min(1),
    s: z.string().min(1),
    w: z.string().min(1),
  })
  .strict()
  .transform((compact) => ({
    callScheduleId: compact.s,
    scheduledRunAt: compact.r,
    workspaceId: compact.w,
  }));

export type SignedScheduledCallRunValuePayload = z.infer<
  typeof compactScheduledCallRunValueSchema
>;

const getSigningSecret = (encryptionKey?: string): string =>
  encryptionKey === undefined || encryptionKey.length === 0
    ? FALLBACK_SIGNING_SECRET
    : encryptionKey;

const sign = ({
  encryptionKey,
  payload,
}: {
  readonly encryptionKey?: string;
  readonly payload: string;
}): string =>
  createHmac('sha256', getSigningSecret(encryptionKey))
    .update(payload)
    .digest('base64url');

export const buildSignedScheduledCallRunValue = ({
  encryptionKey,
  payload,
}: {
  readonly encryptionKey?: string;
  readonly payload: SignedScheduledCallRunValuePayload;
}): string => {
  // Compact, single-character keys keep the encoded reference short enough to
  // fit inside a Slack `block_id` (max 255 chars), which is how the reschedule
  // dropdown carries the reference.
  const encodedPayload = Buffer.from(
    JSON.stringify({
      r: payload.scheduledRunAt,
      s: payload.callScheduleId,
      w: payload.workspaceId,
    })
  ).toString('base64url');

  return `${encodedPayload}.${sign({
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    payload: encodedPayload,
  })}`;
};

export const parseSignedScheduledCallRunValue = ({
  encryptionKey,
  value,
}: {
  readonly encryptionKey?: string;
  readonly value: string;
}): SignedScheduledCallRunValuePayload | null => {
  const [encodedPayload, signature, extra] = value.split('.');

  if (
    encodedPayload === undefined ||
    signature === undefined ||
    extra !== undefined
  ) {
    return null;
  }

  const expectedSignature = sign({
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    payload: encodedPayload,
  });
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  const result = compactScheduledCallRunValueSchema.safeParse(
    JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  );

  return result.success ? result.data : null;
};
