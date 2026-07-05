import {
  toSlackMembership,
  toSlackUserLookup,
} from '../src/infrastructure/slack/user-lookup';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('membership check allows multi-channel guests', () => {
  assert.deepEqual(
    toSlackMembership({
      user: {
        id: 'UMULTI',
        is_restricted: true,
        profile: { email: 'multi@example.com' },
      },
    }),
    { slackUserId: 'UMULTI', status: 'member' }
  );
});

test('membership check allows single-channel guests', () => {
  assert.deepEqual(
    toSlackMembership({
      user: {
        id: 'USINGLE',
        is_ultra_restricted: true,
        profile: { email: 'single@example.com' },
      },
    }),
    { slackUserId: 'USINGLE', status: 'member' }
  );
});

test('user lookup still distinguishes guests for privileged account changes', () => {
  assert.deepEqual(
    toSlackUserLookup({
      user: {
        id: 'UMULTI',
        is_restricted: true,
        profile: { email: 'multi@example.com' },
      },
    }),
    { status: 'is_restricted' }
  );
  assert.deepEqual(
    toSlackUserLookup({
      user: {
        id: 'USINGLE',
        is_ultra_restricted: true,
        profile: { email: 'single@example.com' },
      },
    }),
    { status: 'is_ultra_restricted' }
  );
});
