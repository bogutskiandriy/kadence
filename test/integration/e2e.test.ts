import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The whole product, through the real binary.
 *
 * Every other test calls functions directly. This one runs the thing a user
 * installs, in a real repository, in the order a team would use it — which is
 * the only way to catch wiring that unit tests cannot see: a command missing
 * from the CLI, a flag that never reaches its handler, an exit code that lies.
 */

const CLI = resolve('dist/cli.js');
let dir: string;

function run(...args: string[]): { out: string; err: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: r.stdout, err: r.stderr, code: r.status ?? -1 };
}

function json(...args: string[]): Record<string, unknown> {
  const r = run(...args, '--json');
  expect(r.out, `${args.join(' ')} produced no JSON`).not.toBe('');
  return JSON.parse(r.out) as Record<string, unknown>;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-e2e-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'PM'], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('a team uses kadence for a sprint', () => {
  it('runs the whole cycle and reports velocity from real events', () => {
    expect(run('init').code).toBe(0);
    expect(existsSync(join(dir, '.kadence', 'events'))).toBe(true);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('.kadence/state.json');

    run('sprint', 'create', 'Sprint 1');
    run('task', 'add', 'Auth epic', '--type', 'epic');
    run('task', 'add', 'Login form', '--parent', 'KAD-1', '--estimate', '5', '-a', 'dev@example.com');
    run('task', 'add', 'Fix crash', '--type', 'bug', '--priority', 'urgent', '--estimate', '3');
    run('task', 'add', 'Docs', '--estimate', '2');

    for (const t of ['KAD-2', 'KAD-3', 'KAD-4']) run('sprint', 'add', t);

    run('task', 'comment', 'KAD-3', 'Reproduced on Safari');
    run('task', 'log', 'KAD-3', '2h');
    run('task', 'block', 'KAD-4', 'KAD-2');
    run('task', 'move', 'KAD-2,KAD-3', 'done');

    const report = json('sprint', 'close')['report'] as Record<string, unknown>;
    expect(report['velocity']).toBe(8);
    expect(report['committed']).toBe(10);
    expect(report['carriedOver']).toEqual(['KAD-4']);
  });

  // Twenty-odd process spawns, so it needs a budget: the default 5 s is enough on
  // an idle machine and not on a busy one, and a timeout here reads like a
  // product failure when it is only contention.
  it('every command a user can reach exits cleanly', () => {
    run('init');
    run('task', 'add', 'Task', '--estimate', '3');
    run('sprint', 'create', 'Sprint 1');

    // A command that exists in help but crashes is worse than one that is
    // missing: the user trusts it.
    const commands: string[][] = [
      ['task', 'list'], ['task', 'list', '--tree'], ['task', 'show', 'KAD-1'],
      ['task', 'edit', 'KAD-1', '--priority', 'high'], ['task', 'move', 'KAD-1', 'todo'],
      ['task', 'assign', 'KAD-1', 'dev@example.com'], ['task', 'comment', 'KAD-1', 'note'],
      ['task', 'log', 'KAD-1', '1h'], ['task', 'cancel', 'KAD-1'],
      ['board'], ['board', 'config'],
      ['sprint', 'status'], ['sprint', 'list'], ['sprint', 'burndown'],
      ['template', 'save', 'bug', '--type', 'bug'], ['template', 'list'],
      ['schema'], ['schema', '--json'],
      ['board', '--json', '--fields', 'label,status'],
      ['task', 'list', '--json', '--fields', 'id,label'],
      ['--help'], ['--version'],
    ];

    for (const args of commands) {
      const r = run(...args);
      expect(r.code, `${args.join(' ')} exited ${r.code}: ${r.err}`).toBe(0);
    }
  }, 30_000);

  it('survives three people editing one task on separate branches', () => {
    run('init');
    run('task', 'add', 'Shared', '--estimate', '3');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'task'], { cwd: dir });

    for (const [who, to] of [['a', 'in_review'], ['b', 'blocked'], ['c', 'done']] as const) {
      execFileSync('git', ['checkout', '-q', '-b', who, 'main'], { cwd: dir });
      execFileSync('git', ['config', 'user.email', `${who}@example.com`], { cwd: dir });
      run('task', 'move', 'KAD-1', to);
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-qm', who], { cwd: dir });
      execFileSync('git', ['checkout', '-q', 'main'], { cwd: dir });
    }

    execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
    for (const who of ['a', 'b', 'c']) {
      const m = spawnSync('git', ['merge', '--no-edit', who], { cwd: dir, encoding: 'utf8' });
      expect(m.status, `merging ${who} conflicted`).toBe(0);
    }

    const task = (json('task', 'list')['tasks'] as Array<Record<string, unknown>>)[0]!;
    expect(task['status']).toBe('done');
    const authors = (task['history'] as Array<{ actor: string }>).map((h) => h.actor);
    expect(new Set(authors).size).toBeGreaterThanOrEqual(3);
  });

  it('an agent can drive it with JSON alone', () => {
    run('init');
    run('task', 'add', 'Agent work', '--estimate', '2');

    const board = json('board');
    expect(board['schema']).toBe('kadence/v1');

    const moved = spawnSync('node', [CLI, 'task', 'move', 'KAD-1', 'in_progress', '--json'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, KADENCE_SOURCE: 'agent' },
    });
    expect(JSON.parse(moved.stdout)['ok']).toBe(true);

    const raw = execFileSync('sh', ['-c', 'cat .kadence/events/*/*.json'], { cwd: dir, encoding: 'utf8' });
    expect(raw).toContain('"source":"agent"');
  });

  it('fails helpfully outside a repository and before init', () => {
    const outside = mkdtempSync(join(tmpdir(), 'kadence-bare-'));
    const r = spawnSync('node', [CLI, 'task', 'list'], { cwd: outside, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/git repository/i);
    rmSync(outside, { recursive: true, force: true });

    const before = run('task', 'list');
    expect(before.code).toBe(1);
    expect(before.err).toMatch(/kadence init/);
  });

  it('keeps working after the events folder vanishes on a branch switch', () => {
    run('init');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });

    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir });
    run('task', 'add', 'On a branch');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'work'], { cwd: dir });
    execFileSync('git', ['checkout', '-q', 'main'], { cwd: dir });

    // git does not version empty directories, so .kadence/events/ is gone here.
    const r = run('task', 'add', 'Back on main');
    expect(r.code).toBe(0);
  });
});

describe('a reviewer asks what a branch is about', () => {
  it('answers through the real binary, and refuses honestly when it cannot', () => {
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
    };

    expect(run('init').code).toBe(0);
    run('task', 'add', 'Work that predates the branch');
    run('task', 'add', 'Other work on main');
    git('add', '-A');
    git('commit', '-qm', 'main work');

    git('checkout', '-q', '-b', 'feature/login');
    run('task', 'add', 'Login form');
    run('task', 'move', 'KAD-1', 'in_progress');
    git('add', '-A');
    git('commit', '-qm', 'branch work');

    const all = json('task', 'list');
    expect((all['tasks'] as unknown[]).length).toBe(3);
    expect(all['branch']).toBeUndefined();

    const scoped = json('task', 'list', '--branch');
    expect(scoped['branch']).toEqual({ name: 'feature/login', base: 'main' });
    const titles = (scoped['tasks'] as Array<{ title: string }>).map((t) => t.title).sort();
    // Created on the branch, and touched on the branch. Not the untouched one.
    expect(titles).toEqual(['Login form', 'Work that predates the branch']);

    // A base that does not exist fails by name rather than reporting no work.
    const bad = run('task', 'list', '--branch', '--base', 'no-such-branch', '--json');
    expect(bad.code).toBe(2);
    expect((JSON.parse(bad.out) as { error: { received: string } }).error.received).toBe(
      'no-such-branch',
    );

    // Detached HEAD is the one state where the question has no answer. Exit 1,
    // not 2: the argument was fine, the repository state is what refuses.
    git('checkout', '-q', '--detach');
    const detached = run('task', 'list', '--branch');
    expect(detached.code).toBe(1);
    expect(detached.err).toMatch(/detached/i);
  });
});

describe('a milestone named like a number', () => {
  it('keeps its name through the option parser', () => {
    // cac converts a flag value that looks numeric, so `--milestone 1.0`
    // arrives as the number 1 and the digits after the dot are gone before any
    // command sees them. Unit tests pass strings directly and cannot catch
    // this; only the real binary can.
    expect(run('init').code).toBe(0);
    run('milestone', 'create', '1.0', '--due', '2026-12-01');
    run('task', 'add', 'Login form', '--estimate', '3');

    const added = run('milestone', 'add', 'KAD-1', '--milestone', '1.0', '--json');
    expect(added.code).toBe(0);
    expect(
      (JSON.parse(added.out) as { milestone: { name: string } }).milestone.name,
    ).toBe('1.0');

    // The `--flag=value` form goes through a different branch of the parser.
    run('task', 'add', 'Signup form', '--estimate', '5');
    expect(run('milestone', 'add', 'KAD-2', '--milestone=1.0').code).toBe(0);

    const list = JSON.parse(run('milestone', 'list', '--json').out) as {
      milestones: Array<{ name: string; totalTasks: number; due: string | null }>;
    };
    expect(list.milestones[0]!.name).toBe('1.0');
    expect(list.milestones[0]!.due).toBe('2026-12-01');
    expect(list.milestones[0]!.totalTasks).toBe(2);
  });
});

