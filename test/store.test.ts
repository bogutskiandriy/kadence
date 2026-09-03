import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlid } from '../src/core/ulid.js';
import { append, readAll, eventsDir } from '../src/core/store.js';
import type { FlowEvent } from '../src/core/event.js';

let root: string;
const gen = createUlid();

const ev = (over: Partial<FlowEvent> = {}): FlowEvent => ({
  id: gen(),
  type: 'task.created',
  entity: gen(),
  actor: 'bogun@example.com',
  ts: '2026-09-02T10:00:00.000Z',
  source: 'human',
  ...over,
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'flowit-store-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('append', () => {
  it('creates the folder for an event when it is missing', () => {
    append(root, ev());
    expect(readAll(root).events).toHaveLength(1);
  });

  it('recreates the folder after it vanished on a branch switch', () => {
    // Git does not version empty directories, so events/2026-09/ disappears on
    // checkout to a branch without that month's events. The spike reproduced
    // this twice — hence mkdir -p on EVERY write.
    const e1 = ev();
    append(root, e1);
    rmSync(eventsDir(root), { recursive: true, force: true });
    expect(existsSync(eventsDir(root))).toBe(false);

    append(root, ev());
    expect(readAll(root).events).toHaveLength(1);
  });

  it('writes each event to its own file — the source of zero conflicts', () => {
    append(root, ev());
    append(root, ev());
    append(root, ev());
    const files = readdirSync(eventsDir(root), { recursive: true }) as string[];
    expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(3);
  });

  it('files events into per-month folders', () => {
    append(root, ev({ ts: '2026-09-02T10:00:00.000Z' }));
    expect(readdirSync(eventsDir(root))).toContain('2026-09');
  });

  it('ends the file with a newline — otherwise cat glues events together', () => {
    const e = ev();
    append(root, e);
    const path = join(eventsDir(root), '2026-09', `${e.id}.json`);
    expect(readFileSync(path, 'utf8').endsWith('\n')).toBe(true);
  });

  it('leaves no temporary files behind', () => {
    append(root, ev());
    const files = readdirSync(eventsDir(root), { recursive: true }) as string[];
    expect(files.some((f) => f.includes('.tmp'))).toBe(false);
  });
});

describe('readAll', () => {
  it('returns events ordered by id, not by file order', () => {
    // Invariant I1: the result does not depend on filesystem traversal order.
    const a = ev({ id: '01AAAAAAAAAAAAAAAAAAAAAAAA' });
    const b = ev({ id: '01BBBBBBBBBBBBBBBBBBBBBBBB' });
    const c = ev({ id: '01CCCCCCCCCCCCCCCCCCCCCCCC' });
    append(root, c);
    append(root, a);
    append(root, b);
    expect(readAll(root).events.map((e) => e.id)).toEqual([a.id, b.id, c.id]);
  });

  it('returns an empty list on an empty repository instead of an error', () => {
    expect(readAll(root).events).toEqual([]);
  });

  it('a corrupted event does not hide the rest of the journal', () => {
    append(root, ev());
    append(root, ev());
    const dir = join(eventsDir(root), '2026-09');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '01ZZZZZZZZZZZZZZZZZZZZZZZZ.json'), '{"id":');

    const r = readAll(root);
    expect(r.events).toHaveLength(2);
    expect(r.corrupted).toHaveLength(1);
    expect(r.corrupted[0]).toContain('01ZZZ');
  });

  it('skips an event from a newer format without calling it corrupted', () => {
    append(root, ev());
    const dir = join(eventsDir(root), '2026-09');
    writeFileSync(
      join(dir, '01YYYYYYYYYYYYYYYYYYYYYYYY.json'),
      JSON.stringify({ ...ev(), type: 'task.teleported' }),
    );
    const r = readAll(root);
    expect(r.events).toHaveLength(1);
    expect(r.corrupted).toHaveLength(0);
    expect(r.unknownTypes).toBe(1);
  });

  it('deduplicates an event landed on two branches by cherry-pick', () => {
    const e = ev();
    append(root, e);
    const dir = join(eventsDir(root), '2026-09');
    writeFileSync(join(dir, `copy-${e.id}.json`), JSON.stringify(e));
    expect(readAll(root).events).toHaveLength(1);
  });

  it('flags systemic damage when over 20% of events are broken', () => {
    for (let i = 0; i < 4; i++) append(root, ev());
    const dir = join(eventsDir(root), '2026-09');
    for (let i = 0; i < 3; i++) {
      writeFileSync(join(dir, `01Q${i}ZZZZZZZZZZZZZZZZZZZZZZ.json`), 'broken');
    }
    expect(readAll(root).systemicCorruption).toBe(true);
  });

  it('does not call a single broken event systemic damage', () => {
    for (let i = 0; i < 20; i++) append(root, ev());
    writeFileSync(join(eventsDir(root), '2026-09', '01WZZZZZZZZZZZZZZZZZZZZZZZ.json'), 'x');
    expect(readAll(root).systemicCorruption).toBe(false);
  });
});
