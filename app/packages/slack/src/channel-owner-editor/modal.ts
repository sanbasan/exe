import {
  slackActionIds,
  slackBlockIds,
  slackViewIds,
} from '#slack/contracts/ids';
import { dispatcher } from '#slack/utils/dispatcher';
import type { Channel, Language } from '@exe/domain';
import type { KnownBlock, PlainTextOption, View } from '@slack/types';

const MAX_OPTION_TEXT_LENGTH = 75;

const getTitle = dispatcher<Language, string>({
  en: 'Channel owners',
  ja: 'チャンネル担当者',
});

const getChannelLabel = dispatcher<Language, string>({
  en: 'Channel',
  ja: 'チャンネル',
});

const getChannelPlaceholder = dispatcher<Language, string>({
  en: 'Select a channel',
  ja: 'チャンネルを選択',
});

const getAssigneesLabel = dispatcher<Language, string>({
  en: 'Owners',
  ja: '担当者',
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

const getNoChannelText = dispatcher<Language, string>({
  en: 'No channels are available yet.',
  ja: 'まだチャンネルがありません。',
});

const getInviteNoteText = dispatcher<Language, string>({
  en: 'If a channel does not appear here, invite @exe to that channel.',
  ja: '表示されないチャンネルは、そのチャンネルに @exe を招待してください',
});

const trimOptionText = (text: string): string =>
  text.length <= MAX_OPTION_TEXT_LENGTH
    ? text
    : `${text.slice(0, MAX_OPTION_TEXT_LENGTH - 3)}...`;

const toChannelOption = (channel: Channel): PlainTextOption => ({
  text: {
    text: trimOptionText(`#${channel.name}`),
    type: 'plain_text',
  },
  value: channel.channelId,
});

const buildChannelSelectBlock = ({
  initialOption,
  language,
  options,
}: {
  readonly initialOption?: PlainTextOption;
  readonly language: Language;
  readonly options: readonly PlainTextOption[];
}): KnownBlock => ({
  block_id: slackBlockIds.channelOwnerEditorChannel,
  dispatch_action: true,
  element: {
    action_id: slackActionIds.channelOwnerEditorChannel,
    ...(initialOption === undefined ? {} : { initial_option: initialOption }),
    options: [...options],
    placeholder: {
      text: getChannelPlaceholder(language),
      type: 'plain_text',
    },
    type: 'static_select',
  },
  label: {
    text: getChannelLabel(language),
    type: 'plain_text',
  },
  type: 'input',
});

const buildAssigneesBlock = ({
  channel,
  language,
}: {
  readonly channel: Channel;
  readonly language: Language;
}): KnownBlock => ({
  block_id: slackBlockIds.channelOwnerEditorAssignees,
  element: {
    action_id: slackActionIds.channelOwnerEditorAssignees,
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
  optional: true,
  type: 'input',
});

const buildInviteNoteBlock = (language: Language): KnownBlock => ({
  elements: [
    {
      text: getInviteNoteText(language),
      type: 'mrkdwn',
    },
  ],
  type: 'context',
});

export const buildChannelOwnerEditorPrivateMetadata = ({
  channelId,
}: {
  readonly channelId: string;
}): string => channelId;

export const parseChannelOwnerEditorPrivateMetadata = ({
  privateMetadata,
}: {
  readonly privateMetadata?: string;
}): string | null =>
  privateMetadata === undefined || privateMetadata.length === 0
    ? null
    : privateMetadata;

export const buildChannelOwnerEditorModal = ({
  channels,
  language,
  selectedChannel,
}: {
  readonly channels: readonly Channel[];
  readonly language: Language;
  readonly selectedChannel?: Channel;
}): View => {
  const options = channels.map(toChannelOption);
  const selectedOption = options.find(
    (option) => option.value === selectedChannel?.channelId
  );
  const hasSelectedChannel = selectedChannel !== undefined;
  const blocks: readonly KnownBlock[] =
    options.length === 0
      ? [
          {
            text: {
              text: getNoChannelText(language),
              type: 'mrkdwn',
            },
            type: 'section',
          },
          buildInviteNoteBlock(language),
        ]
      : [
          buildChannelSelectBlock({
            ...(selectedOption === undefined
              ? {}
              : { initialOption: selectedOption }),
            language,
            options,
          }),
          buildInviteNoteBlock(language),
          ...(hasSelectedChannel
            ? [buildAssigneesBlock({ channel: selectedChannel, language })]
            : []),
        ];

  return {
    blocks: [...blocks],
    callback_id: slackViewIds.channelOwnerEditor,
    close: {
      text: getCloseText(language),
      type: 'plain_text',
    },
    ...(hasSelectedChannel
      ? {
          private_metadata: buildChannelOwnerEditorPrivateMetadata({
            channelId: selectedChannel.channelId,
          }),
          submit: {
            text: getSubmitText(language),
            type: 'plain_text',
          },
        }
      : {}),
    title: {
      text: getTitle(language),
      type: 'plain_text',
    },
    type: 'modal',
  };
};
