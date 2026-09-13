import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runCompact } from '../src/cli/commands/compact.js';
import { append, archiveDir, eventsDir, readAll } from '../src/core/store.js';
import { createUlid } from '../src/core/ulid.js';
import type { FlowEvent } from '../src/core/event.js';

/**
 * `kadence compact` — the command that did not exist.
 *
 * `compact()` has lived in the core since 0.1 and was called only by tests, so
 * the "compaction exists for exactly this case" comment in the perf test
 * described a path no user could take. Measured on 10,000 events: 199 ms cold
 * as separate files, 21 ms compacted. This makes the second number reachable.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const gen = createUlid();

function eventIn(month: string): FlowEvent {
  const id = gen();
  return {
    id,
    type: 'task.created',
    entity: id,
    actor: 'a@b.c',
    ts: `${month}-15T10:00:00.000Z`,
    source: 'human',
    data: { title: `in ${month}` },
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-compact-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
  for (const month of ['2026-01', '2026-01', '2026-03', '2026-08', '2026-09']) {
    append(dir, eventIn(month));
  }
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const TODAY = new Date('2026-09-10T12:00:00.000Z');

describe('runCompact', () => {
  it('fails loudly when an archive cannot be read, and keeps the month', () => {
    // Reporting success here would be the worst outcome: the command that is
    // supposed to make the journal smaller would have made it shorter, and
    // said nothing. Exit non-zero, name the file, leave everything in place.
    mkdirSync(archiveDir(dir), { recursive: true });
    const target = join(archiveDir(dir), '2026-01.json');
    writeFileSync(target, 'not json at all', 'utf8');

    const r = runCompact(dir, env, {}, TODAY);

    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.error?.code).toBe('conflicting_state');
    expect(r.message).toContain('2026-01.json');
    expect(readFileSync(target, 'utf8')).toBe('not json at all');
    expect(existsSync(join(eventsDir(dir), '2026-01'))).toBe(true);
  });

  it('keeps the current and previous month by default and archives the rest', () => {
    const r = runCompact(dir, env, {}, TODAY);
    expect(r.ok).toBe(true);
    expect(r.data!['archivedMonths']).toEqual(['2026-01', '2026-03']);
    expect(r.data!['archivedEvents']).toBe(3);
    expect(existsSync(join(archiveDir(dir), '2026-01.json'))).toBe(true);
    expect(existsSync(join(eventsDir(dir), '2026-08'))).toBe(true);
    expect(existsSync(join(eventsDir(dir), '2026-09'))).toBe(true);
  });

  it('loses no events', () => {
    const before = readAll(dir).events.map((e) => e.id).sort();
    runCompact(dir, env, {}, TODAY);
    expect(readAll(dir).events.map((e) => e.id).sort()).toEqual(before);
  });

  it('merges into an archive that is already there, and loses nothing', () => {
    // A branch compacts January, merges, and then delivers one more January
    // event — `append` files it by its own timestamp, so it lands in a January
    // directory next to the archive. Overwriting the archive here deleted
    // every event in it, silently, in a journal whose promise is the opposite.
    append(dir, eventIn('2026-01'));
    const before = readAll(dir).events.map((e) => e.id).sort();
    runCompact(dir, env, {}, TODAY);
    append(dir, eventIn('2026-01'));
    const second = runCompact(dir, env, {}, TODAY);

    const after = readAll(dir).events.map((e) => e.id).sort();
    expect(after).toHaveLength(before.length + 1);
    expect(after).toEqual(expect.arrayContaining(before));
    // Only the new one moved: the three already archived were not re-counted.
    expect(second.data!['archivedEvents']).toBe(1);
  });

  it('a dry run counts only what is not archived yet', () => {
    runCompact(dir, env, {}, TODAY);
    append(dir, eventIn('2026-01'));
    const plan = runCompact(dir, env, { dryRun: true }, TODAY);
    expect(plan.data!['archivedEvents']).toBe(1);
  });

  it('names what it did, in months and events', () => {
    const r = runCompact(dir, env, {}, TODAY);
    expect(r.message).toMatch(/2026-01/);
    expect(r.message).toMatch(/2026-03/);
    expect(r.message).toMatch(/3 event/);
  });

  it('honours --keep-months', () => {
    const r = runCompact(dir, env, { keepMonths: 8 }, TODAY);
    // Keeping eight months back from September leaves February onward alone.
    expect(r.data!['archivedMonths']).toEqual(['2026-01']);
  });

  it('a dry run writes nothing and says what it would do', () => {
    const r = runCompact(dir, env, { dryRun: true }, TODAY);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/would archive/i);
    expect(r.message).toMatch(/2026-01/);
    expect(existsSync(archiveDir(dir))).toBe(false);
    expect(readdirSync(eventsDir(dir)).sort()).toEqual(['2026-01', '2026-03', '2026-08', '2026-09']);
  });

  it('says when there is nothing to archive', () => {
    runCompact(dir, env, {}, TODAY);
    const again = runCompact(dir, env, {}, TODAY);
    expect(again.ok).toBe(true);
    expect(again.message).toMatch(/nothing to archive/i);
    expect(again.data!['archivedEvents']).toBe(0);
  });

  it('refuses a keep-months that is not a positive whole number', () => {
    for (const bad of [0, -1, 1.5]) {
      const r = runCompact(dir, env, { keepMonths: bad }, TODAY);
      expect(r.ok, `${bad} must be refused`).toBe(false);
      expect(r.error!.code).toBe('invalid_argument');
    }
  });

  it('touches nothing in git — the archive is files, the commit is the human’s', () => {
    runCompact(dir, env, {}, TODAY);
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
    // Everything is still uncommitted working-tree change; nothing was staged.
    expect(status.split('\n').filter((l) => l.length > 0).every((l) => l.startsWith('??'))).toBe(true);
  });

  it('tells the user what the compacted archive means for a merge', () => {
    const r = runCompact(dir, env, {}, TODAY);
    // One file per archived month is the one place two branches can now collide.
    expect(r.message).toMatch(/branch/i);
  });
});
