import type { WorkspaceRepository } from '#server/ports';
import { decrypt, encrypt } from '#server/utils';
import type { Workspace } from '@exe/domain';

export const REFRESH_SKEW_MILLISECONDS = 5 * 60 * 1000;
export const LOCK_LEASE_MILLISECONDS = 30 * 1000;
export const LOCK_RETRY_MILLISECONDS = 250;
export const LOCK_TIMEOUT_MILLISECONDS = 10 * 1000;

export const toEncryptionKeyParams = (
  encryptionKey?: string
): {
  readonly encryptionKey?: string;
} => (encryptionKey === undefined ? {} : { encryptionKey });

export const addMilliseconds = ({
  iso,
  milliseconds,
}: {
  readonly iso: string;
  readonly milliseconds: number;
}): string => new Date(Date.parse(iso) + milliseconds).toISOString();

export const decryptBotToken = ({
  encryptionKey,
  workspace,
}: {
  readonly encryptionKey?: string;
  readonly workspace: Workspace;
}): string =>
  decrypt({
    ...toEncryptionKeyParams(encryptionKey),
    text: workspace.encryptedBotToken,
  });

export const encryptToken = ({
  encryptionKey,
  token,
}: {
  readonly encryptionKey?: string;
  readonly token: string;
}): string =>
  encryptionKey === undefined || encryptionKey.length === 0
    ? token
    : encrypt({ encryptionKey, text: token });

export const shouldRefresh = ({
  expiresAt,
  now,
}: {
  readonly expiresAt?: string;
  readonly now: string;
}): boolean =>
  expiresAt !== undefined &&
  Date.parse(expiresAt) - Date.parse(now) <= REFRESH_SKEW_MILLISECONDS;

export const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export const loadWorkspaceOrThrow = async ({
  workspaceId,
  workspaceRepository,
}: {
  readonly workspaceId: string;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<Workspace> => {
  const workspace = await workspaceRepository.getById({ workspaceId });

  if (workspace === null) {
    throw new Error(`Workspace ${workspaceId} was not found.`);
  }

  return workspace;
};
