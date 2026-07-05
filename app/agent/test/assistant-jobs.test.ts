import {
  createAssistantJobRunner,
  type AssistantJobSnapshot,
  type AssistantNudgeSession,
} from '#agent/assistant/jobs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 10);
  });

const makeSession = (received: string[]): AssistantNudgeSession => ({
  generateReply: ({ instructions }): unknown => {
    /* eslint-disable-next-line functional/immutable-data -- Test spy. */
    received.push(instructions);

    return null;
  },
});

void test('dispatch runs the job and nudges the session with the report', async () => {
  const received: string[] = [];
  const runner = createAssistantJobRunner({
    runJob: (): Promise<string> => Promise.resolve('タスクを更新しました'),
    timeoutMs: 5_000,
  });
  const jobId = runner.dispatch({
    session: makeSession(received),
  });

  assert.equal(jobId, 'a1');
  await flush();

  const [job] = runner.list();

  assert.ok(job !== undefined);
  assert.equal(job.status, 'completed');
  assert.equal(job.report, 'タスクを更新しました');
  assert.equal(received.length, 1);
  assert.match(received[0] ?? '', /Background task a1 is done/);
  assert.match(received[0] ?? '', /タスクを更新しました/);
});

void test('dispatch forwards channelId and prior-job snapshots to runJob', async () => {
  const received: string[] = [];
  const seen: {
    params: {
      readonly channelId?: string;
      readonly priorJobs: readonly AssistantJobSnapshot[];
    }[];
  } = { params: [] };
  const runner = createAssistantJobRunner({
    runJob: (params): Promise<string> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      seen.params.push(params);

      return Promise.resolve('レポート');
    },
    timeoutMs: 5_000,
  });

  runner.dispatch({
    channelId: 'C1',
    session: makeSession(received),
  });
  await flush();
  runner.dispatch({
    session: makeSession(received),
  });
  await flush();

  const [withChannel, withoutChannel] = seen.params;

  assert.ok(withChannel !== undefined);
  assert.ok(withoutChannel !== undefined);
  assert.equal(withChannel.channelId, 'C1');
  assert.equal(withChannel.priorJobs.length, 0);
  assert.equal(withoutChannel.channelId, undefined);
  assert.equal('channelId' in withoutChannel, false);
  assert.equal(withoutChannel.priorJobs.length, 1);
  assert.deepEqual(withoutChannel.priorJobs[0], {
    jobId: 'a1',
    report: 'レポート',
    status: 'completed',
  });
});

void test('dispatch marks failed jobs and sends a failure nudge', async () => {
  const received: string[] = [];
  const runner = createAssistantJobRunner({
    runJob: (): Promise<string> => Promise.reject(new Error('boom')),
    timeoutMs: 5_000,
  });

  runner.dispatch({ session: makeSession(received) });
  await flush();

  const [job] = runner.list();

  assert.equal(job?.status, 'failed');
  assert.match(received[0] ?? '', /failed with an internal error/);
});

void test('watchdog fails a hung job, then a late completion updates the status without a second nudge', async () => {
  const received: string[] = [];
  const runner = createAssistantJobRunner({
    runJob: (): Promise<string> =>
      new Promise((resolve) => {
        setTimeout(() => resolve('late'), 50);
      }),
    timeoutMs: 10,
  });

  runner.dispatch({ session: makeSession(received) });
  await new Promise((resolve) => {
    setTimeout(resolve, 30);
  });

  const [timedOut] = runner.list();

  assert.equal(timedOut?.status, 'failed');
  assert.equal(received.length, 1);
  assert.match(received[0] ?? '', /taking too long/);

  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

  const job = runner.list().at(0);

  assert.ok(job !== undefined);
  assert.equal(job.status, 'completed');
  assert.equal(job.report, 'late');
  assert.equal(received.length, 1);
});

void test('waitForIdle resolves once in-flight jobs finish', async () => {
  const received: string[] = [];
  const runner = createAssistantJobRunner({
    runJob: (): Promise<string> =>
      new Promise((resolve) => {
        setTimeout(() => resolve('done'), 30);
      }),
    timeoutMs: 5_000,
  });

  runner.dispatch({ session: makeSession(received) });

  const startedAt = Date.now();

  await runner.waitForIdle({ timeoutMs: 5_000 });

  assert.ok(Date.now() - startedAt >= 25);
  assert.equal(runner.list().at(0)?.status, 'completed');
});

void test('waitForIdle gives up after its timeout when a job hangs', async () => {
  const received: string[] = [];
  const runner = createAssistantJobRunner({
    runJob: (): Promise<string> =>
      new Promise((resolve) => {
        setTimeout(() => resolve('late'), 500);
      }),
    timeoutMs: 5_000,
  });

  runner.dispatch({ session: makeSession(received) });

  const startedAt = Date.now();

  await runner.waitForIdle({ timeoutMs: 40 });

  const elapsed = Date.now() - startedAt;

  assert.ok(elapsed >= 35);
  assert.ok(elapsed < 400);
  assert.equal(runner.list().at(0)?.status, 'running');
});

void test('waitForIdle resolves immediately with no jobs', async () => {
  const runner = createAssistantJobRunner({
    runJob: (): Promise<string> => Promise.resolve('unused'),
    timeoutMs: 5_000,
  });
  const startedAt = Date.now();

  await runner.waitForIdle({ timeoutMs: 5_000 });

  assert.ok(Date.now() - startedAt < 50);
});

void test('multiple dispatches run concurrently with distinct job IDs', async () => {
  const received: string[] = [];
  const runner = createAssistantJobRunner({
    runJob: (): Promise<string> => Promise.resolve('ok'),
    timeoutMs: 5_000,
  });
  const first = runner.dispatch({
    session: makeSession(received),
  });
  const second = runner.dispatch({
    session: makeSession(received),
  });

  assert.notEqual(first, second);
  await flush();
  assert.equal(runner.list().length, 2);
  assert.ok(runner.list().every((job) => job.status === 'completed'));
});

void test('a session closed before settlement is tolerated and the job still records', async () => {
  const runner = createAssistantJobRunner({
    runJob: (): Promise<string> => Promise.resolve('記録しました'),
    timeoutMs: 5_000,
  });
  const closedSession: AssistantNudgeSession = {
    generateReply: (): unknown => {
      throw new Error('AgentSession is not running');
    },
  };

  runner.dispatch({ session: closedSession });
  await flush();

  const [job] = runner.list();

  assert.ok(job !== undefined);
  assert.equal(job.status, 'completed');
  assert.equal(job.report, '記録しました');
});
