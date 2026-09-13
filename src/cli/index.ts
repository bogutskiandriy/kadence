import cac from 'cac';
import { runInit } from './commands/init.js';
import { runReady } from './commands/ready.js';
import { runPrime } from './commands/prime.js';
import { runStats } from './commands/stats.js';
import { runCompact } from './commands/compact.js';
import { runReport, REPORTS } from './commands/report.js';
import { runCompletion, SHELLS } from './commands/completion.js';
import { runNoteAdd, runNoteList } from './commands/note.js';
import {
  runMilestoneCreate,
  runMilestoneAdd,
  runMilestoneClose,
  runMilestoneList,
} from './commands/milestone.js';
import {
  runTaskAdd,
  runTaskList,
  runTaskMove,
  runTaskAssign,
  runTaskShow,
  runTaskEdit,
  runTaskCancel,
  runTaskDelete,
  runTaskComment,
  runTaskParent,
  runTaskBlock,
  runTaskLog,
  runTaskDoc,
  TASK_STATUSES,
  failure,
  type CommandResult,
  runTaskClaim,
  runTaskCriterionAdd,
  runTaskCriterionCheck,
  runTaskCriterionList,
  runTaskRelease,
} from './commands/task.js';
import { buildContract } from '../agent/contract.js';
import { runDecisionAdd, runDecisionList, runDecisionShow } from './commands/decision.js';
import { writeSync } from 'node:fs';
import { editText, canUseEditor } from './editor.js';
import { runBoard, runBoardConfig, runBoardExport } from './commands/board.js';
import {
  runSprintCreate,
  runSprintAdd,
  runSprintClose,
  runSprintStatus,
  runSprintStart,
  runSprintList,
  runSprintEdit,
  runSprintBurndown,
} from './commands/sprint.js';
import {
  runTemplateSave,
  runTemplateList,
  runTemplateDelete,
  findTemplate,
} from './commands/template.js';
import { TASK_TYPES, PRIORITIES } from '../core/projection.js';
import { SORT_KEYS } from '../core/query.js';

/**
 * Writes to a file descriptor and does not return until the bytes are gone.
 *
 * `process.stdout.write` is asynchronous when stdout is a pipe — which is how
 * every agent reads us — and `process.exit()` does not wait for it. Anything
 * past the pipe buffer was silently truncated mid-JSON; a file, being a
 * synchronous write, looked fine. Found by Probe C, not by the suite.
 */
function writeAll(fd: number, text: string): void {
  const buffer = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < buffer.length) {
    try {
      offset += writeSync(fd, buffer, offset, buffer.length - offset);
    } catch (err) {
      // A non-blocking pipe refuses the write while its buffer is full; the
      // reader drains it a moment later. Everything else is a real failure.
      if ((err as NodeJS.ErrnoException).code !== 'EAGAIN') throw err;
    }
  }
}

/**
 * Entry point.
 *
 * Commands are declared as `task <action>` rather than `task add`: cac does not
 * match multi-word names — it lists them in the help output, but no action ever
 * fires. Verified empirically; ADR-004 anticipated a risk with cac, just a
 * different one (the project going stale), so this is an amendment to it.
 */
/** Injected at build time from package.json — see scripts/build.mjs. */
declare const __VERSION__: string;

const cli = cac('kadence');

/**
 * In --json mode stdout carries ONLY JSON: an agent handed a mixed stream
 * cannot parse it. Everything human goes to stderr.
 */
function emit(result: CommandResult, json: boolean): never {
  for (const w of result.warnings ?? []) writeAll(2, `${w}\n`);

  if (json) {
    // A structured error when the command supplied one, the sentence otherwise:
    // an agent branches on `error.code`, and nothing existing loses `message`.
    const payload = result.data ?? {
      schema: 'kadence/v1',
      ok: result.ok,
      ...(result.ok ? {} : { error: result.error ?? { message: result.message } }),
    };
    writeAll(1, `${JSON.stringify(payload)}\n`);
  } else {
    writeAll(result.ok ? 1 : 2, `${result.message}\n`);
  }
  process.exit(result.exitCode);
}

/**
 * Text taken from a flag, or from $EDITOR when the flag is absent.
 *
 * A multi-line description does not fit on a command line, so the editor is
 * the primary path and the flag is the shortcut for one-liners and scripts.
 */
function textFromFlagOrEditor(
  flag: string | undefined,
  current: string,
  hint: string,
  json: boolean,
): string | undefined {
  if (flag !== undefined) return flag;
  if (!canUseEditor(process.env, process.stdout.isTTY === true)) {
    emit(
      usage(
        'No terminal available for an editor.\n' +
          'Pass the text directly:\n  --description "..."',
      ),
      json,
    );
  }
  const r = editText(process.env, current, hint);
  if (r.error !== null) emit({ ok: false, exitCode: 1, message: r.error }, json);
  if (r.text === null) emit({ ok: true, exitCode: 0, message: 'Aborted — nothing changed.' }, json);
  return r.text;
}

/**
 * The value of a flag as it was typed, before cac converted it.
 *
 * cac hands `--milestone 1.0` back as the number 1, which is a different
 * milestone name than the one the person wrote — and by then the digits are
 * gone. A name is a string, so it is read from argv rather than recovered.
 */
function rawFlag(name: string, argv: readonly string[] = process.argv): string | undefined {
  const flag = `--${name}`;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === flag) return argv[i + 1];
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return undefined;
}

/**
 * The actions each command takes, named once so a mistyped one can be answered
 * with the list instead of a sentence.
 */
const TASK_ACTIONS = [
  'add', 'list', 'show', 'edit', 'move', 'assign', 'comment', 'log',
  'parent', 'block', 'unblock', 'claim', 'release', 'ac', 'cancel', 'delete',
] as const;
const SPRINT_ACTIONS = [
  'create', 'add', 'edit', 'start', 'close', 'status', 'list', 'burndown',
] as const;
const TEMPLATE_ACTIONS = ['save', 'list', 'delete'] as const;
const MILESTONE_ACTIONS = ['create', 'add', 'list', 'close'] as const;

/**
 * Usage errors all look the same, so they are built in one place — including
 * the code. An agent that mistypes an action gets `invalid_argument` and, where
 * the set is knowable, the actions that do exist (ADR-009).
 */
function usage(message: string, detail: { received?: string; allowed?: readonly string[] } = {}): CommandResult {
  return failure(2, 'invalid_argument', message, detail);
}

/**
 * The human answer to `kadence schema`.
 *
 * A person asking this wants to know what an agent will be told, not to read the
 * JSON — so it summarises rather than pretty-prints.
 */
function renderContractSummary(contract: Record<string, unknown>): string {
  const commands = contract['commands'] as { name: string }[];
  const errors = contract['errors'] as { code: string }[];
  return (
    `kadence/v1 — ${commands.length} commands, ${errors.length} error codes.\n` +
    `${contract['stability'] as string}\n\n` +
    'The machine-readable form is what agents read:\n  kadence schema --json'
  );
}

cli
  .command('milestone [action] [arg]', 'Milestones: create | add | list | close — grouping by outcome')
  .option('--due <date>', 'Target date, YYYY-MM-DD')
  .option('--milestone <ref>', 'Which milestone, by MS-N or name')
  .option('--all', 'Include closed milestones, hidden by default')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence milestone create "1.0" --due 2026-12-01')
  .example('  kadence milestone add KAD-1 --milestone 1.0')
  .example('  kadence milestone list --json')
  .example('  kadence milestone close 1.0')
  .action(
    (
      action: string | undefined,
      arg: string | undefined,
      // cac hands back a number when the value looks like one, so these are
      // widened here rather than lied about in the type.
      options: { due?: string | number; milestone?: string | number; all?: boolean; json?: boolean },
    ) => {
      const json = options.json === true;
      const cwd = process.cwd();

      switch (action) {
        case 'create':
          if (arg === undefined) {
            emit(usage('A milestone needs a name:\n  kadence milestone create "1.0"'), json);
          }
          emit(
            runMilestoneCreate(
              cwd,
              process.env,
              arg,
              options.due === undefined ? {} : { due: rawFlag('due') ?? String(options.due) },
            ),
            json,
          );
          break;
        case 'add':
          if (arg === undefined || options.milestone === undefined) {
            emit(
              usage('A task and a milestone are required:\n  kadence milestone add KAD-1 --milestone 1.0'),
              json,
            );
          }
          emit(
            runMilestoneAdd(cwd, process.env, arg, rawFlag('milestone') ?? String(options.milestone)),
            json,
          );
          break;
        case 'close':
          if (arg === undefined) {
            emit(usage('Which milestone?\n  kadence milestone close 1.0'), json);
          }
          emit(runMilestoneClose(cwd, process.env, arg), json);
          break;
        case 'list':
        case undefined:
          emit(runMilestoneList(cwd, process.env, { ...(options.all === true ? { all: true } : {}), json }), json);
          break;
        default:
          emit(
            usage(`Unknown milestone action "${action}".`, {
              received: action,
              allowed: MILESTONE_ACTIONS,
            }),
            json,
          );
      }
    },
  );

cli
  .command('note [text]', 'Record something learned; `note list` reads them back')
  .option('--task <ref>', 'The task it came out of')
  .option('--limit <n>', 'At most this many, newest first')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence note "Tests need a git identity"')
  .example('  kadence note "The redirect drops the cookie" --task KAD-1')
  .example('  kadence note list --limit 5')
  .action((text: string | undefined, options: { task?: string; limit?: string; json?: boolean }) => {
    const json = options.json === true;
    const cwd = process.cwd();
    const limit = options.limit === undefined ? undefined : Number(options.limit);
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
      emit(usage(`--limit must be a positive number, got "${options.limit}".`), json);
    }

    // `note list` reads, anything else is the note's text. One word cannot be
    // both, and `list` is the one people type by reflex.
    if (text === 'list') {
      emit(
        runNoteList(cwd, process.env, {
          ...(options.task === undefined ? {} : { task: options.task }),
          ...(limit === undefined ? {} : { limit }),
          json,
        }),
        json,
      );
      return;
    }
    if (text === undefined) {
      emit(
        usage(
          'A note needs text:\n  kadence note "Tests need a git identity"\n  kadence note list',
        ),
        json,
      );
    }
    emit(
      runNoteAdd(cwd, process.env, text, options.task === undefined ? {} : { task: options.task }),
      json,
    );
  });

cli
  .command('decision [action] [arg]', 'Decisions: add | list | show — the why behind the work')
  .option('--why <text>', 'Why this was chosen. Required — without it this is a changelog line')
  .option('--rejected <text>', 'The alternative that was turned down')
  .option('--task <ref>', 'The task this decision came out of')
  .option('--supersedes <ref>', 'The decision this one replaces')
  .option('--doc <path>', 'A document that carries the detail; repeat for several')
  .option('--all', 'Include superseded decisions, hidden by default')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence decision add "Use ULIDs" --why "Clocks disagree between machines"')
  .example('  kadence decision add "Use Avro" --why "..." --supersedes DEC-1')
  .example('  kadence decision list --json')
  .action(
    (
      action: string | undefined,
      arg: string | undefined,
      options: {
        why?: string;
        rejected?: string;
        task?: string;
        supersedes?: string;
        doc?: string | string[];
        all?: boolean;
        json?: boolean;
      },
    ) => {
      const json = options.json === true;
      const cwd = process.cwd();
      // cac hands a single flag back as a string and repeats as an array.
      const docs =
        options.doc === undefined
          ? undefined
          : Array.isArray(options.doc)
            ? options.doc
            : [options.doc];

      switch (action) {
        case 'add':
          if (arg === undefined) {
            emit(usage('A title is required:\n  kadence decision add "Use ULIDs" --why "..."'), json);
          }
          emit(
            runDecisionAdd(cwd, process.env, arg as string, {
              ...(options.why !== undefined ? { why: options.why } : {}),
              ...(options.rejected !== undefined ? { rejected: options.rejected } : {}),
              ...(options.task !== undefined ? { task: options.task } : {}),
              ...(options.supersedes !== undefined ? { supersedes: options.supersedes } : {}),
              ...(docs !== undefined ? { docs } : {}),
            }),
            json,
          );
          break;
        case undefined:
        case 'list':
          emit(
            runDecisionList(cwd, process.env, {
              ...(options.all === true ? { all: true } : {}),
              ...(options.task !== undefined ? { task: options.task } : {}),
            }),
            json,
          );
          break;
        case 'show':
          if (arg === undefined) {
            emit(usage('Which decision?\n  kadence decision show DEC-1'), json);
          }
          emit(runDecisionShow(cwd, process.env, arg as string), json);
          break;
        default:
          emit(
            usage(`Unknown action "${action}".\nAvailable: add, list, show`),
            json,
          );
      }
    },
  );

cli
  .command('schema', 'The machine-readable --json contract, for agents')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence schema --json')
  .action((options: { json?: boolean }) => {
    const json = options.json === true;
    // No resolveContext: the contract describes the tool, not a project, and an
    // agent asks what kadence can do before it has a repository to ask about.
    const contract = buildContract(__VERSION__);
    emit(
      {
        ok: true,
        exitCode: 0,
        message: renderContractSummary(contract),
        data: { schema: 'kadence/v1', ok: true, contract },
      },
      json,
    );
  });

cli
  .command('prime', 'Everything a session needs before it starts. Short by design')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence prime')
  .example('  kadence prime --json')
  .action((options: { json?: boolean }) => {
    emit(runPrime(process.cwd(), process.env, { json: options.json === true }), options.json === true);
  });

cli
  .command('ready', 'What can be started right now: open, unblocked, unclaimed')
  .option('-a, --assignee <who>', 'Only this person; "me" for yourself')
  .option('--limit <n>', 'At most this many tasks')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence ready')
  .example('  kadence ready --assignee me --json')
  .action((options: { assignee?: string; limit?: string; json?: boolean }) => {
    const limit = options.limit === undefined ? undefined : Number(options.limit);
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
      emit(usage(`--limit must be a positive number, got "${options.limit}".`), options.json === true);
    }
    emit(
      runReady(process.cwd(), process.env, {
        ...(options.assignee === undefined ? {} : { assignee: options.assignee }),
        ...(limit === undefined ? {} : { limit }),
        json: options.json === true,
      }),
      options.json === true,
    );
  });

cli
  .command('stats', 'Where the project stands: counts, blockers, contested claims, velocity')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence stats')
  .action((options: { json?: boolean }) => {
    emit(runStats(process.cwd(), process.env, { json: options.json === true }), options.json === true);
  });

cli
  .command('report [name]', `Reports folded from the journal: ${REPORTS.join(' | ')}`)
  .option('--since <days>', 'Window ending today, in calendar days (default 30d)')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence report flow                 cycle time, throughput, aging work')
  .example('  kadence report flow --since 90d')
  .example('  kadence report cfd                  tasks per column, per day')
  .example('  kadence report attention            work in flight that nobody is moving')
  .action((name: string | undefined, options: { since?: string | number; json?: boolean }) => {
    emit(
      runReport(process.cwd(), process.env, name, {
        // Read from argv, not from cac: it coerces before we see it, so `007`
        // arrives as 7 and `1e2` as 100 — neither is what was typed.
        ...(options.since === undefined ? {} : { since: rawFlag('since') ?? String(options.since) }),
        json: options.json === true,
      }),
      options.json === true,
    );
  });

cli
  .command('compact', 'Fold old months into one file each; cold start on a long journal drops from ~200 ms to ~20 ms')
  .option('--keep-months <n>', 'Months to keep as separate files, counting this one (default 2)')
  .option('--dry-run', 'Say what would be archived and write nothing')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence compact --dry-run')
  .example('  kadence compact --keep-months 3')
  .action((options: { keepMonths?: string | number; dryRun?: boolean; json?: boolean }) => {
    const rawKeep = rawFlag('keep-months');
    const keep = options.keepMonths === undefined ? undefined : Number(rawKeep ?? options.keepMonths);
    emit(
      runCompact(process.cwd(), process.env, {
        ...(keep === undefined ? {} : { keepMonths: keep, keepMonthsRaw: rawKeep ?? String(options.keepMonths) }),
        ...(options.dryRun === true ? { dryRun: true } : {}),
        json: options.json === true,
      }),
      options.json === true,
    );
  });

cli
  .command('completion [action]', 'Shell completion; "install" writes it where your shell looks')
  .option('--shell <name>', `Shell: ${SHELLS.join(' | ')}; detected from $SHELL by default`)
  .option('--force', 'Overwrite a completion file kadence did not write')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence completion            print the script')
  .example('  kadence completion install --shell zsh')
  .action((action: string | undefined, options: { shell?: string; force?: boolean; json?: boolean }) => {
    const json = options.json === true;
    if (action !== undefined && action !== 'install') {
      emit(
        usage(`Unknown completion action "${action}".`, { received: action, allowed: ['install'] }),
        json,
      );
    }
    emit(
      runCompletion(process.env, {
        ...(options.shell === undefined ? {} : { shell: options.shell }),
        ...(action === 'install' ? { install: true } : {}),
        ...(options.force === true ? { force: true } : {}),
        // Without a terminal the script is piped somewhere, and a status line
        // in the middle of it would break whatever is reading.
        isTty: process.stdout.isTTY === true,
      }),
      json,
    );
  });

cli
  .command('init', 'Set up kadence in this repository')
  .option('--hooks', 'Also add a SessionStart hook running `kadence prime` to .claude/settings.json')
  .example('  kadence init')
  .example('  kadence init --hooks')
  .action((options: { hooks?: boolean }) => {
    // `.claude/settings.json` is the user's file and is committed to their
    // repository, so it is only ever touched when the flag asks for it.
    const r = runInit(process.cwd(), __VERSION__, { hooks: options.hooks === true });
    emit({ ok: r.ok, message: r.message, exitCode: r.ok ? 0 : 1 }, false);
  });

cli
  .command('task [action] [arg] [value] [extra]', 'Tasks: add | list | show | move | assign | ac | doc')
  .option('--title <text>', 'New title (for edit)')
  .option('-d, --description <text>', 'Full description; use quotes for multiple lines')
  .option('--type <type>', `Type: ${TASK_TYPES.join(' | ')}`)
  .option('--priority <level>', `Priority: ${PRIORITIES.join(' | ')}`)
  .option('-a, --assignee <who>', 'Assignee, e.g. dev@example.com')
  .option('--label <name>', 'Label; repeat the flag for several. On edit, the set becomes exactly this')
  .option('--add-label <name>', 'Add one label, leaving the rest; repeat for several')
  .option('--remove-label <name>', 'Remove one label, leaving the rest; repeat for several')
  .option('--estimate <points>', 'Estimate in points, a positive number')
  .option('--due <date>', 'Due date, YYYY-MM-DD; empty string clears it')
  .option('--status <status>', `Filter by status: ${TASK_STATUSES.join(' | ')}`)
  .option('--search <text>', 'Search title, description and comments')
  .option('--overdue', 'Only tasks past their due date')
  .option('--due-before <date>', 'Only tasks due before YYYY-MM-DD')
  .option('--sort <key>', `Sort by: ${SORT_KEYS.join(' | ')}`)
  .option('--tree', 'Show parent/child structure')
  .option('--branch', 'Only the work this branch introduced')
  .option('--base <name>', 'What --branch compares against; main by default')
  .option('--parent <task>', 'Parent task, e.g. KAD-1 (use "none" to detach)')
  .option('--template <name>', 'Pre-fill fields from a saved template')
  .option('--no-dod', 'Skip the board\'s definition of done for this task')
  .option('--fields <list>', 'JSON only: comma-separated task fields to return')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence task add "Fix login" -d "Broken since 2.3" --type bug --priority high --estimate 3')
  .example('  kadence task list --status in_progress --sort priority')
  .example('  kadence task list --search cookie --overdue')
  .example('  kadence task list --assignee me --label auth')
  .example('  kadence task list --tree')
  .example('  kadence task list --branch            what this branch is about')
  .example('  kadence task list --branch --base release/1.0')
  .example('  kadence task list --json --fields id,label,status')
  .example('  kadence task move KAD-1,KAD-2,KAD-3 done     bulk: all or nothing')
  .example('  kadence task add "Login form" --parent KAD-1   KAD-1 can be an epic')
  .example('  kadence task claim                            take the top of `kadence ready`')
  .example('  kadence task claim KAD-1')
  .example('  kadence task release KAD-1')
  .example('  kadence task ac add KAD-1 "tests green"')
  .example('  kadence task ac check KAD-1 1')
  .example('  kadence task ac list KAD-1')
  .example('  kadence task doc add KAD-1 docs/design.md   create it and link it')
  .example('  kadence task parent KAD-2 KAD-1')
  .example('  kadence task block KAD-2 KAD-1               KAD-2 waits for KAD-1')
  .example('  kadence task unblock KAD-2 KAD-1')
  .example('  kadence task log KAD-1 2h                     also 90m, or -30m to correct')
  .example('  kadence task add "Crash on save" --template bug')
  .example('  kadence task show KAD-1')
  .example('  kadence task move KAD-1 done')
  .example('  kadence task edit KAD-1 --priority urgent --due 2026-09-30')
  .example('  kadence task edit KAD-1                      opens $EDITOR for the description')
  .example('  kadence task comment KAD-1 "Needs review"')
  .example('  kadence task assign KAD-1 dev@example.com     (use "none" to unassign)')
  .example('  kadence task cancel KAD-1                    keeps it in history')
  .example('  kadence task delete KAD-1                    drops it from the board')
  .action(
    (
      action: string | undefined,
      arg: string | undefined,
      value: string | undefined,
      extra: string | undefined,
      options: {
        title?: string;
        description?: string;
        fields?: string;
        type?: string;
        priority?: string;
        assignee?: string;
        label?: string | string[];
        addLabel?: string | string[];
        removeLabel?: string | string[];
        estimate?: string;
        due?: string;
        status?: string;
        search?: string;
        overdue?: boolean;
        dueBefore?: string;
        sort?: string;
        tree?: boolean;
        dod?: boolean;
        branch?: boolean;
        base?: string;
        parent?: string;
        template?: string;
        json?: boolean;
      },
    ) => {
      const json = options.json === true;
      const cwd = process.cwd();

      // cac's own "missing required args" message tells the user nothing about
      // what to do next, so the action is optional and we answer ourselves.
      if (action === undefined) {
        emit(
          usage(
            'Which action?\n' +
              '  kadence task add "Fix login"\n' +
              '  kadence task list\n' +
              '  kadence task show KAD-1\n' +
              '  kadence task edit KAD-1\n' +
              '  kadence task move KAD-1 done\n' +
              '  kadence task assign KAD-1 dev@example.com\n' +
              '  kadence task comment KAD-1 "text"\n' +
              '  kadence task cancel KAD-1\n' +
              '  kadence task delete KAD-1',
          ),
          json,
        );
      }

      switch (action) {
        case 'add': {
          if (arg === undefined) {
            emit(usage('A title is required:\n  kadence task add "Fix login"'), json);
          }
          const estimate = options.estimate === undefined ? undefined : Number(options.estimate);
          if (estimate !== undefined && (!Number.isFinite(estimate) || estimate < 0)) {
            emit(
              usage(
                `Estimate must be a positive number, got "${options.estimate}".\n` +
                  '  kadence task add "Fix login" --estimate 3',
              ),
              json,
            );
          }
          // Template fields are defaults: an explicit flag always wins.
          let fromTemplate: Record<string, unknown> = {};
          if (options.template !== undefined) {
            const found = findTemplate(cwd, process.env, options.template);
            if ('error' in found) emit(found.error, json);
            else fromTemplate = found.fields;
          }

          // cac gives a single flag as a string and repeats as an array.
          const labels =
            options.label === undefined
              ? undefined
              : Array.isArray(options.label)
                ? options.label
                : [options.label];

          emit(
            runTaskAdd(cwd, process.env, arg, {
              ...(fromTemplate as Record<string, never>),
              ...(options.description !== undefined ? { description: options.description } : {}),
              ...(options.type !== undefined ? { type: options.type } : {}),
              ...(options.priority !== undefined ? { priority: options.priority } : {}),
              ...(options.assignee !== undefined ? { assignee: options.assignee } : {}),
              ...(labels !== undefined ? { labels } : {}),
              ...(options.due !== undefined ? { due: options.due } : {}),
              ...(options.parent !== undefined ? { parent: options.parent } : {}),
              ...(estimate !== undefined ? { estimate } : {}),
              // cac turns `--no-dod` into `dod: false`.
              ...(options.dod === false ? { noDod: true } : {}),
            }),
            json,
          );
          break;
        }
        case 'doc': {
          // `task doc add KAD-1 path` creates the file and links it in one
          // call; `task doc KAD-1 path` links what is already there.
          const create = arg === 'add';
          const ref = create ? value : arg;
          const path = create ? extra : value;
          if (ref === undefined || path === undefined) {
            emit(
              usage(
                'A task and a path are required:\n' +
                  '  kadence task doc KAD-1 docs/design.md        link an existing file\n' +
                  '  kadence task doc add KAD-1 docs/design.md    create it and link it',
              ),
              json,
            );
          }
          emit(runTaskDoc(cwd, process.env, ref, path, create), json);
          break;
        }
        case 'log':
          if (arg === undefined || value === undefined) {
            emit(
              usage(
                'A task and a duration are required:\n' +
                  '  kadence task log KAD-1 2h\n' +
                  '  kadence task log KAD-1 90m',
              ),
              json,
            );
          }
          emit(runTaskLog(cwd, process.env, arg, value), json);
          break;
        case 'parent':
          if (arg === undefined || value === undefined) {
            emit(
              usage(
                'A task and a parent are required:\n' +
                  '  kadence task parent KAD-2 KAD-1\n' +
                  '  kadence task parent KAD-2 none    to detach',
              ),
              json,
            );
          }
          emit(runTaskParent(cwd, process.env, arg, value), json);
          break;
        case 'ac': {
          // `task ac <sub> <ref> [text|number]` — four positionals, because
          // the checklist has its own verbs and folding them into `task edit`
          // would make one command mean two things.
          if (arg === undefined || value === undefined) {
            emit(
              usage(
                'An action and a task are required:\n' +
                  '  kadence task ac add KAD-1 "tests green"\n' +
                  '  kadence task ac check KAD-1 1\n' +
                  '  kadence task ac uncheck KAD-1 1\n' +
                  '  kadence task ac list KAD-1',
                {
                  ...(arg === undefined ? {} : { received: arg }),
                  allowed: ['add', 'check', 'uncheck', 'list'],
                },
              ),
              json,
            );
          }
          if (arg === 'list') {
            emit(runTaskCriterionList(cwd, process.env, value), json);
            break;
          }
          if (extra === undefined) {
            emit(
              usage(
                arg === 'add'
                  ? `The criterion text is missing:\n  kadence task ac add ${value} "tests green"`
                  : `Which criterion?\n  kadence task ac ${arg} ${value} 1`,
                { received: arg },
              ),
              json,
            );
          }
          if (arg === 'add') {
            emit(runTaskCriterionAdd(cwd, process.env, value, extra), json);
            break;
          }
          if (arg === 'check' || arg === 'uncheck') {
            emit(runTaskCriterionCheck(cwd, process.env, value, extra, arg === 'uncheck'), json);
            break;
          }
          emit(
            usage(`Unknown criteria action "${arg}".`, {
              received: arg,
              allowed: ['add', 'check', 'uncheck', 'list'],
            }),
            json,
          );
          break;
        }
        case 'claim':
          // No argument is the point: `task claim` takes the top of the ready
          // list, which is one step instead of two for an agent starting work.
          emit(
            runTaskClaim(
              cwd,
              process.env,
              arg,
              options.assignee === undefined ? {} : { assignee: options.assignee },
            ),
            json,
          );
          break;
        case 'release':
          if (arg === undefined) {
            emit(usage('Which task?\n  kadence task release KAD-1'), json);
          }
          emit(runTaskRelease(cwd, process.env, arg), json);
          break;
        case 'block':
        case 'unblock':
          if (arg === undefined || value === undefined) {
            emit(
              usage(
                'A task and a blocker are required:\n' +
                  '  kadence task block KAD-2 KAD-1     KAD-2 waits for KAD-1\n' +
                  '  kadence task unblock KAD-2 KAD-1',
              ),
              json,
            );
          }
          emit(runTaskBlock(cwd, process.env, arg, value, action === 'unblock'), json);
          break;
        case 'edit': {
          if (arg === undefined) {
            emit(usage('Which task?\n  kadence task edit KAD-1 --priority high'), json);
          }
          const estimate = options.estimate === undefined ? undefined : Number(options.estimate);
          if (estimate !== undefined && (!Number.isFinite(estimate) || estimate < 0)) {
            emit(usage(`Estimate must be a positive number, got "${options.estimate}".`), json);
          }
          // cac gives a single flag as a string and repeats as an array.
          const many = (v: string | string[] | undefined): string[] | undefined =>
            v === undefined ? undefined : Array.isArray(v) ? v : [v];
          const labels = many(options.label);
          const addLabels = many(options.addLabel);
          const removeLabels = many(options.removeLabel);

          // With no field flags at all, editing means editing the description.
          const touchesFields =
            options.title !== undefined ||
            options.description !== undefined ||
            options.type !== undefined ||
            options.priority !== undefined ||
            options.due !== undefined ||
            estimate !== undefined ||
            labels !== undefined ||
            addLabels !== undefined ||
            removeLabels !== undefined ||
            value !== undefined;

          let description = options.description;
          if (!touchesFields) {
            const current = runTaskShow(cwd, process.env, arg);
            if (!current.ok) emit(current, json);
            const task = (current.data!['task'] as { description: string | null }) ?? {
              description: null,
            };
            description = textFromFlagOrEditor(
              undefined,
              task.description ?? '',
              `Editing the description of ${arg}.`,
              json,
            );
          }

          emit(
            runTaskEdit(cwd, process.env, arg, {
              // Positional title stays supported; the flag is what the board uses.
              ...(options.title !== undefined
                ? { title: options.title }
                : value !== undefined
                  ? { title: value }
                  : {}),
              ...(description !== undefined ? { description } : {}),
              ...(options.type !== undefined ? { type: options.type } : {}),
              ...(options.priority !== undefined ? { priority: options.priority } : {}),
              ...(options.due !== undefined ? { due: options.due } : {}),
              ...(estimate !== undefined ? { estimate } : {}),
              ...(labels !== undefined ? { labels } : {}),
              ...(addLabels !== undefined ? { addLabels } : {}),
              ...(removeLabels !== undefined ? { removeLabels } : {}),
            }),
            json,
          );
          break;
        }
        case 'comment': {
          if (arg === undefined) {
            emit(usage('Which task?\n  kadence task comment KAD-1 "text"'), json);
          }
          const text = textFromFlagOrEditor(value, '', `Comment on ${arg}.`, json);
          emit(runTaskComment(cwd, process.env, arg, text ?? ''), json);
          break;
        }
        case 'cancel':
          if (arg === undefined) {
            emit(usage('Which task?\n  kadence task cancel KAD-1'), json);
          }
          emit(runTaskCancel(cwd, process.env, arg), json);
          break;
        case 'delete':
          if (arg === undefined) {
            emit(usage('Which task?\n  kadence task delete KAD-1'), json);
          }
          emit(runTaskDelete(cwd, process.env, arg), json);
          break;
        case 'list':
          emit(
            runTaskList(cwd, process.env, {
              ...(options.status !== undefined ? { status: options.status } : {}),
              ...(options.search !== undefined ? { search: options.search } : {}),
              ...(options.type !== undefined ? { type: options.type } : {}),
              ...(options.priority !== undefined ? { priority: options.priority } : {}),
              ...(options.assignee !== undefined ? { assignee: options.assignee } : {}),
              // A single --label reads as a string, several as an array; the
              // filter takes one, so the last wins.
              ...(options.label !== undefined
                ? { label: Array.isArray(options.label) ? options.label.at(-1)! : options.label }
                : {}),
              ...(options.overdue === true ? { overdue: true } : {}),
              ...(options.dueBefore !== undefined ? { dueBefore: options.dueBefore } : {}),
              ...(options.sort !== undefined ? { sort: options.sort } : {}),
              ...(options.tree === true ? { tree: true } : {}),
              ...(options.branch === true ? { branch: true } : {}),
              ...(options.base !== undefined ? { base: options.base } : {}),
              // Selection only narrows JSON; the table renders its own columns.
              ...(json && options.fields !== undefined ? { fields: options.fields } : {}),
            }),
            json,
          );
          break;
        case 'show':
          if (arg === undefined) {
            emit(usage('Which task?\n  kadence task show KAD-1'), json);
          }
          emit(runTaskShow(cwd, process.env, arg), json);
          break;
        case 'move':
          if (arg === undefined || value === undefined) {
            emit(
              usage(
                'A task and a target status are required:\n' +
                  '  kadence task move KAD-1 done\n' +
                  `Statuses: ${TASK_STATUSES.join(', ')}`,
              ),
              json,
            );
          }
          emit(runTaskMove(cwd, process.env, arg, value), json);
          break;
        case 'assign':
          if (arg === undefined || value === undefined) {
            emit(
              usage(
                'A task and an assignee are required:\n' +
                  '  kadence task assign KAD-1 dev@example.com\n' +
                  '  kadence task assign KAD-1 none            to unassign',
              ),
              json,
            );
          }
          emit(runTaskAssign(cwd, process.env, arg, value), json);
          break;
        default:
          emit(
            usage(
              `Unknown action "${action}".\n` +
                'Available: add, list, show, edit, move, assign, comment, log,\n' +
                '           parent, block, unblock, cancel, delete\n' +
                '  kadence task --help',
              { received: action, allowed: TASK_ACTIONS },
            ),
            json,
          );
      }
    },
  );

cli
  .command('board [action]', 'Kanban board in the terminal; "config" edits it, "export" writes a snapshot')
  .option('--fields <list>', 'JSON only: comma-separated task fields to return')
  .option('--statuses <list>', 'Comma-separated columns, e.g. "todo,doing,done"')
  .option('--dod <list>', 'Criteria every new task starts with, e.g. "tests green,docs updated"')
  .option('--started <status>', 'The column where work counts as started; cycle time is measured from it')
  .option('--summary', 'JSON only: column state without history or comments')
  .option('--html', 'export: one self-contained HTML file, no server and no network')
  .option('--md', 'export: markdown for a README or a pull request')
  .option('--readme', 'export: update the section between markers in README.md')
  .option('--file <path>', 'export: where to write it')
  .option('-a, --assignee <who>', 'Only this person\'s tasks; "me" means you')
  .option('--sprint', 'Only tasks in the active sprint')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence board')
  .example('  kadence board --assignee me --sprint')
  .example('  kadence board --json --fields label,status,assignee')
  .example('  kadence board --json --summary        the state, without the history')
  .example('  kadence board config')
  .example('  kadence board config --statuses "todo,doing,review,done"')
  .example('  kadence board config --dod "tests green,docs updated"')
  .example('  kadence board config --started doing        where cycle time starts counting')
  .example('  kadence board export --html')
  .example('  kadence board export --md --readme')
  .action((action: string | undefined, options: {
      assignee?: string; sprint?: boolean; statuses?: string; dod?: string; started?: string; fields?: string;
      summary?: boolean; html?: boolean; md?: boolean; readme?: boolean; file?: string; json?: boolean;
    }) => {
    if (action === 'export') {
      emit(
        runBoardExport(process.cwd(), process.env, {
          ...(options.html === true ? { html: true } : {}),
          ...(options.md === true ? { md: true } : {}),
          ...(options.readme === true ? { readme: true } : {}),
          ...(options.file === undefined ? {} : { file: options.file }),
        }),
        options.json === true,
      );
      return;
    }
    if (action === 'config') {
      emit(
        runBoardConfig(process.cwd(), process.env, options.statuses, options.dod, options.started),
        options.json === true,
      );
    }
    if (action !== undefined) {
      emit(
        usage(`Unknown action "${action}".\nAvailable: config, export\n  kadence board --help`, {
          received: action,
          allowed: ['config', 'export'],
        }),
        options.json === true,
      );
    }
    emit(
      runBoard(
        process.cwd(),
        process.env,
        {
          ...(options.assignee !== undefined ? { assignee: options.assignee } : {}),
          ...(options.sprint === true ? { sprint: 'active' as const } : {}),
        },
        // Selection only narrows JSON; the human board renders its own columns.
        options.json === true ? options.fields : undefined,
        options.json === true && options.summary === true,
      ),
      options.json === true,
    );
  });

cli
  .command('sprint [action] [name]', 'Sprints: create | add | edit | start | close | status | list | burndown')
  .option('--sprint <name>', 'Which sprint to add to; defaults to the active one')
  .option('--name <name>', 'New name (for edit)')
  .option('-d, --description <text>', 'Sprint description (for edit)')
  .option('--start <date>', 'Start date, YYYY-MM-DD')
  .option('--end <date>', 'End date, YYYY-MM-DD')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence sprint create "Sprint 1"    first one starts right away')
  .example('  kadence sprint create "Sprint 2"    later ones are planned')
  .example('  kadence sprint add KAD-1 --sprint "Sprint 2"')
  .example('  kadence sprint start                starts the next planned sprint')
  .example('  kadence sprint edit --start 2026-09-01 --end 2026-09-14')
  .example('  kadence sprint edit "Sprint 2" --name "Sprint 2: auth"')
  .example('  kadence sprint burndown            chart from the journal, any day')
  .example('  kadence sprint close                closes the active one, reports velocity')
  .action(
    (
      action: string | undefined,
      name: string | undefined,
      options: {
        sprint?: string;
        name?: string;
        description?: string;
        start?: string;
        end?: string;
        json?: boolean;
      },
    ) => {
      const json = options.json === true;
      const cwd = process.cwd();

      if (action === undefined) {
        emit(
          usage(
            'Which action?\n' +
              '  kadence sprint create "Sprint 1"\n' +
              '  kadence sprint add KAD-1\n' +
              '  kadence sprint edit --start 2026-09-01\n' +
              '  kadence sprint start\n' +
              '  kadence sprint close\n' +
              '  kadence sprint status\n' +
              '  kadence sprint list',
          ),
          json,
        );
      }

      switch (action) {
        case 'create':
          if (name === undefined) {
            emit(usage('A sprint name is required:\n  kadence sprint create "Sprint 1"'), json);
          }
          emit(runSprintCreate(cwd, process.env, name), json);
          break;
        case 'add':
          if (name === undefined) {
            emit(
              usage(
                'Which task?\n' +
                  '  kadence sprint add KAD-1\n' +
                  '  kadence sprint add KAD-1 --sprint "Sprint 2"',
              ),
              json,
            );
          }
          emit(
            runSprintAdd(
              cwd,
              process.env,
              name,
              options.sprint === undefined ? {} : { sprint: options.sprint },
            ),
            json,
          );
          break;
        case 'edit':
          emit(
            runSprintEdit(cwd, process.env, name, {
              ...(options.name !== undefined ? { name: options.name } : {}),
              ...(options.description !== undefined ? { description: options.description } : {}),
              ...(options.start !== undefined ? { startDate: options.start } : {}),
              ...(options.end !== undefined ? { endDate: options.end } : {}),
            }),
            json,
          );
          break;
        case 'start':
          emit(runSprintStart(cwd, process.env, name), json);
          break;
        case 'close':
          emit(runSprintClose(cwd, process.env), json);
          break;
        case 'status':
          emit(runSprintStatus(cwd, process.env), json);
          break;
        case 'list':
          emit(runSprintList(cwd, process.env), json);
          break;
        case 'burndown':
          emit(runSprintBurndown(cwd, process.env, name), json);
          break;
        default:
          emit(
            usage(
              `Unknown action "${action}".\n` +
                'Available: create, add, edit, start, close, status, list, burndown\n' +
                '  kadence sprint --help',
              { received: action, allowed: SPRINT_ACTIONS },
            ),
            json,
          );
      }
    },
  );

cli
  .command('template [action] [name]', 'Task templates: save | list | delete')
  .option('-d, --description <text>', 'Default description')
  .option('--type <type>', 'Default type')
  .option('--priority <level>', 'Default priority')
  .option('-a, --assignee <who>', 'Default assignee')
  .option('--label <name>', 'Default label; repeat for several')
  .option('--estimate <points>', 'Default estimate')
  .option('--json', 'Machine-readable output for agents')
  .example('  kadence template save bug --type bug --priority high --label triage')
  .example('  kadence template list')
  .action(
    (
      action: string | undefined,
      name: string | undefined,
      options: {
        title?: string;
        description?: string;
        type?: string;
        priority?: string;
        assignee?: string;
        label?: string | string[];
        estimate?: string;
        json?: boolean;
      },
    ) => {
      const json = options.json === true;
      const cwd = process.cwd();

      switch (action) {
        case 'save': {
          if (name === undefined) {
            emit(usage('A template name is required:\n  kadence template save bug --type bug'), json);
          }
          const labels =
            options.label === undefined
              ? undefined
              : Array.isArray(options.label)
                ? options.label
                : [options.label];
          emit(
            runTemplateSave(cwd, process.env, name, {
              ...(options.description !== undefined ? { description: options.description } : {}),
              ...(options.type !== undefined ? { type: options.type } : {}),
              ...(options.priority !== undefined ? { priority: options.priority } : {}),
              ...(options.assignee !== undefined ? { assignee: options.assignee } : {}),
              ...(labels !== undefined ? { labels } : {}),
              ...(options.estimate !== undefined ? { estimate: Number(options.estimate) } : {}),
            }),
            json,
          );
          break;
        }
        case 'list':
        case undefined:
          emit(runTemplateList(cwd, process.env), json);
          break;
        case 'delete':
          if (name === undefined) {
            emit(usage('Which template?\n  kadence template delete bug'), json);
          }
          emit(runTemplateDelete(cwd, process.env, name), json);
          break;
        default:
          emit(
            usage(`Unknown action "${action}".\nAvailable: save, list, delete`, {
              received: action,
              allowed: TEMPLATE_ACTIONS,
            }),
            json,
          );
      }
    },
  );

cli
  .command('ui', 'Interactive kanban board')
  .alias('board:ui')
  .example('  kadence ui')
  .action(async () => {
    // Imported lazily so the fast commands never load the UI layer.
    const { runUi } = await import('./commands/ui.js');
    const r = await runUi(process.cwd(), process.env);
    if (!r.ok) emit(r, false);
  });

cli.help();
cli.version(__VERSION__);

// cac reads any leading "-" as a flag, so negative values never reach the
// command. Two cases need intercepting before parsing rather than fighting the
// parser: a negative estimate (an error worth explaining) and a negative time
// log (a legitimate correction).
const argv = process.argv;
if (argv[2] === 'task' && argv[3] === 'log' && argv[4] !== undefined && argv[5] !== undefined) {
  const r = runTaskLog(process.cwd(), process.env, argv[4], argv[5]);
  const wantsJson = argv.includes('--json');
  emit(r, wantsJson);
}

const negativeEstimate = process.argv.findIndex(
  (a, i) => a.startsWith('-') && /^-\d+(\.\d+)?$/.test(a) && process.argv[i - 1] === '--estimate',
);
if (negativeEstimate !== -1) {
  process.stderr.write(
    `Estimate must be a positive number, got "${process.argv[negativeEstimate]}".\n` +
      '  kadence task add "Fix login" --estimate 3\n',
  );
  process.exit(2);
}

try {
  cli.parse();
} catch (err) {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(2);
}
