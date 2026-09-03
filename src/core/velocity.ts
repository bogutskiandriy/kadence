import type { ProjectState, Task } from './projection.js';

/**
 * Sprint analytics.
 *
 * The key difference from competitors: nothing is entered by hand. Everything
 * is derived from the event journal, so the number cannot be "forgotten" — it
 * is a product of the work, not a separate field someone fills in.
 */

export interface SprintReport {
  id: string;
  name: string;
  status: string;
  /** Sum of estimates for tasks taken into the sprint (cancelled excluded). */
  committed: number;
  /** Sum of estimates of completed tasks — what is usually called velocity. */
  velocity: number;
  /** Actual time in progress, hours. null when nothing was ever started. */
  actualHours: number | null;
  /** How many hours one estimate point costs. The basis for calibration. */
  hoursPerPoint: number | null;
  /** Completed tasks. */
  done: Task[];
  /** Unfinished — they carry over into the next sprint. */
  carriedOver: Task[];
  /** Cancelled: a decision, not work left undone. */
  cancelled: Task[];
  /** Completed without an estimate — excluded from velocity, worth saying. */
  unestimated: Task[];
  /** Hours people logged by hand, independent of the derived actualHours. */
  loggedHours: number;
}

export function sprintReport(state: ProjectState, sprintId: string): SprintReport | null {
  const sprint = state.sprints.find((s) => s.id === sprintId);
  if (sprint === undefined) return null;

  const tasks = state.tasks.filter((t) => t.sprint === sprintId);
  const cancelled = tasks.filter((t) => t.status === 'cancelled');
  const active = tasks.filter((t) => t.status !== 'cancelled');
  const done = active.filter((t) => t.status === 'done');
  const carriedOver = active.filter((t) => t.status !== 'done');

  const committed = sum(active.map((t) => t.estimate ?? 0));
  const velocity = sum(done.map((t) => t.estimate ?? 0));
  const unestimated = done.filter((t) => t.estimate === null);

  const hours = done.map(workHours).filter((h): h is number => h !== null);
  const actualHours = hours.length > 0 ? sum(hours) : null;

  // Points without time, or time without points, give no ratio.
  const estimatedDonePoints = sum(done.filter((t) => t.estimate !== null).map((t) => t.estimate!));
  const hoursPerPoint =
    actualHours !== null && estimatedDonePoints > 0 ? actualHours / estimatedDonePoints : null;

  return {
    id: sprint.id,
    name: sprint.name,
    status: sprint.status,
    committed,
    velocity,
    actualHours,
    hoursPerPoint,
    done,
    carriedOver,
    cancelled,
    unestimated,
    loggedHours: sum(tasks.map((t) => t.loggedHours)),
  };
}

/**
 * Time from first entering progress to completion.
 *
 * The first one specifically: a task may have been sent back for rework, and
 * then the real duration is the whole span, not the last attempt.
 */
function workHours(task: Task): number | null {
  const started = task.history.find(
    (h) => h.type === 'task.moved' && h.data['to'] === 'in_progress',
  );
  const finished = [...task.history]
    .reverse()
    .find((h) => h.type === 'task.moved' && h.data['to'] === 'done');

  if (started === undefined || finished === undefined) return null;

  const ms = Date.parse(finished.ts) - Date.parse(started.ts);
  return ms > 0 ? ms / 3_600_000 : null;
}

function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
