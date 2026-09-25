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

  /**
   * The third leg of the fingerprint.
   *
   * Names and a count answer "was anything added or removed", which is all an
   * append-only journal of immutable files should need. Files are not always
   * immutable in practice: a truncated write, a bad disk, and the `git checkout
   * .kadence/` the corruption warning tells you to run all rewrite content
   * while leaving every name where it was. Without the byte total, the remedy
   * the product recommends does not invalidate the cache it needs to.
   */
  it('an event rewritten in place invalidates the cache, though every name is unchanged', () => {
    const a = created('First');
    append(root, a);
    const before = loadOrBuild(root);
    expect(before.state.tasks[0]!.title).toBe('First');

    const path = join(root, '.kadence', 'events', '2026-09', `${a.id}.json`);
    writeFileSync(path, `${JSON.stringify({ ...a, data: { title: 'Rewritten' } })}\n`);

    const after = loadOrBuild(root);
    expect(after.fromCache).toBe(false);
    expect(after.state.tasks[0]!.title).toBe('Rewritten');
  });

  it('reports a corrupted event and keeps reporting it until it is repaired', () => {
    const a = created('First');
    const b = created('Second');
    append(root, a);
    append(root, b);
    loadOrBuild(root);

    // Damage after the cache was built, the way a bad disk would.
    const path = join(root, '.kadence', 'events', '2026-09', `${b.id}.json`);
    writeFileSync(path, 'not json at all\n');

    // Twice: a cached count would go stale the moment the file is repaired,
    // and a repair need not change any name. So damage is never cached.
    const first = loadOrBuild(root);
    const second = loadOrBuild(root);
    expect(first.health.corrupted).toBe(1);
    expect(second.health.corrupted).toBe(1);
    expect(second.fromCache).toBe(false);
  });

  it('caches again once the journal is whole', () => {
    const a = created('First');
    append(root, a);
    const path = join(root, '.kadence', 'events', '2026-09', `${a.id}.json`);
    writeFileSync(path, 'broken\n');
    expect(loadOrBuild(root).health.corrupted).toBe(1);

    writeFileSync(path, `${JSON.stringify(a)}\n`);
    expect(loadOrBuild(root).health.corrupted).toBe(0);
    expect(loadOrBuild(root).fromCache).toBe(true);
  });

  it('carries the journal health on a warm read, without opening an event', () => {
    append(root, created('First'));
    const cold = loadOrBuild(root);
    const warm = loadOrBuild(root);

    expect(cold.fromCache).toBe(false);
    expect(warm.fromCache).toBe(true);
    expect(warm.health).toEqual(cold.health);
    expect(warm.health.total).toBe(1);
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
    version: 'kadence-snapshot/12',
    task: [
      'id', 'label', 'title', 'description', 'type', 'priority', 'status', 'labels',
      'assignee', 'reporter', 'sprint', 'milestone', 'parent', 'blockedBy', 'due', 'claimedBy',
      'claimedAt', 'claimedEventId', 'contestedBy', 'criteria', 'comments', 'docs',
      'estimate', 'loggedHours', 'history', 'createdAt', 'updatedAt',
    ],
    decision: [
      'id', 'label', 'title', 'why', 'rejected', 'task', 'docs', 'supersedes',
      'supersededBy', 'at', 'by', 'source',
    ],
    note: ['id', 'text', 'task', 'at', 'by', 'source'],
    document: [
      'id', 'label', 'title', 'body', 'tasks', 'revision', 'revisions', 'conflicts',
      'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'source',
    ],
    // Nested records are shape too. `source` reached the event and the note
    // long before it reached these two, and nothing here failed when it did
    // not — so the lists now go one level down.
    comment: ['id', 'author', 'ts', 'text', 'source'],
    historyEntry: ['id', 'type', 'actor', 'ts', 'source', 'data'],
    milestone: [
      'id', 'label', 'name', 'due', 'status', 'closedBy', 'taskIds',
      'donePoints', 'totalPoints', 'doneTasks', 'totalTasks',
    ],
    // The state itself, not just the records in it: a new top-level array is
    // as much a shape change as a new field, and the 0.3.1 bug was a shape
    // change nobody bumped the version for.
    state: [
      'tasks', 'decisions', 'documents', 'milestones', 'notes', 'sprints', 'templates', 'statuses', 'dod', 'started', 'startedChanges',
      'orphanStatuses', 'cycles', 'pending', 'rejected',
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

  it('the project state has exactly the recorded top-level keys', () => {
    expect(Object.keys(project([])).sort()).toEqual([...PROJECTED_SHAPE.state].sort());
  });

  it('a projected comment has exactly the recorded fields', () => {
    const id = gen();
    const state = project([
      { id, type: 'task.created', entity: id, actor: 'a@b.c', ts: '2026-09-08T10:00:00.000Z',
        source: 'human', data: { title: 'T' } },
      { id: gen(), type: 'task.commented', entity: id, actor: 'a@b.c', ts: '2026-09-08T10:01:00.000Z',
        source: 'agent', data: { text: 'C' } },
    ]);
    expect(Object.keys(state.tasks[0]!.comments[0]!).sort()).toEqual([...PROJECTED_SHAPE.comment].sort());
  });

  it('a projected history entry has exactly the recorded fields', () => {
    const id = gen();
    const state = project([
      { id, type: 'task.created', entity: id, actor: 'a@b.c', ts: '2026-09-08T10:00:00.000Z',
        source: 'human', data: { title: 'T' } },
    ]);
    expect(Object.keys(state.tasks[0]!.history[0]!).sort()).toEqual([...PROJECTED_SHAPE.historyEntry].sort());
  });

  it('a projected milestone has exactly the recorded fields', () => {
    const id = gen();
    const state = project([
      { id, type: 'milestone.created', entity: id, actor: 'a@b.c', ts: '2026-09-08T10:00:00.000Z',
        source: 'human', data: { name: '1.0' } },
    ]);
    expect(Object.keys(state.milestones[0]!).sort()).toEqual([...PROJECTED_SHAPE.milestone].sort());
  });

  it('a projected note has exactly the recorded fields', () => {
    const id = gen();
    const state = project([
      { id, type: 'note.recorded', entity: id, actor: 'a@b.c', ts: '2026-09-08T10:00:00.000Z',
        source: 'human', data: { text: 'Learned something' } },
    ]);
    expect(Object.keys(state.notes[0]!).sort()).toEqual([...PROJECTED_SHAPE.note].sort());
  });

  it('a projected decision has exactly the recorded fields', () => {
    const id = gen();
    const state = project([
      { id, type: 'decision.recorded', entity: id, actor: 'a@b.c', ts: '2026-09-08T10:00:00.000Z',
        source: 'agent', data: { title: 'D', why: 'w' } },
    ]);
    expect(Object.keys(state.decisions[0]!).sort()).toEqual([...PROJECTED_SHAPE.decision].sort());
  });

  it('a projected document has exactly the recorded fields', () => {
    const id = gen();
    const state = project([
      { id, type: 'doc.written', entity: id, actor: 'a@b.c', ts: '2026-09-18T10:00:00.000Z',
        source: 'agent', data: { title: 'Auth', body: 'How login works.', parents: [] } },
    ]);
    expect(Object.keys(state.documents[0]!).sort()).toEqual([...PROJECTED_SHAPE.document].sort());
  });
});
