import cac from 'cac';
import { runInit } from './commands/init.js';
import { runTaskAdd, runTaskList, runTaskMove, type CommandResult } from './commands/task.js';

/**
 * Точка входу.
 *
 * Команди оголошені як `task <action>`, а не `task add`: cac не матчить
 * багатослівні імена — вона показує їх у довідці, але жодна дія не
 * викликається. Перевірено емпірично; ADR-004 передбачав ризик із cac,
 * але інший (занедбаність проєкту), тож це уточнення до нього.
 */
const cli = cac('flowit');

/**
 * У режимі --json stdout містить ТІЛЬКИ JSON: агент, що отримав змішаний
 * потік, не зможе його розібрати. Усе людське йде в stderr.
 */
function emit(result: CommandResult, json: boolean): never {
  // Попередження завжди в stderr — навіть у людському режимі вони не мають
  // змішуватися з корисним виводом, який можна передати далі по конвеєру.
  for (const w of result.warnings ?? []) process.stderr.write(`${w}\n`);

  if (json) {
    const payload = result.data ?? {
      schema: 'flowit/v1',
      ok: result.ok,
      ...(result.ok ? {} : { error: { message: result.message } }),
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } else {
    (result.ok ? process.stdout : process.stderr).write(`${result.message}\n`);
  }
  process.exit(result.exitCode);
}

cli.command('init', 'Ініціалізувати FlowIt у цьому репозиторії').action(() => {
  const r = runInit(process.cwd());
  emit({ ok: r.ok, message: r.message, exitCode: r.ok ? 0 : 1 }, false);
});

cli
  .command('task <action> [arg] [to]', 'Задачі: add | list | move')
  .option('--estimate <points>', 'Оцінка в пунктах (для add)')
  .option('--status <status>', 'Фільтр за статусом (для list)')
  .option('--json', 'Вивід у JSON для агентів')
  .example('  flowit task add "Полагодити злиття" --estimate 3')
  .example('  flowit task list --status in_progress')
  .example('  flowit task move FLOW-1 done')
  .action(
    (
      action: string,
      arg: string | undefined,
      to: string | undefined,
      options: { estimate?: string; status?: string; json?: boolean },
    ) => {
      const json = options.json === true;
      const cwd = process.cwd();

      switch (action) {
        case 'add': {
          if (arg === undefined) {
            emit({ ok: false, exitCode: 2, message: 'Вкажіть назву:\n  flowit task add "назва"' }, json);
          }
          const estimate = options.estimate === undefined ? undefined : Number(options.estimate);
          if (estimate !== undefined && !Number.isFinite(estimate)) {
            emit({ ok: false, exitCode: 2, message: 'Оцінка має бути числом.' }, json);
          }
          emit(
            runTaskAdd(cwd, process.env, arg, estimate === undefined ? {} : { estimate }),
            json,
          );
          break;
        }
        case 'list':
          emit(
            runTaskList(cwd, process.env, options.status === undefined ? {} : { status: options.status }),
            json,
          );
          break;
        case 'move': {
          if (arg === undefined || to === undefined) {
            emit(
              { ok: false, exitCode: 2, message: 'Вкажіть задачу і стан:\n  flowit task move FLOW-1 done' },
              json,
            );
          }
          emit(runTaskMove(cwd, process.env, arg, to), json);
          break;
        }
        default:
          emit(
            { ok: false, exitCode: 2, message: `Невідома дія «${action}». Доступно: add, list, move` },
            json,
          );
      }
    },
  );

cli.help();
cli.version('0.1.0-dev');

try {
  cli.parse();
} catch (err) {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(2);
}
