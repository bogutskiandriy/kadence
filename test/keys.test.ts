import { describe, it, expect, vi } from 'vitest';
import {
  createKeyRouter,
  moveCursor,
  isCloseKey,
  isScrollKey,
  isControlChar,
} from '../src/tui/keys.js';

const key = (name: string, ch = '') => ({ name, ch });

/** setImmediate resolves the router's one-tick seal. */
const tick = () => new Promise<void>((r) => setImmediate(r));

describe('key routing', () => {
  it('sends keys to the board when no dialog is open', async () => {
    const board = vi.fn();
    const router = createKeyRouter(board);
    await tick();

    router.dispatch(key('enter'));
    expect(board).toHaveBeenCalledOnce();
  });

  it('does not deliver the keystroke that opened a dialog to that dialog', async () => {
    // The original bug: pressing enter on a card opened the details window,
    // and the same enter immediately started renaming the title.
    const dialog = vi.fn();
    const router = createKeyRouter(() => router.push(dialog));
    await tick();

    router.dispatch(key('enter'));
    router.dispatch(key('enter')); // still within the same tick
    expect(dialog).not.toHaveBeenCalled();

    await tick();
    router.dispatch(key('enter'));
    expect(dialog).toHaveBeenCalledOnce();
  });

  it('gives every key to the dialog while it is open', async () => {
    const board = vi.fn();
    const dialog = vi.fn();
    const router = createKeyRouter(board);
    router.push(dialog);
    await tick();

    for (const k of ['up', 'down', 'enter', 'escape']) router.dispatch(key(k));
    expect(dialog).toHaveBeenCalledTimes(4);
    expect(board).not.toHaveBeenCalled();
  });

  it('returns control to the board after the dialog closes', async () => {
    const board = vi.fn();
    const router = createKeyRouter(board);
    const release = router.push(vi.fn());
    await tick();

    release();
    await tick();

    router.dispatch(key('up'));
    expect(board).toHaveBeenCalledOnce();
  });

  it('stacks dialogs so the topmost one wins', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const router = createKeyRouter(vi.fn());
    router.push(first);
    router.push(second);
    await tick();

    router.dispatch(key('enter'));
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(router.depth()).toBe(2);
  });

  it('releasing twice does not pop another dialog', async () => {
    const outer = vi.fn();
    const router = createKeyRouter(vi.fn());
    router.push(outer);
    const release = router.push(vi.fn());
    await tick();

    release();
    release();
    await tick();

    router.dispatch(key('enter'));
    expect(outer).toHaveBeenCalledOnce();
    expect(router.depth()).toBe(1);
  });

  it('reports whether a dialog owns the keyboard', () => {
    const router = createKeyRouter(vi.fn());
    expect(router.isDialogOpen()).toBe(false);
    const release = router.push(vi.fn());
    expect(router.isDialogOpen()).toBe(true);
    release();
    expect(router.isDialogOpen()).toBe(false);
  });
});

describe('cursor movement', () => {
  it('wraps at the end and at the start', () => {
    expect(moveCursor(2, 1, 3)).toBe(0);
    expect(moveCursor(0, -1, 3)).toBe(2);
  });

  it('survives an empty list', () => {
    expect(moveCursor(0, 1, 0)).toBe(0);
  });
});

describe('key classification', () => {
  it('treats arrows and paging as scrolling, not dismissal', () => {
    for (const name of ['up', 'down', 'pageup', 'pagedown']) {
      expect(isScrollKey(key(name))).toBe(true);
      expect(isCloseKey(key(name))).toBe(false);
    }
  });

  it('closes on escape and on q', () => {
    expect(isCloseKey(key('escape'))).toBe(true);
    expect(isCloseKey(key('', 'q'))).toBe(true);
  });
});

describe('control characters', () => {
  it('drops Ctrl-D, which blessed reports as the letter d', async () => {
    // The board binds `d` to delete. Without this guard an accidental Ctrl-D
    // would delete the selected task.
    const board = vi.fn();
    const router = createKeyRouter(board);
    await tick();

    const ctrlD = { ch: '\u0004', name: 'd' };
    if (!isControlChar(ctrlD)) router.dispatch(ctrlD);
    expect(board).not.toHaveBeenCalled();
    expect(isControlChar(ctrlD)).toBe(true);
  });

  it('lets ordinary letters through', () => {
    expect(isControlChar({ ch: 'd', name: 'd' })).toBe(false);
    expect(isControlChar({ ch: 'q', name: 'q' })).toBe(false);
  });

  it('treats a missing character as not a control char', () => {
    // Arrow keys arrive with no character at all.
    expect(isControlChar({ ch: '', name: 'up' })).toBe(false);
  });

  it('catches other control codes', () => {
    expect(isControlChar({ ch: '\u0003', name: 'c' })).toBe(true);
    expect(isControlChar({ ch: '\u007f', name: 'backspace' })).toBe(true);
  });
});
