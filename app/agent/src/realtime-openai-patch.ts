import { log, type llm } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';

// Upstream bug (@livekit/agents-plugin-openai, still present in 1.5.0): the
// agents core inserts bookkeeping items (`agent_config_update` on start /
// instruction updates / tool updates, `agent_handoff` on handoffs) into the
// agent's chat context, but the OpenAI plugin's livekitItemToOpenAIItem() has
// no case for them and throws "Unsupported item type" on every chat-context
// sync — surfacing as repeated agent_session_error events mid-call. They carry
// no conversational content, so drop them before the sync diff. The Google
// plugin is unaffected (toProviderFormat skips non-message items).
const UNSYNCABLE_ITEM_TYPES: ReadonlySet<string> = new Set([
  'agent_config_update',
  'agent_handoff',
]);

// Upstream fragility (@livekit/agents-plugin-openai): the session mirrors the
// server-side conversation in `remoteChatCtx`, keyed by previous_item_id
// links. If a single `conversation.item.added` is missed or its insert fails
// (previous item unknown), every later insert fails too ("previousItemId not
// found"), and every chat-context sync then re-creates the whole missing tail
// — which the server rejects with item_create_duplicate_item_id, dozens of
// times per sync, for the rest of the call (observed in prod). The two
// healing patches below make the mirror self-repairing.

interface ResolvableFuture {
  readonly resolve: () => void;
}

interface ConversationItemCreatedEvent {
  readonly item?: { readonly id?: string };
  readonly previous_item_id?: string;
}

interface RealtimeErrorEvent {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
  };
}

// Decides whether a just-handled conversation.item.created/added event left
// the remote mirror without the item (its previous_item_id was unknown, so
// the upstream insert threw and was swallowed). Returns the previous-item id
// to retry with — the current tail, i.e. append — or null when no retry is
// needed or possible. A complete, slightly reordered mirror is strictly
// better than a poisoned one: every later insert chains off this item's id.
export const planOrphanedInsertRetry = ({
  insertedItemId,
  remoteChatCtx,
  requestedPreviousItemId,
}: {
  readonly insertedItemId?: string;
  readonly remoteChatCtx: llm.RemoteChatContext;
  readonly requestedPreviousItemId?: string;
}): { readonly previousItemId?: string } | null => {
  if (insertedItemId === undefined) {
    return null;
  }

  if (remoteChatCtx.get(insertedItemId) !== null) {
    return null;
  }

  const tailItemId = remoteChatCtx.toChatCtx().items.at(-1)?.id;

  // Same previous id as the failed attempt — retrying cannot succeed.
  if (tailItemId === requestedPreviousItemId) {
    return null;
  }

  return tailItemId === undefined ? {} : { previousItemId: tailItemId };
};

// Handles an item_create_duplicate_item_id error from the server: the item
// already exists in the server conversation, so the create is effectively a
// success. Resolves the pending create future (otherwise updateChatCtx stalls
// for its 5s timeout) and adopts the item into the remote mirror at its local
// position so the next sync diff stops re-creating it. Returns false when the
// item id cannot be extracted; the caller then falls back to the original
// error path.
export const healDuplicateItemCreate = ({
  errorMessage,
  itemCreateFutures,
  remoteChatCtx,
  syncedItems,
}: {
  readonly errorMessage: string;
  readonly itemCreateFutures: Record<string, ResolvableFuture>;
  readonly remoteChatCtx: llm.RemoteChatContext;
  readonly syncedItems: readonly llm.ChatItem[];
}): boolean => {
  const match = /item with id '([^']+)' already exists/.exec(errorMessage);
  const itemId = match?.[1];

  if (itemId === undefined) {
    return false;
  }

  /* eslint-disable security/detect-object-injection, @typescript-eslint/no-dynamic-delete, functional/immutable-data -- Mirrors upstream's future bookkeeping, which is a plain record keyed by item id. */
  const future = itemCreateFutures[itemId];

  if (future !== undefined) {
    future.resolve();
    delete itemCreateFutures[itemId];
  }
  /* eslint-enable security/detect-object-injection, @typescript-eslint/no-dynamic-delete, functional/immutable-data */

  if (remoteChatCtx.get(itemId) !== null) {
    return true;
  }

  const duplicated = syncedItems.find((item) => item.id === itemId);

  if (duplicated === undefined) {
    return true;
  }

  const previousItemId = syncedItems
    .slice(0, syncedItems.indexOf(duplicated))
    .reverse()
    .find((item) => remoteChatCtx.get(item.id) !== null)?.id;

  remoteChatCtx.insert(previousItemId, duplicated);

  return true;
};

interface PatchableRealtimeSessionMethods {
  createChatCtxUpdateEvents: (
    chatCtx: llm.ChatContext,
    addMockAudio?: boolean
  ) => Promise<unknown>;
  handleConversationItemCreated: (event: ConversationItemCreatedEvent) => void;
  handleError: (event: RealtimeErrorEvent) => void;
}

interface PatchableRealtimeSessionState {
  readonly itemCreateFutures: Record<string, ResolvableFuture>;
  readonly remoteChatCtx: llm.RemoteChatContext;
  exeSyncedItems?: readonly llm.ChatItem[];
}

type PatchableRealtimeSession = PatchableRealtimeSessionMethods &
  PatchableRealtimeSessionState;

/* eslint-disable functional/no-let, functional/immutable-data, @typescript-eslint/consistent-type-assertions -- Monkeypatch: mutating the plugin prototype (and the copied chat context) is the whole point of this upstream-bug workaround; the private methods are reachable only via a type assertion. */
let openaiRealtimePatchApplied = false;

export const patchOpenAIRealtimePlugin = (): void => {
  if (openaiRealtimePatchApplied) {
    return;
  }

  openaiRealtimePatchApplied = true;

  const proto = openai.realtime.RealtimeSession
    .prototype as unknown as PatchableRealtimeSession;
  const originalCreateEvents = proto.createChatCtxUpdateEvents;
  const originalItemCreated = proto.handleConversationItemCreated;
  const originalHandleError = proto.handleError;

  proto.createChatCtxUpdateEvents = function (
    this: PatchableRealtimeSession,
    chatCtx: llm.ChatContext,
    addMockAudio?: boolean
  ): Promise<unknown> {
    const filtered = chatCtx.copy();

    filtered.items = filtered.items.filter(
      (item) => !UNSYNCABLE_ITEM_TYPES.has(item.type)
    );

    // Stash the last synced local view so a duplicate-create error can adopt
    // the rejected item into the remote mirror (healDuplicateItemCreate).
    this.exeSyncedItems = [...filtered.items];

    return originalCreateEvents.call(this, filtered, addMockAudio);
  };

  proto.handleConversationItemCreated = function (
    this: PatchableRealtimeSession,
    event: ConversationItemCreatedEvent
  ): void {
    originalItemCreated.call(this, event);

    const retry = planOrphanedInsertRetry({
      ...(event.item?.id === undefined
        ? {}
        : { insertedItemId: event.item.id }),
      remoteChatCtx: this.remoteChatCtx,
      ...(event.previous_item_id === undefined
        ? {}
        : { requestedPreviousItemId: event.previous_item_id }),
    });

    if (retry === null) {
      return;
    }

    log().warn(
      { itemId: event.item?.id, previousItemId: event.previous_item_id },
      'remote chat item insert failed (unknown previous item); retrying at the tail'
    );

    const retryEvent = { ...event };

    delete retryEvent.previous_item_id;

    if (retry.previousItemId !== undefined) {
      retryEvent.previous_item_id = retry.previousItemId;
    }

    originalItemCreated.call(this, retryEvent);
  };

  proto.handleError = function (
    this: PatchableRealtimeSession,
    event: RealtimeErrorEvent
  ): void {
    if (
      event.error?.code === 'item_create_duplicate_item_id' &&
      healDuplicateItemCreate({
        errorMessage: event.error.message ?? '',
        itemCreateFutures: this.itemCreateFutures,
        remoteChatCtx: this.remoteChatCtx,
        syncedItems: this.exeSyncedItems ?? [],
      })
    ) {
      // The item already exists server-side: the create is a success, not an
      // error. Suppressing the original handler keeps updateChatCtx from
      // stalling and keeps Sentry quiet.
      log().warn(
        { error: event.error },
        'duplicate item create treated as success (item already in server conversation)'
      );

      return;
    }

    originalHandleError.call(this, event);
  };
};
/* eslint-enable functional/no-let, functional/immutable-data, @typescript-eslint/consistent-type-assertions */
