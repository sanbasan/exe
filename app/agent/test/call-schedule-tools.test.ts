import {
  buildAssistantCallScheduleTools,
  buildCallScheduleUpdateInput,
} from '#agent/assistant/tools/call-schedule-tools';
import type { CallSchedule } from '@exe/domain';
import type { CallScheduleService } from '@exe/server';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-30T00:00:00.000Z';
const SLACK_USER_ID = 'U123';
const WORKSPACE_ID = 'T123';

const baseSchedule: CallSchedule = {
  createdAt: NOW,
  enabled: true,
  excludedDates: ['2026-07-01', '2026-07-02'],
  id: 'schedule-1',
  nextRunAt: '2026-07-01T00:00:00.000Z',
  preNotifyMinutes: 10,
  timeOfDay: '09:00',
  timezone: 'Asia/Tokyo',
  updatedAt: NOW,
  userId: 'user-1',
  weekdays: [1, 2, 3, 4, 5],
  workspaceId: WORKSPACE_ID,
};

type TestCallScheduleService = Pick<
  CallScheduleService,
  'getForSlackUser' | 'putForSlackUser'
>;

interface TestComposition {
  readonly services: {
    readonly callSchedule: TestCallScheduleService;
  };
}

const assertCurrentSlackUser = ({
  slackUserId,
  workspaceId,
}: {
  readonly slackUserId: string;
  readonly workspaceId: string;
}): void => {
  assert.equal(slackUserId, SLACK_USER_ID);
  assert.equal(workspaceId, WORKSPACE_ID);
};

const buildComposition = ({
  schedule,
}: {
  readonly schedule: CallSchedule;
}): TestComposition => ({
  services: {
    callSchedule: {
      getForSlackUser: ({
        slackUserId,
        workspaceId,
      }: {
        readonly slackUserId: string;
        readonly workspaceId: string;
      }): Promise<CallSchedule> => {
        assertCurrentSlackUser({ slackUserId, workspaceId });

        return Promise.resolve(schedule);
      },
      putForSlackUser: ({
        slackUserId,
        workspaceId,
      }: {
        readonly input: Parameters<
          TestCallScheduleService['putForSlackUser']
        >[0]['input'];
        readonly slackUserId: string;
        readonly workspaceId: string;
      }): Promise<CallSchedule> => {
        assertCurrentSlackUser({ slackUserId, workspaceId });
        assert.fail('Unexpected schedule update.');
      },
    },
  },
});

void test('agent exposes own regular-call schedule tools', async () => {
  const tools = buildAssistantCallScheduleTools({
    composition: buildComposition({ schedule: baseSchedule }),
    slackUserId: SLACK_USER_ID,
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(Object.hasOwn(tools, 'get_my_call_schedule'), true);
  assert.equal(Object.hasOwn(tools, 'update_my_call_schedule'), true);

  const result = await tools['get_my_call_schedule']?.execute({});

  assert.match(String(result), /Current regular review call schedule:/u);
  assert.match(String(result), /enabled=true/u);
  assert.match(String(result), /timeOfDay=09:00/u);
  assert.match(String(result), /weekdays=1,2,3,4,5/u);
  assert.match(String(result), /excludedDates=2026-07-01,2026-07-02/u);
});

void test('schedule update input can remove skipped dates and change time for the current Slack user', () => {
  const input = buildCallScheduleUpdateInput({
    args: {
      addExcludedDates: ['2026-07-04'],
      removeExcludedDates: ['2026-07-01'],
      timeOfDay: '10:30',
    },
    current: baseSchedule,
  });

  assert.equal(input.timeOfDay, '10:30');
  assert.deepEqual(input.excludedDates, ['2026-07-02', '2026-07-04']);
});
