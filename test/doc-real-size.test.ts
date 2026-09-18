import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Documentation at the size people write it, through a pipe, the way an agent
 * reads it.
 *
 * `--json` over 128 KiB once came back truncated on a pipe because
 * `process.exit()` does not wait for an asynchronous write, and 418 tests with
 * small fixtures passed over it (Probe C). A document is the first thing in the
 * journal that is routinely large, so it is tested large: several of them,
 * together past that 128 KiB line.
 */

const CLI = resolve('dist/cli.js');
let dir: string;

function run(args: string[], input?: string): { stdout: string; stderr: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], {
    cwd: dir,
    encoding: 'utf8',
    input,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', KADENCE_SOURCE: 'agent' },
  });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

/** Readable text, not one repeated byte: line breaks exercise the on-disk line split. */
function prose(kib: number, seed: string): string {
  const line = `${seed}: the session cookie is re-issued on every redirect, which is why login loops.`;
  const lines: string[] = [];
  while (Buffer.byteLength(lines.join('\n'), 'utf8') < kib * 1024) lines.push(line);
  return lines.join('\n');
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-doc-size-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'agent@example.com'], { cwd: dir });
  run(['init']);
  run(['task', 'add', 'Fix login']);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('documentation at real size', () => {
  it('a 64 KiB body goes in through stdin and comes back whole through a pipe', () => {
    const body = prose(64, 'A');
    const added = run(['doc', 'add', 'Auth', '--stdin', '--task', 'KAD-1', '--json'], body);
    expect(added.code, added.stderr).toBe(0);
    // Past 16 KiB it is written, with the warning on stderr — never in the JSON.
    expect(added.stderr).toMatch(/16 KiB/);
    expect(JSON.parse(added.stdout).document.bytes).toBe(Buffer.byteLength(body, 'utf8'));

    const shown = run(['doc', 'show', 'DOC-1', '--json']);
    expect(shown.code).toBe(0);
    expect(JSON.parse(shown.stdout).document.body).toBe(body);
  });

  it('a revision history past 128 KiB still answers in full, and list stays small', () => {
    for (let i = 2; i <= 4; i++) {
      const r = run(['doc', 'edit', 'DOC-1', '--stdin', '--json'], prose(48, `rev${i}`));
      expect(r.code, r.stderr).toBe(0);
    }
    const shown = JSON.parse(run(['doc', 'show', 'DOC-1', '--json']).stdout).document;
    expect(shown.revisions).toBe(4);
    expect(shown.body).toBe(prose(48, 'rev4'));

    // The index carries no bodies, so its size does not grow with the text.
    const listed = run(['doc', 'list', '--json']);
    expect(Buffer.byteLength(listed.stdout, 'utf8')).toBeLessThan(1024);
  });

  it('task show --json through a pipe stays small however large the document', () => {
    const r = run(['task', 'show', 'KAD-1', '--json']);
    const task = JSON.parse(r.stdout).task;
    expect(task.documentation).toHaveLength(1);
    expect(task.documentation[0].label).toBe('DOC-1');
    expect(r.stdout).not.toContain('rev4:');
  });
});

describe('values that look like numbers', () => {
  // cac turns "007" into 7 before the command sees it. Text is text.
  it('keeps a body and a title exactly as typed', () => {
    const added = JSON.parse(run(['doc', 'add', '0010', '--body', '007', '--json']).stdout).document;
    const shown = JSON.parse(run(['doc', 'show', added.label, '--json']).stdout).document;
    expect(shown.title).toBe('0010');
    expect(shown.body).toBe('007');
  });

  it('a numeric --task is a reference that does not exist, answered in JSON, not a crash', () => {
    const r = run(['doc', 'add', 'X', '--body', 'x', '--task', '1', '--json']);
    expect(JSON.parse(r.stdout).error.code).toBe('task_not_found');
    const l = run(['doc', 'list', '--task', '1', '--json']);
    expect(JSON.parse(l.stdout).error.code).toBe('task_not_found');
  });
});
