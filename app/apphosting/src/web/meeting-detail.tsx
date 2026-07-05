'use client';

import type { SlackMember } from '#app/web/api-schemas';
import { Spinner } from '#app/web/spinner';
import type {
  Meeting,
  MeetingDependency,
  MeetingNotes,
  WorkTask,
} from '@exe/domain';
import { useState, type JSX } from 'react';

interface MeetingDetailProps {
  readonly meeting: Meeting;
  readonly members: readonly SlackMember[];
  readonly taskById: ReadonlyMap<string, WorkTask>;
}

const ParticipantsSection = ({
  members,
  participantSlackUserIds,
}: {
  readonly members: readonly SlackMember[];
  readonly participantSlackUserIds: readonly string[];
}): JSX.Element | null => {
  if (participantSlackUserIds.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading>Participants</SectionHeading>
      <div className="flex flex-wrap gap-1.5">
        {participantSlackUserIds.map((id) => (
          <span
            className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-ink"
            key={id}
          >
            {members.find((member) => member.slackUserId === id)?.displayName ??
              id}
          </span>
        ))}
      </div>
    </section>
  );
};

const statusDotClass: Readonly<Record<WorkTask['status'], string>> = {
  active: 'bg-accent',
  blocked: 'bg-warn',
  cancelled: 'bg-muted',
  completed: 'bg-accent',
};

const speakerPattern = /^(Speaker \d+:)(.*)$/;

const SectionHeading = ({
  children,
}: {
  readonly children: string;
}): JSX.Element => (
  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
    {children}
  </h4>
);

const BulletList = ({
  items,
}: {
  readonly items: readonly string[];
}): JSX.Element => (
  <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
    {items.map((item, index) => (
      <li key={index}>{item}</li>
    ))}
  </ul>
);

const TaskItem = ({
  id,
  taskById,
}: {
  readonly id: string;
  readonly taskById: ReadonlyMap<string, WorkTask>;
}): JSX.Element => {
  const task = taskById.get(id);
  return (
    <li className="flex items-center gap-2 text-sm text-ink">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${task !== undefined ? statusDotClass[task.status] : 'bg-line'}`}
      />
      <span>{task?.title ?? id}</span>
    </li>
  );
};

const TaskListSection = ({
  heading,
  ids,
  taskById,
}: {
  readonly heading: string;
  readonly ids: readonly string[];
  readonly taskById: ReadonlyMap<string, WorkTask>;
}): JSX.Element | null => {
  if (ids.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading>{heading}</SectionHeading>
      <ul className="flex flex-col gap-1.5">
        {ids.map((id) => (
          <TaskItem key={id} id={id} taskById={taskById} />
        ))}
      </ul>
    </section>
  );
};

const DependencyItem = ({
  dependency,
  taskById,
}: {
  readonly dependency: MeetingDependency;
  readonly taskById: ReadonlyMap<string, WorkTask>;
}): JSX.Element => {
  const blocked =
    taskById.get(dependency.blockedTaskId)?.title ?? dependency.blockedTaskId;
  const blocker =
    taskById.get(dependency.blockerTaskId)?.title ?? dependency.blockerTaskId;
  return (
    <li className="text-sm text-ink">
      &ldquo;{blocked}&rdquo; is blocked by &ldquo;{blocker}&rdquo;
    </li>
  );
};

const DependenciesSection = ({
  dependencies,
  taskById,
}: {
  readonly dependencies: readonly MeetingDependency[];
  readonly taskById: ReadonlyMap<string, WorkTask>;
}): JSX.Element | null => {
  if (dependencies.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading>Dependencies</SectionHeading>
      <ul className="flex flex-col gap-1.5">
        {dependencies.map((dependency, index) => (
          <DependencyItem
            key={`${dependency.blockerTaskId}-${dependency.blockedTaskId}-${String(index)}`}
            dependency={dependency}
            taskById={taskById}
          />
        ))}
      </ul>
    </section>
  );
};

const NotesSection = ({
  notes,
}: {
  readonly notes: MeetingNotes;
}): JSX.Element | null => {
  const hasOverview = notes.overview !== undefined && notes.overview !== '';
  const hasKeyPoints = notes.keyPoints.length > 0;
  const hasDecisions = notes.decisions.length > 0;
  if (!hasOverview && !hasKeyPoints && !hasDecisions) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Notes</SectionHeading>
      {hasOverview ? (
        <p className="text-sm leading-relaxed text-ink">{notes.overview}</p>
      ) : null}
      {hasKeyPoints ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted">Key points</p>
          <BulletList items={notes.keyPoints} />
        </div>
      ) : null}
      {hasDecisions ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted">Decisions</p>
          <BulletList items={notes.decisions} />
        </div>
      ) : null}
    </section>
  );
};

const TranscriptLine = ({ line }: { readonly line: string }): JSX.Element => {
  const match = speakerPattern.exec(line);
  if (match === null) {
    return <div className="text-muted">{line === '' ? ' ' : line}</div>;
  }
  return (
    <div>
      <span className="font-medium text-ink">{match[1]}</span>
      <span className="text-muted">{match[2]}</span>
    </div>
  );
};

const TranscriptSection = ({
  transcript,
}: {
  readonly transcript: string;
}): JSX.Element => {
  const [shown, setShown] = useState(false);
  const lines = transcript.split('\n');
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        className="self-start text-xs font-semibold uppercase tracking-wide text-accent"
        onClick={() => {
          setShown((prev) => !prev);
        }}
      >
        {shown ? 'Hide transcript' : 'Show transcript'}
      </button>
      {shown ? (
        <div className="whitespace-pre-wrap break-words rounded-lg border border-line bg-canvas p-3 text-sm leading-relaxed">
          {lines.map((line, index) => (
            <TranscriptLine key={index} line={line} />
          ))}
        </div>
      ) : null}
    </section>
  );
};

export const MeetingDetail = ({
  meeting,
  members,
  taskById,
}: MeetingDetailProps): JSX.Element => {
  if (meeting.status === 'processing') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="h-3.5 w-3.5" />
        <span>Transcribing and extracting tasks…</span>
      </div>
    );
  }
  if (meeting.status === 'failed') {
    const hasError = meeting.error !== undefined && meeting.error !== '';
    return (
      <p className="text-sm text-danger">
        {hasError
          ? meeting.error
          : 'Something went wrong while processing this meeting.'}
      </p>
    );
  }
  const hasSummary = meeting.summary !== undefined && meeting.summary !== '';
  const hasTranscript =
    meeting.transcript !== undefined && meeting.transcript !== '';
  return (
    <div className="flex flex-col gap-5">
      <ParticipantsSection
        members={members}
        participantSlackUserIds={meeting.participantSlackUserIds}
      />
      {meeting.notes !== undefined ? (
        <NotesSection notes={meeting.notes} />
      ) : null}
      {hasSummary ? (
        <section className="flex flex-col gap-2">
          <SectionHeading>Summary</SectionHeading>
          <p className="text-sm leading-relaxed text-ink">{meeting.summary}</p>
        </section>
      ) : null}
      <TaskListSection
        heading="Created tasks"
        ids={meeting.createdTaskIds}
        taskById={taskById}
      />
      <TaskListSection
        heading="Updated tasks"
        ids={meeting.updatedTaskIds}
        taskById={taskById}
      />
      <DependenciesSection
        dependencies={meeting.dependencies}
        taskById={taskById}
      />
      {hasTranscript ? (
        <TranscriptSection transcript={meeting.transcript ?? ''} />
      ) : null}
    </div>
  );
};
