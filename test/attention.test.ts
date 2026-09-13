import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project } from '../src/core/projection.js';
import { attentionReport } from '../src/core/attention.js';
import type { FlowEvent } from '../src/core/event.js';
import { createUlid } from '../src/core/ulid.js';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove } from '../src/cli/commands/task.js';
import { runReport } from '../src/cli/commands/report.js';

/**
 * Attention signals: work the board presents as active while nobody moves it.
 *
 * The narrowness is the design. "Unassigned open task" is the definition of a
 * backlog and would return every row; "criteria added and never checked" fires
 * on every task in any repository that configured a Definition of Done, because
 * `task add` copies it in unchecked. What is left is the gap between what the
 * board claims and what is happening, and that list is short by construction.
 */

const gen = createUlid();
const TODAY = new Date('2026-09-30T12:00:00.000Z');
const day = (d: number, h = 10): string => new Date(Date.UTC(2026, 8, d, h)).toISOString();

function created(id: string, ts: string, extra: Record<string, unknown> = {}): FlowEvent {
  return { id, type: 'task.created', entity: id, actor: 'a@b.c', ts, source: 'human', data: { title: `T ${id.slice(-3)}`, ...extra } };
}
function moved(entity: string, to: string, ts: string): FlowEvent {
  return { id: gen(), type: 'task.moved', entity, actor: 'a@b.c', ts, source: 'human', data: { to } };
}
function ev(type: string, entity: string, data: Record<string, unknown>, ts: string): FlowEvent {
  return { id: gen(), type, entity, actor: 'a@b.c', ts, source: 'human', data } as FlowEvent;
}

/** A task created on `c` and started on `s`, with no activity after that. */
function startedOn(c: number, s: number, extra: Record<string, unknown> = {}): { id: string; events: FlowEvent[] } {
  const id = gen();
  return { id, events: [created(id, day(c), extra), moved(id, 'in_progress', day(s))] };
}

const kinds = (r: ReturnType<typeof attentionReport>, label: string): string[] =>
  r.rows.find((x) => x.label === label)?.signals.map((s) => s.kind) ?? [];

describe('attentionReport', () => {
  it('names the threshold, the started boundary and the day it was run', () => {
    const r = attentionReport(project([]), TODAY, 7);

    expect(r.threshold).toBe(7);
    expect(r.started).toBe('in_progress');
    expect(r.asOf).toBe('2026-09-30');
    expect(r.rows).toEqual([]);
  });

  it('explains an empty result rather than printing nothing', () => {
    const r = attentionReport(project([]), TODAY, 7);

    expect(r.notes.join(' ')).toMatch(/no work in progress/i);
  });

  describe('stalled', () => {
    it('reports work in progress whose last event is older than the threshold', () => {
      const t = startedOn(1, 2);
      const r = attentionReport(project(t.events), TODAY, 7);

      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]!.label).toBe('KAD-1');
      expect(kinds(r, 'KAD-1')).toContain('stalled');
      expect(r.rows[0]!.idleDays).toBe(28);
    });

    it('says nothing about work that moved inside the threshold', () => {
      const t = startedOn(1, 28);
      const r = attentionReport(project([...t.events, ev('task.commented', t.id, { text: 'x' }, day(29))]), TODAY, 7);

      expect(kinds(r, 'KAD-1')).not.toContain('stalled');
    });

    it('counts a task idle for exactly the threshold', () => {
      const t = startedOn(1, 23);
      const r = attentionReport(project(t.events), TODAY, 7);

      expect(kinds(r, 'KAD-1')).toContain('stalled');
    });

    it('measures idleness from the last history entry, not from `updatedAt`', () => {
      // `updatedAt` takes a max over `ts`, so one event from a machine whose
      // clock runs ahead makes the task look fresh forever — including after
      // real work has happened and stopped.
      const t = startedOn(1, 2);
      const skewed = ev('task.commented', t.id, { text: 'from a fast clock' }, '2027-01-01T00:00:00.000Z');
      const real = ev('task.commented', t.id, { text: 'and then nothing' }, day(2));
      const events = [...t.events, skewed, real];

      expect(project(events).tasks[0]!.updatedAt).toBe('2027-01-01T00:00:00.000Z');
      expect(kinds(attentionReport(project(events), TODAY, 7), 'KAD-1')).toContain('stalled');
    });

    it('leaves the backlog alone — only work past the started boundary counts', () => {
      const id = gen();
      const r = attentionReport(project([created(id, day(1))]), TODAY, 7);

      expect(r.rows).toEqual([]);
    });

    it('never reports finished or cancelled work', () => {
      const a = startedOn(1, 2);
      const b = startedOn(1, 2);
      const events = [
        ...a.events,
        moved(a.id, 'done', day(3)),
        ...b.events,
        ev('task.cancelled', b.id, {}, day(3)),
      ];
      const r = attentionReport(project(events), TODAY, 7);

      expect(r.rows).toEqual([]);
    });
  });

  describe('unowned', () => {
    /** In flight since day 2, talked about on day 29 — busy, but nobody owns it. */
    const busyButOwnerless = (extra: Record<string, unknown> = {}): FlowEvent[] => {
      const t = startedOn(1, 2, extra);
      return [...t.events, ev('task.commented', t.id, { text: 'any news?' }, day(29))];
    };

    it('reports work that has been in flight past the threshold with no assignee and no claim', () => {
      const r = attentionReport(project(busyButOwnerless()), TODAY, 7);

      expect(kinds(r, 'KAD-1')).toEqual(['unowned']);
      expect(r.rows[0]!.signals[0]!.days).toBe(28);
    });

    it('says nothing about work that has only just started', () => {
      // Nobody is on it yet because it began this morning. That is not neglect,
      // and a signal that fires the moment work starts is noise by the afternoon.
      const t = startedOn(1, 29);
      const r = attentionReport(project(t.events), TODAY, 7);

      expect(r.rows).toEqual([]);
    });

    it('says nothing when the task is assigned', () => {
      const r = attentionReport(project(busyButOwnerless({ assignee: 'ana@example.com' })), TODAY, 7);

      expect(r.rows).toEqual([]);
    });

    it('counts a claim as ownership even with no assignee', () => {
      const events = busyButOwnerless();
      const claimed = [...events, ev('task.claimed', events[0]!.entity, { by: 'ana@example.com' }, day(29))];
      const r = attentionReport(project(claimed), TODAY, 7);

      expect(kinds(r, 'KAD-1')).not.toContain('unowned');
    });
  });

  describe('stale_claim', () => {
    it('reports a claim older than the threshold that never moved the task', () => {
      const t = startedOn(1, 2);
      const claim = ev('task.claimed', t.id, { by: 'ana@example.com' }, day(3));
      const r = attentionReport(project([...t.events, claim]), TODAY, 7);

      const row = r.rows.find((x) => x.label === 'KAD-1')!;
      expect(row.signals.find((s) => s.kind === 'stale_claim')?.days).toBe(27);
      expect(row.signals.find((s) => s.kind === 'stale_claim')?.who).toBe('ana@example.com');
    });

    it('says nothing when the task moved after the claim', () => {
      const t = startedOn(1, 2);
      const events = [...t.events, ev('task.claimed', t.id, { by: 'ana@example.com' }, day(3)), moved(t.id, 'in_review', day(28))];
      const r = attentionReport(project(events), TODAY, 7);

      expect(kinds(r, 'KAD-1')).not.toContain('stale_claim');
    });

    it('says nothing when a second claimant shares the winner\'s timestamp', () => {
      // Two machines, two clocks, the same `ts` on both claims. The walk back
      // has to recognise the claim that won by ULID, not one that merely
      // carries the same wall-clock reading — otherwise the move between them
      // is never reached and a task worked on yesterday reads as abandoned.
      const t = startedOn(1, 2);
      const same = day(3);
      const events = [
        ...t.events,
        ev('task.claimed', t.id, { by: 'ana@example.com' }, same),
        moved(t.id, 'in_review', day(28)),
        ev('task.claimed', t.id, { by: 'bo@example.com' }, same),
      ];
      const r = attentionReport(project(events), TODAY, 7);

      expect(kinds(r, 'KAD-1')).not.toContain('stale_claim');
    });

    it('names the claimant, not the actor, when an agent claimed for a person', () => {
      const t = startedOn(1, 2);
      const claim: FlowEvent = { id: gen(), type: 'task.claimed', entity: t.id, actor: 'agent@ci', ts: day(3), source: 'agent', data: { by: 'ana@example.com' } };
      const r = attentionReport(project([...t.events, claim]), TODAY, 7);

      expect(r.rows[0]!.signals.find((s) => s.kind === 'stale_claim')?.who).toBe('ana@example.com');
    });
  });

  describe('dead_blocker', () => {
    it('reports a task still blocked by work that is already done', () => {
      const blocker = startedOn(1, 2);
      const blocked = startedOn(1, 2, { assignee: 'ana@example.com' });
      const events = [
        ...blocker.events,
        ...blocked.events,
        ev('task.blocked_by_added', blocked.id, { blocker: blocker.id }, day(3)),
        moved(blocker.id, 'done', day(29)),
      ];
      const r = attentionReport(project(events), TODAY, 7);

      const row = r.rows.find((x) => x.label === 'KAD-2')!;
      expect(row.signals.find((s) => s.kind === 'dead_blocker')?.blockers).toEqual(['KAD-1']);
    });

    it('says nothing while the blocker is still open', () => {
      const blocker = startedOn(1, 29);
      const blocked = startedOn(1, 29, { assignee: 'ana@example.com' });
      const events = [...blocker.events, ...blocked.events, ev('task.blocked_by_added', blocked.id, { blocker: blocker.id }, day(29))];
      const r = attentionReport(project(events), TODAY, 7);

      expect(kinds(r, 'KAD-2')).not.toContain('dead_blocker');
    });

    it('reports a dead blocker on a task that never started — the board is lying about why it is waiting', () => {
      const blocker = startedOn(1, 2);
      const waiting = gen();
      const events = [
        ...blocker.events,
        created(waiting, day(1), { assignee: 'ana@example.com' }),
        ev('task.blocked_by_added', waiting, { blocker: blocker.id }, day(3)),
        moved(blocker.id, 'done', day(29)),
      ];
      const r = attentionReport(project(events), TODAY, 7);

      expect(kinds(r, 'KAD-2')).toEqual(['dead_blocker']);
    });
  });

  describe('the shape of the answer', () => {
    it('gives one row per task however many signals it carries', () => {
      const t = startedOn(1, 2);
      const claim = ev('task.claimed', t.id, { by: 'ana@example.com' }, day(3));
      const r = attentionReport(project([...t.events, claim]), TODAY, 7);

      expect(r.rows).toHaveLength(1);
      expect(kinds(r, 'KAD-1').sort()).toEqual(['stale_claim', 'stalled']);
    });

    it('puts the most neglected work first', () => {
      const old = startedOn(1, 2);
      const newer = startedOn(1, 20);
      const r = attentionReport(project([...old.events, ...newer.events]), TODAY, 7);

      expect(r.rows.map((x) => x.label)).toEqual(['KAD-1', 'KAD-2']);
      expect(r.rows[0]!.idleDays).toBeGreaterThan(r.rows[1]!.idleDays);
    });

    it('carries enough to act without a second call', () => {
      const t = startedOn(1, 2, { assignee: 'ana@example.com', priority: 'high' });
      const r = attentionReport(project(t.events), TODAY, 7);

      expect(r.rows[0]).toMatchObject({
        label: 'KAD-1',
        status: 'in_progress',
        assignee: 'ana@example.com',
        priority: 'high',
      });
      expect(r.rows[0]!.title).toBeTruthy();
    });

    it('does not depend on the order the events are read in (I1)', () => {
      const t = startedOn(1, 2);
      const claim = ev('task.claimed', t.id, { by: 'ana@example.com' }, day(3));
      const events = [...t.events, claim];

      const forward = attentionReport(project(events), TODAY, 7);
      const backward = attentionReport(project([...events].reverse()), TODAY, 7);

      expect(backward).toEqual(forward);
    });
  });
});

describe('kadence report attention', () => {
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-attention-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
    runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** Thirty days on, so work started by the test has had time to go quiet. */
  const inAMonth = (): Date => new Date(Date.now() + 30 * 86_400_000);

  it('joins the list of reports the command offers', () => {
    const r = runReport(dir, env, 'pie', {});
    expect(r.error!.allowed).toEqual(['flow', 'cfd', 'attention']);
  });

  it('defaults to seven days of silence, not the thirty a window report uses', () => {
    const r = runReport(dir, env, 'attention', { json: true });
    expect(r.data!['threshold']).toBe(7);
  });

  it('takes the threshold from --since', () => {
    const r = runReport(dir, env, 'attention', { since: '14d', json: true });
    expect(r.data!['threshold']).toBe(14);
  });

  it('rejects a threshold it cannot parse, like every other report', () => {
    const r = runReport(dir, env, 'attention', { since: '2w' });
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
  });

  it('says what it counted and where the started boundary is, in the first line', () => {
    runTaskAdd(dir, env, 'One', {});
    const r = runReport(dir, env, 'attention', {});
    expect(r.ok).toBe(true);
    expect(r.message.split('\n')[0]).toMatch(/7 days/);
    expect(r.message.split('\n')[0]).toMatch(/"in_progress"/);
  });

  it('explains an empty result instead of printing an empty list', () => {
    runTaskAdd(dir, env, 'One', {});
    const r = runReport(dir, env, 'attention', {});
    expect(r.message).toMatch(/no work in progress/i);
  });

  it('names the task and the reason when there is something to say', () => {
    runTaskAdd(dir, env, 'Fix login', {});
    runTaskMove(dir, env, 'KAD-1', 'in_progress');
    const r = runReport(dir, env, 'attention', {}, inAMonth());

    expect(r.message).toMatch(/KAD-1/);
    expect(r.message).toMatch(/unowned/);
    expect(r.message).toMatch(/Fix login/);
  });

  it('returns the same answer as JSON, with the schema and the report name', () => {
    runTaskAdd(dir, env, 'Fix login', {});
    runTaskMove(dir, env, 'KAD-1', 'in_progress');
    const r = runReport(dir, env, 'attention', { json: true }, inAMonth());

    expect(r.data!['schema']).toBe('kadence/v1');
    expect(r.data!['report']).toBe('attention');
    expect(r.data!['started']).toBe('in_progress');
    const rows = r.data!['rows'] as { label: string; signals: { kind: string }[] }[];
    expect(rows[0]!.label).toBe('KAD-1');
    expect(rows[0]!.signals.map((x) => x.kind)).toEqual(['stalled', 'unowned']);
  });
});
