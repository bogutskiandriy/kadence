import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import {
  runTaskAdd,
  runTaskMove,
  runTaskAssign,
  runTaskCriterionAdd,
  runTaskCriterionCheck,
} from '../src/cli/commands/task.js';
import { runDecisionAdd } from '../src/cli/commands/decision.js';
import { runSprintCreate, runSprintAdd } from '../src/cli/commands/sprint.js';
import { runMilestoneCreate, runMilestoneAdd } from '../src/cli/commands/milestone.js';
import { runBoardExport, runBoardConfig } from '../src/cli/commands/board.js';

/**
 * The static export — the experiment that stands in for a web UI.
 *
 * The whole point is that a file can carry the human's view without a server:
 * no process outlives the command, and nothing in the page reaches the network.
 * If either of those stops being true, this has quietly become the thing the
 * product said it would not build. The kill condition is in
 * docs/product/feature-adoption-2026-09.md.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-export-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A repository with one of everything the export claims to show. */
function busyRepo(): void {
  runSprintCreate(dir, env, 'Sprint 1');
  runTaskAdd(dir, env, 'Login form', { estimate: 3, priority: 'high' });
  runTaskAdd(dir, env, 'Signup form', { estimate: 5 });
  runTaskAdd(dir, env, 'Password reset', { estimate: 2 });
  runSprintAdd(dir, env, 'KAD-1', {});
  runSprintAdd(dir, env, 'KAD-2', {});
  runTaskMove(dir, env, 'KAD-1', 'done');
  runTaskMove(dir, env, 'KAD-2', 'in_progress');
  runTaskCriterionAdd(dir, env, 'KAD-2', 'Tests green');
  runTaskCriterionAdd(dir, env, 'KAD-2', 'Docs updated');
  runTaskCriterionCheck(dir, env, 'KAD-2', '1', false);
  runMilestoneCreate(dir, env, '1.0', { due: '2026-12-01' });
  runMilestoneAdd(dir, env, 'KAD-1', '1.0');
  runDecisionAdd(dir, env, 'Use ULIDs everywhere', {
    why: 'Clocks disagree between machines',
    rejected: 'Auto-increment integers',
  });
}

describe('HTML export', () => {
  it('writes one file that opens from disk', () => {
    busyRepo();
    const r = runBoardExport(dir, env, { html: true });
    expect(r.ok).toBe(true);
    const path = join(dir, 'kadence-board.html');
    expect(existsSync(path)).toBe(true);
    expect(r.message).toContain(path);

    const html = readFileSync(path, 'utf8');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
  });

  it('reaches the network for nothing at all', () => {
    // The line this experiment must not cross. Asserted structurally rather
    // than by URL scheme: a protocol-relative `//host/x`, a `url()` in the
    // inline stylesheet or an `@font-face` would all load at open time and
    // would all pass a check for `https?:`.
    busyRepo();
    runBoardExport(dir, env, { html: true });
    const html = readFileSync(join(dir, 'kadence-board.html'), 'utf8');

    for (const forbidden of [
      /<script/i,
      /<link/i,
      /<img/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
      /<video/i,
      /<audio/i,
      /srcset/i,
      /url\(/i,
      /@font-face/i,
      /@import/i,
      /fetch\(|XMLHttpRequest|WebSocket|EventSource/,
      /rel\s*=\s*["'](?:preload|prefetch|dns-prefetch|preconnect)/i,
      // Protocol-relative, which no scheme check would catch.
      /["']\/\/[a-z]/i,
      /https?:/i,
    ]) {
      expect(html, `the page must not contain ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it('escapes every place a person can type, not only the title', () => {
    // The title was covered; the assignee, the milestone name, the decision
    // text and the status — which lands in a class attribute — were not.
    runTaskAdd(dir, env, 'A task', {});
    runTaskAssign(dir, env, 'KAD-1', '<img src=x onerror=alert(1)>');
    runMilestoneCreate(dir, env, '<script>ms</script>', {});
    runMilestoneAdd(dir, env, 'KAD-1', '<script>ms</script>');
    runDecisionAdd(dir, env, '<b>title</b>', { why: '<i>why</i>', rejected: '<u>no</u>' });
    runBoardConfig(dir, env, 'todo,he_said_"x",done', undefined);
    runTaskMove(dir, env, 'KAD-1', 'he_said_"x"');

    runBoardExport(dir, env, { html: true });
    const html = readFileSync(join(dir, 'kadence-board.html'), 'utf8');

    for (const raw of ['<img src=x', '<script>ms', '<b>title</b>', '<i>why</i>', '<u>no</u>']) {
      expect(html, `${raw} must not reach the page raw`).not.toContain(raw);
    }
    // And the quote in the status must not break out of the class attribute.
    expect(html).toContain('class="card he_said_&quot;x&quot;"');
  });

  it('draws the burndown when a sprint is running', () => {
    // The one section skipped without an active sprint, and so the one nothing
    // else exercises.
    busyRepo();
    runBoardExport(dir, env, { html: true });
    const html = readFileSync(join(dir, 'kadence-board.html'), 'utf8');
    expect(html).toContain('Burndown');
    expect(html).toMatch(/class="chart"/);
  });

  it('keeps decisions and milestones on a board with no tasks', () => {
    // A repository that records a decision before its first task is the case
    // this product is for; exporting "no tasks yet" and dropping it would be
    // the worst possible omission.
    runDecisionAdd(dir, env, 'Use ULIDs everywhere', { why: 'Clocks disagree' });
    runMilestoneCreate(dir, env, '1.0', {});
    runBoardExport(dir, env, { html: true });
    const html = readFileSync(join(dir, 'kadence-board.html'), 'utf8');
    expect(html).toContain('No tasks yet');
    expect(html).toContain('Use ULIDs everywhere');
    expect(html).toContain('Milestones');
  });

  it('refuses a path outside the repository', () => {
    // The file is written before anything else happens, so containment is
    // checked rather than described.
    busyRepo();
    for (const escape of ['../escaped.html', '/tmp/escaped.html', 'docs/../../escaped.html']) {
      const r = runBoardExport(dir, env, { html: true, file: escape });
      expect(r.ok, `${escape} must be refused`).toBe(false);
      expect(r.error!.code).toBe('invalid_argument');
      expect(existsSync(join(dir, '..', 'escaped.html'))).toBe(false);
    }
  });

  it('fails rather than throwing when the target is a directory', () => {
    busyRepo();
    mkdirSync(join(dir, 'out'), { recursive: true });
    const r = runBoardExport(dir, env, { md: true, file: 'out' });
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('conflicting_state');
  });

  it('shows the board, the sprint, the milestones and the decisions', () => {
    busyRepo();
    runBoardExport(dir, env, { html: true });
    const html = readFileSync(join(dir, 'kadence-board.html'), 'utf8');

    expect(html).toContain('Login form');
    expect(html).toContain('Signup form');
    expect(html).toContain('Sprint 1');
    expect(html).toContain('1.0');
    expect(html).toContain('Use ULIDs everywhere');
    expect(html).toContain('Clocks disagree between machines');
    expect(html).toContain('Tests green');
  });

  it('escapes anything a person typed', () => {
    runTaskAdd(dir, env, '<script>alert(1)</script> & "quotes"', {});
    runBoardExport(dir, env, { html: true });
    const html = readFileSync(join(dir, 'kadence-board.html'), 'utf8');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('takes a path when given one', () => {
    busyRepo();
    const r = runBoardExport(dir, env, { html: true, file: 'docs/board.html' });
    expect(r.ok).toBe(true);
    expect(existsSync(join(dir, 'docs', 'board.html'))).toBe(true);
  });

  it('says when the board is empty rather than writing a blank page', () => {
    const r = runBoardExport(dir, env, { html: true });
    expect(r.ok).toBe(true);
    const html = readFileSync(join(dir, 'kadence-board.html'), 'utf8');
    expect(html).toContain('No tasks yet');
  });
});

describe('Markdown export', () => {
  it('writes a board a README can carry', () => {
    busyRepo();
    const r = runBoardExport(dir, env, { md: true });
    expect(r.ok).toBe(true);
    const md = readFileSync(join(dir, 'kadence-board.md'), 'utf8');
    expect(md).toMatch(/^#/m);
    expect(md).toContain('Login form');
    expect(md).toContain('| KAD-1 |');
  });

  it('escapes a pipe so one title cannot break the table', () => {
    runTaskAdd(dir, env, 'Fix a | b parsing', {});
    runBoardExport(dir, env, { md: true });
    const md = readFileSync(join(dir, 'kadence-board.md'), 'utf8');
    expect(md).toContain('Fix a \\| b parsing');
  });

  it('escapes a pipe in a status too, not only in a title', () => {
    // Statuses are configurable and permit every character but whitespace, so
    // the column count depends on a value the team chose.
    runBoardConfig(dir, env, 'todo,do|ne2,done', undefined);
    runTaskAdd(dir, env, 'Piped', {});
    runTaskMove(dir, env, 'KAD-1', 'do|ne2');
    runBoardExport(dir, env, { md: true });
    const md = readFileSync(join(dir, 'kadence-board.md'), 'utf8');
    const row = md.split('\n').find((l) => l.includes('Piped'))!;
    // Split on unescaped pipes only — an escaped one is a character in a cell,
    // which is the whole point of escaping it.
    expect(row.split(/(?<!\\)\|/)).toHaveLength(10);
    expect(row).toContain('do\\|ne2');
  });

  it('a title carrying the end marker cannot split the section', () => {
    // The marker is what the upsert searches for. A task titled after it would
    // end the block early, and the corruption would grow by one copy on every
    // export.
    const readme = join(dir, 'README.md');
    writeFileSync(readme, '# My project\n\nKeep me.\n', 'utf8');
    runTaskAdd(dir, env, 'Fix the <!-- kadence:board:end --> parser', {});

    for (let i = 0; i < 3; i++) runBoardExport(dir, env, { md: true, readme: true });

    const after = readFileSync(readme, 'utf8');
    expect(after).toContain('Keep me.');
    expect(after.split('<!-- kadence:board:begin -->')).toHaveLength(2);
    expect(after.split('<!-- kadence:board:end -->')).toHaveLength(2);
  });

  it('refuses --file together with --readme rather than ignoring it', () => {
    writeFileSync(join(dir, 'README.md'), '# P\n', 'utf8');
    const r = runBoardExport(dir, env, { md: true, readme: true, file: 'docs/x.md' });
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
  });

  it('updates the section between markers and leaves the rest of the file alone', () => {
    busyRepo();
    const readme = join(dir, 'README.md');
    writeFileSync(
      readme,
      '# My project\n\nSomething I wrote.\n\n<!-- kadence:board:begin -->\nold\n<!-- kadence:board:end -->\n\nA closing paragraph.\n',
      'utf8',
    );

    const r = runBoardExport(dir, env, { md: true, readme: true });
    expect(r.ok).toBe(true);
    const after = readFileSync(readme, 'utf8');
    expect(after).toContain('# My project');
    expect(after).toContain('Something I wrote.');
    expect(after).toContain('A closing paragraph.');
    expect(after).not.toContain('\nold\n');
    expect(after).toContain('Login form');
    // Exactly one section, however many times it is run.
    runBoardExport(dir, env, { md: true, readme: true });
    const twice = readFileSync(readme, 'utf8');
    expect(twice.split('<!-- kadence:board:begin -->')).toHaveLength(2);
  });

  it('appends the section when the README has no markers yet', () => {
    busyRepo();
    const readme = join(dir, 'README.md');
    writeFileSync(readme, '# My project\n', 'utf8');
    runBoardExport(dir, env, { md: true, readme: true });
    const after = readFileSync(readme, 'utf8');
    expect(after).toContain('# My project');
    expect(after).toContain('<!-- kadence:board:begin -->');
  });

  it('refuses --readme without a README rather than creating one', () => {
    // A state refusal, not a bad argument: the caller typed no path.
    busyRepo();
    const r = runBoardExport(dir, env, { md: true, readme: true });
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('conflicting_state');
    expect(r.exitCode).toBe(1);
  });
});

describe('export arguments', () => {
  it('needs to be told which format', () => {
    const r = runBoardExport(dir, env, {});
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
    expect(r.message).toMatch(/--html/);
    expect(r.message).toMatch(/--md/);
  });

  it('refuses --readme with --html, because a README is markdown', () => {
    const r = runBoardExport(dir, env, { html: true, readme: true });
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
  });
});
