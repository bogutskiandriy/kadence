# ADR-010: Decisions as events, documents as links

- **Date:** 2026-09-08
- **Status:** accepted
- **Scope:** event schema, CLI contract, agent interface

## Context

The journal records what happened. It does not record **why**, and the research
converged on that gap from three independent directions within two days:

1. A practitioner working with Claude Code and Codex arrived at the format
   `Decision: X. Why: Y. Rejected: Z.` and named the mechanism — what was done
   survives context compaction, why it was done does not, so the next agent
   re-proposes what was already rejected.
2. Context-engineering practice separates **structural** context (what the code
   does) from **semantic** (why it exists), and holds that without the second an
   agent is a pattern-matcher rather than a decision-maker.
3. Distributed-team practice names "decisions written down where they can be
   found" as the first of three conditions for cheap coordination. kadence
   already satisfied the other two — status visible without asking, and numbers
   derived rather than reported.

We are not first. `backlog decision` and `backlog doc` ship today; the ADR
ecosystem is `adr-tools` and a dozen rewrites, `log4brains`, MADR tooling, a
Backstage plugin. So the question was never whether to have decisions, but
whether our shape does something theirs cannot.

## Options considered

### How superseding works

| Option | Pros | Cons |
|---|---|---|
| Two events — `decision.recorded` then `decision.superseded` | reads literally | reintroduces the two-write problem inside our own model: the second event can be missing |
| **One event carrying `supersedes`, backward link derived while folding** | a single write; both directions cannot fall out of step | the backward link exists only after a fold — nothing to grep for in the files |
| Mutable status field on the decision | familiar from ADR files | edits the journal, which the whole architecture forbids |

### What `decision list` returns by default

| Option | Pros | Cons |
|---|---|---|
| Everything | nothing hidden | an agent quoting a reversed reason as current is worse than one with no memory |
| **Current only, `--all` for history** | the safe answer is the one you get without thinking | a caller who wants history must know the flag |

### Documents

| Option | Pros | Cons |
|---|---|---|
| `kadence doc` — create and store documents | matches the competitor feature-for-feature | git already versions files; the event model adds nothing to a document. A wrapper around `touch` |
| **Links only — a task or decision points at a path** | records the one thing git cannot express | a link can dangle when the file moves |
| Nothing | no new surface | measured cost: see below |

## Decision

**Superseding is one event.** `decision.recorded` carries `supersedes`; the
backward link `supersededBy` is derived while folding. In a file-based tool this
is two edits, and the sources are blunt about the result — most teams update one
side and forget the other, which is how a reversed decision keeps looking
authoritative. Here nobody writes the second half, so nobody forgets it.

**`decision list` returns current decisions.** History needs `--all`.

**`DEC-N` is derived during the fold**, from ULID order, exactly like `KAD-N`
(I7). `log4brains` deliberately dropped file numbering to avoid git merge
conflicts — a mature ADR tool paying for merge safety with readable identifiers.
We keep both, and an integration test proves two branches can each record a
decision and merge cleanly.

**Documents are linked, not stored.** `kadence task doc KAD-1 docs/design.md`
and `decision add --doc <path>` record a repository-relative path. There is no
`kadence doc` command.

[Probe D](../research/probe-d-docs-linkage.md) measured why the link is worth
having: across five real questions in this repository, grep finds the answering
document every time and buries it among 10–35 candidates — 1,321,537 bytes of
candidates against 38,701 of linked documents. The link saves the sifting, not
the search. And the stronger argument needs no numbers: grep requires knowing the
term, while a link arrives with the task.

A missing file is a **warning, not a refusal**: the document may arrive in a
later commit or live on another branch, and refusing would make the journal
depend on what happens to be checked out.

## Consequences

- **Positive:** the one property no file-based tool has — supersession that
  cannot half-apply — is now ours by construction rather than by discipline.
  Decisions travel with the branch, merge without conflict, and reach an agent
  through the same `--json` contract as everything else.
- **Cost:** two new event types (`decision.recorded`, `task.doc_linked`), four
  commands, one error code, and two fields on the task record. The ambient
  instruction section grew by one line, to 182 tokens.
- **Invisible by default, and that is a known trap.** Conflict-free merging was
  true and unnoticed until we printed a notice. So `decision show` announces a
  superseded record before its reasoning, and `decision add --supersedes` says
  that both links came from one event. Both are tested; both were found missing
  by running the commands by hand after a green suite.
- **What architecture does not fix:** ADRs died of ceremony, of having no
  operating model, and of having a single author. Writing the event through the
  same CLI that moves the work defends against the first. Nothing here defends
  against the other two, and no code will.
- **Revisit if:** Probe B shows teams have no workaround they already run for
  capturing why. That would mean we are selling discipline rather than a tool,
  and the right response is to remove this, not to promote it.
