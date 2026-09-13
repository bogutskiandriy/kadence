import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentBranch, defaultBaseBranch, eventIdsOnBranch } from '../src/core/git.js';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskList, runTaskMove } from '../src/cli/commands/task.js';

/**
 * `task list --branch` — what work this branch introduced.
 *
 * Membership is derived from git at read time and never stored. Writing a
 * branch name into an event would go stale the moment the branch is renamed or
 * merged, and would make the same events fold differently depending on where
 * they were written — which invariant I1 forbids.
 *
 * The measurement that justified the flag is in
 * docs/research/branch-context-2026-09.md.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-branch-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'tester@example.com');
  git('config', 'user.name', 'Tester');
  runInit(dir);
  git('add', '-A');
  git('commit', '-qm', 'init');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Two tasks on main, then a branch that adds one and moves one. */
function withBranch(): void {
  runTaskAdd(dir, env, 'On main one', {});
  runTaskAdd(dir, env, 'On main two', {});
  git('add', '-A');
  git('commit', '-qm', 'main work');

  git('checkout', '-q', '-b', 'feature');
  runTaskAdd(dir, env, 'Added on the branch', {});
  runTaskMove(dir, env, 'KAD-1', 'in_progress');
  git('add', '-A');
  git('commit', '-qm', 'branch work');
}

describe('git helpers', () => {
  it('reports the current branch', () => {
    expect(currentBranch(dir)).toBe('main');
    git('checkout', '-q', '-b', 'feature');
    expect(currentBranch(dir)).toBe('feature');
  });

  it('reports null on a detached HEAD rather than a sha', () => {
    runTaskAdd(dir, env, 'One', {});
    git('add', '-A');
    git('commit', '-qm', 'one');
    git('checkout', '-q', '--detach');
    expect(currentBranch(dir)).toBeNull();
  });

  it('prefers an existing main, then the configured default', () => {
    expect(defaultBaseBranch(dir)).toBe('main');
    git('branch', '-m', 'main', 'trunk');
    git('config', 'init.defaultBranch', 'trunk');
    expect(defaultBaseBranch(dir)).toBe('trunk');
  });

  it('lists the event ids a branch introduced, and nothing from before it', () => {
    withBranch();
    const ids = eventIdsOnBranch(dir, 'main', 'feature');
    expect(ids).not.toBeNull();
    // One create and one move on the branch; the two main tasks are not there.
    expect(ids!.size).toBe(2);
  });

  it('returns an empty set when the branch is level with its base', () => {
    const ids = eventIdsOnBranch(dir, 'main', 'main');
    expect(ids).not.toBeNull();
    expect(ids!.size).toBe(0);
  });

  it('returns null for a base that does not exist, instead of throwing', () => {
    expect(eventIdsOnBranch(dir, 'nope', 'main')).toBeNull();
  });
});

describe('task list --branch', () => {
  it('returns only the work the branch introduced', () => {
    withBranch();
    const r = runTaskList(dir, env, { branch: true, json: true });
    expect(r.ok).toBe(true);
    const titles = (r.data!['tasks'] as Array<{ title: string }>).map((t) => t.title);
    // The branch created one task and moved another; both belong to it.
    expect(titles.sort()).toEqual(['Added on the branch', 'On main one']);
  });

  it('names the branch and the base in the response', () => {
    withBranch();
    const r = runTaskList(dir, env, { branch: true, json: true });
    expect(r.data!['branch']).toEqual({ name: 'feature', base: 'main' });
  });

  it('leaves the response untouched when the flag is absent', () => {
    withBranch();
    const r = runTaskList(dir, env, { json: true });
    expect(r.data!['branch']).toBeUndefined();
    expect((r.data!['tasks'] as unknown[]).length).toBe(3);
  });

  it('takes an explicit base', () => {
    withBranch();
    // Against itself the branch introduced nothing.
    const r = runTaskList(dir, env, { branch: true, base: 'feature', json: true });
    expect(r.data!['tasks']).toHaveLength(0);
  });

  it('explains an empty branch instead of claiming the board is empty', () => {
    withBranch();
    const r = runTaskList(dir, env, { branch: true, base: 'feature' });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/branch/i);
    expect(r.message).not.toMatch(/No tasks yet/);
  });

  it('combines with the other filters, as every filter does', () => {
    withBranch();
    const r = runTaskList(dir, env, { branch: true, status: 'in_progress', json: true });
    const titles = (r.data!['tasks'] as Array<{ title: string }>).map((t) => t.title);
    expect(titles).toEqual(['On main one']);
  });

  it('names the state, not the argument, on a detached HEAD', () => {
    // The flag was understood; the repository is what refuses. `invalid_argument`
    // would send an agent looking for a typo it did not make.
    withBranch();
    git('checkout', '-q', '--detach');
    const r = runTaskList(dir, env, { branch: true });
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('conflicting_state');
    expect(r.exitCode).toBe(1);
    expect(r.error!.hint).toBeDefined();
    expect(r.message).toMatch(/detached/i);
  });

  it('fails with a hint when the base does not exist', () => {
    withBranch();
    const r = runTaskList(dir, env, { branch: true, base: 'no-such-branch' });
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
    expect(r.error!.received).toBe('no-such-branch');
  });
});
