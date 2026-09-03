import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The product's core tests.
 *
 * Everything else checks that the code works. These check that the thesis
 * works: an append-only journal removes the conflicts a file tracker creates.
 * The scenarios come from Probe A — conflict types actually found in public
 * repositories using Backlog.md and git-issues.
 */

const CLI = resolve('dist/cli.js');
let repo: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function sprintit(args: string[], email?: string): { stdout: string; code: number } {
  if (email !== undefined) git('config', 'user.email', email);
  const r = spawnSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return { stdout: r.stdout, code: r.status ?? -1 };
}

function tasks(): Array<{ label: string; title: string; status: string; history: unknown[] }> {
  return JSON.parse(sprintit(['task', 'list', '--json']).stdout).tasks;
}

/** Merges a branch and reports whether it conflicted — we ask git, not guess. */
function merge(branch: string): boolean {
  const r = spawnSync('git', ['merge', '--no-edit', branch], { cwd: repo, encoding: 'utf8' });
  return r.status !== 0 || /conflict/i.test(r.stdout + r.stderr);
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'sprintit-merge-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'main@example.com');
  git('config', 'user.name', 'Main');
  sprintit(['init']);
  git('add', '-A');
  git('commit', '-qm', 'sprintit init');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('branch merges', () => {
  it('three people edit ONE task — zero conflicts, every intent preserved', () => {
    // The worst case and simultaneously 89% of real conflicts per Probe A:
    // CONFLICT (content) in a file tracker with mutable state.
    sprintit(['task', 'add', 'Shared task', '--estimate', '3']);
    git('add', '-A');
    git('commit', '-qm', 'task created');

    const moves = [
      ['alice', 'in_review'],
      ['bob', 'blocked'],
      ['carol', 'done'],
    ] as const;

    for (const [who, to] of moves) {
      git('checkout', '-q', '-b', who, 'main');
      sprintit(['task', 'move', 'FLOW-1', to], `${who}@example.com`);
      git('add', '-A');
      git('commit', '-qm', `${who}: ${to}`);
      git('checkout', '-q', 'main');
    }

    git('config', 'user.email', 'main@example.com');
    const conflicts = moves.filter(([who]) => merge(who)).length;
    expect(conflicts).toBe(0);

    const task = tasks().find((t) => t.label === 'FLOW-1')!;
    // The state is deterministic — the highest ULID wins.
    expect(task.status).toBe('done');
    // And no intent is lost.
    const authors = (task.history as Array<{ actor: string; type: string }>)
      .filter((h) => h.type === 'task.moved')
      .map((h) => h.actor);
    expect(authors).toEqual(
      expect.arrayContaining(['alice@example.com', 'bob@example.com', 'carol@example.com']),
    );
  });

  it('three branches create tasks independently — different numbers, no collision', () => {
    // CONFLICT (add/add) from Probe A: in Backlog.md this is open task-4.12
    // about ID collisions across branches.
    for (const who of ['alice', 'bob', 'carol']) {
      git('checkout', '-q', '-b', who, 'main');
      sprintit(['task', 'add', `Task from ${who}`, '--estimate', '2'], `${who}@example.com`);
      git('add', '-A');
      git('commit', '-qm', `${who}: new task`);
      git('checkout', '-q', 'main');
    }

    git('config', 'user.email', 'main@example.com');
    const conflicts = ['alice', 'bob', 'carol'].filter(merge).length;
    expect(conflicts).toBe(0);

    const all = tasks();
    expect(all).toHaveLength(3);
    // Numbers are sequential and unique — exactly what a counter in a file cannot do.
    expect(new Set(all.map((t) => t.label)).size).toBe(3);
    expect(all.map((t) => t.label).sort()).toEqual(['FLOW-1', 'FLOW-2', 'FLOW-3']);
  });

  it('the state is identical regardless of merge order', () => {
    sprintit(['task', 'add', 'Task', '--estimate', '5']);
    git('add', '-A');
    git('commit', '-qm', 'task');

    for (const [who, to] of [['x', 'in_progress'], ['y', 'in_review']] as const) {
      git('checkout', '-q', '-b', who, 'main');
      sprintit(['task', 'move', 'FLOW-1', to], `${who}@example.com`);
      git('add', '-A');
      git('commit', '-qm', who);
      git('checkout', '-q', 'main');
    }

    git('config', 'user.email', 'main@example.com');
    git('checkout', '-q', '-b', 'order-a', 'main');
    merge('x');
    merge('y');
    const stateA = tasks()[0]!.status;

    git('checkout', '-q', '-b', 'order-b', 'main');
    merge('y');
    merge('x');
    const stateB = tasks()[0]!.status;

    expect(stateA).toBe(stateB);
  });

  it('the events folder disappears on a branch switch and returns on write', () => {
    // Git does not version empty directories. The spike reproduced this twice,
    // hence mkdir -p on EVERY write.
    git('checkout', '-q', '-b', 'with-events');
    sprintit(['task', 'add', 'Branch task']);
    git('add', '-A');
    git('commit', '-qm', 'event');

    git('checkout', '-q', 'main');
    const monthDirs = existsSync(join(repo, '.sprintit', 'events'))
      ? readdirSync(join(repo, '.sprintit', 'events'))
      : [];
    expect(monthDirs.filter((d) => d !== 'archive')).toHaveLength(0);

    const r = sprintit(['task', 'add', 'Task on main']);
    expect(r.code).toBe(0);
    expect(tasks()).toHaveLength(1);
  });

  it('the journal survives a rebase — ULIDs stay valid', () => {
    git('checkout', '-q', '-b', 'feature');
    sprintit(['task', 'add', 'Feature task', '--estimate', '2']);
    git('add', '-A');
    git('commit', '-qm', 'feature');

    git('checkout', '-q', 'main');
    sprintit(['task', 'add', 'Task main', '--estimate', '1']);
    git('add', '-A');
    git('commit', '-qm', 'main');

    git('checkout', '-q', 'feature');
    execFileSync('git', ['rebase', 'main'], { cwd: repo, stdio: 'pipe' });

    const all = tasks();
    expect(all).toHaveLength(2);
    expect(new Set(all.map((t) => t.label)).size).toBe(2);
  });

  it('a sprint closed on two branches stays closed exactly once', () => {
    // Invariant I5: the velocity of an already closed sprint is not rewritten.
    sprintit(['sprint', 'create', 'Sprint 1']);
    sprintit(['task', 'add', 'Task', '--estimate', '3']);
    sprintit(['sprint', 'add', 'FLOW-1']);
    sprintit(['task', 'move', 'FLOW-1', 'done']);
    git('add', '-A');
    git('commit', '-qm', 'sprint with a task');

    for (const who of ['p', 'q']) {
      git('checkout', '-q', '-b', who, 'main');
      sprintit(['sprint', 'close'], `${who}@example.com`);
      git('add', '-A');
      git('commit', '-qm', `${who} closed the sprint`);
      git('checkout', '-q', 'main');
    }

    git('config', 'user.email', 'main@example.com');
    expect(['p', 'q'].filter(merge).length).toBe(0);

    const status = JSON.parse(sprintit(['sprint', 'status', '--json']).stdout);
    // No active sprint — exactly one close happened.
    expect(status.sprint).toBeNull();
  });
});
