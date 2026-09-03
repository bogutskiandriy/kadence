import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove } from '../src/cli/commands/task.js';
import {
  runSprintCreate,
  runSprintAdd,
  runSprintClose,
  runSprintStatus,
  formatDuration,
} from '../src/cli/commands/sprint.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-sprint-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function addTask(title: string, estimate?: number): string {
  const r = runTaskAdd(dir, env, title, estimate === undefined ? {} : { estimate });
  return (r.data!['task'] as { id: string }).id;
}

describe('runSprintCreate', () => {
  it('creates a sprint and makes it active right away', () => {
    const r = runSprintCreate(dir, env, 'Sprint 1');
    expect(r.ok).toBe(true);
    expect(runSprintStatus(dir, env).message).toContain('Sprint 1');
  });

  it('the second sprint is planned rather than rejected', () => {
    // Changed deliberately: a PM fills the next sprint while the current one runs.
    runSprintCreate(dir, env, 'First');
    const r = runSprintCreate(dir, env, 'Second');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/planned/i);
  });

  it('rejects an empty name', () => {
    expect(runSprintCreate(dir, env, '   ').exitCode).toBe(2);
  });
});

describe('runSprintAdd', () => {
  it('adds a task to the active sprint', () => {
    runSprintCreate(dir, env, 'S1');
    addTask('Task', 3);
    expect(runSprintAdd(dir, env, 'KAD-1').ok).toBe(true);
    expect(runSprintStatus(dir, env).message).toContain('KAD-1');
  });

  it('reports when there is no active sprint', () => {
    addTask('Task', 3);
    const r = runSprintAdd(dir, env, 'KAD-1');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/sprint create/);
  });

  it('reports when the task does not exist', () => {
    runSprintCreate(dir, env, 'S1');
    expect(runSprintAdd(dir, env, 'KAD-99').exitCode).toBe(1);
  });
});

describe('runSprintClose', () => {
  it('computes velocity from completed tasks', () => {
    runSprintCreate(dir, env, 'S1');
    const a = addTask('A', 3);
    const b = addTask('B', 5);
    runSprintAdd(dir, env, a);
    runSprintAdd(dir, env, b);
    runTaskMove(dir, env, a, 'done');

    const r = runSprintClose(dir, env);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('3');
    expect((r.data!['report'] as { velocity: number }).velocity).toBe(3);
  });

  it('warns about completed tasks without an estimate', () => {
    runSprintCreate(dir, env, 'S1');
    const a = addTask('No estimate');
    runSprintAdd(dir, env, a);
    runTaskMove(dir, env, a, 'done');

    const r = runSprintClose(dir, env);
    expect(r.warnings?.join(' ')).toMatch(/without an estimate/i);
  });

  it('names the carried-over tasks', () => {
    runSprintCreate(dir, env, 'S1');
    const a = addTask('A', 3);
    runSprintAdd(dir, env, a);

    const r = runSprintClose(dir, env);
    expect(r.message).toMatch(/carried over/i);
  });

  it('refuses to close when no sprint is active', () => {
    const r = runSprintClose(dir, env);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
  });

  it('a task cannot be added to a sprint after it closes — I5', () => {
    runSprintCreate(dir, env, 'S1');
    const a = addTask('A', 3);
    runSprintAdd(dir, env, a);
    runSprintClose(dir, env);

    const b = addTask('B', 2);
    const r = runSprintAdd(dir, env, b);
    expect(r.ok).toBe(false);
  });

  it('the next sprint can be created after closing', () => {
    runSprintCreate(dir, env, 'S1');
    runSprintClose(dir, env);
    expect(runSprintCreate(dir, env, 'S2').ok).toBe(true);
  });
});

describe('runSprintStatus', () => {
  it('hints at how to start when there are no sprints', () => {
    expect(runSprintStatus(dir, env).message).toMatch(/sprint create/);
  });

  it('shows progress of the active sprint', () => {
    runSprintCreate(dir, env, 'S1');
    const a = addTask('A', 3);
    const b = addTask('B', 5);
    runSprintAdd(dir, env, a);
    runSprintAdd(dir, env, b);
    runTaskMove(dir, env, a, 'done');

    const msg = runSprintStatus(dir, env).message;
    expect(msg).toContain('S1');
    expect(msg).toMatch(/3.*8|8.*3/s);
  });
});

describe('formatDuration', () => {
  it('shows minutes when under an hour', () => {
    expect(formatDuration(0.75)).toBe('45m');
  });

  it('shows tenths of an hour in the working range', () => {
    expect(formatDuration(3.25)).toBe('3.3h');
  });

  it('rounds long spans to whole hours', () => {
    expect(formatDuration(37.4)).toBe('37h');
  });
});

describe('sprint report', () => {
  it('omits \"0.0h per point\" when the work took under a minute', () => {
    // A number rounded to zero looks like a bug and undermines trust in the rest
    // of the report. Better to omit the line entirely.
    runSprintCreate(dir, env, 'S1');
    const a = addTask('A', 3);
    runSprintAdd(dir, env, a);
    runTaskMove(dir, env, a, 'in_progress');
    runTaskMove(dir, env, a, 'done');

    const r = runSprintClose(dir, env);
    expect(r.message).not.toContain('0.0h');
    expect(r.message).toContain('Velocity');
  });
});
