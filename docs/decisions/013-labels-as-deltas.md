# ADR-013: A label set moves as deltas, because a set is not a value

- **Date:** 2026-09-11
- **Status:** accepted
- **Scope:** `task.updated`, the label field, two new event types
- **Plan:** [T103](../../tasks/plan-to-1.0.md), Milestone 15 slice E
- **Found by:** the adversarial review of slice E, reproduced against the built binary before anything was written down

## Context

kadence claims one thing above all others, and the README says it in the section that justifies the whole design: two branches editing one task merge without a conflict, and **every intent is preserved**. An integration test has proved it since the first milestone, and Probe A measured the alternative — 8,396 merges, 15% of repositories hitting `CONFLICT (content)` in task files.

Labels were the counter-example, and nobody had looked.

`task edit --label` writes the whole array into a `task.updated` event, and the fold replaces the whole array when it reads one:

```ts
if (data['labels'] !== undefined) task.labels = readLabels(data['labels']);
```

Reproduced on the binary: a task labelled `area-auth`; branch `x` adds `impact-critical`; branch `y`, from the same base, adds `area-payments`; both merged into `main`.

```
MERGE OK, conflicts: 0
labels = ["area-payments"]
```

Two labels went in, one came out. Git is content: the two events are two files, and both are still there. The loss happens in the fold, silently, with nothing in the output to notice — no conflict, no warning, no contested-claim-style report. It is the only field in the product where "every intent preserved" is false.

It is worse than an ordinary bug, because the failure is *invisible and directional*. The feedback that produced this slice proposed labels as an agent's caution level — `impact-critical` mapped to the most careful permission mode. After a routine merge the label is simply absent, and the agent works on critical code in the permissive mode. A safety-shaped convention resting on the one lossy field we own, failing open, towards less care.

## Why it happened

Every other field on `task.updated` is a scalar: a title, a priority, a due date. For those, last-writer-wins is not a bug — there cannot be two titles, and the ULID decides which one holds (I2). Labels were given the same treatment because they sit in the same event, and a set behaves nothing like a scalar.

The intent behind `--label impact-critical` is not "the label set is now exactly this". It is "add this one". We stored the result instead of the change — which is, precisely, the failure mode the whole product exists to avoid. The README names it two sections earlier: state drifts, conflicts and forgets, which is why kadence stores events. Labels were state that had been smuggled into an event.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Keep replacement, report the loss at fold time | cheap; matches "conflicts are surfaced, never resolved by rejection" | surfaces a conflict that never had to exist, and leaves the data lost. A report that says "someone's label is gone" is not a merge that works |
| Union every label event at fold time | no new event types | a label could then never be removed: the union of all sets is monotonic, and an old event would resurrect a label someone deliberately took off |
| Vector clocks or causal ordering per field | technically exact | needs a clock in the event, which is a `FlowEvent` shape change, and a dependency-tracking layer for one field. The cost is out of all proportion |
| **Deltas: `task.label_added` and `task.label_removed`** | the merge is correct by construction, in both directions; no field is replaced, so nothing is lost; matches how claims, criteria and blockers already work | two new event types; a replacement edit becomes several events |

## Decision

**A label change is recorded as what changed, never as the resulting set.** Two new event types carry one label each:

- `task.label_added` — `data.label`
- `task.label_removed` — `data.label`

The fold applies them in ULID order: add appends if absent, remove filters. Two branches adding different labels both survive. A removal on one branch survives a merge with an unrelated addition on another. Merge order does not change the result, because addition and removal of *different* labels commute, and of the *same* label the ULID decides — which is I1 and I2 doing exactly what they already do everywhere else.

**`--label` keeps meaning "make the set exactly this", and is expressed as deltas.** The command reads the current set, emits a `task.label_removed` for each label dropped and a `task.label_added` for each one new, and emits nothing when nothing differs. Read-modify-write from two branches therefore still merges correctly: each branch records only its own difference.

**`--add-label` and `--remove-label` say the intent directly**, and are what an agent should use. Without them, adding one label means passing the whole set, which means reading it first — the read-modify-write pattern that produced this bug in the first place. The merge is now safe either way, but a single-label edit should not require knowing the other labels, and `task edit KAD-1 --label impact-critical` silently dropping the other two is a second, purely local way to lose data.

**`task.created` keeps carrying `labels`.** Creation is one event; there is no second writer to lose.

**The fold keeps reading `task.updated.labels`.** Journals written before today must fold to exactly what they folded yesterday — I6 says the snapshot is a cache that can be deleted, and that guarantee is worthless if replaying an old journal produces a different answer. Nothing writes that field any more; everything still reads it.

## Consequences

**A label edit is now several files instead of one.** Setting three labels at once writes three events. This is the same trade the product already makes everywhere: one event per change, and compaction folds a month into one file when the count starts to matter.

**The event vocabulary grows by two.** The contract's stability rule allows it — *additive only: fields and error codes may be added, never renamed or removed within `kadence/v1`* — and an older reader that does not know the two types ignores them, which degrades to the labels a task had before the change rather than to a wrong answer.

**"Every intent preserved" becomes true again**, and the integration test that proves it now covers the case that disproved it. The reproduction stays in the suite after the fix, per the rule that a bug fix keeps its failing test.

## What would make us revisit

- **If a team wants a label edit to be atomic** — "replace these three as one act, or none of them" — deltas cannot express that, and nothing here is a transaction. No one has asked; if someone does, the answer is probably still no, because atomicity across branches is what we refused to build when we refused a server.
- **If label churn makes journals noticeably larger.** Measured cost today is one small file per label change. If a team labels heavily enough for that to show up in cold start, the fix is compaction policy, not going back to replacement.
- **If the ordering rule ever surprises anyone in practice.** Adding and removing the *same* label on two branches resolves by ULID, which means the later writer wins and the earlier intent is visible only in the history. That is the same rule as every other field, and it is the one case here that is genuinely a choice rather than a derivation.
