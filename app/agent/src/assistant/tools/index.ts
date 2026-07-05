import type { PlainToolSet } from '#agent/assistant/plain-tool';
import { buildAssistantCallScheduleTools } from '#agent/assistant/tools/call-schedule-tools';
import { buildAssistantChannelTools } from '#agent/assistant/tools/channel-tools';
import { buildAssistantDraftTools } from '#agent/assistant/tools/draft-tools';
import { buildAssistantGBrainTools } from '#agent/assistant/tools/gbrain-tools';
import { buildAssistantTaskTools } from '#agent/assistant/tools/task-tools';
import type { CallDataRoom } from '#agent/data-channel';
import type { DraftRegistry } from '#agent/draft-registry';
import type { CallAgenda } from '@exe/domain';
import type { ServerComposition } from '@exe/server';
import { randomUUID } from 'node:crypto';

// Composition root for the assistant agent's tool surface: everything the
// voice agent used to call directly is now executed here, synchronously,
// inside the assistant's own loop.
export const buildAssistantToolSet = ({
  agenda,
  channelId,
  composition,
  registry,
  room,
  sessionId,
  topic,
  workspaceId,
}: {
  readonly agenda: CallAgenda;
  // Channel the triggering conversation is about, when the voice agent passed
  // one — used only to tag streamed GBrain search activity for the app UI.
  readonly channelId?: string;
  readonly composition: ServerComposition;
  readonly registry: DraftRegistry;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
  readonly workspaceId: string;
}): PlainToolSet => ({
  ...buildAssistantCallScheduleTools({
    composition,
    slackUserId: agenda.slackUserId,
    workspaceId,
  }),
  ...buildAssistantChannelTools({
    agenda,
    composition,
    registry,
    room,
    sessionId,
    topic,
    workspaceId,
  }),
  ...buildAssistantDraftTools({
    composition,
    registry,
    room,
    sessionId,
    topic,
    workspaceId,
  }),
  // ─── GBrain integration — purgeable (gbrain/PURGE.md): delete this spread
  // + the `#agent/assistant/tools/gbrain-tools` import, then remove
  // app/agent/src/assistant/tools/gbrain-tools.ts. ───
  ...buildAssistantGBrainTools({
    publishContext: {
      ...(channelId === undefined ? {} : { channelId }),
      lookupId: randomUUID(),
      room,
      sessionId,
      topic,
    },
    workspaceId,
  }),
  ...buildAssistantTaskTools({
    agenda,
    composition,
    registry,
    room,
    sessionId,
    topic,
    workspaceId,
  }),
});
