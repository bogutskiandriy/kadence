# ADR-012: The network lives in a package, never in the core

- **Date:** 2026-09-10
- **Status:** accepted
- **Scope:** package layout, the offline constraint, the GitHub experiment
- **Plan:** [T89](../../tasks/plan-to-1.0.md), Milestone 15 slice C
- **Adoption rationale:** [feature-adoption-2026-09.md](../product/feature-adoption-2026-09.md), the second of three experiments

## Context

kadence has three constraints: no server, no account, no network. They are the
reason the tool works on a plane and the reason nothing it does can be
discontinued by us. Two-way sync with GitHub Issues was refused because it
breaks the third and turns the product into a bridge — a bridge is judged by
whether both ends stay in step, and ours never could.

The owner asked for the "no" to become an experiment. So the question is not
whether to sync, but whether there is a shape that gives a user the one thing
they actually asked for — an issue their colleagues can see — without the core
learning what a network is.

Two facts make that shape possible. The `gh` CLI already holds the user's
GitHub credentials, so we never handle a token. And publishing is one
direction: what goes out is derived from the journal, and nothing comes back.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Two-way sync in the core | what people ask for by name | needs the network in the core, needs conflict resolution between two systems that disagree about identity, and makes every offline session a queue to reconcile |
| One-way publish in the core | one direction only | the core would still make requests, and "kadence is offline" would stop being true |
| **One-way publish in a separate package that shells out to `gh`** | the core is unchanged and still makes no request; the credential stays with a tool the user already trusts; installing nothing means having nothing | a second package to version; `gh` must be installed |
| A GitHub Action | no local network | runs on their infrastructure, on a schedule we do not control, and needs a token in their repository |

## Decision

**The network exists only in `@kadence/github`, and only through `gh`.** The
package spawns `gh issue create` and `gh issue edit`. It opens no socket of its
own, holds no token, and reads no credential file. If `gh` is missing the
command says so and stops.

**The core does not depend on the package.** The dependency runs one way: the
package reads `kadence board --json`, the way any other consumer would. Nothing
in `src/` imports it, and `kadence` installed alone still makes no request.
The test that proves this is a grep over the built bundle, the same technique
that keeps blessed out of the fast path.

**Publishing is one direction, and the help says so.** An issue body carries a
marker — `<!-- kadence:KAD-1 -->` — which makes a second publish an edit rather
than a duplicate. Nothing is ever read back into the journal. A person who
edits the issue on GitHub has edited the issue, not the task, and the next
publish will overwrite their text. That is stated in the command's own output,
because a tool that quietly discards someone's writing is worse than one that
refuses to.

**The marker is the identity, and it is a label, not a ULID.** `KAD-1` can
change when branches merge (I7), so the marker is written from the label at
publish time and the mapping is recovered by searching issue bodies. A stale
marker produces a second issue rather than editing the wrong one — the failure
we chose, because the alternative is editing someone else's issue.

## Consequences

- The three constraints survive intact for anyone who does not install the
  package. For anyone who does, exactly one command reaches the network, and it
  is the one they typed.
- `@kadence/github` versions separately. It can break against a `gh` change
  without touching the tracker.
- We are not a bridge. Nobody can ask us why their GitHub edit did not come
  back, because the answer is written on the command that sent it.

## What would make us revisit

- **A pilot asks for the reverse direction.** The answer stays no, and the
  package stays one-way — that is the kill condition already written in
  [feature-adoption-2026-09.md](../product/feature-adoption-2026-09.md). If it
  is asked for repeatedly, the honest conclusion is that these users want an
  issue tracker rather than a journal, which is a finding about the segment,
  not a feature request.
- **`gh` stops being the way people talk to GitHub.** Then the package needs a
  different back end, and the argument for keeping the credential out of our
  hands has to be made again from scratch.
- **Somebody ships a second network package.** One is an experiment; two is a
  direction, and it deserves its own decision rather than inheriting this one.
