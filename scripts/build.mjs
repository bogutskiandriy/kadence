// Один бандл: кожен import у node_modules — це окремий resolve під час старту,
// а вони й формують ті мілісекунди, за які ми боремося (ADR-001).
import { build } from 'esbuild';

await build({
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
