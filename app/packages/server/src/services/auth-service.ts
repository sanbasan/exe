import { unauthenticatedError } from '#server/errors';
import type {
  AuthGateway,
  Clock,
  EmailGateway,
  IdGenerator,
  SignInCodeRepository,
  SlackGateway,
  SlackMemberIndexRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { discoverLinkedSlackUsers } from './auth-workspace-discovery';
import {
  isSignInCodeValid,
  normalizeEmail,
  signInCodeSchema,
  userProfileSchema,
  type Language,
  type UserProfile,
} from '@exe/domain';
import { randomInt } from 'node:crypto';

export interface AuthService {
  readonly sendCode: (params: {
    readonly email: string;
    readonly language?: Language;
  }) => Promise<void>;
  readonly verifyCode: (params: {
    readonly code: string;
    readonly email: string;
  }) => Promise<string>;
}

export interface AppReviewSignInConfig {
  readonly code: string;
  readonly email: string;
}

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;

const generateRandomCode = (): string =>
  Array.from({ length: CODE_LENGTH }, () => randomInt(0, 10).toString()).join(
    ''
  );

const addMinutes = ({
  iso,
  minutes,
}: {
  readonly iso: string;
  readonly minutes: number;
}): string => new Date(Date.parse(iso) + minutes * 60 * 1000).toISOString();

const buildSignInCodeEmail = ({
  code,
  language,
}: {
  readonly code: string;
  readonly language: Language;
}): {
  readonly html: string;
  readonly subject: string;
} => {
  if (language === 'en') {
    return {
      html: `<p>Your exe sign-in code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
      subject: 'Your exe sign-in code',
    };
  }

  return {
    html: `<p>exe のログインコードは <strong>${code}</strong> です。</p><p>このコードは 10 分で期限切れになります。</p>`,
    subject: 'exe のログインコード',
  };
};

export const createAuthService = ({
  appReviewSignIn,
  authGateway,
  clock,
  emailGateway,
  encryptionKey,
  idGenerator,
  signInCodeGenerator,
  signInCodeRepository,
  slackGateway,
  slackMemberIndexRepository,
  userProfileRepository,
  workspaceRepository,
}: {
  readonly appReviewSignIn?: AppReviewSignInConfig;
  readonly authGateway: AuthGateway;
  readonly clock: Clock;
  readonly emailGateway: EmailGateway;
  readonly encryptionKey?: string;
  readonly idGenerator: IdGenerator;
  readonly signInCodeGenerator?: () => string;
  readonly signInCodeRepository: SignInCodeRepository;
  readonly slackGateway: SlackGateway;
  readonly slackMemberIndexRepository: SlackMemberIndexRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): AuthService => {
  const normalizedAppReviewSignIn =
    appReviewSignIn === undefined
      ? undefined
      : {
          code: appReviewSignIn.code,
          email: normalizeEmail(appReviewSignIn.email),
        };

  const isAppReviewSignIn = ({
    code,
    email,
  }: {
    readonly code: string;
    readonly email: string;
  }): boolean =>
    normalizedAppReviewSignIn?.email === email &&
    normalizedAppReviewSignIn.code === code;

  const upsertUserProfile = async ({
    email,
    userId,
  }: {
    readonly email: string;
    readonly userId: string;
  }): Promise<UserProfile> => {
    const existingProfile = await userProfileRepository.getById({ userId });
    const { fullDiscovery, slackUsers } = await discoverLinkedSlackUsers({
      deps: {
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        slackGateway,
        slackMemberIndexRepository,
        workspaceRepository,
      },
      email,
      existingProfile,
    });
    const now = clock.now();
    const lastFullDiscoveryAt = fullDiscovery
      ? now
      : existingProfile?.lastFullDiscoveryAt;
    const userProfile = userProfileSchema.parse({
      ...(existingProfile?.displayName === undefined
        ? {}
        : { displayName: existingProfile.displayName }),
      createdAt: existingProfile?.createdAt ?? now,
      email,
      id: userId,
      ...(lastFullDiscoveryAt === undefined ? {} : { lastFullDiscoveryAt }),
      slackUsers,
      updatedAt: now,
      workspaceIds: [
        ...new Set(
          slackUsers.map((linkedSlackUser) => linkedSlackUser.workspaceId)
        ),
      ].toSorted(),
    });

    await userProfileRepository.upsert({ userProfile });

    return userProfile;
  };

  const completeSignIn = async ({
    email,
  }: {
    readonly email: string;
  }): Promise<string> => {
    const existingUser = await authGateway.getUserByEmail({
      email,
    });
    const user = existingUser ?? (await authGateway.createUser({ email }));

    await upsertUserProfile({
      email,
      userId: user.uid,
    });

    return authGateway.createCustomToken({ uid: user.uid });
  };

  return {
    sendCode: async ({ email, language = 'en' }): Promise<void> => {
      const normalizedEmail = normalizeEmail(email);
      const now = clock.now();
      const code = (signInCodeGenerator ?? generateRandomCode)();
      const emailContent = buildSignInCodeEmail({ code, language });

      await signInCodeRepository.create({
        signInCode: signInCodeSchema.parse({
          code,
          createdAt: now,
          email: normalizedEmail,
          expiresAt: addMinutes({ iso: now, minutes: CODE_TTL_MINUTES }),
          id: idGenerator.generateId(),
          updatedAt: now,
        }),
      });
      await emailGateway.sendSignInCode({
        code,
        email: normalizedEmail,
        html: emailContent.html,
        subject: emailContent.subject,
      });
    },
    verifyCode: async ({ code, email }): Promise<string> => {
      const normalizedEmail = normalizeEmail(email);
      if (isAppReviewSignIn({ code, email: normalizedEmail })) {
        return completeSignIn({ email: normalizedEmail });
      }

      const signInCode = await signInCodeRepository.findByEmailAndCode({
        code,
        email: normalizedEmail,
      });

      if (signInCode === null) {
        throw unauthenticatedError('Invalid verification code.');
      }

      if (!isSignInCodeValid({ now: clock.now(), signInCode })) {
        throw unauthenticatedError('Verification code expired.');
      }

      await signInCodeRepository.deleteById({ signInCodeId: signInCode.id });

      return completeSignIn({ email: normalizedEmail });
    },
  };
};
