import type {
  CallSessionRepository,
  ChannelRepository,
  Clock,
  IdGenerator,
  LiveKitGateway,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '../src/ports';
import { createCallSessionCreator } from '../src/services/call-session-creator';
import {
  type CallSession,
  type UserProfile,
  userProfileSchema,
  type Workspace,
  workspaceSchema,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-28T00:00:00.000Z';

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { generateId: () => 'session-1' };

const workspace = workspaceSchema.parse({
  admin: { emails: ['owner@example.com'], slackUserIds: ['U_OWNER'] },
  botUserId: 'U_BOT',
  createdAt: NOW,
  encryptedBotToken: 'encrypted-bot-token',
  id: 'T_WORKSPACE',
  language: 'ja',
  name: 'Workspace',
  slackTeamId: 'T_WORKSPACE',
  timezone: 'Asia/Tokyo',
  updatedAt: NOW,
});

const userProfile = userProfileSchema.parse({
  createdAt: NOW,
  email: 'user@example.com',
  id: 'user-1',
  slackUsers: [
    {
      slackTeamId: 'T_WORKSPACE',
      slackUserId: 'U_USER',
      verifiedAt: NOW,
      workspaceId: 'T_WORKSPACE',
    },
  ],
  updatedAt: NOW,
  workspaceIds: ['T_WORKSPACE'],
});

const notImplemented = (): never => {
  throw new Error('not implemented');
};

const createCallSessionRepository = (): CallSessionRepository & {
  readonly getCreatedSession: () => CallSession | null;
} => {
  let createdSession: CallSession | null = null;

  return {
    create: async ({ session }): Promise<void> => {
      createdSession = session;
    },
    getById: async (): Promise<CallSession | null> => createdSession,
    getCreatedSession: (): CallSession | null => createdSession,
    listBusyForLiveKitIdleCheck: async (): Promise<
      readonly CallSession[]
    > => [],
    listEndedWithoutSummary: async (): Promise<readonly CallSession[]> => [],
    listMissedWithoutNotification: async (): Promise<
      readonly CallSession[]
    > => [],
    update: async ({ session }): Promise<void> => {
      createdSession = session;
    },
  };
};

const channelRepository: ChannelRepository = {
  getById: async () => null,
  listByWorkspace: async () => [],
  upsert: async () => {},
};

const channelBlockRepository = {
  create: async () => {},
  getById: async () => null,
  listByWorkspace: async () => [],
  update: async () => {},
};

const channelReviewStateRepository = {
  getByChannelAndUser: async () => null,
  listByWorkspace: async () => [],
  upsert: async () => {},
};

const taskRepository: TaskRepository = {
  create: async () => {},
  getById: async () => null,
  listByAssignee: async () => [],
  listByRequester: async () => [],
  listByWorkspace: async () => [],
  update: async () => {},
};

const userProfileRepository: UserProfileRepository = {
  getById: async (): Promise<UserProfile> => userProfile,
  listByWorkspace: async (): Promise<readonly UserProfile[]> => [userProfile],
  upsert: async () => {},
};

const workspaceRepository: WorkspaceRepository = {
  acquireTokenRefreshLock: async () => notImplemented(),
  getById: async (): Promise<Workspace> => workspace,
  listAll: async (): Promise<readonly Workspace[]> => [workspace],
  listByIds: async (): Promise<readonly Workspace[]> => [workspace],
  releaseTokenRefreshLock: async () => {},
  updateTokens: async () => {},
  upsert: async () => {},
};

const createThrowingWarmUpLiveKitGateway = (): LiveKitGateway => ({
  createParticipantToken: async () => notImplemented(),
  deleteRoom: async () => notImplemented(),
  ensureAgentDispatched: async () => notImplemented(),
  warmUpAgentWorker: (): Promise<void> => {
    throw new Error('LIVEKIT_API_KEY is required.');
  },
});

test('call session creation treats LiveKit warm-up as best effort when it throws synchronously', async () => {
  const callSessionRepository = createCallSessionRepository();
  const createCall = createCallSessionCreator({
    callSessionRepository,
    channelBlockRepository,
    channelRepository,
    channelReviewStateRepository,
    channelVisibility: { getVisibilityForSlackUser: async () => 'all' },
    clock,
    idGenerator,
    liveKitGateway: createThrowingWarmUpLiveKitGateway(),
    liveKitRoomNamePrefix: 'exe-',
    taskRepository,
    userProfileRepository,
    workspaceRepository,
  });

  const result = await createCall({
    purpose: 'scheduled_review',
    scheduledRunAt: '2026-06-28T00:10:00.000Z',
    userId: 'user-1',
    workspaceId: 'T_WORKSPACE',
  });

  assert.equal(result.session.id, 'session-1');
  assert.equal(result.session.liveKitRoomName, 'exe-session-1');
  assert.equal(callSessionRepository.getCreatedSession()?.id, 'session-1');
});
