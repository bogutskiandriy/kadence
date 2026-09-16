import { describe, it, expect } from 'vitest';
import { boardHeader } from '../src/tui/board.js';

/**
 * T113. The board's header is the one line a person reads before any column.
 *
 * It used to lead with "no active sprint" and "0 points" — two facts about
 * features a team may never use. The header is a pure function so it can be
 * tested; the rest of the TUI is still verified by hand (CLAUDE.md).
 */

const base = { sprint: null, open: 12, ready: 4, decisions: 3, points: null, filterNote: '' };

describe('boardHeader', () => {
  it('without a sprint reads open, ready and decisions in force, and nothing else', () => {
    expect(boardHeader(base)).toBe('kadence  12 open · 4 ready · 3 decisions in force');
  });

  it('never says "no active sprint"', () => {
    expect(boardHeader(base)).not.toMatch(/sprint/i);
  });

  it('shows points only when some task carries an estimate', () => {
    expect(boardHeader(base)).not.toMatch(/points/);
    expect(boardHeader({ ...base, points: 21 })).toBe(
      'kadence  12 open · 4 ready · 3 decisions in force · 21 points',
    );
  });

  it('names the active sprint when there is one', () => {
    expect(boardHeader({ ...base, sprint: 'Sprint 7' })).toBe(
      'kadence  Sprint 7  12 open · 4 ready · 3 decisions in force',
    );
  });

  it('says "decision" for exactly one', () => {
    expect(boardHeader({ ...base, decisions: 1 })).toContain('1 decision in force');
  });

  it('keeps the active filters at the end', () => {
    expect(boardHeader({ ...base, filterNote: '  filter: "auth"' })).toBe(
      'kadence  12 open · 4 ready · 3 decisions in force  filter: "auth"',
    );
  });
});
