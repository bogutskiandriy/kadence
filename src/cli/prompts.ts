import { emitKeypressEvents } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

/**
 * Prompts for the guided `kadence init`, in the shape clack made familiar:
 * one gray rail from the first step to the last, the live step in Coda's
 * petrol, a finished step collapsed to one line, ○ ● for one choice and ◻ ◼
 * for several.
 *
 * Hand-rolled because the core takes no dependencies (DEC-39), and loaded only
 * by onboarding, never by a command an agent runs. What a prompt shows and
 * what a key does are pure functions — the same split as `src/tui/keys.ts`,
 * for the same reason: code at the boundary with the terminal is where bugs
 * ship past a green suite, so the part that can be tested without one is.
 */

export const SYM = {
  start: '┌', bar: '│', end: '└', active: '◆', done: '◇', cancel: '■', info: '●',
  on: '●', off: '○', checked: '◼', unchecked: '◻', ok: '✔', branch: '├',
} as const;

export interface Paint {
  petrol: (s: string) => string;
  teal: (s: string) => string;
  green: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  gray: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
  inverse: (s: string) => string;
  strike: (s: string) => string;
  badge: (s: string) => string;
}

export function paint(color: boolean): Paint {
  const wrap = (open: string) => (s: string) => (color ? `\x1b[${open}m${s}\x1b[0m` : s);
  return {
    petrol: wrap('38;5;30'),
    teal: wrap('38;5;37'),
    green: wrap('32'),
    red: wrap('31'),
    yellow: wrap('33'),
    gray: wrap('90'),
    dim: wrap('2'),
    bold: wrap('1'),
    inverse: (s) => (color ? `\x1b[7m${s}\x1b[0m` : s),
    strike: wrap('9'),
    badge: (s) => (color ? `\x1b[48;5;30m\x1b[38;5;231m\x1b[1m ${s} \x1b[0m` : `[${s}]`),
  };
}

/** Visible width: what the terminal shows, escape codes left out. */
export const visible = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

export type Phase = 'active' | 'submit' | 'cancel';

export interface Key {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  /** The character typed, when it is one. */
  str?: string;
}

export const CANCEL = Symbol('cancel');

/** A prompt: a state, how to draw it in each phase, what each key does. */
export interface Prompt<S, V> {
  initial: S;
  render(state: S, phase: Phase, p: Paint): string[];
  key(state: S, key: Key): S | { submit: V };
}

const header = (phase: Phase, message: string, p: Paint): string[] => [
  p.gray(SYM.bar),
  `${phase === 'active' ? p.petrol(SYM.active) : phase === 'cancel' ? p.red(SYM.cancel) : p.green(SYM.done)}  ${p.bold(message)}`,
];
const rail = (phase: Phase, p: Paint) => (phase === 'active' ? p.petrol(SYM.bar) : p.gray(SYM.bar));
const hint = (text: string, p: Paint) => `${p.petrol(SYM.end)}  ${p.dim(text)}`;
const up = (key: Key) => key.name === 'up' || key.str === 'k';
const down = (key: Key) => key.name === 'down' || key.str === 'j';

export interface Option<V> {
  value: V;
  label: string;
  hint?: string;
}

export function select<V>(message: string, options: readonly Option<V>[], initial = 0): Prompt<number, V> {
  return {
    initial,
    render(i, phase, p) {
      const head = header(phase, message, p);
      const label = options[i]!.label;
      if (phase === 'submit') return [...head, `${p.gray(SYM.bar)}  ${p.dim(label)}`];
      if (phase === 'cancel') return [...head, `${p.gray(SYM.bar)}  ${p.strike(p.dim(label))}`];
      return [
        ...head,
        ...options.map((o, n) =>
          n === i
            ? `${rail(phase, p)}  ${p.green(SYM.on)} ${o.label}${o.hint ? `  ${p.dim(o.hint)}` : ''}`
            : `${rail(phase, p)}  ${p.dim(SYM.off)} ${p.dim(o.label)}`,
        ),
        hint('↑/↓ to move · enter to choose', p),
      ];
    },
    key(i, key) {
      if (up(key)) return (i - 1 + options.length) % options.length;
      if (down(key)) return (i + 1) % options.length;
      if (key.name === 'return') return { submit: options[i]!.value };
      return i;
    },
  };
}

export interface MultiState {
  cursor: number;
  chosen: ReadonlySet<number>;
}

export function multiselect<V>(
  message: string,
  options: readonly (Option<V> & { short?: string })[],
  initial: readonly V[] = [],
): Prompt<MultiState, V[]> {
  const picked = (s: MultiState) => options.filter((_, n) => s.chosen.has(n));
  return {
    initial: { cursor: 0, chosen: new Set(options.flatMap((o, n) => (initial.includes(o.value) ? [n] : []))) },
    render(s, phase, p) {
      const head = header(phase, message, p);
      const names = picked(s).map((o) => o.short ?? o.label);
      const summary =
        names.length === 0 ? 'none' : names.length <= 3 ? names.join(', ') : `${names.length} of ${options.length}`;
      if (phase === 'submit') return [...head, `${p.gray(SYM.bar)}  ${p.dim(summary)}`];
      if (phase === 'cancel') return [...head, `${p.gray(SYM.bar)}  ${p.strike(p.dim(summary))}`];
      return [
        ...head,
        ...options.map((o, n) => {
          const on = s.chosen.has(n);
          const here = n === s.cursor;
          const box = on ? p.green(SYM.checked) : here ? p.petrol(SYM.unchecked) : p.dim(SYM.unchecked);
          return `${rail(phase, p)}  ${box} ${here ? o.label : p.dim(o.label)}${here && o.hint ? `  ${p.dim(o.hint)}` : ''}`;
        }),
        hint('↑/↓ to move · space to select · enter to confirm', p),
      ];
    },
    key(s, key) {
      if (up(key)) return { ...s, cursor: (s.cursor - 1 + options.length) % options.length };
      if (down(key)) return { ...s, cursor: (s.cursor + 1) % options.length };
      if (key.name === 'space') {
        const chosen = new Set(s.chosen);
        if (chosen.has(s.cursor)) chosen.delete(s.cursor);
        else chosen.add(s.cursor);
        return { ...s, chosen };
      }
      if (key.name === 'return') return { submit: picked(s).map((o) => o.value) };
      return s;
    },
  };
}

export function text(message: string, placeholder = '', optional = false): Prompt<string, string> {
  return {
    initial: '',
    render(value, phase, p) {
      const head = header(phase, message + (optional ? `  ${p.dim('optional')}` : ''), p);
      if (phase === 'submit') return [...head, `${p.gray(SYM.bar)}  ${p.dim(value.trim() || '—')}`];
      if (phase === 'cancel') return [...head, `${p.gray(SYM.bar)}  ${p.strike(p.dim(value))}`];
      const shown =
        value.length > 0
          ? `${value}${p.inverse(' ')}`
          : `${p.inverse(placeholder[0] ?? ' ')}${p.dim(placeholder.slice(1))}`;
      return [...head, `${rail(phase, p)}  ${shown}`, hint('enter to confirm', p)];
    },
    key(value, key) {
      if (key.name === 'return') return { submit: value.trim() };
      if (key.name === 'backspace') return value.slice(0, -1);
      if (key.str !== undefined && !key.ctrl && !key.meta && key.str.length === 1 && key.str >= ' ') return value + key.str;
      return value;
    },
  };
}

/** What a terminal session needs: where keys come from and where frames go. */
export interface Io {
  input: Readable & { isTTY?: boolean; setRawMode?: (on: boolean) => unknown };
  output: Writable & { columns?: number };
}

/**
 * Runs one prompt against a terminal and resolves with its value, or CANCEL
 * on Ctrl-C or Escape.
 *
 * The live frame is redrawn in place: up over the old one, erase down, write
 * the new one. Each line is cut to the terminal's width first — a line that
 * wraps is two lines, and the next redraw would climb one short. The cursor is
 * hidden while a prompt is live and shown again however it ends.
 */
export function ask<S, V>(prompt: Prompt<S, V>, io: Io, p: Paint): Promise<V | typeof CANCEL> {
  return new Promise((resolve) => {
    const width = Math.max(20, (io.output.columns ?? 100) - 1);
    const fit = (line: string): string => {
      if (visible(line).length <= width) return line;
      // Cut by visible characters, keeping escape codes intact, then reset.
      let shown = 0;
      let out = '';
      for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
        if (part.startsWith('\x1b[')) out += part;
        else {
          const room = width - 1 - shown;
          if (room <= 0) continue;
          out += part.slice(0, room);
          shown += Math.min(part.length, room);
        }
      }
      return `${out}…\x1b[0m`;
    };

    let state = prompt.initial;
    let drawn = 0;
    const draw = (phase: Phase) => {
      const lines = prompt.render(state, phase, p).map(fit);
      if (drawn > 0) io.output.write(`\x1b[${drawn}A\x1b[G\x1b[J`);
      io.output.write(`${lines.join('\n')}\n`);
      drawn = lines.length;
    };

    emitKeypressEvents(io.input);
    io.input.setRawMode?.(true);
    io.input.resume();
    io.output.write('\x1b[?25l');

    const finish = (value: V | typeof CANCEL, phase: Phase) => {
      draw(phase);
      io.input.off('keypress', onKey);
      io.input.setRawMode?.(false);
      io.input.pause();
      io.output.write('\x1b[?25h');
      resolve(value);
    };
    const onKey = (str: string | undefined, k: { name?: string; ctrl?: boolean; meta?: boolean } = {}) => {
      if ((k.ctrl === true && k.name === 'c') || k.name === 'escape') return finish(CANCEL, 'cancel');
      const key: Key = {
        ...(k.name !== undefined ? { name: k.name } : {}),
        ...(k.ctrl !== undefined ? { ctrl: k.ctrl } : {}),
        ...(k.meta !== undefined ? { meta: k.meta } : {}),
        ...(str !== undefined ? { str } : {}),
      };
      const next = prompt.key(state, key);
      if (typeof next === 'object' && next !== null && 'submit' in next) {
        return finish((next as { submit: V }).submit, 'submit');
      }
      state = next as S;
      draw('active');
    };
    io.input.on('keypress', onKey);
    draw('active');
  });
}
