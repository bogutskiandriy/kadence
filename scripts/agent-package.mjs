#!/usr/bin/env node
/**
 * The agent skill package, generated from one file (KAD-12, T65).
 *
 * agents/kadence/SKILL.md is the source. From it this writes
 *
 *   agents/kadence/claude-plugin/.claude-plugin/plugin.json   the plugin manifest
 *   agents/kadence/claude-plugin/skills/kadence/SKILL.md      the skill, verbatim
 *   agents/kadence/cursor/kadence.mdc                          a Cursor project rule
 *
 * so that the three never say different things. The version is package.json's:
 * a plugin that claims another version than the CLI it teaches is a lie about
 * which commands exist.
 *
 * Usage:
 *   node scripts/agent-package.mjs            write the generated files
 *   node scripts/agent-package.mjs --check    exit 1, naming the file, if any is stale
 *   node scripts/agent-package.mjs --root <dir>
 *
 * Plain Node, no dependencies, no network: it runs where the CLI runs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const check = args.includes('--check');
const rootAt = args.indexOf('--root');
const root =
  rootAt === -1 ? resolve(dirname(fileURLToPath(import.meta.url)), '..') : resolve(args[rootAt + 1] ?? '.');

const skillPath = join(root, 'agents/kadence/SKILL.md');
const skill = readFileSync(skillPath, 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const match = /^---\n([\s\S]*?)\n---\n/.exec(skill);
if (match === null) {
  process.stderr.write(`${relative(root, skillPath)} has no frontmatter.\n`);
  process.exit(2);
}
const front = Object.fromEntries(
  match[1].split('\n').map((line) => {
    const at = line.indexOf(':');
    return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  }),
);
const body = skill.slice(match[0].length);

const plugin = {
  name: 'kadence',
  version: pkg.version,
  description: front.description,
  author: { name: 'kadence' },
  homepage: pkg.homepage,
  repository: typeof pkg.repository === 'object' ? pkg.repository.url.replace(/^git\+/, '') : pkg.repository,
  license: pkg.license,
  keywords: ['tasks', 'decisions', 'journal', 'git', 'agents'],
};

// Cursor reads `description` to decide when to attach an agent-requested rule;
// alwaysApply stays false so the rule costs nothing in a session that never
// touches the journal.
const cursor = `---\ndescription: ${front.description}\nglobs:\nalwaysApply: false\n---\n${body}`;

const outputs = [
  ['agents/kadence/claude-plugin/.claude-plugin/plugin.json', `${JSON.stringify(plugin, null, 2)}\n`],
  ['agents/kadence/claude-plugin/skills/kadence/SKILL.md', skill],
  ['agents/kadence/cursor/kadence.mdc', cursor],
];

const stale = [];
for (const [path, text] of outputs) {
  const file = join(root, path);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === text) continue;
  if (check) {
    stale.push(path);
    continue;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  process.stdout.write(`wrote ${path}\n`);
}

if (check && stale.length > 0) {
  process.stdout.write(
    `Out of date with agents/kadence/SKILL.md:\n${stale.map((p) => `  ${p}`).join('\n')}\n` +
      'Run: node scripts/agent-package.mjs\n',
  );
  process.exit(1);
}
