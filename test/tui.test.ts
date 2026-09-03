import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
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
    expect(statusColor('shipped_to_prod')).toBe('white');
  });

  it('lists the keys people need to know', () => {
    for (const key of ['move', 'assign', 'edit', 'new', 'quit']) {
      expect(KEY_HINTS).toContain(key);
    }
  });
});

describe('ui entry point', () => {
  let dir: string;
  const CLI = resolve('dist/cli.js');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flowit-ui-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
    spawnSync('node', [CLI, 'init'], { cwd: dir });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('refuses to start without a terminal and points at the alternative', () => {
    // stdout here is a pipe, exactly like in CI or `flowit ui | less`.
    const r = spawnSync('node', [CLI, 'ui'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/needs a terminal/i);
    expect(r.stderr).toContain('flowit board --json');
  });

  it('keeps blessed out of the main bundle', () => {
    // The whole point of the dynamic import: fast commands must not pay for
    // a library they never touch.
    expect(readFileSync(CLI, 'utf8')).not.toContain('blessed');
  });

  it('lists ui in the help output', () => {
    const r = spawnSync('node', [CLI, '--help'], { cwd: dir, encoding: 'utf8' });
    expect(r.stdout).toContain('ui');
  });
});

describe('editable fields', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flowit-fields-'));
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
        ? ['task', 'move', 'FLOW-1', value]
        : field === 'assignee'
          ? ['task', 'assign', 'FLOW-1', value]
          : ['task', 'edit', 'FLOW-1', `--${field}`, value];
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
    dir = mkdtempSync(join(tmpdir(), 'flowit-multiline-'));
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
    const raw = execFileSync('sh', ['-c', 'cat .flowit/events/*/*.json'], {
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
