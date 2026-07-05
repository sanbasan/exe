'use client';

import { addDependency, removeDependency } from '#app/web/api-client';
import type { WorkTask } from '@exe/domain';
import { useState, type JSX } from 'react';

// "Blocked by" editor inside the task panel: remove existing upstream
// blockers, add new ones via a searchable picker, and view the read-only
// downstream "Blocks" list. Edits hit the API immediately, then refetch so
// the chart arrows update.

// eslint-disable-next-line functional/no-mixed-types -- Props mix the refetch callback with data fields, which is intrinsic to a React component prop bag.
interface DependencyEditorProps {
  readonly refetchTasks: () => Promise<void>;
  readonly task: WorkTask;
  readonly tasks: readonly WorkTask[];
  readonly workspaceId: string;
}

const sectionTitleClass =
  'text-xs font-semibold uppercase tracking-wide text-muted';

const resolveTitles = ({
  ids,
  tasks,
}: {
  readonly ids: readonly string[];
  readonly tasks: readonly WorkTask[];
}): readonly { readonly id: string; readonly title: string }[] =>
  ids.map((id) => ({
    id,
    title: tasks.find((candidate) => candidate.id === id)?.title ?? id,
  }));

export const DependencyEditor = ({
  refetchTasks,
  task,
  tasks,
  workspaceId,
}: DependencyEditorProps): JSX.Element => {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockers = resolveTitles({ ids: task.dependsOnTaskIds, tasks });
  const blocks = resolveTitles({ ids: task.dependentTaskIds, tasks });

  const trimmedQuery = query.trim().toLowerCase();
  const candidates =
    trimmedQuery === ''
      ? []
      : tasks
          .filter(
            (candidate) =>
              candidate.id !== task.id &&
              !task.dependsOnTaskIds.includes(candidate.id) &&
              candidate.title.toLowerCase().includes(trimmedQuery)
          )
          .slice(0, 8);

  const runMutation = (mutation: () => Promise<void>): void => {
    setBusy(true);
    setError(null);
    void (async (): Promise<void> => {
      try {
        await mutation();
        await refetchTasks();
        setQuery('');
      } catch {
        setError('Could not update dependencies. Try again.');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="space-y-4">
      <div>
        <p className={sectionTitleClass}>Blocked by</p>
        {blockers.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No blockers.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {blockers.map((blocker) => (
              <li
                className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink"
                key={blocker.id}
              >
                <span className="truncate">{blocker.title}</span>
                <button
                  className="shrink-0 text-xs font-medium text-danger hover:underline disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    runMutation(() =>
                      removeDependency({
                        blockerTaskId: blocker.id,
                        taskId: task.id,
                        workspaceId,
                      })
                    );
                  }}
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          className="mt-2 w-full rounded-lg border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Search tasks to add as a blocker…"
          value={query}
        />
        {candidates.length > 0 ? (
          <ul className="mt-1 overflow-hidden rounded-lg border border-line">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent-soft/50 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    runMutation(() =>
                      addDependency({
                        blockerTaskId: candidate.id,
                        taskId: task.id,
                        workspaceId,
                      })
                    );
                  }}
                  type="button"
                >
                  <span className="truncate text-ink">{candidate.title}</span>
                  <span className="shrink-0 text-xs font-medium text-accent">
                    Add
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {error !== null ? (
          <p className="mt-1 text-xs text-danger">{error}</p>
        ) : null}
      </div>
      <div>
        <p className={sectionTitleClass}>Blocks</p>
        {blocks.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            No tasks depend on this one.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {blocks.map((blocked) => (
              <li
                className="truncate rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink"
                key={blocked.id}
              >
                {blocked.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
