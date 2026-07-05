import { publishCallData, type CallDataRoom } from '#agent/data-channel';
import {
  callDataChannelMessageSchema,
  type ChannelBlockDraft,
  type ChannelReviewDraft,
  type FollowUpTaskDraft,
  type LatestInfoDraft,
  type TaskPatch,
  type WorkTaskDraft,
} from '@exe/domain';
import type { ServerComposition } from '@exe/server';

export type DraftDiscardEventType =
  | 'channel_block_draft_discarded'
  | 'channel_review_draft_discarded'
  | 'follow_up_task_draft_discarded'
  | 'latest_info_draft_discarded'
  | 'task_patch_discarded'
  | 'work_task_draft_discarded';

const ignoreDataChannelError = (): null => null;

export interface CallEventRecorderComposition {
  readonly services: {
    readonly callSession: Pick<
      ServerComposition['services']['callSession'],
      'recordEvent'
    >;
  };
}

export const recordPatchProposal = async ({
  composition,
  patch,
  room,
  sessionId,
  topic,
  workspaceId,
}: {
  readonly composition: CallEventRecorderComposition;
  readonly patch: TaskPatch;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
  readonly workspaceId: string;
}): Promise<void> => {
  await composition.services.callSession.recordEvent({
    callSessionId: sessionId,
    payload: { patches: [patch] },
    type: 'task_patch_proposed',
    workspaceId,
  });
  await publishCallData({
    message: {
      callSessionId: sessionId,
      patches: [patch],
      type: 'task_patch_proposed',
      workspaceId,
    },
    room,
    topic,
  }).catch(ignoreDataChannelError);
};

export const recordFollowUpDraftProposal = async ({
  composition,
  draft,
  room,
  sessionId,
  topic,
  workspaceId,
}: {
  readonly composition: CallEventRecorderComposition;
  readonly draft: FollowUpTaskDraft;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
  readonly workspaceId: string;
}): Promise<void> => {
  await composition.services.callSession.recordEvent({
    callSessionId: sessionId,
    payload: { drafts: [draft] },
    type: 'follow_up_task_draft_proposed',
    workspaceId,
  });
  await publishCallData({
    message: {
      callSessionId: sessionId,
      drafts: [draft],
      type: 'follow_up_task_draft_proposed',
      workspaceId,
    },
    room,
    topic,
  }).catch(ignoreDataChannelError);
};

export const recordLatestInfoDraftProposal = async ({
  composition,
  draft,
  room,
  sessionId,
  topic,
  workspaceId,
}: {
  readonly composition: CallEventRecorderComposition;
  readonly draft: LatestInfoDraft;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
  readonly workspaceId: string;
}): Promise<void> => {
  await composition.services.callSession.recordEvent({
    callSessionId: sessionId,
    payload: { latestInfoDrafts: [draft] },
    type: 'latest_info_draft_proposed',
    workspaceId,
  });
  await publishCallData({
    message: {
      callSessionId: sessionId,
      latestInfoDrafts: [draft],
      type: 'latest_info_draft_proposed',
      workspaceId,
    },
    room,
    topic,
  }).catch(ignoreDataChannelError);
};

export const recordChannelBlockDraftProposal = async ({
  composition,
  draft,
  room,
  sessionId,
  topic,
  workspaceId,
}: {
  readonly composition: CallEventRecorderComposition;
  readonly draft: ChannelBlockDraft;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
  readonly workspaceId: string;
}): Promise<void> => {
  await composition.services.callSession.recordEvent({
    callSessionId: sessionId,
    payload: { channelBlockDrafts: [draft] },
    type: 'channel_block_draft_proposed',
    workspaceId,
  });
  await publishCallData({
    message: {
      callSessionId: sessionId,
      channelBlockDrafts: [draft],
      type: 'channel_block_draft_proposed',
      workspaceId,
    },
    room,
    topic,
  }).catch(ignoreDataChannelError);
};

export const recordChannelReviewDraftProposal = async ({
  composition,
  draft,
  room,
  sessionId,
  topic,
  workspaceId,
}: {
  readonly composition: CallEventRecorderComposition;
  readonly draft: ChannelReviewDraft;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
  readonly workspaceId: string;
}): Promise<void> => {
  await composition.services.callSession.recordEvent({
    callSessionId: sessionId,
    payload: { channelReviewDrafts: [draft] },
    type: 'channel_review_draft_proposed',
    workspaceId,
  });
  await publishCallData({
    message: {
      callSessionId: sessionId,
      channelReviewDrafts: [draft],
      type: 'channel_review_draft_proposed',
      workspaceId,
    },
    room,
    topic,
  }).catch(ignoreDataChannelError);
};

export const recordDraftDiscard = async ({
  composition,
  draftIds,
  room,
  sessionId,
  topic,
  type,
  workspaceId,
}: {
  readonly composition: CallEventRecorderComposition;
  readonly draftIds: readonly string[];
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
  readonly type: DraftDiscardEventType;
  readonly workspaceId: string;
}): Promise<void> => {
  await composition.services.callSession.recordEvent({
    callSessionId: sessionId,
    payload: { draftIds: [...draftIds] },
    type,
    workspaceId,
  });
  await publishCallData({
    message: callDataChannelMessageSchema.parse({
      callSessionId: sessionId,
      draftIds: [...draftIds],
      type,
      workspaceId,
    }),
    room,
    topic,
  }).catch(ignoreDataChannelError);
};

export const recordWorkTaskDraftProposal = async ({
  composition,
  draft,
  room,
  sessionId,
  topic,
  workspaceId,
}: {
  readonly composition: CallEventRecorderComposition;
  readonly draft: WorkTaskDraft;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
  readonly workspaceId: string;
}): Promise<void> => {
  await composition.services.callSession.recordEvent({
    callSessionId: sessionId,
    payload: { workTaskDrafts: [draft] },
    type: 'work_task_draft_proposed',
    workspaceId,
  });
  await publishCallData({
    message: {
      callSessionId: sessionId,
      type: 'work_task_draft_proposed',
      workspaceId,
      workTaskDrafts: [draft],
    },
    room,
    topic,
  }).catch(ignoreDataChannelError);
};
