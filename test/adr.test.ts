import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAdr, findAdrs } from '../src/cli/adr.js';

/**
 * Reading the decisions a team already wrote down (KAD-77, KAD-89).
 *
 * A first journal answers nothing; the decisions most teams have live in an
 * ADR folder. Onboarding offers them, so reading them has to be right about
 * the two formats almost everyone uses — MADR and Nygard's — and honest when a
 * file is neither: the title and the file, nothing guessed.
 */

describe('parseAdr', () => {
  it('reads a MADR record: title, the reason it was chosen, what lost', () => {
    const adr = parseAdr(
      '# Postgres for orders\n\n## Considered Options\n\n- Postgres\n- MongoDB\n- MySQL\n\n## Decision Outcome\n\nChosen option: "Postgres", because orders and stock change in one transaction.\n',
      'docs/adr/0001-postgres.md',
    );
    expect(adr).toEqual({
      path: 'docs/adr/0001-postgres.md',
      title: 'Postgres for orders',
      why: 'orders and stock change in one transaction',
      rejected: ['MongoDB', 'MySQL'],
    });
  });

  it('reads a Nygard record: the numbered title and the first line of the decision', () => {
    const adr = parseAdr(
      '# 3. Record architecture decisions\n\nDate: 2026-01-02\n\n## Status\n\nAccepted\n\n## Context\n\nWe forget why.\n\n## Decision\n\nWe will keep ADRs in docs/adr.\n\n## Consequences\n\nMore files.\n',
      'docs/adr/0003-record.md',
    );
    expect(adr.title).toBe('Record architecture decisions');
    expect(adr.why).toBe('We will keep ADRs in docs/adr.');
    expect(adr.rejected).toEqual([]);
  });

  it('takes the file name when there is no heading, and guesses nothing else', () => {
    expect(parseAdr('Some notes without structure.', 'adr/0007-cache-keys.md')).toEqual({
      path: 'adr/0007-cache-keys.md',
      title: '0007-cache-keys',
      why: '',
      rejected: [],
    });
  });

  it('keeps an option that only starts like the chosen one as rejected only when it is another option', () => {
    const adr = parseAdr(
      '# Monorepo\n\n## Considered Options\n\n* One repository with pnpm workspaces\n* Separate repositories\n\n## Decision Outcome\n\nChosen option: "One repository with pnpm workspaces", because api and web share types.\n',
      'x.md',
    );
    expect(adr.rejected).toEqual(['Separate repositories']);
  });
});

describe('findAdrs', () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'kadence-adr-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('finds the first ADR folder of the usual names, in file order, Markdown only', () => {
    mkdirSync(join(dir, 'docs', 'decisions'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'decisions', '0002-b.md'), '# B\n');
    writeFileSync(join(dir, 'docs', 'decisions', '0001-a.md'), '# A\n');
    writeFileSync(join(dir, 'docs', 'decisions', 'template.txt'), 'x');
    const found = findAdrs(dir);
    expect(found.dir).toBe('docs/decisions');
    expect(found.adrs.map((a) => a.title)).toEqual(['A', 'B']);
  });

  it('leaves out a template and the index, which are not decisions', () => {
    mkdirSync(join(dir, 'docs', 'adr'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'adr', '0001-a.md'), '# A\n');
    writeFileSync(join(dir, 'docs', 'adr', 'README.md'), '# Index\n');
    writeFileSync(join(dir, 'docs', 'adr', 'template.md'), '# Title\n');
    expect(findAdrs(dir).adrs.map((a) => a.title)).toEqual(['A']);
  });

  it('answers with nothing when there is no folder', () => {
    expect(findAdrs(dir)).toEqual({ dir: null, adrs: [] });
  });
});
