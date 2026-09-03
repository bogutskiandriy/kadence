import cac from 'cac';
import { runInit } from './commands/init.js';
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
  TASK_STATUSES,
  type CommandResult,
} from './commands/task.js';
import { editText, canUseEditor } from './editor.js';
import { runBoard, runBoardConfig } from './commands/board.js';
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
 * Entry point.
 *
 * Commands are declared as `task <action>` rather than `task add`: cac does not
 * match multi-word names — it lists them in the help output, but no action ever
 * fires. Verified empirically; ADR-004 anticipated a risk with cac, just a
 * different one (the project going stale), so this is an amendment to it.
 */
const cli = cac('sprintit');

/**
 * In --json mode stdout carries ONLY JSON: an agent handed a mixed stream
 * cannot parse it. Everything human goes to stderr.
 */
function emit(result: CommandResult, json: boolean): never {
  for (const w of result.warnings ?? []) process.stderr.write(`${w}\n`);

  if (json) {
    const payload = result.data ?? {
      schema: 'sprintit/v1',
      ok: result.ok,
      ...(result.ok ? {} : { error: { message: result.message } }),
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } else {
    (result.ok ? process.stdout : process.stderr).write(`${result.message}\n`);
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

/** Usage errors all look the same, so they are built in one place. */
function usage(message: string): CommandResult {
  return { ok: false, exitCode: 2, message };
}

cli
  .command('init', 'Set up sprintit in this repository')
  .example('  sprintit init')
  .action(() => {
    const r = runInit(process.cwd());
    emit({ ok: r.ok, message: r.message, exitCode: r.ok ? 0 : 1 }, false);
  });

cli
  .command('task [action] [arg] [value]', 'Tasks: add | list | show | move | assign')
  .option('--title <text>', 'New title (for edit)')
  .option('-d, --description <text>', 'Full description; use quotes for multiple lines')
  .option('--type <type>', `Type: ${TASK_TYPES.join(' | ')}`)
  .option('--priority <level>', `Priority: ${PRIORITIES.join(' | ')}`)
  .option('-a, --assignee <who>', 'Assignee, e.g. dev@example.com')
  .option('--label <name>', 'Label; repeat the flag for several')
  .option('--estimate <points>', 'Estimate in points, a positive number')
  .option('--due <date>', 'Due date, YYYY-MM-DD; empty string clears it')
  .option('--status <status>', `Filter by status: ${TASK_STATUSES.join(' | ')}`)
  .option('--search <text>', 'Search title, description and comments')
  .option('--overdue', 'Only tasks past their due date')
  .option('--due-before <date>', 'Only tasks due before YYYY-MM-DD')
  .option('--sort <key>', `Sort by: ${SORT_KEYS.join(' | ')}`)
  .option('--tree', 'Show parent/child structure')
  .option('--parent <task>', 'Parent task, e.g. FLOW-1 (use "none" to detach)')
  .option('--template <name>', 'Pre-fill fields from a saved template')
  .option('--json', 'Machine-readable output for agents')
  .example('  sprintit task add "Fix login" -d "Broken since 2.3" --type bug --priority high --estimate 3')
  .example('  sprintit task list --status in_progress --sort priority')
  .example('  sprintit task list --search cookie --overdue')
  .example('  sprintit task list --assignee me --label auth')
  .example('  sprintit task list --tree')
  .example('  sprintit task move FLOW-1,FLOW-2,FLOW-3 done     bulk: all or nothing')
  .example('  sprintit task add "Login form" --parent FLOW-1   FLOW-1 can be an epic')
  .example('  sprintit task parent FLOW-2 FLOW-1')
  .example('  sprintit task block FLOW-2 FLOW-1               FLOW-2 waits for FLOW-1')
  .example('  sprintit task unblock FLOW-2 FLOW-1')
  .example('  sprintit task log FLOW-1 2h                     also 90m, or -30m to correct')
  .example('  sprintit task add "Crash on save" --template bug')
  .example('  sprintit task show FLOW-1')
  .example('  sprintit task move FLOW-1 done')
  .example('  sprintit task edit FLOW-1 --priority urgent --due 2026-09-30')
  .example('  sprintit task edit FLOW-1                      opens $EDITOR for the description')
  .example('  sprintit task comment FLOW-1 "Needs review"')
  .example('  sprintit task assign FLOW-1 dev@example.com     (use "none" to unassign)')
  .example('  sprintit task cancel FLOW-1                    keeps it in history')
  .example('  sprintit task delete FLOW-1                    drops it from the board')
  .action(
    (
      action: string | undefined,
      arg: string | undefined,
      value: string | undefined,
      options: {
        title?: string;
        description?: string;
        type?: string;
        priority?: string;
        assignee?: string;
        label?: string | string[];
        estimate?: string;
        due?: string;
        status?: string;
        search?: string;
        overdue?: boolean;
        dueBefore?: string;
        sort?: string;
        tree?: boolean;
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
              '  sprintit task add "Fix login"\n' +
              '  sprintit task list\n' +
              '  sprintit task show FLOW-1\n' +
              '  sprintit task edit FLOW-1\n' +
              '  sprintit task move FLOW-1 done\n' +
              '  sprintit task assign FLOW-1 dev@example.com\n' +
              '  sprintit task comment FLOW-1 "text"\n' +
              '  sprintit task cancel FLOW-1\n' +
              '  sprintit task delete FLOW-1',
          ),
          json,
        );
      }

      switch (action) {
        case 'add': {
          if (arg === undefined) {
            emit(usage('A title is required:\n  sprintit task add "Fix login"'), json);
          }
          const estimate = options.estimate === undefined ? undefined : Number(options.estimate);
          if (estimate !== undefined && (!Number.isFinite(estimate) || estimate < 0)) {
            emit(
              usage(
                `Estimate must be a positive number, got "${options.estimate}".\n` +
                  '  sprintit task add "Fix login" --estimate 3',
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
            }),
            json,
          );
          break;
        }
        case 'log':
          if (arg === undefined || value === undefined) {
            emit(
              usage(
                'A task and a duration are required:\n' +
                  '  sprintit task log FLOW-1 2h\n' +
                  '  sprintit task log FLOW-1 90m',
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
                  '  sprintit task parent FLOW-2 FLOW-1\n' +
                  '  sprintit task parent FLOW-2 none    to detach',
              ),
              json,
            );
          }
          emit(runTaskParent(cwd, process.env, arg, value), json);
          break;
        case 'block':
        case 'unblock':
          if (arg === undefined || value === undefined) {
            emit(
              usage(
                'A task and a blocker are required:\n' +
                  '  sprintit task block FLOW-2 FLOW-1     FLOW-2 waits for FLOW-1\n' +
                  '  sprintit task unblock FLOW-2 FLOW-1',
              ),
              json,
            );
          }
          emit(runTaskBlock(cwd, process.env, arg, value, action === 'unblock'), json);
          break;
        case 'edit': {
          if (arg === undefined) {
            emit(usage('Which task?\n  sprintit task edit FLOW-1 --priority high'), json);
          }
          const estimate = options.estimate === undefined ? undefined : Number(options.estimate);
          if (estimate !== undefined && (!Number.isFinite(estimate) || estimate < 0)) {
            emit(usage(`Estimate must be a positive number, got "${options.estimate}".`), json);
          }
          const labels =
            options.label === undefined
              ? undefined
              : Array.isArray(options.label)
                ? options.label
                : [options.label];

          // With no field flags at all, editing means editing the description.
          const touchesFields =
            options.title !== undefined ||
            options.description !== undefined ||
            options.type !== undefined ||
            options.priority !== undefined ||
            options.due !== undefined ||
            estimate !== undefined ||
            labels !== undefined ||
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
            }),
            json,
          );
          break;
        }
        case 'comment': {
          if (arg === undefined) {
            emit(usage('Which task?\n  sprintit task comment FLOW-1 "text"'), json);
          }
          const text = textFromFlagOrEditor(value, '', `Comment on ${arg}.`, json);
          emit(runTaskComment(cwd, process.env, arg, text ?? ''), json);
          break;
        }
        case 'cancel':
          if (arg === undefined) {
            emit(usage('Which task?\n  sprintit task cancel FLOW-1'), json);
          }
          emit(runTaskCancel(cwd, process.env, arg), json);
          break;
        case 'delete':
          if (arg === undefined) {
            emit(usage('Which task?\n  sprintit task delete FLOW-1'), json);
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
            }),
            json,
          );
          break;
        case 'show':
          if (arg === undefined) {
            emit(usage('Which task?\n  sprintit task show FLOW-1'), json);
          }
          emit(runTaskShow(cwd, process.env, arg), json);
          break;
        case 'move':
          if (arg === undefined || value === undefined) {
            emit(
              usage(
                'A task and a target status are required:\n' +
                  '  sprintit task move FLOW-1 done\n' +
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
                  '  sprintit task assign FLOW-1 dev@example.com\n' +
                  '  sprintit task assign FLOW-1 none            to unassign',
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
                '  sprintit task --help',
            ),
            json,
          );
      }
    },
  );

cli
  .command('board [action]', 'Kanban board in the terminal; "config" edits the columns')
  .option('--statuses <list>', 'Comma-separated columns, e.g. "todo,doing,done"')
  .option('-a, --assignee <who>', 'Only this person\'s tasks; "me" means you')
  .option('--sprint', 'Only tasks in the active sprint')
  .option('--json', 'Machine-readable output for agents')
  .example('  sprintit board')
  .example('  sprintit board --assignee me --sprint')
  .example('  sprintit board config')
  .example('  sprintit board config --statuses "todo,doing,review,done"')
  .action((action: string | undefined, options: { assignee?: string; sprint?: boolean; statuses?: string; json?: boolean }) => {
    if (action === 'config') {
      emit(runBoardConfig(process.cwd(), process.env, options.statuses), options.json === true);
    }
    if (action !== undefined) {
      emit(usage(`Unknown action "${action}".\nAvailable: config\n  sprintit board --help`), options.json === true);
    }
    emit(
      runBoard(process.cwd(), process.env, {
        ...(options.assignee !== undefined ? { assignee: options.assignee } : {}),
        ...(options.sprint === true ? { sprint: 'active' as const } : {}),
      }),
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
  .example('  sprintit sprint create "Sprint 1"    first one starts right away')
  .example('  sprintit sprint create "Sprint 2"    later ones are planned')
  .example('  sprintit sprint add FLOW-1 --sprint "Sprint 2"')
  .example('  sprintit sprint start                starts the next planned sprint')
  .example('  sprintit sprint edit --start 2026-09-01 --end 2026-09-14')
  .example('  sprintit sprint edit "Sprint 2" --name "Sprint 2: auth"')
  .example('  sprintit sprint burndown            chart from the journal, any day')
  .example('  sprintit sprint close                closes the active one, reports velocity')
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
              '  sprintit sprint create "Sprint 1"\n' +
              '  sprintit sprint add FLOW-1\n' +
              '  sprintit sprint edit --start 2026-09-01\n' +
              '  sprintit sprint start\n' +
              '  sprintit sprint close\n' +
              '  sprintit sprint status\n' +
              '  sprintit sprint list',
          ),
          json,
        );
      }

      switch (action) {
        case 'create':
          if (name === undefined) {
            emit(usage('A sprint name is required:\n  sprintit sprint create "Sprint 1"'), json);
          }
          emit(runSprintCreate(cwd, process.env, name), json);
          break;
        case 'add':
          if (name === undefined) {
            emit(
              usage(
                'Which task?\n' +
                  '  sprintit sprint add FLOW-1\n' +
                  '  sprintit sprint add FLOW-1 --sprint "Sprint 2"',
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
                '  sprintit sprint --help',
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
  .example('  sprintit template save bug --type bug --priority high --label triage')
  .example('  sprintit template list')
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
            emit(usage('A template name is required:\n  sprintit template save bug --type bug'), json);
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
            emit(usage('Which template?\n  sprintit template delete bug'), json);
          }
          emit(runTemplateDelete(cwd, process.env, name), json);
          break;
        default:
          emit(usage(`Unknown action "${action}".\nAvailable: save, list, delete`), json);
      }
    },
  );

cli
  .command('ui', 'Interactive kanban board')
  .alias('board:ui')
  .example('  sprintit ui')
  .action(async () => {
    // Imported lazily so the fast commands never load the UI layer.
    const { runUi } = await import('./commands/ui.js');
    const r = await runUi(process.cwd(), process.env);
    if (!r.ok) emit(r, false);
  });

cli.help();
cli.version('0.1.0-dev');

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
      '  sprintit task add "Fix login" --estimate 3\n',
  );
  process.exit(2);
}

try {
  cli.parse();
} catch (err) {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(2);
}
