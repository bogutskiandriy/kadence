# Product Vision Playbook

Read this when you are drafting or reviewing a vision and need the layer comparison, the four framework templates in detail (Pichler Board, Moore pitch, Raskin narrative, Cagan 10-year), the Amazon Working Backwards note, the full Vision Review Checklist, the end-to-end Reconcile worked example, the drafting workflow, or the troubleshooting / success-criteria tables. `vision-frameworks-guide.md` carries the framework theory and choosing-a-framework guidance.

## Vision vs. Mission vs. Strategy vs. Roadmap

| Layer | Question Answered | Time Horizon | Example |
|-------|---------------------|---------------|---------|
| **Mission** | Why does the company exist? | Indefinite | "Bring the best user experience to its customers through innovative hardware, software, and services." (Apple) |
| **Vision** | Where is the product going in 5-10 years? | 5-10 years | "Every finance team closes the books in under 2 days with zero manual reconciliation." |
| **Strategy** | How will we win? | 2-3 years | "Land in mid-market B2B SaaS via the Stripe ecosystem, expand to ERP integrations, eventually serve enterprise." |
| **Roadmap** | What ships next? | 1 quarter to 1 year | "Q3: Xero integration. Q4: Audit log export. Q1: Multi-entity reconciliation." |

Confusing the layers is the most common vision failure. A "vision" that says "launch SSO in Q4" is a roadmap item. A "vision" that says "we exist to empower finance teams" is a mission statement.

The Product Vision lives in the second row -- specific enough to direct engineering choices today, abstract enough to outlast any single feature.

## Framework 1: Roman Pichler's Product Vision Board

The Product Vision Board is a one-page canvas with five blocks. It is the fastest way to draft a working vision before committing to a longer narrative.

```
+--------------------------------------------------------------+
| VISION                                                       |
| One sentence: the destination in 5-10 years                  |
+--------------------------------------------------------------+
| TARGET AUDIENCE  | NEEDS         | PRODUCT        | BUSINESS  |
| Who is this for? | What jobs and | What is the    | GOALS     |
|                  | pains does it | product (3-5   | How does  |
|                  | address?      | key features)? | it create |
|                  |               |                | value for |
|                  |               |                | us?       |
+--------------------------------------------------------------+
```

**Vision** (the single sentence at the top):

Format: "Help [target audience] [verb] [outcome] so that [bigger outcome]."

Example: "Help finance teams close the books in under 2 days with zero manual reconciliation so that finance becomes a strategic function rather than a clerical bottleneck."

**Target Audience:**

- Primary segment(s) by job-to-be-done, not demographics
- The most acute version of the pain (not "everyone in finance" -- "finance leads at 100-500 person B2B SaaS who close monthly")

**Needs:**

- Top 3-5 jobs, pains, gains from the Customer Profile (`discovery/value-proposition-canvas/`)
- The needs are the customer's, not the product's

**Product:**

- Top 3-5 capabilities (not features -- capabilities)
- Each capability addresses one or more needs

**Business Goals:**

- How the product creates value for the company
- 2-4 long-term goals (ARR target, market position, strategic moat)

## Framework 2: Geoffrey Moore's Elevator Pitch

From *Crossing the Chasm*. A single-sentence positioning statement that forces specificity.

```text
For [target customer]
who [statement of need or opportunity],
[product name] is a [product category]
that [statement of key benefit -- compelling reason to buy].
Unlike [primary competitive alternative],
our product [statement of primary differentiation].
```

Example:

> "For finance teams at 100-500 person B2B SaaS companies who lose 11 hours per close to manual reconciliation, Reconcile is a payment-data reconciliation platform that delivers a 2-day close with full audit traceability. Unlike spreadsheet-based reconciliation, Reconcile produces an audit-ready trail automatically and scales to 100K transactions per close."

**Use this format when:** You need a position statement for marketing, sales, board decks, or hiring conversations. The elevator pitch is the vision *compressed* -- if you cannot write the pitch, the vision is not yet sharp.

## Framework 3: Andy Raskin's Strategic Narrative

Andy Raskin's narrative framework (used by Salesforce, Drift, Yammer, Zuora) structures the vision as a 5-act story. The form is borrowed from screenwriting; the effect is that the audience identifies with the customer as protagonist and the product as the tool that helps them win.

**The 5 acts:**

1. **Name the undeniable change in the world.** A shift that everyone in the audience recognizes is real. ("Finance is being asked to be strategic, but spends 60% of its time on manual reconciliation.")
2. **Show the winners and losers of that change.** Who is benefiting? Who is being left behind? ("Finance teams who automate are seen as strategic partners. Teams stuck on spreadsheets are seen as cost centers.")
3. **Tease the promised land.** A future state that resonates emotionally. ("Imagine a finance function that closes in 2 days and spends 60% of its time on forward-looking analysis.")
4. **Identify the obstacles to the promised land.** Why is it hard to get there? ("Existing tools assume you have one payment processor. Reality: most companies have 3-7. No tool reconciles across them.")
5. **Position your product as the magic gift that overcomes the obstacles.** ("Reconcile unifies reconciliation across every payment processor, GL, and ERP -- so finance teams can finally make the leap.")

**Use this format when:** You need a vision narrative for sales pitches, board meetings, all-hands talks, or fundraising. The Raskin narrative is *emotional* in a way the Pichler board is not.

## Framework 4: Cagan's 10-Year Horizon

Marty Cagan (*Inspired*, *Empowered*) argues that a product vision should look 10 years into the future, not 1-3. The 10-year horizon does three things:

1. **Forces abstraction from current technology.** What you build in 10 years cannot rely on today's stack assumptions.
2. **Outlasts strategy cycles.** Strategy shifts every 2-3 years; vision endures.
3. **Aligns hiring and architecture.** A 10-year vision shapes who you hire and how you build.

**Cagan's vision document structure:**

- **The world in [current year + 10]** -- describe the customer's world in the future
- **The role of the product in that world** -- how the product fits
- **The capabilities required** -- what the product must be able to do
- **The path to get there** -- 3-4 phases over 10 years
- **What stays true** -- principles and values that will not change

**Use this format when:** You are building a 100+ person product organization; you are setting up multi-year architectural bets; you are recruiting executives or senior engineers who need to see the trajectory.

## Amazon Working Backwards: The Future Press Release

Amazon's Working Backwards method (paired with the FAQ) treats the vision as a *future press release* announcing the product as if it already shipped. This forces clarity on customer value before any implementation.

The PR/FAQ is covered as a standalone skill at `execution/prfaq/` -- but the vision document often *includes* a working-backwards PR as the centerpiece.

**Use when:** You want the vision to land with concrete customer outcomes, not abstract aspiration.

## The Vision Review Checklist

Before publishing the vision, test it against the following criteria. Score each on a 1-5 scale.

### Inspiring
- [ ] Does the vision describe a state of the world that engineers, designers, and PMs would want to bring into being?
- [ ] Would a strong candidate read this and want to interview?
- [ ] Does it survive a "so what?" test?

### Concrete
- [ ] Does it name a specific customer (segment, job)?
- [ ] Does it name a specific outcome (measurable in some form)?
- [ ] Is it specific enough that a roadmap decision today can be tested against it ("does this Q3 work move us toward the vision?")?

### Durable
- [ ] Does it survive a major technology shift (LLMs, distributed systems, web standards)?
- [ ] Does it survive a re-positioning in the market?
- [ ] Is it free of feature names that will be retired?

### Differentiated
- [ ] Could the vision belong to a competitor? If yes, it is not differentiated.
- [ ] Does it name what makes our path different from the alternatives?

### Memorable
- [ ] Can a team member repeat it from memory after one read?
- [ ] Is it a sentence or two -- not a paragraph?

If any category scores below 3, return to the framework and rewrite.

## Worked Example: Reconcile (B2B Finance SaaS)

### Pichler Board

| Block | Content |
|-------|---------|
| **Vision** | Help finance teams close the books in under 2 days with zero manual reconciliation, so finance becomes a strategic function rather than a clerical bottleneck. |
| **Target Audience** | Finance leads at 100-500 person B2B SaaS companies who close monthly across 3+ payment processors |
| **Needs** | Reconcile payments to GL accurately; produce audit-ready trail; eliminate the 11-hour-per-close manual matching tax |
| **Product** | Multi-processor reconciliation engine; rule-based matching; automated audit log; ERP integrations; Slack/email alerts |
| **Business Goals** | $20M ARR by year 3; category leadership in mid-market finance ops; expansion to multi-entity in year 4 |

### Moore Elevator Pitch

"For finance teams at 100-500 person B2B SaaS companies who lose 11 hours per close to manual reconciliation, Reconcile is a payment-data reconciliation platform that delivers a 2-day close with full audit traceability. Unlike spreadsheet-based reconciliation, Reconcile produces an audit-ready trail automatically and scales to 100K transactions per close."

### Raskin Strategic Narrative (compressed)

1. **The change:** Finance is being asked to be strategic. But it spends 60% of its time on manual reconciliation.
2. **Winners and losers:** Finance teams who automate are seen as strategic partners. Teams stuck on spreadsheets are seen as cost centers.
3. **Promised land:** A finance function that closes in 2 days and spends its time on analysis, forecasting, and partnership with the business.
4. **Obstacles:** Existing tools assume one payment processor. Real businesses have 3-7. No tool reconciles across them with audit traceability.
5. **The gift:** Reconcile unifies reconciliation across every payment processor, GL, and ERP -- with a full audit trail. Finance teams finally make the leap.

### Cagan 10-Year Horizon (abbreviated)

**The world in 2036:** Finance functions at sub-Series-D companies are predominantly forward-looking. Close happens continuously in the background. Reconciliation is a solved problem. Finance leaders are partners in strategy, not gatekeepers of accuracy.

**The product's role:** Reconcile is the layer that makes continuous close possible. It connects every payment system to every accounting and ERP system, with explainable matching and complete auditability -- across multi-entity, multi-currency, multi-jurisdiction.

**Capabilities required by 2036:** Real-time matching at any volume; explainable AI for rule discovery; multi-entity / multi-currency support; auditor-friendly explanations; API-first integrations with every accounting system.

**Path to get there:**
- **Years 1-2:** Win mid-market B2B SaaS with single-entity reconciliation.
- **Years 3-5:** Expand to multi-entity and enterprise; deepen ERP integrations.
- **Years 6-8:** Launch continuous-close capabilities; explainable rule learning.
- **Years 9-10:** Become the default reconciliation layer for the sub-Series-D market.

**What stays true:** Auditor-grade explainability. Customer trust in the matching output. Engineering rigor on financial correctness.

## Workflow

1. **Gather inputs.** Customer interviews (`discovery/customer-interview-script/`), jobs hierarchy (`discovery/jtbd-workshop/`), value proposition canvas (`discovery/value-proposition-canvas/`), competitive landscape.
2. **Pick a starting format.** New product: start with Pichler Board (fastest). Strategy reset: start with Raskin narrative (most emotional). Multi-year planning: start with Cagan 10-year (most enduring).
3. **Draft the first format.** 2-4 hours with the product trio (PM + Design + Eng) plus 1 exec.
4. **Translate into a second format.** A vision that survives translation is sharp. A vision that requires explanation to make sense in a second format needs more work.
5. **Run the Vision Review Checklist.** Score each category 1-5. Rewrite anything under 3.
6. **Test with 3 internal audiences.** A senior engineer, a designer, and an account executive. Each should be able to repeat the vision and answer "what would you build differently because of this?"
7. **Test with 2 customers.** Show the elevator pitch or 1-paragraph narrative. Their response should be "this is for me" or "this is not for me" -- not "I don't understand."
8. **Publish.** Commit the vision document. Make it the first link in onboarding docs, the cover slide of strategy decks, and the opening line of customer pitches.
9. **Revisit annually.** Vision drift happens. Schedule an annual vision review.

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| Vision sounds like a mission statement ("we exist to empower...") | Confused vision with mission; vision needs a destination, not a purpose | Add a specific customer + outcome + time horizon (10 years) |
| Vision sounds like a roadmap ("ship SSO and audit logs") | Confused vision with roadmap; vision is durable, roadmap is quarterly | Strip feature names; describe the future state of the customer, not the product backlog |
| Vision could belong to a competitor | Not differentiated; describes the category, not the company's path | Add what makes our approach distinct -- the obstacle we solve that others do not |
| Engineers and PMs disagree on what the vision means | Vision is too abstract to direct decisions | Rewrite with concrete customer + outcome; test that a Q3 roadmap decision can be evaluated against the vision |
| New hires cannot repeat the vision after one read | Vision is too long or jargon-heavy | Compress to one sentence (Moore pitch); cut buzzwords |
| Sales team uses a different positioning than the vision | Vision and go-to-market never aligned | Translate the vision into a Raskin narrative; rebuild sales talk tracks from that narrative |
| Vision feels stale after one quarter | Treated as a one-shot artifact; never revisited | Schedule annual vision review; flag drift when strategy shifts |

## Success Criteria

- Vision document includes at least 2 of 4 formats (Pichler, Moore, Raskin, Cagan)
- One-sentence vision (Moore pitch) fits on a sticky note and survives memorization test
- Vision Review Checklist scored, with all categories >= 3
- Vision tested with at least 3 internal audiences (engineer, designer, AE) and 2 customers
- Roadmap decisions traceable to the vision ("this Q3 work moves us toward [vision component]")
- Vision document is the first link in new-hire onboarding
- Annual vision review scheduled with named owner
