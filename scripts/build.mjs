// Один бандл: кожен import у node_modules — це окремий resolve під час старту,
// а вони й формують ті мілісекунди, за які ми боремося (ADR-001).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/cli.js',
  banner: { js: '#!/usr/bin/env node' },
  minify: true,
});
console.log('built dist/cli.js');
