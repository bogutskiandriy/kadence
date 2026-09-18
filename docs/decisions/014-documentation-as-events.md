# ADR-014: Documentation lives in the journal, not in files beside it

- **Date:** 2026-09-18
- **Status:** accepted. **Supersedes** the "Documents are linked, not stored" part of [ADR-010](010-decisions-as-events.md). Decisions, and `task doc` for files that already exist, are unchanged
- **Scope:** event schema (two additive types), CLI contract (`kadence doc`), agent interface
- **Evidence:** [repo-docs-hypothesis-2026-09.md](../research/repo-docs-hypothesis-2026-09.md) · [Probe D](../research/probe-d-docs-linkage.md)

## Context

ADR-010 declined `kadence doc` on the grounds that git already versions files and
the event model adds nothing to a document. The owner reopened it on 2026-09-18
with two requirements, not a feature list:

1. **Documentation is not a note.** A note records a moment and never changes. A
   document is the current account of something, such as a module, a contract or a
   process. It is revised, and the reader wants the latest version.
2. **It must be quick and easy for an agent to read, and it must not be `.md`
   files.** Files beside the journal break the concept: they are a second store
   with no identity, no author per revision, and no way to reach an agent except
   by search.

Our own journal backs the second point. The repository holds 70 Markdown
documents and **zero** `task.doc_linked` events. The author built the link and
never used it, because a link to a file is one more step than writing the file.
The outside evidence cuts the other way: the only controlled study found that
more repository context raises agent cost by over 20% with no general gain,
while short, specific, current text helps. So the shape has to make documents
**small, current and targeted**, not merely stored.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Keep ADR-010: files plus links | nothing new | measured unused, 0 of 70; an agent reaches a file only by search or by a link nobody writes |
| Documents as `.md` files kadence creates and indexes | familiar to people | the second store the owner ruled out; a git merge of one file is a text conflict, which is our competitors' failure |
| A connector to Confluence or Notion | where some teams already write | network, credentials, and a bridge that cannot stay in step (ADR-012). Declined by the owner |
| **Documents as events: `doc.written` revisions and `doc.linked`** | one store, one contract; per-revision author and source; reaches an agent through `task show` and `prime` with no search term; merges like every other event | a body inside JSON; people need a way to write it other than an editor on a file |

## Decision

**A document is an entity in the journal. `DOC-N` is derived from ULID order
while folding, like `KAD-N` and `DEC-N` (I7).**

**`doc.written` is one full revision:** `title`, `body`, `parents`. Each revision
names the revisions it was written on top of. A head is a revision that no other
revision names as a parent. One head is the current text. **Two heads mean two
people revised the same version on different branches.** The fold keeps both.
The higher ULID is shown as current (I2), the other is reported as a conflict,
and nothing is lost. The next `doc edit` names every head as its parent, which
resolves the conflict. We do not reject the later write and we do not merge text
automatically: both would make the result depend on merge order (I1).

**The body is stored as an array of lines**, the same way a task description is
stored (ADR-002's exception), so changing one paragraph shows up as one changed
line in `git diff`.

**`doc.linked` attaches a document to a task.** Links are additive and are
cleaned up when the task is deleted, following the rule notes and decisions use.

**Reading is shaped for an agent.** `doc list --json` carries no bodies.
`task show --json` gains `documentation[]` with label, title, bytes and
`updatedAt`, and no bodies. `prime` names the documentation linked to the work
you claimed. `doc show DOC-N --json` returns one body. A body past 16 KiB is
written, but with a warning: agents read long documents worse, and splitting is
the author's call, not ours.

**`task doc` stays.** It links files that already exist, and removing it would
break the `--json` contract. New writing goes to `kadence doc`.

## Consequences

- **Readable by older versions, but not safe to compact with them.** An older
  kadence skips `doc.*` events as written by a newer version, and the layout of
  `.kadence/` does not change. **But `compact` in 0.5.0 and earlier deletes
  those events:** it archives what it can parse and then removes the whole month
  directory. This was found in review and reproduced against 0.5.0's own code.
  From this change on, `compact` leaves alone any month that holds an event it
  cannot read. So: this fix ships in the same release as `doc.*`, the release
  notes tell teams that everyone must update before anyone runs `compact`, and
  `git status` shows deleted event files if someone didn't.
- **A conflict is settled only by writing text.** `doc edit` without `--body`,
  `--file` or `--stdin` is refused on a conflicted document. Otherwise it would
  keep whichever version ULID order happened to show, and nobody would have read
  the other one.
- **Known limits of the fold.** Parents are not checked against the document
  they belong to, and a revision that arrives without its parent (a cherry-pick)
  makes the grandparent look like a second head. Both are deterministic (I1).
  The CLI cannot produce the first, and the second shows up as a conflict that
  someone settles by writing text. That is the safe direction.
- Documents grow the journal, and every command folds it. The 200 ms budget has
  to be re-measured with documents present, and a 64 KiB body has to survive
  `--json` through a pipe (the Probe C truncation bug).
- **People have no editor yet.** The first slice writes from `--body`, `--file` or
  stdin. `$EDITOR` is a separate task, because it is terminal-boundary code and
  gets verified by hand.
- **The value is still a hypothesis.** The feature makes documentation cheap to
  reach. It does not prove anyone writes it. Probe B (P1) and Probe E's
  documentation arm (P2) are the tests, and the verdict goes into Oct 19.

## What would make us revisit

- **Documents stay unwritten.** If documentation written through `kadence doc`
  in this repository by Oct 19 is fewer than 5 documents, the concept was sound
  and the need was not. The commands stay; nothing more is built on them.
- **Conflicted heads are common.** If they show up in pilots more than once a
  month, whole-body revisions are the wrong granularity and sections become
  their own entities.
- **Somebody asks for rendering, search or spaces.** That is a wiki, and the
  answer is a different product. See the rejected options above.
