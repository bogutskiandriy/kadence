import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ERROR_CODES } from '../src/cli/commands/task.js';

const CLI = resolve('dist/cli.js');
let dir: string;

function run(args: string[]): { stdout: string; stderr: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

// The contract is exactly what we are testing, so the test reads it untyped on
// purpose: a typed helper would assert the shape twice and prove it once.
/* eslint-disable @typescript-eslint/no-explicit-any */
function json(args: string[]): any {
  return JSON.parse(run(args).stdout);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-schema-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run(['init']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('kadence schema --json', () => {
  // `schema: "kadence/v1"` in every response was a label, not a contract: an
  // agent could not learn from it what fields exist or what may fail. This
  // command is the contract, and the tests below are what keeps it true.
  // See docs/research/agent-readability-2026-09.md §4.

  it('answers without a repository at all — the contract is not project state', () => {
    // An agent asks what the tool can do before it has anything to ask about.
    const outside = mkdtempSync(join(tmpdir(), 'kadence-nowhere-'));
    const r = spawnSync('node', [CLI, 'schema', '--json'], { cwd: outside, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).contract.version).toBe('kadence/v1');
    rmSync(outside, { recursive: true, force: true });
  });

  it('carries the schema marker like every other response', () => {
    expect(json(['schema', '--json']).schema).toBe('kadence/v1');
  });

  it('states its own stability rule, so a consumer knows what may change', () => {
    expect(String(json(['schema', '--json']).contract.stability)).toMatch(/add/i);
  });

  it('names every command an agent is expected to call', () => {
    const names = json(['schema', '--json']).contract.commands.map(
      (c: { name: string }) => c.name,
    );
    expect(names).toContain('task show');
    expect(names).toContain('task move');
    expect(names).toContain('board');
  });

  it('publishes the exit codes', () => {
    const codes = json(['schema', '--json']).contract.exitCodes;
    expect(Object.keys(codes)).toEqual(['0', '1', '2']);
  });

  it('publishes KADENCE_SOURCE, which nothing else advertises', () => {
    expect(Object.keys(json(['schema', '--json']).contract.env)).toContain('KADENCE_SOURCE');
  });
});

describe('the schema cannot drift from the code', () => {
  // The point of the exercise: a renamed field or a dropped error code fails the
  // build here rather than silently breaking every agent downstream.

  it('lists exactly the error codes the code can produce', () => {
    const published = json(['schema', '--json']).contract.errors.map(
      (e: { code: string }) => e.code,
    );
    expect([...published].sort()).toEqual([...ERROR_CODES].sort());
  });

  it('gives every error code a meaning — a bare code teaches an agent nothing', () => {
    for (const e of json(['schema', '--json']).contract.errors as {
      code: string;
      meaning: string;
    }[]) {
      expect(e.meaning.length).toBeGreaterThan(0);
    }
  });

  it('every required task field is present in a real task show', () => {
    run(['task', 'add', 'Task', '--estimate', '3']);
    const required = json(['schema', '--json']).contract.shapes.task.required;
    const task = json(['task', 'show', 'KAD-1', '--json']).task;

    for (const field of required as string[]) {
      expect(Object.keys(task)).toContain(field);
    }
  });

  it('every required board field is present in a real board', () => {
    const required = json(['schema', '--json']).contract.shapes.board.required;
    const board = json(['board', '--json']);

    for (const field of required as string[]) {
      expect(Object.keys(board)).toContain(field);
    }
  });

  it('every required error field is present in a real failure', () => {
    const required = json(['schema', '--json']).contract.shapes.error.required;
    const error = json(['task', 'move', 'KAD-99', 'done', '--json']).error;

    for (const field of required as string[]) {
      expect(Object.keys(error)).toContain(field);
    }
  });

  it('every command it names can actually be run', () => {
    // A schema that documents a command nobody implemented is worse than none:
    // the agent trusts it. Exit code 2 is "bad arguments" — which is what a
    // missing command looks like to cac.
    for (const command of json(['schema', '--json']).contract.commands as { name: string }[]) {
      const r = run([...command.name.split(' '), '--help']);
      expect(r.code, `${command.name} --help`).not.toBe(2);
    }
  });
});
