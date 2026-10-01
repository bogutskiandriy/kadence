import type { FlowEvent } from './event.js';
import type { ProjectState, Sprint } from './projection.js';

/**
 * Burnup, reconstructed from the journal: scope and done, day by day (KAD-15).
 *
 * The question a burndown structurally cannot answer: was the goal missed, or
 * did the goal grow? A flat burndown looks the same whether nobody finished
 * anything or every finished point was replaced by a new one. Two lines tell
 * them apart.
 *
 * Scope is what was in the sprint at the end of each day, at the estimate it
 * carried that day. The journal records a task entering a sprint and leaving
 * it for another, and a task being cancelled — it has no `sprint.task_removed`,
 * so those two are the only ways scope goes down, and the report says so.
 */

export interface BurnupDay {
  date: string;
  /** Points in the sprint at the end of the day. */
  scope: number;
  /** Of those, points done at the end of the day. */
  done: number;
}

export interface Burnup {
  sprintName: string;
  days: BurnupDay[];
  /** Scope at the end of the first day. */
  scopeAtStart: number;
  /** Scope at the end of the last day charted. */
  scopeNow: number;
  /** scopeNow − scopeAtStart: how much the goal grew (negative if it shrank). */
  scopeAdded: number;
  /** null while the sprint is still open. */
  finalDone: number | null;
}

const DAY_MS = 86_400_000;
const isoDay = (value: string | number): string => new Date(value).toISOString().slice(0, 10);

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00.000Z`); t <= Date.parse(`${to}T00:00:00.000Z`); t += DAY_MS) {
    out.push(isoDay(t));
  }
  return out;
}

/** What one task looked like at the end of a day, as far as burnup cares. */
interface Track {
  /** [day, sprint id] — the last one on or before a day is where the task was. */
  membership: Array<[string, string]>;
  estimate: Array<[string, number]>;
  status: Array<[string, string]>;
}

/** The last value recorded on or before `day`. Entries are in ULID order. */
function at<T>(entries: ReadonlyArray<[string, T]>, day: string): T | undefined {
  let value: T | undefined;
  for (const [d, v] of entries) {
    if (d > day) break;
    value = v;
  }
  return value;
}

export function burnup(
  state: ProjectState,
  events: readonly FlowEvent[],
  sprint: Sprint,
  today: string = isoDay(Date.now()),
): Burnup | null {
  // Ordering comes from the ULID, never from the order the files were read in
  // or from `ts` (I1, I2).
  const ordered = [...events].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const tracks = new Map<string, Track>();
  const track = (id: string): Track => {
    let t = tracks.get(id);
    if (t === undefined) {
      t = { membership: [], estimate: [], status: [] };
      tracks.set(id, t);
    }
    return t;
  };

  for (const e of ordered) {
    const d = isoDay(e.ts);
    const data = e.data ?? {};
    if (e.type === 'sprint.task_added' && typeof data['task'] === 'string') {
      track(data['task']).membership.push([d, e.entity]);
    } else if (e.type === 'task.created') {
      if (typeof data['estimate'] === 'number') track(e.entity).estimate.push([d, data['estimate']]);
      if (typeof data['sprint'] === 'string') track(e.entity).membership.push([d, data['sprint']]);
    } else if (e.type === 'task.updated' && typeof data['estimate'] === 'number') {
      track(e.entity).estimate.push([d, data['estimate']]);
    } else if (e.type === 'task.moved' && typeof data['to'] === 'string') {
      track(e.entity).status.push([d, data['to']]);
    }
  }
  // Entries were pushed in ULID order; a day-keyed lookup needs them by day too.
  for (const t of tracks.values()) {
    for (const list of [t.membership, t.estimate, t.status] as Array<Array<[string, unknown]>>) {
      list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    }
  }

  const ever = [...tracks.entries()].filter(([, t]) => t.membership.some(([, s]) => s === sprint.id));
  if (ever.length === 0) return null;

  const firstDay = ever.map(([, t]) => t.membership.find(([, s]) => s === sprint.id)![0]).sort()[0]!;
  const start = sprint.startDate ?? firstDay;
  const lastActivity = ever
    .flatMap(([, t]) => [...t.membership, ...t.estimate, ...t.status].map(([day]) => day))
    .sort()
    .at(-1)!;
  const rawEnd = sprint.endDate ?? lastActivity;
  const end = sprint.status === 'closed' ? rawEnd : rawEnd < today ? rawEnd : today;
  if (end < start) return null;

  const days = eachDay(start, end).map((date) => {
    let scope = 0;
    let done = 0;
    for (const [, t] of ever) {
      if (at(t.membership, date) !== sprint.id) continue;
      const status = at(t.status, date);
      if (status === 'cancelled') continue;
      const points = at(t.estimate, date) ?? 0;
      scope += points;
      if (status === 'done') done += points;
    }
    return { date, scope, done };
  });

  const scopeAtStart = days[0]?.scope ?? 0;
  const scopeNow = days.at(-1)?.scope ?? 0;
  return {
    sprintName: sprint.name,
    days,
    scopeAtStart,
    scopeNow,
    scopeAdded: scopeNow - scopeAtStart,
    finalDone: sprint.status === 'closed' ? (days.at(-1)?.done ?? 0) : null,
  };
}

/** Two bars per day: done in full blocks, the rest of the scope in light ones. */
export function renderBurnup(chart: Burnup, width = 40): string {
  const peak = Math.max(1, ...chart.days.map((d) => d.scope));
  const grew =
    chart.scopeAdded > 0
      ? `the goal grew by ${chart.scopeAdded} point${chart.scopeAdded === 1 ? '' : 's'}`
      : chart.scopeAdded < 0
        ? `the goal shrank by ${-chart.scopeAdded} point${chart.scopeAdded === -1 ? '' : 's'}`
        : 'the goal did not change';
  const lines = [
    `"${chart.sprintName}" — ${chart.scopeAtStart} points at the start, ${chart.scopeNow} now: ${grew}`,
    '',
  ];
  for (const day of chart.days) {
    const done = Math.round((day.done / peak) * width);
    const scope = Math.round((day.scope / peak) * width);
    const bar = '█'.repeat(done) + '░'.repeat(Math.max(0, scope - done)) + ' '.repeat(Math.max(0, width - scope));
    lines.push(`${day.date.slice(5)}  ${bar} ${String(day.done).padStart(3)} / ${day.scope}`);
  }
  lines.push(
    '',
    '█ done   ░ in the sprint, not done',
    'Scope goes down only when a task is cancelled or moved to another sprint:',
    'the journal has no event for taking a task out of a sprint.',
  );
  return lines.join('\n');
}
