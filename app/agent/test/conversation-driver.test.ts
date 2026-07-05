import {
  buildConversationControlTools,
  createConversationHoldState,
  installConversationDriver,
  type ConversationDriverSession,
} from '#agent/conversation-driver';
import { llm, voice } from '@livekit/agents';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

interface RecordedReply {
  readonly instructions?: string;
}

// Test double for the AgentSession surface the driver touches: events,
// agentState, and generateReply.
const createFakeSession = (): {
  readonly emit: (event: string, payload: Record<string, unknown>) => void;
  readonly replies: readonly RecordedReply[];
  readonly session: ConversationDriverSession;
  readonly setAgentState: (state: string) => void;
} => {
  /* eslint-disable functional/no-let, functional/immutable-data -- Test double captures calls by mutation. */
  const emitter = new EventEmitter();
  const replies: RecordedReply[] = [];
  let agentState = 'listening';
  const fakeSession = {
    get agentState(): string {
      return agentState;
    },
    generateReply: (options: RecordedReply): Record<string, never> => {
      replies.push(options);

      return {};
    },
    on: (event: string, listener: (payload: unknown) => void): EventEmitter =>
      emitter.on(event, listener),
  };
  const setAgentState = (state: string): void => {
    agentState = state;
  };
  /* eslint-enable functional/no-let, functional/immutable-data */

  return {
    emit: (event, payload): void => {
      emitter.emit(event, payload);
    },
    replies,
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- The driver only touches agentState, generateReply, and on, which this double provides. */
    session: fakeSession as unknown as ConversationDriverSession,
    setAgentState,
  };
};

const installDriverForTest = (): {
  readonly hold: ReturnType<typeof createConversationHoldState>;
  readonly fake: ReturnType<typeof createFakeSession>;
} => {
  const fake = createFakeSession();
  const hold = createConversationHoldState();

  installConversationDriver({ hold, session: fake.session });

  return { fake, hold };
};

void test('forces a reply when the agent stays silent after a tool call', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const { fake } = installDriverForTest();

  fake.emit(voice.AgentSessionEventTypes.FunctionToolsExecuted, {});
  assert.equal(fake.replies.length, 0);

  t.mock.timers.tick(2_000);
  assert.equal(fake.replies.length, 1);
  assert.match(fake.replies[0]?.instructions ?? '', /tool call has completed/u);
});

void test('does not force a tool reply when speech starts in time', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const { fake } = installDriverForTest();

  fake.emit(voice.AgentSessionEventTypes.FunctionToolsExecuted, {});
  fake.emit(voice.AgentSessionEventTypes.SpeechCreated, {});
  t.mock.timers.tick(5_000);

  assert.equal(fake.replies.length, 0);
});

void test('does not force a tool reply while the agent is already speaking', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const { fake } = installDriverForTest();

  fake.emit(voice.AgentSessionEventTypes.FunctionToolsExecuted, {});
  fake.setAgentState('speaking');
  t.mock.timers.tick(5_000);

  assert.equal(fake.replies.length, 0);
});

void test('nudges the model when the user goes away', () => {
  const { fake } = installDriverForTest();

  fake.emit(voice.AgentSessionEventTypes.UserStateChanged, {
    newState: 'away',
    oldState: 'listening',
  });

  assert.equal(fake.replies.length, 1);
  assert.match(fake.replies[0]?.instructions ?? '', /silent for a while/u);
});

void test('suppresses the away nudge while waiting mode is on, and resumes after the user speaks', () => {
  const { fake, hold } = installDriverForTest();

  hold.hold();
  fake.emit(voice.AgentSessionEventTypes.UserStateChanged, {
    newState: 'away',
    oldState: 'listening',
  });
  assert.equal(fake.replies.length, 0);

  fake.emit(voice.AgentSessionEventTypes.UserStateChanged, {
    newState: 'speaking',
    oldState: 'away',
  });
  assert.equal(hold.isHolding(), false);

  fake.emit(voice.AgentSessionEventTypes.UserStateChanged, {
    newState: 'away',
    oldState: 'listening',
  });
  assert.equal(fake.replies.length, 1);
});

void test('wait_for_user tool turns waiting mode on', async () => {
  const hold = createConversationHoldState();
  const tools = buildConversationControlTools({ hold });
  const waitForUser = tools['wait_for_user'];

  if (!llm.isFunctionTool(waitForUser)) {
    assert.fail('Expected wait_for_user to be a function tool.');
  }

  const result: unknown = await Reflect.apply(waitForUser.execute, undefined, [
    {},
    undefined,
  ]);

  assert.equal(hold.isHolding(), true);
  assert.match(String(result), /Waiting mode is ON/u);
});
