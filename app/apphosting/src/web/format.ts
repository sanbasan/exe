// Formatting helpers shared across the browser app. Pure functions only so
// they can run in any client component without pulling in React.

const meetingDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dayLabelFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
});

export const formatClock = (totalSeconds: number): string => {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const formatDurationBadge = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes === 0) {
    return `${String(remainder)}s`;
  }
  return `${String(minutes)}m ${String(remainder).padStart(2, '0')}s`;
};

export const formatMeetingDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return meetingDateFormatter.format(date);
};

export const formatDayLabel = (dayNumber: number): string => {
  const date = new Date(dayNumber * 86_400_000);
  return dayLabelFormatter.format(date);
};

export const toDateInputValue = ({
  iso,
}: {
  readonly iso?: string;
}): string => {
  if (iso === undefined) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const dateInputToIso = (value: string): string | null => {
  if (value === '') {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const { result } = reader;
      if (typeof result !== 'string') {
        reject(new Error('Could not read the recording.'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    });
    reader.addEventListener('error', () => {
      reject(new Error('Could not read the recording.'));
    });
    reader.readAsDataURL(blob);
  });
