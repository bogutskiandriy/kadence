import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';
import { search, SEARCH_KINDS, type SearchHit } from '../src/core/search.js';

/**
 * Retrieval over the journal.
 *
 * The hard part is not finding things — it is being trustworthy about not
 * finding them. A search that returns three plausible but wrong passages is
 * worse than one that returns nothing: a model handed insufficient context
 * fabricates more than a model handed none. So the tests below care as much
 * about the empty answer and the provenance as about the ranking.
 *
 * Ranking itself is guarded by `test/search-relevance.test.ts`, which runs real
 * questions against this repository's own journal.
 */

const gen = createUlid();

function event(type: FlowEvent['type'], data: Record<string, unknown>, entity?: string): FlowEvent {
  const id = gen();
  return {
    id,
    type,
    entity: entity ?? id,
    actor: 'tester@example.com',
    ts: '2026-09-02T10:00:00.000Z',
    source: 'human',
    data,
  };
}

const task = (title: string, description?: string): FlowEvent =>
  event('task.created', description === undefined ? { title } : { title, description });
const decision = (title: string, why: string, rejected?: string): FlowEvent =>
  event('decision.recorded', rejected === undefined ? { title, why } : { title, why, rejected });
const note = (text: string): FlowEvent => event('note.recorded', { text });
const doc = (title: string, body: string): FlowEvent =>
  event('doc.written', { title, body, parents: [] });

describe('search finds a record by what is written in it', () => {
  it('finds a decision by a word that appears only in its reason', () => {
    const state = project([
      task('Something unrelated'),
      decision('Hand-rolled validation', 'A schema library cost 15% of the startup budget'),
    ]);

    const hits = search(state, 'startup budget');
    expect(hits[0]!.kind).toBe('decision');
    expect(hits[0]!.title).toBe('Hand-rolled validation');
  });

  it('finds a task by a word that appears only in its description', () => {
    const state = project([
      task('Fix the board', 'The cookie is dropped on redirect'),
      decision('Unrelated', 'Because'),
    ]);

    expect(search(state, 'cookie redirect')[0]!.kind).toBe('task');
  });

  it('finds a note', () => {
    const state = project([note('Deleting several tasks by label hits the wrong rows')]);
    expect(search(state, 'deleting by label')[0]!.kind).toBe('note');
  });

  it('finds the alternative a decision rejected, not only what it chose', () => {
    const state = project([
      decision('Events are append-only', 'A journal you can edit is a journal nobody trusts', 'Mutable records with an audit trail'),
    ]);

    expect(search(state, 'mutable audit trail')).toHaveLength(1);
  });

  it('searches a task’s acceptance criteria, which no other command searches', () => {
    const id = gen();
    const state = project([
      { ...task('A task'), id, entity: id },
      event('task.criterion_added', { text: 'the snapshot is rebuilt from events' }, id),
    ]);

    expect(search(state, 'snapshot rebuilt')[0]!.kind).toBe('task');
  });
});

describe('a document is searched by its sections, not whole', () => {
  const body = [
    '# Architecture',
    '',
    'Some opening prose that names nothing in particular.',
    '',
    '## Ordering',
    '',
    'Ordering comes from the ULID, never from the timestamp, because clocks',
    'disagree between machines.',
    '',
    '## Storage',
    '',
    'One file per event, named by its identifier.',
  ].join('\n');

  it('returns the section that matched, not the whole document', () => {
    const state = project([doc('Architecture', body)]);
    const hit = search(state, 'clocks disagree between machines')[0]!;

    expect(hit.kind).toBe('doc');
    expect(hit.span.text).toContain('clocks');
    expect(hit.span.text).not.toContain('One file per event');
  });

  it('says which lines the section came from, so a reader can find it', () => {
    const state = project([doc('Architecture', body)]);
    const hit = search(state, 'clocks disagree between machines')[0]!;

    expect(hit.lines).not.toBeNull();
    const lines = body.split('\n').slice(hit.lines!.from - 1, hit.lines!.to);
    expect(lines.join('\n')).toContain('clocks');
  });

  it('ranks the right section above the wrong one in the same document', () => {
    const state = project([doc('Architecture', body)]);
    const hits = search(state, 'one file per event');

    expect(hits[0]!.span.text).toContain('One file per event');
  });
});

describe('a hit is something an agent can cite', () => {
  it('carries the ULID and never the derived label as its identity', () => {
    const state = project([decision('Use ULIDs', 'Clocks disagree between machines')]);
    const hit = search(state, 'clocks disagree')[0]!;

    expect(hit.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(hit.id).toBe(state.decisions[0]!.id);
    // The label is there for a reader, and it is not what anything looks up by.
    expect(hit.label).toBe('DEC-1');
  });

  it('carries when it was written and by whom', () => {
    const state = project([note('Something learned')]);
    const hit = search(state, 'something learned')[0]!;

    expect(hit.at).toBe('2026-09-02T10:00:00.000Z');
    expect(hit.by).toBe('tester@example.com');
  });

  it('gives offsets that land on the text it quoted', () => {
    const state = project([
      decision('Use ULIDs', 'Ordering comes from the identifier because clocks disagree between machines and the timestamp cannot be trusted'),
    ]);
    const hit = search(state, 'clocks disagree')[0]!;

    // The span is a real slice of something, not a paraphrase: an agent that
    // quotes it is quoting the journal.
    expect(hit.span.end).toBeGreaterThan(hit.span.start);
    expect(hit.span.text.length).toBe(hit.span.end - hit.span.start);
  });
});

describe('how much of the question a hit actually holds', () => {
  /**
   * The number that tells a clear answer from a plausible one.
   *
   * The obvious candidate was the gap between the first hit and the second, and
   * it does not work: measured over the golden set, the gap is 0.10 when the
   * top hit is right and 0.08 when it is wrong. A warning built on it would
   * have fired on more than half the correct answers, and a warning that cries
   * wolf is worse than none.
   *
   * Coverage does separate them — 1.00 against 0.62 at the median — because it
   * is not about ranking at all. It says how much of what was asked is present
   * in this record, weighted by how rare each word is. A passage that answers
   * two words of a five-word question is exactly the passage that reads as an
   * answer and is not one.
   */
  it('is 1 when the record holds every word of the question', () => {
    const state = project([decision('Use ULIDs', 'Clocks disagree between machines')]);
    expect(search(state, 'clocks disagree machines')[0]!.coverage).toBe(1);
  });

  it('falls below 1 when a record is silent on part of the question', () => {
    // Enough records that a word's rarity means something: on a corpus of two,
    // one absent word outweighs everything present and the honest answer is no
    // answer at all, which is a different property.
    const state = project([
      decision('Use ULIDs', 'Ordering comes from the identifier because clocks disagree'),
      note('Clock skew between machines shows up in the journal'),
      note('The board renders its own columns'),
      note('Tests need a git identity'),
      note('A note is read to catch up on what changed'),
      doc('Ordering', '# Ordering\n\nClocks disagree, so ordering uses the identifier.'),
      doc('Storage', '# Storage\n\nOne file per event, named by its identifier.'),
      doc('Claims', '# Claims\n\nA claim is an event and two of them can coexist.'),
    ]);

    const [best] = search(state, 'clocks disagree machines columns');
    expect(best).toBeDefined();
    expect(best!.coverage).toBeLessThan(1);
    expect(best!.coverage).toBeGreaterThan(0);
  });

  it('is lower for a record that answers less of the same question', () => {
    const whole = doc('Ordering', '# Ordering\n\nOrdering comes from the identifier because clocks disagree between machines.');
    const part = doc('Clocks', '# Clocks\n\nClocks are mentioned here and nothing else is.');
    const hits = search(project([whole, part]), 'ordering identifier clocks machines');

    const byTitle = new Map(hits.map((h) => [h.title, h.coverage]));
    expect(byTitle.get('Ordering')!).toBeGreaterThan(byTitle.get('Clocks') ?? 0);
  });

  it('never exceeds 1 or falls below 0', () => {
    const state = project([
      decision('Use ULIDs', 'Clocks disagree between machines'),
      note('Something else entirely about cookies'),
      doc('Ordering', '# Ordering\n\nClocks and identifiers and machines.'),
    ]);
    for (const hit of search(state, 'clocks machines identifiers')) {
      expect(hit.coverage).toBeGreaterThan(0);
      expect(hit.coverage).toBeLessThanOrEqual(1);
    }
  });
});

describe('the empty answer', () => {
  it('returns nothing for a query the journal has no word of', () => {
    const state = project([
      decision('Use ULIDs', 'Clocks disagree between machines'),
      note('The board renders its own columns'),
    ]);

    expect(search(state, 'kubernetes ingress controller')).toEqual([]);
  });

  it('returns nothing rather than the best of a bad lot', () => {
    const state = project([
      note('The board renders its own columns'),
      note('Tests need a git identity'),
    ]);

    // "the" and "a" appear; nothing else does. A hit here would be noise
    // wearing the shape of an answer.
    expect(search(state, 'the a of')).toEqual([]);
  });

  it('an empty query is not an error and not a dump of everything', () => {
    const state = project([note('Something'), note('Something else')]);
    expect(search(state, '   ')).toEqual([]);
  });
});

describe('what is current, and what is not', () => {
  it('leaves a superseded decision out by default', () => {
    const first = decision('Tokens are opaque', 'Simplest thing that works');
    const second = event('decision.recorded', {
      title: 'Tokens are signed',
      why: 'Opaque tokens needed a round trip on every check',
      supersedes: first.id,
    });
    const state = project([first, second]);

    const hits = search(state, 'opaque tokens');
    expect(hits.map((h) => h.title)).not.toContain('Tokens are opaque');
  });

  it('includes it when asked, because history is still the record', () => {
    const first = decision('Tokens are opaque', 'Simplest thing that works');
    const second = event('decision.recorded', {
      title: 'Tokens are signed',
      why: 'Opaque tokens needed a round trip on every check',
      supersedes: first.id,
    });
    const state = project([first, second]);

    const hits = search(state, 'simplest thing that works', { all: true });
    expect(hits.map((h) => h.title)).toContain('Tokens are opaque');
  });
});

describe('narrowing and limiting', () => {
  const state = (): ReturnType<typeof project> =>
    project([
      task('Cookies are dropped on redirect'),
      decision('Cookies are set on the apex domain', 'A subdomain cookie is invisible to the apex'),
      note('Cookies disappear behind the proxy'),
      doc('Cookies', '# Cookies\n\nHow cookies travel through the proxy.'),
    ]);

  it('returns every kind by default', () => {
    const kinds = new Set(search(state(), 'cookies').map((h) => h.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('narrows to the kinds asked for', () => {
    const hits = search(state(), 'cookies', { kinds: ['decision', 'note'] });
    expect(new Set(hits.map((h) => h.kind))).toEqual(new Set(['decision', 'note']));
  });

  it('every kind it advertises is a kind it can return', () => {
    for (const kind of SEARCH_KINDS) {
      expect(() => search(state(), 'cookies', { kinds: [kind] })).not.toThrow();
    }
  });

  it('honours a limit', () => {
    expect(search(state(), 'cookies', { limit: 2 })).toHaveLength(2);
  });

  it('orders by score, highest first', () => {
    const scores = search(state(), 'cookies').map((h) => h.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe('the same journal always gives the same answer', () => {
  /**
   * The search equivalent of invariant I1.
   *
   * `project` sorts by ULID, so the order events are read in cannot change the
   * state. Ranking has to inherit that: a tie broken by insertion order would
   * make the answer depend on which machine read the directory.
   */
  it('ranks identically however the events were read', () => {
    const events = [
      decision('Use ULIDs', 'Clocks disagree between machines'),
      note('Clocks on two machines disagree by seconds'),
      task('Clocks', 'The clock skew shows up in the journal'),
      doc('Clocks', '# Clocks\n\nClock skew between machines is why ordering uses the identifier.'),
    ];
    const shuffled = [events[3]!, events[1]!, events[0]!, events[2]!];

    const a = search(project(events), 'clocks disagree machines');
    const b = search(project(shuffled), 'clocks disagree machines');

    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('breaks a tie by identity, not by whichever was seen first', () => {
    const one = note('Identical text in two notes');
    const two = note('Identical text in two notes');
    const forward = search(project([one, two]), 'identical text');
    const backward = search(project([two, one]), 'identical text');

    expect(forward.map((h) => h.id)).toEqual(backward.map((h) => h.id));
  });
});

describe('text from one person, read by another', () => {
  /**
   * The hole closed in `prime` (KAD-43), at a new boundary: a note is prose
   * somebody wrote, and a hit is rendered into another reader's terminal and
   * another agent's instructions.
   */
  it('strips control characters from the quoted span', () => {
    const esc = String.fromCharCode(27);
    const state = project([note(`Harmless${esc}[2J${esc}[31m payload about cookies`)]);
    const hit = search(state, 'payload cookies')[0]!;

    const controls = [...hit.span.text].filter((c) => {
      const n = c.codePointAt(0)!;
      return n < 0x20 || (n >= 0x7f && n <= 0x9f);
    });
    expect(controls).toHaveLength(0);
  });

  it('keeps a quoted span on one line, so it cannot forge structure', () => {
    const state = project([note('First line about cookies\n\nSecond line about cookies')]);
    const hit = search(state, 'cookies')[0]!;

    expect(hit.span.text).not.toContain('\n');
  });
});

describe('the shape of a hit', () => {
  it('carries exactly the fields the contract names', () => {
    const state = project([decision('Use ULIDs', 'Clocks disagree between machines')]);
    const hit: SearchHit = search(state, 'clocks')[0]!;

    expect(Object.keys(hit).sort()).toEqual(
      ['at', 'by', 'coverage', 'id', 'kind', 'label', 'lines', 'score', 'span', 'title'].sort(),
    );
  });
});
