import { isAbsolute, join, relative, dirname, resolve } from 'node:path';
import { ERROR_CODES, TASK_FIELDS, type ErrorCode } from '../../agent/contract.js';
import {
  findRepoRoot,
  getActorEmail,
  currentBranch,
  defaultBaseBranch,
  eventIdsOnBranch,
} from '../../core/git.js';
import { append, dataDir, readAll } from '../../core/store.js';
import { ulid } from '../../core/ulid.js';
import type { FlowEvent } from '../../core/event.js';
import {
  TASK_TYPES,
  PRIORITIES,
  DEFAULT_STATUSES,
  TERMINAL_STATUS,
  CANCELLED_STATUS,
  type ProjectState,
  type Task,
  type Criterion,
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
  describeNothingReady,
  isSortKey,
  readyTasks,
  SORT_KEYS,
  type TaskFilters,
  type SortKey,
} from '../../core/query.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

/**
 * Default columns, shown in help before a repository exists.
 *
 * The live list comes from the folded state — a team may have configured its
 * own — so validation always uses that, never this constant.
 */
export const TASK_STATUSES: readonly string[] = DEFAULT_STATUSES;

/**
 * A failure an agent can act on without parsing prose.
 *
 * `code` is the stable part — it is what a program branches on, and it never
 * changes once published. `allowed` matters more here than in most CLIs because
 * statuses are project-configurable: an agent cannot know the valid set from the
 * documentation, only from the answer (ADR-009).
 *
 * Deliberately absent: `retryable`. There is no network and no lock, so the same
 * input always fails the same way; the field would be a constant dressed up as
 * information.
 */
export interface CommandError {
  code: ErrorCode;
  /** The same sentence a human sees, so nothing is lost in --json mode. */
  message: string;
  /** The offending input, echoed back. */
  received?: string;
  /** The values that would have worked, when the set is knowable. */
  allowed?: readonly string[];
  /** The command that resolves it. */
  hint?: string;
}

export { ERROR_CODES, TASK_FIELDS, type ErrorCode };

export interface CommandResult {
  ok: boolean;
  message: string;
  /** Payload for --json mode. */
  data?: Record<string, unknown>;
  /** Structured failure detail for --json mode; absent when ok. */
  error?: CommandError;
  /** Goes to stderr so it never corrupts the JSON on stdout. */
  warnings?: string[];
  exitCode: 0 | 1 | 2;
}

/** Builds a failing result whose human message and machine code stay in step. */
export function failure(
  exitCode: 1 | 2,
  code: ErrorCode,
  message: string,
  detail: Omit<CommandError, 'code' | 'message'> = {},
): CommandResult {
  return { ok: false, exitCode, message, error: { code, message, ...detail } };
}

/** The same task-is-missing answer everywhere — it is raised from six commands. */
export function taskNotFound(ref: string): CommandResult {
  return failure(1, 'task_not_found', `No task ${ref}.\n  kadence task list`, {
    received: ref,
    hint: 'kadence task list --json',
  });
}

/** A wrong value for a fixed vocabulary: type and priority. */
function unknownValue(
  code: 'unknown_type' | 'unknown_priority',
  label: string,
  value: string,
  available: readonly string[],
): CommandResult {
  return failure(2, code, `Unknown ${label} "${value}".\nAvailable: ${available.join(', ')}`, {
    received: value,
    allowed: available,
  });
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
    return failure(
      1,
      'not_a_repository',
      'kadence lives inside a git repository, and there is none here.\n' +
        'Create one and try again:\n  git init',
      { hint: 'git init' },
    );
  }

  // Check .kadence/, NOT .kadence/events/: git does not version empty
  // directories, so the events folder disappears when switching to a branch
  // without events. The CLI used to demand a repeat init on a perfectly
  // working repository — found by the merge integration test.
  if (!existsSync(dataDir(root))) {
    return failure(1, 'not_initialised', 'No .kadence/ found here.\nRun:\n  npx kadence init', {
      hint: 'kadence init',
    });
  }

  const actor = getActorEmail(root);
  if (actor === null) {
    return failure(
      1,
      'no_git_identity',
      'Git does not know who you are, so there is no author for the event.\n' +
        'Run:\n  git config user.email you@example.com',
      { hint: 'git config user.email you@example.com' },
    );
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
  /** Skip the board's definition of done — a spike is not a delivery. */
  noDod?: boolean;
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
    return failure(2, 'invalid_argument', 'A task needs a title.', {
      hint: 'kadence task list --json',
    });
  }

  if (options.type !== undefined && !TASK_TYPES.includes(options.type as TaskType)) {
    return unknownValue('unknown_type', 'type', options.type as string, TASK_TYPES);
  }
  if (options.priority !== undefined && !PRIORITIES.includes(options.priority as Priority)) {
    return unknownValue('unknown_priority', 'priority', options.priority as string, PRIORITIES);
  }

  // A parent may be given as KAD-1, but the event must store the stable ULID.
  let resolvedParent: string | undefined;
  let existing: ProjectState | null = null;
  if (options.parent !== undefined) {
    const { state } = loadState(ctx.root, ctx.actor);
    existing = state;
    const parent = findTask(state, options.parent);
    if (parent === undefined) {
      return {
        ...taskNotFound(options.parent),
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

  // The definition of done is copied into the task as its own criteria, not
  // referenced. A reference would mean raising the standard silently changed
  // what finished work had promised — the criteria a task carries belong to
  // that task's journal.
  //
  // Read before the append, and reusing the fold `--parent` may already have
  // done: `task add` runs dozens of times a day under a 200 ms budget, and a
  // second full read of the journal to learn the list is empty is not free.
  const dod = options.noDod === true ? [] : (existing ?? loadState(ctx.root, ctx.actor).state).dod;
  for (const text of dod) {
    append(ctx.root, {
      id: ulid(),
      type: 'task.criterion_added',
      entity: id,
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data: { text },
    });
  }

  const warning =
    options.estimate === undefined
      ? '\nWithout an estimate this task will not count towards velocity. Add --estimate.'
      : '';
  const standard = dod.length === 0 ? '' : `\n${dod.length} acceptance criteria from the board's definition of done.`;

  return {
    ok: true,
    exitCode: 0,
    message: `Created: ${trimmed}${standard}${warning}`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      task: { id, title: trimmed },
      criteria: dod.map((text, i) => ({ n: i + 1, text, checked: false, checkedBy: null })),
    },
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
  return failure(
    2,
    'unknown_status',
    `Unknown status "${value}".\nAvailable: ${available.join(', ')}\n` +
      '  kadence board config --statuses "todo,doing,done"',
    {
      received: value,
      // From the folded state, never from the constant: a team may have
      // configured its own columns, and an agent has no other way to learn them.
      allowed: available,
      // `board config --json` returns the configured columns; there is no
      // `board statuses` command, and a hint naming one sends an agent nowhere.
      hint: 'kadence board config --json',
    },
  );
}

export interface ListOptions extends TaskFilters {
  /** Only the work this branch introduced, measured against `base`. */
  branch?: boolean;
  /** What to compare against; `main`, or `init.defaultBranch`, by default. */
  base?: string;
  json?: boolean;
  sort?: string;
  /** Show parent/child structure instead of a flat list. */
  tree?: boolean;
  /** Comma-separated field names for --json; absent means every field. */
  fields?: string;
}

export function runTaskList(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: ListOptions,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;


  if (options.type !== undefined && !TASK_TYPES.includes(options.type as TaskType)) {
    return unknownValue('unknown_type', 'type', options.type as string, TASK_TYPES);
  }
  if (options.priority !== undefined && !PRIORITIES.includes(options.priority as Priority)) {
    return unknownValue('unknown_priority', 'priority', options.priority as string, PRIORITIES);
  }
  // Validated before any work: a typo in --fields should cost nothing.
  const { fields, error: fieldError } = parseFields(options.fields);
  if (fieldError !== null) return fieldError;
  if (options.sort !== undefined && !isSortKey(options.sort)) {
    return {
      ...failure(
        2,
        'invalid_argument',
        `Unknown sort key "${options.sort}".\nAvailable: ${SORT_KEYS.join(', ')}`,
        { received: options.sort, allowed: SORT_KEYS },
      ),
    };
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  // Validated against the live configuration, not a hard-coded list.
  if (options.status !== undefined && !state.statuses.includes(options.status)) {
    return unknownStatus(options.status, state.statuses);
  }

  const { sort, tree, branch, base, json: _json, ...filters } = options;
  let matched = filterTasks(state.tasks, filters);

  // The branch filter is applied after the others and never stored: membership
  // lives in git's history, and is read at the moment it is asked for.
  let branchInfo: { name: string; base: string } | null = null;
  if (branch === true) {
    const head = currentBranch(ctx.root);
    if (head === null) {
      // The flag was understood; the repository state is what refuses. Exit 2
      // would tell an agent to look for a typo it did not make.
      return failure(
        1,
        'conflicting_state',
        'HEAD is detached, so there is no branch to compare.\n' +
          'Check one out, or name the range yourself:\n  git checkout main',
        { hint: 'git checkout main' },
      );
    }
    const against = base ?? defaultBaseBranch(ctx.root);
    const ids = eventIdsOnBranch(ctx.root, against, head);
    if (ids === null) {
      return failure(
        2,
        'invalid_argument',
        `There is no branch "${against}" to compare against.\n` +
          'Name one that exists:\n  kadence task list --branch --base <name>',
        { received: against, hint: 'git branch --list' },
      );
    }
    branchInfo = { name: head, base: against };
    // A task belongs to the branch when it was created there, or when any
    // event about it arrived there.
    matched = matched.filter(
      (t) => ids.has(t.id) || t.history.some((h) => ids.has(h.id)),
    );
  }

  const tasks = sort === undefined ? matched : sortTasks(matched, sort as SortKey);

  // An empty board and an over-narrow query need opposite next steps, so the
  // message distinguishes them.
  if (tasks.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message:
        branchInfo === null
          ? describeEmptyResult(filters)
          : `Branch ${branchInfo.name} has introduced no task changes since ${branchInfo.base}.\n` +
            'See the whole board:\n  kadence task list',
      data: {
        schema: 'kadence/v1',
        ok: true,
        tasks: [],
        ...(branchInfo === null ? {} : { branch: branchInfo }),
      },
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
      tasks: tasks.map((t) => serializeTask(t, fields, state)),
      cycles: state.cycles,
      // Present only when the flag was given: the contract only ever gains
      // fields, and a caller that did not ask should see the same response it
      // saw before this shipped.
      ...(branchInfo === null ? {} : { branch: branchInfo }),
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
  if (error !== null) return error;

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

  // Surfaced, not refused. Refusing would make the board lie about where the
  // work is, and a checklist is evidence rather than a gate — the team decides
  // what `done` costs, not the tool.
  const unfinished =
    to === TERMINAL_STATUS
      ? moved
          .filter((t) => t.criteria.some((c) => !c.checked))
          .map((t) => {
            const open = t.criteria.filter((c) => !c.checked).length;
            return `${t.label} moved to ${to} with ${open} of ${t.criteria.length} acceptance criteria unchecked. See: kadence task ac list ${t.label}`;
          })
      : [];

  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...unfinished],
    message: `${summarise('moved', moved, `${moved[0]!.status} → ${to}`)}${skipped}${note}`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      moved: moved.map((t) => ({ id: t.id, label: t.label, to })),
    },
  };
}

/** Stable task shape for agents. New fields are only ever added. */
/**
 * Turns `--fields id,label` into a checked list.
 *
 * Returns `null` when the flag was absent, which every caller reads as "all
 * fields" — distinct from an empty selection, which is a user error.
 */
export function parseFields(
  spec: string | undefined,
): { fields: readonly string[] | null; error: CommandResult | null } {
  if (spec === undefined) return { fields: null, error: null };

  const wanted = spec
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  if (wanted.length === 0) {
    return {
      fields: null,
      error: failure(2, 'invalid_argument', '--fields needs at least one field name.', {
        allowed: TASK_FIELDS,
      }),
    };
  }

  const unknown = wanted.find((f) => !TASK_FIELDS.includes(f as (typeof TASK_FIELDS)[number]));
  if (unknown !== undefined) {
    return {
      fields: null,
      error: failure(
        2,
        'unknown_field',
        `Unknown field "${unknown}".\nAvailable: ${TASK_FIELDS.join(', ')}`,
        { received: unknown, allowed: TASK_FIELDS },
      ),
    };
  }

  return { fields: wanted, error: null };
}

/**
 * The JSON form of a task, whole or narrowed to `fields`.
 *
 * A board of 1000 tasks came to 803 KB — larger than the journal it was folded
 * from — because every task went out in full. Selection is the fix; the shape of
 * each field is unchanged, so a narrowed response is a subset, never a variant
 * (Probe C §4, ADR-009).
 */
export function serializeTask(
  t: Task,
  fields: readonly string[] | null = null,
  state: ProjectState | null = null,
): Record<string, unknown> {
  const full = fullTask(t, state);
  if (fields === null) return full;
  return Object.fromEntries(fields.map((f) => [f, full[f]]));
}

function fullTask(t: Task, state: ProjectState | null = null): Record<string, unknown> {
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
    // The MS-N label and nothing else. A milestone created on a branch that
    // has not merged reads as null rather than as a ULID: an agent matching
    // MS-N must never be handed a 26-character id instead.
    milestone:
      t.milestone === null
        ? null
        : (state?.milestones.find((m) => m.id === t.milestone)?.label ?? null),
    loggedHours: t.loggedHours,
    parent: t.parent,
    blockedBy: t.blockedBy,
    due: t.due,
    claimedBy: t.claimedBy,
    contestedBy: t.contestedBy,
    comments: t.comments,
    docs: t.docs,
    estimate: t.estimate,
    // Present everywhere, not only in `task show`: "which tasks have unchecked
    // criteria" must not cost one call per task, which is the N+1 that
    // --summary and Probe C exist to avoid.
    criteria: t.criteria.map((c) => ({
      n: c.n,
      text: c.text,
      checked: c.checked,
      checkedBy: c.checkedBy,
    })),
    openCriteria: t.criteria.filter((c) => !c.checked).length,
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
  if (error !== null) return error;

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
    return taskNotFound(ref);
  }

  // The decisions made about this task travel with it. Superseded ones are left
  // out, for the same reason `decision list` leaves them out: an agent handed a
  // reversed reason as current is worse than one with no memory (ADR-010).
  const decisions = state.decisions
    .filter((d) => d.task === task.id && d.supersededBy === null)
    .map((d) => ({
      id: d.id,
      label: d.label,
      title: d.title,
      why: d.why,
      rejected: d.rejected,
      docs: d.docs,
      source: d.source,
    }));

  // Notes travel with the task for the same reason decisions do: they are the
  // part of the context an agent cannot recover from the code.
  const notes = state.notes.filter((n) => n.task === task.id);

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: renderTaskDetail(task, notes),
    data: {
      schema: 'kadence/v1',
      ok: true,
      task: {
        ...serializeTask(task, null, state),
        decisions,
        notes: notes.map((n) => ({ id: n.id, text: n.text, at: n.at, by: n.by, source: n.source })),
      },
    },
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
  /** The set becomes exactly this. Written as the difference, never as the set (ADR-013). */
  labels?: string[];
  addLabels?: string[];
  removeLabels?: string[];
}

/**
 * The label events one edit produces: what left the set, then what joined it.
 *
 * A set is not a value, so it is never written as one. Two branches that each
 * add a label record two different changes and both survive the merge; a branch
 * that removes one records that, and it survives too. Replacement was the only
 * field in the product where a merge lost an intent (ADR-013).
 */
function labelDeltas(
  task: Task,
  edits: TaskEdits,
): Array<{ type: 'task.label_added' | 'task.label_removed'; label: string }> {
  const clean = (xs: readonly string[]): string[] => xs.map((l) => l.trim()).filter((l) => l.length > 0);
  const target =
    edits.labels !== undefined
      ? [...new Set(clean(edits.labels))]
      : [
          ...new Set([
            ...task.labels.filter((l) => !clean(edits.removeLabels ?? []).includes(l)),
            ...clean(edits.addLabels ?? []),
          ]),
        ];

  const out: Array<{ type: 'task.label_added' | 'task.label_removed'; label: string }> = [];
  for (const l of task.labels) if (!target.includes(l)) out.push({ type: 'task.label_removed', label: l });
  for (const l of target) if (!task.labels.includes(l)) out.push({ type: 'task.label_added', label: l });
  return out;
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
    return unknownValue('unknown_type', 'type', edits.type as string, TASK_TYPES);
  }
  if (edits.priority !== undefined && !PRIORITIES.includes(edits.priority as Priority)) {
    return unknownValue('unknown_priority', 'priority', edits.priority as string, PRIORITIES);
  }
  if (edits.due !== undefined && edits.due !== '' && !isIsoDate(edits.due)) {
    return {
      ...failure(
        2,
        'invalid_argument',
        `Due date must be YYYY-MM-DD, got "${edits.due}".\n  kadence task edit KAD-1 --due 2026-09-30`,
        { received: edits.due },
      ),
    };
  }

  // `--label` replaces the set and `--add-label` changes one; together they say
  // two different things about the same field, and picking one silently is the
  // kind of quiet intent loss ADR-013 exists to end.
  if (edits.labels !== undefined && (edits.addLabels !== undefined || edits.removeLabels !== undefined)) {
    return failure(
      2,
      'invalid_argument',
      '--label replaces the whole set; --add-label and --remove-label change one. Use one or the other.',
      { hint: 'kadence task edit KAD-1 --add-label impact-high' },
    );
  }

  const both = (edits.addLabels ?? []).filter((l) => (edits.removeLabels ?? []).includes(l));
  if (both.length > 0) {
    return failure(
      2,
      'invalid_argument',
      `A label cannot be added and removed in one edit: ${both.join(', ')}.`,
      { received: both.join(','), hint: 'kadence task edit KAD-1 --add-label impact-high' },
    );
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const { tasks, error } = resolveRefs(state, ref);
  if (error !== null) return error;

  // A title is one task's identity — applying it to several would create
  // duplicates rather than edit them.
  if (edits.title !== undefined && tasks.length > 1) {
    return {
      ...failure(2, 'invalid_argument', 'A title can only be set on one task at a time.'),
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
  const deltas =
    edits.labels === undefined && edits.addLabels === undefined && edits.removeLabels === undefined
      ? []
      : labelDeltas(task, edits);
  if (deltas.length > 0) changed.push('labels');

  if (changed.length === 0) continue;

  // Scalars in one `task.updated`, labels as one event each: the first group
  // can only ever have one answer, the second is a set (ADR-013).
  if (Object.keys(data).length > 0) {
    append(ctx.root, {
      id: ulid(),
      type: 'task.updated',
      entity: task.id,
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data,
    });
  }
  for (const d of deltas) {
    append(ctx.root, {
      id: ulid(),
      type: d.type,
      entity: task.id,
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data: { label: d.label },
    });
  }
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
  if (error !== null) return error;

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
  if (error !== null) return error;

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

/**
 * Links a document to a task.
 *
 * Not a document store — the file stays plain markdown in the repository and git
 * keeps versioning it. What git cannot say is that this file explains this task,
 * and that is the only thing recorded here (Probe D).
 */
/**
 * The template a created document starts from.
 *
 * Deliberately four lines: it exists so the file is not empty and so a reader
 * arriving from the issue knows which task it belongs to. Anything more would
 * be kadence having opinions about documents, which is what ADR-010 declined.
 */
function docTemplate(title: string, label: string): string {
  return [
    `# ${title}`,
    '',
    `Written for ${label}. Link it back with \`kadence task show ${label}\`.`,
    '',
    '',
  ].join('\n');
}

/**
 * A repository-relative path, or a refusal.
 *
 * Both callers write a file at the result, so containment is checked before
 * anything is created rather than described in a comment. `relative()` after
 * `resolve()` is the only form that catches every escape: `..` segments, an
 * absolute path, and a symlink-free path that simply points elsewhere.
 */
export function repoRelative(
  root: string,
  input: string,
  hint: string,
): { rel: string; full: string } | CommandResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return failure(2, 'invalid_argument', 'A path is required.', { hint });
  }
  const full = resolve(root, trimmed);
  const rel = relative(root, full);
  if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) {
    // An absolute path stops meaning anything the moment the journal reaches
    // another machine, and a path above the root is not this project's to write.
    return failure(
      2,
      'invalid_argument',
      `${input} is outside the repository.\nUse a path inside it:\n  ${hint}`,
      { received: input, hint },
    );
  }
  return { rel, full };
}

export function runTaskDoc(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  path: string,
  create = false,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  if (path.trim().length === 0) {
    return failure(2, 'invalid_argument', 'A link needs a path.', {
      hint: 'kadence task doc KAD-1 docs/design.md',
    });
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const task = findTask(state, ref);
  if (task === undefined) return taskNotFound(ref);

  const resolved = repoRelative(ctx.root, path, 'kadence task doc KAD-1 docs/design.md');
  if ('exitCode' in resolved) return resolved;
  const { rel, full } = resolved;

  // Missing is a warning, not a refusal: the file may arrive in a later commit
  // or live on another branch.
  let missing = !existsSync(full);
  let created = false;

  // `task doc add` is create-and-link in one call — the third experiment. It
  // never overwrites: a file that is already there is the document, and
  // replacing it with a template would destroy the very thing being linked.
  if (create && missing) {
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, docTemplate(task.title, task.label), 'utf8');
    missing = false;
    created = true;
  }

  append(ctx.root, {
    id: ulid(),
    type: 'task.doc_linked',
    entity: task.id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { path: rel },
  });

  return {
    ok: true,
    exitCode: 0,
    warnings: [
      ...warnings,
      ...(missing ? [`No file at ${rel} — the link is recorded anyway; it may arrive later.`] : []),
    ],
    message: created
      ? `Created ${rel} and linked it to ${task.label}.`
      : `${rel} linked to ${task.label}.`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      task: { id: task.id, label: task.label },
      doc: rel,
      created,
    },
  };
}

/**
 * Take a task.
 *
 * There is no lock, and the message says so. Two machines can each claim
 * before either pushes; the merge is where that becomes visible, and both
 * claims survive it (ADR-011). Promising exclusivity we cannot enforce would
 * be the same lie as promising erasure in an append-only journal.
 */
export function runTaskClaim(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string | undefined,
  options: { assignee?: string } = {},
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  let task: Task | undefined;
  if (ref === undefined || ref.trim().length === 0) {
    // No argument: take the top of the ready list. One step instead of two,
    // which is the whole reason an agent asks what to do next.
    //
    // Contested tasks are the exception. `ready` keeps them precisely so both
    // claimants see the conflict, but handing one to a third actor asking for
    // work adds a claimant to a contest two people already have to resolve —
    // and a fleet of agents would do it on every poll. Naming the task is
    // still allowed: contesting on purpose is a choice, not an accident.
    const options_ = options.assignee === undefined ? {} : { assignee: options.assignee };
    const ready = readyTasks(state.tasks, { viewer: ctx.actor, ...options_ });
    task = ready.find((t) => t.claimedBy === null || t.claimedBy === ctx.actor);
    if (task === undefined) {
      // `describeNothingReady` speaks for `ready`, where a contested task does
      // count. Reusing it here would answer "Nothing ready." about tasks the
      // very next `kadence ready` lists — true for this command, unreadable
      // for the person running it.
      const held = ready.filter((t) => t.claimedBy !== null);
      if (held.length > 0) {
        const names = held.map((t) => `${t.label} (${t.claimedBy})`).join(', ');
        return failure(
          1,
          'nothing_ready',
          `Nothing free to claim. ${held.length === 1 ? 'The one task' : `All ${held.length} tasks`} ` +
            `ready for you ${held.length === 1 ? 'is' : 'are'} already contested: ${names}.\n` +
            'Name one to join the contest on purpose, or pick something else:\n' +
            `  kadence task claim ${held[0]!.label}\n  kadence task list`,
          { hint: `kadence task claim ${held[0]!.label}` },
        );
      }
      return failure(1, 'nothing_ready', describeNothingReady(state.tasks, ctx.actor, options.assignee), {
        hint: 'kadence task list',
      });
    }
  } else {
    task = findTask(state, ref);
    if (task === undefined) return taskNotFound(ref);
  }

  if (task.status === TERMINAL_STATUS || task.status === CANCELLED_STATUS) {
    // The arguments were understood; the state is what refuses. `received` is
    // reserved for an argument, and the status is not one.
    return failure(
      1,
      'conflicting_state',
      `${task.label} is ${task.status}, so there is nothing to claim.\n` +
        `Reopen it first:\n  kadence task move ${task.label} in_progress`,
      { hint: `kadence task move ${task.label} in_progress` },
    );
  }

  // Nothing to write when the journal already says this. A second claim by
  // someone already contesting is discarded by the fold, so appending it only
  // adds a line to every future read.
  if (task.claimedBy === ctx.actor || task.contestedBy.includes(ctx.actor)) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message:
        task.claimedBy === ctx.actor
          ? `${task.label} is already yours.`
          : `${task.label} already carries your contested claim; ${task.claimedBy ?? 'nobody'} holds it.`,
      data: {
        schema: 'kadence/v1',
        ok: true,
        task: { id: task.id, label: task.label, claimedBy: task.claimedBy, contestedBy: task.contestedBy },
      },
    };
  }

  const held = task.claimedBy;
  append(ctx.root, {
    id: ulid(),
    type: 'task.claimed',
    entity: task.id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { by: ctx.actor },
  });

  const contested =
    held === null
      ? []
      : [
          `${task.label} is contested: ${held} claimed it first and keeps it. ` +
            'Both claims stay in the journal — talk to them before starting.',
        ];

  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...contested],
    message:
      held === null
        ? `${task.label} ${task.title} \u2014 claimed by ${ctx.actor}.\n` +
          'Another machine may have claimed it before your push; the merge will show that.'
        : `${task.label} claim recorded, contested with ${held}.`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      task: {
        id: task.id,
        label: task.label,
        claimedBy: held ?? ctx.actor,
        // Built from the folded state, not from this call alone: someone else
        // may already be contesting, and reporting only ourselves would
        // disagree with the very next read.
        contestedBy: held === null ? [] : [...task.contestedBy, ctx.actor],
      },
    },
  };
}

/** Give a task back. Releasing what you never held is true, not an error. */
export function runTaskRelease(cwd: string, env: NodeJS.ProcessEnv, ref: string): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const task = findTask(state, ref);
  if (task === undefined) return taskNotFound(ref);

  const holds = task.claimedBy === ctx.actor;
  const contests = task.contestedBy.includes(ctx.actor);
  if (!holds && !contests) {
    // Nothing to write: the journal gains nothing from an event that changes
    // no state, and every extra event is one more line in every fold.
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message:
        task.claimedBy === null
          ? `${task.label} is not claimed.`
          : `${task.label} is claimed by ${task.claimedBy}, not by you. Nothing released.`,
      data: { schema: 'kadence/v1', ok: true, task: { id: task.id, label: task.label, claimedBy: task.claimedBy } },
    };
  }

  append(ctx.root, {
    id: ulid(),
    type: 'task.released',
    entity: task.id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { by: ctx.actor },
  });

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: holds
      ? `${task.label} released.`
      : `${task.label} withdrawn from — ${task.claimedBy ?? 'nobody'} keeps the claim.`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      task: {
        id: task.id,
        label: task.label,
        claimedBy: holds ? null : task.claimedBy,
        contestedBy: holds ? [] : task.contestedBy.filter((a) => a !== ctx.actor),
      },
    },
  };
}

/**
 * Acceptance criteria.
 *
 * The number a person types is a position in the folded list, never something
 * stored — the same rule as `KAD-N` (I7). Two branches can each add a
 * criterion and merge without a renumbering conflict, which is the whole
 * reason the checklist lives in the journal instead of in the task's text.
 */
export function runTaskCriterionAdd(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  text: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return failure(2, 'invalid_argument', 'A criterion needs text.', {
      hint: `kadence task ac add ${ref} "tests green"`,
    });
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const task = findTask(state, ref);
  if (task === undefined) return taskNotFound(ref);

  append(ctx.root, {
    id: ulid(),
    type: 'task.criterion_added',
    entity: task.id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { text: trimmed },
  });

  const n = task.criteria.length + 1;
  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `${task.label} criterion ${n}: ${trimmed}`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      task: { id: task.id, label: task.label },
      criterion: { n, text: trimmed, checked: false, checkedBy: null },
    },
  };
}

/** Resolves the number a person typed to the criterion it names. */
function findCriterion(task: Task, number: string): Criterion | CommandResult {
  const n = Number(number);
  const available = task.criteria.map((c) => c.n);
  if (!Number.isInteger(n)) {
    return failure(2, 'invalid_argument', `"${number}" is not a criterion number.`, {
      received: number,
      hint: `kadence task ac list ${task.label}`,
    });
  }
  const found = task.criteria.find((c) => c.n === n);
  if (found === undefined) {
    return failure(
      2,
      'invalid_argument',
      task.criteria.length === 0
        ? `${task.label} has no criteria yet.\n  kadence task ac add ${task.label} "tests green"`
        : `${task.label} has no criterion ${n}.\nAvailable: ${available.join(', ')}`,
      { received: number, hint: `kadence task ac list ${task.label}` },
    );
  }
  return found;
}

export function runTaskCriterionCheck(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  number: string,
  uncheck: boolean,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const task = findTask(state, ref);
  if (task === undefined) return taskNotFound(ref);

  const found = findCriterion(task, number);
  if (!('id' in found)) return found;

  const want = !uncheck;
  if (found.checked === want) {
    // Nothing to write: an event that changes no state is a line every future
    // fold has to read.
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: `${task.label} criterion ${found.n} is already ${want ? 'checked' : 'unchecked'}.`,
      data: { schema: 'kadence/v1', ok: true, task: { id: task.id, label: task.label } },
    };
  }

  append(ctx.root, {
    id: ulid(),
    type: want ? 'task.criterion_checked' : 'task.criterion_unchecked',
    entity: task.id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { criterion: found.id },
  });

  const done = task.criteria.filter((c) => (c.id === found.id ? want : c.checked)).length;
  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `${task.label} criterion ${found.n} ${want ? 'checked' : 'unchecked'} \u2014 ${done} of ${task.criteria.length} done.`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      task: { id: task.id, label: task.label },
      criterion: { n: found.n, text: found.text, checked: want, checkedBy: want ? ctx.actor : null },
      done,
      total: task.criteria.length,
    },
  };
}

export function runTaskCriterionList(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const task = findTask(state, ref);
  if (task === undefined) return taskNotFound(ref);

  if (task.criteria.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: `${task.label} has no acceptance criteria.\nAdd one:\n  kadence task ac add ${task.label} "tests green"`,
      data: { schema: 'kadence/v1', ok: true, task: { id: task.id, label: task.label }, criteria: [] },
    };
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: task.criteria.map((c) => `  ${c.n}. [${c.checked ? 'x' : ' '}] ${c.text}`).join('\n'),
    data: {
      schema: 'kadence/v1',
      ok: true,
      task: { id: task.id, label: task.label },
      criteria: serializeCriteria(task),
    },
  };
}

/** Always an array, and always the same four keys — agents branch on them. */
export function serializeCriteria(task: Task): Array<Record<string, unknown>> {
  return task.criteria.map((c) => ({
    n: c.n,
    text: c.text,
    checked: c.checked,
    checkedBy: c.checkedBy,
  }));
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
    return failure(2, 'invalid_argument', 'A comment needs text.', { received: ref });
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const task = findTask(state, ref);
  if (task === undefined) {
    return taskNotFound(ref);
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
): { tasks: Task[]; error: CommandResult | null } {
  const wanted = refs
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  if (wanted.length === 0) {
    return { tasks: [], error: failure(2, 'invalid_argument', 'No task given.') };
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
      error: failure(
        1,
        'task_not_found',
        `No task ${missing.join(', ')} — nothing was changed.\n` +
          'All ids must exist before a bulk change runs.\n  kadence task list',
        {
          // One ref or several, the agent reads the same field. It is the refs
          // that were missing, not every ref it passed.
          received: missing.join(','),
          hint: 'kadence task list --json',
        },
      ),
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
  if (error !== null) return error;

  const detach = parentRef.trim().toLowerCase() === 'none';
  let parentId: string | null = null;

  if (!detach) {
    const parent = findTask(state, parentRef);
    if (parent === undefined) {
      return taskNotFound(parentRef);
    }
    if (tasks.some((t) => t.id === parent.id)) {
      return failure(2, 'invalid_argument', 'A task cannot be its own parent.', {
        received: ref,
      });
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
  if (error !== null) return error;

  const blocker = findTask(state, blockerRef);
  if (blocker === undefined) {
    return taskNotFound(blockerRef);
  }
  if (tasks.some((t) => t.id === blocker.id)) {
    return failure(2, 'invalid_argument', 'A task cannot block itself.', { received: ref });
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
      ...failure(
        2,
        'invalid_argument',
        `Cannot read "${duration}" as a duration.\n` +
          'Use hours or minutes:\n  kadence task log KAD-1 2h\n  kadence task log KAD-1 90m\n' +
          '  kadence task log KAD-1 -30m   to correct a mistake',
        { received: duration },
      ),
    };
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const task = findTask(state, ref);
  if (task === undefined) {
    return taskNotFound(ref);
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
