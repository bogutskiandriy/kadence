import { isOpen, type Priority, type Task } from '../core/projection.js';

/**
 * Colours and glyphs for the interactive board.
 *
 * Richer than the plain CLI output on purpose: a static list is read once and
 * scrolled away, while a board is looked at for minutes, and colour is what
 * lets the eye find the urgent item without reading every row.
 */

export const THEME = {
  /**
   * The one accent: the column that holds the cursor, the selected row, the
   * frame of whatever dialog owns the keyboard, and an active filter. Used for
   * nothing else, so wherever it appears is where the eye should be.
   */
  accent: 'cyan',
  /** Column frame when it does not hold the cursor. */
  border: 'gray',
  borderFocus: 'cyan',
  /**
   * The terminal's own foreground. Never 'white': white text disappears on a
   * light terminal theme, and a board is used on both.
   */
  text: 'default',
  selectedFg: 'black',
  selectedBg: 'cyan',
  dim: 'gray',
  hint: 'gray',
  /** The board's own notes: "Reloaded.", "Filter cleared." Not warnings. */
  info: 'default',
  warn: 'yellow',
  danger: 'red',
} as const;

/**
 * Per-status colour for a column's label.
 *
 * Only two kinds of status mean something to the eye: blocked work needs
 * attention, finished work recedes. A colour for every stage turned the top
 * row into a rainbow that competed with the cursor.
 */
export const STATUS_COLOR: Record<string, string> = {
  blocked: 'red',
  done: 'gray',
  shipped: 'gray',
  cancelled: 'gray',
};

export function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? THEME.text;
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
  normal: THEME.text,
  low: 'gray',
};

/** A plain task, the common case, carries no mark: a dot on every row is noise. */
const TYPE_GLYPH: Record<string, string> = {
  bug: '✖',
  story: '◆',
  epic: '⬢',
  task: ' ',
};

/**
 * Cuts a name to `max` cells. A card is one row: a long assignee used to take
 * the whole budget and leave the title four characters.
 */
function shorten(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
}

/** Statuses whose cards recede, so open work is what the eye finds. */
const FINISHED = new Set(['done', 'cancelled']);

/** blessed markup: {color-fg}text{/}. The terminal's own colour needs no tag. */
function tag(text: string, color: string): string {
  return color === THEME.text ? text : `{${color}-fg}${text}{/}`;
}

/**
 * What each mark on a card means, for the help dialog.
 *
 * Every glyph is one cell wide in any terminal font. The emoji that used to
 * mark comments and due dates took two cells while the width budget counted
 * one, so a card with a comment pushed its last mark off the column as "?".
 */
export const CARD_MARKS: ReadonlyArray<readonly [string, string]> = [
  ['‼ ↑ ↓', 'urgent, high, low priority'],
  ['✖ ◆ ⬢', 'bug, story, epic; a plain task has no mark'],
  ['⊘', 'blocked by another task'],
  ['✓', 'claimed'],
  ['⚑', 'claimed by two people at once'],
  ['2/5', 'acceptance criteria checked so far'],
  ['☑', 'every criterion checked'],
  ['¶', 'has comments'],
  ['◷', 'has a due date; red once it has passed'],
  ['@who 3', 'assignee and estimate'],
];

/**
 * One card on the board.
 *
 * Kept to a single line: multi-line cards look richer in a mockup and make a
 * real board of forty tasks unreadable.
 */
export function renderCard(task: Task, width: number): string {
  const priority = tag(PRIORITY_GLYPH[task.priority], PRIORITY_COLOR[task.priority]);
  const type = tag(TYPE_GLYPH[task.type] ?? ' ', 'gray');
  // The label is how a task is named on the command line, so it stays on the
  // card; it is not what the card is about, so it does not take the accent.
  const label = tag(task.label, 'gray');

  const marks: string[] = [];
  if (task.blockedBy.length > 0) marks.push(tag('⊘', 'red'));
  // Two people claimed it: a colour of its own, because this is the one
  // conflict that names people rather than values (ADR-011).
  if (task.contestedBy.length > 0) marks.push(tag('⚑', 'magenta'));
  else if (task.claimedBy !== null) marks.push(tag('✓', 'gray'));
  const openCriteria = task.criteria.filter(isOpen).length;
  if (openCriteria > 0) {
    marks.push(tag(`${task.criteria.length - openCriteria}/${task.criteria.length}`, 'gray'));
  } else if (task.criteria.length > 0) {
    marks.push(tag('☑', 'gray'));
  }
  if (task.comments.length > 0) marks.push(tag('¶', 'gray'));
  if (task.due !== null) {
    const overdue = task.due < new Date().toISOString().slice(0, 10);
    marks.push(tag('◷', overdue ? 'red' : 'gray'));
  }

  // Meta is grey. Colour is kept for what asks for action: urgent and high
  // priority, a blocker, a contested claim, a date that has passed.
  const suffix = [
    task.assignee !== null ? tag(`@${shorten(task.assignee.split('@')[0] ?? '', 8)}`, 'gray') : '',
    task.estimate !== null ? tag(String(task.estimate), 'gray') : '',
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

  const card = `${priority}${type} ${label} ${title}${suffix.length > 0 ? ` ${suffix}` : ''}`;
  return FINISHED.has(task.status) ? `{gray-fg}${stripTags(card)}{/}` : card;
}

/**
 * Marks the selected card.
 *
 * The highlight is drawn into the text rather than delegated to the list
 * widget: a non-interactive list ignores `select()`, and making it interactive
 * would put it back in competition for the keyboard.
 */
export function decorateCard(card: string, selected: boolean, width = 0): string {
  if (!selected) return ` ${card}`;
  // The pointer takes the gutter the other rows leave blank, so the selected
  // card stays in the same columns and is still findable without colour.
  // Given a width, the bar runs to the column edge instead of stopping ragged.
  const text = `▸${stripTags(card)}`;
  const pad = Math.max(0, width - [...text].length);
  return `{cyan-bg}{black-fg}${text}${' '.repeat(pad)}{/}`;
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

/**
 * The key hints along the bottom, most used first.
 *
 * Help and quit close the strip and are never dropped. The full strip is wider
 * than most terminals and was cut off before "? help" even at 140 columns, so
 * the one key that explains the rest was the one nobody saw.
 */
export const HINTS: ReadonlyArray<readonly [string, string]> = [
  ['←→↑↓', 'move'],
  ['enter', 'details'],
  ['[ ]', 'shift'],
  ['m', 'status'],
  ['C', 'claim'],
  ['a', 'assign'],
  ['c', 'comment'],
  ['e', 'edit'],
  ['n', 'new'],
  ['/', 'filter'],
  ['R', 'ready'],
  ['s', 'sprint'],
  ['b', 'branch'],
  ['M', 'milestone'],
  ['?', 'help'],
  ['q', 'quit'],
];

/** The hints as plain text, two spaces apart. */
export const KEY_HINTS = HINTS.map(([key, text]) => `${key} ${text}`).join('  ');

const ALWAYS_SHOWN = new Set(['?', 'q']);
const HINT_GAP = '   ';

/**
 * The hints that fit in `width` columns: the key in the text colour, its
 * meaning dimmed. Whole hints are dropped from the end of the optional ones,
 * never cut in half.
 */
export function fitHints(hints: ReadonlyArray<readonly [string, string]>, width: number): string {
  const plain = ([key, text]: readonly [string, string]): string => `${key} ${text}`;
  const styled = ([key, text]: readonly [string, string]): string =>
    `{bold}${key}{/bold} {gray-fg}${text}{/gray-fg}`;

  const tail = hints.filter(([key]) => ALWAYS_SHOWN.has(key));
  const body = hints.filter(([key]) => !ALWAYS_SHOWN.has(key));

  let used = 1 + [...tail.map(plain).join(HINT_GAP)].length;
  const shown: Array<readonly [string, string]> = [];
  for (const hint of body) {
    const cost = [...plain(hint)].length + HINT_GAP.length;
    if (used + cost > width) break;
    shown.push(hint);
    used += cost;
  }
  return ` ${[...shown, ...tail].map(styled).join(HINT_GAP)}`;
}

/**
 * Column widths that add up to the screen.
 *
 * Percentages left a gap at the right and uneven seams between columns, and an
 * empty column took as much room as one holding eighty tasks, which left each
 * card three characters of title. An empty column now keeps just enough width
 * for its label, and the columns holding work share the rest.
 */
export function columnWidths(
  total: number,
  columns: ReadonlyArray<{ label: string; empty: boolean }>,
): number[] {
  const n = columns.length;
  if (n === 0) return [];

  const split = (room: number, count: number): number[] =>
    Array.from({ length: count }, (_, i) => Math.floor(room / count) + (i < room % count ? 1 : 0));

  const emptyCount = columns.filter((c) => c.empty).length;
  if (emptyCount === 0 || emptyCount === n) return split(total, n);

  // A label is drawn two cells in from the corner and needs a cell of frame
  // after it; any narrower and blessed clips it.
  const fair = Math.floor(total / n);
  const compact = columns.map((c) => Math.min(fair, Math.max(12, c.label.length + 4)));
  const room = total - columns.reduce((sum, c, i) => sum + (c.empty ? compact[i]! : 0), 0);
  const shares = split(room, n - emptyCount);

  let next = 0;
  return columns.map((c, i) => (c.empty ? compact[i]! : shares[next++]!));
}
