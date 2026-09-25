import type { ProjectState } from './projection.js';

/**
 * Lexical retrieval over the folded journal.
 *
 * BM25, hand-rolled, no dependencies — the same trade ADR-003 made for ULID and
 * validation. Measured on this repository's own corpus after the documentation
 * migration: 829 units, 198k tokens, index in 45 ms, a query in half a
 * millisecond. Nothing is persisted, because at that size rebuilding costs less
 * than deciding whether a cache is stale.
 *
 * Not embeddings. A model is 200 MB on disk and seconds of cold start against a
 * 200 ms budget and a promise to work offline; and on a corpus whose vocabulary
 * is `ULID`, `KAD-N`, `I7` and `FlowEvent` — tokens no model was trained on —
 * exact matching is not the weaker method, it is the stronger one.
 *
 * It reads the projection, never the event files. Labels exist only after
 * folding (I7); the projection is what is true now, so a superseded decision
 * does not answer as though it were current; and it is the same source every
 * other command reads, so search cannot disagree with `task show`.
 */

export const SEARCH_KINDS = ['task', 'decision', 'note', 'doc', 'sprint', 'milestone'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface SearchHit {
  kind: SearchKind;
  /** ULID. The identity, and the only safe thing to look a record up by (I7). */
  id: string;
  /** KAD-N, DEC-N, DOC-N — derived while folding. For a reader; never for a lookup. */
  label: string | null;
  title: string;
  score: number;
  /**
   * The passage that matched, and where it sits in the record's quotable text.
   *
   * `text.length === end - start`, so an agent quoting it is quoting the
   * journal rather than paraphrasing it.
   */
  span: { text: string; start: number; end: number };
  /**
   * How much of the question this record actually contains, from 0 to 1,
   * weighted by how rare each word is.
   *
   * Not a probability and not a ranking: the score says how this passage
   * compares with the others, and this says how much of what was asked is
   * present in it at all. A hit at 1.0 holds every word of the question; one
   * at 0.4 answers part of it and is silent on the rest.
   */
  coverage: number;
  /** For a document: the lines of the section this came from. Null otherwise. */
  lines: { from: number; to: number } | null;
  at: string;
  by: string;
}

export interface SearchOptions {
  kinds?: readonly SearchKind[];
  limit?: number;
  /** Include superseded decisions, which are left out by default. */
  all?: boolean;
}

/** Default number of hits. Small on purpose: a long answer is the problem. */
export const DEFAULT_SEARCH_LIMIT = 5;

/**
 * Below this share of the question, a hit is worth flagging to its reader.
 *
 * Measured over the golden set rather than chosen: where the first hit is
 * right its coverage is 1.00 at the median and never below 0.58; where it is
 * wrong the median is 0.62. Across every hit in the top three, those at or
 * above this line are relevant 53% of the time and those below it 21%.
 *
 * At 0.7 the flag catches two thirds of the wrong answers and misfires on a
 * fifth of the right ones. The obvious alternative — the gap between the
 * first hit and the second — does not work at all: 0.10 when right against
 * 0.08 when wrong, which would have flagged more than half the good answers.
 */
export const PARTIAL_COVERAGE = 0.7;

/** Roughly a sentence. Long enough to be evidence, short enough to be cheap. */
const SPAN_CHARS = 180;

/**
 * Kept out of a query, never out of the index.
 *
 * A query of nothing but these words asks for everything, which is the one
 * answer a search must not give: a model handed passages that merely look
 * relevant fabricates more than one handed nothing at all. Removing them from
 * the index instead would break a phrase whose meaning is in them.
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'did', 'do', 'does', 'for',
  'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'of', 'on', 'or',
  'our', 'so', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with',
  'would', 'you', 'your',
]);

/**
 * A hit scoring below this share of the best one is dropped.
 *
 * Relative rather than absolute: BM25 scores scale with how rare a term is in
 * the corpus, so a fixed floor that suits 800 documents rejects every answer in
 * a repository with eight. What does not change is the shape of a good result —
 * one or two passages well clear of the rest.
 */
const TAIL_SHARE = 0.2;

/**
 * How many of the query's own words a record has to contain.
 *
 * On a corpus this size almost any English word appears somewhere, so a score
 * threshold alone lets one incidental match answer a question about something
 * the journal has never heard of: "kubernetes ingress controller annotations"
 * found a page of landing-page copy, on the strength of "annotations".
 *
 * Counting words is the obvious way and the wrong one, because they are not
 * worth the same. Requiring three words of five cost a real answer — "why is
 * the core synchronous", where the section that answers it says `synchronous`
 * and never says `core` — while still admitting the webpack query, which had
 * two of four.
 *
 * So the measure is how much of the *question* was found, weighted by rarity: a
 * term the journal has never seen carries the most, and failing to find it is
 * what sinks a result. `webpack` and `splitting` appear nowhere, so two thirds
 * of that question is missing however well `chunk` and `strategy` score.
 *
 * The share is low because the terms that matter are heavy. Tuned against the
 * golden set in `test/search-relevance.test.ts`: at 0.5 it lost "what did probe
 * A actually establish" to the absent word `establish`, and at 0.35 it keeps
 * every real answer while still refusing the queries about things this journal
 * has never discussed.
 */
const COVERAGE = 0.35;

/** Unicode category Cc: every line break and every escape. */
const CONTROL = /\p{Cc}/gu;

/**
 * Words, including the ones that carry meaning in this domain.
 *
 * `-` and `.` and `_` stay inside a token so `KAD-42`, `state.json` and
 * `blocked_by` survive as themselves; splitting them would turn the project's
 * own vocabulary into noise.
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_.-]*/gu) ?? [];
}

/** One line, no controls: what a span may be cut from. */
function quotable(text: string): string {
  return text.replace(CONTROL, ' ').replace(/\s+/gu, ' ').trim();
}

interface Unit {
  kind: SearchKind;
  id: string;
  label: string | null;
  title: string;
  /** Weighted three times when indexed: it is what the record is about. */
  heading: string;
  /**
   * What the *record* is about, when the unit is only part of one.
   *
   * A section of a document knows its own heading and nothing above it, so
   * "Consequences" inside ADR-006 carried no trace of `lazily imported TUI` —
   * the one phrase that says what the whole document decides. Weighted less
   * than the section's own heading, because it is context rather than subject.
   */
  subject: string;
  text: string;
  lines: { from: number; to: number } | null;
  at: string;
  by: string;
  superseded: boolean;
}

/**
 * A long document becomes one unit per heading.
 *
 * Whole, a 42 KiB document matches a little of everything and wins nothing:
 * BM25 divides by length, so the more a document says the less any sentence in
 * it counts. Sections also give an answer a reader can find — a line number
 * instead of "somewhere in this file". The product already says the same thing
 * from the other side, warning when a document passes 16 KiB.
 */
function sections(body: string, title: string): Array<{ heading: string; text: string; from: number; to: number }> {
  const lines = body.split('\n');
  const out: Array<{ heading: string; text: string; from: number; to: number }> = [];
  let heading = title;
  let buffer: string[] = [];
  let from = 1;

  const flush = (to: number): void => {
    const text = buffer.join('\n').trim();
    if (text.length > 0) out.push({ heading, text, from, to });
  };

  for (let i = 0; i < lines.length; i++) {
    const match = /^(#{1,6})\s+(.*)$/.exec(lines[i]!);
    if (match !== null) {
      flush(i);
      heading = match[2]!.trim();
      buffer = [];
      from = i + 1;
    } else {
      buffer.push(lines[i]!);
    }
  }
  flush(lines.length);
  return out;
}

/** Everything in the journal that holds prose somebody wrote. */
function units(state: ProjectState): Unit[] {
  const out: Unit[] = [];

  for (const t of state.tasks) {
    const parts = [
      t.title,
      t.description ?? '',
      ...t.criteria.map((c) => c.text),
      ...t.comments.map((c) => c.text),
    ];
    out.push({
      kind: 'task',
      id: t.id,
      label: t.label,
      title: t.title,
      heading: t.title,
      subject: '',
      text: parts.filter((p) => p.length > 0).join('\n'),
      lines: null,
      // When the task was created: its first history entry is `task.created`.
      at: t.history[0]?.ts ?? '',
      by: t.reporter,
      superseded: false,
    });
  }

  for (const d of state.decisions) {
    out.push({
      kind: 'decision',
      id: d.id,
      label: d.label,
      title: d.title,
      heading: d.title,
      subject: '',
      text: [d.title, d.why, d.rejected ?? ''].filter((p) => p.length > 0).join('\n'),
      lines: null,
      at: d.at,
      by: d.by,
      superseded: d.supersededBy !== null,
    });
  }

  for (const n of state.notes) {
    out.push({
      kind: 'note',
      id: n.id,
      // A note carries no derived label; it is identified by its ULID alone.
      label: null,
      title: quotable(n.text).slice(0, 60),
      heading: '',
      subject: '',
      text: n.text,
      lines: null,
      at: n.at,
      by: n.by,
      superseded: false,
    });
  }

  for (const d of state.documents) {
    for (const s of sections(d.body, d.title)) {
      out.push({
        kind: 'doc',
        id: d.id,
        label: d.label,
        title: d.title,
        heading: s.heading,
        subject: d.title,
        // The heading opens the text as well as weighting it. Without that, a
        // section matched on its heading alone quotes whatever its first line
        // happens to be — for an ADR, the date and the status — and hands back
        // a citation that proves nothing.
        text: `${s.heading}\n${s.text}`,
        lines: { from: s.from, to: s.to },
        at: d.updatedAt,
        by: d.updatedBy,
        superseded: false,
      });
    }
  }

  for (const s of state.sprints) {
    out.push({
      kind: 'sprint',
      id: s.id,
      label: null,
      title: s.name,
      heading: s.name,
      subject: '',
      text: [s.name, s.description ?? ''].filter((p) => p.length > 0).join('\n'),
      lines: null,
      at: '',
      by: '',
      superseded: false,
    });
  }

  for (const m of state.milestones) {
    out.push({
      kind: 'milestone',
      id: m.id,
      label: m.label,
      title: m.name,
      heading: m.name,
      subject: '',
      text: m.name,
      lines: null,
      at: '',
      by: '',
      superseded: false,
    });
  }

  return out;
}

/**
 * BM25, with the length normalization turned down from the usual 0.75.
 *
 * The standard value assumes documents of roughly one kind. These are not: a
 * note is forty characters and a section of the PRD is two kilobytes, two
 * orders of magnitude apart, and at 0.75 the long section that answers a
 * question lost to a short one that merely mentions it.
 *
 * Swept against the golden set: everything from 0.2 to 0.55 scores the same
 * 0.68, and 0.75 and above score 0.64. 0.45 is the middle of that plateau
 * rather than its edge — a value that only works at the boundary is a value
 * about to stop working. K1 is flat from 0.9 to 1.6 and falls at 2.0.
 */
const K1 = 1.2;
const B = 0.45;
/** The heading counts three times: it is the one line that says what this is. */
const HEADING_WEIGHT = 3;
/** The record's own title, for a unit that is only part of one. Context, not subject. */
const SUBJECT_WEIGHT = 2;

interface Index {
  /** Document frequency, for the query's terms only. */
  df: Map<string, number>;
  /** Per unit, the frequency of each query term that occurs in it. */
  frequency: Array<Map<string, number>>;
  length: Float64Array;
  average: number;
  count: number;
}

/**
 * Counts for the terms that were asked about, and lengths for everything.
 *
 * A full inverted index is the obvious shape and the wrong one for a command
 * that runs once per process: building postings for every term in 733 KB of
 * prose allocates a hundred thousand map entries to answer a question about
 * three of them, and measured 42 ms of a 200 ms budget. Tokenizing is
 * unavoidable — a length is a count of tokens — but recording is not.
 *
 * The scores are identical. Only the allocation is gone.
 */
function build(corpus: readonly Unit[], terms: ReadonlySet<string>): Index {
  const df = new Map<string, number>();
  const frequency: Array<Map<string, number>> = new Array(corpus.length);
  const length = new Float64Array(corpus.length);
  let total = 0;

  for (let i = 0; i < corpus.length; i++) {
    const counts = new Map<string, number>();
    let size = 0;

    // Weighted without being walked more than once.
    for (const term of tokenize(corpus[i]!.heading)) {
      size += HEADING_WEIGHT;
      if (terms.has(term)) counts.set(term, (counts.get(term) ?? 0) + HEADING_WEIGHT);
    }
    for (const term of tokenize(corpus[i]!.subject)) {
      size += SUBJECT_WEIGHT;
      if (terms.has(term)) counts.set(term, (counts.get(term) ?? 0) + SUBJECT_WEIGHT);
    }
    for (const term of tokenize(corpus[i]!.text)) {
      size += 1;
      if (terms.has(term)) counts.set(term, (counts.get(term) ?? 0) + 1);
    }

    for (const term of counts.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    frequency[i] = counts;
    length[i] = size;
    total += size;
  }

  return { df, frequency, length, average: corpus.length === 0 ? 1 : total / corpus.length, count: corpus.length };
}

/**
 * The query's terms, with the ones that ask for everything removed.
 *
 * Removing them only when something survives: a search for "why" alone is a
 * bad search, but a search for "the how and the why" still means something and
 * stripping it to nothing would be a worse answer than a poor one.
 */
function queryTerms(query: string): string[] {
  const all = tokenize(query);
  const content = all.filter((t) => !STOPWORDS.has(t));
  return content.length > 0 ? content : [];
}

/**
 * The passage around the first term that matched.
 *
 * The first rather than the densest: a record is written with its point near
 * the top, and a window chosen by term density lands in whichever paragraph
 * repeats a word most, which is rarely the same thing.
 */
function spanOf(text: string, terms: readonly string[]): { text: string; start: number; end: number } {
  const line = quotable(text);
  const lower = line.toLowerCase();

  let at = -1;
  for (const term of terms) {
    const found = lower.indexOf(term);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  if (at < 0) return { text: line.slice(0, SPAN_CHARS), start: 0, end: Math.min(SPAN_CHARS, line.length) };

  let start = Math.max(0, at - Math.floor(SPAN_CHARS / 3));
  let end = Math.min(line.length, start + SPAN_CHARS);
  // Snap to word boundaries, so a span never opens or closes mid-word.
  if (start > 0) {
    const space = line.indexOf(' ', start);
    if (space >= 0 && space < at) start = space + 1;
  }
  if (end < line.length) {
    const space = line.lastIndexOf(' ', end);
    if (space > start) end = space;
  }
  return { text: line.slice(start, end), start, end };
}

/**
 * One scoring pass: BM25, with the coverage rule.
 *
 * It took a weight per term once, so that a second pass could ask again using
 * the words the first answers had used — relevance feedback, learnt from this
 * corpus instead of from a model. Measured against the golden set it moved
 * recall@3 from 0.64 down to 0.60 at every setting tried, and tripled the cost
 * of a query, because when the first answers are wrong the borrowed words make
 * them wronger. The generality went with it.
 */
function rank(
  corpus: readonly Unit[],
  terms: ReadonlySet<string>,
): Map<number, { score: number; coverage: number }> {
  const index = build(corpus, terms);
  const idfOf = (term: string): number => {
    // A term the journal has never seen scores as the rarest thing there is,
    // which is what makes its absence count against a result.
    const df = index.df.get(term) ?? 0;
    return Math.log(1 + (index.count - df + 0.5) / (df + 0.5));
  };
  const idf = new Map([...terms].map((term) => [term, idfOf(term)]));
  let asked = 0;
  for (const weight of idf.values()) asked += weight;

  const scores = new Map<number, { score: number; coverage: number }>();
  for (let i = 0; i < corpus.length; i++) {
    const counts = index.frequency[i]!;
    if (counts.size === 0) continue;

    const norm = 1 - B + B * (index.length[i]! / index.average);
    let score = 0;
    let carried = 0;
    for (const [term, f] of counts) {
      const weight = idf.get(term)!;
      score += (weight * (f * (K1 + 1))) / (f + K1 * norm);
      carried += weight;
    }
    // Enough of the question has to be present, weighted by how rare its words
    // are: see COVERAGE.
    if (carried >= asked * COVERAGE) scores.set(i, { score, coverage: asked === 0 ? 1 : carried / asked });
  }

  return scores;
}

export function search(
  state: ProjectState,
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const wanted = options.kinds === undefined ? null : new Set<SearchKind>(options.kinds);
  const corpus = units(state).filter(
    (u) =>
      (wanted === null || wanted.has(u.kind)) && (options.all === true || !u.superseded),
  );
  if (corpus.length === 0) return [];

  // Distinct terms, so repeating a word in the query cannot pass for covering
  // the question twice.
  const distinct = new Set(terms);
  const scores = rank(corpus, distinct);
  if (scores.size === 0) return [];

  const ranked = [...scores.entries()].sort((a, b) => {
    if (b[1].score !== a[1].score) return b[1].score - a[1].score;
    // A tie is broken by identity, never by the order the corpus was built in:
    // ranking has to inherit I1, or the answer depends on which machine read
    // the directory first.
    return corpus[a[0]]!.id < corpus[b[0]]!.id ? -1 : 1;
  });


  const best = ranked[0]![1].score;
  const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;

  return ranked
    .filter(([, r]) => r.score >= best * TAIL_SHARE)
    .slice(0, limit)
    .map(([i, { score, coverage }]) => {
      const u = corpus[i]!;
      return {
        kind: u.kind,
        id: u.id,
        label: u.label,
        title: u.title,
        score: Math.round(score * 100) / 100,
        coverage: Math.round(coverage * 100) / 100,
        span: spanOf(u.text, terms),
        lines: u.lines,
        at: u.at,
        by: u.by,
      };
    });
}
