import type { FlowEvent } from './event.js';
import type { ProjectState, Sprint } from './projection.js';

/**
 * Burndown, reconstructed from the journal rather than sampled daily.
 *
 * A tracker that only records "points left today" cannot answer questions
 * about the past, and loses the chart entirely if nobody opened it for a week.
 * An event journal already holds every state change with its time, so the
 * chart is derivable for any day — including days before the feature existed.
 */

export interface BurndownDay {
  date: string;
  /** Points still not done at the end of that day. */
  remaining: number;
  /** Where a perfectly even burn would have been. */
  ideal: number;
  /** Points completed on this day alone. */
  completed: number;
}

export interface Burndown {
  sprintName: string;
  committed: number;
  days: BurndownDay[];
  /** null while the sprint is still open. */
  finalRemaining: number | null;
}

const DAY_MS = 86_400_000;

function isoDay(value: string | number | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00.000Z`); t <= Date.parse(`${to}T00:00:00.000Z`); t += DAY_MS) {
    out.push(isoDay(t));
  }
  return out;
}

/**
 * Builds the chart for one sprint.
 *
 * Falls back to the first and last event dates when the sprint has no explicit
 * boundaries — a chart with inferred dates is far more useful than none.
 */
export function burndown(
  state: ProjectState,
  events: readonly FlowEvent[],
  sprint: Sprint,
  today: string = isoDay(Date.now()),
): Burndown | null {
  const tasks = state.tasks.filter((t) => t.sprint === sprint.id && t.status !== 'cancelled');
  const estimateOf = new Map(tasks.map((t) => [t.id, t.estimate ?? 0]));
  const committed = [...estimateOf.values()].reduce((a, b) => a + b, 0);

  const relevant = events.filter((e) => estimateOf.has(e.entity));
  if (relevant.length === 0) return null;

  const start = sprint.startDate ?? isoDay(relevant[0]!.ts);
  const rawEnd = sprint.endDate ?? isoDay(relevant.at(-1)!.ts);
  // Never chart the future: a line running past today reads as data, not as
  // an empty calendar.
  const end = sprint.status === 'closed' ? rawEnd : rawEnd < today ? rawEnd : today;

  if (end < start) return null;

  // Replay the moves day by day. A task can be completed and reopened, so the
  // done-set is tracked rather than counted once.
  const done = new Set<string>();
  const completedOn = new Map<string, number>();

  for (const e of relevant) {
    const day = isoDay(e.ts);
    if (day < start) continue;

    const to = e.type === 'task.moved' ? e.data?.['to'] : undefined;
    const points = estimateOf.get(e.entity) ?? 0;

    if (to === 'done' && !done.has(e.entity)) {
      done.add(e.entity);
      completedOn.set(day, (completedOn.get(day) ?? 0) + points);
    } else if (to !== undefined && to !== 'done' && done.has(e.entity)) {
      done.delete(e.entity);
      completedOn.set(day, (completedOn.get(day) ?? 0) - points);
    }
  }

  const days = eachDay(start, end);
  const span = Math.max(days.length - 1, 1);
  let remaining = committed;

  return {
    sprintName: sprint.name,
    committed,
    finalRemaining: sprint.status === 'closed' ? null : null,
    days: days.map((date, i) => {
      const completed = completedOn.get(date) ?? 0;
      remaining -= completed;
      return {
        date,
        remaining: Math.max(0, remaining),
        ideal: Math.max(0, committed - (committed / span) * i),
        completed,
      };
    }),
  };
}

/**
 * Draws the chart as horizontal bars.
 *
 * Horizontal rather than vertical: a two-week sprint fits any terminal width
 * this way, while vertical columns start wrapping past about ten days.
 */
export function renderBurndown(chart: Burndown, width = 40): string {
  if (chart.committed === 0) {
    return `"${chart.sprintName}": nothing to burn down — no estimated tasks.`;
  }

  const lines = [
    `"${chart.sprintName}" — ${chart.committed} points committed`,
    '',
  ];

  for (const day of chart.days) {
    const filled = Math.round((day.remaining / chart.committed) * width);
    const idealMark = Math.round((day.ideal / chart.committed) * width);

    // The ideal position is drawn inside the bar, so the reader sees ahead or
    // behind at a glance instead of comparing two separate lines.
    const cells: string[] = [];
    for (let i = 0; i < width; i++) {
      if (i === idealMark && i >= filled) cells.push('┊');
      else if (i < filled) cells.push(i === idealMark ? '┃' : '█');
      else cells.push(' ');
    }

    const delta = day.remaining - day.ideal;
    const status = Math.abs(delta) < 0.5 ? '' : delta > 0 ? ` +${delta.toFixed(0)}` : ` ${delta.toFixed(0)}`;
    lines.push(`${day.date.slice(5)}  ${cells.join('')} ${String(day.remaining).padStart(3)}${status}`);
  }

  const last = chart.days.at(-1);
  if (last !== undefined) {
    lines.push('');
    lines.push(
      last.remaining === 0
        ? '  All committed work is done.'
        : `  ${last.remaining} of ${chart.committed} points remain.` +
          (last.remaining > last.ideal ? '  Behind the ideal line.' : '  On or ahead of the line.'),
    );
  }

  return lines.join('\n');
}
