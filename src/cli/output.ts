import type { Task } from '../core/projection.js';

/**
 * Вивід для людини.
 *
 * Кольори й таблиці власні: `picocolors` коштує 7.7 мс імпорту, а нам треба
 * п'ять кольорів і вирівнювання трьох колонок (ADR-004).
 */

const ESC = '\u001b[';
const ANSI = {
  dim: `${ESC}2m`,
  bold: `${ESC}1m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  reset: `${ESC}0m`,
};

export function colorsEnabled(env: NodeJS.ProcessEnv, isTty: boolean): boolean {
  // NO_COLOR — загальноприйнята конвенція; поважаємо її без винятків.
  if (env['NO_COLOR'] !== undefined) return false;
  return isTty;
}

function paint(text: string, code: string, on: boolean): string {
  return on ? `${code}${text}${ANSI.reset}` : text;
}

const STATUS_COLOR: Record<string, string> = {
  done: ANSI.green,
  in_progress: ANSI.blue,
  blocked: ANSI.yellow,
  cancelled: ANSI.dim,
};

/** Ширина в символах, а не в байтах — назви бувають кириличні. */
function width(s: string): number {
  return [...s].length;
}

function pad(s: string, n: number): string {
  const diff = n - width(s);
  return diff > 0 ? s + ' '.repeat(diff) : s;
}

export function renderTaskTable(tasks: readonly Task[], colors: boolean): string {
  if (tasks.length === 0) {
    return 'Задач поки немає.\nСтворіть першу:\n  flowit task add "назва"';
  }

  const labelW = Math.max(...tasks.map((t) => width(t.label)), 2);
  const statusW = Math.max(...tasks.map((t) => width(t.status)), 6);

  return tasks
    .map((t) => {
      const label = paint(pad(t.label, labelW), ANSI.bold, colors);
      const status = paint(pad(t.status, statusW), STATUS_COLOR[t.status] ?? ANSI.dim, colors);
      const estimate = t.estimate === null ? '' : paint(` (${t.estimate})`, ANSI.dim, colors);
      return `${label}  ${status}  ${t.title}${estimate}`;
    })
    .join('\n');
}
