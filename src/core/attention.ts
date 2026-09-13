import type { ProjectState, Task } from './projection.js';
import { isInProgress, startedAt } from './flow.js';
import { isFinished } from './query.js';

/**
 * Work the board presents as active while nobody is moving it.
 *
 * The four signals below are not "everything that could be wrong". They are the
 * gap between what the board claims and what is happening, and staying inside
 * that definition is what keeps the list short enough to read.
 *
 * Two obvious candidates were left out on purpose. "An open task with no owner"
 * is the definition of a backlog and would return every row in it. "Criteria
 * added and never checked" fires on every task in any repository that
 * configured a Definition of Done, because `task add` copies it in unchecked —
 * loudest, in other words, in the repositories that took our advice.
 *
 * Nothing here is stored: the report is a fold over events the journal already
 * has, and it needs no new event type and no new field.
 */

const MS_DAY = 86_400_000;

export type AttentionKind = 'stalled' | 'unowned' | 'stale_claim' | 'dead_blocker';

export interface AttentionSignal {
  kind: AttentionKind;
  /** Days, for the two signals that are about elapsed time. */
  days?: number;
  /** The claimant, for `stale_claim`. */
  who?: string;
  /** Labels of the blockers that no longer block, for `dead_blocker`. */
  blockers?: string[];
}

export interface AttentionRow {
  label: string;
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
  /** Days since the task's last event — the sort key, and the headline number. */
  idleDays: number;
  signals: AttentionSignal[];
}

export interface AttentionReport {
  /** Days of silence before work counts as stalled, and the age a claim must reach. */
  threshold: number;
  /** The started boundary in force, named for the same reason `report flow` names it. */
  started: string;
  /** The day the question was asked. The answer changes tomorrow; the journal does not. */
  asOf: string;
  rows: AttentionRow[];
  notes: string[];
}

/**
 * The task's last event.
 *
 * Not `task.updatedAt`: that field takes a max over `ts`, so a single event
 * written by a machine whose clock is ahead makes the task look fresh forever.
 * History is folded in ULID order (I2), so its last entry is the last thing
 * that actually happened, whatever the clocks said.
 */
function lastActivityAt(task: Task): string {
  return task.history[task.history.length - 1]?.ts ?? task.createdAt;
}

function daysSince(iso: string, today: Date): number {
  const days = Math.floor((today.getTime() - Date.parse(iso)) / MS_DAY);
  // A timestamp from the future is not negative idleness; it is no idleness.
  return days > 0 ? days : 0;
}

/**
 * Whether the task moved after the claim that currently owns it.
 *
 * Walks back from the newest entry: the first `task.moved` found before the
 * claim itself is proof the claim is still doing work. The claim is matched by
 * the id of the event that won, never by `ts`, so two branches merged in either
 * order give the same answer (I1) — and a losing claim written on another
 * machine at the same wall-clock second does not end the walk early.
 */
function movedSinceClaim(task: Task): boolean {
  for (let i = task.history.length - 1; i >= 0; i--) {
    const h = task.history[i]!;
    if (h.id === task.claimedEventId) return false;
    if (h.type === 'task.moved') return true;
  }
  return false;
}

function signalsFor(
  task: Task,
  state: ProjectState,
  labelOf: ReadonlyMap<string, string>,
  finished: ReadonlySet<string>,
  today: Date,
  threshold: number,
): AttentionSignal[] {
  const out: AttentionSignal[] = [];

  // A blocker that finished while the link stayed behind: the board says this
  // is waiting on something, and it is not. True of backlog work as well, which
  // is the point — nobody looked long enough to notice it could start.
  const dead = task.blockedBy.filter((id) => finished.has(id));
  if (dead.length > 0) {
    out.push({ kind: 'dead_blocker', blockers: dead.map((id) => labelOf.get(id) ?? id) });
  }

  // Everything else is about work that claims to be in flight.
  if (!isInProgress(state, task)) return out;

  const idle = daysSince(lastActivityAt(task), today);
  if (idle >= threshold) out.push({ kind: 'stalled', days: idle });

  // Ownership is judged against how long the work has been in flight, not
  // against its last event: a task started five minutes ago has nobody on it
  // yet and that is not a problem. A task in flight for a week with nobody on
  // it is the problem — there is no one to ask.
  if (task.assignee === null && task.claimedBy === null) {
    const since = startedAt(task, state.started, state.statuses, state.startedChanges);
    const inFlight = since === null ? idle : daysSince(since, today);
    if (inFlight >= threshold) out.push({ kind: 'unowned', days: inFlight });
  }

  if (task.claimedBy !== null && task.claimedAt !== null && !movedSinceClaim(task)) {
    const held = daysSince(task.claimedAt, today);
    if (held >= threshold) out.push({ kind: 'stale_claim', days: held, who: task.claimedBy });
  }

  return out;
}

/**
 * One signal in the fewest words that still say what to do about it.
 *
 * Lives here rather than in either caller: `report attention` and the session
 * preamble have to name the same thing the same way, and two renderers is how
 * two surfaces start disagreeing about what "stalled" means.
 */
export function describeSignal(s: AttentionSignal): string {
  switch (s.kind) {
    case 'stalled':
      return `stalled ${String(s.days)}d`;
    case 'unowned':
      return `unowned ${String(s.days)}d`;
    case 'stale_claim':
      return `claimed ${String(s.days)}d ago by ${s.who ?? 'someone'}, never moved`;
    case 'dead_blocker':
      return `blocked by ${(s.blockers ?? []).join(', ')}, already done`;
  }
}

export function attentionReport(
  state: ProjectState,
  today: Date = new Date(),
  threshold = 7,
): AttentionReport {
  const live = state.tasks.filter((t) => !isFinished(t));
  const finished = new Set(state.tasks.filter(isFinished).map((t) => t.id));
  const labelOf = new Map(state.tasks.map((t) => [t.id, t.label]));

  const rows: AttentionRow[] = [];
  for (const task of live) {
    const signals = signalsFor(task, state, labelOf, finished, today, threshold);
    if (signals.length === 0) continue;
    rows.push({
      label: task.label,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee,
      idleDays: daysSince(lastActivityAt(task), today),
      signals,
    });
  }

  // Most neglected first; ties broken by ULID order, which is the same on every
  // machine, so two people reading the same journal read the same list.
  const order = new Map(state.tasks.map((t, i) => [t.label, i]));
  rows.sort((a, b) =>
    b.idleDays !== a.idleDays
      ? b.idleDays - a.idleDays
      : (order.get(a.label) ?? 0) - (order.get(b.label) ?? 0),
  );

  return {
    threshold,
    started: state.started,
    asOf: today.toISOString().slice(0, 10),
    rows,
    notes: rows.length > 0 ? [] : emptyNotes(state, live, today, threshold),
  };
}

/**
 * Why the list is empty — the same courtesy `ready` pays when it has nothing to
 * offer. "Nothing to report" and "nothing is being worked on" call for opposite
 * next steps.
 */
function emptyNotes(
  state: ProjectState,
  live: readonly Task[],
  today: Date,
  threshold: number,
): string[] {
  const inProgress = live.filter((t) => isInProgress(state, t));
  if (inProgress.length === 0) {
    return [`Nothing to report: there is no work in progress past \`${state.started}\`.`];
  }
  const freshest = Math.min(...inProgress.map((t) => daysSince(lastActivityAt(t), today)));
  return [
    `Nothing to report: ${String(inProgress.length)} task${inProgress.length === 1 ? '' : 's'} in progress, ` +
      `none silent or ownerless for ${String(threshold)} days (the quietest was touched ${String(freshest)} day(s) ago).`,
  ];
}
