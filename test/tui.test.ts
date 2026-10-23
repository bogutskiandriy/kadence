import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  renderCard,
  stripTags,
  statusColor,
  decorateCard,
  renderField,
  KEY_HINTS,
  HINTS,
  fitHints,
  columnWidths,
  CARD_MARKS,
} from '../src/tui/theme.js';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';

const gen = createUlid();

function task(data: Record<string, unknown>) {
  const id = gen();
  const e: FlowEvent = {
    id,
    type: 'task.created',
    entity: id,
    actor: 'pm@example.com',
    ts: '2026-09-03T10:00:00.000Z',
    source: 'human',
    data: { title: 'Task', ...data },
  };
  return project([e]).tasks[0]!;
}

describe('card rendering', () => {
  it('fits within the column width', () => {
    const card = renderCard(task({ title: 'A'.repeat(200), estimate: 5 }), 30);
    expect(stripTags(card).length).toBeLessThanOrEqual(32);
  });

  it('never splits a multi-byte character when truncating', () => {
    const card = renderCard(task({ title: '🚀'.repeat(60) }), 24);
    expect(stripTags(card)).not.toContain('�');
  });

  it('marks priority so urgent work is findable without reading', () => {
    expect(renderCard(task({ priority: 'urgent' }), 40)).toContain('‼');
    expect(renderCard(task({ priority: 'low' }), 40)).toContain('↓');
  });

  it('marks a blocked task', () => {
    const blocker = gen();
    const id = gen();
    const events: FlowEvent[] = [
      { id, type: 'task.created', entity: id, actor: 'a@b.c', ts: '2026-09-03T10:00:00.000Z', source: 'human', data: { title: 'T' } },
      { id: blocker, type: 'task.created', entity: blocker, actor: 'a@b.c', ts: '2026-09-03T10:00:00.000Z', source: 'human', data: { title: 'B' } },
      { id: gen(), type: 'task.blocked_by_added', entity: id, actor: 'a@b.c', ts: '2026-09-03T10:00:00.000Z', source: 'human', data: { blocker } },
    ];
    const t = project(events).tasks.find((x) => x.title === 'T')!;
    expect(renderCard(t, 40)).toContain('⊘');
  });

  it('shows assignee and estimate compactly', () => {
    const card = stripTags(renderCard(task({ assignee: 'dev@example.com', estimate: 8 }), 50));
    expect(card).toContain('@dev');
    expect(card).toContain('8');
  });

  it('gives every default status a colour', () => {
    for (const st of ['backlog', 'todo', 'in_progress', 'blocked', 'in_review', 'done']) {
      expect(statusColor(st)).not.toBe('');
    }
  });

  it('falls back to a readable colour for a custom status', () => {
    // The terminal's own foreground, not white: white text vanishes on a
    // light terminal theme.
    expect(statusColor('shipped_to_prod')).toBe('default');
  });

  it('lists the keys people need to know', () => {
    for (const key of ['move', 'assign', 'edit', 'new', 'quit']) {
      expect(KEY_HINTS).toContain(key);
    }
  });
});

/**
 * The board's key table, read out of the source.
 *
 * blessed hands one keystroke to whoever checks for it first, so a second
 * binding for the same character is dead code that looks alive — and the
 * footer and help dialog go on advertising it. That is how `k` shipped as
 * "claim" while it moved the cursor up; nothing in the suite noticed, because
 * nothing in the suite reads the routing table. This does.
 */
describe('board key routing', () => {
  const source = readFileSync(resolve('src/tui/board.ts'), 'utf8');
  const start = source.indexOf('function handleBoardKey');
  // Search forward from the handler: the same comment text appears earlier in
  // the file, and slicing to the first match silently produced an empty table.
  const handler = source.slice(start, source.indexOf('/** Hands the terminal to $EDITOR', start));
  // Only conditionals bind a key. `ch === ']' ? 1 : -1` inside a branch body
  // reads the same character but does not claim it.
  const bound = handler
    .split('\n')
    .filter((line) => line.includes('if ('))
    .flatMap((line) => [...line.matchAll(/ch === '(.)'/g)].map((m) => m[1]!));

  it('reads a non-empty routing table', () => {
    // Guards the test itself: a slice that finds nothing would pass every
    // assertion below by vacuum.
    expect(bound.length).toBeGreaterThan(10);
  });

  it('binds each character exactly once', () => {
    const seen = new Map<string, number>();
    for (const key of bound) seen.set(key, (seen.get(key) ?? 0) + 1);
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key);
    expect(duplicates).toEqual([]);
  });

  it('every key the footer advertises is actually bound', () => {
    // A hint for a key nothing handles is worse than no hint: the reader
    // presses it, nothing happens, and they stop trusting the footer.
    for (const hint of KEY_HINTS.split('  ')) {
      const key = hint.trim().split(' ')[0]!;
      if (key.length !== 1 || !/[A-Za-z]/.test(key)) continue;
      expect(bound, `footer advertises "${hint.trim()}"`).toContain(key);
    }
  });

  it('binds each character exactly once inside the card dialog too', () => {
    // The dialog is where the previous cursor bug lived, and the board-level
    // slice above does not reach it. A duplicate here would ship unseen.
    const dialogStart = source.indexOf('function onDetailKey');
    const dialog = source.slice(dialogStart, source.indexOf('\n    }', dialogStart));
    expect(dialog.length).toBeGreaterThan(100);
    const keys = dialog
      .split('\n')
      .filter((line) => line.includes('if ('))
      .flatMap((line) => [...line.matchAll(/ch === '(.)'/g)].map((m) => m[1]!));
    const seen = new Map<string, number>();
    for (const key of keys) seen.set(key, (seen.get(key) ?? 0) + 1);
    expect([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
  });

  it('claim and the ready filter are reachable', () => {
    expect(bound).toContain('C');
    expect(bound).toContain('R');
  });
});

describe('ui entry point', () => {
  let dir: string;
  const CLI = resolve('dist/cli.js');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-ui-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
    spawnSync('node', [CLI, 'init'], { cwd: dir });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('refuses to start without a terminal and points at the alternative', () => {
    // stdout here is a pipe, exactly like in CI or `kadence ui | less`.
    const r = spawnSync('node', [CLI, 'ui'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/needs a terminal/i);
    expect(r.stderr).toContain('kadence board --json');
  });

  it('keeps blessed out of the main bundle', () => {
    // The whole point of the dynamic import: fast commands must not pay for
    // a library they never touch.
    //
    // Every built file except the UI chunks, not just the entry point. The
    // build splits, so a static import from the core would land in a shared
    // chunk and leave `dist/cli.js` looking clean while every command paid
    // for it — the check would pass for the wrong reason.
    const dist = resolve('dist');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) files.push(full);
      }
    };
    walk(dist);
    // The UI chunks are where blessed belongs; they are loaded on `ui` alone.
    const fast = files.filter((f) => !/\/(?:board|ui)-[^/]*\.js$/.test(f));
    expect(fast.length, 'the fast path is more than one file').toBeGreaterThan(1);

    for (const file of fast) {
      expect(readFileSync(file, 'utf8'), `${file} must not load blessed`).not.toContain('blessed');
    }
  });

  it('lists ui in the help output', () => {
    const r = spawnSync('node', [CLI, '--help'], { cwd: dir, encoding: 'utf8' });
    expect(r.stdout).toContain('ui');
  });
});

describe('editable fields', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-fields-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
    spawnSync('node', [resolve('dist/cli.js'), 'init'], { cwd: dir });
    spawnSync('node', [resolve('dist/cli.js'), 'task', 'add', 'Original'], { cwd: dir });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** Mirrors what the board's setField callback does for each field. */
  async function setField(field: string, value: string): Promise<string> {
    const { runUi } = await import('../src/cli/commands/ui.js');
    void runUi; // imported to prove the module loads outside a TTY
    const cli = resolve('dist/cli.js');
    const args =
      field === 'status'
        ? ['task', 'move', 'KAD-1', value]
        : field === 'assignee'
          ? ['task', 'assign', 'KAD-1', value]
          : ['task', 'edit', 'KAD-1', `--${field}`, value];
    const r = spawnSync('node', [cli, ...args], { cwd: dir, encoding: 'utf8' });
    return r.stdout + r.stderr;
  }

  it('each field the dialog offers is backed by a real command', async () => {
    // The dialog must not offer a field the CLI cannot actually change.
    for (const [field, value] of [
      ['title', 'Renamed'],
      ['priority', 'urgent'],
      ['type', 'bug'],
      ['due', '2026-12-01'],
      ['status', 'todo'],
      ['assignee', 'dev@example.com'],
    ] as const) {
      const out = await setField(field, value);
      expect(out).not.toMatch(/unknown|error/i);
    }

    const list = spawnSync('node', [resolve('dist/cli.js'), 'task', 'list', '--json'], {
      cwd: dir,
      encoding: 'utf8',
    });
    const task = JSON.parse(list.stdout).tasks[0];
    expect(task.title).toBe('Renamed');
    expect(task.priority).toBe('urgent');
    expect(task.type).toBe('bug');
    expect(task.due).toBe('2026-12-01');
    expect(task.status).toBe('todo');
    expect(task.assignee).toBe('dev@example.com');
  });

  it('rejects a bad value the same way the CLI does', async () => {
    expect(await setField('priority', 'critical')).toMatch(/unknown priority/i);
    expect(await setField('due', 'tomorrow')).toMatch(/YYYY-MM-DD/);
  });
});

describe('multi-line descriptions', () => {
  let dir: string;
  const CLI = resolve('dist/cli.js');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-multiline-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
    spawnSync('node', [CLI, 'init'], { cwd: dir });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps paragraphs intact through a round trip', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\nStill the second.';
    spawnSync('node', [CLI, 'task', 'add', 'T', '-d', text], { cwd: dir });

    const r = spawnSync('node', [CLI, 'task', 'list', '--json'], { cwd: dir, encoding: 'utf8' });
    expect(JSON.parse(r.stdout).tasks[0].description).toBe(text);
  });

  it('stores it as an array of lines so git diff stays readable', () => {
    spawnSync('node', [CLI, 'task', 'add', 'T', '-d', 'One.\n\nTwo.'], { cwd: dir });
    const raw = execFileSync('sh', ['-c', 'cat .kadence/events/*/*.json'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(raw).toContain('"description": [');
  });

  it('shows only the first line on the card, not the whole text', () => {
    // A card is one row on a board; a paragraph there would break the grid.
    spawnSync('node', [CLI, 'task', 'add', 'T', '-d', 'Line one\nLine two'], { cwd: dir });
    const r = spawnSync('node', [CLI, 'task', 'list'], { cwd: dir, encoding: 'utf8' });
    expect(r.stdout.split('\n').filter((l) => l.trim().length > 0)).toHaveLength(1);
  });
});

describe('selection highlight', () => {
  it('marks the selected card and leaves the rest alone', () => {
    const card = renderCard(task({ title: 'Selected' }), 30);
    expect(decorateCard(card, true)).toContain('{cyan-bg}');
    expect(decorateCard(card, false)).not.toContain('{cyan-bg}');
  });

  it('strips inner colours from the selected row so the highlight is solid', () => {
    // Per-word colours inside an inverted row make it look corrupted.
    const card = renderCard(task({ priority: 'urgent', estimate: 5 }), 30);
    expect(decorateCard(card, true).match(/\{/g)?.length).toBe(3);
  });

  it('keeps unselected rows aligned with the selected one', () => {
    const card = renderCard(task({ title: 'T' }), 30);
    expect(stripTags(decorateCard(card, false)).length).toBe(stripTags(card).length + 1);
  });
});

describe('hallmark review: cards read on any terminal', () => {
  it('uses no emoji: they render two cells wide and break the column budget', () => {
    const t = task({ title: 'T', due: '2020-01-01' });
    t.comments.push({ id: 'c', author: 'a', text: 'x', ts: '2026-09-03T10:00:00.000Z' } as never);
    const card = stripTags(renderCard(t, 40));
    // \uD83D\uDCAC \uD83D\uDCC5 \u23F0 were the marks; each takes two cells while the width budget
    // counted one, so the comment mark came out as "?" at the column edge.
    expect(card).not.toMatch(/[\u{1F300}-\u{1FAFF}\u23F0]/u);
    expect(card).toContain('\u00B6');
    expect(card).toContain('\u25F7');
  });

  it('never prints white text, which disappears on a light terminal', () => {
    for (const priority of ['low', 'normal', 'high', 'urgent']) {
      expect(renderCard(task({ priority, estimate: 2 }), 40)).not.toContain('white');
    }
  });

  it('shortens a long assignee so the title keeps its room', () => {
    const card = stripTags(renderCard(task({ title: 'Submit the package', assignee: 'bogutski2005@gmail.com' }), 30));
    expect(card).toContain('@bogutsk…');
    expect(card).toContain('Submit');
  });

  it('marks a plain task with nothing, not a middle dot', () => {
    expect(stripTags(renderCard(task({ title: 'Plain' }), 40))).not.toContain('·');
  });

  it('dims finished work so open work is what the eye finds', () => {
    const done = { ...task({ title: 'Shipped', priority: 'urgent' }), status: 'done' };
    const card = renderCard(done, 40);
    expect(card.startsWith('{gray-fg}')).toBe(true);
    expect(card.match(/\{/g)?.length).toBe(2);
  });

  it('keeps the selected card in the same columns as the others', () => {
    // The selected row used to drop the gutter and shift one cell left.
    const card = renderCard(task({ title: 'T' }), 30);
    const on = stripTags(decorateCard(card, true));
    const off = stripTags(decorateCard(card, false));
    expect(on.indexOf('T')).toBe(off.indexOf('T'));
    expect(on.startsWith('▸')).toBe(true);
  });

  it('fills the column with the selection bar when given a width', () => {
    const card = renderCard(task({ title: 'T' }), 30);
    expect(stripTags(decorateCard(card, true, 31))).toHaveLength(31);
  });

  it('explains every card mark in the help legend', () => {
    for (const glyph of ['‼', '↑', '↓', '✖', '◆', '⬢', '⊘', '⚑', '✓', '☑', '¶', '◷']) {
      expect(CARD_MARKS.some(([g]) => g.includes(glyph)), glyph).toBe(true);
    }
  });
});

describe('footer hints fit the terminal', () => {
  it('always keeps help and quit, however narrow', () => {
    for (const width of [40, 80, 120, 140, 200]) {
      const line = stripTags(fitHints(HINTS, width));
      expect(line.length, `width ${width}`).toBeLessThanOrEqual(width);
      expect(line).toContain('? help');
      expect(line).toContain('q quit');
    }
  });

  it('shows every hint when there is room', () => {
    const line = stripTags(fitHints(HINTS, 400));
    for (const [key] of HINTS) expect(line).toContain(key);
  });

  it('drops whole hints, never half of one', () => {
    const line = stripTags(fitHints(HINTS, 60));
    for (const [key, text] of HINTS) {
      if (line.includes(` ${text}`)) expect(line).toContain(`${key} ${text}`);
    }
  });
});

describe('column layout', () => {
  const cols = (...counts: number[]) => counts.map((n, i) => ({ label: ` status${i} ${n} `, empty: n === 0 }));

  it('uses the whole width, with no gap left at the right', () => {
    for (const total of [80, 101, 140, 233]) {
      const widths = columnWidths(total, cols(4, 1, 0, 0, 0, 87));
      expect(widths.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('gives the room of empty columns to the ones holding work', () => {
    const widths = columnWidths(140, cols(4, 1, 0, 0, 0, 87));
    expect(widths[0]!).toBeGreaterThan(widths[2]!);
    expect(widths[2]!).toBeGreaterThanOrEqual(' status2 0 '.length + 2);
  });

  it('splits evenly when every column is empty, or every column has work', () => {
    const empty = columnWidths(120, cols(0, 0, 0));
    expect(new Set(empty).size).toBe(1);
    const full = columnWidths(120, cols(1, 2, 3));
    expect(new Set(full).size).toBe(1);
  });

  it('never makes an empty column narrower than its label', () => {
    const layout = cols(3, 0, 0, 0, 0, 5);
    const widths = columnWidths(140, layout);
    widths.forEach((w, i) => expect(w).toBeGreaterThanOrEqual(layout[i]!.label.length + 4));
  });
});

describe('field highlight in the detail dialog', () => {
  it('marks the field under the cursor', () => {
    const on = renderField('priority', 'urgent', true);
    const off = renderField('priority', 'urgent', false);
    expect(on).toContain('{cyan-bg}');
    expect(off).not.toContain('{cyan-bg}');
  });

  it('adds a pointer so the row is findable without colour', () => {
    // Terminals with NO_COLOR or a limited palette still need to show focus.
    expect(renderField('title', 'x', true)).toContain('▸');
  });

  it('keeps every row the same width so the column of values stays aligned', () => {
    const a = stripTags(renderField('title', 'x', true));
    const b = stripTags(renderField('due', 'y', false));
    expect(a.indexOf('x')).toBe(b.indexOf('y'));
  });

  it('pads short labels to a common width', () => {
    expect(stripTags(renderField('due', '2026-09-04', false))).toContain('due          2026');
  });
});

describe('renderers that had no test', () => {
  const sample = () => [task({ title: 'A', estimate: 3 }), task({ title: 'B', priority: 'urgent' })];

  it('the plain table lists every task', async () => {
    const { renderTaskTable } = await import('../src/cli/output.js');
    const out = renderTaskTable(sample(), false);
    expect(out.split('\n')).toHaveLength(2);
  });

  it('the tree renderer survives a cycle instead of recursing forever', async () => {
    // Cycles are reported, not rejected, so the renderer must tolerate one.
    const { renderTaskTree } = await import('../src/cli/output.js');
    const a = task({ title: 'A' });
    const b = task({ title: 'B' });
    a.parent = b.id;
    b.parent = a.id;
    expect(() => renderTaskTree([a, b], false)).not.toThrow();
  });

  it('a task whose parent is filtered out still appears', async () => {
    const { renderTaskTree } = await import('../src/cli/output.js');
    const child = task({ title: 'Child' });
    child.parent = 'MISSING_PARENT_ULID_0000000';
    expect(renderTaskTree([child], false)).toContain('Child');
  });

  it('colours are off when NO_COLOR is set, whatever the terminal', async () => {
    const { colorsEnabled } = await import('../src/cli/output.js');
    expect(colorsEnabled({ NO_COLOR: '1' } as NodeJS.ProcessEnv, true)).toBe(false);
    expect(colorsEnabled({} as NodeJS.ProcessEnv, false)).toBe(false);
    expect(colorsEnabled({} as NodeJS.ProcessEnv, true)).toBe(true);
  });

  it('cycle warnings name tasks by label, not by ulid', async () => {
    const { renderCycles } = await import('../src/cli/output.js');
    const labels = new Map([['id-a', 'KAD-1'], ['id-b', 'KAD-2']]);
    const out = renderCycles([{ kind: 'blocking', path: ['id-a', 'id-b', 'id-a'] }], labels);
    expect(out[0]).toContain('KAD-1 → KAD-2 → KAD-1');
  });
});

describe('reported version', () => {
  it('matches package.json rather than a hardcoded string', () => {
    // The 0.1.0 release shipped reporting "0.1.0-dev" because the CLI carried
    // its own copy of the version. It is now injected at build time.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    const out = spawnSync('node', [resolve('dist/cli.js'), '--version'], { encoding: 'utf8' });
    expect(out.stdout).toContain(pkg.version);
    expect(out.stdout).not.toContain('-dev');
  });
});
