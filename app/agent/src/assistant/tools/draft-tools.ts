import type { PlainToolSet } from '#agent/assistant/plain-tool';
import type { CallDataRoom } from '#agent/data-channel';
import type {
  DraftKind,
  DraftRecord,
  DraftRegistry,
} from '#agent/draft-registry';
import {
  recordDraftDiscard,
  type CallEventRecorderComposition,
  type DraftDiscardEventType,
} from '#agent/tool-proposals';
import { z } from 'zod';

const draftIdParametersSchema = z
  .object({
    draftId: z
      .string()
      .min(1)
      .describe(
        'Exact draft ID returned by an earlier tool call in this conversation, e.g. "d2". Use list_pending_drafts when unsure.'
      ),
  })
  .strict();

const discardEventTypeByKind: Readonly<
  Partial<Record<DraftKind, DraftDiscardEventType>>
> = {
  channel_block: 'channel_block_draft_discarded',
  channel_review: 'channel_review_draft_discarded',
  follow_up_task: 'follow_up_task_draft_discarded',
  latest_info: 'latest_info_draft_discarded',
  task_patch: 'task_patch_discarded',
  work_task: 'work_task_draft_discarded',
};

const formatDraftForList = (draft: DraftRecord): Record<string, unknown> => ({
  draftId: draft.draftId,
  kind: draft.kind,
  status: draft.status,
  summary: draft.summary,
});

export const buildAssistantDraftTools = ({
  composition,
  registry,
  room,
  sessionId,
  topic,
  workspaceId,
}: {
  readonly composition: CallEventRecorderComposition;
  readonly registry: DraftRegistry;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
  readonly workspaceId: string;
}): PlainToolSet => ({
  discard_pending_draft: {
    description:
      'Discard a pending draft recorded earlier in this conversation so it will NOT be applied after the call. Use this when the user says a recorded task, follow-up, task change, latest-info, channel-block, or channel status/review draft should be cancelled or was recorded by mistake. Pass the exact draft ID. A discarded draft cannot be revived; record a new one instead if needed.',
    execute: async (rawArgs): Promise<string> => {
      const args = draftIdParametersSchema.parse(rawArgs);
      const draft = registry.get(args.draftId);

      if (draft === null) {
        return 'No draft with that draft ID exists in this conversation. Call list_pending_drafts to see the current drafts.';
      }

      if (draft.status === 'discarded') {
        return 'That draft was already discarded.';
      }

      if (draft.status === 'applied') {
        return 'That draft was already applied and can no longer be discarded. Record a corrective change instead.';
      }

      const discardEventType = discardEventTypeByKind[draft.kind];

      if (discardEventType !== undefined) {
        await recordDraftDiscard({
          composition,
          draftIds: [draft.draftId],
          room,
          sessionId,
          topic,
          type: discardEventType,
          workspaceId,
        });
      }

      registry.update({
        changes: { status: 'discarded' },
        draftId: draft.draftId,
      });

      return `Draft ${draft.draftId} (${draft.summary}) was discarded and will not be applied.`;
    },
    parameters: draftIdParametersSchema,
  },
  get_pending_draft: {
    description:
      'Read the full content of one draft recorded in this conversation, including the full text of a composed latest-info draft. Use this before reading a draft back to the user. Pass the exact draft ID.',
    execute: (rawArgs): Promise<string> => {
      const args = draftIdParametersSchema.parse(rawArgs);
      const draft = registry.get(args.draftId);

      if (draft === null) {
        return Promise.resolve(
          'No draft with that draft ID exists in this conversation. Call list_pending_drafts to see the current drafts.'
        );
      }

      return Promise.resolve(
        JSON.stringify({
          detail: draft.detail,
          ...formatDraftForList(draft),
        })
      );
    },
    parameters: draftIdParametersSchema,
  },
  list_pending_drafts: {
    description:
      'List the drafts recorded so far in this conversation that are still pending (new tasks, follow-ups, task changes, composed latest-info drafts, channel blocks, and channel status/review drafts). Use this when the user asks what has been recorded, wants to change or cancel something recorded earlier, or when you need a draft ID.',
    execute: (): Promise<string> => {
      const drafts = registry.listOpen();

      return Promise.resolve(
        drafts.length === 0
          ? 'No pending drafts have been recorded in this conversation.'
          : JSON.stringify(drafts.map(formatDraftForList))
      );
    },
  },
});
