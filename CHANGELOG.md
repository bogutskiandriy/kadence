# Changelog

## [0.4.0] — 2026-09-13

Planned as slices 0.4.0 through 0.4.4 and published as one minor release.

The agent loop: four commands that answer "what next" without folding the whole
board by hand. Everything here is additive within `kadence/v1` — no field or
command was renamed, and `--json` responses gain keys rather than losing them.

### Added

- **`kadence ready`** — open tasks with no live blockers, not claimed by anyone
  else, priority first and age second. `--json` returns five fields per task
  rather than the whole record, because this goes into an agent's context on
  every session. An empty result names the reason: how many are blocked, how
  many belong to someone else. Measured at 9 ms over 10,000 events.
- **`kadence prime`** — the session preamble: active sprint and days left, your
  claimed and in-progress work, how many tasks are ready, decisions in force by
  title, the last five notes, and four commands to go deeper. Held to 40 lines
  and 3 KB by a test; 16 lines and 493 bytes on this repository. It carries the
  part that changes and points at the part that does not, because the static
  half already lives in `AGENTS.md`.
- **`kadence init --hooks`** — adds a `SessionStart` hook running `kadence prime`
  to `.claude/settings.json`. Only with the flag: that file belongs to the user
  and is committed to their repository. The write is an upsert — hooks of other
  events, other matchers and other commands survive, running it twice leaves one
  hook, and a file that does not parse is reported rather than replaced.
- **`kadence task claim` / `task release`** — take a task, or give it back.
  `claim` with no argument takes the top of `ready`, which is one step instead
  of two. There is **no lock**, and the message says so: two machines can each
  claim before either pushes. See [ADR-011](docs/decisions/011-claims-as-events.md).
- **`kadence note "text" [--task KAD-1]`** and `note list` — something learned
  that was never a choice. Deliberately not a decision: no `--why`, no
  `supersedes`, no number. The help says when to reach for `decision add`
  instead. Notes show up in `task show` and in `prime`.
- **`claimedBy` and `contestedBy`** on the task record in `--json`, and a
  `Claimed:` line in `task show`.
- **TUI**: `R` shows only what can be started now, `C` claims the selected task
  or releases it if it is yours, and a card carries a claim mark — a separate
  colour when the claim is contested. Both actions call the same functions the
  CLI does.

### Changed

- **A contested claim is reported, not rejected.** When two people claim one
  task, the earliest by ULID holds and the later one is kept, with the task
  reading `contested` under both names. Rejecting the second would make the
  owner depend on which branch merged first — the same invariant that keeps
  dependency cycles and orphaned status columns alive rather than dropped. It is
  the first conflict in kadence that names people rather than values.
- **The state cache version moved from 2 to 4.** The projected shape changed
  twice: three claim fields on a task, then notes on the project state. Missing
  exactly this bump is what shipped as a bug in 0.3.1, so it is now pinned to
  the field lists by a test.
- The agent section written into `AGENTS.md` and `CLAUDE.md` grew by one line —
  `kadence prime` first — and by no more than that.

### Added — the branch, the human, and the evidence behind done (0.4.1)

- **`kadence task list --branch`** — the work this branch introduced, measured
  against `--base` (`main`, or `init.defaultBranch`). Membership is derived from
  git at read time and never stored: writing a branch name into an event would
  go stale the moment the branch is renamed or merged, and would make the same
  events fold differently depending on where they were written. A detached HEAD
  and an unknown base both fail by name rather than reporting no work.
  The measurement that justified the flag, including what would make it wrong,
  is in [branch-context-2026-09.md](docs/research/branch-context-2026-09.md).
- **Acceptance criteria** — `task ac add|check|uncheck|list`. The number is a
  position in the folded list, assigned like `KAD-N` and never stored, so two
  branches can each add a criterion and merge without renumbering. Moving a task
  to `done` with unchecked criteria **warns and proceeds**: the checklist is
  evidence, not a gate, and refusing would make the board lie about where the
  work is.
- **Definition of done** — `board config --dod "tests green,docs updated"`. The
  criteria are **copied** into each new task, never referenced, so raising the
  standard cannot reach back and change what finished work had promised.
  `task add --no-dod` skips them.
- **Milestones** — `milestone create|add|list|close`. Grouping by outcome, where
  an epic groups by structure and a sprint by time. Not a third hierarchy: a
  task carries at most one, as a field beside `sprint`. `MS-N` is derived from
  ULID order like every other label, and progress is counted in points, the same
  unit as velocity and burndown.
- **`kadence stats`** — counts by status and assignee, open blockers, contested
  claims, and the velocity of the last three closed sprints.
- **`kadence completion install`** — zsh, bash and fish, generated from one list
  rather than three hand-written scripts. Without a terminal it prints the
  script instead of writing, because that is how people pipe it into a file.
  For zsh it writes the file and prints the `fpath` line rather than editing a
  shell rc, which is the user's file.
- **`board --json --summary`** — the column state without `history` and
  `comments`. Those are the two fields that grow with how long a task has been
  worked on rather than with how many tasks there are.
- **TUI**: `b` shows only what the branch introduced, `M` filters to one
  milestone, and the card dialog carries the acceptance-criteria checklist with
  space to toggle. Every toggle calls the same command the CLI does.

### Changed

- `task list --json` and `board --json` gain a `milestone` field on each task,
  carrying the `MS-N` label. The response without `--summary` is otherwise
  unchanged; the contract only ever gains.
- The state cache version moved again with the projected shape.

### Added — reports, and the two things they needed first (0.4.3)

What the neighbours call reports is, here, a fold over timestamps the journal
already carries. The reasoning, the sources and the verdict per report are in
[reports-discovery-2026-09.md](docs/research/reports-discovery-2026-09.md).
Velocity and cycle time stay out of the headline; they are a consequence, served
to the person who asks.

- **`kadence report flow`** — the four flow metrics the Kanban Guide mandates,
  and what sits around them: work in progress, throughput per ISO week, cycle /
  lead / response time as **p50 / p85 / p95 in calendar days**, aging work
  against the p85, created versus resolved, and days spent blocked. There is no
  mean anywhere, on purpose. Every response names the window and the column
  work counts as started from, so a number is never quoted without its terms.
  Empty sections say why they are empty.
- **`kadence report cfd`** — tasks per column at the end of every day of the
  window. A move backwards subtracts. The first version re-walked each task's
  history per day and cost 150 ms on 10,000 events; it is a single pass now, at
  4 ms.
- **`kadence board config --started <status>`** — the column cycle time and a
  sprint's actual hours are measured from. It was the literal `in_progress` in
  three places while columns were configurable, so a board named
  `todo,doing,review,done` closed every sprint with `actualHours: null` and
  never said why. It is a folded setting now, validated against the live
  columns, and a column change that strands it warns instead of going quiet.
- **`kadence compact`** — folds months older than `--keep-months` into one
  archive file each. The primitive existed since 0.1 and was reachable only from
  tests. `--dry-run` says what would move and writes nothing. It touches no git
  state, and it says the one thing worth knowing: an archived month is a single
  file, so compact on one branch and merge before compacting on another.

### Added — three experiments (0.4.2)

Each of these was a standing "no". Each is now tried in the shape that survives
the three constraints, and each has a kill condition written before the code, in
[feature-adoption-2026-09.md](docs/product/feature-adoption-2026-09.md).

- **`kadence board export --html`** — the board, the sprint, the burndown,
  milestones and decisions in force, as **one self-contained file**. No script
  tag, no stylesheet link, no font, no image: the page asks the network for
  nothing and opens from disk. That is what makes it an experiment in place of a
  web UI rather than a web UI with extra steps. A test asserts the absence, not
  the appearance. Acceptance criteria are printed in full rather than counted,
  because a file attached to a pull request is evidence and "2/3" is not.
- **`kadence board export --md`**, and `--readme` to update the section between
  markers in an existing README. It will not create one — that would be a
  different command and a bigger promise.
- **`@kadence/github`** — a separate package that publishes tasks to GitHub
  Issues **in one direction**, by shelling out to `gh`. The core is unchanged
  and still opens no socket; the credential stays with a tool the user already
  trusts. A marker in the issue body makes a second publish an edit rather than
  a duplicate, and the issue itself says that edits made there are overwritten.
  Nothing is ever read back. See
  [ADR-012](docs/decisions/012-network-only-in-packages.md), written before the
  code. Every test runs against a recorded `gh`, never the real one.
- **`kadence task doc add KAD-1 docs/design.md`** — creates the file from a
  four-line template and records the link in one call. It never overwrites: a
  file that is already there is the document, and replacing it with a template
  would destroy the thing being linked.

### Added — attention signals, and labels that survive a merge (0.4.4)

- **`kadence report attention`** — work the board presents as active while
  nobody is moving it. Four signals, one definition: `stalled` (no event for N
  days), `unowned` (in flight for N days with no assignee and no claim),
  `stale_claim` (a claim older than N days with no move since), and
  `dead_blocker` (`blockedBy` pointing at a finished task — the one signal that
  waits for no threshold). `--since` is the days of silence, default 7. No new
  event type, no new field: the report is a fold over what the journal already
  holds, and it costs 0.5 ms over 10,000 events on top of the fold.

  Two candidates were left out on purpose and the module says why. "Open task
  with no owner" is the definition of a backlog. "Criteria added and never
  checked" would fire on every task in any repository that configured a
  Definition of Done, because `task add` copies it in unchecked — loudest in
  the repositories that took our advice.
- **`prime` carries an attention line** — up to three tasks, and only when
  there is something to say.
- **`task.label_added` / `task.label_removed`** — labels move as deltas. This
  was the one field where "every intent is preserved" was untrue: `task.updated`
  carried the whole array and the fold replaced the whole array, so two branches
  adding different labels merged without a conflict and one label vanished with
  no warning. Not a merge failure — a fold storing *state* in an event, the
  exact mistake the product exists to avoid. Reasoning in
  [ADR-013](docs/decisions/013-labels-as-deltas.md).
- **`labels` in `ready --json`**, the seventh field, and in the guaranteed set.

Source for this slice: a tech lead's feedback of 2026-09-10 — drift comes not
from where state lives but from work that stops being watched. Append-only
removes the drift between board and journal; it promises nothing about the
drift between journal and reality. The README now says so.

### Fixed before release

- **`compact` could destroy an archive it had already written.** A branch that
  compacts a month, merges, and then delivers one more event for that month
  gets a fresh month directory beside the archive — `append` files an event by
  its own timestamp. The second compaction replaced the archive with the
  directory's contents alone. Reproduced: three events became one, silently, in
  a journal whose one promise is that nothing is lost. Archives are merged by
  id now, and the dry run counts only what is not archived yet. The primitive
  had been this way since 0.1; this release is what made it reachable.
- **A reopened task stayed `done` on the cumulative flow chart** and was not
  counted as work in progress, because `task.reopened` moves a task without a
  `task.moved`. Both now follow it.
- **A finished task went on accruing blocked days.** Work that is over is not
  blocked, whatever its blocker is doing.
- **A started boundary that is not one of the columns inflated work in progress**
  instead of emptying the report — the default state of every board that renames
  `in_progress`, and the opposite of what `board config` warns.
- **`--started` was dropped when given with `--statuses` or `--dod`**, which is
  the natural first command on a custom board. It travels in the same event now,
  validated against the list being set.
- **The sprint report and `report flow` disagreed about what counts as started.**
  A task that skipped the started column had a cycle time in one and no actual
  hours in the other. One definition serves both.
- **A deferred `task.reopened` read the boundary as of the end of the fold**
  rather than as of its own position in ULID order. Resolved the way claims and
  criteria already are.
- `--started done` was accepted, `--since 007` became 7 before the parser saw
  it, `--keep-months abc` reported "NaN", and nothing said the dates are UTC.
- **The "cold start" performance figure was a warm one.** The perf test removed
  the state cache once, then took the best of three runs — the first run built
  the cache and the next two read it, so "11 ms cold" was a 12 ms warm read.
  Measured with the cache removed before every run: **199 ms cold when every
  event is a separate file, 21 ms cold with a compacted archive.** The first of
  those is the budget itself, with no room. The test now removes the cache per
  iteration, the README carries the honest numbers, and the finding feeds the
  reports work: compaction exists in the core but is not yet a command anyone
  can run.
- **Two commands could write outside the repository.** `task doc add` and
  `board export --file` both described containment in a comment and did not
  enforce it: `../pwned.md` created a file in the parent directory, and the doc
  link went into the append-only journal as a path meaningless on any other
  machine. Both now resolve and verify before anything is written.
- **A task title containing the board end marker corrupted README.md**, and the
  corruption grew by one copy on every export. The marker is now neutralised
  where text enters, and the end marker is searched for after the begin marker
  rather than from the top of the file.
- **A failed `gh issue list` read as "no issue exists"**, so a rate limit
  created a duplicate and reported success. The lookup is now a value rather
  than an absence, and runs once for the batch instead of once per task.
- **A batch that failed halfway said nothing about what was already
  published**, and the JSON path discarded the partial record entirely. Both now
  name it.
- **`@kadence/github` was never typechecked or built in CI** — nothing imports
  its entry point, so the root config never saw it. That is why two of the bugs
  above survived to review. CI now gates the package, and greps the core bundle
  for network imports.
- Decisions and milestones vanished from an export of a board with no tasks yet.
- A `|` in a configured status broke the Markdown table.
- **Three event types were dropped instead of held pending.**
  `milestone.task_added`, `milestone.closed` and `task.criterion_checked` were
  handled as they arrived, so an event carrying a lower ULID than the entity it
  names vanished — no `pending`, no `rejected`, no trace. Reachable for the same
  reason claims are: clocks disagree between machines, so an assignment written
  on a lagging clock sorts before the `task.created` it refers to. Milestone
  events now go through the same defer path every task event uses, and criterion
  checked-state is folded from the task's history, where the order is ULID order.
- **`completion install` could overwrite a file it did not write.** Every
  generated script now carries a marker; a file without it is left alone and the
  command says what is there, with `--force` for the deliberate case. Both target
  directories are shared — a distribution package writes into the bash one.
- **The `milestone` field could carry a raw ULID** when the milestone was created
  on a branch that has not merged. The contract promises `MS-N`; it is now `MS-N`
  or `null`.
- `--branch` on a detached HEAD returned `invalid_argument` and exit 2. The flag
  was understood; the repository state is what refuses, so it is
  `conflicting_state` and exit 1.
- `--summary` omitted `contestedBy`, so a contested task read as a cleanly owned
  one in the response large boards are steered towards.
- Acceptance criteria were reachable only through `task show`, which made
  "which tasks have unchecked criteria" cost one call per task. `criteria` and
  `openCriteria` are now on every task record.

### Notes

The plan set a target of 80 KB for `--summary` on a 1000-task board, taken from
Probe C. **That target was wrong, and the measurement says so:** a full board of
1000 tasks is 855 KB, `--summary` is 275 KB, and even the narrowest useful set
of three fields is 104 KB. Task titles are irreducible — 1000 of them do not fit
in 80 KB. The property the flag actually exists for is a different one and it
holds: a summary record costs the same whether the task carries one event or
five hundred, while the full record grows past fifty times the size. That is
what the test pins.

### Notes

The bundle grew from 35 KB to 71 KB across 0.4. The export templates sit in the
fast path rather than behind a dynamic import, and that was measured rather than
assumed: reading the whole bundle costs under a millisecond, and every
non-interactive command still runs in about 100 ms against a 200 ms budget. The
lazy-import rule exists for `blessed`, a heavy third-party dependency that reads
terminfo at runtime — not for 16 KB of our own strings. `blessed` is still absent
from `dist/cli.js`.

At release the build prints an 82 KB bundle, `npm pack` a 76 KB tarball with
233 KB unpacked, and `--version` returns in 60–70 ms on this machine; `blessed`
is still absent from `dist/cli.js`.

Claim state is folded from each task's own history rather than as events
arrive. It has to be: an event about a task whose `task.created` has not merged
is replayed after the main loop, so a claim carrying a lower ULID could be
applied last and hand the task to the wrong person. Reachable rather than
theoretical, because clocks disagree between machines.

The TUI additions were exercised by hand by the owner on 2026-09-13 before the
tag, as CLAUDE.md requires: four TUI bugs have shipped past a green suite in
this project, so a green suite alone is not evidence there.

## [0.3.2] — 2026-09-09

Nothing in the package changed. `src/`, `scripts/`, `package.json` and the
lockfile are identical to 0.3.1 — the diff across all four is empty — so the code
you get is the code you already have, and there is no behavioural reason to take
this one.

What changed is the pipeline that produces it. From here on the tarball is built
in a job that does not execute dependency install scripts and that pins every
action it runs to a commit rather than a tag.

### Security

- **Dependency lifecycle scripts no longer run in CI or on release.** `npm ci`
  passes `--ignore-scripts` in both workflows. A postinstall runs with the full
  rights of the job, which is the primary npm supply-chain vector. Exactly one
  dependency here declares one — esbuild — and in 0.28 the platform binary
  arrives through optionalDependencies, so the script has nothing left to do.
  Measured rather than assumed: clean install, 35 KB bundle, full suite green on
  Node 20 and 22.
- **Both workflows pin `actions/checkout` and `actions/setup-node` to commit
  SHAs**, with the version in a trailing comment. A tag is mutable: `@v4` is
  whatever its owner last moved it to, and it runs with the job's permissions.

Publishing is unaffected: `--ignore-scripts` governs installing dependencies, not
this package's own lifecycle, so `prepublishOnly` still gates every release on
typecheck, tests and build.

## [0.3.1] — 2026-09-08

A patch, and the reason to take it is the fix: anyone already on 0.3.0 has a
state cache that can serve records folded by the previous build. The added field
is additive within `kadence/v1`, which the contract permits at any version.

### Added

- `decision list` and `decision show` now report **who wrote the record** —
  `source: "human" | "agent"`, from `KADENCE_SOURCE` at the time of writing.
  kadence has always refused to guess this when writing an event; that refusal
  only means something if the source survives to the point of reading. Human
  output marks only agent-written records, because labelling every human one in
  a repository written mostly by people hides the exception.

### Fixed

- **The state cache could serve a shape folded by an older version of kadence.**
  `.kadence/state.json` carries a version, and it was not bumped when a projected
  record gained a field — so after an upgrade the cache kept returning records
  without the new field, and any consumer branching on it saw `undefined`.
  Invariant I6 says deleting the cache changes nothing, which is true; what bites
  is *keeping* it. The version is now pinned to the projected shape by a test, so
  adding a field without invalidating the cache fails the build.

  Found by using the product on itself: three decisions recorded minutes earlier
  refused to show their source.

## [0.3.0] — 2026-09-08

The journal held what happened. It now holds **why** — and the reasoning cannot
quietly go stale, because superseding a decision is one event rather than two
edits somebody has to remember to make. Reasoning in
[ADR-010](docs/decisions/010-decisions-as-events.md).

### Added

- **`kadence decision`** — why a choice was made, as an event next to the work.
  `decision add "Use ULIDs" --why "Clocks disagree between machines" --rejected
  "Auto-increment: collides across branches"`. `--why` is required; without it
  the record is a changelog line.

  Superseding is **one event**, not two edits. `--supersedes DEC-1` writes a
  single record and the backward link is derived while folding, so the two
  directions cannot fall out of step — the failure that makes a reversed
  decision keep looking authoritative in file-based tools. `decision list`
  returns what is still in force; `--all` adds the history.

  Numbers are derived, so two branches can each record a decision and merge
  without a conflict or a renumber. Both are covered by integration tests on
  real git branches.

- **Documents linked to work** — `kadence task doc KAD-1 docs/design.md`, and
  `--doc` on a decision. kadence does not store the document: it stays plain
  markdown and git keeps versioning it. What git cannot say is that this file
  explains this task, and that is the only thing recorded. A missing file is a
  warning, not a refusal — it may arrive in a later commit.

  Measured before building ([Probe D](docs/research/probe-d-docs-linkage.md)):
  across five real questions, grep finds the answering document every time and
  buries it among 10–35 candidates. The link saves the sifting, not the search.

- `task show --json` now carries `decisions` and `docs`; both are always arrays,
  so an agent never has to branch on their absence.

  A decision that supersedes another **inherits the task** it was about, unless
  you name a different one. Without that, superseding quietly stripped a task of
  its reasoning — the old decision dropped out of `task show` and the
  replacement had never been attached. Found by installing the package and using
  it, with 538 tests green.


- The files `init` writes into your repository now say what produced them:
  `<!-- generated by kadence X.Y.Z — refresh with `kadence init` -->`. A context
  file with no marker rots silently — a year on, nobody knows whether the
  section is current or what put it there, and we write into other people's
  repositories. Deliberately no date: it would rewrite the file on every new day
  and fill diffs with noise, while the version changes exactly when the content
  might have.

## [0.2.2] — 2026-09-08

Two promises from 0.2.1 that the code did not keep, found by reading the
published package rather than the source.

### Fixed

- **Most `--json` failures carried no `error.code`.** ADR-009 says every failure
  has one; thirty-seven paths returned a bare sentence — most of `sprint`, all of
  `template`, `board config`, and every "unknown action". An agent could tell
  that something failed and nothing else. The existing tests compared the
  published code list against the constant, so they could not see that the
  commands were not using it; a new test now provokes twenty-seven real failures
  and requires a code from the list on each.
- **`unknown_status` hinted at a command that does not exist.** It named
  `kadence board statuses --json`; following it produced a second failure, which
  itself had no code. The hint is now `kadence board config --json`, which
  already returns the configured columns, and every hint the CLI can emit is
  executed by a test that requires it to succeed.
- **`cac` was a runtime dependency that nothing loaded.** esbuild bundles it, so
  the only external import in the published output is `blessed` — every install
  downloaded 52 KB for nothing. Moved to `devDependencies`, with a test that
  compares what the manifest declares against what the build actually imports.
  This is the same shape as the 0.1.4 self-dependency bug.

### Added

- Two error codes, additive within `kadence/v1`: `template_not_found`, and
  `conflicting_state` for arguments that are understood but refused by the
  current state — a closed sprint, one already started, one still open at close.
- `received` and `allowed` on the failures where they are knowable, including
  the action lists behind "unknown action".

### Changed

- The README's cost table said "29 KB, one runtime dependency". That is the
  entry file. The published package is 37 KB packed, and an install puts 128 KB
  of kadence and 1.8 MB of blessed on disk; the table now says so.

## [0.2.1] — 2026-09-08

> Numbered 0.2.1 because 0.2.0 cannot be published under this name: a different
> package called `kadence` used that version on 2026-02-05, before this one
> claimed the name, and npm never allows a version number to be reused. Nothing
> was released as 0.2.0 — this is the first release of the 0.2 line.

The agent contract, made real. `schema: "kadence/v1"` used to be a version
string that nothing checked; now the contract is published, the failures are
machine-readable, and the responses can be narrowed to what an agent actually
reads. Reasoning in [ADR-009](docs/decisions/009-the-agent-contract.md),
measurements in [Probe C](docs/research/probe-c-agent-cost.md).

### Added

- `kadence schema --json` — the machine-readable contract behind
  `schema: "kadence/v1"`: every command, the fields you can rely on, and every
  error code. It works outside a repository, because an agent asks what the tool
  does before it has a project to ask about.
- Failed `--json` calls now carry `error.code` from a closed list, plus
  `received`, `allowed` and `hint` where each is knowable. `allowed` matters
  most for statuses: they are configured per project, so an agent cannot learn
  the valid set from documentation. There is deliberately no `retryable` field —
  with no network and no lock, the same input always fails the same way.
- `--fields` on `board --json` and `task list --json`, so an agent can ask for
  the columns it reads instead of every description. On a 200-task board that is
  130,799 bytes down to 11,015. An unknown name fails with `unknown_field` and
  the list of what exists.

### Changed

- **`init` now writes the kadence section into `CLAUDE.md` as well as
  `AGENTS.md`.** Claude Code does not read `AGENTS.md`, so a repository carrying
  only the latter was invisible to the largest agent audience — the README's
  promise that "the AI agent finds it on its own" was not true for them. Text a
  human wrote in either file is left untouched, and a repeat `init` does not
  duplicate the section. If you do not want the file, delete it; nothing else
  depends on it.

### Fixed

- **Any `--json` response larger than the pipe buffer was truncated
  mid-string.** `process.exit()` does not wait for an asynchronous write to
  drain, and writing to a pipe — how every agent reads us — is asynchronous,
  while writing to a file is not. A 200-task board produced 131,072 bytes and a
  parse error; the same command redirected to a file was valid. Output is now
  written synchronously.

### Note on the roadmap

`kadence context <task>` will not be built. `task show --json` already returns
the whole history of one piece of work in 948 bytes, and that number does not
grow with the project — the only thing left to add was a format nobody has
asked for.

## [0.1.5] — 2026-09-03

### Changed

- README rewritten to lead with the number the product exists for — what a
  story point actually costs — instead of a feature list. Claims now carry
  their evidence inline: the merge thesis links to the 8,396-commit study and
  to the integration test that proves it, and the performance table says these
  are tests that fail the build.
- Repository URLs follow the rename to `bogutskiandriy/kadence`.

## [0.1.4] — 2026-09-03

### Fixed

- The package depended on itself. `kadence@^0.1.1` sat in `dependencies`, so
  every install pulled a second, older copy of the tool into `node_modules`
  and shipped it to users. Removed; the published tarball is now 32.7 kB with
  eight files in it.
- `@types/blessed` moved to `devDependencies`. Type definitions are not needed
  at runtime, and every install was paying for them.

### Repository

- Developer tooling (`.claude/`, `.serena/`) is no longer committed: 381 files
  and 3.8 MB of it, against 94 files of actual product. What belongs in git and
  what does not is written down in
  [ADR-007](docs/decisions/007-what-goes-into-git.md), and `.gitignore` now
  also covers `.env`, coverage output and editor leftovers.

## [0.1.3] — 2026-09-03

### Testing

- End-to-end coverage through the real binary: a full sprint from `init` to
  `sprint close` with velocity computed from actual events, every reachable
  command checked for a clean exit, three branches editing one task, an agent
  driving the tool with JSON alone, and the events folder vanishing on a
  branch switch. 390 tests.

## [0.1.2] — 2026-09-03

### Documentation

- The README opened with `npx kadence init` and said nothing more, so the
  obvious next step — `kadence board` — failed with "command not found". `npx`
  fetches a package for one command and leaves nothing installed. Global
  install is now the first instruction, with the npx path shown as the
  alternative it is.

## [0.1.1] — 2026-09-03

### Fixed

- `kadence --version` reported `0.1.0-dev` while the published package was
  `0.1.0`. The CLI carried its own copy of the version string; it is now
  injected from package.json at build time, with a test that fails if the two
  ever diverge again.

## [0.1.0] — 2026-09-03

First release. Tasks, sprints and velocity as plain files inside a git
repository, with no server, account or network.

### Core

- Append-only event journal: one file per event, never rewritten. Two branches
  editing the same task merge without a conflict — verified on real git
  branches, not only in theory.
- State folded from the journal on every read, so the board cannot drift from
  reality. A snapshot cache makes that cost 7 ms on 10,000 events.
- ULID identifiers, so event order is a property of the id rather than of how
  far apart machine clocks have drifted.

### Tasks

- Title, description, type (task/bug/story/epic), priority, labels, assignee,
  due date, estimate, comments, logged time.
- Subtasks and blocking dependencies, with cycle detection that **reports** a
  loop instead of rejecting the later edit — rejecting it would make the state
  depend on merge order.
- Search across titles, descriptions and comments; filters, sorting, and bulk
  operations that apply all-or-nothing.
- Templates for repeated task shapes.

### Sprints

- Plan the next sprint while the current one runs.
- Velocity and hours-per-point derived from events, so the numbers cannot be
  forgotten or faked.
- Burndown reconstructed from the journal for any day — including days before
  the feature existed.

### Board

- `kadence board` — plain columns for pipes and scripts.
- `kadence ui` — interactive kanban: keyboard, mouse, drag between columns, and
  every field editable in place. Loads lazily, so `kadence task add` never pays
  for it.
- Custom columns per team; `done` cannot be removed because every analytic is
  computed from it.

### For agents

- `--json` on every command with a stable `schema: "kadence/v1"`.
- stdout carries JSON only; warnings go to stderr.
- `init` writes a guide the agent finds on its own.

### Known limits

- The velocity bet is not yet validated with users. See README, Honest status.
- Terminal interaction is covered by manual testing; only the key router is
  unit-tested.
