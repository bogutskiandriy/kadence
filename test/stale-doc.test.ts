import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove, runTaskShow, runTaskClaim, loadState } from '../src/cli/commands/task.js';
import { runDocAdd, runDocEdit, runDocLink } from '../src/cli/commands/doc.js';
import { runPrime } from '../src/cli/commands/prime.js';
import { staleDocuments } from '../src/core/staleness.js';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';
import { readAll, append } from '../src/core/store.js';

/**
 * A document older than the work it describes (KAD-67).
 *
 * Documentation drifting from the code is one of the loudest pains in the
 * category (spec-kit #1191, 115 reactions). kadence already knows which task a
 * document explains; when that task reaches done after the document was last
 * revised, the document describes work that has since moved on, and the
 * journal can say so without guessing what changed.
 *
 * Not when the close follows the revision within a day. On this repository's
 * own journal the literal rule flagged two documents, and both were written
 * minutes before their task was closed — the ordinary way a task that ships a
 * document ends. A day between them is the work moving on.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.parse('2026-09-01T09:00:00.000Z');
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let counter = 0;

/** A valid ULID whose time part is `time` — ordering comes from the ULID (I2). */
function ulidAt(time: number): string {
  let t = time;
  let head = '';
  for (let i = 0; i < 10; i++) {
    head = ALPHABET[t % 32] + head;
    t = Math.floor(t / 32);
  }
  let n = counter++;
  let tail = '';
  for (let i = 0; i < 16; i++) {
    tail = ALPHABET[n % 32] + tail;
    n = Math.floor(n / 32);
  }
  return head + tail;
}

function ev(time: number, type: string, entity: string, data: Record<string, unknown>, id = ulidAt(time)): FlowEvent {
  return { id, type, entity, actor: 'ana@example.com', ts: new Date(time).toISOString(), source: 'human', data } as FlowEvent;
}

/** A small journal: a task, a document explaining it, and what happens after. */
function journal() {
  const events: FlowEvent[] = [];
  const task = (at: number, title = 'Rework login'): string => {
    const id = ulidAt(at);
    events.push(ev(at, 'task.created', id, { title }, id));
    return id;
  };
  const doc = (at: number, title: string, taskId?: string): string => {
    const id = ulidAt(at);
    events.push(ev(at, 'doc.written', id, { title, body: `${title}.`, parents: [] }, id));
    if (taskId !== undefined) events.push(ev(at + 1, 'doc.linked', id, { task: taskId }));
    return id;
  };
  const revise = (at: number, docId: string, parent: string): void => {
    events.push(ev(at, 'doc.written', docId, { title: 'Revised', body: 'Revised.', parents: [parent] }));
  };
  const link = (at: number, docId: string, taskId: string): void => {
    events.push(ev(at, 'doc.linked', docId, { task: taskId }));
  };
  const move = (at: number, taskId: string, to: string): void => {
    events.push(ev(at, 'task.moved', taskId, { from: 'backlog', to }));
  };
  return { events, task, doc, revise, link, move, labels: () => staleDocuments(project(events)).map((s) => s.doc.label) };
}

describe('staleDocuments', () => {
  it('flags a document whose task closed a day or more after its last revision', () => {
    const j = journal();
    const t = j.task(T0);
    j.doc(T0 + HOUR, 'Login design', t);
    j.move(T0 + 3 * DAY, t, 'done');
    const stale = staleDocuments(project(j.events));
    expect(stale.map((s) => s.doc.label)).toEqual(['DOC-1']);
    expect(stale[0]!.tasks.map((x) => x.label)).toEqual(['KAD-1']);
  });

  it('stays quiet when the close follows the revision within a day — the document shipped with the work', () => {
    const j = journal();
    const t = j.task(T0);
    j.doc(T0 + HOUR, 'Login design', t);
    j.move(T0 + 2 * HOUR, t, 'done');
    expect(j.labels()).toEqual([]);
  });

  it('says nothing while the task is still open', () => {
    const j = journal();
    const t = j.task(T0);
    j.doc(T0 + HOUR, 'Login design', t);
    j.move(T0 + 3 * DAY, t, 'in_progress');
    expect(j.labels()).toEqual([]);
  });

  it('clears with a new revision', () => {
    const j = journal();
    const t = j.task(T0);
    const d = j.doc(T0 + HOUR, 'Login design', t);
    j.move(T0 + 3 * DAY, t, 'done');
    j.revise(T0 + 4 * DAY, d, d);
    expect(j.labels()).toEqual([]);
  });

  it('is not raised by a document written after the work was done', () => {
    const j = journal();
    const t = j.task(T0);
    j.move(T0 + DAY, t, 'done');
    j.doc(T0 + 3 * DAY, 'Login design', t);
    expect(j.labels()).toEqual([]);
  });

  it('is raised by linking an older document to work that finished long after it', () => {
    const j = journal();
    const t = j.task(T0);
    const d = j.doc(T0 + HOUR, 'Login design');
    j.move(T0 + 3 * DAY, t, 'done');
    j.link(T0 + 4 * DAY, d, t);
    expect(j.labels()).toEqual(['DOC-1']);
  });

  it('ignores a cancelled task: nothing was built that the document could miss', () => {
    const j = journal();
    const t = j.task(T0);
    j.doc(T0 + HOUR, 'Login design', t);
    j.move(T0 + 3 * DAY, t, 'cancelled');
    expect(j.labels()).toEqual([]);
  });

  it('drops the flag when the task is reopened', () => {
    const j = journal();
    const t = j.task(T0);
    j.doc(T0 + HOUR, 'Login design', t);
    j.move(T0 + 3 * DAY, t, 'done');
    j.move(T0 + 4 * DAY, t, 'in_progress');
    expect(j.labels()).toEqual([]);
  });

  it('names every closed task a document is behind, and only those', () => {
    const j = journal();
    const a = j.task(T0, 'Rework login');
    const b = j.task(T0 + 1, 'Add SSO');
    const c = j.task(T0 + 2, 'Audit log');
    const d = j.doc(T0 + HOUR, 'Login design', a);
    j.link(T0 + HOUR + 10, d, b);
    j.link(T0 + HOUR + 20, d, c);
    j.move(T0 + 3 * DAY, a, 'done');
    j.move(T0 + 3 * DAY + 1, c, 'done');
    j.move(T0 + HOUR + 30, b, 'done');
    expect(staleDocuments(project(j.events))[0]!.tasks.map((x) => x.label)).toEqual(['KAD-1', 'KAD-3']);
  });

  it('puts the most recently outrun first', () => {
    const j = journal();
    const a = j.task(T0);
    const b = j.task(T0 + 1, 'Second');
    j.doc(T0 + HOUR, 'First doc', a);
    j.doc(T0 + HOUR + 10, 'Second doc', b);
    j.move(T0 + 3 * DAY, b, 'done');
    j.move(T0 + 4 * DAY, a, 'done');
    expect(j.labels()).toEqual(['DOC-1', 'DOC-2']);
  });

  it('folds to the same answer whatever order the events are read in (I1)', () => {
    const j = journal();
    const t = j.task(T0);
    j.doc(T0 + HOUR, 'Login design', t);
    j.move(T0 + 3 * DAY, t, 'done');
    const forward = staleDocuments(project(j.events)).map((s) => s.doc.id);
    const backward = staleDocuments(project([...j.events].reverse())).map((s) => s.doc.id);
    expect(backward).toEqual(forward);
    expect(forward).toHaveLength(1);
  });
});

describe('through the commands', () => {
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-stale-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'ana@example.com'], { cwd: dir });
    runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** A document written two days ago for the task: the commands only write "now". */
  function oldDoc(title: string, taskRef: string): void {
    const state = loadState(dir, 'ana@example.com').state;
    const task = state.tasks.find((t) => t.label === taskRef)!;
    const at = Date.now() - 2 * DAY;
    const id = ulidAt(at);
    append(dir, ev(at, 'doc.written', id, { title, body: `${title}.`, parents: [] }, id));
    append(dir, ev(at + 1, 'doc.linked', id, { task: task.id }));
  }

  it('task show marks a linked document the task has outrun, in text and --json', () => {
    runTaskAdd(dir, env, 'Rework login', {});
    oldDoc('Login design', 'KAD-1');
    runTaskMove(dir, env, 'KAD-1', 'done');
    const r = runTaskShow(dir, env, 'KAD-1');
    // On the line under the document it is about, not somewhere in the task.
    expect(r.message).toMatch(/DOC-1[^\n]*\n\s+older than this task's close/);
    const docs = (r.data!['task'] as { documentation: Array<{ stale: boolean }> }).documentation;
    expect(docs[0]!.stale).toBe(true);
  });

  it('task show carries stale: false on a current document, so an agent need not branch on absence', () => {
    runTaskAdd(dir, env, 'Rework login', {});
    runDocAdd(dir, env, 'Login design', { body: 'Sessions live in Redis.', task: 'KAD-1' });
    runTaskMove(dir, env, 'KAD-1', 'done');
    const r = runTaskShow(dir, env, 'KAD-1');
    expect(r.message).not.toMatch(/older than/);
    const docs = (r.data!['task'] as { documentation: Array<{ stale: boolean }> }).documentation;
    expect(docs[0]!.stale).toBe(false);
  });

  it('a revision through doc edit clears it', () => {
    runTaskAdd(dir, env, 'Rework login', {});
    oldDoc('Login design', 'KAD-1');
    runTaskMove(dir, env, 'KAD-1', 'done');
    runDocEdit(dir, env, 'DOC-1', { body: 'Sessions live in Redis; revocation is instant.' });
    expect(staleDocuments(loadState(dir, 'ana@example.com').state)).toEqual([]);
  });

  it('prime lists documents older than the work they describe, with the task that closed', () => {
    runTaskAdd(dir, env, 'Rework login', {});
    oldDoc('Login design', 'KAD-1');
    runTaskMove(dir, env, 'KAD-1', 'done');
    const r = runPrime(dir, env, {});
    expect(r.message).toMatch(/older than the work/i);
    expect(r.message).toMatch(/DOC-1 .*KAD-1/);
    expect(r.data!['staleDocumentation']).toEqual([{ label: 'DOC-1', title: 'Login design', tasks: ['KAD-1'] }]);
    expect(r.data!['staleDocumentationTotal']).toBe(1);
  });

  it('prime prints nothing about it when every document is current', () => {
    runTaskAdd(dir, env, 'Rework login', {});
    runDocAdd(dir, env, 'Login design', { body: 'Sessions live in Redis.', task: 'KAD-1' });
    runTaskClaim(dir, env, 'KAD-1');
    const r = runPrime(dir, env, {});
    expect(r.message).not.toMatch(/older than the work/i);
    expect(r.data!['staleDocumentation']).toEqual([]);
    expect(r.data!['staleDocumentationTotal']).toBe(0);
  });

  it('prime shows at most three and the real count, so a preamble stays a preamble', () => {
    for (let i = 1; i <= 5; i++) runTaskAdd(dir, env, `Task ${i}`, {});
    for (let i = 1; i <= 5; i++) oldDoc(`Doc ${i}`, `KAD-${i}`);
    for (let i = 1; i <= 5; i++) runTaskMove(dir, env, `KAD-${i}`, 'done');
    const r = runPrime(dir, env, {});
    expect((r.data!['staleDocumentation'] as unknown[]).length).toBe(3);
    expect(r.data!['staleDocumentationTotal']).toBe(5);
    expect(r.message).toMatch(/3 of 5/);
  });

  it('reads the same from the journal files as from the fold in memory', () => {
    runTaskAdd(dir, env, 'Rework login', {});
    oldDoc('Login design', 'KAD-1');
    runTaskMove(dir, env, 'KAD-1', 'done');
    expect(staleDocuments(project(readAll(dir).events)).map((x) => x.doc.label)).toEqual(['DOC-1']);
  });
});
