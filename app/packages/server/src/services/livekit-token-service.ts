import {
  forbiddenError,
  invalidRequestError,
  notFoundError,
} from '#server/errors';
import type {
  CallSessionRepository,
  LiveKitGateway,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { getWorkspaceForUser } from '#server/workspace-access';
import type { CallSession, CallStatus } from '@exe/domain';

export interface LiveKitTokenService {
  readonly createJoinTokenForUser: (params: {
    readonly callSessionId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<{ readonly session: CallSession; readonly token: string }>;
  readonly ensureAgentDispatchedForUser: (params: {
    readonly callSessionId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<{ readonly session: CallSession }>;
}

const canJoinCallSession = (status: CallStatus): boolean =>
  status === 'active' || status === 'created' || status === 'ringing';

export const createLiveKitTokenService = ({
  callSessionRepository,
  liveKitAgentName,
  liveKitGateway,
  userProfileRepository,
  workspaceRepository,
}: {
  readonly callSessionRepository: CallSessionRepository;
  readonly liveKitAgentName: string;
  readonly liveKitGateway: LiveKitGateway;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): LiveKitTokenService => {
  const getJoinableSessionForUser = async ({
    callSessionId,
    userId,
    workspaceId,
  }: {
    readonly callSessionId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<{
    readonly metadata: string;
    readonly session: CallSession;
  }> => {
    const { workspace } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });
    const session = await callSessionRepository.getById({
      callSessionId,
      workspaceId,
    });

    if (session === null) {
      throw notFoundError(`Call session ${callSessionId} was not found.`);
    }

    if (session.userId !== userId) {
      throw forbiddenError('Call session does not belong to the current user.');
    }

    if (!canJoinCallSession(session.status)) {
      throw invalidRequestError('Call session cannot be joined.');
    }

    return {
      metadata: JSON.stringify({
        language: workspace.language,
        purpose: session.purpose,
        sessionId: session.id,
        workspaceId,
      }),
      session,
    };
  };

  return {
    createJoinTokenForUser: async ({
      callSessionId,
      userId,
      workspaceId,
    }): Promise<{ readonly session: CallSession; readonly token: string }> => {
      const { metadata, session } = await getJoinableSessionForUser({
        callSessionId,
        userId,
        workspaceId,
      });

      const token = await liveKitGateway.createParticipantToken({
        agentName: liveKitAgentName,
        identity: `ios:${userId}`,
        metadata,
        roomName: session.liveKitRoomName,
      });

      return { session, token };
    },
    ensureAgentDispatchedForUser: async ({
      callSessionId,
      userId,
      workspaceId,
    }): Promise<{ readonly session: CallSession }> => {
      const { metadata, session } = await getJoinableSessionForUser({
        callSessionId,
        userId,
        workspaceId,
      });

      await liveKitGateway.ensureAgentDispatched({
        agentName: liveKitAgentName,
        metadata,
        roomName: session.liveKitRoomName,
      });

      return { session };
    },
  };
};
