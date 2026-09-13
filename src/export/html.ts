import type { ProjectState, Task } from '../core/projection.js';
import { TERMINAL_STATUS, CANCELLED_STATUS } from '../core/projection.js';
import { sprintReport } from '../core/velocity.js';
import type { Burndown } from '../core/burndown.js';

/**
 * The board as one self-contained HTML file.
 *
 * This is the experiment that stands in for a web UI, and it only counts as
 * one while two things stay true: no process outlives the command, and the
 * page asks the network for nothing. So there is no script tag, no stylesheet
 * link, no font, and no image — everything is inline text and CSS, and the
 * bars are div widths rather than a chart library.
 *
 * If a pilot asks for it to be live, the pressure to add a server is back and
 * the kill condition in docs/product/feature-adoption-2026-09.md applies.
 */

/** Everything a person typed goes through this before it reaches the page. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Light and dark both, from one declaration: the reader's setting decides. */
const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #ffffff; --fg: #1a1a1a; --muted: #6b6b6b; --line: #e2e2e2;
  --card: #fafafa; --accent: #2d6cdf; --done: #2e7d32; --warn: #b26a00;
  --danger: #c62828;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17181a; --fg: #e8e8e8; --muted: #9a9a9a; --line: #2e2f33;
    --card: #1f2023; --accent: #6ea8fe; --done: #7bc47f; --warn: #e0a458;
    --danger: #ef6b6b;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2rem 1.5rem; background: var(--bg); color: var(--fg);
  font: 15px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
main { max-width: 1100px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
h2 { font-size: 1.05rem; margin: 2rem 0 .75rem; padding-bottom: .3rem; border-bottom: 1px solid var(--line); }
.stamp { color: var(--muted); font-size: .85rem; margin-bottom: 1.5rem; }
.stamp code { background: var(--card); padding: .1rem .3rem; border-radius: 3px; }
.columns { display: flex; gap: .75rem; align-items: flex-start; overflow-x: auto; padding-bottom: .5rem; }
.column { flex: 1 1 0; min-width: 190px; }
.column h3 { font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 .5rem; }
.card { background: var(--card); border: 1px solid var(--line); border-left-width: 3px; border-radius: 5px; padding: .5rem .6rem; margin-bottom: .5rem; }
.card .label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .78rem; color: var(--accent); }
.card .title { display: block; margin: .15rem 0; }
.card .meta { color: var(--muted); font-size: .78rem; }
.card.done { border-left-color: var(--done); }
.card.blocked, .card.contested { border-left-color: var(--danger); }
.card.in_progress { border-left-color: var(--accent); }
.pill { display: inline-block; font-size: .72rem; padding: .05rem .35rem; border-radius: 3px; border: 1px solid var(--line); margin-right: .25rem; }
.pill.danger { color: var(--danger); border-color: var(--danger); }
.pill.warn { color: var(--warn); border-color: var(--warn); }
.bar { background: var(--line); border-radius: 3px; height: .55rem; overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--accent); }
.bar.done > span { background: var(--done); }
table { border-collapse: collapse; width: 100%; font-size: .88rem; }
th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; }
.chart { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
.chart div { display: flex; gap: .5rem; align-items: center; }
.chart .day { color: var(--muted); width: 3.5rem; }
.chart .track { flex: 1; }
.decision { border-left: 3px solid var(--line); padding-left: .75rem; margin-bottom: 1rem; }
.decision .why { color: var(--muted); }
.criteria { list-style: none; margin: .35rem 0 0; padding: 0; font-size: .8rem; color: var(--muted); }
.criteria li.checked { color: var(--done); }
.empty { color: var(--muted); }
footer { margin-top: 2.5rem; color: var(--muted); font-size: .8rem; border-top: 1px solid var(--line); padding-top: .75rem; }
`;

function bar(done: number, total: number, extraClass = ''): string {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return `<div class="bar ${extraClass}"><span style="width:${pct}%"></span></div>`;
}

function card(task: Task, state: ProjectState): string {
  const pills: string[] = [];
  if (task.contestedBy.length > 0) {
    pills.push(`<span class="pill danger">contested: ${esc(task.contestedBy.join(', '))}</span>`);
  } else if (task.claimedBy !== null) {
    pills.push(`<span class="pill">claimed ${esc(task.claimedBy)}</span>`);
  }
  if (task.blockedBy.length > 0) {
    pills.push(`<span class="pill danger">blocked by ${task.blockedBy.length}</span>`);
  }
  if (task.criteria.length > 0) {
    const done = task.criteria.filter((c) => c.checked).length;
    const cls = done === task.criteria.length ? 'pill' : 'pill warn';
    pills.push(`<span class="${cls}">${done}/${task.criteria.length} criteria</span>`);
  }
  const milestone =
    task.milestone === null
      ? null
      : (state.milestones.find((m) => m.id === task.milestone)?.name ?? null);
  if (milestone !== null) pills.push(`<span class="pill">${esc(milestone)}</span>`);

  const meta = [
    task.assignee === null ? '' : esc(task.assignee),
    task.estimate === null ? '' : `${task.estimate} pts`,
    task.due === null ? '' : `due ${esc(task.due)}`,
  ].filter((s) => s.length > 0);

  // The criteria are shown in full, not counted: this file is the evidence
  // someone attaches to a pull request, and "2/3" is not evidence.
  const checklist =
    task.criteria.length === 0
      ? ''
      : `<ul class="criteria">${task.criteria
          .map(
            (c) =>
              `<li class="${c.checked ? 'checked' : ''}">${c.checked ? '\u2611' : '\u2610'} ${esc(c.text)}</li>`,
          )
          .join('')}</ul>`;

  const cls = task.contestedBy.length > 0 ? 'contested' : task.blockedBy.length > 0 ? 'blocked' : esc(task.status);
  return [
    `<div class="card ${cls}">`,
    `<span class="label">${esc(task.label)}</span>`,
    `<span class="title">${esc(task.title)}</span>`,
    pills.length > 0 ? pills.join('') : '',
    checklist,
    meta.length > 0 ? `<div class="meta">${meta.join(' · ')}</div>` : '',
    '</div>',
  ].join('');
}

export function boardHtml(
  state: ProjectState,
  /** Passed in rather than computed: this module never reads the journal. */
  chart: Burndown | null = null,
  generatedAt: Date = new Date(),
): string {
  const stamp = generatedAt.toISOString().slice(0, 16).replace('T', ' ');
  const parts: string[] = [];

  parts.push('<h1>Board</h1>');
  parts.push(
    `<p class="stamp">Snapshot of <code>.kadence/</code> at ${esc(stamp)} UTC. ` +
      'A file, not a page: nothing here is live, and regenerating it is ' +
      '<code>kadence board export --html</code>.</p>',
  );

  // Only the task sections are gated on tasks: decisions recorded before the
  // first task is added are exactly the layer this product exists for, and
  // dropping them silently would be the worst possible omission.
  const hasTasks = state.tasks.length > 0;
  if (!hasTasks) {
    parts.push('<p class="empty">No tasks yet. Create the first one with <code>kadence task add "title"</code>.</p>');
  }
  {
    const sprint = state.sprints.find((s) => s.status === 'active');
    if (hasTasks && sprint !== undefined) {
      const report = sprintReport(state, sprint.id);
      parts.push(`<h2>Sprint: ${esc(sprint.name)}</h2>`);
      if (report !== null) {
        parts.push(bar(report.velocity, report.committed, 'done'));
        parts.push(
          `<p class="stamp">${report.velocity} of ${report.committed} points done, ` +
            `${report.carriedOver.length} carrying over.</p>`,
        );
      }

      if (chart !== null && chart.committed > 0 && chart.days.length > 0) {
        parts.push('<h2>Burndown</h2>');
        parts.push('<div class="chart">');
        for (const day of chart.days) {
          const pct = Math.round((day.remaining / chart.committed) * 100);
          const idealPct = Math.round((day.ideal / chart.committed) * 100);
          parts.push(
            `<div><span class="day">${esc(day.date.slice(5))}</span>` +
              `<span class="track"><span class="bar"><span style="width:${pct}%"></span></span></span>` +
              `<span class="day">${day.remaining} / ${idealPct}%</span></div>`,
          );
        }
        parts.push('</div>');
      }
    }

    if (state.milestones.length > 0) {
      parts.push('<h2>Milestones</h2>');
      parts.push('<table><tr><th>Milestone</th><th>Due</th><th>Progress</th><th>Points</th><th>Tasks</th></tr>');
      for (const m of state.milestones) {
        parts.push(
          `<tr><td>${esc(m.name)}${m.status === 'closed' ? ' <span class="pill">closed</span>' : ''}</td>` +
            `<td>${esc(m.due ?? '')}</td><td>${bar(m.donePoints, m.totalPoints)}</td>` +
            `<td>${m.donePoints}/${m.totalPoints}</td><td>${m.doneTasks}/${m.totalTasks}</td></tr>`,
        );
      }
      parts.push('</table>');
    }

    if (hasTasks) {
    parts.push('<h2>Tasks</h2>');
    parts.push('<div class="columns">');
    const shown = [...state.statuses, ...state.orphanStatuses];
    for (const status of shown) {
      const tasks = state.tasks.filter((t) => t.status === status);
      if (tasks.length === 0 && status === CANCELLED_STATUS) continue;
      parts.push('<div class="column">');
      parts.push(`<h3>${esc(status)} (${tasks.length})</h3>`);
      if (tasks.length === 0) parts.push('<p class="empty">—</p>');
      for (const task of tasks) parts.push(card(task, state));
      parts.push('</div>');
    }
    parts.push('</div>');
    }

    const current = state.decisions.filter((d) => d.supersededBy === null);
    if (current.length > 0) {
      parts.push('<h2>Decisions in force</h2>');
      for (const d of current) {
        parts.push('<div class="decision">');
        parts.push(`<strong>${esc(d.label)} ${esc(d.title)}</strong>`);
        parts.push(`<div class="why">Why: ${esc(d.why)}</div>`);
        if (d.rejected !== null) parts.push(`<div class="why">Rejected: ${esc(d.rejected)}</div>`);
        parts.push('</div>');
      }
    }
  }

  const open = state.tasks.filter(
    (t) => t.status !== TERMINAL_STATUS && t.status !== CANCELLED_STATUS,
  );
  parts.push(
    `<footer>${state.tasks.length} tasks, ${open.length} open. ` +
      'Generated by kadence from the event journal. No server, no network.</footer>',
  );

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>kadence board</title>',
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    '<main>',
    ...parts,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
