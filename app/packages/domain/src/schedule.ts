import type { CallSchedule } from './call';

interface LocalDateParts {
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

interface LocalDateTimeParts extends LocalDateParts {
  readonly hour: number;
  readonly minute: number;
}

interface LocalTime {
  readonly hour: number;
  readonly minute: number;
}

const SCHEDULE_SEARCH_DAYS = 370;

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
}): string => {
  const part = parts.find((candidate) => candidate.type === type);

  if (part === undefined) {
    throw new Error(`Missing date part: ${type}`);
  }

  return part.value;
};

const getLocalDateTimeParts = ({
  date,
  timezone,
}: {
  readonly date: Date;
  readonly timezone: string;
}): LocalDateTimeParts => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  });
  const parts = formatter.formatToParts(date);

  return {
    day: parseNumber(getPartValue({ parts, type: 'day' })),
    hour: parseNumber(getPartValue({ parts, type: 'hour' })),
    minute: parseNumber(getPartValue({ parts, type: 'minute' })),
    month: parseNumber(getPartValue({ parts, type: 'month' })),
    year: parseNumber(getPartValue({ parts, type: 'year' })),
  };
};

const parseTimeOfDay = (timeOfDay: string): LocalTime => {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/u.exec(timeOfDay);

  if (match === null) {
    throw new Error('timeOfDay must be HH:mm.');
  }

  return {
    hour: parseNumber(timeOfDay.slice(0, 2)),
    minute: parseNumber(timeOfDay.slice(3, 5)),
  };
};

const toDateOnly = ({ day, month, year }: LocalDateParts): string =>
  `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0'
  )}`;

const getLocalWeekday = (parts: LocalDateParts): number =>
  new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();

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

const localDateTimeToUtcDate = ({
  parts,
  timezone,
}: {
  readonly parts: LocalDateTimeParts;
  readonly timezone: string;
}): Date => {
  const guessedUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  );
  const actualLocal = getLocalDateTimeParts({
    date: new Date(guessedUtcMs),
    timezone,
  });
  const actualLocalMs = Date.UTC(
    actualLocal.year,
    actualLocal.month - 1,
    actualLocal.day,
    actualLocal.hour,
    actualLocal.minute
  );
  const desiredLocalMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  );

  return new Date(guessedUtcMs + desiredLocalMs - actualLocalMs);
};

const isRunnableLocalDate = ({
  parts,
  schedule,
}: {
  readonly parts: LocalDateParts;
  readonly schedule: CallSchedule;
}): boolean =>
  schedule.weekdays.includes(getLocalWeekday(parts)) &&
  !schedule.excludedDates.includes(toDateOnly(parts));

export const calculateNextRunAt = ({
  after,
  schedule,
}: {
  readonly after: Date;
  readonly schedule: CallSchedule;
}): string | null => {
  if (!schedule.enabled || schedule.weekdays.length === 0) {
    return null;
  }

  const localNow = getLocalDateTimeParts({
    date: after,
    timezone: schedule.timezone,
  });
  const time = parseTimeOfDay(schedule.timeOfDay);
  const candidateOffsets = Array.from(
    { length: SCHEDULE_SEARCH_DAYS },
    (_value, index) => index
  );
  const nextRun = candidateOffsets
    .map((days) => addDaysToLocalDate({ days, parts: localNow }))
    .filter((parts) => isRunnableLocalDate({ parts, schedule }))
    .map((parts) =>
      localDateTimeToUtcDate({
        parts: {
          ...parts,
          ...time,
        },
        timezone: schedule.timezone,
      })
    )
    .find((candidate) => candidate.getTime() > after.getTime());

  if (nextRun === undefined) {
    return null;
  }

  return nextRun.toISOString();
};
