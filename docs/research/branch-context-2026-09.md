# Branch context — is `--branch` `--search` under another name?

- **Date:** 2026-09-09
- **Reason:** [T55](../../tasks/plan-to-1.0.md) is a gate placed before the code. `task list --branch` was proposed to answer "what is this branch about"; the open question in the plan was whether an existing filter already answers it, in which case the flag is a second name for something we ship.
- **Status:** **hypothesis holds — the flag earns its place.** T56 proceeds.
- **Method:** [Probe C](probe-c-agent-cost.md) and [Probe D](probe-d-docs-linkage.md) — cheap, local, no users.

## What "belongs to a branch" means

A task belongs to a branch when **its events arrived on that branch**, relative to a base:

```
git log <base>..HEAD --name-only --pretty=format: -- .kadence/events
```

Each line is one event file, named by its ULID. A task is on the branch if it was
created there, or if any event about it was. Nothing new is stored: branch
membership is derived from git at read time, which is the only place it exists.

## Why a text search cannot express it

Two reasons, and the first is structural rather than a matter of degree.

**No event carries a branch.** Branch membership is a property of which commits
introduced a file, and that lives in git's history, not in the journal. There is
no field for `--search` to match. Adding one would mean writing the branch name
into events — which then goes stale the moment the branch is renamed, merged or
deleted, and would make the same events fold differently depending on where they
were written. That is precisely what invariant I1 forbids.

**The two questions differ.** `--search auth` returns tasks that *mention* auth,
from every branch, including ones merged a year ago. `--branch` returns the work
*this branch introduced*, whatever it is about. Neither is a filter over the
other's result.

So the remaining question is not whether the flag is distinguishable but whether
it is worth the code: does it actually narrow the answer?

## The measurement

Board sizes are taken from [Probe A](probe-a-results.md)'s 244 repositories, so
the shapes are real rather than convenient: median 23 task files, p75 61, p90
130. Each synthetic repository carries descriptions, comments and status moves
at the density a real one has. The branch adds two to five tasks and touches one
to three existing ones — a normal feature branch.

`full` is what `task list --json` returns today. `branch` is the same response
filtered to the branch's tasks, which is exactly what the flag would return.

| Board (Probe A) | Tasks on branch | `board --json` | `full` | `branch` | Narrowing | git call |
|---:|---:|---:|---:|---:|---:|---:|
| 6 (p25) | 3 | 7 052 B | 6 987 B | 2 210 B | **3.2×** | 10 ms |
| 23 (median) | 5 | 23 681 B | 23 616 B | 3 782 B | **6.2×** | 10 ms |
| 61 (p75) | 7 | 60 688 B | 60 623 B | 5 516 B | **11×** | 9 ms |
| 130 (p90) | 8 | 127 001 B | 126 936 B | 6 108 B | **20.8×** | 9 ms |

The threshold written into T55 before the measurement was **2×**. The smallest
board in the sample clears it, and the narrowing grows with the board because
the branch does not: a feature branch touches roughly the same handful of tasks
whether the board holds six tasks or six hundred.

The git call costs about 10 ms and does not grow across this range. It fits the
200 ms budget with room, but it is a subprocess and so belongs behind the flag
rather than in every read.

## On this repository

Four tasks, 45 events, `board --json` at 7 962 bytes. The recent commits touch
no events at all, so the branch answer here would be empty.

That is worth stating plainly rather than leaving out: **kadence's own
repository is below the size where this flag helps.** It dogfoods `decision`,
not the board. The measurement above is what justifies the work, and it comes
from other people's repositories, not ours.

## What would make this wrong

- **Branches in the segment turn out to be long-lived and broad** — a branch
  that touches half the board narrows nothing. Probe A measured task files and
  merges, not branch breadth, so this is assumed rather than known. Worth one
  question in [Probe B](interview-script.md).
- **The base guess is usually wrong.** The flag defaults to `main`, falling back
  to `init.defaultBranch`. A team on a trunk with another name, or one that
  branches from a release line, gets an answer that is technically correct and
  practically useless. `--base` exists for that, and if it turns out to be
  needed every time, the default is what is wrong.
- **Nobody asks the question.** The flag answers "what is this branch about",
  which is a review question. If the pilots review on GitHub and never at a
  terminal, the honest place for this answer is the static export, not a flag.
