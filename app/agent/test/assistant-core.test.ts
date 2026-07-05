import type { AssistantJobRunner } from '#agent/assistant/jobs';
import {
  executeToolCall,
  toFunctionDeclarations,
  type PlainToolSet,
} from '#agent/assistant/plain-tool';
import { createTranscriptStore } from '#agent/assistant/transcript-store';
import { buildAssistantVoiceTools } from '#agent/assistant/voice-tools';
import type { llm } from '@livekit/agents';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';

type DispatchParams = Parameters<AssistantJobRunner['dispatch']>[0];

const makeJobs = (captured: {
  calls: DispatchParams[];
}): AssistantJobRunner => ({
  dispatch: (params): string => {
    /* eslint-disable-next-line functional/immutable-data -- Test spy. */
    captured.calls.push(params);

    return 'a1';
  },
  list: (): [] => [],
  waitForIdle: (): Promise<void> => Promise.resolve(),
});

/* eslint-disable @typescript-eslint/consistent-type-assertions -- Test fake for the SDK tool options. */
const toolOpts = { ctx: { session: {} } } as unknown as llm.ToolOptions;
/* eslint-enable @typescript-eslint/consistent-type-assertions */

const tools: PlainToolSet = {
  echo_value: {
    description: 'Echo the value back.',
    execute: (args): Promise<string> =>
      Promise.resolve(`echo:${String(args['value'])}`),
    parameters: z.object({ value: z.string().min(1) }).strict(),
  },
  no_args_tool: {
    description: 'Return a constant.',
    execute: (): Promise<string> => Promise.resolve('constant'),
  },
};

void test('toFunctionDeclarations emits JSON schema without $schema key', () => {
  const declarations = toFunctionDeclarations(tools);
  const echo = declarations.find(
    (declaration) => declaration.name === 'echo_value'
  );
  const noArgs = declarations.find(
    (declaration) => declaration.name === 'no_args_tool'
  );

  assert.ok(echo !== undefined);
  assert.ok(echo.parametersJsonSchema !== undefined);
  assert.doesNotMatch(JSON.stringify(echo.parametersJsonSchema), /\$schema/u);
  assert.ok(noArgs !== undefined);
  assert.equal(noArgs.parametersJsonSchema, undefined);
});

void test('executeToolCall runs a known tool with valid args', async () => {
  const result = await executeToolCall({
    args: { value: 'hi' },
    name: 'echo_value',
    tools,
  });

  assert.equal(result, 'echo:hi');
});

void test('executeToolCall reports unknown tools as a model-readable string', async () => {
  const result = await executeToolCall({
    args: {},
    name: 'nonexistent',
    tools,
  });

  assert.match(result, /Unknown tool "nonexistent"/);
});

void test('executeToolCall rejects invalid args with the issue paths', async () => {
  const result = await executeToolCall({
    args: { value: 42 },
    name: 'echo_value',
    tools,
  });

  assert.match(result, /Invalid arguments for "echo_value"/);
  assert.match(result, /value/);
});

void test('executeToolCall converts thrown errors into a failure result', async () => {
  const throwingTools: PlainToolSet = {
    boom: {
      description: 'Always throws.',
      execute: (): Promise<string> => Promise.reject(new Error('boom')),
    },
  };
  const result = await executeToolCall({
    args: {},
    name: 'boom',
    tools: throwingTools,
  });

  assert.match(result, /failed with an internal error/);
});

void test('run_assistant_task forwards a channelId argument to jobs.dispatch', async () => {
  const captured: { calls: DispatchParams[] } = { calls: [] };
  const tools = buildAssistantVoiceTools({ jobs: makeJobs(captured) });

  const result: unknown = await tools['run_assistant_task']?.execute(
    { channelId: 'C1' },
    toolOpts
  );

  const [params] = captured.calls;

  assert.ok(params !== undefined);
  assert.equal(params.channelId, 'C1');
  assert.match(String(result), /Background task a1 started/);
});

void test('run_assistant_task omits channelId when the argument is absent', async () => {
  const captured: { calls: DispatchParams[] } = { calls: [] };
  const tools = buildAssistantVoiceTools({ jobs: makeJobs(captured) });

  await tools['run_assistant_task']?.execute({}, toolOpts);

  const [params] = captured.calls;

  assert.ok(params !== undefined);
  assert.equal(params.channelId, undefined);
  assert.equal('channelId' in params, false);
});

void test('transcript store formats roles and skips empty text', () => {
  const store = createTranscriptStore();

  assert.equal(store.snapshot(), '(no conversation yet)');

  store.append({ role: 'agent', text: 'こんにちは。' });
  store.append({ role: 'user', text: '   ' });
  store.append({ role: 'user', text: 'タスクを更新して。' });

  assert.equal(
    store.snapshot(),
    'Agent: こんにちは。\nUser: タスクを更新して。'
  );
});
