# kadence

**Sprint tracking that lives in your git repo — and tells you what a story point actually costs.**

```bash
npm install -g kadence
kadence init
```

No server. No account. No network. Your tasks are files next to your code, and
they move with your branches.

---

## The number nobody has

Every team estimates in points. Almost none can say what a point costs them.

```
$ kadence sprint close

Sprint "Sprint 14" closed.

  Velocity:  23 of 28 points
  Actual:    37h — 1.6h per point

  Carried over (2):
    · KAD-12  Auth refactor
```

`1.6h per point` is derived from the journal — every state change your team
already made, timestamped. Nobody fills in a form. Nobody can forget to update
it. Next sprint you plan against a measured number instead of a feeling.

## Three things a browser tab cannot do

**Your board is in the commit.** `git checkout` a release from three months ago
and the tasks are exactly as they were that day. Not roughly — the same files.

**Merges do not fight you.** Two people editing one task on two branches is a
conflict in every file-based tracker. Here it is not, by construction: the
journal is append-only, one file per event.

**Agents read it without a bridge.** No MCP server, no token, no network. It is
files, plus `--json` on every command.

---

## Why the merge claim holds

We measured it before building on it.

Across **8,396 merge commits in 130 public repositories** using file-based
trackers, conflicts in task files hit **15% of repositories** — and **89% are
`CONFLICT (content)`**, the exact type an append-only journal removes.

Then the other direction: three people editing one task on three branches,
merged in every order. Zero conflicts, every author preserved, identical final
state. That is an [integration test](test/integration/merge.test.ts), not a
claim.

Full data: [probe-a-results.md](docs/research/probe-a-results.md).

---

## In practice

```bash
kadence init

kadence sprint create "Sprint 14"
kadence task add "Fix login" -d "Broken since 2.3" --type bug --priority high --estimate 3
kadence sprint add KAD-1
kadence task move KAD-1 done
kadence sprint close
```

**The board, when you want to look at it:**

```
$ kadence ui

 kadence   Sprint 14   9 tasks, 28 points
+- backlog (2) -------++- in_progress (1) --++- in_review (1) ----++- done (3) ---------+
| ^# KAD-1 Auth epic  || . KAD-4 Tokens @dev||!! KAD-7 Crash   [] || v KAD-2 Export     |
|  * KAD-3 Login form ||                    ||                    || v KAD-5 Docs       |
+---------------------++--------------------++--------------------++--------------------+
 arrows move  enter details  m status  a assign  e edit  s sprint  / filter  q quit
```

Keyboard, mouse, drag between columns, every field editable in place. It calls
the same commands the CLI does, so the two can never disagree.

**For an agent:**

```bash
kadence board --json
KADENCE_SOURCE=agent kadence task move KAD-1 in_progress
```

Every response carries `schema: "kadence/v1"`. stdout is JSON and nothing else;
warnings go to stderr. `init` writes a guide the agent finds on its own.

---

## Commands

```
kadence init                      set up in this repository
kadence ui                        interactive board

kadence task add "<title>"        -d --type --priority -a --label --due
                                  --parent --template --estimate
kadence task list                 --search --status --assignee --overdue
                                  --sort --tree
kadence task show KAD-1           detail, comments and history
kadence task edit KAD-1           opens $EDITOR, or pass field flags
kadence task move KAD-1 done      also: assign, comment, log, parent, block,
                                  cancel, delete
kadence board                     plain columns; `board config` sets your own
kadence sprint create|add|start|close|status|burndown|list
kadence template save|list|delete
```

Bulk works everywhere: `kadence task move KAD-1,KAD-2 done` — **all or
nothing**, so a typo changes nothing rather than half your board.

---

## What it costs you

| | |
|---|---|
| Install | 32 KB, one runtime dependency |
| Startup | 80 ms |
| 10,000 events | 28 ms cold, 7 ms warm |
| Journal on disk | 1.9 MB |

These are tests. They fail the build on regression, which is why they are still
true.

---

## Honest status

**Verified.** The merge thesis, on real git branches. Performance and size, by
tests that fail if they regress. That the conflict problem exists in the wild —
measured, not assumed. 390 tests, including an end-to-end run through the
installed binary.

**Not verified.** Whether teams want this. The velocity bet rests on reasoning,
not on user interviews — that research is
[designed](docs/research/interview-script.md) and not yet run.

**Known limits.** Conflicts are real but rare: roughly one merge in two
hundred. That is why the headline is analytics, not conflict-freedom. Terminal
interaction is covered by manual testing; only the key router is unit-tested.

---

## How it works

```
.kadence/
|- state.json          derived cache - gitignored, safe to delete
`- events/
   |- archive/         compacted history, one file per month
   `- 2026-09/         recent events, one file each
```

Every command appends one event. State is folded from the journal on read, so
the board cannot drift from reality. Two branches writing at once produce two
different files, and git merges them without a conflict by construction.

Design decisions, each recording what was measured and what would make us
revisit it: [docs/decisions/](docs/decisions/).

## Contributing

```bash
npm install
npm test          # 390 tests
npm run build     # 32 KB bundle
```

`CLAUDE.md` documents the invariants, the boundaries, and the decisions that
look arbitrary without their reasoning. Read it before changing the core.

## Licence

MIT
