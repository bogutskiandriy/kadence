// One bundle, no dependencies, same shape as the tracker's build.
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outdir: 'dist',
  entryNames: 'cli',
  // The shebang is in the source; a banner would add a second one on line 2,
  // which is a syntax error rather than a comment.
  minify: true,
});

console.log('built packages/github/dist/cli.js');
