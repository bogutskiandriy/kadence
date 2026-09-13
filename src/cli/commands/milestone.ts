import { ulid } from '../../core/ulid.js';
import { append } from '../../core/store.js';
import type { Milestone, ProjectState } from '../../core/projection.js';
import {
  resolveContext,
  isContext,
  loadState,
  failure,
  findTask,
  taskNotFound,
  type CommandResult,
  type Context,
} from './task.js';

/**
 * Milestones — grouping by outcome.
 *
 * An epic groups by structure and a sprint groups by time; neither answers
 * "what is left before 1.0". A milestone is a field on the task, beside
 * `sprint`, and not a third hierarchy: two parallel hierarchies drift in
 * behaviour and one cannot.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface MilestoneFields {
  due?: string;
}

export interface MilestoneListOptions {
  json?: boolean;
  /** Include closed milestones, hidden by default. */
  all?: boolean;
}

/** By MS-N, by ULID, or by the name a person gave it. */
export function findMilestone(state: ProjectState, ref: string): Milestone | undefined {
  // Coerced rather than trusted: a milestone called "1.0" reaches this as a
  // number when it arrives through a cac option, and a name is a name.
  const needle = String(ref).trim();
  const upper = needle.toUpperCase();
  return state.milestones.find(
    (m) => m.id === upper || m.label === upper || m.name.toLowerCase() === needle.toLowerCase(),
  );
}

function milestoneNotFound(state: ProjectState, ref: string): CommandResult {
  const known = state.milestones.map((m) => `${m.label} ${m.name}`);
  return failure(
    1,
    'milestone_not_found',
    known.length === 0
      ? `No milestone "${ref}".\nCreate one:\n  kadence milestone create "1.0"`
      : `No milestone "${ref}".\nAvailable: ${known.join(', ')}`,
    { received: ref, hint: 'kadence milestone list --json' },
  );
}

function write(ctx: Context, type: 'milestone.created' | 'milestone.task_added' | 'milestone.closed', entity: string, data: Record<string, unknown>): void {
  append(ctx.root, {
    id: ulid(),
    type,
    entity,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data,
  });
}

export function runMilestoneCreate(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string,
  fields: MilestoneFields,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return failure(2, 'invalid_argument', 'A milestone needs a name.', {
      hint: 'kadence milestone create "1.0"',
    });
  }
  if (fields.due !== undefined && !ISO_DATE.test(fields.due)) {
    return failure(2, 'invalid_argument', `"${fields.due}" is not a date. Use YYYY-MM-DD.`, {
      received: fields.due,
      hint: 'kadence milestone create "1.0" --due 2026-12-01',
    });
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const clash = findMilestone(state, trimmed);
  const note =
    clash === undefined
      ? []
      : [
          `A milestone named ${clash.name} already exists as ${clash.label}. ` +
            'Both stay in the journal — reference them by label to be unambiguous.',
        ];

  const id = ulid();
  write(ctx, 'milestone.created', id, {
    name: trimmed,
    ...(fields.due === undefined ? {} : { due: fields.due }),
  });

  // The label is a position in ULID order, so it is computed from the state
  // already in hand rather than by folding the journal a second time.
  const label = `MS-${state.milestones.filter((m) => m.id < id).length + 1}`;
  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...note],
    message: `${label} ${trimmed}${fields.due === undefined ? '' : ` — due ${fields.due}`}`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      milestone: { id, label, name: trimmed, due: fields.due ?? null },
    },
  };
}

export function runMilestoneAdd(
  cwd: string,
  env: NodeJS.ProcessEnv,
  taskRef: string,
  milestoneRef: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const task = findTask(state, taskRef);
  if (task === undefined) return taskNotFound(taskRef);

  const milestone = findMilestone(state, milestoneRef);
  if (milestone === undefined) return milestoneNotFound(state, milestoneRef);

  if (task.milestone === milestone.id) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: `${task.label} is already in ${milestone.label} ${milestone.name}.`,
      data: { schema: 'kadence/v1', ok: true, task: { id: task.id, label: task.label } },
    };
  }

  const previous =
    task.milestone === null ? null : state.milestones.find((m) => m.id === task.milestone);

  write(ctx, 'milestone.task_added', milestone.id, { task: task.id });

  return {
    ok: true,
    exitCode: 0,
    warnings,
    // A task holds one milestone, so this is a move rather than an addition
    // whenever it already had one. Saying so avoids a silent reassignment.
    message:
      previous === undefined || previous === null
        ? `${task.label} → ${milestone.label} ${milestone.name}`
        : `${task.label}: ${previous.label} ${previous.name} → ${milestone.label} ${milestone.name}`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      task: { id: task.id, label: task.label },
      milestone: { id: milestone.id, label: milestone.label, name: milestone.name },
      ...(previous === undefined || previous === null ? {} : { previous: previous.label }),
    },
  };
}

export function runMilestoneClose(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const milestone = findMilestone(state, ref);
  if (milestone === undefined) return milestoneNotFound(state, ref);

  if (milestone.status === 'closed') {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: `${milestone.label} ${milestone.name} is already closed.`,
      data: { schema: 'kadence/v1', ok: true, milestone: { id: milestone.id, label: milestone.label } },
    };
  }

  write(ctx, 'milestone.closed', milestone.id, {});

  const open = milestone.totalTasks - milestone.doneTasks;
  return {
    ok: true,
    exitCode: 0,
    warnings,
    // Closing is a statement about the calendar, not about the work: the open
    // tasks stay open and are named rather than swept up.
    message:
      `${milestone.label} ${milestone.name} closed at ${milestone.donePoints}/${milestone.totalPoints} points.` +
      (open > 0 ? `\n${open} task(s) are still open; closing does not move them.` : ''),
    data: {
      schema: 'kadence/v1',
      ok: true,
      milestone: {
        id: milestone.id,
        label: milestone.label,
        name: milestone.name,
        donePoints: milestone.donePoints,
        totalPoints: milestone.totalPoints,
      },
    },
  };
}

export function runMilestoneList(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: MilestoneListOptions,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const shown =
    options.all === true ? state.milestones : state.milestones.filter((m) => m.status === 'open');

  if (shown.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message:
        state.milestones.length === 0
          ? 'No milestones yet.\nCreate one:\n  kadence milestone create "1.0"'
          : 'Every milestone is closed.\nSee them all:\n  kadence milestone list --all',
      data: { schema: 'kadence/v1', ok: true, milestones: [] },
    };
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: shown.map(renderMilestone).join('\n'),
    data: { schema: 'kadence/v1', ok: true, milestones: shown.map(serializeMilestone) },
  };
}

function serializeMilestone(m: Milestone): Record<string, unknown> {
  return {
    // The ULID is the identity; MS-N is derived and can change when a branch
    // merges. Every other entity exposes both, and so does this one.
    id: m.id,
    label: m.label,
    name: m.name,
    due: m.due,
    status: m.status,
    doneTasks: m.doneTasks,
    totalTasks: m.totalTasks,
    donePoints: m.donePoints,
    totalPoints: m.totalPoints,
  };
}

function renderMilestone(m: Milestone): string {
  // Points, not a percentage of tasks: velocity and burndown are both in
  // points, and one product should not measure progress two ways.
  const pct = m.totalPoints === 0 ? 0 : Math.round((m.donePoints / m.totalPoints) * 100);
  const filled = Math.round(pct / 10);
  const bar = `${'#'.repeat(filled)}${'.'.repeat(10 - filled)}`;
  const due = m.due === null ? '' : `  due ${m.due}`;
  const closed = m.status === 'closed' ? '  [closed]' : '';
  return `${m.label} ${m.name}${due}${closed}\n  ${bar} ${pct}%  ${m.donePoints}/${m.totalPoints} points, ${m.doneTasks}/${m.totalTasks} tasks`;
}
