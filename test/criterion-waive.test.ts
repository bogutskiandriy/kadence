import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runBoardConfig } from '../src/cli/commands/board.js';
import {
  runTaskAdd,
  runTaskMove,
  runTaskClaim,
  runTaskShow,
  runTaskCriterionCheck,
  runTaskCriterionList,
  runTaskCriterionWaive,
  loadState,
} from '../src/cli/commands/task.js';
import { project } from '../src/core/projection.js';
import { createUlid } from '../src/core/ulid.js';
import type { FlowEvent, EventType } from '../src/core/event.js';

/**
 * "Does not apply", with the reason (2026-10-12, the definition-of-done
 * discussion).
 *
 * A board-wide definition of done is engineering-shaped: "npm test green" was
 * copied onto interview tasks and onto the site's landing task, and 10 of 67
 * done tasks in this journal closed with criteria that never applied. A
 * checklist full of lines that do not apply is a checklist nobody reads. The
 * journal is append-only, so a criterion is not removed: it is waived, with a
 * reason, and the record keeps that it was waived on purpose rather than
 * forgotten.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const criteria = () => loadState(dir).state.tasks[0]!.criteria;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-waive-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
  runBoardConfig(dir, env, undefined, 'npm test green,typecheck clean');
  runTaskAdd(dir, env, 'Five interviews', {});
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('task ac waive', () => {
  it('marks a criterion as not applying, with the reason and who said so', () => {
    const r = runTaskCriterionWaive(dir, env, 'KAD-1', '1', 'an interview has no tests');
    expect(r.ok, r.message).toBe(true);
    expect(criteria()[0]).toMatchObject({ checked: false, waived: { why: 'an interview has no tests', by: 'tester@example.com' } });
    expect(r.message).toContain('does not apply');
  });

  it('needs a reason: a waiver without one is a criterion forgotten on purpose', () => {
    const r = runTaskCriterionWaive(dir, env, 'KAD-1', '1', '  ');
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
  });

  it('shows a waived criterion as [-] with its reason, in list and in show', () => {
    runTaskCriterionWaive(dir, env, 'KAD-1', '1', 'an interview has no tests');
    expect(runTaskCriterionList(dir, env, 'KAD-1').message).toContain('1. [-] npm test green — does not apply: an interview has no tests');
    expect(runTaskShow(dir, env, 'KAD-1').message).toContain('[-] npm test green');
    const listed = runTaskCriterionList(dir, env, 'KAD-1').data!['criteria'] as Array<Record<string, unknown>>;
    expect(listed[0]!['waived']).toEqual({ why: 'an interview has no tests', by: 'tester@example.com' });
    expect(listed[1]!['waived']).toBeNull();
  });

  it('counts a waived criterion as settled: done moves without a warning when the rest are checked', () => {
    runTaskCriterionWaive(dir, env, 'KAD-1', '1', 'an interview has no tests');
    runTaskCriterionWaive(dir, env, 'KAD-1', '2', 'no code');
    const r = runTaskMove(dir, env, 'KAD-1', 'done');
    expect(r.warnings ?? []).toEqual([]);
  });

  it('still warns about a criterion that is neither checked nor waived', () => {
    runTaskCriterionWaive(dir, env, 'KAD-1', '1', 'an interview has no tests');
    const r = runTaskMove(dir, env, 'KAD-1', 'done');
    expect((r.warnings ?? []).join('\n')).toContain('1 of 2 acceptance criteria unchecked');
  });

  it('leaves waived criteria out of what a claim says is still open', () => {
    runTaskCriterionWaive(dir, env, 'KAD-1', '1', 'an interview has no tests');
    const r = runTaskClaim(dir, env, 'KAD-1');
    expect(r.message).toContain('Done when (1 of 2 open):');
    expect(r.message).not.toContain('npm test green');
  });

  it('is undone by checking or unchecking: the last word holds', () => {
    runTaskCriterionWaive(dir, env, 'KAD-1', '1', 'an interview has no tests');
    runTaskCriterionCheck(dir, env, 'KAD-1', '1', false);
    expect(criteria()[0]).toMatchObject({ checked: true, waived: null });
    runTaskCriterionWaive(dir, env, 'KAD-1', '1', 'changed my mind');
    runTaskCriterionCheck(dir, env, 'KAD-1', '1', true);
    expect(criteria()[0]).toMatchObject({ checked: false, waived: null });
  });
});

describe('waivers fold the same in any order (I1)', () => {
  const next = createUlid();
  const TASK = next();
  const ev = (type: EventType, data: Record<string, unknown> = {}): FlowEvent => ({
    id: next(), type, entity: TASK, actor: 'a@example.com', ts: '2026-10-12T10:00:00.000Z', source: 'human', data,
  });

  it('reads the same journal into the same state whichever file arrives first', () => {
    const created = { ...ev('task.created', { title: 'Interview' }), id: TASK };
    const added = ev('task.criterion_added', { text: 'npm test green' });
    const waived = ev('task.criterion_waived', { criterion: added.id, why: 'no code' });
    const events = [created, added, waived];
    const forward = project(events).tasks[0]!.criteria;
    const backward = project([...events].reverse()).tasks[0]!.criteria;
    expect(backward).toEqual(forward);
    expect(forward[0]!.waived).toEqual({ why: 'no code', by: 'a@example.com' });
  });
});
