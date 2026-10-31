import { CANCELLED_STATUS, TERMINAL_STATUS, type ProjectState, type Task } from './projection.js';
import { startedAt, finishedAt } from './flow.js';
import { compareRank } from './rank.js';

/**
 * The timeline: what should be done when, by epic (DEC-71…74).
 *
 * A bar is never invented. The plan is a date someone set (`start`, `due`) or,
 * where they set none, the dates of the work under it — its own sprint's dates
 * and its descendants' plans. The actual bar is what the journal says
 * happened: first start to last finish, or to today while work is open. When
 * the plan someone set and the work under it disagree, the disagreement is
 * named rather than settled, the way every other conflict here is surfaced.
 *
 * Two levels, as Jira draws them: the outermost epic, and its direct
 * children. Deeper work stretches the child it sits under. Dated work with no
 * epic shares one group, last. Work with no date of any kind is a count.
 *
 * The calendar (core/calendar.ts) reads this fold rather than its own, so the
 * two views cannot show one epic on two different dates.
 */

/** ISO dates, both ends inclusive. */
export interface Span {
  from: string;
  to: string;
}

export type Scale = 'day' | 'week' | 'month';
export const SCALES: readonly Scale[] = ['day', 'week', 'month'];

export interface TimelineBar {
  id: string;
  label: string;
  title: string;
  type: string;
  status: string;
  /** What the bar plans: the task's own dates, the work's where it set none. null when there is neither. */
  plan: Span | null;
  /** `explicit`: both ends set on the task. `derived`: neither. `mixed`: one of each. */
  planSource: 'explicit' | 'derived' | 'mixed' | null;
  /** First start to last finish; `open` while some of the work is still in progress, ending today. */
  actual: (Span & { open: boolean }) | null;
  /** The work under it runs outside the dates set on it — said, not resolved. */
  mismatch: string | null;
}

export interface TimelineGroup {
  /** null for the group of dated work that has no epic. */
  epic: TimelineBar | null;
  children: TimelineBar[];
}

export interface Timeline {
  asOf: string;
  scale: Scale;
  /** The span every bar and marker fits in, or null when nothing is dated. */
  window: Span | null;
  groups: TimelineGroup[];
  markers: {
    sprints: Array<{ name: string; from: string; to: string }>;
    milestones: Array<{ label: string; name: string; date: string }>;
  };
  /** Tasks with no date of any kind, planned or actual. Not drawn, only counted (DEC-73). */
  undated: number;
  /**
   * Finished tasks with no plan and no epic, left out of the no-epic group
   * unless `all` was asked for. On a long journal they are most of it, and
   * they sit on top of the plan the timeline is for (owner, 2026-10-31).
   */
  hiddenFinished: number;
}

export interface TimelineOptions {
  scale?: Scale;
  /** Keep finished, unplanned work in the no-epic group. */
  all?: boolean;
}

const day = (ts: string): string => ts.slice(0, 10);

function union(spans: ReadonlyArray<Span | null>): Span | null {
  let from: string | null = null;
  let to: string | null = null;
  for (const s of spans) {
    if (s === null) continue;
    if (from === null || s.from < from) from = s.from;
    if (to === null || s.to > to) to = s.to;
  }
  return from === null || to === null ? null : { from, to };
}

/** Days from `from` to `to`, inclusive. */
function spanDays(s: Span): number {
  return Math.round((Date.parse(`${s.to}T00:00:00Z`) - Date.parse(`${s.from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Days up to six weeks, weeks up to six months, months beyond. */
export function pickScale(window: Span): Scale {
  const n = spanDays(window);
  if (n <= 42) return 'day';
  if (n <= 183) return 'week';
  return 'month';
}

export function timeline(state: ProjectState, today: Date, options: TimelineOptions = {}): Timeline {
  const live = state.tasks.filter((t) => t.status !== CANCELLED_STATUS);
  const byId = new Map(live.map((t) => [t.id, t]));
  const children = new Map<string, Task[]>();
  for (const t of live) {
    if (t.parent === null || !byId.has(t.parent)) continue;
    const list = children.get(t.parent) ?? [];
    list.push(t);
    children.set(t.parent, list);
  }
  const order = (a: Task, b: Task): number => compareRank(a, b) || (a.id < b.id ? -1 : 1);
  for (const list of children.values()) list.sort(order);

  const sprintSpan = new Map<string, Span>();
  for (const s of state.sprints) {
    if (s.startDate !== null && s.endDate !== null) sprintSpan.set(s.id, { from: s.startDate, to: s.endDate });
  }

  // Memoised per task: a parent chain is walked once however many rows ask.
  // A cycle in `parent` is surfaced by the fold, never followed here twice.
  const derivedMemo = new Map<string, Span | null>();
  const workMemo = new Map<string, Span | null>();
  const visiting = new Set<string>();

  /** What the work says: the task's sprint and every descendant's plan. */
  function derived(t: Task): Span | null {
    if (derivedMemo.has(t.id)) return derivedMemo.get(t.id)!;
    if (visiting.has(t.id)) return null;
    visiting.add(t.id);
    const result = union([
      t.sprint === null ? null : (sprintSpan.get(t.sprint) ?? null),
      ...(children.get(t.id) ?? []).map(work),
    ]);
    visiting.delete(t.id);
    derivedMemo.set(t.id, result);
    return result;
  }

  /** The plan, field by field: a date set on the task wins over what the work says. */
  function plan(t: Task): Span | null {
    const d = derived(t);
    const from = t.start ?? d?.from ?? t.due;
    const to = t.due ?? d?.to ?? t.start;
    return from === null || to === null ? null : { from, to: to < from ? from : to };
  }

  /** Everything the task and its descendants occupy: the bar its parent stretches to. */
  function work(t: Task): Span | null {
    if (workMemo.has(t.id)) return workMemo.get(t.id)!;
    const result = union([plan(t), derived(t)]);
    workMemo.set(t.id, result);
    return result;
  }

  const asOf = today.toISOString().slice(0, 10);
  const status = { started: state.started, statuses: state.statuses, changes: state.startedChanges };

  /** First start, last finish and whether anything is still open, over the task and everything under it. */
  interface Happened {
    from: string | null;
    to: string | null;
    open: boolean;
  }
  // Memoised like the plan: on a long chain of parents, walking each task's
  // subtree afresh would be quadratic in its depth.
  const happenedMemo = new Map<string, Happened>();
  function happened(t: Task): Happened {
    const known = happenedMemo.get(t.id);
    if (known !== undefined) return known;
    // Seeded before the children are visited, so a parent cycle ends here.
    const h: Happened = { from: null, to: null, open: false };
    happenedMemo.set(t.id, h);
    const finished = finishedAt(t);
    const began = startedAt(t, status.started, status.statuses, status.changes) ?? finished;
    if (began !== null) {
      h.from = day(began);
      if (finished === null) h.open = true;
      else h.to = day(finished);
    }
    for (const c of children.get(t.id) ?? []) {
      const ch = happened(c);
      if (ch.from !== null && (h.from === null || ch.from < h.from)) h.from = ch.from;
      if (ch.to !== null && (h.to === null || ch.to > h.to)) h.to = ch.to;
      if (ch.open) h.open = true;
    }
    return h;
  }

  function actual(t: Task): (Span & { open: boolean }) | null {
    const { from, to, open } = happened(t);
    if (from === null) return null;
    const end = open ? asOf : (to ?? from);
    return { from, to: end < from ? from : end, open };
  }

  function bar(t: Task): TimelineBar {
    const p = plan(t);
    const d = derived(t);
    const own = Number(t.start !== null) + Number(t.due !== null);
    const mismatches: string[] = [];
    if (d !== null && t.due !== null && d.to > t.due) mismatches.push(`the work runs to ${d.to}, after the planned end ${t.due}`);
    if (d !== null && t.start !== null && d.from < t.start) mismatches.push(`the work starts ${d.from}, before the planned start ${t.start}`);
    return {
      id: t.id,
      label: t.label,
      title: t.title,
      type: t.type,
      status: t.status,
      plan: p,
      planSource: p === null ? null : own === 2 || (own === 1 && d === null) ? 'explicit' : own === 0 ? 'derived' : 'mixed',
      actual: actual(t),
      mismatch: mismatches.length === 0 ? null : mismatches.join('; '),
    };
  }

  const dated = (b: TimelineBar): boolean => b.plan !== null || b.actual !== null;

  /** The outermost epic above a task, itself included; null when there is none. */
  function topEpic(t: Task): Task | null {
    let found: Task | null = null;
    const seen = new Set<string>();
    for (let x: Task | undefined = t; x !== undefined && !seen.has(x.id); x = x.parent === null ? undefined : byId.get(x.parent)) {
      seen.add(x.id);
      if (x.type === 'epic') found = x;
    }
    return found;
  }

  // A group per outermost epic, wherever it sits: an epic under a plain task
  // still has nothing above it that is an epic.
  const groups: TimelineGroup[] = [];
  for (const epic of live.filter((t) => t.type === 'epic' && topEpic(t) === t).sort(order)) {
    const epicBar = bar(epic);
    const rows = (children.get(epic.id) ?? []).map(bar).filter(dated);
    if (dated(epicBar) || rows.length > 0) groups.push({ epic: epicBar, children: rows });
  }
  // Dated work with no epic above it, by its top-level task: one group, last.
  // Finished and never planned, it is history rather than plan. Under an epic
  // it stays — the epic is the plan it belongs to — but here it would only
  // bury what is still to come.
  const history = (b: TimelineBar): boolean =>
    b.plan === null && b.status === TERMINAL_STATUS && b.actual !== null && !b.actual.open;
  const looseAll = live
    .filter((t) => (t.parent === null || !byId.has(t.parent)) && topEpic(t) === null)
    .sort(order)
    .map(bar)
    .filter(dated);
  const loose = options.all === true ? looseAll : looseAll.filter((b) => !history(b));
  const hiddenFinished = looseAll.length - loose.length;
  if (loose.length > 0) groups.push({ epic: null, children: loose });

  // A task contributes nothing when neither it nor anything under it holds a
  // date, and nothing about it ever started.
  const undated = live.filter((t) => work(t) === null && actual(t) === null).length;

  const sprints = state.sprints
    .filter((s) => s.startDate !== null && s.endDate !== null && s.status !== 'cancelled')
    .map((s) => ({ name: s.name, from: s.startDate!, to: s.endDate! }));
  const milestones = state.milestones
    .filter((m) => m.due !== null)
    .map((m) => ({ label: m.label, name: m.name, date: m.due! }));

  const bars = groups.flatMap((g) => [...(g.epic === null ? [] : [g.epic]), ...g.children]);
  const window = union([
    ...bars.flatMap((b) => [b.plan, b.actual === null ? null : { from: b.actual.from, to: b.actual.to }]),
    ...sprints,
    ...milestones.map((m) => ({ from: m.date, to: m.date })),
  ]);

  return {
    asOf,
    scale: options.scale ?? (window === null ? 'week' : pickScale(window)),
    window,
    groups,
    markers: { sprints, milestones },
    undated,
    hiddenFinished,
  };
}
