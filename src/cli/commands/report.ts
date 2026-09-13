import { resolveContext, isContext, loadState, failure, type CommandResult } from './task.js';
import { flowReport, cfdReport, type FlowReport, type CfdReport, type Percentiles } from '../../core/flow.js';
import { attentionReport, describeSignal, type AttentionReport } from '../../core/attention.js';

/**
 * `kadence report <name>` — where a question gets a chart.
 *
 * `stats` is the one-screen answer to "how are we doing"; this is the family
 * of folds behind it. Every report is `--json`, every one is under the 200 ms
 * budget with its own perf case, and every one names the window and the
 * started boundary it used, so a number is never quoted without its terms.
 */

export const REPORTS = ['flow', 'cfd', 'attention'] as const;
export type ReportName = (typeof REPORTS)[number];

export interface ReportOptions {
  /** `30d`, `14`, `90d` — calendar days ending today. */
  since?: string;
  json?: boolean;
}

const DEFAULT_WINDOW_DAYS = 30;

/**
 * `attention` reads `--since` as days of silence, not as a window, and a month
 * of silence is not a signal — it is a post-mortem. Seven days is one sprint
 * week: long enough that a normal pause does not fire, short enough to act on.
 */
const DEFAULT_IDLE_DAYS = 7;

const MAX_WINDOW_DAYS = 730;

export function parseSince(
  value: string | undefined,
  fallback: number = DEFAULT_WINDOW_DAYS,
): number | CommandResult {
  if (value === undefined) return fallback;
  const m = /^(\d+)\s*d?$/i.exec(value.trim());
  const n = m === null ? NaN : Number(m[1]);
  // Two years. The cumulative flow diagram walks every task on every day of
  // the window, so the ceiling is where that stays comfortably inside the
  // budget rather than an arbitrary round number.
  if (!Number.isInteger(n) || n < 1 || n > MAX_WINDOW_DAYS) {
    return failure(2, 'invalid_argument', `--since takes a number of days from 1 to ${MAX_WINDOW_DAYS}, like 30d, got "${value}".`, {
      received: value,
      hint: 'kadence report flow --since 30d',
    });
  }
  return n;
}

function pct(p: Percentiles | null, unit: string): string {
  if (p === null) return 'no data';
  return `p50 ${p.p50} · p85 ${p.p85} · p95 ${p.p95} ${unit}  (n=${p.n})`;
}

export function renderFlow(r: FlowReport): string {
  const lines: string[] = [];
  lines.push(
    `Flow, ${r.window.from} to ${r.window.to} UTC (${r.window.days} calendar days). ` +
      `Work starts at "${r.started}".`,
  );
  lines.push('');
  lines.push(`  In progress now:   ${r.wip}`);
  lines.push(`  Finished:          ${r.finished}`);
  lines.push(`  Cycle time:        ${pct(r.cycleTime, 'days')}`);
  lines.push(`  Lead time:         ${pct(r.leadTime, 'days')}`);
  lines.push(`  Response time:     ${pct(r.responseTime, 'days')}`);
  if (r.blocked.tasks > 0) {
    lines.push(`  Blocked:           ${r.blocked.tasks} task(s), ${r.blocked.days} days in total`);
  }
  if (r.sle !== null) lines.push('', `  ${r.sle}`);

  if (r.perWeek.some((w) => w.finished > 0 || w.created > 0)) {
    lines.push('', '  Week        Created  Finished');
    for (const w of r.perWeek) {
      lines.push(`  ${w.week}  ${String(w.created).padStart(7)}  ${String(w.finished).padStart(8)}`);
    }
  }

  if (r.aging.length > 0) {
    lines.push('', '  Aging work in progress (oldest first):');
    for (const a of r.aging.slice(0, 10)) {
      const flag = a.overP85 ? '  ← older than p85' : '';
      lines.push(`    ${a.label}  ${String(a.ageDays).padStart(5)} d  ${a.status}  ${a.title}${flag}`);
    }
    if (r.aging.length > 10) lines.push(`    … and ${r.aging.length - 10} more`);
  }

  if (r.notes.length > 0) {
    lines.push('');
    for (const n of r.notes) lines.push(`  ${n}`);
  }
  return lines.join('\n');
}

export function renderCfd(r: CfdReport): string {
  const lines: string[] = [];
  lines.push(`Cumulative flow, ${r.window.from} to ${r.window.to} UTC. Tasks per column at the end of each day.`);
  lines.push('');
  const cols = r.statuses;
  const width = Math.max(6, ...cols.map((c) => c.length));
  lines.push(`  ${'date'.padEnd(10)}  ${cols.map((c) => c.padStart(width)).join('  ')}`);
  // Every seventh day, plus the last: a month of rows is a wall, a week is a shape.
  const shown = r.days.filter((_, i) => i % 7 === 0 || i === r.days.length - 1);
  for (const row of shown) {
    lines.push(`  ${row.date}  ${cols.map((c) => String(row.counts[c] ?? 0).padStart(width)).join('  ')}`);
  }
  if (shown.length < r.days.length) {
    lines.push('', `  ${r.days.length} days in the window; one row per week shown. --json carries every day.`);
  }
  return lines.join('\n');
}

export function renderAttention(r: AttentionReport): string {
  const lines: string[] = [];
  lines.push(
    `Attention, as of ${r.asOf} UTC. Work past "${r.started}" that nobody is moving \u2014 ` +
      `silent or ownerless for ${r.threshold} days or more, or blocked by work that is already done.`,
  );

  if (r.rows.length > 0) {
    lines.push('');
    for (const row of r.rows.slice(0, 15)) {
      lines.push(`  ${row.label}  ${String(row.idleDays).padStart(4)} d  ${row.title}`);
      lines.push(`         ${row.signals.map(describeSignal).join(' · ')}`);
    }
    if (r.rows.length > 15) lines.push(`  … and ${r.rows.length - 15} more`);
  }

  if (r.notes.length > 0) {
    lines.push('');
    for (const n of r.notes) lines.push(`  ${n}`);
  }
  return lines.join('\n');
}

export function runReport(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string | undefined,
  options: ReportOptions,
  today: Date = new Date(),
): CommandResult {
  if (name === undefined || !(REPORTS as readonly string[]).includes(name)) {
    return failure(
      2,
      'invalid_argument',
      `Which report?\n  kadence report flow        cycle time, throughput, aging work\n  kadence report cfd         tasks per column, per day\n  kadence report attention   work in flight that nobody is moving`,
      { ...(name === undefined ? {} : { received: name }), allowed: REPORTS, hint: 'kadence report flow' },
    );
  }

  const since = parseSince(options.since, name === 'attention' ? DEFAULT_IDLE_DAYS : DEFAULT_WINDOW_DAYS);
  if (typeof since !== 'number') return since;

  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;
  const { state, warnings } = loadState(ctx.root, ctx.actor);

  if (name === 'attention') {
    const r = attentionReport(state, today, since);
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: renderAttention(r),
      data: { schema: 'kadence/v1', ok: true, report: 'attention', ...r },
    };
  }

  if (name === 'cfd') {
    const r = cfdReport(state, today, since);
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: renderCfd(r),
      data: { schema: 'kadence/v1', ok: true, report: 'cfd', ...r },
    };
  }

  const r = flowReport(state, today, since);
  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: renderFlow(r),
    data: { schema: 'kadence/v1', ok: true, report: 'flow', ...r },
  };
}
