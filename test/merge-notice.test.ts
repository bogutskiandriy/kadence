import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlid } from '../src/core/ulid.js';
import { append } from '../src/core/store.js';
import { loadOrBuild } from '../src/core/snapshot.js';
import { describeMerge } from '../src/cli/output.js';
import type { FlowEvent } from '../src/core/event.js';

let root: string;
const gen = createUlid();

function ev(type: 'task.created' | 'task.moved', entity: string, id?: string): FlowEvent {
  const own = id ?? gen();
  return {
    id: own,
    type,
    entity: type === 'task.created' ? own : entity,
    actor: 'tester@example.com',
    ts: '2026-09-02T10:00:00.000Z',
    source: 'human',
    data: type === 'task.created' ? { title: 'Task' } : { to: 'done' },
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sprintit-notice-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('merge detection', () => {
  const ME = 'me@example.com';

  function by(actor: string, id?: string): FlowEvent {
    return { ...ev('task.created', '', id), actor };
  }

  it('events by others that appeared after the last read count as a merge', () => {
    append(root, by(ME));
    loadOrBuild(root, ME);

    append(root, by('alice@example.com'));
    append(root, by('bob@example.com'));

    expect(loadOrBuild(root, ME).incomingEvents).toBe(2);
  });

  it('events landed in the middle of the journal count too', () => {
    // After a merge someone else's event can carry a lower ULID than our last.
    const early = gen();
    const late = gen();
    append(root, { ...by(ME), id: late, entity: late });
    loadOrBuild(root, ME);

    append(root, { ...by('alice@example.com'), id: early, entity: early });
    expect(loadOrBuild(root, ME).incomingEvents).toBe(1);
  });

  it('our own new event does not count as a merge', () => {
    append(root, by(ME));
    loadOrBuild(root, ME);

    append(root, by(ME));
    expect(loadOrBuild(root, ME).incomingEvents).toBe(0);
  });

  it('the first run without a snapshot reports nothing', () => {
    append(root, by(ME));
    expect(loadOrBuild(root, ME).incomingEvents).toBe(0);
  });
});

describe('describeMerge', () => {
  it('stays silent when nothing was merged', () => {
    expect(describeMerge(0)).toBeNull();
  });

  it('states a fact without boasting', () => {
    const text = describeMerge(3)!;
    expect(text).toContain('3');
    expect(text).toMatch(/no conflicts/i);
    // No "successfully", no "great", no exclamation marks.
    expect(text).not.toMatch(/!|success|great/i);
  });

  it('agrees the number with the word form', () => {
    expect(describeMerge(1)).toContain('1 change from');
    expect(describeMerge(3)).toContain('3 changes from');
    expect(describeMerge(21)).toContain('21 changes from');
  });
});
