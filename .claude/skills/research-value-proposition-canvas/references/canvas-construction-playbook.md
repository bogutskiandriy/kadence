# Canvas Construction Playbook

Read this when building a Value Proposition Canvas end-to-end: the two sides in detail (Customer Profile and Value Map), the three levels of fit, the markdown canvas template, a full worked example, common mistakes, the workflow, troubleshooting, and success criteria.

## The Two Sides of the Canvas

### Side 1: Customer Profile (the circle)

The Customer Profile describes the customer's world. It has three sections.

#### Jobs (Customer Jobs)

What is the customer trying to get done? Three flavors:

- **Functional jobs** -- A task to be completed. "Reconcile Stripe payments to QuickBooks invoices."
- **Social jobs** -- How the customer wants to be perceived. "Look competent in front of the finance director."
- **Emotional jobs** -- How the customer wants to feel. "Avoid the dread of month-end close."

Jobs are written from the customer's perspective, in their language. They are not features ("automated reconciliation tool") -- they are outcomes ("close the books in 2 days without errors").

**Job ranking:** Order jobs by *importance* to the customer. An unimportant job that is perfectly done has zero traction.

#### Pains

Bad outcomes, risks, and obstacles related to the jobs. Three flavors:

- **Undesired outcomes** -- "The reconciliation report has wrong numbers"
- **Obstacles** -- "I can't get the data out of the source system"
- **Risks** -- "If I close the books wrong, the auditor will catch it"

Pains are described concretely. "Reconciliation is hard" is weak. "Reconciliation takes 11 hours per close because I have to manually match 2,400 rows" is strong.

**Pain ranking:** Order pains by *severity* (how bad it is when it happens) and *frequency* (how often it happens). High-severity high-frequency pains are the priority.

#### Gains

Outcomes and benefits the customer wants. Four flavors:

- **Required gains** -- Without these, the solution does not work ("the report has to be accurate")
- **Expected gains** -- Customers assume these exist ("the data is encrypted in transit")
- **Desired gains** -- Customers explicitly want these ("the report exports to PDF for the auditor")
- **Unexpected gains** -- Things customers do not yet know to ask for, but love when delivered ("a Slack alert when reconciliation completes")

**Gain ranking:** Order gains by *desirability* and *relevance to the job*. Unexpected gains drive delight; required gains drive table stakes.

### Side 2: Value Map (the square)

The Value Map describes the product's response to the Customer Profile.

#### Products & Services

The bundle of things you offer. This is the *what*. Concrete listing -- a feature, a service, a subscription tier, an integration.

#### Pain Relievers

How your products and services *eliminate or reduce* the customer's pains. Each pain reliever should reference a specific pain from the Customer Profile.

Example pain: "Reconciliation takes 11 hours per close."
Pain reliever: "Automated rule-based matching that processes 2,400 rows in under 60 seconds."

#### Gain Creators

How your products and services *create* the customer's gains. Each gain creator should reference a specific gain.

Example gain: "Slack alert when reconciliation completes."
Gain creator: "Real-time Slack notifications via webhook integration; one alert per completed run."

## The Three Levels of Fit

Osterwalder defines fit as a three-stage validation process. Each stage requires evidence; do not skip.

### Level 1: Problem-Solution Fit

**Question:** Have we designed value-creating products and services that customers want?

**Test:** For each top-ranked job, pain, and gain in the Customer Profile, can you point to a specific pain reliever or gain creator that addresses it?

**Evidence required:** Customer interviews (`discovery/customer-interview-script/` + `discovery/interview-synthesis/`) confirming the jobs, pains, and gains are real. Concept tests confirming the value proposition resonates.

**Anti-pattern:** Designing pain relievers for pains that customers do not actually have. The Value Map mirrors the team's assumptions, not the Customer Profile's reality.

### Level 2: Product-Market Fit

**Question:** Have we found evidence that customers want our products and services and will pay for them?

**Test:** Are customers using the product? Are they retaining? Are they referring? Is the cost of acquisition lower than the lifetime value?

**Evidence required:** Behavioral data -- activation, retention, expansion, willingness-to-pay. The Sean Ellis test (40%+ would be "very disappointed" without the product) is one signal.

**Anti-pattern:** Confusing problem-solution fit with product-market fit. Interviews can validate problem-solution; only behavior can validate product-market.

### Level 3: Business Model Fit

**Question:** Have we found a business model that is scalable and profitable?

**Test:** Does the unit economics work? Can the channels scale? Are the costs structurally aligned with the revenue?

**Evidence required:** Cohort LTV/CAC analysis, channel economics, gross margin trends. This level lives mostly in `finance/` skills -- the VPC informs it but does not validate it alone.

## Canvas Template (Markdown Table Form)

```markdown
## Value Proposition Canvas: [Segment Name]

### Customer Profile

**Customer Jobs** (ranked by importance, 1 = most important)

| # | Job | Type | Notes |
|---|-----|------|-------|
| 1 | [Job statement in customer language] | Functional/Social/Emotional | [context] |
| 2 | [Job statement] | ... | ... |

**Pains** (ranked by severity x frequency)

| # | Pain | Severity (1-5) | Frequency (1-5) | Notes |
|---|------|----------------|------------------|-------|
| 1 | [Pain statement] | 5 | 5 | [evidence] |
| 2 | [Pain statement] | 4 | 3 | ... |

**Gains** (ranked by desirability)

| # | Gain | Type | Notes |
|---|------|------|-------|
| 1 | [Gain statement] | Required/Expected/Desired/Unexpected | [...] |
| 2 | [Gain statement] | ... | ... |

### Value Map

**Products & Services**

| # | Item | Type |
|---|------|------|
| 1 | [Feature, service, or offering] | Feature/Service/Tier |
| 2 | [...] | ... |

**Pain Relievers** (each maps to a Pain above)

| # | Pain Reliever | Addresses Pain # | How |
|---|---------------|-------------------|-----|
| 1 | [How the product reduces or eliminates a pain] | 1 | [mechanism] |
| 2 | [...] | 2 | ... |

**Gain Creators** (each maps to a Gain above)

| # | Gain Creator | Addresses Gain # | How |
|---|--------------|-------------------|-----|
| 1 | [How the product creates a gain] | 1 | [mechanism] |
| 2 | [...] | 2 | ... |

### Fit Validation

| Top Job/Pain/Gain | Value Map Response | Evidence | Fit Status |
|--------------------|---------------------|----------|------------|
| Job #1 | [Pain reliever / gain creator] | [interview, behavior, sale] | Strong / Partial / None |
| Pain #1 | [Pain reliever] | [evidence] | Strong / Partial / None |
| Gain #1 | [Gain creator] | [evidence] | Strong / Partial / None |
```

## Worked Example: Finance Reconciliation SaaS

### Customer Profile (Finance Lead at 100-500 person B2B SaaS)

**Customer Jobs:**

1. **Functional:** Close the books accurately within 5 days of month-end
2. **Functional:** Reconcile payment processor (Stripe) to accounting (QuickBooks)
3. **Social:** Look prepared in front of the CFO during month-end review
4. **Emotional:** Avoid the dread of month-end close week

**Pains:**

1. Manual reconciliation takes 11 hours per close (severity 5, frequency 5)
2. Mismatched rows produce audit findings the following quarter (severity 5, frequency 2)
3. The current spreadsheet workaround breaks when transaction volume crosses 5,000/month (severity 4, frequency 3)
4. Finance lead has no audit trail for matches made manually (severity 3, frequency 5)

**Gains:**

1. Close the books in <2 days (Required)
2. Audit trail for every match (Required)
3. Automated re-run when source data updates (Desired)
4. Slack alert when reconciliation completes (Unexpected -- delight)

### Value Map

**Products & Services:**

1. Rule-based matching engine
2. Audit log
3. QuickBooks + Stripe + Xero integrations
4. Slack + email notifications
5. Monthly "Close Health" report

**Pain Relievers:**

1. Matching engine processes 10K rows in 60 seconds -> addresses Pain #1 (manual hours)
2. Audit log captures every match with rule reference and timestamp -> addresses Pain #2 (audit findings)
3. Engine scales to 100K rows -> addresses Pain #3 (spreadsheet break)
4. Audit log is exportable to CSV/PDF -> addresses Pain #4 (no audit trail)

**Gain Creators:**

1. End-to-end pipeline closes books in <2 days -> creates Gain #1
2. Per-row audit log -> creates Gain #2
3. Webhook re-runs on source updates -> creates Gain #3
4. Slack integration with completion alerts -> creates Gain #4 (delight)

### Fit Validation

| Customer Profile Item | Value Map Response | Evidence | Fit |
|------------------------|---------------------|----------|-----|
| Job: Close books in 5 days | <2 day close pipeline | 12 interviews + 4 paying customers | Strong |
| Pain: 11hr manual reconciliation | 60sec engine | 4 customers retained for 6+ months | Strong |
| Pain: Audit findings | Audit log | 1 customer cited in renewal | Partial (need more cases) |
| Gain: Slack alert | Slack integration | 2/4 customers use; 1 cited at renewal | Strong (delighter) |

## Common Mistakes

| Mistake | Why It Happens | Fix |
|---------|---------------|-----|
| Customer Profile written in the team's language, not the customer's | Internal jargon leaks in during workshops | Copy quotes verbatim from interview transcripts |
| Pains and gains are restated job descriptions | Conflation of the three sections | Pains = what's bad now; Gains = what would be good; Jobs = what they're trying to do |
| Value Map listed before Customer Profile | Solution-mode bias | Always finish the Customer Profile (and validate it) before writing the Value Map |
| Every pain has a "pain reliever" -- forced 1:1 mapping | Team forces fit | Acknowledge that some pains are unaddressed; that is honest, not a failure |
| Confusing problem-solution fit with product-market fit | Interview success treated as product success | Require behavioral evidence (usage, retention, payment) for product-market fit |
| One canvas for "all customers" | Segment dilution | Build a separate canvas for each distinct segment; jobs and pains differ |
| Gains list is aspirational, not customer-validated | Marketing language creeps in | Each gain must trace to a specific customer quote or behavior |

## Workflow

1. **Pick the segment.** Define one segment per canvas. If you have three segments, build three canvases.
2. **Run interviews.** Use `discovery/customer-interview-script/` to collect 5-7 interviews per segment.
3. **Fill the Customer Profile.** Use `discovery/interview-synthesis/` themes to populate jobs, pains, gains. Rank by importance/severity/desirability.
4. **Draft the Value Map.** List products/services. For each top job, pain, gain in the Customer Profile, write the pain reliever or gain creator.
5. **Run the fit-validation checklist.** Use `assets/fit_validation_checklist.md` to mark which fit signals are strong, partial, or absent.
6. **Identify gaps.** Where pains or gains have no Value Map response, decide: add to roadmap, defer, or accept as out-of-scope.
7. **Feed into PRD.** Use the canvas to populate `execution/create-prd/` Sections 5 (Market Segments) and 6 (Value Propositions).
8. **Revisit quarterly.** Customer Profile shifts as the market matures; Value Map shifts as the product evolves.

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| Canvas feels generic and could describe any product | Insufficient interview evidence; team wrote it from imagination | Run 5+ customer interviews per segment; populate the Customer Profile from `discovery/interview-synthesis/` themes |
| Pain relievers and gain creators are aspirational, not built | Team conflated roadmap with current state | Mark each Value Map item as "Built / In progress / Roadmap"; the canvas reflects current state by default |
| One canvas tries to cover multiple segments and feels muddled | Segment definition too broad | Split into one canvas per distinct segment (by job, not demographics) |
| Customer retention low despite strong canvas | Confused problem-solution fit with product-market fit | Require behavioral evidence (cohort retention) for product-market fit, not just interview validation |
| Sales team cannot remember the value proposition | Canvas not translated into sales-ready language | Use the canvas to write a 2-sentence elevator pitch and a 5-bullet talk track |
| Pains and gains are restated job descriptions | Sections collapsed during workshop | Re-do as three separate exercises: jobs first, then pains, then gains -- with a 5-minute break between |
| Canvas reviewed once and never updated | Treated as a one-shot artifact | Schedule quarterly canvas review; flag drift as input changes (new segment, new competitor, new product line) |

## Success Criteria

- Each canvas covers exactly one segment (no "all customers" canvases)
- Customer Profile populated from >=5 customer interviews per segment
- Jobs, pains, and gains use verbatim customer language (not internal jargon)
- Every pain reliever and gain creator references a specific pain/gain by number
- Fit validation checklist completed with evidence column filled
- Top 3 unaddressed pains/gains explicitly listed (either accepted as out-of-scope or added to roadmap)
- Canvas reviewed quarterly with diffs documented
