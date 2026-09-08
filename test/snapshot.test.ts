import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlid } from '../src/core/ulid.js';
import { append } from '../src/core/store.js';
import { loadOrBuild, snapshotPath, SNAPSHOT_VERSION } from '../src/core/snapshot.js';
import { project } from '../src/core/projection.js';
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
  root = mkdtempSync(join(tmpdir(), 'kadence-snap-'));
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

    rmSync(join(root, '.kadence', 'events', '2026-09', `${mid.id}.json`));
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
    snap.version = 'kadence-snapshot/999';
    writeFileSync(snapshotPath(root), JSON.stringify(snap));

    expect(loadOrBuild(root).fromCache).toBe(false);
  });

  it('the cache keeps KAD-N numbers stable', () => {
    append(root, created('First'));
    append(root, created('Second'));
    const cold = loadOrBuild(root).state.tasks.map((t) => t.label);
    const warm = loadOrBuild(root).state.tasks.map((t) => t.label);
    expect(warm).toEqual(cold);
  });
});

describe('the cache must not serve a shape from an older version of the code', () => {
  /**
   * Found by using the product: after `Decision` gained a `source` field, an
   * existing `.kadence/state.json` kept serving decisions without it. Invariant
   * I6 says deleting the cache changes nothing — true, and the inverse is what
   * bites: *keeping* it changes everything when the projected shape evolves.
   *
   * The lists are the **internal** projected shape, not the published one — that
   * is what the cache stores, and the two differ (`createdAt` and `updatedAt`
   * never reach `--json`).
   *
   * These lists are a change detector on purpose. If you add a field to a
   * projected record, this test fails, and the fix is to update the list **and
   * bump SNAPSHOT_VERSION** — which is the moment you would otherwise forget
   * that every existing user has a stale cache.
   */
  const PROJECTED_SHAPE = {
    version: 'kadence-snapshot/2',
    task: [
      'id', 'label', 'title', 'description', 'type', 'priority', 'status', 'labels',
      'assignee', 'reporter', 'sprint', 'parent', 'blockedBy', 'due', 'comments', 'docs',
      'estimate', 'loggedHours', 'history', 'createdAt', 'updatedAt',
    ],
    decision: [
      'id', 'label', 'title', 'why', 'rejected', 'task', 'docs', 'supersedes',
      'supersededBy', 'at', 'by', 'source',
    ],
  };

  it('the snapshot version matches the shape recorded here', () => {
    expect(SNAPSHOT_VERSION).toBe(PROJECTED_SHAPE.version);
  });

  it('a projected task has exactly the recorded fields', () => {
    const id = gen();
    const state = project([
      { id, type: 'task.created', entity: id, actor: 'a@b.c', ts: '2026-09-08T10:00:00.000Z',
        source: 'human', data: { title: 'T' } },
    ]);
    expect(Object.keys(state.tasks[0]!).sort()).toEqual([...PROJECTED_SHAPE.task].sort());
  });

  it('a projected decision has exactly the recorded fields', () => {
    const id = gen();
    const state = project([
      { id, type: 'decision.recorded', entity: id, actor: 'a@b.c', ts: '2026-09-08T10:00:00.000Z',
        source: 'agent', data: { title: 'D', why: 'w' } },
    ]);
    expect(Object.keys(state.decisions[0]!).sort()).toEqual([...PROJECTED_SHAPE.decision].sort());
  });
});
