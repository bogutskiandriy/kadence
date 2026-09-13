import {
  resolveContext,
  isContext,
  loadState,
  type CommandResult,
} from './task.js';
import { readyTasks, describeNothingReady } from '../../core/query.js';
import { colorsEnabled, boardLine } from '../output.js';
import type { Task } from '../../core/projection.js';

/**
 * What can be started right now.
 *
 * The question an agent asks at the top of every session, and until now it had
 * to answer by folding `board --json` itself — the whole board to learn which
 * four tasks are free. This returns those four.
 */

export interface ReadyOptions {
  json?: boolean;
  assignee?: string;
  limit?: number;
}

/**
 * Deliberately narrow: seven fields, because this goes into an agent's context.
 *
 * The seventh was added on 2026-09-11 and had to argue for its place. A team
 * marks blast radius with a label — `impact-critical` and the rest — and then
 * decides from it how carefully an agent should work. The one caller that could
 * not see that was the agent asking what to start. Always present, empty when
 * the task has none: a promised field an agent must test for absence is not a
 * promise.
 */
function serializeReady(task: Task): Record<string, unknown> {
  return {
    label: task.label,
    title: task.title,
    priority: task.priority,
    estimate: task.estimate,
    labels: task.labels,
    claimedBy: task.claimedBy,
    // A contested task stays in this list because a person must look at it —
    // and an agent cannot tell one from a task it may take without this.
    contestedBy: task.contestedBy,
  };
}

export function runReady(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: ReadyOptions,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  // The board's own column order and started boundary: a team that renamed
  // its columns gets a `ready` that means what its board means.
  const board = { statuses: state.statuses, started: state.started };
  const found = readyTasks(state.tasks, {
    viewer: ctx.actor,
    ...board,
    ...(options.assignee === undefined ? {} : { assignee: options.assignee }),
  });
  const limited = options.limit !== undefined && options.limit > 0 ? found.slice(0, options.limit) : found;

  if (limited.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      // An empty list is the same output whether the board is empty, blocked
      // or somebody else's. Those are three different next steps.
      message: describeNothingReady(state.tasks, ctx.actor, options.assignee, board),
      data: { schema: 'kadence/v1', ok: true, tasks: [] },
    };
  }

  const colors = colorsEnabled(env, process.stdout.isTTY === true);
  const lines = limited.map((task) => {
    const contested = task.contestedBy.length > 0 ? ` [contested: ${task.contestedBy.join(', ')}]` : '';
    return `${boardLine(task, colors)}${contested}`;
  });

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: [...lines, '', `Take the first one:\n  kadence task claim ${limited[0]!.label}`].join('\n'),
    data: { schema: 'kadence/v1', ok: true, tasks: limited.map(serializeReady) },
  };
}
