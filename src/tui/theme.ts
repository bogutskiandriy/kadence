import type { Priority, Task } from '../core/projection.js';

/**
 * Colours and glyphs for the interactive board.
 *
 * Richer than the plain CLI output on purpose: a static list is read once and
 * scrolled away, while a board is looked at for minutes, and colour is what
 * lets the eye find the urgent item without reading every row.
 */

export const THEME = {
  /** Column frame when it does not hold the cursor. */
  border: 'gray',
  borderFocus: 'cyan',
  headerFg: 'white',
  headerBg: 'blue',
  selectedFg: 'black',
  selectedBg: 'cyan',
  dim: 'gray',
  hint: 'gray',
  warn: 'yellow',
  danger: 'red',
} as const;

/** Per-status accent, so a column reads as a stage at a glance. */
export const STATUS_COLOR: Record<string, string> = {
  backlog: 'gray',
  todo: 'white',
  in_progress: 'blue',
  doing: 'blue',
  blocked: 'red',
  in_review: 'magenta',
  review: 'magenta',
  done: 'green',
  shipped: 'green',
};

export function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? 'white';
}

const PRIORITY_GLYPH: Record<Priority, string> = {
  urgent: '‼',
  high: '↑',
  normal: ' ',
  low: '↓',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  urgent: 'red',
  high: 'yellow',
  normal: 'white',
  low: 'gray',
};

const TYPE_GLYPH: Record<string, string> = {
  bug: '✖',
  story: '◆',
  epic: '⬢',
  task: '·',
};

/** blessed markup: {color-fg}text{/} */
function tag(text: string, color: string): string {
  return `{${color}-fg}${text}{/}`;
}

/**
 * One card on the board.
 *
 * Kept to a single line: multi-line cards look richer in a mockup and make a
 * real board of forty tasks unreadable.
 */
export function renderCard(task: Task, width: number): string {
  const priority = tag(PRIORITY_GLYPH[task.priority], PRIORITY_COLOR[task.priority]);
  const type = tag(TYPE_GLYPH[task.type] ?? '·', 'gray');
  const label = tag(task.label, 'cyan');

  const marks: string[] = [];
  if (task.blockedBy.length > 0) marks.push(tag('⊘', 'red'));
  if (task.comments.length > 0) marks.push(tag('💬', 'gray'));
  if (task.due !== null) {
    const overdue = task.due < new Date().toISOString().slice(0, 10);
    marks.push(tag(overdue ? '⏰' : '📅', overdue ? 'red' : 'gray'));
  }

  const suffix = [
    task.assignee !== null ? tag(`@${task.assignee.split('@')[0]}`, 'gray') : '',
    task.estimate !== null ? tag(String(task.estimate), 'yellow') : '',
    marks.join(''),
  ]
    .filter((s) => s.length > 0)
    .join(' ');

  // Budget the title by what the visible glyphs actually consume, so cards do
  // not wrap and break the column grid.
  const overhead = 6 + stripTags(suffix).length;
  const room = Math.max(8, width - overhead);
  const title = [...task.title].length > room ? `${[...task.title].slice(0, room - 1).join('')}…` : task.title;

  return `${priority}${type} ${label} ${title} ${suffix}`.trimEnd();
}

/** Visible length, ignoring blessed markup. */
export function stripTags(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

/** The key hints strip along the bottom. */
export const KEY_HINTS = [
  '←→ column',
  '↑↓ task',
  'enter details',
  'm move',
  'a assign',
  'e edit',
  'n new',
  '/ search',
  '? help',
  'q quit',
].join('  ');
