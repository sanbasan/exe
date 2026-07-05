import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { View } from '@slack/types';

const getTitle = dispatcher<Language, string>({
  en: ':wave: Welcome to exe!\n\nPlease set up the administrator account first.',
  ja: ':wave: exeへようこそ！\n\nまずは管理者アカウントを設定してください。',
});

const getButtonText = dispatcher<Language, string>({
  en: 'Start Setup',
  ja: 'セットアップを開始',
});

export const buildAdminSetupRequiredHomeView = ({
  appUrl,
  language,
}: {
  readonly appUrl: string;
  readonly language: Language;
}): View => ({
  blocks: [
    {
      text: {
        text: getTitle(language),
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
  type: 'home',
});
