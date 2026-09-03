import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import {
  runSprintCreate,
  runSprintEdit,
  runSprintClose,
  runSprintList,
} from '../src/cli/commands/sprint.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprintit-sedit-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  runInit(dir);
  runSprintCreate(dir, env, 'Sprint 1');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const sprints = () => runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;

describe('sprint edit', () => {
  it('renames the active sprint without naming it', () => {
    expect(runSprintEdit(dir, env, undefined, { name: 'Renamed' }).ok).toBe(true);
    expect(sprints()[0]!['name']).toBe('Renamed');
  });

  it('sets description and both dates', () => {
    const r = runSprintEdit(dir, env, undefined, {
      description: 'Focus on auth',
      startDate: '2026-09-01',
      endDate: '2026-09-14',
    });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/description.*start.*end/);
  });

  it('accepts both dates in one call — validation sees the resulting state', () => {
    // Validating each field against the current state would reject this,
    // because at the moment of the check the start date is still unset.
    expect(
      runSprintEdit(dir, env, undefined, { startDate: '2026-09-01', endDate: '2026-09-14' }).ok,
    ).toBe(true);
  });

  it('rejects an end date before the start', () => {
    const r = runSprintEdit(dir, env, undefined, {
      startDate: '2026-09-14',
      endDate: '2026-09-01',
    });
    expect(r.exitCode).toBe(2);
    expect(r.message).toMatch(/before the start/i);
  });

  it('rejects a malformed date', () => {
    expect(runSprintEdit(dir, env, undefined, { startDate: '01.09.2026' }).exitCode).toBe(2);
  });

  it('refuses a name that another sprint already uses', () => {
    runSprintCreate(dir, env, 'Sprint 2');
    const r = runSprintEdit(dir, env, undefined, { name: 'Sprint 2' });
    expect(r.exitCode).toBe(2);
    expect(r.message).toMatch(/already exists/i);
  });

  it('edits a planned sprint by name', () => {
    runSprintCreate(dir, env, 'Sprint 2');
    expect(runSprintEdit(dir, env, 'Sprint 2', { description: 'Later work' }).ok).toBe(true);
  });

  it('refuses to edit a closed sprint — invariant I5', () => {
    runSprintClose(dir, env);
    const r = runSprintEdit(dir, env, 'Sprint 1', { name: 'Rewritten' });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/closed/i);
  });

  it('writes no event when nothing differs', () => {
    runSprintEdit(dir, env, undefined, { description: 'Same' });
    const r = runSprintEdit(dir, env, undefined, { description: 'Same' });
    expect(r.message).toMatch(/nothing changed/i);
  });

  it('reports a sprint that does not exist', () => {
    expect(runSprintEdit(dir, env, 'Missing', { name: 'X' }).exitCode).toBe(1);
  });
});
