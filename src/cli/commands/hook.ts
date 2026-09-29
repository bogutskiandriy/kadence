import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { search, PARTIAL_COVERAGE, type SearchHit } from '../../core/search.js';
import { resolveContext, isContext, loadState } from './task.js';

/**
 * What the journal says, placed next to a prompt before the agent reads it.
 *
 * Instructions to search were not followed. In natural-mode runs on this
 * repository an agent reached for `search` 1 time in 10 before the instruction
 * files said "before grep", and 0 in 10 after; every run opened with grep over
 * the whole tree (notes on KAD-53). Forced to search, the same agents were
 * right 19 times in 20 against 17 and used half the context (notes on KAD-50).
 * So the search is not left to be remembered: a UserPromptSubmit hook runs it
 * on the way in.
 *
 * Runs on every prompt a person types, which sets the rules:
 *
 * - **Never block.** Exit 2 from this hook erases the prompt. Every failure,
 *   parse error and missing repository ends in silence and exit 0.
 * - **Silence over noise.** Nothing is printed unless search found something;
 *   a slash command is not a question.
 * - **Pointers first, passages when earned.** A passage is quoted only when its
 *   record holds the whole question (coverage at or above PARTIAL_COVERAGE),
 *   or when it is a note, which has no command to open it by.
 *   Below that a title is a place to look; a quoted near-miss is what makes a
 *   model fabricate (DEC-30).
 * - **Text, not instructions.** Whatever a teammate commits reaches every
 *   session through this hook, so every field is flattened to one line and
 *   every passage sits inside quotes, the same defence prime uses.
 * - **An offer, not an order.** It speaks on most prompts, coding tasks
 *   included — 25 of 30 ordinary code prompts drew records (KAD-56) — so the
 *   records come with the condition under which they matter.
 * - **Once per session.** A record already shown in this session is not shown
 *   again. What a session has seen is kept in the system temp directory, keyed
 *   by session and repository, never in `.kadence/`: deleting it changes
 *   nothing but a repeat (I6).
 *
 * Not gated on coverage. Measured in KAD-56: at 0.7 the hook fell silent on
 * 72 of 75 questions the journal answers while still speaking on 5 of 30 code
 * prompts. Short coding prompts carry more of their words into the journal than
 * paraphrased questions do, so coverage cannot tell the two apart.
 */

/** Hard ceiling on what one prompt can add to the context. */
export const PROMPT_HOOK_BYTES = 1024;
/** At most this many records. Three titles cost less than one grep result. */
const HITS = 3;
/** Searched for, so that records seen earlier in the session can be skipped. */
const CANDIDATES = 9;
/**
 * Only the head of the prompt is searched.
 *
 * People paste logs after the question, and the question is what the journal
 * might answer. It also bounds the work: a 200 KB paste must not cost a turn.
 */
const QUERY_CHARS = 500;
const TITLE_CHARS = 80;
/**
 * A note is given whole, up to this. There is no `note show` to open one with:
 * agents handed a note's ULID tried it and spent three calls finding the text
 * another way. Notes run 285 characters at the median.
 */
const NOTE_CHARS = 400;

const CONTROL = /\p{Cc}/gu;

/** One line: controls become spaces rather than vanishing, so words never merge. */
function flat(text: string, max: number): string {
  const line = text.replace(CONTROL, ' ').replace(/\s+/gu, ' ').trim();
  const chars = [...line];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : line;
}

interface Payload {
  prompt: string;
  session: string | null;
}

function payloadOf(input: string): Payload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const fields = parsed as Record<string, unknown>;
  const prompt = fields['prompt'];
  const session = fields['session_id'];
  if (typeof prompt !== 'string') return null;
  return { prompt, session: typeof session === 'string' && session.length > 0 ? session : null };
}

/** A section is its own record here: two parts of one document are two places. */
const keyOf = (h: SearchHit): string => (h.lines === null ? h.id : `${h.id}:${h.lines.from}`);

/**
 * What this session has already been shown, in the system temp directory.
 *
 * Every failure reads as "nothing seen" and writes as nothing: at worst a
 * record is repeated, which is the behaviour without this file.
 */
function seenFile(root: string, session: string): string {
  const name = createHash('sha256').update(`${root}\0${session}`).digest('hex').slice(0, 24);
  return join(tmpdir(), 'kadence-hook', `${name}.json`);
}

function readSeen(path: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeSeen(path: string, seen: ReadonlySet<string>): void {
  try {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify([...seen]), 'utf8');
  } catch {
    // A repeat is the only cost of not remembering.
  }
}

function render(
  hits: readonly SearchHit[],
  noteText: (id: string) => string | null,
): { text: string; shown: SearchHit[] } {
  // The same reference `search` prints: a section carries its lines, so three
  // hits in one document read as three places rather than one label thrice.
  const ref = (h: SearchHit): string => {
    const base = h.label ?? `note ${h.id}`;
    return h.lines === null ? base : `${base}:${h.lines.from}-${h.lines.to}`;
  };
  const width = Math.max(...hits.map((h) => ref(h).length));
  const head = 'kadence: if this is about why or how something was decided, the journal may already say:';
  const tail = 'More: kadence search "…" --json · open one: task show / decision show / doc show';

  const lines = [head];
  const shown: SearchHit[] = [];
  for (const hit of hits) {
    const entry = [`  ${ref(hit).padEnd(width)}  [${hit.kind}] ${flat(hit.title, TITLE_CHARS)}`];
    const whole = hit.kind === 'note' ? noteText(hit.id) : null;
    if (whole !== null) {
      entry.push(`  ${' '.repeat(width)}  “${flat(whole, NOTE_CHARS)}”`);
    } else if (hit.coverage >= PARTIAL_COVERAGE) {
      entry.push(`  ${' '.repeat(width)}  “${flat(hit.span.text, 200)}”`);
    }
    const next = [...lines, ...entry, tail].join('\n');
    if (Buffer.byteLength(next, 'utf8') > PROMPT_HOOK_BYTES) break;
    lines.push(...entry);
    shown.push(hit);
  }
  return { text: shown.length === 0 ? '' : [...lines, tail].join('\n'), shown };
}

/**
 * The context to add for one UserPromptSubmit payload, or '' for none.
 *
 * Never throws: the caller is a hook, and a hook that fails is a prompt that
 * fails.
 */
export function runPromptHook(cwd: string, env: NodeJS.ProcessEnv, input: string): string {
  try {
    const payload = payloadOf(input);
    if (payload === null) return '';
    const question = payload.prompt.trim().slice(0, QUERY_CHARS);
    if (question.length === 0 || question.startsWith('/')) return '';

    const ctx = resolveContext(cwd, env);
    if (!isContext(ctx)) return '';

    const { state } = loadState(ctx.root, ctx.actor);
    const found = search(state, question, { limit: CANDIDATES });
    const seenAt = payload.session === null ? null : seenFile(ctx.root, payload.session);
    const seen = seenAt === null ? new Set<string>() : readSeen(seenAt);
    const hits = found.filter((h) => !seen.has(keyOf(h))).slice(0, HITS);
    if (hits.length === 0) return '';

    const noteText = (id: string): string | null => state.notes.find((n) => n.id === id)?.text ?? null;
    const { text, shown } = render(hits, noteText);
    if (seenAt !== null && shown.length > 0) {
      for (const h of shown) seen.add(keyOf(h));
      writeSeen(seenAt, seen);
    }
    return text;
  } catch {
    return '';
  }
}
