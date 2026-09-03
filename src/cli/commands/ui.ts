import { resolveContext, isContext, loadState, type CommandResult } from './task.js';
import {
  runTaskMove,
  runTaskAssign,
  runTaskAdd,
  runTaskDelete,
} from './task.js';
import { editText, canUseEditor } from '../editor.js';
import { runTaskEdit } from './task.js';

/**
 * The interactive board.
 *
 * blessed is imported dynamically and nowhere else: a `flowit task add` must
 * not pay the ~28 ms it costs to load. The 200 ms guardrail applies to
 * commands people run dozens of times a day; an interactive session is started
 * once and lives for minutes, so the cost lands where it is invisible.
 */
export async function runUi(cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult> {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  if (process.stdout.isTTY !== true) {
    return {
      ok: false,
      exitCode: 1,
      message:
        'The interactive board needs a terminal.\n' +
        'For pipes and scripts use:\n  flowit board --json',
    };
  }

  let board: typeof import('../../tui/board.js');
  try {
    board = await import('../../tui/board.js');
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      message:
        `The interactive board could not start: ${(err as Error).message}\n` +
        'The plain board always works:\n  flowit board',
    };
  }

  board.runBoardUi({
    reload: () => loadState(ctx.root, ctx.actor),

    // Each action goes through the same command the CLI uses, so the board can
    // never drift from the terminal in what a move or an assignment means.
    move: (taskId, status) => messageOf(runTaskMove(cwd, env, taskId, status)),
    assign: (taskId, who) => messageOf(runTaskAssign(cwd, env, taskId, who)),
    create: (title) => messageOf(runTaskAdd(cwd, env, title, {})),
    remove: (taskId) => messageOf(runTaskDelete(cwd, env, taskId)),

    edit: (taskId) => {
      if (!canUseEditor(env, true)) return 'No editor available.';

      const { state } = loadState(ctx.root, ctx.actor);
      const task = state.tasks.find((t) => t.id === taskId);
      if (task === undefined) return 'Task not found.';

      const r = editText(env, task.description ?? '', `Editing the description of ${task.label}.`);
      if (r.error !== null) return r.error;
      if (r.text === null) return 'Aborted — nothing changed.';

      return messageOf(runTaskEdit(cwd, env, taskId, { description: r.text }));
    },
  });

  // blessed owns the process from here; it exits on `q`.
  return { ok: true, exitCode: 0, message: '' };
}

/** First line only — the board has one status row, not a scrollback. */
function messageOf(result: CommandResult): string {
  return result.message.split('\n')[0] ?? '';
}
