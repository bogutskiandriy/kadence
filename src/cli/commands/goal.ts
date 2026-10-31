import { ulid } from '../../core/ulid.js';
import { append } from '../../core/store.js';
import type { ProductGoal, ProjectState } from '../../core/projection.js';
import { resolveContext, isContext, loadState, failure, type CommandResult, type Context } from './task.js';

/**
 * The Product Goal — the commitment the Product Backlog is held to.
 *
 * Scrum Guide 2020: the long-term objective for the Scrum Team, and one at a
 * time — fulfilled or abandoned before the next is taken on. A milestone does
 * not stand in for it: a milestone is a group of tasks with a date, a goal is
 * the reason the tasks exist.
 */

export type GoalOutcome = 'achieved' | 'abandoned';

export interface GoalShowOptions {
  /** Every goal, closed and replaced ones too. */
  all?: boolean;
}

/** The one open goal, or undefined. Two can be open only across an unmerged pair of branches. */
export function currentGoal(state: ProjectState): ProductGoal | undefined {
  return state.goals.find((g) => g.status === 'open');
}

function write(ctx: Context, type: 'goal.set' | 'goal.closed', entity: string, data: Record<string, unknown>): void {
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

function serializeGoal(g: ProductGoal): Record<string, unknown> {
  return { id: g.id, label: g.label, text: g.text, status: g.status, setAt: g.setAt, by: g.by };
}

export function runGoalSet(cwd: string, env: NodeJS.ProcessEnv, text: string): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const trimmed = String(text).trim();
  if (trimmed.length === 0) {
    return failure(2, 'invalid_argument', 'A Product Goal needs words.', {
      hint: 'kadence goal set "Teams plan their sprints from the repository"',
    });
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const open = currentGoal(state);
  if (open !== undefined) {
    return failure(
      1,
      'conflicting_state',
      `${open.label} is still the Product Goal: ${open.text}\n` +
        'One at a time — close it first:\n  kadence goal done\n  kadence goal abandon',
      { received: trimmed, hint: 'kadence goal --json' },
    );
  }

  const id = ulid();
  write(ctx, 'goal.set', id, { text: trimmed });
  const label = `PG-${state.goals.length + 1}`;

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `${label} Product Goal: ${trimmed}`,
    data: { schema: 'kadence/v1', ok: true, goal: { id, label, text: trimmed, status: 'open' } },
  };
}

export function runGoalShow(cwd: string, env: NodeJS.ProcessEnv, options: GoalShowOptions): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const open = currentGoal(state);

  if (options.all === true) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message:
        state.goals.length === 0
          ? 'No Product Goal yet.\n  kadence goal set "…"'
          : state.goals.map((g) => `${g.label} [${g.status}]  ${g.text}`).join('\n'),
      data: { schema: 'kadence/v1', ok: true, goal: open === undefined ? null : serializeGoal(open), goals: state.goals.map(serializeGoal) },
    };
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message:
      open === undefined
        ? 'No Product Goal in force.\n  kadence goal set "…"'
        : `${open.label} Product Goal: ${open.text}\n  set ${open.setAt.slice(0, 10)} by ${open.by}`,
    data: { schema: 'kadence/v1', ok: true, goal: open === undefined ? null : serializeGoal(open) },
  };
}

export function runGoalClose(cwd: string, env: NodeJS.ProcessEnv, outcome: GoalOutcome): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const open = currentGoal(state);
  if (open === undefined) {
    return failure(1, 'conflicting_state', 'No Product Goal in force.\n  kadence goal set "…"', {
      hint: 'kadence goal --all --json',
    });
  }

  write(ctx, 'goal.closed', open.id, { outcome });

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `${open.label} ${outcome}: ${open.text}\nThe next one:\n  kadence goal set "…"`,
    data: { schema: 'kadence/v1', ok: true, goal: { ...serializeGoal(open), status: outcome } },
  };
}
