import {
  slackActionIds,
  slackBlockIds,
  slackViewIds,
} from '#slack/contracts/ids';
import { dispatcher } from '#slack/utils/dispatcher';
import { PRIORITY_TIMEZONES } from '#slack/workspace-settings/timezones';
import type { Language } from '@exe/domain';
import type { PlainTextOption, View } from '@slack/types';

const getTitle = dispatcher<Language, string>({
  en: 'Settings',
  ja: '設定',
});

const getSubmitText = dispatcher<Language, string>({
  en: 'Save',
  ja: '保存',
});

const getCloseText = dispatcher<Language, string>({
  en: 'Close',
  ja: '閉じる',
});

const getLanguageLabel = dispatcher<Language, string>({
  en: 'Language',
  ja: '言語',
});

const getTimezoneLabel = dispatcher<Language, string>({
  en: 'Timezone',
  ja: 'タイムゾーン',
});

const englishOption = { text: 'English', value: 'en' as const };

const languageOptions: readonly {
  readonly text: string;
  readonly value: Language;
}[] = [englishOption, { text: '日本語', value: 'ja' }];

const toOption = ({
  text,
  value,
}: {
  readonly text: string;
  readonly value: string;
}): PlainTextOption => ({
  text: { text, type: 'plain_text' },
  value,
});

const getLanguageOption = (language: Language): PlainTextOption => {
  const option =
    languageOptions.find((candidate) => candidate.value === language) ??
    englishOption;

  return toOption({ text: option.text, value: option.value });
};

const includesPriorityTimezone = (timezone: string): boolean =>
  PRIORITY_TIMEZONES.some((priorityTimezone) => priorityTimezone === timezone);

export const buildWorkspaceSettingsModal = ({
  language,
  timezone,
}: {
  readonly language: Language;
  readonly timezone: string;
}): View => {
  const timezoneOptions = includesPriorityTimezone(timezone)
    ? PRIORITY_TIMEZONES
    : [timezone, ...PRIORITY_TIMEZONES];

  return {
    blocks: [
      {
        block_id: slackBlockIds.workspaceSettingsLanguage,
        element: {
          action_id: slackActionIds.workspaceSettingsLanguage,
          initial_option: getLanguageOption(language),
          options: languageOptions.map((option) =>
            toOption({ text: option.text, value: option.value })
          ),
          type: 'static_select',
        },
        label: {
          text: getLanguageLabel(language),
          type: 'plain_text',
        },
        type: 'input',
      },
      {
        block_id: slackBlockIds.workspaceSettingsTimezone,
        element: {
          action_id: slackActionIds.workspaceSettingsTimezone,
          initial_option: toOption({ text: timezone, value: timezone }),
          options: timezoneOptions.map((tz) =>
            toOption({ text: tz, value: tz })
          ),
          type: 'static_select',
        },
        label: {
          text: getTimezoneLabel(language),
          type: 'plain_text',
        },
        type: 'input',
      },
    ],
    callback_id: slackViewIds.workspaceSettings,
    close: {
      text: getCloseText(language),
      type: 'plain_text',
    },
    submit: {
      text: getSubmitText(language),
      type: 'plain_text',
    },
    title: {
      text: getTitle(language),
      type: 'plain_text',
    },
    type: 'modal',
  };
};
