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
/**
 * Where work is considered started, until a team says otherwise.
 *
 * Every flow measure begins here — cycle time, work item age, a sprint's
 * actual hours. It used to be a literal in three places while statuses were
 * configurable, so a board named `todo,doing,done` measured nothing and said
 * nothing. It is a setting now, folded exactly like the columns.
 */
export const DEFAULT_STARTED = 'in_progress';
/** Where a new task lands. The fold decides it; reports must agree with it. */
export const INITIAL_STATUS = 'backlog';

/**
 * One acceptance criterion — the evidence behind `done`.
 *
 * `n` is derived from ULID order during the fold, exactly as `KAD-N` is (I7).
 * Storing it would mean two branches that each added a criterion could not
 * merge without renumbering, which is the conflict the whole design avoids.
 */
export interface Criterion {
  /** ULID of the event that added it. Identity; `n` is derived. */
  id: string;
  n: number;
  text: string;
  checked: boolean;
  /** Who checked it, or null. Cleared when it is unchecked. */
  checkedBy: string | null;
}

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
  /** KAD-N — a derived label assigned during this fold. */
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
  /** ULID of the milestone this task belongs to, or null. At most one. */
  milestone: string | null;
  /** ULID of the parent task, or null. An epic is just a parent. */
  parent: string | null;
  /** ULIDs of tasks that must finish before this one can start. */
  blockedBy: string[];
  /** ISO date, no time: a deadline is a day, not a moment. */
  due: string | null;
  /**
   * Who is working on this right now, or null. The earliest live claim by
   * ULID holds, so two machines that both claimed before pushing agree on the
   * owner after the merge, whatever order the files are read in (ADR-011).
   */
  claimedBy: string | null;
  /** Timestamp of the winning claim. Informational, like every `ts`. */
  claimedAt: string | null;
  /**
   * Id of the `task.claimed` event that won. This, not `claimedAt`, is how
   * anything downstream finds the claim in `history`: two machines can write
   * the same `ts`, and then a search by timestamp lands on the loser.
   */
  claimedEventId: string | null;
  /**
   * Actors who claimed the task while someone else held it.
   *
   * Kept rather than rejected: refusing the later claim would make the owner
   * depend on which branch merged first, which is invariant I1.
   */
  contestedBy: string[];
  /** Acceptance criteria, in the order they were added. */
  criteria: Criterion[];
  comments: Comment[];
  /** Repository-relative paths to documents that explain this task. */
  docs: string[];
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

/**
 * A group by outcome, where an epic groups by structure and a sprint by time.
 *
 * Not a third hierarchy: a task carries at most one milestone, as a field
 * beside `sprint`. Two parallel hierarchies drift in behaviour; one cannot.
 */
export interface Milestone {
  /** ULID. Identity; MS-N is derived during this fold (I7). */
  id: string;
  label: string;
  name: string;
  /** ISO date, or null. A target, not enforcement — nothing auto-closes. */
  due: string | null;
  status: 'open' | 'closed';
  /** The event that closed it. Lowest ULID — first write wins, like a sprint. */
  closedBy: string | null;
  taskIds: string[];
  donePoints: number;
  totalPoints: number;
  doneTasks: number;
  totalTasks: number;
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

/**
 * A recorded decision: what was chosen, why, and what was turned down.
 *
 * Superseding is one event, not two edits. A later decision carrying
 * `supersedes` marks the earlier one here while folding, so both directions are
 * derived from a single write and cannot fall out of step — the failure that
 * makes a reversed decision keep looking authoritative in file-based tools
 * (ADR-010, docs/research/decision-capture-2026-09.md).
 */
export interface Decision {
  /** ULID. Identity; DEC-N is derived during this fold (I7). */
  id: string;
  label: string;
  title: string;
  why: string;
  /** The alternative that was turned down, when one was named. */
  rejected: string | null;
  /** ULID of the task this decision came out of, when it came out of one. */
  task: string | null;
  /** Repository-relative paths to documents that carry the detail. */
  docs: string[];
  /** ULID of the decision this one replaces. */
  supersedes: string | null;
  /** Derived: ULID of the decision that replaced this one. */
  supersededBy: string | null;
  at: string;
  by: string;
  /**
   * Who wrote it, as recorded on the event.
   *
   * kadence refuses to guess this when writing. That refusal only means
   * something if the source survives to the point of reading — otherwise the
   * journal knows and the contract does not (ADR-010).
   */
  source: 'human' | 'agent';
}

/**
 * An insight worth keeping that was never a choice.
 *
 * Deliberately thinner than a Decision: no reason, no rejected alternative, no
 * number. A note that grows those fields is a decision, and the help says so —
 * if notes start replacing decisions, the "why" layer has gone quiet, and that
 * is a signal to watch rather than a success (ADR-010, feature-adoption).
 */
export interface Note {
  /** ULID. Identity and order; notes carry no derived label. */
  id: string;
  text: string;
  /** ULID of the task it came out of, when it came out of one. */
  task: string | null;
  at: string;
  by: string;
  source: 'human' | 'agent';
}

export interface ProjectState {
  tasks: Task[];
  decisions: Decision[];
  milestones: Milestone[];
  notes: Note[];
  sprints: Sprint[];
  templates: Template[];
  /** Configured columns, or the defaults when a team never changed them. */
  statuses: string[];
  /**
   * Criteria every new task starts with.
   *
   * Configuration, so the last write wins — but never retroactive: the
   * criteria a task carries live in that task's own journal, and raising the
   * standard cannot reach back into work already underway.
   */
  dod: string[];
  /** The status at which work counts as started. See DEFAULT_STARTED. */
  started: string;
  /**
   * Every change to that boundary, in ULID order.
   *
   * Kept because an event has to be able to ask what was in force *at its own
   * position*, not at the end of the fold: a `task.reopened` that arrives
   * deferred replays after the main loop, and reading the final value would
   * land it in a column that did not exist when it was written.
   */
  startedChanges: Array<{ id: string; started: string }>;
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



/**
 * The started boundary in force at a given event id.
 *
 * The changes arrive in ULID order, so the answer is the last one below it.
 * A linear scan backwards: boards are reconfigured a handful of times in a
 * repository's life, and a binary search would be more code than it saves.
 */
export function startedAtEvent(
  changes: readonly { id: string; started: string }[],
  id: string,
): string {
  for (let i = changes.length - 1; i >= 0; i--) {
    if (changes[i]!.id < id) return changes[i]!.started;
  }
  return DEFAULT_STARTED;
}

export function project(input: readonly FlowEvent[]): ProjectState {
  // A copy: the function must not mutate its input.
  const events = [...input].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const tasks = new Map<string, Task>();
  const sprints = new Map<string, Sprint>();
  const milestones = new Map<string, Milestone>();
  const templates = new Map<string, Template>();
  const decisions = new Map<string, Decision>();
  const notes: Note[] = [];
  let statuses: string[] | null = null;
  let dod: string[] = [];
  // Shared with apply() by reference: `task.reopened` resolves its target
  // against this timeline rather than against whatever the last event said.
  const config: { started: string; changes: Array<{ id: string; started: string }> } = {
    started: DEFAULT_STARTED,
    changes: [],
  };
  const rejected: FlowEvent[] = [];
  const deferred: FlowEvent[] = [];

  // Phase one. An entity can merge after events that refer to it: clocks
  // disagree between machines (I2), so a delta written on a lagging one
  // carries a lower ULID than the creation from a leading one. Creating every
  // entity up front is what lets phase two apply the rest in strict ULID
  // order — replaying the stragglers afterwards instead would let the oldest
  // event win, which is the opposite of what ADR-013 promises.
  for (const e of events) {
    if (e.type === 'task.created') seedTask(tasks, e);
    else if (e.type === 'sprint.created') seedSprint(sprints, e);
    else if (e.type === 'milestone.created') seedMilestone(milestones, e);
  }

  // Phase two: everything, in ULID order.
  for (const e of events) {
    // A decision is its own entity and never changes: superseding writes a new
    // one rather than editing this. Nothing to fold beyond recording it.
    if (e.type === 'decision.recorded') {
      const data = e.data ?? {};
      const text = (key: string): string | null =>
        typeof data[key] === 'string' && (data[key] as string).length > 0
          ? (data[key] as string)
          : null;
      const title = text('title');
      const why = text('why');
      // A malformed decision is skipped, not rejected into `rejected`: the
      // journal may outlive a schema change, and a half-written record is not
      // a conflict to report.
      if (title !== null && why !== null) {
        decisions.set(e.id, {
          id: e.id,
          label: '',
          title,
          why,
          rejected: text('rejected'),
          task: text('task'),
          docs: Array.isArray(data['docs'])
            ? (data['docs'] as unknown[]).filter((d): d is string => typeof d === 'string')
            : [],
          supersedes: text('supersedes'),
          supersededBy: null,
          at: e.ts,
          by: e.actor,
          source: e.source,
        });
      }
      continue;
    }

    // A note is its own entity and never changes. It is not recorded into the
    // task's history: an observation about a task is not something that
    // happened to it.
    if (e.type === 'note.recorded') {
      const text = readText(e.data?.['text']);
      if (text !== null) {
        notes.push({
          id: e.id,
          text,
          task: readText(e.data?.['task']),
          at: e.ts,
          by: e.actor,
          source: e.source,
        });
      }
      continue;
    }

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
      // Absent means "not part of this change"; an empty array means "clear
      // it". One event type carries both settings, so the two must differ.
      const criteria = e.data?.['dod'];
      if (Array.isArray(criteria)) {
        dod = criteria.filter((x): x is string => typeof x === 'string' && x.length > 0);
      }
      const started = readText(e.data?.['started']);
      if (started !== null) {
        config.started = started;
        config.changes.push({ id: e.id, started });
      }
      continue;
    }
    if (e.type === 'template.deleted') {
      const name = typeof e.data?.['name'] === 'string' ? e.data['name'] : null;
      if (name !== null) templates.delete(name);
      continue;
    }
    apply(e, tasks, sprints, milestones, rejected, deferred, config);
  }

  // What is left refers to an entity that no merged branch ever created — or
  // to one a `task.deleted` removed. Phase one seeded every entity the journal
  // does contain, so no replay could resolve these; they are reported, not
  // dropped, and never rejected, because rejecting them would make the state
  // depend on merge order and break I1.
  const pending = deferred;

  // Numbers are assigned in ULID order of creation — deterministically — so
  // two branches that independently created tasks end up with different
  // numbers after a merge, with no human involved (invariant I7).
  const ordered = [...tasks.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  ordered.forEach((task, i) => {
    task.label = `KAD-${i + 1}`;
    foldClaims(task);
    // Same rule as the label: derived from ULID order, never stored.
    task.criteria.sort((a, b) => (a.id < b.id ? -1 : 1));
    task.criteria.forEach((c, k) => {
      c.n = k + 1;
    });
    foldCriteria(task);
  });

  // A deleted parent leaves dangling references; drop them so the tree stays
  // walkable rather than pointing at tasks that no longer exist.
  const live = new Set(ordered.map((t) => t.id));
  for (const task of ordered) {
    if (task.parent !== null && !live.has(task.parent)) task.parent = null;
    task.blockedBy = task.blockedBy.filter((b) => live.has(b));
  }

  // Same rule as tasks: numbers come from ULID order, so two branches that each
  // recorded a decision agree after a merge with nobody renumbering (I7).
  const orderedDecisions = [...decisions.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  orderedDecisions.forEach((d, i) => {
    d.label = `DEC-${i + 1}`;
  });

  // The second half of superseding, derived rather than written. One event
  // carried `supersedes`; the backward link appears here, so it cannot be
  // forgotten the way a second file edit can be.
  for (const d of orderedDecisions) {
    if (d.supersedes === null) continue;
    // A decision may supersede one that is not merged yet. Keep the forward
    // link and wait: rejecting would make the state depend on merge order (I1).
    const earlier = decisions.get(d.supersedes);
    if (earlier !== undefined) earlier.supersededBy = d.id;
  }

  // Labels from ULID order, like KAD-N and DEC-N (I7). Two branches that each
  // created a milestone get different numbers after a merge, with no human
  // involved.
  const orderedMilestones = [...milestones.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  orderedMilestones.forEach((m, i) => {
    m.label = `MS-${i + 1}`;
  });

  // Membership is rebuilt from the task's own field, which holds exactly one:
  // a task moved between milestones must not linger in the first one's list,
  // and a deleted task must not linger in any.
  const byMilestone = new Map<string, string[]>();
  for (const task of ordered) {
    if (task.milestone === null) continue;
    if (!milestones.has(task.milestone)) {
      // The milestone lives on a branch that has not merged. Keep the pointer:
      // dropping it would lose the grouping when that branch lands.
      continue;
    }
    const list = byMilestone.get(task.milestone) ?? [];
    list.push(task.id);
    byMilestone.set(task.milestone, list);
  }
  for (const m of orderedMilestones) {
    m.taskIds = byMilestone.get(m.id) ?? [];
    const members = m.taskIds.map((id) => tasks.get(id)!).filter((t) => t !== undefined);
    m.totalTasks = members.length;
    m.doneTasks = members.filter((t) => t.status === TERMINAL_STATUS).length;
    m.totalPoints = members.reduce((n, t) => n + (t.estimate ?? 0), 0);
    m.donePoints = members
      .filter((t) => t.status === TERMINAL_STATUS)
      .reduce((n, t) => n + (t.estimate ?? 0), 0);
  }

  // A decision outlives the task it came from, but a dangling id helps nobody.
  for (const d of orderedDecisions) {
    if (d.task !== null && !live.has(d.task)) d.task = null;
  }
  // Same rule for notes: two entities that point at tasks must not diverge in
  // what a broken pointer means.
  for (const n of notes) {
    if (n.task !== null && !live.has(n.task)) n.task = null;
  }

  return {
    tasks: ordered,
    decisions: orderedDecisions,
    milestones: orderedMilestones,
    // Already in ULID order: notes are appended as the sorted loop reads them.
    notes,
    sprints: [...sprints.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    statuses: statuses ?? [...DEFAULT_STATUSES],
    dod,
    started: config.started,
    startedChanges: [...config.changes],
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

/**
 * The entity constructors, called twice: once in the first phase of the fold
 * and once from `apply` when the creating event comes round in the main loop.
 * Both guard on absence, so the second call is a no-op and the fields carried
 * by `task.created` stay the baseline every later delta is applied to.
 */
function seedTask(tasks: Map<string, Task>, e: FlowEvent): void {
  if (tasks.has(e.entity)) return;
  const data = e.data ?? {};
  tasks.set(e.entity, {
    id: e.entity,
    label: '',
    title: typeof data['title'] === 'string' ? data['title'] : '(untitled)',
    description: readText(data['description']),
    type: readType(data['type']),
    priority: readPriority(data['priority']),
    status: INITIAL_STATUS,
    labels: readLabels(data['labels']),
    assignee: readText(data['assignee']),
    reporter: e.actor,
    sprint: null,
    milestone: null,
    parent: readText(data['parent']),
    blockedBy: [],
    due: readText(data['due']),
    claimedBy: null,
    claimedAt: null,
    claimedEventId: null,
    contestedBy: [],
    criteria: [],
    comments: [],
    docs: [],
    estimate: typeof data['estimate'] === 'number' ? data['estimate'] : null,
    loggedHours: 0,
    createdAt: e.ts,
    updatedAt: e.ts,
    history: [],
  });
}

function seedSprint(sprints: Map<string, Sprint>, e: FlowEvent): void {
  if (sprints.has(e.entity)) return;
  const data = e.data ?? {};
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

function seedMilestone(milestones: Map<string, Milestone>, e: FlowEvent): void {
  if (milestones.has(e.entity)) return;
  const data = e.data ?? {};
  milestones.set(e.entity, {
    id: e.entity,
    label: '',
    name: typeof data['name'] === 'string' ? data['name'] : '(untitled)',
    due: readText(data['due']),
    status: 'open',
    closedBy: null,
    taskIds: [],
    donePoints: 0,
    totalPoints: 0,
    doneTasks: 0,
    totalTasks: 0,
  });
}

function apply(
  e: FlowEvent,
  tasks: Map<string, Task>,
  sprints: Map<string, Sprint>,
  milestones: Map<string, Milestone>,
  rejected: FlowEvent[],
  deferred: FlowEvent[],
  config: { started: string; changes: Array<{ id: string; started: string }> },
): boolean {
  const data = e.data ?? {};

  // Milestones are their own entity, like sprints, and are not folded into a
  // task's history: belonging to one is a fact about the grouping. They go
  // through `apply` rather than the main loop so that an event about an entity
  // that has not merged yet is held pending instead of dropped.
  if (e.type === 'milestone.created') {
    seedMilestone(milestones, e);
    return true;
  }

  if (e.type === 'milestone.task_added') {
    const taskId = readText(data['task']);
    if (taskId === null) return true;
    const task = tasks.get(taskId);
    if (task === undefined) {
      // The branch that created the task has not merged. Held, not dropped:
      // clock skew makes this reachable, and losing the grouping silently is
      // exactly what the pending queue exists to prevent.
      deferred.push(e);
      return false;
    }
    // The task holds the single membership; the milestone lists are rebuilt
    // from it at the end, so a reassignment cannot leave it in two. A milestone
    // from an unmerged branch keeps the pointer: it resolves when it lands.
    task.milestone = e.entity;
    return true;
  }

  if (e.type === 'milestone.closed') {
    const milestone = milestones.get(e.entity);
    if (milestone === undefined) {
      deferred.push(e);
      return false;
    }
    // First write by ULID wins, exactly as closing a sprint does (I5).
    if (milestone.closedBy === null) {
      milestone.status = 'closed';
      milestone.closedBy = e.id;
    } else {
      rejected.push(e);
    }
    return true;
  }

  if (e.type === 'task.created') {
    // Seeded in the first phase; re-created only if a `task.deleted` with a
    // lower id removed it again, which by ULID order the creation outlives.
    seedTask(tasks, e);
    record(tasks.get(e.entity)!, e);
    return true;
  }

  if (e.type === 'sprint.created') {
    seedSprint(sprints, e);
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
      // Back to wherever the board said work starts *at this event's position*
      // in ULID order — not to a literal, and not to whatever the newest
      // configuration says.
      task.status = startedAtEvent(config.changes, e.id);
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
      // Journals written before ADR-013 carry the whole set on `task.updated`.
    // Nothing writes it any more; everything still reads it, because deleting
    // `state.json` has to fold an old journal to exactly what it folded before
    // (I6).
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
    case 'task.label_added': {
      const label = readText(data['label']);
      if (label !== null && !task.labels.includes(label)) task.labels.push(label);
      break;
    }
    case 'task.label_removed': {
      const label = readText(data['label']);
      if (label !== null) task.labels = task.labels.filter((l) => l !== label);
      break;
    }
    case 'task.criterion_added': {
      const text = readText(data['text']);
      // A criterion with no text would render as an empty checkbox nobody can
      // act on; the event stays in history either way.
      if (text !== null) {
        task.criteria.push({ id: e.id, n: 0, text, checked: false, checkedBy: null });
      }
      break;
    }
    case 'task.criterion_checked':
    case 'task.criterion_unchecked':
      // Resolved in a second pass over the task's history, for the same reason
      // claims are: a check can carry a lower ULID than the criterion it names
      // when two machines' clocks disagree, and applying it as it arrives
      // would then drop it. See `foldCriteria`.
      break;
    case 'task.doc_linked': {
      const path = readText(data['path']);
      // Linking the same document twice is a no-op rather than a duplicate: two
      // branches may each have linked it, and both events survive the merge.
      if (path !== null && !task.docs.includes(path)) task.docs.push(path);
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
 * There is no longer an exception: phase one seeds the entities, so nothing is
 * applied after the main loop and history never lands out of order.
 */
/**
 * Claim state, folded from the task's own history rather than as events arrive.
 *
 * Since the two-phase fold it no longer *has* to be a second pass — history is
 * in ULID order while the main loop runs, so folding inline would give the
 * same answer. It stays one because the answer is defined over the whole
 * history: who holds the claim, who is contesting it, and what a release or a
 * move to the terminal status does to both are one rule (ADR-011), and
 * scattering it across four `apply` branches would let the four drift.
 */
/**
 * Checked state, folded from the task's own history.
 *
 * The list of criteria is built as events arrive; which of them are checked is
 * not, because a `task.criterion_checked` can carry a lower ULID than the
 * `task.criterion_added` it names — a machine with a lagging clock produces
 * exactly that. By this point the history is in ULID order, which is the order
 * the answer is defined in.
 */
function foldCriteria(task: Task): void {
  const byId = new Map(task.criteria.map((c) => [c.id, c]));
  for (const c of task.criteria) {
    c.checked = false;
    c.checkedBy = null;
  }
  for (const h of task.history) {
    if (h.type !== 'task.criterion_checked' && h.type !== 'task.criterion_unchecked') continue;
    const ref = readText(h.data['criterion']);
    const found = ref === null ? undefined : byId.get(ref);
    // A check naming a criterion that does not exist in any branch merged so
    // far has nothing to act on; the event stays in history either way.
    if (found === undefined) continue;
    const on = h.type === 'task.criterion_checked';
    found.checked = on;
    found.checkedBy = on ? h.actor : null;
  }
}

function foldClaims(task: Task): void {
  let claimedBy: string | null = null;
  let claimedAt: string | null = null;
  let claimedEventId: string | null = null;
  let contested: string[] = [];

  const clear = (): void => {
    claimedBy = null;
    claimedAt = null;
    claimedEventId = null;
    // The contest ends with the claim. Promoting the runner-up would hand
    // someone work they do not know they own.
    contested = [];
  };

  for (const h of task.history) {
    if (h.type === 'task.claimed') {
      // `by` and `actor` differ when an agent claims on behalf of a person.
      const by = readText(h.data['by']) ?? h.actor;
      if (claimedBy === null) {
        claimedBy = by;
        claimedAt = h.ts;
        claimedEventId = h.id;
      } else if (by !== claimedBy && !contested.includes(by)) {
        // Surfaced, not rejected — the same line the product holds for cycles
        // and orphan statuses. A second claimant is a fact about the team.
        contested.push(by);
      }
    } else if (h.type === 'task.released') {
      const by = readText(h.data['by']) ?? h.actor;
      if (claimedBy === by) clear();
      // Someone who only contested the task withdraws from the contest; a
      // release by a third party clears nothing, because there was nothing.
      else contested = contested.filter((a) => a !== by);
    } else if (h.type === 'task.cancelled') {
      clear();
    } else if (h.type === 'task.moved' && h.data['to'] === TERMINAL_STATUS) {
      // Finishing the work ends the claim: nobody has to remember to release
      // what the board already says is done (ADR-011).
      clear();
    }
  }

  task.claimedBy = claimedBy;
  task.claimedAt = claimedAt;
  task.claimedEventId = claimedEventId;
  task.contestedBy = contested;
}

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
 * may have been written by a newer kadence, and the state must stay usable.
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
