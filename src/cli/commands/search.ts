import {
  search,
  SEARCH_KINDS,
  DEFAULT_SEARCH_LIMIT,
  PARTIAL_COVERAGE,
  type SearchHit,
  type SearchKind,
} from '../../core/search.js';
import {
  resolveContext,
  isContext,
  loadState,
  failure,
  type CommandResult,
} from './task.js';

/**
 * One question, over everything in the journal.
 *
 * The journal already answers "what is the state" — `board`, `ready`,
 * `task show`. What it could not answer is "what do we know about X", and that
 * is the question an agent starting a session actually has. A decision, a note,
 * a task and a section of a document are four different records and one answer.
 *
 * The result is deliberately small: five passages, each with the identity of
 * the record it came from. Handing back more would recreate the thing this
 * exists to avoid — a context full of nearly-relevant text, which is worse for
 * a model than a short answer and measurably worse than no answer at all.
 */

export interface SearchOptions {
  /** Comma-separated kinds to narrow to. */
  kind?: string;
  limit?: number;
  /** Include superseded decisions. */
  all?: boolean;
  json?: boolean;
}

function parseKinds(spec: string | undefined): { kinds: SearchKind[] | null; error: CommandResult | null } {
  if (spec === undefined) return { kinds: null, error: null };
  const wanted = spec
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
  const unknown = wanted.find((k) => !SEARCH_KINDS.includes(k as SearchKind));
  if (unknown !== undefined) {
    return {
      kinds: null,
      error: failure(2, 'invalid_argument', `Unknown kind "${unknown}".\nAvailable: ${SEARCH_KINDS.join(', ')}`, {
        received: unknown,
        allowed: SEARCH_KINDS,
      }),
    };
  }
  return { kinds: wanted as SearchKind[], error: null };
}

/** `DOC-7:62-75` for a section, `KAD-42` for anything else, the ULID when there is no label. */
function reference(hit: SearchHit): string {
  const base = hit.label ?? hit.id;
  return hit.lines === null ? base : `${base}:${hit.lines.from}-${hit.lines.to}`;
}

function render(hits: readonly SearchHit[], query: string): string {
  const width = Math.max(...hits.map((h) => reference(h).length));
  const lines = hits.flatMap((hit) => [
    `${reference(hit).padEnd(width)}  [${hit.kind}] ${hit.title}` +
      (hit.coverage < PARTIAL_COVERAGE ? `   · answers part of the question` : ''),
    `${' '.repeat(width)}  ${hit.span.text}`,
    '',
  ]);

  // Said once at the end as well as marked per line: a reader who skims the
  // first result is exactly the reader who needs to know it is a partial one.
  const weak = hits[0]!.coverage < PARTIAL_COVERAGE;
  return [
    `${hits.length} result${hits.length === 1 ? '' : 's'} for "${query}"`,
    '',
    ...lines,
    ...(weak
      ? [
          'None of these holds the whole question — each answers part of it.',
          'Treat them as places to look, not as the answer.',
          '',
        ]
      : []),
    'Read one in full:',
    '  kadence task show KAD-1   ·   kadence decision show DEC-1   ·   kadence doc show DOC-1',
  ].join('\n');
}

/**
 * The empty answer, said plainly.
 *
 * It is a result, not a failure: the journal is allowed not to know something,
 * and an agent told "nothing is recorded" behaves better than one handed three
 * passages that merely share a word with the question. Saying so in a sentence
 * is the whole point — silence would read as a broken command.
 */
function nothing(query: string, narrowed: boolean): string {
  return [
    `Nothing in the journal matches "${query}".`,
    '',
    narrowed
      ? 'That is with --kind narrowing the search. Try it without.'
      : 'Either it was never written down, or it is written in other words.',
    'Record it once you know:',
    '  kadence note "…"   ·   kadence decision add "…" --why "…"',
  ].join('\n');
}

export function runSearch(
  cwd: string,
  env: NodeJS.ProcessEnv,
  query: string | undefined,
  options: SearchOptions = {},
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  if (query === undefined || query.trim().length === 0) {
    return failure(2, 'invalid_argument', 'What are you looking for?\n  kadence search "why are events append-only"');
  }

  // Validated before any work: a typo in --kind should cost nothing.
  const { kinds, error } = parseKinds(options.kind);
  if (error !== null) return error;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  const hits = search(state, query, {
    ...(kinds === null ? {} : { kinds }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.all === true ? { all: true } : {}),
  });

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: hits.length === 0 ? nothing(query, kinds !== null) : render(hits, query),
    data: {
      schema: 'kadence/v1',
      ok: true,
      query,
      hits,
      // Present even when empty, so an agent branches on a number rather than
      // on whether a key exists.
      hitsTotal: hits.length,
    },
  };
}

export { DEFAULT_SEARCH_LIMIT, SEARCH_KINDS };
