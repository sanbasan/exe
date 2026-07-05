import type { LiveKitVmGateway } from '#server/ports';
import { GoogleAuth } from 'google-auth-library';

interface LiveKitVmGatewayConfig {
  readonly instanceName: string;
  readonly projectId: string;
  readonly startTimeoutMs?: number;
  readonly statusPollIntervalMs?: number;
  readonly wsUrl: string;
  readonly zone: string;
}

interface ComputeInstanceResponse {
  readonly status?: string;
}

const COMPUTE_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const DEFAULT_START_TIMEOUT_MS = 120_000;
const DEFAULT_STATUS_POLL_INTERVAL_MS = 5_000;
const RUNNING_STATUS = 'RUNNING';
const TERMINATED_STATUS = 'TERMINATED';
const STOPPING_STATUS = 'STOPPING';

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const getInstanceUrl = ({
  instanceName,
  projectId,
  zone,
}: Pick<
  LiveKitVmGatewayConfig,
  'instanceName' | 'projectId' | 'zone'
>): string =>
  `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`;

const toHealthCheckUrl = (wsUrl: string): string => {
  if (wsUrl.startsWith('wss://')) {
    return `https://${wsUrl.slice('wss://'.length)}`;
  }

  if (wsUrl.startsWith('ws://')) {
    return `http://${wsUrl.slice('ws://'.length)}`;
  }

  return wsUrl;
};

const getInstanceStatus = async ({
  auth,
  config,
}: {
  readonly auth: GoogleAuth;
  readonly config: LiveKitVmGatewayConfig;
}): Promise<string | null> => {
  const response = await auth.request<ComputeInstanceResponse>({
    method: 'GET',
    url: getInstanceUrl(config),
  });

  return response.data.status ?? null;
};

const postInstanceAction = async ({
  action,
  auth,
  config,
}: {
  readonly action: 'start' | 'stop';
  readonly auth: GoogleAuth;
  readonly config: LiveKitVmGatewayConfig;
}): Promise<void> => {
  await auth.request({
    method: 'POST',
    url: `${getInstanceUrl(config)}/${action}`,
  });
};

const handleStartError = async ({
  auth,
  config,
  error,
}: {
  readonly auth: GoogleAuth;
  readonly config: LiveKitVmGatewayConfig;
  readonly error: unknown;
}): Promise<void> => {
  const status = await getInstanceStatus({ auth, config });

  if (status !== null && status !== TERMINATED_STATUS) {
    return;
  }

  if (error instanceof Error) {
    throw error;
  }

  throw new Error('Failed to start LiveKit VM.', { cause: error });
};

const startInstance = async ({
  auth,
  config,
}: {
  readonly auth: GoogleAuth;
  readonly config: LiveKitVmGatewayConfig;
}): Promise<void> => {
  await postInstanceAction({ action: 'start', auth, config }).catch(
    (error: unknown) => handleStartError({ auth, config, error })
  );
};

const waitForStatusUntil = async ({
  auth,
  config,
  deadlineMs,
  pollIntervalMs,
  targetStatus,
}: {
  readonly auth: GoogleAuth;
  readonly config: LiveKitVmGatewayConfig;
  readonly deadlineMs: number;
  readonly pollIntervalMs: number;
  readonly targetStatus: string;
}): Promise<void> => {
  const status = await getInstanceStatus({ auth, config });

  if (status === targetStatus) {
    return;
  }

  if (Date.now() > deadlineMs) {
    throw new Error(
      `LiveKit VM ${config.instanceName} did not become ${targetStatus}.`
    );
  }

  await sleep(pollIntervalMs);

  return waitForStatusUntil({
    auth,
    config,
    deadlineMs,
    pollIntervalMs,
    targetStatus,
  });
};

const waitForStatus = async ({
  auth,
  config,
  targetStatus,
}: {
  readonly auth: GoogleAuth;
  readonly config: LiveKitVmGatewayConfig;
  readonly targetStatus: string;
}): Promise<void> => {
  await waitForStatusUntil({
    auth,
    config,
    deadlineMs:
      Date.now() + (config.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS),
    pollIntervalMs:
      config.statusPollIntervalMs ?? DEFAULT_STATUS_POLL_INTERVAL_MS,
    targetStatus,
  });
};

const isEndpointReady = (url: string): Promise<boolean> =>
  fetch(url)
    .then((response) => response.status < 500)
    .catch(() => false);

const waitForHealthCheckUntil = async ({
  deadlineMs,
  pollIntervalMs,
  url,
}: {
  readonly deadlineMs: number;
  readonly pollIntervalMs: number;
  readonly url: string;
}): Promise<void> => {
  if (await isEndpointReady(url)) {
    return;
  }

  if (Date.now() > deadlineMs) {
    throw new Error(`LiveKit endpoint did not become ready: ${url}`);
  }

  await sleep(pollIntervalMs);

  return waitForHealthCheckUntil({
    deadlineMs,
    pollIntervalMs,
    url,
  });
};

const waitForHealthCheck = async ({
  config,
}: {
  readonly config: LiveKitVmGatewayConfig;
}): Promise<void> => {
  await waitForHealthCheckUntil({
    deadlineMs:
      Date.now() + (config.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS),
    pollIntervalMs:
      config.statusPollIntervalMs ?? DEFAULT_STATUS_POLL_INTERVAL_MS,
    url: toHealthCheckUrl(config.wsUrl),
  });
};

export const createNoopLiveKitVmGateway = (): LiveKitVmGateway => ({
  ensureRunning: (): Promise<void> => Promise.resolve(),
  stopIfRunning: (): Promise<void> => Promise.resolve(),
});

export const createGcpLiveKitVmGateway = (
  config: LiveKitVmGatewayConfig
): LiveKitVmGateway => {
  const auth = new GoogleAuth({ scopes: [COMPUTE_SCOPE] });

  return {
    ensureRunning: async (): Promise<void> => {
      const status = await getInstanceStatus({ auth, config });

      if (status === RUNNING_STATUS) {
        await waitForHealthCheck({ config });

        return;
      }

      if (status === TERMINATED_STATUS) {
        await startInstance({ auth, config });
      }

      if (status === STOPPING_STATUS) {
        await waitForStatus({
          auth,
          config,
          targetStatus: TERMINATED_STATUS,
        });
        await startInstance({ auth, config });
      }

      await waitForStatus({ auth, config, targetStatus: RUNNING_STATUS });
      await waitForHealthCheck({ config });
    },
    stopIfRunning: async (): Promise<void> => {
      const status = await getInstanceStatus({ auth, config });

      if (status === RUNNING_STATUS) {
        await postInstanceAction({ action: 'stop', auth, config });
      }
    },
  };
};
