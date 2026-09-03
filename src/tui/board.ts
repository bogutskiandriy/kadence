import blessed from 'blessed';
import type { Task, ProjectState } from '../core/projection.js';
import { THEME, statusColor, renderCard, decorateCard, renderField, KEY_HINTS } from './theme.js';
import {
  createKeyRouter,
  moveCursor,
  isCloseKey,
  isScrollKey,
  isControlChar,
  type KeyEvent,
} from './keys.js';

/**
 * The interactive board.
 *
 * Columns side by side, as a kanban actually looks. The plain `kadence board`
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
  comment: (taskId: string, text: string) => string | null;
  /** Any editable field; the value is validated by the same command the CLI uses. */
  setField: (taskId: string, field: string, value: string) => string | null;
  logTime: (taskId: string, duration: string) => string | null;
  setPriority: (taskId: string, priority: string) => string | null;
  addToSprint: (taskId: string) => string | null;
  sprintStatus: () => string;
  sprintStart: () => string | null;
  sprintClose: () => string | null;
  burndown: () => string;
}

interface Column {
  status: string;
  box: blessed.Widgets.BoxElement;
  list: blessed.Widgets.ListElement;
  tasks: Task[];
  /** Selection is tracked here, not by the widget, so only this code moves it. */
  cursor: number;
}

const CANCELLED = 'cancelled';

export function runBoardUi(callbacks: BoardCallbacks): void {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'kadence',
    fullUnicode: true,
    // Mouse is on: dragging a card between columns is the one interaction
    // that is genuinely faster with a pointer than with keys.
    mouse: true,
  });

  let { state } = callbacks.reload();
  let filter = '';
  let columns: Column[] = [];
  let focused = 0;

  /**
   * One router owns the keyboard.
   *
   * Widget focus is deliberately not used for input: blessed delivers a
   * keystroke to several listeners in the same tick, which made the Enter that
   * opened a dialog fire inside it, and left arrow keys going wherever focus
   * happened to be. See src/tui/keys.ts.
   */
  const router = createKeyRouter((event) => handleBoardKey(event));

  /**
   * Last-resort exit.
   *
   * Ctrl-C reaches the process as a signal, not always as a keystroke: inside
   * a dialog that owns the input stream the byte never arrives, and the board
   * would hang with no way out. A signal handler cannot be intercepted by a
   * widget, so this always works.
   */
  function quit(code = 0): never {
    try {
      screen.destroy();
    } catch {
      // The screen may already be gone; exiting still matters more.
    }
    process.exit(code);
  }

  process.on('SIGINT', () => quit(0));
  process.on('SIGTERM', () => quit(0));

  // Keys are read from the program, not the screen.
  //
  // screen.on('keypress') only fires for the focused element, and this board
  // deliberately gives focus to nothing — so nothing was firing at all. The
  // program is the raw keystroke stream and is always live.
  screen.program.on('keypress', (ch: string, key: { name: string }) => {
    const event: KeyEvent = { ch: ch ?? '', name: key?.name ?? '' };

    // Ctrl-C still quits; every other control character is dropped so a stray
    // Ctrl-D cannot trigger the letter it shares a name with.
    if (event.name === 'C-c' || event.ch === '\u0003') quit(0);
    if (isControlChar(event) && event.name !== 'enter' && event.name !== 'escape') {
      return;
    }

    router.dispatch(event);
  });

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
        // Display only: input goes through the router, never through widget
        // focus, so a list must not compete for keys.
        keys: false,
        mouse: false,
        interactive: false,
        tags: true,
        scrollable: true,
        style: {
          selected: { fg: THEME.selectedFg, bg: THEME.selectedBg },
          item: { fg: 'white' },
        },
      });

      columns.push({ status: st, box, list, tasks: [], cursor: 0 });
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
      col.cursor = Math.min(col.cursor, Math.max(0, col.tasks.length - 1));
      col.list.setItems(
        col.tasks.map((t, row) => decorateCard(renderCard(t, innerWidth), i === focused && row === col.cursor)),
      );

      const sum = col.tasks.reduce((n, t) => n + (t.estimate ?? 0), 0);
      col.box.setLabel(` ${col.status} (${col.tasks.length}${sum > 0 ? `, ${sum}` : ''}) `);
      col.box.style.border.fg = i === focused ? THEME.borderFocus : THEME.border;
    });

    const active = state.sprints.find((s) => s.status === 'active');
    const sprintName = active === undefined ? 'no active sprint' : active.name;
    const filterNote = filter === '' ? '' : `  filter: "${filter}"`;
    header.setContent(` kadence  ${sprintName}  ${total} tasks, ${points} points${filterNote}`);

    if (state.cycles.length > 0) {
      say(`${state.cycles.length} dependency cycle(s) — see kadence task list`, THEME.danger);
    }
    screen.render();
  }

  function current(): Task | undefined {
    const col = columns[focused];
    return col?.tasks[col.cursor];
  }

  /** Repaints selection without reloading state. */
  function paintSelection(): void {
    columns.forEach((col, i) => {
      const innerWidth = (col.box.width as number) - 4;
      col.list.setItems(
        col.tasks.map((t, row) => decorateCard(renderCard(t, innerWidth), i === focused && row === col.cursor)),
      );
      col.box.style.border.fg = i === focused ? THEME.borderFocus : THEME.border;
    });
    screen.render();
  }

  /** Runs an action, reports its message, and reloads the board. */
  function act(result: string | null): void {
    if (result !== null) say(result, THEME.warn);
    else say('');
    refresh(true);
  }

  function prompt(label: string, initial: string, onDone: (value: string) => void): void {
    const release = router.push(() => undefined); // prompt owns its own input
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
      release();
      screen.render();
      if (typeof value === 'string') onDone(value.trim());
    });
  }

  /**
   * The task card, editable in place.
   *
   * A read-only dialog forces people back to the command line for a typo in a
   * title, which is exactly the friction an interactive board exists to remove.
   * Each row is a field; enter edits it through the same command the CLI calls,
   * so validation and history are identical either way.
   */
  function showDetail(task: Task): void {
    const box = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '75%',
      height: '80%',
      border: { type: 'line' },
      label: ` ${task.label} `,
      style: { border: { fg: THEME.borderFocus } },
      tags: true,
      keys: true,
      mouse: true,
    });

    const fields: Array<{ key: string; label: string; value: () => string; hint: string }> = [
      { key: 'title', label: 'title', value: () => task.title, hint: 'Title:' },
      {
        key: 'description',
        label: 'description',
        value: () => (task.description ?? '—').split('\n')[0] ?? '—',
        hint: 'Description (one line here, e for $EDITOR):',
      },
      { key: 'status', label: 'status', value: () => task.status, hint: `Status (${visibleStatuses().join(', ')}):` },
      { key: 'type', label: 'type', value: () => task.type, hint: 'Type (task, bug, story, epic):' },
      { key: 'priority', label: 'priority', value: () => task.priority, hint: 'Priority (low, normal, high, urgent):' },
      { key: 'assignee', label: 'assignee', value: () => task.assignee ?? '—', hint: 'Assignee (or "none"):' },
      { key: 'estimate', label: 'estimate', value: () => (task.estimate === null ? '—' : String(task.estimate)), hint: 'Estimate in points:' },
      { key: 'due', label: 'due', value: () => task.due ?? '—', hint: 'Due date YYYY-MM-DD (empty clears):' },
      { key: 'labels', label: 'labels', value: () => (task.labels.length > 0 ? task.labels.join(', ') : '—'), hint: 'Labels, comma separated:' },
    ];

    // Display only. A focusable list here swallowed escape and q before the
    // dialog ever saw them, which is why the window would not close.
    const list = blessed.list({
      parent: box,
      top: 0,
      left: 1,
      right: 1,
      height: fields.length,
      keys: false,
      mouse: false,
      interactive: false,
      tags: true,
      style: { selected: { fg: THEME.selectedFg, bg: THEME.selectedBg } },
    });

    // Selection is tracked here rather than by the widget, so the only thing
    // that can change it is this dialog's own key handler.
    let cursor = 0;

    const info = blessed.box({
      parent: box,
      top: fields.length + 1,
      left: 1,
      right: 1,
      bottom: 0,
      tags: true,
      scrollable: true,
    });

    function paintFields(): void {
      // Selection is drawn, not delegated: this list is display-only.
      list.setItems(fields.map((f, i) => renderField(f.label, f.value(), i === cursor)));

      const extra = [
        task.blockedBy.length > 0 ? `{red-fg}blocked by ${task.blockedBy.length} task(s){/}` : '',
        task.parent !== null ? '{gray-fg}has a parent{/}' : '',
        task.loggedHours > 0 ? `{gray-fg}logged ${task.loggedHours.toFixed(1)}h{/}` : '',
        '',
        task.description !== null && task.description.includes('\n')
          ? `{gray-fg}${task.description.split('\n').slice(1).join('\n')}{/}`
          : '',
        task.comments.length > 0 ? `{cyan-fg}comments (${task.comments.length}){/}` : '',
        ...task.comments.map((c) => `  {gray-fg}${c.author}:{/} ${c.text}`),
        '',
        '{gray-fg}↑↓ field   enter edit   e description in $EDITOR   esc close{/}',
        '{gray-fg}description opens the editor, so it can hold paragraphs{/}',
      ].filter((l) => l !== '');

      info.setContent(extra.join('\n'));
      screen.render();
    }

    paintFields();

    const release = router.push((event) => onDetailKey(event));
    const close = (): void => {
      release();
      box.destroy();
      refresh(true);
    };

    /** Re-reads the task so the dialog shows what was actually saved. */
    function reloadTask(): void {
      state = callbacks.reload().state;
      const fresh = state.tasks.find((t) => t.id === task.id);
      if (fresh === undefined) {
        close();
        return;
      }
      Object.assign(task, fresh);
      paintFields();
    }

    /** Opens $EDITOR for the description and refreshes the dialog. */
    function editDescription(): void {
      const result = withEditor(() => callbacks.edit(task.id));
      if (result !== null) say(result);
      reloadTask();
    }

    function onDetailKey(event: KeyEvent): void {
      const { ch, name } = event;

      if (name === 'up' || ch === 'k') {
        cursor = moveCursor(cursor, -1, fields.length);
        return paintFields();
      }
      if (name === 'down' || ch === 'j') {
        cursor = moveCursor(cursor, 1, fields.length);
        return paintFields();
      }
      if (isCloseKey(event)) return close();
      if (ch === 'e') return editDescription();

      if (name === 'enter') {
        const field = fields[cursor];
        if (field === undefined) return;

        // A description has paragraphs; a one-line prompt cannot hold one, so
        // this field always goes to the editor.
        if (field.key === 'description') return editDescription();

        prompt(field.hint, field.value() === '—' ? '' : field.value(), (value) => {
          const result = callbacks.setField(task.id, field.key, value);
          if (result !== null) say(result);
          reloadTask();
        });
      }
    }

    screen.render();
  }

  /** A proper help dialog — the footer already carries the short version. */
  function showHelp(): void {
    const rows = [
      '{cyan-fg}Navigation{/}',
      '  ← →  h l      move between columns',
      '  ↑ ↓  k j      move between tasks',
      '  enter         task details',
      '  /             filter    escape clears it',
      '  r             reload from the journal',
      '',
      '{cyan-fg}Task actions{/}',
      '  [ ]           move one column left or right',
      '  m             move to a named status',
      '  a             assign        c  comment',
      '  e             edit description in $EDITOR',
      '  p             priority      t  log time',
      '  n             new task      d  delete',
      '',
      '{cyan-fg}Sprint{/}',
      '  s             sprint menu: status, start, close, burndown',
      '  S             add the selected task to the active sprint',
      '',
      '{cyan-fg}Mouse{/}',
      '  click         select a card',
      '  drag          move a card to another column',
      '',
      '{gray-fg}press any key to close{/}',
    ];

    const box = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: Math.min(rows.length + 2, 30),
      border: { type: 'line' },
      label: ' Keys ',
      style: { border: { fg: THEME.borderFocus } },
      tags: true,
      scrollable: true,
      keys: true,
      mouse: true,
      content: rows.join('\n'),
    });

    const release = router.push((event) => {
      if (isScrollKey(event)) return;
      release();
      box.destroy();
      refresh();
    });
    box.on('click', () => {
      release();
      box.destroy();
      refresh();
    });
    screen.render();
  }

  /**
   * A scrollable report with optional actions.
   *
   * The body is plain text produced by the same code the CLI prints, so the
   * board can never show a different velocity than `kadence sprint status`.
   */
  function showReport(
    title: string,
    body: string,
    actions: Array<{ key: string; label: string; run: () => void }>,
  ): void {
    const hint =
      actions.length > 0
        ? `\n\n{gray-fg}${actions.map((a) => `${a.key} ${a.label}`).join('   ')}   esc close{/}`
        : '\n\n{gray-fg}press any key to close{/}';

    const box = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '70%',
      border: { type: 'line' },
      label: ` ${title} `,
      style: { border: { fg: THEME.borderFocus } },
      tags: true,
      scrollable: true,
      mouse: true,
      content: body + hint,
    });

    const release = router.push((event) => {
      if (isScrollKey(event)) return;

      const action = actions.find((a) => a.key === event.ch);
      release();
      box.destroy();

      if (action !== undefined) action.run();
      else refresh();
    });
    screen.render();
  }

  // ---- keys -------------------------------------------------------------

  /**
   * Every board keystroke, in one place.
   *
   * A switch rather than a dozen `screen.key` registrations: with one entry
   * point it is impossible for two handlers to claim the same key, and the
   * router guarantees a dialog sees nothing meant for the board.
   */
  function handleBoardKey(event: KeyEvent): void {
    const { ch, name } = event;

    if (name === 'left' || ch === 'h') {
      focused = Math.max(0, focused - 1);
      return refresh();
    }
    if (name === 'right' || ch === 'l') {
      focused = Math.min(columns.length - 1, focused + 1);
      return refresh();
    }
    if (name === 'up' || ch === 'k') {
      const col = columns[focused];
      if (col !== undefined) {
        col.cursor = moveCursor(col.cursor, -1, col.tasks.length);
        paintSelection();
      }
      return;
    }
    if (name === 'down' || ch === 'j') {
      const col = columns[focused];
      if (col !== undefined) {
        col.cursor = moveCursor(col.cursor, 1, col.tasks.length);
        paintSelection();
      }
      return;
    }

    if (name === 'enter') {
      const task = current();
      if (task !== undefined) showDetail(task);
      return;
    }

    // [ and ] mirror dragging: the card shifts one column at a time.
    if (ch === '[' || ch === ']') {
      const task = current();
      if (task === undefined) return;
      const delta = ch === ']' ? 1 : -1;
      const target = columns[focused + delta];
      if (target === undefined) return;
      act(callbacks.move(task.id, target.status));
      focused += delta;
      return refresh();
    }

    if (ch === 'm') {
      const task = current();
      if (task === undefined) return;
      return prompt(`Move ${task.label} to (${visibleStatuses().join(', ')}):`, '', (value) =>
        act(callbacks.move(task.id, value)),
      );
    }
    if (ch === 'a') {
      const task = current();
      if (task === undefined) return;
      return prompt(`Assign ${task.label} to (or "none"):`, task.assignee ?? '', (value) =>
        act(callbacks.assign(task.id, value)),
      );
    }
    if (ch === 'c') {
      const task = current();
      if (task === undefined) return;
      return prompt(`Comment on ${task.label}:`, '', (value) =>
        act(callbacks.comment(task.id, value)),
      );
    }
    if (ch === 't') {
      const task = current();
      if (task === undefined) return;
      return prompt(`Log time on ${task.label} (2h, 90m, -30m):`, '', (value) =>
        act(callbacks.logTime(task.id, value)),
      );
    }
    if (ch === 'p') {
      const task = current();
      if (task === undefined) return;
      return prompt(
        `Priority for ${task.label} (low, normal, high, urgent):`,
        task.priority,
        (value) => act(callbacks.setPriority(task.id, value)),
      );
    }
    if (ch === 'n') {
      return prompt('New task title:', '', (value) => act(callbacks.create(value)));
    }
    if (ch === 'd') {
      const task = current();
      if (task === undefined) return;
      return prompt(`Delete ${task.label}? type "yes":`, '', (value) => {
        if (value.toLowerCase() === 'yes') act(callbacks.remove(task.id));
        else say('Not deleted.');
      });
    }
    if (ch === 'e') {
      const task = current();
      if (task === undefined) return;
      return act(withEditor(() => callbacks.edit(task.id)));
    }

    if (ch === 'S') {
      const task = current();
      if (task === undefined) return;
      return act(callbacks.addToSprint(task.id));
    }
    if (ch === 's') {
      return showReport('Sprint', callbacks.sprintStatus(), [
        { key: 'b', label: 'burndown', run: () => showReport('Burndown', callbacks.burndown(), []) },
        { key: 'n', label: 'start next sprint', run: () => act(callbacks.sprintStart()) },
        { key: 'x', label: 'close sprint', run: () => act(callbacks.sprintClose()) },
      ]);
    }

    if (ch === '/') {
      return prompt('Filter (title, assignee or label):', filter, (value) => {
        filter = value === '*' ? '' : value;
        refresh();
      });
    }
    if (name === 'escape' && filter !== '') {
      filter = '';
      say('Filter cleared.');
      return refresh();
    }

    if (ch === 'r') {
      say('Reloaded.');
      return refresh(true);
    }
    if (ch === '?') return showHelp();

    if (ch === 'q' || name === 'C-c') quit(0);
  }

  /** Hands the terminal to $EDITOR and takes it back. */
  function withEditor(run: () => string | null): string | null {
    const term = screen as unknown as { leave: () => void; enter: () => void };
    term.leave();
    const result = run();
    term.enter();
    return result;
  }

  // ---- mouse ------------------------------------------------------------

  let dragging: { task: Task; from: number } | null = null;

  columns.forEach(() => undefined); // columns are built in refresh()

  screen.on('mousedown', (data: { x: number; y: number }) => {
    if (router.isDialogOpen()) return;
    const index = columns.findIndex((c) => {
      const left = c.box.left as number;
      return data.x >= left && data.x < left + (c.box.width as number);
    });
    if (index === -1) return;

    focused = index;
    const col = columns[index]!;
    const row = data.y - (col.box.top as number) - 1;
    const task = col.tasks[row];
    if (task !== undefined) {
      col.cursor = row;
      dragging = { task, from: index };
    }
    refresh();
  });

  screen.on('mouseup', (data: { x: number; y: number }) => {
    if (router.isDialogOpen() || dragging === null) return;
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
