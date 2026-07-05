import type { Clock, SlackOAuthInstallation } from '#server/ports';
import { encrypt } from '#server/utils';
import { workspaceSchema, type UserProfile, type Workspace } from '@exe/domain';

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_TIMEZONE = 'Asia/Tokyo';
const EMPTY_WORKSPACE_USER_GROUP = { emails: [], slackUserIds: [] } as const;

export const addSeconds = ({
  iso,
  seconds,
}: {
  readonly iso: string;
  readonly seconds: number;
}): string => new Date(Date.parse(iso) + seconds * 1000).toISOString();

export const findUserProfileBySlackUserId = ({
  slackUserId,
  userProfiles,
  workspaceId,
}: {
  readonly slackUserId: string;
  readonly userProfiles: readonly UserProfile[];
  readonly workspaceId: string;
}): UserProfile | null => {
  const userProfile = userProfiles.find((candidate) =>
    candidate.slackUsers.some(
      (linkedSlackUser) =>
        linkedSlackUser.workspaceId === workspaceId &&
        linkedSlackUser.slackUserId === slackUserId
    )
  );

  return userProfile ?? null;
};

const encryptBotToken = ({
  encryptionKey,
  token,
}: {
  readonly encryptionKey?: string;
  readonly token: string;
}): string =>
  encryptionKey === undefined || encryptionKey.length === 0
    ? token
    : encrypt({ encryptionKey, text: token });

const buildRotatingTokenFields = ({
  clock,
  encryptionKey,
  installation,
}: {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly installation: SlackOAuthInstallation;
}): Pick<Workspace, 'botTokenExpiresAt' | 'encryptedBotRefreshToken'> => ({
  ...(installation.expiresInSeconds === undefined
    ? {}
    : {
        botTokenExpiresAt: addSeconds({
          iso: clock.now(),
          seconds: installation.expiresInSeconds,
        }),
      }),
  ...(installation.refreshToken === undefined
    ? {}
    : {
        encryptedBotRefreshToken: encryptBotToken({
          ...(encryptionKey === undefined ? {} : { encryptionKey }),
          token: installation.refreshToken,
        }),
      }),
});

const getWorkspaceName = ({
  existingWorkspace,
  installation,
}: {
  readonly existingWorkspace?: Workspace;
  readonly installation: SlackOAuthInstallation;
}): string =>
  installation.teamName ?? existingWorkspace?.name ?? installation.teamId;

export const buildWorkspaceFromInstallation = ({
  clock,
  encryptionKey,
  existingWorkspace,
  installation,
}: {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly existingWorkspace?: Workspace;
  readonly installation: SlackOAuthInstallation;
}): Workspace =>
  workspaceSchema.parse({
    admin: existingWorkspace?.admin ?? EMPTY_WORKSPACE_USER_GROUP,
    botUserId: installation.botUserId,
    channelOwnerEditors:
      existingWorkspace?.channelOwnerEditors ?? EMPTY_WORKSPACE_USER_GROUP,
    ...buildRotatingTokenFields({
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      installation,
    }),
    createdAt: existingWorkspace?.createdAt ?? clock.now(),
    encryptedBotToken: encryptBotToken({
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      token: installation.accessToken,
    }),
    id: installation.teamId,
    language: existingWorkspace?.language ?? DEFAULT_LANGUAGE,
    name: getWorkspaceName({
      ...(existingWorkspace === undefined ? {} : { existingWorkspace }),
      installation,
    }),
    slackTeamId: installation.teamId,
    timezone: existingWorkspace?.timezone ?? DEFAULT_TIMEZONE,
    updatedAt: clock.now(),
  });
