import { homeSectionSpacerBlock } from '#slack/app-home/blocks';
import {
  getAdminHeading,
  getManageAdminsButtonText,
  getSettingsButtonText,
} from '#slack/app-home/copy';
import { slackActionIds, slackBlockIds } from '#slack/contracts/ids';
import type { Language } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

export const buildAdminSection = ({
  language,
}: {
  readonly language: Language;
}): readonly KnownBlock[] => [
  {
    text: {
      emoji: true,
      text: getAdminHeading(language),
      type: 'plain_text',
    },
    type: 'header',
  },
  {
    block_id: slackBlockIds.admin,
    elements: [
      {
        action_id: slackActionIds.openSettings,
        text: {
          emoji: true,
          text: getSettingsButtonText(language),
          type: 'plain_text',
        },
        type: 'button',
      },
      {
        action_id: slackActionIds.openManageAdmins,
        text: {
          emoji: true,
          text: getManageAdminsButtonText(language),
          type: 'plain_text',
        },
        type: 'button',
      },
    ],
    type: 'actions',
  },
  { type: 'divider' },
  homeSectionSpacerBlock(),
];
