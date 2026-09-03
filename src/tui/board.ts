import blessed from 'blessed';
import type { Task, ProjectState } from '../core/projection.js';
import { THEME, statusColor, renderCard, KEY_HINTS } from './theme.js';

/**
 * The interactive board.
 *
 * Columns side by side, as a kanban actually looks. The plain `flowit board`
 * stays a list because a pipe has no width to negotiate; here the terminal is
 * ours for the session, so the grid is worth its cost.
 */

export interface BoardCallbacks {
  /** Re-reads the journal; the board never caches state of its own. */
  reload: () => { state: ProjectState; warnings: string[] };
  move: (taskId: string, status: string) => string | null;
  assign: (taskId: string, who: string) => string | null;
  create: (title: string) => string | null;
  remove: (taskId: string) => string | null;
  /** Hands the terminal to $EDITOR and gives it back. */
  edit: (taskId: string) => string | null;
}

interface Column {
  status: string;
  box: blessed.Widgets.BoxElement;
  list: blessed.Widgets.ListElement;
  tasks: Task[];
}

const CANCELLED = 'cancelled';

export function runBoardUi(callbacks: BoardCallbacks): void {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'FlowIt',
    fullUnicode: true,
    // Mouse is on: dragging a card between columns is the one interaction
    // that is genuinely faster with a pointer than with keys.
    mouse: true,
  });

  let { state } = callbacks.reload();
  let filter = '';
  let columns: Column[] = [];
  let focused = 0;

  const header = blessed.box({
    parent: screen,
    top: 0,
    height: 1,
    width: '100%',
    tags: true,
    style: { fg: THEME.headerFg, bg: THEME.headerBg },
  });

  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    height: 1,
    width: '100%',
    tags: true,
    content: ` ${KEY_HINTS}`,
    style: { fg: THEME.hint },
  });

  const status = blessed.box({
    parent: screen,
    bottom: 1,
    height: 1,
    width: '100%',
    tags: true,
    style: { fg: THEME.warn },
  });

  function say(text: string, color: string = THEME.warn): void {
    status.setContent(` ${text}`);
    status.style.fg = color;
    screen.render();
  }

  function visibleStatuses(): string[] {
    const configured = state.statuses.filter((s) => s !== CANCELLED);
    // A column another branch removed still holds work, so it keeps a place.
    const orphans = state.orphanStatuses.filter((s) => s !== CANCELLED);
    return [...configured, ...orphans];
  }

  function tasksFor(st: string): Task[] {
    const needle = filter.toLowerCase();
    return state.tasks.filter(
      (t) =>
        t.status === st &&
        (needle === '' ||
          t.title.toLowerCase().includes(needle) ||
          (t.assignee ?? '').toLowerCase().includes(needle) ||
          t.labels.some((l) => l.toLowerCase().includes(needle))),
    );
  }

  function build(): void {
    for (const c of columns) c.box.destroy();
    columns = [];

    const statuses = visibleStatuses();
    const width = Math.max(Math.floor(100 / Math.max(statuses.length, 1)), 12);

    statuses.forEach((st, i) => {
      const box = blessed.box({
        parent: screen,
        top: 1,
        left: `${i * width}%`,
        width: `${width}%`,
        bottom: 2,
        label: ` ${st} `,
        border: { type: 'line' },
        style: { border: { fg: THEME.border }, label: { fg: statusColor(st) } },
      });

      const list = blessed.list({
        parent: box,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        keys: false,
        mouse: true,
        tags: true,
        scrollable: true,
        style: {
          selected: { fg: THEME.selectedFg, bg: THEME.selectedBg },
          item: { fg: 'white' },
        },
      });

      columns.push({ status: st, box, list, tasks: [] });
    });
  }

  function refresh(reload = false): void {
    if (reload) state = callbacks.reload().state;

    if (columns.length !== visibleStatuses().length) build();

    let total = 0;
    let points = 0;

    columns.forEach((col, i) => {
      col.tasks = tasksFor(col.status);
      total += col.tasks.length;
      points += col.tasks.reduce((n, t) => n + (t.estimate ?? 0), 0);

      const innerWidth = (col.box.width as number) - 4;
      col.list.setItems(col.tasks.map((t) => renderCard(t, innerWidth)));

      const sum = col.tasks.reduce((n, t) => n + (t.estimate ?? 0), 0);
      col.box.setLabel(` ${col.status} (${col.tasks.length}${sum > 0 ? `, ${sum}` : ''}) `);
      col.box.style.border.fg = i === focused ? THEME.borderFocus : THEME.border;

      if (i === focused) col.list.focus();
    });

    const active = state.sprints.find((s) => s.status === 'active');
    const sprintName = active === undefined ? 'no active sprint' : active.name;
    const filterNote = filter === '' ? '' : `  filter: "${filter}"`;
    header.setContent(` FlowIt  ${sprintName}  ${total} tasks, ${points} points${filterNote}`);

    if (state.cycles.length > 0) {
      say(`${state.cycles.length} dependency cycle(s) — see flowit task list`, THEME.danger);
    }
    screen.render();
  }

  function current(): Task | undefined {
    const col = columns[focused];
    if (col === undefined) return undefined;
    return col.tasks[(col.list as unknown as { selected: number }).selected];
  }

  /** Runs an action, reports its message, and reloads the board. */
  function act(result: string | null): void {
    if (result !== null) say(result, THEME.warn);
    else say('');
    refresh(true);
  }

  function prompt(label: string, initial: string, onDone: (value: string) => void): void {
    const box = blessed.prompt({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 7,
      border: { type: 'line' },
      style: { border: { fg: THEME.borderFocus } },
      keys: true,
      mouse: true,
    });
    box.input(label, initial, (_err, value) => {
      box.destroy();
      screen.render();
      if (typeof value === 'string' && value.trim().length > 0) onDone(value.trim());
    });
  }

  function showDetail(task: Task): void {
    const lines = [
      `{cyan-fg}${task.label}{/}  ${task.title}`,
      '',
      task.description ?? '{gray-fg}(no description){/}',
      '',
      `status    ${task.status}`,
      `type      ${task.type}`,
      `priority  ${task.priority}`,
      `assignee  ${task.assignee ?? '—'}`,
      `estimate  ${task.estimate ?? '—'}`,
      `due       ${task.due ?? '—'}`,
      task.labels.length > 0 ? `labels    ${task.labels.join(', ')}` : '',
      task.loggedHours > 0 ? `logged    ${task.loggedHours.toFixed(1)}h` : '',
      '',
      ...(task.comments.length > 0
        ? [`{gray-fg}comments (${task.comments.length}){/}`, ...task.comments.map((c) => `  ${c.author}: ${c.text}`)]
        : []),
      '',
      '{gray-fg}press any key to close{/}',
    ].filter((l) => l !== '');

    const box = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '70%',
      height: '70%',
      border: { type: 'line' },
      style: { border: { fg: THEME.borderFocus } },
      tags: true,
      scrollable: true,
      keys: true,
      mouse: true,
      content: lines.join('\n'),
    });
    box.focus();
    box.key(['escape', 'q', 'enter', 'space'], () => {
      box.destroy();
      refresh();
    });
    screen.render();
  }

  // ---- keys -------------------------------------------------------------

  screen.key(['left', 'h'], () => {
    focused = Math.max(0, focused - 1);
    refresh();
  });
  screen.key(['right', 'l'], () => {
    focused = Math.min(columns.length - 1, focused + 1);
    refresh();
  });
  screen.key(['up', 'k'], () => {
    (columns[focused]?.list as unknown as { up: (n: number) => void })?.up(1);
    screen.render();
  });
  screen.key(['down', 'j'], () => {
    (columns[focused]?.list as unknown as { down: (n: number) => void })?.down(1);
    screen.render();
  });

  screen.key(['enter'], () => {
    const task = current();
    if (task !== undefined) showDetail(task);
  });

  // Moving with [ and ] mirrors dragging: the card shifts one column at a time.
  screen.key(['[', ']'], (_ch, key) => {
    const task = current();
    if (task === undefined) return;
    const delta = key.full === ']' ? 1 : -1;
    const target = columns[focused + delta];
    if (target === undefined) return;
    act(callbacks.move(task.id, target.status));
    focused += delta;
    refresh();
  });

  screen.key(['m'], () => {
    const task = current();
    if (task === undefined) return;
    prompt(`Move ${task.label} to (${visibleStatuses().join(', ')}):`, '', (value) =>
      act(callbacks.move(task.id, value)),
    );
  });

  screen.key(['a'], () => {
    const task = current();
    if (task === undefined) return;
    prompt(`Assign ${task.label} to (or "none"):`, task.assignee ?? '', (value) =>
      act(callbacks.assign(task.id, value)),
    );
  });

  screen.key(['n'], () => {
    prompt('New task title:', '', (value) => act(callbacks.create(value)));
  });

  screen.key(['d'], () => {
    const task = current();
    if (task === undefined) return;
    prompt(`Delete ${task.label}? type "yes":`, '', (value) => {
      if (value.toLowerCase() === 'yes') act(callbacks.remove(task.id));
      else say('Not deleted.');
    });
  });

  screen.key(['e'], () => {
    const task = current();
    if (task === undefined) return;
    // The editor needs the raw terminal, so blessed must let go of it first.
    screen.leave();
    const result = callbacks.edit(task.id);
    screen.enter();
    act(result);
  });

  screen.key(['/'], () => {
    prompt('Filter (title, assignee or label):', filter, (value) => {
      filter = value === '*' ? '' : value;
      refresh();
    });
  });

  screen.key(['escape'], () => {
    if (filter !== '') {
      filter = '';
      say('Filter cleared.');
      refresh();
    }
  });

  screen.key(['r'], () => {
    say('Reloaded.');
    refresh(true);
  });

  screen.key(['?'], () => {
    say(KEY_HINTS, THEME.hint);
  });

  screen.key(['q', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  // ---- mouse ------------------------------------------------------------

  let dragging: { task: Task; from: number } | null = null;

  columns.forEach(() => undefined); // columns are built in refresh()

  screen.on('mousedown', (data: { x: number; y: number }) => {
    const index = columns.findIndex((c) => {
      const left = c.box.left as number;
      return data.x >= left && data.x < left + (c.box.width as number);
    });
    if (index === -1) return;

    focused = index;
    const col = columns[index]!;
    const row = data.y - (col.box.top as number) - 1;
    const task = col.tasks[row];
    if (task !== undefined) dragging = { task, from: index };
    refresh();
  });

  screen.on('mouseup', (data: { x: number; y: number }) => {
    if (dragging === null) return;
    const target = columns.findIndex((c) => {
      const left = c.box.left as number;
      return data.x >= left && data.x < left + (c.box.width as number);
    });

    if (target !== -1 && target !== dragging.from) {
      act(callbacks.move(dragging.task.id, columns[target]!.status));
      focused = target;
      refresh();
    }
    dragging = null;
  });

  build();
  refresh();
}
