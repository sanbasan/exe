import type { Language } from '@exe/domain';
import { reportServerError } from '@exe/server';

// ─── GBrain integration — purgeable (gbrain/PURGE.md). ───
//
// Background "probe director": a slim GBrain-equipped assistant run that watches
// the live check-in WITHOUT any tool call from the voice agent — it is driven by
// finalized user turns. Its job is to find the ONE most valuable thing the team
// does not yet know about this person's internal context and hand the voice
// agent a single follow-up question to ask, injected via the same silent
// chat-context path as the memory scout (updateChatCtx, never generateReply).
//
// It exists to make the call LEARN, but a disciplined interviewer keeps quiet:
// a per-call probe budget, a cooldown, single-flight, and a timeout stop it from
// turning the check-in into an interrogation or re-asking already-known things.

export const NO_PROBE = 'NO_PROBE';

export type ProbeDirectorDispatchResult = 'budget' | 'cooldown' | 'started';

export interface ProbeDirector {
  // Considers the current conversation and, if warranted, injects one follow-up
  // question in the background. Returns why it did or did not start a run.
  readonly dispatch: () => ProbeDirectorDispatchResult;
}

const workspaceLanguageName = (language: Language): string =>
  language === 'ja' ? 'Japanese' : 'English';

export const buildProbeDirectorSystemPrompt = ({
  language,
  now,
  timezone,
}: {
  readonly language: Language;
  readonly now: string;
  readonly timezone: string;
}): string =>
  [
    '# Identity',
    'You are a silent background "probe director" for a live check-in call between a user and the exe voice agent. You never speak to the user. Your only job is to find the ONE most valuable thing the team does not yet know about this person\'s internal, organizational context, and hand the voice agent a single follow-up question to ask.',
    '',
    '# Context',
    `The current time is ${now}. The workspace timezone is ${timezone}; interpret relative dates in this timezone.`,
    '',
    '# What is worth asking',
    "- The call exists to LEARN internal context: how this person's projects, people, decisions, and constraints actually work, and the WHY behind them.",
    '- Surface UNKNOWNS only. Search the workspace long-term memory (GBrain) for the current topic: if what the user just described is already recorded there, it is KNOWN — do NOT propose asking it again. Re-asking known things is the exact failure you exist to prevent.',
    '- Prefer depth on what they just raised: a decision, a blocker, a person, a dependency, or a result whose reason or method is not yet captured. Strong angles: what was hard, how they solved it, why they chose that.',
    '',
    '# Task',
    '1. Read the transcript, focus on the most recent user turns, and identify what they are talking about right now.',
    '2. Call search_workspace_memory once (twice at most) to check what memory already holds about that topic. Read at most ONE page only if it is clearly needed to tell known from unknown.',
    '3. Decide: is there a concrete unknown here that is genuinely worth one question? If not — the topic is already well covered, the moment does not warrant a question, or nothing new was raised — reply with exactly ' +
      NO_PROBE +
      '.',
    `4. Otherwise reply with ONE short follow-up question in ${workspaceLanguageName(
      language
    )}, written as the actual question to ask — no preamble, no options, no explanation, no alternatives. One question only.`,
    '',
    '# Restraint',
    '- Silence is the default. Most turns should return ' +
      NO_PROBE +
      '. Only surface a probe when there is a genuinely valuable gap.',
    '- Never propose more than one question, never small talk, and never a question the recorded state or memory already answers.',
    '- Never invent facts. Base the question strictly on what was actually said and what memory shows is missing.',
  ].join('\n');

export const PROBE_DIRECTOR_TRIGGER_INSTRUCTION =
  'The user just finished a turn. Identify the current topic from the end of the transcript, check the workspace long-term memory for what is already known about it, and either return ONE high-value follow-up question about a genuine unknown, or ' +
  NO_PROBE +
  '.';

// Wraps the chosen probe for silent chat-context injection. Unlike the memory
// note (which the voice agent must NOT read aloud), the voice agent SHOULD voice
// this — as its own next question — but only if it still fits the moment.
export const formatProbeNote = (probe: string): string =>
  [
    '[internal note — nobody spoke this; a suggestion from your own background research]',
    'A follow-up worth asking next, to learn something the team does not yet know:',
    probe,
    'If it still fits the conversation, ask it naturally in your own words as your next question. If the moment has passed or you already covered it, drop it. Never read this note aloud and never mention that anything was suggested.',
  ].join('\n');

const isNoProbe = (probe: string): boolean =>
  probe.length === 0 || probe.includes(NO_PROBE);

export const createProbeDirector = ({
  cooldownMs,
  injectContext,
  maxProbesPerCall,
  runProbe,
  timeoutMs,
}: {
  readonly cooldownMs: number;
  // Appends the (already formatted) note to the voice model's chat context
  // without generating speech. Must be safe to call on a closed session.
  readonly injectContext: (note: string) => Promise<void>;
  // Hard cap on injected questions for the whole call — the "don't ask too many
  // questions in one meeting" rule, enforced in code, not just in the prompt.
  readonly maxProbesPerCall: number;
  // Runs the actual director agent and resolves with its probe text (or NO_PROBE).
  readonly runProbe: () => Promise<string>;
  readonly timeoutMs: number;
}): ProbeDirector => {
  /* eslint-disable functional/no-let -- Session-local mutable throttle state by design. */
  let lastDispatchedAt: number | null = null;
  let inFlight = false;
  let probesInjected = 0;

  return {
    dispatch: (): ProbeDirectorDispatchResult => {
      if (probesInjected >= maxProbesPerCall) {
        return 'budget';
      }

      if (inFlight) {
        return 'cooldown';
      }

      if (
        lastDispatchedAt !== null &&
        Date.now() - lastDispatchedAt < cooldownMs
      ) {
        return 'cooldown';
      }

      lastDispatchedAt = Date.now();
      inFlight = true;

      // A probe that outlives the timeout is abandoned: a stale "next question"
      // about a topic the call has already moved past is worse than none.
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        inFlight = false;
      }, timeoutMs);

      void runProbe()
        .then(async (probe) => {
          if (timedOut || isNoProbe(probe.trim())) {
            return;
          }

          probesInjected += 1;
          await injectContext(formatProbeNote(probe.trim()));
        })
        .catch((error: unknown) => {
          // The director is silent by contract: failures are reported for
          // observability but never surface into the conversation.
          void reportServerError({
            context: { route: 'agent/assistant/probe_director' },
            error,
          });
        })
        .finally(() => {
          clearTimeout(timer);
          inFlight = false;
        });

      return 'started';
    },
  };
  /* eslint-enable functional/no-let */
};
