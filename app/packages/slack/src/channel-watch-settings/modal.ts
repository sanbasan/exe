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
  en: 'Channels to check',
  ja: '確認したいチャンネル',
});

const getChannelsLabel = dispatcher<Language, string>({
  en: 'Channels to check',
  ja: '確認したいチャンネル',
});

const getChannelsPlaceholder = dispatcher<Language, string>({
  en: 'Select channels',
  ja: 'チャンネルを選択',
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
  en: 'No channels are available yet. Mention @exe in a channel first.',
  ja: 'まだチャンネルがありません。先にチャンネルで @exe にメンションしてください。',
});

const getDescriptionText = dispatcher<Language, string>({
  en: 'Choose channels you want to keep an eye on in addition to your assigned channels.',
  ja: '担当チャンネル以外で、確認したいチャンネルを選択します。',
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

const buildDescriptionBlock = (language: Language): KnownBlock => ({
  elements: [
    {
      text: getDescriptionText(language),
      type: 'mrkdwn',
    },
  ],
  type: 'context',
});

export const buildChannelWatchSettingsModal = ({
  channels,
  language,
  slackUserId,
}: {
  readonly channels: readonly Channel[];
  readonly language: Language;
  readonly slackUserId: string;
}): View => {
  const options = channels.map(toChannelOption);
  const watchedChannelIds = new Set(
    channels
      .filter((channel) => channel.watcherSlackUserIds.includes(slackUserId))
      .map((channel) => channel.channelId)
  );
  const initialOptions = options.filter((option) =>
    option.value === undefined ? false : watchedChannelIds.has(option.value)
  );

  return {
    blocks:
      options.length === 0
        ? [
            {
              text: {
                text: getNoChannelText(language),
                type: 'mrkdwn',
              },
              type: 'section',
            },
            buildDescriptionBlock(language),
          ]
        : [
            {
              block_id: slackBlockIds.channelWatchSettingsChannels,
              element: {
                action_id: slackActionIds.channelWatchSettingsChannels,
                ...(initialOptions.length === 0
                  ? {}
                  : { initial_options: initialOptions }),
                options,
                placeholder: {
                  text: getChannelsPlaceholder(language),
                  type: 'plain_text',
                },
                type: 'multi_static_select',
              },
              label: {
                text: getChannelsLabel(language),
                type: 'plain_text',
              },
              optional: true,
              type: 'input',
            },
            buildDescriptionBlock(language),
          ],
    callback_id: slackViewIds.channelWatchSettings,
    close: {
      text: getCloseText(language),
      type: 'plain_text',
    },
    ...(options.length === 0
      ? {}
      : {
          submit: {
            text: getSubmitText(language),
            type: 'plain_text',
          },
        }),
    title: {
      text: getTitle(language),
      type: 'plain_text',
    },
    type: 'modal',
  };
};
