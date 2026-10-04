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
import { runNoteAdd, runNoteList, runNoteShow } from '../src/cli/commands/note.js';
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

describe('note show', () => {
  // Agents handed a note's ULID — by search, by the prompt hook — reached for
  // `note show <id>` twice and then spent three calls finding the text another
  // way (KAD-53 runs). A note has no label (I7), so the ULID is the handle.
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-note-show-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
    runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function recorded(text: string, task?: string): string {
    const r = runNoteAdd(dir, env, text, task === undefined ? {} : { task });
    expect(r.ok, r.message).toBe(true);
    return (r.data!['note'] as { id: string }).id;
  }

  it('prints the text, the task label, the author and the time', () => {
    runTaskAdd(dir, env, 'Fix login', {});
    const id = recorded('The redirect drops the cookie', 'KAD-1');
    const r = runNoteShow(dir, env, id);
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toContain('The redirect drops the cookie');
    expect(r.message).toContain('KAD-1');
    expect(r.message).toContain('tester@example.com');
    expect(r.message).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('returns the note shape under the kadence/v1 schema', () => {
    const id = recorded('Tests need a git identity');
    const r = runNoteShow(dir, env, id);
    expect(r.data!['schema']).toBe('kadence/v1');
    const note = r.data!['note'] as Record<string, unknown>;
    expect(note['id']).toBe(id);
    expect(note['text']).toBe('Tests need a git identity');
    expect(note['task']).toBeNull();
    expect(note['by']).toBe('tester@example.com');
    expect(typeof note['at']).toBe('string');
    expect(note['source']).toBe('human');
  });

  it('gives the whole text however long, which the preamble and the hook cap', () => {
    const long = 'word '.repeat(400).trim();
    const id = recorded(long);
    const note = runNoteShow(dir, env, id).data!['note'] as { text: string };
    expect(note.text).toBe(long);
  });

  it('accepts the ULID in lower case, as people retype it', () => {
    const id = recorded('Case does not matter in a ULID');
    expect(runNoteShow(dir, env, id.toLowerCase()).ok).toBe(true);
  });

  it('fails with note_not_found on a ULID that is not a note', () => {
    runTaskAdd(dir, env, 'A task, not a note', {});
    const task = runTaskShow(dir, env, 'KAD-1').data!['task'] as { id: string };
    const r = runNoteShow(dir, env, task.id);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.error!.code).toBe('note_not_found');
    expect(r.error!.hint).toMatch(/note list/);
  });

  it('says a note has no label when it is handed one', () => {
    const r = runNoteShow(dir, env, 'KAD-1');
    expect(r.error!.code).toBe('note_not_found');
    expect(r.message).toMatch(/ULID/);
  });
});
