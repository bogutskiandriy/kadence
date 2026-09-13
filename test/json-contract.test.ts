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
  dir = mkdtempSync(join(tmpdir(), 'kadence-json-'));
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
    expect(JSON.parse(r.stdout).schema).toBe('kadence/v1');
  });

  it('an error comes back as JSON too, not as text', () => {
    // An agent handed text instead of JSON cannot tell a failure from an empty
    // response.
    const r = run(['task', 'move', 'KAD-99', 'done', '--json']);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schema).toBe('kadence/v1');
    expect(parsed.ok).toBe(false);
    expect(parsed.error.message).toMatch(/KAD-99/);
  });

  it('warnings go to stderr and never corrupt the JSON on stdout', () => {
    run(['task', 'add', 'Task']);
    // Corrupt one event so a warning appears.
    const events = execFileSync('find', ['.kadence/events', '-name', '*.json'], {
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
    expect(run(['task', 'move', 'KAD-99', 'done', '--json']).code).toBe(1);
  });

  it('exit code 2 on bad arguments', () => {
    expect(run(['task', 'move', 'KAD-1', 'flying', '--json']).code).toBe(2);
  });

  it('the task list has a stable record shape', () => {
    run(['task', 'add', 'Task', '--estimate', '5']);
    const task = JSON.parse(run(['task', 'list', '--json']).stdout).tasks[0];
    // Fields are only added — existing consumers keep working. The list is
    // exact on purpose: adding one has to be a deliberate act that shows up
    // here, not something that leaks out of an unrelated change.
    expect(Object.keys(task).sort()).toEqual(
      [
        'assignee', 'blockedBy', 'claimedBy', 'comments', 'contestedBy', 'criteria',
        'description', 'docs', 'due', 'estimate', 'history', 'id', 'label', 'labels',
        'loggedHours', 'milestone', 'openCriteria', 'parent', 'priority', 'reporter',
        'sprint', 'status', 'title', 'type',
      ].sort(),
    );
  });

  it('KADENCE_SOURCE=agent marks event authorship', () => {
    run(['task', 'add', 'From agent'], { KADENCE_SOURCE: 'agent' });
    const raw = execFileSync('sh', ['-c', 'cat .kadence/events/*/*.json'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(raw).toContain('"source":"agent"');
  });

  it('without KADENCE_SOURCE an event counts as human — we never guess', () => {
    run(['task', 'add', 'From human']);
    const raw = execFileSync('sh', ['-c', 'cat .kadence/events/*/*.json'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(raw).toContain('"source":"human"');
  });

  it('in human mode stdout contains no JSON', () => {
    run(['task', 'add', 'Task']);
    const r = run(['task', 'list']);
    expect(r.stdout).toContain('KAD-1');
    expect(r.stdout).not.toContain('"schema"');
  });

  it('NO_COLOR strips escape sequences', () => {
    run(['task', 'add', 'Task']);
    const r = run(['task', 'list'], { NO_COLOR: '1' });
    expect(r.stdout).not.toContain('[');
  });
});

describe('errors an agent can act on', () => {
  // An agent handed only a prose message can tell that something failed and
  // nothing else — in the worst case it retries the same broken input until it
  // runs out of budget. See docs/research/agent-readability-2026-09.md §4.

  it('names a machine-readable code, not just a sentence', () => {
    const r = run(['task', 'move', 'KAD-99', 'done', '--json']);
    expect(JSON.parse(r.stdout).error.code).toBe('task_not_found');
  });

  it('echoes what it received, so the agent knows which input was wrong', () => {
    const r = run(['task', 'move', 'KAD-99', 'done', '--json']);
    expect(JSON.parse(r.stdout).error.received).toBe('KAD-99');
  });

  it('lists the allowed statuses — they are project-configurable, so guessing fails', () => {
    run(['task', 'add', 'Task']);
    const r = run(['task', 'move', 'KAD-1', 'shipped', '--json']);
    const err = JSON.parse(r.stdout).error;

    expect(err.code).toBe('unknown_status');
    expect(err.received).toBe('shipped');
    expect(err.allowed).toContain('done');
    expect(err.hint).toMatch(/board config|statuses/i);
  });

  it('reports the configured statuses, not the defaults', () => {
    // The whole reason `allowed` is worth carrying: a team's columns are its
    // own, so an agent cannot learn the valid set from documentation. `done`
    // always survives — velocity is computed from it.
    run(['board', 'config', '--statuses', 'todo,doing,done']);
    run(['task', 'add', 'Task']);
    const r = run(['task', 'move', 'KAD-1', 'in_progress', '--json']);
    const err = JSON.parse(r.stdout).error;

    expect(err.code).toBe('unknown_status');
    expect(err.allowed).toEqual(['todo', 'doing', 'done']);
    expect(err.allowed).not.toContain('in_progress');
  });

  it('lists the allowed types', () => {
    const r = run(['task', 'add', 'Task', '--type', 'chore', '--json']);
    const err = JSON.parse(r.stdout).error;
    expect(err.code).toBe('unknown_type');
    expect(err.allowed).toContain('bug');
  });

  it('lists the allowed priorities', () => {
    const r = run(['task', 'add', 'Task', '--priority', 'critical', '--json']);
    const err = JSON.parse(r.stdout).error;
    expect(err.code).toBe('unknown_priority');
    expect(err.received).toBe('critical');
    expect(err.allowed).toContain('urgent');
  });

  it('says the repository was never initialised, distinctly from any other failure', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'kadence-bare-'));
    execFileSync('git', ['init', '-q'], { cwd: fresh });
    const r = spawnSync('node', [CLI, 'task', 'list', '--json'], {
      cwd: fresh,
      encoding: 'utf8',
    });
    expect(JSON.parse(r.stdout).error.code).toBe('not_initialised');
    rmSync(fresh, { recursive: true, force: true });
  });

  it('keeps the human message alongside the code — nothing existing breaks', () => {
    const r = run(['task', 'move', 'KAD-99', 'done', '--json']);
    expect(JSON.parse(r.stdout).error.message).toMatch(/KAD-99/);
  });

  it('carries no retry flag: every failure here is deterministic', () => {
    // There is no network and no lock. Retrying the same command with the same
    // input always fails the same way, so a `retryable` field would be a
    // constant `false` dressed up as information (ADR-009).
    const r = run(['task', 'move', 'KAD-99', 'done', '--json']);
    expect(JSON.parse(r.stdout).error.retryable).toBeUndefined();
  });
});

describe('large responses survive the pipe', () => {
  // Found by Probe C, not by the suite: every --json response over 128 KiB was
  // truncated mid-string when stdout was a pipe — which is exactly how an agent
  // reads it. process.exit() does not wait for an asynchronous write to drain,
  // and a pipe write is asynchronous while a file write is not. The suite missed
  // it because every fixture until now was small.
  // Eight fat tasks rather than twenty-five thin ones: the response has to clear
  // the pipe buffer, and every task costs a process spawn. The first version of
  // this test spawned 25 and timed out on a loaded machine.
  const TASKS = 8;
  const FILLER = 'x'.repeat(20_000);

  function buildFatBoard(): void {
    for (let i = 0; i < TASKS; i++) {
      run(['task', 'add', `Task ${i}`, '-d', FILLER]);
    }
  }

  it(
    'a board bigger than the pipe buffer still parses',
    () => {
      buildFatBoard();

      const r = run(['board', '--json']);
      expect(r.stdout.length).toBeGreaterThan(131072);
      expect(() => JSON.parse(r.stdout)).not.toThrow();
    },
    30_000,
  );

  it(
    'and reports every task it was given',
    () => {
      buildFatBoard();

      const board = JSON.parse(run(['board', '--json']).stdout);
      const count = Object.values(board.columns as Record<string, unknown[]>).reduce(
        (n, column) => n + column.length,
        0,
      );
      expect(count).toBe(TASKS);
    },
    30_000,
  );
});
