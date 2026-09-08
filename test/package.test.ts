import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * A declared dependency that the build inlines is paid for by every user and
 * loaded by none of them. `cac` sat in `dependencies` through 0.2.1 while
 * esbuild bundled it — 52 KB downloaded on every install for nothing. This is
 * the same shape as the 0.1.4 bug, where the package depended on itself.
 *
 * So: what we declare and what we actually import must be the same set.
 */

const DIST = resolve('dist');

/** Every bare module specifier the built output asks Node for. */
function externalImports(): Set<string> {
  const files = [
    join(DIST, 'cli.js'),
    ...readdirSync(join(DIST, 'chunks')).map((f) => join(DIST, 'chunks', f)),
  ];

  const found = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/(?:from\s*|require\()\s*["']([^"']+)["']/g)) {
      const spec = m[1]!;
      // Relative paths are our own chunks; node: builtins cost nothing.
      if (spec.startsWith('.') || spec.startsWith('node:')) continue;
      found.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);
    }
  }
  return found;
}

describe('the published package', () => {
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const declared = Object.keys(pkg.dependencies ?? {});

  it('declares every module the build leaves external', () => {
    for (const spec of externalImports()) {
      expect(declared, `dist imports "${spec}" but it is not a dependency`).toContain(spec);
    }
  });

  it('declares nothing the build does not import', () => {
    const imported = externalImports();
    for (const dep of declared) {
      expect(
        imported.has(dep),
        `"${dep}" is a dependency nothing imports — every install downloads it for nothing`,
      ).toBe(true);
    }
  });
});
