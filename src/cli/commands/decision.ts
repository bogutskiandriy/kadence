import { existsSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { ulid } from '../../core/ulid.js';
import { append } from '../../core/store.js';
import type { Decision, ProjectState } from '../../core/projection.js';
import {
  resolveContext,
  isContext,
  loadState,
  failure,
  findTask,
  taskNotFound,
  type CommandResult,
} from './task.js';

/** A decision is named by its ULID or by the DEC-N label derived while folding. */
export function findDecision(state: ProjectState, ref: string): Decision | undefined {
  const needle = ref.toUpperCase();
  return state.decisions.find((d) => d.id === needle || d.label === needle);
}

function decisionNotFound(ref: string): CommandResult {
  return failure(1, 'decision_not_found', `No decision ${ref}.\n  kadence decision list`, {
    received: ref,
    hint: 'kadence decision list --json',
  });
}

/** Everything a caller may attach to a decision. */
export interface DecisionFields {
  why?: string;
  rejected?: string;
  task?: string;
  supersedes?: string;
  docs?: string[];
}

export function runDecisionAdd(
  cwd: string,
  env: NodeJS.ProcessEnv,
  title: string,
  fields: DecisionFields,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    return failure(2, 'invalid_argument', 'A decision needs a title.', {
      hint: 'kadence decision add "Use ULIDs" --why "Clocks disagree between machines"',
    });
  }

  // The reason is the whole point: without it this is a changelog line.
  const why = fields.why?.trim() ?? '';
  if (why.length === 0) {
    return failure(2, 'invalid_argument', 'A decision needs a reason.\n  --why "..."', {
      received: trimmedTitle,
      hint: 'kadence decision add "Use ULIDs" --why "Clocks disagree between machines"',
    });
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  // Both references are resolved before anything is written: a decision that
  // points at nothing is worse than a decision that was refused.
  let taskId: string | undefined;
  if (fields.task !== undefined) {
    const task = findTask(state, fields.task);
    if (task === undefined) return taskNotFound(fields.task);
    taskId = task.id;
  }

  let supersedesId: string | undefined;
  if (fields.supersedes !== undefined) {
    const earlier = findDecision(state, fields.supersedes);
    if (earlier === undefined) return decisionNotFound(fields.supersedes);
    supersedesId = earlier.id;

    // A replacement is about the same work unless it says otherwise. Without
    // this, superseding silently strips a task of its reasoning: the old
    // decision drops out of `task show` and the new one was never attached.
    // Found by installing the package and using it, with the suite green.
    if (taskId === undefined && earlier.task !== null) taskId = earlier.task;
  }

  // Paths are stored relative to the repository root: an absolute path breaks
  // the moment the journal reaches another machine, which is the whole point of
  // keeping it in git.
  const docs = (fields.docs ?? []).map((d) =>
    isAbsolute(d) ? relative(ctx.root, d) : d.replace(/^\.\//, ''),
  );

  // A missing document is a warning, never a refusal: it may arrive in a later
  // commit or live on another branch, and refusing would make the journal
  // depend on what happens to be checked out.
  const missing = docs.filter((d) => !existsSync(join(ctx.root, d)));
  const docWarnings = missing.map(
    (d) => `No file at ${d} — the link is recorded anyway; it may arrive later.`,
  );

  const id = ulid();
  append(ctx.root, {
    id,
    type: 'decision.recorded',
    entity: id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: {
      title: trimmedTitle,
      why,
      ...(fields.rejected !== undefined ? { rejected: fields.rejected.trim() } : {}),
      ...(taskId !== undefined ? { task: taskId } : {}),
      ...(supersedesId !== undefined ? { supersedes: supersedesId } : {}),
      ...(docs.length > 0 ? { docs } : {}),
    },
  });

  // Re-folded rather than guessed: the label comes from the journal, which is
  // the only place that knows what this decision is called.
  const recorded = loadState(ctx.root, ctx.actor).state.decisions.find((d) => d.id === id);
  const label = recorded?.label ?? id;

  // Superseding is the one place worth explaining, because the property is
  // invisible otherwise: in a file-based tool this is two edits and teams do
  // one. Saying so is how the advantage reaches the person using it.
  const supersedeNote =
    supersedesId === undefined
      ? ''
      : `\nIt replaces ${fields.supersedes}, and both links were written by one event — ` +
        'neither side can go stale.';

  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...docWarnings],
    message: `${label} recorded.${supersedeNote}`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      decision: { id, label, title: trimmedTitle },
    },
  };
}

export interface DecisionListOptions {
  /** Include superseded decisions, which are hidden by default. */
  all?: boolean;
  task?: string;
}

export function runDecisionList(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: DecisionListOptions,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  let decisions = state.decisions;
  if (options.task !== undefined) {
    const task = findTask(state, options.task);
    if (task === undefined) return taskNotFound(options.task);
    decisions = decisions.filter((d) => d.task === task.id);
  }
  // The default is the safe one: an agent handed a superseded reason as current
  // is worse than an agent with no memory at all.
  if (options.all !== true) decisions = decisions.filter((d) => d.supersededBy === null);

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: renderDecisions(decisions, state),
    data: {
      schema: 'kadence/v1',
      ok: true,
      decisions: decisions.map((d) => serializeDecision(d, state)),
    },
  };
}

export function runDecisionShow(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const decision = findDecision(state, ref);
  if (decision === undefined) return decisionNotFound(ref);

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: renderDecision(decision, state),
    data: { schema: 'kadence/v1', ok: true, decision: serializeDecision(decision, state) },
  };
}

/** Labels travel better than ULIDs in output an agent will quote back to a human. */
function labelOf(state: ProjectState, id: string | null): string | null {
  if (id === null) return null;
  return (
    state.decisions.find((d) => d.id === id)?.label ??
    state.tasks.find((t) => t.id === id)?.label ??
    id
  );
}

function serializeDecision(d: Decision, state: ProjectState): Record<string, unknown> {
  return {
    id: d.id,
    label: d.label,
    title: d.title,
    why: d.why,
    rejected: d.rejected,
    task: labelOf(state, d.task),
    docs: d.docs,
    supersedes: labelOf(state, d.supersedes),
    supersededBy: labelOf(state, d.supersededBy),
    superseded: d.supersededBy !== null,
    at: d.at,
    by: d.by,
    source: d.source,
  };
}

function renderDecisions(decisions: readonly Decision[], state: ProjectState): string {
  if (decisions.length === 0) {
    return (
      'No decisions recorded yet.\n' +
      'Record the first one:\n  kadence decision add "Use ULIDs" --why "Clocks disagree"'
    );
  }
  return decisions
    .map((d) => {
      const note = d.supersededBy === null ? '' : ` (superseded by ${labelOf(state, d.supersededBy)})`;
      // Only the agent case is marked: in a repository written mostly by people,
      // labelling every human record is noise that hides the exception.
      const who = d.source === 'agent' ? ' [agent]' : '';
      return `${d.label}  ${d.title}${note}${who}`;
    })
    .join('\n');
}

function renderDecision(d: Decision, state: ProjectState): string {
  const lines = [`${d.label}  ${d.title}`];

  // Printed before the reasoning, not after it. A superseded decision read as
  // current is the failure this command exists to prevent, and a note at the
  // bottom is a note most readers never reach.
  if (d.supersededBy !== null) {
    lines.push('', `!! SUPERSEDED by ${labelOf(state, d.supersededBy)} — this is no longer in force.`);
  }

  lines.push('', `Why:      ${d.why}`);
  if (d.rejected !== null) lines.push(`Rejected: ${d.rejected}`);
  if (d.task !== null) lines.push(`Task:     ${labelOf(state, d.task)}`);
  if (d.docs.length > 0) lines.push(`Docs:     ${d.docs.join(', ')}`);
  lines.push(`By:       ${d.by}${d.source === 'agent' ? ' (agent)' : ''}`);
  if (d.supersedes !== null) lines.push(`Replaces: ${labelOf(state, d.supersedes)}`);
  return lines.join('\n');
}
