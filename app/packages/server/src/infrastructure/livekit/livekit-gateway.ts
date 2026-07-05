import type { LiveKitGateway, LiveKitVmGateway } from '#server/ports';
import {
  AccessToken,
  AgentDispatchClient,
  type AgentDispatch,
  RoomAgentDispatch,
  RoomConfiguration,
  RoomServiceClient,
} from 'livekit-server-sdk';

interface LiveKitGatewayConfig {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly vmGateway?: LiveKitVmGateway;
  readonly wsUrl: string;
}

const DEFAULT_TOKEN_TTL_SECONDS = 4 * 60 * 60;
const DISPATCH_RETRY_DELAY_MS = 2_000;
const DISPATCH_RETRY_LIMIT = 8;
const ACTIVE_JOB_STATUSES: readonly number[] = [0, 1];

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const toLiveKitApiUrl = (url: string): string => {
  if (url.startsWith('wss://')) {
    return `https://${url.slice('wss://'.length)}`;
  }

  if (url.startsWith('ws://')) {
    return `http://${url.slice('ws://'.length)}`;
  }

  return url;
};

const isMatchingDispatch = ({
  agentName,
  dispatch,
  metadata,
}: {
  readonly agentName: string;
  readonly dispatch: AgentDispatch;
  readonly metadata: string;
}): boolean =>
  dispatch.agentName === agentName && dispatch.metadata === metadata;

const hasActiveJob = (dispatch: AgentDispatch): boolean =>
  dispatch.state?.jobs.some((job) => {
    const status = job.state?.status;

    return typeof status === 'number' && ACTIVE_JOB_STATUSES.includes(status);
  }) ?? false;

const isKnownStaleDispatch = (dispatch: AgentDispatch): boolean => {
  const jobs = dispatch.state?.jobs;

  return jobs !== undefined && !hasActiveJob(dispatch);
};

export const createLiveKitGateway = ({
  apiKey,
  apiSecret,
  vmGateway,
  wsUrl,
}: LiveKitGatewayConfig): LiveKitGateway => {
  const apiUrl = toLiveKitApiUrl(wsUrl);
  const roomClient = new RoomServiceClient(apiUrl, apiKey, apiSecret);
  const agentClient = new AgentDispatchClient(apiUrl, apiKey, apiSecret);

  const ensureAgentDispatchedOnce = async ({
    agentName,
    metadata,
    roomName,
  }: {
    readonly agentName: string;
    readonly metadata: string;
    readonly roomName: string;
  }): Promise<boolean> => {
    const dispatches = await agentClient.listDispatch(roomName);
    const matchingDispatches = dispatches.filter((dispatch) =>
      isMatchingDispatch({ agentName, dispatch, metadata })
    );

    if (matchingDispatches.some(hasActiveJob)) {
      return true;
    }

    await Promise.all(
      matchingDispatches
        .filter(isKnownStaleDispatch)
        .map((dispatch) =>
          agentClient
            .deleteDispatch(dispatch.id, roomName)
            .catch((): null => null)
        )
    );

    const created = await agentClient.createDispatch(roomName, agentName, {
      metadata,
    });

    return hasActiveJob(created);
  };

  const ensureAgentDispatchedWithRetry = async ({
    agentName,
    attempt,
    metadata,
    roomName,
  }: {
    readonly agentName: string;
    readonly attempt: number;
    readonly metadata: string;
    readonly roomName: string;
  }): Promise<void> => {
    if (await ensureAgentDispatchedOnce({ agentName, metadata, roomName })) {
      return;
    }

    if (attempt >= DISPATCH_RETRY_LIMIT) {
      return;
    }

    await sleep(DISPATCH_RETRY_DELAY_MS);

    return ensureAgentDispatchedWithRetry({
      agentName,
      attempt: attempt + 1,
      metadata,
      roomName,
    });
  };

  return {
    createParticipantToken: async ({
      agentName,
      identity,
      metadata,
      roomName,
    }): Promise<string> => {
      await vmGateway?.ensureRunning();

      const token = new AccessToken(apiKey, apiSecret, {
        identity,
        ttl: DEFAULT_TOKEN_TTL_SECONDS,
      });

      token.addGrant({
        canPublish: true,
        canPublishData: true,
        canSubscribe: true,
        room: roomName,
        roomJoin: true,
      });
      // eslint-disable-next-line functional/immutable-data -- AccessToken exposes roomConfig only as an SDK setter.
      token.roomConfig = new RoomConfiguration({
        agents: [
          new RoomAgentDispatch({
            agentName,
            metadata,
          }),
        ],
        metadata,
        name: roomName,
      });

      return token.toJwt();
    },
    deleteRoom: ({ roomName }): Promise<void> =>
      roomClient.deleteRoom(roomName),
    ensureAgentDispatched: async ({
      agentName,
      metadata,
      roomName,
    }): Promise<void> => {
      await vmGateway?.ensureRunning();

      await ensureAgentDispatchedWithRetry({
        agentName,
        attempt: 0,
        metadata,
        roomName,
      });
    },
    warmUpAgentWorker: async (): Promise<void> => {
      await vmGateway?.ensureRunning();
    },
  };
};
