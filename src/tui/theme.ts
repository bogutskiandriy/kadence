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

  // Budget the title against what the other parts actually occupy on screen.
  // An estimate here is not good enough: a card one character too wide wraps
  // and breaks the whole column grid.
  const prefix = `${stripTags(priority)}${stripTags(type)} ${stripTags(label)} `;
  const tail = suffix.length > 0 ? ` ${stripTags(suffix)}` : '';
  const room = Math.max(4, width - prefix.length - tail.length);

  const chars = [...task.title];
  const title = chars.length > room ? `${chars.slice(0, room - 1).join('')}…` : task.title;

  return `${priority}${type} ${label} ${title}${suffix.length > 0 ? ` ${suffix}` : ''}`;
}

/**
 * Marks the selected card.
 *
 * The highlight is drawn into the text rather than delegated to the list
 * widget: a non-interactive list ignores `select()`, and making it interactive
 * would put it back in competition for the keyboard.
 */
export function decorateCard(card: string, selected: boolean): string {
  return selected ? `{cyan-bg}{black-fg}${stripTags(card)}{/}` : ` ${card}`;
}

/**
 * One row of the task detail form.
 *
 * The highlight is drawn into the text for the same reason cards are: a
 * non-interactive list ignores `select()`, and making it interactive would put
 * it back in competition for the keyboard.
 */
export function renderField(label: string, value: string, selected: boolean, width = 12): string {
  const row = `${label.padEnd(width)} ${value}`;
  return selected ? `{cyan-bg}{black-fg}▸ ${row}{/}` : `  ${row}`;
}

/** Visible length, ignoring blessed markup. */
export function stripTags(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

/** The key hints strip along the bottom. */
export const KEY_HINTS = [
  '←→↑↓ move',
  'enter details',
  '[ ] shift',
  'm status',
  'a assign',
  'c comment',
  'e edit',
  'n new',
  's sprint',
  '/ filter',
  '? help',
  'q quit (Ctrl-C forces)',
].join('  ');
