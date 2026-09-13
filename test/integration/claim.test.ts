import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Two agents, two branches, one task.
 *
 * This is the scenario ADR-011 exists for, and the only place it can be proven
 * is a real repository with real merges. The claim under test is not that one
 * agent wins — it is that both merge orders name the same winner and keep the
 * loser visible, which is invariant I1 applied to people.
 */

const CLI = resolve('dist/cli.js');
let repo: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function kadence(args: string[], email?: string): { stdout: string; stderr: string; code: number } {
  if (email !== undefined) git('config', 'user.email', email);
  const r = spawnSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

function merge(branch: string): boolean {
  const r = spawnSync('git', ['merge', '--no-edit', branch], { cwd: repo, encoding: 'utf8' });
  return r.status !== 0 || /conflict/i.test(r.stdout + r.stderr);
}

function claimState(): { claimedBy: string | null; contestedBy: string[] } {
  const task = JSON.parse(kadence(['task', 'list', '--json']).stdout).tasks[0];
  return { claimedBy: task.claimedBy, contestedBy: task.contestedBy };
}

/**
 * Builds the same repository twice, merging the two claim branches in the
 * given order. The result must not depend on which one goes first.
 */
function raceWithMergeOrder(first: 'alice' | 'bob'): { claimedBy: string | null; contestedBy: string[]; conflicted: boolean } {
  kadence(['task', 'add', 'Shared work'], 'main@example.com');
  git('add', '-A');
  git('commit', '-qm', 'task created');

  for (const who of ['alice', 'bob'] as const) {
    git('checkout', '-q', '-b', who, 'main');
    kadence(['task', 'claim', 'KAD-1'], `${who}@example.com`);
    git('add', '-A');
    git('commit', '-qm', `${who} claims`);
    git('checkout', '-q', 'main');
  }

  const second = first === 'alice' ? 'bob' : 'alice';
  const conflicted = merge(first) || merge(second);
  return { ...claimState(), conflicted };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'kadence-claim-int-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'main@example.com');
  git('config', 'user.name', 'Main');
  kadence(['init']);
  git('add', '-A');
  git('commit', '-qm', 'kadence init');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('two agents claim the same task', () => {
  it('merges without a conflict and names the same owner in either order', () => {
    const aliceFirst = raceWithMergeOrder('alice');
    expect(aliceFirst.conflicted).toBe(false);

    // The winner is whoever wrote the lower ULID, which is the earlier claim.
    // Both merge orders must agree on it — that is the whole invariant.
    const winner = aliceFirst.claimedBy;
    const loser = winner === 'alice@example.com' ? 'bob@example.com' : 'alice@example.com';
    expect(winner).not.toBeNull();
    expect(aliceFirst.contestedBy).toEqual([loser]);

    rmSync(repo, { recursive: true, force: true });
    repo = mkdtempSync(join(tmpdir(), 'kadence-claim-int-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'main@example.com');
    git('config', 'user.name', 'Main');
    kadence(['init']);
    git('add', '-A');
    git('commit', '-qm', 'kadence init');

    const bobFirst = raceWithMergeOrder('bob');
    expect(bobFirst.conflicted).toBe(false);
    expect(bobFirst.claimedBy).toBe(winner);
    expect(bobFirst.contestedBy).toEqual([loser]);
  });

  it('keeps both claim events after the merge — neither person is erased', () => {
    raceWithMergeOrder('alice');
    const task = JSON.parse(kadence(['task', 'show', 'KAD-1', '--json']).stdout).task;
    const claims = task.history.filter((h: { type: string }) => h.type === 'task.claimed');
    expect(claims).toHaveLength(2);
    expect(claims.map((c: { actor: string }) => c.actor).sort()).toEqual([
      'alice@example.com',
      'bob@example.com',
    ]);
  });

  it('warns the second claimant at the moment they claim, not only after a merge', () => {
    kadence(['task', 'add', 'Shared work'], 'main@example.com');
    kadence(['task', 'claim', 'KAD-1'], 'alice@example.com');
    const r = kadence(['task', 'claim', 'KAD-1'], 'bob@example.com');
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/contested/i);
  });

  it('leaves a contested task out of nobody’s ready list', () => {
    // Two people claimed it, so hiding it is the one case where surfacing a
    // conflict does no good: it needs a person, and both should see it.
    raceWithMergeOrder('alice');
    const ready = JSON.parse(kadence(['ready', '--json'], 'carol@example.com').stdout);
    expect(ready.tasks.map((t: { label: string }) => t.label)).toContain('KAD-1');
  });

  it('never hands a contested task to a third claimant asking for work', () => {
    // A contested task stays in `ready` on purpose: it needs a person, and
    // both claimants should see it. But `claim` with no argument is what a
    // fleet of agents runs, and taking the top of that list piles a third
    // actor onto a conflict two people already have to sort out.
    raceWithMergeOrder('alice');
    kadence(['task', 'add', 'Something free'], 'main@example.com');

    const r = kadence(['task', 'claim'], 'carol@example.com');

    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toContain('KAD-2');
    expect(claimState().contestedBy).not.toContain('carol@example.com');
  });

  it('says so rather than joining a contest when every ready task is claimed', () => {
    raceWithMergeOrder('alice');

    const r = kadence(['task', 'claim'], 'carol@example.com');

    expect(r.code).toBe(1);
    // "Nothing ready." with no reason would be a lie by omission: the task is
    // right there in `ready`, and the message has to say why claim skipped it.
    expect(r.stderr).toMatch(/contested/i);
    expect(r.stderr).toContain('KAD-1');
    expect(claimState().contestedBy).not.toContain('carol@example.com');
  });

  it('drops the claim from the journal state when the holder finishes the work', () => {
    kadence(['task', 'add', 'Shared work'], 'main@example.com');
    kadence(['task', 'claim', 'KAD-1'], 'alice@example.com');
    kadence(['task', 'move', 'KAD-1', 'done'], 'alice@example.com');
    expect(claimState().claimedBy).toBeNull();
  });
});
