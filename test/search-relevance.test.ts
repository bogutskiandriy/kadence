import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadOrBuild } from '../src/core/snapshot.js';
import { search, searchAll } from '../src/core/search.js';
import { readAll } from '../src/core/store.js';
import { project, type ProjectState } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';

/**
 * Does search answer the questions people actually ask?
 *
 * `test/search.test.ts` proves the mechanism: that a term is found, that a span
 * quotes what it says it quotes, that nothing is returned when nothing matches.
 * None of that says whether the right passage comes back first, and ranking is
 * where a retrieval system quietly decays — a weight changed to fix one query
 * breaks four others, and no unit test notices.
 *
 * So this runs real questions against this repository's own journal and holds
 * the answer rate to a floor. When someone changes the tokenizer, the heading
 * weight or the chunking, the number here moves and says by how much.
 *
 * The floor is below the rate measured when it was written, not equal to it:
 * the journal is live, and a document rewritten tomorrow may legitimately cost
 * a point. A real regression costs several.
 */

/**
 * Two questions below where it sits, not level with it.
 *
 * It was level once, at 0.64, and the next document added to the journal took
 * it to exactly the floor: publishing the release checklist as DOC-64 put a
 * page of release vocabulary into the corpus, shifted the rarity of half a
 * dozen words, and cost one question that had nothing to do with releases.
 *
 * That is the flaw in measuring against a living journal, and it is worth
 * living with: the alternative is a fixture sized to pass, which measures
 * nothing. But it means one question of drift is normal and must not break a
 * build. A ranking regression moves this by several. Two questions of margin
 * is what tells them apart.
 *
 * The number is printed on every run whether it passes or not. Watch the
 * number; the floor is only there to stop the slow slide nobody notices.
 */
const RECALL_FLOOR = 0.56;

/** The corpus this set was written against. Far below it, the answers are meaningless. */
const CORPUS_FLOOR = 50;

/**
 * The benchmark reads the journal as it stood at this event, not as it stands.
 *
 * Measured live, the number measured what we wrote about search: DEC-28 and the
 * notes on the search work quote the golden questions word for word, and began
 * to outrank the records that answer them (plan-search-quality, Phase 0). So the
 * floor is held on a frozen corpus — every event up to and including this ULID,
 * which was the last one on main when it was pinned — and the live journal is
 * still searched, as a drift alarm that reports and does not decide.
 *
 * Ordering is by ULID (I2), so "up to" is the same set on every machine. Re-pin
 * deliberately, with the numbers before and after in the commit, never to make
 * a red run green.
 */
const PINNED = '01M3XZ6NSCHCD22JHHR40GZ1ZZ';
/** How many events the pin holds. A different count means the corpus moved under the pin. */
const PINNED_EVENTS = 1124;
/** Measured on the frozen corpus when it was pinned: 19/25. Two questions of margin, as above. */
const FROZEN_FLOOR = 0.68;

/** The journal as it stood at the pin. Anything written later cannot move the benchmark. */
function frozen(events: readonly FlowEvent[]): FlowEvent[] {
  return events.filter((e) => e.id <= PINNED);
}

interface Question {
  query: string;
  /**
   * Part of the title of a record that answers it, or any of several when more
   * than one honestly does. Titles outlive labels (I7).
   */
  expect: string | readonly string[];
}

/**
 * Questions, not keywords.
 *
 * Each is something that was actually asked of this repository during the work,
 * phrased the way it was asked — including the ones that do not work yet. A
 * golden set of queries chosen because they pass measures nothing.
 */
const QUESTIONS: readonly Question[] = [
  { query: 'why not a validation library', expect: 'Zero runtime dependencies' },
  { query: 'zero runtime dependencies', expect: 'Zero runtime dependencies' },
  { query: 'how is ordering decided between machines', expect: 'invariants' },
  { query: 'what happens when two people edit the same document', expect: 'Documentation lives in the journal' },
  { query: 'why does prime strip newlines', expect: 'prime: strip newlines' },
  { query: 'what did probe A actually establish', expect: 'Probe A' },
  { query: 'how are labels assigned and why can they shift', expect: 'invariants' },
  { query: 'what is the performance budget', expect: 'Product Requirements Document' },
  { query: 'why is the core synchronous', expect: 'Synchronous I/O' },
  // Once expected anything titled "compaction", which no record answering the
  // question carried — the hits were notes quoting the question. DEC-46 is the
  // record that says what compaction does to reads and why it is the remedy.
  { query: 'how does compaction work', expect: 'Reads after a write stay fast through compaction' },
  { query: 'what does the agent contract promise', expect: 'agent contract' },
  { query: 'why are decisions superseded rather than edited', expect: 'Decisions as events' },

  // Paraphrases, not echoes of a title. A set whose questions repeat the words
  // of the answer measures the tokenizer and nothing else.
  { query: 'where do network requests belong', expect: 'network lives in a package' },
  { query: 'why does the terminal interface load only when needed', expect: 'lazily imported TUI' },
  { query: 'what belongs in git and what stays on disk', expect: 'What gets into the repository' },
  { query: 'why store events in this format rather than another', expect: 'JSON as the format' },
  { query: 'what runtime does the core use', expect: 'TypeScript on Node' },
  { query: 'what happens when two people claim the same task', expect: 'Claims as events' },
  { query: 'where is the website hosted', expect: 'Where the landing page lives' },
  { query: 'how do two branches merge a set of labels', expect: 'label set moves as deltas' },
  { query: 'what single number do we watch', expect: ['Metric', 'North Star'] },
  { query: 'who is this product for', expect: ['ICP fit', 'Positioning'] },
  { query: 'what should happen when the user gets something wrong', expect: 'Edge cases' },
  { query: 'how does someone get from install to their first task', expect: ['User flows', 'Story map'] },
  { query: 'what has to be true before version 1.0', expect: ['road to 1.0', 'Roadmap'] },
];

const found = (hits: ReturnType<typeof search>, want: Question['expect']): boolean => {
  const wanted = typeof want === 'string' ? [want] : want;
  return hits
    .slice(0, 3)
    .some((h) => wanted.some((w) => h.title.toLowerCase().includes(w.toLowerCase())));
};

/** Recall@3 over the golden set, and the questions it missed. */
function golden(state: ProjectState): { recall: number; missed: string[] } {
  const missed: string[] = [];
  for (const q of QUESTIONS) {
    if (!found(search(state, q.query), q.expect)) missed.push(`${q.query}  →  expected "${[q.expect].flat().join(' | ')}"`);
  }
  return { recall: (QUESTIONS.length - missed.length) / QUESTIONS.length, missed };
}

function report(name: string, corpus: number, r: { recall: number; missed: string[] }): void {
  // eslint-disable-next-line no-console
  console.log(
    `  ${name} recall@3: ${r.recall.toFixed(2)} (${QUESTIONS.length - r.missed.length}/${QUESTIONS.length}) over ${corpus} documents` +
      (r.missed.length > 0 ? `\n  missed:\n    ${r.missed.join('\n    ')}` : ''),
  );
}

describe('relevance on the frozen corpus', () => {
  const all = readAll(process.cwd()).events;
  const events = frozen(all);
  const state = project(events);
  // A clone made before the pin existed, or a fixture-only checkout, has nothing to rank.
  const pinned = all.some((e) => e.id === PINNED);

  it.runIf(pinned)('holds exactly the events it was pinned with', () => {
    // An older event merged in from a branch lands below the pin and moves the
    // corpus. That is a reason to re-pin on purpose, not to read a new number.
    expect(events.length).toBe(PINNED_EVENTS);
  });

  it.runIf(pinned)(
    `answers at least ${Math.round(FROZEN_FLOOR * 100)}% of real questions in the top three`,
    () => {
      const r = golden(state);
      report('frozen', state.documents.length, r);
      expect(r.recall).toBeGreaterThanOrEqual(FROZEN_FLOOR);
    },
  );

  it.runIf(pinned)('does not move when a note quoting every golden question is written after the pin', () => {
    // What happened to the live number: the notes about search quoted the
    // questions and outranked the answers. Written after the pin, they cannot.
    const quoting: FlowEvent = {
      id: '7ZZZZZZZZZZZZZZZZZZZZZZZZZ',
      type: 'note.recorded',
      entity: '7ZZZZZZZZZZZZZZZZZZZZZZZZZ',
      actor: 'bench@example.com',
      ts: '2099-01-01T00:00:00.000Z',
      source: 'agent',
      data: { text: QUESTIONS.map((q) => q.query).join('. ') },
    };
    expect(golden(project(frozen([...all, quoting]))).recall).toBe(golden(state).recall);
  });
});

/**
 * Fifty questions nobody tunes against (KAD-68).
 *
 * The golden set is small and known: every change to ranking is tried against
 * it, so it slowly stops measuring anything but itself. These were written by
 * an agent that saw the records and never the engine; the phrasings beside
 * each by a second agent that saw only the question, as a caller does before
 * it searches. The numbers are printed and never asserted: a floor here would
 * be one more thing to tune to.
 */
interface HeldOut {
  query: string;
  /** ULIDs of the records that answer it. Stable, unlike KAD-N (I7). */
  targets: readonly string[];
  kind: string;
  phrasings: readonly string[];
}

const HELD_OUT = JSON.parse(
  readFileSync(new URL('./fixtures/search-heldout.json', import.meta.url), 'utf8'),
) as HeldOut[];

/** Where the first target lands among the hits, 1-based, or null when it is not there. */
function rankOf(hits: ReturnType<typeof search>, targets: readonly string[]): number | null {
  const i = hits.findIndex((h) => targets.includes(h.id));
  return i === -1 ? null : i + 1;
}

describe('held-out questions on the frozen corpus — reported, never a floor', () => {
  const all = readAll(process.cwd()).events;
  const state = project(frozen(all));
  const pinned = all.some((e) => e.id === PINNED);
  const ids = new Set<string>([
    ...state.tasks.map((t) => t.id),
    ...state.decisions.map((d) => d.id),
    ...state.documents.map((d) => d.id),
    ...state.notes.map((n) => n.id),
  ]);

  it('is fifty questions, each with three phrasings', () => {
    expect(HELD_OUT).toHaveLength(50);
    for (const q of HELD_OUT) {
      expect(q.phrasings, q.query).toHaveLength(3);
      expect(q.targets.length, q.query).toBeGreaterThan(0);
    }
  });

  it('shares no question with the golden set', () => {
    const golden = new Set(QUESTIONS.map((q) => q.query.toLowerCase()));
    expect(HELD_OUT.filter((q) => golden.has(q.query.toLowerCase()))).toEqual([]);
  });

  it.runIf(pinned)('points every question at a record inside the frozen corpus', () => {
    expect(HELD_OUT.flatMap((q) => q.targets).filter((id) => !ids.has(id))).toEqual([]);
  });

  // A hundred searches, half of them four phrasings fused: past the harness's
  // default five seconds on a busy machine, as the budget test above was. The
  // limit only has to be longer than the loop; nothing here is asserted on time.
  it.runIf(pinned)('prints where the answers land, asked once and asked four ways', () => {
    const line = (name: string, ask: (q: HeldOut) => ReturnType<typeof search>): string => {
      const answers = HELD_OUT.map((q) => ask(q));
      const ranks = answers.map((hits, i) => rankOf(hits, HELD_OUT[i]!.targets));
      const within = (n: number): number => ranks.filter((r) => r !== null && r <= n).length;
      const silent = answers.filter((hits) => hits.length === 0).length;
      return `  held-out ${name} (${HELD_OUT.length}): top-1 ${within(1)}, top-3 ${within(3)}, top-5 ${within(5)}, silent ${silent}`;
    };
    // eslint-disable-next-line no-console
    console.log(
      [
        line('question', (q) => search(state, q.query, { limit: 5 })),
        // The question with its three blind phrasings, as `search --also` fuses them (KAD-70).
        line('+ phrasings', (q) => searchAll(state, [q.query, ...q.phrasings], { limit: 5 })),
      ].join('\n'),
    );
    expect(HELD_OUT.length).toBe(50);
  }, 60_000);
});

describe('relevance against the live journal — a drift alarm', () => {
  const { state } = loadOrBuild(process.cwd());
  const corpus = state.documents.length;

  it.runIf(corpus >= CORPUS_FLOOR)(
    `answers at least ${Math.round(RECALL_FLOOR * 100)}% of real questions in the top three`,
    () => {
      const r = golden(state);
      report('live', corpus, r);
      expect(r.recall).toBeGreaterThanOrEqual(RECALL_FLOOR);
    },
  );

  it.runIf(corpus >= CORPUS_FLOOR)('never answers a question the journal has no words for', () => {
    for (const nonsense of [
      'kubernetes ingress controller annotations',
      'postgres vacuum autovacuum tuning',
      'webpack chunk splitting strategy',
    ]) {
      expect(search(state, nonsense), nonsense).toEqual([]);
    }
  });

  it.runIf(corpus >= CORPUS_FLOOR)('every hit quotes text that is really in the record', () => {
    for (const q of QUESTIONS) {
      for (const hit of search(state, q.query)) {
        expect(hit.span.text.length, `${q.query} → ${hit.id}`).toBe(hit.span.end - hit.span.start);
        expect(hit.span.text.trim().length).toBeGreaterThan(0);
        expect(hit.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      }
    }
  });

  /**
   * Measured on the corpus that exists, not on a fixture sized to pass.
   *
   * The budget is the command's, not the index's: `search` folds the journal
   * and builds an index on every call, because at this size rebuilding costs
   * less than deciding whether a cache went stale. If that stops being true the
   * number here says so before a user does.
   */
  // Seventy-five searches over the live journal: on a CI runner that passed the
  // harness's default five seconds as a whole (5.1 s on Node 22, 2026-10-01)
  // while every query stayed far inside its own budget. The assertion is the
  // budget per query; the limit here only has to be longer than the loop.
  it.runIf(corpus >= CORPUS_FLOOR)('answers inside the budget on the real corpus', () => {
    const questions = QUESTIONS.map((q) => q.query);
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      for (const q of questions) search(state, q);
      best = Math.min(best, (performance.now() - started) / questions.length);
    }

    // eslint-disable-next-line no-console
    console.log(`  a query over ${corpus} documents: ${best.toFixed(0)} ms`);
    expect(best).toBeLessThan(200);
  }, 60_000);

  it.runIf(corpus < CORPUS_FLOOR)('says why it is not measuring anything', () => {
    // eslint-disable-next-line no-console
    console.log(
      `  relevance not measured: ${corpus} documents, fewer than ${CORPUS_FLOOR}. ` +
        'This set is written against the migrated documentation; a clone without it has nothing to rank.',
    );
    expect(corpus).toBeLessThan(CORPUS_FLOOR);
  });
});
