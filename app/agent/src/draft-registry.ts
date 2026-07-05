export type DraftKind =
  | 'channel_review'
  | 'follow_up_task'
  | 'latest_info'
  | 'task_patch'
  | 'work_task';

export type DraftStatus =
  | 'applied'
  | 'composing'
  | 'discarded'
  | 'failed'
  | 'pending';

export interface DraftRecord {
  readonly detail: Readonly<Record<string, unknown>>;
  readonly draftId: string;
  readonly kind: DraftKind;
  readonly status: DraftStatus;
  readonly summary: string;
}

export interface DraftRegistry {
  readonly get: (draftId: string) => DraftRecord | null;
  readonly listOpen: () => readonly DraftRecord[];
  readonly register: (params: {
    readonly detail: Readonly<Record<string, unknown>>;
    readonly kind: DraftKind;
    readonly status?: DraftStatus;
    readonly summary: string;
  }) => string;
  readonly update: (params: {
    readonly changes: Partial<
      Pick<DraftRecord, 'detail' | 'status' | 'summary'>
    >;
    readonly draftId: string;
  }) => DraftRecord | null;
}

const isOpenStatus = (status: DraftStatus): boolean =>
  status === 'composing' || status === 'pending';

// Session-local, in-memory view of what has been drafted during this call.
// Persistence happens through call events; this registry only lets the
// conversation agent list, read back, revise, and discard its own drafts.
export const createDraftRegistry = (): DraftRegistry => {
  /* eslint-disable functional/no-let, functional/immutable-data -- Session-local mutable registry by design. */
  let nextId = 1;
  const drafts = new Map<string, DraftRecord>();

  return {
    get: (draftId): DraftRecord | null => drafts.get(draftId) ?? null,
    listOpen: (): readonly DraftRecord[] =>
      [...drafts.values()].filter((draft) => isOpenStatus(draft.status)),
    register: ({ detail, kind, status = 'pending', summary }): string => {
      const draftId = `d${String(nextId)}`;

      nextId += 1;
      drafts.set(draftId, { detail, draftId, kind, status, summary });

      return draftId;
    },
    update: ({ changes, draftId }): DraftRecord | null => {
      const current = drafts.get(draftId);

      if (current === undefined) {
        return null;
      }

      const updated: DraftRecord = { ...current, ...changes };

      drafts.set(draftId, updated);

      return updated;
    },
  };
  /* eslint-enable functional/no-let, functional/immutable-data */
};
