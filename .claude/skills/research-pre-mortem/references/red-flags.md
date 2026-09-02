# Red Flags: Pre-Mortem

> Common ways this skill's output goes wrong — concrete examples, why they're bad, and how to fix them. Pair with the SKILL.md and Troubleshooting table.

## How to use this document

When you have just facilitated a pre-mortem or classified risks, scan the red flags below before sharing the output. Each red flag shows the *bad* and *good* version, anchored in Klein's prospective hindsight method and the Tiger/Paper Tiger/Elephant classification.

---

## Red Flag 1: Treating Paper Tigers as Tigers (Mitigation Theater)

**Symptom.** Risk list classifies "AWS could go down on launch day" as a Tiger and assigns 3 engineers to build redundancy. AWS has 99.99% SLA; the probability is negligible.

**Why it's bad.** Klein's framework explicitly separates Tigers (real, evidenced, plausible failure scenarios) from Paper Tigers (sound scary, lack evidence). Mitigating Paper Tigers burns capacity that should go to Tigers and Elephants. The result is "we mitigated everything" — but the actual launch fails on an unmitigated Tiger.

**Bad example:**
> "Tigers: (1) AWS regional outage on launch day. Mitigation: build multi-region redundancy ($50K, 2 engineers, 6 weeks)."

**Good example:**
> "Paper Tiger: AWS regional outage. Evidence: 99.99% SLA, no recent incidents in our region. Probability x impact below threshold for mitigation. Action: standard runbook, no extra investment."

**How to catch it.** For each "Tiger", what is the *evidence* of plausibility? If only the consequence is described (without evidence of likelihood), it may be a Paper Tiger.

---

## Red Flag 2: Groupthink on Risks (Everyone Names the Same Three)

**Symptom.** 8 people in pre-mortem; output lists 4 risks, all of which the senior person mentioned first. Real risks held by the team go unspoken.

**Why it's bad.** Klein's whole insight is that prospective hindsight surfaces risks that ordinary planning misses. Groupthink defeats this — risks become a recitation of the senior's worries instead of a genuine surfacing exercise. The fix is silent individual generation before any group discussion.

**Bad example:**
> Pre-mortem opens with the VP saying "I'm worried about scalability." 90% of subsequent risks named are scalability-related.

**Good example:**
> Pre-mortem opens with 10 minutes of silent individual writing: 'Imagine it's 14 days post-launch and the product failed. Write 5 things that went wrong, in detail.' Then round-robin sharing. Output: 22 distinct risks across 5 categories — only one of which is scalability."

**How to catch it.** Was there silent individual generation before group discussion? If discussion started open, groupthink corrupted output.

---

## Red Flag 3: Vague Risks ("Things Could Go Wrong")

**Symptom.** Risk list has items like "stakeholder issues", "scope creep", "technical risk." No specifics.

**Why it's bad.** Vague risks cannot be mitigated. "Stakeholder issues" could mean a hundred different scenarios, each with a different mitigation. Klein insists on *specific, concrete failure scenarios* — "the CRO will block the launch because we did not include the enterprise SKU."

**Bad example:**
> "Risk: Stakeholder alignment problems."

**Good example:**
> "Risk (Tiger): The CRO will block launch on Day -7 because the enterprise SKU was de-prioritized in scope. Evidence: CRO said in Q3 review 'enterprise must be in launch.' Mitigation: meet with CRO Day -21 to align scope; if not aligned by Day -14, escalate to CEO. Owner: PM."

**How to catch it.** For each risk, can you describe the *specific scenario* in 1-2 sentences? If not, the risk is vague.

---

## Red Flag 4: Elephants Treated as Tigers (Over-Mitigating Large Acceptable Risks)

**Symptom.** Risk "we may need to add a second sales engineer to support enterprise customers" is classified as a Tiger and triggers urgent staffing action.

**Why it's bad.** Elephants are large, expected risks that the business has chosen to accept. Treating them as Tigers wastes pre-launch focus. The right response to an Elephant is acknowledge, plan for, and continue — not mitigate as if it were a launch-blocker.

**Bad example:**
> "Tiger: 'We may need another sales engineer next quarter.' Mitigation: emergency hire."

**Good example:**
> "Elephant: Enterprise traction will require 1-2 additional sales engineers in Q3. This is large but expected; we have budget. Plan: open req now, hire by Q3 start. Not a launch-blocker."

**How to catch it.** Is the risk *unexpected* and *plausible*, or *large and expected*? If the latter, it is an Elephant.

---

## Red Flag 5: Pre-Mortem Held Too Late to Matter

**Symptom.** Pre-mortem held 1 week before launch. Surfaces a Tiger that requires 4 weeks of work to mitigate. The team launches anyway.

**Why it's bad.** Pre-mortems are valuable when there is still time to act. Held too late, they become theater — risks surfaced cannot be mitigated, and the team launches into known failure. Klein recommends pre-mortems *at the planning stage*, not the launch stage.

**Bad example:**
> Pre-mortem on Day -7. Tiger surfaces: 'Onboarding flow has not been usability-tested with non-technical users.' Cannot fix in 7 days. Launch proceeds.

**Good example:**
> Pre-mortem at project kickoff (Day -90). Tigers surface; mitigations planned. Second pre-mortem at Day -30 to re-check. Final launch checklist at Day -7 confirms Tigers have been addressed."

**How to catch it.** Can the surfaced risks actually be mitigated in the time remaining? If not, the pre-mortem was too late.

---

## Red Flag 6: No Owner per Risk (Diffuse Accountability)

**Symptom.** Risk list has 12 items. Mitigations are sketched. No name attached. "The team will handle it."

**Why it's bad.** Diffuse ownership = no ownership. The risks that are not assigned drift; week 4 of the project, they are still listed as "the team will handle" with no progress. Klein's framework requires explicit ownership of each Tiger.

**Bad example:**
> "Risk 1: Stakeholder alignment. Mitigation: hold meetings. Owner: team."

**Good example:**
> "Risk 1 (Tiger): CRO will block launch over enterprise scope. Owner: Sarah (PM). Mitigation: 1:1 with CRO by Day -21. Check-in: Day -14. Escalation path: if unresolved, escalate to CEO by Day -10."

**How to catch it.** Does every Tiger have a single named owner with a deadline? If multiple owners or no owner, the risk will drift.

---

## Red Flag 7: Failing to Update the Risk List

**Symptom.** Pre-mortem produces a risk list. The list lives in a doc, never updated. By Day -14, the team has discovered new risks not in the doc, and several listed risks are no longer relevant.

**Why it's bad.** Risk lists decay. A snapshot from Day -90 does not reflect Day -30 reality. Klein's prospective hindsight is most useful when run iteratively, with the list as a living tracker.

**Bad example:**
> Risk doc from Day -90. Not opened since.

**Good example:**
> Risk tracker updated weekly. Closed risks marked. New risks added as discovered. Status report each Friday: top 3 unmitigated Tigers + owners + ETAs. Visible to leadership."

**How to catch it.** When was the risk list last updated? Over 2 weeks = stale.

---

## Red Flag 8: Mitigation That Costs More Than the Risk

**Symptom.** Tiger with $50K expected impact. Mitigation costs $200K and 3 engineering months. Net result is negative.

**Why it's bad.** Mitigation must be proportionate. Spending more on mitigation than the risk's expected cost (impact x probability) is risk-aversion overcorrection. Klein's framework implicitly requires cost-benefit reasoning.

**Bad example:**
> Tiger: 'API rate limit could spike at launch.' Expected cost if it happens: 4 hours customer impact (~$2K). Mitigation: rebuild infrastructure with full elastic scaling ($150K, 2 engineering months)."

**Good example:**
> Tiger: 'API rate limit could spike at launch.' Expected cost: ~$2K. Mitigation: pre-launch load test + automated alerting + scale-up playbook on-call ($5K, 1 engineering week). Proportionate."

**How to catch it.** For each mitigation, is the cost less than (impact x probability)? If not, you are over-mitigating.

---

## Red Flag 9: Pre-Mortem as Solo PM Exercise

**Symptom.** PM lists risks alone in a doc. Workshop is not held; cross-functional input not gathered.

**Why it's bad.** Risks live in different parts of the org. Engineers know feasibility risks; designers know usability risks; support knows operational risks; sales knows market risks. A solo PM pre-mortem captures only PM-visible risks — typically the smallest set.

**Bad example:**
> PM solo doc: 8 risks listed.

**Good example:**
> Pre-mortem workshop with PM, design, engineering, support, sales, security. 22 risks surfaced from 8 different angles. Engineer caught a feasibility Tiger that PM had marked as a non-issue. Security caught an Ethical risk not previously considered."

**How to catch it.** Who was in the pre-mortem? If PM solo, the risk surface is incomplete.

---

## Red Flag 10: Pre-Mortem Without "What Would We Do?" (Mitigation Plans Missing)

**Symptom.** Risks identified, classified, ranked. No mitigation plans written. Team congratulates itself on a good pre-mortem and moves on.

**Why it's bad.** Identifying risks without planning responses is half the job. The mitigation plan is what turns awareness into reduced risk. Klein's process explicitly requires action commitments for each Tiger.

**Bad example:**
> "Tigers: 1. CRO blocking. 2. Enterprise SKU incomplete. 3. Onboarding untested. End of doc."

**Good example:**
> "Tiger 1: CRO blocking. Mitigation: scope alignment meeting Day -21, owner PM, escalation path CEO. Tiger 2: Enterprise SKU. Mitigation: split into MVP enterprise feature (in scope) + advanced (Q+1), owner EM. Tiger 3: Onboarding untested. Mitigation: 5-user usability test by Day -45, owner UX."

**How to catch it.** Every Tiger has a written mitigation plan? If not, awareness without action.

---

## Red Flag 11: Confusing Risk with Worry (Emotional, Not Evidence-Based)

**Symptom.** Risk list contains items the team feels worried about ("the design feels weak") but no concrete failure scenario.

**Why it's bad.** Worries are not risks. Worries are emotional signals worth investigating but cannot be assessed without translation into a concrete failure scenario. A pre-mortem of worries produces emotional alignment, not risk reduction.

**Bad example:**
> "Risk: The design feels weak."

**Good example:**
> "Worry: The design feels weak. Translated to risk: 'Users may not understand the value proposition from the landing page; signup conversion below 3% threshold.' Test: 5-user moderated test before launch. If conversion concern persists, classify as Tiger."

**How to catch it.** For each "risk", is there a concrete failure scenario with measurable consequence? If only feelings, translate or drop.

---

## Red Flag 12: No Post-Launch Verification (Did the Tigers Actually Bite?)

**Symptom.** Launched 6 weeks ago. No retrospective on which risks materialized vs which did not.

**Why it's bad.** Pre-mortem skill compounds with practice. Without post-launch verification, the team never learns which of their risks were real (Tigers) vs imagined (Paper Tigers). Next pre-mortem repeats the same misclassifications.

**Bad example:**
> Pre-mortem done. Launch done. No follow-up.

**Good example:**
> Post-launch retro at Day +30 includes a 'risk verification' section. Of the 7 classified Tigers, 4 materialized as predicted (mitigations worked or didn't); 3 did not materialize (re-classify as Paper Tigers for future). Of the 5 Paper Tigers, 1 actually materialized (we missed it). Learning: pattern X risks deserve more weight."

**How to catch it.** Was there a risk verification step in the launch retro? If not, the pre-mortem skill is not compounding.

---

## Red Flag Quick Reference

| # | Anti-pattern | One-line check |
|---|---|---|
| 1 | Paper Tigers Mitigated | Each Tiger has evidence of plausibility? |
| 2 | Groupthink | Silent individual generation before discussion? |
| 3 | Vague Risks | Concrete scenario in 1-2 sentences per risk? |
| 4 | Elephants Over-Mitigated | Distinguished from Tigers (expected vs unexpected)? |
| 5 | Pre-Mortem Too Late | Risks mitigatable in time remaining? |
| 6 | No Owner per Risk | Each Tiger has named owner + deadline? |
| 7 | List Not Updated | Last update under 2 weeks? |
| 8 | Mitigation Costs More Than Risk | Mitigation cost < (impact x probability)? |
| 9 | Solo PM Pre-Mortem | Cross-functional workshop, not solo? |
| 10 | No Mitigation Plans | Every Tiger has written mitigation? |
| 11 | Worries Mistaken for Risks | Each risk has concrete failure scenario? |
| 12 | No Post-Launch Verification | Did Tigers actually bite? Reviewed in retro? |

## Related Reading

- SKILL.md Troubleshooting section (for symptom -> root cause -> resolution)
- references/klein-prospective-hindsight.md (if present)
- identify-assumptions/references/red-flags.md (for upstream assumption mapping)
- delivery-manager/references/red-flags.md (for adjacent incident/risk patterns)
