import type { FlowReport, CfdReport, Percentiles, TimeInStatusReport } from '../core/flow.js';
import { type AttentionReport, describeSignal } from '../core/attention.js';
import { esc, page, BASE_STYLE, VIZ_STYLE } from './page.js';
import { columnsChart, stackedAreaChart, barsChart, percentileStrips, lineChart, type Series } from './svg.js';
import type { Burndown } from '../core/burndown.js';
import type { Burnup } from '../core/burnup.js';
import type { VelocitySeries } from '../core/velocity.js';
import type { WorkloadReport } from '../core/workload.js';
import type { SprintReview, DailyScrum } from '../core/scrum.js';
import type { Timeline, TimelineBar, Span, Scale } from '../core/timeline.js';
import type { Calendar } from '../core/calendar.js';

/**
 * A report as a page.
 *
 * The same numbers `kadence report` prints, in the shape a chart makes
 * readable — and under the same rules the text form obeys: percentiles rather
 * than means, calendar days said out loud, and the started boundary named on
 * every page, because a cycle time without the column it was measured from is
 * a number nobody can check.
 *
 * Every chart is followed by the rows it was drawn from. That is not a
 * courtesy: three of the eight categorical colours sit below 3:1 against a
 * white background, and the rule that buys them is that colour is never the
 * only channel. The table is also the part a reader can paste into a
 * stand-up note.
 */

/** The eight validated slots, in fixed order. Never cycled past the eighth. */
const SLOTS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'] as const;

function stamp(lines: readonly string[], command: string): string {
  return (
    `<p class="stamp">${lines.map(esc).join(' ')} ` +
    `A file, not a page: nothing here is live, and regenerating it is <code>${esc(command)}</code>.</p>`
  );
}

function tile(label: string, value: string, sub: string, critical = false): string {
  return (
    `<div class="tile${critical ? ' critical' : ''}"><div class="label">${esc(label)}</div>` +
    `<div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`
  );
}

function legend(items: readonly { name: string; color: string }[]): string {
  return (
    '<div class="legend">' +
    items
      .map((i) => `<span><i style="background:var(${i.color})"></i>${esc(i.name)}</span>`)
      .join('') +
    '</div>'
  );
}

function figure(chart: string, caption: string): string {
  return `<figure class="figure">${chart}<figcaption>${esc(caption)}</figcaption></figure>`;
}

/** Where the time went, column by column, and how much of it was blocked (KAD-16). */
export function timeInStatusHtml(r: TimeInStatusReport, generatedAt: Date = new Date()): string {
  const body: string[] = [];
  body.push('<h1>Time in status</h1>');
  body.push(
    stamp(
      [
        `The last ${r.window.days} days, ${r.window.from} to ${r.window.to}, in ${r.unit}. Work counts as started at “${esc(r.started)}”.`,
        'A visit to a column counts when it ended inside the window.',
        `Generated ${utcStamp(generatedAt)}.`,
      ],
      'kadence report flow --by-status --html',
    ),
  );
  body.push(
    '<div class="tiles">',
    r.flowEfficiency === null
      ? tile('Flow efficiency', '–', 'nothing finished in the window')
      : tile('Flow efficiency', `${r.flowEfficiency.percent}%`, `of start-to-done not spent blocked, ${r.flowEfficiency.tasks} task(s)`),
    '</div>',
  );
  body.push(
    table(
      [{ head: 'Status' }, { head: 'Phase' }, { head: 'Visits', num: true }, { head: 'p50 days', num: true }, { head: 'p85 days', num: true }],
      r.statuses.map(
        (s) =>
          `<tr><td>${esc(s.status)}</td><td>${s.phase}</td><td class="num">${s.visits?.n ?? 0}</td>` +
          `<td class="num">${s.visits === null ? '–' : s.visits.p50}</td><td class="num">${s.visits === null ? '–' : s.visits.p85}</td></tr>`,
      ),
    ),
  );
  for (const n of r.notes) body.push(`<p class="empty">${esc(n)}</p>`);
  body.push(footer(`${r.statuses.length} columns.`));
  return page('kadence time in status', BASE_STYLE + VIZ_STYLE, body);
}

/**
 * Burnup: scope and done as two lines, so a missed goal and a goal that grew
 * do not look alike (KAD-15).
 */
export function burnupHtml(b: Burnup, generatedAt: Date = new Date()): string {
  const body: string[] = [];
  body.push('<h1>Burnup</h1>');
  const grew =
    b.scopeAdded > 0
      ? `The goal grew by ${b.scopeAdded} point(s) after the start.`
      : b.scopeAdded < 0
        ? `The goal shrank by ${-b.scopeAdded} point(s) after the start.`
        : 'The goal did not change after the start.';
  body.push(
    stamp(
      [
        `${esc(b.sprintName)}: ${b.scopeAtStart} points at the start, ${b.scopeNow} now. ${grew}`,
        b.finalDone === null
          ? 'The sprint is still open, so the last day is today rather than the end.'
          : `Closed with ${b.finalDone} of ${b.scopeNow} points done.`,
        `Generated ${utcStamp(generatedAt)}.`,
      ],
      'kadence report burnup --html',
    ),
  );

  if (b.days.length === 0 || b.scopeNow + b.scopeAtStart === 0) {
    body.push('<p class="empty">Nothing to chart: no task in this sprint carries an estimate.</p>');
    body.push(footer(`${b.sprintName}, ${b.days.length} days.`));
    return page('kadence burnup', BASE_STYLE + VIZ_STYLE, body);
  }

  const last = b.days[b.days.length - 1]!;
  body.push(
    '<div class="tiles">',
    tile('Scope at the start', String(b.scopeAtStart), 'points in the sprint on day one'),
    tile('Scope now', String(b.scopeNow), b.scopeAdded === 0 ? 'unchanged' : `${b.scopeAdded > 0 ? '+' : '−'}${Math.abs(b.scopeAdded)} since the start`, b.scopeAdded > 0),
    tile('Done', String(last.done), `of ${last.scope}, on ${last.date}`),
    '</div>',
  );
  body.push(legend([{ name: 'Scope', color: '--muted' }, { name: 'Done', color: '--s1' }]));
  body.push(
    figure(
      lineChart({
        labels: b.days.map((d) => d.date),
        series: [
          { name: 'Scope', color: '--muted', values: b.days.map((d) => d.scope), reference: true },
          { name: 'Done', color: '--s1', values: b.days.map((d) => d.done) },
        ],
        unit: 'points',
      }),
      'Points in the sprint and points done at the end of each day. Scope goes down only when a task is cancelled or moved to another sprint: the journal has no event for taking a task out of a sprint.',
    ),
  );
  body.push(
    '<details><summary>Every day as rows</summary>',
    table(
      [{ head: 'Date' }, { head: 'Scope', num: true }, { head: 'Done', num: true }],
      b.days.map((d) => `<tr><td>${esc(d.date)}</td><td class="num">${d.scope}</td><td class="num">${d.done}</td></tr>`),
    ),
    '</details>',
  );
  body.push(footer(`${b.sprintName}, ${b.days.length} days.`));
  return page('kadence burnup', BASE_STYLE + VIZ_STYLE, body);
}

/** A column is numeric or it is not; the header has to agree with the cells. */
interface Column {
  head: string;
  num?: boolean;
}

function table(columns: readonly Column[], rows: readonly string[]): string {
  const head = columns
    .map((c) => `<th${c.num === true ? ' class="num"' : ''}>${esc(c.head)}</th>`)
    .join('');
  return `<div class="rows"><table><tr>${head}</tr>${rows.join('')}</table></div>`;
}

function notesOf(notes: readonly string[]): string {
  if (notes.length === 0) return '';
  return notes.map((note) => `<p class="empty">${esc(note)}</p>`).join('');
}

function footer(extra: string): string {
  return `<footer>${esc(extra)} Folded from the event journal by kadence. No server, no network.</footer>`;
}

function utcStamp(at: Date): string {
  return `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function flowHtml(r: FlowReport, generatedAt: Date = new Date()): string {
  const body: string[] = [];
  body.push('<h1>Flow</h1>');
  body.push(
    stamp(
      [
        `${r.window.from} to ${r.window.to} UTC, ${r.window.days} calendar days.`,
        `Work counts as started at "${r.started}".`,
        `Generated ${utcStamp(generatedAt)}.`,
      ],
      'kadence report flow --html',
    ),
  );

  const p85 = r.cycleTime === null ? '—' : String(r.cycleTime.p85);
  body.push(
    '<div class="tiles">',
    tile('In progress now', String(r.wip), 'tasks past the started boundary'),
    tile('Finished', String(r.finished), `in ${r.window.days} calendar days`),
    tile('Cycle time p85', p85, r.cycleTime === null ? 'nothing finished yet' : `calendar days, n=${r.cycleTime.n}`),
    tile(
      'Blocked',
      String(r.blocked.days),
      r.blocked.tasks === 0 ? 'no blocked time in the window' : `days across ${r.blocked.tasks} task(s)`,
      r.blocked.tasks > 0,
    ),
    '</div>',
  );

  if (r.sle !== null) body.push(`<p class="callout">${esc(r.sle)}</p>`);

  // How long work takes.
  const measures: { name: string; p: Percentiles | null }[] = [
    { name: 'Cycle time', p: r.cycleTime },
    { name: 'Lead time', p: r.leadTime },
    { name: 'Response time', p: r.responseTime },
  ];
  const measured = measures.filter((m): m is { name: string; p: Percentiles } => m.p !== null);
  body.push('<h2>How long work takes</h2>');
  if (measured.length === 0) {
    body.push('<p class="empty">Nothing has finished in this window, so there is nothing to measure.</p>');
  } else {
    body.push(
      figure(
        percentileStrips(
          measured.map((m) => ({ name: m.name, p50: m.p.p50, p85: m.p.p85, p95: m.p.p95, n: m.p.n })),
          'calendar days',
        ),
        'p50, p85 and p95 in calendar days. Percentiles, never a mean — the tail is the part worth managing.',
      ),
    );
    body.push(
      table(
        [
          { head: 'Measure' },
          { head: 'p50', num: true },
          { head: 'p85', num: true },
          { head: 'p95', num: true },
          { head: 'n', num: true },
        ],
        measured.map(
          (m) =>
            `<tr><td>${esc(m.name)}</td><td class="num">${m.p.p50}</td><td class="num">${m.p.p85}</td>` +
            `<td class="num">${m.p.p95}</td><td class="num">${m.p.n}</td></tr>`,
        ),
      ),
    );
  }

  // Created and finished.
  body.push('<h2>Created and finished, per week</h2>');
  if (r.perWeek.length === 0) {
    body.push('<p class="empty">No weeks in this window carry either.</p>');
  } else {
    const series: Series[] = [
      { name: 'Created', color: '--s2', values: r.perWeek.map((w) => w.created) },
      { name: 'Finished', color: '--s1', values: r.perWeek.map((w) => w.finished) },
    ];
    body.push(legend(series.map((s) => ({ name: s.name, color: s.color }))));
    body.push(
      figure(
        columnsChart({ labels: r.perWeek.map((w) => w.week), series, unit: 'tasks' }),
        'One band per week, labelled by its Monday. More created than finished, week after week, is a queue growing.',
      ),
    );
    body.push(
      '<details><summary>Every week as rows</summary>',
      table(
        [{ head: 'Week of' }, { head: 'Created', num: true }, { head: 'Finished', num: true }],
        r.perWeek.map(
          (w) =>
            `<tr><td>${esc(w.week)}</td><td class="num">${w.created}</td><td class="num">${w.finished}</td></tr>`,
        ),
      ),
      '</details>',
    );
  }

  // Aging work in progress.
  body.push('<h2>Aging work in progress</h2>');
  if (r.aging.length === 0) {
    body.push('<p class="empty">Nothing is in progress.</p>');
  } else {
    const shown = r.aging.slice(0, 15);
    body.push(
      figure(
        barsChart({
          rows: shown.map((a) => ({
            name: a.label,
            value: a.ageDays,
            critical: a.overP85,
            note: `${a.status} · ${a.title}`,
          })),
          unit: 'calendar days',
          ...(r.cycleTime === null ? {} : { reference: { value: r.cycleTime.p85, label: `p85 = ${r.cycleTime.p85} d` } }),
        }),
        r.cycleTime === null
          ? 'Age in calendar days, oldest first.'
          : `Age in calendar days, oldest first. The line is the p85 cycle time: work to its right has already taken longer than 85% of what finished.`,
      ),
    );
    body.push(
      table(
        [{ head: 'Task' }, { head: 'Age', num: true }, { head: 'Status' }, { head: 'Title' }],
        shown.map(
          (a) =>
            `<tr class="${a.overP85 ? 'critical' : ''}"><td>${esc(a.label)}</td><td class="num">${a.ageDays}</td>` +
            `<td>${esc(a.status)}</td><td>${esc(a.title)}` +
            `${a.overP85 ? ' <span class="pill danger">older than p85</span>' : ''}</td></tr>`,
        ),
      ),
    );
    if (r.aging.length > shown.length) {
      body.push(`<p class="empty">… and ${r.aging.length - shown.length} more. The --json response carries every row.</p>`);
    }
  }

  body.push(notesOf(r.notes));
  body.push(footer(`${r.finished} finished, ${r.wip} in progress.`));
  return page('kadence flow', BASE_STYLE + VIZ_STYLE, body);
}

export function cfdHtml(r: CfdReport, generatedAt: Date = new Date()): string {
  const body: string[] = [];
  body.push('<h1>Cumulative flow</h1>');
  body.push(
    stamp(
      [
        `${r.window.from} to ${r.window.to} UTC, ${r.window.days} calendar days.`,
        'Tasks per column at the end of each day.',
        `Generated ${utcStamp(generatedAt)}.`,
      ],
      'kadence report cfd --html',
    ),
  );

  if (r.statuses.length === 0 || r.days.length === 0) {
    body.push('<p class="empty">No columns to draw yet.</p>');
    body.push(footer('Nothing in the window.'));
    return page('kadence cumulative flow', BASE_STYLE + VIZ_STYLE, body);
  }

  // Past the eighth column a ninth colour would be indistinguishable from one
  // already on the page, so the tail folds into one band and says so.
  const named = r.statuses.slice(0, SLOTS.length);
  const rest = r.statuses.slice(SLOTS.length);
  const bands: Series[] = named.map((status, i) => ({
    name: status,
    color: SLOTS[i]!,
    values: r.days.map((d) => d.counts[status] ?? 0),
  }));
  if (rest.length > 0) {
    bands.push({
      name: `Other (${rest.length} columns)`,
      color: SLOTS[SLOTS.length - 1]!,
      values: r.days.map((d) => rest.reduce((sum, s) => sum + (d.counts[s] ?? 0), 0)),
    });
  }

  body.push(legend(bands.map((b) => ({ name: b.name, color: b.color }))));
  body.push(
    figure(
      stackedAreaChart({ dates: r.days.map((d) => d.date), bands }),
      'Bands stack in board order, finished work at the baseline. A band that widens is a queue; the height between two lines is the work sitting in that column.',
    ),
  );

  const header: Column[] = [{ head: 'Date' }, ...bands.map((b) => ({ head: b.name, num: true }))];
  body.push(
    '<details><summary>Every day as rows</summary>',
    table(
      header,
      r.days.map((d) => {
        const cells = named.map((s) => `<td class="num">${d.counts[s] ?? 0}</td>`).join('');
        const other =
          rest.length === 0
            ? ''
            : `<td class="num">${rest.reduce((sum, s) => sum + (d.counts[s] ?? 0), 0)}</td>`;
        return `<tr><td>${esc(d.date)}</td>${cells}${other}</tr>`;
      }),
    ),
    '</details>',
  );

  body.push(footer(`${r.days.length} days, ${r.statuses.length} columns.`));
  return page('kadence cumulative flow', BASE_STYLE + VIZ_STYLE, body);
}

export function attentionHtml(r: AttentionReport, generatedAt: Date = new Date()): string {
  const body: string[] = [];
  body.push('<h1>Attention</h1>');
  body.push(
    stamp(
      [
        `As of ${r.asOf} UTC.`,
        `Work past "${r.started}" that nobody is moving — silent or ownerless for ${r.threshold} days or more, or blocked by work that is already done.`,
        `Generated ${utcStamp(generatedAt)}.`,
      ],
      'kadence report attention --html',
    ),
  );

  body.push(
    '<div class="tiles">',
    tile(
      'Needs attention',
      String(r.rows.length),
      r.rows.length === 0 ? 'nothing is stuck' : `of the work in flight`,
      r.rows.length > 0,
    ),
    tile('Threshold', `${r.threshold} d`, 'silence before a task counts as stalled'),
    '</div>',
  );

  if (r.rows.length === 0) {
    body.push('<p class="empty">Nothing is stalled, unowned, claimed and forgotten, or waiting on work that is already done.</p>');
  } else {
    const shown = r.rows.slice(0, 20);
    body.push(
      figure(
        barsChart({
          rows: shown.map((row) => ({
            name: row.label,
            value: row.idleDays,
            critical: row.idleDays >= r.threshold * 2,
            note: `${row.status} · ${row.title}`,
          })),
          unit: 'days of silence',
          reference: { value: r.threshold, label: `${r.threshold} d` },
        }),
        `Days since the task last moved. The line is the ${r.threshold}-day threshold; everything here is already past it, and a bar turns critical past twice it.`,
      ),
    );
    body.push(
      table(
        [{ head: 'Task' }, { head: 'Idle', num: true }, { head: 'Status' }, { head: 'Why it is here' }],
        shown.map(
          (row) =>
            `<tr class="${row.idleDays >= r.threshold * 2 ? 'critical' : ''}"><td>${esc(row.label)}</td>` +
            `<td class="num">${row.idleDays}</td><td>${esc(row.status)}</td>` +
            `<td>${esc(row.title)}<div class="sub">${esc(row.signals.map(describeSignal).join(' · '))}</div></td></tr>`,
        ),
      ),
    );
    if (r.rows.length > shown.length) {
      body.push(`<p class="empty">… and ${r.rows.length - shown.length} more. The --json response carries every row.</p>`);
    }
  }

  body.push(notesOf(r.notes));
  body.push(footer(`${r.rows.length} needing attention.`));
  return page('kadence attention', BASE_STYLE + VIZ_STYLE, body);
}

export function burndownHtml(b: Burndown, generatedAt: Date = new Date()): string {
  const body: string[] = [];
  body.push('<h1>Burndown</h1>');
  body.push(
    stamp(
      [
        `${esc(b.sprintName)}: ${b.committed} points committed.`,
        b.finalRemaining === null
          ? 'The sprint is still open, so the last day is today rather than the end.'
          : `Closed with ${b.finalRemaining} point(s) unfinished.`,
        `Generated ${utcStamp(generatedAt)}.`,
      ],
      'kadence report burndown --html',
    ),
  );

  if (b.committed === 0 || b.days.length === 0) {
    body.push('<p class="empty">Nothing to burn down: no task in this sprint carries an estimate.</p>');
    body.push(footer(`${b.sprintName}, ${b.days.length} days.`));
    return page('kadence burndown', BASE_STYLE + VIZ_STYLE, body);
  }

  const last = b.days[b.days.length - 1]!;
  const ahead = last.remaining <= last.ideal;
  body.push(
    '<div class="tiles">',
    tile('Committed', String(b.committed), 'points taken into the sprint'),
    tile('Remaining', String(last.remaining), `of ${b.committed}, on ${last.date}`, !ahead),
    tile(
      'Against the ideal',
      `${ahead ? '−' : '+'}${Math.abs(Math.round(last.remaining - last.ideal))}`,
      ahead ? 'points ahead of an even burn' : 'points behind an even burn',
      !ahead,
    ),
    '</div>',
  );

  body.push(
    legend([
      { name: 'Remaining', color: '--s1' },
      { name: 'An even burn', color: '--muted' },
    ]),
  );
  body.push(
    figure(
      lineChart({
        labels: b.days.map((d) => d.date),
        series: [
          { name: 'An even burn', color: '--muted', values: b.days.map((d) => Math.round(d.ideal * 10) / 10), reference: true },
          { name: 'Remaining', color: '--s1', values: b.days.map((d) => d.remaining) },
        ],
        unit: 'points',
      }),
      'Points still open at the end of each day. The muted line is where a perfectly even burn would have been — an expectation, not a measurement.',
    ),
  );

  body.push(
    '<details><summary>Every day as rows</summary>',
    table(
      [
        { head: 'Date' },
        { head: 'Remaining', num: true },
        { head: 'Even burn', num: true },
        { head: 'Finished that day', num: true },
      ],
      b.days.map(
        (d) =>
          `<tr><td>${esc(d.date)}</td><td class="num">${d.remaining}</td>` +
          `<td class="num">${Math.round(d.ideal * 10) / 10}</td><td class="num">${d.completed}</td></tr>`,
      ),
    ),
    '</details>',
  );

  body.push(footer(`${b.sprintName}, ${b.days.length} days, ${b.committed} points.`));
  return page('kadence burndown', BASE_STYLE + VIZ_STYLE, body);
}

export function velocityHtml(v: VelocitySeries, generatedAt: Date = new Date()): string {
  const body: string[] = [];
  body.push('<h1>Velocity</h1>');
  body.push(
    stamp(
      [
        'Points taken into a sprint against points finished, oldest first.',
        `Generated ${utcStamp(generatedAt)}.`,
      ],
      'kadence report velocity --html',
    ),
  );

  if (v.rows.length === 0) {
    body.push('<p class="empty">No closed sprint yet. Velocity is what a finished sprint leaves behind.</p>');
    body.push(notesOf(v.notes));
    body.push(footer('No sprints closed.'));
    return page('kadence velocity', BASE_STYLE + VIZ_STYLE, body);
  }

  body.push(
    '<div class="tiles">',
    // A range rather than an average, for the reason `flow` reports
    // percentiles: the spread between sprints is the forecast.
    tile('Finished', `${v.low}–${v.high}`, `points per sprint, median ${v.median}`),
    tile('Sprints', String(v.rows.length), 'closed and counted'),
    '</div>',
  );

  const series: Series[] = [
    { name: 'Committed', color: '--s2', values: v.rows.map((r) => r.committed) },
    { name: 'Finished', color: '--s1', values: v.rows.map((r) => r.velocity) },
  ];
  body.push(legend(series.map((s) => ({ name: s.name, color: s.color }))));
  body.push(
    figure(
      columnsChart({ labels: v.rows.map((r) => r.name), series, unit: 'points' }),
      'A committed column taller than its finished one, sprint after sprint, is a team taking in more than it can deliver — not a team that is slow.',
    ),
  );

  body.push(
    table(
      [
        { head: 'Sprint' },
        { head: 'Committed', num: true },
        { head: 'Finished', num: true },
        { head: 'Carried over', num: true },
      ],
      v.rows.map(
        (r) =>
          `<tr><td>${esc(r.name)}</td><td class="num">${r.committed}</td>` +
          `<td class="num">${r.velocity}</td><td class="num">${r.carriedOver}</td></tr>`,
      ),
    ),
  );

  body.push(notesOf(v.notes));
  body.push(footer(`${v.rows.length} closed sprint(s).`));
  return page('kadence velocity', BASE_STYLE + VIZ_STYLE, body);
}

export function workloadHtml(w: WorkloadReport, generatedAt: Date = new Date()): string {
  const body: string[] = [];
  body.push('<h1>Workload</h1>');
  body.push(
    stamp(
      [
        `Open work by owner, as of ${w.asOf} UTC.`,
        `Work counts as in progress at "${w.started}".`,
        `Generated ${utcStamp(generatedAt)}.`,
      ],
      'kadence report workload --html',
    ),
  );

  if (w.rows.length === 0) {
    body.push('<p class="empty">Nothing open.</p>');
    body.push(footer('Nothing open.'));
    return page('kadence workload', BASE_STYLE + VIZ_STYLE, body);
  }

  const name = (who: string | null): string => (who === null ? 'unassigned' : (who.split('@')[0] ?? who));
  const totalPoints = w.rows.reduce((sum, r) => sum + r.openPoints, 0);
  const unowned = w.rows.find((r) => r.assignee === null);
  body.push(
    '<div class="tiles">',
    tile('Open points', String(totalPoints), `across ${w.rows.length} owner(s)`),
    tile(
      'Unassigned',
      String(unowned?.openPoints ?? 0),
      unowned === undefined ? 'everything has an owner' : `points over ${unowned.open} task(s)`,
      unowned !== undefined && unowned.openPoints > totalPoints / 2,
    ),
    '</div>',
  );

  body.push(
    figure(
      barsChart({
        rows: w.rows.map((r) => ({
          name: name(r.assignee),
          value: r.openPoints,
          critical: r.assignee === null,
          note: `${r.open} open, ${r.inProgress} in progress${r.blocked > 0 ? `, ${r.blocked} blocked` : ''}`,
        })),
        unit: 'open points',
      }),
      'Open points per owner. The unassigned row is drawn in the critical colour and named in the table: work nobody owns is what this report exists to surface.',
    ),
  );

  body.push(
    table(
      [
        { head: 'Owner' },
        { head: 'Open', num: true },
        { head: 'Points', num: true },
        { head: 'In progress', num: true },
        { head: 'Blocked', num: true },
      ],
      w.rows.map(
        (r) =>
          `<tr class="${r.assignee === null ? 'critical' : ''}">` +
          `<td>${esc(r.assignee ?? '(unassigned)')}</td><td class="num">${r.open}</td>` +
          `<td class="num">${r.openPoints}</td><td class="num">${r.inProgress}</td>` +
          `<td class="num">${r.blocked}</td></tr>`,
      ),
    ),
  );

  body.push(notesOf(w.notes));
  body.push(footer(`${totalPoints} open points.`));
  return page('kadence workload', BASE_STYLE + VIZ_STYLE, body);
}

/** The Sprint Review as a page: what a stakeholder reads instead of attending. */
export function reviewHtml(r: SprintReview, generatedAt: Date = new Date()): string {
  const body: string[] = [];
  body.push(`<h1>Sprint Review — ${esc(r.sprint)}</h1>`);
  body.push(
    stamp(
      [
        r.goal === null ? 'No Sprint Goal was set.' : `Sprint Goal: ${r.goal}.`,
        ...(r.productGoal === null ? [] : [`Product Goal: ${r.productGoal.text}.`]),
        `Generated ${utcStamp(generatedAt)}.`,
      ],
      'kadence report review --html',
    ),
  );
  body.push(
    '<div class="tiles">',
    tile('Finished', `${r.velocity} / ${r.committed}`, 'points done of points taken in'),
    tile('Not done', String(r.notDone.length), 'task(s) carried or left', r.notDone.length > r.done.length),
    ...(r.scopeAdded === null ? [] : [tile('Scope change', String(r.scopeAdded), 'points after the start')]),
    '</div>',
  );
  const rows = (tasks: readonly { label: string; title: string; estimate: number | null; status?: string }[]): string[] =>
    tasks.map(
      (t) =>
        `<tr><td>${esc(t.label)}</td><td>${esc(t.title)}</td><td>${esc(t.status ?? 'done')}</td>` +
        `<td class="num">${t.estimate ?? ''}</td></tr>`,
    );
  const cols = [{ head: 'Task' }, { head: 'Title' }, { head: 'Status' }, { head: 'Points', num: true }];
  body.push('<h2>Done</h2>', r.done.length === 0 ? '<p class="empty">Nothing finished.</p>' : table(cols, rows(r.done)));
  if (r.notDone.length > 0) body.push('<h2>Not done</h2>', table(cols, rows(r.notDone)));
  if (r.decisions.length > 0) {
    body.push(
      '<h2>Decided during the sprint</h2>',
      table([{ head: 'Decision' }, { head: 'Title' }], r.decisions.map((d) => `<tr><td>${esc(d.label)}</td><td>${esc(d.title)}</td></tr>`)),
    );
  }
  if (r.retro.length > 0) {
    body.push(
      '<h2>Retrospective</h2>',
      table([{ head: 'Task' }, { head: 'Recorded' }], r.retro.map((n) => `<tr><td>${esc(n.task ?? '')}</td><td>${esc(n.text)}</td></tr>`)),
    );
  }
  body.push(footer(`${r.done.length} done, ${r.notDone.length} not done.`));
  return page('kadence review', BASE_STYLE + VIZ_STYLE, body);
}

/** The Daily Scrum as a page: the goal, then what moved and what is stuck. */
export function dailyHtml(r: DailyScrum, generatedAt: Date = new Date()): string {
  const body: string[] = [];
  body.push(`<h1>Daily — ${esc(r.sprint)}</h1>`);
  body.push(
    stamp(
      [
        r.goal === null ? 'No Sprint Goal.' : `Sprint Goal: ${r.goal}.`,
        `Changes in the last ${r.window.days} day(s).`,
        `Generated ${utcStamp(generatedAt)}.`,
      ],
      'kadence report daily --html',
    ),
  );
  body.push(
    '<div class="tiles">',
    tile('Done', `${r.done} / ${r.committed}`, 'points'),
    tile('Days left', r.daysLeft === null ? '—' : String(r.daysLeft), 'to the end date'),
    tile('Blocked', String(r.blocked.length), 'task(s)', r.blocked.length > 0),
    '</div>',
  );
  body.push(
    '<h2>Moved</h2>',
    r.moved.length === 0
      ? '<p class="empty">Nothing moved.</p>'
      : table(
          [{ head: 'Task' }, { head: 'From' }, { head: 'To' }, { head: 'By' }],
          r.moved.map(
            (m) =>
              `<tr><td>${esc(m.label)} ${esc(m.title)}</td><td>${esc(m.from ?? '')}</td><td>${esc(m.to)}</td><td>${esc(m.by)}</td></tr>`,
          ),
        ),
  );
  if (r.blocked.length > 0) {
    body.push(
      '<h2>Blocked</h2>',
      table([{ head: 'Task' }, { head: 'Title' }], r.blocked.map((t) => `<tr class="critical"><td>${esc(t.label)}</td><td>${esc(t.title)}</td></tr>`)),
    );
  }
  body.push(footer(`${r.moved.length} move(s).`));
  return page('kadence daily', BASE_STYLE + VIZ_STYLE, body);
}

/** Day number since the epoch for an ISO date: the x axis of a timeline. */
function dayIndex(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

function isoOf(index: number): string {
  return new Date(index * 86_400_000).toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Where the axis gets a label: every day, every Monday, or every first of the month. */
function ticks(from: number, to: number, scale: Scale): Array<{ at: number; text: string }> {
  const out: Array<{ at: number; text: string }> = [];
  const every = scale === 'day' && to - from > 21 ? 2 : 1;
  for (let i = from; i <= to; i++) {
    const d = new Date(i * 86_400_000);
    const dom = d.getUTCDate();
    const month = MONTHS[d.getUTCMonth()]!;
    if (scale === 'day' && (i - from) % every === 0) out.push({ at: i, text: dom === 1 || i === from ? `${month} ${dom}` : String(dom) });
    else if (scale === 'week' && d.getUTCDay() === 1) out.push({ at: i, text: `${month} ${dom}` });
    else if (scale === 'month' && dom === 1) out.push({ at: i, text: d.getUTCMonth() === 0 || out.length === 0 ? `${month} ${d.getUTCFullYear()}` : month });
  }
  return out;
}

/**
 * The timeline as a Gantt chart: one row per epic and per direct child, the
 * plan as a bar and what happened as a thinner bar under it. Sprints are
 * bands behind the rows, milestones a dashed line, today a red one. A row
 * whose work runs outside its planned dates is outlined in the critical
 * colour and the table under the chart says by how much — colour is never the
 * only channel.
 */
export function timelineHtml(t: Timeline, generatedAt: Date = new Date()): string {
  const body: string[] = [];
  body.push('<h1>Timeline</h1>');
  body.push(
    stamp(
      [
        'What should be done when, by epic: the plan someone set, or the dates of the work under it, and what the journal says happened.',
        'Nothing here is forecast.',
        `As of ${t.asOf}. Generated ${utcStamp(generatedAt)}.`,
      ],
      'kadence report timeline --html',
    ),
  );

  const undated =
    t.undated === 0
      ? ''
      : `<p class="empty">${t.undated} task(s) have no dates and are not drawn. ` +
        '<code>kadence task edit KAD-1 --start … --due …</code> or a sprint with dates puts one on the timeline.</p>';

  if (t.window === null) {
    body.push('<p class="empty">Nothing on the timeline yet: no task has a date, and none has started.</p>', undated);
    body.push(footer('Nothing dated.'));
    return page('kadence timeline', BASE_STYLE + VIZ_STYLE, body);
  }

  const rows: Array<{ bar: TimelineBar | null; depth: number }> = [];
  for (const g of t.groups) {
    rows.push({ bar: g.epic, depth: 0 });
    for (const c of g.children) rows.push({ bar: c, depth: 1 });
  }

  // A day of margin either side, and today inside the window when it is close.
  const from = dayIndex(t.window.from) - 1;
  const to = Math.max(dayIndex(t.window.to) + 1, from + 7);
  const LABEL = 300;
  const CHART = 760;
  const ROW = 28;
  const TOP = 34;
  const width = LABEL + CHART;
  const height = TOP + rows.length * ROW + 8;
  const x = (date: string, end = false): number =>
    LABEL + ((dayIndex(date) + (end ? 1 : 0) - from) / (to - from + 1)) * CHART;

  const svg: string[] = [];
  svg.push(`<svg class="viz" viewBox="0 0 ${width} ${height}" role="img" aria-label="Timeline by epic">`);
  for (const s of t.markers.sprints) {
    svg.push(
      `<rect x="${x(s.from).toFixed(0)}" y="${TOP - 4}" width="${(x(s.to, true) - x(s.from)).toFixed(0)}" height="${height - TOP}" fill="var(--grid)" opacity=".55"/>`,
      `<text class="tick" x="${(x(s.from) + 3).toFixed(0)}" y="${TOP - 8}">${esc(s.name)}</text>`,
    );
  }
  for (const tk of ticks(from, to, t.scale)) {
    const at = x(isoOf(tk.at));
    svg.push(
      `<line class="grid" x1="${at.toFixed(0)}" x2="${at.toFixed(0)}" y1="${TOP - 4}" y2="${height}"/>`,
      `<text class="tick" x="${(at + 2).toFixed(0)}" y="12">${esc(tk.text)}</text>`,
    );
  }
  rows.forEach((r, i) => {
    const y = TOP + i * ROW;
    const label = r.bar === null ? 'No epic' : `${r.bar.label} ${r.bar.title}`;
    const short = label.length > 40 ? `${label.slice(0, 39)}…` : label;
    svg.push(
      `<text x="${r.depth === 0 ? 4 : 22}" y="${y + 15}" font-size="12" fill="var(--fg)"${r.depth === 0 ? ' font-weight="600"' : ''}>${esc(short)}</text>`,
    );
    if (r.bar === null) return;
    const color = r.depth === 0 ? 'var(--s7)' : 'var(--s1)';
    if (r.bar.plan !== null) {
      const outline = r.bar.mismatch === null ? '' : ' stroke="var(--critical)" stroke-width="2"';
      svg.push(
        `<rect x="${x(r.bar.plan.from).toFixed(0)}" y="${y + 4}" width="${Math.max(3, x(r.bar.plan.to, true) - x(r.bar.plan.from)).toFixed(0)}" height="12" rx="3" fill="${color}"${outline}><title>${esc(`${r.bar.label} plan ${r.bar.plan.from} → ${r.bar.plan.to}`)}</title></rect>`,
      );
    }
    if (r.bar.actual !== null) {
      svg.push(
        `<rect x="${x(r.bar.actual.from).toFixed(0)}" y="${y + 18}" width="${Math.max(3, x(r.bar.actual.to, true) - x(r.bar.actual.from)).toFixed(0)}" height="5" rx="2" fill="var(--s3)"${r.bar.actual.open ? ' opacity=".65"' : ''}><title>${esc(`${r.bar.label} actual ${r.bar.actual.from} → ${r.bar.actual.open ? 'now' : r.bar.actual.to}`)}</title></rect>`,
      );
    }
  });
  for (const m of t.markers.milestones) {
    const at = x(m.date, true);
    svg.push(
      `<line x1="${at.toFixed(0)}" x2="${at.toFixed(0)}" y1="${TOP - 4}" y2="${height}" stroke="var(--s4)" stroke-width="2" stroke-dasharray="4 3"><title>${esc(`${m.label} ${m.name} ${m.date}`)}</title></line>`,
    );
  }
  if (dayIndex(t.asOf) >= from && dayIndex(t.asOf) <= to) {
    const at = x(t.asOf);
    svg.push(`<line class="reference" x1="${at.toFixed(0)}" x2="${at.toFixed(0)}" y1="${TOP - 4}" y2="${height}" stroke-dasharray="2 2"/>`);
  }
  svg.push('</svg>');

  body.push(
    legend([
      { name: 'Epic plan', color: '--s7' },
      { name: 'Plan', color: '--s1' },
      { name: 'Actual', color: '--s3' },
      { name: 'Milestone', color: '--s4' },
      { name: 'Today', color: '--critical' },
    ]),
  );
  body.push(
    figure(
      svg.join(''),
      'A bar outlined in red has work under it that runs outside the dates set on it. The table below says where.',
    ),
  );

  const spanCell = (s: Span | null): string => (s === null ? '' : s.from === s.to ? s.from : `${s.from} → ${s.to}`);
  body.push(
    table(
      [{ head: 'Task' }, { head: 'Title' }, { head: 'Plan' }, { head: 'From' }, { head: 'Actual' }, { head: 'Note' }],
      rows.map((r) =>
        r.bar === null
          ? '<tr><td colspan="6"><strong>No epic</strong></td></tr>'
          : `<tr class="${r.bar.mismatch === null ? '' : 'critical'}"><td>${esc(r.bar.label)}</td>` +
            `<td>${r.depth === 0 ? '<strong>' : ''}${esc(r.bar.title)}${r.depth === 0 ? '</strong>' : ''}</td>` +
            `<td>${esc(spanCell(r.bar.plan))}</td><td>${esc(r.bar.planSource ?? '')}</td>` +
            `<td>${esc(r.bar.actual === null ? '' : `${r.bar.actual.from} → ${r.bar.actual.open ? 'now' : r.bar.actual.to}`)}</td>` +
            `<td>${esc(r.bar.mismatch ?? '')}</td></tr>`,
      ),
    ),
  );
  if (t.hiddenFinished > 0) {
    body.push(
      `<p class="empty">${t.hiddenFinished} finished task(s) with no plan and no epic are not shown. <code>kadence report timeline --all --html</code> includes them.</p>`,
    );
  }
  body.push(undated);
  body.push(footer(`${rows.length} row(s).`));
  return page('kadence timeline', BASE_STYLE + VIZ_STYLE, body);
}

const CALENDAR_STYLE = `
table.calendar { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: .8rem; }
table.calendar th { color: var(--muted); font-weight: 500; text-align: left; padding: .25rem .35rem; }
table.calendar td { vertical-align: top; padding: 0 .3rem; border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
table.calendar tr.days td { border-top: 1px solid var(--line); padding-top: .25rem; height: 1.6rem; }
table.calendar tr.items td { border-bottom: 1px solid var(--line); padding-bottom: .35rem; height: 1.4rem; }
table.calendar td.out { background: var(--card); color: var(--muted); }
table.calendar .num { font-weight: 600; }
table.calendar td.today .num { color: var(--critical); }
table.calendar .marker { display: block; color: var(--muted); font-size: .72rem; }
table.calendar .marker.milestone { color: var(--s4); }
table.calendar .item { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
table.calendar .item.done { color: var(--muted); text-decoration: line-through; }
table.calendar td.bar { padding: 1px 0; }
table.calendar .bar span { display: block; background: var(--s7); color: #fff; border-radius: 3px; padding: 0 .35rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .75rem; line-height: 1.35rem; }
table.calendar .bar span.actual { background: var(--s3); }
table.calendar .bar span.cont-before { border-top-left-radius: 0; border-bottom-left-radius: 0; }
table.calendar .bar span.cont-after { border-top-right-radius: 0; border-bottom-right-radius: 0; }
`;

/**
 * One month as a grid, Monday first: per week a row of day numbers with the
 * sprint and milestone markers, a row per lane of epic bars spanning their
 * days, and a row of the work due. A table and colspans, not a script: the
 * page opens from disk and does nothing after it has loaded.
 */
export function calendarHtml(c: Calendar, generatedAt: Date = new Date(), undated = 0): string {
  const body: string[] = [];
  body.push(`<h1>Calendar — ${esc(c.month)}</h1>`);
  body.push(
    stamp(
      [
        'Epics across the days of their plan (or of the work done, where there is no plan), every task due in the month, sprint and milestone dates.',
        `Generated ${utcStamp(generatedAt)}.`,
      ],
      `kadence report calendar --month ${c.month} --html`,
    ),
  );
  body.push(legend([{ name: 'Epic, planned', color: '--s7' }, { name: 'Epic, from what happened', color: '--s3' }, { name: 'Milestone', color: '--s4' }]));

  const first = dayIndex(c.from);
  const last = dayIndex(c.to);
  // Monday on or before the first; Sunday on or after the last.
  const weekday = (i: number): number => (new Date(i * 86_400_000).getUTCDay() + 6) % 7;
  const gridStart = first - weekday(first);
  const gridEnd = last + (6 - weekday(last));
  const today = generatedAt.toISOString().slice(0, 10);

  const rows: string[] = ['<tr>', ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<th>${d}</th>`), '</tr>'];
  for (let week = gridStart; week <= gridEnd; week += 7) {
    const dayCells: string[] = [];
    const itemCells: string[] = [];
    for (let i = week; i < week + 7; i++) {
      const date = isoOf(i);
      const out = i < first || i > last;
      const cls = [out ? 'out' : '', date === today ? 'today' : ''].filter(Boolean).join(' ');
      const markers = out
        ? ''
        : c.markers
            .filter((m) => m.date === date)
            .map((m) => `<span class="marker${m.kind === 'milestone' ? ' milestone' : ''}">${m.kind === 'milestone' ? '◆ ' : ''}${esc(m.name)}${m.kind === 'sprint_start' ? ' starts' : m.kind === 'sprint_end' ? ' ends' : ''}</span>`)
            .join('');
      dayCells.push(`<td class="${cls}"><span class="num">${new Date(i * 86_400_000).getUTCDate()}</span>${markers}</td>`);
      const due = out
        ? ''
        : c.items
            .filter((x) => x.date === date)
            .map((x) => `<span class="item${x.status === 'done' ? ' done' : ''}" title="${esc(`${x.label} ${x.title}`)}">${esc(x.label)} ${esc(x.title)}</span>`)
            .join('');
      itemCells.push(`<td class="${out ? 'out' : ''}">${due}</td>`);
    }
    rows.push(`<tr class="days">${dayCells.join('')}</tr>`);

    for (let lane = 0; lane < c.lanes; lane++) {
      const segments = c.bars
        .filter((b) => b.lane === lane && dayIndex(b.to) >= week && dayIndex(b.from) <= week + 6)
        .sort((a, b) => (a.from < b.from ? -1 : 1));
      if (segments.length === 0) continue;
      const cells: string[] = [];
      let cursor = week;
      for (const b of segments) {
        const start = Math.max(dayIndex(b.from), week);
        const end = Math.min(dayIndex(b.to), week + 6);
        if (start > cursor) cells.push(`<td colspan="${start - cursor}"></td>`);
        const before = b.continuesBefore || start > dayIndex(b.from);
        const after = b.continuesAfter || end < dayIndex(b.to);
        const cls = [b.source === 'actual' ? 'actual' : '', before ? 'cont-before' : '', after ? 'cont-after' : ''].filter(Boolean).join(' ');
        cells.push(
          `<td class="bar" colspan="${end - start + 1}"><span class="${cls}" title="${esc(`${b.label} ${b.title} ${b.from} → ${b.to}`)}">${before ? '… ' : ''}${esc(b.label)} ${esc(b.title)}</span></td>`,
        );
        cursor = end + 1;
      }
      if (cursor <= week + 6) cells.push(`<td colspan="${week + 7 - cursor}"></td>`);
      rows.push(`<tr class="lane">${cells.join('')}</tr>`);
    }
    rows.push(`<tr class="items">${itemCells.join('')}</tr>`);
  }
  body.push(`<div class="rows"><table class="calendar">${rows.join('')}</table></div>`);

  if (c.bars.length === 0 && c.items.length === 0 && c.markers.length === 0) {
    body.push(`<p class="empty">Nothing dated in ${esc(c.month)}.</p>`);
  }
  if (undated > 0) {
    body.push(
      `<p class="empty">${undated} task(s) have no dates and appear in no month. <code>kadence task edit KAD-1 --start … --due …</code> puts one here.</p>`,
    );
  }
  body.push(footer(`${c.bars.length} epic(s), ${c.items.length} due.`));
  return page(`kadence calendar ${c.month}`, BASE_STYLE + VIZ_STYLE + CALENDAR_STYLE, body);
}
