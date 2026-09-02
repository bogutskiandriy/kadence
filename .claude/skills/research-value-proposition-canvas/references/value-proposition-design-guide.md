# Value Proposition Design Guide

A reference for the Value Proposition Canvas, grounded in Alexander Osterwalder and Yves Pigneur's *Value Proposition Design* (Wiley, 2014) and the Strategyzer applied playbook.

---

## 1. Origins and context

The Value Proposition Canvas (VPC) was introduced by Strategyzer in 2014 as a "zoom-in" companion to the Business Model Canvas (BMC, 2010). The BMC has nine blocks that describe the structure of a business -- Customer Segments, Value Propositions, Channels, Customer Relationships, Revenue Streams, Key Resources, Key Activities, Key Partnerships, Cost Structure.

In practice, two of those nine blocks accounted for the majority of business failures: teams routinely picked the wrong Customer Segment and built a Value Proposition disconnected from real customer jobs. The VPC zooms into those two blocks and applies a forcing function: *the Value Map must mirror the Customer Profile, item by item.*

---

## 2. The customer side: Jobs, Pains, Gains

### 2.1 What counts as a Job

A "Job" is the underlying outcome the customer is trying to achieve. Strategyzer borrows from Clayton Christensen's Jobs-To-Be-Done framing but uses a simpler, less ethnographic format.

Three job types, with examples for a finance reconciliation product:

| Type | Definition | Example |
|------|------------|---------|
| **Functional** | A task the customer needs to complete | "Reconcile Stripe payments to QuickBooks invoices each month" |
| **Social** | How the customer wants to be perceived by others | "Look prepared and competent during month-end review with the CFO" |
| **Emotional** | How the customer wants to feel | "Avoid the dread of close week" |

In B2B, functional jobs dominate; in B2C, emotional and social jobs are often the strongest drivers.

### 2.2 Job ranking by importance

Not all jobs are equal. A perfectly executed but unimportant job creates no traction. Order jobs by:

- **How important is this job to the customer?** (1 = trivial, 5 = mission-critical)
- **How often does the customer do this job?** (1 = annually, 5 = daily)

The intersection of high importance + high frequency is where value propositions land best.

### 2.3 What counts as a Pain

A Pain is anything that annoys the customer before, during, or after they try to do a job, or that prevents them from doing it.

Three pain types:

| Type | Definition | Example |
|------|------------|---------|
| **Undesired outcomes** | What goes wrong | "Reconciliation report has wrong numbers" |
| **Obstacles** | What blocks the customer | "Can't get the data out of the source system" |
| **Risks** | What might go wrong | "If I close wrong, the auditor catches it next quarter" |

### 2.4 Pain severity and frequency

Rank pains by:

- **Severity:** How bad is it when this pain hits? (1 = annoyance, 5 = career-threatening)
- **Frequency:** How often does it hit? (1 = annually, 5 = daily)

High-severity + high-frequency = the pains your product should target first. High-severity + low-frequency (e.g., audit findings) still matter but trade differently. Low-severity + high-frequency (e.g., a minor UI annoyance) often is not worth solving.

### 2.5 What counts as a Gain

A Gain is anything that would make the customer happier -- a benefit, an outcome, an aspiration.

Four gain types:

| Type | Definition | Example |
|------|------------|---------|
| **Required gains** | Without these, the solution fails outright | "The report has to be accurate" |
| **Expected gains** | Customers assume these exist | "Data is encrypted in transit" |
| **Desired gains** | Customers explicitly ask for these | "Export the report to PDF for the auditor" |
| **Unexpected gains** | Customers do not yet know to ask, but love when delivered | "Slack alert when reconciliation completes" |

The unexpected gains are the *delighters* in the Kano model -- they create disproportionate emotional response and are often the source of word-of-mouth.

### 2.6 Mapping gains to the Kano model

Strategyzer's four gain types map approximately to the Kano model:

| VPC Gain Type | Kano Category | Effect |
|---------------|----------------|--------|
| Required | Must-haves | Absence causes dissatisfaction; presence is neutral |
| Expected | Performance | Linear satisfaction (more is better) |
| Desired | Performance | Linear satisfaction |
| Unexpected | Delighters | Presence causes disproportionate joy; absence is neutral |

A common pricing-and-packaging move: put Required gains in every tier, Performance gains in higher tiers, Delighters as differentiators.

---

## 3. The product side: Pain Relievers, Gain Creators

### 3.1 The mirroring rule

Every pain reliever and gain creator on the Value Map should reference a specific pain or gain on the Customer Profile. If a pain reliever does not map to a customer pain, it is a solution looking for a problem. Cut it or move it to the Customer Profile (perhaps it is a hidden gain that no one has articulated yet).

### 3.2 Pain Relievers

A pain reliever describes *how* your products and services eliminate or reduce a specific pain.

Format: `[Product feature] [eliminates / reduces] [specific pain] by [mechanism].`

Examples:

- "Rule-based matching engine *eliminates* the 11-hour manual reconciliation pain by processing 10,000 rows in 60 seconds."
- "Audit log *reduces* the audit-finding pain by capturing the rule and timestamp for every match."

### 3.3 Gain Creators

A gain creator describes *how* your products and services create a specific gain.

Format: `[Product feature] [creates / enables] [specific gain] by [mechanism].`

Examples:

- "Slack integration *creates* the 'real-time alert' delighter gain by sending a webhook on completion."
- "QuickBooks integration *enables* the 'close books in <2 days' gain by eliminating the export-import step."

### 3.4 Strength of fit per item

Not every pain reliever is equally strong. Score each Value Map item:

- **Essential** -- This pain reliever / gain creator is the core of the value proposition. Removing it would break the product.
- **Important** -- This is a strong differentiator but not the only one.
- **Nice-to-have** -- This is a minor enhancement.

Pricing decisions often follow this scoring: Essential = in the lowest tier; Nice-to-have = in higher tiers or add-ons.

---

## 4. The three levels of fit (in detail)

### 4.1 Problem-Solution Fit

You have *evidence* that:

- The Customer Profile (jobs, pains, gains) is real and important.
- The Value Map (pain relievers, gain creators) addresses the most important items.

Evidence sources: customer interviews, surveys, observed behavior, willingness-to-pay tests.

This is the *first* milestone. You have it before you have product-market fit.

### 4.2 Product-Market Fit (PMF)

You have *evidence* that:

- Customers are using the product.
- They are retaining (cohort retention curves flatten).
- Some are willing to pay.
- They refer others (net new MRR from referrals).

Signals:

- Sean Ellis test: >=40% of users would be "very disappointed" if they could no longer use the product.
- Cohort retention curves flatten rather than approach zero.
- Net Revenue Retention > 100% (for B2B SaaS).
- Organic growth rate > 0 with paid spend zeroed.

PMF is a *behavioral* validation. Interviews can suggest PMF but cannot prove it.

### 4.3 Business Model Fit

You have *evidence* that:

- LTV/CAC ratio > 3 sustainably.
- Channel economics scale (cost per acquired customer does not balloon as you grow).
- Gross margins are structurally sound.
- Capital efficiency is reasonable for the stage.

This level lives in `finance/` skills. The VPC informs it but does not validate it.

### 4.4 The progression

| Stage | What to validate | Method |
|-------|------------------|--------|
| 1. Problem-Solution Fit | Jobs/pains/gains are real and addressed | Interviews, concept tests |
| 2. Product-Market Fit | Customers use, retain, refer | Cohort data, retention curves |
| 3. Business Model Fit | Unit economics scale | LTV/CAC, channel economics |

Companies fail at every stage. Most fail at stage 1 (they never validate the problem) -- but the most visible failures happen at stage 3, when companies appear to have PMF but the economics do not work (high churn, expensive CAC).

---

## 5. Common VPC failure modes

### 5.1 The "all customers" canvas

Symptom: One canvas tries to describe every customer the company serves.

Why it fails: Jobs, pains, and gains differ across segments. Mixing them produces a canvas that is true on average and useful for no one.

Fix: One canvas per segment. Define segments by shared jobs, not by demographics.

### 5.2 The aspirational Value Map

Symptom: Pain relievers and gain creators describe what the team *plans to build*, not what the product *currently does*.

Why it fails: The canvas reads like a marketing brochure rather than a diagnostic tool.

Fix: Label each Value Map item as "Shipped / In progress / Roadmap." A diagnostic VPC only counts shipped items toward problem-solution fit.

### 5.3 The team-language Customer Profile

Symptom: Jobs, pains, and gains use the team's internal jargon.

Why it fails: The canvas mirrors the team's mental model, not the customer's reality. The team feels validated even when there is no customer evidence.

Fix: Populate the Customer Profile from verbatim customer quotes. Use `discovery/customer-interview-script/` and `discovery/interview-synthesis/` to extract real language.

### 5.4 The forced-fit mapping

Symptom: Every pain has a pain reliever; every gain has a gain creator. The mapping is complete because the team forced it to be.

Why it fails: Some pains genuinely are not addressed by the current product. Forcing the mapping hides the gap.

Fix: Mark unaddressed pains and gains explicitly. The canvas should show what is *not* covered as clearly as what is.

### 5.5 Confusing problem-solution fit with product-market fit

Symptom: "Customers in interviews loved it -- we have PMF!"

Why it fails: Interview enthusiasm is a polite-and-helpful response, not behavior. Many products with positive interview signal fail to retain users.

Fix: Require behavioral validation (usage, retention, referral) before claiming PMF. Interview enthusiasm validates problem-solution fit only.

---

## 6. Using the VPC for downstream decisions

### 6.1 PRD construction

Map the VPC into a PRD (`execution/create-prd/`):

- **Customer Profile -> PRD Section 5 (Market Segments).** Jobs and pains define each segment.
- **Value Map -> PRD Section 6 (Value Propositions).** Pain relievers and gain creators become the value proposition statement.
- **Unaddressed pains -> PRD Section 7 (Solution -- features under consideration).**

### 6.2 Prioritization

Feed unaddressed pains and gains into `execution/prioritization-frameworks/` as candidate features. The pain severity x frequency score is a strong input to RICE or ICE scoring.

### 6.3 Sales enablement

Translate each pain reliever into a talk track:

- "Today, our customers spend [X] hours on [pain]. We reduce that to [Y] by [mechanism]. Here's a customer who did it: [reference]."

Translate each gain creator into a proof point:

- "Beyond solving [pain], we also enable [gain] -- which our top customers cite at renewal as a deciding factor."

### 6.4 Pricing and packaging

- **Lowest tier:** All Required gains + Essential pain relievers
- **Mid tier:** Add Performance gains + Important pain relievers
- **Top tier:** Add Delighters (Unexpected gains) + Nice-to-have items
- **Add-ons:** Edge-case pain relievers serving specific segments

---

## 7. Workshop facilitation tips

When running a VPC workshop:

1. **Time-box.** 60-90 minutes per canvas; do not let it become a multi-day affair.
2. **Customer side first.** Always finish the Customer Profile *and validate it with interview evidence* before opening the Value Map side.
3. **Use sticky notes.** Physical or digital. One job/pain/gain per note so they can be ranked and rearranged.
4. **Vote on top items.** After listing 15-20 jobs/pains/gains, dot-vote to surface the top 5-7. Build the Value Map response to those, not all of them.
5. **Bring a customer quote into the room.** A printed verbatim quote per top job/pain/gain anchors the team in real language.
6. **Schedule a fit-validation review one week later.** First-draft canvases are always over-confident; the review catches forced-fit and aspirational items.

---

## 8. References

- Osterwalder, Alexander; Pigneur, Yves; Bernarda, Greg; Smith, Alan. *Value Proposition Design*. Wiley, 2014.
- Osterwalder, Alexander; Pigneur, Yves. *Business Model Generation*. Wiley, 2010.
- Christensen, Clayton M. *Competing Against Luck*. HarperBusiness, 2016 (Jobs-to-Be-Done origin text).
- Strategyzer. *The Value Proposition Canvas* (Creative Commons BY-SA license). Strategyzer AG.
- Ulwick, Anthony. *Jobs To Be Done: Theory to Practice*. Idea Bite Press, 2016 (outcome-driven innovation companion).
- Kahneman, Daniel. *Thinking, Fast and Slow* (for understanding why interview answers diverge from behavior). Farrar, Straus and Giroux, 2011.
