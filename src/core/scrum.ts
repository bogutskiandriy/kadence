import type { FlowEvent } from './event.js';
import type { ProjectState, Sprint } from './projection.js';
import { isFinished } from './query.js';
import { sprintReport } from './velocity.js';
import { burnup } from './burnup.js';

/**
 * The two Scrum events that inspect a sprint, as folds (Scrum Guide 2020).
 *
 * The Sprint Review looks at the outcome against the Sprint Goal and at what
 * changed, so the team can decide what comes next. The Daily Scrum looks at
 * progress toward the Sprint Goal over the last day. Neither adds a number the
 * journal did not already hold; they put the existing ones in the order the
 * event asks its questions — and the review adds the decisions recorded during
 * the sprint, which is the context a stakeholder missed by not being there.
 */

export interface ReviewTask {
  label: string;
  title: string;
  estimate: number | null;
}

export interface SprintReview {
  sprint: string;
  status: Sprint['status'];
  goal: string | null;
  productGoal: { label: string; text: string } | null;
  committed: number;
  velocity: number;
  done: ReviewTask[];
  notDone: Array<ReviewTask & { status: string }>;
  cancelled: ReviewTask[];
  /** Points that joined after the start, from the burnup. null when there is no chart. */
  scopeAdded: number | null;
  /** Decisions recorded between the sprint's start and its close (or now). */
  decisions: Array<{ label: string; title: string }>;
  /** What the sprint's retrospective recorded. */
  retro: Array<{ text: string; task: string | null }>;
}

/** When the sprint started and ended, by its own events; null where it has not. */
function sprintWindow(events: readonly FlowEvent[], sprint: Sprint): { from: string | null; to: string | null } {
  let from: string | null = null;
  let to: string | null = null;
  for (const e of events) {
    if (e.entity !== sprint.id) continue;
    if (e.type === 'sprint.started' && from === null) from = e.ts;
    if (e.type === 'sprint.closed' && e.id === sprint.closedBy) to = e.ts;
  }
  return { from, to };
}

const toReviewTask = (t: { label: string; title: string; estimate: number | null }): ReviewTask => ({
  label: t.label,
  title: t.title,
  estimate: t.estimate,
});

export function sprintReview(state: ProjectState, events: readonly FlowEvent[], sprint: Sprint): SprintReview {
  const report = sprintReport(state, sprint.id)!;
  const goal = state.goals.find((g) => g.status === 'open');
  const { from, to } = sprintWindow(events, sprint);
  const inWindow = (at: string): boolean => (from === null || at >= from) && (to === null || at <= to);
  const label = (id: string | null): string | null =>
    id === null ? null : (state.tasks.find((t) => t.id === id)?.label ?? null);

  return {
    sprint: sprint.name,
    status: sprint.status,
    goal: sprint.goal,
    productGoal: goal === undefined ? null : { label: goal.label, text: goal.text },
    committed: report.committed,
    velocity: report.velocity,
    done: report.done.map(toReviewTask),
    notDone: report.carriedOver.map((t) => ({ ...toReviewTask(t), status: t.status })),
    cancelled: report.cancelled.map(toReviewTask),
    scopeAdded: burnup(state, events, sprint)?.scopeAdded ?? null,
    // A sprint that never started has no window; nothing was decided "during" it.
    decisions:
      from === null
        ? []
        : state.decisions.filter((d) => inWindow(d.at)).map((d) => ({ label: d.label, title: d.title })),
    retro: state.notes.filter((n) => n.sprint === sprint.id).map((n) => ({ text: n.text, task: label(n.task) })),
  };
}

export interface DailyScrum {
  sprint: string;
  goal: string | null;
  /** Whole days to the sprint's end date, or null without one. */
  daysLeft: number | null;
  /** Points finished so far, against points taken in. */
  done: number;
  committed: number;
  /** Status changes inside the window, oldest first. */
  moved: Array<{ label: string; title: string; from: string | null; to: string; by: string; at: string }>;
  inProgress: Array<{ label: string; title: string; claimedBy: string | null }>;
  blocked: Array<{ label: string; title: string }>;
  window: { from: string; days: number };
}

export function dailyScrum(state: ProjectState, sprint: Sprint, today: Date, days: number): DailyScrum {
  const report = sprintReport(state, sprint.id)!;
  const tasks = state.tasks.filter((t) => t.sprint === sprint.id);
  const cutoff = new Date(today.getTime() - days * 86_400_000).toISOString();

  const moved = tasks
    .flatMap((t) =>
      t.history
        .filter((h) => h.type === 'task.moved' && h.ts >= cutoff && typeof h.data['to'] === 'string')
        .map((h) => ({
          label: t.label,
          title: t.title,
          from: typeof h.data['from'] === 'string' ? (h.data['from'] as string) : null,
          to: h.data['to'] as string,
          by: h.actor,
          at: h.ts,
          id: h.id,
        })),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map(({ id: _id, ...rest }) => rest);

  // Blocked by the column or by a task that is not finished yet: the Daily
  // is where an impediment gets named, whichever way the board records it.
  const finished = new Set(state.tasks.filter(isFinished).map((t) => t.id));
  const isBlocked = (t: (typeof tasks)[number]): boolean =>
    !isFinished(t) && (t.status === 'blocked' || t.blockedBy.some((id) => !finished.has(id)));
  const startedAt = state.statuses.indexOf(state.started);
  const inFlight = (t: (typeof tasks)[number]): boolean =>
    !isFinished(t) && !isBlocked(t) && startedAt !== -1 && state.statuses.indexOf(t.status) >= startedAt;

  let daysLeft: number | null = null;
  if (sprint.endDate !== null) {
    const end = Date.parse(`${sprint.endDate}T00:00:00Z`);
    const start = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
    daysLeft = Math.round((end - start) / 86_400_000);
  }

  return {
    sprint: sprint.name,
    goal: sprint.goal,
    daysLeft,
    done: report.velocity,
    committed: report.committed,
    moved,
    inProgress: tasks
      .filter(inFlight)
      .map((t) => ({ label: t.label, title: t.title, claimedBy: t.claimedBy })),
    blocked: tasks
      .filter(isBlocked)
      .map((t) => ({ label: t.label, title: t.title })),
    window: { from: cutoff, days },
  };
}
