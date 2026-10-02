import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, cpSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAll } from '../src/core/store.js';
import { project } from '../src/core/projection.js';

/**
 * A journal written by any released kadence folds, with today's code, into
 * what that version itself said it held (KAD-59, gate G3 in DOC-32).
 *
 * The journal lives in other people's repositories and outlives the version
 * that wrote it. In the neighbouring tools the most common reason people left
 * was an upgrade that lost their data (discovery 2026-09-30). So the fixtures
 * are not hand-written: scripts/make-fixtures.mjs installs every published
 * minor version from npm, drives it through one scenario, and keeps both the
 * events it wrote and its own `task list` / `decision list` answers. A change
 * that folds an old journal differently fails here, before a release.
 */

const FIXTURES = join(import.meta.dirname, 'fixtures', 'journals');
const versions = readdirSync(FIXTURES).sort();

interface View {
  version: string;
  tasks: { tasks: Array<Record<string, unknown>> } | null;
  decisions: { decisions: Array<Record<string, unknown>> } | null;
}

/** The fixture's events, read by the real reader from a real `.kadence/`. */
function load(version: string) {
  const root = mkdtempSync(join(tmpdir(), `kadence-compat-${version}-`));
  try {
    mkdirSync(join(root, '.kadence'), { recursive: true });
    cpSync(join(FIXTURES, version, 'events'), join(root, '.kadence', 'events'), { recursive: true });
    return readAll(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const viewOf = (version: string): View =>
  JSON.parse(readFileSync(join(FIXTURES, version, 'view.json'), 'utf8')) as View;

describe('journals written by every released version', () => {
  it('covers every minor version from 0.1 to the current one', () => {
    const minors = new Set(versions.map((v) => v.split('.').slice(0, 2).join('.')));
    for (const minor of ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8']) {
      expect(minors, minor).toContain(minor);
    }
  });

  describe.each(versions)('%s', (version) => {
    const read = load(version);
    const state = project(read.events);
    const view = viewOf(version);

    it('reads every event: none corrupted, none of an unknown type', () => {
      expect(read.corrupted).toEqual([]);
      expect(read.unknownTypes).toBe(0);
      expect(read.events.length).toBeGreaterThan(0);
    });

    it('folds without rejecting anything that version accepted', () => {
      expect(state.rejected.map((e) => e.type)).toEqual([]);
    });

    it('agrees with that version on every task it listed', () => {
      const listed = view.tasks?.tasks ?? [];
      expect(listed.length).toBeGreaterThan(0);
      for (const old of listed) {
        const now = state.tasks.find((t) => t.id === old['id']);
        expect(now, `${version} ${String(old['label'])}`).toBeDefined();
        for (const field of ['label', 'title', 'status', 'type', 'priority', 'assignee', 'estimate'] as const) {
          if (field in old) expect((now as unknown as Record<string, unknown>)[field], `${version} ${String(old['label'])}.${field}`).toEqual(old[field]);
        }
        if (Array.isArray(old['labels'])) {
          expect([...now!.labels].sort(), `${version} ${String(old['label'])}.labels`).toEqual([...(old['labels'] as string[])].sort());
        }
      }
    });

    it('agrees with that version on every decision, superseded ones included', () => {
      const listed = view.decisions?.decisions ?? [];
      for (const old of listed) {
        const now = state.decisions.find((d) => d.id === old['id']);
        expect(now, `${version} ${String(old['label'])}`).toBeDefined();
        expect(now!.label).toBe(old['label']);
        expect(now!.title).toBe(old['title']);
        // The state holds the ULID (I7); a version's JSON may have printed the
        // label. Either way it must name the same decision.
        if ('supersededBy' in old) {
          const by = now!.supersededBy === null ? null : state.decisions.find((d) => d.id === now!.supersededBy);
          const expected = old['supersededBy'];
          expect(expected === null ? now!.supersededBy : [by?.id, by?.label], `${version} ${String(old['label'])}.supersededBy`).toEqual(
            expected === null ? null : expect.arrayContaining([expected]),
          );
        }
      }
    });

    it('folds to the same state whatever order the files are read in (I1)', () => {
      const reversed = project([...read.events].reverse());
      expect(JSON.stringify(reversed.tasks)).toBe(JSON.stringify(state.tasks));
      expect(JSON.stringify(reversed.decisions)).toBe(JSON.stringify(state.decisions));
    });
  });
});
