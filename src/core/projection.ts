import type { FlowEvent } from './event.js';

/**
 * Folding the journal into state.
 *
 * State is never stored — it is recomputed from the journal every time. Hence
 * the function is pure: the same set of events always yields the same result,
 * regardless of the order the files happened to appear on disk (invariant I1).
 */

/**
 * A status is a string, not a closed union.
 *
 * Teams configure their own columns, so the type cannot enumerate them. The
 * defaults below apply until a board.configured event says otherwise.
 */
export type TaskStatus = string;

export const DEFAULT_STATUSES: readonly string[] = [
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'cancelled',
];

/** Statuses the engine treats specially, whatever a team calls the rest. */
export const TERMINAL_STATUS = 'done';
export const CANCELLED_STATUS = 'cancelled';

export interface Comment {
  id: string;
  author: string;
  ts: string;
  text: string;
}

export interface HistoryEntry {
  id: string;
  type: string;
  actor: string;
  ts: string;
  data: Record<string, unknown>;
}

/** Task type — Jira's Issue Type reduced to the three that actually differ. */
export type TaskType = 'task' | 'bug' | 'story' | 'epic';

/**
 * An epic is a task type, not a separate entity.
 *
 * One hierarchy (parent/children) instead of two parallel ones: an epic is
 * simply a task that other tasks call parent. Jira reaches the same conclusion
 * by making Epic an issue type.
 */
export const TASK_TYPES: readonly TaskType[] = ['task', 'bug', 'story', 'epic'];

export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export const PRIORITIES: readonly Priority[] = ['low', 'normal', 'high', 'urgent'];

export interface Task {
  /** ULID — the stable identifier. */
  id: string;
  /** FLOW-N — a derived label assigned during this fold. */
  label: string;
  title: string;
  /** Full description. Lives in the event, not a separate file: a file per
   *  task is mutable state, which would hand us our competitors' conflicts. */
  description: string | null;
  type: TaskType;
  priority: Priority;
  status: TaskStatus;
  labels: string[];
  assignee: string | null;
  /** Who created the task — the author of the task.created event. */
  reporter: string;
  sprint: string | null;
  /** ULID of the parent task, or null. An epic is just a parent. */
  parent: string | null;
  /** ULIDs of tasks that must finish before this one can start. */
  blockedBy: string[];
  /** ISO date, no time: a deadline is a day, not a moment. */
  due: string | null;
  comments: Comment[];
  /** Estimate comes last: the substance of the task first, its cost after. */
  estimate: number | null;
  /** Hours actually logged against the task, entered by hand. */
  loggedHours: number;
  createdAt: string;
  updatedAt: string;
  /** Every event about the task, including those that lost a conflict. */
  history: HistoryEntry[];
}

export interface Sprint {
  id: string;
  name: string;
  description: string | null;
  /** ISO dates. Planning horizon, not enforcement: nothing auto-closes. */
  startDate: string | null;
  endDate: string | null;
  status: 'planned' | 'active' | 'closed' | 'cancelled';
  /** The event that closed the sprint. Lowest ULID — first-write-wins. */
  closedBy: string | null;
  taskIds: string[];
}

/** A closed loop found in the graph, reported rather than rejected. */
export interface Cycle {
  kind: 'parent' | 'blocking';
  /** Task ids forming the loop, starting and ending at the same task. */
  path: string[];
}

/** A saved set of task defaults, stored in the journal like everything else. */
export interface Template {
  name: string;
  fields: Record<string, unknown>;
  author: string;
}

export interface ProjectState {
  tasks: Task[];
  sprints: Sprint[];
  templates: Template[];
  /** Configured columns, or the defaults when a team never changed them. */
  statuses: string[];
  /**
   * Statuses used by tasks but missing from the configuration.
   *
   * One branch can drop a column while another moves a task into it. Rejecting
   * either would make the state depend on merge order, so both survive and the
   * orphaned status is reported instead.
   */
  orphanStatuses: string[];
  /**
   * Cycles are surfaced, never silently broken.
   *
   * Rejecting the later event would make the state depend on which branches
   * happen to be merged, breaking invariant I1 — the property the whole
   * design rests on. So both events live and the CLI warns.
   */
  cycles: Cycle[];
  /** Events about entities that do not exist yet — a branch may be unmerged. */
  pending: FlowEvent[];
  /** Events rejected by the rules, e.g. adding to a closed sprint. */
  rejected: FlowEvent[];
}



export function project(input: readonly FlowEvent[]): ProjectState {
  // A copy: the function must not mutate its input.
  const events = [...input].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const tasks = new Map<string, Task>();
  const sprints = new Map<string, Sprint>();
  const templates = new Map<string, Template>();
  let statuses: string[] | null = null;
  const rejected: FlowEvent[] = [];
  const deferred: FlowEvent[] = [];

  for (const e of events) {
    // Templates are configuration, not entities: they have no history and the
    // last write simply wins, like any other setting.
    if (e.type === 'template.saved') {
      const name = typeof e.data?.['name'] === 'string' ? e.data['name'] : null;
      if (name !== null) {
        templates.set(name, {
          name,
          fields: (e.data?.['fields'] as Record<string, unknown>) ?? {},
          author: e.actor,
        });
      }
      continue;
    }
    if (e.type === 'board.configured') {
      const list = e.data?.['statuses'];
      if (Array.isArray(list)) {
        const clean = list.filter((x): x is string => typeof x === 'string' && x.length > 0);
        if (clean.length > 0) statuses = clean;
      }
      continue;
    }
    if (e.type === 'template.deleted') {
      const name = typeof e.data?.['name'] === 'string' ? e.data['name'] : null;
      if (name !== null) templates.delete(name);
      continue;
    }
    apply(e, tasks, sprints, rejected, deferred);
  }

  // An event can arrive before the entity it refers to: the branch that
  // created it simply has not been merged yet. Repeat while at least one finds
  // its target — each pass either shrinks the queue or ends the loop.
  const hadDeferred = deferred.length > 0;
  let pending = deferred;
  while (pending.length > 0) {
    const stillPending: FlowEvent[] = [];
    for (const e of pending) {
      apply(e, tasks, sprints, rejected, stillPending);
    }
    if (stillPending.length === pending.length) {
      pending = stillPending;
      break; // none applied — nothing will move on the next pass
    }
    pending = stillPending;
  }

  // Deferred events landed in history out of order — restore it.
  if (hadDeferred) {
    for (const task of tasks.values()) {
      task.history.sort((a, b) => (a.id < b.id ? -1 : 1));
    }
  }

  // Numbers are assigned in ULID order of creation — deterministically — so
  // two branches that independently created tasks end up with different
  // numbers after a merge, with no human involved (invariant I7).
  const ordered = [...tasks.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  ordered.forEach((task, i) => {
    task.label = `FLOW-${i + 1}`;
  });

  // A deleted parent leaves dangling references; drop them so the tree stays
  // walkable rather than pointing at tasks that no longer exist.
  const live = new Set(ordered.map((t) => t.id));
  for (const task of ordered) {
    if (task.parent !== null && !live.has(task.parent)) task.parent = null;
    task.blockedBy = task.blockedBy.filter((b) => live.has(b));
  }

  return {
    tasks: ordered,
    sprints: [...sprints.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    statuses: statuses ?? [...DEFAULT_STATUSES],
    orphanStatuses: [
      ...new Set(
        ordered
          .map((t) => t.status)
          .filter((st) => !(statuses ?? DEFAULT_STATUSES).includes(st)),
      ),
    ].sort(),
    templates: [...templates.values()].sort((a, b) => a.name.localeCompare(b.name)),
    cycles: findCycles(ordered),
    pending,
    rejected,
  };
}

function apply(
  e: FlowEvent,
  tasks: Map<string, Task>,
  sprints: Map<string, Sprint>,
  rejected: FlowEvent[],
  deferred: FlowEvent[],
): boolean {
  const data = e.data ?? {};

  if (e.type === 'task.created') {
    if (!tasks.has(e.entity)) {
      tasks.set(e.entity, {
        id: e.entity,
        label: '',
        title: typeof data['title'] === 'string' ? data['title'] : '(untitled)',
        description: readText(data['description']),
        type: readType(data['type']),
        priority: readPriority(data['priority']),
        status: 'backlog',
        labels: readLabels(data['labels']),
        assignee: readText(data['assignee']),
        reporter: e.actor,
        sprint: null,
        parent: readText(data['parent']),
        blockedBy: [],
        due: readText(data['due']),
        comments: [],
        estimate: typeof data['estimate'] === 'number' ? data['estimate'] : null,
        loggedHours: 0,
        createdAt: e.ts,
        updatedAt: e.ts,
        history: [],
      });
    }
    record(tasks.get(e.entity)!, e);
    return true;
  }

  if (e.type === 'sprint.created') {
    if (!sprints.has(e.entity)) {
      sprints.set(e.entity, {
        id: e.entity,
        name: typeof data['name'] === 'string' ? data['name'] : '(untitled)',
        description: readText(data['description']),
        startDate: readText(data['startDate']),
        endDate: readText(data['endDate']),
        status: 'planned',
        closedBy: null,
        taskIds: [],
      });
    }
    return true;
  }

  if (e.type.startsWith('sprint.')) {
    const sprint = sprints.get(e.entity);
    if (sprint === undefined) {
      deferred.push(e);
      return false;
    }

    if (e.type === 'sprint.started') {
      if (sprint.status === 'planned') sprint.status = 'active';
      return true;
    }

    if (e.type === 'sprint.updated') {
      // A closed sprint is a historical fact — invariant I5 keeps it frozen.
      if (sprint.status === 'closed') {
        rejected.push(e);
        return true;
      }
      if (typeof data['name'] === 'string') sprint.name = data['name'];
      if (data['description'] !== undefined) sprint.description = readText(data['description']);
      if (data['startDate'] !== undefined) sprint.startDate = readText(data['startDate']);
      if (data['endDate'] !== undefined) sprint.endDate = readText(data['endDate']);
      return true;
    }

    if (e.type === 'sprint.closed') {
      // The one first-write-wins transition: closing records a fact that may
      // already have been published, so a later close does not overwrite it (I5).
      if (sprint.closedBy === null) {
        sprint.status = 'closed';
        sprint.closedBy = e.id;
      } else {
        rejected.push(e);
      }
      return true;
    }

    if (e.type === 'sprint.cancelled') {
      if (sprint.status === 'planned') sprint.status = 'cancelled';
      else rejected.push(e);
      return true;
    }

    if (e.type === 'sprint.task_added') {
      // Adding to a closed sprint is rejected — otherwise the velocity of past
      // sprints would drift retroactively.
      if (sprint.status === 'closed') {
        rejected.push(e);
        return true;
      }
      const taskId = typeof data['task'] === 'string' ? data['task'] : null;
      if (taskId === null) return true;
      const task = tasks.get(taskId);
      if (task === undefined) {
        deferred.push(e);
        return false;
      }
      task.sprint = sprint.id;
      if (!sprint.taskIds.includes(taskId)) sprint.taskIds.push(taskId);
      record(task, e);
      return true;
    }
    return true;
  }

  // Everything else is a task event.
  const task = tasks.get(e.entity);
  if (task === undefined) {
    deferred.push(e);
    return false;
  }

  // Deletion is still an append: the event stays in the journal forever, the
  // task simply stops appearing in projections. There is no way to erase
  // history here, and pretending otherwise would be a lie.
  if (e.type === 'task.deleted') {
    tasks.delete(e.entity);
    return true;
  }

  switch (e.type) {
    case 'task.moved': {
      const to = data['to'];
      // Any non-empty string is accepted: validation belongs to the CLI, which
      // knows the configuration. The fold must not silently drop a real move
      // just because a column was renamed on another branch.
      if (typeof to === 'string' && to.length > 0) task.status = to;
      break;
    }
    case 'task.cancelled':
      task.status = CANCELLED_STATUS;
      break;
    case 'task.reopened':
      task.status = 'in_progress';
      break;
    case 'task.assigned':
      // null unassigns — a deliberate action, not missing data.
      task.assignee = readText(data['assignee']);
      break;
    case 'task.updated':
      // Only provided fields change: an event records a change, not full state.
      if (typeof data['title'] === 'string') task.title = data['title'];
      if (data['description'] !== undefined) task.description = readText(data['description']);
      if (data['type'] !== undefined) task.type = readType(data['type']);
      if (data['priority'] !== undefined) task.priority = readPriority(data['priority']);
      if (data['labels'] !== undefined) task.labels = readLabels(data['labels']);
      if (data['due'] !== undefined) task.due = readText(data['due']);
      if (typeof data['estimate'] === 'number') task.estimate = data['estimate'];
      break;
    case 'task.parent_set':
      // null detaches — a deliberate action, same rule as unassigning.
      task.parent = readText(data['parent']);
      break;
    case 'task.blocked_by_added': {
      const blocker = readText(data['blocker']);
      if (blocker !== null && !task.blockedBy.includes(blocker)) task.blockedBy.push(blocker);
      break;
    }
    case 'task.blocked_by_removed': {
      const blocker = readText(data['blocker']);
      if (blocker !== null) task.blockedBy = task.blockedBy.filter((b) => b !== blocker);
      break;
    }
    case 'task.time_logged': {
      const hours = data['hours'];
      // Negative entries are how people correct a mistyped log, so they are
      // allowed — but the running total never goes below zero.
      if (typeof hours === 'number' && Number.isFinite(hours)) {
        task.loggedHours = Math.max(0, task.loggedHours + hours);
      }
      break;
    }
    case 'task.commented': {
      const text = readText(data['text']);
      if (text !== null) {
        task.comments.push({ id: e.id, author: e.actor, ts: e.ts, text });
      }
      break;
    }
    default:
      break; // task.commented and others leave a trace only in history
  }

  record(task, e);
  return true;
}

/**
 * Events arrive already ordered by ULID, so history accumulates in the right
 * order by itself. Sorting here is not allowed: calling it per event makes the
 * work quadratic — on 10,000 events that cost ~80 ms out of a 200 ms budget.
 *
 * The one exception is deferred events applied later; for those the order is
 * restored once, at the end of the fold.
 */
function record(task: Task, e: FlowEvent): void {
  task.history.push({ id: e.id, type: e.type, actor: e.actor, ts: e.ts, data: e.data ?? {} });
  if (e.ts > task.updatedAt) task.updatedAt = e.ts;
}

/** A string or null. An empty string counts as no value. */
function readText(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * An unknown type falls back to `task` rather than breaking the fold: the event
 * may have been written by a newer sprintit, and the state must stay usable.
 */
function readType(v: unknown): TaskType {
  return TASK_TYPES.includes(v as TaskType) ? (v as TaskType) : 'task';
}

function readPriority(v: unknown): Priority {
  return PRIORITIES.includes(v as Priority) ? (v as Priority) : 'normal';
}

function readLabels(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/**
 * Finds cycles in both graphs with a deterministic depth-first walk.
 *
 * Determinism matters more than elegance here: tasks are visited in ULID order
 * and neighbours in stored order, so the same journal always reports the same
 * cycles in the same order — on every machine, whatever the merge order was.
 */
export function findCycles(tasks: readonly Task[]): Cycle[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const cycles: Cycle[] = [];
  const seen = new Set<string>();

  const walk = (kind: 'parent' | 'blocking', neighbours: (t: Task) => string[]): void => {
    const state = new Map<string, 'visiting' | 'done'>();

    const visit = (id: string, path: string[]): void => {
      const mark = state.get(id);
      if (mark === 'done') return;
      if (mark === 'visiting') {
        // Normalise the loop so the same cycle is reported once, whichever
        // node the walk happened to enter it from.
        const start = path.indexOf(id);
        const loop = path.slice(start);
        const key = `${kind}:${[...loop].sort().join(',')}`;
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push({ kind, path: [...loop, id] });
        }
        return;
      }

      state.set(id, 'visiting');
      const task = byId.get(id);
      if (task !== undefined) {
        for (const next of neighbours(task)) visit(next, [...path, id]);
      }
      state.set(id, 'done');
    };

    for (const task of tasks) visit(task.id, []);
  };

  walk('parent', (t) => (t.parent === null ? [] : [t.parent]));
  walk('blocking', (t) => t.blockedBy);
  return cycles;
}

/** Direct children of a task, in creation order. */
export function childrenOf(tasks: readonly Task[], parentId: string): Task[] {
  return tasks.filter((t) => t.parent === parentId);
}
