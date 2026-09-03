import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli.js');
let dir: string;

interface Run {
  stdout: string;
  stderr: string;
  code: number;
}

function run(args: string[], env: Record<string, string> = {}): Run {
  const r = spawnSync('node', [CLI, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flowit-json-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run(['init']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the --json contract', () => {
  it('stdout holds only JSON that parses cleanly', () => {
    run(['task', 'add', 'Task', '--estimate', '3']);
    const r = run(['task', 'list', '--json']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  it('every response carries a schema version', () => {
    const r = run(['task', 'add', 'Task', '--json']);
    expect(JSON.parse(r.stdout).schema).toBe('flowit/v1');
  });

  it('an error comes back as JSON too, not as text', () => {
    // An agent handed text instead of JSON cannot tell a failure from an empty
    // response.
    const r = run(['task', 'move', 'FLOW-99', 'done', '--json']);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schema).toBe('flowit/v1');
    expect(parsed.ok).toBe(false);
    expect(parsed.error.message).toMatch(/FLOW-99/);
  });

  it('warnings go to stderr and never corrupt the JSON on stdout', () => {
    run(['task', 'add', 'Task']);
    // Corrupt one event so a warning appears.
    const events = execFileSync('find', ['.flowit/events', '-name', '*.json'], {
      cwd: dir,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    execFileSync('sh', ['-c', `echo 'broken' > "${events[0]}"`], { cwd: dir });

    const r = run(['task', 'list', '--json']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    expect(r.stderr).toMatch(/damaged|corrupted/i);
  });

  it('exit code 0 on success', () => {
    expect(run(['task', 'add', 'Task', '--json']).code).toBe(0);
  });

  it('exit code 1 on a runtime error', () => {
    expect(run(['task', 'move', 'FLOW-99', 'done', '--json']).code).toBe(1);
  });

  it('exit code 2 on bad arguments', () => {
    expect(run(['task', 'move', 'FLOW-1', 'flying', '--json']).code).toBe(2);
  });

  it('the task list has a stable record shape', () => {
    run(['task', 'add', 'Task', '--estimate', '5']);
    const task = JSON.parse(run(['task', 'list', '--json']).stdout).tasks[0];
    // Fields are only added — existing consumers keep working.
    expect(Object.keys(task).sort()).toEqual(
      [
        'assignee', 'blockedBy', 'comments', 'description', 'due', 'estimate', 'history',
        'id', 'label', 'labels', 'loggedHours', 'parent', 'priority', 'reporter', 'sprint',
        'status', 'title', 'type',
      ].sort(),
    );
  });

  it('FLOWIT_SOURCE=agent marks event authorship', () => {
    run(['task', 'add', 'From agent'], { FLOWIT_SOURCE: 'agent' });
    const raw = execFileSync('sh', ['-c', 'cat .flowit/events/*/*.json'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(raw).toContain('"source":"agent"');
  });

  it('without FLOWIT_SOURCE an event counts as human — we never guess', () => {
    run(['task', 'add', 'From human']);
    const raw = execFileSync('sh', ['-c', 'cat .flowit/events/*/*.json'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(raw).toContain('"source":"human"');
  });

  it('in human mode stdout contains no JSON', () => {
    run(['task', 'add', 'Task']);
    const r = run(['task', 'list']);
    expect(r.stdout).toContain('FLOW-1');
    expect(r.stdout).not.toContain('"schema"');
  });

  it('NO_COLOR strips escape sequences', () => {
    run(['task', 'add', 'Task']);
    const r = run(['task', 'list'], { NO_COLOR: '1' });
    expect(r.stdout).not.toContain('[');
  });
});
