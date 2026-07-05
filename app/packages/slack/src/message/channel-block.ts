import { slackActionIds } from '#slack/contracts';
import { formatSlackDateTime } from '#slack/utils/date-time';
import { dispatcher } from '#slack/utils/dispatcher';
import type { ChannelBlock, Language } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

const getCompleteButtonText = dispatcher<Language, string>({
  en: 'Complete',
  ja: '完了',
});

const getBlocksCreatedFromCallText = dispatcher<
  Language,
  [sessionDateTime: string, speakerMention: string, blockCount: number],
  string
>({
  en: (sessionDateTime, speakerMention, blockCount) =>
    blockCount === 1
      ? `A block was added from the call session with ${speakerMention} on ${sessionDateTime}.`
      : `${String(blockCount)} blocks were added from the call session with ${speakerMention} on ${sessionDateTime}.`,
  ja: (sessionDateTime, speakerMention, blockCount) =>
    `${sessionDateTime} の ${speakerMention} さんとの通話セッションでブロックが${String(blockCount)}件追加されました。`,
});

export const buildChannelBlockMessageBlocks = ({
  block,
  deleted,
  language,
}: {
  readonly block: ChannelBlock;
  readonly deleted?: boolean;
  readonly language: Language;
}): readonly KnownBlock[] => {
  const titleSection: KnownBlock =
    deleted === true
      ? {
          text: {
            text: `:wastebasket: ~${block.title}~`,
            type: 'mrkdwn',
          },
          type: 'section',
        }
      : block.status === 'resolved'
        ? {
            text: {
              text: `:white_check_mark: *${block.title}*`,
              type: 'mrkdwn',
            },
            type: 'section',
          }
        : {
            accessory: {
              action_id: slackActionIds.resolveChannelBlock,
              style: 'primary',
              text: {
                text: getCompleteButtonText(language),
                type: 'plain_text',
              },
              type: 'button',
              value: block.id,
            },
            text: {
              text: `:no_entry: *${block.title}*`,
              type: 'mrkdwn',
            },
            type: 'section',
          };

  return [
    titleSection,
    {
      elements: [
        {
          text: block.description,
          type: 'mrkdwn',
        },
      ],
      type: 'context',
    },
  ];
};

export const buildChannelBlocksCreatedFromCallRootFallbackText = ({
  blockCount,
  language,
  sessionStartedAt,
  speakerSlackUserId,
  timezone,
}: {
  readonly blockCount: number;
  readonly language: Language;
  readonly sessionStartedAt: string;
  readonly speakerSlackUserId: string;
  readonly timezone: string;
}): string => {
  const sessionDateTime = formatSlackDateTime({
    isoDateTime: sessionStartedAt,
    language,
    timezone,
  });

  return getBlocksCreatedFromCallText(language)(
    sessionDateTime,
    `<@${speakerSlackUserId}>`,
    blockCount
  );
};

export const buildChannelBlocksCreatedFromCallRootBlocks = ({
  blockCount,
  language,
  sessionStartedAt,
  speakerSlackUserId,
  timezone,
}: {
  readonly blockCount: number;
  readonly language: Language;
  readonly sessionStartedAt: string;
  readonly speakerSlackUserId: string;
  readonly timezone: string;
}): readonly KnownBlock[] => {
  const text = buildChannelBlocksCreatedFromCallRootFallbackText({
    blockCount,
    language,
    sessionStartedAt,
    speakerSlackUserId,
    timezone,
  });

  return [
    {
      text: {
        text: `:no_entry: ${text}`,
        type: 'mrkdwn',
      },
      type: 'section',
    },
  ];
};
