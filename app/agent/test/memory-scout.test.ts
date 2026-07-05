import {
  buildMemoryScoutSystemPrompt,
  createMemoryScout,
  formatMemoryContextNote,
  NO_RELEVANT_MEMORY,
} from '#agent/assistant/memory-scout';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const flush = (ms = 10): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const makeSpies = (): {
  injected: string[];
  lookups: { readonly channelId?: string }[];
} => ({ injected: [], lookups: [] });

void test('dispatch runs the lookup and injects the formatted briefing', async () => {
  const { injected, lookups } = makeSpies();
  const scout = createMemoryScout({
    cooldownMs: 60_000,
    injectContext: (note): Promise<void> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      injected.push(note);

      return Promise.resolve();
    },
    runLookup: (params): Promise<string> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      lookups.push(params);

      return Promise.resolve('- 6/15の通話でリニューアル納期を7月末に変更');
    },
    timeoutMs: 5_000,
  });

  assert.equal(scout.dispatch({ channelId: 'C1' }), 'started');
  await flush();

  assert.deepEqual(lookups, [{ channelId: 'C1' }]);
  assert.equal(injected.length, 1);
  assert.match(injected[0] ?? '', /background workspace-memory context/u);
  assert.match(injected[0] ?? '', /リニューアル納期を7月末に変更/u);
  assert.match(injected[0] ?? '', /Do not announce this note/u);
});

void test('a NO_RELEVANT_MEMORY or empty briefing is never injected', async () => {
  const { injected } = makeSpies();
  const scout = createMemoryScout({
    cooldownMs: 1,
    injectContext: (note): Promise<void> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      injected.push(note);

      return Promise.resolve();
    },
    runLookup: (): Promise<string> =>
      Promise.resolve(`  ${NO_RELEVANT_MEMORY}  `),
    timeoutMs: 5_000,
  });

  scout.dispatch({ channelId: 'C1' });
  await flush();

  const emptyScout = createMemoryScout({
    cooldownMs: 1,
    injectContext: (note): Promise<void> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      injected.push(note);

      return Promise.resolve();
    },
    runLookup: (): Promise<string> => Promise.resolve('   '),
    timeoutMs: 5_000,
  });

  emptyScout.dispatch({});
  await flush();

  assert.deepEqual(injected, []);
});

void test('the same scope is deduped within the cooldown; other scopes are not', async () => {
  const { injected, lookups } = makeSpies();
  const scout = createMemoryScout({
    cooldownMs: 60_000,
    injectContext: (note): Promise<void> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      injected.push(note);

      return Promise.resolve();
    },
    runLookup: (params): Promise<string> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      lookups.push(params);

      return Promise.resolve('- fact');
    },
    timeoutMs: 5_000,
  });

  assert.equal(scout.dispatch({ channelId: 'C1' }), 'started');
  assert.equal(scout.dispatch({ channelId: 'C1' }), 'cooldown');
  assert.equal(scout.dispatch({}), 'started');
  assert.equal(scout.dispatch({}), 'cooldown');
  assert.equal(scout.dispatch({ channelId: 'C2' }), 'started');
  await flush();

  assert.equal(lookups.length, 3);
  assert.equal(injected.length, 3);
});

void test('a failing lookup is swallowed and injects nothing', async () => {
  const { injected } = makeSpies();
  const scout = createMemoryScout({
    cooldownMs: 1,
    injectContext: (note): Promise<void> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      injected.push(note);

      return Promise.resolve();
    },
    runLookup: (): Promise<string> => Promise.reject(new Error('boom')),
    timeoutMs: 5_000,
  });

  scout.dispatch({ channelId: 'C1' });
  await flush();

  assert.deepEqual(injected, []);
});

void test('a briefing that arrives after the timeout is dropped', async () => {
  const { injected } = makeSpies();
  const scout = createMemoryScout({
    cooldownMs: 1,
    injectContext: (note): Promise<void> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      injected.push(note);

      return Promise.resolve();
    },
    runLookup: (): Promise<string> =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve('- stale fact');
        }, 40);
      }),
    timeoutMs: 10,
  });

  scout.dispatch({ channelId: 'C1' });
  await flush(80);

  assert.deepEqual(injected, []);
});

void test('formatMemoryContextNote frames the briefing as silent background knowledge', () => {
  const note = formatMemoryContextNote('- fact one');

  assert.ok(
    note.startsWith(
      '[background workspace-memory context — internal note; nobody spoke this]'
    )
  );
  assert.match(note, /- fact one/u);
  assert.match(note, /not\b.*a user message/u);
});

void test('buildMemoryScoutSystemPrompt names the workspace language and the no-result marker', () => {
  const ja = buildMemoryScoutSystemPrompt({
    language: 'ja',
    now: '2026-07-05T01:59:00.000Z',
    timezone: 'Asia/Tokyo',
  });
  const en = buildMemoryScoutSystemPrompt({
    language: 'en',
    now: '2026-07-05T01:59:00.000Z',
    timezone: 'Asia/Tokyo',
  });

  assert.match(ja, /Write in Japanese/u);
  assert.match(en, /Write in English/u);
  assert.match(en, /MUST be written in English/u);
  assert.match(ja, /The current time is 2026-07-05T01:59:00\.000Z/u);
  assert.match(ja, /Asia\/Tokyo/u);
  assert.ok(ja.includes(NO_RELEVANT_MEMORY));
});
