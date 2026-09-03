import type { Task, Priority, Cycle } from '../core/projection.js';

/**
 * Human-facing output.
 *
 * Colours and tables are hand-rolled: `picocolors` costs 7.7 ms to import, and
 * we need five colours and three aligned columns (ADR-004).
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
  // NO_COLOR is the established convention; honour it without exceptions.
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

/**
 * Longest title shown in lists and on the board.
 *
 * A 250-character title otherwise stretches every row and turns the board into
 * a wall of text. The full title is always available in `task show`.
 */
const TITLE_LIMIT = 72;

/** Truncates on a character boundary, so multi-byte titles stay intact. */
function truncate(text: string, limit: number = TITLE_LIMIT): string {
  const chars = [...text];
  return chars.length <= limit ? text : `${chars.slice(0, limit - 1).join('')}…`;
}

/** Width in characters, not bytes — titles may be non-ASCII. */
function width(s: string): number {
  return [...s].length;
}

function pad(s: string, n: number): string {
  const diff = n - width(s);
  return diff > 0 ? s + ' '.repeat(diff) : s;
}

export function renderTaskTable(tasks: readonly Task[], colors: boolean): string {
  if (tasks.length === 0) {
    return 'No tasks yet.\nCreate the first one:\n  flowit task add "title"';
  }

  const labelW = Math.max(...tasks.map((t) => width(t.label)), 2);
  const statusW = Math.max(...tasks.map((t) => width(t.status)), 6);

  return tasks
    .map((t) => {
      const label = paint(pad(t.label, labelW), ANSI.bold, colors);
      const status = paint(pad(t.status, statusW), STATUS_COLOR[t.status] ?? ANSI.dim, colors);
      const estimate = t.estimate === null ? '' : paint(` (${t.estimate})`, ANSI.dim, colors);
      return `${label}  ${status}  ${truncate(t.title)}${estimate}`;
    })
    .join('\n');
}

/**
 * The conflict-free merge notice.
 *
 * Without it the product's main advantage happens invisibly: the user never
 * learns they just avoided a manual reconciliation, and so never values it.
 * Phrased as a fact — no "successfully", no exclamation marks, no self-praise.
 */
export function describeMerge(count: number): string | null {
  if (count <= 0) return null;
  return `Merged ${count} ${count === 1 ? 'change' : 'changes'} from another branch, no conflicts.`;
}



const PRIORITY_MARK: Record<Priority, string> = {
  urgent: '!!',
  high: '!',
  normal: '',
  low: 'v',
};

const TYPE_MARK: Record<string, string> = {
  bug: 'BUG',
  story: 'STORY',
  task: '',
};

/** One board line: short, but carrying everything that affects the choice. */
function boardLine(t: Task, colors: boolean): string {
  const parts = [paint(t.label, ANSI.bold, colors)];

  const mark = PRIORITY_MARK[t.priority];
  if (mark !== '') {
    parts.push(paint(mark, t.priority === 'low' ? ANSI.dim : ANSI.yellow, colors));
  }

  const type = TYPE_MARK[t.type] ?? '';
  if (type !== '') parts.push(paint(type, ANSI.dim, colors));

  parts.push(truncate(t.title));

  const tail: string[] = [];
  if (t.assignee !== null) tail.push(`@${t.assignee.split('@')[0]}`);
  if (t.estimate !== null) tail.push(`${t.estimate}`);
  if (tail.length > 0) parts.push(paint(`(${tail.join(', ')})`, ANSI.dim, colors));

  return `  ${parts.join(' ')}`;
}

/**
 * Kanban as a list of columns rather than columns side by side.
 *
 * Side-by-side columns break on long titles and in narrow terminals, and
 * horizontal scrolling is the one thing users will not forgive in a CLI.
 */
export function renderBoard(columns: Record<string, Task[]>, colors: boolean): string {
  const total = Object.values(columns).reduce((n, xs) => n + xs.length, 0);
  if (total === 0) {
    return 'No tasks yet.\nCreate the first one:\n  flowit task add "title"';
  }

  const blocks: string[] = [];
  for (const [name, tasks] of Object.entries(columns)) {
    if (tasks.length === 0) continue;
    const points = tasks.reduce((n, t) => n + (t.estimate ?? 0), 0);
    const suffix = points > 0 ? ` — ${points}` : '';
    blocks.push(
      paint(`${name} (${tasks.length}${suffix})`, ANSI.bold, colors),
      ...tasks.map((t) => boardLine(t, colors)),
      '',
    );
  }
  return blocks.join('\n').trimEnd();
}

/**
 * How far off the deadline is, in plain words.
 *
 * A bare date makes the reader do the arithmetic; "overdue by 3 days" does not.
 */
function dueSuffix(due: string, today: Date = new Date()): string {
  const target = Date.parse(`${due}T00:00:00.000Z`);
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(target)) return '';

  const days = Math.round((target - now) / 86_400_000);
  if (days < 0) return `  (overdue by ${-days} day${days === -1 ? '' : 's'})`;
  if (days === 0) return '  (today)';
  if (days === 1) return '  (tomorrow)';
  if (days <= 7) return `  (in ${days} days)`;
  return '';
}

/**
 * Renders tasks as a tree, parents before children.
 *
 * Depth is capped and visited ids tracked: a cycle is reported rather than
 * rejected, so the renderer must survive one instead of recursing forever.
 */
export function renderTaskTree(tasks: readonly Task[], colors: boolean): string {
  if (tasks.length === 0) {
    return 'No tasks yet.\nCreate the first one:\n  flowit task add "title"';
  }

  const visible = new Set(tasks.map((t) => t.id));
  const childrenOf = new Map<string | null, Task[]>();
  for (const t of tasks) {
    // A parent outside the current filter is treated as a root, so filtering
    // never hides a task behind an invisible ancestor.
    const key = t.parent !== null && visible.has(t.parent) ? t.parent : null;
    const list = childrenOf.get(key) ?? [];
    list.push(t);
    childrenOf.set(key, list);
  }

  const lines: string[] = [];
  const seen = new Set<string>();

  const walk = (parent: string | null, depth: number): void => {
    if (depth > 10) return;
    for (const task of childrenOf.get(parent) ?? []) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);

      const indent = '  '.repeat(depth);
      const blocked = task.blockedBy.length > 0 ? paint(' [blocked]', ANSI.yellow, colors) : '';
      lines.push(`${indent}${boardLine(task, colors).trimStart()}${blocked}`);
      walk(task.id, depth + 1);
    }
  };

  walk(null, 0);
  return lines.join('\n');
}

/** Cycle warnings, phrased so the reader knows nothing was silently dropped. */
export function renderCycles(cycles: readonly Cycle[], labels: Map<string, string>): string[] {
  return cycles.map((c) => {
    const path = c.path.map((id) => labels.get(id) ?? id).join(' → ');
    return `Dependency cycle (${c.kind}): ${path}`;
  });
}

/** Task detail: substance first, then classification, then cost. */
export function renderTaskDetail(t: Task): string {
  const lines = [`${t.label}  ${t.title}`, ''];

  if (t.description !== null) lines.push(t.description, '');

  lines.push(`  Status:    ${t.status}`);
  lines.push(`  Type:      ${t.type}`);
  lines.push(`  Priority:  ${t.priority}`);
  if (t.labels.length > 0) lines.push(`  Labels:    ${t.labels.join(', ')}`);
  if (t.parent !== null) lines.push(`  Parent:    ${t.parent}`);
  if (t.blockedBy.length > 0) lines.push(`  Blocked by: ${t.blockedBy.length} task(s)`);
  lines.push(`  Assignee:  ${t.assignee ?? '—'}`);
  lines.push(`  Reporter:  ${t.reporter}`);
  if (t.due !== null) lines.push(`  Due:       ${t.due}${dueSuffix(t.due)}`);
  // Estimate last: what the task is about first, what it costs after.
  lines.push(`  Estimate:  ${t.estimate ?? '—'}`);

  if (t.comments.length > 0) {
    lines.push('', `  Comments (${t.comments.length}):`);
    for (const c of t.comments) {
      lines.push(`    ${c.author} · ${c.ts.slice(0, 10)}`);
      // Indent every line so a multi-line comment stays visually attached.
      for (const line of c.text.split('\n')) lines.push(`      ${line}`);
    }
  }

  if (t.history.length > 0) {
    lines.push('', `  History (${t.history.length}):`);
    for (const h of t.history) {
      const detail = h.type === 'task.moved' ? ` → ${String(h.data['to'])}` : '';
      lines.push(`    ${h.ts.slice(0, 16).replace('T', ' ')}  ${h.actor}  ${h.type}${detail}`);
    }
  }
  return lines.join('\n');
}
