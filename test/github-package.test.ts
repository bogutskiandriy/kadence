import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  publish,
  issueBody,
  marker,
  checkGh,
  loadIssues,
  type Runner,
  type Task,
} from '../packages/github/src/publish.js';

/**
 * `@kadence/github` — the second experiment.
 *
 * Every test here runs against a recorded `gh`, never the real one: the
 * product's constraint is that nothing makes a network request, and a test
 * suite that quietly did would be the first thing to break it.
 */

function task(over: Partial<Task> = {}): Task {
  return {
    label: 'KAD-1',
    title: 'Login form',
    description: 'The redirect drops the cookie.',
    status: 'in_progress',
    type: 'bug',
    priority: 'high',
    assignee: 'alice@example.com',
    estimate: 3,
    labels: ['auth'],
    criteria: [
      { n: 1, text: 'Tests green', checked: true },
      { n: 2, text: 'Docs updated', checked: false },
    ],
    ...over,
  };
}

/** Records every command, and answers from a script. */
function fakeGh(answers: Record<string, { stdout?: string; code?: number }> = {}): Runner & {
  calls: string[][];
} {
  const calls: string[][] = [];
  return {
    calls,
    run(command, args) {
      calls.push([command, ...args]);
      const key = args.slice(0, 2).join(' ');
      const answer = answers[key] ?? {};
      return { stdout: answer.stdout ?? '', stderr: '', code: answer.code ?? 0 };
    },
  };
}

const HAPPY = {
  '--version': { stdout: 'gh version 2.0.0' },
  'auth status': { stdout: 'Logged in' },
  'issue list': { stdout: '[]' },
  'issue create': { stdout: 'https://github.com/o/r/issues/7' },
  'issue edit': { stdout: '' },
};

/**
 * Everything the built CLI can load: the entry point and every chunk, the
 * lazily imported ones included. `blessed` is allowed in the UI chunks; the
 * network is allowed in none of them.
 */
function builtFiles(): string[] {
  const dist = resolve('dist');
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) out.push(full);
    }
  };
  walk(dist);
  return out.sort();
}

/**
 * `fetch` earns its place at the top: since Node 18 it is global, so a call to
 * it needs no import at all and every import-shaped pattern below would miss
 * it entirely.
 */
const FORBIDDEN = [
  'fetch(',
  'node:http',
  'node:https',
  'node:http2',
  'node:net',
  'node:tls',
  'node:dns',
  'node:dgram',
  'XMLHttpRequest',
  'WebSocket',
  'node-fetch',
  'undici',
  'axios',
] as const;

describe('the issue body', () => {
  it('carries the marker that makes a second publish an edit', () => {
    expect(issueBody(task())).toContain(marker('KAD-1'));
    expect(marker('KAD-1')).toBe('<!-- kadence:KAD-1 -->');
  });

  it('says on the issue itself that edits there are overwritten', () => {
    // Not only in the help: whoever writes into this box on GitHub is the
    // person who needs to know it will be replaced.
    const body = issueBody(task());
    expect(body).toMatch(/one-way/i);
    expect(body).toMatch(/not read back/i);
  });

  it('carries the description and the acceptance criteria as checkboxes', () => {
    const body = issueBody(task());
    expect(body).toContain('The redirect drops the cookie.');
    expect(body).toContain('- [x] Tests green');
    expect(body).toContain('- [ ] Docs updated');
  });

  it('leaves out sections a task does not have', () => {
    const body = issueBody(task({ description: null, criteria: [] }));
    expect(body).not.toContain('Acceptance criteria');
    expect(body).toContain(marker('KAD-1'));
  });
});

describe('publish', () => {
  it('creates an issue when no marker is out there', () => {
    const gh = fakeGh(HAPPY);
    const r = publish(gh, [task()], { refs: ['KAD-1'] });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/created/);
    const created = gh.calls.find((c) => c[1] === 'issue' && c[2] === 'create');
    expect(created).toBeDefined();
    expect(created!).toContain('--title');
    expect(created!).toContain('Login form');
  });

  it('edits the existing issue instead of making a second one', () => {
    const gh = fakeGh({
      ...HAPPY,
      'issue list': {
        stdout: JSON.stringify([{ number: 12, body: `nothing\n${marker('KAD-1')}\nmore` }]),
      },
    });
    const r = publish(gh, [task()], { refs: ['KAD-1'] });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/#12/);
    expect(gh.calls.some((c) => c[2] === 'create')).toBe(false);
    expect(gh.calls.some((c) => c[2] === 'edit')).toBe(true);
  });

  it('never reads an issue back into anything', () => {
    // The whole shape of the experiment: the only commands it may run are the
    // ones that ask what exists and the ones that write.
    const gh = fakeGh(HAPPY);
    publish(gh, [task()], { refs: ['KAD-1'] });
    const verbs = gh.calls.map((c) => c.slice(1, 3).join(' '));
    for (const verb of verbs) {
      expect(['--version', 'auth status', 'issue list', 'issue create', 'issue edit']).toContain(
        verb,
      );
    }
  });

  it('refuses to publish when the lookup failed, rather than duplicating', () => {
    const gh = fakeGh({ ...HAPPY, 'issue list': { code: 1 } });
    const r = publish(gh, [task()], { refs: ['KAD-1'] });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/duplicate/i);
    expect(gh.calls.some((c) => c[2] === 'create')).toBe(false);
  });

  it('names what already went out when the batch fails halfway', () => {
    // A partial batch that reports only the failure leaves the caller with a
    // live issue they do not know about.
    let creates = 0;
    const gh: Runner & { calls: string[][] } = {
      calls: [],
      run(command, args) {
        gh.calls.push([command, ...args]);
        const key = args.slice(0, 2).join(' ');
        if (key === 'issue create') {
          creates += 1;
          return creates === 1
            ? { stdout: 'https://github.com/o/r/issues/7', stderr: '', code: 0 }
            : { stdout: '', stderr: 'boom', code: 1 };
        }
        const answer = (HAPPY as Record<string, { stdout?: string; code?: number }>)[key] ?? {};
        return { stdout: answer.stdout ?? '', stderr: '', code: answer.code ?? 0 };
      },
    };

    const r = publish(gh, [task(), task({ label: 'KAD-2', title: 'Signup' })], {
      refs: ['KAD-1', 'KAD-2'],
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/KAD-2/);
    // The one that is already live is named, in the sentence and in the payload.
    expect(r.message).toMatch(/KAD-1/);
    expect(r.data!['published']).toEqual([{ label: 'KAD-1', action: 'created', issue: 7 }]);
    expect(r.data!['failedAt']).toBe('KAD-2');
  });

  it('looks the issues up once for the whole batch', () => {
    const gh = fakeGh(HAPPY);
    publish(gh, [task(), task({ label: 'KAD-2' }), task({ label: 'KAD-3' })], {
      refs: ['KAD-1', 'KAD-2', 'KAD-3'],
    });
    expect(gh.calls.filter((c) => c[2] === 'list')).toHaveLength(1);
  });

  it('says when the marker search was capped rather than pretending it was complete', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ number: i + 1, body: 'unrelated' }));
    const gh = fakeGh({ ...HAPPY, 'issue list': { stdout: JSON.stringify(many) } });
    const r = publish(gh, [task()], { refs: ['KAD-1'] });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/newest 200/);
  });

  it('records the issue number for a creation, the same shape as an update', () => {
    const gh = fakeGh(HAPPY);
    const r = publish(gh, [task()], { refs: ['KAD-1'] });
    expect(r.data!['published']).toEqual([{ label: 'KAD-1', action: 'created', issue: 7 }]);
  });

  it('publishes several, or none at all', () => {
    const gh = fakeGh(HAPPY);
    const r = publish(gh, [task(), task({ label: 'KAD-2', title: 'Signup' })], {
      refs: ['KAD-1', 'KAD-9'],
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/KAD-9/);
    expect(r.message).toMatch(/Nothing was published/);
    // All or nothing: not one call went out.
    expect(gh.calls).toHaveLength(0);
  });

  it('sends nothing on a dry run, and does not even look for gh', () => {
    const gh = fakeGh(HAPPY);
    const r = publish(gh, [task()], { refs: ['KAD-1'], dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/Nothing was sent/);
    expect(gh.calls).toHaveLength(0);
  });

  it('says what to install when gh is missing', () => {
    const gh = fakeGh({ '--version': { code: 127 } });
    const r = publish(gh, [task()], { refs: ['KAD-1'] });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/cli\.github\.com/);
    // And says whose constraint this is, so nobody thinks kadence broke it.
    expect(r.message).toMatch(/kadence itself makes no network requests/);
  });

  it('says to log in when gh is there but not authenticated', () => {
    const gh = fakeGh({ '--version': { stdout: 'gh version 2.0.0' }, 'auth status': { code: 1 } });
    const r = publish(gh, [task()], { refs: ['KAD-1'] });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/gh auth login/);
  });

  it('reports what gh said when it fails, rather than a generic error', () => {
    const gh = fakeGh({ ...HAPPY, 'issue create': { code: 1 } });
    const r = publish(gh, [task()], { refs: ['KAD-1'] });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/could not create/);
  });

  it('asks which task when told nothing', () => {
    const r = publish(fakeGh(HAPPY), [task()], { refs: [] });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
  });

  it('passes --repo through to every call when given one', () => {
    const gh = fakeGh(HAPPY);
    publish(gh, [task()], { refs: ['KAD-1'], repo: 'owner/name' });
    const writes = gh.calls.filter((c) => c[2] === 'create' || c[2] === 'list');
    for (const call of writes) expect(call).toContain('owner/name');
  });
});

describe('gh helpers', () => {
  it('finds an issue only by the marker, not by the title', () => {
    const gh = fakeGh({
      'issue list': {
        stdout: JSON.stringify([
          { number: 3, body: 'Login form, but written by hand' },
          { number: 4, body: marker('KAD-1') },
        ]),
      },
    });
    const lookup = loadIssues(gh);
    expect(lookup.ok).toBe(true);
    if (!lookup.ok) return;
    expect(lookup.byLabel.get('KAD-1')).toBe(4);
    expect(lookup.byLabel.get('KAD-2')).toBeUndefined();
  });

  it('reports a failed lookup as a failure, not as "no issue exists"', () => {
    // A rate limit read as an absence would create a duplicate and call it a
    // success. ADR-012 accepts a duplicate from a stale marker, not from this.
    const failed = loadIssues(fakeGh({ 'issue list': { code: 1 } }));
    expect(failed.ok).toBe(false);

    const garbled = loadIssues(fakeGh({ 'issue list': { stdout: 'not json at all' } }));
    expect(garbled.ok).toBe(false);
  });

  it('reports both ways gh can be unusable', () => {
    expect(checkGh(fakeGh({ '--version': { code: 127 } }))).toMatch(/not on your PATH/);
    expect(checkGh(fakeGh(HAPPY))).toBeNull();
  });
});

describe('the boundary the package exists to keep', () => {
  const root = resolve('.');

  it('the core does not import the package', () => {
    // ADR-012: the dependency runs one way. The package reads the tracker's
    // JSON contract; nothing in src/ knows the package exists.
    const bundle = readFileSync(resolve(root, 'dist/cli.js'), 'utf8');
    expect(bundle).not.toContain('@kadence/github');
    expect(bundle).not.toContain('kadence-github');
  });

  it('the core bundle contains no network call of its own', () => {
    // The same technique that keeps blessed out of the fast path: assert on
    // the built artefact, because that is what the user actually runs.
    //
    // Every file, not just `dist/cli.js`. The build splits into chunks, and
    // most of the core is not in the entry point — `node:child_process` from
    // `src/core/git.ts` already lives in a chunk. A guard reading `cli.js`
    // alone would have printed "the core makes no network calls" over an
    // import it never opened.
    const files = builtFiles();
    // A glob that silently matches nothing would pass this test forever.
    expect(files.length, 'the build produces an entry point and its chunks').toBeGreaterThan(1);
    expect(files.some((f) => f.endsWith('cli.js'))).toBe(true);

    for (const file of files) {
      const bundle = readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN) {
        expect(bundle, `${file} must not reach for ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('the package declares no dependency on kadence', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(root, 'packages/github/package.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(pkg['dependencies']).toBeUndefined();
    expect(pkg['name']).toBe('@kadence/github');
  });

  it('the package README has no link that dies on npm', () => {
    // `files` ships dist and the README only, so a relative link out of the
    // package resolves to nothing once published.
    const text = readFileSync(resolve(root, 'packages/github/README.md'), 'utf8');
    expect(text).not.toMatch(/\]\(\.\.\//);
  });

  it('ships a README that states the direction', () => {
    const readme = resolve(root, 'packages/github/README.md');
    expect(existsSync(readme)).toBe(true);
    const text = readFileSync(readme, 'utf8');
    expect(text).toMatch(/One direction only/i);
    expect(text).toMatch(/ADR-012/);
  });
});
