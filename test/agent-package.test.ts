import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The agent skill package (KAD-12, T65).
 *
 * One SKILL.md is the source; a Claude Code plugin and a Cursor rule are
 * generated from it by one script, so the three cannot drift apart. It is
 * loaded into an agent's context, so it is held to a size, and every command
 * it names has to be one the CLI has — a skill that teaches a command nobody
 * shipped is worse than none, because the agent trusts it.
 */

const ROOT = resolve('.');
const SKILL = join(ROOT, 'agents/kadence/SKILL.md');
const SCRIPT = join(ROOT, 'scripts/agent-package.mjs');
const PLUGIN = join(ROOT, 'agents/kadence/claude-plugin/.claude-plugin/plugin.json');
const PLUGIN_SKILL = join(ROOT, 'agents/kadence/claude-plugin/skills/kadence/SKILL.md');
const CURSOR = join(ROOT, 'agents/kadence/cursor/kadence.mdc');

let schemaCommands: string[] = [];
beforeAll(() => {
  const r = spawnSync('node', [join(ROOT, 'dist/cli.js'), 'schema', '--json'], { encoding: 'utf8' });
  schemaCommands = (JSON.parse(r.stdout).contract.commands as { name: string }[]).map((c) => c.name);
});

function frontmatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (m === null) return {};
  return Object.fromEntries(
    m[1]!.split('\n').map((l) => {
      const i = l.indexOf(':');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  );
}

describe('SKILL.md', () => {
  const text = () => readFileSync(SKILL, 'utf8');

  it('is at most 60 lines — it is loaded into the agent context', () => {
    expect(text().trimEnd().split('\n').length).toBeLessThanOrEqual(60);
  });

  it('names itself and says when to use it, in the frontmatter skills are matched by', () => {
    const fm = frontmatter(text());
    expect(fm['name']).toBe('kadence');
    expect(fm['description']?.length ?? 0).toBeGreaterThan(40);
  });

  it('teaches only commands the CLI has', () => {
    // As code — an indented line or inside backticks — not the word in prose.
    const named = [...text().matchAll(/(?:^ {4}|`)kadence ([a-z]+)(?: ([a-z]+))?/gm)].map((m) => [m[1]!, m[2]]);
    expect(named.length).toBeGreaterThan(10);
    const known = new Set(schemaCommands);
    const top = new Set(schemaCommands.map((c) => c.split(' ')[0]!));
    const unknown = named.filter(([cmd, sub]) => !(sub !== undefined && known.has(`${cmd} ${sub}`)) && !top.has(cmd!));
    expect(unknown).toEqual([]);
  });

  it('starts with prime and searches before grep, the two habits that were measured', () => {
    expect(text()).toMatch(/kadence prime/);
    const rule = text().split(/\n\s*\n/).find((p) => p.includes('kadence search') && /\bgrep\b/.test(p));
    expect(rule).toBeDefined();
  });
});

describe('the generated packages', () => {
  it('are what the script produces from SKILL.md now', () => {
    const r = spawnSync('node', [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('carry a Claude Code plugin manifest at the version being released', () => {
    const manifest = JSON.parse(readFileSync(PLUGIN, 'utf8'));
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(manifest.name).toBe('kadence');
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.license).toBe(pkg.license);
    expect(readFileSync(PLUGIN_SKILL, 'utf8')).toBe(readFileSync(SKILL, 'utf8'));
  });

  it('carry a Cursor rule with its own frontmatter and the same body', () => {
    const rule = readFileSync(CURSOR, 'utf8');
    const fm = frontmatter(rule);
    expect(fm['description']?.length ?? 0).toBeGreaterThan(40);
    expect(fm['alwaysApply']).toBe('false');
    const body = (t: string) => t.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
    expect(body(rule)).toBe(body(readFileSync(SKILL, 'utf8')));
  });

  it('--check fails, and says which file, when a generated file is edited by hand', () => {
    const copy = mkdtempSync(join(tmpdir(), 'kadence-agent-pkg-'));
    try {
      cpSync(join(ROOT, 'agents'), join(copy, 'agents'), { recursive: true });
      cpSync(join(ROOT, 'package.json'), join(copy, 'package.json'));
      writeFileSync(join(copy, 'agents/kadence/cursor/kadence.mdc'), 'edited by hand\n');
      const r = spawnSync('node', [SCRIPT, '--check', '--root', copy], { encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stdout + r.stderr).toMatch(/kadence\.mdc/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it('is not shipped in the npm package — it is installed through the agents, not npm', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect((pkg.files as string[]).some((f) => f.startsWith('agents'))).toBe(false);
    expect(existsSync(SKILL)).toBe(true);
  });
});
