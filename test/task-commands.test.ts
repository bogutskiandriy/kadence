import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskList, runTaskMove } from '../src/cli/commands/task.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flowit-cmd-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function addTask(title: string, estimate?: number): string {
  const r = runTaskAdd(dir, env, title, estimate === undefined ? {} : { estimate });
  return (r.data!['task'] as { id: string }).id;
}

describe('runTaskList', () => {
  it('hints at what to do next when the journal is empty', () => {
    const r = runTaskList(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/task add/);
  });

  it('shows created tasks with sequential numbers', () => {
    addTask('First');
    addTask('Second');
    const r = runTaskList(dir, env, {});
    expect(r.message).toContain('FLOW-1');
    expect(r.message).toContain('FLOW-2');
    expect(r.message).toContain('First');
  });

  it('filters by status', () => {
    const a = addTask('First');
    addTask('Second');
    runTaskMove(dir, env, a, 'done');
    const r = runTaskList(dir, env, { status: 'done' });
    expect(r.message).toContain('First');
    expect(r.message).not.toContain('Second');
  });

  it('rejects an unknown status in the filter', () => {
    const r = runTaskList(dir, env, { status: 'flying' });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
  });
});

describe('runTaskMove', () => {
  it('moves a task to a new state', () => {
    const id = addTask('Task');
    expect(runTaskMove(dir, env, id, 'in_progress').ok).toBe(true);
    expect(runTaskList(dir, env, {}).message).toContain('in_progress');
  });

  it('accepts a human-readable number, not just a ULID', () => {
    addTask('Task');
    const r = runTaskMove(dir, env, 'FLOW-1', 'done');
    expect(r.ok).toBe(true);
  });

  it('writes no event when the state is already the same', () => {
    const id = addTask('Task');
    runTaskMove(dir, env, id, 'done');
    const before = runTaskList(dir, env, {}).data!['tasks'] as Array<{ history: unknown[] }>;
    const r = runTaskMove(dir, env, id, 'done');
    const after = runTaskList(dir, env, {}).data!['tasks'] as Array<{ history: unknown[] }>;
    expect(r.ok).toBe(true);
    expect(after[0]!.history.length).toBe(before[0]!.history.length);
  });

  it('allows skipping states but warns about it', () => {
    // Forbidding it would force two steps for form's sake, and the journal
    // records the real intent regardless.
    const id = addTask('Task');
    const r = runTaskMove(dir, env, id, 'done');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/skipping|backlog/i);
  });

  it('reports when the task does not exist', () => {
    const r = runTaskMove(dir, env, 'FLOW-99', 'done');
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.message).toMatch(/FLOW-99/);
  });

  it('rejects an unknown status', () => {
    const id = addTask('Task');
    const r = runTaskMove(dir, env, id, 'teleported');
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.message).toMatch(/backlog/);
  });
});
