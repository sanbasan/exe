import type {
  CallEvent,
  CallEventType,
  ChannelBlockDraft,
  ChannelReviewDraft,
  FollowUpTaskDraft,
  LatestInfoDraft,
  TaskPatch,
  WorkTaskDraft,
} from '@exe/domain';

export const getPatchKey = (patch: TaskPatch): string =>
  JSON.stringify({
    after: patch.after,
    before: patch.before ?? null,
    taskId: patch.taskId,
  });

const getDiscardedDraftIds = ({
  events,
  type,
}: {
  readonly events: readonly CallEvent[];
  readonly type: CallEventType;
}): ReadonlySet<string> =>
  new Set(
    events.flatMap((event) =>
      event.type === type && 'draftIds' in event.payload
        ? event.payload.draftIds
        : []
    )
  );

// Proposals recorded with a draftId can be revised (a later proposal with the
// same draftId supersedes the earlier one) and discarded. Proposals without a
// draftId keep the legacy content-based first-wins dedupe.
const dedupeProposals = <T>({
  discardedDraftIds,
  getContentKey,
  getDraftId,
  values,
}: {
  readonly discardedDraftIds: ReadonlySet<string>;
  readonly getContentKey: (value: T) => string;
  readonly getDraftId: (value: T) => string | null;
  readonly values: readonly T[];
}): readonly T[] =>
  values
    .filter((value, index) => {
      const draftId = getDraftId(value);

      return draftId === null
        ? values.findIndex(
            (candidate) =>
              getDraftId(candidate) === null &&
              getContentKey(candidate) === getContentKey(value)
          ) === index
        : values.findLastIndex(
            (candidate) => getDraftId(candidate) === draftId
          ) === index;
    })
    .filter((value) => {
      const draftId = getDraftId(value);

      return draftId === null || !discardedDraftIds.has(draftId);
    });

export const getAppliedPatchKeys = (
  events: readonly CallEvent[]
): ReadonlySet<string> =>
  new Set(
    events.flatMap((event) =>
      event.type === 'task_patch_applied' && 'patches' in event.payload
        ? event.payload.patches.map(getPatchKey)
        : []
    )
  );

const getDraftKey = (draft: FollowUpTaskDraft): string => JSON.stringify(draft);

const getWorkTaskDraftKey = (draft: WorkTaskDraft): string =>
  JSON.stringify(draft);

const hasFollowUpDraftAssignees = (draft: FollowUpTaskDraft): boolean =>
  draft.assigneeSlackUserIds !== undefined &&
  draft.assigneeSlackUserIds.length > 0;

export const getIncomingPatches = (
  events: readonly CallEvent[]
): readonly TaskPatch[] =>
  dedupeProposals({
    discardedDraftIds: getDiscardedDraftIds({
      events,
      type: 'task_patch_discarded',
    }),
    getContentKey: getPatchKey,
    getDraftId: (patch) => patch.draftId ?? null,
    values: events.flatMap((event) =>
      (event.type === 'task_patch_proposed' ||
        event.type === 'task_patch_approved') &&
      'patches' in event.payload
        ? event.payload.patches
        : []
    ),
  });

export const getIncomingFollowUpDrafts = (
  events: readonly CallEvent[]
): readonly FollowUpTaskDraft[] =>
  dedupeProposals({
    discardedDraftIds: getDiscardedDraftIds({
      events,
      type: 'follow_up_task_draft_discarded',
    }),
    getContentKey: getDraftKey,
    getDraftId: (draft) => draft.draftId ?? null,
    values: events.flatMap((event) =>
      (event.type === 'follow_up_task_draft_proposed' ||
        event.type === 'follow_up_task_draft_approved') &&
      'drafts' in event.payload
        ? event.payload.drafts
        : []
    ),
  }).filter(hasFollowUpDraftAssignees);

export const getIncomingWorkTaskDrafts = (
  events: readonly CallEvent[]
): readonly WorkTaskDraft[] =>
  dedupeProposals({
    discardedDraftIds: getDiscardedDraftIds({
      events,
      type: 'work_task_draft_discarded',
    }),
    getContentKey: getWorkTaskDraftKey,
    getDraftId: (draft) => draft.draftId ?? null,
    values: events.flatMap((event) =>
      (event.type === 'work_task_draft_proposed' ||
        event.type === 'work_task_draft_approved') &&
      'workTaskDrafts' in event.payload
        ? event.payload.workTaskDrafts
        : []
    ),
  }).filter((draft) => draft.assigneeSlackUserIds.length > 0);

const getLatestInfoDraftKey = (draft: LatestInfoDraft): string =>
  JSON.stringify(draft);

// Latest-info drafts proposed during the call, deduped so a later proposal with
// the same draftId (a revision) supersedes earlier ones and discarded drafts
// are dropped. Multiple channels can each have their own draft; the caller
// applies each to its channel.
export const getIncomingLatestInfoDrafts = (
  events: readonly CallEvent[]
): readonly LatestInfoDraft[] =>
  dedupeProposals({
    discardedDraftIds: getDiscardedDraftIds({
      events,
      type: 'latest_info_draft_discarded',
    }),
    getContentKey: getLatestInfoDraftKey,
    getDraftId: (draft) => draft.draftId ?? null,
    values: events.flatMap((event) =>
      event.type === 'latest_info_draft_proposed' &&
      'latestInfoDrafts' in event.payload
        ? event.payload.latestInfoDrafts
        : []
    ),
  });

const getChannelReviewDraftKey = (draft: ChannelReviewDraft): string =>
  JSON.stringify(draft);

const getChannelBlockDraftKey = (draft: ChannelBlockDraft): string =>
  JSON.stringify(draft);

// Channel-review status drafts proposed during the call, deduped by draftId /
// content, then reduced to the last draft per channel so a later review or
// status update for the same channel supersedes earlier ones.
export const getIncomingChannelReviewDrafts = (
  events: readonly CallEvent[]
): readonly ChannelReviewDraft[] => {
  const drafts = dedupeProposals({
    discardedDraftIds: getDiscardedDraftIds({
      events,
      type: 'channel_review_draft_discarded',
    }),
    getContentKey: getChannelReviewDraftKey,
    getDraftId: (draft) => draft.draftId ?? null,
    values: events.flatMap((event) =>
      event.type === 'channel_review_draft_proposed' &&
      'channelReviewDrafts' in event.payload
        ? event.payload.channelReviewDrafts
        : []
    ),
  });

  return drafts.filter(
    (draft, index) =>
      drafts.findLastIndex(
        (candidate) => candidate.channelId === draft.channelId
      ) === index
  );
};

// Channel-block drafts proposed during the call, deduped by draftId / content.
// Event order is preserved so create/update/resolve/delete apply in the order
// the user recorded them.
export const getIncomingChannelBlockDrafts = (
  events: readonly CallEvent[]
): readonly ChannelBlockDraft[] =>
  dedupeProposals({
    discardedDraftIds: getDiscardedDraftIds({
      events,
      type: 'channel_block_draft_discarded',
    }),
    getContentKey: getChannelBlockDraftKey,
    getDraftId: (draft) => draft.draftId ?? null,
    values: events.flatMap((event) =>
      event.type === 'channel_block_draft_proposed' &&
      'channelBlockDrafts' in event.payload
        ? event.payload.channelBlockDrafts
        : []
    ),
  });

export const getAnsweredFollowUpTaskIds = (
  patches: readonly TaskPatch[]
): ReadonlySet<string> =>
  new Set(
    patches
      .filter(
        (patch) =>
          patch.after.kind === 'follow_up' &&
          patch.after.followUpAnswer !== undefined
      )
      .map((patch) => patch.taskId)
  );

export const getSummary = (events: readonly CallEvent[]): string => {
  const summaryEvent = events.find(
    (event) => event.type === 'summary' && 'summary' in event.payload
  );

  if (summaryEvent !== undefined && 'summary' in summaryEvent.payload) {
    return summaryEvent.payload.summary;
  }

  return 'Call ended without a generated summary.';
};
