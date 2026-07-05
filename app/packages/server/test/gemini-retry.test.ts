import { runWithModelFallback } from '../src/infrastructure/gemini/retry';
import assert from 'node:assert/strict';
import { test } from 'node:test';

class TransientError extends Error {}

const isTransient = (error: unknown): boolean =>
  error instanceof TransientError;

const noSleep = (): Promise<void> => Promise.resolve();

test('returns the result on first success without retrying', async () => {
  const calls: string[] = [];

  const result = await runWithModelFallback({
    isTransient,
    models: ['primary', 'fallback'],
    run: (model) => {
      calls.push(model);

      return Promise.resolve('ok');
    },
    sleep: noSleep,
  });

  assert.equal(result, 'ok');
  assert.deepEqual(calls, ['primary']);
});

test('retries transient errors on the primary model with backoff', async () => {
  const calls: string[] = [];
  const delays: number[] = [];
  let failures = 0;

  const result = await runWithModelFallback({
    isTransient,
    models: ['primary', 'fallback'],
    run: (model) => {
      calls.push(model);

      if (failures < 2) {
        failures += 1;

        return Promise.reject(new TransientError('busy'));
      }

      return Promise.resolve('ok');
    },
    sleep: (ms) => {
      delays.push(ms);

      return Promise.resolve();
    },
  });

  assert.equal(result, 'ok');
  assert.deepEqual(calls, ['primary', 'primary', 'primary']);
  assert.equal(delays.length, 2);
  assert.ok(delays[0] !== undefined && delays[0] >= 1000);
  assert.ok(delays[1] !== undefined && delays[1] >= 2000);
});

test('rethrows non-transient errors immediately without fallback', async () => {
  const calls: string[] = [];

  await assert.rejects(
    runWithModelFallback({
      isTransient,
      models: ['primary', 'fallback'],
      run: (model) => {
        calls.push(model);

        return Promise.reject(new Error('bad request'));
      },
      sleep: noSleep,
    }),
    { message: 'bad request' }
  );

  assert.deepEqual(calls, ['primary']);
});

test('falls back to the secondary model after exhausting retries', async () => {
  const calls: string[] = [];
  const fallbacksUsed: string[] = [];

  const result = await runWithModelFallback({
    isTransient,
    models: ['primary', 'fallback'],
    onFallback: (model) => {
      fallbacksUsed.push(model);
    },
    run: (model) => {
      calls.push(model);

      return model === 'primary'
        ? Promise.reject(new TransientError('busy'))
        : Promise.resolve('ok from fallback');
    },
    sleep: noSleep,
  });

  assert.equal(result, 'ok from fallback');
  assert.deepEqual(calls, ['primary', 'primary', 'primary', 'fallback']);
  assert.deepEqual(fallbacksUsed, ['fallback']);
});

test('rejects with the fallback error when every attempt fails', async () => {
  const calls: string[] = [];

  await assert.rejects(
    runWithModelFallback({
      isTransient,
      models: ['primary', 'fallback'],
      run: (model) => {
        calls.push(model);

        return Promise.reject(new TransientError(`busy: ${model}`));
      },
      sleep: noSleep,
    }),
    { message: 'busy: fallback' }
  );

  assert.deepEqual(calls, ['primary', 'primary', 'primary', 'fallback']);
});

test('skips the fallback when it matches the primary model', async () => {
  const calls: string[] = [];

  await assert.rejects(
    runWithModelFallback({
      isTransient,
      models: ['primary', 'primary'],
      run: (model) => {
        calls.push(model);

        return Promise.reject(new TransientError('busy'));
      },
      sleep: noSleep,
    }),
    { message: 'busy' }
  );

  assert.deepEqual(calls, ['primary', 'primary', 'primary']);
});
