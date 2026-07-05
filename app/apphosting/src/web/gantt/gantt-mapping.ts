import { isTaskOverloaded } from '#app/web/gantt-model';
import { isOpenTaskStatus, type WorkTask } from '@exe/domain';
import type { Task as LibraryTask } from 'gantt-task-react';

// Mapping between our work tasks and gantt-task-react's Task model. Bars run
// from startAt (falling back to createdAt) to end-of-day dueAt; tasks without
// a due date get a provisional 3-day bar in a translucent tint.

interface BarStyle {
  readonly backgroundColor: string;
  readonly backgroundSelectedColor: string;
}

const STATUS_STYLES: ReadonlyMap<string, BarStyle> = new Map([
  [
    'active',
    { backgroundColor: '#176b4d', backgroundSelectedColor: '#0f5a3f' },
  ],
  [
    'blocked',
    { backgroundColor: '#d9822b', backgroundSelectedColor: '#bf6f1f' },
  ],
  [
    'cancelled',
    { backgroundColor: '#9aa5a1', backgroundSelectedColor: '#8b9692' },
  ],
  [
    'completed',
    { backgroundColor: '#c3cdc9', backgroundSelectedColor: '#b2beb9' },
  ],
]);

const OVERLOAD_STYLE: BarStyle = {
  backgroundColor: '#d84343',
  backgroundSelectedColor: '#b93636',
};

const FALLBACK_STYLE: BarStyle = {
  backgroundColor: '#176b4d',
  backgroundSelectedColor: '#0f5a3f',
};

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

const addDays = ({
  date,
  days,
}: {
  readonly date: Date;
  readonly days: number;
}): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const safeDate = (iso: string): Date => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

export const barStartDate = (task: WorkTask): Date =>
  startOfDay(safeDate(task.startAt ?? task.createdAt));

export const barEndDate = (task: WorkTask): Date => {
  const start = barStartDate(task);
  if (task.dueAt === undefined) {
    return endOfDay(addDays({ date: start, days: 3 }));
  }
  const due = endOfDay(safeDate(task.dueAt));
  return due.getTime() < start.getTime() ? endOfDay(start) : due;
};

// Dragging a bar pins explicit dates: local day start for startAt, local day
// end for dueAt, both serialized to ISO instants.
export const dragStartToIso = (date: Date): string =>
  startOfDay(date).toISOString();

export const dragEndToIso = (date: Date): string =>
  endOfDay(date).toISOString();

const withAlpha = (hexColor: string): string => `${hexColor}b3`;

const barStyle = ({
  overloaded,
  task,
}: {
  readonly overloaded: ReadonlySet<string>;
  readonly task: WorkTask;
}): BarStyle => {
  const base = isTaskOverloaded({ overloaded, task })
    ? OVERLOAD_STYLE
    : (STATUS_STYLES.get(task.status) ?? FALLBACK_STYLE);
  if (task.dueAt !== undefined || !isOpenTaskStatus(task.status)) {
    return base;
  }
  return {
    backgroundColor: withAlpha(base.backgroundColor),
    backgroundSelectedColor: withAlpha(base.backgroundSelectedColor),
  };
};

export const toLibraryTask = ({
  chartTaskIds,
  overloaded,
  task,
}: {
  readonly chartTaskIds: ReadonlySet<string>;
  readonly overloaded: ReadonlySet<string>;
  readonly task: WorkTask;
}): LibraryTask => {
  const style = barStyle({ overloaded, task });
  const progress = task.status === 'completed' ? 100 : 0;
  return {
    dependencies: task.dependsOnTaskIds.filter((id) => chartTaskIds.has(id)),
    end: barEndDate(task),
    id: task.id,
    isDisabled: !isOpenTaskStatus(task.status),
    name: task.title,
    progress,
    start: barStartDate(task),
    styles: {
      backgroundColor: style.backgroundColor,
      backgroundSelectedColor: style.backgroundSelectedColor,
      progressColor: style.backgroundColor,
      progressSelectedColor: style.backgroundSelectedColor,
    },
    type: 'task',
  };
};

export const toLibraryTasks = ({
  overloaded,
  tasks,
}: {
  readonly overloaded: ReadonlySet<string>;
  readonly tasks: readonly WorkTask[];
}): LibraryTask[] => {
  const chartTaskIds = new Set(tasks.map((task) => task.id));
  return tasks.map((task) => toLibraryTask({ chartTaskIds, overloaded, task }));
};

// Chart geometry shared with GanttTab. chartFullWidthPx reproduces the exact
// horizontal extent gantt-task-react draws in ViewMode.Day with the default
// preStepsCount of 1: one padding day before the earliest bar, 19 after the
// latest, one column per day inclusive of both ends.
export const GANTT_COLUMN_WIDTH = 36;
export const GANTT_LIST_WIDTH_PX = 320;

const DAY_MS = 24 * 60 * 60 * 1000;

export const chartFullWidthPx = (tasks: readonly LibraryTask[]): number => {
  if (tasks.length === 0) {
    return GANTT_LIST_WIDTH_PX;
  }
  const startMs = Math.min(
    ...tasks.map((task) => startOfDay(task.start).getTime())
  );
  const endMs = Math.max(
    ...tasks.map((task) => startOfDay(task.end).getTime())
  );
  const columns = Math.round((endMs - startMs) / DAY_MS) + 21;
  return GANTT_LIST_WIDTH_PX + columns * GANTT_COLUMN_WIDTH;
};
