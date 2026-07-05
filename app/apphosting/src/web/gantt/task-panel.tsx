'use client';

import type { ChannelSummary, SlackMember } from '#app/web/api-schemas';
import { DependencyEditor } from '#app/web/gantt/deps-editor';
import {
  DateField,
  fieldClass,
  initialForm,
  labelClass,
  STATUS_OPTIONS,
  saveExisting,
  saveNew,
  type FormState,
} from '#app/web/gantt/task-panel-form';
import { MemberMultiSelect } from '#app/web/member-multi-select';
import { Spinner } from '#app/web/spinner';
import type { WorkTask } from '@exe/domain';
import { useState, type JSX } from 'react';

// Slide-over panel for editing an existing work task or creating a new one.
// Dependency edits (in DependencyEditor) apply immediately; field edits apply
// on Save via a single PATCH.

// eslint-disable-next-line functional/no-mixed-types -- Props mix callbacks with data fields, which is intrinsic to a React component prop bag.
interface TaskPanelProps {
  readonly channels: readonly ChannelSummary[];
  readonly members: readonly SlackMember[];
  readonly onClose: () => void;
  readonly refetchTasks: () => Promise<void>;
  readonly task?: WorkTask;
  readonly tasks: readonly WorkTask[];
  readonly workspaceId: string;
}

export const TaskPanel = ({
  channels,
  members,
  onClose,
  refetchTasks,
  task,
  tasks,
  workspaceId,
}: TaskPanelProps): JSX.Element => {
  const [form, setForm] = useState<FormState>(() =>
    initialForm({ ...(task !== undefined ? { task } : {}) })
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = task === undefined;

  const patch = (partial: Partial<FormState>): void => {
    setForm((previous) => ({ ...previous, ...partial }));
  };

  const save = (): void => {
    if (form.title.trim() === '') {
      setError('Title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    void (async (): Promise<void> => {
      try {
        await (isNew
          ? saveNew({ form, workspaceId })
          : saveExisting({ form, taskId: task.id, workspaceId }));
        await refetchTasks();
        onClose();
      } catch {
        setError('Could not save the task. Try again.');
        setBusy(false);
      }
    })();
  };

  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Close panel"
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        type="button"
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            {isNew ? 'New Task' : 'Edit Task'}
          </h2>
          <button
            className="rounded px-2 py-1 text-sm text-muted hover:text-ink"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className={labelClass}>Title</span>
            <input
              className={fieldClass}
              onChange={(event) => {
                patch({ title: event.target.value });
              }}
              placeholder="What needs to get done?"
              value={form.title}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Description</span>
            <textarea
              className={`${fieldClass} min-h-24 resize-y`}
              onChange={(event) => {
                patch({ description: event.target.value });
              }}
              placeholder="Context for this task — why it exists and how movable it is. This guides later automatic triage of whether the task can be handed off."
              value={form.description}
            />
          </label>
          {isNew ? null : (
            <label className="block">
              <span className={labelClass}>Status</span>
              <select
                className={fieldClass}
                onChange={(event) => {
                  const next = STATUS_OPTIONS.find(
                    (option) => option.value === event.target.value
                  );
                  if (next !== undefined) {
                    patch({ status: next.value });
                  }
                }}
                value={form.status}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div>
            <span className={labelClass}>Assignees</span>
            <div className="mt-1">
              {members.length === 0 ? (
                <p className="text-sm text-muted">No members found.</p>
              ) : (
                <MemberMultiSelect
                  members={members}
                  onChange={(next) => {
                    patch({ assigneeSlackUserIds: next });
                  }}
                  selection={form.assigneeSlackUserIds}
                />
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <DateField
              label="Start"
              onChange={(value) => {
                patch({ startDate: value });
              }}
              value={form.startDate}
            />
            <DateField
              label="Due"
              onChange={(value) => {
                patch({ dueDate: value });
              }}
              value={form.dueDate}
            />
          </div>
          {isNew ? (
            <label className="block">
              <span className={labelClass}>Channel</span>
              <select
                className={fieldClass}
                onChange={(event) => {
                  patch({ channelId: event.target.value });
                }}
                value={form.channelId}
              >
                <option value="">No channel</option>
                {channels.map((channel) => (
                  <option key={channel.channelId} value={channel.channelId}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <DependencyEditor
              refetchTasks={refetchTasks}
              task={task}
              tasks={tasks}
              workspaceId={workspaceId}
            />
          )}
          {error !== null ? (
            <p className="text-sm text-danger">{error}</p>
          ) : null}
          <div className="flex gap-2 pt-2">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-semibold text-white transition hover:bg-accent/90 disabled:opacity-60"
              disabled={busy}
              onClick={save}
              type="button"
            >
              {busy ? <Spinner /> : null}
              {isNew ? 'Create task' : 'Save changes'}
            </button>
            <button
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted hover:text-ink"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
