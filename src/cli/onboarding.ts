import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { runInit, agentsInUse, type HookAgent } from './commands/init.js';
import { runBoardConfig } from './commands/board.js';
import { runDecisionAdd } from './commands/decision.js';
import { runPromptHook } from './commands/hook.js';
import { resolveContext, isContext, loadState } from './commands/task.js';
import { readAll } from '../core/store.js';
import { findRepoRoot } from '../core/git.js';
import { findAdrs, type Adr } from './adr.js';
import { CODA_ART } from './coda.js';
import { ask, select, multiselect, text, paint, visible, CANCEL, SYM, type Io, type Paint } from './prompts.js';

/**
 * `kadence init` for a person at a terminal (KAD-89): Coda walks them through
 * it, and nothing is written until they say so.
 *
 * Recorded first as a prototype (docs/onboarding-prototype): what was found,
 * one question with a recommended setup, the decisions the team already has,
 * what a teammate's agent will see, a line for the teammate, and how to
 * commit and undo. Run on a repository that already keeps a journal, it is a
 * checkup that offers what is still open.
 *
 * Every write is the function the CLI calls — runInit, runBoardConfig,
 * runDecisionAdd — so the guided setup cannot mean something different from
 * the commands (DEC-41). Loaded only when a person is at a terminal: a command
 * an agent runs never pays for it.
 */

export interface GuideDeps {
  io: Io;
  cwd: string;
  env: NodeJS.ProcessEnv;
  version: string;
  color: boolean;
  /** Rhythm between lines a person reads; tests pass zero. */
  pause: (ms: number) => Promise<void>;
}

type Agent = 'claude' | HookAgent;

const AGENTS: ReadonlyArray<{ value: Agent; label: string; hook: string }> = [
  { value: 'claude', label: 'Claude Code', hook: 'prime at session start, search on every prompt' },
  { value: 'cursor', label: 'Cursor', hook: 'prime at session start' },
  { value: 'codex', label: 'Codex', hook: 'prime at session start, search on every prompt' },
  { value: 'copilot', label: 'Copilot', hook: 'prime at session start' },
];

const DEFAULT_COLUMNS = 'backlog → todo → in progress → in review → done';

class Stopped extends Error {}

export async function runGuidedInit(deps: GuideDeps): Promise<number> {
  const root = findRepoRoot(deps.cwd);
  if (root === null) {
    // Same answer as the plain command: the guided one adds nothing here.
    const r = runInit(deps.cwd, deps.version);
    deps.io.output.write(`${r.message}\n`);
    return 1;
  }
  const g = new Guide(deps, root);
  try {
    return existsSync(join(root, '.kadence', 'events')) ? await g.checkup() : await g.setup();
  } catch (e) {
    if (e instanceof Stopped) return 130;
    throw e;
  }
}

class Guide {
  private readonly p: Paint;
  private readonly written: string[] = [];
  private readonly repo: string;

  constructor(
    private readonly d: GuideDeps,
    private readonly root: string,
  ) {
    this.p = paint(d.color);
    this.repo = basename(root);
  }

  // ── drawing ─────────────────────────────────────────────────────────────
  private out(line = ''): void {
    this.d.io.output.write(`${line}\n`);
  }
  private rail(line = ''): void {
    this.out(line.length > 0 ? `${this.p.gray(SYM.bar)}  ${line}` : this.p.gray(SYM.bar));
  }
  /**
   * A labelled line on the rail, wrapped at a word to the terminal's width.
   * Left to the terminal, the outro's Undo line broke mid-word in the site's
   * 107-column take ("hook e / ntries"); the continuation lines up under the
   * text, not under the label.
   */
  private labelled(label: string, text: string, style: (s: string) => string): void {
    const width = Math.max(40, this.d.io.output.columns ?? 100);
    const indent = label.length + 3;
    const room = width - 3 - indent;
    const lines: string[] = [];
    let current = '';
    for (const word of text.split(' ')) {
      if (current.length > 0 && current.length + 1 + word.length > room) {
        lines.push(current);
        current = word;
      } else current = current.length === 0 ? word : `${current} ${word}`;
    }
    if (current.length > 0) lines.push(current);
    lines.forEach((l, i) => this.rail(`${i === 0 ? `${this.p.dim(label)}   ` : ' '.repeat(indent)}${style(l)}`));
  }
  private step(title: string): void {
    this.rail();
    this.out(`${this.p.green(SYM.done)}  ${this.p.bold(title)}`);
  }
  private done(label: string, detail: string, width = 25): void {
    this.out(`${this.p.green(SYM.done)}  ${label.padEnd(width)}${this.p.dim(detail)}`);
  }
  private info(line: string): void {
    this.rail();
    this.out(`${this.p.teal(SYM.info)}  ${line}`);
  }
  private note(title: string, body: string[]): void {
    const width = Math.max(visible(title).length + 2, ...body.map((l) => visible(l).length)) + 2;
    const pad = (l: string) => l + ' '.repeat(width - visible(l).length);
    this.rail();
    this.out(`${this.p.green(SYM.done)}  ${this.p.bold(title)} ${this.p.gray(`${'─'.repeat(Math.max(1, width - visible(title).length - 1))}╮`)}`);
    this.out(`${this.p.gray(SYM.bar)}  ${pad('')}${this.p.gray('│')}`);
    for (const l of body) this.out(`${this.p.gray(SYM.bar)}  ${pad(l)}${this.p.gray('│')}`);
    this.out(`${this.p.gray(SYM.bar)}  ${pad('')}${this.p.gray('│')}`);
    this.out(this.p.gray(`${SYM.branch}${'─'.repeat(width + 2)}╯`));
  }
  private header(subtitle: string): void {
    const beside = [
      `${this.p.bold('kadence')} ${this.p.dim(`v${this.d.version}`)}  ${this.p.badge('setup')}`,
      this.p.dim('Coda keeps what you decide, and why.'),
      this.p.dim(subtitle),
    ];
    this.out();
    for (const [i, row] of CODA_ART.entries()) this.out(`${this.p.petrol(row)}  ${beside[i]}`);
    this.out();
  }

  /** One prompt; Ctrl-C or Escape ends the setup, saying what stays. */
  private async ask<V>(prompt: Parameters<typeof ask<unknown, V>>[0]): Promise<V> {
    const value = await ask(prompt, this.d.io, this.p);
    if (value === CANCEL) this.stop();
    return value as V;
  }
  private stop(): never {
    if (this.written.length === 0) {
      this.out(`${this.p.gray(SYM.end)}  ${this.p.red('Stopped — nothing was written.')}`);
    } else {
      this.rail();
      this.rail(this.p.yellow('Stopped. What is already written stays — the journal never takes anything back:'));
      for (const w of this.written) this.rail(`${this.p.green(SYM.checked)} ${w}`);
      this.out(`${this.p.gray(SYM.end)}  ${this.p.red('Run kadence init again to pick up where you left off.')}`);
    }
    this.out();
    throw new Stopped();
  }

  // ── a repository without a journal ──────────────────────────────────────
  async setup(): Promise<number> {
    const p = this.p;
    const found = findAdrs(this.root);
    // What shows in the repository, said as found; and what is recommended,
    // which is that plus Claude Code always — plain `kadence init` writes its
    // hooks by default (DEC-35), and the guided one must not mean less.
    const detected: Agent[] = [
      ...(existsSync(join(this.root, '.claude')) || existsSync(join(this.root, 'CLAUDE.md')) ? ['claude' as const] : []),
      ...agentsInUse(this.root),
    ];
    const recommended: Agent[] = ['claude', ...detected.filter((a) => a !== 'claude')];
    const names = (agents: readonly Agent[]) => AGENTS.filter((a) => agents.includes(a.value)).map((a) => a.label).join(', ');

    this.header('Nothing is written until you say so.');
    this.out(`${p.gray(SYM.start)}  ${p.bold(`Setting up ${this.repo}`)}`);
    this.step('Found in this repository');
    for (const [k, v] of [
      ['Repository', `${p.green(SYM.ok)} git`],
      ['Agents', detected.length > 0 ? `${p.green(SYM.ok)} ${names(detected)}  ${p.dim('(detected)')}` : p.dim('· none found — Claude Code is the default')],
      ['ADRs', found.dir !== null ? `${p.green(SYM.ok)} ${found.adrs.length} in ${found.dir}/` : p.dim('· none found')],
      ['Journal', p.dim('· not set up yet')],
    ] as const) {
      await this.d.pause(100);
      this.rail(`${p.dim(k.padEnd(13))}${v}`);
    }

    const how = await this.ask(
      select('How do you want to set it up?', [
        { value: 'recommended', label: 'Recommended', hint: `hooks for ${names(recommended)} · default columns · no definition of done` },
        { value: 'customize', label: 'Customize', hint: 'agents, columns, definition of done' },
        { value: 'not-now', label: 'Not now', hint: 'nothing is written' },
      ]),
    );
    if (how === 'not-now') {
      this.out(`${p.gray(SYM.end)}  ${p.dim('Not now — nothing was written.')}`);
      this.out();
      return 0;
    }

    let agents: Agent[] = recommended;
    let columns: string | null = null;
    let dod: string | null = null;
    if (how === 'customize') {
      agents = await this.ask(
        multiselect(
          'Which agents work in this repository?',
          AGENTS.map((a) => ({ value: a.value, label: a.label, hint: a.hook + (detected.includes(a.value) ? '  (detected)' : '') })),
          recommended,
        ),
      );
      columns = await this.ask(
        select<string | null>('Board columns', [
          { value: null, label: DEFAULT_COLUMNS, hint: 'default' },
          { value: 'todo,doing,done', label: 'todo → doing → done', hint: 'small team, no review step' },
          { value: 'todo,doing,review,done', label: 'todo → doing → review → done' },
        ]),
      );
      dod = await this.ask(
        select<string | null>('Definition of done — copied into every new task', [
          { value: null, label: 'None yet', hint: 'add one later: kadence board config --dod' },
          { value: 'tests green,typecheck clean', label: 'For code', hint: 'tests green · typecheck clean' },
          { value: 'written down,reviewed by someone', label: 'For any work', hint: 'written down · reviewed by someone' },
        ]),
      );
    }

    // Writing. Each thing written stays on the rail as a finished line.
    const others = agents.filter((a): a is HookAgent => a !== 'claude');
    const init = runInit(this.d.cwd, this.d.version, { hooks: agents.includes('claude'), hooksFor: others, exactly: true });
    if (!init.ok) {
      this.out(`${p.gray(SYM.end)}  ${p.red(init.message)}`);
      return 1;
    }
    this.rail();
    this.done('.kadence/', 'the journal: plain files, versioned with your code');
    this.written.push('.kadence/ and the agent sections');
    await this.d.pause(120);
    this.done('AGENTS.md · CLAUDE.md', 'a short section on how agents read it');
    for (const a of AGENTS.filter((x) => agents.includes(x.value))) {
      await this.d.pause(120);
      this.done(`${a.label} hooks`, a.hook);
    }
    if (columns !== null) {
      runBoardConfig(this.d.cwd, this.d.env, columns, undefined, 'doing');
      this.done('columns', columns.split(',').join(' → '));
    }
    if (dod !== null) {
      runBoardConfig(this.d.cwd, this.d.env, undefined, dod);
      this.done('definition of done', dod.split(',').join(' · '));
    }

    const made = found.adrs.length > 0 ? await this.importAdrs(found.adrs) : await this.oneByHand();
    await this.aha(made);
    this.teammate();
    this.finish(init.written, 'Add kadence');
    return 0;
  }

  // ── a repository that already keeps a journal ───────────────────────────
  async checkup(): Promise<number> {
    const p = this.p;
    const ctx = resolveContext(this.d.cwd, this.d.env);
    if (!isContext(ctx)) {
      this.out(ctx.message);
      return 1;
    }
    const { state } = loadState(ctx.root, ctx.actor);
    const authors = new Set(readAll(ctx.root).events.map((e) => e.actor));
    const linked = new Set(state.decisions.flatMap((d) => d.docs));
    const found = findAdrs(this.root);
    const pending = found.adrs.filter((a) => !linked.has(a.path));
    const agents = [
      ...(existsSync(join(this.root, '.claude', 'settings.json')) ? ['Claude Code'] : []),
      ...AGENTS.filter((a) => a.value !== 'claude' && agentsInUse(this.root).includes(a.value as HookAgent)).map((a) => a.label),
    ];

    this.header('This repository already keeps a journal.');
    this.out(`${p.gray(SYM.start)}  ${p.bold(`Checking ${this.repo}`)}`);
    this.step('What is in place');
    const decisions = state.decisions.filter((d) => d.supersededBy === null).length;
    for (const [k, v] of [
      ['Journal', `${p.green(SYM.ok)} ${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'}, ${decisions} decision${decisions === 1 ? '' : 's'}`],
      ['Agents', agents.length > 0 ? `${p.green(SYM.ok)} ${agents.join(', ')} read it at session start` : `${p.yellow('·')} no hooks — kadence init --hooks-for adds them`],
      [
        'ADRs',
        found.dir === null
          ? p.dim('· none found')
          : pending.length > 0
            ? `${p.yellow('·')} ${pending.length} of ${found.adrs.length} not in the journal yet`
            : `${p.green(SYM.ok)} all ${found.adrs.length} in the journal`,
      ],
      ['Second author', authors.size > 1 ? `${p.green(SYM.ok)} ${authors.size} people write to it` : `${p.yellow('·')} not yet — only you have written to it`],
    ] as const) {
      await this.d.pause(100);
      this.rail(`${p.dim(k.padEnd(16))}${v}`);
    }

    if (pending.length > 0) await this.importAdrs(pending);
    if (authors.size < 2) this.teammate();
    if (this.written.length > 0) this.finish(['.kadence/'], 'Record our ADRs as decisions');
    else {
      this.rail();
      this.out(`${p.gray(SYM.end)}  ${p.petrol('Coda keeps what you decide, and why.')}`);
      this.out();
    }
    return 0;
  }

  // ── the first things the journal knows ──────────────────────────────────
  private record(title: string, why: string, rejected: string[], docs: string[]): string | null {
    const r = runDecisionAdd(this.d.cwd, this.d.env, title, {
      why: why.length > 0 ? why : 'Recorded during setup; the reason is not written down yet.',
      ...(rejected.length > 0 ? { rejected: rejected.join('; ') } : {}),
      ...(docs.length > 0 ? { docs } : {}),
    });
    const label = (r.data?.['decision'] as { label?: string } | undefined)?.label;
    return r.ok && label !== undefined ? label : null;
  }

  private async importAdrs(adrs: readonly Adr[]): Promise<Array<{ label: string; title: string; rejected: string[] }>> {
    const p = this.p;
    const picked = await this.ask(
      multiselect(
        `Bring ${adrs.length === 1 ? 'this ADR' : `these ${adrs.length} ADRs`} in as decisions?`,
        adrs.map((a) => ({
          value: a.path,
          label: a.title,
          short: a.title,
          hint: a.rejected.length > 0 ? `ruled out ${a.rejected.join(', ')}` : a.path,
        })),
        adrs.map((a) => a.path),
      ),
    );
    const made: Array<{ label: string; title: string; rejected: string[] }> = [];
    let first = true;
    for (const a of adrs.filter((x) => picked.includes(x.path))) {
      const label = this.record(a.title, a.why || `See ${a.path}`, a.rejected, [a.path]);
      if (label === null) continue;
      if (first) this.rail();
      first = false;
      await this.d.pause(150);
      this.out(`${p.green(SYM.done)}  ${p.bold(label)}  ${a.title}${a.rejected.length > 0 ? p.dim(`  · ruled out ${a.rejected.join(', ')}`) : ''}`);
      this.written.push(`${label} ${a.title}`);
      made.push({ label, title: a.title, rejected: a.rejected });
    }
    return made;
  }

  private async oneByHand(): Promise<Array<{ label: string; title: string; rejected: string[] }>> {
    const p = this.p;
    this.info('Your agent starts with an empty journal. Give it one thing to know.');
    const title = await this.ask(text('What did your team already decide?', 'e.g. Postgres, not MongoDB'));
    if (title.length === 0) return [];
    const why = await this.ask(text('Why?', 'e.g. orders and stock change in one transaction'));
    const ruled = await this.ask(text('What did you rule out?', 'e.g. MongoDB', true));
    const label = this.record(title, why, ruled.length > 0 ? [ruled] : [], []);
    if (label === null) return [];
    this.rail();
    this.out(`${p.green(SYM.done)}  ${p.bold(label)}  ${title}${ruled.length > 0 ? p.dim(`  · ruled out ${ruled}`) : ''}`);
    this.written.push(`${label} ${title}`);
    return [{ label, title, rejected: ruled.length > 0 ? [ruled] : [] }];
  }

  /**
   * What a teammate's agent sees when someone proposes what was ruled out —
   * the real prompt hook, run on the journal just written. If it has nothing
   * to say, nothing is shown: a demonstration that is not the product would
   * teach the wrong thing.
   */
  private async aha(made: ReadonlyArray<{ label: string; rejected: string[] }>): Promise<void> {
    const d = made.find((m) => m.rejected.length > 0);
    if (d === undefined) return;
    const alternative = d.rejected[0]!.split(/:\s|\s[—–-]\s/)[0]!.trim();
    const question = `should we switch to ${alternative}?`;
    const said = runPromptHook(this.d.cwd, this.d.env, JSON.stringify({ prompt: question }));
    if (said.length === 0) return;
    await this.d.pause(300);
    const shown = said
      .split('\n')
      .slice(0, 3)
      .map((l) => this.p.teal(l.replace(/^kadence: /, '').trim()));
    this.note('Tomorrow, a teammate asks their agent', [this.p.dim(`“${question}”`), '', ...shown]);
  }

  private teammate(): void {
    this.note('Bring in a teammate — send them this', [
      `I set up kadence in ${this.repo}. Pull, then:`,
      `  ${this.p.teal('npm i -g kadence')}`,
      'Your agent reads what we decided on its own.',
    ]);
  }

  private finish(files: readonly string[], message: string): void {
    const p = this.p;
    this.rail();
    this.out(`${p.green(SYM.active)}  ${p.bold('kadence is set up')}`);
    this.rail();
    this.rail(p.dim('Commit when you are ready — kadence never commits for you'));
    this.rail(`  ${p.teal(`git add ${files.join(' ')}`)}`);
    this.rail(`  ${p.teal(`git commit -m "${message}"`)}`);
    this.rail();
    this.rail(`${p.dim('Next')}   ${p.teal('kadence prime')}  ${p.dim('what an agent sees at session start')}`);
    this.labelled('Undo', 'delete .kadence/, the kadence:begin…end section in AGENTS.md and CLAUDE.md, and the hook entries', p.dim);
    this.rail();
    this.out(`${p.gray(SYM.end)}  ${p.petrol('Coda keeps what you decide, and why.')}`);
    this.out();
  }
}

