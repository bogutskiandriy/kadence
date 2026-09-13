import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskClaim, runTaskMove, runTaskBlock } from '../src/cli/commands/task.js';
import { runNoteAdd } from '../src/cli/commands/note.js';
import { runDecisionAdd } from '../src/cli/commands/decision.js';
import {
  runSprintCreate,
  runSprintStart,
  runSprintAdd,
  runSprintEdit,
} from '../src/cli/commands/sprint.js';
import { runPrime } from '../src/cli/commands/prime.js';

/**
 * `prime` is the one command written to a budget rather than a feature list.
 *
 * It goes into an agent's context at the top of every session, where length is
 * paid for on every turn that follows. The discipline that keeps the `init`
 * section short applies here, and the test is the only thing that enforces it:
 * a summary grows by one useful line at a time until it is a wall.
 */

const LINE_BUDGET = 40;
const BYTE_BUDGET = 3072;

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-prime-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A repository with something of everything — the worst case for length. */
function busyRepo(): void {
  runSprintCreate(dir, env, 'Sprint 1');
  runSprintEdit(dir, env, 'Sprint 1', { startDate: '2026-09-01', endDate: '2026-09-14' });
  runSprintStart(dir, env, 'Sprint 1');
  for (let i = 1; i <= 30; i++) runTaskAdd(dir, env, `Task number ${i} with a fairly long title`, {});
  for (let i = 1; i <= 10; i++) runSprintAdd(dir, env, `KAD-${i}`, {});
  runTaskClaim(dir, env, 'KAD-1', {});
  runTaskMove(dir, env, 'KAD-2', 'in_progress');
  runTaskBlock(dir, env, 'KAD-3', 'KAD-4', false);
  for (let i = 1; i <= 12; i++) {
    runDecisionAdd(dir, env, `Decision number ${i} with a long title`, { why: 'Because' });
    runNoteAdd(dir, env, `Note number ${i}, also with a reasonably long body`, {});
  }
}

describe('runPrime', () => {
  it('fits the budget on an empty repository', () => {
    const r = runPrime(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.message.split('\n')).toHaveLength(r.message.split('\n').length);
    expect(r.message.split('\n').length).toBeLessThanOrEqual(LINE_BUDGET);
  });

  it(
    `stays under ${LINE_BUDGET} lines and ${BYTE_BUDGET} bytes on a busy repository`,
    () => {
      busyRepo();
      const r = runPrime(dir, env, {});
      const lines = r.message.split('\n');
      expect(lines.length).toBeLessThanOrEqual(LINE_BUDGET);
      expect(Buffer.byteLength(r.message, 'utf8')).toBeLessThanOrEqual(BYTE_BUDGET);
    },
    30_000,
  );

  it('names the active sprint and how many days are left in it', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintEdit(dir, env, 'Sprint 1', { startDate: '2026-09-01', endDate: '2026-09-14' });
    runSprintStart(dir, env, 'Sprint 1');
    const r = runPrime(dir, env, {});
    expect(r.message).toMatch(/Sprint 1/);
    expect(r.message).toMatch(/day/i);
  });

  it('leads with the work that is already mine', () => {
    runTaskAdd(dir, env, 'Mine to finish', {});
    runTaskAdd(dir, env, 'Someone else can start this', {});
    runTaskClaim(dir, env, 'KAD-1', {});
    const r = runPrime(dir, env, {});
    expect(r.message).toMatch(/Mine to finish/);
  });

  it('counts what is ready rather than listing the whole board', () => {
    for (let i = 1; i <= 20; i++) runTaskAdd(dir, env, `Task ${i}`, {});
    const r = runPrime(dir, env, {});
    expect(r.message).toMatch(/20/);
    expect(r.message).not.toMatch(/Task 15/);
  });

  it('gives decisions as titles only, because the reasons are a command away', () => {
    runDecisionAdd(dir, env, 'Use ULIDs everywhere', {
      why: 'A very long reason that has no business being in a session preamble at all',
    });
    const r = runPrime(dir, env, {});
    expect(r.message).toMatch(/Use ULIDs everywhere/);
    expect(r.message).not.toMatch(/no business being/);
  });

  it('shows the last five notes and no more', () => {
    for (let i = 1; i <= 8; i++) runNoteAdd(dir, env, `Note ${i}`, {});
    const r = runPrime(dir, env, {});
    expect(r.message).toMatch(/Note 8/);
    expect(r.message).not.toMatch(/Note 3\b/);
  });

  it('ends with the commands that go deeper', () => {
    const r = runPrime(dir, env, {});
    expect(r.message).toMatch(/kadence ready/);
    expect(r.message).toMatch(/kadence task show/);
  });

  it('returns the same structure as JSON', () => {
    busyRepo();
    const r = runPrime(dir, env, { json: true });
    const data = r.data!;
    expect(data['schema']).toBe('kadence/v1');
    expect(Object.keys(data).sort()).toEqual(
      ['schema', 'ok', 'sprint', 'mine', 'mineTotal', 'ready', 'attention', 'attentionTotal', 'decisions', 'notes', 'commands'].sort(),
    );
    expect((data['decisions'] as unknown[]).length).toBeLessThanOrEqual(5);
    expect((data['notes'] as unknown[]).length).toBeLessThanOrEqual(5);
  });

  it('outside a repository it names the code and the command that fixes it', () => {
    const bare = mkdtempSync(join(tmpdir(), 'kadence-bare-'));
    try {
      const r = runPrime(bare, env, {});
      expect(r.ok).toBe(false);
      expect(r.error!.code).toBe('not_a_repository');
      expect(r.error!.hint).toBeDefined();
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it('inside a git repository without kadence it points at init', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'kadence-noinit-'));
    execFileSync('git', ['init', '-q'], { cwd: fresh });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: fresh });
    try {
      const r = runPrime(fresh, env, {});
      expect(r.ok).toBe(false);
      expect(r.error!.code).toBe('not_initialised');
      expect(r.error!.hint).toBe('kadence init');
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

/**
 * The preamble is the only place kadence pushes anything: the `SessionStart`
 * hook runs it whether or not anyone asked. That is what makes it the right
 * home for a signal — and exactly why it has to stay silent when there is
 * nothing to say. A line that is always there is furniture by the third
 * session, and furniture is what the tech lead warned about.
 */
describe('runPrime and attention', () => {
  /** Thirty days on, so anything the fixture started has had time to go quiet. */
  const inAMonth = (): Date => new Date(Date.now() + 30 * 86_400_000);

  /**
   * Five tasks in flight and nobody on them.
   *
   * Deliberately not `busyRepo()`: everything below needs work past the started
   * boundary and nothing else, and the full fixture costs two seconds a test
   * against a five-second default. Only the budget case earns that price.
   */
  function inFlightRepo(): void {
    for (let i = 1; i <= 5; i++) runTaskAdd(dir, env, `Task number ${i}`, {});
    for (let i = 1; i <= 5; i++) runTaskMove(dir, env, `KAD-${i}`, 'in_progress');
  }

  it('says nothing at all when nothing needs attention', () => {
    inFlightRepo();
    const r = runPrime(dir, env, {});

    expect(r.message).not.toMatch(/attention/i);
    expect(r.message).not.toMatch(/nobody is moving/i);
    expect(r.data!['attentionTotal']).toBe(0);
    expect(r.data!['attention']).toEqual([]);
  });

  it('names what nobody is moving, with the reason and where to look', () => {
    inFlightRepo();
    const r = runPrime(dir, env, {}, inAMonth());

    expect(r.message).toMatch(/Nobody is moving/);
    expect(r.message).toMatch(/KAD-1/);
    expect(r.message).toMatch(/unowned/);
    expect(r.message).toMatch(/kadence report attention/);
  });

  it('names at most three and says how many there are in total', () => {
    inFlightRepo();
    const r = runPrime(dir, env, { json: true }, inAMonth());

    expect(r.data!['attentionTotal']).toBe(5);
    expect((r.data!['attention'] as unknown[]).length).toBe(3);
    expect(runPrime(dir, env, {}, inAMonth()).message).toMatch(/Nobody is moving \(3 of 5\)/);
  });

  it('carries the full reason in --json, where there is no line to fit', () => {
    inFlightRepo();
    const rows = runPrime(dir, env, { json: true }, inAMonth()).data!['attention'] as {
      label: string;
      signals: { kind: string }[];
    }[];

    expect(rows.map((x) => x.label)).toContain('KAD-1');
    expect(rows.flatMap((x) => x.signals.map((s) => s.kind))).toContain('unowned');
  });

  // The worst case, and the only one here that pays for the full fixture. The
  // explicit timeout is the same reasoning as the cap in `vitest.config.ts`:
  // this spends seconds building a repository, and a busy machine turning that
  // into "Test timed out" reports a product failure that is not one.
  it(
    `stays inside ${LINE_BUDGET} lines and ${BYTE_BUDGET} bytes with the signal showing`,
    () => {
      busyRepo();
      for (let i = 20; i <= 26; i++) runTaskMove(dir, env, `KAD-${i}`, 'in_progress');
      const r = runPrime(dir, env, {}, inAMonth());

      expect(r.message.split('\n').length).toBeLessThanOrEqual(LINE_BUDGET);
      expect(Buffer.byteLength(r.message, 'utf8')).toBeLessThanOrEqual(BYTE_BUDGET);
    },
    30_000,
  );
});
