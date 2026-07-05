import { homeSectionSpacerBlock } from '#slack/app-home/blocks';
import {
  getChangeShownChannelsButtonText,
  getGbrainConnectButtonText,
  getManageAdminsButtonText,
  getManageChannelOwnersButtonText,
  getSettingsButtonText,
  getSettingsHeading,
} from '#slack/app-home/copy';
import { slackActionIds, slackBlockIds } from '#slack/contracts/ids';
import type { Language } from '@exe/domain';
import type { Button, KnownBlock } from '@slack/types';

const settingsButton = (language: Language): Button => ({
  action_id: slackActionIds.openSettings,
  text: {
    emoji: true,
    text: getSettingsButtonText(language),
    type: 'plain_text',
  },
  type: 'button',
});

const manageAccountsButton = (language: Language): Button => ({
  action_id: slackActionIds.openManageAdmins,
  text: {
    emoji: true,
    text: getManageAdminsButtonText(language),
    type: 'plain_text',
  },
  type: 'button',
});

const manageChannelOwnersButton = (language: Language): Button => ({
  action_id: slackActionIds.openChannelOwnerEditor,
  text: {
    text: getManageChannelOwnersButtonText(language),
    type: 'plain_text',
  },
  type: 'button',
});

const changeShownChannelsButton = (language: Language): Button => ({
  action_id: slackActionIds.openChannelWatchSettings,
  text: {
    text: getChangeShownChannelsButtonText(language),
    type: 'plain_text',
  },
  type: 'button',
});

const gbrainConnectButton = (language: Language): Button => ({
  action_id: slackActionIds.openGbrainConnect,
  text: {
    emoji: true,
    text: getGbrainConnectButtonText(language),
    type: 'plain_text',
  },
  type: 'button',
});

const buildSettingsButtons = ({
  canEditChannelOwners,
  canManageWorkspaceSettings,
  language,
}: {
  readonly canEditChannelOwners: boolean;
  readonly canManageWorkspaceSettings: boolean;
  readonly language: Language;
}): readonly Button[] => [
  ...(canManageWorkspaceSettings
    ? [
        settingsButton(language),
        manageAccountsButton(language),
        gbrainConnectButton(language),
      ]
    : []),
  ...(canEditChannelOwners ? [manageChannelOwnersButton(language)] : []),
  changeShownChannelsButton(language),
];

export const buildSettingsSection = ({
  canEditChannelOwners,
  canManageWorkspaceSettings,
  language,
}: {
  readonly canEditChannelOwners: boolean;
  readonly canManageWorkspaceSettings: boolean;
  readonly language: Language;
}): readonly KnownBlock[] => {
  const elements = buildSettingsButtons({
    canEditChannelOwners,
    canManageWorkspaceSettings,
    language,
  });

  if (elements.length === 0) {
    return [];
  }

  return [
    {
      text: {
        emoji: true,
        text: getSettingsHeading(language),
        type: 'plain_text',
      },
      type: 'header',
    },
    {
      block_id: `${slackBlockIds.channel}.settings`,
      elements: [...elements],
      type: 'actions',
    },
    { type: 'divider' },
    homeSectionSpacerBlock(),
  ];
};
