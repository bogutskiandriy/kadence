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
      ['--help'], ['--version'],
    ];

    for (const args of commands) {
      const r = run(...args);
      expect(r.code, `${args.join(' ')} exited ${r.code}: ${r.err}`).toBe(0);
    }
  });

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
