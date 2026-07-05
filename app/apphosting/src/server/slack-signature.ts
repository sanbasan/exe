import { serverConfig } from '@exe/server';
import type { NextRequest } from 'next/server';
import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_VERSION = 'v0';
const FIVE_MINUTES_SECONDS = 5 * 60;

const isFreshTimestamp = (timestamp: string): boolean => {
  const timestampSeconds = Number.parseInt(timestamp, 10);

  if (Number.isNaN(timestampSeconds)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  return Math.abs(nowSeconds - timestampSeconds) <= FIVE_MINUTES_SECONDS;
};

const safeEqual = ({
  actual,
  expected,
}: {
  readonly actual: string;
  readonly expected: string;
}): boolean => {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

export const readVerifiedSlackBody = async (
  request: NextRequest
): Promise<string> => {
  const signingSecret = serverConfig.slack.signingSecret;

  if (signingSecret === undefined || signingSecret.length === 0) {
    throw new Error('SLACK_SIGNING_SECRET is required.');
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get('x-slack-request-timestamp');
  const signature = request.headers.get('x-slack-signature');

  if (
    timestamp === null ||
    signature === null ||
    !isFreshTimestamp(timestamp)
  ) {
    throw new Error('Slack signature is invalid.');
  }

  const base = `${SIGNATURE_VERSION}:${timestamp}:${rawBody}`;
  const expected = `${SIGNATURE_VERSION}=${createHmac('sha256', signingSecret)
    .update(base)
    .digest('hex')}`;

  if (!safeEqual({ actual: signature, expected })) {
    throw new Error('Slack signature is invalid.');
  }

  return rawBody;
};
