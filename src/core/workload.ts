import type { ProjectState, Task } from './projection.js';
import { isInProgress } from './flow.js';
import { isFinished } from './query.js';

/**
 * Who is carrying what, right now.
 *
 * The neighbours call this a workload report and mean hours against capacity.
 * There are no hours here and no capacity: an append-only journal has no place
 * to keep a mutable per-person availability, and inventing one would be the
 * shape this product exists to avoid. What the journal does know is who owns
 * what, how much of it has started, and how much of it is blocked — which is
 * the part a stand-up argues about anyway.
 *
 * Unassigned work gets a row rather than being dropped. Work nobody owns is
 * the thing this report exists to surface, and hiding it under a total would
 * be the one omission that matters.
 */

export interface WorkloadRow {
  /** null is the unassigned row: real, and usually the biggest one. */
  assignee: string | null;
  open: number;
  openPoints: number;
  /** Past the started boundary and not finished. */
  inProgress: number;
  /** Waiting on something that is not done. */
  blocked: number;
  /** Open tasks with no estimate — the reason openPoints can mislead. */
  unestimated: number;
}

export interface WorkloadReport {
  /** The day the question was asked. Tomorrow's answer differs; the journal does not. */
  asOf: string;
  /** The boundary in-progress was counted from, named for the same reason `flow` names it. */
  started: string;
  rows: WorkloadRow[];
  notes: string[];
}

export function workloadReport(state: ProjectState, today: Date = new Date()): WorkloadReport {
  const open = state.tasks.filter((t) => !isFinished(t));
  const unfinished = new Set(state.tasks.filter((t) => !isFinished(t)).map((t) => t.id));

  const byAssignee = new Map<string | null, Task[]>();
  for (const task of open) {
    const key = task.assignee;
    const bucket = byAssignee.get(key);
    if (bucket === undefined) byAssignee.set(key, [task]);
    else bucket.push(task);
  }

  const rows: WorkloadRow[] = [...byAssignee.entries()]
    .map(([assignee, tasks]) => ({
      assignee,
      open: tasks.length,
      openPoints: tasks.reduce((sum, t) => sum + (t.estimate ?? 0), 0),
      inProgress: tasks.filter((t) => isInProgress(state, t)).length,
      blocked: tasks.filter((t) => t.blockedBy.some((id) => unfinished.has(id))).length,
      unestimated: tasks.filter((t) => t.estimate === null).length,
    }))
    // Heaviest first, and the unassigned row sorts by its own weight like any
    // other: it is not a footnote.
    .sort((a, b) => b.openPoints - a.openPoints || b.open - a.open);

  const notes: string[] = [];
  if (rows.length === 0) notes.push('Nothing open.');
  const unestimated = rows.reduce((sum, r) => sum + r.unestimated, 0);
  if (unestimated > 0) {
    notes.push(
      `${unestimated} open task${unestimated === 1 ? '' : 's'} carry no estimate, so the points ` +
        'understate the work by an unknown amount.',
    );
  }
  return { asOf: today.toISOString().slice(0, 10), started: state.started, rows, notes };
}
