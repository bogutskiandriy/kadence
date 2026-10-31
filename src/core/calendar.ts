import { CANCELLED_STATUS, type ProjectState, type Task } from './projection.js';
import type { Timeline } from './timeline.js';

/**
 * The calendar: the timeline's dates, laid out by day for one month (DEC-75).
 *
 * Epic bars are read from the timeline's fold, never computed again here, so
 * the two views cannot show one epic on two different dates. To them it adds
 * every task with a due date — with an epic or without — on its day, and the
 * sprint and milestone dates that fall in the month.
 */

export interface CalendarBar {
  label: string;
  title: string;
  /** Cut to the month. */
  from: string;
  to: string;
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** Row in the grid: bars that overlap never share one. */
  lane: number;
  /** The plan where the epic has one; otherwise what happened. */
  source: 'plan' | 'actual';
}

export interface CalendarItem {
  date: string;
  label: string;
  title: string;
  status: string;
  /** The outermost epic above it, or null. */
  epic: string | null;
}

export interface CalendarMarker {
  date: string;
  kind: 'sprint_start' | 'sprint_end' | 'milestone';
  name: string;
}

export interface Calendar {
  month: string;
  from: string;
  to: string;
  bars: CalendarBar[];
  lanes: number;
  items: CalendarItem[];
  markers: CalendarMarker[];
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(value: string): boolean {
  return MONTH.test(value);
}

/** First and last day of a YYYY-MM month. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function calendar(state: ProjectState, t: Timeline, month: string): Calendar {
  const { from, to } = monthBounds(month);

  const raw = t.groups
    .flatMap((g) => (g.epic === null ? [] : [g.epic]))
    .flatMap((e) => {
      const span = e.plan ?? (e.actual === null ? null : { from: e.actual.from, to: e.actual.to });
      if (span === null || span.to < from || span.from > to) return [];
      return [
        {
          label: e.label,
          title: e.title,
          from: span.from < from ? from : span.from,
          to: span.to > to ? to : span.to,
          continuesBefore: span.from < from,
          continuesAfter: span.to > to,
          lane: 0,
          source: (e.plan === null ? 'actual' : 'plan') as 'plan' | 'actual',
        },
      ];
    })
    // Earliest first, longest first among equals: the greedy packing below
    // then uses as few lanes as an interval graph allows.
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to > b.to ? -1 : a.to < b.to ? 1 : 0));

  const laneEnds: string[] = [];
  for (const bar of raw) {
    let lane = laneEnds.findIndex((end) => end < bar.from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(bar.to);
    } else {
      laneEnds[lane] = bar.to;
    }
    bar.lane = lane;
  }

  const byId = new Map(state.tasks.map((x) => [x.id, x]));
  // The outermost epic at or above each task, memoised: asking it per due
  // task on a long chain of parents would walk the chain once per task.
  const topMemo = new Map<string, string | null>();
  const topAtOrAbove = (task: Task, seen = new Set<string>()): string | null => {
    if (topMemo.has(task.id)) return topMemo.get(task.id)!;
    if (seen.has(task.id)) return null;
    seen.add(task.id);
    const parent = task.parent === null ? undefined : byId.get(task.parent);
    const above = parent === undefined ? null : topAtOrAbove(parent, seen);
    const result = above ?? (task.type === 'epic' ? task.label : null);
    topMemo.set(task.id, result);
    return result;
  };
  const epicOf = (task: Task): string | null => {
    const parent = task.parent === null ? undefined : byId.get(task.parent);
    return parent === undefined ? null : topAtOrAbove(parent);
  };

  // Epics are already bars; a due date on one is the end of its bar.
  const items = state.tasks
    .filter((x) => x.status !== CANCELLED_STATUS && x.type !== 'epic' && x.due !== null && x.due >= from && x.due <= to)
    .map((x) => ({ date: x.due!, label: x.label, title: x.title, status: x.status, epic: epicOf(x) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const inMonth = (d: string): boolean => d >= from && d <= to;
  const markers: CalendarMarker[] = [];
  for (const s of t.markers.sprints) {
    if (inMonth(s.from)) markers.push({ date: s.from, kind: 'sprint_start', name: s.name });
    if (inMonth(s.to)) markers.push({ date: s.to, kind: 'sprint_end', name: s.name });
  }
  for (const m of t.markers.milestones) {
    if (inMonth(m.date)) markers.push({ date: m.date, kind: 'milestone', name: `${m.label} ${m.name}` });
  }
  markers.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { month, from, to, bars: raw, lanes: laneEnds.length, items, markers };
}
