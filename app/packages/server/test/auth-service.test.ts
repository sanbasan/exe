import type {
  AuthGateway,
  AuthUserRecord,
  Clock,
  EmailGateway,
  IdGenerator,
  SignInCodeRepository,
  SlackGateway,
  SlackMemberIndexRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '../src/ports';
import {
  createAuthService,
  type AppReviewSignInConfig,
} from '../src/services/auth-service';
import type { SignInCode, UserProfile, Workspace } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-29T00:00:00.000Z';

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { generateId: () => 'sign-in-code-1' };
const appReviewSignIn: AppReviewSignInConfig = {
  code: '123456',
  email: 'testuser1@example.com',
};

const notImplemented = (): never => {
  throw new Error('not implemented');
};

const createAuthGateway = (): AuthGateway & {
  readonly getCreatedEmails: () => readonly string[];
} => {
  const users = new Map<string, AuthUserRecord>();
  const createdEmails: string[] = [];

  return {
    createCustomToken: async ({ uid }): Promise<string> =>
      `custom-token:${uid}`,
    createUser: async ({ email }): Promise<AuthUserRecord> => {
      const user = {
        email,
        uid: `user-${String(createdEmails.length + 1)}`,
      };
      createdEmails.push(email);
      users.set(email, user);

      return user;
    },
    getCreatedEmails: (): readonly string[] => [...createdEmails],
    getUserByEmail: async ({ email }): Promise<AuthUserRecord | null> =>
      users.get(email) ?? null,
  };
};

const createEmailGateway = (): EmailGateway & {
  readonly getSentEmails: () => readonly Parameters<
    EmailGateway['sendSignInCode']
  >[0][];
} => {
  const sentEmails: Parameters<EmailGateway['sendSignInCode']>[0][] = [];

  return {
    getSentEmails: (): readonly Parameters<
      EmailGateway['sendSignInCode']
    >[0][] => [...sentEmails],
    sendSignInCode: async (params): Promise<void> => {
      sentEmails.push(params);
    },
  };
};

const createSignInCodeRepository = (): SignInCodeRepository & {
  readonly getCreatedCodes: () => readonly SignInCode[];
  readonly getDeletedIds: () => readonly string[];
} => {
  let codes: SignInCode[] = [];
  const deletedIds: string[] = [];

  return {
    create: async ({ signInCode }): Promise<void> => {
      codes.push(signInCode);
    },
    deleteById: async ({ signInCodeId }): Promise<void> => {
      deletedIds.push(signInCodeId);
      codes = codes.filter((code) => code.id !== signInCodeId);
    },
    findByEmailAndCode: async ({ code, email }): Promise<SignInCode | null> =>
      codes.find(
        (signInCode) => signInCode.email === email && signInCode.code === code
      ) ?? null,
    getCreatedCodes: (): readonly SignInCode[] => [...codes],
    getDeletedIds: (): readonly string[] => [...deletedIds],
  };
};

const createUserProfileRepository = (): UserProfileRepository & {
  readonly getUpsertedProfiles: () => readonly UserProfile[];
} => {
  const upsertedProfiles: UserProfile[] = [];

  return {
    getById: async (): Promise<UserProfile | null> => null,
    getUpsertedProfiles: (): readonly UserProfile[] => [...upsertedProfiles],
    listByWorkspace: async (): Promise<readonly UserProfile[]> => [],
    upsert: async ({ userProfile }): Promise<void> => {
      upsertedProfiles.push(userProfile);
    },
  };
};

const slackMemberIndexRepository: SlackMemberIndexRepository = {
  deleteEntry: async (): Promise<void> => {},
  listByEmail: async () => [],
  upsert: async (): Promise<void> => {},
};

const workspaceRepository: WorkspaceRepository = {
  acquireTokenRefreshLock: async () => notImplemented(),
  getById: async (): Promise<Workspace | null> => null,
  listAll: async (): Promise<readonly Workspace[]> => [],
  listByIds: async (): Promise<readonly Workspace[]> => [],
  releaseTokenRefreshLock: async (): Promise<void> => {},
  updateTokens: async (): Promise<void> => {},
  upsert: async (): Promise<void> => {},
};

const slackGateway: SlackGateway = {
  exchangeCodeForInstallation: async () => notImplemented(),
  getChannelInfo: async () => notImplemented(),
  getReplies: async () => notImplemented(),
  getUserInfo: async () => notImplemented(),
  getWorkspaceInfo: async () => notImplemented(),
  listBotJoinedChannels: async () => notImplemented(),
  listUserJoinedChannelIds: async () => ({ channelIds: [], status: 'ok' }),
  listWorkspaceMembers: async () => notImplemented(),
  lookupUserByEmail: async () => notImplemented(),
  openView: async () => notImplemented(),
  postMessage: async () => notImplemented(),
  publishHomeView: async () => notImplemented(),
  refreshBotToken: async () => notImplemented(),
  updateMessage: async () => notImplemented(),
  updateView: async () => notImplemented(),
  verifyMembershipByEmail: async () => notImplemented(),
};

const createTestAuthService = ({
  authGateway = createAuthGateway(),
  emailGateway = createEmailGateway(),
  signInCodeRepository = createSignInCodeRepository(),
  signInCodeGenerator,
  userProfileRepository = createUserProfileRepository(),
}: {
  readonly authGateway?: AuthGateway;
  readonly emailGateway?: EmailGateway;
  readonly signInCodeGenerator?: () => string;
  readonly signInCodeRepository?: SignInCodeRepository;
  readonly userProfileRepository?: UserProfileRepository;
}) =>
  createAuthService({
    appReviewSignIn,
    authGateway,
    clock,
    emailGateway,
    idGenerator,
    ...(signInCodeGenerator === undefined ? {} : { signInCodeGenerator }),
    signInCodeRepository,
    slackGateway,
    slackMemberIndexRepository,
    userProfileRepository,
    workspaceRepository,
  });

test('app review fixed code signs in configured account without stored code', async () => {
  const authGateway = createAuthGateway();
  const signInCodeRepository = createSignInCodeRepository();
  const userProfileRepository = createUserProfileRepository();
  const authService = createTestAuthService({
    authGateway,
    signInCodeRepository,
    userProfileRepository,
  });

  const customToken = await authService.verifyCode({
    code: '123456',
    email: ' TestUser1@Example.com ',
  });

  assert.equal(customToken, 'custom-token:user-1');
  assert.deepEqual(authGateway.getCreatedEmails(), ['testuser1@example.com']);
  assert.deepEqual(signInCodeRepository.getDeletedIds(), []);

  const [profile] = userProfileRepository.getUpsertedProfiles();
  assert.equal(profile?.email, 'testuser1@example.com');
  assert.deepEqual(profile?.workspaceIds, []);
});

test('app review send code emails configured account and issued code signs in', async () => {
  const authGateway = createAuthGateway();
  const emailGateway = createEmailGateway();
  const signInCodeRepository = createSignInCodeRepository();
  const userProfileRepository = createUserProfileRepository();
  const authService = createTestAuthService({
    authGateway,
    emailGateway,
    signInCodeGenerator: () => '654321',
    signInCodeRepository,
    userProfileRepository,
  });

  await authService.sendCode({
    email: 'TESTUSER1@example.com',
    language: 'ja',
  });

  const [createdCode] = signInCodeRepository.getCreatedCodes();
  assert.ok(createdCode);
  assert.equal(createdCode.code, '654321');
  assert.equal(createdCode.email, 'testuser1@example.com');

  const [sentEmail] = emailGateway.getSentEmails();
  assert.ok(sentEmail);
  assert.equal(sentEmail.code, '654321');
  assert.equal(sentEmail.email, 'testuser1@example.com');

  const customToken = await authService.verifyCode({
    code: '654321',
    email: 'testuser1@example.com',
  });

  assert.equal(customToken, 'custom-token:user-1');
  assert.deepEqual(signInCodeRepository.getDeletedIds(), ['sign-in-code-1']);
  assert.equal(
    userProfileRepository.getUpsertedProfiles()[0]?.email,
    'testuser1@example.com'
  );
});

test('app review fixed code does not sign in a different email', async () => {
  const authGateway = createAuthGateway();
  const authService = createTestAuthService({ authGateway });

  await assert.rejects(
    async () =>
      authService.verifyCode({
        code: '123456',
        email: 'other@example.com',
      }),
    /Invalid verification code/u
  );
  assert.deepEqual(authGateway.getCreatedEmails(), []);
});
