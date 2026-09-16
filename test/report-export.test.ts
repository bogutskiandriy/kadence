import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove, runTaskAssign } from '../src/cli/commands/task.js';
import { runReport } from '../src/cli/commands/report.js';
import { flowHtml, cfdHtml, attentionHtml } from '../src/export/report-html.js';
import type { FlowReport, CfdReport } from '../src/core/flow.js';
import type { AttentionReport } from '../src/core/attention.js';

/**
 * A report as a file.
 *
 * Same experiment as the board export and the same line it must not cross:
 * no process outlives the command, and the page asks the network for nothing.
 * The charts are inline SVG for that reason — a chart library would be a
 * script tag, and a script tag is the thing this cannot have.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const TODAY = new Date('2026-09-30T12:00:00.000Z');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-report-export-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function busyRepo(): void {
  runTaskAdd(dir, env, 'Login form', { estimate: 3, priority: 'high' });
  runTaskAdd(dir, env, 'Signup form', { estimate: 5 });
  runTaskAdd(dir, env, 'Password reset', { estimate: 2 });
  runTaskMove(dir, env, 'KAD-1', 'done');
  runTaskMove(dir, env, 'KAD-2', 'in_progress');
}

/** Everything the flow page draws, without folding a journal to get it. */
function sampleFlow(): FlowReport {
  return {
    window: { from: '2026-09-01', to: '2026-09-30', days: 30 },
    started: 'in_progress',
    unit: 'calendar days',
    wip: 4,
    finished: 11,
    perWeek: [
      { week: '2026-09-07', finished: 2, created: 5 },
      { week: '2026-09-14', finished: 4, created: 3 },
      { week: '2026-09-21', finished: 5, created: 1 },
    ],
    cycleTime: { n: 11, p50: 2, p85: 6, p95: 14 },
    leadTime: { n: 11, p50: 5, p85: 12, p95: 21 },
    responseTime: { n: 11, p50: 1, p85: 3, p95: 8 },
    sle: '85% of finished items took 6 calendar days or less.',
    aging: [
      { label: 'KAD-7', title: 'Payment retry', status: 'in_progress', ageDays: 19, overP85: true },
      { label: 'KAD-9', title: 'Avatar upload', status: 'in_review', ageDays: 3, overP85: false },
    ],
    blocked: { tasks: 1, days: 4 },
    notes: [],
  };
}

function sampleCfd(): CfdReport {
  return {
    window: { from: '2026-09-25', to: '2026-09-30', days: 6 },
    statuses: ['todo', 'in_progress', 'done'],
    days: [
      { date: '2026-09-25', counts: { todo: 5, in_progress: 1, done: 0 } },
      { date: '2026-09-26', counts: { todo: 4, in_progress: 2, done: 0 } },
      { date: '2026-09-27', counts: { todo: 4, in_progress: 1, done: 1 } },
      { date: '2026-09-28', counts: { todo: 3, in_progress: 2, done: 1 } },
      { date: '2026-09-29', counts: { todo: 2, in_progress: 2, done: 2 } },
      { date: '2026-09-30', counts: { todo: 1, in_progress: 2, done: 3 } },
    ],
  };
}

function sampleAttention(): AttentionReport {
  return {
    asOf: '2026-09-30',
    started: 'in_progress',
    threshold: 7,
    rows: [
      {
        label: 'KAD-7',
        title: 'Payment retry',
        status: 'in_progress',
        priority: 'high',
        assignee: null,
        idleDays: 19,
        signals: [{ kind: 'stalled', days: 19 }],
      },
    ],
    notes: [],
  };
}

/**
 * The line the experiment must not cross, asserted structurally: a
 * protocol-relative host, a `url()` in the stylesheet or an `@font-face`
 * would all load at open time and would all pass a check for `https?:`.
 */
function expectsNothingFromTheNetwork(html: string): void {
  for (const forbidden of [
    /<script/i,
    /<link/i,
    /<img/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<video/i,
    /<audio/i,
    /srcset/i,
    /url\(/i,
    /@font-face/i,
    /@import/i,
    /fetch\(|XMLHttpRequest|WebSocket|EventSource/,
    /rel\s*=\s*["'](?:preload|prefetch|dns-prefetch|preconnect)/i,
    /["']\/\/[a-z]/i,
    /https?:/i,
  ]) {
    expect(html, `the page must not contain ${forbidden}`).not.toMatch(forbidden);
  }
}

describe('report --html', () => {
  it('writes one file per report, named after it', () => {
    busyRepo();
    const r = runReport(dir, env, 'flow', { html: true }, TODAY);
    expect(r.ok).toBe(true);
    const path = join(dir, 'kadence-flow.html');
    expect(existsSync(path)).toBe(true);
    expect(r.message).toContain(path);
    // The path is compared by its tail: macOS hands back /private/var for a
    // temporary directory the test knows as /var, and realpath is the command's
    // to resolve, not this assertion's to predict.
    expect(r.data).toMatchObject({ format: 'html', report: 'flow' });
    expect((r.data as { path: string }).path.endsWith('kadence-flow.html')).toBe(true);
  });

  it('exports every report the command offers', () => {
    busyRepo();
    for (const name of ['flow', 'cfd', 'attention']) {
      const r = runReport(dir, env, name, { html: true }, TODAY);
      expect(r.ok, `${name} must export`).toBe(true);
      const html = readFileSync(join(dir, `kadence-${name}.html`), 'utf8');
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain('</html>');
    }
  });

  it('takes a path when given one, and makes the directory', () => {
    busyRepo();
    const r = runReport(dir, env, 'flow', { html: true, file: 'docs/reports/flow.html' }, TODAY);
    expect(r.ok).toBe(true);
    expect(existsSync(join(dir, 'docs', 'reports', 'flow.html'))).toBe(true);
  });

  it('refuses a path outside the repository', () => {
    busyRepo();
    for (const escape of ['../escaped.html', '/tmp/escaped.html', 'docs/../../escaped.html']) {
      const r = runReport(dir, env, 'flow', { html: true, file: escape }, TODAY);
      expect(r.ok, `${escape} must be refused`).toBe(false);
      expect(r.error!.code).toBe('invalid_argument');
      expect(existsSync(join(dir, '..', 'escaped.html'))).toBe(false);
    }
  });

  it('fails rather than throwing when the target is a directory', () => {
    busyRepo();
    mkdirSync(join(dir, 'out'), { recursive: true });
    const r = runReport(dir, env, 'flow', { html: true, file: 'out' }, TODAY);
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('conflicting_state');
  });

  it('reaches the network for nothing at all', () => {
    busyRepo();
    for (const name of ['flow', 'cfd', 'attention']) {
      runReport(dir, env, name, { html: true }, TODAY);
      expectsNothingFromTheNetwork(readFileSync(join(dir, `kadence-${name}.html`), 'utf8'));
    }
  });

  it('escapes anything a person typed', () => {
    runTaskAdd(dir, env, '<script>alert(1)</script> & "quotes"', {});
    runTaskAssign(dir, env, 'KAD-1', '<img src=x onerror=alert(1)>');
    runTaskMove(dir, env, 'KAD-1', 'in_progress');
    runReport(dir, env, 'flow', { html: true }, TODAY);
    const html = readFileSync(join(dir, 'kadence-flow.html'), 'utf8');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('describes the file, not the report, when --json is asked for too', () => {
    // An agent that asked for a file wants the path back. The report body is
    // in the file it just wrote; repeating it in the response would be a
    // second copy that can disagree with the first.
    busyRepo();
    const r = runReport(dir, env, 'flow', { html: true, json: true }, TODAY);
    expect(r.data).toMatchObject({ schema: 'kadence/v1', ok: true, format: 'html', report: 'flow' });
    expect(r.data).not.toHaveProperty('cycleTime');
    expect(typeof (r.data as { bytes?: unknown }).bytes).toBe('number');
  });

  it('still prints the report when no format is asked for', () => {
    busyRepo();
    const r = runReport(dir, env, 'flow', {}, TODAY);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('Cycle time');
    expect(existsSync(join(dir, 'kadence-flow.html'))).toBe(false);
  });
});

describe('the flow page', () => {
  it('names the window, the unit and the started boundary', () => {
    const html = flowHtml(sampleFlow(), TODAY);
    expect(html).toContain('2026-09-01');
    expect(html).toContain('2026-09-30');
    expect(html).toContain('calendar days');
    expect(html).toContain('in_progress');
  });

  it('gives every percentile a number the reader can copy, not only a bar', () => {
    // The chart is the shape; the table is the evidence. A number that exists
    // only as a bar width cannot be pasted into a stand-up note.
    const html = flowHtml(sampleFlow(), TODAY);
    expect(html).toMatch(/<table/);
    for (const n of ['2', '6', '14']) expect(html).toContain(`>${n}<`);
    expect(html).toContain('85% of finished items took 6 calendar days or less.');
  });

  it('draws throughput as one mark per week', () => {
    const html = flowHtml(sampleFlow(), TODAY);
    expect(html).toContain('<svg');
    expect(html).toContain('2026-09-07');
    expect(html).toContain('2026-09-21');
  });

  it('marks the aging work that is past p85', () => {
    const html = flowHtml(sampleFlow(), TODAY);
    expect(html).toContain('KAD-7');
    expect(html).toContain('Payment retry');
    expect(html).toMatch(/over-p85|older than p85/i);
  });

  it('says why a section is empty instead of showing an empty chart', () => {
    const empty: FlowReport = {
      ...sampleFlow(),
      wip: 0,
      finished: 0,
      perWeek: [],
      cycleTime: null,
      leadTime: null,
      responseTime: null,
      sle: null,
      aging: [],
      blocked: { tasks: 0, days: 0 },
      notes: ['Nothing finished in this window.'],
    };
    const html = flowHtml(empty, TODAY);
    expect(html).toContain('Nothing finished in this window.');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
});

describe('the cfd page', () => {
  it('draws one band per column, in board order', () => {
    const html = cfdHtml(sampleCfd(), TODAY);
    expect(html).toContain('<svg');
    expect(html.indexOf('todo')).toBeLessThan(html.indexOf('in_progress'));
  });

  it('names every band in a legend, so colour is never the only channel', () => {
    const html = cfdHtml(sampleCfd(), TODAY);
    for (const status of ['todo', 'in_progress', 'done']) {
      expect(html).toContain(status);
    }
    expect(html).toMatch(/legend/i);
  });

  it('carries every day as a table, not only as a shape', () => {
    const html = cfdHtml(sampleCfd(), TODAY);
    expect(html).toMatch(/<table/);
    expect(html).toContain('2026-09-25');
    expect(html).toContain('2026-09-30');
  });

  it('draws a flat band rather than dividing by zero on an empty window', () => {
    const html = cfdHtml({ window: { from: '2026-09-30', to: '2026-09-30', days: 1 }, statuses: ['todo'], days: [{ date: '2026-09-30', counts: { todo: 0 } }] }, TODAY);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
});

describe('the attention page', () => {
  it('lists every row with its signals', () => {
    const html = attentionHtml(sampleAttention(), TODAY);
    expect(html).toContain('KAD-7');
    expect(html).toContain('Payment retry');
    expect(html).toContain('19');
  });

  it('says the quiet thing when there is nothing to report', () => {
    const html = attentionHtml({ ...sampleAttention(), rows: [], notes: ['Nothing is stuck.'] }, TODAY);
    expect(html).toContain('Nothing is stuck.');
  });
});
