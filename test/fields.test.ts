import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli.js');
let dir: string;

function run(args: string[]): { stdout: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  return { stdout: r.stdout, code: r.status ?? -1 };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-fields-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run(['init']);
  for (let i = 0; i < 5; i++) {
    run(['task', 'add', `Task ${i}`, '-d', 'A description long enough to matter', '--estimate', '3']);
  }
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('--fields', () => {
  // At 1000 tasks `board --json` returned 803 KB — more than the journal it was
  // folded from, because every task is emitted in full. Context windows are
  // finite; an agent that wants a column layout does not want every description.
  // See docs/research/probe-c-agent-cost.md §4.

  it('returns only the fields asked for', () => {
    const board = JSON.parse(run(['board', '--json', '--fields', 'label,status']).stdout);
    const tasks = Object.values(board.columns as Record<string, unknown[]>).flat();

    expect(tasks.length).toBe(5);
    for (const task of tasks) {
      expect(Object.keys(task as object).sort()).toEqual(['label', 'status']);
    }
  });

  it('makes the response dramatically smaller', () => {
    const full = run(['board', '--json']).stdout.length;
    const slim = run(['board', '--json', '--fields', 'label,status']).stdout.length;
    expect(slim * 4).toBeLessThan(full);
  });

  it('works the same way on task list', () => {
    const listed = JSON.parse(run(['task', 'list', '--json', '--fields', 'id,title']).stdout);
    for (const task of listed.tasks as object[]) {
      expect(Object.keys(task).sort()).toEqual(['id', 'title']);
    }
  });

  it('names the fields that exist when given one that does not', () => {
    const r = run(['board', '--json', '--fields', 'label,colour']);
    const err = JSON.parse(r.stdout).error;

    expect(err.code).toBe('unknown_field');
    expect(err.received).toBe('colour');
    expect(err.allowed).toContain('title');
    expect(r.code).toBe(2);
  });

  it('tolerates spaces around the commas', () => {
    const board = JSON.parse(run(['board', '--json', '--fields', 'label, status']).stdout);
    const tasks = Object.values(board.columns as Record<string, unknown[]>).flat();
    expect(Object.keys(tasks[0] as object).sort()).toEqual(['label', 'status']);
  });

  it('leaves the human board alone — it is not a JSON concern', () => {
    const r = run(['board', '--fields', 'label']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('KAD-1');
  });

  it('is published in the contract, or an agent will never know it exists', () => {
    const contract = JSON.parse(run(['schema', '--json']).stdout).contract;
    const board = (contract.commands as { name: string; flags?: string[] }[]).find(
      (c) => c.name === 'board',
    );
    expect(board?.flags).toContain('--fields');
    expect(contract.shapes.task.selectable).toContain('label');
  });
});
