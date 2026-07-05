import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

const getMessageText = dispatcher<Language, [userId: string], string>({
  en: (userId) =>
    `:wave: Welcome to exe! <@${userId}>\n\nPlease set up the administrator account first.`,
  ja: (userId) =>
    `:wave: exeへようこそ！ <@${userId}>\n\nまずは管理者アカウントを設定してください。`,
});

const getButtonText = dispatcher<Language, string>({
  en: 'Start Setup',
  ja: 'セットアップを開始',
});

const getFallbackText = dispatcher<Language, string>({
  en: 'Setup Required',
  ja: 'セットアップが必要です',
});

export const buildAdminSetupRequiredMessage = ({
  appUrl,
  language,
  userId,
}: {
  readonly appUrl: string;
  readonly language: Language;
  readonly userId: string;
}): { readonly blocks: readonly KnownBlock[]; readonly text: string } => ({
  blocks: [
    {
      text: {
        text: getMessageText(language)(userId),
        type: 'mrkdwn',
      },
      type: 'section',
    },
    {
      elements: [
        {
          style: 'primary',
          text: {
            text: getButtonText(language),
            type: 'plain_text',
          },
          type: 'button',
          url: appUrl,
        },
      ],
      type: 'actions',
    },
  ],
  text: getFallbackText(language),
});
