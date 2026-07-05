import { calculateDefaultDueAt } from '@exe/domain';

interface LocalDateTimeParts {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly month: number;
  readonly second: number;
  readonly year: number;
}

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
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(date);

  return {
    day: parseNumber(getPartValue({ parts, type: 'day' })),
    hour: parseNumber(getPartValue({ parts, type: 'hour' })),
    minute: parseNumber(getPartValue({ parts, type: 'minute' })),
    month: parseNumber(getPartValue({ parts, type: 'month' })),
    second: parseNumber(getPartValue({ parts, type: 'second' })),
    year: parseNumber(getPartValue({ parts, type: 'year' })),
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
    parts.minute,
    parts.second
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
    actualLocal.minute,
    actualLocal.second
  );
  const desiredLocalMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return new Date(guessedUtcMs + desiredLocalMs - actualLocalMs);
};

const formatTwoDigits = (value: number): string =>
  value.toString().padStart(2, '0');

export const formatCurrentDateTime = ({
  now,
  timezone,
}: {
  readonly now: string;
  readonly timezone: string;
}): string => {
  const parts = getLocalDateTimeParts({
    date: new Date(now),
    timezone: timezone === '' ? 'UTC' : timezone,
  });

  return `${String(parts.year)}-${formatTwoDigits(parts.month)}-${formatTwoDigits(parts.day)}T${formatTwoDigits(parts.hour)}:${formatTwoDigits(parts.minute)}:${formatTwoDigits(parts.second)}`;
};

export const parseDueAt = ({
  dueAt,
  now,
  timezone,
}: {
  readonly dueAt?: string;
  readonly now: string;
  readonly timezone: string;
}): string => {
  if (dueAt === undefined || dueAt.length === 0) {
    return calculateDefaultDueAt({ now, timezone });
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(
    dueAt
  );

  if (match === null) {
    return calculateDefaultDueAt({ now, timezone });
  }

  const [, year, month, day, hour, minute, second] = match;

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    return calculateDefaultDueAt({ now, timezone });
  }

  const parsed = localDateTimeToUtcDate({
    parts: {
      day: parseNumber(day),
      hour: parseNumber(hour),
      minute: parseNumber(minute),
      month: parseNumber(month),
      second: second === undefined ? 0 : parseNumber(second),
      year: parseNumber(year),
    },
    timezone: timezone === '' ? 'UTC' : timezone,
  });

  return Number.isNaN(parsed.getTime())
    ? calculateDefaultDueAt({ now, timezone })
    : parsed.toISOString();
};
