import {
  healDuplicateItemCreate,
  planOrphanedInsertRetry,
} from '#agent/realtime-openai-patch';
import { llm } from '@livekit/agents';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// The healing helpers repair the OpenAI plugin's remote-conversation mirror
// (llm.RemoteChatContext), so the tests exercise them against the real class.

const message = (id: string): llm.ChatMessage =>
  llm.ChatMessage.create({ content: [`content of ${id}`], id, role: 'user' });

const remoteWith = (...ids: readonly string[]): llm.RemoteChatContext => {
  const remote = new llm.RemoteChatContext();

  ids.forEach((id, index) => {
    remote.insert(index === 0 ? undefined : ids.at(index - 1), message(id));
  });

  return remote;
};

const remoteIds = (remote: llm.RemoteChatContext): readonly string[] =>
  remote.toChatCtx().items.map((item) => item.id);

void test('planOrphanedInsertRetry returns null when the item landed in the mirror', () => {
  assert.equal(
    planOrphanedInsertRetry({
      insertedItemId: 'item_a',
      remoteChatCtx: remoteWith('item_a'),
    }),
    null
  );
});

void test('planOrphanedInsertRetry returns null without an item id', () => {
  assert.equal(
    planOrphanedInsertRetry({ remoteChatCtx: remoteWith('item_a') }),
    null
  );
});

void test('planOrphanedInsertRetry retries at the tail when the previous item was unknown', () => {
  assert.deepEqual(
    planOrphanedInsertRetry({
      insertedItemId: 'item_c',
      remoteChatCtx: remoteWith('item_a', 'item_b'),
      requestedPreviousItemId: 'item_missing',
    }),
    { previousItemId: 'item_b' }
  );
});

void test('planOrphanedInsertRetry falls back to a head insert on an empty mirror', () => {
  assert.deepEqual(
    planOrphanedInsertRetry({
      insertedItemId: 'item_c',
      remoteChatCtx: new llm.RemoteChatContext(),
      requestedPreviousItemId: 'item_missing',
    }),
    {}
  );
});

void test('planOrphanedInsertRetry gives up when the failed previous id is already the tail', () => {
  assert.equal(
    planOrphanedInsertRetry({
      insertedItemId: 'item_c',
      remoteChatCtx: remoteWith('item_a', 'item_b'),
      requestedPreviousItemId: 'item_b',
    }),
    null
  );
});

void test('healDuplicateItemCreate rejects an unparseable message', () => {
  const remote = remoteWith('item_a');

  assert.equal(
    healDuplicateItemCreate({
      errorMessage: 'some unrelated error',
      itemCreateFutures: {},
      remoteChatCtx: remote,
      syncedItems: [],
    }),
    false
  );
});

void test('healDuplicateItemCreate resolves and removes the pending create future', () => {
  /* eslint-disable functional/no-let -- Observing the future resolution. */
  let resolved = false;
  /* eslint-enable functional/no-let */
  const futures = {
    item_b: {
      resolve: (): void => {
        resolved = true;
      },
    },
  };

  assert.equal(
    healDuplicateItemCreate({
      errorMessage:
        "Error adding item: an item with id 'item_b' already exists.",
      itemCreateFutures: futures,
      remoteChatCtx: remoteWith('item_a', 'item_b'),
      syncedItems: [],
    }),
    true
  );
  assert.equal(resolved, true);
  assert.equal('item_b' in futures, false);
});

void test('healDuplicateItemCreate adopts the rejected item into the mirror after its nearest known predecessor', () => {
  const remote = remoteWith('item_a');

  assert.equal(
    healDuplicateItemCreate({
      errorMessage:
        "Error adding item: an item with id 'item_b' already exists.",
      itemCreateFutures: {},
      remoteChatCtx: remote,
      syncedItems: [message('item_a'), message('item_b'), message('item_c')],
    }),
    true
  );
  assert.deepEqual(remoteIds(remote), ['item_a', 'item_b']);
});

void test('healDuplicateItemCreate skips unknown intermediate items when picking the predecessor', () => {
  const remote = remoteWith('item_a');

  assert.equal(
    healDuplicateItemCreate({
      errorMessage:
        "Error adding item: an item with id 'item_c' already exists.",
      itemCreateFutures: {},
      remoteChatCtx: remote,
      syncedItems: [message('item_a'), message('item_b'), message('item_c')],
    }),
    true
  );
  assert.deepEqual(remoteIds(remote), ['item_a', 'item_c']);
});

void test('healDuplicateItemCreate inserts at the head when no predecessor is known', () => {
  const remote = remoteWith('item_z');

  assert.equal(
    healDuplicateItemCreate({
      errorMessage:
        "Error adding item: an item with id 'item_a' already exists.",
      itemCreateFutures: {},
      remoteChatCtx: remote,
      syncedItems: [message('item_a')],
    }),
    true
  );
  assert.deepEqual(remoteIds(remote), ['item_a', 'item_z']);
});

void test('healDuplicateItemCreate leaves an already-mirrored item untouched', () => {
  const remote = remoteWith('item_a', 'item_b');

  assert.equal(
    healDuplicateItemCreate({
      errorMessage:
        "Error adding item: an item with id 'item_b' already exists.",
      itemCreateFutures: {},
      remoteChatCtx: remote,
      syncedItems: [message('item_a'), message('item_b')],
    }),
    true
  );
  assert.deepEqual(remoteIds(remote), ['item_a', 'item_b']);
});

void test('healDuplicateItemCreate tolerates an item missing from the last synced view', () => {
  const remote = remoteWith('item_a');

  assert.equal(
    healDuplicateItemCreate({
      errorMessage:
        "Error adding item: an item with id 'item_b' already exists.",
      itemCreateFutures: {},
      remoteChatCtx: remote,
      syncedItems: [message('item_a')],
    }),
    true
  );
  assert.deepEqual(remoteIds(remote), ['item_a']);
});
