import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readAll } from '../src/core/store.js';
import { project, type ProjectState } from '../src/core/projection.js';
import { rejectedMatches } from '../src/core/search.js';

/**
 * "Rejected before" over this repository's own journal (KAD-61, KAD-78).
 *
 * KAD-61 measured the rule on ten prompts that propose an alternative a
 * decision turned down and ten ordinary code prompts, and kept the numbers in
 * a note rather than a test. This is that set, written down, so the rule can
 * change without anyone having to remember what it was held to: every
 * proposal names its decision, and no ordinary prompt raises the alarm.
 */

function liveState(): ProjectState {
  const root = mkdtempSync(join(tmpdir(), 'kadence-rejected-'));
  try {
    cpSync(resolve('.kadence', 'events'), join(root, '.kadence', 'events'), { recursive: true });
    return project(readAll(root).events);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const state = liveState();
const labelOf = (title: string): string =>
  state.decisions.find((d) => d.supersededBy === null && d.title.startsWith(title))!.label;

/** Prompts that propose what a decision turned down, and the decision. */
const PROPOSALS: Array<[string, string]> = [
  ['Use a schema validation library for the event format', 'The core is synchronous'],
  ['Can we switch the core to asynchronous file reads?', 'The core is synchronous'],
  ['Commit the state.json snapshot so a fresh clone skips the first fold', 'state.json is a cache'],
  ['Show velocity as the mean of the last three sprints', 'Velocity is reported as a range'],
  ['Make task delete erase the event file instead of writing a new event', 'Events are append-only'],
  ['Reject the later of two conflicting events when branches merge', 'Conflicts are surfaced'],
  ['Commit the journal automatically after every write', 'kadence never commits'],
  ['Give the board its own implementation of move and claim', 'Every board action calls'],
  ['Fetch the release artifact at build time for the site reference', 'The site takes the command reference'],
  // KAD-78: the two prompts the site's hero was captured with, in the words
  // people use rather than the words the decision was written in.
  ["Let's add embeddings to the search core so it understands synonyms", 'Search is lexical BM25'],
  ["Let's add embeddings to kadence search so it understands synonyms", 'Search is lexical BM25'],
  ['Can we switch the core to async file reads?', 'The core is synchronous'],
];

/** Ordinary work on this repository: none of these reopens anything. */
const ORDINARY = [
  'Fix the failing test in compaction.test.ts',
  'Add a --limit flag to note list',
  'Rename the variable in board.ts to something clearer',
  'Update the install section of the README',
  'Add colour to the doctor output',
  'Write a test for the prompt hook session file',
  'Bump the version in package.json',
  'The Windows CI job timed out, look at the log',
  'Move spanOf in search.ts into its own function',
  'Add a changelog entry for the onboarding',
];

describe('rejected before, on this repository’s journal', () => {
  it.each(PROPOSALS)('names the decision for: %s', (prompt, title) => {
    expect(rejectedMatches(state, prompt)[0]?.label).toBe(labelOf(title));
  });

  it.each(ORDINARY)('raises no alarm for: %s', (prompt) => {
    expect(rejectedMatches(state, prompt)).toEqual([]);
  });
});
