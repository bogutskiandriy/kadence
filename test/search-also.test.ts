import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';
import { search, searchAll } from '../src/core/search.js';
import { runInit } from '../src/cli/commands/init.js';
import { runDecisionAdd } from '../src/cli/commands/decision.js';
import { runNoteAdd } from '../src/cli/commands/note.js';
import { runSearch } from '../src/cli/commands/search.js';

/**
 * Several phrasings, one answer (KAD-70).
 *
 * A lexical search cannot bridge "website" and "landing page"; the agent
 * calling it can, by writing the question two or three ways in the project's
 * words. Measured on a scratch copy: the question plus three agent phrasings,
 * fused by reciprocal rank, took the golden set to 0.92 and first place from
 * 37 to 59 of 100. kadence stays lexical; the vocabulary comes from the caller.
 */

const gen = createUlid();
function event(type: FlowEvent['type'], data: Record<string, unknown>): FlowEvent {
  const id = gen();
  return { id, type, entity: id, actor: 'tester@example.com', ts: '2026-09-02T10:00:00.000Z', source: 'human', data };
}
const note = (text: string): FlowEvent => event('note.recorded', { text });
const decision = (title: string, why: string): FlowEvent => event('decision.recorded', { title, why });
const doc = (title: string, body: string): FlowEvent => event('doc.written', { title, body, parents: [] });

const corpus = () =>
  project([
    note('The board renders its own columns'),
    note('Tests need a git identity'),
    note('Sprints are optional'),
    doc('Where the landing page lives', '# Where the landing page lives\n\nThe landing page is served from GitHub Pages.'),
    decision('Use ULIDs', 'Clocks disagree between machines'),
    doc('Release checklist', '# Release checklist\n\nTag, publish to npm, then update the site.'),
  ]);

describe('searchAll', () => {
  it('finds through a phrasing what the question alone cannot reach', () => {
    const state = corpus();
    expect(search(state, 'where is the website hosted')).toEqual([]);
    const hits = searchAll(state, ['where is the website hosted', 'landing page served from']);
    expect(hits[0]?.title).toBe('Where the landing page lives');
  });

  it('returns each passage once, however many phrasings found it', () => {
    const hits = searchAll(corpus(), ['landing page', 'landing page served', 'where the landing page lives']);
    const keys = hits.map((h) => `${h.id}:${h.lines?.from ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ranks a passage found by several phrasings above one found by one', () => {
    const hits = searchAll(corpus(), ['landing page served', 'github pages site', 'publish to npm']);
    expect(hits[0]!.title).toBe('Where the landing page lives');
  });

  it('is the plain search when given one query', () => {
    const state = corpus();
    expect(searchAll(state, ['clocks disagree machines'])).toEqual(search(state, 'clocks disagree machines'));
  });

  it('says nothing when no phrasing finds anything', () => {
    expect(searchAll(corpus(), ['kubernetes ingress', 'webpack chunk splitting'])).toEqual([]);
  });

  it('honours the limit across the fused list', () => {
    expect(searchAll(corpus(), ['landing page', 'release checklist', 'clocks'], { limit: 2 })).toHaveLength(2);
  });

  it('gives the same answer whatever order the phrasings came in, for the same set', () => {
    // The question is not special in the fusion: an agent that leads with a
    // phrasing should not get a different journal back.
    const state = corpus();
    const a = searchAll(state, ['landing page served', 'publish to npm']).map((h) => h.id);
    const b = searchAll(state, ['publish to npm', 'landing page served']).map((h) => h.id);
    expect(b).toEqual(a);
  });
});

describe('kadence search --also', () => {
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;
  const CLI = resolve('dist/cli.js');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-also-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
    runInit(dir);
    runDecisionAdd(dir, env, 'Host the landing page on GitHub Pages', { why: 'Free, static, next to the code' });
    runNoteAdd(dir, env, 'Tests need a git identity', {});
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('fuses the phrasings and echoes them back in --json', () => {
    const r = runSearch(dir, env, 'where is the website hosted', { also: ['landing page GitHub Pages'] });
    expect(r.ok, r.message).toBe(true);
    expect(r.data!['also']).toEqual(['landing page GitHub Pages']);
    expect((r.data!['hits'] as Array<{ title: string }>)[0]!.title).toBe('Host the landing page on GitHub Pages');
  });

  it('carries also: [] on a plain search, so an agent need not branch on absence', () => {
    expect(runSearch(dir, env, 'git identity', {}).data!['also']).toEqual([]);
  });

  it('takes the flag repeated, through the real binary', () => {
    const r = spawnSync(
      'node',
      [CLI, 'search', 'where is the website hosted', '--also', 'landing page', '--also', 'GitHub Pages hosting', '--json'],
      { cwd: dir, encoding: 'utf8' },
    );
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.also).toEqual(['landing page', 'GitHub Pages hosting']);
    expect(out.hits[0].title).toBe('Host the landing page on GitHub Pages');
  });

  it('keeps a phrasing that looks like a number as the text that was typed', () => {
    const r = spawnSync('node', [CLI, 'search', 'identity', '--also', '007', '--json'], { cwd: dir, encoding: 'utf8' });
    expect(JSON.parse(r.stdout).also).toEqual(['007']);
  });
});
