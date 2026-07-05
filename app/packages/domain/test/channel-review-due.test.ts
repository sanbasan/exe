import { isChannelReviewDue } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// 2026-06-15 09:00 in Asia/Tokyo.
const NOW = '2026-06-15T00:00:00.000Z';
const TOKYO = 'Asia/Tokyo';

void test('a channel with no planned next check is always due', () => {
  assert.equal(isChannelReviewDue({ now: NOW, timezone: TOKYO }), true);
});

void test('a past next-check date is due', () => {
  assert.equal(
    isChannelReviewDue({
      nextCheckAt: '2026-06-10T00:00:00.000Z',
      now: NOW,
      timezone: TOKYO,
    }),
    true
  );
});

void test('a next check later the same local day is due', () => {
  // 2026-06-15 23:00 JST — same calendar day as NOW (09:00 JST).
  assert.equal(
    isChannelReviewDue({
      nextCheckAt: '2026-06-15T14:00:00.000Z',
      now: NOW,
      timezone: TOKYO,
    }),
    true
  );
});

void test('a future next-check date skips the channel', () => {
  assert.equal(
    isChannelReviewDue({
      nextCheckAt: '2026-06-16T00:00:00.000Z',
      now: NOW,
      timezone: TOKYO,
    }),
    false
  );
  assert.equal(
    isChannelReviewDue({
      nextCheckAt: '2026-06-22T00:00:00.000Z',
      now: NOW,
      timezone: TOKYO,
    }),
    false
  );
});

void test('date-only next-check values are compared as workspace-local calendar days', () => {
  assert.equal(
    isChannelReviewDue({
      nextCheckAt: '2026-06-15',
      now: NOW,
      timezone: TOKYO,
    }),
    true
  );
  assert.equal(
    isChannelReviewDue({
      nextCheckAt: '2026-06-14',
      now: NOW,
      timezone: TOKYO,
    }),
    true
  );
  assert.equal(
    isChannelReviewDue({
      nextCheckAt: '2026-06-16',
      now: NOW,
      timezone: TOKYO,
    }),
    false
  );
});

void test('date-only values are not shifted by negative UTC offsets', () => {
  // 2026-06-15 17:00 in Los Angeles. A date-only "2026-06-16" must count as
  // tomorrow there (skip), not be UTC-parsed back onto the same local day.
  assert.equal(
    isChannelReviewDue({
      nextCheckAt: '2026-06-16',
      now: '2026-06-16T00:00:00.000Z',
      timezone: 'America/Los_Angeles',
    }),
    false
  );
});

void test('day boundaries use the workspace timezone, not UTC', () => {
  // NOW is 2026-06-15 16:00 UTC = 2026-06-16 01:00 JST, so a next check on
  // 2026-06-16 is already today in Tokyo.
  assert.equal(
    isChannelReviewDue({
      nextCheckAt: '2026-06-16',
      now: '2026-06-15T16:00:00.000Z',
      timezone: TOKYO,
    }),
    true
  );
});

void test('an unreadable next-check date fails open to due', () => {
  assert.equal(
    isChannelReviewDue({
      nextCheckAt: 'next friday',
      now: NOW,
      timezone: TOKYO,
    }),
    true
  );
});
