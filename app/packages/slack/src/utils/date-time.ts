import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';

interface FormatDateTimeParams {
  readonly isoDateTime: string;
  readonly language: Language;
  readonly timezone: string;
}

interface LocalDateTimeParams {
  readonly date: string;
  readonly time?: string;
  readonly timezone: string;
}

interface DateTimeParts {
  readonly day: string;
  readonly hour: string;
  readonly minute: string;
  readonly month: string;
  readonly weekday: string;
  readonly year: string;
}

const localeForLanguage = dispatcher<Language, string>({
  en: 'en-US',
  ja: 'ja-JP',
});

const getPartValue = (
  parts: ReadonlyMap<Intl.DateTimeFormatPartTypes, string>,
  type: Intl.DateTimeFormatPartTypes
): string => parts.get(type) ?? '';

const getDateTimeParts = ({
  date,
  language,
  timezone,
}: {
  readonly date: Date;
  readonly language: Language;
  readonly timezone: string;
}): DateTimeParts => {
  const entries = new Intl.DateTimeFormat(localeForLanguage(language), {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
  }).formatToParts(date);
  const parts = new Map(
    entries.map((part) => [part.type, part.value] as const)
  );

  return {
    day: getPartValue(parts, 'day'),
    hour: getPartValue(parts, 'hour'),
    minute: getPartValue(parts, 'minute'),
    month: getPartValue(parts, 'month'),
    weekday: getPartValue(parts, 'weekday'),
    year: getPartValue(parts, 'year'),
  };
};

const parseDateTime = (isoDateTime: string): Date | null => {
  const date = new Date(isoDateTime);

  return Number.isNaN(date.getTime()) ? null : date;
};

const getEnglishPart = (
  parts: ReadonlyMap<Intl.DateTimeFormatPartTypes, string>,
  type: Intl.DateTimeFormatPartTypes
): string => parts.get(type) ?? '';

// Unified English date/time presentation: `Jun 28 (Sun) 2:59 PM` with no
// zero-padding on the day or hour.
export const formatEnglishDateTime = ({
  date,
  timezone,
}: {
  readonly date: Date;
  readonly timezone: string;
}): string => {
  const entries = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
    month: 'short',
    timeZone: timezone,
    weekday: 'short',
  }).formatToParts(date);
  const parts = new Map(
    entries.map((part) => [part.type, part.value] as const)
  );

  return `${getEnglishPart(parts, 'month')} ${getEnglishPart(
    parts,
    'day'
  )} (${getEnglishPart(parts, 'weekday')}) ${getEnglishPart(
    parts,
    'hour'
  )}:${getEnglishPart(parts, 'minute')} ${getEnglishPart(parts, 'dayPeriod')}`;
};

export const formatSlackDateTime = ({
  isoDateTime,
  language,
  timezone,
}: FormatDateTimeParams): string => {
  const date = parseDateTime(isoDateTime);

  if (date === null) {
    return isoDateTime;
  }

  if (language === 'en') {
    return formatEnglishDateTime({ date, timezone });
  }

  const parts = getDateTimeParts({ date, language, timezone });

  return `${parts.month}/${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute}`;
};

export const formatSlackDateInput = ({
  isoDateTime,
  timezone,
}: {
  readonly isoDateTime: string;
  readonly timezone: string;
}): string | null => {
  const date = parseDateTime(isoDateTime);

  if (date === null) {
    return null;
  }

  const parts = getDateTimeParts({ date, language: 'en', timezone });

  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const formatSlackTimeInput = ({
  isoDateTime,
  timezone,
}: {
  readonly isoDateTime: string;
  readonly timezone: string;
}): string | null => {
  const date = parseDateTime(isoDateTime);

  if (date === null) {
    return null;
  }

  const parts = getDateTimeParts({ date, language: 'en', timezone });

  return `${parts.hour}:${parts.minute}`;
};

const parseDateParts = (
  date: string
): {
  readonly day: number;
  readonly month: number;
  readonly year: number;
} | null => {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);

  if (matched === null) {
    return null;
  }

  const [, year, month, day] = matched;

  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }

  return {
    day: Number.parseInt(day, 10),
    month: Number.parseInt(month, 10),
    year: Number.parseInt(year, 10),
  };
};

const parseTimeParts = (
  time: string
): { readonly hour: number; readonly minute: number } | null => {
  const matched = /^(\d{2}):(\d{2})$/u.exec(time);

  if (matched === null) {
    return null;
  }

  const [, hour, minute] = matched;

  if (hour === undefined || minute === undefined) {
    return null;
  }

  return {
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10),
  };
};

const getLocalTimestamp = ({
  date,
  timezone,
}: {
  readonly date: Date;
  readonly timezone: string;
}): number => {
  const parts = getDateTimeParts({ date, language: 'en', timezone });

  return Date.UTC(
    Number.parseInt(parts.year, 10),
    Number.parseInt(parts.month, 10) - 1,
    Number.parseInt(parts.day, 10),
    Number.parseInt(parts.hour, 10),
    Number.parseInt(parts.minute, 10)
  );
};

export const localDateTimeToIso = ({
  date,
  time = '00:00',
  timezone,
}: LocalDateTimeParams): string | null => {
  const dateParts = parseDateParts(date);
  const timeParts = parseTimeParts(time);

  if (dateParts === null || timeParts === null) {
    return null;
  }

  const targetTimestamp = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute
  );
  const firstGuess = new Date(targetTimestamp);
  const firstOffset =
    targetTimestamp -
    getLocalTimestamp({
      date: firstGuess,
      timezone,
    });
  const secondGuess = new Date(targetTimestamp + firstOffset);
  const secondOffset =
    targetTimestamp -
    getLocalTimestamp({
      date: secondGuess,
      timezone,
    });

  // `secondOffset` is the residual correction relative to `secondGuess` (the
  // first converged estimate), so it must be applied on top of that guess. A DST
  // transition can leave a non-zero residual, which this second step absorbs.
  return new Date(targetTimestamp + firstOffset + secondOffset).toISOString();
};

export const toLocalDay = ({
  isoDateTime,
  timezone,
}: {
  readonly isoDateTime: string;
  readonly timezone: string;
}): string | null => formatSlackDateInput({ isoDateTime, timezone });
