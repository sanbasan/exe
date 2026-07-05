import type {
  CallNotificationRecord,
  CallNotificationRepository,
  CallScheduleRepository,
  Clock,
  DeviceTokenRepository,
  NotificationGateway,
} from '../src/ports';
import type { CallWorkflowDeps } from '../src/workflows/deps';
import { startScheduledCalls } from '../src/workflows/scheduled-call-workflows';
import {
  callScheduleSchema,
  callSessionSchema,
  userProfileSchema,
  workspaceSchema,
  type CallSchedule,
  type CallSession,
  type DeviceToken,
  type UserProfile,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-07-01T00:11:00.000Z';
const RUN_AT = '2026-07-01T00:00:00.000Z';
const WORKSPACE_ID = 'T_WORKSPACE';
const USER_ID = 'user-1';

const clock: Clock = { now: () => NOW };
const workspace = workspaceSchema.parse({
  admin: { emails: [], slackUserIds: [] },
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
const userProfile = userProfileSchema.parse({
  createdAt: NOW,
  email: 'user@example.com',
  id: USER_ID,
  slackUsers: [
    {
      slackTeamId: WORKSPACE_ID,
      slackUserId: 'U_USER',
      verifiedAt: NOW,
      workspaceId: WORKSPACE_ID,
    },
  ],
  updatedAt: NOW,
  workspaceIds: [WORKSPACE_ID],
});

const buildSchedule = (id: string): CallSchedule =>
  callScheduleSchema.parse({
    createdAt: NOW,
    enabled: true,
    excludedDates: [],
    id,
    nextRunAt: RUN_AT,
    preNotifyMinutes: 10,
    timeOfDay: '09:00',
    timezone: 'Asia/Tokyo',
    updatedAt: NOW,
    userId: USER_ID,
    weekdays: [1],
    workspaceId: WORKSPACE_ID,
  });

const buildSession = (schedule: CallSchedule): CallSession =>
  callSessionSchema.parse({
    callScheduleId: schedule.id,
    createdAt: NOW,
    id: `session-${schedule.id}`,
    liveKitRoomName: `room-${schedule.id}`,
    purpose: 'scheduled_review',
    scheduledRunAt: RUN_AT,
    status: 'created',
    updatedAt: NOW,
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  });

class RecordingCallNotificationRepository implements CallNotificationRepository {
  public records: readonly CallNotificationRecord[] = [];

  public create = async ({
    record,
  }: {
    readonly record: CallNotificationRecord;
  }): Promise<void> => {
    if (this.records.some((candidate) => candidate.id === record.id)) {
      const error = new Error('already exists');

      Object.assign(error, { code: 6 });
      throw error;
    }

    this.records = [...this.records, record];
  };

  public exists = async ({
    kind,
    targetRunAt,
    userId,
    workspaceId,
  }: {
    readonly callSessionId?: string;
    readonly kind: CallNotificationRecord['kind'];
    readonly targetRunAt?: string;
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<boolean> =>
    this.records.some(
      (record) =>
        record.kind === kind &&
        record.targetRunAt === targetRunAt &&
        record.userId === userId &&
        record.workspaceId === workspaceId
    );

  public listByScheduledRun = async ({
    targetRunAt,
    userId,
    workspaceId,
  }: {
    readonly targetRunAt: string;
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<readonly CallNotificationRecord[]> =>
    this.records.filter(
      (record) =>
        record.targetRunAt === targetRunAt &&
        record.userId === userId &&
        record.workspaceId === workspaceId
    );

  public updateSlackMessage = async ({
    notificationId,
    slackMessage,
    workspaceId,
  }: {
    readonly notificationId: string;
    readonly slackMessage: NonNullable<CallNotificationRecord['slackMessage']>;
    readonly workspaceId: string;
  }): Promise<void> => {
    this.records = this.records.map((record) =>
      record.id === notificationId && record.workspaceId === workspaceId
        ? { ...record, slackMessage }
        : record
    );
  };
}

class RecordingDeviceTokenRepository implements DeviceTokenRepository {
  public listByUser = async (): Promise<readonly DeviceToken[]> => [];

  public removeByRegistration = async (): Promise<void> => {};

  public removeByTokens = async (): Promise<void> => {};

  public upsert = async (): Promise<void> => {};
}

test('startScheduledCalls starts one call for duplicate schedule rows of the same run', async () => {
  const schedule = buildSchedule('schedule-1');
  const duplicateSchedule = buildSchedule('schedule-duplicate');
  const notificationRepository = new RecordingCallNotificationRepository();
  const sessions: CallSession[] = [];
  const sentSessions: string[] = [];
  const callScheduleRepository: CallScheduleRepository = {
    getById: async (): Promise<CallSchedule | null> => schedule,
    getByUser: async (): Promise<CallSchedule | null> => schedule,
    listEnabled: async (): Promise<readonly CallSchedule[]> => [
      schedule,
      duplicateSchedule,
    ],
    upsert: async (): Promise<void> => {},
  };
  const notificationGateway = {
    sendIncomingCall: async ({
      session,
    }: {
      readonly session: CallSession;
      readonly tokens: readonly DeviceToken[];
      readonly workspace: typeof workspace;
    }): Promise<readonly string[]> => {
      sentSessions.push(session.id);

      return [];
    },
  } as unknown as NotificationGateway;
  const callSessionService = {
    createScheduledReviewCall: async ({
      schedule: nextSchedule,
    }: {
      readonly schedule: CallSchedule;
      readonly scheduledRunAt: string;
    }): Promise<{ readonly session: CallSession }> => {
      const session = buildSession(nextSchedule);

      sessions.push(session);

      return { session };
    },
    getById: async ({
      callSessionId,
    }: {
      readonly callSessionId: string;
      readonly workspaceId: string;
    }): Promise<CallSession> => {
      const session = sessions.find(
        (candidate) => candidate.id === callSessionId
      );

      assert.notEqual(session, undefined);

      return session;
    },
    transitionCall: async ({
      callSessionId,
      status,
    }: {
      readonly callSessionId: string;
      readonly status: CallSession['status'];
      readonly workspaceId: string;
    }): Promise<CallSession> => {
      const session = sessions.find(
        (candidate) => candidate.id === callSessionId
      );

      assert.notEqual(session, undefined);

      const nextSession = { ...session, status };

      return callSessionSchema.parse(nextSession);
    },
  };

  await startScheduledCalls({
    at: NOW,
    deps: {
      callNotificationRepository: notificationRepository,
      callScheduleRepository,
      callSessionService,
      clock,
      deviceTokenRepository: new RecordingDeviceTokenRepository(),
      notificationGateway,
      userProfileRepository: {
        getById: async (): Promise<UserProfile> => userProfile,
        listByWorkspace: async (): Promise<readonly UserProfile[]> => [
          userProfile,
        ],
        upsert: async (): Promise<void> => {},
      },
      workspaceRepository: {
        getById: async () => workspace,
      },
    } as unknown as CallWorkflowDeps,
  });

  assert.equal(sentSessions.length, 1);
  assert.equal(notificationRepository.records.length, 1);
  assert.equal(
    notificationRepository.records[0].id,
    'call_notification_scheduled_call_start_T_WORKSPACE_user-1_2026-07-01T00_00_00_000Z'
  );
});
