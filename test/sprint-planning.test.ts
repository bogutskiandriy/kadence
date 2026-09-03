import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd } from '../src/cli/commands/task.js';
import {
  runSprintCreate,
  runSprintAdd,
  runSprintClose,
  runSprintStart,
  runSprintList,
} from '../src/cli/commands/sprint.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flowit-plan-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('planning ahead', () => {
  it('the first sprint starts immediately', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list[0]!['status']).toBe('active');
  });

  it('the second sprint is created as planned rather than rejected', () => {
    // A PM must plan the next sprint while the current one is still running.
    runSprintCreate(dir, env, 'Sprint 1');
    const r = runSprintCreate(dir, env, 'Sprint 2');
    expect(r.ok).toBe(true);

    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list.map((s) => s['status'])).toEqual(['active', 'planned']);
  });

  it('tasks can be filed into a planned sprint in advance', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintCreate(dir, env, 'Sprint 2');
    runTaskAdd(dir, env, 'For later', { estimate: 3 });

    const r = runSprintAdd(dir, env, 'FLOW-1', { sprint: 'Sprint 2' });
    expect(r.ok).toBe(true);

    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect((list[1]!['taskIds'] as unknown[]).length).toBe(1);
  });

  it('without a sprint name the task goes to the active one', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintCreate(dir, env, 'Sprint 2');
    runTaskAdd(dir, env, 'Now', { estimate: 2 });
    runSprintAdd(dir, env, 'FLOW-1', {});

    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect((list[0]!['taskIds'] as unknown[]).length).toBe(1);
  });

  it('after closing the active one, the next starts with a single command', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintCreate(dir, env, 'Sprint 2');
    runSprintClose(dir, env);

    const r = runSprintStart(dir, env, undefined);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('Sprint 2');

    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list.map((s) => s['status'])).toEqual(['closed', 'active']);
  });

  it('does not start a second sprint until the active one closes', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintCreate(dir, env, 'Sprint 2');
    const r = runSprintStart(dir, env, 'Sprint 2');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Sprint 1');
  });

  it('reports when there is nothing to start', () => {
    expect(runSprintStart(dir, env, undefined).exitCode).toBe(1);
  });

  it('closing the active sprint leaves planned ones untouched', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintCreate(dir, env, 'Sprint 2');
    runSprintClose(dir, env);

    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list[1]!['status']).toBe('planned');
  });
});

describe('runSprintList', () => {
  it('hints at how to start when there are no sprints', () => {
    expect(runSprintList(dir, env).message).toMatch(/sprint create/);
  });

  it('lists sprints with task and point counts', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runTaskAdd(dir, env, 'Task', { estimate: 5 });
    runSprintAdd(dir, env, 'FLOW-1', {});

    const msg = runSprintList(dir, env).message;
    expect(msg).toContain('Sprint 1');
    expect(msg).toContain('5');
  });
});
