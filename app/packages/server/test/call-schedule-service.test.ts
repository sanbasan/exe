import type {
  CallScheduleRepository,
  Clock,
  IdGenerator,
  UserProfileRepository,
  WorkspaceRepository,
  WorkspaceTokenFields,
} from '../src/ports';
import { createCallScheduleService } from '../src/services/call-schedule-service';
import type { CallSchedule, UserProfile, Workspace } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-30T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const SPOKEN_SLACK_USER = 'USPOKEN';

class InMemoryCallScheduleRepository implements CallScheduleRepository {
  public schedules: CallSchedule[] = [];

  public getById = async ({
    callScheduleId,
    workspaceId,
  }: {
    readonly callScheduleId: string;
    readonly workspaceId: string;
  }): Promise<CallSchedule | null> =>
    this.schedules.find(
      (schedule) =>
        schedule.id === callScheduleId && schedule.workspaceId === workspaceId
    ) ?? null;

  public getByUser = async ({
    userId,
    workspaceId,
  }: {
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<CallSchedule | null> =>
    this.schedules.find(
      (schedule) =>
        schedule.userId === userId && schedule.workspaceId === workspaceId
    ) ?? null;

  public listEnabled = async (): Promise<readonly CallSchedule[]> =>
    this.schedules.filter((schedule) => schedule.enabled);

  public upsert = async ({
    schedule,
  }: {
    readonly schedule: CallSchedule;
  }): Promise<void> => {
    this.schedules = [
      ...this.schedules.filter(
        (candidate) =>
          !(
            candidate.id === schedule.id &&
            candidate.workspaceId === schedule.workspaceId
          )
      ),
      schedule,
    ];
  };
}

class InMemoryUserProfileRepository implements UserProfileRepository {
  public constructor(private readonly profiles: readonly UserProfile[]) {}

  public getById = async ({
    userId,
  }: {
    readonly userId: string;
  }): Promise<UserProfile | null> =>
    this.profiles.find((profile) => profile.id === userId) ?? null;

  public listByWorkspace = async ({
    workspaceId,
  }: {
    readonly workspaceId: string;
  }): Promise<readonly UserProfile[]> =>
    this.profiles.filter((profile) =>
      profile.workspaceIds.includes(workspaceId)
    );

  public upsert = async (_params: {
    readonly userProfile: UserProfile;
  }): Promise<void> => {};
}

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  public constructor(private workspace: Workspace) {}

  public acquireTokenRefreshLock = async (): Promise<boolean> => true;

  public getById = async ({
    workspaceId,
  }: {
    readonly workspaceId: string;
  }): Promise<Workspace | null> =>
    this.workspace.id === workspaceId ? this.workspace : null;

  public listAll = async (): Promise<readonly Workspace[]> => [this.workspace];

  public listByIds = async ({
    workspaceIds,
  }: {
    readonly workspaceIds: readonly string[];
  }): Promise<readonly Workspace[]> =>
    workspaceIds.includes(this.workspace.id) ? [this.workspace] : [];

  public releaseTokenRefreshLock = async (): Promise<void> => {};

  public updateTokens = async ({
    tokens,
  }: {
    readonly tokens: WorkspaceTokenFields;
    readonly workspaceId: string;
  }): Promise<void> => {
    this.workspace = { ...this.workspace, ...tokens };
  };

  public upsert = async ({
    workspace,
  }: {
    readonly workspace: Workspace;
  }): Promise<void> => {
    this.workspace = workspace;
  };
}

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { generateId: () => 'schedule-1' };

const workspace: Workspace = {
  admin: { emails: ['admin@example.com'], slackUserIds: ['UADMIN'] },
  botUserId: 'UBOT',
  channelOwnerEditors: { emails: [], slackUserIds: [] },
  createdAt: NOW,
  encryptedBotToken: 'bot-token',
  id: WORKSPACE_ID,
  language: 'ja',
  name: 'Workspace',
  slackTeamId: WORKSPACE_ID,
  timezone: 'Asia/Tokyo',
  updatedAt: NOW,
};

const spokenUserProfile: UserProfile = {
  createdAt: NOW,
  email: 'spoken@example.com',
  id: 'user-spoken',
  slackUsers: [
    {
      slackTeamId: WORKSPACE_ID,
      slackUserId: SPOKEN_SLACK_USER,
      verifiedAt: NOW,
      workspaceId: WORKSPACE_ID,
    },
  ],
  updatedAt: NOW,
  workspaceIds: [WORKSPACE_ID],
};

void test('Slack call participant can read and update their own call schedule without workspace-admin permission', async () => {
  const callScheduleRepository = new InMemoryCallScheduleRepository();
  const service = createCallScheduleService({
    callScheduleRepository,
    clock,
    idGenerator,
    userProfileRepository: new InMemoryUserProfileRepository([
      spokenUserProfile,
    ]),
    workspaceRepository: new InMemoryWorkspaceRepository(workspace),
  });

  const created = await service.getForSlackUser({
    slackUserId: SPOKEN_SLACK_USER,
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(created.userId, spokenUserProfile.id);
  assert.equal(created.timeOfDay, '09:00');
  assert.deepEqual(created.excludedDates, []);

  const updated = await service.putForSlackUser({
    input: {
      enabled: true,
      excludedDates: ['2026-07-02'],
      preNotifyMinutes: 5,
      timeOfDay: '10:30',
      timezone: 'Asia/Tokyo',
      weekdays: [1, 3, 5],
    },
    slackUserId: SPOKEN_SLACK_USER,
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(updated.userId, spokenUserProfile.id);
  assert.equal(updated.timeOfDay, '10:30');
  assert.deepEqual(updated.excludedDates, ['2026-07-02']);
  assert.deepEqual(updated.weekdays, [1, 3, 5]);
  assert.equal(callScheduleRepository.schedules.length, 1);
});
