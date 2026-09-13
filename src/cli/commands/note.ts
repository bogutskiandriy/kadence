import { ulid } from '../../core/ulid.js';
import { append } from '../../core/store.js';
import type { Note, ProjectState } from '../../core/projection.js';
import {
  resolveContext,
  isContext,
  loadState,
  failure,
  findTask,
  taskNotFound,
  type CommandResult,
} from './task.js';

/**
 * Notes: an insight that never had an alternative.
 *
 * `decision` answers "why did we choose this, and what did we turn down".
 * Plenty of what a team learns has no alternative to reject — "tests need a
 * git identity", "the redirect drops the cookie" — and forcing that shape onto
 * it produces decisions with a hollow `why`. So notes carry text and nothing
 * else: no reason, no supersedes, no number. The help says when to reach for a
 * decision instead, because the two are easy to confuse and only one of them
 * is the layer this product is known for.
 */

export interface NoteFields {
  /** A task reference — KAD-N or a ULID. */
  task?: string;
}

export interface NoteListOptions {
  task?: string;
  limit?: number;
  json?: boolean;
}

/** The sentence that keeps the two commands apart, printed where it is needed. */
const WHEN_A_DECISION =
  'A note records something learned. When there was a choice and something was\n' +
  'turned down, record it as a decision instead:\n' +
  '  kadence decision add "title" --why "reason"';

function serializeNote(note: Note, labelOf: (id: string | null) => string | null): Record<string, unknown> {
  return {
    id: note.id,
    text: note.text,
    task: labelOf(note.task),
    at: note.at,
    by: note.by,
    source: note.source,
  };
}

export function runNoteAdd(
  cwd: string,
  env: NodeJS.ProcessEnv,
  text: string,
  fields: NoteFields,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return failure(2, 'invalid_argument', `A note needs text.\n\n${WHEN_A_DECISION}`, {
      hint: 'kadence note "Tests need a git identity"',
    });
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  let taskId: string | null = null;
  let taskLabel: string | null = null;
  if (fields.task !== undefined && fields.task.trim().length > 0) {
    // A note pointing at nothing is worse than no note: it would surface in
    // `prime` with a reference the reader cannot follow.
    const task = findTask(state, fields.task);
    if (task === undefined) return taskNotFound(fields.task);
    taskId = task.id;
    taskLabel = task.label;
  }

  const id = ulid();
  append(ctx.root, {
    id,
    type: 'note.recorded',
    entity: id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: taskId === null ? { text: trimmed } : { text: trimmed, task: taskId },
  });

  const where = taskLabel === null ? '' : ` on ${taskLabel}`;
  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `Note recorded${where}.`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      note: { id, text: trimmed, task: taskLabel },
    },
  };
}

export function runNoteList(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: NoteListOptions,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  let filtered = state.notes;
  if (options.task !== undefined && options.task.trim().length > 0) {
    const task = findTask(state, options.task);
    if (task === undefined) return taskNotFound(options.task);
    filtered = filtered.filter((n) => n.task === task.id);
  }

  // Newest first: a note is read to catch up, and the last thing learned is
  // the thing most likely to matter.
  const newest = [...filtered].reverse();
  const shown = options.limit !== undefined && options.limit > 0 ? newest.slice(0, options.limit) : newest;

  if (shown.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: `No notes yet.\nRecord the first one:\n  kadence note "text"\n\n${WHEN_A_DECISION}`,
      data: { schema: 'kadence/v1', ok: true, notes: [] },
    };
  }

  // Built once: a closure per element would do a linear scan per note.
  const label = labelOf(state);
  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: shown.map((n) => renderNote(n, label)).join('\n'),
    data: { schema: 'kadence/v1', ok: true, notes: shown.map((n) => serializeNote(n, label)) },
  };
}

/** Task ULIDs mean nothing to a reader; labels are what they see everywhere else. */
export function labelOf(state: ProjectState): (id: string | null) => string | null {
  return (id) => (id === null ? null : (state.tasks.find((t) => t.id === id)?.label ?? null));
}

export function renderNote(note: Note, label: (id: string | null) => string | null): string {
  const task = label(note.task);
  const where = task === null ? '' : ` ${task}`;
  // Only the agent case is marked: labelling every human note in a repository
  // written mostly by people hides the exception (the rule ADR-010 set).
  const who = note.source === 'agent' ? ` ${note.by} [agent]` : ` ${note.by}`;
  return `${note.at.slice(0, 10)}${where}${who}\n  ${note.text}`;
}
