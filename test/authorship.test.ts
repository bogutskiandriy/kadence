import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';
import { createUlid } from '../src/core/ulid.js';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskComment, runTaskShow, runTaskMove } from '../src/cli/commands/task.js';
import { runNoteAdd } from '../src/cli/commands/note.js';

/**
 * Who wrote this line — a person or an agent?
 *
 * The event has always carried the answer: `source` is written on every one of
 * them and validated on read. But the fold dropped it on the way to a comment
 * and a history entry, so the one surface the product's headline is about —
 * "your team and your agents write to the same journal" — could not show which
 * side wrote what. `decision list` marked it, `task show` did not, and the
 * agent's line was indistinguishable from the human's.
 *
 * The journal knew. The projection forgot.
 */

const nextId = createUlid();

function event(
  type: string,
  entity: string,
  source: 'human' | 'agent',
  data: Record<string, unknown> = {},
  actor = 'ana@studio.dev',
): FlowEvent {
  return {
    id: nextId(),
    type: type as FlowEvent['type'],
    entity,
    actor,
    ts: '2026-09-12T10:00:00.000Z',
    source,
    data,
  };
}

describe('the fold keeps the source of a comment', () => {
  it('marks a comment an agent wrote', () => {
    const id = nextId();
    const state = project([
      event('task.created', id, 'human', { title: 'Fix login' }),
      event('task.commented', id, 'agent', { text: 'A 302 strips SameSite=Lax.' }),
    ]);
    expect(state.tasks[0]!.comments[0]!.source).toBe('agent');
  });

  it('marks a comment a person wrote', () => {
    const id = nextId();
    const state = project([
      event('task.created', id, 'human', { title: 'Fix login' }),
      event('task.commented', id, 'human', { text: 'The redirect drops it.' }),
    ]);
    expect(state.tasks[0]!.comments[0]!.source).toBe('human');
  });
});

describe('the fold keeps the source of a history entry', () => {
  it('carries the source of the event that made it', () => {
    const id = nextId();
    const state = project([
      event('task.created', id, 'human', { title: 'Fix login' }),
      event('task.moved', id, 'agent', { from: 'backlog', to: 'in_progress' }),
    ]);
    const history = state.tasks[0]!.history;
    expect(history.map((h) => h.source)).toEqual(['human', 'agent']);
  });
});

describe('task show says which side wrote each line', () => {
  let dir: string;
  const human: NodeJS.ProcessEnv = {};
  const agent: NodeJS.ProcessEnv = { KADENCE_SOURCE: 'agent' };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-authorship-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'ana@studio.dev'], { cwd: dir });
    runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('marks an agent comment the way decision list marks a decision', () => {
    runTaskAdd(dir, human, 'Fix login', {});
    runTaskComment(dir, agent, 'KAD-1', 'A 302 to another host strips SameSite=Lax.');
    expect(runTaskShow(dir, human, 'KAD-1').message).toMatch(/ana@studio\.dev \[agent\]/);
  });

  it('leaves a human comment unmarked — the default needs no label', () => {
    runTaskAdd(dir, human, 'Fix login', {});
    runTaskComment(dir, human, 'KAD-1', 'The redirect drops the cookie.');
    expect(runTaskShow(dir, human, 'KAD-1').message).not.toMatch(/\[agent\]/);
  });

  it('marks the history line of a move an agent made', () => {
    runTaskAdd(dir, human, 'Fix login', {});
    runTaskMove(dir, agent, 'KAD-1', 'in_progress');
    const shown = runTaskShow(dir, human, 'KAD-1').message;
    const moved = shown.split('\n').find((l) => l.includes('task.moved'))!;
    expect(moved).toMatch(/\[agent\]/);
  });

  it('marks an agent note, which the record already knew and the screen did not', () => {
    runTaskAdd(dir, human, 'Fix login', {});
    runNoteAdd(dir, agent, 'SameSite=Lax is dropped on a cross-host 302.', { task: 'KAD-1' });
    const shown = runTaskShow(dir, human, 'KAD-1').message;
    const notes = shown.slice(shown.indexOf('Notes ('));
    expect(notes).toMatch(/\[agent\]/);
  });

  it('hands an agent the same answer in --json, on comments and on history', () => {
    runTaskAdd(dir, human, 'Fix login', {});
    runTaskComment(dir, agent, 'KAD-1', 'Reproduced.');
    const task = runTaskShow(dir, human, 'KAD-1').data!['task'] as {
      comments: Array<{ source: string }>;
      history: Array<{ type: string; source: string }>;
    };
    expect(task.comments[0]!.source).toBe('agent');
    expect(task.history.find((h) => h.type === 'task.commented')!.source).toBe('agent');
    expect(task.history.find((h) => h.type === 'task.created')!.source).toBe('human');
  });
});
