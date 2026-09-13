# Tech-lead feedback — the drift we prevent is not the drift they meant

- **Date:** 2026-09-11
- **Source:** an unsolicited chat conversation on 2026-09-10, 19:54–20:53, between the owner and a tech lead who had just been shown the npm page. Four substantive claims, one feature request, one mapping table.
- **Question:** which of those claims survive a check against our code and our decisions, and which of them change something.
- **Method:** every claim checked against `src/` and the existing documents, cited per line. Nothing here was measured. One attachment — a screenshot about permission modes — was not available; that mapping is transcribed from the message text only.
- **Status:** evidence, not a decision. Nothing in [the plan](../../tasks/plan-to-1.0.md) is reordered by this document, and the Probe B date does not move.
- **What this is not:** [Probe B](interview-script.md). n = 1, unstructured, the owner was in the conversation and some questions were leading, and the person has never run the tool.

Labels as elsewhere: **Fact** (in the code or stated by the source) · **Inference** (our reading) · **Assumption** (unevidenced, load-bearing).

## The honest paragraph first

The first outsider to react to our pitch without being asked agreed that the problem is real, categorised the product as "Jira, but in the repo", and then explained that the cause of drift is not where the state is kept. Not one of their four points is about merge conflicts, velocity or history — the three things we can prove. Two are about things an append-only journal cannot do by itself. One is a feature request that a label already answers. **The mechanism we are proud of was not what they argued with; the claim we make about it was.**

## Who said it, and what that is worth

**Fact.** A tech lead running a team with AI agents — firmly inside the "3–8 developers working with agents" segment from [positioning](../product/positioning.md) — read the npm page and responded in five minutes with: yes, drifting state is a real problem; is this Jira in the repo; and here is why storing it differently will not fix it.

**Inference.** This is the closest thing to segment evidence we have, and it is worth roughly one paragraph of an interview. It does not replace Probe B, and the 22 September decision date stands — for the third time a document says so ([reports discovery](reports-discovery-2026-09.md), [feature adoption](../product/feature-adoption-2026-09.md), [the plan](../../tasks/plan-to-1.0.md)).

**One kill criterion is half-touched.** [roadmap-to-1.0.md](../product/roadmap-to-1.0.md) lists "Probe B found no one who named context loss unprompted" among four conditions for calling the project finished. They named *drifting state* unprompted — «Та, дійсно є така проблема з дрифтуючим станом» — and then attributed it to attention, not to storage. **Fact:** the problem word lands. **Inference:** our mechanism does not follow from it in the reader's head, and the first category they reached for was the tracker category we spent a document escaping.

## Finding 1 — our drift claim is narrower than our wording

> «дрифтуючий стан виникає через те, що кожен на проєкті перестає дивитися за якоюсь частиною роботи, яка насправді важлива»
> *(drifting state happens because everyone stops watching some part of the work that actually matters)*

**Fact.** Two different things are being called drift.

| | What drifts | What append-only does about it |
|---|---|---|
| Ours | the recorded state vs. the events that produced it | removes it by construction — state is folded, never stored |
| Theirs | what is recorded vs. what is actually happening | **nothing.** Somebody still has to write the event |

**Fact.** Our wording does not make the distinction. [README.md:79](../../README.md) says "the board can never drift from reality", and [README.md:329](../../README.md) repeats it. The precise claim is that the board can never drift from *the journal*. A task nobody has touched for three weeks folds into a perfectly accurate board and a perfectly wrong picture.

**Inference.** This is a messaging defect, not a product defect, and it is the kind that costs a pilot: a tech lead who reads the strong sentence, adopts, and finds their real drift intact will conclude the tool over-promised rather than that they misread it.

**Proposed fix — wording only, no code.** Replace "drift from reality" with the claim we can defend: *the board cannot drift from the journal — every column is folded from events, not maintained by hand.* And say the limit out loud in the same place, as the README already does for `task delete`: a journal records what was written to it.

## Finding 2 — the bottleneck they name is attention, and we already decided not to push

> «є один ботлнек: скільки у тебе в голову влізе тих сигналів» … «Якщо ти хочеш контролювати якість — треба знати хто який AI юзає»
> *(there is one bottleneck: how many of those signals fit in your head)*

**Fact.** We have no notification layer, and its absence is a decision, not a gap: "Не будувати delegated/automated рівні. Вони потребують демона або хука … **Свідома межа, а не недогляд**" ([context-handoff-2026-09.md:113](context-handoff-2026-09.md)), repeated in [roadmap-to-1.0.md:187](../product/roadmap-to-1.0.md) and as "Nothing needs a process that outlives the command" in [feature-adoption-2026-09.md:20](../product/feature-adoption-2026-09.md).

**Fact.** What we surface instead is pull-based and already shipped: `ready` (what can start now), `prime` (the session preamble, capped at 40 lines), contested claims — kept visible precisely "because a human must look" ([ADR-011](../decisions/011-claims-as-events.md)) — aging WIP against p85 in `report flow`, and open blockers in `stats`.

**Inference — the actual gap.** Every one of those answers a question about work that is *moving*. `ready` lists what can start. `prime` lists what is yours. `report flow` measures what flowed. **Nothing answers "which work has nobody looking at it"**, which is exactly the question they raised. And the journal already holds the answer: a task in a started column with no event for N days, an open task with no assignee and no claim, a criterion added and never checked, a blocker whose blocking task closed. All derivable at fold time, all pull-based, none of them needs a process that outlives the command.

**Candidate, not a task.** Something like `report attention` or a section in `stats`. Deliberately not numbered and not scheduled: it would compete for the slot that slice D-2 (T95–T99) already holds, and the segment that would use it is the segment Probe B has not yet confirmed exists. **Assumption:** that a team would act on such a list rather than add it to the pile of things they already do not read — which is the same bottleneck one level up, and the source said so themselves.

## Finding 3 — the journal cannot say which model did the work

> «треба знати хто який AI юзає і покращувати на основі цієї інформації» … «Antigravity … зазвичай він на рівень нижче від Claude … Claude часто переборщує»
> *(you need to know who uses which AI and improve based on that)*

**Fact — what the journal knows today.** `actor` is always the git `user.email` ([src/core/git.ts:36](../../src/core/git.ts)); there is no override, and an agent and its human share one actor string. The only human/agent distinction is `source: 'human' | 'agent'`, set from `KADENCE_SOURCE` and never guessed ([src/core/event.ts:63](../../src/core/event.ts), [src/cli/commands/task.ts:163](../../src/cli/commands/task.ts)). [ADR-011](../decisions/011-claims-as-events.md) already separates "who ran the command" from "who it was done for" via `data.by`, "because an agent may claim on behalf of a person". **No model name appears anywhere in `src/` or `packages/`.**

**Fact — that is a decision.** [ADR-009](../decisions/009-the-agent-contract.md) writes one section into both `AGENTS.md` and `CLAUDE.md` and refuses per-vendor files; the roadmap sells the opposite of a model preference: "A second agent from a different vendor, on a different machine, sees the same history".

**Inference.** Their request and our design are not in conflict, because they are asking about two different layers. *Standardising the team on one agent* is a team practice; kadence neither runs models nor should care which one is installed. But *knowing which model produced which outcome* is a journal question, and it is the one thing in this conversation that only an event log could answer: reopen rate per agent, rework after `done`, time from `in_progress` to `reopened`. That is velocity's counterpart for quality, derived the same way — a consequence of the journal, not a new subsystem.

**Options, if it is ever wanted.**

| Option | Cost | Verdict |
|---|---|---|
| Do nothing | zero | **now** |
| Record an optional agent name in `data` alongside `source` (e.g. from an env var), unset by default | one field in `data`, no schema change, folds into existing reports | the shape to keep open |
| Widen `source` beyond `'human' \| 'agent'` | breaks the frozen `kadence/v1` contract; agents depend on it | no |

**Recommendation: not now, and record why.** Two reasons. It is the only item here that comes near `FlowEvent` and the `--json` contract — both "ask first" boundaries. And assumption #12 in [assumptions-map.md](assumptions-map.md), "Журнал не стане інструментом нагляду" (Ethics, Defer), moves out of Defer the moment per-model attribution exists: a team that can measure which model reopens tasks can measure which person does. **The honest framing:** this is a feature whose value and whose risk come from the same property.

## Finding 4 — impact belongs on a label, and it works today

> «У Kadence імпакт можна буде виставляти хіба що через лейбли … Для critical ми юзаємо plan, а потім manual … Bypass permissions ніколи»

**Fact — they are right, and it needs no code.** Labels exist as a flat `string[]` on a task, set with a repeatable `--label` and filtered case-insensitively with `task list --label impact-critical` ([src/cli/commands/task.ts:243](../../src/cli/commands/task.ts), [src/core/query.ts:68](../../src/core/query.ts)). There is **no** risk, impact or severity field anywhere in `src/`, and no plan for one.

**Fact — one trap.** `priority` already exists as a closed `low | normal | high | urgent` ([src/core/projection.ts:88](../../src/core/projection.ts)). It is a *different axis*: urgency, not blast radius. A team that adopts `impact-*` labels will have two four-valued scales with overlapping words, and nothing in the tool explains the difference. If the recipe is documented, it has to say which is which in the first line.

**Fact — the real gap is on the read side.** `ready --json` deliberately emits six fields — `label, title, priority, estimate, claimedBy, contestedBy` — "because this goes into an agent's context" ([src/cli/commands/ready.ts:25](../../src/cli/commands/ready.ts)), and `labels` is not among them. In the contract, `labels` is selectable via `--fields` but is **not** in the promised set ([src/agent/contract.ts:274](../../src/agent/contract.ts)). **So an agent asking "what can I start" cannot see the label that says how carefully to work.** That, not the labelling, is the missing piece.

**What kadence must not do.** Encode one vendor's permission modes in the core. [ADR-012](../decisions/012-network-only-in-packages.md) already set the precedent for this shape — the vendor-specific part lives in a package, the core stays ignorant — and `init` touches `.claude/settings.json` only with `--hooks` and only when asked, "because that file is the user's". kadence can record the intent; enforcement is the harness's job, and the tool cannot and should not verify that a mode was honoured.

**Cheapest complete answer.** A documented convention (four labels, one line saying how they differ from `priority`, the mode mapping as *their* recipe rather than our rule), plus two small read-side changes if pilots ask for it: `labels` in `ready --json`, and `labels` promoted to the promised contract set. **Assumption:** that a team sets the label once and an agent reads it — untested, and the thing to ask a pilot rather than to build first.

## What this changes

| Claim | Verdict | Action | Cost |
|---|---|---|---|
| Drift is an attention failure, not a storage one | **Correct, and our wording overstates ours** | Narrow the README claim to "cannot drift from the journal" and state the limit | wording |
| Signals need a filter; the bottleneck is human attention | **Correct; our answer is pull, not push, and it is deliberate** | Candidate: surface *unattended* work, not just moving work. Unnumbered, after Probe B | M, if ever |
| Quality control requires knowing which AI was used | **Answerable only by a journal — and not now** | Record the option and the ethics counterweight; no code | zero now |
| Impact via labels, mapped to permission modes | **Right, and available today** | Document the recipe; consider `labels` in `ready --json` | XS–S |

Nothing here is a gate, a milestone or a reordering. **The one thing that should happen regardless of Probe B is the README wording**, because it is the only item where we are currently claiming more than we can defend.

## What would make this reading wrong

- **They are one person who has never run the tool.** Every "correct" above is a correct-sounding argument, not a measurement. If Probe B's five conversations do not raise attention drift, Finding 2 is a clever idea with no customer.
- **If Probe B raises attention, not context loss**, then Finding 2 is not a report — it is the product, and the journal is the substrate under it. That is a larger change than anything in this table, and [positioning](../product/positioning.md) would need rewriting for the second time in a month.
- **If pilots set impact labels once and never look at them again**, Finding 4 stays a paragraph in the docs and never becomes a field.
- **If per-model quality turns out to be what a tech lead actually buys**, Finding 3 becomes the roadmap and vendor neutrality becomes a cost we are paying for a principle. The counter-evidence to watch for is the opposite of what we assume: teams standardising on one agent, the way the source proposed, which would make per-model comparison pointless.
- **The mapping table was transcribed from text alongside a screenshot we do not have.** If the screenshot carried different thresholds, Finding 4's recipe is wrong in the details while right in the shape.
