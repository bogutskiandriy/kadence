import { resolveContext, isContext, loadState, type CommandResult } from './task.js';
import { readyTasks } from '../../core/query.js';
import { attentionReport, describeSignal } from '../../core/attention.js';
import type { ProjectState, Task } from '../../core/projection.js';

/** A note's task as the label a reader sees everywhere else, never a ULID. */
function labelOf(state: ProjectState, id: string | null): string | null {
  return id === null ? null : (state.tasks.find((t) => t.id === id)?.label ?? null);
}

/**
 * What a session needs to know before it does anything.
 *
 * The one command written to a budget instead of a feature list. It goes into
 * an agent's context at the top of every session and is paid for on every turn
 * after that, so the rule is: carry the part that changes, point at the part
 * that does not. The static half already lives in `AGENTS.md`, written once by
 * `init`; this is the live half, and `test/prime.test.ts` holds it to forty
 * lines and three kilobytes.
 */

/** Everything here is capped. A summary with no cap is a wall by month three. */
const MINE_LIMIT = 5;
const DECISION_LIMIT = 5;
const NOTE_LIMIT = 5;
/**
 * Three, and only when there are any.
 *
 * This is the only thing kadence pushes: the `SessionStart` hook runs `prime`
 * whether or not anyone asked for it. A line that is always present is
 * furniture by the third session — the same pile of unread signals the whole
 * idea was meant to thin out — so the rule is silence when there is nothing,
 * and three names when there is. The rest is one command away.
 */
const ATTENTION_LIMIT = 3;
/** Days of silence. The same default `report attention` uses. */
const ATTENTION_IDLE_DAYS = 7;
const TITLE_LIMIT = 60;

/** The four ways to go deeper, so nothing above has to be exhaustive. */
const COMMANDS = [
  'kadence ready              what can be started now',
  'kadence task show KAD-1    one task in full, with its decisions',
  'kadence decision list      the reasons behind the work',
  'kadence board              the whole board',
];

export interface PrimeOptions {
  json?: boolean;
}

function short(text: string): string {
  const chars = [...text];
  return chars.length > TITLE_LIMIT ? `${chars.slice(0, TITLE_LIMIT - 1).join('')}…` : text;
}

/** Whole days from today to the sprint's end, or null when there is no end. */
function daysLeft(endDate: string | null, today: Date): number | null {
  if (endDate === null) return null;
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(end)) return null;
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return Math.round((end - now) / 86_400_000);
}

/** Work already on this person's plate: claimed by them, or in progress. */
function mine(state: ProjectState, actor: string): Task[] {
  return state.tasks.filter(
    (t) => t.claimedBy === actor || (t.assignee === actor && t.status === state.started),
  );
}

export function runPrime(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: PrimeOptions,
  today: Date = new Date(),
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  const sprint = state.sprints.find((s) => s.status === 'active');
  const left = sprint === undefined ? null : daysLeft(sprint.endDate, today);
  const allMine = mine(state, ctx.actor);
  // The newest first: "what am I working on" is answered by the most recent
  // thing taken, not the oldest one still open.
  const ours = [...allMine].reverse().slice(0, MINE_LIMIT);
  const ready = readyTasks(state.tasks, { viewer: ctx.actor });
  const attention = attentionReport(state, today, ATTENTION_IDLE_DAYS).rows;
  const shownAttention = attention.slice(0, ATTENTION_LIMIT);
  // Titles only. The reason behind a decision is what makes it long, and it is
  // one command away — carrying it here would cost every turn of the session.
  const decisions = state.decisions
    .filter((d) => d.supersededBy === null)
    .slice(-DECISION_LIMIT)
    .reverse()
    .map((d) => ({ label: d.label, title: d.title }));
  const notes = state.notes
    .slice(-NOTE_LIMIT)
    .reverse()
    .map((n) => ({ text: n.text, by: n.by, task: labelOf(state, n.task) }));

  const lines: string[] = [];
  lines.push(
    sprint === undefined
      ? 'No active sprint.'
      : `Sprint: ${sprint.name}${left === null ? '' : `, ${left} day(s) left`}`,
  );

  // The count is the real one, not the shown one: "Yours (5)" while seven are
  // hidden is the kind of number that makes a reader stop trusting the rest.
  const minePart = allMine.length > ours.length ? `${ours.length} of ${allMine.length}` : `${ours.length}`;
  lines.push('', allMine.length === 0 ? 'Nothing claimed by you.' : `Yours (${minePart}):`);
  for (const t of ours) lines.push(`  ${t.label} ${t.status}  ${short(t.title)}`);

  // A count, not a list: `ready` prints the list, and printing it twice is how
  // a preamble doubles in size without saying anything new.
  lines.push('', `Ready to start: ${ready.length}  (kadence ready)`);

  // Nothing to say, nothing printed. See ATTENTION_LIMIT.
  if (shownAttention.length > 0) {
    const part =
      attention.length > shownAttention.length
        ? `${shownAttention.length} of ${attention.length}`
        : `${shownAttention.length}`;
    lines.push('', `Nobody is moving (${part}):  (kadence report attention)`);
    for (const row of shownAttention) {
      lines.push(`  ${row.label} ${row.signals.map(describeSignal).join(' · ')}`);
    }
  }

  if (decisions.length > 0) {
    lines.push('', 'Decisions in force:');
    for (const d of decisions) lines.push(`  ${d.label} ${short(d.title)}`);
  }
  if (notes.length > 0) {
    lines.push('', 'Recent notes:');
    for (const n of notes) lines.push(`  ${n.task === null ? '' : `${n.task} `}${short(n.text)}`);
  }

  lines.push('', 'Go deeper:');
  for (const c of COMMANDS) lines.push(`  ${c}`);

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: lines.join('\n'),
    data: {
      schema: 'kadence/v1',
      ok: true,
      sprint:
        sprint === undefined
          ? null
          : { name: sprint.name, endDate: sprint.endDate, daysLeft: left },
      // Full text in the payload: truncation is a display concern, and an agent
      // that gets an ellipsis has no way to ask for the rest.
      mine: ours.map((t) => ({ label: t.label, title: t.title, status: t.status })),
      mineTotal: allMine.length,
      ready: ready.length,
      // The rows, not a count: a count of neglected work is a number nobody can
      // act on, and the whole point of the line is that it names something.
      attention: shownAttention,
      attentionTotal: attention.length,
      decisions,
      notes,
      commands: COMMANDS,
    },
  };
}
