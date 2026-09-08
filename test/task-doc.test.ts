import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskShow, runTaskDoc } from '../src/cli/commands/task.js';
import { runDecisionAdd } from '../src/cli/commands/decision.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-doc-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'ana@example.com'], { cwd: dir });
  runInit(dir);
  runTaskAdd(dir, env, 'Fix login');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function shown(): Record<string, unknown> {
  return runTaskShow(dir, env, 'KAD-1').data!['task'] as Record<string, unknown>;
}

describe('a task carries the documents that explain it', () => {
  it('links a document', () => {
    writeFileSync(join(dir, 'DESIGN.md'), '# Design');
    const r = runTaskDoc(dir, env, 'KAD-1', 'DESIGN.md');

    expect(r.ok, r.message).toBe(true);
    expect(shown()['docs']).toEqual(['DESIGN.md']);
  });

  it('links several, without duplicating one linked twice', () => {
    writeFileSync(join(dir, 'A.md'), 'a');
    writeFileSync(join(dir, 'B.md'), 'b');
    runTaskDoc(dir, env, 'KAD-1', 'A.md');
    runTaskDoc(dir, env, 'KAD-1', 'B.md');
    runTaskDoc(dir, env, 'KAD-1', 'A.md');

    expect(shown()['docs']).toEqual(['A.md', 'B.md']);
  });

  it('is an empty array when nothing is linked, so an agent need not branch', () => {
    expect(shown()['docs']).toEqual([]);
  });

  it('warns about a missing file but records the link', () => {
    const r = runTaskDoc(dir, env, 'KAD-1', 'docs/later.md');
    expect(r.ok).toBe(true);
    expect(r.warnings?.join(' ')).toMatch(/later\.md/);
    expect(shown()['docs']).toEqual(['docs/later.md']);
  });

  it('refuses to link to a task that does not exist', () => {
    const r = runTaskDoc(dir, env, 'KAD-9', 'A.md');
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('task_not_found');
  });
});

describe('a task carries the decisions made about it', () => {
  it('surfaces current decisions in task show', () => {
    runDecisionAdd(dir, env, 'Session cookie stays', { why: 'The redirect drops it.', task: 'KAD-1' });

    const decisions = shown()['decisions'] as { label: string; why: string }[];
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.why).toMatch(/redirect/);
  });

  it('hides superseded ones — the same safe default as decision list', () => {
    runDecisionAdd(dir, env, 'Use Thrift', { why: 'fastest', task: 'KAD-1' });
    runDecisionAdd(dir, env, 'Use Avro', {
      why: 'schema evolution',
      task: 'KAD-1',
      supersedes: 'DEC-1',
    });

    const decisions = shown()['decisions'] as { label: string }[];
    expect(decisions.map((d) => d.label)).toEqual(['DEC-2']);
  });

  it('leaves decisions an empty array when none were recorded', () => {
    expect(shown()['decisions']).toEqual([]);
  });

  it('does not carry decisions belonging to another task', () => {
    runTaskAdd(dir, env, 'Another');
    runDecisionAdd(dir, env, 'About the other one', { why: 'w', task: 'KAD-2' });

    expect(shown()['decisions']).toEqual([]);
  });
});

describe('superseding must not detach the reasoning from the work', () => {
  // Found by installing the tarball and using it, not by the suite: superseding
  // a decision left the task with no decisions at all, because the replacement
  // did not repeat --task. Losing the why is the one outcome this feature
  // exists to prevent.
  it('the replacement inherits the task the superseded decision was about', () => {
    runDecisionAdd(dir, env, 'Use Thrift', { why: 'fastest', task: 'KAD-1' });
    runDecisionAdd(dir, env, 'Use Avro', { why: 'schema evolution', supersedes: 'DEC-1' });

    const decisions = shown()['decisions'] as { label: string }[];
    expect(decisions.map((d) => d.label)).toEqual(['DEC-2']);
  });

  it('an explicit task on the replacement wins over the inherited one', () => {
    runTaskAdd(dir, env, 'Another');
    runDecisionAdd(dir, env, 'About the first', { why: 'w', task: 'KAD-1' });
    runDecisionAdd(dir, env, 'Moved elsewhere', {
      why: 'w',
      task: 'KAD-2',
      supersedes: 'DEC-1',
    });

    expect(shown()['decisions']).toEqual([]);
  });

  it('does not invent a task when the superseded decision had none', () => {
    runDecisionAdd(dir, env, 'Project-wide', { why: 'w' });
    runDecisionAdd(dir, env, 'Still project-wide', { why: 'w', supersedes: 'DEC-1' });

    expect(shown()['decisions']).toEqual([]);
  });
});
