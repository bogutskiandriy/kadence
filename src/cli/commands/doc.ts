import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ulid } from '../../core/ulid.js';
import { append } from '../../core/store.js';
import type { Doc, ProjectState } from '../../core/projection.js';
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
 * Documentation: the current account of something, kept in the journal.
 *
 * Not a note — a note records a moment and never changes; a document is
 * revised and the reader wants the latest. Not a file either: `.md` beside the
 * journal is a second store with no identity and no way to reach an agent
 * except by search (ADR-014). Every revision is a `doc.written` event naming
 * the revisions it was written on top of, so two people revising one version
 * produce a conflict that is shown, never a text that silently disappears.
 */

/**
 * Past this, a document is written with a warning.
 *
 * Agents read long inputs measurably worse (Chroma, "Context Rot"), and the one
 * controlled study of repository context files found descriptive overviews
 * cost tokens without helping (docs/research/repo-docs-hypothesis-2026-09.md).
 * A warning and not a limit: splitting is the author's call.
 */
export const LONG_DOC_BYTES = 16 * 1024;

export interface DocInput {
  /** The text itself. */
  body?: string;
  /** A file to read the text from. The file is read, never kept or linked. */
  file?: string;
  /** Text already read from standard input. */
  stdin?: string;
}

export interface DocAddFields extends DocInput {
  /** A task reference — KAD-N or a ULID. */
  task?: string;
}

export interface DocEditFields extends DocInput {
  title?: string;
}

/** A document is named by its ULID or by the DOC-N label derived while folding. */
export function findDoc(state: ProjectState, ref: string): Doc | undefined {
  const needle = ref.trim().toUpperCase();
  return state.documents.find((d) => d.id === needle || d.label === needle);
}

function docNotFound(ref: string): CommandResult {
  return failure(1, 'doc_not_found', `No document ${ref}.\n  kadence doc list`, {
    received: ref,
    hint: 'kadence doc list --json',
  });
}

const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');

/** The text a caller gave, or the refusal to write without one. */
function readBody(cwd: string, input: DocInput, hint: string): string | CommandResult | undefined {
  // One source. Picking one of two silently would store text the caller did
  // not mean, in a journal that never forgets it.
  const given = [input.body, input.file, input.stdin].filter((x) => x !== undefined).length;
  if (given > 1) {
    return failure(2, 'invalid_argument', 'Give the text one way: --body, --file or --stdin.', { hint });
  }
  if (input.stdin !== undefined) return input.stdin;
  if (input.file !== undefined) {
    const path = resolve(cwd, input.file);
    if (!existsSync(path) || !statSync(path).isFile()) {
      return failure(2, 'invalid_argument', `No file at ${input.file} to read the text from.`, {
        received: input.file,
        hint,
      });
    }
    return readFileSync(path, 'utf8');
  }
  return input.body;
}

function lengthWarning(body: string): string[] {
  return bytesOf(body) > LONG_DOC_BYTES
    ? [
        `This document is ${Math.round(bytesOf(body) / 1024)} KiB, past 16 KiB. Agents read long ` +
          'documents worse; one document per topic keeps what they read short.',
      ]
    : [];
}

/** What `doc list` and `task show` carry: enough to decide whether to read the body. */
export function docSummary(doc: Doc, labelOf: (id: string) => string | null): Record<string, unknown> {
  return {
    id: doc.id,
    label: doc.label,
    title: doc.title,
    bytes: bytesOf(doc.body),
    revisions: doc.revisions,
    tasks: doc.tasks.map(labelOf).filter((l): l is string => l !== null),
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
    source: doc.source,
    conflicted: doc.conflicts.length > 0,
  };
}

function docInFull(doc: Doc, labelOf: (id: string) => string | null): Record<string, unknown> {
  return {
    ...docSummary(doc, labelOf),
    body: doc.body,
    revision: doc.revision,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy,
    conflicts: doc.conflicts,
  };
}

function taskLabels(state: ProjectState): (id: string) => string | null {
  const byId = new Map(state.tasks.map((t) => [t.id, t.label]));
  return (id) => byId.get(id) ?? null;
}

export function runDocAdd(
  cwd: string,
  env: NodeJS.ProcessEnv,
  title: string,
  fields: DocAddFields,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const hint = 'kadence doc add "Auth" --body "How login works."';
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    return failure(2, 'invalid_argument', 'A document needs a title.', { hint });
  }
  const body = readBody(cwd, fields, hint);
  if (typeof body === 'object') return body;
  if (body === undefined || body.trim().length === 0) {
    return failure(
      2,
      'invalid_argument',
      'A document needs text: --body "…", --file <path>, or --stdin.',
      { hint },
    );
  }

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  let taskId: string | null = null;
  if (fields.task !== undefined && fields.task.trim().length > 0) {
    // Checked before anything is written: a document linked to nothing would
    // leave the caller believing the link exists.
    const task = findTask(state, fields.task);
    if (task === undefined) return taskNotFound(fields.task);
    taskId = task.id;
  }

  const id = ulid();
  const ts = new Date().toISOString();
  append(ctx.root, {
    id,
    type: 'doc.written',
    entity: id,
    actor: ctx.actor,
    ts,
    source: ctx.source,
    data: { title: trimmedTitle, body, parents: [] },
  });
  if (taskId !== null) {
    append(ctx.root, {
      id: ulid(),
      type: 'doc.linked',
      entity: id,
      actor: ctx.actor,
      ts,
      source: ctx.source,
      data: { task: taskId },
    });
  }

  // The label comes from the fold, so it is the one every later read agrees on.
  const after = loadState(ctx.root, ctx.actor).state;
  const doc = findDoc(after, id)!;
  const labels = taskLabels(after);
  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...lengthWarning(body)],
    message: `${doc.label} written: ${doc.title}\n  kadence doc show ${doc.label}`,
    data: { schema: 'kadence/v1', ok: true, document: docSummary(doc, labels) },
  };
}

export function runDocEdit(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  fields: DocEditFields,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const doc = findDoc(state, ref);
  if (doc === undefined) return docNotFound(ref);

  const hint = `kadence doc edit ${doc.label} --body "…"`;
  const given = readBody(cwd, fields, hint);
  if (typeof given === 'object') return given;
  if (given !== undefined && given.trim().length === 0) {
    return failure(2, 'invalid_argument', 'A document cannot be emptied; its history would still hold every word.', {
      hint,
    });
  }
  // Settling a conflict means writing the merged text. Without text, the edit
  // would keep whichever version the ULID order happened to show and bury the
  // other — a winner picked by nobody who read them.
  if (doc.conflicts.length > 0 && given === undefined) {
    return failure(
      1,
      'conflicting_state',
      `${doc.label} has ${doc.conflicts.length + 1} versions written on top of the same one. ` +
        `Read them (kadence doc show ${doc.label} --json, under conflicts), then write the merged text:\n` +
        `  kadence doc edit ${doc.label} --file merged.txt`,
      { received: ref, hint: `kadence doc show ${doc.label} --json` },
    );
  }
  const title = fields.title?.trim() || doc.title;
  const body = given ?? doc.body;

  // A revision on top of every head is what resolves a conflict, so writing the
  // text that is already shown is meaningful then — and only then.
  if (title === doc.title && body === doc.body && doc.conflicts.length === 0) {
    return failure(2, 'invalid_argument', `Nothing to change: ${doc.label} already reads that way.`, {
      received: ref,
      hint,
    });
  }

  const parents = [...doc.conflicts.map((c) => c.revision), doc.revision];
  append(ctx.root, {
    id: ulid(),
    type: 'doc.written',
    entity: doc.id,
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { title, body, parents },
  });

  const after = loadState(ctx.root, ctx.actor).state;
  const updated = findDoc(after, doc.id)!;
  const resolved = doc.conflicts.length > 0 ? ` The ${doc.conflicts.length + 1} competing versions are now one.` : '';
  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...lengthWarning(body)],
    // Said every time: an append-only journal keeps every revision, and an edit
    // that read like an erasure would be a promise the design cannot keep.
    message: `${updated.label} revised (${updated.revisions} revisions; earlier ones stay in the journal).${resolved}`,
    data: { schema: 'kadence/v1', ok: true, document: docSummary(updated, taskLabels(after)) },
  };
}

export function runDocShow(cwd: string, env: NodeJS.ProcessEnv, ref: string): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const doc = findDoc(state, ref);
  if (doc === undefined) return docNotFound(ref);

  const labels = taskLabels(state);
  const tasks = doc.tasks.map(labels).filter((l): l is string => l !== null);
  const lines = [
    `${doc.label}  ${doc.title}`,
    `  ${doc.revisions} revision${doc.revisions === 1 ? '' : 's'}, last ${doc.updatedAt.slice(0, 10)} by ${doc.updatedBy}${doc.source === 'agent' ? ' [agent]' : ''}`,
    ...(tasks.length > 0 ? [`  Explains: ${tasks.join(', ')}`] : []),
    '',
    doc.body,
  ];
  const conflictWarning =
    doc.conflicts.length === 0
      ? []
      : [
          `${doc.label} has ${doc.conflicts.length + 1} versions written on top of the same one. Shown: the latest. ` +
            `Also written: ${doc.conflicts.map((c) => `${c.at.slice(0, 10)} by ${c.by}`).join('; ')} ` +
            `(in --json under conflicts). Write the merged text with kadence doc edit ${doc.label} --file <path> to settle it.`,
        ];
  return {
    ok: true,
    exitCode: 0,
    warnings: [...warnings, ...conflictWarning],
    message: lines.join('\n'),
    data: { schema: 'kadence/v1', ok: true, document: docInFull(doc, labels) },
  };
}

export function runDocList(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: { task?: string },
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  let docs = state.documents;
  if (options.task !== undefined && options.task.trim().length > 0) {
    const task = findTask(state, options.task);
    if (task === undefined) return taskNotFound(options.task);
    docs = docs.filter((d) => d.tasks.includes(task.id));
  }

  const labels = taskLabels(state);
  if (docs.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message:
        'No documentation yet.\nWrite the first one:\n  kadence doc add "Auth" --body "How login works." --task KAD-1',
      data: { schema: 'kadence/v1', ok: true, documents: [] },
    };
  }
  const width = Math.max(...docs.map((d) => d.label.length));
  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: docs
      .map((d) => {
        const tasks = d.tasks.map(labels).filter((l): l is string => l !== null);
        const kib = `${Math.max(1, Math.round(bytesOf(d.body) / 1024))} KiB`;
        const flag = d.conflicts.length > 0 ? '  [conflict]' : '';
        return `${d.label.padEnd(width)}  ${d.title}  (${kib}${tasks.length > 0 ? `, ${tasks.join(' ')}` : ''})${flag}`;
      })
      .join('\n'),
    data: { schema: 'kadence/v1', ok: true, documents: docs.map((d) => docSummary(d, labels)) },
  };
}

export function runDocLink(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  taskRef: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const doc = findDoc(state, ref);
  if (doc === undefined) return docNotFound(ref);
  const task = findTask(state, taskRef);
  if (task === undefined) return taskNotFound(taskRef);

  const linked = !doc.tasks.includes(task.id);
  if (linked) {
    append(ctx.root, {
      id: ulid(),
      type: 'doc.linked',
      entity: doc.id,
      actor: ctx.actor,
      ts: new Date().toISOString(),
      source: ctx.source,
      data: { task: task.id },
    });
  }
  const after = linked ? loadState(ctx.root, ctx.actor).state : state;
  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: `${doc.label} explains ${task.label}. It now arrives with kadence task show ${task.label}.`,
    data: {
      schema: 'kadence/v1',
      ok: true,
      // The same shape every doc command answers with; the contract promises it.
      document: docSummary(findDoc(after, doc.id)!, taskLabels(after)),
      task: { id: task.id, label: task.label },
    },
  };
}
