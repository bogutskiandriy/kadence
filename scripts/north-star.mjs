/**
 * The North Star instrument (T54) — a maintainer script, not part of the product.
 *
 * The metric (docs/product/north-star.md): repositories whose journal holds
 * events from at least two different authors 14 days after `kadence init`.
 * This script counts them, so the number exists before anyone arrives (O2 in
 * docs/product/strategy.md) and a weekly line in
 * docs/research/north-star-log.md keeps it honest.
 *
 * Why it may touch the network when the product may not: kadence itself stays
 * offline. This runs on the maintainer's machine, through the maintainer's own
 * authenticated `gh`, and it needs no token of its own. It is not in
 * `package.json#files` and nothing in `src/` imports it.
 *
 *   node scripts/north-star.mjs --local <path> [--json] [--now <iso>]
 *       one repository on disk — a consented pilot check-in, or a test
 *   node scripts/north-star.mjs --search [--json] [--repo o/r ...] [--include-self]
 *       public repositories on GitHub, found through `gh api`
 *   node scripts/north-star.mjs --search --append [--note "..."]
 *       the same, then one dated row appended to the log
 *   node scripts/north-star.mjs --append --from run.json [--log path]
 *       append from a saved `--search --json` result — no second search
 *
 * How a repository is judged (`summarise`):
 *   - init is the earliest event by ULID time, never by `ts` (invariant I2);
 *   - an author is the event's `actor` (git email), trimmed and lower-cased,
 *     so the same person writing as human and through an agent is ONE author;
 *   - it counts toward the North Star when it is at least 14 days past init
 *     and at least two authors have events. `authorsByDay14` and
 *     `authorsAfterDay14` are reported alongside, for the stricter readings.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 86_400_000;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;
const SELF = 'bogutskiandriy/kadence';
const DEFAULT_LOG = fileURLToPath(new URL('../docs/research/north-star-log.md', import.meta.url));

/**
 * Code search queries. GitHub's REST code search indexes dot-directories, but
 * not every repository — see the log's method section. Several shapes are asked so that one blind spot does
 * not zero the count; every hit is then verified against the git tree.
 */
const QUERIES = [
  'path:.kadence/events',
  'path:.kadence filename:README.md "for AI agents"',
  '"Project tasks — kadence" filename:CLAUDE.md',
  '"Project tasks — kadence" filename:AGENTS.md',
  '"kadence prime"',
];

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

/** Milliseconds encoded in a ULID's first ten characters, or null. */
export function ulidTime(id) {
  if (typeof id !== 'string' || !ULID_RE.test(id)) return null;
  let t = 0;
  for (const ch of id.slice(0, 10)) t = t * 32 + ALPHABET.indexOf(ch);
  return t;
}

function eventTime(e) {
  const fromId = ulidTime(e.id);
  if (fromId !== null) return fromId;
  const fromTs = Date.parse(e.ts);
  return Number.isNaN(fromTs) ? null : fromTs;
}

export function normaliseAuthor(actor) {
  return typeof actor === 'string' ? actor.trim().toLowerCase() : '';
}

/**
 * One repository's standing against the North Star.
 * `events` need only `id`, `actor`, `source` (and `ts` as a fallback).
 */
export function summarise(events, now = Date.now()) {
  const seen = new Set();
  const timed = [];
  for (const e of events) {
    if (!e || seen.has(e.id)) continue;
    const time = eventTime(e);
    const author = normaliseAuthor(e.actor);
    if (time === null || author === '') continue;
    seen.add(e.id);
    timed.push({ time, author, source: e.source === 'agent' ? 'agent' : 'human' });
  }

  if (timed.length === 0) {
    return {
      events: 0, firstEvent: null, lastEvent: null, ageDays: 0, reachedDay14: false,
      authors: [], authorsByDay14: [], authorsAfterDay14: [], sources: { human: 0, agent: 0 }, northStar: false,
    };
  }

  timed.sort((a, b) => a.time - b.time);
  const init = timed[0].time;
  const day14 = init + 14 * DAY;
  const authors = new Set();
  const byDay14 = new Set();
  const afterDay14 = new Set();
  const sources = { human: 0, agent: 0 };
  for (const t of timed) {
    authors.add(t.author);
    (t.time <= day14 ? byDay14 : afterDay14).add(t.author);
    sources[t.source]++;
  }

  const ageDays = Math.floor((now - init) / DAY);
  const reachedDay14 = now >= day14;
  return {
    events: timed.length,
    firstEvent: new Date(init).toISOString(),
    lastEvent: new Date(timed[timed.length - 1].time).toISOString(),
    ageDays,
    reachedDay14,
    authors: [...authors].sort(),
    authorsByDay14: [...byDay14].sort(),
    authorsAfterDay14: [...afterDay14].sort(),
    sources,
    northStar: reachedDay14 && authors.size >= 2,
  };
}

/** One markdown row for the log. Pilots are counted by hand, so that column is "—". */
export function logRow(result) {
  const repos = result.repos ?? [];
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const notes = (result.notes ?? []).filter(Boolean).map(cell).join('; ') || '—';
  return `| ${result.date} | ${repos.length} | ${repos.filter((r) => r.reachedDay14).length} | ${
    repos.filter((r) => r.northStar).length
  } | — | ${notes} |`;
}

// ---------------------------------------------------------------------------
// Local journal
// ---------------------------------------------------------------------------

function jsonFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsonFiles(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

/**
 * Every event under `.kadence/events`, loose files and compacted archives
 * (`events/archive/YYYY-MM.json`, an array) alike. Unreadable files are
 * counted, not fatal — a check-in should not die on one bad merge.
 */
export function readLocalEvents(root) {
  const base = join(root, '.kadence', 'events');
  if (!existsSync(base)) return null;
  const events = [];
  let corrupted = 0;
  for (const file of jsonFiles(base)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      corrupted++;
      continue;
    }
    for (const e of Array.isArray(parsed) ? parsed : [parsed]) {
      if (e && typeof e === 'object' && typeof e.id === 'string' && typeof e.actor === 'string') events.push(e);
      else corrupted++;
    }
  }
  return { events, corrupted };
}

// ---------------------------------------------------------------------------
// GitHub, through the maintainer's gh
// ---------------------------------------------------------------------------

class Fatal extends Error {}

function ghRaw(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error && r.error.code === 'ENOENT') {
    throw new Fatal('gh is not installed. Install the GitHub CLI (https://cli.github.com) and run `gh auth login`.');
  }
  return r;
}

function ensureGh() {
  const r = ghRaw(['auth', 'status']);
  if (r.status !== 0) {
    throw new Fatal('gh is not authenticated. Run `gh auth login` — this script uses your session and needs no token of its own.');
  }
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * `gh api` returning parsed JSON. On a rate limit it waits for the reset when
 * that is under ~70 s (code search allows 10 requests a minute) and otherwise
 * stops with the reset time — never silently returns an empty result.
 */
function gh(path, fields = {}, { allow404 = false } = {}) {
  const args = ['api', '-X', 'GET', path];
  for (const [k, v] of Object.entries(fields)) args.push('-f', `${k}=${v}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = ghRaw(args);
    if (r.status === 0) return JSON.parse(r.stdout || 'null');
    const text = `${r.stdout}\n${r.stderr}`;
    if (allow404 && /HTTP 404|Not Found/.test(text)) return null;
    if (/rate limit/i.test(text)) {
      const limits = ghRaw(['api', 'rate_limit']);
      const resources = limits.status === 0 ? JSON.parse(limits.stdout).resources : {};
      const bucket = path.startsWith('search/code') ? resources.code_search : resources.core;
      const waitMs = bucket ? bucket.reset * 1000 - Date.now() + 2000 : 61_000;
      if (waitMs > 70_000) {
        throw new Fatal(`GitHub rate limit reached for ${path}; resets at ${new Date(Date.now() + waitMs).toISOString()}. Nothing was appended.`);
      }
      process.stderr.write(`rate limited on ${path}, waiting ${Math.ceil(waitMs / 1000)} s\n`);
      sleep(Math.max(waitMs, 1000));
      continue;
    }
    throw new Fatal(`gh api ${path} failed: ${r.stderr.trim() || r.stdout.trim()}`);
  }
  throw new Fatal(`gh api ${path} kept hitting the rate limit. Nothing was appended.`);
}

/** Candidate repositories from code search, with per-query hit counts. */
function searchCandidates() {
  const found = new Set();
  const perQuery = [];
  for (const q of QUERIES) {
    const result = gh('search/code', { q, per_page: '100' });
    const repos = new Set((result?.items ?? []).map((i) => i.repository.full_name));
    perQuery.push({ q, total: result?.total_count ?? 0, repos: repos.size, incomplete: Boolean(result?.incomplete_results) });
    for (const r of repos) found.add(r);
  }
  return { found, perQuery };
}

/**
 * Reads a public repository's journal from its default-branch tree.
 *
 * Age comes from the tree alone — loose event files are named by their ULID —
 * so it is exact even when the file cap samples the events. Authors come from
 * fetched blobs; with more files than the cap, archives plus an even spread of
 * loose files are read, and the author count is then a lower bound
 * (`sampled: true`).
 */
function readRemoteRepo(fullName, maxFiles) {
  const meta = gh(`repos/${fullName}`, {}, { allow404: true });
  if (!meta || meta.private) return null;
  const tree = gh(`repos/${fullName}/git/trees/${encodeURIComponent(meta.default_branch)}`, { recursive: '1' }, { allow404: true });
  if (!tree) return null;
  const files = (tree.tree ?? []).filter(
    (n) => n.type === 'blob' && n.path.startsWith('.kadence/events/') && n.path.endsWith('.json'),
  );
  if (files.length === 0) return { repo: fullName, journal: false, truncatedTree: Boolean(tree.truncated) };

  const archives = files.filter((f) => f.path.startsWith('.kadence/events/archive/'));
  const loose = files.filter((f) => !f.path.startsWith('.kadence/events/archive/')).sort((a, b) => a.path.localeCompare(b.path));
  let chosen = [...archives, ...loose];
  const sampled = chosen.length > maxFiles;
  if (sampled) {
    const room = Math.max(maxFiles - archives.length, 2);
    const step = (loose.length - 1) / (room - 1);
    const picks = new Set();
    for (let i = 0; i < room; i++) picks.add(loose[Math.round(i * step)]);
    chosen = [...archives.slice(0, maxFiles), ...picks];
  }

  const events = [];
  let corrupted = 0;
  for (const f of chosen) {
    const blob = gh(`repos/${fullName}/git/blobs/${f.sha}`, {}, { allow404: true });
    try {
      const parsed = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'));
      for (const e of Array.isArray(parsed) ? parsed : [parsed]) {
        if (e && typeof e.id === 'string') events.push(e);
      }
    } catch {
      corrupted++;
    }
  }
  // Unfetched loose files still date the journal: their names are ULIDs.
  const timeOnly = loose
    .map((f) => f.path.split('/').pop().replace(/\.json$/, ''))
    .filter((id) => ulidTime(id) !== null);
  const summary = summarise(events);
  const earliestName = timeOnly.length ? Math.min(...timeOnly.map(ulidTime)) : null;
  if (earliestName !== null && summary.firstEvent !== null && earliestName < Date.parse(summary.firstEvent)) {
    const init = earliestName;
    summary.firstEvent = new Date(init).toISOString();
    summary.ageDays = Math.floor((Date.now() - init) / DAY);
    summary.reachedDay14 = Date.now() >= init + 14 * DAY;
    summary.northStar = summary.reachedDay14 && summary.authors.length >= 2;
  }
  return {
    repo: fullName,
    journal: true,
    files: files.length,
    fetched: chosen.length,
    sampled,
    truncatedTree: Boolean(tree.truncated),
    corrupted,
    ...summary,
  };
}

function runSearch({ extraRepos, includeSelf, maxFiles, notes }) {
  ensureGh();
  const { found, perQuery } = searchCandidates();
  const hits = found.size;
  for (const r of extraRepos) found.add(r);
  if (!includeSelf) found.delete(SELF);
  else found.add(SELF);

  const repos = [];
  for (const name of [...found].sort()) {
    const repo = readRemoteRepo(name, maxFiles);
    if (repo && repo.journal) repos.push(repo);
  }
  const autoNotes = [`code search: ${hits} candidate repo(s) from ${QUERIES.length} queries`];
  if (extraRepos.length) autoNotes.push(`+${extraRepos.length} named with --repo`);
  if (includeSelf) autoNotes.push(`${SELF} included as a control`);
  if (repos.some((r) => r.sampled)) autoNotes.push('some journals sampled: author counts are lower bounds');
  return {
    date: new Date().toISOString().slice(0, 10),
    queries: perQuery,
    candidates: found.size,
    repos,
    notes: [...autoNotes, ...notes],
  };
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

const LOG_HEADER = `# North Star log

The North Star (docs/product/north-star.md): repositories whose \`.kadence/events\`
holds events from at least two different authors 14 days after \`kadence init\`.
One row a week (strategy O2, KR 2.2). Rows are appended by
\`node scripts/north-star.mjs --search --append\` and never edited.

- **public** — public GitHub repositories with a journal, found by code search
  and verified against their git tree (bogutskiandriy/kadence itself excluded)
- **≥ 14 d** — of those, journals at least 14 days past their first event
- **North Star** — of those, journals with events from ≥ 2 authors. An author is
  the event's \`actor\` email, so one person through a human and an agent is one
- **pilots** — consented private check-ins (\`--local\`), counted by hand

Limits of the method: GitHub's REST code search does index dot-directories
(\`repo:cli/cli path:.github/workflows\` returns hits), but it does not index
every repository — on 2026-09-16 it returned nothing at all for
bogutskiandriy/kadence, public with 45 event files on main. The public count is
a floor, not a census. The script asks several query shapes
and verifies every hit; \`--repo owner/name\` adds a known repository directly.

| date | public | ≥ 14 d | North Star | pilots | notes |
|---|---|---|---|---|---|
`;

function appendRow(logPath, result) {
  mkdirSync(dirname(logPath), { recursive: true });
  if (!existsSync(logPath)) writeFileSync(logPath, LOG_HEADER);
  const text = readFileSync(logPath, 'utf8');
  const row = logRow(result);
  appendFileSync(logPath, `${text.endsWith('\n') ? '' : '\n'}${row}\n`);
  return row;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

class Usage extends Error {}

function parseArgs(argv) {
  const opts = { repos: [], notes: [], json: false, append: false, search: false, includeSelf: false, maxFiles: 300 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Usage(`${a} needs a value`);
      return v;
    };
    if (a === '--local') opts.local = value();
    else if (a === '--search') opts.search = true;
    else if (a === '--append') opts.append = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--from') opts.from = value();
    else if (a === '--log') opts.log = value();
    else if (a === '--now') opts.now = value();
    else if (a === '--note') opts.notes.push(value());
    else if (a === '--repo') opts.repos.push(value());
    else if (a === '--include-self') opts.includeSelf = true;
    else if (a === '--max-files') opts.maxFiles = Number(value());
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Usage(`unknown argument: ${a}`);
  }
  return opts;
}

function printLocal(path, repo) {
  const lines = [
    `${path}`,
    `  events       ${repo.events}${repo.corrupted ? ` (${repo.corrupted} unreadable skipped)` : ''}`,
    `  first event  ${repo.firstEvent ?? '—'}  (${repo.ageDays} days ago)`,
    `  authors      ${repo.authors.length}: ${repo.authors.join(', ') || '—'}`,
    `  by day 14    ${repo.authorsByDay14.length}   after day 14: ${repo.authorsAfterDay14.length}`,
    `  sources      human ${repo.sources.human}, agent ${repo.sources.agent}`,
    `  North Star   ${repo.northStar ? 'yes' : 'no'}${repo.reachedDay14 ? '' : ' (not yet 14 days old)'}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function printSearch(result) {
  const out = [`${result.date}: ${result.candidates} candidate repo(s), ${result.repos.length} with a journal`];
  for (const q of result.queries) out.push(`  query ${JSON.stringify(q.q)}: ${q.total} hit(s), ${q.repos} repo(s)${q.incomplete ? ' (incomplete)' : ''}`);
  for (const r of result.repos) {
    out.push(`  ${r.repo}: ${r.events} events, ${r.authors.length} author(s), ${r.ageDays} d${r.northStar ? ' — North Star' : ''}${r.sampled ? ' (sampled)' : ''}`);
  }
  for (const n of result.notes) out.push(`  note: ${n}`);
  process.stdout.write(`${out.join('\n')}\n`);
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || argv.length === 0) {
    process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?|^ \* ?/gm, ''));
    return 0;
  }

  if (opts.local !== undefined) {
    const root = resolve(opts.local);
    const read = readLocalEvents(root);
    if (read === null) throw new Fatal(`no .kadence/events under ${root}`);
    const now = opts.now ? Date.parse(opts.now) : Date.now();
    if (Number.isNaN(now)) throw new Usage('--now must be an ISO date');
    const repo = { path: root, corrupted: read.corrupted, ...summarise(read.events, now) };
    if (opts.json) process.stdout.write(`${JSON.stringify(repo, null, 2)}\n`);
    else printLocal(root, repo);
    return 0;
  }

  let result;
  if (opts.from !== undefined) {
    result = JSON.parse(readFileSync(resolve(opts.from), 'utf8'));
  } else if (opts.search) {
    result = runSearch({ extraRepos: opts.repos, includeSelf: opts.includeSelf, maxFiles: opts.maxFiles, notes: opts.notes });
    if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else printSearch(result);
  } else if (opts.append) {
    throw new Usage('--append needs a result: run it with --search, or with --from <saved --search --json output>');
  } else {
    throw new Usage('choose --local <path>, --search, or --append --from <file>');
  }

  if (opts.append) {
    if (opts.from !== undefined && opts.notes.length) result.notes = [...(result.notes ?? []), ...opts.notes];
    const row = appendRow(resolve(opts.log ?? DEFAULT_LOG), result);
    process.stderr.write(`appended: ${row}\n`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    if (err instanceof Usage) {
      process.stderr.write(`north-star: ${err.message}\n`);
      process.exitCode = 2;
    } else if (err instanceof Fatal) {
      process.stderr.write(`north-star: ${err.message}\n`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  }
}
