import type { CallWorkflowDeps } from './deps';

const MINUTE_MS = 60_000;

const getCutoff = ({
  graceMinutes,
  now,
}: {
  readonly graceMinutes: number;
  readonly now: string;
}): string => {
  const nowMs = new Date(now).getTime();

  if (Number.isNaN(nowMs)) {
    throw new Error(`Invalid DateTime: ${now}`);
  }

  return new Date(nowMs - graceMinutes * MINUTE_MS).toISOString();
};

export const sleepIdleLiveKitVm = async ({
  deps,
}: {
  readonly deps: CallWorkflowDeps;
}): Promise<void> => {
  if (!deps.liveKitVmAutoStopEnabled) {
    return;
  }

  const createdAfter = getCutoff({
    graceMinutes: deps.liveKitVmIdleGraceMinutes,
    now: deps.clock.now(),
  });
  const busySessions =
    await deps.callSessionRepository.listBusyForLiveKitIdleCheck({
      createdAfter,
    });

  if (busySessions.length > 0) {
    return;
  }

  await deps.liveKitVmGateway.stopIfRunning();
};
