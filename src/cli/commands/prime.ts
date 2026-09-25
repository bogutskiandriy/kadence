import { resolveContext, isContext, loadState, claimantOf, type CommandResult } from './task.js';
import { readyTasks, holdsClaim } from '../../core/query.js';
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
 * Documentation of the work you hold, by title. The one place a document
 * reaches an agent without a search term, which is the case for linking it at
 * all (Probe D, ADR-014). Bodies stay one `doc show` away.
 */
const DOC_LIMIT = 3;
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
/**
 * What one free-text field may carry in `--json`.
 *
 * The payload deliberately carries more than the text does: an agent has no
 * line to fit, and an ellipsis it cannot expand is worse than a longer answer.
 * That reasoning holds for prose a person wrote. It stops holding at 200 KB,
 * where the one command written to a budget becomes the thing it exists to
 * prevent — a single note made `prime --json` 200,728 bytes while the text
 * stayed at 578 (stress audit §3).
 *
 * The cap sits where nothing real reaches it: the journal's own notes run 285
 * characters at the median and 642 at the longest. What is cut says how much
 * there was, so the agent still knows to go and read it.
 */
const JSON_TEXT_LIMIT = 2000;
/** Shown only when no decision is in force. */
const DECISION_HINT = 'record why: kadence decision add "…" --why "…"';

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

/**
 * Unicode general category Cc: C0 and C1 controls, which is every line
 * break and every escape.
 *
 * Not `\s`: a tab is whitespace and harmless, an ESC is neither.
 */
const CONTROL = /\p{Cc}/gu;

/**
 * One line, at most TITLE_LIMIT characters.
 *
 * Collapsing is not cosmetic. `prime` renders prose one person wrote into
 * another reader's instructions, and it is the one command an agent is handed
 * without asking for it. The length was capped here; the shape was not. So a
 * note carrying newlines rendered as sections of its own — and the cheapest
 * section to forge is the `Go deeper:` block this command ends with. An escape
 * sequence goes further and repaints the terminal around the output. Same
 * fault, one character apart (stress audit §3, F9).
 *
 * Controls become spaces rather than vanishing: joining `a\nb` into `ab` would
 * invent a word that nobody wrote.
 */
function short(text: string): string {
  const oneLine = text.replace(CONTROL, ' ').replace(/\s+/gu, ' ').trim();
  const chars = [...oneLine];
  return chars.length > TITLE_LIMIT ? `${chars.slice(0, TITLE_LIMIT - 1).join('')}…` : oneLine;
}

/**
 * Whole, or its first JSON_TEXT_LIMIT characters.
 *
 * Characters, not code units: cutting a string in half through an astral pair
 * leaves a lone surrogate, and a lone surrogate is not text any more.
 */
function capped(text: string): string {
  const chars = [...text];
  return chars.length > JSON_TEXT_LIMIT
    ? `${chars.slice(0, JSON_TEXT_LIMIT - 1).join('')}…`
    : text;
}

/** Whole days from today to the sprint's end, or null when there is no end. */
function daysLeft(endDate: string | null, today: Date): number | null {
  if (endDate === null) return null;
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(end)) return null;
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return Math.round((end - now) / 86_400_000);
}

/**
 * Work already on this plate: claimed, contested, or assigned and in progress.
 *
 * A person's plate includes what their agents hold; an agent's holds only its
 * own claims (`holdsClaim`). Assignment is to a person, so it is compared with
 * the git email, never with an agent's `#name`.
 *
 * A claim you lost is on your plate too (KAD-41). It is the one case where the
 * journal knows something you are about to get wrong: without it here, the
 * agent that lost read `mine: []` and either started the task anyway or took
 * another, while every other command already reported the contest.
 */
function mine(state: ProjectState, claimant: string, person: string): Task[] {
  return state.tasks.filter(
    (t) =>
      holdsClaim(t.claimedBy, claimant) ||
      t.contestedBy.some((c) => holdsClaim(c, claimant)) ||
      (t.assignee === person && t.status === state.started),
  );
}

/**
 * The contest on one line, from where the reader stands.
 *
 * Inline rather than a section of its own: a contested task is already in
 * `Yours`, and a second heading would spend two of the forty lines to say it
 * twice.
 */
function contestNote(task: Task, claimant: string): string {
  if (task.contestedBy.length === 0) return '';
  // A person whose own agents all took the same task is not in a contest with
  // anyone: listing their agents as "also claimed by" reads as other people.
  const claims = [task.claimedBy, ...task.contestedBy];
  if (!claimant.includes('#') && claims.every((c) => holdsClaim(c, claimant))) {
    const allAgents = claims.every((c) => c !== claimant);
    return `  [contested: ${claims.length} of your ${allAgents ? 'agents' : 'claims'} collided \u2014 keep one, release the rest]`;
  }
  if (holdsClaim(task.claimedBy, claimant)) {
    return `  [contested: also claimed by ${task.contestedBy.join(', ')}]`;
  }
  return `  [contested: ${task.claimedBy ?? 'nobody'} holds it \u2014 talk before starting]`;
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
  const claimant = claimantOf(ctx, env);
  const allMine = mine(state, claimant, ctx.actor);
  // Contested first, then the newest: "what am I working on" is answered by the
  // most recent thing taken, but a contest is what must not fall past the cap.
  const ours = [...allMine]
    .reverse()
    .sort((a, b) => Number(b.contestedBy.length > 0) - Number(a.contestedBy.length > 0))
    .slice(0, MINE_LIMIT);
  const ready = readyTasks(state.tasks, {
    viewer: claimant,
    statuses: state.statuses,
    started: state.started,
  });
  const attention = attentionReport(state, today, ATTENTION_IDLE_DAYS).rows;
  const shownAttention = attention.slice(0, ATTENTION_LIMIT);
  // Titles only. The reason behind a decision is what makes it long, and it is
  // one command away — carrying it here would cost every turn of the session.
  const decisions = state.decisions
    .filter((d) => d.supersededBy === null)
    .slice(-DECISION_LIMIT)
    .reverse()
    .map((d) => ({ label: d.label, title: capped(d.title) }));
  const notes = state.notes
    .slice(-NOTE_LIMIT)
    .reverse()
    // `bytes` is the full length, not the carried one: the same signal
    // `documentation` gives, and the only way a cut note stays actionable.
    .map((n) => ({
      text: capped(n.text),
      bytes: Buffer.byteLength(n.text, 'utf8'),
      by: n.by,
      task: labelOf(state, n.task),
    }));

  // All of your work, not only the five shown: documentation for the sixth
  // task is still documentation you hold.
  const held = new Set(allMine.map((t) => t.id));
  const allDocumentation = state.documents
    .flatMap((d) => {
      const task = d.tasks.find((id) => held.has(id));
      return task === undefined
        ? []
        : [{ label: d.label, title: capped(d.title), task: labelOf(state, task), bytes: Buffer.byteLength(d.body, 'utf8') }];
    });
  const documentation = allDocumentation.slice(0, DOC_LIMIT);

  const lines: string[] = [];
  // Only when there is one. Sprints are optional, and "No active sprint." at the
  // top of every session tells a team that never uses them that it is doing
  // something wrong (T110).
  if (sprint !== undefined) {
    lines.push(`Sprint: ${sprint.name}${left === null ? '' : `, ${left} day(s) left`}`, '');
  }

  // The count is the real one, not the shown one: "Yours (5)" while seven are
  // hidden is the kind of number that makes a reader stop trusting the rest.
  const minePart = allMine.length > ours.length ? `${ours.length} of ${allMine.length}` : `${ours.length}`;
  lines.push(allMine.length === 0 ? 'Nothing claimed by you.' : `Yours (${minePart}):`);
  for (const t of ours) lines.push(`  ${t.label} ${t.status}  ${short(t.title)}${contestNote(t, claimant)}`);

  // Nothing linked, nothing printed: a heading over an empty list would teach
  // every session to skip it.
  if (documentation.length > 0) {
    const part =
      allDocumentation.length > documentation.length
        ? `${documentation.length} of ${allDocumentation.length}`
        : `${documentation.length}`;
    lines.push('', `Documentation for your work (${part}):  (kadence doc show DOC-N)`);
    for (const d of documentation) lines.push(`  ${d.label} ${short(d.title)}  (${d.task})`);
  }

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
  } else {
    // One line, and only while the journal holds no reasons at all: the empty
    // state is where the habit either starts or does not.
    lines.push('', DECISION_HINT);
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
          : { name: capped(sprint.name), endDate: sprint.endDate, daysLeft: left },
      // Full text in the payload: truncation is a display concern, and an agent
      // that gets an ellipsis has no way to ask for the rest.
      // `claimedBy` and `contestedBy` so an agent can tell a task it holds from
      // one it lost, without a second call. Always present.
      mine: ours.map((t) => ({
        label: t.label,
        title: capped(t.title),
        status: t.status,
        claimedBy: t.claimedBy,
        contestedBy: t.contestedBy,
      })),
      mineTotal: allMine.length,
      documentation,
      documentationTotal: allDocumentation.length,
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
