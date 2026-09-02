# Red Flags: Outcome Roadmap

> Common ways this skill's output goes wrong — concrete examples, why they're bad, and how to fix them.

## How to use this document

Scan the transformed roadmap before sharing with stakeholders. Each red flag shows the *bad* version next to the *good* version, anchored to the Now/Next/Later commitment-level framework and the "so what?" technique.

---

## Red Flag 1: Outcome-themed but output-driven

**Symptom.** Each roadmap item has the "Enable [X] to [Y] so that [Z]" template at the top. Underneath is a feature list with dates. The team operates against the feature list; the outcome statement is decorative.

**Why it's bad.** The roadmap looks outcome-driven to executives but engineering treats it as a feature backlog with extra prose. The outcome statements add overhead without changing decisions. Worst, stakeholders think the team is outcome-driven when it isn't.

**Bad example:**
> "Now: 'Enable users to find products faster, so conversion improves.' Underneath: 'Ship advanced search by July 15. Ship filter dropdown by July 22. Ship saved searches by July 29.' Team meetings focus on the dates; conversion is never measured."

**Good example:**
> "Now: 'Enable power users to find relevant products in under 5 seconds, so conversion rate increases by 20%.'
> Success metrics: Search-to-purchase conversion 12% → 15%; avg search time 18s → 5s.
> Working hypothesis: ship Elasticsearch upgrade + relevance tuning (NOT a fixed feature list); measure conversion after 2 weeks; if not moving, change tactic.
> Standup question: 'are we moving conversion or just shipping features?'"

**How to catch it.** Read the team's standup notes. Do they reference the outcome metric or the feature names? If only the feature names, it's output dressed as outcome.

---

## Red Flag 2: Missing measurement

**Symptom.** Now items have outcome statements but no success metric ("Enable users to be productive" — measured how?).

**Why it's bad.** Without measurement, the outcome cannot be validated. The team ships the work and declares success based on what they did, not on what changed. The team learns nothing about whether the work actually delivered value.

**Bad example:**
> "Now: 'Enable customers to make better decisions, so they can grow their business.' (No measurable indicators.)"

**Good example:**
> "Now: 'Enable mid-market retailers to choose merchandise mixes that match their store traffic patterns, so they reduce overstock by 25%.'
> Primary metric: overstock value per store per month, from $42k to $32k.
> Secondary: % of stores using the new merchandising tool weekly, from 0% to 60%.
> Counter: stockout rate stays below 4% (don't trade overstock for stockout).
> Owner of the metric pull: BI team; reporting cadence: weekly."

**How to catch it.** For each Now item, does the success metric have a baseline and a target with a date? If no, measurement is missing.

---

## Red Flag 3: Now items > 3

**Symptom.** Now column lists 8 active initiatives.

**Why it's bad.** A team that has 8 "Now" items has 0 priorities. Now is supposed to be high-commitment, fully-scoped work — capped at what the team can ship in 6-8 weeks. 8 items means most are not real; they will not all ship; the column lies about commitment.

**Bad example:**
> "Now (Q3): 8 initiatives, each with team assignment. (Reality: 4 are starting; 3 are aspirational; 1 was bumped down from last quarter.)"

**Good example:**
> "Now (Q3, capped at 2-3): 'Improve mid-market activation' (active) and 'Reduce enterprise onboarding friction' (starting Aug 1). Others are Next. Cap enforced because activation experiments take 6-8 weeks each; more Now items means we're not really running any of them seriously."

**How to catch it.** Count Now items. > 3 = the commitment level is false.

---

## Red Flag 4: Later items with detailed scope

**Symptom.** Later column has full feature lists, mockups, P0/P1/P2 designations, dates.

**Why it's bad.** "Later" is strategic intent only. Adding precision to uncertain items creates false confidence. Stakeholders read the detail and commit emotionally to it; when reality forces a different choice, trust erodes ("you promised this!").

**Bad example:**
> "Later (Q1 2027): 'Mobile app redesign — 14 P0 features, mockups linked, ship date Mar 15, success metric DAU +25%, owner Sarah K, eng estimate 8 weeks.'"

**Good example:**
> "Later (3-6 months out, intentionally vague):
> 'Mobile experience deserves a refresh — current mobile NPS is 22 vs web 45, suggesting a gap. We are tracking 'mobile abandonment' as a leading indicator. In Q4 we'll decide whether to invest in mobile-app redesign or mobile-web optimization or both, based on the experiment in Q3.'
> (No mockups. No P0/P1. No dates. No success metric beyond directional intent.)"

**How to catch it.** Read Later items. Search for: dates, mockup links, P0/P1, specific feature counts. Each is false precision.

---

## Red Flag 5: "So what?" chain stopped too early

**Symptom.** Original initiative was "Build advanced search". After 1 "so what?", the team wrote: "users can find products faster". They wrote that as the outcome and moved on.

**Why it's bad.** "Find products faster" is still an activity-level outcome ("user does X faster"). The business outcome — what changes for the company — is 2-3 "so whats" further: conversion rate, revenue, retention. Stopping early produces user-experience-level outcomes that may not connect to business impact.

**Bad example:**
> "Original: 'Build advanced search.'
> So what? → 'Users find products faster.'
> Outcome: 'Enable users to find products faster.'"

**Good example:**
> "Original: 'Build advanced search.'
> So what? → 'Users find relevant products faster.'
> So what? → 'They spend less time browsing without buying.'
> So what? → 'Conversion rate increases, reducing acquisition cost per sale.'
> Outcome: 'Enable shoppers to find relevant products in <5 sec, so conversion rate increases from 12% to 15%.'"

**How to catch it.** Count "so what" iterations. If only 1, push 2-3 deeper to reach a business metric.

---

## Red Flag 6: All outcome statements sound the same

**Symptom.** "Enable users to be productive so the business grows." "Enable customers to use the product so revenue increases." "Enable teams to collaborate so they have better outcomes." Each item has the template applied mechanically.

**Why it's bad.** Generic outcome statements are worse than honest feature lists. They imply outcome thinking without doing the work. The team can't differentiate priorities; stakeholders can't tell what's important.

**Bad example:**
> "Now 1: 'Enable users to be more productive, so we grow revenue.'
> Now 2: 'Enable customers to succeed, so they retain better.'
> Now 3: 'Enable teams to collaborate, so they have better outcomes.'"

**Good example:**
> "Now 1: 'Enable mid-market sales leaders to cut pre-call research from 90 minutes to 10 minutes, so their reps spend 80% of their day in customer conversations instead of preparing for them.'
> Now 2: 'Enable enterprise admins to provision new users in under 2 minutes (currently 18 minutes), so their average time-to-first-team-value drops below 24 hours.'
> Now 3: 'Enable hybrid teams to see who is working on what without joining a sync meeting, so async teams stay aligned with 30% fewer meetings.'
> (Each outcome names specific segment, specific job, specific number.)"

**How to catch it.** Read 3 outcome statements aloud. If they could be swapped between items without anyone noticing, they are too generic.

---

## Red Flag 7: Stakeholders keep asking "when exactly?"

**Symptom.** Every roadmap review, the same question: "but when will [X] actually ship?" Team explains commitment levels; stakeholder is unsatisfied.

**Why it's bad.** Repeated date questions signal the commitment-level framework hasn't been internalized. Stakeholders may have been trained by years of date-driven roadmaps; switching to Now/Next/Later requires re-education they have not received.

**Bad example:**
> "Review meeting #4. Sales VP: 'I know it's "Next" but when will the API actually ship?' PM: 'commitment level is medium; we don't have a date.' Sales VP: 'I need a date for the customer.' [Repeat every quarter.]"

**Good example:**
> "Quarterly roadmap kickoff: 30-min education for stakeholders on the commitment-level framework. Slides cover: 'Now = high commitment, dates available'; 'Next = direction set, dates approximate'; 'Later = strategic intent, no dates'. Followed by Q&A. Sales VP receives a separate 'sales-ready commitments' artifact showing only Now items with firm dates plus Next items with date *windows* (e.g. 'Aug-Oct'). The wide-window dates are firm enough to commit to customers conservatively."

**How to catch it.** If the same date question recurs 3 reviews in a row, the framework hasn't been taught.

---

## Red Flag 8: Roadmap re-shuffled mid-quarter

**Symptom.** Now column on July 15 looks completely different from Now column on June 15. Items appear and disappear; no one tracks why.

**Why it's bad.** A roadmap that re-shuffles mid-quarter has no commitment level — Now is just "whatever we're working on this week". Teams cannot plan against it. Stakeholders cannot rely on it. The artifact becomes a vanity board.

**Bad example:**
> "June 1 Now: A, B, C. July 1 Now: A, D, E. (B and C silently moved; D and E appeared with no note.)"

**Good example:**
> "Now items locked for the quarter at kickoff. Mid-quarter changes require a documented decision: 'Removed item C on July 5 because user research invalidated the assumption; replaced with item D approved by VP Product.' Changelog at the bottom of the roadmap doc; reviewed at the monthly roadmap-review meeting."

**How to catch it.** Compare Now column at quarter start to mid-quarter. Each addition/removal should have a documented reason. Silent swaps = no commitment level.

---

## Red Flag 9: Roadmap as project plan

**Symptom.** Roadmap is a Gantt chart with engineer names, hours, weekly milestones. 27 dependencies marked.

**Why it's bad.** This is a project plan, not a roadmap. Roadmaps communicate strategy and outcomes to a broad audience. Project plans communicate scheduling to the working team. Conflating them produces a document too detailed for executives and too high-level for engineers.

**Bad example:**
> "'Outcome roadmap': 32-row Gantt chart with engineer assignments, hourly estimates, dependency arrows, daily milestones. Shown to the board."

**Good example:**
> "Outcome roadmap (strategic, for execs/customers/cross-functional): 3 Now / 4 Next / 5 Later items with outcomes and success metrics. No dates beyond month-level on Now items. No engineer names. No hourly estimates. The project plan / Gantt lives separately in the team's planning tool; it is the execution detail. The roadmap is the strategic abstraction."

**How to catch it.** Open the roadmap. Does it have engineer names? Hourly estimates? Daily milestones? Each is project-plan content polluting the roadmap.

---

## Red Flag 10: No connection to the NSM or OKRs

**Symptom.** Roadmap items have outcomes. NSM and OKRs exist separately. No mapping between them.

**Why it's bad.** Outcomes that don't ladder to the company's NSM and the team's OKRs are local optimizations. The team can hit every roadmap outcome and still not move the strategic levers. Roadmap-OKR alignment is what makes the work add up.

**Bad example:**
> "Roadmap Now item: 'Enable users to find products faster, so conversion rate improves.' Q3 OKR: 'Reduce churn from 4% to 2.5%.' (No connection. Conversion-rate improvement doesn't move churn.)"

**Good example:**
> "Roadmap Now item: 'Enable repeat shoppers to find products faster, so weekly repeat-visit conversion rate improves from 8% to 12%.'
> Strategic linkage: NSM is 'weekly active engaged accounts'; this initiative moves the 'repeat visit conversion' input which combines with WAU to produce WAEA. Q3 OKR KR2 is 'WAEA from 28k to 40k' — this initiative is expected to contribute ~30% of that lift."

**How to catch it.** For each Now item, ask: "which OKR KR does this serve?" If the team can't answer, the roadmap is locally optimized.

---

## Red Flag 11: Dependencies hidden

**Symptom.** Now item "Enable [X]" lists no dependencies. Engineering reveals at week 4 that it depends on a Platform team migration that hasn't been planned.

**Why it's bad.** Hidden dependencies are roadmap timebombs. They surface late, cause slips, and embarrass the team in stakeholder reviews. The roadmap promised an outcome but cannot deliver because the team did not surface the prerequisites.

**Bad example:**
> "Now: 'Enable customers to share dashboards externally.' (Dependencies field: blank.) (Week 4: PM realizes this requires the auth team's external-sharing infrastructure, which is not on Platform's roadmap.)"

**Good example:**
> "Now: 'Enable customers to share dashboards externally.'
> Dependencies:
> • Technical: external-auth service from Platform team (DEP-014, needed by Aug 1, expected Jul 28).
> • Organizational: Legal review of GDPR data-sharing implications.
> • Market: SOC 2 certification of the sharing surface (current; verified May).
> Each dependency tracked in `dependency-map/` and visible in the cross-team weekly sync."

**How to catch it.** For each Now/Next item, are technical + organizational + market dependencies documented? If blank, surface them.

---

## Red Flag 12: Roadmap reviewed only at quarter boundaries

**Symptom.** Roadmap published April 1. Next review June 28. In between, the team works against it but never updates it.

**Why it's bad.** Roadmaps drift in 90 days. Items complete (or fail); new information emerges; assumptions get validated or invalidated. A roadmap reviewed only at quarter boundaries is an autopsy, not a steering instrument.

**Bad example:**
> "Q3 roadmap published Jul 1. Next review: Sep 28. Mid-quarter: 2 Now items completed (not removed); 1 invalidated by user research (still listed); 3 new opportunities surfaced (not added)."

**Good example:**
> "Roadmap reviewed monthly (3 times per quarter):
> Month 1: focus on Now item progress; mid-flight decisions.
> Month 2: confirm Next items as Q3 progresses; promote/demote based on data.
> Month 3: shape next quarter's Now; confirm strategic Later items still relevant.
> Quarterly: full re-baseline with stakeholders."

**How to catch it.** Compare the published roadmap to actual team work. If the roadmap shows items the team isn't working on, or omits items they are working on, the artifact is stale.

---

## Red Flag Quick Reference

| # | Anti-pattern | One-line check |
|---|---|---|
| 1 | Outcome-themed but output-driven | Do standups reference outcome metric or feature names? |
| 2 | Missing measurement | Does each Now item have baseline + target + date? |
| 3 | Now items > 3 | Count Now items |
| 4 | Later items with detailed scope | Are dates/mockups/P0 lists on Later items? |
| 5 | "So what?" stopped too early | Count "so what" iterations: < 2? |
| 6 | All outcomes sound the same | Could you swap two outcomes without anyone noticing? |
| 7 | Stakeholders keep asking "when?" | Has the commitment-level framework been taught? |
| 8 | Roadmap reshuffled mid-quarter | Is there a changelog for additions/removals? |
| 9 | Roadmap as project plan | Engineer names? Hourly estimates? Daily milestones? |
| 10 | No NSM/OKR linkage | Which KR does this item serve? |
| 11 | Dependencies hidden | Are technical + organizational deps documented? |
| 12 | Reviewed only at quarter boundaries | When was the roadmap last updated? |

## Related Reading

- SKILL.md Troubleshooting
- references/outcome-roadmap-guide.md
- `brainstorm-okrs/` (OKRs anchor Now items)
- `north-star-metric/` (initiatives target input metrics)
- `prioritization-frameworks/` (RICE/ICE inform Now vs Next vs Later)
- `dependency-map/` (cross-team dependencies on roadmap items)
- `create-prd/` (Now items become PRD candidates)
