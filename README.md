# kadence

**Your team and your AI agents work from the same context — it lives in your repo and remembers what the code cannot.**

```bash
npm install -g kadence
kadence init
```

No server. No account. No network. Tasks, their whole history and the time they
took are files next to your code, and they move with your branches.

---

## The context your code cannot hold

Your code says **what** exists. `git log` says **when** it changed. Neither says
what was tried and abandoned, why a task is blocked, or what the team agreed on
Tuesday.

That gap costs a human a few minutes. It costs an AI agent the entire session:
every new one starts from scratch, re-reads the same files and asks the same
questions you answered yesterday.

kadence keeps that missing layer as an append-only journal — one file per event,
committed with the code:

```bash
$ kadence task show KAD-1 --json
```

```json
{
  "schema": "kadence/v1",
  "label": "KAD-1",
  "title": "Fix login",
  "status": "in_review",
  "loggedHours": 4.5,
  "blockedBy": ["KAD-7"],
  "comments": [
    { "at": "2026-09-02T09:14:00Z", "by": "ana",
      "text": "Session cookie is fine — the redirect drops it." }
  ],
  "history": [
    { "at": "2026-09-01T10:02:00Z", "by": "ana",  "type": "task.created" },
    { "at": "2026-09-01T14:40:00Z", "by": "ana",  "type": "task.moved", "to": "in_progress" },
    { "at": "2026-09-02T09:20:00Z", "by": "agent","type": "task.blocked_by_added" }
  ]
}
```

That is the whole state of a piece of work, in one call, with no server to ask
and no context to rebuild. A human reads it in `kadence task show`. An AI agent
reads the same thing as JSON.

## Why events and not files

Every other tool that keeps work in a repository keeps **state**: a task file, a
row in a database, the current spec. State has three failure modes, and all
three are why kadence stores **events** instead.

**It drifts.** A spec written on Monday and edited by an agent on Thursday no
longer says what actually happened. An event cannot drift — it records that
something occurred, not what is currently true.

**It conflicts.** Two people editing one task on two branches is a merge
conflict in every file-based tracker. Here it is not, by construction: the
journal is append-only, one file per event.

**It forgets.** Rewriting a task file destroys the previous version. The journal
keeps every step, so «how did we get here» has an answer.

State is still there when you want it — it is folded from the journal on read,
which is why the board can never drift from reality.

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
kadence task comment KAD-1 "Session cookie is fine — the redirect drops it."
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

**And because the journal has the timestamps, the cost comes out of it for free:**

```
$ kadence sprint close

Sprint "Sprint 14" closed.

  Velocity:  23 of 28 points
  Actual:    37h — 1.6h per point

  Carried over (2):
    · KAD-12  Auth refactor
```

Nobody fills in a form. Nobody can forget to update it. The number is derived
from state changes the team already made.

---

## For agents

Files first. Every command speaks `--json`, every response carries
`schema: "kadence/v1"`, stdout is JSON and nothing else, warnings go to stderr.

```bash
kadence board --json
kadence task show KAD-1 --json          # full history and comments
KADENCE_SOURCE=agent kadence task move KAD-1 in_progress
```

`init` writes a guide the AI agent finds on its own — no MCP server to run, no
token to issue, no network call to make. An MCP wrapper is on the roadmap as an
**optional package**, so the core keeps its zero dependencies and works with
AI agents that have no MCP client at all.

Bulk works everywhere and is all or nothing: `kadence task move KAD-1,KAD-2 done`
either moves both or changes nothing. A typo does not leave half a board.

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

**Not verified.** That teams and their AI agents actually lose enough context to want
this. The bet rests on reasoning and on the industry naming the problem out
loud — not on our own users. That research is
[designed](docs/research/interview-script.md) and not yet run.

**On the roadmap, not shipped.** `kadence context <task>` (the whole history of
one piece of work, formatted for an AI agent's context window), `kadence decision`
(record why, as its own event type) and the optional MCP package. Today the
history is reachable through `task show --json`, which is where the idea came
from.

**Known limits.** Conflicts are real but rare: roughly one merge in two hundred.
Terminal interaction is covered by manual testing; only the key router is
unit-tested.

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
