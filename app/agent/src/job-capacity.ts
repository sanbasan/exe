import { agentConfig } from '#agent/config';
import type { JobRequest } from '@livekit/agents';
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const JOB_ID_FILE = 'job-id';
const SLOT_DIR_PREFIX = 'slot-';
const SLOT_ROOT = join(tmpdir(), 'exe-livekit-agent-slots');

interface ErrorWithCode extends Error {
  readonly code?: unknown;
}

const isErrorWithCode = (error: unknown): error is ErrorWithCode =>
  error instanceof Error && 'code' in error;

const ignoreFsError = (): null => null;

const getSlotDirectory = (slotIndex: number): string =>
  join(SLOT_ROOT, `${SLOT_DIR_PREFIX}${String(slotIndex)}`);

const getSlotJobIdPath = (slotDirectory: string): string =>
  join(slotDirectory, JOB_ID_FILE);

const removeSlot = (slotDirectory: string): Promise<void> =>
  rm(slotDirectory, { force: true, recursive: true });

const removeSlotIfStale = async ({
  nowMs,
  slotDirectory,
}: {
  readonly nowMs: number;
  readonly slotDirectory: string;
}): Promise<void> => {
  const stats = await stat(slotDirectory).catch(() => null);

  if (stats === null) {
    return;
  }

  if (nowMs - stats.mtimeMs > agentConfig.worker.jobSlotStaleAfterMs) {
    await removeSlot(slotDirectory).catch(ignoreFsError);
  }
};

const handleSlotAcquireError = async ({
  error,
  slotDirectory,
}: {
  readonly error: unknown;
  readonly slotDirectory: string;
}): Promise<boolean> => {
  if (isErrorWithCode(error) && error.code === 'EEXIST') {
    return false;
  }

  await removeSlot(slotDirectory).catch(ignoreFsError);
  throw error;
};

const tryAcquireSlot = async ({
  jobId,
  slotIndex,
}: {
  readonly jobId: string;
  readonly slotIndex: number;
}): Promise<boolean> => {
  const slotDirectory = getSlotDirectory(slotIndex);

  await removeSlotIfStale({
    nowMs: Date.now(),
    slotDirectory,
  });

  return mkdir(slotDirectory, { recursive: false })
    .then(async (): Promise<boolean> => {
      await writeFile(getSlotJobIdPath(slotDirectory), jobId, {
        encoding: 'utf8',
      });

      return true;
    })
    .catch((error: unknown) =>
      handleSlotAcquireError({ error, slotDirectory })
    );
};

const slotIndexes = (): readonly number[] =>
  Array.from(
    { length: agentConfig.worker.maxConcurrentJobs },
    (_, index) => index
  );

const tryAcquireAnySlot = async ({
  jobId,
  remainingSlotIndexes,
}: {
  readonly jobId: string;
  readonly remainingSlotIndexes: readonly number[];
}): Promise<boolean> => {
  const [slotIndex, ...nextSlotIndexes] = remainingSlotIndexes;

  if (slotIndex === undefined) {
    return false;
  }

  if (await tryAcquireSlot({ jobId, slotIndex })) {
    return true;
  }

  return tryAcquireAnySlot({
    jobId,
    remainingSlotIndexes: nextSlotIndexes,
  });
};

export const acquireAgentJobSlot = async ({
  jobId,
}: {
  readonly jobId: string;
}): Promise<boolean> => {
  await mkdir(SLOT_ROOT, { recursive: true });

  return tryAcquireAnySlot({
    jobId,
    remainingSlotIndexes: slotIndexes(),
  });
};

export const releaseAgentJobSlot = async ({
  jobId,
}: {
  readonly jobId: string;
}): Promise<void> => {
  const entries = await readdir(SLOT_ROOT, {
    withFileTypes: true,
  }).catch(() => []);

  await Promise.all(
    entries
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith(SLOT_DIR_PREFIX)
      )
      .map(async (entry): Promise<void> => {
        const slotDirectory = join(SLOT_ROOT, entry.name);
        const slotJobId = await readFile(getSlotJobIdPath(slotDirectory), {
          encoding: 'utf8',
        }).catch(() => null);

        if (slotJobId === jobId) {
          await removeSlot(slotDirectory).catch(ignoreFsError);
        }
      })
  );
};

export const rejectWhenWorkerIsFull = async (
  request: JobRequest
): Promise<void> => {
  if (!(await acquireAgentJobSlot({ jobId: request.id }))) {
    await request.reject();

    return;
  }

  await request.accept();
};
