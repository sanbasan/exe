'use client';

import { getMeeting, getMeetings } from '#app/web/api-client';
import type { SlackMember } from '#app/web/api-schemas';
import { formatDurationBadge, formatMeetingDate } from '#app/web/format';
import { MeetingDetail } from '#app/web/meeting-detail';
import { Spinner } from '#app/web/spinner';
import type { Meeting, MeetingStatus, WorkTask } from '@exe/domain';
import { useEffect, useState, type JSX } from 'react';

// eslint-disable-next-line functional/no-mixed-types -- Props mix a change callback with data fields, which is intrinsic to a React component prop bag.
interface MeetingsTabProps {
  readonly members: readonly SlackMember[];
  readonly onTasksChanged: () => void;
  readonly pinnedMeetingId?: string;
  readonly tasks: readonly WorkTask[];
  readonly workspaceId: string;
}

const POLL_INTERVAL_MS = 3000;

const sortNewestFirst = (meetings: readonly Meeting[]): readonly Meeting[] =>
  meetings.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));

const meetingTitle = (meeting: Meeting): string => {
  if (meeting.status === 'processing') {
    return 'Processing…';
  }
  if (meeting.title !== undefined && meeting.title !== '') {
    return meeting.title;
  }
  return 'Untitled meeting';
};

const StatusChip = ({
  status,
}: {
  readonly status: MeetingStatus;
}): JSX.Element | null => {
  if (status === 'processing') {
    return (
      <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn">
        <Spinner className="h-3 w-3" />
        Processing
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
      Ready
    </span>
  );
};

const Chevron = ({ expanded }: { readonly expanded: boolean }): JSX.Element => (
  <svg
    aria-hidden
    className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
    fill="none"
    viewBox="0 0 20 20"
  >
    <path
      d="M6 8l4 4 4-4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

const MeetingRow = ({
  expanded,
  meeting,
  members,
  onToggle,
  pinned,
  taskById,
}: {
  readonly expanded: boolean;
  readonly meeting: Meeting;
  readonly members: readonly SlackMember[];
  readonly onToggle: () => void;
  readonly pinned: boolean;
  readonly taskById: ReadonlyMap<string, WorkTask>;
}): JSX.Element => {
  const hasDuration = meeting.durationSeconds !== undefined;
  const hasError =
    meeting.status === 'failed' &&
    meeting.error !== undefined &&
    meeting.error !== '';
  return (
    <div
      className={`rounded-xl border bg-white ${pinned ? 'border-line ring-2 ring-accent' : 'border-line'}`}
    >
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={onToggle}
        type="button"
      >
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">
              {meetingTitle(meeting)}
            </span>
            <StatusChip status={meeting.status} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>{formatMeetingDate(meeting.createdAt)}</span>
            {hasDuration ? (
              <span className="rounded-full bg-canvas px-1.5 py-0.5">
                {formatDurationBadge(meeting.durationSeconds ?? 0)}
              </span>
            ) : null}
          </div>
          {hasError ? (
            <p className="text-xs text-danger">{meeting.error}</p>
          ) : null}
        </div>
        <Chevron expanded={expanded} />
      </button>
      {expanded ? (
        <div className="border-t border-line px-4 py-4">
          <MeetingDetail
            meeting={meeting}
            members={members}
            taskById={taskById}
          />
        </div>
      ) : null}
    </div>
  );
};

export const MeetingsTab = ({
  members,
  onTasksChanged,
  pinnedMeetingId,
  tasks,
  workspaceId,
}: MeetingsTabProps): JSX.Element => {
  const [meetings, setMeetings] = useState<readonly Meeting[] | null>(null);
  const [errored, setErrored] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const taskById = new Map(tasks.map((task) => [task.id, task]));

  const reload = async (): Promise<void> => {
    try {
      const fetched = await getMeetings({ workspaceId });
      setErrored(false);
      setMeetings(sortNewestFirst(fetched));
    } catch {
      setErrored(true);
    }
  };

  const refreshProcessing = async ({
    ids,
  }: {
    readonly ids: readonly string[];
  }): Promise<void> => {
    const results = await Promise.all(
      ids.map((meetingId) =>
        getMeeting({ meetingId, workspaceId }).catch(() => null)
      )
    );
    const resolved = results.filter((item): item is Meeting => item !== null);
    if (resolved.length === 0) {
      return;
    }
    if (resolved.some((item) => item.status === 'completed')) {
      onTasksChanged();
    }
    const freshById = new Map(resolved.map((item) => [item.id, item]));
    setMeetings((current) =>
      current === null
        ? current
        : current.map((item) => freshById.get(item.id) ?? item)
    );
  };

  useEffect(() => {
    void reload();
  }, [workspaceId]);

  useEffect(() => {
    if (pinnedMeetingId === undefined) {
      return;
    }
    void reload();
  }, [pinnedMeetingId]);

  const processingIds = (meetings ?? [])
    .filter((meeting) => meeting.status === 'processing')
    .map((meeting) => meeting.id);
  const processingKey = processingIds.join(',');

  useEffect(() => {
    if (processingKey === '') {
      return;
    }
    const intervalId = setInterval(() => {
      void refreshProcessing({ ids: processingKey.split(',') });
    }, POLL_INTERVAL_MS);
    return (): void => {
      clearInterval(intervalId);
    };
  }, [processingKey]);

  if (errored) {
    return <p className="text-sm text-danger">Could not load meetings.</p>;
  }
  if (meetings === null) {
    return (
      <div className="flex justify-center py-10 text-accent">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (meetings.length === 0) {
    return (
      <p className="text-sm text-muted">
        No meetings yet. Record your first meeting.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {meetings.map((meeting) => (
        <MeetingRow
          key={meeting.id}
          expanded={expandedId === meeting.id}
          meeting={meeting}
          members={members}
          onToggle={() => {
            setExpandedId((current) =>
              current === meeting.id ? null : meeting.id
            );
          }}
          pinned={meeting.id === pinnedMeetingId}
          taskById={taskById}
        />
      ))}
    </div>
  );
};
