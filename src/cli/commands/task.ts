import { findRepoRoot, getActorEmail } from '../../core/git.js';
import { append, dataDir, readAll } from '../../core/store.js';
import { ulid } from '../../core/ulid.js';
import type { FlowEvent } from '../../core/event.js';
import {
  TASK_TYPES,
  PRIORITIES,
  DEFAULT_STATUSES,
  type ProjectState,
  type Task,
  type TaskStatus,
  type TaskType,
  type Priority,
} from '../../core/projection.js';
import { loadOrBuild } from '../../core/snapshot.js';
import { renderTaskTable, renderTaskTree, renderTaskDetail, colorsEnabled, describeMerge } from '../output.js';
import {
  filterTasks,
  sortTasks,
  describeEmptyResult,
  isSortKey,
  SORT_KEYS,
  type TaskFilters,
  type SortKey,
} from '../../core/query.js';
import { existsSync } from 'node:fs';

/**
 * Default columns, shown in help before a repository exists.
 *
 * The live list comes from the folded state — a team may have configured its
 * own — so validation always uses that, never this constant.
 */
export const TASK_STATUSES: readonly string[] = DEFAULT_STATUSES;

export interface CommandResult {
  ok: boolean;
  message: string;
  /** Payload for --json mode. */
  data?: Record<string, unknown>;
  /** Goes to stderr so it never corrupts the JSON on stdout. */
  warnings?: string[];
  exitCode: 0 | 1 | 2;
}

export interface Context {
  root: string;
  actor: string;
  source: 'human' | 'agent';
}

/**
 * Shared setup for every command that touches the journal.
 *
 * Three checks in one place, because each is a leading reason a user's first
 * attempt ends in nothing.
 */
export function resolveContext(cwd: string, env: NodeJS.ProcessEnv): Context | CommandResult {
  const root = findRepoRoot(cwd);
  if (root === null) {
    return {
      ok: false,
      exitCode: 1,
      message:
        'kadence lives inside a git repository, and there is none here.\n' +
        'Create one and try again:\n  git init',
    };
  }

  // Check .kadence/, NOT .kadence/events/: git does not version empty
  // directories, so the events folder disappears when switching to a branch
  // without events. The CLI used to demand a repeat init on a perfectly
  // working repository — found by the merge integration test.
  if (!existsSync(dataDir(root))) {
    return {
      ok: false,
      exitCode: 1,
      message: 'No .kadence/ found here.\nRun:\n  npx kadence init',
    };
  }

  const actor = getActorEmail(root);
  if (actor === null) {
    return {
      ok: false,
      exitCode: 1,
      message:
        'Git does not know who you are, so there is no author for the event.\n' +
        'Run:\n  git config user.email you@example.com',
    };
  }

  // We never guess the source: without the variable an event counts as human.
  const source = env['KADENCE_SOURCE'] === 'agent' ? 'agent' : 'human';
  return { root, actor, source };
}

export function isContext(v: Context | CommandResult): v is Context {
  return 'root' in v;
}

export interface TaskFields {
  parent?: string;
  description?: string;
  type?: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  due?: string;
  /** Estimate comes last: the substance of the task first, its cost after. */
  estimate?: number;
}

export function runTaskAdd(
  cwd: string,
  env: NodeJS.ProcessEnv,
  title: string,
  options: TaskFields = {},
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { ok: false, exitCode: 2, message: 'A task needs a title.' };
  }

  if (options.type !== undefined && !TASK_TYPES.includes(options.type as TaskType)) {
    return {
      ok: false,
      exitCode: 2,
      message: `Unknown type "${options.type}".\nAvailable: ${TASK_TYPES.join(', ')}`,
    };
  }
  if (options.priority !== undefined && !PRIORITIES.includes(options.priority as Priority)) {
    return {
      ok: false,
      exitCode: 2,
      message: `Unknown priority "${options.priority}".\nAvailable: ${PRIORITIES.join(', ')}`,
    };
  }

  // A parent may be given as KAD-1, but the event must store the stable ULID.
  let resolvedParent: string | undefined;
  if (options.parent !== undefined) {
    const { state } = loadState(ctx.root, ctx.actor);
    const parent = findTask(state, options.parent);
    if (parent === undefined) {
      return {
        ok: false,
        exitCode: 1,
        message: `No parent task ${options.parent}.\n  kadence task list`,
      };
    }
    resolvedParent = parent.id;
  }

  // The event and the entity it creates share one ULID: for task.created they
  // are the same thing. The human-readable KAD-N is assigned while folding the
  // journal, not here — otherwise two branches diverging from a common ancestor
  // would hand out the same number (Probe A, invariant I7).
  const id = ulid();
  const event: FlowEvent = {
    id,
    type: 'task.created',
    entity: id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    // Field order is deliberate: substance, then classification, then cost.
    data: {
      title: trimmed,
      ...(options.description !== undefined ? { description: options.description } : {}),
      ...(options.type !== undefined ? { type: options.type } : {}),
      ...(options.priority !== undefined ? { priority: options.priority } : {}),
      ...(options.assignee !== undefined ? { assignee: options.assignee } : {}),
      ...(options.labels !== undefined && options.labels.length > 0
        ? { labels: options.labels }
        : {}),
      ...(options.due !== undefined ? { due: options.due } : {}),
      ...(resolvedParent !== undefined ? { parent: resolvedParent } : {}),
      ...(options.estimate !== undefined ? { estimate: options.estimate } : {}),
    },
  };

  append(ctx.root, event);

  const warning =
    options.estimate === undefined
      ? '\nWithout an estimate this task will not count towards velocity. Add --estimate.'
      : '';

  return {
    ok: true,
    exitCode: 0,
    message: `Created: ${trimmed}${warning}`,
    data: { schema: 'kadence/v1', ok: true, task: { id, title: trimmed } },
  };
}

/** Reads the journal and folds it into state. */
export function loadState(
  root: string,
  currentActor?: string,
): { state: ProjectState; warnings: string[] } {
  const loaded = loadOrBuild(root, currentActor);
  const read = readAll(root);
  const warnings: string[] = [];

  // The product's main advantage happens silently — so it must be voiced.
  const merged = describeMerge(loaded.incomingEvents);
  if (merged !== null) warnings.push(merged);

  if (read.systemicCorruption) {
    warnings.push(
      `The journal is badly damaged: ${read.corrupted.length} of ` +
        `${read.corrupted.length + read.events.length} events are unreadable. ` +
        'Try: git checkout .kadence/',
    );
  } else if (read.corrupted.length > 0) {
    warnings.push(`Skipped ${read.corrupted.length} corrupted event(s).`);
  }
  if (read.unknownTypes > 0) {
    warnings.push(`Skipped ${read.unknownTypes} event(s) from a newer format. Update kadence.`);
  }

  return { state: loaded.state, warnings };
}

/** A task can be named by ULID or by its human-readable KAD-N. */
export function findTask(state: ProjectState, ref: string): Task | undefined {
  const needle = ref.toUpperCase();
  return state.tasks.find((t) => t.id === needle || t.label === needle);
}

function unknownStatus(value: string, available: readonly string[]): CommandResult {
  return {
    ok: false,
    exitCode: 2,
    message:
      `Unknown status "${value}".\nAvailable: ${available.join(', ')}\n` +
      '  kadence board config --statuses "todo,doing,done"',
  };
}

export interface ListOptions extends TaskFilters {
  sort?: string;
  /** Show parent/child structure instead of a flat list. */
  tree?: boolean;
}

export function runTaskList(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: ListOptions,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;


  if (options.type !== undefined && !TASK_TYPES.includes(options.type as TaskType)) {
    return {
      ok: false,
      exitCode: 2,
      message: `Unknown type "${options.type}".\nAvailable: ${TASK_TYPES.join(', ')}`,
    };
  }
  if (options.priority !== undefined && !PRIORITIES.includes(options.priority as Priority)) {
    return {
      ok: false,
      exitCode: 2,
      message: `Unknown priority "${options.priority}".\nAvailable: ${PRIORITIES.join(', ')}`,
    };
  }
  if (options.sort !== undefined && !isSortKey(options.sort)) {
    return {
      ok: false,
      exitCode: 2,
      message: `Unknown sort key "${options.sort}".\nAvailable: ${SORT_KEYS.join(', ')}`,
    };
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  // Validated against the live configuration, not a hard-coded list.
  if (options.status !== undefined && !state.statuses.includes(options.status)) {
    return unknownStatus(options.status, state.statuses);
  }

  const { sort, tree, ...filters } = options;
  const matched = filterTasks(state.tasks, filters);
  const tasks = sort === undefined ? matched : sortTasks(matched, sort as SortKey);

  // An empty board and an over-narrow query need opposite next steps, so the
  // message distinguishes them.
  if (tasks.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: describeEmptyResult(filters),
      data: { schema: 'kadence/v1', ok: true, tasks: [] },
    };
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message:
      tree === true
        ? renderTaskTree(tasks, colorsEnabled(env, process.stdout.isTTY === true))
        : renderTaskTable(tasks, colorsEnabled(env, process.stdout.isTTY === true)),
    data: {
      schema: 'kadence/v1',
      ok: true,
      tasks: tasks.map(serializeTask),
      cycles: state.cycles,
    },
  };
}

export function runTaskMove(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  to: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  if (!state.statuses.includes(to)) return unknownStatus(to, state.statuses);

  const { tasks, error } = resolveRefs(state, ref);
  if (error !== null) return { ok: false, exitCode: 1, message: error };

  const moved: Task[] = [];
  const already: Task[] = [];
  let skipped = '';

  for (const task of tasks) {
    // Already in that state — write nothing: the journal records changes, not
    // intentions without consequences.
    if (task.status === to) {
      already.push(task);
      continue;
    }

    const from = task.status;
    append(ctx.root, {
      id: ulid(),
      type: 'task.moved',
      entity: task.id,
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data: { from, to },
    });
    moved.push(task);

    // Skipped stages are allowed: kadence describes work, it does not police it.
    if (tasks.length === 1 && state.statuses.indexOf(to) - state.statuses.indexOf(from) > 1) {
      skipped = `\nMoved straight from ${from} to ${to}, skipping the stages between.`;
    }
  }

  if (moved.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: summarise('already there', already, `is already ${to}.`),
    };
  }

  const note = already.length > 0 ? `\n${already.length} already ${to}.` : '';

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `${summarise('moved', moved, `${moved[0]!.status} → ${to}`)}${skipped}${note}`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      moved: moved.map((t) => ({ id: t.id, label: t.label, to })),
    },
  };
}

/** Stable task shape for agents. New fields are only ever added. */
export function serializeTask(t: Task): Record<string, unknown> {
  return {
    id: t.id,
    label: t.label,
    title: t.title,
    description: t.description,
    type: t.type,
    priority: t.priority,
    status: t.status,
    labels: t.labels,
    assignee: t.assignee,
    reporter: t.reporter,
    sprint: t.sprint,
    loggedHours: t.loggedHours,
    parent: t.parent,
    blockedBy: t.blockedBy,
    due: t.due,
    comments: t.comments,
    estimate: t.estimate,
    history: t.history,
  };
}

export function runTaskAssign(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  who: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const { tasks, error } = resolveRefs(state, ref);
  if (error !== null) return { ok: false, exitCode: 1, message: error };

  // `none` unassigns — a deliberate action, and it should read as one.
  const assignee = who.trim().toLowerCase() === 'none' ? null : who.trim();
  const changed = tasks.filter((t) => t.assignee !== assignee);

  if (changed.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message:
        assignee === null
          ? summarise('already unassigned', tasks, 'is already unassigned.')
          : summarise('already assigned', tasks, `is already assigned to ${assignee}.`),
    };
  }

  for (const task of changed) {
    append(ctx.root, {
      id: ulid(),
      type: 'task.assigned',
      entity: task.id,
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data: { assignee },
    });
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message:
      assignee === null
        ? summarise('unassigned', changed, 'unassigned.')
        : summarise('assigned', changed, `→ ${assignee}`),
    data: {
      schema: 'kadence/v1',
      ok: true,
      assigned: changed.map((t) => ({ id: t.id, label: t.label, assignee })),
    },
  };
}

export function runTaskShow(cwd: string, env: NodeJS.ProcessEnv, ref: string): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const task = findTask(state, ref);
  if (task === undefined) {
    return { ok: false, exitCode: 1, message: `No task ${ref}.\n  kadence task list` };
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: renderTaskDetail(task),
    data: { schema: 'kadence/v1', ok: true, task: serializeTask(task) },
  };
}

/** Fields `task edit` can change. `undefined` means "leave alone". */
export interface TaskEdits {
  title?: string;
  description?: string;
  type?: string;
  priority?: string;
  due?: string;
  estimate?: number;
  labels?: string[];
}

export function runTaskEdit(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  edits: TaskEdits,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  if (edits.type !== undefined && !TASK_TYPES.includes(edits.type as TaskType)) {
    return {
      ok: false,
      exitCode: 2,
      message: `Unknown type "${edits.type}".\nAvailable: ${TASK_TYPES.join(', ')}`,
    };
  }
  if (edits.priority !== undefined && !PRIORITIES.includes(edits.priority as Priority)) {
    return {
      ok: false,
      exitCode: 2,
      message: `Unknown priority "${edits.priority}".\nAvailable: ${PRIORITIES.join(', ')}`,
    };
  }
  if (edits.due !== undefined && edits.due !== '' && !isIsoDate(edits.due)) {
    return {
      ok: false,
      exitCode: 2,
      message: `Due date must be YYYY-MM-DD, got "${edits.due}".\n  kadence task edit KAD-1 --due 2026-09-30`,
    };
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const { tasks, error } = resolveRefs(state, ref);
  if (error !== null) return { ok: false, exitCode: 1, message: error };

  // A title is one task's identity — applying it to several would create
  // duplicates rather than edit them.
  if (edits.title !== undefined && tasks.length > 1) {
    return {
      ok: false,
      exitCode: 2,
      message: 'A title can only be set on one task at a time.',
    };
  }

  const touched: Task[] = [];
  const allChanged = new Set<string>();

  for (const task of tasks) {
  // Only fields that actually differ are written: an event records a change,
  // and an event that changes nothing is noise in the history.
  const data: Record<string, unknown> = {};
  const changed: string[] = [];

  if (edits.title !== undefined && edits.title !== task.title) {
    data['title'] = edits.title;
    changed.push('title');
  }
  if (edits.description !== undefined && edits.description !== (task.description ?? '')) {
    data['description'] = edits.description;
    changed.push('description');
  }
  if (edits.type !== undefined && edits.type !== task.type) {
    data['type'] = edits.type;
    changed.push('type');
  }
  if (edits.priority !== undefined && edits.priority !== task.priority) {
    data['priority'] = edits.priority;
    changed.push('priority');
  }
  if (edits.due !== undefined && edits.due !== (task.due ?? '')) {
    data['due'] = edits.due;
    changed.push('due');
  }
  if (edits.estimate !== undefined && edits.estimate !== task.estimate) {
    data['estimate'] = edits.estimate;
    changed.push('estimate');
  }
  if (edits.labels !== undefined && edits.labels.join(',') !== task.labels.join(',')) {
    data['labels'] = edits.labels;
    changed.push('labels');
  }

  if (changed.length === 0) continue;

  append(ctx.root, {
    id: ulid(),
    type: 'task.updated',
    entity: task.id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data,
  });
  touched.push(task);
  for (const c of changed) allChanged.add(c);
  }

  if (touched.length === 0) {
    return { ok: true, exitCode: 0, warnings, message: summarise('unchanged', tasks, 'nothing changed.') };
  }

  const fields = [...allChanged].join(', ');
  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: summarise('updated', touched, `updated ${fields}.`),
    data: {
      schema: 'kadence/v1',
      ok: true,
      updated: touched.map((t) => ({ id: t.id, label: t.label })),
      changed: [...allChanged],
    },
  };
}

/** Calendar date only — a deadline is a day, not a moment. */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function runTaskCancel(cwd: string, env: NodeJS.ProcessEnv, ref: string): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const { tasks, error } = resolveRefs(state, ref);
  if (error !== null) return { ok: false, exitCode: 1, message: error };

  const changed = tasks.filter((t) => t.status !== 'cancelled');
  if (changed.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: summarise('already cancelled', tasks, 'is already cancelled.'),
    };
  }

  for (const task of changed) {
    append(ctx.root, {
      id: ulid(),
      type: 'task.cancelled',
      entity: task.id,
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data: {},
    });
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    // Cancelling is a decision, not a failure — the sprint report treats it so.
    message:
      `${summarise('cancelled', changed, 'cancelled.')}\n` +
      'Cancelled work stays in history and does not count as missed.',
    data: {
      schema: 'kadence/v1',
      ok: true,
      cancelled: changed.map((t) => ({ id: t.id, label: t.label })),
    },
  };
}

export function runTaskDelete(cwd: string, env: NodeJS.ProcessEnv, ref: string): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const { tasks, error } = resolveRefs(state, ref);
  if (error !== null) return { ok: false, exitCode: 1, message: error };

  for (const task of tasks) {
    append(ctx.root, {
      id: ulid(),
      type: 'task.deleted',
      entity: task.id,
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data: { title: task.title },
    });
  }

  const what =
    tasks.length === 1
      ? `${tasks[0]!.label} deleted: "${tasks[0]!.title}".`
      : `${tasks.length} tasks deleted: ${tasks.map((t) => t.label).join(', ')}.`;

  return {
    ok: true,
    exitCode: 0,
    warnings,
    // Being honest about what deletion means here: the journal is append-only,
    // so the event remains and history is never rewritten.
    message: `${what}\nThe events stay in the journal — history is never rewritten.`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      deleted: tasks.map((t) => ({ id: t.id, label: t.label })),
    },
  };
}

export function runTaskComment(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  text: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, exitCode: 2, message: 'A comment needs text.' };
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const task = findTask(state, ref);
  if (task === undefined) {
    return { ok: false, exitCode: 1, message: `No task ${ref}.\n  kadence task list` };
  }

  append(ctx.root, {
    id: ulid(),
    type: 'task.commented',
    entity: task.id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { text: trimmed },
  });

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `Comment added to ${task.label}.`,
    data: { schema: 'kadence/v1', ok: true, task: { id: task.id, label: task.label } },
  };
}

/**
 * Resolves a comma-separated list of references, all or nothing.
 *
 * Partial application is the worst outcome here: the user cannot tell what ran
 * without re-reading the board, and a half-applied bulk edit is harder to undo
 * than one that never started.
 */
export function resolveRefs(
  state: ProjectState,
  refs: string,
): { tasks: Task[]; error: string | null } {
  const wanted = refs
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  if (wanted.length === 0) {
    return { tasks: [], error: 'No task given.' };
  }

  const found: Task[] = [];
  const missing: string[] = [];
  for (const ref of wanted) {
    const task = findTask(state, ref);
    if (task === undefined) missing.push(ref);
    else found.push(task);
  }

  if (missing.length > 0) {
    return {
      tasks: [],
      error:
        `No task ${missing.join(', ')} — nothing was changed.\n` +
        'All ids must exist before a bulk change runs.\n  kadence task list',
    };
  }

  // The same task named twice should be acted on once.
  const unique = new Map(found.map((t) => [t.id, t]));
  return { tasks: [...unique.values()], error: null };
}

/** Result of a bulk command: one line, not one line per task. */
export function summarise(verb: string, tasks: readonly Task[], detail: string): string {
  if (tasks.length === 1) return `${tasks[0]!.label}: ${detail}`;
  return `${tasks.length} tasks ${verb}: ${tasks.map((t) => t.label).join(', ')}`;
}

/** Sets or clears a task parent. `none` detaches. */
export function runTaskParent(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  parentRef: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const { tasks, error } = resolveRefs(state, ref);
  if (error !== null) return { ok: false, exitCode: 1, message: error };

  const detach = parentRef.trim().toLowerCase() === 'none';
  let parentId: string | null = null;

  if (!detach) {
    const parent = findTask(state, parentRef);
    if (parent === undefined) {
      return { ok: false, exitCode: 1, message: `No task ${parentRef}.\n  kadence task list` };
    }
    if (tasks.some((t) => t.id === parent.id)) {
      return { ok: false, exitCode: 2, message: 'A task cannot be its own parent.' };
    }
    parentId = parent.id;
  }

  const changed = tasks.filter((t) => t.parent !== parentId);
  if (changed.length === 0) {
    return { ok: true, exitCode: 0, warnings, message: summarise('unchanged', tasks, 'already there.') };
  }

  for (const task of changed) {
    append(ctx.root, {
      id: ulid(),
      type: 'task.parent_set',
      entity: task.id,
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data: { parent: parentId },
    });
  }

  const label = detach ? 'detached' : findTask(state, parentRef)!.label;
  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...cycleWarnings(ctx.root, ctx.actor)],
    message: detach
      ? summarise('detached', changed, 'detached from its parent.')
      : summarise('moved', changed, `→ child of ${label}`),
    data: { schema: 'kadence/v1', ok: true, parent: parentId },
  };
}

/** Adds or removes a blocking dependency. */
export function runTaskBlock(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  blockerRef: string,
  remove: boolean,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const { tasks, error } = resolveRefs(state, ref);
  if (error !== null) return { ok: false, exitCode: 1, message: error };

  const blocker = findTask(state, blockerRef);
  if (blocker === undefined) {
    return { ok: false, exitCode: 1, message: `No task ${blockerRef}.\n  kadence task list` };
  }
  if (tasks.some((t) => t.id === blocker.id)) {
    return { ok: false, exitCode: 2, message: 'A task cannot block itself.' };
  }

  const changed = tasks.filter((t) =>
    remove ? t.blockedBy.includes(blocker.id) : !t.blockedBy.includes(blocker.id),
  );
  if (changed.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: summarise('unchanged', tasks, remove ? 'was not blocked by it.' : 'is already blocked by it.'),
    };
  }

  for (const task of changed) {
    append(ctx.root, {
      id: ulid(),
      type: remove ? 'task.blocked_by_removed' : 'task.blocked_by_added',
      entity: task.id,
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data: { blocker: blocker.id },
    });
  }

  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...cycleWarnings(ctx.root, ctx.actor)],
    message: remove
      ? summarise('unblocked', changed, `no longer blocked by ${blocker.label}.`)
      : summarise('blocked', changed, `blocked by ${blocker.label}.`),
    data: { schema: 'kadence/v1', ok: true, blocker: blocker.id },
  };
}

/**
 * Re-reads the state to report any loop the change just created.
 *
 * Cycles are never rejected — that would make the state depend on merge order
 * — so the only honest thing left is to say plainly that one exists.
 */
function cycleWarnings(root: string, actor: string): string[] {
  const { state } = loadState(root, actor);
  const byId = new Map(state.tasks.map((t) => [t.id, t.label]));

  return state.cycles.map((c) => {
    const path = c.path.map((id) => byId.get(id) ?? id).join(' → ');
    return `Dependency cycle (${c.kind}): ${path}. Both edges were kept — resolve it when you can.`;
  });
}

/**
 * Parses "2h", "90m", "1.5" into hours.
 *
 * Bare numbers mean hours because that is what people type when logging a
 * day's work; minutes need the explicit suffix.
 */
export function parseDuration(input: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)\s*(h|hours?|m|min|minutes?)?$/i.exec(input.trim());
  if (m === null) return null;

  const value = Number(m[1]);
  if (!Number.isFinite(value) || value === 0) return null;

  const unit = (m[2] ?? 'h').toLowerCase();
  return unit.startsWith('m') ? value / 60 : value;
}

export function runTaskLog(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  duration: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const hours = parseDuration(duration);
  if (hours === null) {
    return {
      ok: false,
      exitCode: 2,
      message:
        `Cannot read "${duration}" as a duration.\n` +
        'Use hours or minutes:\n  kadence task log KAD-1 2h\n  kadence task log KAD-1 90m\n' +
        '  kadence task log KAD-1 -30m   to correct a mistake',
    };
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const task = findTask(state, ref);
  if (task === undefined) {
    return { ok: false, exitCode: 1, message: `No task ${ref}.\n  kadence task list` };
  }

  append(ctx.root, {
    id: ulid(),
    type: 'task.time_logged',
    entity: task.id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { hours },
  });

  const total = Math.max(0, task.loggedHours + hours);
  const estimate =
    task.estimate === null
      ? '\nNo estimate on this task, so there is nothing to compare against.'
      : '';

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `${task.label}: ${total.toFixed(1)}h logged in total.${estimate}`,
    data: { schema: 'kadence/v1', ok: true, task: { id: task.id, label: task.label, loggedHours: total } },
  };
}
