import type { Clock, SlackGateway, WorkspaceRepository } from '#server/ports';
import { decrypt } from '#server/utils';
import {
  LOCK_LEASE_MILLISECONDS,
  LOCK_RETRY_MILLISECONDS,
  LOCK_TIMEOUT_MILLISECONDS,
  addMilliseconds,
  decryptBotToken,
  encryptToken,
  loadWorkspaceOrThrow,
  shouldRefresh,
  toEncryptionKeyParams,
} from './slack-bot-token-utils';
import { addSeconds } from './slack-workspace-utils';
import type { Workspace } from '@exe/domain';
import { randomUUID } from 'node:crypto';

interface RefreshWithLockParams {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly forceRefresh: boolean;
  readonly initialBotToken: string;
  readonly slackGateway: SlackGateway;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}

interface RefreshOrReadLatestTokenParams {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly forceRefresh: boolean;
  readonly initialBotToken: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceId: string;
  readonly workspaceRepository: WorkspaceRepository;
}

interface AttemptRefreshWithLockParams extends RefreshWithLockParams {
  readonly deadline: number;
  readonly ownerId: string;
}

const isFreshEnough = ({
  clock,
  workspace,
}: {
  readonly clock: Clock;
  readonly workspace: Workspace;
}): boolean =>
  !shouldRefresh({
    ...(workspace.botTokenExpiresAt === undefined
      ? {}
      : { expiresAt: workspace.botTokenExpiresAt }),
    now: clock.now(),
  });

const readTokenIfAnotherWorkerRefreshed = async ({
  clock,
  encryptionKey,
  forceRefresh,
  initialBotToken,
  workspaceId,
  workspaceRepository,
}: {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly forceRefresh: boolean;
  readonly initialBotToken: string;
  readonly workspaceId: string;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<string | null> => {
  const latestWorkspace = await loadWorkspaceOrThrow({
    workspaceId,
    workspaceRepository,
  });
  const latestBotToken = decryptBotToken({
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    workspace: latestWorkspace,
  });

  if (forceRefresh && latestBotToken !== initialBotToken) {
    return latestBotToken;
  }

  return !forceRefresh && isFreshEnough({ clock, workspace: latestWorkspace })
    ? latestBotToken
    : null;
};

const buildUpdatedTokenFields = ({
  clock,
  encryptionKey,
  refreshed,
  refreshTokenFallback,
}: {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly refreshed: Awaited<ReturnType<SlackGateway['refreshBotToken']>>;
  readonly refreshTokenFallback: string;
}): {
  readonly botTokenExpiresAt?: string;
  readonly encryptedBotRefreshToken: string;
  readonly encryptedBotToken: string;
  readonly updatedAt: string;
} => {
  const updatedAt = clock.now();

  return {
    ...(refreshed.expiresInSeconds === undefined
      ? {}
      : {
          botTokenExpiresAt: addSeconds({
            iso: updatedAt,
            seconds: refreshed.expiresInSeconds,
          }),
        }),
    encryptedBotRefreshToken:
      refreshed.refreshToken === undefined
        ? refreshTokenFallback
        : encryptToken({
            ...toEncryptionKeyParams(encryptionKey),
            token: refreshed.refreshToken,
          }),
    encryptedBotToken: encryptToken({
      ...toEncryptionKeyParams(encryptionKey),
      token: refreshed.accessToken,
    }),
    updatedAt,
  };
};

export const refreshOrReadLatestToken = async ({
  clock,
  encryptionKey,
  forceRefresh,
  initialBotToken,
  slackGateway,
  workspaceId,
  workspaceRepository,
}: RefreshOrReadLatestTokenParams): Promise<string> => {
  const latestWorkspace = await loadWorkspaceOrThrow({
    workspaceId,
    workspaceRepository,
  });
  const latestBotToken = decryptBotToken({
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    workspace: latestWorkspace,
  });

  if (forceRefresh && latestBotToken !== initialBotToken) {
    return latestBotToken;
  }

  if (!forceRefresh && isFreshEnough({ clock, workspace: latestWorkspace })) {
    return latestBotToken;
  }

  if (latestWorkspace.encryptedBotRefreshToken === undefined) {
    return latestBotToken;
  }

  const refreshed = await slackGateway.refreshBotToken({
    refreshToken: decrypt({
      ...toEncryptionKeyParams(encryptionKey),
      text: latestWorkspace.encryptedBotRefreshToken,
    }),
  });

  await workspaceRepository.updateTokens({
    tokens: buildUpdatedTokenFields({
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      refreshed,
      refreshTokenFallback: latestWorkspace.encryptedBotRefreshToken,
    }),
    workspaceId,
  });

  return refreshed.accessToken;
};

const attemptRefreshWithLock = async (
  {
    clock,
    deadline,
    encryptionKey,
    forceRefresh,
    initialBotToken,
    ownerId,
    slackGateway,
    workspace,
    workspaceRepository,
  }: AttemptRefreshWithLockParams,
  sleepMilliseconds: (milliseconds: number) => Promise<void>
): Promise<string> => {
  if (Date.now() > deadline) {
    throw new Error(
      `Timed out waiting for Slack token refresh lock ${workspace.id}.`
    );
  }

  const now = clock.now();
  const acquired = await workspaceRepository.acquireTokenRefreshLock({
    expiresAt: addMilliseconds({
      iso: now,
      milliseconds: LOCK_LEASE_MILLISECONDS,
    }),
    now,
    ownerId,
    workspaceId: workspace.id,
  });

  if (acquired) {
    return refreshOrReadLatestToken({
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      forceRefresh,
      initialBotToken,
      slackGateway,
      workspaceId: workspace.id,
      workspaceRepository,
    }).finally(() =>
      workspaceRepository.releaseTokenRefreshLock({
        ownerId,
        workspaceId: workspace.id,
      })
    );
  }

  await sleepMilliseconds(LOCK_RETRY_MILLISECONDS);

  const token = await readTokenIfAnotherWorkerRefreshed({
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    forceRefresh,
    initialBotToken,
    workspaceId: workspace.id,
    workspaceRepository,
  });

  if (token !== null) {
    return token;
  }

  return attemptRefreshWithLock(
    {
      clock,
      deadline,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      forceRefresh,
      initialBotToken,
      ownerId,
      slackGateway,
      workspace,
      workspaceRepository,
    },
    sleepMilliseconds
  );
};

export const refreshWithLock = (
  params: RefreshWithLockParams,
  sleepMilliseconds: (milliseconds: number) => Promise<void>
): Promise<string> =>
  attemptRefreshWithLock(
    {
      ...params,
      deadline: Date.now() + LOCK_TIMEOUT_MILLISECONDS,
      ownerId: randomUUID(),
    },
    sleepMilliseconds
  );
