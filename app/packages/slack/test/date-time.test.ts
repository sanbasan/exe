import { formatSlackDateTime } from '../src';
import { localDateTimeToIso } from '../src';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('English date/time uses `MMM d (EEE) h:mm a` with no zero padding', () => {
  const formatted = formatSlackDateTime({
    isoDateTime: '2026-06-28T05:59:00.000Z',
    language: 'en',
    timezone: 'Asia/Tokyo',
  });

  // 05:59 UTC is 14:59 JST on Sun Jun 28.
  assert.equal(formatted, 'Jun 28 (Sun) 2:59 PM');
});

test('English midnight and single-digit day are not zero padded', () => {
  const formatted = formatSlackDateTime({
    isoDateTime: '2026-06-01T00:05:00.000Z',
    language: 'en',
    timezone: 'UTC',
  });

  assert.equal(formatted, 'Jun 1 (Mon) 12:05 AM');
});

test('Japanese date/time keeps the existing `M/d (EEE) H:mm` format', () => {
  const formatted = formatSlackDateTime({
    isoDateTime: '2026-06-27T03:00:00.000Z',
    language: 'ja',
    timezone: 'Asia/Tokyo',
  });

  assert.match(formatted, /^06\/27 \(.+\) 12:00$/u);
});

test('localDateTimeToIso converts a positive-offset wall time to UTC', () => {
  assert.equal(
    localDateTimeToIso({
      date: '2026-06-29',
      time: '18:00',
      timezone: 'Asia/Tokyo',
    }),
    '2026-06-29T09:00:00.000Z'
  );
});

test('localDateTimeToIso converts a negative-offset wall time to UTC', () => {
  assert.equal(
    localDateTimeToIso({
      date: '2026-06-29',
      time: '12:00',
      timezone: 'America/New_York',
    }),
    '2026-06-29T16:00:00.000Z'
  );
});

test('localDateTimeToIso treats UTC input as identity', () => {
  assert.equal(
    localDateTimeToIso({ date: '2026-06-29', time: '18:00', timezone: 'UTC' }),
    '2026-06-29T18:00:00.000Z'
  );
});
