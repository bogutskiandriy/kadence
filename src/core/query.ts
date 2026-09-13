import type { Task, TaskStatus, TaskType, Priority } from './projection.js';
import {
  TERMINAL_STATUS,
  CANCELLED_STATUS,
  DEFAULT_STATUSES,
  DEFAULT_STARTED,
} from './projection.js';
import { beforeStarted } from './flow.js';

/**
 * Filtering, search and sorting over a folded state.
 *
 * Pure functions on purpose: the CLI, the JSON contract and the future TUI all
 * need the same answers, and duplicating this logic per surface is how three
 * views start disagreeing about what "overdue" means.
 */

export interface TaskFilters {
  /** Substring across title, description and comments. */
  search?: string;
  status?: string;
  type?: string;
  priority?: string;
  /** An address, or `none` for unassigned work. */
  assignee?: string;
  label?: string;
  sprint?: string;
  overdue?: boolean;
  dueBefore?: string;
}

export type SortKey = 'created' | 'priority' | 'due' | 'estimate';

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function contains(haystack: string | null, needle: string): boolean {
  return haystack !== null && haystack.toLowerCase().includes(needle);
}

/**
 * Applies every filter with AND.
 *
 * OR would be almost always wrong: someone asking for `--type bug --priority
 * urgent` wants urgent bugs, not everything that is either.
 */
export function filterTasks(
  tasks: readonly Task[],
  filters: TaskFilters,
  today: Date = new Date(),
): Task[] {
  const todayIso = today.toISOString().slice(0, 10);
  const search = filters.search?.toLowerCase();

  return tasks.filter((t) => {
    if (search !== undefined && search.length > 0) {
      const inComments = t.comments.some((c) => c.text.toLowerCase().includes(search));
      if (!contains(t.title, search) && !contains(t.description, search) && !inComments) {
        return false;
      }
    }

    if (filters.status !== undefined && t.status !== filters.status) return false;
    if (filters.type !== undefined && t.type !== filters.type) return false;
    if (filters.priority !== undefined && t.priority !== filters.priority) return false;

    if (filters.assignee !== undefined) {
      const want = filters.assignee.toLowerCase();
      // `none` is the only way to ask for unassigned work — an empty string
      // would be indistinguishable from "filter not set".
      const actual = (t.assignee ?? '').toLowerCase();
      if (want === 'none' ? actual !== '' : actual !== want) return false;
    }

    if (filters.label !== undefined) {
      const want = filters.label.toLowerCase();
      if (!t.labels.some((l) => l.toLowerCase() === want)) return false;
    }

    if (filters.sprint !== undefined && t.sprint !== filters.sprint) return false;

    // A task with no deadline can never be late — there is nothing to be late for.
    if (filters.overdue === true && (t.due === null || t.due >= todayIso)) return false;
    if (filters.dueBefore !== undefined && (t.due === null || t.due >= filters.dueBefore)) {
      return false;
    }

    return true;
  });
}

/**
 * Sorts a copy — the caller's array is never reordered.
 *
 * Tasks missing the sort value always go last: a missing deadline is not
 * "the year zero", and a missing estimate is not zero points.
 */
export function sortTasks(tasks: readonly Task[], key: SortKey): Task[] {
  const out = [...tasks];

  switch (key) {
    case 'priority':
      return out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    case 'due':
      return out.sort((a, b) => nullsLast(a.due, b.due, (x, y) => (x < y ? -1 : x > y ? 1 : 0)));
    case 'estimate':
      return out.sort((a, b) => nullsLast(a.estimate, b.estimate, (x, y) => y - x));
    case 'created':
    default:
      // Ids are ULIDs, so lexicographic order is creation order.
      return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}

function nullsLast<T>(a: T | null, b: T | null, compare: (x: T, y: T) => number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

/**
 * Explains an empty result by naming the filters that produced it.
 *
 * "No tasks found" leaves the user guessing whether the board is empty or the
 * query was too narrow — and those call for opposite next steps.
 */
export function describeEmptyResult(filters: TaskFilters): string {
  const active: string[] = [];
  if (filters.search !== undefined) active.push(`search="${filters.search}"`);
  if (filters.status !== undefined) active.push(`status=${filters.status}`);
  if (filters.type !== undefined) active.push(`type=${filters.type}`);
  if (filters.priority !== undefined) active.push(`priority=${filters.priority}`);
  if (filters.assignee !== undefined) active.push(`assignee=${filters.assignee}`);
  if (filters.label !== undefined) active.push(`label=${filters.label}`);
  if (filters.overdue === true) active.push('overdue');
  if (filters.dueBefore !== undefined) active.push(`due before ${filters.dueBefore}`);

  if (active.length === 0) {
    return 'No tasks yet.\nCreate the first one:\n  kadence task add "title"';
  }
  return `No tasks match ${active.join(' and ')}.\nTry fewer filters:\n  kadence task list`;
}

export interface ReadyOptions {
  /** Whose claim counts as "mine". Absent means every claim is somebody else's. */
  viewer?: string | null;
  /** An address, `me` for the viewer, or `none` for unassigned work. */
  assignee?: string;
  /** The board's column order. Defaults to the standard board. */
  statuses?: readonly string[];
  /** The column at which work counts as started. Defaults to the standard board. */
  started?: string;
}

/**
 * The statuses work can still be started from, for this team's board.
 *
 * `null` when the started column is not on the board at all — the same answer
 * `beforeStarted` gives, and for the same reason: with no board order to
 * reason from, claiming to know what has begun would be a guess.
 */
function startableStatuses(options: ReadyOptions): ReadonlySet<string> | null {
  return beforeStarted(options.statuses ?? DEFAULT_STATUSES, options.started ?? DEFAULT_STARTED);
}

/** A task nobody is waiting on any more: finished, or never going to happen. */
export function isFinished(task: Task): boolean {
  return task.status === TERMINAL_STATUS || task.status === CANCELLED_STATUS;
}

/**
 * The work that can start right now.
 *
 * Four exclusions, each with a reason a person would give out loud: the task
 * is finished, it has already started, something it waits on is not done, or
 * somebody else is on it. A contested task stays in — two people claimed it,
 * and that needs a human to look, not a filter to hide.
 *
 * The second one was missing until 2026-09-13, and it cost more than it looks:
 * a task sitting in `in_review` was offered first and the command printed
 * `kadence task claim KAD-1` under it, so an agent following `prime → ready →
 * claim` took work somebody was reviewing. Started is the board's own boundary,
 * the one every flow measure already uses, so a team that renames its columns
 * keeps a `ready` that means what its board means.
 */
export function readyTasks(tasks: readonly Task[], options: ReadyOptions = {}): Task[] {
  const viewer = options.viewer ?? null;
  const finished = new Set(tasks.filter(isFinished).map((t) => t.id));
  // `me` with nobody viewing cannot mean anyone, and matching the literal
  // string would quietly return an empty list for a reason nobody could see.
  const wanted =
    options.assignee === 'me' ? viewer : (options.assignee ?? null);

  const startable = startableStatuses(options);

  const open = tasks.filter((task) => {
    if (isFinished(task)) return false;
    // Ready means ready to *start*. Anything in the started column or past it
    // has begun — including the blocked column, which is exactly where work
    // that cannot continue is parked.
    if (startable !== null && !startable.has(task.status)) return false;
    // `blockedBy` only ever names live tasks — the fold prunes ids whose task
    // was deleted — so an id that is not finished is genuinely still blocking.
    if (task.blockedBy.some((id) => !finished.has(id))) return false;
    if (task.claimedBy !== null && task.claimedBy !== viewer && task.contestedBy.length === 0) {
      return false;
    }
    if (wanted !== null) {
      if (wanted === 'none') return task.assignee === null;
      if (task.assignee !== wanted) return false;
    }
    return true;
  });

  // Priority first, then age. Age breaks the tie because the oldest untouched
  // task is the one most likely to be forgotten.
  return open.sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.id < b.id ? -1 : 1),
  );
}

/**
 * Why a board with tasks on it still offers nothing to start.
 *
 * An empty list is the same output whether the work is done, blocked or
 * somebody else's, and those are three different next steps.
 */
export function describeNothingReady(
  tasks: readonly Task[],
  viewer: string | null,
  assignee?: string,
  options: ReadyOptions = {},
): string {
  if (tasks.length === 0) {
    return 'No tasks yet.\nCreate the first one:\n  kadence task add "title"';
  }
  const open = tasks.filter((t) => !isFinished(t));
  if (open.length === 0) return 'Nothing ready: every task is done or cancelled.';

  const finished = new Set(tasks.filter(isFinished).map((t) => t.id));
  const startable = startableStatuses(options);
  const inFlight =
    startable === null ? 0 : open.filter((t) => !startable.has(t.status)).length;
  const blocked = open.filter((t) => t.blockedBy.some((id) => !finished.has(id))).length;
  const claimed = open.filter(
    (t) => t.claimedBy !== null && t.claimedBy !== viewer && t.contestedBy.length === 0,
  ).length;

  const reasons: string[] = [];
  // In flight first: it is the most common reason a busy board offers nothing,
  // and the one a person is least likely to guess from an empty list.
  if (inFlight > 0) reasons.push(`${inFlight} already started`);
  if (blocked > 0) reasons.push(`${blocked} blocked`);
  if (claimed > 0) reasons.push(`${claimed} claimed by someone else`);
  // Naming the filter matters most when it is the filter that emptied the
  // list: without it a busy board reports "nothing ready" and no reason.
  if (assignee !== undefined) reasons.push(`filtered to assignee=${assignee}`);
  const tail = reasons.length > 0 ? ` (${reasons.join(', ')})` : '';
  return `Nothing ready${tail}.\nSee the whole board:\n  kadence task list`;
}

/** Valid values, exported so the CLI can list them in error messages. */
export const SORT_KEYS: readonly SortKey[] = ['created', 'priority', 'due', 'estimate'];

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

export type { TaskStatus, TaskType };
