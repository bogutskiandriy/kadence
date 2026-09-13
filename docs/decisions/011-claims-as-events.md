# ADR-011: Claims as events, contested rather than locked

- **Date:** 2026-09-09
- **Status:** accepted
- **Scope:** event schema, projection, CLI contract, TUI
- **Plan:** [T82](../../tasks/plan-to-1.0.md), Milestone 15 slice A
- **Adoption rationale:** [feature-adoption-2026-09.md](../product/feature-adoption-2026-09.md)

## Context

Two agents on one repository take the same task. Beads solves this with
`bd update --claim`, an atomic claim through its SQLite database. Backlog.md
does not solve it, and its users asked for it directly — the proposal in that
thread was compare-and-swap over git refs, which is a lock by another name.

We have neither a database nor a process that outlives the command. Whatever we
write, two machines can each write it before either pushes. A lock we cannot
enforce is worse than no lock: it teaches people to trust a guarantee that is
not there.

What we do have is the property the whole tool is built on. Every claim is one
file named by a ULID, so two claims from two branches merge without a conflict,
and both survive to be read.

## Options considered

### How a claim is stored

| Option | Pros | Cons |
|---|---|---|
| Mutable `claimedBy` field | one place to read | edits the journal, which the architecture forbids |
| A lock file in `.kadence/` | familiar | not versioned, not shared, and a crashed process leaves it behind forever |
| A git ref with compare-and-swap | genuinely atomic per remote | needs the network, which the core does not have; and it is atomic only for machines that have already fetched |
| **`task.claimed` / `task.released` events** | merges like everything else; a claim has a ULID, an actor and a time | two claims can coexist, and we must say what that means |

### What happens when two claims coexist

| Option | Pros | Cons |
|---|---|---|
| Later claim wins | matches "last write wins" intuition | "later" means later by ULID, not by wall clock; the loser's work vanishes silently |
| Later claim rejected on merge | one claim always | state would depend on merge order, breaking I1 — the same events in a different order would give a different owner |
| **Earliest live claim by ULID holds; the other is kept and the task reads `contested`** | deterministic in any merge order; neither person's work disappears from the record | a second concept for the human to learn |

## Decision

**A claim is two event types.** `task.claimed` carries `data.by` — the actor
who claimed it, which is not always `actor`, because an agent may claim on
behalf of a person. `task.released` carries nothing. Neither is ever edited.

**The earliest live claim by ULID holds.** This is the same rule
`sprint.closed` already uses: the first writer by ULID wins, deterministically,
whatever order the files are read in (I1, I2).

**A later claim by a different actor is not rejected.** It is kept, and the task
reports `contested` with both names. This is the third instance of the line the
product already holds twice — a dependency cycle is reported, not refused; an
orphan status is shown, not dropped. Refusing the second claim would make the
owner of a task depend on which branch merged first.

**A release or a move to `done` clears the claim.** Both are the honest end of
the work. A release by someone who does not hold the claim clears nothing and
says so; it is not an error, because on a task that was already released it is
simply true.

**No lock, and the message says so.** `task claim` prints one line stating that
another machine may have claimed the same task before your push, and that the
merge is where that becomes visible. Promising exclusivity we cannot deliver is
the same lie as promising erasure in an append-only journal.

**`kadence ready` excludes tasks claimed by someone else, and includes
contested ones.** A contested task needs a human to look at it, so hiding it
would be the one case where the surfacing does no good.

## Consequences

- `Task` gains three projected fields: `claimedBy`, `claimedAt`, `contestedBy`.
  The state cache version moves with them — the 0.3.1 bug was exactly this
  field-without-a-bump, and the test that pins the shape now covers these.
- `--json` gains `claimedBy` and `contestedBy` on the task record. Additive
  within `kadence/v1`, as ADR-009 requires; nothing is renamed.
- A contested claim is the first conflict that names two **people** rather than
  two values. The wording matters more than the mechanism: it reports, and does
  not assign blame.

## What would make us revisit

- **Probe B says the segment is solo developers.** Then claims were built for a
  team that is not there, and the cost was one M task. The kill condition is
  written in [feature-adoption-2026-09.md](../product/feature-adoption-2026-09.md).
- **Contested claims turn out to be common rather than rare.** Probe A measured
  conflicts in task files at one merge in two hundred; if claims collide far
  more often than that, the honest answer is a coordination feature, not a
  louder warning.
- **Someone ships a lock that survives our constraints.** If a claim can be made
  exclusive without a server, an account or the network, this decision is worth
  reopening. We do not know of one.
