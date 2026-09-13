import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';
import { createUlid } from '../src/core/ulid.js';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskShow, runTaskCriterionList } from '../src/cli/commands/task.js';
import { runBoardConfig } from '../src/cli/commands/board.js';

/**
 * Definition of Done — the criteria every new task starts with.
 *
 * It is configuration, so the last write wins, exactly as the column list
 * does. What it is not is retroactive: the criteria a task carries are in that
 * task's own journal, and changing the standard cannot reach back and rewrite
 * work that is already underway.
 */

const gen = createUlid();

function configured(data: Record<string, unknown>): FlowEvent {
  const id = gen();
  return {
    id,
    type: 'board.configured',
    entity: id,
    actor: 'alice@example.com',
    ts: '2026-09-09T10:00:00.000Z',
    source: 'human',
    data,
  };
}

describe('dod fold', () => {
  it('is empty until a team sets one', () => {
    expect(project([]).dod).toEqual([]);
  });

  it('takes the last configuration, like the column list', () => {
    const state = project([
      configured({ dod: ['tests green'] }),
      configured({ dod: ['tests green', 'docs updated'] }),
    ]);
    expect(state.dod).toEqual(['tests green', 'docs updated']);
  });

  it('survives a configuration event that only changes the columns', () => {
    const state = project([
      configured({ dod: ['tests green'] }),
      configured({ statuses: ['todo', 'done'] }),
    ]);
    expect(state.dod).toEqual(['tests green']);
    expect(state.statuses).toEqual(['todo', 'done']);
  });

  it('an explicit empty list clears it', () => {
    const state = project([configured({ dod: ['tests green'] }), configured({ dod: [] })]);
    expect(state.dod).toEqual([]);
  });
});

describe('dod commands', () => {
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-dod-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
    runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('sets a definition of done and reports it back', () => {
    const r = runBoardConfig(dir, env, undefined, 'tests green, docs updated');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/tests green/);
    expect(runBoardConfig(dir, env, undefined, undefined).message).toMatch(/docs updated/);
  });

  it('gives every new task the criteria', () => {
    runBoardConfig(dir, env, undefined, 'tests green, docs updated');
    runTaskAdd(dir, env, 'Ship it', {});
    const r = runTaskCriterionList(dir, env, 'KAD-1');
    expect(r.message).toMatch(/tests green/);
    expect(r.message).toMatch(/docs updated/);
    expect((r.data!['criteria'] as unknown[]).length).toBe(2);
  });

  it('skips them when asked', () => {
    runBoardConfig(dir, env, undefined, 'tests green', undefined);
    runTaskAdd(dir, env, 'A spike, not a delivery', { noDod: true });
    expect((runTaskShow(dir, env, 'KAD-1').data!['task'] as { criteria: unknown[] }).criteria).toEqual(
      [],
    );
  });

  it('does not reach back into tasks that already exist', () => {
    runTaskAdd(dir, env, 'Started before the standard', {});
    runBoardConfig(dir, env, undefined, 'tests green', undefined);
    runTaskAdd(dir, env, 'Started after it', {});

    const before = runTaskShow(dir, env, 'KAD-1').data!['task'] as { criteria: unknown[] };
    const after = runTaskShow(dir, env, 'KAD-2').data!['task'] as { criteria: unknown[] };
    expect(before.criteria).toEqual([]);
    expect(after.criteria).toHaveLength(1);
  });

  it('changing the standard leaves earlier tasks with what they had', () => {
    runBoardConfig(dir, env, undefined, 'tests green', undefined);
    runTaskAdd(dir, env, 'First', {});
    runBoardConfig(dir, env, undefined, 'docs updated, reviewed');
    const first = runTaskShow(dir, env, 'KAD-1').data!['task'] as {
      criteria: Array<{ text: string }>;
    };
    expect(first.criteria.map((c) => c.text)).toEqual(['tests green']);
  });

  it('an empty string clears the standard rather than setting a blank criterion', () => {
    runBoardConfig(dir, env, undefined, 'tests green', undefined);
    runBoardConfig(dir, env, undefined, '', undefined);
    runTaskAdd(dir, env, 'After clearing', {});
    expect((runTaskShow(dir, env, 'KAD-1').data!['task'] as { criteria: unknown[] }).criteria).toEqual(
      [],
    );
  });

  it('setting columns does not wipe the definition of done', () => {
    runBoardConfig(dir, env, undefined, 'tests green', undefined);
    runBoardConfig(dir, env, 'todo,doing,done', undefined);
    runTaskAdd(dir, env, 'After a column change', {});
    expect(
      (runTaskShow(dir, env, 'KAD-1').data!['task'] as { criteria: unknown[] }).criteria,
    ).toHaveLength(1);
  });
});
