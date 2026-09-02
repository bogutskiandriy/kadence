# ICP Refinement from Closed Customers

How to derive your real ICP from actual closed-won customers.

## 1. Why refine

Your hypothesized ICP and your real ICP differ. Always.

After 10-20 closed customers, patterns emerge that you didn't predict.
Refining ICP from data:
- Sharpens targeting
- Improves close rate
- Reduces churn (better-fit customers)
- Speeds sales cycle
- Reduces wasted CAC

## 2. The refinement process

### Step 1 — Pick the right customers
Use **top customers** (not all customers):

| Metric | Threshold |
|--------|-----------|
| Health score | top quartile |
| ARR | top 20% |
| Expansion (NRR) | > 115% |
| Tenure | > 1 year |
| Referenceability | willing to be reference |
| NPS | promoter (9-10) |

Customers who score across multiple → use these for ICP refinement.

Don't refine from:
- New customers (no signal yet)
- Churned customers (different question)
- One-off mega deals (outliers)

### Step 2 — Collect attributes per customer

For each top customer:

| Attribute | Source |
|-----------|--------|
| Industry | their site, LinkedIn |
| Size (EE) | LinkedIn, Crunchbase |
| Revenue | Crunchbase, public filings |
| Geography | LinkedIn, your CRM |
| Funding stage | Crunchbase |
| Tech stack | BuiltWith, integrations they use |
| Buyer role | your CRM (deal contact) |
| Trigger event when they bought | your CRM notes; talk to AE/CSM |
| Original lead source | your CRM |
| Average cycle | your CRM |
| Use case (what JTBD they solve) | CSM interviews |
| Champion role | your CRM |
| Decision committee | your CRM, AE/CSM |
| What alternatives they considered | discovery notes, AE |

### Step 3 — Look for patterns

Per attribute, ask: do top customers cluster?

- **Industry:** are 60%+ in one vertical?
- **Size:** narrow band? (200-500 EE vs 100-5000 EE)
- **Geography:** concentrated? (US-only vs global)
- **Tech stack:** specific tool combinations recur?
- **Buyer role:** same title most of the time?
- **Trigger event:** common pattern?
- **Champion:** specific profile?
- **Use case:** narrow set of JTBDs?

A cluster of 60%+ on a dimension = real ICP signal.

### Step 4 — Compare to stated ICP

| Dimension | Stated ICP | Actual cluster | Gap |
|-----------|-----------|----------------|-----|
| Industry | "SaaS or services" | 75% SaaS | Tighten |
| Size | 100-2000 EE | 80% in 200-500 EE | Tighten band |
| Buyer | "HR leadership" | 70% specifically VP People | Specify |
| Trigger | unspecified | 60% within 90 days of new VP People hire | Add |
| Tech stack | "any HRIS" | 80% Workday + ADP | Add as qualifier |

Refined ICP = data-validated.

### Step 5 — Validate refined ICP

Before broadcasting:

- Do AEs recognize this in their deals?
- Does marketing have addressable list?
- Are recent losses outside new ICP (i.e., not just bad luck)?
- Is the addressable market still big enough?

### Step 6 — Update artifacts

- Sales qualification rubric
- Marketing targeting (list, persona, channels)
- Product roadmap (prioritize refined ICP needs)
- Disqualification criteria
- Battle cards for adjacent segments (won't pursue)

## 3. Spotting ICP creep

Common pattern: company drifts away from ICP under sales pressure.

### Symptoms
- AE closes large deals outside ICP
- Product roadmap pulled by big-deal customers
- Churn rising in non-ICP customers
- Sales cycle lengthening
- Win rate dropping

### Diagnosis
Compare last quarter's deals vs ICP:
- % in-ICP closes
- Win rate by ICP fit
- Churn by ICP fit
- Cycle time by ICP fit

If clear gap: tighten qualification.

### Sales pushback
Sales will resist ICP discipline:
- "But this deal is huge"
- "They're a great logo"
- "We can make them happy"

Compromise:
- One-off "we'll-take-the-deal-but-not-pursue-the-segment"
- No roadmap concessions for non-ICP
- No discounting beyond standard
- No additional CS investment

## 4. ICP expansion (after beachhead)

Once beachhead is winning:

- Adjacent vertical with similar JTBD
- Adjacent size band (move up or down)
- Adjacent geography
- Adjacent use case

Each adjacency = separate ICP analysis:
- Validate it's truly adjacent (shared playbook)
- Test with 5-10 deals before committing
- Update materials per ICP

## 5. Multi-ICP companies

Some products have 2-3 distinct ICPs. Map separately:

- ICP A: mid-market HR for SaaS
- ICP B: mid-market HR for healthcare (different compliance)
- ICP C: enterprise HR (different motion entirely)

Each ICP needs:
- Distinct firmographics
- Distinct persona
- Distinct messaging
- Distinct motion (often)

Companies that pretend one ICP covers multiple = mediocre at all.

## 6. ICP discovery without customers

If you have no customers yet (or < 5):

### Use design partners
- Recruit 5-10 design partners matching hypothesized ICP
- Observe their workflows + JTBDs
- Treat their patterns as proxy ICP

### Use customer interviews
- 10-15 interviews with hypothesized ICP
- Focus on:
  - What they do today
  - What's painful
  - What they've tried
  - What they'd pay for
  - Who's in their buying committee

### Use competitor wins/losses
- Customers leaving competitors → their ICP signal
- Common attributes among competitor customers

### Use TAM / Crunchbase queries
- Build a list of 100 candidates matching hypothesized ICP
- Test outreach
- See who responds + engages

## 7. ICP refresh cadence

| Trigger | Action |
|---------|--------|
| 10+ new customers since last refresh | Refresh |
| Major product launch | Refresh |
| Major market shift | Refresh |
| Churn rising in specific segment | Diagnose; may refresh |
| Quarterly anyway | Light refresh |

Don't refresh monthly. Oscillation = no targeting discipline.

## 8. Worked example — refined ICP from data

### Original (hypothesized) ICP

```
ICP: HR teams at mid-market US companies
Buyer: HR leader
Use case: HR analytics
```

### After 25 closed customers, real patterns:

- 80% SaaS or modern services (not legacy industries)
- 85% in 200-500 EE (not 500-2000 as hypothesized)
- 75% on Workday or BambooHR + ADP/Gusto
- 70% bought within 90 days of VP People joining
- 80% had a board ask for better HR reporting
- 65% had previously tried building in Tableau/Looker first
- 90% are headquartered in US; 60% Bay Area / NYC / Austin
- Average deal $42K (range $25K-$85K)

### Refined ICP

```
ICP: US-HQ mid-market SaaS or modern-services, 200-500 EE, on Workday or
BambooHR + ADP/Gusto, with a VP People in role 0-12 months who is responding
to board ask for HR reporting depth.

Trigger: VP People hire + board ask combination.

Buyer: VP People (75%) or HR Director (25%) with CFO co-approval at $40K+.

JTBD: "Become a strategic HR partner with auditable, fast-to-produce
board-level reporting; stop being the bottleneck."

Disqualify:
- Companies < 200 EE (won't fund $25K+; HR-of-1)
- Companies > 2000 EE (need enterprise feature set we don't have yet)
- Pre-Series B (no budget for $25K HR tool)
- Heavy regulated industries (different compliance needs)
- Companies that built BI in-house (NIH bias = hard sell)

Channels: SHRM events, LinkedIn outbound to VP People in target firmographics,
HR Tech podcast guest spots, Pavilion HR community.

Average cycle: 45 days.
Average deal: $42K.
LTV target: $120K (3-year × $40K avg).
```

The refined ICP is sharper, smaller, more targetable. Marketing,
sales, product all benefit.

## Refresh checklist

Quarterly:

- [ ] Pull top-20 customers (health × revenue × tenure)
- [ ] Tag each across all 8 ICP dimensions
- [ ] Find cluster patterns
- [ ] Compare to stated ICP
- [ ] Identify refinements
- [ ] Validate with sales + marketing
- [ ] Update qualification rubric
- [ ] Update targeting materials
- [ ] Update disqualification criteria
- [ ] Communicate refined ICP to GTM team
