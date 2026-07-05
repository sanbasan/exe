import {
  buildScoutFindingsTool,
  sanitizeFindingsBullet,
} from '#agent/assistant/tools/gbrain-findings-tool';
import { buildAssistantGBrainTools } from '#agent/assistant/tools/gbrain-tools';
import type { CallDataRoom } from '#agent/data-channel';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

// End-to-end (minus the network) coverage of the in-call search streaming:
// each search_workspace_memory execution must publish a gbrain_search_started
// and a matching gbrain_search_completed message on the call data channel.

/* eslint-disable no-process-env, functional/immutable-data -- The GBrain config boundary is env-based by design; tests set and restore it around each case. */
const savedEnv = {
  token: process.env['GBRAIN_INGEST_TOKEN'],
  url: process.env['GBRAIN_INGEST_URL'],
};
const savedFetch = globalThis.fetch;

beforeEach(() => {
  process.env['GBRAIN_INGEST_URL'] = 'https://gbrain.test/ingest';
  process.env['GBRAIN_INGEST_TOKEN'] = 'token';
});

afterEach(() => {
  if (savedEnv.url === undefined) {
    delete process.env['GBRAIN_INGEST_URL'];
  } else {
    process.env['GBRAIN_INGEST_URL'] = savedEnv.url;
  }

  if (savedEnv.token === undefined) {
    delete process.env['GBRAIN_INGEST_TOKEN'];
  } else {
    process.env['GBRAIN_INGEST_TOKEN'] = savedEnv.token;
  }

  globalThis.fetch = savedFetch;
});
/* eslint-enable no-process-env, functional/immutable-data */

interface PublishedMessage {
  readonly findings?: {
    readonly bullets: readonly string[];
    readonly channelId?: string;
    readonly lookupId: string;
  };
  readonly search?: {
    readonly channelId?: string;
    readonly id: string;
    readonly lookupId?: string;
    readonly query: string;
    readonly results?: readonly {
      readonly slug: string;
      readonly snippet?: string;
    }[];
    readonly status?: string;
  };
  readonly type: string;
}

/* eslint-disable @typescript-eslint/consistent-type-assertions -- Minimal LocalParticipant stand-in (and its JSON wire payloads) can only be typed via assertions. */
const makeRoom = (
  captured: { message: PublishedMessage; topic?: string }[]
): CallDataRoom => ({
  localParticipant: {
    publishData: (
      payload: Uint8Array,
      options: { readonly topic?: string }
    ): Promise<void> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      captured.push({
        message: JSON.parse(
          new TextDecoder().decode(payload)
        ) as PublishedMessage,
        ...(options.topic === undefined ? {} : { topic: options.topic }),
      });

      return Promise.resolve();
    },
  } as unknown as CallDataRoom['localParticipant'],
});
/* eslint-enable @typescript-eslint/consistent-type-assertions */

const setFetchResponse = (response: Response): void => {
  /* eslint-disable-next-line functional/immutable-data -- Test fetch stub. */
  globalThis.fetch = (): Promise<Response> => Promise.resolve(response);
};

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 10);
  });

const searchOf = (entry: {
  readonly message: PublishedMessage;
}): NonNullable<PublishedMessage['search']> => {
  const search = entry.message.search;

  assert.ok(search !== undefined);

  return search;
};

void test('a successful search publishes started and completed messages', async () => {
  const captured: { message: PublishedMessage; topic?: string }[] = [];

  setFetchResponse(
    new Response(
      JSON.stringify({
        results: [
          { chunk_text: `x${'y'.repeat(400)}`, slug: 'meetings/one' },
          { slug: 'meetings/two' },
        ],
      })
    )
  );

  const tools = buildAssistantGBrainTools({
    publishContext: {
      channelId: 'C1',
      lookupId: 'L1',
      room: makeRoom(captured),
      sessionId: 'cs1',
      topic: 'exe.call',
    },
    workspaceId: 'T1',
  });
  const search = tools['search_workspace_memory'];

  assert.ok(search !== undefined);

  const report = await search.execute({ query: 'ABCプロジェクト 決定事項' });

  await flush();
  assert.match(report, /meetings\/one/u);
  assert.equal(captured.length, 2);

  const started = captured.at(0);
  const completed = captured.at(1);

  assert.ok(started !== undefined && completed !== undefined);
  assert.equal(started.topic, 'exe.call');
  assert.equal(started.message.type, 'gbrain_search_started');
  assert.equal(searchOf(started).query, 'ABCプロジェクト 決定事項');
  assert.equal(searchOf(started).channelId, 'C1');
  assert.equal(searchOf(started).lookupId, 'L1');
  assert.equal(completed.message.type, 'gbrain_search_completed');
  assert.equal(searchOf(completed).id, searchOf(started).id);
  assert.equal(searchOf(completed).lookupId, 'L1');
  assert.equal(searchOf(completed).status, 'ok');

  const results = searchOf(completed).results ?? [];
  const first = results.at(0);
  const second = results.at(1);

  assert.equal(results.length, 2);
  assert.ok(first !== undefined && second !== undefined);
  // Published snippets are shortened for the UI (300 chars + ellipsis).
  assert.equal(first.snippet?.length, 301);
  assert.equal(second.snippet, undefined);
});

void test('a failed search publishes a completed message with status error and rethrows', async () => {
  const captured: { message: PublishedMessage; topic?: string }[] = [];

  setFetchResponse(new Response('boom', { status: 500 }));

  const tools = buildAssistantGBrainTools({
    publishContext: {
      lookupId: 'L1',
      room: makeRoom(captured),
      sessionId: 'cs1',
      topic: 'exe.call',
    },
    workspaceId: 'T1',
  });
  const search = tools['search_workspace_memory'];

  assert.ok(search !== undefined);
  await assert.rejects(search.execute({ query: 'q' }));
  await flush();

  assert.equal(captured.length, 2);

  const completed = captured.at(1);

  assert.ok(completed !== undefined);
  assert.equal(completed.message.type, 'gbrain_search_completed');
  assert.equal(searchOf(completed).status, 'error');
  assert.deepEqual(searchOf(completed).results, []);
  assert.equal(searchOf(completed).channelId, undefined);
});

void test('report_findings_to_user publishes sanitized plain-text bullets for the lookup', async () => {
  const captured: { message: PublishedMessage; topic?: string }[] = [];
  const tools = buildScoutFindingsTool({
    language: 'en',
    publishContext: {
      channelId: 'C1',
      lookupId: 'L1',
      room: makeRoom(captured),
      sessionId: 'cs1',
      topic: 'exe.call',
    },
    workspaceId: 'T1',
  });
  const report = tools['report_findings_to_user'];

  assert.ok(report !== undefined);

  const result = await report.execute({
    bullets: [
      '- **6/15の通話**で納期を7月末に変更',
      '  `デザイン確認` は次回定例で実施  ',
    ],
  });

  await flush();
  assert.match(result, /visible on the user call screen/u);
  assert.equal(captured.length, 1);

  const published = captured.at(0);

  assert.ok(published !== undefined);
  assert.equal(published.message.type, 'gbrain_lookup_findings');

  const findings = published.message.findings;

  assert.ok(findings !== undefined);
  assert.equal(findings.lookupId, 'L1');
  assert.equal(findings.channelId, 'C1');
  assert.deepEqual(findings.bullets, [
    '6/15の通話で納期を7月末に変更',
    'デザイン確認 は次回定例で実施',
  ]);
});

void test('report_findings_to_user publishes nothing when every bullet is empty after sanitizing', async () => {
  const captured: { message: PublishedMessage; topic?: string }[] = [];
  const tools = buildScoutFindingsTool({
    language: 'en',
    publishContext: {
      lookupId: 'L1',
      room: makeRoom(captured),
      sessionId: 'cs1',
      topic: 'exe.call',
    },
    workspaceId: 'T1',
  });
  const report = tools['report_findings_to_user'];

  assert.ok(report !== undefined);

  const result = await report.execute({ bullets: ['- ', '**'] });

  await flush();
  assert.match(result, /Nothing was shown/u);
  assert.equal(captured.length, 0);
});

void test('sanitizeFindingsBullet strips markdown noise and truncates', () => {
  assert.equal(
    sanitizeFindingsBullet('• **決定**: `7月末` に変更\nしました'),
    '決定: 7月末 に変更 しました'
  );

  const long = sanitizeFindingsBullet('あ'.repeat(200));

  assert.equal(long.length, 161);
  assert.ok(long.endsWith('…'));
});

void test('without a publish context the search still works and publishes nothing', async () => {
  setFetchResponse(
    new Response(JSON.stringify({ results: [{ slug: 'meetings/one' }] }))
  );

  const tools = buildAssistantGBrainTools({ workspaceId: 'T1' });
  const search = tools['search_workspace_memory'];

  assert.ok(search !== undefined);

  const report = await search.execute({ query: 'q' });

  assert.match(report, /meetings\/one/u);
});
