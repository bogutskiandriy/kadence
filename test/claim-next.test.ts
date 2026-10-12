import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskClaim, runTaskMove, runTaskCriterionAdd, runTaskCriterionCheck, loadState } from '../src/cli/commands/task.js';

/**
 * What `task claim` leaves behind (2026-10-12 friction notes).
 *
 * Two things the journal itself kept noticing. A claimed task stayed in
 * `backlog`, so the release task moved backlog → done and the board showed
 * claimed work as not started — the site's own demo shows it. And the agent
 * that claimed a task never saw its acceptance criteria unless it also ran
 * `task show`: the definition of done arrived only at `done`, as a warning.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const other = { KADENCE_ACTOR: 'someone-else@example.com' } as NodeJS.ProcessEnv;
const status = (label: string) => loadState(dir).state.tasks.find((t) => t.label === label)!.status;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-claim-next-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('a claim starts the work', () => {
  it('moves a task that has not started into the started column, and says so', () => {
    runTaskAdd(dir, env, 'Fix login redirect', {});
    const r = runTaskClaim(dir, env, 'KAD-1');

    expect(status('KAD-1')).toBe('in_progress');
    expect(r.message).toContain('backlog → in_progress');
    expect(r.data!['moved']).toEqual({ from: 'backlog', to: 'in_progress' });
  });

  it('leaves a task that is already started where it is', () => {
    runTaskAdd(dir, env, 'Review the login fix', {});
    runTaskMove(dir, env, 'KAD-1', 'in_review');
    const r = runTaskClaim(dir, env, 'KAD-1');

    expect(status('KAD-1')).toBe('in_review');
    expect(r.data!['moved']).toBeNull();
  });

  it('does not move a task the claimant does not hold', () => {
    runTaskAdd(dir, env, 'Fix login redirect', {});
    runTaskClaim(dir, other, 'KAD-1');
    runTaskMove(dir, other, 'KAD-1', 'backlog');
    const r = runTaskClaim(dir, env, 'KAD-1');

    expect(r.data!['claim']).toBe('contested');
    expect(status('KAD-1')).toBe('backlog');
  });
});

describe('a claim shows what done means', () => {
  it('lists the open acceptance criteria in the message and in --json', () => {
    runTaskAdd(dir, env, 'Fix login redirect', {});
    runTaskCriterionAdd(dir, env, 'KAD-1', 'the session survives the redirect');
    runTaskCriterionAdd(dir, env, 'KAD-1', 'a test reproduces the bug first');
    runTaskCriterionCheck(dir, env, 'KAD-1', '2', false);
    const r = runTaskClaim(dir, env, 'KAD-1');

    expect(r.message).toContain('Done when (1 of 2 open):');
    expect(r.message).toContain('1. [ ] the session survives the redirect');
    expect(r.message).not.toContain('a test reproduces the bug first');
    const criteria = r.data!['criteria'] as Array<{ n: number; checked: boolean }>;
    expect(criteria.map((c) => [c.n, c.checked])).toEqual([[1, false], [2, true]]);
  });

  it('says nothing about criteria when the task has none', () => {
    runTaskAdd(dir, env, 'Fix login redirect', {});
    const r = runTaskClaim(dir, env, 'KAD-1');
    expect(r.message).not.toContain('Done when');
    expect(r.data!['criteria']).toEqual([]);
  });
});
