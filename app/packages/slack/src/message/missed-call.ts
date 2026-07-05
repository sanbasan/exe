import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

const getHeading = dispatcher<Language, string>({
  en: 'Missed task review call',
  ja: 'タスク確認通話に応答がありませんでした',
});

const getBody = dispatcher<Language, string>({
  en: 'exe could not reach you for this review. You can start a manual review when you are ready.',
  ja: 'exe からの確認通話に応答がありませんでした。準備ができたら手動でタスク確認を開始できます。',
});

const getOpenAppText = dispatcher<Language, string>({
  en: 'Open app',
  ja: 'アプリを開く',
});

export const buildMissedCallFallbackText = ({
  language,
}: {
  readonly language: Language;
}): string => `${getHeading(language)}\n\n${getBody(language)}`;

export const buildMissedCallBlocks = ({
  appUrl,
  language,
}: {
  readonly appUrl: string;
  readonly language: Language;
}): readonly KnownBlock[] => [
  {
    text: {
      text: `*${getHeading(language)}*\n${getBody(language)}`,
      type: 'mrkdwn',
    },
    type: 'section',
  },
  {
    elements: [
      {
        text: {
          text: getOpenAppText(language),
          type: 'plain_text',
        },
        type: 'button',
        url: appUrl,
      },
    ],
    type: 'actions',
  },
];
