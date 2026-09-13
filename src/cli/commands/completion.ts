import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { failure, type CommandResult } from './task.js';

/**
 * Shell completion.
 *
 * Generated from one list rather than three hand-written scripts: the commands
 * are the same in every shell, and three copies would drift the first time one
 * is added. There is no repository requirement here — completion is about the
 * binary, not about a project.
 */

/**
 * The line every generated script starts with.
 *
 * It is how `install` recognises its own work. A file without it belongs to
 * someone else — the user, or a distribution package that writes into the same
 * directory — and is never overwritten without being asked.
 */
const MARKER = '# kadence completion';

export const SHELLS = ['zsh', 'bash', 'fish'] as const;
export type Shell = (typeof SHELLS)[number];

export function isShell(value: string): value is Shell {
  return (SHELLS as readonly string[]).includes(value);
}

/** Top-level commands, and the sub-actions of the ones that have them. */
const COMMANDS: Array<[string, string]> = [
  ['init', 'Set up kadence in this repository'],
  ['prime', 'Everything a session needs before it starts'],
  ['ready', 'What can be started right now'],
  ['task', 'Tasks: add, list, show, move, claim, ac'],
  ['board', 'Kanban board in the terminal'],
  ['sprint', 'Sprints: create, start, close, status'],
  ['milestone', 'Milestones: create, add, list, close'],
  ['decision', 'Decisions: add, list, show'],
  ['note', 'Record something learned'],
  ['stats', 'Where the project stands'],
  ['template', 'Task templates: save, list, delete'],
  ['schema', 'The machine-readable --json contract'],
  ['completion', 'Shell completion'],
  ['ui', 'The interactive board'],
];

const TASK_ACTIONS = [
  'add', 'list', 'show', 'edit', 'move', 'assign', 'comment', 'log',
  'parent', 'block', 'unblock', 'claim', 'release', 'ac', 'doc', 'cancel', 'delete',
];

export function completionScript(shell: Shell): string {
  const names = COMMANDS.map(([name]) => name).join(' ');

  if (shell === 'fish') {
    const lines = [
      `${MARKER} for fish`,
      'complete -c kadence -f',
      ...COMMANDS.map(
        ([name, help]) =>
          `complete -c kadence -n "not __fish_seen_subcommand_from ${names}" -a ${name} -d '${help.replace(/'/g, "")}'`,
      ),
      `complete -c kadence -n "__fish_seen_subcommand_from task" -a "${TASK_ACTIONS.join(' ')}"`,
      'complete -c kadence -l json -d \'Machine-readable output for agents\'',
    ];
    return `${lines.join('\n')}\n`;
  }

  if (shell === 'bash') {
    return `${MARKER} for bash
_kadence() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  if [ "\$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( \$(compgen -W "${names}" -- "\$cur") )
    return
  fi
  case "\$prev" in
    task) COMPREPLY=( \$(compgen -W "${TASK_ACTIONS.join(' ')}" -- "\$cur") ) ;;
    sprint) COMPREPLY=( \$(compgen -W "create add edit start close status list burndown" -- "\$cur") ) ;;
    milestone) COMPREPLY=( \$(compgen -W "create add list close" -- "\$cur") ) ;;
    decision) COMPREPLY=( \$(compgen -W "add list show" -- "\$cur") ) ;;
    completion) COMPREPLY=( \$(compgen -W "install" -- "\$cur") ) ;;
    *) COMPREPLY=( \$(compgen -W "--json" -- "\$cur") ) ;;
  esac
}
complete -F _kadence kadence
`;
  }

  return `#compdef kadence
${MARKER} for zsh

_kadence() {
  local -a commands
  commands=(
${COMMANDS.map(([name, help]) => `    '${name}:${help.replace(/'/g, '')}'`).join('\n')}
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi

  case "\${words[2]}" in
    task) _values 'action' ${TASK_ACTIONS.join(' ')} ;;
    sprint) _values 'action' create add edit start close status list burndown ;;
    milestone) _values 'action' create add list close ;;
    decision) _values 'action' add list show ;;
    completion) _values 'action' install ;;
    *) _arguments '--json[Machine-readable output for agents]' ;;
  esac
}

_kadence "\$@"
`;
}

/**
 * Where each shell looks without being told.
 *
 * bash and fish load these directories on their own. zsh needs the directory
 * on `fpath`, which is the user's file to edit — so the command writes the
 * script and says the one line to add, rather than editing a shell rc itself.
 */
export function completionPath(shell: Shell, home: string): string {
  if (shell === 'fish') return join(home, '.config', 'fish', 'completions', 'kadence.fish');
  if (shell === 'bash') {
    return join(home, '.local', 'share', 'bash-completion', 'completions', 'kadence');
  }
  return join(home, '.zsh', 'completions', '_kadence');
}

/** Detected from $SHELL, because asking every time is the wrong default. */
export function detectShell(env: NodeJS.ProcessEnv): Shell | null {
  const path = env['SHELL'] ?? '';
  for (const shell of SHELLS) {
    if (path.endsWith(`/${shell}`) || path === shell) return shell;
  }
  return null;
}

export interface CompletionOptions {
  shell?: string;
  /** Write the file; without it the script goes to stdout. */
  install?: boolean;
  /** Injected in tests; the real home otherwise. */
  home?: string;
  isTty?: boolean;
  /** Overwrite a file kadence did not write. Never the default. */
  force?: boolean;
}

export function runCompletion(env: NodeJS.ProcessEnv, options: CompletionOptions): CommandResult {
  let shell: Shell;
  if (options.shell !== undefined) {
    if (!isShell(options.shell)) {
      return failure(2, 'invalid_argument', `kadence has no completion for "${options.shell}".`, {
        received: options.shell,
        allowed: SHELLS,
        hint: 'kadence completion install --shell zsh',
      });
    }
    shell = options.shell;
  } else {
    const detected = detectShell(env);
    if (detected === null) {
      return failure(
        2,
        'invalid_argument',
        'Could not tell which shell you use from $SHELL.\nName it:\n  kadence completion install --shell zsh',
        { allowed: SHELLS, hint: 'kadence completion install --shell zsh' },
      );
    }
    shell = detected;
  }

  const script = completionScript(shell);

  // Piping into a file is the other way people install this, and a status line
  // in the middle of the script would break it.
  if (options.install !== true || options.isTty === false) {
    return {
      ok: true,
      exitCode: 0,
      message: script,
      data: { schema: 'kadence/v1', ok: true, shell, script },
    };
  }

  const path = completionPath(shell, options.home ?? homedir());
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8');
    if (existing === script) {
      return {
        ok: true,
        exitCode: 0,
        message: `Completion for ${shell} is already installed at ${path}.`,
        data: { schema: 'kadence/v1', ok: true, shell, path, written: false },
      };
    }
    // Something else is there. These directories are shared — a distribution
    // package writes into the bash one, and the zsh one is a place people keep
    // their own functions. Replacing a file we did not write is not ours to do.
    if (!existing.includes(MARKER) && options.force !== true) {
      return failure(
        1,
        'conflicting_state',
        `${path} exists and was not written by kadence.\n` +
          'Nothing was changed. Look at it, then either move it or run:\n' +
          `  kadence completion install --shell ${shell} --force`,
        { received: path, hint: `kadence completion install --shell ${shell} --force` },
      );
    }
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, script, 'utf8');

  const next =
    shell === 'zsh'
      ? `\nzsh loads completions from fpath, which is yours to set. Add to ~/.zshrc:\n  fpath=(${dirname(path)} $fpath)\n  autoload -Uz compinit && compinit`
      : `\nOpen a new shell, or reload it, and it will be picked up.`;

  return {
    ok: true,
    exitCode: 0,
    message: `Wrote ${shell} completion to ${path}.${next}`,
    data: { schema: 'kadence/v1', ok: true, shell, path, written: true },
  };
}
