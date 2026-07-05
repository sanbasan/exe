import type { CallScheduleRepository, Clock } from '../src/ports';
import { findManualScheduledRun } from '../src/services/call-session-scheduled-runs';
import { callScheduleSchema, type CallSchedule } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-29T01:00:00.000Z';
const WORKSPACE_ID = 'T_WORKSPACE';
const USER_ID = 'user-1';

const clock: Clock = { now: () => NOW };

const buildSchedule = (nextRunAt: string): CallSchedule =>
  callScheduleSchema.parse({
    createdAt: NOW,
    enabled: true,
    excludedDates: [],
    id: 'schedule-1',
    nextRunAt,
    preNotifyMinutes: 10,
    timeOfDay: '11:00',
    timezone: 'Asia/Tokyo',
    updatedAt: NOW,
    userId: USER_ID,
    weekdays: [1],
    workspaceId: WORKSPACE_ID,
  });

const buildRepository = (schedule: CallSchedule): CallScheduleRepository => ({
  getById: async (): Promise<CallSchedule | null> => schedule,
  getByUser: async (): Promise<CallSchedule | null> => schedule,
  listEnabled: async (): Promise<readonly CallSchedule[]> => [schedule],
  upsert: async (): Promise<void> => {},
});

void test('auto manual start consumes a rescheduled run within the next hour', async () => {
  const schedule = buildSchedule('2026-06-29T01:30:00.000Z');

  const result = await findManualScheduledRun({
    callScheduleRepository: buildRepository(schedule),
    clock,
    mode: 'auto',
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(result?.id, schedule.id);
});

void test('auto manual start does not consume distant scheduled runs', async () => {
  const schedule = buildSchedule('2026-06-29T02:01:00.000Z');

  const result = await findManualScheduledRun({
    callScheduleRepository: buildRepository(schedule),
    clock,
    mode: 'auto',
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(result, null);
});

void test('explicit manual review does not consume a scheduled run', async () => {
  const schedule = buildSchedule('2026-06-29T01:30:00.000Z');

  const result = await findManualScheduledRun({
    callScheduleRepository: buildRepository(schedule),
    clock,
    mode: 'manual_review',
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(result, null);
});
