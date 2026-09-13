import { renderBoard, colorsEnabled } from '../output.js';
import type { Task, ProjectState } from '../../core/projection.js';
import {
  resolveContext,
  isContext,
  loadState,
  serializeTask,
  parseFields,
  failure,
  repoRelative,
  type CommandResult,
} from './task.js';
import { append, readAll } from '../../core/store.js';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { boardHtml } from '../../export/html.js';
import { boardMarkdown, upsertBoardSection } from '../../export/markdown.js';
import { burndown } from '../../core/burndown.js';
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

/**
 * The narrow field set behind `--summary`.
 *
 * `history` and `comments` are what make a board response grow without bound:
 * they scale with how long a task has been worked on, not with how many tasks
 * there are. Probe C measured a 1000-task board at 803 KB, nearly all of it
 * those two. Everything a caller needs to see the state of the board is here.
 */
export const SUMMARY_FIELDS = [
  'id',
  'label',
  'title',
  'status',
  'type',
  'priority',
  'estimate',
  'assignee',
  'claimedBy',
  // A contested task must not read as a cleanly owned one. The contract calls
  // this a promise an agent branches on before starting work, and --summary is
  // the response large boards are steered towards.
  'contestedBy',
  'blockedBy',
  'sprint',
  'milestone',
  'due',
] as const;

export function runBoard(
  cwd: string,
  env: NodeJS.ProcessEnv,
  filters: BoardFilters,
  fieldSpec?: string,
  summary = false,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  // Validated before any work: a typo in --fields should cost nothing.
  const { fields: chosen, error: fieldError } = parseFields(fieldSpec);
  if (fieldError !== null) return fieldError;
  // An explicit --fields wins: someone naming fields has said what they want,
  // and --summary is a shorthand for one particular set.
  const fields = chosen ?? (summary ? [...SUMMARY_FIELDS] : null);

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
            '  kadence board config --statuses "..."',
        ]
      : [];

  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...orphanWarning],
    message: renderBoard(columns, colorsEnabled(env, process.stdout.isTTY === true)),
    data: {
      schema: 'kadence/v1',
      ok: true,
      columns: Object.fromEntries(
        Object.entries(columns).map(([k, v]) => [k, v.map((t) => serializeTask(t, fields, state))]),
      ),
    },
  };
}

/** Reconfigures the board columns. */
export function runBoardConfig(
  cwd: string,
  env: NodeJS.ProcessEnv,
  statuses: string | undefined,
  dod: string | undefined,
  started?: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  if (statuses === undefined && dod === undefined && started === undefined) {
    const standard =
      state.dod.length === 0
        ? 'Definition of done: not set'
        : `Definition of done: ${state.dod.join(', ')}`;
    return {
      ok: true,
      exitCode: 0,
      warnings: [...warnings, ...startedWarning(state.statuses, state.started)],
      message:
        `Board columns: ${state.statuses.join(', ')}\n` +
        `Started: ${state.started}  (cycle time and actual hours count from here)\n` +
        `${standard}\n\n` +
        'Change them with:\n' +
        '  kadence board config --statuses "todo,doing,review,done"\n' +
        '  kadence board config --started doing\n' +
        '  kadence board config --dod "tests green,docs updated"',
      data: {
        schema: 'kadence/v1',
        ok: true,
        statuses: state.statuses,
        dod: state.dod,
        started: state.started,
      },
    };
  }

  // Setting only the started boundary. Validated against the live columns: a
  // boundary nothing can reach would make every flow metric silently empty,
  // which is the exact defect this setting exists to end.
  if (statuses === undefined && dod === undefined && started !== undefined) {
    const checked = validateStarted(started, state.statuses);
    if (typeof checked !== 'string') return checked;
    const wanted = checked;
    if (wanted === state.started) {
      return {
        ok: true,
        exitCode: 0,
        warnings,
        message: `Work already counts as started at "${wanted}".`,
        data: { schema: 'kadence/v1', ok: true, started: wanted },
      };
    }
    append(ctx.root, {
      id: ulid(),
      type: 'board.configured',
      entity: ulid(),
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data: { started: wanted },
    });
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message:
        `Work counts as started at "${wanted}".\n` +
        'Cycle time, work item age and a sprint\'s actual hours are measured from this column.',
      data: { schema: 'kadence/v1', ok: true, started: wanted },
    };
  }

  // Setting only the definition of done leaves the columns alone: one event
  // type carries both, so the write must say which half it is changing.
  if (statuses === undefined) {
    let withStarted: string | undefined;
    if (started !== undefined) {
      const checked = validateStarted(started, state.statuses);
      if (typeof checked !== 'string') return checked;
      withStarted = checked;
    }
    const criteria = dod!
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    // Nothing to write when the journal already says this; every no-op event
    // is a line each future fold has to read.
    if (
      criteria.length === state.dod.length &&
      criteria.every((c, i) => c === state.dod[i])
    ) {
      return {
        ok: true,
        exitCode: 0,
        warnings,
        message:
          criteria.length === 0
            ? 'There is already no definition of done.'
            : `Definition of done is already: ${criteria.join(', ')}`,
        data: { schema: 'kadence/v1', ok: true, dod: criteria },
      };
    }

    append(ctx.root, {
      id: ulid(),
      type: 'board.configured',
      entity: ulid(),
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data: { dod: criteria, ...(withStarted === undefined ? {} : { started: withStarted }) },
    });

    return {
      ok: true,
      exitCode: 0,
      warnings,
      message:
        (criteria.length === 0
          ? 'Definition of done cleared. New tasks start with no criteria.'
          : `Definition of done: ${criteria.join(', ')}\n` +
            'New tasks start with these criteria. Tasks that already exist keep theirs.') +
        (withStarted === undefined ? '' : `\nWork counts as started at "${withStarted}".`),
      data: {
        schema: 'kadence/v1',
        ok: true,
        dod: criteria,
        ...(withStarted === undefined ? {} : { started: withStarted }),
      },
    };
  }

  const list = statuses
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter((s) => s.length > 0);

  if (list.length === 0) {
    return failure(2, 'invalid_argument', 'At least one status is required.', {
      received: statuses,
    });
  }
  if (new Set(list).size !== list.length) {
    return failure(2, 'invalid_argument', 'The same status is listed twice.', {
      received: statuses,
    });
  }
  if (!list.includes(TERMINAL_STATUS)) {
    // Velocity, burndown and sprint reports all key off `done`; without it
    // every analytic in the product silently reports zero.
    return failure(
      2,
      'invalid_argument',
      `The list must include "${TERMINAL_STATUS}" — velocity and burndown are ` +
        'computed from it.',
      { received: statuses },
    );
  }

  // Tasks sitting in a column that is about to disappear are named up front,
  // because they will keep their status and show up as orphaned afterwards.
  const stranded = state.tasks.filter(
    (t) => !list.includes(t.status) && t.status !== CANCELLED_STATUS,
  );

  // `--started` travels in the same event, checked against the list being set
  // rather than the one being replaced: `--statuses "todo,doing,done" --started
  // doing` is the natural first command on a custom board, and it used to drop
  // the flag and then warn about the value it had just been given.
  let newStarted: string | undefined;
  if (started !== undefined) {
    const checked = validateStarted(started, list);
    if (typeof checked !== 'string') return checked;
    newStarted = checked;
  }

  append(ctx.root, {
    id: ulid(),
    type: 'board.configured',
    entity: ulid(),
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: {
      statuses: list,
      ...(dod === undefined
        ? {}
        : { dod: dod.split(',').map((c) => c.trim()).filter((c) => c.length > 0) }),
      ...(newStarted === undefined ? {} : { started: newStarted }),
    },
  });

  const note =
    stranded.length > 0
      ? `\n${stranded.length} task(s) remain in removed columns: ` +
        `${[...new Set(stranded.map((t) => t.status))].join(', ')}. They are still listed.`
      : '';

  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...startedWarning(list, newStarted ?? state.started)],
    message:
      `Board columns: ${list.join(', ')}${note}` +
      (newStarted === undefined ? '' : `\nWork counts as started at "${newStarted}".`),
    data: { schema: 'kadence/v1', ok: true, statuses: list },
  };
}


/**
 * A snapshot of the board as a file — the experiment that stands in for a web UI.
 *
 * The constraint is the point: no process outlives this command, and the HTML
 * asks the network for nothing. A reader opens the file from disk, or attaches
 * it to a pull request. The kill condition — nobody opens it twice — is written
 * in docs/product/feature-adoption-2026-09.md, before this code existed.
 */
export interface ExportOptions {
  html?: boolean;
  md?: boolean;
  /** Update the section between markers in README.md instead of writing a file. */
  readme?: boolean;
  file?: string;
}

const DEFAULT_HTML = 'kadence-board.html';
const DEFAULT_MD = 'kadence-board.md';

export function runBoardExport(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: ExportOptions,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  if (options.html !== true && options.md !== true) {
    return failure(2, 'invalid_argument', 'Which format?\n  kadence board export --html\n  kadence board export --md', {
      hint: 'kadence board export --html',
    });
  }
  if (options.html === true && options.md === true) {
    return failure(2, 'invalid_argument', 'One format at a time: --html or --md.', {
      hint: 'kadence board export --html',
    });
  }
  if (options.readme === true && options.html === true) {
    // A README is markdown; embedding a whole HTML document in one would be a
    // page nobody can read in either form.
    return failure(2, 'invalid_argument', '--readme writes markdown. Use --md with it.', {
      hint: 'kadence board export --md --readme',
    });
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  if (options.md === true && options.readme === true) {
    if (options.file !== undefined) {
      return failure(2, 'invalid_argument', '--readme writes into README.md, so --file has nowhere to go.', {
        received: options.file,
        hint: 'kadence board export --md --file docs/board.md',
      });
    }
    const path = join(ctx.root, 'README.md');
    if (!existsSync(path)) {
      // Creating one would be a different command and a bigger promise. This
      // updates a file the project already keeps.
      // The argument was fine; the repository is what refuses. `received` is
      // reserved for something the caller typed, and they typed no path.
      return failure(1, 'conflicting_state', 'There is no README.md here to update.\nWrite the board to a file instead:\n  kadence board export --md', {
        hint: 'kadence board export --md',
      });
    }
    const updated = upsertBoardSection(readFileSync(path, 'utf8'), boardMarkdown(state));
    writeFileSync(path, updated, 'utf8');
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: `Board section updated in ${path}.\nIt is a snapshot: rerun this after the board changes.`,
      // The same keys as the file response: an agent must not see a field
      // appear and disappear between two calls to the same command.
      data: {
        schema: 'kadence/v1',
        ok: true,
        format: 'md',
        path,
        section: true,
        bytes: Buffer.byteLength(updated),
      },
    };
  }

  const chosen = options.file ?? (options.html === true ? DEFAULT_HTML : DEFAULT_MD);
  const resolved = repoRelative(ctx.root, chosen, 'kadence board export --html --file docs/board.html');
  if ('exitCode' in resolved) return resolved;
  const path = resolved.full;

  const content =
    options.html === true
      ? boardHtml(state, activeBurndown(ctx.root, state))
      : boardMarkdown(state);

  // git does not version empty directories, so the parent may not be there.
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, content, 'utf8');
  } catch (err) {
    // A directory at the target throws EISDIR out of the command, past the
    // JSON contract, and the caller gets a libuv message on stderr with no
    // response at all.
    return failure(
      1,
      'conflicting_state',
      `Could not write ${path}: ${(err as NodeJS.ErrnoException).code ?? 'unknown error'}.`,
      { received: resolved.rel, hint: 'kadence board export --html --file docs/board.html' },
    );
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message:
      `Wrote ${path}.\n` +
      (options.html === true
        ? 'Open it from disk — there is no server, and the page makes no requests.'
        : 'A snapshot for a README or a pull request.'),
    data: {
      schema: 'kadence/v1',
      ok: true,
      format: options.html === true ? 'html' : 'md',
      path,
      section: false,
      bytes: Buffer.byteLength(content),
    },
  };
}

/** The chart for the active sprint, or null when there is nothing to draw. */
function activeBurndown(root: string, state: ProjectState) {
  const sprint = state.sprints.find((s) => s.status === 'active');
  if (sprint === undefined) return null;
  return burndown(state, readAll(root).events, sprint);
}

/**
 * Said out loud, never silently: a started boundary that is no longer a column
 * turns every flow metric into an empty answer about the default.
 */
function startedWarning(columns: readonly string[], started: string): string[] {
  if (columns.includes(started)) return [];
  return [
    `Work is set to start at "${started}", which is not one of the columns any more. ` +
      'Cycle time and actual hours will be empty until it is:\n' +
      `  kadence board config --started ${columns[1] ?? columns[0] ?? 'doing'}`,
  ];
}

/**
 * A started boundary that can actually be measured from, or a refusal.
 *
 * Not `done` and not `cancelled`: every cycle time would be zero or empty, and
 * a number that is always zero is worse than one that is missing.
 */
function validateStarted(input: string, columns: readonly string[]): string | CommandResult {
  const wanted = input.trim().toLowerCase().replace(/\s+/g, '_');
  if (wanted === TERMINAL_STATUS || wanted === CANCELLED_STATUS) {
    return failure(
      2,
      'invalid_argument',
      `Work cannot start at "${wanted}" — that is where it ends. Cycle time would always be zero.`,
      { received: input, allowed: columns.filter((c) => c !== TERMINAL_STATUS && c !== CANCELLED_STATUS) },
    );
  }
  if (!columns.includes(wanted)) {
    return failure(
      2,
      'unknown_status',
      `"${input}" is not one of this board's columns.\nAvailable: ${columns.join(', ')}`,
      { received: input, allowed: columns, hint: 'kadence board config --json' },
    );
  }
  return wanted;
}
