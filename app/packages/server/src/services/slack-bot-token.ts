import type { Clock, SlackGateway, WorkspaceRepository } from '#server/ports';
import { isRecoverableSlackAuthError } from '#server/utils';
import { refreshWithLock } from './slack-bot-token-refresh';
import {
  decryptBotToken,
  loadWorkspaceOrThrow,
  shouldRefresh,
  sleep,
} from './slack-bot-token-utils';
import type { Workspace } from '@exe/domain';

const needsRefresh = ({
  clock,
  forceRefresh,
  workspace,
}: {
  readonly clock: Clock;
  readonly forceRefresh: boolean;
  readonly workspace: Workspace;
}): boolean =>
  forceRefresh ||
  (workspace.encryptedBotRefreshToken !== undefined &&
    shouldRefresh({
      ...(workspace.botTokenExpiresAt === undefined
        ? {}
        : { expiresAt: workspace.botTokenExpiresAt }),
      now: clock.now(),
    }));

export const getSlackBotToken = ({
  clock,
  encryptionKey,
  forceRefresh = false,
  slackGateway,
  sleepMilliseconds = sleep,
  workspace,
  workspaceRepository,
}: {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly forceRefresh?: boolean;
  readonly slackGateway: SlackGateway;
  readonly sleepMilliseconds?: (milliseconds: number) => Promise<void>;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<string> => {
  const currentToken = decryptBotToken({
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    workspace,
  });

  if (!needsRefresh({ clock, forceRefresh, workspace })) {
    return Promise.resolve(currentToken);
  }

  return refreshWithLock(
    {
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      forceRefresh,
      initialBotToken: currentToken,
      slackGateway,
      workspace,
      workspaceRepository,
    },
    sleepMilliseconds
  );
};

const rejectUnknownError = (error: unknown): Promise<never> =>
  Promise.reject(
    error instanceof Error ? error : new Error('Slack API failed.')
  );

const getRetryToken = ({
  botToken,
  clock,
  encryptionKey,
  latestWorkspace,
  slackGateway,
  workspaceRepository,
}: {
  readonly botToken: string;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly latestWorkspace: Workspace;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<string> => {
  const latestBotToken = decryptBotToken({
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    workspace: latestWorkspace,
  });

  return latestBotToken === botToken
    ? getSlackBotToken({
        clock,
        ...(encryptionKey === undefined ? {} : { encryptionKey }),
        forceRefresh: true,
        slackGateway,
        workspace: latestWorkspace,
        workspaceRepository,
      })
    : Promise.resolve(latestBotToken);
};

export const withSlackBotToken = async <Value>({
  clock,
  encryptionKey,
  run,
  slackGateway,
  workspace,
  workspaceRepository,
}: {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly run: (params: { readonly botToken: string }) => Promise<Value>;
  readonly slackGateway: SlackGateway;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<Value> => {
  const botToken = await getSlackBotToken({
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    slackGateway,
    workspace,
    workspaceRepository,
  });

  return run({ botToken }).catch(async (error: unknown): Promise<Value> => {
    if (!isRecoverableSlackAuthError(error)) {
      return rejectUnknownError(error);
    }

    const latestWorkspace = await loadWorkspaceOrThrow({
      workspaceId: workspace.id,
      workspaceRepository,
    });
    const retryToken = await getRetryToken({
      botToken,
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      latestWorkspace,
      slackGateway,
      workspaceRepository,
    });

    return run({ botToken: retryToken });
  });
};
