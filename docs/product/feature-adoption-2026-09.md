# Feature adoption — what we take from the neighbours, and how

- **Date:** 2026-09-09
- **Decision this records:** the owner's answers of 2026-09-09 on which competitor features kadence adopts, with one rule: *if it adds no value to this product, no; if it adds any, take it and rebuild it our way.* And: **everything goes into 0.4, now**, before Probe B. And: the three standing "no"s become experiments.
- **Method:** the surfaces of Beads, Backlog.md and Spec Kit read from their READMEs and CLI references on 2026-09-09; each candidate judged on value to *our* users (the three doors in the [discovery verdict](../research/discovery-verdict-2026-09.md) §6), on effort, and on whether it survives no server, no account, no network.
- **Plan:** [tasks/plan-to-1.0.md](../../tasks/plan-to-1.0.md), Milestone 15.

## The honest paragraph first

[roadmap.md](roadmap.md) says Now is one item, Probe B, because every feature raises the bet without testing it. This document overrides that for the second time in two days; the first time is recorded in the roadmap under "Shipped through the gate". The owner decided; the reasoning is that the features below are what the neighbours' users already use daily, so the bet they raise is smaller than a new idea's would be. That is a fair argument and it is still an argument, not a measurement. Probe B's date does not move: **2026-09-22, five conversations booked or the reason written down.** Building and talking are not the same hours.

Size, honestly: fourteen tasks, S to M, at the owner's stated 4–8 hours a week beside GTM. That is a quarter, not a sprint. The plan orders them so that any prefix is shippable.

## What "our way" means

Every adopted feature passes through the same four filters, and each is the reason the feature is not a copy:

1. **It is events.** A claim, a criterion, a milestone are `*.something` events in `.kadence/events/`, folded on read. Nothing is edited in place; nothing is stored that can be derived (I6, I7).
2. **Conflicts are surfaced, never resolved by rejection.** Two claims on one task from two branches both stay in the journal; the fold names a winner by ULID and reports the other. Rejecting the later one would make state depend on merge order (I1).
3. **Nothing needs a process that outlives the command.** No daemon, no lock file across machines, no server. Where the neighbours use a lock we use the merge.
4. **Short for the agent, visible for the human.** Anything that goes into an agent's context is length-tested; anything the agent can do is reachable from the TUI (the two-surfaces rule).

## The verdicts

### For the agent — from Beads

| Feature | Their way | Value for us | Our way | Effort | Verdict |
|---|---|---|---|---|---|
| **`ready`** | `bd ready --json`: unblocked, prioritised work. Their most used command | **High.** We already fold `blockedBy` and `priority`; agents ask "what next" every session and we make them compute it from `board --json` | `kadence ready [--json] [--assignee me]`: open tasks with no live blockers, not claimed by someone else, sorted by priority then age; `--json` is a narrow list (label, title, priority, points) | XS | **Take** |
| **`prime`** + session hook | `bd prime`: workflow context at session start; `bd setup claude` installs hooks | **High.** Directly the "fetch on demand, keep the static part short" rule ETH Zurich supports. The `init` section stays ≤ 25 lines; `prime` carries the live part | `kadence prime`: ≤ 40 lines — active sprint and days left, my claimed and in-progress tasks, `ready` count, decisions in force (titles only), the four commands to go deeper. Length under test. `init --hooks` writes a `SessionStart` hook into `.claude/settings.json` **only when asked**, because that file is the user's | S | **Take** |
| **Claim** | `bd update --claim`: atomic claim for parallel agents, via the database | **Medium-high** for door 2 and 3 (server-side agents, several vendors). Backlog.md's users asked for exactly this and proposed CAS over git refs | `task claim KAD-1` / `task release KAD-1` → `task.claimed` / `task.released` events. Fold: the earliest live claim by ULID holds; a later claim by another actor is kept and the task shows **contested** with both names. `ready` excludes tasks claimed by others. No lock: two machines can both claim before pushing, and the merge is where that becomes visible — we say so in the message rather than pretend the race cannot happen | M · ADR | **Take** |
| **`remember`** | `bd remember "insight"`: free-form project memory | **Low, not zero.** Overlaps `decision`, which already holds "why". What is missing is a place for an insight that is not a decision — "tests need a git identity", "the redirect drops the cookie" | `kadence note "text" [--task KAD-1]` → `note.recorded`. Shown by `prime` (last five) and in `task show`. Explicitly *not* a decision: no `--why`, no `supersedes`, no number. If Probe B shows notes replacing decisions, we merge them | S | **Take, small** |

### For the human — from Backlog.md

| Feature | Their way | Value for us | Our way | Effort | Verdict |
|---|---|---|---|---|---|
| **Acceptance criteria + Definition of Done** | `--ac`, check/uncheck; DoD defaults in config, applied to new tasks | **High.** The agent's most useful checklist and the human's most readable proof of done. Today `done` is a status with no evidence behind it | `task ac add KAD-1 "text"` / `task ac check KAD-1 2` / `uncheck` → `task.criterion_added` / `_checked` / `_unchecked`. `board config --dod "tests green,docs updated"` → `board.configured` with defaults copied into each new task as criteria. `task move KAD-1 done` with unchecked criteria **warns and proceeds** — surfaced, not rejected — and the board marks the task. TUI: checklist in the card, space toggles | M | **Take** |
| **Milestones** | Group tasks toward a target with a progress bar | **Medium.** Epics group by structure, sprints by time; a milestone groups by *outcome* ("1.0", "launch"). This repository would use it today | `milestone create "1.0" [--due]` / `milestone add KAD-1 --milestone 1.0` / `milestone list` → events; progress = done points over total; TUI filter `M`. Not a third hierarchy: a task has at most one milestone, and it is a field like `sprint` | M | **Take** |
| **Board export to Markdown** | `backlog board export --readme` | Medium; a PM who reads GitHub, not a terminal | Folded into the static export below | — | **Take, via export** |
| **Overview + shell completion** | `backlog overview`; `completion install` | Low each, together noticeable | `kadence stats` (counts by status and assignee, open blockers, contested claims, velocity of the last three sprints); `kadence completion install` for zsh, bash, fish | S | **Take** |
| Drafts, task notes/plan sections, per-feature ID prefixes | | Low; drafts are `backlog`; sections are the description; prefixes fight I7 | — | — | **No** |

### The three standing "no"s — now experiments

The owner said: say yes to all three and try. Each is tried in the shape that survives our constraints; each has a kill condition written before the code.

| Was "no" | Why it was "no" | The experiment | Kill condition |
|---|---|---|---|
| **Web UI** | Needs a server; a third surface for one developer | **A static export, not a server.** `kadence board export --html` writes one self-contained HTML file: the board, the sprint, burndown, decisions in force — a snapshot anyone opens in a browser or attaches to a PR. `--md` writes the Markdown version for a README. No process, no port, no network. If the human's browser view can be a file, the "no server" line holds and the human gets the view | Nobody opens the file twice. Measured by asking the pilots |
| **Sync with GitHub Issues** | Two-way sync makes us a bridge and needs the network | **One-way publish, in a separate package.** `@kadence/github` runs `gh issue create/edit` for tasks you name; a marker in the issue body makes it idempotent; **it never reads back.** The core stays offline; the network belongs to `gh`, which the user already trusts. Ships only after the core features above | A pilot asks for the reverse direction. Then the answer is still no, and the package stays one-way |
| **Storing documents** | Git already stores files; we link ([Probe D](../research/probe-d-docs-linkage.md)) | **Create-and-link, not store.** `task doc add KAD-1 docs/design.md` creates the file from a small template *and* records the link in one command. The file is ordinary Markdown in git; the only thing kadence keeps is the link, as before | The command saves nobody a step. Then it is deleted and `task doc` stays |

## What this does not change

- The three constraints. Network exists only inside `@kadence/github`, which shells out to `gh`; the core makes no request.
- The contract. Every new field and event type is additive within `kadence/v1`; `schema --json` lists them; nothing is renamed.
- The invariants. Claims and criteria fold deterministically; contested claims are the new example of "surfaced, not rejected".
- The 200 ms budget. `ready`, `prime` and `stats` are folds over the same journal and get their own perf cases.

## What would make this wrong

- **Probe B says the segment is solo developers after all.** Then claims and milestones were built for a team that is not there. Cost: two M tasks.
- **Notes eat decisions.** If `note` becomes the default and `decision` withers, the "why" layer we are known for goes quiet. Watch the ratio in this repository first.
- **The static HTML becomes a product.** If pilots want it live, the pressure to add a server returns. The kill condition is written so we notice.
