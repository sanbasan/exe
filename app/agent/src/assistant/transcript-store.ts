export interface TranscriptEntry {
  readonly role: 'agent' | 'user';
  readonly text: string;
}

export interface TranscriptStore {
  readonly append: (entry: TranscriptEntry) => void;
  readonly snapshot: () => string;
}

const roleLabel = (role: TranscriptEntry['role']): string =>
  role === 'agent' ? 'Agent' : 'User';

// Session-local, in-memory transcript of the live call. Each assistant job is
// handed a snapshot of everything said up to its dispatch, so the tool-caller
// model can resolve references ("さっきの話") without a Firestore round-trip.
export const createTranscriptStore = (): TranscriptStore => {
  const entries: TranscriptEntry[] = [];

  return {
    append: (entry): void => {
      if (entry.text.trim().length === 0) {
        return;
      }

      /* eslint-disable-next-line functional/immutable-data -- Session-local mutable buffer by design. */
      entries.push(entry);
    },
    snapshot: (): string =>
      entries.length === 0
        ? '(no conversation yet)'
        : entries
            .map((entry) => `${roleLabel(entry.role)}: ${entry.text}`)
            .join('\n'),
  };
};
