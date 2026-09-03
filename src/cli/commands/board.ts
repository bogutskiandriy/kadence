import { renderBoard, colorsEnabled } from '../output.js';
import type { Task } from '../../core/projection.js';
import { resolveContext, isContext, loadState, serializeTask, type CommandResult } from './task.js';
import { append } from '../../core/store.js';
import { ulid } from '../../core/ulid.js';
import { TERMINAL_STATUS, CANCELLED_STATUS } from '../../core/projection.js';

/**
 * Kanban board in the terminal.
 *
 * State comes from the folded journal, so the board can never drift from
 * reality: there is nothing to "forget to update".
 */

/** `cancelled` never gets a column — it is a decision, not a stage of work. */
const HIDDEN_FROM_BOARD = 'cancelled';

export interface BoardFilters {
  assignee?: string;
  sprint?: 'active' | 'all';
}

export function runBoard(
  cwd: string,
  env: NodeJS.ProcessEnv,
  filters: BoardFilters,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  let tasks = state.tasks.filter((t) => t.status !== HIDDEN_FROM_BOARD);

  if (filters.assignee !== undefined) {
    const who = filters.assignee.toLowerCase();
    // `me` saves typing your own address every single time.
    const needle = who === 'me' ? ctx.actor.toLowerCase() : who;
    tasks = tasks.filter((t) => (t.assignee ?? '').toLowerCase() === needle);
  }

  if (filters.sprint === 'active') {
    const active = state.sprints.find((s) => s.status === 'active' || s.status === 'planned');
    tasks = active === undefined ? [] : tasks.filter((t) => t.sprint === active.id);
  }

  const columns: Record<string, Task[]> = {};
  for (const column of state.statuses) {
    if (column === HIDDEN_FROM_BOARD) continue;
    columns[column] = tasks.filter((t) => t.status === column);
  }

  // A task can sit in a column another branch removed. Hiding it would lose
  // work silently, so it gets its own column and a warning.
  const orphaned = state.orphanStatuses.filter((st) => st !== HIDDEN_FROM_BOARD);
  for (const column of orphaned) {
    columns[column] = tasks.filter((t) => t.status === column);
  }

  const orphanWarning =
    orphaned.length > 0
      ? [
          `Statuses not in the board configuration: ${orphaned.join(', ')}.\n` +
            'Tasks there are still shown. Add the column or move them:\n' +
            '  flowit board config --statuses "..."',
        ]
      : [];

  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...orphanWarning],
    message: renderBoard(columns, colorsEnabled(env, process.stdout.isTTY === true)),
    data: {
      schema: 'flowit/v1',
      ok: true,
      columns: Object.fromEntries(
        Object.entries(columns).map(([k, v]) => [k, v.map(serializeTask)]),
      ),
    },
  };
}

/** Reconfigures the board columns. */
export function runBoardConfig(
  cwd: string,
  env: NodeJS.ProcessEnv,
  statuses: string | undefined,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  if (statuses === undefined) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message:
        `Board columns: ${state.statuses.join(', ')}\n\n` +
        'Change them with:\n  flowit board config --statuses "todo,doing,review,done"',
      data: { schema: 'flowit/v1', ok: true, statuses: state.statuses },
    };
  }

  const list = statuses
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter((s) => s.length > 0);

  if (list.length === 0) {
    return { ok: false, exitCode: 2, message: 'At least one status is required.' };
  }
  if (new Set(list).size !== list.length) {
    return { ok: false, exitCode: 2, message: 'The same status is listed twice.' };
  }
  if (!list.includes(TERMINAL_STATUS)) {
    // Velocity, burndown and sprint reports all key off `done`; without it
    // every analytic in the product silently reports zero.
    return {
      ok: false,
      exitCode: 2,
      message:
        `The list must include "${TERMINAL_STATUS}" — velocity and burndown are ` +
        'computed from it.',
    };
  }

  // Tasks sitting in a column that is about to disappear are named up front,
  // because they will keep their status and show up as orphaned afterwards.
  const stranded = state.tasks.filter(
    (t) => !list.includes(t.status) && t.status !== CANCELLED_STATUS,
  );

  append(ctx.root, {
    id: ulid(),
    type: 'board.configured',
    entity: ulid(),
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { statuses: list },
  });

  const note =
    stranded.length > 0
      ? `\n${stranded.length} task(s) remain in removed columns: ` +
        `${[...new Set(stranded.map((t) => t.status))].join(', ')}. They are still listed.`
      : '';

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `Board columns: ${list.join(', ')}${note}`,
    data: { schema: 'flowit/v1', ok: true, statuses: list },
  };
}
