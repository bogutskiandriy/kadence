import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGuidedInit } from '../src/cli/onboarding.js';
import { runInit } from '../src/cli/commands/init.js';
import { runDecisionAdd } from '../src/cli/commands/decision.js';
import { loadState } from '../src/cli/commands/task.js';
import { visible } from '../src/cli/prompts.js';

/**
 * The guided `kadence init`, every case the prototype recorded (KAD-89):
 * A1 one decision by hand · A2 ADRs · A3 customize · A4 not now, and Ctrl-C
 * halfway · A5 init again as a checkup.
 *
 * Driven through a fake terminal with the bytes a real one sends. Each key is
 * sent only once a prompt is listening — keys sent between two prompts would
 * be lost, which is also what would happen to a person typing ahead.
 */

const DOWN = '\x1b[B';
const ENTER = '\r';
const SPACE = ' ';
const CTRL_C = '\x03';

let dir: string;
const env = { ...process.env, NO_COLOR: '1', KADENCE_SOURCE: undefined } as NodeJS.ProcessEnv;
delete env['KADENCE_SOURCE'];

function repo(withAdrs = false): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'lead@acme.dev'], { cwd: dir });
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'settings.json'), '{}');
  if (!withAdrs) return;
  mkdirSync(join(dir, '.cursor'));
  mkdirSync(join(dir, 'docs', 'adr'), { recursive: true });
  const adr = (file: string, title: string, options: string[], chosen: string, because: string) =>
    writeFileSync(
      join(dir, 'docs', 'adr', file),
      `# ${title}\n\n## Considered Options\n\n${options.map((o) => `- ${o}`).join('\n')}\n\n## Decision Outcome\n\nChosen option: "${chosen}", because ${because}.\n`,
    );
  adr('0001-postgres.md', 'Postgres for orders', ['Postgres', 'MongoDB', 'MySQL'], 'Postgres', 'orders and stock change in one transaction');
  adr('0002-rest.md', 'REST, not GraphQL', ['REST', 'GraphQL'], 'REST', 'there is one client');
  adr('0003-fly.md', 'Deploy on Fly.io', ['Fly.io', 'Kubernetes on GKE'], 'Fly.io', 'regions close to users without a cluster');
}

let columns = 120;
async function guided(...keys: string[]): Promise<{ code: number; screen: string }> {
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => undefined });
  const output = Object.assign(new PassThrough(), { columns });
  let screen = '';
  output.on('data', (d) => (screen += String(d)));
  const run = runGuidedInit({ io: { input, output }, cwd: dir, env, version: 'test', color: false, pause: async () => {} });
  const tick = () => new Promise((r) => setTimeout(r, 5));
  for (const key of keys) {
    for (let i = 0; i < 400 && input.listenerCount('keypress') === 0; i++) await tick();
    input.write(key);
    await tick();
  }
  const code = await run;
  return { code, screen: visible(screen) };
}

const decisions = () => loadState(dir).state.decisions;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-onboarding-'));
  columns = 120;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('A1 · a person, no ADRs', () => {
  it('sets up with the recommended choices, records one decision, and shows the real hook catching it', async () => {
    repo();
    const { code, screen } = await guided(ENTER, 'Postgres, not MongoDB', ENTER, 'orders and stock change in one transaction', ENTER, 'MongoDB', ENTER);

    expect(code).toBe(0);
    expect(screen).toContain('Found in this repository');
    expect(screen).toContain('✔ Claude Code  (detected)');
    expect(screen).toContain('◇  How do you want to set it up?\n│  Recommended');
    expect(screen).toContain('DEC-1  Postgres, not MongoDB  · ruled out MongoDB');
    expect(screen).toContain('“should we switch to MongoDB?”');
    expect(screen).toContain('rejected this before: “MongoDB”');
    expect(screen).toContain('Bring in a teammate');
    expect(screen).toContain('git add .kadence/ AGENTS.md CLAUDE.md .claude/settings.json');

    const [d] = decisions();
    expect(d).toMatchObject({ title: 'Postgres, not MongoDB', why: 'orders and stock change in one transaction', rejected: 'MongoDB', source: 'human' });
  });

  it('writes nothing about a decision when the person leaves the first question empty', async () => {
    repo();
    const { code, screen } = await guided(ENTER, ENTER);
    expect(code).toBe(0);
    expect(decisions()).toEqual([]);
    expect(screen).not.toContain('Tomorrow, a teammate asks');
    expect(screen).toContain('kadence is set up');
  });
});

describe('the recommended setup', () => {
  it('always includes Claude Code, as plain init does, even where only other agents show', async () => {
    // Found re-taking the site's screenshot: .codex and .cursor but no .claude
    // made "Recommended" mean Cursor and Codex only, and wrote no Claude Code
    // hooks — while plain `kadence init` writes them by default (DEC-35).
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'lead@acme.dev'], { cwd: dir });
    mkdirSync(join(dir, '.codex'));
    mkdirSync(join(dir, '.cursor'));

    const { code, screen } = await guided(ENTER, ENTER);

    expect(code).toBe(0);
    expect(screen).toContain('✔ Cursor, Codex  (detected)');
    expect(screen).toContain('hooks for Claude Code, Cursor, Codex');
    expect(existsSync(join(dir, '.claude', 'settings.json'))).toBe(true);
    expect(existsSync(join(dir, '.codex', 'hooks.json'))).toBe(true);
    expect(existsSync(join(dir, '.cursor', 'hooks.json'))).toBe(true);
  });
});

describe('A2 · a person, a repository with ADRs', () => {
  it('offers every ADR, records each with its link, and shows the hook on one of them', async () => {
    repo(true);
    const { code, screen } = await guided(ENTER, ENTER);

    expect(code).toBe(0);
    expect(screen).toContain('✔ 3 in docs/adr/');
    expect(screen).toContain('✔ Claude Code, Cursor  (detected)');
    expect(screen).toContain('Bring these 3 ADRs in as decisions?');
    expect(screen).toContain('DEC-1  Postgres for orders  · ruled out MongoDB, MySQL');
    expect(screen).toContain('rejected this before');
    expect(decisions().map((d) => [d.title, d.docs])).toEqual([
      ['Postgres for orders', ['docs/adr/0001-postgres.md']],
      ['REST, not GraphQL', ['docs/adr/0002-rest.md']],
      ['Deploy on Fly.io', ['docs/adr/0003-fly.md']],
    ]);
    expect(decisions()[0]!.why).toBe('orders and stock change in one transaction');
  });

  it('records only the ADRs left checked', async () => {
    repo(true);
    await guided(ENTER, DOWN, SPACE, ENTER);
    expect(decisions().map((d) => d.title)).toEqual(['Postgres for orders', 'Deploy on Fly.io']);
  });
});

describe('A3 · a person who customizes', () => {
  it('writes hooks for exactly the agents chosen, and the columns and definition of done picked', async () => {
    repo(true);
    // Customize · agents: uncheck Cursor, check Codex · columns: todo → doing → done ·
    // definition of done: for code · then import no ADR.
    const { code, screen } = await guided(
      DOWN, ENTER,
      DOWN, SPACE, DOWN, SPACE, ENTER,
      DOWN, ENTER,
      DOWN, ENTER,
      SPACE, DOWN, SPACE, DOWN, SPACE, ENTER,
    );

    expect(code).toBe(0);
    expect(screen).toContain('◇  Which agents work in this repository?\n│  Claude Code, Codex');
    expect(existsSync(join(dir, '.codex', 'hooks.json'))).toBe(true);
    expect(existsSync(join(dir, '.cursor', 'hooks.json'))).toBe(false);
    const state = loadState(dir).state;
    expect(state.statuses).toEqual(['todo', 'doing', 'done']);
    expect(state.dod).toEqual(['tests green', 'typecheck clean']);
    expect(state.decisions).toEqual([]);
  });
});

describe('A4 · a person who says not now, or stops halfway', () => {
  it('writes nothing on Not now', async () => {
    repo();
    const { code, screen } = await guided(DOWN, DOWN, ENTER);
    expect(code).toBe(0);
    expect(screen).toContain('Not now — nothing was written.');
    expect(existsSync(join(dir, '.kadence'))).toBe(false);
  });

  it('keeps what is written on Ctrl-C and says so, with the cursor shown again', async () => {
    repo();
    const input = await guided(ENTER, 'Postgres, not Mon', CTRL_C);
    expect(input.code).toBe(130);
    expect(input.screen).toContain('■  What did your team already decide?');
    expect(input.screen).toContain('What is already written stays');
    expect(input.screen).toContain('Run kadence init again to pick up where you left off.');
    expect(existsSync(join(dir, '.kadence', 'events'))).toBe(true);
    expect(decisions()).toEqual([]);
  });

  it('says nothing was written when stopped at the first question', async () => {
    repo();
    const { code, screen } = await guided(CTRL_C);
    expect(code).toBe(130);
    expect(screen).toContain('Stopped — nothing was written.');
    expect(existsSync(join(dir, '.kadence'))).toBe(false);
  });
});

describe('A5 · init again, as a checkup', () => {
  it('says what is in place and offers the ADRs not in the journal yet', async () => {
    repo(true);
    runInit(dir, 'test');
    runDecisionAdd(dir, env, 'Postgres for orders', { why: 'transactions', docs: ['docs/adr/0001-postgres.md'] });

    const { code, screen } = await guided(ENTER);

    expect(code).toBe(0);
    expect(screen).toContain('This repository already keeps a journal.');
    expect(screen).toContain('2 of 3 not in the journal yet');
    expect(screen).toContain('only you have written to it');
    expect(screen).toContain('git commit -m "Record our ADRs as decisions"');
    expect(decisions().map((d) => d.title)).toEqual(['Postgres for orders', 'REST, not GraphQL', 'Deploy on Fly.io']);
  });

  it('has nothing to offer when everything is in place', async () => {
    repo();
    runInit(dir, 'test');
    const { code, screen } = await guided();
    expect(code).toBe(0);
    expect(screen).toContain('none found');
    expect(screen).not.toContain('kadence is set up');
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('kadence');
  });
});

describe('the width of the terminal', () => {
  it('keeps every line of the setup inside an 80-column terminal', async () => {
    // The outro's Undo line wrapped mid-word in a 107-column terminal
    // ("hook e / ntries") — seen in the hero recording, not in the suite.
    repo();
    columns = 80;
    const { code, screen } = await guided(ENTER, ENTER);
    expect(code).toBe(0);
    const lines = screen.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split('\n');
    for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(80);
    expect(screen).toContain('hook entries');
  });
});
