import { reportServerError } from '@exe/server';

// Deterministic call pacer: keeps the meeting near its target length by
// injecting silent time-check notes into the voice model's chat context.
// No LLM is involved — this is a plain timer, and the system prompt tells the
// voice agent to act on these notes as the chair (speed up, defer details,
// steer to a close). Injection uses the same silent path as the memory scout
// and probe director (updateChatCtx, never generateReply), so a note can
// never interrupt in-progress speech.

const NOTE_HEADER =
  '[internal note — nobody spoke this; a time check from your own clock]';

// The first note fires just before the target length (default 9.5 min for a
// 10-minute target) so the agent can say "そろそろ10分" while it is still
// true. Follow-up notes repeat every interval (default 10 min) with a firmer
// push toward closing.
export const buildPacerNote = ({
  noteIndex,
  targetMinutes,
}: {
  // 0 = the first (pre-target) note, 1+ = the recurring overtime notes.
  readonly noteIndex: number;
  readonly targetMinutes: number;
}): string =>
  noteIndex === 0
    ? [
        NOTE_HEADER,
        `The call is approaching its target length of about ${String(targetMinutes)} minutes. As the chair, say a natural time check in your own words at the next opportunity — e.g. "そろそろ${String(targetMinutes)}分になりますね。少しスピードアップして、詳しい話は次回に回しましょうか。" (or the natural English equivalent). From this point on, STOP the deep-dive follow-up questions entirely — when something interesting comes up, park it with "詳しい話は次回にしましょう" instead of digging in — and run through the remaining agenda quickly: essentials only, record what is stated, move on.`,
        'Never read this note aloud and never mention that you were notified.',
      ].join('\n')
    : [
        NOTE_HEADER,
        `The call is now roughly ${String(targetMinutes * (noteIndex + 1))} minutes in — well past its ${String(targetMinutes)}-minute target. Steer firmly to a close: finish the current point briefly, skip everything that can wait, give the short closing recap of what was decided, and end the call. The longer this runs, the worse — a meeting that drags is a failure.`,
        'Never read this note aloud and never mention that you were notified.',
      ].join('\n');

export interface CallPacer {
  // Starts the clock (call when the participant actually joins).
  readonly start: () => void;
  // True once the first time-check note has fired: the call is at/past its
  // target length, so time-costly extras (e.g. probe-director deep dives)
  // should stop.
  readonly isOvertime: () => boolean;
  // Stops all timers; safe to call multiple times or before start.
  readonly dispose: () => void;
}

export const createCallPacer = ({
  firstNoteMs,
  injectContext,
  intervalMs,
  targetMinutes,
}: {
  readonly firstNoteMs: number;
  // Appends the note to the voice model's chat context without generating
  // speech. Must be safe to call on a closed session.
  readonly injectContext: (note: string) => Promise<void>;
  readonly intervalMs: number;
  readonly targetMinutes: number;
}): CallPacer => {
  /* eslint-disable functional/no-let -- Session-local timer handles by design. */
  let firstTimer: ReturnType<typeof setTimeout> | null = null;
  let repeatTimer: ReturnType<typeof setInterval> | null = null;
  let noteIndex = 0;
  let started = false;

  const inject = (): void => {
    const note = buildPacerNote({ noteIndex, targetMinutes });

    noteIndex += 1;
    void injectContext(note).catch((error: unknown) => {
      // Time checks are best-effort: failures are reported for observability
      // but never surface into the conversation.
      void reportServerError({
        context: { route: 'agent/call_pacer' },
        error,
      });
    });
  };

  return {
    dispose: (): void => {
      if (firstTimer !== null) {
        clearTimeout(firstTimer);
        firstTimer = null;
      }

      if (repeatTimer !== null) {
        clearInterval(repeatTimer);
        repeatTimer = null;
      }
    },
    isOvertime: (): boolean => noteIndex > 0,
    start: (): void => {
      if (started) {
        return;
      }

      started = true;
      firstTimer = setTimeout(() => {
        inject();
        repeatTimer = setInterval(inject, intervalMs);
      }, firstNoteMs);
    },
  };
  /* eslint-enable functional/no-let */
};
