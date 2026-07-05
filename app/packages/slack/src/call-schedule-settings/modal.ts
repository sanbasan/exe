import {
  slackActionIds,
  slackBlockIds,
  slackViewIds,
} from '#slack/contracts/ids';
import { dispatcher } from '#slack/utils/dispatcher';
import type { CallSchedule, Language } from '@exe/domain';
import type { PlainTextOption, View } from '@slack/types';

interface LocalDateParts {
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

interface DateOption {
  readonly label: string;
  readonly value: string;
}

const SKIP_DATE_OPTION_DAYS = 10;
const enabledOptionValue = 'enabled';

const parseNumber = (value: string): number => {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return parsed;
};

const getPartValue = ({
  parts,
  type,
}: {
  readonly parts: readonly Intl.DateTimeFormatPart[];
  readonly type: Intl.DateTimeFormatPartTypes;
}): string => parts.find((part) => part.type === type)?.value ?? '';

const getLocalDateParts = ({
  date,
  timezone,
}: {
  readonly date: Date;
  readonly timezone: string;
}): LocalDateParts => {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(date);

  return {
    day: parseNumber(getPartValue({ parts, type: 'day' })),
    month: parseNumber(getPartValue({ parts, type: 'month' })),
    year: parseNumber(getPartValue({ parts, type: 'year' })),
  };
};

const addDaysToLocalDate = ({
  days,
  parts,
}: {
  readonly days: number;
  readonly parts: LocalDateParts;
}): LocalDateParts => {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days)
  );

  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
};

const toDateOnly = ({ day, month, year }: LocalDateParts): string =>
  `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0'
  )}`;

const formatDateLabel = dispatcher<Language, [date: Date], string>({
  en: (date) =>
    new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      weekday: 'short',
    }).format(date),
  ja: (date) =>
    new Intl.DateTimeFormat('ja-JP', {
      day: 'numeric',
      month: 'numeric',
      timeZone: 'UTC',
      weekday: 'short',
    }).format(date),
});

const getDateLabel = ({
  language,
  parts,
}: {
  readonly language: Language;
  readonly parts: LocalDateParts;
}): string => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  return formatDateLabel(language)(date);
};

export const buildCallScheduleSkipDateValues = ({
  now,
  timezone,
}: {
  readonly now: string;
  readonly timezone: string;
}): readonly string[] => {
  const today = getLocalDateParts({ date: new Date(now), timezone });

  return Array.from({ length: SKIP_DATE_OPTION_DAYS }, (_value, index) =>
    toDateOnly(addDaysToLocalDate({ days: index, parts: today }))
  );
};

const buildSkipDateOptions = ({
  language,
  now,
  timezone,
}: {
  readonly language: Language;
  readonly now: string;
  readonly timezone: string;
}): readonly DateOption[] => {
  const today = getLocalDateParts({ date: new Date(now), timezone });

  return Array.from({ length: SKIP_DATE_OPTION_DAYS }, (_value, index) => {
    const parts = addDaysToLocalDate({ days: index, parts: today });

    return {
      label: getDateLabel({ language, parts }),
      value: toDateOnly(parts),
    };
  });
};

const getTitle = dispatcher<Language, string>({
  en: 'Adjust next calls',
  ja: '次回の通話を調整',
});

const getSubmitText = dispatcher<Language, string>({
  en: 'Save',
  ja: '保存',
});

const getCloseText = dispatcher<Language, string>({
  en: 'Close',
  ja: '閉じる',
});

const getEnabledLabel = dispatcher<Language, string>({
  en: 'Regular calls',
  ja: '定例通話',
});

const getEnabledOptionText = dispatcher<Language, string>({
  en: 'Enable regular calls',
  ja: '定例通話を有効にする',
});

const getTimeLabel = dispatcher<Language, string>({
  en: 'Regular call time',
  ja: '定例の時刻',
});

const getSkipDatesLabel = dispatcher<Language, string>({
  en: 'Skip calls on these dates',
  ja: 'この日は通話をスキップ',
});

const getTimezoneHint = dispatcher<Language, [timezone: string], string>({
  en: (timezone) => `Time zone: ${timezone}`,
  ja: (timezone) => `タイムゾーン: ${timezone}`,
});

const toPlainTextOption = ({ label, value }: DateOption): PlainTextOption => ({
  text: {
    text: label,
    type: 'plain_text' as const,
  },
  value,
});

const getEnabledOption = (language: Language): PlainTextOption => ({
  text: {
    text: getEnabledOptionText(language),
    type: 'plain_text' as const,
  },
  value: enabledOptionValue,
});

export const buildCallScheduleSettingsModal = ({
  language,
  now,
  schedule,
  timezone,
}: {
  readonly language: Language;
  readonly now: string;
  readonly schedule: CallSchedule;
  readonly timezone: string;
}): View => {
  const dateOptions = buildSkipDateOptions({ language, now, timezone });
  const selectedDates = new Set(schedule.excludedDates);
  const selectedDateOptions = dateOptions.filter((option) =>
    selectedDates.has(option.value)
  );
  const enabledOption = getEnabledOption(language);

  return {
    blocks: [
      {
        block_id: slackBlockIds.callScheduleEnabled,
        element: {
          action_id: slackActionIds.callScheduleEnabled,
          ...(schedule.enabled ? { initial_options: [enabledOption] } : {}),
          options: [enabledOption],
          type: 'checkboxes',
        },
        label: {
          text: getEnabledLabel(language),
          type: 'plain_text',
        },
        optional: true,
        type: 'input',
      },
      {
        block_id: slackBlockIds.callScheduleTime,
        element: {
          action_id: slackActionIds.callScheduleTime,
          initial_time: schedule.timeOfDay,
          type: 'timepicker',
        },
        label: {
          text: getTimeLabel(language),
          type: 'plain_text',
        },
        type: 'input',
      },
      {
        block_id: slackBlockIds.callScheduleSkippedDates,
        element: {
          action_id: slackActionIds.callScheduleSkippedDates,
          ...(selectedDateOptions.length === 0
            ? {}
            : { initial_options: selectedDateOptions.map(toPlainTextOption) }),
          options: dateOptions.map(toPlainTextOption),
          type: 'checkboxes',
        },
        label: {
          text: getSkipDatesLabel(language),
          type: 'plain_text',
        },
        optional: true,
        type: 'input',
      },
      {
        elements: [
          {
            text: getTimezoneHint(language)(timezone),
            type: 'mrkdwn',
          },
        ],
        type: 'context',
      },
    ],
    callback_id: slackViewIds.callScheduleSettings,
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
