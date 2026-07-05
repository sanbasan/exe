'use client';

import { updateTask } from '#app/web/api-client';
import type { ChannelSummary, SlackMember } from '#app/web/api-schemas';
import {
  buildMemberMap,
  computeOverload,
  sortTasksForDisplay,
} from '#app/web/gantt-model';
import {
  chartFullWidthPx,
  dragEndToIso,
  dragStartToIso,
  GANTT_COLUMN_WIDTH,
  GANTT_LIST_WIDTH_PX,
  toLibraryTasks,
} from '#app/web/gantt/gantt-mapping';
import { createTaskListComponents } from '#app/web/gantt/task-list';
import { TaskPanel } from '#app/web/gantt/task-panel';
import type { WorkTask } from '@exe/domain';
import { Gantt, ViewMode, type Task as LibraryTask } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import { useMemo, useState, type CSSProperties, type JSX } from 'react';

// Workspace Gantt: gantt-task-react renders the chart (bars, dependency
// arrows, drag-to-reschedule); our slide-over panel handles all other edits.

// eslint-disable-next-line functional/no-mixed-types -- Props mix the refetch callback with data fields, which is intrinsic to a React component prop bag.
interface GanttTabProps {
  readonly channels: readonly ChannelSummary[];
  readonly members: readonly SlackMember[];
  readonly refetchTasks: () => Promise<void>;
  readonly tasks: readonly WorkTask[];
  readonly workspaceId: string;
}

type PanelState =
  | { readonly kind: 'edit'; readonly taskId: string }
  | { readonly kind: 'new' };

interface DateOverride {
  readonly dueAt: string;
  readonly startAt: string;
}

const LEGEND_ITEMS: readonly {
  readonly label: string;
  readonly swatchClass: string;
}[] = [
  { label: 'Active', swatchClass: 'bg-accent' },
  { label: 'Blocked', swatchClass: 'bg-warn' },
  { label: 'Assignee overloaded', swatchClass: 'bg-danger' },
  { label: 'Done / cancelled', swatchClass: 'bg-gray-300' },
  { label: 'No due date (provisional 3-day bar)', swatchClass: 'bg-accent/60' },
];

const Legend = ({ threshold }: { readonly threshold: number }): JSX.Element => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
    {LEGEND_ITEMS.map((item) => (
      <span className="flex items-center gap-1.5" key={item.label}>
        <span className={`h-2.5 w-4 rounded-sm ${item.swatchClass}`} />
        {item.label}
      </span>
    ))}
    <span className="text-muted/80">
      Red means an assignee has {threshold}+ open tasks.
    </span>
  </div>
);

const applyOverrides = ({
  overrides,
  tasks,
}: {
  readonly overrides: ReadonlyMap<string, DateOverride>;
  readonly tasks: readonly WorkTask[];
}): readonly WorkTask[] =>
  tasks.map((task) => {
    const override = overrides.get(task.id);
    return override === undefined
      ? task
      : { ...task, dueAt: override.dueAt, startAt: override.startAt };
  });

export const GanttTab = ({
  channels,
  members,
  refetchTasks,
  tasks,
  workspaceId,
}: GanttTabProps): JSX.Element => {
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, DateOverride>>(
    new Map()
  );
  const [error, setError] = useState<string | null>(null);

  const displayTasks = useMemo(
    () => sortTasksForDisplay(applyOverrides({ overrides, tasks })),
    [overrides, tasks]
  );
  const taskById = useMemo(
    () => new Map(displayTasks.map((task) => [task.id, task] as const)),
    [displayTasks]
  );
  const overload = useMemo(() => computeOverload(displayTasks), [displayTasks]);
  const memberMap = useMemo(() => buildMemberMap(members), [members]);
  const libraryTasks = useMemo(
    () =>
      toLibraryTasks({ overloaded: overload.overloaded, tasks: displayTasks }),
    [displayTasks, overload.overloaded]
  );
  const fullWidthPx = useMemo(
    () => chartFullWidthPx(libraryTasks),
    [libraryTasks]
  );
  const chartStyle: CSSProperties & Record<string, string> = {
    '--gantt-width': `${String(fullWidthPx)}px`,
  };

  const openTask = (taskId: string): void => {
    setPanel({ kind: 'edit', taskId });
  };

  const taskList = useMemo(
    () =>
      createTaskListComponents({
        memberMap,
        onOpen: openTask,
        overloaded: overload.overloaded,
        taskById,
      }),
    [memberMap, overload.overloaded, taskById]
  );

  const handleDateChange = (libraryTask: LibraryTask): void => {
    const dueAt = dragEndToIso(libraryTask.end);
    const startAt = dragStartToIso(libraryTask.start);
    setOverrides(
      (previous) =>
        new Map([...previous, [libraryTask.id, { dueAt, startAt }] as const])
    );
    setError(null);
    void (async (): Promise<void> => {
      try {
        await updateTask({
          after: { dueAt, kind: 'work', startAt },
          taskId: libraryTask.id,
          workspaceId,
        });
        await refetchTasks();
      } catch {
        setError('Could not reschedule the task. The change was rolled back.');
      } finally {
        setOverrides(
          (previous) =>
            new Map([...previous].filter(([id]) => id !== libraryTask.id))
        );
      }
    })();
  };

  const editedTask =
    panel?.kind === 'edit' ? taskById.get(panel.taskId) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend threshold={overload.threshold} />
        <button
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
          onClick={() => {
            setPanel({ kind: 'new' });
          }}
          type="button"
        >
          New Task
        </button>
      </div>
      {error !== null ? <p className="text-sm text-danger">{error}</p> : null}
      {libraryTasks.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-10 text-center text-muted">
          No work tasks yet. Create one to start planning.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <div className="w-(--gantt-width) md:w-auto" style={chartStyle}>
            <Gantt
              TaskListHeader={taskList.header}
              TaskListTable={taskList.table}
              arrowColor="#52615d"
              barCornerRadius={4}
              barFill={62}
              columnWidth={GANTT_COLUMN_WIDTH}
              fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
              fontSize="12px"
              listCellWidth={`${String(GANTT_LIST_WIDTH_PX)}px`}
              onClick={(task) => {
                openTask(task.id);
              }}
              onDateChange={handleDateChange}
              onDoubleClick={(task) => {
                openTask(task.id);
              }}
              onProgressChange={() => false}
              rowHeight={48}
              tasks={[...libraryTasks]}
              todayColor="rgba(23, 107, 77, 0.08)"
              viewMode={ViewMode.Day}
            />
          </div>
        </div>
      )}
      {panel !== null && (panel.kind === 'new' || editedTask !== undefined) ? (
        <TaskPanel
          key={panel.kind === 'edit' ? panel.taskId : 'new'}
          channels={channels}
          members={members}
          onClose={() => {
            setPanel(null);
          }}
          refetchTasks={refetchTasks}
          tasks={displayTasks}
          workspaceId={workspaceId}
          {...(editedTask !== undefined ? { task: editedTask } : {})}
        />
      ) : null}
    </div>
  );
};
