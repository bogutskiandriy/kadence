import { resolveContext, isContext, loadState, failure, type CommandResult } from './task.js';
import { burndownFor } from './sprint.js';
import { renderBurndown } from '../../core/burndown.js';
import { velocitySeries, type VelocitySeries } from '../../core/velocity.js';
import { workloadReport, type WorkloadReport } from '../../core/workload.js';
import { flowReport, cfdReport, type FlowReport, type CfdReport, type Percentiles } from '../../core/flow.js';
import { attentionReport, describeSignal, type AttentionReport } from '../../core/attention.js';
import { flowHtml, cfdHtml, attentionHtml, burndownHtml, velocityHtml, workloadHtml } from '../../export/report-html.js';
import { writeExport } from '../write-export.js';

/**
 * `kadence report <name>` — where a question gets a chart.
 *
 * `stats` is the one-screen answer to "how are we doing"; this is the family
 * of folds behind it. Every report is `--json`, every one is under the 200 ms
 * budget with its own perf case, and every one names the window and the
 * started boundary it used, so a number is never quoted without its terms.
 */

export const REPORTS = ['flow', 'cfd', 'attention', 'burndown', 'velocity', 'workload'] as const;
export type ReportName = (typeof REPORTS)[number];

/**
 * What each one answers, in one line.
 *
 * The last three were folds this codebase already had, reachable only under
 * `sprint` and `stats`. Nothing about them is new except that they are now
 * where someone would look — including an agent reading `schema --json`, which
 * could not find the burndown at all.
 */
export const CATALOGUE: ReadonlyArray<{ name: ReportName; answers: string }> = [
  { name: 'flow', answers: 'How long work takes, how much is in flight, and what is aging.' },
  { name: 'cfd', answers: 'Where work piles up: tasks per column at the end of each day.' },
  { name: 'attention', answers: 'Work in flight that nobody is moving, and why.' },
  { name: 'burndown', answers: 'Whether a sprint is on track against an even burn.' },
  { name: 'velocity', answers: 'Committed against completed, sprint by sprint, as a range.' },
  { name: 'workload', answers: 'Who is carrying what right now, unassigned work included.' },
];

/**
 * How `report --list` reads to a person (T114): `attention` first, because it
 * is the one that names something to act on, and the sprint reports under their
 * own heading, because a team without sprints should not have to read past
 * them. The `--json` catalogue keeps `REPORTS` order — agents depend on it.
 */
const LIST_ORDER: { team: ReportName[]; sprint: ReportName[] } = {
  team: ['attention', 'flow', 'cfd'],
  sprint: ['burndown', 'velocity', 'workload'],
};

function listLine(name: ReportName): string {
  const entry = CATALOGUE.find((r) => r.name === name)!;
  return `  ${entry.name.padEnd(10)} ${entry.answers}`;
}

/** The three the window means something for. */
const WINDOWED: ReadonlyArray<string> = ['flow', 'cfd', 'attention'];

export interface ReportOptions {
  /** `30d`, `14`, `90d` — calendar days ending today. */
  since?: string;
  json?: boolean;
  /** Name the catalogue instead of running anything. */
  list?: boolean;
  /** `burndown` only: a sprint by name, rather than the active one. */
  sprint?: string;
  /** Write the report as one self-contained page instead of printing it. */
  html?: boolean;
  /** Where to write it; `kadence-<report>.html` next to the repository root by default. */
  file?: string;
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

export function renderVelocity(v: VelocitySeries): string {
  const lines: string[] = [];
  lines.push('Velocity, oldest first. Points taken into a sprint against points finished.');
  if (v.rows.length === 0) {
    lines.push('', '  No closed sprint yet.');
    for (const note of v.notes) lines.push(`  ${note}`);
    return lines.join('\n');
  }

  lines.push('');
  const width = Math.max(8, ...v.rows.map((r) => r.name.length));
  lines.push(`  ${'Sprint'.padEnd(width)}  Committed  Finished  Carried`);
  for (const row of v.rows) {
    lines.push(
      `  ${row.name.padEnd(width)}  ${String(row.committed).padStart(9)}  ` +
        `${String(row.velocity).padStart(8)}  ${String(row.carriedOver).padStart(7)}`,
    );
  }
  // A range, not an average: the spread between sprints is the forecast, and
  // one number cannot tell a steady team from an erratic one.
  lines.push('', `  Finished: ${v.low} to ${v.high} points, median ${v.median}, over ${v.rows.length} sprint(s).`);
  for (const note of v.notes) lines.push(`  ${note}`);
  return lines.join('\n');
}

export function renderWorkload(w: WorkloadReport): string {
  const lines: string[] = [];
  lines.push(
    `Open work by owner, as of ${w.asOf} UTC. Work counts as in progress at "${w.started}".`,
  );
  if (w.rows.length === 0) {
    lines.push('', '  Nothing open.');
    return lines.join('\n');
  }

  lines.push('');
  const label = (who: string | null): string => who ?? '(unassigned)';
  const width = Math.max(10, ...w.rows.map((r) => label(r.assignee).length));
  lines.push(`  ${'Owner'.padEnd(width)}  Open  Points  Doing  Blocked`);
  for (const row of w.rows) {
    lines.push(
      `  ${label(row.assignee).padEnd(width)}  ${String(row.open).padStart(4)}  ` +
        `${String(row.openPoints).padStart(6)}  ${String(row.inProgress).padStart(5)}  ` +
        `${String(row.blocked).padStart(7)}`,
    );
  }
  if (w.notes.length > 0) lines.push('');
  for (const note of w.notes) lines.push(`  ${note}`);
  return lines.join('\n');
}

export function runReport(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string | undefined,
  options: ReportOptions,
  today: Date = new Date(),
): CommandResult {
  // The catalogue is not data, so it answers outside a repository too.
  if (options.list === true) {
    return {
      ok: true,
      exitCode: 0,
      warnings: [],
      message: [
        'Reports, each a fold over the journal:',
        '',
        ...LIST_ORDER.team.map(listLine),
        '',
        'Sprint and team:',
        ...LIST_ORDER.sprint.map(listLine),
        '',
        'Each takes --json, and --html to write it as a page with charts.',
        '  kadence report flow --html',
      ].join('\n'),
      data: { schema: 'kadence/v1', ok: true, reports: CATALOGUE },
    };
  }

  if (name === undefined || !(REPORTS as readonly string[]).includes(name)) {
    return failure(
      2,
      'invalid_argument',
      ['Which report?', ...CATALOGUE.map((r) => `  kadence report ${r.name.padEnd(10)} ${r.answers}`)].join('\n'),
      { ...(name === undefined ? {} : { received: name }), allowed: REPORTS, hint: 'kadence report flow' },
    );
  }

  // A window that changes nothing is a number quoted without its terms, which
  // is the one thing every report here is written to avoid. Say so instead.
  if (options.since !== undefined && !WINDOWED.includes(name)) {
    return failure(
      2,
      'invalid_argument',
      `--since is a window, and ${name} does not have one.\nIt applies to ${WINDOWED.join(', ')}.`,
      { received: options.since, allowed: WINDOWED, hint: `kadence report ${name}` },
    );
  }
  if (options.sprint !== undefined && name !== 'burndown') {
    return failure(2, 'invalid_argument', `--sprint applies to burndown, not to ${name}.`, {
      received: options.sprint,
      hint: 'kadence report burndown --sprint "Sprint 3"',
    });
  }

  const since = parseSince(options.since, name === 'attention' ? DEFAULT_IDLE_DAYS : DEFAULT_WINDOW_DAYS);
  if (typeof since !== 'number') return since;

  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;
  const { state, warnings } = loadState(ctx.root, ctx.actor);

  /** What every branch below produces: the payload, the text, and the page. */
  interface Rendered {
    data: object;
    message: string;
    html: () => string;
  }

  let rendered: Rendered;
  if (name === 'attention') {
    const r = attentionReport(state, today, since);
    rendered = { data: r, message: renderAttention(r), html: () => attentionHtml(r, today) };
  } else if (name === 'cfd') {
    const r = cfdReport(state, today, since);
    rendered = { data: r, message: renderCfd(r), html: () => cfdHtml(r, today) };
  } else if (name === 'burndown') {
    const resolved = burndownFor(ctx.root, state, options.sprint);
    if ('exitCode' in resolved) return resolved;
    const { sprint, chart } = resolved;
    if (chart === null) {
      return {
        ok: true,
        exitCode: 0,
        warnings,
        message: `"${sprint.name}" has no tasks yet.\n  kadence sprint add KAD-1`,
        data: { schema: 'kadence/v1', ok: true, report: name, burndown: null },
      };
    }
    rendered = {
      // The same key `sprint burndown` answers with, from the same fold: two
      // shapes for one chart would be two things to keep in step.
      data: { burndown: chart },
      message: renderBurndown(chart),
      html: () => burndownHtml(chart, today),
    };
  } else if (name === 'velocity') {
    const r = velocitySeries(state);
    rendered = { data: r, message: renderVelocity(r), html: () => velocityHtml(r, today) };
  } else if (name === 'workload') {
    const r = workloadReport(state, today);
    rendered = { data: r, message: renderWorkload(r), html: () => workloadHtml(r, today) };
  } else {
    const r = flowReport(state, today, since);
    rendered = { data: r, message: renderFlow(r), html: () => flowHtml(r, today) };
  }

  if (options.html === true) {
    const written = writeExport(
      ctx.root,
      options.file,
      `kadence-${name}.html`,
      rendered.html(),
      `kadence report ${name} --html --file docs/${name}.html`,
    );
    if ('exitCode' in written) return written;
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message:
        `Wrote ${written.path}.\n` +
        'Open it from disk — there is no server, and the page makes no requests.',
      // The path, not the report: the numbers are in the file this just wrote,
      // and a second copy in the response is a copy that can disagree with it.
      data: {
        schema: 'kadence/v1',
        ok: true,
        report: name,
        format: 'html',
        path: written.path,
        bytes: written.bytes,
      },
    };
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: rendered.message,
    data: { schema: 'kadence/v1', ok: true, report: name, ...rendered.data },
  };
}
