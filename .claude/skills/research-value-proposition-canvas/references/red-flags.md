# Red Flags: Value Proposition Canvas

> Common ways this skill's output goes wrong — concrete examples, why they're bad, and how to fix them. Pair with the SKILL.md and Troubleshooting table.

## How to use this document

When you have just filled in a Customer Profile and Value Map, scan the red flags below before treating the canvas as validated. Each red flag shows a *bad* and *good* version, anchored in the Strategyzer canvas method (Osterwalder, Pigneur).

---

## Red Flag 1: Pain/Gain Inflation (Everything Is a Major Pain)

**Symptom.** The Pains column lists 12 items, all marked Extreme severity. The Gains column lists 10 items, all marked Essential.

**Why it's bad.** If everything is extreme, nothing is. The canvas's whole purpose is to *rank* pains and gains so the Value Map can prioritize relievers and creators. Inflation defeats prioritization; the team optimizes for everything and lands on nothing.

**Bad example:**
> Pains: "Slow performance (Extreme), Confusing UI (Extreme), No mobile (Extreme), Bad support (Extreme), Limited integrations (Extreme), Expensive (Extreme)..."

**Good example:**
> Pains ranked by severity: Extreme (1 item: 'workflow takes 2+ hours per week of manual data entry'). Moderate (3 items: slow performance, no mobile, support response time). Minor (4 items: cosmetic issues). Value Map focuses on the Extreme pain first."

**How to catch it.** What % of pains are tagged Extreme? Above 30% is inflation. Force-rank to a 1-2-3 distribution.

---

## Red Flag 2: Fitting Solution to Canvas Instead of Canvas to Customer

**Symptom.** The Customer Profile is written *after* the team decided what to build. Jobs, pains, and gains are reverse-engineered to justify the planned solution.

**Why it's bad.** The canvas is meant to inform what to build, not justify what was already chosen. Backfilling the customer side from the solution side produces a self-confirming canvas that misses real customer signal. Osterwalder explicitly warns against this.

**Bad example:**
> Team has decided to build an AI assistant. Customer Profile is then written with "Pain: too much manual work, Gain: AI-powered productivity." (Pains/gains conveniently match what AI assistant solves.)

**Good example:**
> Customer Profile built from 8 customer interviews *before* solution decision. Jobs, pains, gains in customer language. Then Value Map drafted — checked element-by-element for fit. Some pains have strong relievers, others do not; gaps inform what to build vs what to defer."

**How to catch it.** Was the Customer Profile built before or after the Value Map was decided? Profile-after-solution is reverse engineering.

---

## Red Flag 3: Jobs Written in Solution Language

**Symptom.** Customer jobs include "use a CRM" or "subscribe to a SaaS tool." These are not jobs; they are solutions.

**Why it's bad.** Jobs (per Christensen and Strategyzer) are customer-language descriptions of the progress they are trying to make, independent of solution. "Use a CRM" is a tool choice; "track and follow up on every sales conversation without dropping any" is a job. Solution-coded jobs lock the canvas into one path.

**Bad example:**
> "Job: Use a CRM."

**Good example:**
> "Job: 'Track every customer conversation so I can follow up at the right time and never look unprepared.' (Customer language; could be solved by CRM, spreadsheet, calendar, or a memory app.)"

**How to catch it.** Does any job mention a tool, product type, or interface? If yes, rewrite in customer outcome language.

---

## Red Flag 4: Pain Relievers That Do Not Map to a Pain

**Symptom.** Value Map lists "real-time collaboration" as a pain reliever. No pain in the Customer Profile relates to collaboration.

**Why it's bad.** Strategyzer's fit principle requires *element-by-element* mapping between Profile and Map. A reliever without a pain is solution-looking-for-a-problem. The canvas exists to surface these mismatches; they cannot be ignored.

**Bad example:**
> Pain Relievers: "Real-time collaboration." (No corresponding pain in Customer Profile.)

**Good example:**
> Pain Relievers cross-referenced to Pains. For "real-time collaboration" reliever: no matching pain. Decision: either (a) drop the reliever, (b) re-interview to discover whether there is a pain we missed."

**How to catch it.** For each pain reliever, name the pain it relieves. If you cannot, the reliever is solution looking for a problem.

---

## Red Flag 5: Gain Creators That Are Aspirational, Not Differentiating

**Symptom.** Gain Creators list things every competitor also delivers: "saves time", "easy to use", "good support."

**Why it's bad.** Gain creators that are table-stakes do not differentiate. The canvas is most valuable when it forces the team to identify *which* gains they create that competitors do not. Generic creators produce a canvas that fits every product equally — i.e., a canvas with no signal.

**Bad example:**
> Gain Creators: "Saves time. Easy to use. Good support. Reliable."

**Good example:**
> Gain Creators differentiated: "Saves 6 hours/week (vs incumbent's 0.5). Native mobile-first workflow (incumbent is desktop-only). Embedded analyst-grade AI explanations (no competitor has these). Reliable (table-stakes — not a differentiator, parity)."

**How to catch it.** For each gain creator, ask "do competitors also deliver this?" If yes, label as parity, not differentiator.

---

## Red Flag 6: Skipping Fit Validation (Drawing the Canvas, Never Testing It)

**Symptom.** Beautiful filled-in canvas. No customer has been shown the Value Map to validate it actually resonates with the pains and gains they expressed.

**Why it's bad.** A canvas on paper is a hypothesis. Strategyzer's fit principle is meant to be tested via customer conversations: "does this match what you would actually pay for?" Untested canvases produce confident teams shipping products that miss real pain.

**Bad example:**
> Canvas filled in. Workshop ended. Team proceeds to build.

**Good example:**
> Canvas drafted. Three customer validation calls scheduled: (a) show the Pains list — 'did I get this right? what's missing?', (b) show the Value Map — 'would this actually relieve your top pain?'. Adjustments made before build."

**How to catch it.** Has any customer seen and reacted to the canvas? If not, you have a hypothesis, not a validated canvas.

---

## Red Flag 7: Canvas Per Segment Skipped (One Canvas for All Customers)

**Symptom.** One canvas for "our customers." But the team serves both SMB self-serve and enterprise — two very different segments with different jobs, pains, and gains.

**Why it's bad.** Canvas-per-segment is in the SKILL.md because one canvas across multiple segments produces a generic "average" that fits neither. Each segment needs its own Customer Profile and Value Map; pricing, packaging, and messaging differ accordingly.

**Bad example:**
> One canvas: "Our customer: small business owners and enterprise IT teams." (Jobs/pains/gains pooled across both.)

**Good example:**
> Two canvases: (a) SMB self-serve: jobs/pains/gains focused on speed, self-service, low-touch. (b) Enterprise: jobs/pains/gains focused on compliance, integration, scale. Different Value Maps for each — same product, different surface."

**How to catch it.** Do you have a canvas per segment, or one canvas pooling them? Pooled canvases hide critical differences.

---

## Red Flag 8: Customer Profile in PM/Designer Language Instead of Customer Language

**Symptom.** Pains include "user friction in funnel step 3" or "engagement gap in week 2." This is product team vocabulary, not customer vocabulary.

**Why it's bad.** The canvas only works when pains and gains are in *customer* language — what they would say to a friend, not what the analytics dashboard shows. Internal vocabulary masks the human reality and produces relievers that solve the metric, not the experience.

**Bad example:**
> Pain: "Activation funnel drop-off in step 3."

**Good example:**
> Pain: 'I get to the setup screen and don't know which field is the important one. I usually close the tab.' (Verbatim from customer interview.) [Maps to: activation funnel step 3.]"

**How to catch it.** Read your pains aloud. Could a customer have said this? If it sounds like a dashboard label, rewrite.

---

## Red Flag 9: Importance Not Ranked

**Symptom.** All jobs/pains/gains listed equally. No ranking on importance or severity.

**Why it's bad.** Strategyzer's method requires ranking by importance — an unimportant job perfectly done has zero traction. Without ranking, the Value Map cannot prioritize what to build first.

**Bad example:**
> Jobs: 8 items, flat list, no order.

**Good example:**
> Jobs ranked by importance (1 = top): (1) Close month-end books accurately, (2) Comply with GDPR audit requirements, (3) ..., (8) Customize report colors. Value Map prioritizes relievers/creators for top 3 jobs."

**How to catch it.** Is there a ranking on jobs, pains, and gains? If not, the canvas is unranked inventory.

---

## Red Flag 10: Missing the Three Levels of Fit

**Symptom.** Team claims "we have product-market fit" because the Value Map mirrors the Customer Profile on paper.

**Why it's bad.** Strategyzer defines three levels: (a) problem-solution fit (the value proposition addresses real pains/gains), (b) product-market fit (customers actually buy and use), (c) business model fit (the economics work). A paper-level mirror is only (a). Confusing paper fit with market fit is how teams ship products with great canvases that fail.

**Bad example:**
> "Our canvas shows fit between Value Map and Customer Profile. We have product-market fit."

**Good example:**
> "Problem-solution fit: paper canvas shows mapping. Validated with 6 customer conversations. Product-market fit: not yet — we have 3 paying customers, all early adopters. We will know we have PMF when we see 40%+ 'very disappointed' on the Sean Ellis test (currently 22%). Business model fit: TBD."

**How to catch it.** Which level of fit do you claim? Paper-level claims of PMF are common and wrong.

---

## Red Flag 11: Confusing "We Could Build This" with "Customer Wants This"

**Symptom.** Value Map includes capabilities the team can build but customers have not requested or validated.

**Why it's bad.** The Value Map should reflect what customers want, not what the team is excited to build. Including unrequested capabilities inflates the perceived strength of the value proposition and produces over-engineered products.

**Bad example:**
> Value Map: "AI-powered insights." [No customer has requested this; team excited about AI.]

**Good example:**
> Value Map: "AI-powered insights — candidate, not validated. Customer Profile mentions 'wish I understood the pattern in my data' which suggests fit, but we have not tested whether AI specifically is the right relief vs other approaches (charts, summaries, alerts)."

**How to catch it.** For each item in the Value Map, can you trace it back to a customer-stated need? If not, it is team excitement.

---

## Red Flag 12: Canvas as One-Time Artifact (Never Revisited)

**Symptom.** Canvas created during a strategy workshop in Q1. Never updated. Q3 product debates reference it as if it were still current.

**Why it's bad.** Customer profiles drift. Market conditions, competitive alternatives, and customer maturity all change. A canvas frozen in time becomes increasingly inaccurate and silently misleads decisions.

**Bad example:**
> Canvas frozen since Q1. Decisions in Q3 reference it; nobody has re-validated.

**Good example:**
> Canvas reviewed quarterly. After each customer-interview wave, jobs/pains/gains updated; outdated items marked. Major revision (re-do canvas) every 6 months or when new segment is added."

**How to catch it.** When was the canvas last updated? Over 6 months ago and used for current decisions = stale.

---

## Red Flag Quick Reference

| # | Anti-pattern | One-line check |
|---|---|---|
| 1 | Pain/Gain Inflation | Top severity tier under 30% of items? |
| 2 | Solution-First Backfill | Customer Profile built before Value Map decided? |
| 3 | Jobs in Solution Language | Jobs solution-agnostic? |
| 4 | Relievers Without Pains | Every reliever maps to a named pain? |
| 5 | Generic Gain Creators | Each creator differentiated from competitor parity? |
| 6 | Skipped Fit Validation | Any customer has seen and reacted to the canvas? |
| 7 | One Canvas for All Segments | Separate canvas per segment? |
| 8 | Internal Vocabulary | Pains in customer language, not dashboard labels? |
| 9 | No Importance Ranking | Jobs/pains/gains ranked? |
| 10 | Paper Fit = PMF | Distinguished problem-solution vs product-market vs business model? |
| 11 | Team Excitement in Value Map | Each item traceable to customer-stated need? |
| 12 | Canvas Frozen in Time | Last updated within 6 months? |

## Related Reading

- SKILL.md Troubleshooting section (for symptom -> root cause -> resolution)
- references/strategyzer-fit.md (for the three levels of fit, if present)
- jtbd-workshop/references/red-flags.md (for jobs work upstream of the canvas)
- customer-interview-script/references/red-flags.md (for pain/gain discovery method)
