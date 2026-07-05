import type { Language } from '@exe/domain';
import { reportServerError } from '@exe/server';

// ─── GBrain integration — purgeable (gbrain/PURGE.md). ───
//
// Background "memory scout": a slim assistant run (GBrain tools only) that
// pulls long-term-memory context about the CURRENT conversation topic and
// injects it into the voice model's chat context SILENTLY — no generateReply,
// no spoken notice, no interruption of in-progress speech. That is the whole
// point: unlike assistant jobs (whose completion nudge interrupts the agent's
// speech), scouts are free to run on every topic change.

export const NO_RELEVANT_MEMORY = 'NO_RELEVANT_MEMORY';

export type MemoryScoutDispatchResult = 'cooldown' | 'started';

export interface MemoryScout {
  readonly dispatch: (params: {
    readonly channelId?: string;
  }) => MemoryScoutDispatchResult;
}

const workspaceLanguageName = (language: Language): string =>
  language === 'ja' ? 'Japanese' : 'English';

export const buildMemoryScoutSystemPrompt = ({
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
    'You are a silent background "memory scout" for a live voice call between a user and the exe voice agent. You never talk to the user; you gather long-term-memory context so the voice agent sounds informed about past calls.',
    '',
    '# Context',
    `The current time is ${now}. The workspace timezone is ${timezone}; interpret relative dates in this timezone and use it to judge how recent a remembered fact is.`,
    `The workspace language setting is ${workspaceLanguageName(language)}. Everything you write for the user's screen or for the voice agent is in ${workspaceLanguageName(language)}, even when the call transcript is in a different language.`,
    '',
    '# Task',
    '1. Read the conversation transcript, focusing on the most recent turns, and identify the CURRENT topic: the project, channel, task, or decision being discussed. When a "## Target channel" section is present, the conversation just moved to that channel — that is the topic.',
    '2. Call search_workspace_memory once or twice with concrete standalone queries (channel/project names, people, keywords). Prefer one well-chosen query; add a second only if the first clearly missed the topic.',
    '3. If one snippet is clearly about the current topic and the full minutes would obviously help, read at most ONE page with read_workspace_memory_page. Otherwise skip page reads.',
    `4. If the searches surfaced anything relevant, call report_findings_to_user ONCE with 1-4 short plain-text lines in ${workspaceLanguageName(language)} — a human-glanceable digest of what turned up (one concrete fact per line: a decision, a date, who said what). The lines are shown verbatim on the user's call screen and MUST be written in ${workspaceLanguageName(language)} (the workspace language setting), regardless of the language spoken on the call: no markdown, no bullet markers, no page slugs or IDs, no "User:/Agent:" labels, no raw transcript fragments. Skip this call entirely when nothing relevant was found.`,
    '5. Reply with a compact briefing for the voice agent.',
    '',
    '# Briefing format',
    `- Write in ${workspaceLanguageName(language)}, even when the conversation is in a different language.`,
    '- 3 to 6 short bullet lines of concrete facts from memory relevant to the current topic: decisions, dates, deadlines, people, open questions. Note when a fact was recorded when the source shows it.',
    '- No preamble, no addressing anyone, no advice — only the facts.',
    '- NEVER invent facts; report only what the memory actually says.',
    `- If nothing relevant to the current topic is found, reply with exactly: ${NO_RELEVANT_MEMORY}`,
  ].join('\n');

export const MEMORY_SCOUT_TRIGGER_INSTRUCTION = `The voice agent triggered a background memory lookup at this point in the call. Identify the current topic from the end of the transcript (and the target channel when given), search the workspace long-term memory for context about it, and return the briefing (or ${NO_RELEVANT_MEMORY}).`;

// Wraps the scout's briefing for silent chat-context injection: the voice
// model must use it as background knowledge, not as something anyone said.
export const formatMemoryContextNote = (briefing: string): string =>
  [
    '[background workspace-memory context — internal note; nobody spoke this]',
    briefing,
    'Use these past-call notes silently to inform what you say when they become relevant — mention concrete dates, people, and decisions naturally. Do not announce this note, do not read it out as a list, and do not treat it as a user message or a request.',
  ].join('\n');

const isNoRelevantMemory = (briefing: string): boolean =>
  briefing.length === 0 || briefing.includes(NO_RELEVANT_MEMORY);

export const createMemoryScout = ({
  cooldownMs,
  injectContext,
  runLookup,
  timeoutMs,
}: {
  readonly cooldownMs: number;
  // Appends the (already formatted) note to the voice model's chat context
  // without generating speech. Must be safe to call on a closed session.
  readonly injectContext: (note: string) => Promise<void>;
  // Runs the actual scout agent and resolves with its briefing text.
  readonly runLookup: (params: {
    readonly channelId?: string;
  }) => Promise<string>;
  readonly timeoutMs: number;
}): MemoryScout => {
  /* eslint-disable functional/no-let, functional/immutable-data -- Session-local mutable dedupe registry by design. */
  const lastDispatchedAt = new Map<string, number>();
  const inFlight = new Set<string>();

  return {
    dispatch: ({ channelId }): MemoryScoutDispatchResult => {
      const key = channelId ?? '';
      const last = lastDispatchedAt.get(key);

      if (inFlight.has(key)) {
        return 'cooldown';
      }

      if (last !== undefined && Date.now() - last < cooldownMs) {
        return 'cooldown';
      }

      lastDispatchedAt.set(key, Date.now());
      inFlight.add(key);

      // A scout that outlives the timeout is abandoned: context arriving after
      // the topic has moved on is worse than none, so late results are dropped
      // (never injected), not merely delayed.
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        inFlight.delete(key);
      }, timeoutMs);

      void runLookup({
        ...(channelId === undefined ? {} : { channelId }),
      })
        .then(async (briefing) => {
          if (timedOut || isNoRelevantMemory(briefing.trim())) {
            return;
          }

          await injectContext(formatMemoryContextNote(briefing.trim()));
        })
        .catch((error: unknown) => {
          // Scouts are silent by contract: failures are reported for
          // observability but never surface into the conversation.
          void reportServerError({
            context: { route: 'agent/assistant/memory_scout' },
            error,
          });
        })
        .finally(() => {
          clearTimeout(timer);
          inFlight.delete(key);
        });

      return 'started';
    },
  };
  /* eslint-enable functional/no-let, functional/immutable-data */
};
