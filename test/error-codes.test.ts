import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ERROR_CODES } from '../src/agent/contract.js';

/**
 * ADR-009 promises that every failed `--json` call carries `error.code` from a
 * closed list. The schema tests check that the published list matches the
 * constant; nothing checked that the commands actually use it, and most did
 * not — a wrong sprint name came back as a sentence an agent could only print.
 *
 * These tests walk the failures an agent can actually provoke.
 */

const CLI = resolve('dist/cli.js');
let dir: string;

interface Run {
  stdout: string;
  stderr: string;
  code: number;
}

function run(args: string[]): Run {
  const r = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

/** Every failure an agent can hit, as the argv that produces it. */
const FAILURES: [name: string, argv: string[]][] = [
  ['unknown task action', ['task', 'frobnicate', '--json']],
  ['unknown board action', ['board', 'statuses', '--json']],
  ['unknown sprint action', ['sprint', 'frobnicate', '--json']],
  ['unknown template action', ['template', 'frobnicate', '--json']],
  ['task without a title', ['task', 'add', '--json']],
  ['unknown status', ['task', 'move', 'KAD-1', 'nonsense', '--json']],
  ['unknown type', ['task', 'add', 'T', '--type', 'nonsense', '--json']],
  ['unknown priority', ['task', 'add', 'T', '--priority', 'nonsense', '--json']],
  ['unknown field', ['board', '--json', '--fields', 'nonsense']],
  ['unknown sort key', ['task', 'list', '--sort', 'nonsense', '--json']],
  ['missing task', ['task', 'move', 'KAD-99', 'done', '--json']],
  ['missing parent task', ['task', 'add', 'T', '--parent', 'KAD-99', '--json']],
  ['unreadable duration', ['task', 'log', 'KAD-1', 'soon', '--json']],
  ['comment without text', ['task', 'comment', 'KAD-1', '', '--json']],
  ['bad due date', ['task', 'edit', 'KAD-1', '--due', 'tomorrow', '--json']],
  ['task blocking itself', ['task', 'block', 'KAD-1', 'KAD-1', '--json']],
  ['sprint without a name', ['sprint', 'create', '', '--json']],
  ['sprint that does not exist', ['sprint', 'burndown', 'Nope', '--json']],
  // `sprint status` with no sprint is a successful "there is none", not a
  // failure — an agent asking the question deserves an answer. Closing one that
  // does not exist is the real failure.
  ['closing with no sprint', ['sprint', 'close', '--json']],
  ['sprint date that is not a date', ['sprint', 'edit', '--start', 'tomorrow', '--json']],
  ['adding to a sprint that does not exist', ['sprint', 'add', 'KAD-1', '--sprint', 'Nope', '--json']],
  ['starting a sprint that does not exist', ['sprint', 'start', 'Nope', '--json']],
  ['template without a name', ['template', 'save', '', '--json']],
  ['template without fields', ['template', 'save', 'bug', '--json']],
  ['template that does not exist', ['template', 'delete', 'nope', '--json']],
  ['board columns without done', ['board', 'config', '--statuses', 'todo,doing', '--json']],
  ['board columns listed twice', ['board', 'config', '--statuses', 'todo,todo,done', '--json']],
];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-codes-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run(['init']);
  run(['task', 'add', 'A task', '--estimate', '3']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('every --json failure is machine-readable', () => {
  for (const [name, argv] of FAILURES) {
    it(`${name} carries a code from the published list`, () => {
      const r = run(argv);
      expect(r.code, `${argv.join(' ')} was expected to fail`).not.toBe(0);

      const parsed = JSON.parse(r.stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.error, 'a failure with no error object').toBeDefined();
      expect(ERROR_CODES).toContain(parsed.error.code);
      expect(typeof parsed.error.message).toBe('string');
    });
  }
});

describe('the hints name commands that exist', () => {
  // A hint is the agent's next move. One naming a command that does not exist
  // sends it into a dead end, and the dead end is itself a failure it cannot
  // parse — which is how this was found.
  for (const [name, argv] of FAILURES) {
    it(`${name} hints at something runnable`, () => {
      const parsed = JSON.parse(run(argv).stdout);
      const hint: string | undefined = parsed.error?.hint;
      if (hint === undefined) return;

      expect(hint.startsWith('kadence '), `hint "${hint}" is not a command`).toBe(true);
      const hinted = run(hint.replace(/^kadence /, '').split(' '));
      expect(hinted.code, `"${hint}" does not run: ${hinted.stdout}${hinted.stderr}`).toBe(0);
    });
  }
});
