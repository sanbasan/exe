import { isAgentSessionNotRunningError } from '#agent/agent-session-errors';
import { reportServerError } from '@exe/server';
import { llm, voice } from '@livekit/agents';
import { z } from 'zod';

// Gemini Live declares autoToolReplyGeneration, so after a tool call the
// framework only forwards the tool result and trusts the model to keep
// talking — which it frequently does not, leaving the call waiting on the
// user. This driver enforces conversation initiative at the session level:
// it forces a reply when the model stays silent after a tool call, nudges
// the model when the user has been silent for a while, and exposes a
// waiting mode ("ちょっと待って") that suspends those nudges until the user
// speaks again.

const TOOL_REPLY_FALLBACK_DELAY_MS = 2_000;

// Seconds of mutual silence before AgentSession flips the user state to
// "away" (passed as the session's userAwayTimeout).
export const USER_AWAY_TIMEOUT_SECONDS = 5;

const TOOL_REPLY_FALLBACK_INSTRUCTIONS =
  '[system] A tool call has completed and its result is available in the conversation, but you have not spoken since. Keep the initiative: immediately continue out loud — a short natural acknowledgement if one is warranted (never system-status narration), then the next concrete question. Do not wait for the user to speak first, and do not mention this notice.';

const USER_SILENT_INSTRUCTIONS =
  '[system] The user has been silent for a while and you are not waiting on anything. Gently take the lead in the conversation language: re-ask the pending question in a shorter form, or briefly recap and move to the next agenda item. Keep it short and natural. Do not mention this notice or the silence.';

export interface ConversationHoldState {
  readonly hold: () => void;
  readonly isHolding: () => boolean;
  readonly release: () => void;
}

export const createConversationHoldState = (): ConversationHoldState => {
  /* eslint-disable functional/no-let -- Session-local waiting-mode flag by design. */
  let holding = false;

  return {
    hold: (): void => {
      holding = true;
    },
    isHolding: (): boolean => holding,
    release: (): void => {
      holding = false;
    },
  };
  /* eslint-enable functional/no-let */
};

export type ConversationDriverSession = Pick<
  voice.AgentSession,
  'agentState' | 'generateReply' | 'on'
>;

export const installConversationDriver = ({
  hold,
  session,
}: {
  readonly hold: ConversationHoldState;
  readonly session: ConversationDriverSession;
}): void => {
  /* eslint-disable functional/no-let -- Session-local watchdog timer by design. */
  let toolReplyTimer: ReturnType<typeof setTimeout> | null = null;
  /* eslint-enable functional/no-let */

  const nudge = (instructions: string): void => {
    /* eslint-disable-next-line functional/no-try-statements -- The call may have ended while the timer was pending; a closed session must not crash the worker. */
    try {
      session.generateReply({
        allowInterruptions: true,
        instructions,
        toolChoice: 'none',
      });
    } catch (error: unknown) {
      // A nudge timer firing after the user hung up is a normal race; only
      // report real failures.
      if (isAgentSessionNotRunningError(error)) {
        return;
      }

      void reportServerError({
        context: { route: 'agent/conversation-driver' },
        error,
      });
    }
  };

  const cancelToolReplyFallback = (): void => {
    if (toolReplyTimer !== null) {
      clearTimeout(toolReplyTimer);
      toolReplyTimer = null;
    }
  };

  const armToolReplyFallback = (): void => {
    cancelToolReplyFallback();
    toolReplyTimer = setTimeout(() => {
      toolReplyTimer = null;

      if (session.agentState === 'speaking') {
        return;
      }

      nudge(TOOL_REPLY_FALLBACK_INSTRUCTIONS);
    }, TOOL_REPLY_FALLBACK_DELAY_MS);
  };

  session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, () => {
    armToolReplyFallback();
  });
  // Any new speech (the model's own tool reply, an assistant-job notice, or a
  // user-initiated reply) means the conversation is moving again.
  session.on(voice.AgentSessionEventTypes.SpeechCreated, () => {
    cancelToolReplyFallback();
  });
  session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
    if (event.newState === 'speaking') {
      hold.release();
      cancelToolReplyFallback();

      return;
    }

    if (event.newState === 'away' && !hold.isHolding()) {
      nudge(USER_SILENT_INSTRUCTIONS);
    }
  });
};

export const buildConversationControlTools = ({
  hold,
}: {
  readonly hold: ConversationHoldState;
}): llm.ToolContext => ({
  wait_for_user: llm.tool({
    description:
      'Call this immediately when the user asks you to wait or needs time to think or check something (e.g. "ちょっと待って", "考えさせて", "確認するから待ってて", "hold on", "give me a second"). While waiting mode is on, the assistant-side silence prompts are suspended so the user is not interrupted while thinking. Waiting mode ends automatically the moment the user speaks again. After calling, say one very short acknowledgement (Japanese: "はい、どうぞ。" English: "Sure, take your time.") and then stay silent until the user speaks.',
    execute: (): Promise<string> => {
      hold.hold();

      return Promise.resolve(
        'Waiting mode is ON. Say one very short acknowledgement now, then stay silent until the user speaks again. Silence prompts are suspended and resume automatically when they speak.'
      );
    },
    parameters: z.object({}).strict(),
  }),
});
