import type { CallEvent } from '@exe/domain';

// Keep the prompt bounded even on long calls; the newest part of the
// conversation is the part that matters for the current state.
export const MAX_TRANSCRIPT_CHARS = 12_000;

export const buildCallTranscript = ({
  events,
  speakerName,
}: {
  readonly events: readonly CallEvent[];
  readonly speakerName?: string;
}): string => {
  const lines = events.flatMap((event) => {
    if (!('text' in event.payload)) {
      return [];
    }

    if (event.type === 'agent_message') {
      return [`exe: ${event.payload.text}`];
    }

    if (event.type === 'transcript') {
      return [`${speakerName ?? 'User'}: ${event.payload.text}`];
    }

    return [];
  });
  const transcript = lines.join('\n');

  return transcript.length <= MAX_TRANSCRIPT_CHARS
    ? transcript
    : transcript.slice(transcript.length - MAX_TRANSCRIPT_CHARS);
};
