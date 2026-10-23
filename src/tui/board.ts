import blessed from 'blessed';
import type { Task, ProjectState } from '../core/projection.js';
import {
  THEME,
  statusColor,
  renderCard,
  decorateCard,
  renderField,
  HINTS,
  fitHints,
  columnWidths,
  CARD_MARKS,
} from './theme.js';
import { readyTasks } from '../core/query.js';
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
  /**
   * Event ids the current branch introduced, or null outside a branch.
   *
   * Read once per reload rather than per keystroke: it costs a subprocess,
   * and the answer cannot change while the board is open.
   */
  branchEventIds: () =>
    | { ids: Set<string>; name: string; base: string }
    | { reason: 'detached' }
    | { reason: 'no-base'; base: string };
  /**
   * Whose claims count as "mine".
   *
   * Without it `readyTasks` treats every claim as somebody else's, and the
   * ready filter hides the work you just took.
   */
  actor: string;
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
  /** Take a task, or give it back — the same commands the CLI runs. */
  claim: (taskId: string) => string | null;
  release: (taskId: string) => string | null;
  /** Check or uncheck one acceptance criterion by its number. */
  toggleCriterion: (taskId: string, n: number, uncheck: boolean) => string | null;
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
const DONE = 'done';

/** What the header line is made of; everything else about it is wording. */
export interface HeaderFacts {
  /** The active sprint's name, or null — and null says nothing at all. */
  sprint: string | null;
  open: number;
  ready: number;
  decisions: number;
  /** Null when no shown task carries an estimate: "0 points" is not a fact. */
  points: number | null;
  /** The active filters, already formatted, appended as they are. */
  filterNote: string;
}

/**
 * The board's header, as a pure function so it has a test (T113).
 *
 * It used to lead with "no active sprint" and "0 points" — two facts about
 * features a team may never have chosen. What every board has is open work,
 * work ready to start, and the reasons in force, so that is what it says.
 */
export function boardHeader(f: HeaderFacts): string {
  const parts = [
    `${f.open} open`,
    `${f.ready} ready`,
    `${f.decisions} ${f.decisions === 1 ? 'decision' : 'decisions'} in force`,
    ...(f.points === null ? [] : [`${f.points} points`]),
  ];
  // Wide gaps rather than `A · B · C`: on a terminal line the space reads as
  // columns of facts, and the dotted string reads as a template.
  return `kadence   ${f.sprint === null ? '' : `${f.sprint}   `}${parts.join('   ')}${f.filterNote}`;
}

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
  let branch = callbacks.branchEventIds();
  let filter = '';
  /** Show only what can be started right now — the board's `kadence ready`. */
  let readyOnly = false;
  /** Show only what this branch introduced. Off until asked, like `--branch`. */
  let branchOnly = false;
  /** MS-N of the milestone being shown alone, or '' for every task. */
  let milestoneOnly = '';
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

  // No coloured bar: the wordmark in bold and the facts in the text colour.
  // The accent is kept for where the cursor is, not spent on chrome.
  const header = blessed.box({
    parent: screen,
    top: 0,
    height: 1,
    width: '100%',
    tags: true,
  });

  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    height: 1,
    width: '100%',
    tags: true,
    content: fitHints(HINTS, screen.width as number),
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
    // The same function `kadence ready` calls: the board must not grow its own
    // idea of what "ready" means.
    const ready = readyOnly
      ? new Set(
          readyTasks(state.tasks, {
            viewer: callbacks.actor,
            statuses: state.statuses,
            started: state.started,
          }).map((t) => t.id),
        )
      : null;
    // The same rule the CLI uses: created on the branch, or any event about it
    // arrived there.
    // Captured in a local so the narrowing survives into the closure — `branch`
    // is reassigned on reload, so TypeScript cannot keep it narrowed.
    const range = branchOnly && !('reason' in branch) ? branch : null;
    const onBranch =
      range === null
        ? null
        : (t: Task): boolean => range.ids.has(t.id) || t.history.some((h) => range.ids.has(h.id));
    const milestoneId =
      milestoneOnly === ''
        ? null
        : (state.milestones.find((m) => m.label === milestoneOnly)?.id ?? null);
    return state.tasks.filter(
      (t) =>
        t.status === st &&
        (ready === null || ready.has(t.id)) &&
        (onBranch === null || onBranch(t)) &&
        (milestoneId === null || t.milestone === milestoneId) &&
        (needle === '' ||
          t.title.toLowerCase().includes(needle) ||
          (t.assignee ?? '').toLowerCase().includes(needle) ||
          t.labels.some((l) => l.toLowerCase().includes(needle))),
    );
  }

  function build(): void {
    for (const c of columns) c.box.destroy();
    columns = [];

    // Positions are placeholders: layout() sets real ones on every refresh,
    // because how wide a column is depends on whether it holds anything.
    visibleStatuses().forEach((st) => {
      const box = blessed.box({
        parent: screen,
        top: 1,
        left: 0,
        width: 12,
        bottom: 2,
        label: ` ${st} `,
        border: { type: 'line' },
        style: { border: { fg: THEME.border }, label: { fg: statusColor(st), bold: false } },
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
        // No item colour: the terminal's own foreground reads on a light
        // theme as well as a dark one, where white vanished.
        style: {
          selected: { fg: THEME.selectedFg, bg: THEME.selectedBg },
        },
      });

      columns.push({ status: st, box, list, tasks: [], cursor: 0 });
    });
  }

  function refresh(reload = false): void {
    if (reload) {
      state = callbacks.reload().state;
      branch = callbacks.branchEventIds();
    }

    if (columns.length !== visibleStatuses().length) build();

    let open = 0;
    let points = 0;
    let estimated = false;

    columns.forEach((col) => {
      col.tasks = tasksFor(col.status);
      // Points beside "open" are open points; finished work has a column label.
      if (col.status !== DONE) {
        open += col.tasks.length;
        points += col.tasks.reduce((n, t) => n + (t.estimate ?? 0), 0);
      }
      if (col.tasks.some((t) => t.estimate !== null)) estimated = true;
      col.cursor = Math.min(col.cursor, Math.max(0, col.tasks.length - 1));
    });

    layout();
    paintColumns();

    const active = state.sprints.find((s) => s.status === 'active');
    const narrowed =
      (filter === '' ? '' : `  filter: "${filter}"`) +
      (readyOnly ? '  ready only' : '') +
      (branchOnly && !('reason' in branch) ? `  branch: ${branch.name}` : '') +
      (milestoneOnly === '' ? '' : `  milestone: ${milestoneOnly}`);
    // A narrowed board hides work, so the reason it is narrowed takes the
    // accent: the one thing on the header line that changes what you see.
    const filterNote = narrowed === '' ? '' : `{${THEME.accent}-fg}${narrowed}{/${THEME.accent}-fg}`;
    // The same function `kadence ready` calls, over the whole board: a filter
    // narrows the columns, not what can be started.
    const ready = readyTasks(state.tasks, {
      viewer: callbacks.actor,
      statuses: state.statuses,
      started: state.started,
    }).length;
    header.setContent(
      ` ${boardHeader({
        sprint: active === undefined ? null : active.name,
        open,
        ready,
        decisions: state.decisions.filter((d) => d.supersededBy === null).length,
        points: estimated ? points : null,
        filterNote,
      }).replace(/^kadence/, '{bold}kadence{/bold}')}`,
    );

    if (state.cycles.length > 0) {
      const n = state.cycles.length;
      say(`${n} dependency ${n === 1 ? 'cycle' : 'cycles'}. kadence task list shows where.`, THEME.danger);
    }
    screen.render();
  }

  function current(): Task | undefined {
    const col = columns[focused];
    return col?.tasks[col.cursor];
  }

  /** True when something narrows the board, so an empty column means "no match". */
  function isNarrowed(): boolean {
    return filter !== '' || readyOnly || branchOnly || milestoneOnly !== '';
  }

  function columnLabel(col: Column): string {
    const sum = col.tasks.reduce((n, t) => n + (t.estimate ?? 0), 0);
    return ` ${col.status} ${col.tasks.length}${sum > 0 ? `, ${sum} pt` : ''} `;
  }

  /** Sizes the columns to the screen: empty ones narrow, the rest sharing what is left. */
  function layout(): void {
    const labels = columns.map(columnLabel);
    const widths = columnWidths(
      screen.width as number,
      columns.map((col, i) => ({ label: labels[i]!, empty: col.tasks.length === 0 })),
    );
    let left = 0;
    columns.forEach((col, i) => {
      col.box.left = left;
      col.box.width = widths[i]!;
      col.box.setLabel(labels[i]!);
      left += widths[i]!;
    });
  }

  /**
   * Draws every column's cards and the focus.
   *
   * Shared by refresh and by cursor moves, so the two can never disagree
   * about what the selected card looks like.
   */
  function paintColumns(): void {
    columns.forEach((col, i) => {
      const width = col.box.width as number;
      const innerWidth = width - 4;
      const hasFocus = i === focused;

      if (col.tasks.length === 0) {
        // An honest empty state: blank space reads as "still loading".
        col.list.setItems([` {gray-fg}${isNarrowed() ? 'no match' : 'empty'}{/gray-fg}`]);
      } else {
        col.list.setItems(
          col.tasks.map((t, row) =>
            decorateCard(renderCard(t, innerWidth), hasFocus && row === col.cursor, width - 3),
          ),
        );
      }
      // A list that is not interactive never scrolls itself. Without this the
      // cursor could sit on card 87 of a 35-row column, selected and unseen.
      if (hasFocus) col.list.scrollTo(col.cursor);

      col.box.style.border.fg = hasFocus ? THEME.borderFocus : THEME.border;
      col.box.style.label.fg = hasFocus ? THEME.accent : statusColor(col.status);
      col.box.style.label.bold = hasFocus;
    });
  }

  /** Repaints selection without reloading state. */
  function paintSelection(): void {
    paintColumns();
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
      // blessed puts Okay and Cancel on row 5 of the inside; at 7 rows tall
      // that row is the bottom border and the buttons were drawn over it.
      height: 8,
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

    /**
     * The checklist shares the field cursor rather than adding a second one.
     *
     * Two cursors in one dialog is how a keystroke ends up going to whichever
     * one happens to be focused — the bug this TUI already paid for once.
     */
    const rows = (): Array<{ kind: 'field'; index: number } | { kind: 'criterion'; n: number }> => [
      ...fields.map((_, index) => ({ kind: 'field' as const, index })),
      ...task.criteria.map((c) => ({ kind: 'criterion' as const, n: c.n })),
    ];

    // Display only. A focusable list here swallowed escape and q before the
    // dialog ever saw them, which is why the window would not close.
    const list = blessed.list({
      parent: box,
      top: 0,
      left: 1,
      right: 1,
      height: fields.length + task.criteria.length,
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
      top: fields.length + task.criteria.length + 1,
      left: 1,
      right: 1,
      bottom: 2,
      tags: true,
      scrollable: true,
    });

    // The keys stay on the last line whatever the dialog holds; at the end of
    // the text they scrolled away as soon as a task had a few comments.
    const keyLine = blessed.box({
      parent: box,
      bottom: 0,
      left: 1,
      right: 1,
      height: 1,
      tags: true,
    });

    function paintFields(): void {
      // Selection is drawn, not delegated: this list is display-only.
      list.setItems(
        rows().map((row, i) =>
          row.kind === 'field'
            ? renderField(fields[row.index]!.label, fields[row.index]!.value(), i === cursor)
            : renderField(
                `  ${row.n}.`,
                `[${task.criteria.find((c) => c.n === row.n)?.waived ? '-' : task.criteria.find((c) => c.n === row.n)?.checked === true ? 'x' : ' '}] ${
                  task.criteria.find((c) => c.n === row.n)?.text ?? ''
                }`,
                i === cursor,
              ),
        ),
      );

      const extra = [
        task.blockedBy.length > 0 ? `{red-fg}blocked by ${task.blockedBy.length} task(s){/}` : '',
        task.parent !== null ? '{gray-fg}has a parent{/}' : '',
        task.loggedHours > 0 ? `{gray-fg}logged ${task.loggedHours.toFixed(1)}h{/}` : '',
        '',
        task.description !== null && task.description.includes('\n')
          ? `{gray-fg}${task.description.split('\n').slice(1).join('\n')}{/}`
          : '',
        task.comments.length > 0 ? `{bold}comments (${task.comments.length}){/bold}` : '',
        ...task.comments.map((c) => `  {gray-fg}${c.author}:{/} ${c.text}`),
      ].filter((l) => l !== '');

      info.setContent(extra.join('\n'));
      keyLine.setContent(
        fitHints(
          // Closing first: on a narrow terminal the last hints are the ones dropped.
          [
            ['esc', 'close'],
            ['↑↓', 'field'],
            ['enter', 'edit'],
            ...(task.criteria.length > 0 ? [['space', 'check criterion'] as const] : []),
            ['e', 'description in $EDITOR'],
          ],
          (box.width as number) - 4,
        ),
      );
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
        cursor = moveCursor(cursor, -1, rows().length);
        return paintFields();
      }
      if (name === 'down' || ch === 'j') {
        cursor = moveCursor(cursor, 1, rows().length);
        return paintFields();
      }
      if (ch === ' ' || name === 'space') {
        const row = rows()[cursor];
        if (row === undefined || row.kind !== 'criterion') return;
        const found = task.criteria.find((c) => c.n === row.n);
        if (found === undefined) return;
        // The same command the CLI runs: the board must not grow its own idea
        // of what checking a criterion means.
        const result = callbacks.toggleCriterion(task.id, row.n, found.checked);
        if (result !== null) say(result);
        return reloadTask();
      }
      if (isCloseKey(event)) return close();
      if (ch === 'e') return editDescription();

      if (name === 'enter') {
        const row = rows()[cursor];
        if (row !== undefined && row.kind === 'criterion') {
          const found = task.criteria.find((c) => c.n === row.n);
          if (found === undefined) return;
          const result = callbacks.toggleCriterion(task.id, row.n, found.checked);
          if (result !== null) say(result);
          return reloadTask();
        }
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

  /**
   * A proper help dialog; the footer carries the short version.
   *
   * Keys on the left, what a card's marks mean on the right. It used to be 60
   * columns wide and capped at 30 rows, so two lines wrapped mid-sentence and
   * the closing hint fell off the bottom. Side by side it fits a 40-row
   * terminal without scrolling; under about 116 columns it stacks.
   */
  function showHelp(): void {
    const head = (text: string): string => `{bold}${text}{/bold}`;
    const row = (key: string, text: string, width = 11): string => `  ${key.padEnd(width)}{gray-fg}${text}{/gray-fg}`;

    const keys = [
      head('Moving around'),
      row('← → h l', 'move between columns'),
      row('↑ ↓ k j', 'move between tasks'),
      row('enter', 'task details'),
      row('/', 'filter; esc clears it'),
      row('r', 'reload from the journal'),
      row('R', 'only what can be started now'),
      row('b', 'only what this branch introduced'),
      row('M', 'only one milestone; empty clears it'),
      '',
      head('The selected task'),
      row('C', 'claim it, or release it if it is yours'),
      row('[ ]', 'move one column left or right'),
      row('m', 'move to a named status'),
      row('a', 'assign'),
      row('c', 'comment'),
      row('e', 'edit the description in $EDITOR'),
      row('p', 'priority'),
      row('t', 'log time'),
      row('d', 'delete'),
      '',
      head('Board'),
      row('n', 'new task'),
      row('s', 'sprint: status, start, close, burndown'),
      row('S', 'add the selected task to the active sprint'),
      row('q', 'quit; Ctrl-C always works'),
    ];
    const marks = [
      head('Marks on a card'),
      ...CARD_MARKS.map(([glyph, text]) => row(glyph, text, 8)),
      '',
      head('Mouse'),
      row('click', 'select a card', 8),
      row('drag', 'move a card to another column', 8),
    ];

    const visible = (text: string): number => [...text.replace(/\{[^}]*\}/g, '')].length;
    const leftWidth = Math.max(...keys.map(visible)) + 4;
    // Frame, padding, and one spare cell: blessed wraps a line that exactly
    // fills the box.
    const chrome = 7;
    const sideBySide = (screen.width as number) >= leftWidth + Math.max(...marks.map(visible)) + chrome + 2;
    const body = sideBySide
      ? keys.map((line, i) => `${line}${' '.repeat(leftWidth - visible(line))}${marks[i] ?? ''}`)
      : [...keys, '', ...marks];
    const rows = [...body, '', '{gray-fg}  esc closes{/gray-fg}'];

    const box = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: Math.min((screen.width as number) - 2, Math.max(...rows.map(visible)) + chrome),
      height: Math.min(rows.length + 4, (screen.height as number) - 2),
      border: { type: 'line' },
      label: ' Keys ',
      padding: { top: 1, left: 1, right: 1 },
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
        else say('Not deleted.', THEME.info);
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
        // Six columns saying "no match" need one line saying how to get back.
        if (filter !== '' && columns.every((c) => c.tasks.length === 0)) {
          say(`Nothing matches "${filter}". esc clears the filter.`, THEME.info);
        }
      });
    }
    if (name === 'escape' && filter !== '') {
      filter = '';
      say('Filter cleared.', THEME.info);
      return refresh();
    }

    if (ch === 'r') {
      say('Reloaded.', THEME.info);
      return refresh(true);
    }
    // `r` has meant reload since the board shipped, so the ready filter takes
    // the shifted key rather than retraining a reflex people already have.
    if (ch === 'R') {
      readyOnly = !readyOnly;
      say(readyOnly ? 'Showing only what can be started now.' : 'Showing every task.', THEME.info);
      return refresh();
    }
    // `C`, not `k`: `k` is vim's cursor-up and is bound above, so a claim
    // there would never fire — and the board would silently move the cursor
    // instead. Exactly the family of bug this TUI has shipped before.
    if (ch === 'b') {
      if ('reason' in branch) {
        return say(
          branch.reason === 'detached'
            ? 'HEAD is detached, so there is no branch to filter by.'
            : `There is no branch "${branch.base}" to compare against.`,
          THEME.warn,
        );
      }
      branchOnly = !branchOnly;
      say(
        branchOnly
          ? `Showing only what ${branch.name} introduced since ${branch.base}.`
          : 'Showing every task.',
        THEME.info,
      );
      return refresh();
    }
    if (ch === 'M') {
      if (state.milestones.length === 0) {
        return say('No milestones yet. Create one with kadence milestone create.', THEME.warn);
      }
      const known = state.milestones.map((m) => `${m.label} ${m.name}`).join(', ');
      return prompt(`Milestone (${known}; empty for all):`, milestoneOnly, (value) => {
        const wanted = value.trim();
        if (wanted === '') {
          milestoneOnly = '';
          say('Showing every task.', THEME.info);
          return refresh();
        }
        const found = state.milestones.find(
          (m) =>
            m.label.toUpperCase() === wanted.toUpperCase() ||
            m.name.toLowerCase() === wanted.toLowerCase(),
        );
        if (found === undefined) return say(`No milestone "${wanted}".`, THEME.warn);
        milestoneOnly = found.label;
        say(`Showing ${found.label} ${found.name}.`, THEME.info);
        refresh();
      });
    }
    if (ch === 'C') {
      const task = current();
      if (task === undefined) return;
      return act(
        task.claimedBy === null ? callbacks.claim(task.id) : callbacks.release(task.id),
      );
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

  // Widths are cells now, not percentages, so a resize has to lay out again.
  screen.on('resize', () => {
    footer.setContent(fitHints(HINTS, screen.width as number));
    refresh();
  });

  build();
  refresh();
}
