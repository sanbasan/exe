import { forbiddenError, notFoundError } from '#server/errors';
import type {
  CallSessionRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { getWorkspaceForUser } from '#server/workspace-access';
import type { CallSession, CallStatus } from '@exe/domain';

export const buildLiveKitRoomName = ({
  prefix,
  sessionId,
}: {
  readonly prefix: string;
  readonly sessionId: string;
}): string => `${prefix}${sessionId}`;

export const getEndedAtPatch = ({
  now,
  session,
  status,
}: {
  readonly now: string;
  readonly session: CallSession;
  readonly status: CallStatus;
}): { readonly endedAt?: string } =>
  status === 'ended' ||
  status === 'failed' ||
  status === 'missed' ||
  status === 'skipped'
    ? { endedAt: session.endedAt ?? now }
    : {};

export const getCallSessionOrThrow = async ({
  callSessionId,
  callSessionRepository,
  workspaceId,
}: {
  readonly callSessionId: string;
  readonly callSessionRepository: CallSessionRepository;
  readonly workspaceId: string;
}): Promise<CallSession> => {
  const session = await callSessionRepository.getById({
    callSessionId,
    workspaceId,
  });

  if (session === null) {
    throw notFoundError(`Call session ${callSessionId} was not found.`);
  }

  return session;
};

export const getCallSessionForUserOrThrow = async ({
  callSessionId,
  callSessionRepository,
  userId,
  userProfileRepository,
  workspaceId,
  workspaceRepository,
}: {
  readonly callSessionId: string;
  readonly callSessionRepository: CallSessionRepository;
  readonly userId: string;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceId: string;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<CallSession> => {
  await getWorkspaceForUser({
    userId,
    userProfileRepository,
    workspaceId,
    workspaceRepository,
  });

  const session = await getCallSessionOrThrow({
    callSessionId,
    callSessionRepository,
    workspaceId,
  });

  if (session.userId !== userId) {
    throw forbiddenError('Call session does not belong to the current user.');
  }

  return session;
};
