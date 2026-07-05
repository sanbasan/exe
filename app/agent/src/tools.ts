import type { AssistantJobRunner } from '#agent/assistant/jobs';
import type { MemoryScout } from '#agent/assistant/memory-scout';
import {
  buildAssistantVoiceTools,
  buildMemoryScoutVoiceTools,
} from '#agent/assistant/voice-tools';
import {
  buildConversationControlTools,
  type ConversationHoldState,
} from '#agent/conversation-driver';
import type { llm } from '@livekit/agents';

// The realtime voice model gets only trivial, instantly-returning tools:
// conversation control plus dispatch/status for the background assistant.
// All real work (task drafts, channel updates, GBrain lookups, schedule
// changes) runs inside assistant jobs — see #agent/assistant. The memory
// scout trigger is present only when GBrain is configured for this worker.
export const buildAgentTools = (params: {
  readonly hold: ConversationHoldState;
  readonly jobs: AssistantJobRunner;
  readonly scout?: MemoryScout;
}): llm.ToolContext => ({
  ...buildAssistantVoiceTools({ jobs: params.jobs }),
  ...(params.scout === undefined
    ? {}
    : buildMemoryScoutVoiceTools({ scout: params.scout })),
  ...buildConversationControlTools({ hold: params.hold }),
});
