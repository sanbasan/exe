import {
  buildSignedScheduledCallRunValue,
  parseSignedScheduledCallRunValue,
} from '../src/utils/slack-scheduled-call-run-value';
import { slackBlockIds } from '@exe/slack';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const PAYLOAD = {
  callScheduleId: randomUUID(),
  scheduledRunAt: '2026-06-29T09:00:00.000Z',
  workspaceId: 'T01ABC23DE4',
};

test('signed value round-trips with matching key', () => {
  const value = buildSignedScheduledCallRunValue({
    encryptionKey: 'secret',
    payload: PAYLOAD,
  });

  assert.deepEqual(
    parseSignedScheduledCallRunValue({ encryptionKey: 'secret', value }),
    PAYLOAD
  );
});

test('signed value is rejected when the key differs', () => {
  const value = buildSignedScheduledCallRunValue({
    encryptionKey: 'secret',
    payload: PAYLOAD,
  });

  assert.equal(
    parseSignedScheduledCallRunValue({ encryptionKey: 'other', value }),
    null
  );
});

test('signed value fits inside a Slack block_id (<=255 chars)', () => {
  const value = buildSignedScheduledCallRunValue({
    encryptionKey: 'secret',
    payload: PAYLOAD,
  });
  const blockId = `${slackBlockIds.scheduledCallRunReschedule}:${value}`;

  assert.ok(
    blockId.length <= 255,
    `block_id length ${String(blockId.length)} exceeds 255`
  );
});

test('tampered payload is rejected', () => {
  const value = buildSignedScheduledCallRunValue({
    encryptionKey: 'secret',
    payload: PAYLOAD,
  });
  const [, signature] = value.split('.');
  const tampered = `${Buffer.from(
    JSON.stringify({
      r: PAYLOAD.scheduledRunAt,
      s: 'evil',
      w: PAYLOAD.workspaceId,
    })
  ).toString('base64url')}.${signature ?? ''}`;

  assert.equal(
    parseSignedScheduledCallRunValue({
      encryptionKey: 'secret',
      value: tampered,
    }),
    null
  );
});
