import type { ProjectState, Task } from './projection.js';
import { startedAt, finishedAt } from './flow.js';

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

  const hours = done
    .map((t) => workHours(t, state))
    .filter((h): h is number => h !== null);
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
function workHours(task: Task, state: ProjectState): number | null {
  // The same crossing `report flow` uses, not an exact match on one column: a
  // task that went todo → review → done has been worked on, and two commands
  // must not disagree about that.
  const startedTs = startedAt(task, state.started, state.statuses, state.startedChanges);
  const finishedTs = finishedAt(task);
  if (startedTs === null || finishedTs === null) return null;

  const ms = Date.parse(finishedTs) - Date.parse(startedTs);
  return ms > 0 ? ms / 3_600_000 : null;
}

function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/**
 * Velocity across sprints, newest last.
 *
 * `sprintReport` answers "how did that sprint go". This answers the question
 * teams actually use velocity for — "what can we take on" — and it answers it
 * the way `flow` answers cycle time: with a range rather than a single number.
 *
 * An average of three sprints reads as a promise. The spread is the forecast:
 * a team at 8, 14 and 9 points has a very different next sprint from one at
 * 10, 10 and 11, and one number cannot tell them apart. PMI's Agile Practice
 * Guide puts the settling point at four to eight iterations, which is why a
 * short series says how short it is rather than quietly looking authoritative.
 */

export interface VelocityRow {
  name: string;
  /** Points taken into the sprint, cancelled work excluded. */
  committed: number;
  /** Points finished — velocity in the usual sense. */
  velocity: number;
  /** Points that were taken in and did not finish. */
  carriedOver: number;
  /** Finished without an estimate: outside velocity, worth saying. */
  unestimated: number;
}

export interface VelocitySeries {
  rows: VelocityRow[];
  /** Of the velocities, not of anything else. null when nothing has closed. */
  median: number | null;
  low: number | null;
  high: number | null;
  notes: string[];
}

/** How many sprints it takes before velocity means anything (PMI, §5.4). */
const SETTLES_AT = 4;

export function velocitySeries(state: ProjectState, limit = 8): VelocitySeries {
  const closed = state.sprints
    .filter((s) => s.status === 'closed')
    // By the event that closed them, not by when they were created: a sprint
    // planned first can be closed last, and the series is about finishing.
    .sort((a, b) => ((a.closedBy ?? '') < (b.closedBy ?? '') ? -1 : 1))
    .slice(-limit);

  const rows: VelocityRow[] = [];
  for (const sprint of closed) {
    const report = sprintReport(state, sprint.id);
    if (report === null) continue;
    rows.push({
      name: report.name,
      committed: report.committed,
      velocity: report.velocity,
      carriedOver: sum(report.carriedOver.map((t) => t.estimate ?? 0)),
      unestimated: report.unestimated.length,
    });
  }

  const notes: string[] = [];
  if (rows.length === 0) {
    notes.push('No closed sprint yet. Velocity is what a finished sprint leaves behind.');
    return { rows: [], median: null, low: null, high: null, notes };
  }

  const sorted = rows.map((r) => r.velocity).sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)]!;
  if (rows.length < SETTLES_AT) {
    notes.push(
      `${rows.length} closed sprint${rows.length === 1 ? '' : 's'}. Velocity takes four to eight ` +
        'to stabilise, so treat this as a sighting rather than a forecast.',
    );
  }
  const overcommitting = rows.filter((r) => r.committed > r.velocity * 1.5).length;
  if (overcommitting === rows.length && rows.length >= 2) {
    notes.push('Every sprint here took in half again more than it finished.');
  }
  return { rows, median, low: sorted[0]!, high: sorted[sorted.length - 1]!, notes };
}
