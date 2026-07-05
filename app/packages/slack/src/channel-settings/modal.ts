import {
  slackActionIds,
  slackBlockIds,
  slackViewIds,
} from '#slack/contracts/ids';
import { dispatcher } from '#slack/utils/dispatcher';
import type { Channel, Language } from '@exe/domain';
import type { View } from '@slack/types';

const getTitle = dispatcher<Language, string>({
  en: 'Channel settings',
  ja: 'チャンネル設定',
});

const getAssigneesLabel = dispatcher<Language, string>({
  en: 'Update owners',
  ja: '最新情報の担当者',
});

const getAssigneesPlaceholder = dispatcher<Language, string>({
  en: 'Select owners',
  ja: '担当者を選択',
});

const getSubmitText = dispatcher<Language, string>({
  en: 'Save',
  ja: '保存',
});

const getCloseText = dispatcher<Language, string>({
  en: 'Close',
  ja: '閉じる',
});

export const buildChannelSettingsPrivateMetadata = ({
  channelId,
}: {
  readonly channelId: string;
}): string => channelId;

export const parseChannelSettingsPrivateMetadata = ({
  privateMetadata,
}: {
  readonly privateMetadata?: string;
}): string | null =>
  privateMetadata === undefined || privateMetadata.length === 0
    ? null
    : privateMetadata;

export const buildChannelSettingsModal = ({
  channel,
  language,
}: {
  readonly channel: Channel;
  readonly language: Language;
}): View => ({
  blocks: [
    {
      block_id: slackBlockIds.channelSettingsAssignees,
      element: {
        action_id: slackActionIds.channelSettingsAssignees,
        ...(channel.assigneeSlackUserIds.length === 0
          ? {}
          : { initial_users: [...channel.assigneeSlackUserIds] }),
        placeholder: {
          text: getAssigneesPlaceholder(language),
          type: 'plain_text',
        },
        type: 'multi_users_select',
      },
      label: {
        text: getAssigneesLabel(language),
        type: 'plain_text',
      },
      type: 'input',
    },
  ],
  callback_id: slackViewIds.channelSettings,
  close: {
    text: getCloseText(language),
    type: 'plain_text',
  },
  private_metadata: buildChannelSettingsPrivateMetadata({
    channelId: channel.channelId,
  }),
  submit: {
    text: getSubmitText(language),
    type: 'plain_text',
  },
  title: {
    text: getTitle(language),
    type: 'plain_text',
  },
  type: 'modal',
});
