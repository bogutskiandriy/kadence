import { appendFileSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { search, rejectedMatches, PARTIAL_COVERAGE, type SearchHit, type RejectedMatch } from '../../core/search.js';
import { resolveContext, isContext, loadState, type CommandResult } from './task.js';
import { runPrime } from './prime.js';

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
 *   or when it is a note, which is short enough to give whole.
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
 * A note is given whole, up to this, so the common case costs no second call.
 * Agents handed a note's ULID before `note show` existed spent three calls
 * finding the text another way; the tail now names it for the longer ones.
 * Notes run 285 characters at the median.
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

/**
 * What kadence put into an agent's context, session by session (KAD-76).
 *
 * In the system temp directory beside the seen-file, never in the repository:
 * it is about this machine's sessions, not the team's work. One JSON line per
 * prime and per prompt — the size of what was added and which records, and the
 * first 80 characters of the prompt so a person can tell them apart. Kept to
 * the last 500 lines.
 */
export function hookLogPath(root: string): string {
  // The real path, so /var/… and /private/var/… — one directory on macOS —
  // name one log.
  let real = root;
  try {
    real = realpathSync(root);
  } catch {
    // A path that does not resolve is still a name.
  }
  const name = createHash('sha256').update(`${real}\0log`).digest('hex').slice(0, 24);
  return join(tmpdir(), 'kadence-hook', `${name}.log.jsonl`);
}

interface HookLogEntry {
  at: string;
  kind: 'prime' | 'prompt';
  session: string | null;
  prompt?: string;
  bytes: number;
  records: string[];
}

const LOG_KEEP = 500;
/** Labels a hook or prime output names, in order: KAD-1, DEC-2, DOC-3:12-30. */
const LABELS = /\b(?:KAD|DEC|DOC|MS)-\d+(?::\d+-\d+)?\b/g;

function logHook(root: string, entry: HookLogEntry): void {
  try {
    const path = hookLogPath(root);
    mkdirSync(join(path, '..'), { recursive: true });
    appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf8');
    // Trimmed only now and then, so a prompt never pays to rewrite the file.
    if (statSync(path).size > 256 * 1024) {
      const lines = readFileSync(path, 'utf8').trim().split('\n');
      writeFileSync(path, `${lines.slice(-LOG_KEEP).join('\n')}\n`, 'utf8');
    }
  } catch {
    // The log is for a person's curiosity; a hook never fails over it.
  }
}

/** Records what prime put in front of an agent. Called by the prime command and the session hooks. */
export function logPrime(cwd: string, env: NodeJS.ProcessEnv, text: string): void {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx) || text.length === 0) return;
  logHook(ctx.root, {
    at: new Date().toISOString(),
    kind: 'prime',
    session: null,
    bytes: Buffer.byteLength(text, 'utf8'),
    records: [...new Set(text.match(LABELS) ?? [])],
  });
}

/**
 * `kadence hook log`: the latest session — what prime added at its start and
 * what each prompt got — with sizes. Tokens are an estimate at four bytes a
 * token, and the output says so.
 */
export function runHookLog(cwd: string, env: NodeJS.ProcessEnv, _options: { json?: boolean }): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;
  const path = hookLogPath(ctx.root);
  let all: HookLogEntry[] = [];
  try {
    all = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as HookLogEntry);
  } catch {
    all = [];
  }

  // The latest session the prompt hook saw, and the prime just before it.
  const lastPrompt = [...all].reverse().find((e) => e.kind === 'prompt');
  const session = lastPrompt?.session ?? null;
  const firstOfSession = lastPrompt === undefined ? -1 : all.findIndex((e) => e.kind === 'prompt' && e.session === session);
  const primeBefore =
    firstOfSession === -1
      ? [...all].reverse().find((e) => e.kind === 'prime')
      : all.slice(0, firstOfSession).reverse().find((e) => e.kind === 'prime');
  const entries = [
    ...(primeBefore !== undefined ? [primeBefore] : []),
    ...(lastPrompt === undefined ? [] : all.filter((e) => e.kind === 'prompt' && e.session === session)),
  ].map((e) => ({ ...e, tokens: Math.ceil(e.bytes / 4) }));

  const total = { bytes: entries.reduce((n, e) => n + e.bytes, 0), tokens: entries.reduce((n, e) => n + e.tokens, 0) };
  const data = { schema: 'kadence/v1', ok: true, session, entries, total, log: path };

  if (entries.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      message:
        'Nothing logged yet. kadence records here what prime and the prompt hook add to an\n' +
        "agent's context, once a session runs with the hooks (kadence init adds them).",
      data,
    };
  }
  const time = (iso: string) => iso.slice(11, 16);
  const size = (e: { bytes: number; tokens: number }) =>
    e.bytes === 0 ? 'nothing added' : `${e.bytes.toLocaleString('en-US')} bytes  \u2248 ${e.tokens.toLocaleString('en-US')} tokens`;
  const lines = entries.map((e) => {
    const what = e.kind === 'prime' ? 'prime, at session start' : `"${e.prompt ?? ''}"`;
    const records = e.records.length > 0 ? `  ${e.records.join(', ')}` : '';
    return `  ${time(e.at)}  ${what.padEnd(46)} ${size(e)}${records}`;
  });
  return {
    ok: true,
    exitCode: 0,
    message: [
      `What kadence put into the agent's context${session !== null ? ` — session ${session.slice(0, 8)}` : ''}, ${entries[0]!.at.slice(0, 10)}:`,
      '',
      ...lines,
      '',
      `Total \u2248 ${total.tokens.toLocaleString('en-US')} tokens over ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}. ` +
        'Tokens are estimated at 4 bytes each.',
      `Kept on this machine, outside the repository: ${path}`,
    ].join('\n'),
    data,
  };
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
  turnedDown: readonly RejectedMatch[],
  hits: readonly SearchHit[],
  noteText: (id: string) => string | null,
): { text: string; shown: string[] } {
  // The same reference `search` prints: a section carries its lines, so three
  // hits in one document read as three places rather than one label thrice.
  const ref = (h: SearchHit): string => {
    const base = h.label ?? `note ${h.id}`;
    return h.lines === null ? base : `${base}:${h.lines.from}-${h.lines.to}`;
  };
  const width = Math.max(...turnedDown.map((m) => m.label.length), ...hits.map((h) => ref(h).length));
  const head = 'kadence: if this is about why or how something was decided, the journal may already say:';
  const tail = 'More: kadence search "…" --also "other words" --json · open one: task show / decision show / doc show / note show';

  const lines = [head];
  const shown: string[] = [];
  const fits = (entry: string[]) => Buffer.byteLength([...lines, ...entry, tail].join('\n'), 'utf8') <= PROMPT_HOOK_BYTES;

  // First: a decision that already turned down what the prompt proposes. It
  // is the one line here that can stop work before it starts (KAD-61).
  for (const m of turnedDown) {
    const pad = ' '.repeat(width);
    const entry = [
      `  ${m.label.padEnd(width)}  [decision] rejected this before: “${flat(m.rejected, 200)}”`,
      `  ${pad}  chose instead: ${flat(m.title, TITLE_CHARS)}`,
    ];
    if (!fits(entry)) break;
    lines.push(...entry);
    shown.push(m.id);
  }

  for (const hit of hits) {
    const entry = [`  ${ref(hit).padEnd(width)}  [${hit.kind}] ${flat(hit.title, TITLE_CHARS)}`];
    const whole = hit.kind === 'note' ? noteText(hit.id) : null;
    if (whole !== null) {
      entry.push(`  ${' '.repeat(width)}  “${flat(whole, NOTE_CHARS)}”`);
    } else if (hit.coverage >= PARTIAL_COVERAGE) {
      entry.push(`  ${' '.repeat(width)}  “${flat(hit.span.text, 200)}”`);
    }
    if (!fits(entry)) break;
    lines.push(...entry);
    shown.push(keyOf(hit));
  }
  return { text: shown.length === 0 ? '' : [...lines, tail].join('\n'), shown };
}

/** Agents whose session-start hook only reads context from JSON on stdout. */
export type SessionHookFlavor = 'cursor' | 'copilot';

/**
 * `prime`, in the JSON a session-start hook of Cursor or Copilot reads (KAD-71).
 *
 * Neither takes plain stdout as context, as Claude Code and Codex do: Cursor
 * reads `additional_context` and Copilot `additionalContext`, from a JSON
 * object, and anything else is dropped. So the same preamble is wrapped, and
 * every failure — no repository, no journal, a crash — answers `{}`, which
 * both read as "nothing to add". A session start is never where kadence fails.
 */
export function runSessionHook(cwd: string, env: NodeJS.ProcessEnv, flavor: SessionHookFlavor): string {
  try {
    const primed = runPrime(cwd, env, {});
    if (!primed.ok || primed.message.length === 0) return '{}';
    logPrime(cwd, env, primed.message);
    const key = flavor === 'cursor' ? 'additional_context' : 'additionalContext';
    return JSON.stringify({ [key]: primed.message });
  } catch {
    return '{}';
  }
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
    const turnedDown = rejectedMatches(state, question).filter((m) => !seen.has(m.id)).slice(0, 2);
    const hits = found
      .filter((h) => !seen.has(keyOf(h)) && !turnedDown.some((m) => m.id === h.id))
      .slice(0, HITS - turnedDown.length);
    const logged = (text: string): string => {
      logHook(ctx.root, {
        at: new Date().toISOString(),
        kind: 'prompt',
        session: payload.session,
        prompt: question.replace(/\s+/g, ' ').slice(0, 80),
        bytes: Buffer.byteLength(text, 'utf8'),
        records: [...new Set(text.match(LABELS) ?? [])],
      });
      return text;
    };
    if (hits.length === 0 && turnedDown.length === 0) return logged('');

    const noteText = (id: string): string | null => state.notes.find((n) => n.id === id)?.text ?? null;
    const { text, shown } = render(turnedDown, hits, noteText);
    if (seenAt !== null && shown.length > 0) {
      for (const key of shown) seen.add(key);
      writeSeen(seenAt, seen);
    }
    return logged(text);
  } catch {
    return '';
  }
}
