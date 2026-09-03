import { execFileSync } from 'node:child_process';

/**
 * Builds the CLI before the suite runs.
 *
 * The JSON-contract tests spawn `dist/cli.js` as a real process — the only way
 * to prove that stdout carries JSON and nothing else. Without this the suite
 * passes or fails depending on whether a previous build happened to leave a
 * dist/ behind, which is how a green local run turned red in CI.
 */
export function setup(): void {
  execFileSync('node', ['scripts/build.mjs'], { stdio: 'inherit' });
}
