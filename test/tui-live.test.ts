import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { journalSignature, describeChanges, locateTask, watchJournal } from '../src/tui/live.js';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';

/**
 * The board, kept current while other processes write the journal (KAD-125).
 *
 * An agent moving ten tasks to done in another terminal should show up on an
 * open board without anyone pressing `r`.
 */

const gen = createUlid();

function created(title: string, status?: string): FlowEvent[] {
  const id = gen();
  const events: FlowEvent[] = [
    { id, type: 'task.created', entity: id, actor: 'a@b.c', ts: '2026-11-02T10:00:00.000Z', source: 'human', data: { title } },
  ];
  if (status !== undefined) {
    events.push({ id: gen(), type: 'task.moved', entity: id, actor: 'a@b.c', ts: '2026-11-02T10:00:00.000Z', source: 'agent', data: { to: status } });
  }
  return events;
}

describe('journalSignature', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-live-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is stable while nothing is written', () => {
    mkdirSync(join(dir, '2026-11'));
    writeFileSync(join(dir, '2026-11', 'a.json'), '{}');
    expect(journalSignature(dir)).toBe(journalSignature(dir));
  });

  it('changes when an event lands in an existing month', () => {
    mkdirSync(join(dir, '2026-11'));
    writeFileSync(join(dir, '2026-11', 'a.json'), '{}');
    const before = journalSignature(dir);
    writeFileSync(join(dir, '2026-11', 'b.json'), '{}');
    expect(journalSignature(dir)).not.toBe(before);
  });

  it('changes when the first event of a new month creates its directory', () => {
    // The case fs.watch is least reliable about: a directory that did not exist
    // when the watch began.
    mkdirSync(join(dir, '2026-10'));
    const before = journalSignature(dir);
    mkdirSync(join(dir, '2026-11'));
    writeFileSync(join(dir, '2026-11', 'a.json'), '{}');
    expect(journalSignature(dir)).not.toBe(before);
  });

  it('changes when compaction rewrites an archive', () => {
    mkdirSync(join(dir, 'archive'));
    writeFileSync(join(dir, 'archive', '2026-09.json'), '[]');
    const before = journalSignature(dir);
    writeFileSync(join(dir, 'archive', '2026-09.json'), '[{"id":"x"}]');
    expect(journalSignature(dir)).not.toBe(before);
  });

  it('answers for a journal that does not exist yet instead of throwing', () => {
    // `kadence init` with no events: git does not version empty directories.
    expect(journalSignature(join(dir, 'missing'))).toBe('');
  });
});

describe('describeChanges', () => {
  it('names the tasks that moved and where to', () => {
    const base = [...created('One'), ...created('Two')];
    const before = project(base).tasks;
    const after = project([
      ...base,
      { id: gen(), type: 'task.moved', entity: before[1]!.id, actor: 'x@y.z', ts: '2026-11-02T11:00:00.000Z', source: 'agent', data: { to: 'done' } },
    ] as FlowEvent[]).tasks;
    expect(describeChanges(before, after)).toBe(`${before[1]!.label} → done`);
  });

  it('names a task that appeared', () => {
    const base = created('One');
    const before = project(base).tasks;
    const after = project([...base, ...created('Two')]).tasks;
    expect(describeChanges(before, after)).toBe(`${after[1]!.label} new`);
  });

  it('counts deletions rather than naming them, because labels shift when a task goes', () => {
    // KAD-N is derived while folding (I7): after a deletion the old label can
    // belong to a different task, so printing it would point at the wrong row.
    const first = created('One');
    const base = [...first, ...created('Two')];
    const before = project(base).tasks;
    const after = project([
      ...base,
      { id: gen(), type: 'task.deleted', entity: first[0]!.entity, actor: 'x@y.z', ts: '2026-11-02T11:00:00.000Z', source: 'agent', data: {} },
    ] as FlowEvent[]).tasks;
    expect(describeChanges(before, after)).toBe('1 deleted');
  });

  it('caps a long list so it fits the one status line', () => {
    const base = Array.from({ length: 6 }, (_, i) => created(`T${i}`)).flat();
    const before = project(base).tasks;
    const moves = before.map(
      (t) => ({ id: gen(), type: 'task.moved', entity: t.id, actor: 'x@y.z', ts: '2026-11-02T11:00:00.000Z', source: 'agent', data: { to: 'done' } }) as FlowEvent,
    );
    const text = describeChanges(before, project([...base, ...moves]).tasks);
    expect(text).toBe(`${before[0]!.label} → done, ${before[1]!.label} → done, ${before[2]!.label} → done, +3 more`);
  });

  it('says nothing when no task moved, appeared or went', () => {
    const base = created('One');
    const tasks = project(base).tasks;
    expect(describeChanges(tasks, project(base).tasks)).toBe('');
  });
});

describe('locateTask', () => {
  it('finds the selected task in whichever column it is now in', () => {
    const tasks = project([...created('A', 'in_progress'), ...created('B', 'done')]).tasks;
    const columns = [
      { tasks: tasks.filter((t) => t.status === 'in_progress') },
      { tasks: tasks.filter((t) => t.status === 'done') },
    ];
    expect(locateTask(columns, tasks[1]!.id)).toEqual({ column: 1, row: 0 });
  });

  it('returns null for a task no column shows', () => {
    expect(locateTask([{ tasks: [] }], 'NOPE')).toBeNull();
  });
});

describe('watchJournal', () => {
  afterEach(() => vi.useRealTimers());

  it('reports a change once the journal has been quiet for the debounce', () => {
    vi.useFakeTimers();
    let sig = 'a';
    const onChange = vi.fn();
    const w = watchJournal({ dir: '/nowhere', signature: () => sig, onChange, pollMs: 100, debounceMs: 50, watch: false });

    sig = 'b';
    vi.advanceTimersByTime(100); // the poll sees it
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50); // and the debounce lets it through
    expect(onChange).toHaveBeenCalledTimes(1);
    w.close();
  });

  it('turns a burst of writes from several agents into one reload', () => {
    vi.useFakeTimers();
    let n = 0;
    let sig = '0';
    const onChange = vi.fn();
    const w = watchJournal({ dir: '/nowhere', signature: () => sig, onChange, pollMs: 10, debounceMs: 50, watch: false });

    for (let i = 0; i < 10; i++) {
      sig = String(++n);
      vi.advanceTimersByTime(10);
    }
    vi.advanceTimersByTime(60);
    expect(onChange).toHaveBeenCalledTimes(1);
    w.close();
  });

  it('stays quiet when nothing changed', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const w = watchJournal({ dir: '/nowhere', signature: () => 'same', onChange, pollMs: 10, debounceMs: 10, watch: false });
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
    w.close();
  });

  it('does not report the board its own writes once they are acknowledged', () => {
    // The board reloads after every action it takes. Without this the watcher
    // would reload a second time and announce the board's own move as news.
    vi.useFakeTimers();
    let sig = 'a';
    const onChange = vi.fn();
    const w = watchJournal({ dir: '/nowhere', signature: () => sig, onChange, pollMs: 10, debounceMs: 10, watch: false });
    sig = 'b';
    w.acknowledge();
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
    w.close();
  });

  it('stops after close', () => {
    vi.useFakeTimers();
    let sig = 'a';
    const onChange = vi.fn();
    const w = watchJournal({ dir: '/nowhere', signature: () => sig, onChange, pollMs: 10, debounceMs: 10, watch: false });
    w.close();
    sig = 'b';
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hears a real write through the file system, well before a slow poll would', async () => {
    // The boundary itself, not a stub of it: a real directory, a real file, and
    // a poll set far beyond the test's patience, so only the watch can answer.
    const dir = mkdtempSync(join(tmpdir(), 'kadence-live-fs-'));
    mkdirSync(join(dir, '2026-11'));
    try {
      const heard = new Promise<void>((done) => {
        const w = watchJournal({
          dir,
          onChange: () => {
            w.close();
            done();
          },
          pollMs: 60_000,
          debounceMs: 20,
        });
        setTimeout(() => writeFileSync(join(dir, '2026-11', 'e.json'), '{}'), 50);
      });
      await heard;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 4000);
});

describe('the live board stays off the fast path', () => {
  it('ships the watcher only in the board chunk', () => {
    // `kadence task add` must not pay for a file watcher it never starts.
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = resolve(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) files.push(full);
      }
    };
    walk(resolve('dist'));
    const holding = files.filter((f) => readFileSync(f, 'utf8').includes('Updated from the journal'));
    expect(holding.length).toBe(1);
    expect(holding[0]).toMatch(/\/board-[^/]*\.js$/);
  });
});
