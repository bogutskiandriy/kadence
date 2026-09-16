import type { FlowReport, CfdReport, Percentiles } from '../core/flow.js';
import { type AttentionReport, describeSignal } from '../core/attention.js';
import { esc, page, BASE_STYLE, VIZ_STYLE } from './page.js';
import { columnsChart, stackedAreaChart, barsChart, percentileStrips, lineChart, type Series } from './svg.js';
import type { Burndown } from '../core/burndown.js';
import type { VelocitySeries } from '../core/velocity.js';
import type { WorkloadReport } from '../core/workload.js';

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
