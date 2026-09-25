# Working on kadence

Tasks, sprints and velocity as plain files inside a git repository. No server,
no account, no network — every capability has to survive those three
constraints or it does not belong here.

## Read first

- `SPEC.md` on the owner's disk — modules, acceptance criteria, boundaries.
  Not in git (DEC-20); `kadence schema --json` is the committed contract
- `kadence decision list` — every decision with its reason and the
  alternatives that lost. This is the committed record; the ADRs behind it
  are working papers and live on disk only (`docs/decisions/`, see
  `.gitignore`), so a fresh clone will not have them
- `CHANGELOG.md` — what shipped, release by release
- `docs/` and `tasks/` on the owner's disk — the long form: ADRs, design
  notes, review debt, milestone plans. Not in git, by decision DEC-20

## Use the skills

This project was built with them, and they carry the standards the code
already follows. Reach for the skill *before* starting, not after:

| Doing | Skill |
|---|---|
| Any behaviour change or bug fix | `eng-test-driven-development` |
| Something broke, tests fail, behaviour surprises you | `eng-debugging-and-error-recovery` |
| A choice between approaches, a new dependency | `eng-documentation-and-adrs` |
| Breaking work into tasks | `eng-planning-and-task-breakdown` |
| Reviewing a change before merge | `eng-code-review-and-quality` |
| A new module boundary or CLI contract | `eng-api-and-interface-design` |
| Product questions: features, priorities, positioning | the `product-*` and `research-*` skills |

When a skill's guidance conflicts with a habit, follow the skill. When it
conflicts with something written here, this file wins — it records decisions
already made and paid for.

## Invariants — do not break these silently

Numbered as in `docs/design/state-machine.md` (on disk, not in git). Each has
tests; if one starts failing, the fix is the code, not the test.

- **I1** The same events always fold to the same state, whatever order the
  files are read in.
- **I2** Ordering comes from the ULID, never from `ts`. Clocks disagree
  between machines.
- **I6** Deleting `.kadence/state.json` changes nothing. It is a cache, never a
  source of truth.
- **I7** A task's identity is its ULID. `KAD-1` is a label derived while
  folding, and it is never stored in an event.

## Decisions with a reason behind them

Each of these looks arbitrary until you know why. Changing one is fine; doing
it without reading the reason is not.

**Events are append-only.** Nothing is edited or deleted. `task delete` writes
a `task.deleted` event and the message says so plainly, because promising
erasure in an append-only journal would be a lie.

**Conflicts are surfaced, not resolved by rejection.** A dependency cycle, a
task in a removed status column, an event for a task that is not merged yet —
all are kept and reported. Rejecting the later event would make the state
depend on merge order and break I1.

**The core is synchronous and has zero runtime dependencies.** Async reading
measured 42 ms *slower*; a validation library cost 15% of the startup budget
for a seven-field object. ULID and validation are hand-rolled (ADR-003).

**200 ms is a hard budget for non-interactive commands.** `kadence task add`
is run dozens of times a day. The TUI is exempt because it starts once and
lives for minutes — which is why blessed is imported lazily and CI greps
`dist/cli.js` to prove it never leaks into the fast path.

**Every board action calls the same function the CLI does.** Duplicating the
logic would give the board its own idea of what "move" means, and the two
would drift.

## Boundaries

**Always**

- Append to the journal; never edit or delete an event
- `mkdir -p` before every write — git does not version empty directories, and
  `.kadence/events/2026-09/` disappears on a branch switch
- Re-measure timing after touching the core

**Ask first**

- Adding a runtime dependency, however small. Bring the measured import cost.
- Changing the shape of `FlowEvent` or the `.kadence/` layout — it breaks
  other people's repositories
- Changing the `--json` contract; agents depend on it
- Any git command that modifies the user's repository

**Never**

- Commit or push on the user's behalf. kadence writes files; what happens to
  them is the human's call.
- Make network requests. Fully offline, no telemetry.
- Write `state.json` into git
- Enter credentials or tokens anywhere, even when asked

## kadence runs on kadence

The work on this repository lives in this repository's own journal. Not as a
demo — as the cheapest source of bugs we have. Two surfaced on the first
afternoon of it: a bulk `task delete` by `KAD-N` hit the wrong rows because
labels are derived and shift as earlier tasks go, and `decision add` crashed on
a repeated `--rejected` because cac returns an array for a repeat. Both with a
green suite.

**Always the build in this working tree, never `kadence` on PATH:**

```bash
npm run build                       # after any change to src/
node dist/cli.js prime              # start here; the hook runs it per session
node dist/cli.js ready              # what can be started now
node dist/cli.js task claim         # take the top of ready
```

Drive the code you just changed. The global install is a different version —
it was 0.1.5 here while the repository was at 0.4.1, so `kadence prime` in this
directory ran a binary with no `prime` command.

`scripts/kadence.mjs` on the owner's disk does the two steps in one and is what
the session hook calls; it is not in git (DEC-20), so a fresh clone uses the
two commands above.

**During a change:**

- Claim the task before starting; release happens for you when it reaches `done`.
- Every acceptance criterion on the task is checked before it moves, or the
  reason it cannot be is written as a note.
- A choice between approaches is `decision add --why`, not a comment that dies
  with the branch. `--rejected` takes the alternatives that lost.
- Something learned that was never a choice is `note`, not a decision — the
  help says which is which when you reach for the wrong one.
- Anything the product made awkward while you used it becomes a `note` in the
  same session. That is what this is for; a finding written down tomorrow is a
  finding that was not written down.

## Commands

```bash
npm test           # 1060 tests
npm run typecheck
npm run build      # single bundle, blessed stays external
npm run reference  # dist/reference.json — what the site's CLI page is built from
```

Tests build the binary first via `globalSetup` — several spawn `dist/cli.js`
as a real process. A green suite that relies on a leftover `dist/` is a suite
passing for the wrong reason; that happened once and cost a red CI.

Because so much of the suite spawns that binary, the fork pool is capped at
four in `vitest.config.ts`. Uncapped, a busy machine produces timeouts that
look like product failures and are not — the reasoning and the numbers are in
the comment there. **A test that fails with "Test timed out in 5000ms" after
sitting for minutes is telling you about the machine, not the code.** Run the
file on its own before believing it.

## What tests do not catch here

Four TUI bugs shipped past a green suite and surfaced only when a human ran
the product: keys routed to two handlers at once, a key stream that stopped
arriving, Ctrl-D deleting a task, an invisible selection.

They share a trait — code at the boundary with the terminal. Key routing is
now a pure function with its own tests (`src/tui/keys.ts`), but the rest of
the TUI is verified by hand. **After changing anything in `src/tui/`, run
`kadence ui` and use it.** A passing suite is not evidence there.

A fifth bug, same family, different boundary: every `--json` response over
128 KiB came back truncated when stdout was a pipe — which is how agents read
it — because `process.exit()` does not wait for an asynchronous write. Writing
to a file looked fine. 418 tests passed over it, because every fixture was
small. Found by Probe C.

**The rule is not "run the TUI by hand" — it is that anything crossing into the
outside world needs a test at real size**, not a convenient one.

## Honest state of the product

The architecture is measured. The product bet is not.

Since 2026-09-04 the bet is **shared context**: that a team and its agents lose
enough of it between sessions to want a journal. The industry named the problem
(spec drift, agent context amnesia) — our users have not. Probe B, the
interviews, still has not been run.

Probe A established that conflicts in task files are real but rare (15% of
repositories, one merge in two hundred), which is why conflict-freedom is proof
and not the headline. Sprint velocity is now a **consequence** of the journal,
not the pitch — the reasoning is in `docs/product/positioning.md` and
`docs/product/positioning-review-2026-09.md`, both on disk only.

Say so when it matters. The README does, and so should any plan built on that
assumption.

<!-- kadence:begin -->
<!-- generated by kadence 0.7.0 — refresh with `kadence init` -->
## Project tasks — kadence

Tasks, notes, decisions and documentation live in `.kadence/` as plain files, shared through git.

    kadence prime                       start here: sprint, your work, what is ready
    kadence search "…" --json           find where something was written down
    kadence board --json --summary      the board's state, without the history
    kadence task list --json            all tasks
    kadence decision list --json        why the current choices were made
    kadence doc list --json             documentation: how things work now, revised
    kadence schema --json               the contract: commands, fields, error codes

    kadence task claim                  take the top of ready before starting
    kadence task move KAD-1 done        change state
    kadence note "…" --task KAD-1       something learned, for the next session
    kadence decision add "…" --why "…"  a choice between approaches, and its reason

`--json` responses carry `schema: "kadence/v1"`; stdout is JSON only. A failure
carries `error.code` and, where knowable, `allowed`. As an agent, set `KADENCE_SOURCE=agent`.
If `kadence` is not on PATH, ask the human to run `npm install -g kadence` (`npx kadence prime` needs network — their call).

Details: `.kadence/README.md`
<!-- kadence:end -->
