import { getChannelLatestInfoHeading } from '#slack/app-home/copy';
import { formatSlackDateTime } from '#slack/utils/date-time';
import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

export interface CallSummaryChannelUpdate {
  readonly channelId: string;
  readonly channelName: string;
  readonly nextCheckAt?: string;
  readonly nextCheckReason?: string;
  readonly statusText: string;
}

const getCallSummaryHeading = dispatcher<Language, string>({
  en: 'exe call summary',
  ja: 'exe 通話サマリー',
});

const getNoChangedUpdatesText = dispatcher<Language, string>({
  en: 'No channel updates changed in this call.',
  ja: 'この通話で変更されたチャンネルの最新情報はありません。',
});

const getNextCheckLabel = dispatcher<Language, string>({
  en: 'Next check',
  ja: '次回確認',
});

const getNoNextCheckText = dispatcher<Language, string>({
  en: 'Not set',
  ja: '未設定',
});

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

const normalizeSlackMrkdwn = (text: string): string =>
  text.replaceAll(/\*\*([^*\n]+)\*\*/gu, '*$1*');

const removeBlankLines = (text: string): string =>
  text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .join('\n');

const getDateOnlyFormatter = ({
  language,
}: {
  readonly language: Language;
}): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : 'en-US', {
    day: '2-digit',
    month: language === 'ja' ? '2-digit' : 'short',
    timeZone: 'UTC',
    weekday: 'short',
  });

const formatDateOnly = ({
  date,
  language,
}: {
  readonly date: string;
  readonly language: Language;
}): string | null => {
  const matched = DATE_ONLY_PATTERN.exec(date);

  if (matched === null) {
    return null;
  }

  const [, year, month, day] = matched;

  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }

  return getDateOnlyFormatter({ language }).format(
    new Date(
      Date.UTC(
        Number.parseInt(year, 10),
        Number.parseInt(month, 10) - 1,
        Number.parseInt(day, 10)
      )
    )
  );
};

const formatNextCheck = ({
  language,
  nextCheckAt,
  timezone,
}: {
  readonly language: Language;
  readonly nextCheckAt?: string;
  readonly timezone: string;
}): string =>
  nextCheckAt === undefined
    ? getNoNextCheckText(language)
    : (formatDateOnly({ date: nextCheckAt, language }) ??
      formatSlackDateTime({ isoDateTime: nextCheckAt, language, timezone }));

const formatNextCheckLine = ({
  language,
  nextCheckAt,
  nextCheckReason,
  timezone,
}: {
  readonly language: Language;
  readonly nextCheckAt?: string;
  readonly nextCheckReason?: string;
  readonly timezone: string;
}): string => {
  const nextCheck = formatNextCheck({
    language,
    ...(nextCheckAt === undefined ? {} : { nextCheckAt }),
    timezone,
  });
  const reason =
    nextCheckReason === undefined || nextCheckReason.trim().length === 0
      ? ''
      : ` - ${nextCheckReason.trim()}`;

  return `*${getNextCheckLabel(language)}:* ${nextCheck}${reason}`;
};

const sectionBlock = (text: string): KnownBlock => ({
  text: {
    text,
    type: 'mrkdwn',
  },
  type: 'section',
});

const contextBlock = (text: string): KnownBlock => ({
  elements: [
    {
      text: normalizeSlackMrkdwn(text),
      type: 'mrkdwn',
    },
  ],
  type: 'context',
});

const formatChannelUpdate = ({
  language,
  timezone,
  update,
}: {
  readonly language: Language;
  readonly timezone: string;
  readonly update: CallSummaryChannelUpdate;
}): string =>
  [
    `*#${update.channelName}*`,
    `*${getChannelLatestInfoHeading(language)}*`,
    removeBlankLines(update.statusText),
    formatNextCheckLine({
      language,
      ...(update.nextCheckAt === undefined
        ? {}
        : { nextCheckAt: update.nextCheckAt }),
      ...(update.nextCheckReason === undefined
        ? {}
        : { nextCheckReason: update.nextCheckReason }),
      timezone,
    }),
  ].join('\n');

export const buildCallSummaryFallbackText = ({
  language,
  overview,
  updates,
}: {
  readonly language: Language;
  readonly overview?: string;
  readonly updates: readonly CallSummaryChannelUpdate[];
}): string =>
  overview === undefined
    ? updates.length === 0
      ? `${getCallSummaryHeading(language)}\n\n${getNoChangedUpdatesText(
          language
        )}`
      : getCallSummaryHeading(language)
    : `${getCallSummaryHeading(language)}\n\n${overview}`;

export const buildCallSummaryBlocks = ({
  language,
  overview,
  timezone,
  updates,
}: {
  readonly language: Language;
  readonly overview?: string;
  readonly timezone: string;
  readonly updates: readonly CallSummaryChannelUpdate[];
}): readonly KnownBlock[] => [
  sectionBlock(`*${getCallSummaryHeading(language)}*`),
  ...(overview === undefined ? [] : [sectionBlock(overview)]),
  ...(updates.length === 0
    ? [contextBlock(getNoChangedUpdatesText(language))]
    : updates.map((update) =>
        contextBlock(formatChannelUpdate({ language, timezone, update }))
      )),
];
