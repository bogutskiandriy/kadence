import type { Task, TaskStatus, TaskType, Priority } from './projection.js';

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
    return 'No tasks yet.\nCreate the first one:\n  sprintit task add "title"';
  }
  return `No tasks match ${active.join(' and ')}.\nTry fewer filters:\n  sprintit task list`;
}

/** Valid values, exported so the CLI can list them in error messages. */
export const SORT_KEYS: readonly SortKey[] = ['created', 'priority', 'due', 'estimate'];

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

export type { TaskStatus, TaskType };
