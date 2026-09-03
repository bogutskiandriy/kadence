// Один бандл: кожен import у node_modules — це окремий resolve під час старту,
// а вони й формують ті мілісекунди, за які ми боремося (ADR-001).
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// esbuild does not clean its output directory, so chunk hashes from previous
// builds accumulate and ship inside the package as dead weight.
rmSync('dist', { recursive: true, force: true });

const { version } = JSON.parse(await readFile('package.json', 'utf8'));

await build({
  // One source of truth for the version: hardcoding it in the CLI meant
  // `--version` reported 0.1.0-dev from a package published as 0.1.0.
  define: { __VERSION__: JSON.stringify(version) },
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outdir: 'dist',
  entryNames: 'cli',
  // Code splitting keeps the interactive board in its own chunk: a dynamic
  // import only pays for blessed when someone actually opens the board.
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  // blessed stays external — bundling a library that reads terminfo at runtime
  // gains nothing and breaks its own file lookups.
  external: ['blessed'],
  banner: { js: '#!/usr/bin/env node' },
  minify: true,
});

const { statSync } = await import('node:fs');
console.log(`built dist/cli.js (${(statSync('dist/cli.js').size / 1024).toFixed(0)} KB)`);
