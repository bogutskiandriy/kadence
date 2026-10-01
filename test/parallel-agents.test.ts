import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Several agents writing at once lose nothing (KAD-62).
 *
 * In the neighbouring tools this is where work disappears: tasks.json
 * corrupted by parallel Claude Code windows (task-master #1567), a database
 * that panics on a second process (beads #2029), a journal corrupted with
 * three agents (beads #2430), two agents claiming one task (Backlog.md #937).
 * kadence writes one file per event, renamed into place, so it should hold by
 * construction — this proves it at a size where a race would show, through
 * the real binary, in separate processes, the way agents actually run.
 */

const CLI = resolve('dist/cli.js');
const env = { ...process.env, KADENCE_SOURCE: 'agent', NO_COLOR: '1' };
let root: string;
let main: string;

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const kadence = (cwd: string, ...args: string[]) =>
  JSON.parse(execFileSync('node', [CLI, ...args, '--json'], { cwd, env, encoding: 'utf8' })) as Record<string, unknown>;

/** Runs `count` writers at once in `cwd`, each adding `each` tasks. */
function writers(cwd: string, tag: string, count: number, each: number): Promise<void[]> {
  return Promise.all(
    Array.from({ length: count }, (_, w) =>
      new Promise<void>((done, fail) => {
        // One shell loop per writer, so the processes really overlap.
        const script = Array.from({ length: each }, (_, i) =>
          `node "${CLI}" task add "${tag} writer ${w} task ${i}" >/dev/null`).join(' && ');
        const child = spawn('sh', ['-c', script], { cwd, env, stdio: 'ignore' });
        child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${tag} writer ${w} exited ${code}`))));
      }),
    ),
  );
}

const titles = (cwd: string): string[] =>
  ((kadence(cwd, 'task', 'list', '--limit', '0')['tasks'] as Array<{ title: string }>) ?? []).map((t) => t.title);

const eventFiles = (dir: string): number =>
  readdirSync(dir).reduce((n, f) => {
    const p = join(dir, f);
    return n + (statSync(p).isDirectory() ? eventFiles(p) : f.endsWith('.json') ? 1 : 0);
  }, 0);

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'kadence-parallel-'));
  main = join(root, 'main');
  execFileSync('git', ['init', '-q', '-b', 'main', main]);
  git(main, 'config', 'user.email', 'agent@example.com');
  git(main, 'config', 'user.name', 'Agent');
  execFileSync('node', [CLI, 'init', '--no-hooks'], { cwd: main, env });
  kadence(main, 'task', 'add', 'The one task everyone wants');
  git(main, 'add', '-A');
  git(main, 'commit', '-q', '-m', 'init');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('parallel agents', () => {
  it('eight processes writing in one working tree lose no task', async () => {
    const before = titles(main).length;
    await writers(main, 'same-tree', 8, 25);
    const after = titles(main);
    expect(after.length - before).toBe(200);
    for (let w = 0; w < 8; w++) {
      for (let i = 0; i < 25; i++) expect(after).toContain(`same-tree writer ${w} task ${i}`);
    }
    git(main, 'add', '-A');
    git(main, 'commit', '-q', '-m', 'same-tree writes');
  }, 180_000);

  it('three worktrees written at once merge without a conflict and lose nothing', async () => {
    const trees = ['a', 'b', 'c'].map((name) => {
      const path = join(root, `wt-${name}`);
      git(main, 'worktree', 'add', '-q', '-b', `agent-${name}`, path);
      return { name, path };
    });

    await Promise.all(trees.map((t) => writers(t.path, `wt-${t.name}`, 4, 20)));
    for (const t of trees) {
      git(t.path, 'add', '-A');
      git(t.path, 'commit', '-q', '-m', `agent ${t.name}`);
    }

    // One octopus merge: any two branches touching the same file would stop it.
    git(main, 'merge', '-q', '--no-edit', 'agent-a', 'agent-b', 'agent-c');

    const all = titles(main);
    for (const t of trees) {
      for (let w = 0; w < 4; w++) {
        for (let i = 0; i < 20; i++) expect(all).toContain(`wt-${t.name} writer ${w} task ${i}`);
      }
    }
    // 1 seed + 200 same-tree + 240 from worktrees, each a task.created event.
    expect(all.length).toBe(441);
    expect(eventFiles(join(main, '.kadence', 'events'))).toBeGreaterThanOrEqual(441);
  }, 240_000);

  it('two worktrees claiming one task are reported as contested, not resolved silently', () => {
    const one = join(root, 'wt-claim-1');
    const two = join(root, 'wt-claim-2');
    git(main, 'worktree', 'add', '-q', '-b', 'claim-1', one);
    git(main, 'worktree', 'add', '-q', '-b', 'claim-2', two);

    // Each agent sees only its own claim; neither is refused.
    expect((kadence(one, 'task', 'claim', 'KAD-1')['claim'] as string)).toBe('claimed');
    expect((kadence(two, 'task', 'claim', 'KAD-1')['claim'] as string)).toBe('claimed');
    for (const p of [one, two]) {
      git(p, 'add', '-A');
      git(p, 'commit', '-q', '-m', 'claim');
    }
    git(main, 'merge', '-q', '--no-edit', 'claim-1', 'claim-2');

    const task = kadence(main, 'task', 'show', 'KAD-1')['task'] as { claimedBy: string; contestedBy: string[] };
    expect(task.claimedBy).toMatch(/#wt-claim-1$|#wt-claim-2$/);
    expect(task.contestedBy).toHaveLength(1);
    expect(task.contestedBy[0]).not.toBe(task.claimedBy);
  });
});
