import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Failures that never reach a command handler (KAD-42, stress audit B5).
 *
 * Every handler answers `--json` with one `kadence/v1` object — 62 of 62 in the
 * audit. What broke was the plumbing in front of them: an unknown command
 * exited 0 with nothing on either stream, an unknown flag answered in prose on
 * stderr, `--json --json` switched JSON off, and a repeated `--title` wrote an
 * array into the journal for good. An agent cannot branch on silence.
 *
 * Through the built binary, because the defect is in the argv plumbing and a
 * direct call to a `run*` function cannot see it.
 */

const CLI = resolve('dist/cli.js');
let dir: string;

function run(args: string[]): { stdout: string; stderr: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

function json(args: string[]): { body: Record<string, unknown>; code: number } {
  const r = run(args);
  return { body: JSON.parse(r.stdout) as Record<string, unknown>, code: r.code };
}

function events(): Array<{ type: string; data: Record<string, unknown> }> {
  const root = join(dir, '.kadence', 'events');
  return readdirSync(root).flatMap((month) =>
    readdirSync(join(root, month)).map((f) => JSON.parse(readFileSync(join(root, month, f), 'utf8'))),
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-cli-errors-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run(['init']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('an unknown command', () => {
  it('fails with a JSON error naming what was received and what exists', () => {
    const { body, code } = json(['frobnicate', '--json']);
    expect(code).toBe(2);
    const error = body['error'] as { code: string; received: string; allowed: string[] };
    expect(body['ok']).toBe(false);
    expect(error.code).toBe('invalid_argument');
    expect(error.received).toBe('frobnicate');
    expect(error.allowed).toContain('task');
  });

  it('fails loudly without --json too, rather than exiting 0 in silence', () => {
    const r = run(['tasks', 'list']);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/tasks/);
    expect(r.stderr).toMatch(/kadence --help/);
  });

  it('leaves --help and a bare `kadence` as help, exiting 0', () => {
    expect(run(['--help']).code).toBe(0);
    const bare = run([]);
    expect(bare.code).toBe(0);
    expect(bare.stdout).toMatch(/Usage/);
  });
});

describe('an argument the parser refuses', () => {
  it('answers an unknown flag with a JSON error when --json was asked for', () => {
    const { body, code } = json(['task', 'add', 'T', '--priorty', 'high', '--json']);
    expect(code).toBe(2);
    const error = body['error'] as { code: string; received: string; message: string };
    expect(error.code).toBe('invalid_argument');
    expect(error.received).toBe('--priorty');
    expect(error.message).toMatch(/kadence task --help/);
  });

  it('answers extra positional arguments with a JSON error', () => {
    const { body, code } = json(['note', 'add', 'x', 'y', '--json']);
    expect(code).toBe(2);
    expect((body['error'] as { code: string }).code).toBe('invalid_argument');
  });

  it('answers a negative estimate with a JSON error', () => {
    const { body, code } = json(['task', 'add', 'T', '--estimate', '-5', '--json']);
    expect(code).toBe(2);
    expect((body['error'] as { code: string }).code).toBe('invalid_argument');
    expect(events().filter((e) => e.type === 'task.created')).toHaveLength(0);
  });
});

describe('a flag given twice', () => {
  it('keeps --json on when it is repeated', () => {
    const { body, code } = json(['task', 'add', 'Once', '--json', '--json']);
    expect(code).toBe(0);
    expect(body['ok']).toBe(true);
  });

  it('writes the last --title as a string, never an array, and reports it', () => {
    run(['task', 'add', 'Original']);
    const { body, code } = json(['task', 'edit', 'KAD-1', '--title', 'a', '--title', 'b', '--json']);
    expect(code).toBe(0);
    expect(body['ok']).toBe(true);
    const shown = json(['task', 'show', 'KAD-1', '--json']).body['task'] as { title: string };
    expect(shown.title).toBe('b');
    for (const e of events()) {
      for (const value of Object.values(e.data)) {
        if (Array.isArray(value)) expect(value.every((v) => typeof v === 'string')).toBe(true);
      }
      if ('title' in e.data) expect(typeof e.data['title']).toBe('string');
    }
  });

  it('does not crash on a repeated --task or --fields', () => {
    run(['task', 'add', 'One']);
    run(['task', 'add', 'Two']);
    const note = json(['note', 'x', '--task', 'KAD-1', '--task', 'KAD-2', '--json']);
    expect(note.code).toBe(0);
    const list = json(['task', 'list', '--fields', 'label', '--fields', 'title', '--json']);
    expect(list.code).toBe(0);
  });

  it('still keeps every value of a flag meant to repeat', () => {
    run(['task', 'add', 'Labelled', '--label', 'a', '--label', 'b']);
    const shown = json(['task', 'show', 'KAD-1', '--json']).body['task'] as { labels: string[] };
    expect(shown.labels).toEqual(['a', 'b']);
  });
});
