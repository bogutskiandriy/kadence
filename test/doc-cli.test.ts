import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskShow, runTaskClaim } from '../src/cli/commands/task.js';
import { runPrime } from '../src/cli/commands/prime.js';
import { runDocAdd, runDocEdit, runDocShow, runDocList, runDocLink } from '../src/cli/commands/doc.js';
import { append } from '../src/core/store.js';
import { ulid } from '../src/core/ulid.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const agent = { KADENCE_SOURCE: 'agent' } as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-docs-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'ana@example.com'], { cwd: dir });
  runInit(dir);
  runTaskAdd(dir, env, 'Fix login');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('doc add', () => {
  it('writes documentation into the journal and answers with its label', () => {
    const r = runDocAdd(dir, env, 'Auth', { body: 'How login works.' });

    expect(r.ok, r.message).toBe(true);
    expect(r.message).toMatch(/DOC-1/);
    expect((r.data!['document'] as { label: string }).label).toBe('DOC-1');
  });

  it('creates no file beside the journal — documentation is not .md (ADR-014)', () => {
    const before = readdirSync(dir).sort();
    runDocAdd(dir, env, 'Auth', { body: 'How login works.' });
    expect(readdirSync(dir).sort()).toEqual(before);
  });

  it('refuses a document without text', () => {
    const r = runDocAdd(dir, env, 'Auth', { body: '   ' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalid_argument');
  });

  it('refuses a document without a title', () => {
    const r = runDocAdd(dir, env, ' ', { body: 'text' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalid_argument');
  });

  it('reads the body from a file, and does not keep the file', () => {
    const draft = join(dir, 'draft.txt');
    writeFileSync(draft, 'From a draft.\nSecond line.');
    const r = runDocAdd(dir, env, 'Auth', { file: draft });

    expect(r.ok, r.message).toBe(true);
    expect(runDocShow(dir, env, 'DOC-1').data!['document']).toMatchObject({
      body: 'From a draft.\nSecond line.',
    });
  });

  it('names a missing --file instead of writing an empty document', () => {
    const r = runDocAdd(dir, env, 'Auth', { file: join(dir, 'nope.txt') });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalid_argument');
  });

  it('links it to a task in the same call', () => {
    runDocAdd(dir, env, 'Auth', { body: 'text', task: 'KAD-1' });
    const doc = runDocShow(dir, env, 'DOC-1').data!['document'] as { tasks: string[] };
    expect(doc.tasks).toEqual(['KAD-1']);
  });

  it('refuses a task that does not exist, and writes nothing', () => {
    const r = runDocAdd(dir, env, 'Auth', { body: 'text', task: 'KAD-9' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('task_not_found');
    expect((runDocList(dir, env, {}).data!['documents'] as unknown[]).length).toBe(0);
  });

  it('warns past 16 KiB, because agents read long documents worse — but writes it', () => {
    const r = runDocAdd(dir, env, 'Big', { body: 'x'.repeat(17 * 1024) });
    expect(r.ok).toBe(true);
    expect(r.warnings?.join(' ')).toMatch(/16 KiB/);
  });

  it('records who wrote it: an agent is marked as one', () => {
    runDocAdd(dir, agent, 'Auth', { body: 'text' });
    expect(runDocShow(dir, env, 'DOC-1').data!['document']).toMatchObject({ source: 'agent' });
  });
});

describe('doc edit', () => {
  it('writes a new revision; show returns the latest text', () => {
    runDocAdd(dir, env, 'Auth', { body: 'v1' });
    const r = runDocEdit(dir, env, 'DOC-1', { body: 'v2' });

    expect(r.ok, r.message).toBe(true);
    expect(runDocShow(dir, env, 'DOC-1').data!['document']).toMatchObject({ body: 'v2', revisions: 2 });
  });

  it('renames without restating the body', () => {
    runDocAdd(dir, env, 'Auth', { body: 'v1' });
    runDocEdit(dir, env, 'DOC-1', { title: 'Auth flow' });
    expect(runDocShow(dir, env, 'DOC-1').data!['document']).toMatchObject({ title: 'Auth flow', body: 'v1' });
  });

  it('an edit that changes nothing is an error, not a silent revision', () => {
    runDocAdd(dir, env, 'Auth', { body: 'v1' });
    const r = runDocEdit(dir, env, 'DOC-1', { body: 'v1' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalid_argument');
  });

  it('names an unknown document with doc_not_found', () => {
    const r = runDocEdit(dir, env, 'DOC-7', { body: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('doc_not_found');
  });
});

describe('a document revised on two branches', () => {
  /** Two revisions on top of the same one, the way two merged branches leave it. */
  function conflicted(): void {
    runDocAdd(dir, env, 'Auth', { body: 'v1' });
    const doc = runDocShow(dir, env, 'DOC-1').data!['document'] as { id: string; revision: string };
    for (const [by, body] of [['ana@example.com', 'mine'], ['bo@example.com', 'theirs']] as const) {
      append(dir, {
        id: ulid(), type: 'doc.written', entity: doc.id, actor: by, ts: new Date().toISOString(),
        source: 'human', data: { title: 'Auth', body, parents: [doc.revision] },
      });
    }
  }

  it('show names every competing version, however many there are', () => {
    conflicted();
    const r = runDocShow(dir, env, 'DOC-1');
    expect((r.data!['document'] as { conflicts: unknown[] }).conflicts).toHaveLength(1);
    expect(r.warnings!.join(' ')).toMatch(/2 versions/);
  });

  it('an edit without text does not settle it by picking one — someone has to write the merge', () => {
    conflicted();
    const r = runDocEdit(dir, env, 'DOC-1', {});
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('conflicting_state');
    expect((runDocShow(dir, env, 'DOC-1').data!['document'] as { conflicts: unknown[] }).conflicts).toHaveLength(1);
  });

  it('a rename alone does not settle it either', () => {
    conflicted();
    expect(runDocEdit(dir, env, 'DOC-1', { title: 'Auth flow' }).error?.code).toBe('conflicting_state');
  });

  it('an edit with the merged text settles it', () => {
    conflicted();
    const r = runDocEdit(dir, env, 'DOC-1', { body: 'mine and theirs' });
    expect(r.ok, r.message).toBe(true);
    expect(runDocShow(dir, env, 'DOC-1').data!['document']).toMatchObject({ body: 'mine and theirs', conflicts: [] });
  });
});

describe('where the text comes from', () => {
  it('refuses two sources instead of picking one silently', () => {
    const draft = join(dir, 'draft.txt');
    writeFileSync(draft, 'from file');
    const r = runDocAdd(dir, env, 'Both', { body: 'from body', file: draft });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalid_argument');
  });

  it('refuses stdin together with --body', () => {
    const r = runDocAdd(dir, env, 'Both', { body: 'from body', stdin: 'from stdin' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalid_argument');
  });

  it('takes stdin as the text', () => {
    runDocAdd(dir, env, 'Piped', { stdin: 'from stdin' });
    expect(runDocShow(dir, env, 'DOC-1').data!['document']).toMatchObject({ body: 'from stdin' });
  });
});

describe('doc show', () => {
  it('returns one document with its body', () => {
    runDocAdd(dir, env, 'Auth', { body: 'How login works.' });
    const doc = runDocShow(dir, env, 'doc-1').data!['document'] as Record<string, unknown>;

    expect(doc).toMatchObject({ label: 'DOC-1', title: 'Auth', body: 'How login works.', conflicts: [] });
    expect(doc['bytes']).toBe(16);
  });

  it('names an unknown document with doc_not_found', () => {
    expect(runDocShow(dir, env, 'DOC-3').error?.code).toBe('doc_not_found');
  });
});

describe('doc show for one section', () => {
  // A whole document is ~3,600 tokens at the median — the costliest rung after
  // search (KAD-55). Search and the prompt hook already hand out the lines of
  // the section they matched, as DOC-1:5-7; that reference opens just those.
  const RUNBOOK = [
    '# Deploy runbook', //          1
    '', //                          2
    'Read this before a release.', // 3
    '', //                          4
    '## Staging', //                5
    '', //                          6
    'Staging needs the VPN.', //    7
    '', //                          8
    '## Production', //             9
    '', //                         10
    'Production needs two approvals.', // 11
  ].join('\n');

  function section(ref: string): Record<string, unknown> {
    const r = runDocShow(dir, env, ref);
    expect(r.ok, r.message).toBe(true);
    return r.data!['document'] as Record<string, unknown>;
  }

  it('prints only the lines asked for, in text', () => {
    runDocAdd(dir, env, 'Deploy runbook', { body: RUNBOOK });
    const r = runDocShow(dir, env, 'DOC-1:5-8');
    expect(r.message).toContain('Staging needs the VPN.');
    expect(r.message).not.toContain('Production needs two approvals.');
    expect(r.message).toMatch(/lines 5-8 of 11/);
  });

  it('carries the lines in body and says where they sit, in --json', () => {
    runDocAdd(dir, env, 'Deploy runbook', { body: RUNBOOK });
    const doc = section('DOC-1:5-8');
    expect(doc['body']).toBe('## Staging\n\nStaging needs the VPN.\n');
    expect(doc['section']).toEqual({ from: 5, to: 8, lines: 11 });
    // The size of the whole document, as everywhere else: a caller deciding
    // whether to read the rest still needs it.
    expect(doc['bytes']).toBe(Buffer.byteLength(RUNBOOK, 'utf8'));
    expect(doc['label']).toBe('DOC-1');
  });

  it('opens the section a search hit points at', () => {
    runDocAdd(dir, env, 'Deploy runbook', { body: RUNBOOK });
    // The same arithmetic the search index uses: from the heading line to the
    // line before the next heading.
    expect(section('DOC-1:9-11')['body']).toBe('## Production\n\nProduction needs two approvals.');
  });

  it('takes one line, and a ULID as well as a label', () => {
    const added = runDocAdd(dir, env, 'Deploy runbook', { body: RUNBOOK });
    const id = (added.data!['document'] as { id: string }).id;
    expect(section(`${id}:7`)['body']).toBe('Staging needs the VPN.');
  });

  it('stops at the last line when the range runs past it — the document may have been revised since', () => {
    runDocAdd(dir, env, 'Deploy runbook', { body: RUNBOOK });
    const doc = section('DOC-1:9-40');
    expect(doc['section']).toEqual({ from: 9, to: 11, lines: 11 });
  });

  it('refuses a range that starts past the end or runs backwards', () => {
    runDocAdd(dir, env, 'Deploy runbook', { body: RUNBOOK });
    expect(runDocShow(dir, env, 'DOC-1:40-50').error?.code).toBe('invalid_argument');
    expect(runDocShow(dir, env, 'DOC-1:8-5').error?.code).toBe('invalid_argument');
    expect(runDocShow(dir, env, 'DOC-1:0-3').error?.code).toBe('invalid_argument');
  });

  it('still names an unknown document with doc_not_found', () => {
    expect(runDocShow(dir, env, 'DOC-9:1-3').error?.code).toBe('doc_not_found');
  });

  it('leaves the whole-document response exactly as it was', () => {
    runDocAdd(dir, env, 'Deploy runbook', { body: RUNBOOK });
    const doc = section('DOC-1');
    expect(doc['body']).toBe(RUNBOOK);
    expect(doc).not.toHaveProperty('section');
  });
});

describe('doc list', () => {
  it('lists without bodies, so reading the index costs nothing', () => {
    runDocAdd(dir, env, 'Auth', { body: 'x'.repeat(4000) });
    const docs = runDocList(dir, env, {}).data!['documents'] as Record<string, unknown>[];

    expect(docs).toHaveLength(1);
    expect(docs[0]).not.toHaveProperty('body');
    expect(docs[0]).toMatchObject({ label: 'DOC-1', title: 'Auth', bytes: 4000, conflicted: false });
  });

  it('narrows to the documentation of one task', () => {
    runTaskAdd(dir, env, 'Other');
    runDocAdd(dir, env, 'Auth', { body: 'a', task: 'KAD-1' });
    runDocAdd(dir, env, 'Deploys', { body: 'b', task: 'KAD-2' });

    const docs = runDocList(dir, env, { task: 'KAD-2' }).data!['documents'] as { title: string }[];
    expect(docs.map((d) => d.title)).toEqual(['Deploys']);
  });

  it('says how to write the first one when there is none', () => {
    const r = runDocList(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/kadence doc add/);
  });
});

describe('doc link', () => {
  it('attaches a document to a task after the fact', () => {
    runDocAdd(dir, env, 'Auth', { body: 'text' });
    const r = runDocLink(dir, env, 'DOC-1', 'KAD-1');

    expect(r.ok, r.message).toBe(true);
    expect((runDocShow(dir, env, 'DOC-1').data!['document'] as { tasks: string[] }).tasks).toEqual(['KAD-1']);
    // The same document shape every other doc command answers with.
    expect(r.data!['document']).toMatchObject({ label: 'DOC-1', title: 'Auth', bytes: 4, tasks: ['KAD-1'] });
  });

  it('refuses a document or task that does not exist', () => {
    runDocAdd(dir, env, 'Auth', { body: 'text' });
    expect(runDocLink(dir, env, 'DOC-9', 'KAD-1').error?.code).toBe('doc_not_found');
    expect(runDocLink(dir, env, 'DOC-1', 'KAD-9').error?.code).toBe('task_not_found');
  });
});

describe('documentation reaches the agent through the task', () => {
  it('task show carries documentation without bodies', () => {
    runDocAdd(dir, env, 'Auth', { body: 'How login works.', task: 'KAD-1' });
    const task = runTaskShow(dir, env, 'KAD-1').data!['task'] as Record<string, unknown>;
    const docs = task['documentation'] as Record<string, unknown>[];

    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ label: 'DOC-1', title: 'Auth', bytes: 16 });
    expect(docs[0]).not.toHaveProperty('body');
  });

  it('is an empty array when nothing is linked, so an agent need not branch', () => {
    const task = runTaskShow(dir, env, 'KAD-1').data!['task'] as Record<string, unknown>;
    expect(task['documentation']).toEqual([]);
  });
});

describe('prime brings the documentation of your work into the session', () => {
  it('names documents linked to what you claimed, without their text', () => {
    runDocAdd(dir, env, 'Auth', { body: 'How login works.', task: 'KAD-1' });
    runTaskClaim(dir, env, 'KAD-1');
    const r = runPrime(dir, env, {});

    expect(r.message).toMatch(/DOC-1/);
    expect(r.message).not.toMatch(/How login works/);
    expect(r.data!['documentation']).toEqual([{ label: 'DOC-1', title: 'Auth', task: 'KAD-1', bytes: 16 }]);
    expect(r.data!['documentationTotal']).toBe(1);
  });

  it('counts documentation past the three it shows, as mineTotal does for work', () => {
    for (let i = 1; i <= 5; i++) runDocAdd(dir, env, `Doc ${i}`, { body: 'text', task: 'KAD-1' });
    runTaskClaim(dir, env, 'KAD-1');
    const r = runPrime(dir, env, {});
    expect((r.data!['documentation'] as unknown[]).length).toBe(3);
    expect(r.data!['documentationTotal']).toBe(5);
    expect(r.message).toMatch(/3 of 5/);
  });

  it('says nothing about documentation when your work has none', () => {
    runDocAdd(dir, env, 'Unrelated', { body: 'text' });
    runTaskClaim(dir, env, 'KAD-1');
    const r = runPrime(dir, env, {});

    expect(r.message).not.toMatch(/Documentation/);
    expect(r.data!['documentation']).toEqual([]);
  });
});

describe('the journal file', () => {
  it('stores a multi-line body as lines', () => {
    runDocAdd(dir, env, 'Auth', { body: 'one\ntwo' });
    const month = readdirSync(join(dir, '.kadence', 'events'))[0]!;
    const files = readdirSync(join(dir, '.kadence', 'events', month));
    const texts = files.map((f) => readFileSync(join(dir, '.kadence', 'events', month, f), 'utf8'));
    expect(texts.some((t) => t.includes('"one",') && t.includes('"two"'))).toBe(true);
    expect(existsSync(join(dir, 'docs'))).toBe(false);
  });
});
