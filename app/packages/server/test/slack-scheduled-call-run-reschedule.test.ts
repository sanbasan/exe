import type {
  CallNotificationRecord,
  CallNotificationRepository,
  CallScheduleRepository,
  CallSessionRepository,
  Clock,
  SlackGateway,
  UserProfileRepository,
  WorkspaceRepository,
} from '../src/ports';
import { buildScheduledCallSessionId } from '../src/services/call-session-scheduled-runs';
import type { CallSessionService } from '../src/services/call-session-service';
import { handleSkipScheduledCallRunAction } from '../src/services/slack-scheduled-call-run-actions';
import {
  handleRescheduleScheduledCallRunAction,
  saveScheduledCallRunRescheduleModal,
} from '../src/services/slack-scheduled-call-run-reschedule';
import { buildSignedScheduledCallRunValue } from '../src/utils/slack-scheduled-call-run-value';
import {
  callScheduleSchema,
  callSessionSchema,
  userProfileSchema,
  workspaceSchema,
  type CallSchedule,
  type CallSession,
} from '@exe/domain';
import {
  buildScheduledCallRunActionsBlockId,
  scheduledCallRunReschedulePresets,
  slackActionIds,
  slackViewIds,
} from '@exe/slack';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-29T01:00:00.000Z';
const WORKSPACE_ID = 'T_WORKSPACE';
const SLACK_USER = 'U_USER';
const RUN_AT = '2026-06-29T02:00:00.000Z';

const clock: Clock = { now: () => NOW };

const workspace = workspaceSchema.parse({
  admin: { emails: ['owner@example.com'], slackUserIds: ['U_OWNER'] },
  botUserId: 'U_BOT',
  createdAt: NOW,
  encryptedBotToken: 'bot-token',
  id: WORKSPACE_ID,
  language: 'ja',
  name: 'Workspace',
  slackTeamId: WORKSPACE_ID,
  timezone: 'Asia/Tokyo',
  updatedAt: NOW,
});

const schedule: CallSchedule = callScheduleSchema.parse({
  createdAt: NOW,
  enabled: true,
  excludedDates: [],
  id: 'schedule-1',
  nextRunAt: RUN_AT,
  preNotifyMinutes: 10,
  timeOfDay: '11:00',
  timezone: 'Asia/Tokyo',
  updatedAt: NOW,
  userId: 'user-1',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  workspaceId: WORKSPACE_ID,
});

const userProfile = userProfileSchema.parse({
  createdAt: NOW,
  email: 'user@example.com',
  id: 'user-1',
  slackUsers: [
    {
      slackTeamId: WORKSPACE_ID,
      slackUserId: SLACK_USER,
      verifiedAt: NOW,
      workspaceId: WORKSPACE_ID,
    },
  ],
  updatedAt: NOW,
  workspaceIds: [WORKSPACE_ID],
});

const buildSession = (status: CallSession['status']): CallSession =>
  callSessionSchema.parse({
    callScheduleId: schedule.id,
    createdAt: NOW,
    id: buildScheduledCallSessionId({ schedule, scheduledRunAt: RUN_AT }),
    liveKitRoomName: 'room-1',
    purpose: 'scheduled_review',
    scheduledRunAt: RUN_AT,
    status,
    updatedAt: NOW,
    userId: 'user-1',
    workspaceId: WORKSPACE_ID,
  });

interface Harness {
  readonly deps: {
    readonly callNotificationRepository: CallNotificationRepository;
    readonly callScheduleRepository: CallScheduleRepository;
    readonly callSessionRepository: CallSessionRepository;
    readonly callSessionService: CallSessionService;
    readonly clock: Clock;
    readonly slackGateway: SlackGateway;
    readonly userProfileRepository: UserProfileRepository;
    readonly workspaceRepository: WorkspaceRepository;
  };
  readonly state: {
    schedule: CallSchedule;
    session: CallSession;
    transitions: CallSession['status'][];
    updatedMessages: { channelId: string; messageTs: string; text: string }[];
    openedViews: number;
  };
}

const createHarness = (initialStatus: CallSession['status']): Harness => {
  const state: Harness['state'] = {
    openedViews: 0,
    schedule,
    session: buildSession(initialStatus),
    transitions: [],
    updatedMessages: [],
  };

  const callScheduleRepository = {
    getById: async (): Promise<CallSchedule | null> => state.schedule,
    getByUser: async (): Promise<CallSchedule | null> => state.schedule,
    listEnabled: async (): Promise<readonly CallSchedule[]> => [state.schedule],
    upsert: async ({
      schedule: next,
    }: {
      readonly schedule: CallSchedule;
    }): Promise<void> => {
      state.schedule = next;
    },
  } satisfies CallScheduleRepository;

  const notificationRecords: readonly CallNotificationRecord[] = [
    {
      callScheduleId: schedule.id,
      callSessionId: state.session.id,
      createdAt: NOW,
      id: 'notification-1',
      kind: 'prenotification',
      slackMessage: { channelId: 'D_SAVED', messageTs: '9.9' },
      targetRunAt: RUN_AT,
      userId: schedule.userId,
      workspaceId: WORKSPACE_ID,
    },
  ];
  const callNotificationRepository = {
    create: async (): Promise<void> => {},
    exists: async (): Promise<boolean> => false,
    listByScheduledRun: async (): Promise<readonly CallNotificationRecord[]> =>
      notificationRecords,
    updateSlackMessage: async (): Promise<void> => {},
  } satisfies CallNotificationRepository;

  const callSessionRepository = {
    create: async (): Promise<void> => {},
    getById: async (): Promise<CallSession | null> => state.session,
    listBusyForLiveKitIdleCheck: async (): Promise<
      readonly CallSession[]
    > => [],
    listEndedWithoutSummary: async (): Promise<readonly CallSession[]> => [],
    listMissedWithoutNotification: async (): Promise<
      readonly CallSession[]
    > => [],
    update: async (): Promise<void> => {},
  } satisfies CallSessionRepository;

  const callSessionService = {
    transitionCall: async ({
      status,
    }: {
      readonly callSessionId: string;
      readonly status: CallSession['status'];
      readonly workspaceId: string;
    }): Promise<CallSession> => {
      state.transitions.push(status);
      state.session = { ...state.session, status };
      return state.session;
    },
  } as unknown as CallSessionService;

  const slackGateway = {
    openView: async (): Promise<void> => {
      state.openedViews += 1;
    },
    updateMessage: async ({
      channelId,
      messageTs,
      text,
    }: {
      readonly channelId: string;
      readonly messageTs: string;
      readonly text: string;
    }): Promise<void> => {
      state.updatedMessages.push({ channelId, messageTs, text });
    },
  } as unknown as SlackGateway;

  const userProfileRepository = {
    getById: async () => userProfile,
    listByWorkspace: async () => [userProfile],
    upsert: async (): Promise<void> => {},
  } satisfies UserProfileRepository;

  const workspaceRepository = {
    getById: async () => workspace,
  } as unknown as WorkspaceRepository;

  return {
    deps: {
      callNotificationRepository,
      callScheduleRepository,
      callSessionRepository,
      callSessionService,
      clock,
      slackGateway,
      userProfileRepository,
      workspaceRepository,
    },
    state,
  };
};

const reference = (): string =>
  buildSignedScheduledCallRunValue({
    payload: {
      callScheduleId: schedule.id,
      scheduledRunAt: RUN_AT,
      workspaceId: WORKSPACE_ID,
    },
  });

test('preset reschedule moves nextRunAt forward and skips the old run', async () => {
  const harness = createHarness('created');

  await handleRescheduleScheduledCallRunAction({
    actionId: slackActionIds.rescheduleScheduledCallRun,
    blockId: buildScheduledCallRunActionsBlockId(reference()),
    channelId: 'C1',
    deps: harness.deps,
    messageTs: '1.2',
    selectedOptionValue: scheduledCallRunReschedulePresets.inThirtyMinutes,
    slackTeamId: WORKSPACE_ID,
    slackUserId: SLACK_USER,
  });

  // now + 30min from 01:00:00Z.
  assert.equal(harness.state.schedule.nextRunAt, '2026-06-29T01:30:00.000Z');
  assert.deepEqual(harness.state.transitions, ['skipped']);
  assert.deepEqual(
    harness.state.updatedMessages.map((message) => [
      message.channelId,
      message.messageTs,
    ]),
    [
      ['C1', '1.2'],
      ['D_SAVED', '9.9'],
    ]
  );
});

test('skip button transitions the run to skipped', async () => {
  const harness = createHarness('created');

  await handleSkipScheduledCallRunAction({
    actionId: slackActionIds.skipScheduledCallRun,
    channelId: 'C1',
    deps: harness.deps,
    messageTs: '1.2',
    slackTeamId: WORKSPACE_ID,
    slackUserId: SLACK_USER,
    value: reference(),
  });

  assert.deepEqual(harness.state.transitions, ['skipped']);
  // nextRunAt stays untouched on a plain skip.
  assert.equal(harness.state.schedule.nextRunAt, RUN_AT);
  assert.equal(harness.state.updatedMessages.length, 2);
});

test('modal submission in the past skips instead of rescheduling', async () => {
  const harness = createHarness('created');

  await saveScheduledCallRunRescheduleModal({
    callbackId: slackViewIds.scheduledCallRunReschedule,
    deps: harness.deps,
    privateMetadata: reference(),
    slackTeamId: WORKSPACE_ID,
    slackUserId: SLACK_USER,
    stateValues: {
      'exe.scheduled_call_run.reschedule_date': {
        'exe.scheduled_call_run.reschedule_date': {
          selected_date: '2026-06-29',
        },
      },
      'exe.scheduled_call_run.reschedule_time': {
        // 2026-06-29 09:00 JST = 00:00Z, which is before NOW (01:00Z).
        'exe.scheduled_call_run.reschedule_time': { selected_time: '09:00' },
      },
    },
  });

  assert.deepEqual(harness.state.transitions, ['skipped']);
  assert.equal(harness.state.schedule.nextRunAt, RUN_AT);
  assert.deepEqual(harness.state.updatedMessages, [
    {
      channelId: 'D_SAVED',
      messageTs: '9.9',
      text: ':double_vertical_bar: この回はスキップしました。',
    },
  ]);
});

test('modal submission in the future reschedules the run', async () => {
  const harness = createHarness('created');

  await saveScheduledCallRunRescheduleModal({
    callbackId: slackViewIds.scheduledCallRunReschedule,
    deps: harness.deps,
    privateMetadata: reference(),
    slackTeamId: WORKSPACE_ID,
    slackUserId: SLACK_USER,
    stateValues: {
      'exe.scheduled_call_run.reschedule_date': {
        'exe.scheduled_call_run.reschedule_date': {
          selected_date: '2026-06-29',
        },
      },
      'exe.scheduled_call_run.reschedule_time': {
        // 2026-06-29 18:00 JST = 09:00Z, which is after NOW (01:00Z).
        'exe.scheduled_call_run.reschedule_time': { selected_time: '18:00' },
      },
    },
  });

  assert.equal(harness.state.schedule.nextRunAt, '2026-06-29T09:00:00.000Z');
  assert.deepEqual(harness.state.transitions, ['skipped']);
  assert.deepEqual(harness.state.updatedMessages, [
    {
      channelId: 'D_SAVED',
      messageTs: '9.9',
      text: ':calendar: 06/29 (月) 18:00 に再調整しました。',
    },
  ]);
});

test('already-skipped run reports status without re-transitioning', async () => {
  const harness = createHarness('skipped');

  await handleSkipScheduledCallRunAction({
    actionId: slackActionIds.skipScheduledCallRun,
    channelId: 'C1',
    deps: harness.deps,
    messageTs: '1.2',
    slackTeamId: WORKSPACE_ID,
    slackUserId: SLACK_USER,
    value: reference(),
  });

  assert.deepEqual(harness.state.transitions, []);
  assert.equal(harness.state.updatedMessages.length, 1);
});
