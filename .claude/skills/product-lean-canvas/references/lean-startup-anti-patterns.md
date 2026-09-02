# Lean Canvas — Anti-Patterns + Fixes

The 12 most-common Lean Canvas failures and how to fix each.

## A1 — Solution-in-search-of-problem
**Symptom:** Solution block is 8 features; Problem block is vague.

**Fix:** Delete Solution. Refill from Problem. If you can't write Solution
from Problem, you don't know who you're for.

## A2 — "Everyone" as customer segment
**Symptom:** Customer Segments = "SMBs" or "consumers."

**Fix:** Name 5 specific early adopters by name. They must be real people
you can email. If you can't, the segment isn't ready.

## A3 — No existing alternative
**Symptom:** Problem listed; how customers solve it today is blank.

**Fix:** Customers always do something. Spreadsheet, agency, manual
process, doing nothing. Name it. Often the existing alternative is the
real competitor (not the obvious one).

## A4 — UVP says nothing
**Symptom:** "Best-in-class X for businesses."

**Fix:** Apply the template strictly: "[Outcome] for [segment] that
[differentiator from existing alternatives]." If outcome + segment +
differentiator are all generic, the model is mush.

## A5 — Solution > 3 features
**Symptom:** Solution block lists every planned feature.

**Fix:** Top 3 that map to the top 3 Problems. Rest goes to backlog.

## A6 — Channel = "marketing"
**Symptom:** Channels = "content marketing, social media, paid ads."

**Fix:** For each channel, specify:
- How customers will discover us via this channel
- Cost per acquisition assumption
- 4-week test plan
- Success threshold

## A7 — Revenue = "subscription"
**Symptom:** Revenue Streams = "monthly subscription."

**Fix:** Pick a price point + tier structure. Specify LTV calculation.
Specify first $X MRR target.

## A8 — Cost forgets CAC
**Symptom:** Cost Structure lists people + hosting + marketing.

**Fix:** CAC is usually 30-60% of revenue for early-stage. Itemize:
- Founder time × hourly opportunity cost
- Paid acquisition cost
- Sales / support cost per customer
- Infrastructure cost per customer

## A9 — Metrics include everything
**Symptom:** Key Metrics lists 12 metrics.

**Fix:** Pick ONE North Star (lagging or leading; typically leading).
Other metrics are inputs to the NS. See `project-management/execution/north-star-metric`.

## A10 — Unfair Advantage = aspirational
**Symptom:** Unfair Advantage = "first mover advantage in AI for X."

**Fix:** First-mover is rarely a moat. Identify what's actually defensible:
- Do you have proprietary data?
- Do you have a community?
- Do you have a brand?
- Do you have key relationships?
- Do you have an irreplaceable insight?

If none: be honest, mark "to build via [plan]."

## A11 — Canvas + no assumption register
**Symptom:** Canvas complete; no list of what assumptions need testing.

**Fix:** Every block has implicit assumptions. List 5-10. Score risk +
evidence. Top 3 = next experiments.

## A12 — Canvas + no experiments planned
**Symptom:** Canvas + assumption list + nothing scheduled.

**Fix:** Each top-3 assumption needs:
- Experiment design
- Success criterion
- 4-week timebox
- Owner

A Lean Canvas without experiments is just paper.

## Worked example — early-stage SaaS

### Before (weak)

```
Problem: HR teams need better tools.
Customer Segments: HR teams.
UVP: AI-powered HR analytics.
Solution: AI, dashboards, reporting, integrations, mobile app, alerts.
Channels: Online marketing, sales.
Revenue: SaaS subscription.
Cost: People, hosting, marketing.
Metrics: Revenue, users, churn.
Unfair Advantage: First-mover advantage.
```

### After (improved)

```
Problem:
- Quarterly HR board reports take 40+ hours of manual work
- Compliance reports (EEO-1, ACA) error-rate is 8% requiring rework
- Cross-system data (HRIS + payroll + benefits) requires manual joining
Existing alternatives: Excel, Tableau by analyst, agency consulting.

Customer Segments: Mid-market HR teams (200-2000 EE) using Workday or
BambooHR + ADP. Early adopter persona: Director of HR who built career
on data + reporting; recently asked for budget for "an analyst" and was
denied.

UVP: Turn 40-hour HR board reports into 30 minutes for mid-market
HR teams — by auto-joining HRIS + payroll + benefits and pre-building
the 12 charts your CFO actually looks at.

Solution:
1. Pre-built connectors to top 5 HRIS + ADP/Gusto
2. 12-template board-pack generator with audit trail
3. EEO-1 + ACA auto-compile with error checking

Channels:
1. SHRM annual conference booth + content (4-week test: 1 trial / day)
2. Founder cold outreach to top-200 mid-market HR leaders (4-week
   test: 10% reply rate, 1% paid trial)
3. Workday partner program referrals (12-week to first partner)

Revenue: $200/EE/month for 200-500 EE; $1500/mo + $0.50/EE for 500+.
LTV target: $48K (3 yr × $16K avg). Path to $100K ARR: 25 customers in 18 mo.

Cost:
- Burn (no rev): $50K/mo (3 eng + 1 founder)
- CAC at trial: ~$5K (conference + outreach time)
- Infra: $200/customer/mo

Key Metrics: Trial-to-paid conversion (NS). Inputs: trials/month,
time-to-first-report, second-report rate.

Unfair Advantage: None at start. Plan to build: (1) proprietary
report library co-developed with 10 design partners by month 6;
(2) Workday certified partner status by month 9.

Assumptions (top 3):
1. (Problem, risk:H, evidence:L) Mid-market HR teams will pay $200/EE/mo.
   Test: landing page + waitlist; 30 LinkedIn conversations.
2. (Channel, risk:H, evidence:N) SHRM conference attendees match ICP.
   Test: pre-conference outreach to attendee list (if available).
3. (Solution, risk:M, evidence:L) 12 pre-built templates are enough.
   Test: 10-user discovery → which 12 templates actually matter.
```

The "after" version is testable. The "before" version is a wish.

## Common rebuilds

When refreshing an old Lean Canvas:

- **Problem block:** still resonates with real customer conversations?
- **Existing alternatives:** any new ones in market?
- **UVP:** still differentiated?
- **Solution:** scope creep crept in?
- **Channels:** which actually delivered customers?
- **Revenue:** pricing still right?
- **Cost:** unit economics improving?
- **Metrics:** still tracking right thing?
- **Unfair Advantage:** has it materialized or eroded?

If most blocks need rewriting: the canvas was a hypothesis you've now
learned from. Good. Update it.
