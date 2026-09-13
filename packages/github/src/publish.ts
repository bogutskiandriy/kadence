import { spawnSync } from 'node:child_process';

/**
 * One-way publish of kadence tasks to GitHub Issues.
 *
 * The network exists here and nowhere else in the product, and even here it is
 * not ours: every request is made by `gh`, which already holds the user's
 * credential. This package opens no socket, reads no token, and never reads an
 * issue back into the journal (ADR-012).
 */

/** Both sides of the boundary, injected so tests never touch the network. */
export interface Runner {
  /** Runs a command and returns what it wrote. */
  run: (command: string, args: readonly string[]) => { stdout: string; stderr: string; code: number };
}

export const realRunner: Runner = {
  run(command, args) {
    const r = spawnSync(command, [...args], { encoding: 'utf8' });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', code: r.status ?? -1 };
  },
};

export interface Task {
  label: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  assignee: string | null;
  estimate: number | null;
  labels: string[];
  criteria: Array<{ n: number; text: string; checked: boolean }>;
}

export interface PublishOptions {
  refs: string[];
  dryRun?: boolean;
  /** Where to publish; `gh` infers the current repository when absent. */
  repo?: string;
}

export interface PublishResult {
  ok: boolean;
  exitCode: number;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * The line that ties an issue to a task.
 *
 * A label, not a ULID: `KAD-1` is what a person sees everywhere else. It can
 * change when branches merge (I7), and a stale marker produces a second issue
 * rather than editing the wrong one — the failure we chose deliberately,
 * because the alternative is overwriting somebody else's issue.
 */
export function marker(label: string): string {
  return `<!-- kadence:${label} -->`;
}

export function issueBody(task: Task): string {
  const lines: string[] = [marker(task.label), ''];
  if (task.description !== null && task.description.trim().length > 0) {
    lines.push(task.description.trim(), '');
  }
  if (task.criteria.length > 0) {
    lines.push('### Acceptance criteria', '');
    for (const c of task.criteria) lines.push(`- [${c.checked ? 'x' : ' '}] ${c.text}`);
    lines.push('');
  }
  const facts = [
    `status: ${task.status}`,
    `type: ${task.type}`,
    `priority: ${task.priority}`,
    task.estimate === null ? '' : `estimate: ${task.estimate}`,
    task.assignee === null ? '' : `assignee: ${task.assignee}`,
  ].filter((f) => f.length > 0);
  lines.push(`\`${facts.join(' · ')}\``, '');
  // Said on the issue itself, not only in the help: whoever edits this here
  // needs to know it will be overwritten.
  lines.push(
    '---',
    '',
    `Published from kadence (\`${task.label}\`). This is a one-way copy: edits made here ` +
      'are not read back, and the next publish replaces this body.',
  );
  return lines.join('\n');
}

/** `gh` present and authenticated, or a sentence saying which is missing. */
export function checkGh(runner: Runner): string | null {
  const version = runner.run('gh', ['--version']);
  if (version.code !== 0) {
    return (
      'This needs the GitHub CLI, and `gh` is not on your PATH.\n' +
      'Install it: https://cli.github.com\n' +
      'kadence itself makes no network requests; this package is the only part that does.'
    );
  }
  const auth = runner.run('gh', ['auth', 'status']);
  if (auth.code !== 0) {
    return 'gh is installed but not logged in.\nRun:\n  gh auth login';
  }
  return null;
}

const LOOKUP_LIMIT = 200;

/**
 * Every issue on the repository, indexed by the marker in its body.
 *
 * Fetched once for the whole batch rather than once per task, and the failure
 * is a value rather than an absence: a rate limit that read as "no issue
 * exists" would create a duplicate and report success. ADR-012 accepts a
 * duplicate from a *stale marker*; it does not accept one from a transient
 * error.
 */
export type Lookup =
  | { ok: true; byLabel: Map<string, number>; capped: boolean }
  | { ok: false; error: string };

export function loadIssues(runner: Runner, repo?: string): Lookup {
  const args = ['issue', 'list', '--state', 'all', '--limit', String(LOOKUP_LIMIT), '--json', 'number,body'];
  if (repo !== undefined) args.push('--repo', repo);
  const r = runner.run('gh', args);
  if (r.code !== 0) {
    return {
      ok: false,
      error: `gh could not list the issues, so publishing would duplicate them:\n${r.stderr.trim()}`,
    };
  }

  let issues: Array<{ number: number; body: string | null }>;
  try {
    issues = JSON.parse(r.stdout) as Array<{ number: number; body: string | null }>;
  } catch {
    return { ok: false, error: 'gh returned something that is not JSON. Nothing was published.' };
  }

  const byLabel = new Map<string, number>();
  for (const issue of issues) {
    const found = /<!-- kadence:([A-Za-z0-9-]+) -->/.exec(issue.body ?? '');
    if (found !== null && !byLabel.has(found[1]!)) byLabel.set(found[1]!, issue.number);
  }
  return { ok: true, byLabel, capped: issues.length >= LOOKUP_LIMIT };
}

export function publish(
  runner: Runner,
  tasks: readonly Task[],
  options: PublishOptions,
): PublishResult {
  if (options.refs.length === 0) {
    return {
      ok: false,
      exitCode: 2,
      message: 'Which task?\n  kadence-github publish KAD-1\n  kadence-github publish KAD-1,KAD-2',
    };
  }

  const wanted = options.refs.map((r) => r.trim().toUpperCase()).filter((r) => r.length > 0);
  const found = wanted.map((ref) => tasks.find((t) => t.label.toUpperCase() === ref));
  const missing = wanted.filter((ref, i) => found[i] === undefined);
  if (missing.length > 0) {
    // All or nothing, the rule every bulk command in kadence follows: half a
    // publish is harder to undo than one that never started.
    return {
      ok: false,
      exitCode: 1,
      message:
        `No task ${missing.join(', ')} on this board. Nothing was published.\n` +
        '  kadence task list',
    };
  }

  const gh = options.dryRun === true ? null : checkGh(runner);
  if (gh !== null) return { ok: false, exitCode: 1, message: gh };

  const chosen = found as Task[];
  const results: Array<{ label: string; action: string; issue: number | null }> = [];
  const lines: string[] = [];

  if (options.dryRun === true) {
    for (const task of chosen) {
      results.push({ label: task.label, action: 'dry-run', issue: null });
      lines.push(`${task.label} would be published as "${task.title}"`);
    }
    return {
      ok: true,
      exitCode: 0,
      message: `${lines.join('\n')}\n\nNothing was sent. Drop --dry-run to publish.`,
      data: { schema: 'kadence/v1', ok: true, published: results },
    };
  }

  // One lookup for the whole batch, before the first write: publishing N tasks
  // used to mean N full listings, and a failure halfway through would have
  // been read as "no issue exists".
  const lookup = loadIssues(runner, options.repo);
  if (!lookup.ok) return { ok: false, exitCode: 1, message: lookup.error };

  const warning = lookup.capped
    ? `\nThe marker search saw the newest ${LOOKUP_LIMIT} issues. An older one may be republished rather than edited.`
    : '';

  const base = options.repo === undefined ? [] : ['--repo', options.repo];

  /** What has already gone out, named — a partial batch must not be silent. */
  const partial = (): string =>
    results.length === 0
      ? '\nNothing was published.'
      : `\nAlready published and left in place: ${results
          .map((r) => `${r.label} (${r.action}${r.issue === null ? '' : ` #${r.issue}`})`)
          .join(', ')}.`;

  for (const task of chosen) {
    const body = issueBody(task);
    const existing = lookup.byLabel.get(task.label) ?? null;

    if (existing === null) {
      const args = ['issue', 'create', ...base, '--title', task.title, '--body', body];
      for (const l of task.labels) args.push('--label', l);
      const r = runner.run('gh', args);
      if (r.code !== 0) {
        return {
          ok: false,
          exitCode: 1,
          message: `gh could not create the issue for ${task.label}:\n${r.stderr.trim()}${partial()}`,
          data: { schema: 'kadence/v1', ok: false, published: results, failedAt: task.label },
        };
      }
      // The URL ends in the number; parse it so created and updated report the
      // same shape.
      const number = /\/(\d+)\s*$/.exec(r.stdout.trim());
      results.push({
        label: task.label,
        action: 'created',
        issue: number === null ? null : Number(number[1]),
      });
      lines.push(`${task.label} created: ${r.stdout.trim()}`);
    } else {
      const r = runner.run('gh', [
        'issue',
        'edit',
        String(existing),
        ...base,
        '--title',
        task.title,
        '--body',
        body,
      ]);
      if (r.code !== 0) {
        return {
          ok: false,
          exitCode: 1,
          message: `gh could not update issue #${existing} for ${task.label}:\n${r.stderr.trim()}${partial()}`,
          data: { schema: 'kadence/v1', ok: false, published: results, failedAt: task.label },
        };
      }
      results.push({ label: task.label, action: 'updated', issue: existing });
      lines.push(`${task.label} updated: #${existing}`);
    }
  }

  return {
    ok: true,
    exitCode: 0,
    message:
      `${lines.join('\n')}${warning}\n\n` +
      'One direction only: nothing is read back, and edits made on GitHub will be overwritten.',
    data: { schema: 'kadence/v1', ok: true, published: results },
  };
}
