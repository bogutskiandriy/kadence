import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';
import { createUlid } from '../src/core/ulid.js';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskShow } from '../src/cli/commands/task.js';
import { runNoteAdd, runNoteList } from '../src/cli/commands/note.js';
import { runDecisionList } from '../src/cli/commands/decision.js';

/**
 * A note is what a decision is not.
 *
 * `decision` holds why something was chosen and what was turned down. A note
 * holds an insight that never had an alternative — "tests need a git identity"
 * — and the two must stay separable, or the "why" layer quietly fills with
 * observations and stops being worth reading.
 */

const nextId = createUlid();

function note(text: string, data: Record<string, unknown> = {}): FlowEvent {
  const id = nextId();
  return {
    id,
    type: 'note.recorded',
    entity: id,
    actor: 'alice@example.com',
    ts: '2026-09-09T10:00:00.000Z',
    source: 'human',
    data: { text, ...data },
  };
}

describe('note fold', () => {
  it('keeps notes in the order they were written', () => {
    const state = project([note('First'), note('Second'), note('Third')]);
    expect(state.notes.map((n) => n.text)).toEqual(['First', 'Second', 'Third']);
  });

  it('skips a note with no text instead of recording an empty one', () => {
    const state = project([note('Real'), { ...note(''), data: {} }]);
    expect(state.notes).toHaveLength(1);
  });

  it('carries the author and the source, which kadence never guesses', () => {
    const written = { ...note('From an agent'), source: 'agent' as const };
    const state = project([written]);
    expect(state.notes[0]!.by).toBe('alice@example.com');
    expect(state.notes[0]!.source).toBe('agent');
  });

  it('attaches a note to a task without becoming part of the task record', () => {
    const taskId = nextId();
    const created: FlowEvent = {
      id: taskId,
      type: 'task.created',
      entity: taskId,
      actor: 'alice@example.com',
      ts: '2026-09-09T09:00:00.000Z',
      source: 'human',
      data: { title: 'A task' },
    };
    const state = project([created, note('About the task', { task: taskId })]);
    expect(state.notes[0]!.task).toBe(taskId);
    expect(state.tasks[0]!.history.some((h) => h.type === 'note.recorded')).toBe(false);
  });

  it('folds to the same list whatever order the files are read in', () => {
    const a = note('A');
    const b = note('B');
    const c = note('C');
    const forward = project([a, b, c]).notes.map((n) => n.id);
    const backward = project([c, a, b]).notes.map((n) => n.id);
    expect(backward).toEqual(forward);
  });
});

describe('note commands', () => {
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-note-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
    runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('records a note and reads it back', () => {
    expect(runNoteAdd(dir, env, 'Tests need a git identity', {}).ok).toBe(true);
    const r = runNoteList(dir, env, {});
    expect(r.message).toMatch(/git identity/);
  });

  it('refuses an empty note and points at the flag that was missing', () => {
    const r = runNoteAdd(dir, env, '   ', {});
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
  });

  it('attaches a note to a task and shows it there', () => {
    runTaskAdd(dir, env, 'Fix login', {});
    runNoteAdd(dir, env, 'The redirect drops the cookie', { task: 'KAD-1' });
    const shown = runTaskShow(dir, env, 'KAD-1');
    expect(shown.message).toMatch(/redirect drops the cookie/);
    const notes = (shown.data!['task'] as { notes: unknown[] }).notes;
    expect(notes).toHaveLength(1);
  });

  it('fails on a task that does not exist rather than recording a dangling note', () => {
    const r = runNoteAdd(dir, env, 'Text', { task: 'KAD-9' });
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('task_not_found');
  });

  it('narrows the list to one task when asked', () => {
    runTaskAdd(dir, env, 'One', {});
    runTaskAdd(dir, env, 'Two', {});
    runNoteAdd(dir, env, 'About one', { task: 'KAD-1' });
    runNoteAdd(dir, env, 'About two', { task: 'KAD-2' });
    const r = runNoteList(dir, env, { task: 'KAD-1' });
    expect(r.message).toMatch(/About one/);
    expect(r.message).not.toMatch(/About two/);
  });

  it('returns the newest notes first, capped by --limit', () => {
    runNoteAdd(dir, env, 'Oldest', {});
    runNoteAdd(dir, env, 'Newest', {});
    const r = runNoteList(dir, env, { limit: 1, json: true });
    const notes = r.data!['notes'] as Array<{ text: string }>;
    expect(notes.map((n) => n.text)).toEqual(['Newest']);
  });

  it('is not a decision: notes never appear in `decision list`', () => {
    runNoteAdd(dir, env, 'An observation', {});
    const r = runDecisionList(dir, env, {});
    expect(r.message).not.toMatch(/An observation/);
    const decisions = (r.data?.['decisions'] ?? []) as unknown[];
    expect(decisions).toHaveLength(0);
  });

  it('says nothing is there, and when to reach for a decision instead', () => {
    const r = runNoteList(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/kadence note/);
    expect(r.message).toMatch(/decision/i);
  });
});
