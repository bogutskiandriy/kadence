import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlid } from '../src/core/ulid.js';
import { append } from '../src/core/store.js';
import { loadOrBuild, snapshotPath } from '../src/core/snapshot.js';
import type { FlowEvent } from '../src/core/event.js';

let root: string;
const gen = createUlid();

function created(title: string): FlowEvent {
  const id = gen();
  return {
    id,
    type: 'task.created',
    entity: id,
    actor: 'tester@example.com',
    ts: '2026-09-02T10:00:00.000Z',
    source: 'human',
    data: { title },
  };
}

function moved(entity: string, to: string): FlowEvent {
  return {
    id: gen(),
    type: 'task.moved',
    entity,
    actor: 'tester@example.com',
    ts: '2026-09-02T11:00:00.000Z',
    source: 'human',
    data: { to },
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sprintit-snap-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('loadOrBuild', () => {
  it('I6: deleting state.json does not change the state — the core cache property', () => {
    // If this test ever fails, the cache stopped being derived and became a
    // source of truth. That is the most expensive class of bug here.
    const a = created('First');
    append(root, a);
    append(root, moved(a.entity, 'done'));

    const withCache = loadOrBuild(root);
    expect(existsSync(snapshotPath(root))).toBe(true);

    rmSync(snapshotPath(root));
    const rebuilt = loadOrBuild(root);

    expect(JSON.stringify(rebuilt.state)).toBe(JSON.stringify(withCache.state));
  });

  it('yields empty state for an empty journal', () => {
    expect(loadOrBuild(root).state.tasks).toEqual([]);
  });

  it('the second call reads state from the cache', () => {
    append(root, created('Task'));
    expect(loadOrBuild(root).fromCache).toBe(false);
    expect(loadOrBuild(root).fromCache).toBe(true);
  });

  it('a new event invalidates the cache', () => {
    const a = created('First');
    append(root, a);
    loadOrBuild(root);

    append(root, moved(a.entity, 'done'));
    const r = loadOrBuild(root);
    expect(r.fromCache).toBe(false);
    expect(r.state.tasks[0]!.status).toBe('done');
  });

  it('a deleted event invalidates the cache — even if the last one remains', () => {
    // git revert removes an event from the middle: the maximum ULID stays the
    // same, so the "last id" alone is not enough to invalidate.
    const a = created('First');
    const mid = moved(a.entity, 'in_progress');
    const last = moved(a.entity, 'done');
    append(root, a);
    append(root, mid);
    append(root, last);
    loadOrBuild(root);

    rmSync(join(root, '.sprintit', 'events', '2026-09', `${mid.id}.json`));
    const r = loadOrBuild(root);
    expect(r.fromCache).toBe(false);
  });

  it('a damaged state.json is rebuilt silently', () => {
    append(root, created('Task'));
    loadOrBuild(root);
    writeFileSync(snapshotPath(root), 'not json');

    const r = loadOrBuild(root);
    expect(r.fromCache).toBe(false);
    expect(r.state.tasks).toHaveLength(1);
  });

  it('a snapshot of an incompatible version is discarded', () => {
    append(root, created('Task'));
    loadOrBuild(root);
    const snap = JSON.parse(readFileSync(snapshotPath(root), 'utf8'));
    snap.version = 'sprintit-snapshot/999';
    writeFileSync(snapshotPath(root), JSON.stringify(snap));

    expect(loadOrBuild(root).fromCache).toBe(false);
  });

  it('the cache keeps FLOW-N numbers stable', () => {
    append(root, created('First'));
    append(root, created('Second'));
    const cold = loadOrBuild(root).state.tasks.map((t) => t.label);
    const warm = loadOrBuild(root).state.tasks.map((t) => t.label);
    expect(warm).toEqual(cold);
  });
});
