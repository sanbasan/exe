'use client';

import { createTask, updateTask } from '#app/web/api-client';
import { dateInputToIso, toDateInputValue } from '#app/web/format';
import type { TaskStatus, WorkTask } from '@exe/domain';
import type { JSX } from 'react';

// Form model and save helpers for the task slide-over panel.

export interface FormState {
  readonly assigneeSlackUserIds: readonly string[];
  readonly channelId: string;
  readonly description: string;
  readonly dueDate: string;
  readonly startDate: string;
  readonly status: TaskStatus;
  readonly title: string;
}

export const initialForm = ({
  task,
}: {
  readonly task?: WorkTask;
}): FormState => ({
  assigneeSlackUserIds: task?.assigneeSlackUserIds ?? [],
  channelId: task?.channelId ?? '',
  description: task?.description ?? '',
  dueDate: toDateInputValue({
    ...(task?.dueAt !== undefined ? { iso: task.dueAt } : {}),
  }),
  startDate: toDateInputValue({
    ...(task?.startAt !== undefined ? { iso: task.startAt } : {}),
  }),
  status: task?.status ?? 'active',
  title: task?.title ?? '',
});

export const labelClass =
  'text-xs font-semibold uppercase tracking-wide text-muted';

export const fieldClass =
  'mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent';

export const STATUS_OPTIONS: readonly {
  readonly label: string;
  readonly value: TaskStatus;
}[] = [
  { label: 'Active', value: 'active' },
  { label: 'Blocked', value: 'blocked' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

export const DateField = ({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}): JSX.Element => (
  <div className="flex-1">
    <span className={labelClass}>{label}</span>
    <div className="flex items-center gap-1">
      <input
        className={fieldClass}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        type="date"
        value={value}
      />
      {value !== '' ? (
        <button
          aria-label={`Clear ${label.toLowerCase()}`}
          className="mt-1 rounded px-1.5 py-1 text-xs text-muted hover:text-danger"
          onClick={() => {
            onChange('');
          }}
          type="button"
        >
          Clear
        </button>
      ) : null}
    </div>
  </div>
);

export const saveExisting = async ({
  form,
  taskId,
  workspaceId,
}: {
  readonly form: FormState;
  readonly taskId: string;
  readonly workspaceId: string;
}): Promise<void> => {
  const description = form.description.trim();
  await updateTask({
    after: {
      assigneeSlackUserIds: [...form.assigneeSlackUserIds],
      description: description === '' ? null : description,
      dueAt: dateInputToIso(form.dueDate),
      kind: 'work',
      startAt: dateInputToIso(form.startDate),
      status: form.status,
      title: form.title.trim(),
    },
    taskId,
    workspaceId,
  });
};

export const saveNew = async ({
  form,
  workspaceId,
}: {
  readonly form: FormState;
  readonly workspaceId: string;
}): Promise<void> => {
  const description = form.description.trim();
  const dueAt = dateInputToIso(form.dueDate);
  const startAt = dateInputToIso(form.startDate);
  await createTask({
    input: {
      assigneeSlackUserIds: form.assigneeSlackUserIds,
      ...(form.channelId !== '' ? { channelId: form.channelId } : {}),
      ...(description !== '' ? { description } : {}),
      ...(dueAt !== null ? { dueAt } : {}),
      ...(startAt !== null ? { startAt } : {}),
      title: form.title.trim(),
    },
    workspaceId,
  });
};
