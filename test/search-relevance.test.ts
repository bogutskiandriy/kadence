import { describe, it, expect } from 'vitest';
import { loadOrBuild } from '../src/core/snapshot.js';
import { search } from '../src/core/search.js';

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
 * Measured at 0.68 over 25 questions and 67 documents.
 *
 * It was 0.75 over twelve, and the twelve were easier than they looked: several
 * repeated the words of the answer, which measures the tokenizer and not the
 * ranking. The set was widened to paraphrases and the honest number fell to
 * 0.60 before any of this was tuned.
 */
const RECALL_FLOOR = 0.64;

/** The corpus this set was written against. Far below it, the answers are meaningless. */
const CORPUS_FLOOR = 50;

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
  { query: 'how does compaction work', expect: 'compaction' },
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

describe('relevance against the real journal', () => {
  const { state } = loadOrBuild(process.cwd());
  const corpus = state.documents.length;

  it.runIf(corpus >= CORPUS_FLOOR)(
    `answers at least ${Math.round(RECALL_FLOOR * 100)}% of real questions in the top three`,
    () => {
      const missed: string[] = [];
      for (const q of QUESTIONS) {
        if (!found(search(state, q.query), q.expect)) missed.push(`${q.query}  →  expected "${[q.expect].flat().join(" | ")}"`);
      }
      const recall = (QUESTIONS.length - missed.length) / QUESTIONS.length;

      // eslint-disable-next-line no-console
      console.log(
        `  recall@3: ${recall.toFixed(2)} (${QUESTIONS.length - missed.length}/${QUESTIONS.length}) over ${corpus} documents` +
          (missed.length > 0 ? `\n  missed:\n    ${missed.join('\n    ')}` : ''),
      );

      expect(recall).toBeGreaterThanOrEqual(RECALL_FLOOR);
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
  });

  it.runIf(corpus < CORPUS_FLOOR)('says why it is not measuring anything', () => {
    // eslint-disable-next-line no-console
    console.log(
      `  relevance not measured: ${corpus} documents, fewer than ${CORPUS_FLOOR}. ` +
        'This set is written against the migrated documentation; a clone without it has nothing to rank.',
    );
    expect(corpus).toBeLessThan(CORPUS_FLOOR);
  });
});
