# Working on kadence

Tasks, sprints and velocity as plain files inside a git repository. No server,
no account, no network — every capability has to survive those three
constraints or it does not belong here.

## Read first

- `SPEC.md` — modules, acceptance criteria, boundaries
- `docs/decisions/` — six ADRs, each recording what was **measured** and what
  would make us revisit it
- `docs/review-stage-2.md` — debt deliberately left, with reasoning
- `tasks/todo.md` — what shipped and why, milestone by milestone

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

Numbered as in `docs/design/state-machine.md`. Each has tests; if one starts
failing, the fix is the code, not the test.

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

## Commands

```bash
npm test           # 390 tests
npm run typecheck
npm run build      # single bundle, blessed stays external
```

Tests build the binary first via `globalSetup` — several spawn `dist/cli.js`
as a real process. A green suite that relies on a leftover `dist/` is a suite
passing for the wrong reason; that happened once and cost a red CI.

## What tests do not catch here

Four TUI bugs shipped past a green suite and surfaced only when a human ran
the product: keys routed to two handlers at once, a key stream that stopped
arriving, Ctrl-D deleting a task, an invisible selection.

They share a trait — code at the boundary with the terminal. Key routing is
now a pure function with its own tests (`src/tui/keys.ts`), but the rest of
the TUI is verified by hand. **After changing anything in `src/tui/`, run
`kadence ui` and use it.** A passing suite is not evidence there.

## Honest state of the product

The architecture is measured. The product bet — that teams want sprint
analytics in their repo — is not. Probe A established that conflicts in task
files are real but rare (15% of repositories, one merge in two hundred), which
is why the headline message is analytics rather than conflict-freedom. Probe B
— interviews — has not been run.

Say so when it matters. The README does, and so should any plan built on that
assumption.
