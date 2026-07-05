'use client';

import { memberLabel } from '#app/web/gantt-model';
import type { WorkTask } from '@exe/domain';
import type { Task as LibraryTask } from 'gantt-task-react';
import type { FC, JSX } from 'react';

// Custom left column for gantt-task-react: task title, assignee chips, and a
// status dot, with red highlighting for overloaded assignees.

const STATUS_DOT: ReadonlyMap<string, string> = new Map([
  ['active', 'bg-accent'],
  ['blocked', 'bg-warn'],
  ['cancelled', 'bg-gray-400'],
  ['completed', 'bg-gray-300'],
]);

const WarningGlyph = (): JSX.Element => (
  <svg
    aria-label="Assignee overloaded"
    className="h-3.5 w-3.5 shrink-0 text-danger"
    fill="currentColor"
    role="img"
    viewBox="0 0 16 16"
  >
    <path d="M8 1.5 15.2 14H.8L8 1.5Zm0 4a.75.75 0 0 0-.75.75v3a.75.75 0 0 0 1.5 0v-3A.75.75 0 0 0 8 5.5Zm0 6a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z" />
  </svg>
);

const AssigneeChips = ({
  memberMap,
  overloaded,
  task,
}: {
  readonly memberMap: ReadonlyMap<string, string>;
  readonly overloaded: ReadonlySet<string>;
  readonly task: WorkTask;
}): JSX.Element => {
  if (task.assigneeSlackUserIds.length === 0) {
    return (
      <span className="rounded-full border border-line bg-canvas px-1.5 py-px text-[10px] text-muted">
        External / unassigned
      </span>
    );
  }
  return (
    <>
      {task.assigneeSlackUserIds.map((slackUserId) => {
        const isOverloaded = overloaded.has(slackUserId);
        return (
          <span
            className={`rounded-full px-1.5 py-px text-[10px] ${
              isOverloaded
                ? 'bg-danger/10 font-semibold text-danger'
                : 'bg-accent-soft text-accent'
            }`}
            key={slackUserId}
          >
            {memberLabel({ memberMap, slackUserId })}
          </span>
        );
      })}
    </>
  );
};

// eslint-disable-next-line functional/no-mixed-types -- The factory deps mix lookup data with the open-panel callback, which is intrinsic to a component prop bag.
interface TaskListDeps {
  readonly memberMap: ReadonlyMap<string, string>;
  readonly onOpen: (taskId: string) => void;
  readonly overloaded: ReadonlySet<string>;
  readonly taskById: ReadonlyMap<string, WorkTask>;
}

interface HeaderProps {
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly headerHeight: number;
  readonly rowWidth: string;
}

// eslint-disable-next-line functional/no-mixed-types -- Prop shape is dictated by gantt-task-react's TaskListTable contract.
interface TableProps {
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly locale: string;
  readonly onExpanderClick: (task: LibraryTask) => void;
  readonly rowHeight: number;
  readonly rowWidth: string;
  readonly selectedTaskId: string;
  readonly setSelectedTask: (taskId: string) => void;
  readonly tasks: LibraryTask[];
}

export const createTaskListComponents = ({
  memberMap,
  onOpen,
  overloaded,
  taskById,
}: TaskListDeps): {
  readonly header: FC<HeaderProps>;
  readonly table: FC<TableProps>;
} => {
  const header: FC<HeaderProps> = ({ headerHeight, rowWidth }) => (
    <div
      className="flex items-center border-b border-t border-line bg-canvas px-3 text-xs font-semibold uppercase tracking-wide text-muted"
      style={{ height: headerHeight, width: rowWidth }}
    >
      Task
    </div>
  );

  const table: FC<TableProps> = ({
    rowHeight,
    rowWidth,
    selectedTaskId,
    tasks,
  }) => (
    <div className="border-b border-line bg-white">
      {tasks.map((libraryTask) => {
        const task = taskById.get(libraryTask.id);
        if (task === undefined) {
          return <div key={libraryTask.id} style={{ height: rowHeight }} />;
        }
        const isOverloaded = task.assigneeSlackUserIds.some((slackUserId) =>
          overloaded.has(slackUserId)
        );
        return (
          <button
            className={`flex w-full flex-col justify-center gap-0.5 overflow-hidden border-b border-line/60 px-3 text-left transition hover:bg-accent-soft/40 ${
              selectedTaskId === task.id ? 'bg-accent-soft/60' : ''
            }`}
            key={task.id}
            onClick={() => {
              onOpen(task.id);
            }}
            style={{ height: rowHeight, width: rowWidth }}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT.get(task.status) ?? 'bg-accent'}`}
              />
              <span
                className={`truncate text-[13px] font-medium text-ink ${
                  task.status === 'cancelled' ? 'text-muted line-through' : ''
                }`}
              >
                {task.title}
              </span>
              {isOverloaded ? <WarningGlyph /> : null}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-1 overflow-hidden">
              <AssigneeChips
                memberMap={memberMap}
                overloaded={overloaded}
                task={task}
              />
            </span>
          </button>
        );
      })}
    </div>
  );

  return { header, table };
};
