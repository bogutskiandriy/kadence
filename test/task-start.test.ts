import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskEdit, runTaskShow, runTaskList } from '../src/cli/commands/task.js';

/**
 * A planned start, beside the due date (DEC-71).
 *
 * The timeline needs one for an epic nobody has scheduled work under yet:
 * without it, the only way to say "this starts in December" is to invent a
 * child task in a sprint.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-start-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const show = (ref: string): Record<string, unknown> =>
  runTaskShow(dir, env, ref).data!['task'] as Record<string, unknown>;

describe('task start', () => {
  it('is set on add', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', start: '2026-12-01', due: '2026-12-20' });
    expect(show('KAD-1')).toMatchObject({ start: '2026-12-01', due: '2026-12-20' });
  });

  it('is set and cleared on edit', () => {
    runTaskAdd(dir, env, 'Billing', {});
    expect(runTaskEdit(dir, env, 'KAD-1', { start: '2026-12-01' }).ok).toBe(true);
    expect(show('KAD-1')['start']).toBe('2026-12-01');

    runTaskEdit(dir, env, 'KAD-1', { start: '' });
    expect(show('KAD-1')['start']).toBeNull();
  });

  it('is null in --json when never set, never absent', () => {
    runTaskAdd(dir, env, 'Billing', {});
    const tasks = runTaskList(dir, env, { json: true }).data!['tasks'] as Array<Record<string, unknown>>;
    expect(tasks[0]).toHaveProperty('start', null);
  });

  it('must be a calendar date', () => {
    const r = runTaskAdd(dir, env, 'Billing', { start: '01.12.2026' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ code: 'invalid_argument', received: '01.12.2026' });
    expect(runTaskEdit(dir, env, 'KAD-1', { start: 'soon' }).ok).toBe(false);
  });

  it('after the due date is refused, on add and on edit', () => {
    expect(runTaskAdd(dir, env, 'Backwards', { start: '2026-12-20', due: '2026-12-01' }).ok).toBe(false);

    runTaskAdd(dir, env, 'Billing', { due: '2026-12-01' });
    const r = runTaskEdit(dir, env, 'KAD-1', { start: '2026-12-20' });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('2026-12-01');
  });
});
