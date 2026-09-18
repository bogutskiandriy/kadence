import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import { validate, serialize, parse } from '../src/core/event.js';
import type { FlowEvent } from '../src/core/event.js';

const gen = createUlid();

/**
 * One revision of a document. The first revision's id is the document's id,
 * the way a note's or a decision's event id is theirs (ADR-014).
 */
function written(
  entity: string | null,
  data: Record<string, unknown>,
  actor = 'ana@example.com',
): FlowEvent {
  const id = gen();
  return {
    id,
    type: 'doc.written',
    entity: entity ?? id,
    actor,
    ts: '2026-09-18T10:00:00.000Z',
    source: 'human',
    data: { parents: [], ...data },
  };
}

function linked(doc: string, task: string): FlowEvent {
  return {
    id: gen(),
    type: 'doc.linked',
    entity: doc,
    actor: 'ana@example.com',
    ts: '2026-09-18T10:00:00.000Z',
    source: 'agent',
    data: { task },
  };
}

function taskCreated(title: string): FlowEvent {
  const id = gen();
  return {
    id,
    type: 'task.created',
    entity: id,
    actor: 'ana@example.com',
    ts: '2026-09-18T10:00:00.000Z',
    source: 'human',
    data: { title },
  };
}

function shuffle<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('the doc.written event', () => {
  it('needs a title and a body — an empty document is not documentation', () => {
    expect(validate(written(null, { body: 'text' }))).toContain('data.title');
    expect(validate(written(null, { title: 'Auth' }))).toContain('data.body');
  });

  it('needs parents as an array of revision ids', () => {
    const e = written(null, { title: 'Auth', body: 'text', parents: 'nope' });
    expect(validate(e)).toContain('data.parents');
  });

  it('accepts the shape we publish', () => {
    expect(validate(written(null, { title: 'Auth', body: 'How login works.' }))).toEqual([]);
  });

  it('stores a multi-line body as lines, so one changed paragraph is one changed line in git diff', () => {
    const e = written(null, { title: 'Auth', body: 'line one\nline two' });
    const text = serialize(e);
    expect(text).toContain('"line one"');
    expect(parse(text).event!.data!['body']).toBe('line one\nline two');
  });
});

describe('folding documentation', () => {
  it('produces a document with its title, body and a DOC-N label', () => {
    const state = project([written(null, { title: 'Auth', body: 'How login works.' })]);

    expect(state.documents).toHaveLength(1);
    expect(state.documents[0]!.label).toBe('DOC-1');
    expect(state.documents[0]!.title).toBe('Auth');
    expect(state.documents[0]!.body).toBe('How login works.');
    expect(state.documents[0]!.revisions).toBe(1);
    expect(state.documents[0]!.conflicts).toEqual([]);
  });

  it('a revision on top of the current one replaces the text and keeps the count', () => {
    const first = written(null, { title: 'Auth', body: 'v1' });
    const second = written(first.id, { title: 'Auth flow', body: 'v2', parents: [first.id] }, 'bo@example.com');
    const doc = project([first, second]).documents[0]!;

    expect(doc.title).toBe('Auth flow');
    expect(doc.body).toBe('v2');
    expect(doc.revisions).toBe(2);
    expect(doc.revision).toBe(second.id);
    expect(doc.createdBy).toBe('ana@example.com');
    expect(doc.updatedBy).toBe('bo@example.com');
  });

  it('two revisions of the same version are a conflict, not a silent loss', () => {
    const first = written(null, { title: 'Auth', body: 'v1' });
    const mine = written(first.id, { title: 'Auth', body: 'mine', parents: [first.id] });
    const theirs = written(first.id, { title: 'Auth', body: 'theirs', parents: [first.id] }, 'bo@example.com');
    const doc = project([first, mine, theirs]).documents[0]!;

    // The higher ULID is shown (I2); the other is kept and reported.
    expect(doc.body).toBe('theirs');
    expect(doc.conflicts).toHaveLength(1);
    expect(doc.conflicts[0]!.body).toBe('mine');
    expect(doc.conflicts[0]!.revision).toBe(mine.id);
  });

  it('a revision naming both heads resolves the conflict', () => {
    const first = written(null, { title: 'Auth', body: 'v1' });
    const mine = written(first.id, { title: 'Auth', body: 'mine', parents: [first.id] });
    const theirs = written(first.id, { title: 'Auth', body: 'theirs', parents: [first.id] });
    const merged = written(first.id, { title: 'Auth', body: 'both', parents: [mine.id, theirs.id] });
    const doc = project([first, mine, theirs, merged]).documents[0]!;

    expect(doc.body).toBe('both');
    expect(doc.conflicts).toEqual([]);
    expect(doc.revisions).toBe(4);
  });

  it('folds to the same documents whatever order the files are read in (I1)', () => {
    const first = written(null, { title: 'Auth', body: 'v1' });
    const events = [
      first,
      written(first.id, { title: 'Auth', body: 'mine', parents: [first.id] }),
      written(first.id, { title: 'Auth', body: 'theirs', parents: [first.id] }),
      written(null, { title: 'Deploys', body: 'How we ship.' }),
    ];
    const expected = JSON.stringify(project(events).documents);
    for (let seed = 1; seed <= 20; seed++) {
      expect(JSON.stringify(project(shuffle(events, seed)).documents)).toBe(expected);
    }
  });

  it('numbers documents from ULID order, so two branches agree after a merge (I7)', () => {
    const a = written(null, { title: 'A', body: 'a' });
    const b = written(null, { title: 'B', body: 'b' });
    const labels = project([b, a]).documents.map((d) => `${d.label} ${d.title}`);
    expect(labels).toEqual(['DOC-1 A', 'DOC-2 B']);
  });

  it('a revision whose first version has not merged yet still makes a document', () => {
    // The branch that created it is not merged; its revision is. Dropping it
    // would make the state depend on merge order.
    const orphan = written(gen(), { title: 'Later', body: 'text', parents: [gen()] });
    expect(project([orphan]).documents).toHaveLength(1);
  });

  it('counts an event read twice once — the fold does not rely on its caller to dedupe', () => {
    const first = written(null, { title: 'Auth', body: 'v1' });
    const doc = project([first, first]).documents[0]!;
    expect(doc.revisions).toBe(1);
    expect(doc.conflicts).toEqual([]);
  });

  it('skips a malformed revision instead of failing the fold', () => {
    const bad: FlowEvent = { ...written(null, { title: 'x', body: 'y' }), data: { title: 'x' } };
    expect(project([bad]).documents).toEqual([]);
  });
});

describe('documentation linked to work', () => {
  it('carries the tasks it explains, once each', () => {
    const task = taskCreated('Fix login');
    const doc = written(null, { title: 'Auth', body: 'text' });
    const state = project([task, doc, linked(doc.id, task.id), linked(doc.id, task.id)]);

    expect(state.documents[0]!.tasks).toEqual([task.id]);
  });

  it('drops a link to a deleted task, the rule notes and decisions follow', () => {
    const task = taskCreated('Fix login');
    const doc = written(null, { title: 'Auth', body: 'text' });
    const deleted: FlowEvent = {
      id: gen(), type: 'task.deleted', entity: task.id, actor: 'ana@example.com',
      ts: '2026-09-18T10:00:00.000Z', source: 'human',
    };
    const state = project([task, doc, linked(doc.id, task.id), deleted]);

    expect(state.documents[0]!.tasks).toEqual([]);
  });

  it('a link to a document that is not merged yet is not lost', () => {
    const task = taskCreated('Fix login');
    const docId = gen();
    const link = linked(docId, task.id);
    const later = written(docId, { title: 'Auth', body: 'text' });
    // Read in either order, the link lands on the document.
    expect(project([task, link, later]).documents[0]!.tasks).toEqual([task.id]);
    expect(project([later, link, task]).documents[0]!.tasks).toEqual([task.id]);
  });
});
