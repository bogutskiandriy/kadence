import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd } from '../src/cli/commands/task.js';
import { runSprintCreate, runSprintStart, runSprintClose } from '../src/cli/commands/sprint.js';

/**
 * T111. The missing-estimate warning only means something inside a sprint.
 *
 * A team that does not run sprints was told on every `task add` that its work
 * "will not count towards velocity" — a nag about a feature it never chose.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-estimate-warning-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('task add without --estimate', () => {
  it('says nothing about estimates when no sprint is active', () => {
    const r = runTaskAdd(dir, env, 'Plain work', {});
    expect(r.ok).toBe(true);
    expect(r.message).not.toMatch(/estimate/i);
    expect(r.message).not.toMatch(/velocity/i);
  });

  it('says nothing once the only sprint has closed', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintClose(dir, env);
    const r = runTaskAdd(dir, env, 'Plain work', {});
    expect(r.message).not.toMatch(/estimate/i);
  });

  it('inside an active sprint names the sprint, not velocity', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintStart(dir, env, 'Sprint 1');
    const r = runTaskAdd(dir, env, 'Plain work', {});
    expect(r.message).toMatch(/Sprint 1/);
    expect(r.message).toMatch(/--estimate/);
    expect(r.message).not.toMatch(/velocity/i);
  });

  it('with an estimate stays quiet even inside an active sprint', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintStart(dir, env, 'Sprint 1');
    const r = runTaskAdd(dir, env, 'Sized work', { estimate: 3 });
    expect(r.message).not.toMatch(/estimate/i);
  });

  it('leaves the JSON payload unchanged', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintStart(dir, env, 'Sprint 1');
    const r = runTaskAdd(dir, env, 'Plain work', {});
    expect(Object.keys(r.data!).sort()).toEqual(['criteria', 'ok', 'schema', 'task']);
  });
});
