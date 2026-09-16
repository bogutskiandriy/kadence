import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove, runTaskAssign } from '../src/cli/commands/task.js';
import { runSprintCreate, runSprintAdd, runSprintClose, runSprintBurndown } from '../src/cli/commands/sprint.js';
import { runReport, REPORTS } from '../src/cli/commands/report.js';

/**
 * One catalogue, one verb.
 *
 * The burndown, the velocity series and the workload were folds this codebase
 * already had, reachable only under `sprint` and `stats` — so an agent reading
 * `schema --json` could not find them, and `kadence report` was not the
 * catalogue it looked like. These tests are mostly about that: the same
 * numbers, one place to ask for them.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const TODAY = new Date('2026-09-30T12:00:00.000Z');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-catalogue-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Two closed sprints and one running, with work spread across three people. */
function threeSprints(): void {
  for (const [i, name] of ['Sprint 1', 'Sprint 2', 'Sprint 3'].entries()) {
    runSprintCreate(dir, env, name);
    const base = i * 3;
    runTaskAdd(dir, env, `Task ${base + 1}`, { estimate: 3 });
    runTaskAdd(dir, env, `Task ${base + 2}`, { estimate: 5 });
    runTaskAdd(dir, env, `Task ${base + 3}`, { estimate: 2 });
    for (const n of [1, 2, 3]) runSprintAdd(dir, env, `KAD-${base + n}`, {});
    runTaskAssign(dir, env, `KAD-${base + 1}`, 'ada@example.com');
    runTaskAssign(dir, env, `KAD-${base + 2}`, 'lin@example.com');
    runTaskMove(dir, env, `KAD-${base + 1}`, 'done');
    runTaskMove(dir, env, `KAD-${base + 2}`, 'in_progress');
    if (i < 2) runSprintClose(dir, env);
  }
}

describe('the catalogue', () => {
  it('offers the burndown, the velocity series and the workload under one verb', () => {
    expect(REPORTS).toContain('burndown');
    expect(REPORTS).toContain('velocity');
    expect(REPORTS).toContain('workload');
  });

  it('lists every report and what each one answers', () => {
    const r = runReport(dir, env, undefined, { list: true }, TODAY);
    expect(r.ok).toBe(true);
    for (const name of REPORTS) expect(r.message).toContain(name);
    const reports = (r.data as { reports: { name: string; answers: string }[] }).reports;
    expect(reports.map((x) => x.name)).toEqual([...REPORTS]);
    for (const entry of reports) expect(entry.answers.length).toBeGreaterThan(10);
  });

  it('lists attention first and groups the sprint and team reports under their own heading', () => {
    const lines = runReport(dir, env, undefined, { list: true }, TODAY).message.split('\n');
    const row = (name: string): number => lines.findIndex((l) => l.trimStart().startsWith(`${name} `));
    const heading = lines.findIndex((l) => /^\s*sprint and team/i.test(l));

    const firstReport = Math.min(...REPORTS.map(row));
    expect(row('attention')).toBe(firstReport);
    expect(heading).toBeGreaterThan(row('flow'));
    expect(heading).toBeGreaterThan(row('cfd'));
    for (const name of ['burndown', 'velocity', 'workload']) expect(row(name)).toBeGreaterThan(heading);
  });

  it('keeps the --json catalogue in its existing shape and order', () => {
    const data = runReport(dir, env, undefined, { list: true }, TODAY).data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(['ok', 'reports', 'schema']);
  });

  it('names the whole catalogue when asked for a report nobody has', () => {
    const r = runReport(dir, env, 'velocities', {}, TODAY);
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
    expect(r.error!.allowed).toEqual([...REPORTS]);
  });
});

describe('report burndown', () => {
  it('is the same numbers as sprint burndown, from the same fold', () => {
    // Two commands with two ideas of what a burndown is would be the drift
    // this exists to prevent.
    threeSprints();
    const viaSprint = runSprintBurndown(dir, env, undefined);
    const viaReport = runReport(dir, env, 'burndown', {}, TODAY);
    expect(viaReport.ok).toBe(true);
    expect((viaReport.data as { burndown: unknown }).burndown).toEqual(
      (viaSprint.data as { burndown: unknown }).burndown,
    );
  });

  it('takes a sprint by name, so a closed one can still be looked at', () => {
    threeSprints();
    const r = runReport(dir, env, 'burndown', { sprint: 'Sprint 1' }, TODAY);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('Sprint 1');
  });

  it('says there is no active sprint rather than guessing at one', () => {
    runTaskAdd(dir, env, 'Loose task', { estimate: 3 });
    const r = runReport(dir, env, 'burndown', {}, TODAY);
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('sprint_not_found');
  });
});

describe('report velocity', () => {
  it('is committed against completed, sprint by sprint', () => {
    threeSprints();
    const r = runReport(dir, env, 'velocity', {}, TODAY);
    expect(r.ok).toBe(true);
    const data = r.data as { rows: { name: string; committed: number; velocity: number }[] };
    expect(data.rows.map((row) => row.name)).toEqual(['Sprint 1', 'Sprint 2']);
    // 3 + 5 + 2 taken in, 3 finished.
    expect(data.rows[0]).toMatchObject({ committed: 10, velocity: 3 });
  });

  it('reports a range, not an average', () => {
    // The same reason `flow` reports percentiles: one number over a handful of
    // sprints hides how much they differ, and that spread is the forecast.
    threeSprints();
    const data = runReport(dir, env, 'velocity', {}, TODAY).data as Record<string, unknown>;
    expect(data).toHaveProperty('median');
    expect(data).toHaveProperty('low');
    expect(data).toHaveProperty('high');
    expect(data).not.toHaveProperty('average');
  });

  it('says how many sprints it took, because a short series is not a forecast', () => {
    threeSprints();
    const r = runReport(dir, env, 'velocity', {}, TODAY);
    expect((r.data as { notes: string[] }).notes.join(' ')).toMatch(/stabilis|four to eight/i);
  });

  it('says plainly when no sprint has closed yet', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    const r = runReport(dir, env, 'velocity', {}, TODAY);
    expect(r.ok).toBe(true);
    expect((r.data as { rows: unknown[] }).rows).toEqual([]);
    expect(r.message).toMatch(/no closed sprint/i);
  });
});

describe('report workload', () => {
  it('counts open work per person, points and all', () => {
    threeSprints();
    const r = runReport(dir, env, 'workload', {}, TODAY);
    expect(r.ok).toBe(true);
    const rows = (r.data as { rows: { assignee: string | null; open: number; openPoints: number }[] }).rows;
    const lin = rows.find((row) => row.assignee === 'lin@example.com')!;
    // Three tasks of 5 points each, all left in progress.
    expect(lin).toMatchObject({ open: 3, openPoints: 15 });
  });

  it('gives unassigned work a row rather than dropping it', () => {
    // Work nobody owns is the thing a workload report exists to surface.
    threeSprints();
    const rows = (runReport(dir, env, 'workload', {}, TODAY).data as {
      rows: { assignee: string | null; open: number }[];
    }).rows;
    expect(rows.some((row) => row.assignee === null && row.open > 0)).toBe(true);
  });

  it('names the boundary it counted in-progress work from', () => {
    threeSprints();
    const r = runReport(dir, env, 'workload', {}, TODAY);
    expect(r.message).toContain('in_progress');
    expect(r.data).toMatchObject({ started: 'in_progress' });
  });
});

describe('every report in the catalogue exports', () => {
  it('writes a page for each one', () => {
    threeSprints();
    for (const name of REPORTS) {
      const r = runReport(dir, env, name, { html: true }, TODAY);
      expect(r.ok, `${name} must export`).toBe(true);
      const path = join(dir, `kadence-${name}.html`);
      expect(existsSync(path), `${name} must write a file`).toBe(true);
      const html = readFileSync(path, 'utf8');
      expect(html.startsWith('<!doctype html>')).toBe(true);
      // The same promise the board export makes, for every page.
      for (const forbidden of [/<script/i, /<link/i, /url\(/i, /https?:/i, /@font-face/i]) {
        expect(html, `${name}: the page must not contain ${forbidden}`).not.toMatch(forbidden);
      }
    }
  });
});
