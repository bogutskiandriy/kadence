import { append } from '../../core/store.js';
import { ulid } from '../../core/ulid.js';
import { sprintReport, type SprintReport } from '../../core/velocity.js';
import { burndown, renderBurndown } from '../../core/burndown.js';
import { readAll } from '../../core/store.js';
import type { ProjectState } from '../../core/projection.js';
import { resolveContext, isContext, loadState, findTask, type CommandResult, type Context } from './task.js';

/**
 * Sprint commands.
 *
 * This is what no file-based competitor offers, and the reason sprintit is
 * positioned as work analytics rather than yet another tracker.
 */

function activeSprint(state: ProjectState) {
  return state.sprints.find((s) => s.status === 'active');
}

function plannedSprints(state: ProjectState) {
  return state.sprints.filter((s) => s.status === 'planned');
}

/** Sprint by name — case-insensitive. */
function findSprintByName(state: ProjectState, name: string) {
  const needle = name.trim().toLowerCase();
  return state.sprints.find((s) => s.name.toLowerCase() === needle);
}

function write(ctx: Context, type: 'sprint.created' | 'sprint.started' | 'sprint.updated' | 'sprint.closed' | 'sprint.task_added', entity: string, data: Record<string, unknown>): void {
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

export function runSprintCreate(cwd: string, env: NodeJS.ProcessEnv, name: string): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, exitCode: 2, message: 'A sprint needs a name.' };
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  if (findSprintByName(state, trimmed) !== undefined) {
    return { ok: false, exitCode: 2, message: `Sprint "${trimmed}" already exists.` };
  }

  // The first sprint starts immediately; later ones are planned. A PM must be
  // able to fill the next sprint while the current one runs, or planning is
  // impossible.
  const hasActive = activeSprint(state) !== undefined;

  const id = ulid();
  write(ctx, 'sprint.created', id, { name: trimmed });
  if (!hasActive) write(ctx, 'sprint.started', id, {});

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: hasActive
      ? `Sprint "${trimmed}" planned.\n\n` +
        `  sprintit sprint add FLOW-1 --sprint "${trimmed}"\n  sprintit sprint start "${trimmed}"`
      : `Sprint "${trimmed}" started.\n\n  sprintit sprint add FLOW-1\n  sprintit sprint status`,
    data: {
      schema: 'sprintit/v1',
      ok: true,
      sprint: { id, name: trimmed, status: hasActive ? 'planned' : 'active' },
    },
  };
}

export function runSprintAdd(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  options: { sprint?: string } = {},
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  const sprint =
    options.sprint === undefined ? activeSprint(state) : findSprintByName(state, options.sprint);

  if (sprint === undefined) {
    return options.sprint === undefined
      ? {
          ok: false,
          exitCode: 1,
          message: 'No active sprint.\n  sprintit sprint create "Sprint 1"',
        }
      : { ok: false, exitCode: 1, message: `No sprint named "${options.sprint}".\n  sprintit sprint list` };
  }
  if (sprint.status === 'closed') {
    return {
      ok: false,
      exitCode: 1,
      message: `Sprint "${sprint.name}" is closed — its velocity is not rewritten.`,
    };
  }

  const task = findTask(state, ref);
  if (task === undefined) {
    return { ok: false, exitCode: 1, message: `No task ${ref}.\n  sprintit task list` };
  }
  if (task.sprint === sprint.id) {
    return { ok: true, exitCode: 0, warnings, message: `${task.label} is already in the sprint.` };
  }

  write(ctx, 'sprint.task_added', sprint.id, { task: task.id });

  const noEstimate =
    task.estimate === null ? '\nWithout an estimate this task will not count towards velocity.' : '';

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `${task.label} → "${sprint.name}"${noEstimate}`,
    data: { schema: 'sprintit/v1', ok: true, task: { id: task.id, label: task.label }, sprint: sprint.id },
  };
}

export function runSprintClose(cwd: string, env: NodeJS.ProcessEnv): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const sprint = activeSprint(state);
  if (sprint === undefined) {
    return {
      ok: false,
      exitCode: 1,
      message: 'No active sprint.\n  sprintit sprint create "Sprint 1"',
    };
  }

  const report = sprintReport(state, sprint.id)!;
  write(ctx, 'sprint.closed', sprint.id, { velocity: report.velocity });

  const all = [...warnings];
  if (report.unestimated.length > 0) {
    all.push(
      `${report.unestimated.length} completed task(s) without an estimate were left out of velocity: ` +
        report.unestimated.map((t) => t.label).join(', '),
    );
  }

  return {
    ok: true,
    exitCode: 0,
    warnings: all,
    message: renderReport(report),
    data: { schema: 'sprintit/v1', ok: true, report: serializeReport(report) },
  };
}

export function runSprintStatus(cwd: string, env: NodeJS.ProcessEnv): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const sprint = activeSprint(state);
  if (sprint === undefined) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: 'No active sprint.\n  sprintit sprint create "Sprint 1"',
      data: { schema: 'sprintit/v1', ok: true, sprint: null },
    };
  }

  const report = sprintReport(state, sprint.id)!;
  const lines = [
    `"${report.name}" — ${report.velocity} of ${report.committed} points`,
    '',
    ...report.done.map((t) => `  ✓ ${t.label}  ${t.title}`),
    ...report.carriedOver.map((t) => `  · ${t.label}  ${t.title} (${t.status})`),
  ];

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: lines.join('\n'),
    data: { schema: 'sprintit/v1', ok: true, report: serializeReport(report) },
  };
}

function renderReport(r: SprintReport): string {
  const lines = [`Sprint "${r.name}" closed.`, ''];
  lines.push(`  Velocity:  ${r.velocity} of ${r.committed} points`);

  // The key number for calibrating estimates: what a point actually costs.
  // If the work took under a minute, printing "0.0h per point" is worse than
  // printing nothing: the number looks like a bug and undermines trust in the
  // rest of the report.
  if (r.hoursPerPoint !== null && r.actualHours !== null && r.actualHours >= 1 / 60) {
    lines.push(
      `  Actual:    ${formatDuration(r.actualHours)} — ${formatDuration(r.hoursPerPoint)} per point`,
    );
  }
  if (r.loggedHours > 0) {
    // Logged hours and derived hours answer different questions: one is what
    // people say they spent, the other what the board says elapsed.
    lines.push(`  Logged:    ${formatDuration(r.loggedHours)} entered by hand`);
  }
  if (r.carriedOver.length > 0) {
    lines.push('', `  Carried over (${r.carriedOver.length}):`);
    for (const t of r.carriedOver) lines.push(`    · ${t.label}  ${t.title}`);
  }
  if (r.cancelled.length > 0) {
    lines.push('', `  Cancelled (${r.cancelled.length}) — not counted towards velocity`);
  }
  return lines.join('\n');
}

/** Hours in human units: "45m" instead of "0.8h". */
export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}

function serializeReport(r: SprintReport): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    velocity: r.velocity,
    committed: r.committed,
    actualHours: r.actualHours,
    hoursPerPoint: r.hoursPerPoint,
    done: r.done.map((t) => t.label),
    carriedOver: r.carriedOver.map((t) => t.label),
    cancelled: r.cancelled.map((t) => t.label),
    unestimated: r.unestimated.map((t) => t.label),
    loggedHours: r.loggedHours,
  };
}

export function runSprintStart(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string | undefined,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  const open = activeSprint(state);
  if (open !== undefined) {
    return {
      ok: false,
      exitCode: 1,
      message:
        `Sprint "${open.name}" is still active.\n` +
        'Close it so velocity can be computed:\n  sprintit sprint close',
    };
  }

  const planned = plannedSprints(state);
  // With no name given, take the oldest planned sprint — most likely the one
  // meant to run next.
  const target = name === undefined ? planned[0] : findSprintByName(state, name);

  if (target === undefined) {
    return {
      ok: false,
      exitCode: 1,
      message:
        name === undefined
          ? 'No planned sprints.\n  sprintit sprint create "Sprint 2"'
          : `No sprint named "${name}".\n  sprintit sprint list`,
    };
  }
  if (target.status !== 'planned') {
    return { ok: false, exitCode: 1, message: `Sprint "${target.name}" is already ${target.status}.` };
  }

  write(ctx, 'sprint.started', target.id, {});

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `Sprint "${target.name}" started.\n\n  sprintit sprint status`,
    data: { schema: 'sprintit/v1', ok: true, sprint: { id: target.id, name: target.name } },
  };
}

export function runSprintList(cwd: string, env: NodeJS.ProcessEnv): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  if (state.sprints.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: 'No sprints yet.\n  sprintit sprint create "Sprint 1"',
      data: { schema: 'sprintit/v1', ok: true, sprints: [] },
    };
  }

  const rows = state.sprints.map((s) => {
    const tasks = state.tasks.filter((t) => t.sprint === s.id);
    const points = tasks.reduce((n, t) => n + (t.estimate ?? 0), 0);
    return { sprint: s, tasks, points };
  });

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: rows
      .map(({ sprint, tasks, points }) => {
        const mark = sprint.status === 'active' ? '→' : ' ';
        const size = tasks.length === 0 ? '' : `  ${tasks.length} tasks, ${points} points`;
        return `${mark} ${sprint.name.padEnd(20)} ${sprint.status.padEnd(8)}${size}`;
      })
      .join('\n'),
    data: {
      schema: 'sprintit/v1',
      ok: true,
      sprints: rows.map(({ sprint, tasks, points }) => ({
        id: sprint.id,
        name: sprint.name,
        status: sprint.status,
        taskIds: sprint.taskIds,
        taskCount: tasks.length,
        points,
      })),
    },
  };
}

export interface SprintEdits {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}

/** Calendar date only — sprint boundaries are days, not moments. */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function runSprintEdit(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string | undefined,
  edits: SprintEdits,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  for (const [field, value] of [
    ['--start', edits.startDate],
    ['--end', edits.endDate],
  ] as const) {
    if (value !== undefined && value !== '' && !isIsoDate(value)) {
      return {
        ok: false,
        exitCode: 2,
        message: `${field} must be YYYY-MM-DD, got "${value}".\n  sprintit sprint edit --start 2026-09-01`,
      };
    }
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const sprint = name === undefined ? activeSprint(state) : findSprintByName(state, name);

  if (sprint === undefined) {
    return {
      ok: false,
      exitCode: 1,
      message:
        name === undefined
          ? 'No active sprint.\n  sprintit sprint list'
          : `No sprint named "${name}".\n  sprintit sprint list`,
    };
  }
  if (sprint.status === 'closed') {
    return {
      ok: false,
      exitCode: 1,
      message: `Sprint "${sprint.name}" is closed — its record is not rewritten.`,
    };
  }
  if (edits.name !== undefined && edits.name !== sprint.name) {
    const clash = findSprintByName(state, edits.name);
    if (clash !== undefined) {
      return { ok: false, exitCode: 2, message: `Sprint "${edits.name}" already exists.` };
    }
  }

  // Resolve dates against what the sprint will look like after the edit, not
  // against what it is now — otherwise setting both at once fails on the first.
  const start = edits.startDate ?? sprint.startDate ?? '';
  const end = edits.endDate ?? sprint.endDate ?? '';
  if (start !== '' && end !== '' && end < start) {
    return {
      ok: false,
      exitCode: 2,
      message: `The end date (${end}) is before the start date (${start}).`,
    };
  }

  const data: Record<string, unknown> = {};
  const changed: string[] = [];
  if (edits.name !== undefined && edits.name !== sprint.name) {
    data['name'] = edits.name;
    changed.push('name');
  }
  if (edits.description !== undefined && edits.description !== (sprint.description ?? '')) {
    data['description'] = edits.description;
    changed.push('description');
  }
  if (edits.startDate !== undefined && edits.startDate !== (sprint.startDate ?? '')) {
    data['startDate'] = edits.startDate;
    changed.push('start');
  }
  if (edits.endDate !== undefined && edits.endDate !== (sprint.endDate ?? '')) {
    data['endDate'] = edits.endDate;
    changed.push('end');
  }

  if (changed.length === 0) {
    return { ok: true, exitCode: 0, warnings, message: `"${sprint.name}": nothing changed.` };
  }

  write(ctx, 'sprint.updated', sprint.id, data);

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `"${sprint.name}": updated ${changed.join(', ')}.`,
    data: { schema: 'sprintit/v1', ok: true, sprint: { id: sprint.id, changed } },
  };
}

export function runSprintBurndown(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string | undefined,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const sprint = name === undefined ? activeSprint(state) : findSprintByName(state, name);

  if (sprint === undefined) {
    return {
      ok: false,
      exitCode: 1,
      message:
        name === undefined
          ? 'No active sprint.\n  sprintit sprint list'
          : `No sprint named "${name}".\n  sprintit sprint list`,
    };
  }

  // The chart is derived from raw events, not from folded state: only the
  // journal knows when each transition happened.
  const chart = burndown(state, readAll(ctx.root).events, sprint);
  if (chart === null) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: `"${sprint.name}" has no tasks yet.\n  sprintit sprint add FLOW-1`,
      data: { schema: 'sprintit/v1', ok: true, burndown: null },
    };
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: renderBurndown(chart),
    data: { schema: 'sprintit/v1', ok: true, burndown: chart },
  };
}
