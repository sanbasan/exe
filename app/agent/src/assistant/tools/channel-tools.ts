/* eslint-disable max-lines -- Assistant plain channel tools are kept together so tool behavior is reviewed in one place. */
import type { PlainToolSet } from '#agent/assistant/plain-tool';
import type { CallDataRoom } from '#agent/data-channel';
import type { DraftRegistry } from '#agent/draft-registry';
import {
  recordChannelReviewDraftProposal,
  recordLatestInfoDraftProposal,
} from '#agent/tool-proposals';
import {
  channelReviewDraftSchema,
  isFarOutNextCheck,
  type CallAgenda,
  type Channel,
} from '@exe/domain';
import type { ServerComposition } from '@exe/server';
import { z } from 'zod';

export interface ChannelToolComposition {
  readonly services: {
    readonly callSession: Pick<
      ServerComposition['services']['callSession'],
      'recordEvent'
    >;
    readonly latestInfoComposer: Pick<
      ServerComposition['services']['latestInfoComposer'],
      'composeFromCallTranscript'
    >;
    readonly proseComposer: Pick<
      ServerComposition['services']['proseComposer'],
      'composeChannelReview'
    >;
  };
}

const composeLatestInfoParametersSchema = z
  .object({
    channelName: z.string().min(1),
    guidance: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional short hints for the writer: points the user emphasized, corrections to make, or what to focus on. Keep it brief; do NOT write the latest info itself here.'
      ),
  })
  .strict();

const latestInfoDraftDetailSchema = z
  .object({
    channelId: z.string().min(1),
    channelName: z.string().min(1),
    text: z.string().min(1).optional(),
  })
  .strip();

const reviseLatestInfoDraftParametersSchema = z
  .object({
    draftId: z
      .string()
      .min(1)
      .describe(
        'Exact draft ID of a composed latest-info draft, e.g. "d3". Use list_pending_drafts when unsure.'
      ),
    revisionGuidance: z
      .string()
      .min(1)
      .max(120)
      .describe(
        'Short hints on what to fix in the draft. Do NOT write the corrected text yourself; a prose composer composes the revised draft.'
      ),
  })
  .strict();

const recordReviewParametersSchema = z
  .object({
    channelName: z.string().min(1),
    hint: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        'Optional short cues for the prose composer — points the user emphasized or corrections; do NOT write the status text here.'
      ),
    nextCheckAt: z
      .string()
      .min(1)
      .optional()
      .describe(
        'When this person will next check this channel. A YYYY-MM-DD local date is enough when no exact time is needed; ISO 8601 date-time is also accepted. If 8 or more days out, you MUST also pass nextCheckReason.'
      ),
    nextCheckReason: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Reason the next check is far out. Required when nextCheckAt is 8 or more days away.'
      ),
  })
  .strict();

const updateMyStatusParametersSchema = z
  .object({
    channelName: z.string().min(1),
    hint: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        'Optional short cues for the prose composer — points the user emphasized or corrections; do NOT write the status text here.'
      ),
  })
  .strict();

const normalizeChannelName = (name: string): string =>
  name.trim().replace(/^#/u, '').toLowerCase();

const findChannelByName = ({
  channelName,
  channels,
}: {
  readonly channelName: string;
  readonly channels: readonly Channel[];
}): Channel | null => {
  const target = normalizeChannelName(channelName);

  return (
    channels.find((channel) => normalizeChannelName(channel.name) === target) ??
    null
  );
};

// One channel-review status draft per channel: update_my_channel_status and
// record_channel_review share it, so recording a full review supersedes an
// earlier status draft for the same channel. isNew tells failure handling
// whether the draft can be marked failed or must keep its previous content.
const claimReviewDraftId = ({
  channelId,
  channelName,
  registry,
}: {
  readonly channelId: string;
  readonly channelName: string;
  readonly registry: DraftRegistry;
}): { readonly draftId: string; readonly isNew: boolean } => {
  const existing = registry
    .listOpen()
    .find(
      (draft) =>
        draft.kind === 'channel_review' &&
        draft.detail['channelId'] === channelId
    );

  if (existing !== undefined) {
    registry.update({
      changes: {
        status: 'composing',
        summary: `Status draft for #${channelName} (composing)`,
      },
      draftId: existing.draftId,
    });

    return { draftId: existing.draftId, isNew: false };
  }

  return {
    draftId: registry.register({
      detail: { channelId, channelName },
      kind: 'channel_review',
      status: 'composing',
      summary: `Status draft for #${channelName} (composing)`,
    }),
    isNew: true,
  };
};

export const buildAssistantChannelTools = ({
  agenda,
  composition,
  registry,
  room,
  sessionId,
  topic,
  workspaceId,
}: {
  readonly agenda: CallAgenda;
  readonly composition: ChannelToolComposition;
  readonly registry: DraftRegistry;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
  readonly workspaceId: string;
}): PlainToolSet => ({
  compose_channel_latest_info: {
    description:
      "Compose a fresh draft of the CHANNEL's SHARED latest info from this conversation's transcript, instead of dictating a long latestInfo yourself. Use this ONLY when the request explicitly targets the channel's shared latest info (チャンネルの最新情報) or wraps up a channel review; when the user asks to update THEIR OWN latest info or status — the default meaning of \"update the latest info\" — use update_my_channel_status instead. The draft is recorded to apply automatically after the call — there is NO separate apply step. Use revise_channel_latest_info_draft for wording changes or discard_pending_draft if the user does not want it. Use guidance for short hints, not for the text itself.",
    execute: async (rawArgs): Promise<string> => {
      const args = composeLatestInfoParametersSchema.parse(rawArgs);
      const channel = findChannelByName({
        channelName: args.channelName,
        channels: agenda.channels,
      });

      if (channel === null) {
        return 'No matching channel was found. Ask the user to confirm the channel name.';
      }

      const draftId = registry.register({
        detail: {
          channelId: channel.channelId,
          channelName: channel.name,
        },
        kind: 'latest_info',
        status: 'composing',
        summary: `Latest info draft for #${channel.name} (composing)`,
      });
      const text =
        await composition.services.latestInfoComposer.composeFromCallTranscript(
          {
            callSessionId: sessionId,
            channelId: channel.channelId,
            ...(args.guidance === undefined ? {} : { guidance: args.guidance }),
            ...(agenda.speakerName === undefined
              ? {}
              : { speakerName: agenda.speakerName }),
            workspaceId,
          }
        );

      if (text === null) {
        registry.update({ changes: { status: 'failed' }, draftId });

        return `The latest-info draft for #${channel.name} could not be composed from the conversation so far. Report back that more of the conversation is needed, or retry with guidance.`;
      }

      await recordLatestInfoDraftProposal({
        composition,
        draft: {
          channelId: channel.channelId,
          channelName: channel.name,
          draftId,
          latestInfo: text,
        },
        room,
        sessionId,
        topic,
        workspaceId,
      });
      registry.update({
        changes: {
          detail: {
            channelId: channel.channelId,
            channelName: channel.name,
            text,
          },
          status: 'pending',
          summary: `Latest info draft for #${channel.name}`,
        },
        draftId,
      });

      return `Latest-info draft for #${channel.name} (draft ${draftId}) composed: ${text} — it is recorded to apply automatically after the call.`;
    },
    parameters: composeLatestInfoParametersSchema,
  },
  record_channel_review: {
    description:
      "Finish checking a channel. Call this once per channel at the END of that channel's discussion. Pass only the next date/time this person will check the channel (nextCheckAt, and nextCheckReason when needed) plus an optional short hint; a prose composer reads the call transcript and composes the status paragraph and self report. nextCheckAt may be a YYYY-MM-DD local date when no exact time is needed. If nextCheckAt is 8+ days out you must include nextCheckReason. The review is recorded as a draft applied automatically after the call.",
    execute: async (rawArgs): Promise<string> => {
      const args = recordReviewParametersSchema.parse(rawArgs);
      const channel = findChannelByName({
        channelName: args.channelName,
        channels: agenda.channels,
      });

      if (channel === null) {
        return 'No matching channel was found. Ask the user to confirm the channel name.';
      }

      const { draftId, isNew } = claimReviewDraftId({
        channelId: channel.channelId,
        channelName: channel.name,
        registry,
      });
      const markFailed = (): void => {
        registry.update({
          changes: isNew
            ? { status: 'failed' }
            : {
                status: 'pending',
                summary: `Review status draft for #${channel.name}`,
              },
          draftId,
        });
      };
      const composed =
        await composition.services.proseComposer.composeChannelReview({
          callSessionId: sessionId,
          channelId: channel.channelId,
          ...(args.hint === undefined ? {} : { hint: args.hint }),
          ...(agenda.speakerName === undefined
            ? {}
            : { speakerName: agenda.speakerName }),
          workspaceId,
        });

      if (composed === null) {
        markFailed();

        return `The channel review for #${channel.name} could not be composed from the conversation so far. Report back that more needs to be discussed before it can be recorded.`;
      }

      if (
        args.nextCheckAt !== undefined &&
        isFarOutNextCheck({
          from: agenda.now,
          nextCheckAt: args.nextCheckAt,
        }) &&
        (args.nextCheckReason === undefined ||
          args.nextCheckReason.trim().length === 0)
      ) {
        markFailed();

        return 'A next check 8 or more days out requires a reason. Ask the user why and call this tool again with nextCheckReason.';
      }

      const draft = channelReviewDraftSchema.parse({
        channelId: channel.channelId,
        channelName: channel.name,
        draftId,
        ...(composed.lastSelfReport === undefined
          ? {}
          : { lastSelfReport: composed.lastSelfReport }),
        ...(args.nextCheckAt === undefined
          ? {}
          : { nextCheckAt: args.nextCheckAt }),
        ...(args.nextCheckReason === undefined
          ? {}
          : { nextCheckReason: args.nextCheckReason }),
        statusText: composed.statusText,
      });

      await recordChannelReviewDraftProposal({
        composition,
        draft,
        room,
        sessionId,
        topic,
        workspaceId,
      });
      registry.update({
        changes: {
          detail: draft,
          status: 'pending',
          summary: `Review status draft for #${channel.name}`,
        },
        draftId,
      });

      return `The channel review draft for #${channel.name} (draft ${draftId}): ${composed.statusText}${
        args.nextCheckAt === undefined
          ? ''
          : ` — next check ${args.nextCheckAt}`
      } — it will be applied automatically after the call.`;
    },
    parameters: recordReviewParametersSchema,
  },
  revise_channel_latest_info_draft: {
    description:
      'Revise a composed latest-info draft when the user asked for wording changes. Pass the draft ID from compose_channel_latest_info and short revisionGuidance hints; a prose composer reads the call transcript and composes the revised draft. The draft — revised or not — is applied automatically after the call, so there is NO separate apply step; use discard_pending_draft if the user does not want it at all. Never write the corrected text yourself.',
    execute: async (rawArgs): Promise<string> => {
      const args = reviseLatestInfoDraftParametersSchema.parse(rawArgs);
      const draft = registry.get(args.draftId);

      if (draft?.kind !== 'latest_info') {
        return 'No latest-info draft with that draft ID exists. Call list_pending_drafts to check.';
      }

      if (draft.status === 'composing') {
        return 'That draft is still being composed. Wait until it finishes before revising.';
      }

      if (draft.status !== 'pending') {
        return `That draft is ${draft.status} and can no longer be revised.`;
      }

      const parsedDetail = latestInfoDraftDetailSchema.safeParse(draft.detail);

      if (!parsedDetail.success || parsedDetail.data.text === undefined) {
        return 'That draft has no composed text yet. Wait until it finishes composing before revising.';
      }

      const detail = parsedDetail.data;
      const { revisionGuidance } = args;

      registry.update({
        changes: {
          status: 'composing',
          summary: `Latest info draft for #${detail.channelName} (recomposing)`,
        },
        draftId: draft.draftId,
      });

      const text =
        await composition.services.latestInfoComposer.composeFromCallTranscript(
          {
            callSessionId: sessionId,
            channelId: detail.channelId,
            guidance: revisionGuidance,
            ...(agenda.speakerName === undefined
              ? {}
              : { speakerName: agenda.speakerName }),
            workspaceId,
          }
        );

      if (text === null) {
        registry.update({
          changes: {
            status: 'pending',
            summary: `Latest info draft for #${detail.channelName}`,
          },
          draftId: draft.draftId,
        });

        return `The latest-info draft for #${detail.channelName} could not be revised from the conversation so far; the previous draft still applies and is recorded to apply after the call. Retry with different guidance or keep it.`;
      }

      await recordLatestInfoDraftProposal({
        composition,
        draft: {
          channelId: detail.channelId,
          channelName: detail.channelName,
          draftId: draft.draftId,
          latestInfo: text,
        },
        room,
        sessionId,
        topic,
        workspaceId,
      });
      registry.update({
        changes: {
          detail: {
            channelId: detail.channelId,
            channelName: detail.channelName,
            text,
          },
          status: 'pending',
          summary: `Latest info draft for #${detail.channelName}`,
        },
        draftId: draft.draftId,
      });

      return `Revised latest-info draft for #${detail.channelName} (draft ${draft.draftId}): ${text} — it is recorded to apply automatically after the call.`;
    },
    parameters: reviseLatestInfoDraftParametersSchema,
  },
  update_my_channel_status: {
    description:
      'Update the caller\'s OWN per-channel status (their personal latest info, shown as "My review status" / 自分の最新情報) from this conversation. This is the DEFAULT target when the user asks to update the latest info without explicitly naming the channel\'s shared latest info. It is recorded as a draft applied automatically after the call — NOT applied during the call — and it does not change the next-check date. A prose composer writes the status from the call transcript; pass only a short optional hint, never the text itself.',
    execute: async (rawArgs): Promise<string> => {
      const args = updateMyStatusParametersSchema.parse(rawArgs);
      const channel = findChannelByName({
        channelName: args.channelName,
        channels: agenda.channels,
      });

      if (channel === null) {
        return 'No matching channel was found. Ask the user to confirm the channel name.';
      }

      const { draftId, isNew } = claimReviewDraftId({
        channelId: channel.channelId,
        channelName: channel.name,
        registry,
      });
      const composed =
        await composition.services.proseComposer.composeChannelReview({
          callSessionId: sessionId,
          channelId: channel.channelId,
          ...(args.hint === undefined ? {} : { hint: args.hint }),
          ...(agenda.speakerName === undefined
            ? {}
            : { speakerName: agenda.speakerName }),
          workspaceId,
        });

      if (composed === null) {
        registry.update({
          changes: isNew
            ? { status: 'failed' }
            : {
                status: 'pending',
                summary: `Review status draft for #${channel.name}`,
              },
          draftId,
        });

        return `Your status for #${channel.name} could not be composed from the conversation so far. Report back that more of the conversation is needed, or retry with a hint.`;
      }

      const draft = channelReviewDraftSchema.parse({
        channelId: channel.channelId,
        channelName: channel.name,
        draftId,
        ...(composed.lastSelfReport === undefined
          ? {}
          : { lastSelfReport: composed.lastSelfReport }),
        statusText: composed.statusText,
      });

      await recordChannelReviewDraftProposal({
        composition,
        draft,
        room,
        sessionId,
        topic,
        workspaceId,
      });
      registry.update({
        changes: {
          detail: draft,
          status: 'pending',
          summary: `Status draft for #${channel.name}`,
        },
        draftId,
      });

      return `Your status draft for #${channel.name} (draft ${draftId}): ${composed.statusText} — it will be applied automatically after the call.`;
    },
    parameters: updateMyStatusParametersSchema,
  },
});
