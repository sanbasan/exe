/**
 * Classifies a task due date relative to "now" in a given timezone so the call
 * agent can proactively remind the user about tasks that are due today or the
 * next day (and flag overdue tasks). Day boundaries are evaluated in the
 * workspace timezone, not UTC, so "today" matches what the user expects.
 */
export type DueReminderCategory = 'later' | 'overdue' | 'today' | 'tomorrow';

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

// A bare local calendar date (no time, no offset). Such a value already names
// the intended day in the workspace timezone, so it must not be routed through
// Date parsing (which reads it as UTC midnight and shifts the day in
// negative-offset timezones).
const DATE_ONLY_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/;

// Number of whole days from the Unix epoch to the given instant, evaluated in
// the provided timezone. Comparing these ordinals yields the local day delta
// regardless of UTC offsets or DST.
const getLocalDayOrdinal = ({
  isoDateTime,
  timezone,
}: {
  readonly isoDateTime: string;
  readonly timezone: string;
}): number => {
  const dateOnly = DATE_ONLY_PATTERN.exec(isoDateTime);

  if (dateOnly?.groups !== undefined) {
    return Math.floor(
      Date.UTC(
        parseNumber(dateOnly.groups['year'] ?? ''),
        parseNumber(dateOnly.groups['month'] ?? '') - 1,
        parseNumber(dateOnly.groups['day'] ?? '')
      ) / 86_400_000
    );
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(new Date(isoDateTime));

  const year = parseNumber(getPartValue({ parts, type: 'year' }));
  const month = parseNumber(getPartValue({ parts, type: 'month' }));
  const day = parseNumber(getPartValue({ parts, type: 'day' }));

  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
};

// A value getLocalDayOrdinal can evaluate without throwing: either a bare
// calendar date or something Date can parse to a real instant.
const isReadableDateTime = (value: string): boolean =>
  DATE_ONLY_PATTERN.test(value) || !Number.isNaN(new Date(value).getTime());

export const classifyDueAt = ({
  dueAt,
  now,
  timezone,
}: {
  readonly dueAt?: string;
  readonly now: string;
  readonly timezone: string;
}): DueReminderCategory | null => {
  if (
    dueAt === undefined ||
    dueAt.length === 0 ||
    !isReadableDateTime(dueAt) ||
    !isReadableDateTime(now)
  ) {
    return null;
  }

  const tz = timezone === '' ? 'UTC' : timezone;
  const dueDay = getLocalDayOrdinal({ isoDateTime: dueAt, timezone: tz });
  const nowDay = getLocalDayOrdinal({ isoDateTime: now, timezone: tz });
  const dayDelta = dueDay - nowDay;

  if (dayDelta < 0) {
    return 'overdue';
  }

  if (dayDelta === 0) {
    return 'today';
  }

  if (dayDelta === 1) {
    return 'tomorrow';
  }

  return 'later';
};

// Whether the category warrants an active reminder during the call. Tasks due
// today or tomorrow, and overdue tasks, should be surfaced proactively.
export const isDueReminderCategory = (
  category: DueReminderCategory | null
): category is 'overdue' | 'today' | 'tomorrow' =>
  category === 'overdue' || category === 'today' || category === 'tomorrow';
