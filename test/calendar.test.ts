import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove } from '../src/cli/commands/task.js';
import { runSprintCreate, runSprintEdit } from '../src/cli/commands/sprint.js';
import { runMilestoneCreate } from '../src/cli/commands/milestone.js';
import { runReport } from '../src/cli/commands/report.js';

/**
 * `report calendar` — the timeline's dates, by day (DEC-75).
 *
 * Epics as bars across the days they span, every task with a due date on its
 * day, sprint and milestone markers. The bars come from the timeline's own
 * fold, so the two views cannot put one epic on two different dates.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const TODAY = new Date('2026-12-10T12:00:00.000Z');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-calendar-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function calendar(options: Record<string, unknown> = {}, today: Date = TODAY): Record<string, unknown> {
  const r = runReport(dir, env, 'calendar', { json: true, ...options }, today);
  expect(r.ok, r.message).toBe(true);
  return r.data!['calendar'] as Record<string, unknown>;
}
type Bar = Record<string, unknown>;
const bars = (c: Record<string, unknown>): Bar[] => c['bars'] as Bar[];

describe('the month', () => {
  it('is the current one by default, and --month picks another', () => {
    expect(calendar()['month']).toBe('2026-12');
    expect(calendar({ month: '2027-01' })).toMatchObject({ month: '2027-01', from: '2027-01-01', to: '2027-01-31' });
  });

  it('a malformed month is a usage error', () => {
    const r = runReport(dir, env, 'calendar', { month: '2026-13' }, TODAY);
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ code: 'invalid_argument', received: '2026-13' });
  });
});

describe('epic bars', () => {
  it('span the days of the epic’s plan', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', start: '2026-12-03', due: '2026-12-12' });
    expect(bars(calendar())).toEqual([
      expect.objectContaining({
        label: 'KAD-1', from: '2026-12-03', to: '2026-12-12', continuesBefore: false, continuesAfter: false, lane: 0, source: 'plan',
      }),
    ]);
  });

  it('are cut at the month’s edges and say they continue', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', start: '2026-11-20', due: '2027-01-05' });
    expect(bars(calendar())[0]).toMatchObject({
      from: '2026-12-01', to: '2026-12-31', continuesBefore: true, continuesAfter: true,
    });
  });

  it('that overlap take different lanes; one that follows another reuses its lane', () => {
    runTaskAdd(dir, env, 'A', { type: 'epic', start: '2026-12-01', due: '2026-12-10' });
    runTaskAdd(dir, env, 'B', { type: 'epic', start: '2026-12-05', due: '2026-12-15' });
    runTaskAdd(dir, env, 'C', { type: 'epic', start: '2026-12-12', due: '2026-12-20' });
    const lanes = Object.fromEntries(bars(calendar()).map((b) => [b['label'], b['lane']]));
    expect(lanes).toEqual({ 'KAD-1': 0, 'KAD-2': 1, 'KAD-3': 0 });
    expect(calendar()['lanes']).toBe(2);
  });

  it('an epic with no plan but work under way shows what happened', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic' });
    runTaskAdd(dir, env, 'Invoices', { parent: 'KAD-1' });
    runTaskMove(dir, env, 'KAD-2', 'in_progress');
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const c = calendar({ month }, now);
    expect(bars(c)[0]).toMatchObject({ label: 'KAD-1', source: 'actual' });
  });

  it('an epic outside the month is not there', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', start: '2027-02-01', due: '2027-02-10' });
    expect(bars(calendar())).toEqual([]);
  });
});

describe('days', () => {
  it('every task with a due date in the month is on its day, with or without an epic', () => {
    runTaskAdd(dir, env, 'Billing', { type: 'epic', due: '2026-12-20' });
    runTaskAdd(dir, env, 'Invoices', { parent: 'KAD-1', due: '2026-12-04' });
    runTaskAdd(dir, env, 'Loose', { due: '2026-12-09' });
    runTaskAdd(dir, env, 'Next year', { due: '2027-01-09' });

    const items = calendar()['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => [i['date'], i['label'], i['epic']])).toEqual([
      ['2026-12-04', 'KAD-2', 'KAD-1'],
      ['2026-12-09', 'KAD-3', null],
    ]);
  });

  it('carries sprint starts and ends and milestone dates in the month', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintEdit(dir, env, undefined, { startDate: '2026-11-23', endDate: '2026-12-06' });
    runMilestoneCreate(dir, env, '1.0', { due: '2026-12-18' });

    expect(calendar()['markers']).toEqual([
      { date: '2026-12-06', kind: 'sprint_end', name: 'Sprint 1' },
      { date: '2026-12-18', kind: 'milestone', name: 'MS-1 1.0' },
    ]);
  });

  it('the text form lists by day, not as a grid', () => {
    runTaskAdd(dir, env, 'Loose', { due: '2026-12-09' });
    const r = runReport(dir, env, 'calendar', {}, TODAY);
    expect(r.message).toMatch(/Wed 2026-12-09 .*KAD-1 Loose/);
  });

  it('an empty month says so', () => {
    const r = runReport(dir, env, 'calendar', {}, TODAY);
    expect(r.message).toContain('Nothing dated in 2026-12');
  });
});

describe('the page', () => {
  it('is a month grid with the bars and the due work in it, escaped', () => {
    runTaskAdd(dir, env, '<b>Billing</b>', { type: 'epic', start: '2026-12-03', due: '2026-12-12' });
    runTaskAdd(dir, env, 'Invoices', { due: '2026-12-09' });
    expect(runReport(dir, env, 'calendar', { html: true }, TODAY).ok).toBe(true);

    const html = readFileSync(join(dir, 'kadence-calendar.html'), 'utf8');
    expect(html).toContain('<table class="calendar"');
    expect(html).toContain('&lt;b&gt;Billing');
    expect(html).toContain('Invoices');
  });
});
