import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove, runTaskEdit } from '../src/cli/commands/task.js';
import { runSprintCreate, runSprintAdd, runSprintEdit } from '../src/cli/commands/sprint.js';
import { runMilestoneCreate } from '../src/cli/commands/milestone.js';
import { runReport } from '../src/cli/commands/report.js';
import { pickScale } from '../src/core/timeline.js';

/**
 * `report timeline` — what should be done when, by epic (DEC-71…74).
 *
 * A bar is a date someone set, the dates of the work under it, or what really
 * happened; nothing is forecast. Two levels: the epic and its direct children,
 * grandchildren stretching their parent. Dated work with no epic shares one
 * last row group; undated work is a count.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const TODAY = new Date();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-timeline-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

type Bar = Record<string, unknown>;
type Group = { epic: Bar | null; children: Bar[] };

function timeline(options: Record<string, unknown> = {}): Record<string, unknown> {
  const r = runReport(dir, env, 'timeline', { json: true, ...options }, TODAY);
  expect(r.ok, r.message).toBe(true);
  return r.data!['timeline'] as Record<string, unknown>;
}
const groups = (t: Record<string, unknown>): Group[] => t['groups'] as Group[];

describe('the plan', () => {
  it('an epic with its own start and due is planned by them', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', start: '2026-12-01', due: '2026-12-20' });
    const epic = groups(timeline())[0]!.epic!;
    expect(epic).toMatchObject({ label: 'KAD-1', plan: { from: '2026-12-01', to: '2026-12-20' }, planSource: 'explicit' });
  });

  it('an epic without dates is planned from the work under it: due dates and sprint dates', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic' });
    runTaskAdd(dir, env, 'Invoices', { parent: 'KAD-1', due: '2026-12-10' });
    runTaskAdd(dir, env, 'Refunds', { parent: 'KAD-1' });
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintEdit(dir, env, undefined, { startDate: '2026-11-16', endDate: '2026-11-29' });
    runSprintAdd(dir, env, 'KAD-3', {});

    const g = groups(timeline())[0]!;
    expect(g.epic).toMatchObject({ plan: { from: '2026-11-16', to: '2026-12-10' }, planSource: 'derived' });
    expect(g.children.map((c) => [c['label'], c['plan']])).toEqual([
      ['KAD-2', { from: '2026-12-10', to: '2026-12-10' }],
      ['KAD-3', { from: '2026-11-16', to: '2026-11-29' }],
    ]);
  });

  it('when the work runs past the planned due date, says so instead of choosing', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', start: '2026-12-01', due: '2026-12-20' });
    runTaskAdd(dir, env, 'Invoices', { parent: 'KAD-1', due: '2026-12-28' });

    const epic = groups(timeline())[0]!.epic!;
    expect(epic['plan']).toEqual({ from: '2026-12-01', to: '2026-12-20' });
    expect(epic['mismatch']).toMatch(/2026-12-28.*2026-12-20/);
  });

  it('a grandchild stretches its parent’s bar and gets no row of its own', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic' });
    runTaskAdd(dir, env, 'Invoices', { parent: 'KAD-1', type: 'story' });
    runTaskAdd(dir, env, 'PDF export', { parent: 'KAD-2', due: '2026-12-15' });

    const g = groups(timeline())[0]!;
    expect(g.children.map((c) => c['label'])).toEqual(['KAD-2']);
    expect(g.children[0]!['plan']).toEqual({ from: '2026-12-15', to: '2026-12-15' });
  });

  it('an epic inside an epic belongs to the outermost one', () => {
    runTaskAdd(dir, env, 'Platform', { type: 'epic' });
    runTaskAdd(dir, env, 'Billing', { type: 'epic', parent: 'KAD-1', due: '2026-12-20' });

    const all = groups(timeline());
    expect(all.map((g) => g.epic?.['label'])).toEqual(['KAD-1']);
    expect(all[0]!.children.map((c) => c['label'])).toEqual(['KAD-2']);
  });
});

describe('what happened', () => {
  it('work started is an open bar up to today; work finished is closed', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic' });
    runTaskAdd(dir, env, 'Invoices', { parent: 'KAD-1' });
    runTaskAdd(dir, env, 'Refunds', { parent: 'KAD-1' });
    runTaskMove(dir, env, 'KAD-2', 'done');
    runTaskMove(dir, env, 'KAD-3', 'in_progress');

    const today = TODAY.toISOString().slice(0, 10);
    const g = groups(timeline())[0]!;
    expect(g.epic!['actual']).toEqual({ from: today, to: today, open: true });
    expect(g.children[0]!['actual']).toEqual({ from: today, to: today, open: false });
    // No plan anywhere, and still on the timeline: what happened is a date.
    expect(g.epic!['plan']).toBeNull();
  });
});

describe('rows', () => {
  it('dated work with no epic shares one group, last, with epic null', () => {
    runTaskAdd(dir, env, 'Loose and dated', { due: '2026-12-05' });
    runTaskAdd(dir, env, 'Billing', { type: 'epic', due: '2026-12-20' });

    const all = groups(timeline());
    expect(all.map((g) => g.epic?.['label'] ?? null)).toEqual(['KAD-2', null]);
    expect(all[1]!.children.map((c) => c['label'])).toEqual(['KAD-1']);
  });

  it('no group for undated work with no epic; it is counted instead', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', due: '2026-12-20' });
    runTaskAdd(dir, env, 'Someday', {});
    runTaskAdd(dir, env, 'Also someday', { parent: 'KAD-1' });

    const t = timeline();
    expect(groups(t).map((g) => g.epic?.['label'] ?? null)).toEqual(['KAD-1']);
    expect(groups(t)[0]!.children).toEqual([]);
    expect(t['undated']).toBe(2);
  });

  it('in the no-epic group, finished work with no plan is hidden and counted; --all shows it', () => {
    // On this repository's own journal the group was ~90 rows of closed tasks,
    // and the plan the timeline exists for sat under them (owner, 2026-10-31).
    runTaskAdd(dir, env, 'Done long ago', {});
    runTaskMove(dir, env, 'KAD-1', 'done');
    runTaskAdd(dir, env, 'Done, but it was planned', { due: '2026-12-05' });
    runTaskMove(dir, env, 'KAD-2', 'done');
    runTaskAdd(dir, env, 'Under way', {});
    runTaskMove(dir, env, 'KAD-3', 'in_progress');

    const t = timeline();
    expect(groups(t)[0]!.children.map((c) => c['label'])).toEqual(['KAD-2', 'KAD-3']);
    expect(t['hiddenFinished']).toBe(1);
    expect(runReport(dir, env, 'timeline', {}, TODAY).message).toContain('--all');

    const all = timeline({ all: true });
    expect(groups(all)[0]!.children.map((c) => c['label'])).toEqual(['KAD-1', 'KAD-2', 'KAD-3']);
    expect(all['hiddenFinished']).toBe(0);
  });

  it('finished work under an epic stays: the epic is the plan it belongs to', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic' });
    runTaskAdd(dir, env, 'Invoices', { parent: 'KAD-1' });
    runTaskMove(dir, env, 'KAD-2', 'done');

    expect(groups(timeline())[0]!.children.map((c) => c['label'])).toEqual(['KAD-2']);
  });

  it('--all is refused on a report it means nothing to', () => {
    const r = runReport(dir, env, 'flow', { all: true }, TODAY);
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ code: 'invalid_argument' });
  });

  it('cancelled work is neither a bar nor a count', () => {
    runTaskAdd(dir, env, 'Gone', { due: '2026-12-05' });
    runTaskMove(dir, env, 'KAD-1', 'cancelled');
    const t = timeline();
    expect(groups(t)).toEqual([]);
    expect(t['undated']).toBe(0);
  });

  it('an empty timeline names the commands that put work on it', () => {
    runTaskAdd(dir, env, 'Someday', {});
    const r = runReport(dir, env, 'timeline', {}, TODAY);
    expect(r.message).toContain('1 task(s) have no dates');
    expect(r.message).toContain('kadence task edit');
  });
});

describe('markers', () => {
  it('carries sprints with dates and milestones with a due date', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', due: '2026-12-20' });
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintEdit(dir, env, undefined, { startDate: '2026-12-01', endDate: '2026-12-14' });
    runMilestoneCreate(dir, env, '1.0', { due: '2026-12-31' });

    const markers = timeline()['markers'] as Record<string, unknown[]>;
    expect(markers['sprints']).toEqual([{ name: 'Sprint 1', from: '2026-12-01', to: '2026-12-14' }]);
    expect(markers['milestones']).toEqual([{ label: 'MS-1', name: '1.0', date: '2026-12-31' }]);
  });
});

describe('scale', () => {
  it('is picked from the span: days up to six weeks, weeks up to six months, then months', () => {
    expect(pickScale({ from: '2026-12-01', to: '2026-12-31' })).toBe('day');
    expect(pickScale({ from: '2026-09-01', to: '2026-12-31' })).toBe('week');
    expect(pickScale({ from: '2026-01-01', to: '2026-12-31' })).toBe('month');
  });

  it('--scale overrides it, and a wrong one is a usage error naming the allowed', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', start: '2026-12-01', due: '2026-12-20' });
    expect(timeline({ scale: 'month' })['scale']).toBe('month');

    const r = runReport(dir, env, 'timeline', { scale: 'decade' }, TODAY);
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ code: 'invalid_argument', allowed: ['day', 'week', 'month'] });
  });
});

describe('the page', () => {
  it('draws the bars and names every row', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', start: '2026-12-01', due: '2026-12-20' });
    runTaskAdd(dir, env, 'Invoices', { parent: 'KAD-1', due: '2026-12-28' });
    const r = runReport(dir, env, 'timeline', { html: true }, TODAY);
    expect(r.ok).toBe(true);

    const html = readFileSync(join(dir, 'kadence-timeline.html'), 'utf8');
    expect(html).toContain('<svg');
    expect(html).toContain('Billing');
    expect(html).toContain('Invoices');
  });

  it('a title with markup in it is escaped', () => {
    runTaskAdd(dir, env, '<script>x</script>', { type: 'epic', due: '2026-12-20' });
    runReport(dir, env, 'timeline', { html: true }, TODAY);
    const html = readFileSync(join(dir, 'kadence-timeline.html'), 'utf8');
    expect(html).not.toContain('<script>x');
  });

  it('a date moved later shows on the next fold, nothing cached in between', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', due: '2026-12-20' });
    runTaskEdit(dir, env, 'KAD-1', { due: '2027-01-10' });
    expect(groups(timeline())[0]!.epic!['plan']).toEqual({ from: '2027-01-10', to: '2027-01-10' });
  });
});
