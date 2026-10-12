import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Text that starts with dashes (2026-10-12 friction note on KAD-84).
 *
 * Writing about a CLI means writing about its flags: a criterion "--history
 * returns the full shape" or a note "--fields is cheaper" was refused as an
 * unknown option, and the error did not say how to get it through. A flag
 * never holds a space before its `=`, so such a token is text; and `--`
 * ends the options, as everywhere else on the command line.
 */

const CLI = resolve('dist/cli.js');
let dir: string;
const run = (...args: string[]) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
const json = (...args: string[]) => JSON.parse(run(...args, '--json').stdout);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-dash-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run('init', '--no-hooks');
  run('task', 'add', 'Board output');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('text that starts with dashes', () => {
  it('takes a criterion that opens with a flag name', () => {
    const r = run('task', 'ac', 'add', 'KAD-1', '--history returns the full shape');
    expect(r.status, r.stderr).toBe(0);
    expect(json('task', 'ac', 'list', 'KAD-1').criteria[0].text).toBe('--history returns the full shape');
  });

  it('takes a note that opens with a flag name', () => {
    const r = run('note', '--fields is cheaper than the whole board');
    expect(r.status, r.stderr).toBe(0);
    expect(json('note', 'list').notes[0].text).toBe('--fields is cheaper than the whole board');
  });

  it('takes a flag value that opens with dashes', () => {
    const r = run('decision', 'add', 'Keep the summary shape', '--why', '--summary was what agents asked for anyway');
    expect(r.status, r.stderr).toBe(0);
    expect(json('decision', 'list').decisions[0].why).toBe('--summary was what agents asked for anyway');
  });

  it('treats everything after -- as text, for a word with no space in it', () => {
    const r = run('note', '--', '--verbose');
    expect(r.status, r.stderr).toBe(0);
    expect(json('note', 'list').notes[0].text).toBe('--verbose');
  });

  it('still refuses a real unknown flag, and says how to pass it as text', () => {
    const r = run('note', '--verbose');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Unknown option `--verbose`');
    expect(r.stderr).toContain('kadence note -- "--verbose"');
  });
});

describe('an unknown task action', () => {
  // The message listed thirteen actions while `allowed` in the same response
  // listed seventeen: a person reading the text was told claim did not exist.
  it('names in its text every action it lists in allowed', () => {
    const r = run('task', 'nope', '--json');
    const allowed = JSON.parse(r.stdout).error.allowed as string[];
    expect(allowed).toEqual(expect.arrayContaining(['claim', 'release', 'ac', 'doc']));
    const text = run('task', 'nope').stderr;
    for (const action of allowed) expect(text, action).toMatch(new RegExp(`\\b${action}\\b`));
  });
});
