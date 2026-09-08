import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd } from '../src/cli/commands/task.js';
import {
  runDecisionAdd,
  runDecisionList,
  runDecisionShow,
} from '../src/cli/commands/decision.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-dec-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'ana@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function record(title: string, why: string, opts: Record<string, unknown> = {}): string {
  const r = runDecisionAdd(dir, env, title, { why, ...opts });
  expect(r.ok, r.message).toBe(true);
  return (r.data!['decision'] as { label: string }).label;
}

function list(opts: Record<string, unknown> = {}): { label: string; title: string }[] {
  const r = runDecisionList(dir, env, opts);
  return r.data!['decisions'] as { label: string; title: string }[];
}

describe('decision add', () => {
  it('records a decision and hands back its label', () => {
    expect(record('Use ULIDs', 'Clocks disagree between machines.')).toBe('DEC-1');
  });

  it('refuses a decision with no reason — that is a changelog line, not a decision', () => {
    const r = runDecisionAdd(dir, env, 'Use ULIDs', {});
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalid_argument');
    expect(r.error?.hint).toMatch(/--why/);
  });

  it('refuses an empty title', () => {
    const r = runDecisionAdd(dir, env, '   ', { why: 'because' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalid_argument');
  });

  it('keeps the rejected alternative when one is given', () => {
    record('Use ULIDs', 'Clocks disagree.', { rejected: 'Auto-increment: collides across branches' });
    const shown = runDecisionShow(dir, env, 'DEC-1').data!['decision'] as { rejected: string };
    expect(shown.rejected).toMatch(/collides across branches/);
  });

  it('records the agent as the author when KADENCE_SOURCE says so', () => {
    const agentEnv = { KADENCE_SOURCE: 'agent' } as NodeJS.ProcessEnv;
    const r = runDecisionAdd(dir, agentEnv, 'Agent decision', { why: 'measured' });
    expect(r.ok).toBe(true);
  });
});

describe('decision list', () => {
  it('is empty on a fresh repository, and says so rather than failing', () => {
    const r = runDecisionList(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.data!['decisions']).toEqual([]);
  });

  it('returns decisions in DEC order', () => {
    record('First', 'w');
    record('Second', 'w');
    expect(list().map((d) => d.label)).toEqual(['DEC-1', 'DEC-2']);
  });

  it('carries the schema marker like every other --json response', () => {
    expect(runDecisionList(dir, env, {}).data!['schema']).toBe('kadence/v1');
  });
});

describe('decision show', () => {
  it('finds a decision by label or by ULID', () => {
    record('Use ULIDs', 'Clocks disagree.');
    const byLabel = runDecisionShow(dir, env, 'DEC-1').data!['decision'] as { id: string };
    const byUlid = runDecisionShow(dir, env, byLabel.id).data!['decision'] as { title: string };
    expect(byUlid.title).toBe('Use ULIDs');
  });

  it('names a missing decision with its own code', () => {
    const r = runDecisionShow(dir, env, 'DEC-9');
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('decision_not_found');
    expect(r.error?.received).toBe('DEC-9');
  });
});

describe('decisions and tasks live in one journal', () => {
  it('a decision does not disturb task numbering', () => {
    runTaskAdd(dir, env, 'A task');
    record('A decision', 'w');
    runTaskAdd(dir, env, 'Another task');

    const labels = (runDecisionList(dir, env, {}).data!['decisions'] as { label: string }[]).map(
      (d) => d.label,
    );
    expect(labels).toEqual(['DEC-1']);
  });
});

describe('superseding, which cannot half-apply', () => {
  // In a file-based tool this is two edits — write the new record, mark the old
  // one superseded — and teams routinely do only the first, which is how a
  // reversed decision keeps looking authoritative. Here one event carries
  // `supersedes` and the backward link is derived while folding.
  it('marks both directions from a single write', () => {
    record('Use Thrift', 'It was the fastest option we measured.');
    record('Use Avro', 'Thrift dropped schema evolution we now need.', { supersedes: 'DEC-1' });

    const older = runDecisionShow(dir, env, 'DEC-1').data!['decision'] as Record<string, unknown>;
    const newer = runDecisionShow(dir, env, 'DEC-2').data!['decision'] as Record<string, unknown>;

    expect(older['supersededBy']).toBe('DEC-2');
    expect(older['superseded']).toBe(true);
    expect(newer['supersedes']).toBe('DEC-1');
  });

  it('hides superseded decisions by default — the safe answer for an agent', () => {
    record('Use Thrift', 'fastest');
    record('Use Avro', 'schema evolution', { supersedes: 'DEC-1' });

    expect(list().map((d) => d.label)).toEqual(['DEC-2']);
  });

  it('shows them with --all, so nothing is lost', () => {
    record('Use Thrift', 'fastest');
    record('Use Avro', 'schema evolution', { supersedes: 'DEC-1' });

    expect(list({ all: true }).map((d) => d.label)).toEqual(['DEC-1', 'DEC-2']);
  });

  it('follows a chain: only the last one is current', () => {
    record('A', 'w');
    record('B', 'w', { supersedes: 'DEC-1' });
    record('C', 'w', { supersedes: 'DEC-2' });

    expect(list().map((d) => d.label)).toEqual(['DEC-3']);
  });

  it('refuses to supersede a decision that does not exist, and writes nothing', () => {
    const r = runDecisionAdd(dir, env, 'B', { why: 'w', supersedes: 'DEC-9' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('decision_not_found');
    expect(list()).toEqual([]);
  });
});

describe('decisions attached to work', () => {
  it('stores the task ULID, never the label — labels move after a merge (I7)', () => {
    const taskId = (runTaskAdd(dir, env, 'Fix login').data!['task'] as { id: string }).id;
    record('Session cookie stays', 'The redirect drops it, not the cookie.', { task: 'KAD-1' });

    const shown = runDecisionShow(dir, env, 'DEC-1').data!['decision'] as Record<string, unknown>;
    expect(shown['task']).toBe('KAD-1');
    expect(taskId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('refuses a decision pointing at a task that does not exist, and writes nothing', () => {
    const r = runDecisionAdd(dir, env, 'A', { why: 'w', task: 'KAD-9' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('task_not_found');
    expect(list()).toEqual([]);
  });

  it('filters by task, so an agent can ask only about the work in front of it', () => {
    runTaskAdd(dir, env, 'First');
    runTaskAdd(dir, env, 'Second');
    record('About the first', 'w', { task: 'KAD-1' });
    record('About the second', 'w', { task: 'KAD-2' });

    expect(list({ task: 'KAD-1' }).map((d) => d.title)).toEqual(['About the first']);
  });
});

describe('documents as linked context', () => {
  // Probe D: grep finds the right document in every case and buries it among
  // 10-35 candidates. The link saves the sifting, not the search.
  it('attaches document paths to a decision', () => {
    record('Use ULIDs', 'w', { docs: ['docs/decisions/003-zero-runtime-deps-in-core.md'] });
    const shown = runDecisionShow(dir, env, 'DEC-1').data!['decision'] as { docs: string[] };
    expect(shown.docs).toEqual(['docs/decisions/003-zero-runtime-deps-in-core.md']);
  });

  it('accepts several documents', () => {
    record('A', 'w', { docs: ['docs/a.md', 'docs/b.md'] });
    const shown = runDecisionShow(dir, env, 'DEC-1').data!['decision'] as { docs: string[] };
    expect(shown.docs).toHaveLength(2);
  });

  it('leaves docs an empty array, never absent, so an agent need not branch', () => {
    record('A', 'w');
    const shown = runDecisionShow(dir, env, 'DEC-1').data!['decision'] as { docs: string[] };
    expect(shown.docs).toEqual([]);
  });

  it('warns about a path that is not there, but records it anyway', () => {
    // The document may arrive in a later commit or live on another branch.
    // Refusing would make the journal depend on checkout state.
    const r = runDecisionAdd(dir, env, 'A', { why: 'w', docs: ['docs/not-yet-written.md'] });
    expect(r.ok).toBe(true);
    expect(r.warnings?.join(' ')).toMatch(/not-yet-written/);
  });
});

describe('the advantage has to be visible, not merely true', () => {
  // Found by running the commands by hand, not by the suite: `decision show`
  // printed a superseded decision exactly like a current one. A human reading
  // it would take a reversed reason as binding — the failure we claim to fix.
  it('says loudly that a superseded decision is no longer in force', () => {
    record('Use Thrift', 'It was the fastest option we measured.');
    record('Use Avro', 'Thrift dropped schema evolution.', { supersedes: 'DEC-1' });

    const text = runDecisionShow(dir, env, 'DEC-1').message;
    expect(text).toMatch(/superseded/i);
    expect(text).toContain('DEC-2');
  });

  it('leaves a current decision unqualified — no noise where there is no doubt', () => {
    record('Use Avro', 'schema evolution');
    expect(runDecisionShow(dir, env, 'DEC-1').message).not.toMatch(/superseded/i);
  });

  it('says both links were written by one event, because that is the point', () => {
    record('Use Thrift', 'fastest');
    const r = runDecisionAdd(dir, env, 'Use Avro', { why: 'evolution', supersedes: 'DEC-1' });

    expect(r.message).toContain('DEC-1');
    expect(r.message).toMatch(/one event|single event/i);
  });
});

describe('who wrote the decision — human or agent', () => {
  // The product refuses to guess the source when writing an event. That refusal
  // only means something if the source is visible where the record is read:
  // otherwise the journal knows and the contract does not.
  it('reports a human decision as human', () => {
    record('A human call', 'reasoned in a meeting');
    const [d] = list() as unknown as { source: string }[];
    expect(d!.source).toBe('human');
  });

  it('reports an agent decision as agent', () => {
    const agentEnv = { KADENCE_SOURCE: 'agent' } as NodeJS.ProcessEnv;
    runDecisionAdd(dir, agentEnv, 'An agent call', { why: 'measured' });

    const [d] = list() as unknown as { source: string }[];
    expect(d!.source).toBe('agent');
  });

  it('carries the source through decision show as well', () => {
    const agentEnv = { KADENCE_SOURCE: 'agent' } as NodeJS.ProcessEnv;
    runDecisionAdd(dir, agentEnv, 'An agent call', { why: 'measured' });

    const shown = runDecisionShow(dir, env, 'DEC-1').data!['decision'] as { source: string };
    expect(shown.source).toBe('agent');
  });

  it('distinguishes the two in one listing, which is the whole point', () => {
    record('Human decided', 'w');
    runDecisionAdd(dir, { KADENCE_SOURCE: 'agent' } as NodeJS.ProcessEnv, 'Agent decided', {
      why: 'w',
    });

    const sources = (list() as unknown as { source: string }[]).map((d) => d.source);
    expect(sources).toEqual(['human', 'agent']);
  });
});
