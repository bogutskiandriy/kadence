import { append } from '../../core/store.js';
import { ulid } from '../../core/ulid.js';
import { sprintReport, velocitySeries, type SprintReport } from '../../core/velocity.js';
import { burndown, renderBurndown, type Burndown } from '../../core/burndown.js';
import { readAll } from '../../core/store.js';
import type { ProjectState, Sprint } from '../../core/projection.js';
import { runNoteAdd } from './note.js';
import { resolveContext, isContext, loadState, findTask, runTaskAdd, type CommandResult, type Context,
  taskNotFound,
  failure,
} from './task.js';

/**
 * Sprint commands.
 *
 * This is what no file-based competitor offers, and the reason kadence is
 * positioned as work analytics rather than yet another tracker.
 */

export function activeSprint(state: ProjectState) {
  return state.sprints.find((s) => s.status === 'active');
}

export function plannedSprints(state: ProjectState) {
  return state.sprints.filter((s) => s.status === 'planned');
}

/** Sprint by name — case-insensitive. */
export function findSprintByName(state: ProjectState, name: string) {
  const needle = name.trim().toLowerCase();
  return state.sprints.find((s) => s.name.toLowerCase() === needle);
}

/**
 * Scrum starts a sprint with a goal. Said, not enforced: a team that does not
 * run Scrum should be able to start a sprint without being told off twice.
 */
function goalWarning(sprint: { name: string; goal: string | null }): string[] {
  return sprint.goal === null
    ? [`Sprint "${sprint.name}" has no Sprint Goal. Scrum plans a sprint around one:\n  kadence sprint edit "${sprint.name}" --goal "…"`]
    : [];
}

/**
 * What Sprint Planning weighs: the work taken in against what finished
 * sprints actually finished. A range, as `report velocity` gives it — one
 * average reads as a promise the spread does not make.
 */
function planning(state: ProjectState, sprint: Sprint): {
  data: Record<string, unknown>;
  lines: string[];
  warnings: string[];
} {
  const tasks = state.tasks.filter((t) => t.sprint === sprint.id && t.status !== 'cancelled');
  const committed = tasks.reduce((n, t) => n + (t.estimate ?? 0), 0);
  const series = velocitySeries(state);
  const velocity =
    series.median === null
      ? null
      : { median: series.median, low: series.low, high: series.high, sprints: series.rows.length };

  const lines = [`  Taken in:  ${committed} points, ${tasks.length} task(s)`];
  const warnings: string[] = [];
  if (velocity === null) {
    lines.push('  Velocity:  none yet — no sprint has closed');
  } else {
    lines.push(
      `  Velocity:  ${velocity.low}–${velocity.high} points, median ${velocity.median} (${velocity.sprints} closed sprint(s))`,
    );
    if (committed > velocity.high!) {
      warnings.push(
        `"${sprint.name}" takes in ${committed} points, more than any finished sprint (${velocity.high}). ` +
          'Planning against what was finished, not what was hoped, is what makes the forecast honest.',
      );
    }
  }
  return {
    data: { goal: sprint.goal, committed, tasks: tasks.length, velocity },
    lines,
    warnings,
  };
}

/** Inclusive length in days of a sprint with both dates set. */
function lengthInDays(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
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

export function runSprintCreate(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string,
  options: { goal?: string } = {},
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return failure(2, 'invalid_argument', 'A sprint needs a name.', {
      hint: 'kadence sprint list --json',
    });
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  if (findSprintByName(state, trimmed) !== undefined) {
    return failure(2, 'invalid_argument', `Sprint "${trimmed}" already exists.`, {
      received: trimmed,
      hint: 'kadence sprint list --json',
    });
  }

  // The first sprint starts immediately; later ones are planned. A PM must be
  // able to fill the next sprint while the current one runs, or planning is
  // impossible.
  const hasActive = activeSprint(state) !== undefined;

  const goal = options.goal?.trim() ?? '';
  const id = ulid();
  write(ctx, 'sprint.created', id, { name: trimmed, ...(goal === '' ? {} : { goal }) });
  if (!hasActive) write(ctx, 'sprint.started', id, {});

  return {
    ok: true,
    exitCode: 0,
    // Only when it starts now: a planned sprint gets its goal at planning.
    warnings: hasActive ? warnings : [...warnings, ...goalWarning({ name: trimmed, goal: goal === '' ? null : goal })],
    message: hasActive
      ? `Sprint "${trimmed}" planned.\n\n` +
        `  kadence sprint add KAD-1 --sprint "${trimmed}"\n  kadence sprint start "${trimmed}"`
      : `Sprint "${trimmed}" started.\n\n  kadence sprint add KAD-1\n  kadence sprint status`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      sprint: { id, name: trimmed, status: hasActive ? 'planned' : 'active', goal: goal === '' ? null : goal },
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
          ...failure(1, 'sprint_not_found', 'No active sprint.\n  kadence sprint create "Sprint 1"', {
            hint: 'kadence sprint list --json',
          }),
        }
      : failure(1, 'sprint_not_found', `No sprint named "${options.sprint}".\n  kadence sprint list`, {
          received: options.sprint,
          hint: 'kadence sprint list --json',
        });
  }
  if (sprint.status === 'closed') {
    return failure(
      1,
      'conflicting_state',
      `Sprint "${sprint.name}" is closed — its velocity is not rewritten.`,
      { received: sprint.name },
    );
  }

  const task = findTask(state, ref);
  if (task === undefined) {
    return taskNotFound(ref);
  }
  if (task.sprint === sprint.id) {
    return { ok: true, exitCode: 0, warnings, message: `${task.label} is already in the sprint.` };
  }

  write(ctx, 'sprint.task_added', sprint.id, { task: task.id });

  const noEstimate =
    task.estimate === null
      ? `\nWithout an estimate this task adds no points to sprint "${sprint.name}". Add --estimate.`
      : '';

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `${task.label} → "${sprint.name}"${noEstimate}`,
    data: { schema: 'kadence/v1', ok: true, task: { id: task.id, label: task.label }, sprint: sprint.id },
  };
}

export interface SprintCloseOptions {
  /** A sprint name, or `next` for the oldest planned one. */
  carryTo?: string;
}

export function runSprintClose(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: SprintCloseOptions = {},
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const sprint = activeSprint(state);
  if (sprint === undefined) {
    return {
      ...failure(1, 'sprint_not_found', 'No active sprint.\n  kadence sprint create "Sprint 1"', {
        hint: 'kadence sprint list --json',
      }),
    };
  }

  // Resolved before anything is written: a typo must not leave the sprint
  // closed and its unfinished work stranded.
  let target: Sprint | undefined;
  if (options.carryTo !== undefined) {
    const wanted = String(options.carryTo);
    target = wanted.toLowerCase() === 'next' ? plannedSprints(state)[0] : findSprintByName(state, wanted);
    if (target === undefined || target.id === sprint.id || target.status === 'closed' || target.status === 'cancelled') {
      return failure(
        1,
        'sprint_not_found',
        wanted.toLowerCase() === 'next'
          ? 'No planned sprint to carry the work into.\n  kadence sprint create "Sprint 2"'
          : `No open sprint named "${wanted}" to carry the work into.\n  kadence sprint list`,
        { received: wanted, hint: 'kadence sprint list --json' },
      );
    }
  }

  const report = sprintReport(state, sprint.id)!;
  const carried = target === undefined ? [] : report.carriedOver;
  write(ctx, 'sprint.closed', sprint.id, {
    velocity: report.velocity,
    ...(carried.length === 0 ? {} : { carried: carried.map((t) => t.id) }),
  });
  for (const task of carried) write(ctx, 'sprint.task_added', target!.id, { task: task.id });

  const all = [...warnings];
  if (report.unestimated.length > 0) {
    all.push(
      `${report.unestimated.length} completed task(s) without an estimate were left out of velocity: ` +
        report.unestimated.map((t) => t.label).join(', '),
    );
  }

  // Scrum: what is not done goes back to the Product Backlog, or on into the
  // next sprint if the team chooses. Either way, somebody should say which.
  const left = report.carriedOver.length;
  const tail =
    target !== undefined
      ? `\n\n  ${carried.length} unfinished task(s) moved to "${target.name}".`
      : left > 0
        ? '\n\nThe unfinished work stays in this sprint\'s record. To take it on into the next one:\n' +
          '  kadence sprint add KAD-1 --sprint "Sprint 2"\n' +
          'or, at the next close:  kadence sprint close --carry-to next'
        : '';

  return {
    ok: true,
    exitCode: 0,
    warnings: all,
    message: renderReport(report) + tail,
    data: {
      schema: 'kadence/v1',
      ok: true,
      report: serializeReport(report),
      carriedTo: target === undefined ? null : { id: target.id, name: target.name, tasks: carried.map((t) => t.label) },
    },
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
      message: 'No active sprint.\n  kadence sprint create "Sprint 1"',
      data: { schema: 'kadence/v1', ok: true, sprint: null },
    };
  }

  const report = sprintReport(state, sprint.id)!;
  const lines = [
    `"${report.name}" — ${report.velocity} of ${report.committed} points`,
    ...(sprint.goal === null ? [] : [`Goal: ${sprint.goal}`]),
    '',
    ...report.done.map((t) => `  ✓ ${t.label}  ${t.title}`),
    ...report.carriedOver.map((t) => `  · ${t.label}  ${t.title} (${t.status})`),
  ];

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: lines.join('\n'),
    data: { schema: 'kadence/v1', ok: true, report: serializeReport(report) },
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
    goal: r.goal,
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
      ...failure(
        1,
        'conflicting_state',
        `Sprint "${open.name}" is still active.\n` +
          'Close it so velocity can be computed:\n  kadence sprint close',
        { received: open.name },
      ),
    };
  }

  const planned = plannedSprints(state);
  // With no name given, take the oldest planned sprint — most likely the one
  // meant to run next.
  const target = name === undefined ? planned[0] : findSprintByName(state, name);

  if (target === undefined) {
    return {
      ...failure(
        1,
        'sprint_not_found',
        name === undefined
          ? 'No planned sprints.\n  kadence sprint create "Sprint 2"'
          : `No sprint named "${name}".\n  kadence sprint list`,
        { ...(name !== undefined ? { received: name } : {}), hint: 'kadence sprint list --json' },
      ),
    };
  }
  if (target.status !== 'planned') {
    return failure(1, 'conflicting_state', `Sprint "${target.name}" is already ${target.status}.`, {
      received: target.name,
    });
  }

  write(ctx, 'sprint.started', target.id, {});

  const plan = planning(state, target);
  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...goalWarning(target), ...plan.warnings],
    message: [
      `Sprint "${target.name}" started.`,
      ...(target.goal === null ? [] : [`  Goal:      ${target.goal}`]),
      ...plan.lines,
      '',
      '  kadence sprint status',
    ].join('\n'),
    data: {
      schema: 'kadence/v1',
      ok: true,
      sprint: { id: target.id, name: target.name, goal: target.goal },
      planning: plan.data,
    },
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
      message: 'No sprints yet.\n  kadence sprint create "Sprint 1"',
      data: { schema: 'kadence/v1', ok: true, sprints: [] },
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
      schema: 'kadence/v1',
      ok: true,
      sprints: rows.map(({ sprint, tasks, points }) => ({
        id: sprint.id,
        name: sprint.name,
        status: sprint.status,
        goal: sprint.goal,
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
  goal?: string;
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
        ...failure(
          2,
          'invalid_argument',
          `${field} must be YYYY-MM-DD, got "${value}".\n  kadence sprint edit --start 2026-09-01`,
          { received: value },
        ),
      };
    }
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const sprint = name === undefined ? activeSprint(state) : findSprintByName(state, name);

  if (sprint === undefined) {
    return {
      ...failure(
        1,
        'sprint_not_found',
        name === undefined
          ? 'No active sprint.\n  kadence sprint list'
          : `No sprint named "${name}".\n  kadence sprint list`,
        { ...(name !== undefined ? { received: name } : {}), hint: 'kadence sprint list --json' },
      ),
    };
  }
  if (sprint.status === 'closed') {
    return {
      ...failure(
        1,
        'conflicting_state',
        `Sprint "${sprint.name}" is closed — its record is not rewritten.`,
        { received: sprint.name },
      ),
    };
  }
  if (edits.name !== undefined && edits.name !== sprint.name) {
    const clash = findSprintByName(state, edits.name);
    if (clash !== undefined) {
        return failure(2, 'invalid_argument', `Sprint "${edits.name}" already exists.`, {
        received: edits.name,
      });
    }
  }

  // Resolve dates against what the sprint will look like after the edit, not
  // against what it is now — otherwise setting both at once fails on the first.
  const start = edits.startDate ?? sprint.startDate ?? '';
  const end = edits.endDate ?? sprint.endDate ?? '';
  if (start !== '' && end !== '' && end < start) {
    return {
      ...failure(
        2,
        'invalid_argument',
        `The end date (${end}) is before the start date (${start}).`,
        { received: end },
      ),
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

  const notices = [...warnings];
  // Scrum Guide 2020: one month or less. Longer is allowed — the dates are a
  // planning horizon here, never enforcement — and said.
  if (start !== '' && end !== '' && (edits.startDate !== undefined || edits.endDate !== undefined)) {
    const days = lengthInDays(start, end);
    if (days > 31) {
      notices.push(
        `"${sprint.name}" runs ${days} days, longer than a month. Scrum keeps sprints to a month or less ` +
          'so the plan is inspected before it goes stale.',
      );
    }
  }
  if (edits.goal !== undefined && edits.goal.trim() !== (sprint.goal ?? '')) {
    data['goal'] = edits.goal.trim();
    changed.push('goal');
    // Allowed, because refusing would only move the change somewhere the
    // journal cannot see it. Said, because Scrum treats a goal that no longer
    // holds as the reason to cancel a sprint, not to rewrite it.
    if (sprint.status === 'active' && sprint.goal !== null) {
      notices.push(
        'Sprint Goal changed while the sprint is active. Scrum keeps the goal fixed and renegotiates scope; ' +
          'a goal that no longer holds is a reason to end the sprint.',
      );
    }
  }

  if (changed.length === 0) {
    return { ok: true, exitCode: 0, warnings, message: `"${sprint.name}": nothing changed.` };
  }

  write(ctx, 'sprint.updated', sprint.id, data);

  return {
    ok: true,
    exitCode: 0,
    warnings: notices,
    message: `"${sprint.name}": updated ${changed.join(', ')}.`,
    data: { schema: 'kadence/v1', ok: true, sprint: { id: sprint.id, changed } },
  };
}

/**
 * The chart for one sprint, for every command that draws it.
 *
 * `sprint burndown` and `report burndown` are the same question asked in two
 * places. Two resolutions of "which sprint" and two ideas of what a burndown
 * is would drift, so there is one of each, here.
 */
/** The sprint a sprint report is about: by name, or the active one. */
export function reportSprint(state: ProjectState, name: string | undefined): Sprint | CommandResult {
  const sprint = name === undefined ? activeSprint(state) : findSprintByName(state, name);
  if (sprint === undefined) {
    return failure(
      1,
      'sprint_not_found',
      name === undefined
        ? 'No active sprint.\n  kadence sprint list'
        : `No sprint named "${name}".\n  kadence sprint list`,
      { ...(name !== undefined ? { received: name } : {}), hint: 'kadence sprint list --json' },
    );
  }
  return sprint;
}

export function burndownFor(
  root: string,
  state: ProjectState,
  name: string | undefined,
): { sprint: Sprint; chart: Burndown | null } | CommandResult {
  const sprint = reportSprint(state, name);
  if ('exitCode' in sprint) return sprint;
  // The chart is derived from raw events, not from folded state: only the
  // journal knows when each transition happened.
  return { sprint, chart: burndown(state, readAll(root).events, sprint) };
}

export function runSprintBurndown(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string | undefined,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const resolved = burndownFor(ctx.root, state, name);
  if ('exitCode' in resolved) return resolved;
  const { sprint, chart } = resolved;

  if (chart === null) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: `"${sprint.name}" has no tasks yet.\n  kadence sprint add KAD-1`,
      data: { schema: 'kadence/v1', ok: true, burndown: null },
    };
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: renderBurndown(chart),
    data: { schema: 'kadence/v1', ok: true, burndown: chart },
  };
}

/**
 * `sprint retro` — the Sprint Retrospective, in the journal.
 *
 * Scrum Guide 2020: the team inspects how the sprint went and identifies the
 * most helpful changes; the most impactful may go straight into the next
 * Sprint Backlog. Both halves already exist here — a note is something
 * learned, a task is work — so this command composes them and adds only the
 * link to the sprint. Every write goes through the command that owns it, so a
 * retro action is the same task `task add` would make.
 */

export interface RetroOptions {
  /** The sprint by name; the active one, else the one that closed last. */
  sprint?: string;
  /** Make the observation a task, labelled `retro`, in the next planned sprint. */
  action?: boolean;
}

/**
 * The retrospective concludes the sprint, so it runs while the sprint is
 * still active. After the close it belongs to the sprint that just ended.
 */
function retroSprint(state: ProjectState, name: string | undefined): Sprint | undefined {
  if (name !== undefined) return findSprintByName(state, name);
  return (
    activeSprint(state) ??
    state.sprints
      .filter((s) => s.status === 'closed')
      .sort((a, b) => ((a.closedBy ?? '') < (b.closedBy ?? '') ? -1 : 1))
      .pop()
  );
}

export function runSprintRetro(
  cwd: string,
  env: NodeJS.ProcessEnv,
  text: string | undefined,
  options: RetroOptions,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const sprint = retroSprint(state, options.sprint);
  if (sprint === undefined) {
    return failure(
      1,
      'sprint_not_found',
      options.sprint === undefined
        ? 'No sprint to hold a retrospective for.\n  kadence sprint create "Sprint 1"'
        : `No sprint named "${options.sprint}".\n  kadence sprint list`,
      { ...(options.sprint === undefined ? {} : { received: options.sprint }), hint: 'kadence sprint list --json' },
    );
  }

  if (text === undefined || String(text).trim() === '') return listRetro(state, sprint, warnings);

  const said = String(text).trim();
  if (options.action !== true) {
    const note = runNoteAdd(cwd, env, said, { sprintId: sprint.id });
    if (!note.ok) return note;
    return {
      ...note,
      message: `Retro of "${sprint.name}": noted.\n  kadence sprint retro "…" --action   to make a change of it`,
    };
  }

  // The next sprint is where Scrum puts an improvement: the oldest planned one
  // that is not the sprint under review.
  const next = plannedSprints(state).find((s) => s.id !== sprint.id);
  const added = runTaskAdd(cwd, env, said, {
    labels: ['retro'],
    description: `From the retrospective of "${sprint.name}".`,
  });
  if (!added.ok) return added;
  const task = added.data!['task'] as { id: string };
  const label = `KAD-${state.tasks.length + 1}`;
  if (next !== undefined) {
    const moved = runSprintAdd(cwd, env, task.id, { sprint: next.name });
    if (!moved.ok) return moved;
  }
  runNoteAdd(cwd, env, said, { task: task.id, sprintId: sprint.id });

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message:
      next === undefined
        ? `Retro of "${sprint.name}": ${label} ${said}\nNo planned sprint to put it in; it waits in the backlog.\n  kadence sprint create "…"   then   kadence sprint add ${label} --sprint "…"`
        : `Retro of "${sprint.name}": ${label} ${said} → "${next.name}"`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      retro: { sprint: sprint.name, action: { id: task.id, label, sprint: next?.name ?? null } },
    },
  };
}

function listRetro(state: ProjectState, sprint: Sprint, warnings: string[]): CommandResult {
  const notes = state.notes.filter((n) => n.sprint === sprint.id);
  const actions = notes
    .map((n) => (n.task === null ? undefined : state.tasks.find((t) => t.id === n.task)))
    .filter((t) => t !== undefined)
    .map((t) => ({ label: t.label, title: t.title, status: t.status }));
  const observations = notes.filter((n) => n.task === null);

  const lines =
    notes.length === 0
      ? [`Nothing recorded for the retrospective of "${sprint.name}".`, '  kadence sprint retro "what to change"']
      : [
          `Retrospective of "${sprint.name}"`,
          ...observations.map((n) => `  · ${n.text}`),
          ...(actions.length === 0 ? [] : ['', '  Actions:', ...actions.map((a) => `    ${a.label} [${a.status}]  ${a.title}`)]),
        ];

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: lines.join('\n'),
    data: {
      schema: 'kadence/v1',
      ok: true,
      retro: {
        sprint: sprint.name,
        notes: notes.map((n) => ({ id: n.id, text: n.text, by: n.by, at: n.at })),
        actions,
      },
    },
  };
}
