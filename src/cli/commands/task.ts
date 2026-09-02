import { findRepoRoot, getActorEmail } from '../../core/git.js';
import { append, eventsDir, readAll } from '../../core/store.js';
import { ulid } from '../../core/ulid.js';
import type { FlowEvent } from '../../core/event.js';
import { project, type ProjectState, type Task, type TaskStatus } from '../../core/projection.js';
import { renderTaskTable, colorsEnabled } from '../output.js';
import { existsSync } from 'node:fs';

/** Порядок важливий: за ним визначається, чи перехід пропустив стани. */
export const TASK_STATUSES: readonly TaskStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'cancelled',
];

export interface CommandResult {
  ok: boolean;
  message: string;
  /** Дані для режиму --json. */
  data?: Record<string, unknown>;
  /** Іде в stderr, щоб не псувати JSON у stdout. */
  warnings?: string[];
  exitCode: 0 | 1 | 2;
}

export interface Context {
  root: string;
  actor: string;
  source: 'human' | 'agent';
}

/**
 * Спільна підготовка для команд, що працюють із журналом.
 *
 * Три перевірки в одному місці, бо кожна з них — найчастіша причина, з якої
 * перша спроба користувача закінчується нічим.
 */
export function resolveContext(cwd: string, env: NodeJS.ProcessEnv): Context | CommandResult {
  const root = findRepoRoot(cwd);
  if (root === null) {
    return {
      ok: false,
      exitCode: 1,
      message:
        'FlowIt живе всередині git-репозиторію, а тут його немає.\n' +
        'Створіть репозиторій і спробуйте знову:\n  git init',
    };
  }

  if (!existsSync(eventsDir(root))) {
    return {
      ok: false,
      exitCode: 1,
      message: '.flowit/ не знайдено.\nВиконайте:\n  npx flowit init',
    };
  }

  const actor = getActorEmail(root);
  if (actor === null) {
    return {
      ok: false,
      exitCode: 1,
      message:
        'Git не знає, хто ви — подію нема від кого записати.\nВиконайте:\n' +
        '  git config user.email you@example.com',
    };
  }

  // Джерело не вгадуємо: без явної змінної подія вважається людською.
  const source = env['FLOWIT_SOURCE'] === 'agent' ? 'agent' : 'human';
  return { root, actor, source };
}

function isContext(v: Context | CommandResult): v is Context {
  return 'root' in v;
}

export function runTaskAdd(
  cwd: string,
  env: NodeJS.ProcessEnv,
  title: string,
  options: { estimate?: number } = {},
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { ok: false, exitCode: 2, message: 'Назва задачі не може бути порожньою.' };
  }

  // Подія і сутність, яку вона створює, отримують один ULID: для task.created
  // це те саме. Людиночитаний FLOW-N присвоюється при згортанні журналу, а не
  // тут — дві гілки, що розійшлися від спільного предка, інакше видали б
  // однаковий номер (Probe A, інваріант I7).
  const id = ulid();
  const event: FlowEvent = {
    id,
    type: 'task.created',
    entity: id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: {
      title: trimmed,
      ...(options.estimate !== undefined ? { estimate: options.estimate } : {}),
    },
  };

  append(ctx.root, event);

  const warning =
    options.estimate === undefined
      ? '\nБез оцінки задача не увійде у velocity. Додайте --estimate.'
      : '';

  return {
    ok: true,
    exitCode: 0,
    message: `Створено задачу: ${trimmed}${warning}`,
    data: { schema: 'flowit/v1', ok: true, task: { id, title: trimmed } },
  };
}

/** Читає журнал і згортає його в стан. */
function loadState(root: string): { state: ProjectState; warnings: string[] } {
  const read = readAll(root);
  const warnings: string[] = [];

  if (read.systemicCorruption) {
    warnings.push(
      `Журнал пошкоджено серйозно: ${read.corrupted.length} з ` +
        `${read.corrupted.length + read.events.length} подій нечитані. ` +
        'Спробуйте: git checkout .flowit/',
    );
  } else if (read.corrupted.length > 0) {
    warnings.push(`Пропущено ${read.corrupted.length} пошкоджену подію.`);
  }
  if (read.unknownTypes > 0) {
    warnings.push(`Пропущено ${read.unknownTypes} подій новішого формату. Оновіть FlowIt.`);
  }

  return { state: project(read.events), warnings };
}

/** Задачу можна назвати і ULID, і людиночитаним FLOW-N. */
function findTask(state: ProjectState, ref: string): Task | undefined {
  const needle = ref.toUpperCase();
  return state.tasks.find((t) => t.id === needle || t.label === needle);
}

function unknownStatus(value: string): CommandResult {
  return {
    ok: false,
    exitCode: 2,
    message: `Невідомий статус «${value}».\nДоступні: ${TASK_STATUSES.join(', ')}`,
  };
}

export function runTaskList(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: { status?: string },
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  if (options.status !== undefined && !TASK_STATUSES.includes(options.status as TaskStatus)) {
    return unknownStatus(options.status);
  }

  const { state, warnings } = loadState(ctx.root);
  const tasks =
    options.status === undefined
      ? state.tasks
      : state.tasks.filter((t) => t.status === options.status);

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: renderTaskTable(tasks, colorsEnabled(env, process.stdout.isTTY === true)),
    data: {
      schema: 'flowit/v1',
      ok: true,
      tasks: tasks.map((t) => ({
        id: t.id,
        label: t.label,
        title: t.title,
        status: t.status,
        estimate: t.estimate,
        sprint: t.sprint,
        history: t.history,
      })),
    },
  };
}

export function runTaskMove(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  to: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  if (!TASK_STATUSES.includes(to as TaskStatus)) return unknownStatus(to);

  const { state, warnings } = loadState(ctx.root);
  const task = findTask(state, ref);
  if (task === undefined) {
    return { ok: false, exitCode: 1, message: `Задачі ${ref} немає.\n  flowit task list` };
  }

  // Стан уже той самий — події не пишемо: журнал фіксує зміни, а не наміри
  // без наслідків.
  if (task.status === to) {
    return { ok: true, exitCode: 0, warnings, message: `${task.label} вже ${to}.` };
  }

  const from = task.status;
  append(ctx.root, {
    id: ulid(),
    type: 'task.moved',
    entity: task.id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { from, to },
  });

  // Пропущені стани не забороняємо: FlowIt описує роботу, а не керує нею.
  const skipped =
    TASK_STATUSES.indexOf(to as TaskStatus) - TASK_STATUSES.indexOf(from) > 1
      ? `\nЗадача перейшла з ${from} одразу в ${to}, минаючи проміжні стани.`
      : '';

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `${task.label}: ${from} → ${to}${skipped}`,
    data: {
      schema: 'flowit/v1',
      ok: true,
      task: { id: task.id, label: task.label, from, to },
    },
  };
}
