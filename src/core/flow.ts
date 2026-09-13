import type { ProjectState, Task } from './projection.js';
import { TERMINAL_STATUS, CANCELLED_STATUS, INITIAL_STATUS, startedAtEvent } from './projection.js';

/**
 * Flow metrics, folded from the journal.
 *
 * The four the Kanban Guide mandates — WIP, throughput, work item age, cycle
 * time — plus lead time, response time, created-vs-resolved and blocked time,
 * all from the timestamps every `task.moved` already carries. Nothing here is
 * stored; everything is a fold over state, so it cannot disagree with the
 * board.
 *
 * Three rules that are decisions rather than details:
 *  - **Percentiles, never means.** A cycle time is reported as p50 / p85 / p95
 *    in the Kanban Guide's own form: "85% of finished items took N days or
 *    less". An average hides the tail, and the tail is the thing to manage.
 *  - **Calendar days, said so.** Every duration is calendar days and every
 *    response says which. A business-day option is a later decision; a silent
 *    one would be a wrong number.
 *  - **The boundary is named.** Work "starts" at `state.started`, a setting.
 *    The report prints it, so a number is never quoted without the column it
 *    was measured from.
 */

const DAY_MS = 86_400_000;

export interface Percentiles {
  /** How many items the percentiles are drawn from. */
  n: number;
  p50: number;
  p85: number;
  p95: number;
}

export interface Window {
  /** ISO dates, inclusive. */
  from: string;
  to: string;
  days: number;
}

export interface WeekRow {
  /** Monday of the week, ISO date. */
  week: string;
  finished: number;
  created: number;
}

export interface AgingRow {
  label: string;
  title: string;
  status: string;
  ageDays: number;
  /** Older than the p85 cycle time of what finished in the window. */
  overP85: boolean;
}

export interface FlowReport {
  window: Window;
  /** The status work counts as started at — a setting, printed every time. */
  started: string;
  unit: 'calendar days';
  wip: number;
  finished: number;
  perWeek: WeekRow[];
  cycleTime: Percentiles | null;
  leadTime: Percentiles | null;
  responseTime: Percentiles | null;
  /** In the Kanban Guide's words, when there is enough to say it. */
  sle: string | null;
  aging: AgingRow[];
  blocked: { tasks: number; days: number };
  /** Why a section is empty, when one is. */
  notes: string[];
}

export interface CfdRow {
  date: string;
  counts: Record<string, number>;
}

export interface CfdReport {
  window: Window;
  statuses: string[];
  days: CfdRow[];
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayStart(iso: string): number {
  return Date.parse(`${iso}T00:00:00.000Z`);
}

/** Monday of the ISO week the date falls in. */
function mondayOf(iso: string): string {
  const d = new Date(dayStart(iso));
  const shift = (d.getUTCDay() + 6) % 7;
  return isoDay(d.getTime() - shift * DAY_MS);
}

export function windowEnding(today: Date, days: number): Window {
  const to = isoDay(today.getTime());
  const from = isoDay(dayStart(to) - (days - 1) * DAY_MS);
  return { from, to, days };
}

function inWindow(ts: string, w: Window): boolean {
  const day = ts.slice(0, 10);
  return day >= w.from && day <= w.to;
}

/** Nearest-rank percentile over a sorted ascending array. */
function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[rank - 1]!;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

/** Rounded for display; the raw p85 is kept aside for comparisons. */
function percentiles(values: readonly number[]): { shown: Percentiles; rawP85: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    shown: {
      n: sorted.length,
      p50: round1(percentile(sorted, 0.5)),
      p85: round1(percentile(sorted, 0.85)),
      p95: round1(percentile(sorted, 0.95)),
    },
    rawP85: percentile(sorted, 0.85),
  };
}

/**
 * The columns that come before "started" in board order.
 *
 * Work has crossed the boundary when it sits in the started column or any
 * column after it; a task moved back into one of these has left work in
 * progress, whatever its history says. Columns the board does not list
 * (orphans from another branch) count as past the boundary: they are not
 * a backlog, and hiding them would understate WIP.
 */
export function beforeStarted(statuses: readonly string[], started: string): ReadonlySet<string> | null {
  const idx = statuses.indexOf(started);
  // Not a column at all: there is no board order to reason from, so nothing
  // counts as past the boundary. The empty answer is the honest one, and it is
  // what the note and `board config`'s warning both promise.
  if (idx === -1) return null;
  return new Set(statuses.slice(0, idx));
}

/**
 * When the task first crossed into started-or-later, or null if it never did.
 *
 * Not "first move into the started column": a task moved straight from the
 * backlog into review skipped that column and has been in progress since.
 */
export function startedAt(
  task: Task,
  started: string,
  statuses: readonly string[] = [],
  startedChanges: readonly { id: string; started: string }[] = [],
): string | null {
  const before = beforeStarted(statuses, started);
  const crosses = (to: string): boolean => {
    if (to === TERMINAL_STATUS || to === CANCELLED_STATUS) return false;
    if (before === null) return to === started;
    return to === started || !before.has(to);
  };

  const h = task.history.find((e) => {
    // A reopen is a crossing too: it puts the task back in the started column
    // without a `task.moved`, and a task sitting there is in progress whatever
    // route it took.
    if (e.type === 'task.reopened') return crosses(startedAtEvent(startedChanges, e.id));
    return e.type === 'task.moved' && typeof e.data['to'] === 'string' && crosses(e.data['to']);
  });
  return h?.ts ?? null;
}

/** In progress now: past the boundary, not finished, not cancelled. */
export function isInProgress(state: ProjectState, task: Task): boolean {
  if (task.status === TERMINAL_STATUS || task.status === CANCELLED_STATUS) return false;
  const before = beforeStarted(state.statuses, state.started);
  if (before === null) return task.status === state.started;
  if (before.has(task.status)) return false;
  return startedAt(task, state.started, state.statuses, state.startedChanges) !== null;
}

/** When the task last became done, or null if it is not done now. */
export function finishedAt(task: Task): string | null {
  if (task.status !== TERMINAL_STATUS) return null;
  for (let i = task.history.length - 1; i >= 0; i--) {
    const h = task.history[i]!;
    if (h.type === 'task.moved' && h.data['to'] === TERMINAL_STATUS) return h.ts;
  }
  return null;
}

/** When the task was cancelled, or null if it is not cancelled now. */
export function cancelledAt(task: Task): string | null {
  if (task.status !== CANCELLED_STATUS) return null;
  for (let i = task.history.length - 1; i >= 0; i--) {
    const h = task.history[i]!;
    if (h.type === 'task.cancelled') return h.ts;
    if (h.type === 'task.moved' && h.data['to'] === CANCELLED_STATUS) return h.ts;
  }
  return null;
}

function days(fromTs: string, toTs: string): number {
  return Math.max(0, (Date.parse(toTs) - Date.parse(fromTs)) / DAY_MS);
}

/**
 * Days a task spent blocked inside the window.
 *
 * An interval opens on `blocked_by_added` and closes on the matching
 * `blocked_by_removed`, on the blocker finishing, or at the end of the window.
 * Overlapping blockers are unioned: a task blocked by two things at once is
 * blocked once, not twice.
 */
function blockedDays(
  task: Task,
  finished: ReadonlyMap<string, number>,
  w: Window,
  nowMs: number,
): number {
  // Work that is over is not blocked, whatever the blocker is doing. Without
  // this a task finished three weeks ago kept accruing blocked days.
  const ownEnd = finishedAt(task) ?? cancelledAt(task);
  const stop = ownEnd === null ? nowMs : Date.parse(ownEnd);
  const intervals: Array<[number, number]> = [];
  const open = new Map<string, number>();
  for (const h of task.history) {
    const blocker = typeof h.data['blocker'] === 'string' ? h.data['blocker'] : null;
    if (blocker === null) continue;
    if (h.type === 'task.blocked_by_added') {
      if (!open.has(blocker)) open.set(blocker, Date.parse(h.ts));
    } else if (h.type === 'task.blocked_by_removed') {
      const start = open.get(blocker);
      if (start !== undefined) {
        intervals.push([start, Math.min(Date.parse(h.ts), stop)]);
        open.delete(blocker);
      }
    }
  }
  for (const [blocker, start] of open) {
    const end = Math.min(finished.get(blocker) ?? nowMs, stop);
    intervals.push([start, Math.max(start, end)]);
  }

  const wFrom = dayStart(w.from);
  const wTo = dayStart(w.to) + DAY_MS;
  const clipped = intervals
    .map(([a, b]): [number, number] => [Math.max(a, wFrom), Math.min(b, wTo)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);

  let total = 0;
  let cur: [number, number] | null = null;
  for (const [a, b] of clipped) {
    if (cur === null || a > cur[1]) {
      if (cur !== null) total += cur[1] - cur[0];
      cur = [a, b];
    } else if (b > cur[1]) {
      cur[1] = b;
    }
  }
  if (cur !== null) total += cur[1] - cur[0];
  return total / DAY_MS;
}

export function flowReport(state: ProjectState, today: Date = new Date(), windowDays = 30): FlowReport {
  const w = windowEnding(today, windowDays);
  const nowMs = today.getTime();
  const notes: string[] = [];

  const live = state.tasks.filter((t) => t.status !== CANCELLED_STATUS);
  const finishedInWindow = live.filter((t) => {
    const f = finishedAt(t);
    return f !== null && inWindow(f, w);
  });

  const cycle: number[] = [];
  const lead: number[] = [];
  const response: number[] = [];
  for (const t of finishedInWindow) {
    const f = finishedAt(t)!;
    const s = startedAt(t, state.started, state.statuses, state.startedChanges);
    lead.push(days(t.createdAt, f));
    if (s !== null) {
      cycle.push(days(s, f));
      response.push(days(t.createdAt, s));
    }
  }

  const cycleStats = percentiles(cycle);
  const cycleTime = cycleStats?.shown ?? null;
  const openStarted = live.filter((t) => isInProgress(state, t));
  const aging: AgingRow[] = openStarted
    .map((t) => {
      const age = days(
        startedAt(t, state.started, state.statuses, state.startedChanges)!,
        today.toISOString(),
      );
      return {
        label: t.label,
        title: t.title,
        status: t.status,
        ageDays: round1(age),
        // Compared unrounded on both sides: a task seconds old must not read
        // as "older than p85" because p85 displayed as 0.
        overP85: cycleStats !== null && age > cycleStats.rawP85,
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);

  // Created vs resolved, by ISO week, over the window.
  const weeks = new Map<string, WeekRow>();
  const weekRow = (iso: string): WeekRow => {
    const key = mondayOf(iso);
    let row = weeks.get(key);
    if (row === undefined) {
      row = { week: key, finished: 0, created: 0 };
      weeks.set(key, row);
    }
    return row;
  };
  for (let d = dayStart(w.from); d <= dayStart(w.to); d += DAY_MS) weekRow(isoDay(d));
  for (const t of finishedInWindow) weekRow(finishedAt(t)!.slice(0, 10)).finished += 1;
  for (const t of live) if (inWindow(t.createdAt, w)) weekRow(t.createdAt.slice(0, 10)).created += 1;
  const perWeek = [...weeks.values()].sort((a, b) => (a.week < b.week ? -1 : 1));

  // Built once for every task's blocked intervals, not once per task.
  const finishedMs = new Map<string, number>();
  for (const t of state.tasks) {
    const f = finishedAt(t);
    if (f !== null) finishedMs.set(t.id, Date.parse(f));
  }
  let blockedTasks = 0;
  let blockedTotal = 0;
  for (const t of live) {
    const b = blockedDays(t, finishedMs, w, nowMs);
    if (b > 0) {
      blockedTasks += 1;
      blockedTotal += b;
    }
  }

  if (state.tasks.length === 0) {
    notes.push('No tasks yet.');
  } else {
    if (openStarted.length === 0 && finishedInWindow.length === 0) {
      notes.push(
        `Nothing has crossed "${state.started}" yet. If work starts in another column, say so: kadence board config --started <status>`,
      );
    }
    if (finishedInWindow.length === 0) {
      notes.push(`Nothing finished between ${w.from} and ${w.to}; cycle time needs finished work.`);
    } else if (cycle.length === 0) {
      notes.push(
        `${finishedInWindow.length} item(s) finished without ever entering "${state.started}", so there is no cycle time to measure.`,
      );
    }
    if (!state.statuses.includes(state.started)) {
      notes.push(`"${state.started}" is not one of the board's columns; set one with kadence board config --started.`);
    }
  }

  const sle =
    cycleTime === null
      ? null
      : `${cycleTime.n < 10 ? `From ${cycleTime.n} finished items (a small sample): ` : ''}85% of finished items took ${cycleTime.p85} calendar days or less.`;

  return {
    window: w,
    started: state.started,
    unit: 'calendar days',
    wip: openStarted.length,
    finished: finishedInWindow.length,
    perWeek,
    cycleTime,
    leadTime: percentiles(lead)?.shown ?? null,
    responseTime: percentiles(response)?.shown ?? null,
    sle,
    aging,
    blocked: { tasks: blockedTasks, days: round1(blockedTotal) },
    notes,
  };
}

export function cfdReport(state: ProjectState, today: Date = new Date(), windowDays = 30): CfdReport {
  const w = windowEnding(today, windowDays);
  const statuses = [...state.statuses];
  for (const t of state.tasks) if (!statuses.includes(t.status)) statuses.push(t.status);
  // The same column the fold puts a new task in, not the board's first: on a
  // board without one, a task really is in an orphan `backlog` and the report
  // must say so rather than quietly file it under the leftmost column.
  const initial = INITIAL_STATUS;
  if (!statuses.includes(initial) && state.tasks.length > 0) statuses.unshift(initial);

  // Each task's status changes, parsed once. Walking the raw history per day
  // re-parsed every timestamp for every day and cost 150 ms on 10k events;
  // one pass here and a moving pointer below make it a few.
  const tracks = state.tasks.map((t) => {
    const changes: Array<{ at: number; status: string }> = [];
    for (const h of t.history) {
      if (h.type === 'task.moved' && typeof h.data['to'] === 'string') {
        changes.push({ at: Date.parse(h.ts), status: h.data['to'] });
      } else if (h.type === 'task.cancelled') {
        changes.push({ at: Date.parse(h.ts), status: CANCELLED_STATUS });
      } else if (h.type === 'task.reopened') {
        // A reopen moves the task without a `task.moved`; leaving it out kept
        // the task in `done` for the rest of the chart.
        changes.push({ at: Date.parse(h.ts), status: startedAtEvent(state.startedChanges, h.id) });
      }
    }
    return { createdAt: Date.parse(t.createdAt), changes, next: 0, status: initial };
  });

  const rows: CfdRow[] = [];
  for (let d = dayStart(w.from); d <= dayStart(w.to); d += DAY_MS) {
    const dayEnd = d + DAY_MS;
    const counts: Record<string, number> = {};
    for (const st of statuses) counts[st] = 0;
    for (const track of tracks) {
      // Advance through every change that happened before this day ended.
      while (track.next < track.changes.length && track.changes[track.next]!.at < dayEnd) {
        track.status = track.changes[track.next]!.status;
        track.next += 1;
      }
      if (track.createdAt >= dayEnd) continue;
      counts[track.status] = (counts[track.status] ?? 0) + 1;
    }
    rows.push({ date: isoDay(d), counts });
  }
  return { window: w, statuses, days: rows };
}
