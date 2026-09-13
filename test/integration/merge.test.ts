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

function kadence(args: string[], email?: string): { stdout: string; code: number } {
  if (email !== undefined) git('config', 'user.email', email);
  const r = spawnSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return { stdout: r.stdout, code: r.status ?? -1 };
}

function tasks(): Array<{ label: string; title: string; status: string; history: unknown[] }> {
  return JSON.parse(kadence(['task', 'list', '--json']).stdout).tasks;
}

function labelsOf(label: string): string[] {
  return JSON.parse(kadence(['task', 'show', label, '--json']).stdout).task.labels;
}

/** Merges a branch and reports whether it conflicted — we ask git, not guess. */
function merge(branch: string): boolean {
  const r = spawnSync('git', ['merge', '--no-edit', branch], { cwd: repo, encoding: 'utf8' });
  return r.status !== 0 || /conflict/i.test(r.stdout + r.stderr);
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'kadence-merge-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'main@example.com');
  git('config', 'user.name', 'Main');
  kadence(['init']);
  git('add', '-A');
  git('commit', '-qm', 'kadence init');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('branch merges', () => {
  it('three people edit ONE task — zero conflicts, every intent preserved', () => {
    // The worst case and simultaneously 89% of real conflicts per Probe A:
    // CONFLICT (content) in a file tracker with mutable state.
    kadence(['task', 'add', 'Shared task', '--estimate', '3']);
    git('add', '-A');
    git('commit', '-qm', 'task created');

    const moves = [
      ['alice', 'in_review'],
      ['bob', 'blocked'],
      ['carol', 'done'],
    ] as const;

    for (const [who, to] of moves) {
      git('checkout', '-q', '-b', who, 'main');
      kadence(['task', 'move', 'KAD-1', to], `${who}@example.com`);
      git('add', '-A');
      git('commit', '-qm', `${who}: ${to}`);
      git('checkout', '-q', 'main');
    }

    git('config', 'user.email', 'main@example.com');
    const conflicts = moves.filter(([who]) => merge(who)).length;
    expect(conflicts).toBe(0);

    const task = tasks().find((t) => t.label === 'KAD-1')!;
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

  it('two branches label the same task — both labels survive the merge', () => {
    // The one field where "every intent preserved" was not true. A label set is
    // a set, and replacing it wholesale makes the later writer the only writer:
    // git merges the two events happily, and one person's label is gone with no
    // conflict, no warning and nothing in the output to notice.
    kadence(['task', 'add', 'Shared task', '--label', 'area-auth']);
    git('add', '-A');
    git('commit', '-qm', 'task created');

    for (const [who, label] of [
      ['x', 'impact-critical'],
      ['y', 'area-payments'],
    ] as const) {
      git('checkout', '-q', '-b', who, 'main');
      kadence(['task', 'edit', 'KAD-1', '--add-label', label], `${who}@example.com`);
      git('add', '-A');
      git('commit', '-qm', `${who}: ${label}`);
      git('checkout', '-q', 'main');
    }

    git('config', 'user.email', 'main@example.com');
    expect(['x', 'y'].filter(merge).length).toBe(0);

    const labels = labelsOf('KAD-1');
    expect(labels).toEqual(expect.arrayContaining(['area-auth', 'impact-critical', 'area-payments']));
  });

  it('read-modify-write from two branches keeps both labels too', () => {
    // The original bug, in the shape it was found: neither branch says "add",
    // both pass the whole set the way an agent that read it first would. The
    // event still records only the difference, so nothing is lost.
    kadence(['task', 'add', 'Shared task', '--label', 'area-auth']);
    git('add', '-A');
    git('commit', '-qm', 'task created');

    for (const [who, label] of [
      ['x', 'impact-critical'],
      ['y', 'area-payments'],
    ] as const) {
      git('checkout', '-q', '-b', who, 'main');
      kadence(['task', 'edit', 'KAD-1', '--label', 'area-auth', '--label', label], `${who}@example.com`);
      git('add', '-A');
      git('commit', '-qm', `${who}: ${label}`);
      git('checkout', '-q', 'main');
    }

    git('config', 'user.email', 'main@example.com');
    expect(['x', 'y'].filter(merge).length).toBe(0);

    expect(labelsOf('KAD-1').sort()).toEqual(['area-auth', 'area-payments', 'impact-critical']);
  });

  it('a label removed on one branch stays removed after a merge with an unrelated add', () => {
    // The other direction, and the reason a union at fold time is not the fix:
    // removing has to survive too, or a label can never be taken off.
    kadence(['task', 'add', 'Shared task', '--label', 'area-auth', '--label', 'stale']);
    git('add', '-A');
    git('commit', '-qm', 'task created');

    git('checkout', '-q', '-b', 'remover', 'main');
    kadence(['task', 'edit', 'KAD-1', '--remove-label', 'stale'], 'remover@example.com');
    git('add', '-A');
    git('commit', '-qm', 'remove stale');
    git('checkout', '-q', 'main');

    git('checkout', '-q', '-b', 'adder', 'main');
    kadence(['task', 'edit', 'KAD-1', '--add-label', 'impact-high'], 'adder@example.com');
    git('add', '-A');
    git('commit', '-qm', 'add impact-high');
    git('checkout', '-q', 'main');

    git('config', 'user.email', 'main@example.com');
    expect(['remover', 'adder'].filter(merge).length).toBe(0);

    expect(labelsOf('KAD-1').sort()).toEqual(['area-auth', 'impact-high']);
  });

  it('the set is the same whichever order the branches are merged in (I1)', () => {
    kadence(['task', 'add', 'Shared task', '--label', 'area-auth']);
    git('add', '-A');
    git('commit', '-qm', 'task created');

    for (const [who, flag, label] of [
      ['x', '--add-label', 'impact-critical'],
      ['y', '--remove-label', 'area-auth'],
    ] as const) {
      git('checkout', '-q', '-b', who, 'main');
      kadence(['task', 'edit', 'KAD-1', flag, label], `${who}@example.com`);
      git('add', '-A');
      git('commit', '-qm', who);
      git('checkout', '-q', 'main');
    }

    git('config', 'user.email', 'main@example.com');
    merge('y');
    merge('x');
    expect(labelsOf('KAD-1')).toEqual(['impact-critical']);
  });

  it('three branches create tasks independently — different numbers, no collision', () => {
    // CONFLICT (add/add) from Probe A: in Backlog.md this is open task-4.12
    // about ID collisions across branches.
    for (const who of ['alice', 'bob', 'carol']) {
      git('checkout', '-q', '-b', who, 'main');
      kadence(['task', 'add', `Task from ${who}`, '--estimate', '2'], `${who}@example.com`);
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
    expect(all.map((t) => t.label).sort()).toEqual(['KAD-1', 'KAD-2', 'KAD-3']);
  });

  it('the state is identical regardless of merge order', () => {
    kadence(['task', 'add', 'Task', '--estimate', '5']);
    git('add', '-A');
    git('commit', '-qm', 'task');

    for (const [who, to] of [['x', 'in_progress'], ['y', 'in_review']] as const) {
      git('checkout', '-q', '-b', who, 'main');
      kadence(['task', 'move', 'KAD-1', to], `${who}@example.com`);
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
    kadence(['task', 'add', 'Branch task']);
    git('add', '-A');
    git('commit', '-qm', 'event');

    git('checkout', '-q', 'main');
    const monthDirs = existsSync(join(repo, '.kadence', 'events'))
      ? readdirSync(join(repo, '.kadence', 'events'))
      : [];
    expect(monthDirs.filter((d) => d !== 'archive')).toHaveLength(0);

    const r = kadence(['task', 'add', 'Task on main']);
    expect(r.code).toBe(0);
    expect(tasks()).toHaveLength(1);
  });

  it('the journal survives a rebase — ULIDs stay valid', () => {
    git('checkout', '-q', '-b', 'feature');
    kadence(['task', 'add', 'Feature task', '--estimate', '2']);
    git('add', '-A');
    git('commit', '-qm', 'feature');

    git('checkout', '-q', 'main');
    kadence(['task', 'add', 'Task main', '--estimate', '1']);
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
    kadence(['sprint', 'create', 'Sprint 1']);
    kadence(['task', 'add', 'Task', '--estimate', '3']);
    kadence(['sprint', 'add', 'KAD-1']);
    kadence(['task', 'move', 'KAD-1', 'done']);
    git('add', '-A');
    git('commit', '-qm', 'sprint with a task');

    for (const who of ['p', 'q']) {
      git('checkout', '-q', '-b', who, 'main');
      kadence(['sprint', 'close'], `${who}@example.com`);
      git('add', '-A');
      git('commit', '-qm', `${who} closed the sprint`);
      git('checkout', '-q', 'main');
    }

    git('config', 'user.email', 'main@example.com');
    expect(['p', 'q'].filter(merge).length).toBe(0);

    const status = JSON.parse(kadence(['sprint', 'status', '--json']).stdout);
    // No active sprint — exactly one close happened.
    expect(status.sprint).toBeNull();
  });

  it('two branches each record a decision — both survive, numbered without a human', () => {
    // The reason log4brains dropped file numbering: numbered ADR files collide
    // on merge. Numbers here are derived while folding, so both survive and
    // neither branch had to pick a free number.
    git('checkout', '-q', '-b', 'alice', 'main');
    kadence(['decision', 'add', 'Use ULIDs', '--why', 'Clocks disagree.'], 'alice@example.com');
    git('add', '-A');
    git('commit', '-qm', 'alice decides');
    git('checkout', '-q', 'main');

    git('checkout', '-q', '-b', 'bob', 'main');
    kadence(['decision', 'add', 'Sync core', '--why', 'Async measured slower.'], 'bob@example.com');
    git('add', '-A');
    git('commit', '-qm', 'bob decides');
    git('checkout', '-q', 'main');

    git('config', 'user.email', 'main@example.com');
    expect([merge('alice'), merge('bob')].filter(Boolean).length).toBe(0);

    const listed = JSON.parse(kadence(['decision', 'list', '--json']).stdout).decisions as {
      label: string;
      title: string;
    }[];
    expect(listed.map((d) => d.label)).toEqual(['DEC-1', 'DEC-2']);
    expect(listed.map((d) => d.title).sort()).toEqual(['Sync core', 'Use ULIDs']);
  });

  it('a decision superseded on one branch reads as superseded after the merge', () => {
    kadence(['decision', 'add', 'Use Thrift', '--why', 'Fastest measured.']);
    git('add', '-A');
    git('commit', '-qm', 'thrift');

    git('checkout', '-q', '-b', 'dana', 'main');
    kadence(
      ['decision', 'add', 'Use Avro', '--why', 'Schema evolution.', '--supersedes', 'DEC-1'],
      'dana@example.com',
    );
    git('add', '-A');
    git('commit', '-qm', 'dana supersedes');
    git('checkout', '-q', 'main');

    git('config', 'user.email', 'main@example.com');
    expect(merge('dana')).toBe(false);

    // One event crossed the merge and carried both directions with it.
    const all = JSON.parse(kadence(['decision', 'list', '--all', '--json']).stdout).decisions as {
      label: string;
      supersededBy: string | null;
    }[];
    expect(all.find((d) => d.label === 'DEC-1')!.supersededBy).toBe('DEC-2');

    const current = JSON.parse(kadence(['decision', 'list', '--json']).stdout).decisions as {
      label: string;
    }[];
    expect(current.map((d) => d.label)).toEqual(['DEC-2']);
  });
});

describe('milestones from two branches', () => {
  it('merge without conflict and end up with different numbers', () => {
    // Invariant I7 applied to a new entity: identity is the ULID, MS-N is
    // derived while folding. Two people can each create a milestone offline
    // and neither has to renumber when the branches meet.
    kadence(['milestone', 'create', 'Launch'], 'main@example.com');
    git('add', '-A');
    git('commit', '-qm', 'first milestone');

    for (const who of ['alice', 'bob'] as const) {
      git('checkout', '-q', '-b', who, 'main');
      kadence(['milestone', 'create', `${who} target`], `${who}@example.com`);
      kadence(['task', 'add', `${who} work`, '--estimate', '3']);
      git('add', '-A');
      git('commit', '-qm', `${who} milestone`);
      git('checkout', '-q', 'main');
    }

    expect(merge('alice')).toBe(false);
    expect(merge('bob')).toBe(false);

    const list = JSON.parse(kadence(['milestone', 'list', '--json']).stdout).milestones as Array<{
      label: string;
      name: string;
    }>;
    expect(list).toHaveLength(3);
    // Every label distinct, and assigned by ULID order rather than by who
    // merged first.
    expect(new Set(list.map((m) => m.label)).size).toBe(3);
    expect(list.map((m) => m.label)).toEqual(['MS-1', 'MS-2', 'MS-3']);
    expect(list[0]!.name).toBe('Launch');
  });

  it('a task keeps exactly one milestone when two branches assign different ones', () => {
    kadence(['task', 'add', 'Shared work', '--estimate', '5'], 'main@example.com');
    kadence(['milestone', 'create', 'One']);
    kadence(['milestone', 'create', 'Two']);
    git('add', '-A');
    git('commit', '-qm', 'setup');

    for (const [who, target] of [['alice', 'One'], ['bob', 'Two']] as const) {
      git('checkout', '-q', '-b', who, 'main');
      kadence(['milestone', 'add', 'KAD-1', '--milestone', target], `${who}@example.com`);
      git('add', '-A');
      git('commit', '-qm', `${who} assigns`);
      git('checkout', '-q', 'main');
    }

    expect(merge('alice')).toBe(false);
    expect(merge('bob')).toBe(false);

    const milestones = JSON.parse(kadence(['milestone', 'list', '--json']).stdout)
      .milestones as Array<{ label: string; totalTasks: number }>;
    // The later assignment by ULID holds, and the task appears in one group —
    // never in both, which a list rebuilt per event would have allowed.
    expect(milestones.reduce((n, m) => n + m.totalTasks, 0)).toBe(1);
  });
});

