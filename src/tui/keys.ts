/**
 * Keyboard routing for the interactive board.
 *
 * Extracted from the widgets on purpose. The original code had two independent
 * paths — `screen.key()` for the board and `element.on('keypress')` for each
 * dialog — and blessed delivers a keystroke to both. That produced two bugs at
 * once: the Enter that opened a dialog immediately fired inside it, and arrow
 * keys went wherever focus happened to be rather than to the visible window.
 *
 * One router, one owner of the keyboard, no reliance on widget focus.
 */

export interface KeyEvent {
  /** Character produced, when there is one. */
  ch: string;
  /** blessed's key name: 'enter', 'escape', 'up', ... */
  name: string;
}

export type KeyHandler = (event: KeyEvent) => void;

export interface KeyRouter {
  /** Sends a keystroke to whoever currently owns the keyboard. */
  dispatch: (event: KeyEvent) => void;
  /** Pushes a dialog on top; it receives every key until released. */
  push: (handler: KeyHandler) => () => void;
  /** True while a dialog owns the keyboard. */
  isDialogOpen: () => boolean;
  /** Depth of the dialog stack, for tests and diagnostics. */
  depth: () => number;
}

export function createKeyRouter(base: KeyHandler): KeyRouter {
  const stack: KeyHandler[] = [];

  /**
   * Keystrokes are ignored until the event that opened a dialog has finished
   * being delivered.
   *
   * blessed dispatches one physical keypress to several listeners in the same
   * tick, so without this the Enter that opened a window is also seen by the
   * window — which is exactly how "open a task" turned into "rename a task".
   */
  let sealedUntilNextTick = false;

  function seal(): void {
    sealedUntilNextTick = true;
    setImmediate(() => {
      sealedUntilNextTick = false;
    });
  }

  return {
    dispatch(event) {
      if (sealedUntilNextTick) return;
      const top = stack[stack.length - 1];
      if (top !== undefined) top(event);
      else base(event);
    },

    push(handler) {
      stack.push(handler);
      seal();

      let released = false;
      return () => {
        // Idempotent: a dialog can be closed by a key, a click and its own
        // callback, and releasing twice must not pop someone else's handler.
        if (released) return;
        released = true;

        const index = stack.lastIndexOf(handler);
        if (index !== -1) stack.splice(index, 1);
        seal();
      };
    },

    isDialogOpen: () => stack.length > 0,
    depth: () => stack.length,
  };
}

/**
 * True when a keystroke is a control character wearing a letter's name.
 *
 * blessed reports Ctrl-D as `name: 'd'` with `ch: '\u0004'`. Without this
 * check an accidental Ctrl-D would run whatever `d` is bound to — in this
 * board, deleting a task.
 */
export function isControlChar(event: KeyEvent): boolean {
  if (event.ch === '') return false;
  const code = event.ch.charCodeAt(0);
  // Tab, enter and escape arrive as named keys and are handled by name.
  return code < 32 || code === 127;
}

/** Keys that scroll a dialog rather than dismissing it. */
export const SCROLL_KEYS = ['up', 'down', 'pageup', 'pagedown', 'home', 'end'];

/** Keys that close a dialog. */
export const CLOSE_KEYS = ['escape', 'q'];

export function isScrollKey(event: KeyEvent): boolean {
  return SCROLL_KEYS.includes(event.name);
}

export function isCloseKey(event: KeyEvent): boolean {
  return CLOSE_KEYS.includes(event.name) || CLOSE_KEYS.includes(event.ch);
}

/** Moves a cursor within bounds, wrapping at both ends. */
export function moveCursor(current: number, delta: number, length: number): number {
  if (length === 0) return 0;
  return (current + delta + length) % length;
}
