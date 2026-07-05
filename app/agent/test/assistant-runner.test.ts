import type { PlainToolSet } from '#agent/assistant/plain-tool';
import {
  buildAssistantUserMessage,
  runAssistantAgent,
  type GenerateContentFn,
} from '#agent/assistant/runner';
import type { Content, GenerateContentResponse } from '@google/genai';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';

/* eslint-disable @typescript-eslint/consistent-type-assertions -- Test fake for the SDK response class. */
const fakeResponse = (content: Content): GenerateContentResponse =>
  ({ candidates: [{ content }] }) as unknown as GenerateContentResponse;
/* eslint-enable @typescript-eslint/consistent-type-assertions */

const textResponse = (text: string): GenerateContentResponse =>
  fakeResponse({ parts: [{ text }], role: 'model' });

const callResponse = (
  name: string,
  args: Record<string, unknown>
): GenerateContentResponse =>
  fakeResponse({ parts: [{ functionCall: { args, name } }], role: 'model' });

const makeGenerate = (
  responses: readonly GenerateContentResponse[],
  seen: { requests: Parameters<GenerateContentFn>[0][] }
): GenerateContentFn =>
  ((params): Promise<GenerateContentResponse> => {
    /* eslint-disable-next-line functional/immutable-data -- Test spy. */
    seen.requests.push(params);

    const next = responses[seen.requests.length - 1];

    if (next === undefined) {
      return Promise.reject(new Error('No scripted response left.'));
    }

    return Promise.resolve(next);
  }) satisfies GenerateContentFn;

const recordingTools = (calls: {
  received: Record<string, unknown>[];
}): PlainToolSet => ({
  record_value: {
    description: 'Record a value.',
    execute: (args): Promise<string> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      calls.received.push(args);

      return Promise.resolve('recorded');
    },
    parameters: z.object({ value: z.string() }).strict(),
  },
});

void test('runner executes tool calls then returns the final text report', async () => {
  const seen: { requests: Parameters<GenerateContentFn>[0][] } = {
    requests: [],
  };
  const calls: { received: Record<string, unknown>[] } = { received: [] };
  const report = await runAssistantAgent({
    generate: makeGenerate(
      [
        callResponse('record_value', { value: 'x' }),
        textResponse('記録しました。'),
      ],
      seen
    ),
    maxSteps: 4,
    model: 'test-model',
    systemPrompt: 'system',
    tools: recordingTools(calls),
    transcript: 'User: x を記録して。',
  });

  assert.equal(report, '記録しました。');
  assert.deepEqual(calls.received, [{ value: 'x' }]);
  assert.equal(seen.requests.length, 2);

  const secondTurnContents = seen.requests[1]?.contents;

  assert.ok(Array.isArray(secondTurnContents));
  assert.equal(secondTurnContents.length, 3);
});

void test('runner includes the transcript and the trigger section in the first user message', () => {
  const message = buildAssistantUserMessage({
    transcript: 'User: こんにちは',
  });

  assert.match(message, /Conversation transcript so far/);
  assert.match(message, /User: こんにちは/);
  assert.match(message, /## Your trigger/);
  assert.match(
    message,
    /The voice agent triggered you at this point in the call, with NO written instruction/
  );
  assert.doesNotMatch(message, /## Target channel/);
  assert.doesNotMatch(message, /## Earlier background tasks/);
});

void test('runner inserts a target-channel section between transcript and trigger', () => {
  const message = buildAssistantUserMessage({
    targetChannel: '#proj (channel ID: C1)',
    transcript: 'User: こんにちは',
  });

  assert.match(
    message,
    /Conversation transcript so far[\s\S]*## Target channel\n#proj \(channel ID: C1\)[\s\S]*## Your trigger/
  );
});

void test('runner lists earlier background tasks when priorTasks are given', () => {
  const message = buildAssistantUserMessage({
    priorTasks: [{ jobId: 'a1', report: 'レポート', status: 'completed' }],
    transcript: 'User: こんにちは',
  });

  assert.match(message, /## Earlier background tasks in this call/);
  assert.match(message, /a1 \(completed\): レポート/);
});

void test('runner forces a tool-free wrap-up when the step budget runs out', async () => {
  const seen: { requests: Parameters<GenerateContentFn>[0][] } = {
    requests: [],
  };
  const calls: { received: Record<string, unknown>[] } = { received: [] };
  const report = await runAssistantAgent({
    generate: makeGenerate(
      [
        callResponse('record_value', { value: '1' }),
        callResponse('record_value', { value: '2' }),
        textResponse('打ち切りレポート'),
      ],
      seen
    ),
    maxSteps: 2,
    model: 'test-model',
    systemPrompt: 'system',
    tools: recordingTools(calls),
    transcript: '(no conversation yet)',
  });

  assert.equal(report, '打ち切りレポート');
  assert.equal(calls.received.length, 2);

  const finalRequest = seen.requests[2];

  assert.ok(finalRequest !== undefined);
  assert.equal(finalRequest.toolConfig?.functionCallingConfig?.mode, 'NONE');
});

void test('runner returns a fallback report when the model produces no text', async () => {
  const seen: { requests: Parameters<GenerateContentFn>[0][] } = {
    requests: [],
  };
  const report = await runAssistantAgent({
    generate: makeGenerate([fakeResponse({ parts: [], role: 'model' })], seen),
    maxSteps: 2,
    model: 'test-model',
    systemPrompt: 'system',
    tools: {},
    transcript: '(no conversation yet)',
  });

  assert.match(report, /finished without producing a report/);
});
