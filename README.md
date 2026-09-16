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

**And it stays one call.** That answer stays under a kilobyte whether the project
holds ten tasks or a thousand — while the journal behind it grows from 5 KB to
528 KB. The cost of asking does not grow with the history that makes the answer
worth having. [Measured](docs/research/probe-c-agent-cost.md) at 948 bytes in
0.2; 982 bytes at 0.4, after claims and acceptance criteria joined every record.

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
which is why the board cannot drift from the journal. No one maintains a
column by hand, so no column can be stale in the way a task file can.

**What that does not buy you.** A journal records what was written to it. If a
piece of work stops being touched, the board stays perfectly accurate and
perfectly uninformative about it — the same way `git log` is honest about a
branch nobody pushed to. kadence removes the drift between what is shown and
what was recorded. It cannot remove the drift between what was recorded and
what is actually happening; that still takes someone looking.

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

**The first ten minutes, for the person who owns `CLAUDE.md`:**

```bash
kadence init --hooks          # .kadence/, a short section in AGENTS.md and CLAUDE.md,
                              # and a Claude Code hook that runs `kadence prime` at session start
kadence task add "Fix login" --type bug --priority high
kadence decision add "Keep sessions in Redis" \
  --why "Revocation must be instant" --rejected "JWT: cannot revoke before expiry"
```

Open a new agent session. The hook runs `kadence prime`, and the agent starts
knowing what is open, what is ready and **DEC-1 with its reason** — ask it how
sessions should be stored and it answers from the journal, not from a guess.

```bash
git add .kadence AGENTS.md CLAUDE.md .claude/settings.json .gitignore
git commit -m "Keep the team's work next to the code"
```

kadence never commits for you. Once that commit is pushed, the journal is the
team's, not yours.

### Adding a teammate

1. **They install it:** `npm install -g kadence` (Node 20 or newer). Nothing is
   configured per person.
2. **They pull.** Their agent reads the same section in `CLAUDE.md` or `AGENTS.md`
   and, through the hook, runs `kadence prime` in its first session. On a machine
   where kadence is not installed yet, the hook prints one line asking for the
   install instead of failing.
3. **One identity per person.** Authorship is `git config user.email`. The same
   person on two machines with two addresses reads as two people — set the same
   address everywhere.
4. **Agents say so.** Put `KADENCE_SOURCE=agent` in the agent's environment; its
   writes then carry `[agent]` next to the same email, so a person and their agent
   stay distinguishable.

What you should see afterwards: `kadence task show KAD-1` lists their comment,
note or move with their address. That second author is the moment the journal
starts doing its job.

**When several people — or several agents — work the same board:**

```bash
kadence ready                  # open, unblocked, nobody else's
kadence task claim             # take the top of that list, in one step
kadence note "Redirect drops the cookie, not the session" --task KAD-1
kadence task release KAD-1
```

There is no lock, and the message says so. Two machines can each claim before
either pushes; the merge keeps both claims and the task reads `contested` with
both names. Refusing the second one would make the owner depend on which branch
merged first, and that is the property the whole design rests on.

**The board, when you want to look at it:**

```
$ kadence ui

 kadence  6 open · 2 ready · 1 decision in force
+- backlog (2) -------++- in_progress (1) --++- in_review (1) ----++- done (3) ---------+
| ^# KAD-1 Auth epic  || . KAD-4 Tokens @dev||!! KAD-7 Crash   [] || v KAD-2 Export     |
|  * KAD-3 Login form ||                    ||                    || v KAD-5 Docs       |
+---------------------++--------------------++--------------------++--------------------+
 arrows move  enter details  m status  a assign  e edit  s sprint  R ready  b branch  q quit
```

Keyboard, mouse, drag between columns, every field editable in place. It calls
the same commands the CLI does, so the two can never disagree.

**And what the branch you are on is actually about:**

```bash
kadence task list --branch
```

Nothing is stored for that: which tasks belong to a branch lives in git's
history and is read when you ask. It narrows the answer between three and
twenty times, [measured](docs/research/branch-context-2026-09.md) on real board
sizes.

### Also in the box

Sprints (`sprint create/close`, with points and hours derived from moves),
milestones, acceptance criteria and a definition of done, templates, custom
columns, reports folded from the same journal (`report flow`, `cfd`,
`attention`; burndown, velocity and workload are in the repository and not yet
on npm), a self-contained HTML or Markdown export, `compact` for long journals,
and shell completion. None of it is required, and none of it is the point —
it is what the journal happens to know. Commands and caveats:
[docs/reports.md](docs/reports.md), and `--help` on each command.

### Removing kadence

Everything `init` touched, so you can undo it by hand:

| What | Where |
|---|---|
| The journal | `.kadence/` — yours to keep or delete; kadence never deletes it |
| The agent section | between `<!-- kadence:begin -->` and `<!-- kadence:end -->` in `AGENTS.md` and `CLAUDE.md` |
| The hook (only with `--hooks`) | the `SessionStart` entry that runs `kadence prime` in `.claude/settings.json` |
| The cache entry | the `.kadence/state.json` line in `.gitignore` |

Then `npm uninstall -g kadence`. Nothing lives outside the repository and your
global `node_modules`.

---

## For agents

Files first. Every command speaks `--json`, every response carries
`schema: "kadence/v1"`, stdout is JSON and nothing else, warnings go to stderr.

Start a session with one command:

```bash
kadence prime          # active sprint, your work, what is ready, decisions in force, recent notes
kadence ready --json   # seven fields per task, not the whole record
```

`prime` is held to forty lines and three kilobytes by a test, because it is paid
for on every turn that follows. `kadence init --hooks` will add it as a
`SessionStart` hook — only with the flag, because `.claude/settings.json` is
yours.

```bash
kadence board --json
kadence task show KAD-1 --json          # full history and comments
KADENCE_SOURCE=agent kadence task move KAD-1 in_progress
```

`init` writes that guide into both `AGENTS.md` and `CLAUDE.md` — the first is the
cross-tool convention, the second is what Claude Code actually reads. Whatever a
human wrote in either is left alone. No MCP server to run, no token to issue, no
network call to make.

The contract is not a promise you have to take on trust:

```bash
kadence schema --json      # every command, every field, every error code
```

A failure carries `error.code` and, where the valid set is knowable, `allowed` —
which matters most for statuses, because they are configured per project and no
documentation can tell an agent what yours are.

There is no MCP wrapper, and one gets built only as an **optional package**, when
someone who cannot run a CLI asks for it: it costs about 700 tokens a session
over the CLI path — [we measured it](docs/research/probe-c-agent-cost.md), and it
is not the saving the industry benchmarks suggest — it would be a second way to
say the same thing, and it would not work for agents that have no MCP client at
all.

Ask for only what you need — a board of a thousand tasks is 855 KB in full,
275 KB with `--summary`, and 104 KB with the three fields an agent actually
reads:

```bash
kadence board --json --summary
kadence board --json --fields label,status,assignee
```

**And the part the code cannot hold — why:**

```bash
kadence decision add "Use ULIDs" --why "Clocks disagree between machines" \
  --rejected "Auto-increment: collides across branches" --task KAD-1
```

When a decision stops being true you supersede it rather than edit it, and that
is **one event** — the backward link is derived, so the two directions cannot
fall out of step. In a file-based tool it is two edits, and teams reliably make
one; that is how a reversed decision keeps looking authoritative.
`decision list` returns what is still in force, `--all` adds the history, and
`task show --json` carries the decisions made about that task.

Something learned that was never a choice is a note, not a decision — no `--why`,
no number, and `prime` shows the latest:

```bash
kadence note "The staging clock runs 40 s behind" --task KAD-1
```

Documents stay plain markdown — `kadence task doc add KAD-1 docs/design.md`
records only the link, which is the part git cannot express. If the file does
not exist it is created from a template; an existing one is never overwritten.

Bulk works everywhere and is all or nothing: `kadence task move KAD-1,KAD-2 done`
either moves both or changes nothing. A typo does not leave half a board.

---

## What it costs you

| | |
|---|---|
| Install | 76 KB packed — 233 KB of kadence, plus 1.8 MB of blessed |
| Startup | 65 ms |
| 10,000 events | 21 ms cold with a compacted archive, 12 ms warm — 199 ms cold if every event is still a separate file |
| Journal on disk | under 5 MB |
| One task, as an agent reads it | 982 bytes, or 304 with `--summary` — the same however long the task has been worked on |

These are tests. They fail the build on regression, which is why they are still
true.

---

## Honest status

**Verified.** The merge thesis, on real git branches. Performance and size, by
tests that fail if they regress. That the conflict problem exists in the wild —
measured, not assumed. 998 tests in the repository today, including an
end-to-end run through the installed binary.

**Not verified.** That teams and their AI agents actually lose enough context to want
this. The bet rests on reasoning and on the industry naming the problem out
loud — not on our own users. That research, Probe B, is
[designed](docs/research/interview-script.md) and not yet run: as of
2026-09-16, [zero conversations](docs/research/probe-b-results.md) and no
external users. [The strategy](docs/product/strategy.md) says what happens next
and on which dates.

**Not built, on purpose.** An MCP package — only if someone who cannot run a CLI
asks for it, not as an inevitability.

**In the repository, not yet released.** `report burndown`, `report velocity`,
`report workload`, `report --list` and `report <name> --html`. `npm install`
gives you 0.4.1 without them.

`kadence context <task>` was dropped: we measured what `task show --json` already
returns and it is the whole history of one piece of work, under a kilobyte,
constant.
The only thing left to add was a different format, and nobody has asked for one.

**Known limits.** Conflicts are real but rare: roughly one merge in two hundred.
Terminal interaction is covered by manual testing; only the key router is
unit-tested. Deleting several tasks by `KAD-N` in one loop removes the wrong
ones, because labels are derived and renumber as earlier tasks go — delete by
ULID, or one at a time. There is no `task ac remove`, so a board-wide Definition
of Done lands on every new task unless it is added with `--no-dod`.

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
the board cannot drift from the journal — nothing is maintained by hand. Two
branches writing at once produce two different files, and git merges them
without a conflict by construction.

Design decisions, each recording what was measured and what would make us
revisit it: [docs/decisions/](docs/decisions/).

## Contributing

```bash
npm install
npm test            # 998 tests; builds dist/cli.js first
npm run typecheck
npm run build       # one 111 KB bundle, blessed kept external (82 KB at 0.4.1)
```

`CLAUDE.md` documents the invariants, the boundaries, and the decisions that
look arbitrary without their reasoning. Read it before changing the core.

## Licence

MIT
