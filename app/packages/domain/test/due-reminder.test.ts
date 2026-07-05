import { classifyDueAt, isDueReminderCategory } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// 2026-06-15 is a Monday. 09:00 in Asia/Tokyo (UTC+9) is 00:00Z.
const TOKYO = 'Asia/Tokyo';
const NOW = '2026-06-15T00:00:00.000Z';

void test('returns null when there is no due date', () => {
  assert.equal(classifyDueAt({ now: NOW, timezone: TOKYO }), null);
  assert.equal(classifyDueAt({ dueAt: '', now: NOW, timezone: TOKYO }), null);
});

void test('classifies a same-local-day deadline as today', () => {
  // 2026-06-15T13:00:00Z is 22:00 on 2026-06-15 in Tokyo -> same day.
  assert.equal(
    classifyDueAt({
      dueAt: '2026-06-15T13:00:00.000Z',
      now: NOW,
      timezone: TOKYO,
    }),
    'today'
  );
});

void test('classifies the next local day as tomorrow', () => {
  // 2026-06-16T03:00:00Z is 12:00 on 2026-06-16 in Tokyo -> next day.
  assert.equal(
    classifyDueAt({
      dueAt: '2026-06-16T03:00:00.000Z',
      now: NOW,
      timezone: TOKYO,
    }),
    'tomorrow'
  );
});

void test('classifies a past local day as overdue', () => {
  assert.equal(
    classifyDueAt({
      dueAt: '2026-06-14T03:00:00.000Z',
      now: NOW,
      timezone: TOKYO,
    }),
    'overdue'
  );
});

void test('classifies deadlines further out as later', () => {
  assert.equal(
    classifyDueAt({
      dueAt: '2026-06-20T03:00:00.000Z',
      now: NOW,
      timezone: TOKYO,
    }),
    'later'
  );
});

void test('uses the workspace timezone, not UTC, for day boundaries', () => {
  // now = 2026-06-15T16:00:00Z which is already 2026-06-16 01:00 in Tokyo.
  const lateNow = '2026-06-15T16:00:00.000Z';
  // dueAt = 2026-06-15T20:00:00Z which is 2026-06-16 05:00 in Tokyo -> today.
  assert.equal(
    classifyDueAt({
      dueAt: '2026-06-15T20:00:00.000Z',
      now: lateNow,
      timezone: TOKYO,
    }),
    'today'
  );
});

void test('falls back to UTC when timezone is empty', () => {
  assert.equal(
    classifyDueAt({
      dueAt: '2026-06-15T23:00:00.000Z',
      now: NOW,
      timezone: '',
    }),
    'today'
  );
});

void test('isDueReminderCategory flags actionable categories only', () => {
  assert.equal(isDueReminderCategory('today'), true);
  assert.equal(isDueReminderCategory('tomorrow'), true);
  assert.equal(isDueReminderCategory('overdue'), true);
  assert.equal(isDueReminderCategory('later'), false);
  assert.equal(isDueReminderCategory(null), false);
});
