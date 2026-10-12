import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { select, multiselect, text, ask, paint, visible, CANCEL, type Io } from '../src/cli/prompts.js';

/**
 * The guided init's prompts (KAD-89).
 *
 * Four TUI bugs once shipped past a green suite because they lived at the
 * boundary with the terminal. So the part that does not need a terminal —
 * what each state shows, what each key does — is tested as pure functions,
 * and the part that does is driven through a fake TTY with the real escape
 * sequences a terminal sends.
 */

const p = paint(false);
const lines = (xs: string[]) => xs.map(visible);

describe('select', () => {
  const s = select('How do you want to set it up?', [
    { value: 'rec', label: 'Recommended', hint: 'the usual' },
    { value: 'custom', label: 'Customize' },
    { value: 'no', label: 'Not now' },
  ]);

  it('fills the dot of the option under the cursor and only that one', () => {
    expect(lines(s.render(1, 'active', p))).toEqual([
      '│',
      '◆  How do you want to set it up?',
      '│  ○ Recommended',
      '│  ● Customize',
      '│  ○ Not now',
      '└  ↑/↓ to move · enter to choose',
    ]);
  });

  it('collapses to the question and the answer once chosen', () => {
    expect(lines(s.render(0, 'submit', p))).toEqual(['│', '◇  How do you want to set it up?', '│  Recommended']);
  });

  it('marks a cancelled question with ■', () => {
    expect(visible(s.render(0, 'cancel', p)[1]!)).toBe('■  How do you want to set it up?');
  });

  it('moves with arrows and j/k, wraps at both ends, and submits the value', () => {
    expect(s.key(0, { name: 'down' })).toBe(1);
    expect(s.key(0, { name: 'up' })).toBe(2);
    expect(s.key(2, { str: 'j' })).toBe(0);
    expect(s.key(1, { name: 'return' })).toEqual({ submit: 'custom' });
  });
});

describe('multiselect', () => {
  const m = multiselect(
    'Which agents?',
    [
      { value: 'claude', label: 'Claude Code' },
      { value: 'cursor', label: 'Cursor' },
      { value: 'codex', label: 'Codex' },
    ],
    ['claude'],
  );

  it('starts with the given values chosen, ◼ for chosen and ◻ for not', () => {
    expect(lines(m.render(m.initial, 'active', p)).slice(2, 5)).toEqual(['│  ◼ Claude Code', '│  ◻ Cursor', '│  ◻ Codex']);
  });

  it('toggles with space and submits the chosen values in their order', () => {
    let s = m.key(m.initial, { name: 'down' }) as typeof m.initial;
    s = m.key(s, { name: 'down' }) as typeof m.initial;
    s = m.key(s, { name: 'space' }) as typeof m.initial;
    expect(m.key(s, { name: 'return' })).toEqual({ submit: ['claude', 'codex'] });
    s = m.key(s, { name: 'space' }) as typeof m.initial;
    expect(m.key(s, { name: 'return' })).toEqual({ submit: ['claude'] });
  });

  it('collapses to a count when more than three are chosen', () => {
    const many = multiselect('Bring these in?', [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `ADR ${n}` })), [1, 2, 3, 4, 5]);
    expect(visible(many.render(many.initial, 'submit', p)[2]!)).toBe('│  5 of 5');
  });
});

describe('text', () => {
  const t = text('What did your team already decide?', 'e.g. Postgres, not MongoDB');

  it('shows the placeholder dim until something is typed', () => {
    expect(visible(t.render('', 'active', p)[2]!)).toBe('│  e.g. Postgres, not MongoDB');
  });

  it('types, deletes, and submits trimmed', () => {
    let v = t.key('', { str: 'P' }) as string;
    v = t.key(v, { str: 'g' }) as string;
    v = t.key(v, { name: 'backspace' }) as string;
    expect(v).toBe('P');
    expect(t.key(' Postgres ', { name: 'return' })).toEqual({ submit: 'Postgres' });
  });

  it('ignores control keys rather than typing them', () => {
    expect(t.key('a', { name: 'left', str: '\x1b[D' })).toBe('a');
  });
});

/** A terminal that is not one: keys in, frames out, raw mode recorded. */
function fakeTty(columns = 100) {
  const input = Object.assign(new PassThrough(), { isTTY: true, raw: false, setRawMode(on: boolean) { this.raw = on; } });
  const chunks: string[] = [];
  const output = Object.assign(new PassThrough(), { columns });
  output.on('data', (d) => chunks.push(String(d)));
  const io: Io = { input, output };
  return { io, input, written: () => chunks.join('') };
}
const press = (input: PassThrough, ...keys: string[]) => {
  for (const k of keys) input.write(k);
};
const DOWN = '\x1b[B';
const ENTER = '\r';
const SPACE = ' ';
const CTRL_C = '\x03';

describe('ask, through a fake terminal', () => {
  it('reads real key sequences and resolves with the choice', async () => {
    const t = fakeTty();
    const answer = ask(select('Pick', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]), t.io, p);
    press(t.input, DOWN, ENTER);
    expect(await answer).toBe('b');
  });

  it('toggles with space in a multiselect', async () => {
    const t = fakeTty();
    const answer = ask(multiselect('Pick', [{ value: 1, label: 'one' }, { value: 2, label: 'two' }], [1]), t.io, p);
    press(t.input, DOWN, SPACE, ENTER);
    expect(await answer).toEqual([1, 2]);
  });

  it('resolves CANCEL on Ctrl-C, leaves raw mode and shows the cursor again', async () => {
    const t = fakeTty();
    const answer = ask(text('Name?'), t.io, p);
    press(t.input, 'ab', CTRL_C);
    expect(await answer).toBe(CANCEL);
    expect(t.input.raw).toBe(false);
    expect(t.written().endsWith('\x1b[?25h')).toBe(true);
    expect(t.written()).toContain('■  Name?');
  });

  it('cuts a line wider than the terminal, so the redraw climbs the right number of lines', async () => {
    const t = fakeTty(30);
    const answer = ask(select('Pick', [{ value: 'a', label: 'A', hint: 'a hint far too long for thirty columns' }]), t.io, p);
    press(t.input, ENTER);
    await answer;
    const frames = t.written().split(/\x1b\[\d+A\x1b\[G\x1b\[J/);
    for (const line of frames[0]!.split('\n')) expect(visible(line).replace(/\x1b\[\?25[lh]/g, '').length).toBeLessThanOrEqual(29);
  });
});
