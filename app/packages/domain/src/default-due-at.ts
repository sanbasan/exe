interface LocalDateTimeParts {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly month: number;
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
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(date);

  return {
    day: parseNumber(getPartValue({ parts, type: 'day' })),
    hour: parseNumber(getPartValue({ parts, type: 'hour' })),
    minute: parseNumber(getPartValue({ parts, type: 'minute' })),
    month: parseNumber(getPartValue({ parts, type: 'month' })),
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

/**
 * Calculate the default due date based on the current time in the workspace
 * timezone. Mirrors the task-creation default:
 * - Before 17:00 -> same day 18:00
 * - Between 17:00 and 23:00 (exclusive) -> same day 23:59
 * - 23:00 or later -> next day 18:00
 */
export const calculateDefaultDueAt = ({
  now,
  timezone,
}: {
  readonly now: string;
  readonly timezone: string;
}): string => {
  const tz = timezone === '' ? 'UTC' : timezone;
  const localNow = getLocalDateTimeParts({ date: new Date(now), timezone: tz });

  const { addDays, targetHour, targetMinute } = ((): {
    readonly addDays: number;
    readonly targetHour: number;
    readonly targetMinute: number;
  } => {
    if (localNow.hour < 17) {
      return { addDays: 0, targetHour: 18, targetMinute: 0 };
    }

    if (localNow.hour < 23) {
      return { addDays: 0, targetHour: 23, targetMinute: 59 };
    }

    return { addDays: 1, targetHour: 18, targetMinute: 0 };
  })();

  const shifted = new Date(
    Date.UTC(localNow.year, localNow.month - 1, localNow.day + addDays)
  );

  return localDateTimeToUtcDate({
    parts: {
      day: shifted.getUTCDate(),
      hour: targetHour,
      minute: targetMinute,
      month: shifted.getUTCMonth() + 1,
      year: shifted.getUTCFullYear(),
    },
    timezone: tz,
  }).toISOString();
};
