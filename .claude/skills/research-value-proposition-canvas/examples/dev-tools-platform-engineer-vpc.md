# Example: Stellaris DevTools — Value Proposition Canvas for Platform Engineers

> Real-world scenario showing how to apply this skill end-to-end.

## Context

Stellaris DevTools is a Series-A developer-tools startup (22 employees, ~$1.4M ARR, ~280 paying customers) building an internal-developer-platform (IDP) builder. The original ICP was "DevOps lead at a 100-person engineering org." Traction is real but slower than expected; sales cycles are 90+ days and the close rate is 18%. The CEO believes the team has been targeting the wrong buyer-persona-vs-user split.

The PM (Anita Vasquez, recently hired) is using the value-proposition-canvas skill to do a clean-sheet VPC for the buyer she believes is actually pulling the product through deals: the **Platform Engineer** (the IC building the IDP, not the manager buying it). The output of this VPC will inform a re-positioning conversation with the founder and sales.

## Inputs

- Existing positioning: "IDP builder for DevOps leaders"
- Hypothesis: real value is created for platform engineers (ICs), not DevOps managers
- 14 customer interview transcripts; 9 were with platform engineers
- 6 churned-customer interviews; 5 cited "we couldn't justify the cost to the broader team"
- 22 employees, runway 14 months
- Time budget for the VPC + repositioning recommendation: 2 weeks

## Applying the skill

1. **Wrote the Customer Profile in the customer's language.** Did not paraphrase into product-team-speak. Pulled jobs/pains/gains verbatim from the 9 platform-engineer transcripts.
2. **Ranked jobs by importance, pains by severity x frequency, gains by desirability.** Did NOT keep them as unranked lists — ranking is what reveals what the Value Map must address.
3. **Built the Value Map second, after the Customer Profile.** A common mistake is building the Value Map first ("here is what we have") and then reverse-engineering the Customer Profile to fit. The skill is clear: customer first.
4. **Each Pain Reliever references a specific Pain.** Each Gain Creator references a specific Gain. No "this is generally good" connectors.
5. **Tested Problem-Solution Fit explicitly.** Walked through the validation checklist; surfaced 3 gaps.
6. **Tested Product-Market Fit explicitly.** Surfaced one critical gap — the buyer/user split.
7. **Wrote the repositioning recommendation.** The VPC is the input; the recommendation is the output.

## The artifact

```
================================================================
  VALUE PROPOSITION CANVAS — STELLARIS DEVTOOLS
  Target segment: Platform Engineer (IC, not manager)
  Date: 2026-05-22
  Owner: Anita Vasquez (PM)
================================================================


PART 1 — CUSTOMER PROFILE (the circle)

SEGMENT DEFINITION
  Title:         Platform Engineer
  Role:          IC (Individual Contributor), not manager
  Company size:  Engineering org 50-500 engineers
  Tenure in role: Median 18 months
  Reports to:    DevOps lead or Director of Engineering
  Buying power:  Influence, NOT direct purchase authority

  Why this segment matters: 9 of 14 product-led customer
  conversations had a platform engineer as the deciding
  technical voice, even when the DevOps lead signed.

JOBS (ranked by importance, top = most important)

  J1  Build an internal developer platform that the rest of
      engineering actually adopts
      (Functional, HIGHEST importance — this is the job
       being hired for)
  J2  Reduce the time my engineers spend on infrastructure
      yak-shaving so they can ship features
      (Functional)
  J3  Look like I made the right architectural call to my
      manager when the platform gets reviewed
      (Social — VERY important; underrepresented in
       most vendor positioning)
  J4  Not be the person who broke production with a
      platform change
      (Emotional — fear-of-blame is real)
  J5  Get visibility into how engineers actually use the
      platform so I can iterate
      (Functional)
  J6  Stop having to write Terraform modules from scratch
      for every new service
      (Functional)
  J7  Stop being interrupted with "how do I do X" Slack
      pings from other engineers
      (Functional + Emotional)
  J8  Make my own work portable to another role/company
      so my skills don't get stuck
      (Social — career mobility — underrated job)

PAINS (ranked by severity x frequency)

  P1  My platform has 60% adoption after 6 months because
      teams have workarounds
      (HIGHEST: severe + frequent. Cited 7 of 9)
  P2  Every new service requires a custom Terraform module
      and I have written 40 of these myself
      (Severe + very frequent. Cited 6 of 9)
  P3  I cannot prove ROI of the platform to my director
      because I have no usage data
      (High severity, monthly frequency. Cited 5 of 9)
  P4  When the platform breaks, I get blamed, even when
      it is an upstream cloud issue
      (Severe, infrequent but visible. Cited 4 of 9)
  P5  Bootstrapping a new service takes 3 days because the
      golden-path docs are out of date
      (Medium severity, frequent. Cited 6 of 9)
  P6  I spend 20% of my week answering "how do I do X"
      Slack pings
      (Medium severity, daily. Cited 8 of 9)
  P7  I cannot demonstrate to my manager that my work is
      reducing engineering toil
      (Career-blocking severity, monthly. Cited 5 of 9)
  P8  Onboarding a new engineer to the platform takes 2
      weeks of hand-holding
      (Medium, weekly. Cited 6 of 9)

GAINS (ranked by desirability)

  G1  A self-service portal that engineers actually USE
      voluntarily (Desired, highest)
  G2  Usage metrics that prove the platform reduces
      engineering toil (Desired)
  G3  A library of pre-built golden-path templates
      (Required — table stakes today)
  G4  A "no-code" config interface for service-team
      engineers (Desired)
  G5  Audit logs to defend the platform after an incident
      (Required for compliance)
  G6  Skills/patterns I learn here are portable to my next
      role (Unexpected — high desirability when surfaced)
  G7  A way to recognize and reward engineers who adopt
      the platform early (Unexpected — gain creator)
  G8  Daily "wins" report that I can share with my manager
      (Unexpected — career visibility)


PART 2 — VALUE MAP (the square)

PRODUCTS & SERVICES (what Stellaris offers today)
  PS1  Web-based IDP builder
  PS2  Golden-path template library (35 templates)
  PS3  Self-service portal for service teams
  PS4  Usage analytics dashboard
  PS5  Terraform module generator
  PS6  Slack bot for common platform questions
  PS7  RBAC + audit logs
  PS8  Onboarding wizard for new engineers

PAIN RELIEVERS (each references a specific pain)

  PR1  -> P1: Adoption analytics dashboard shows what % of
       engineers used the platform last week. Sets a
       baseline; surfaces the gap.

  PR2  -> P2: Pre-built Terraform module library (35
       templates today; +10/month). Cuts module-from-scratch
       to 5 minutes.

  PR3  -> P3: Engineering-toil metrics with delta over time,
       formatted as a ready-to-send report to director.

  PR4  -> P4: Audit trail per platform change, with one-
       click incident-report export. Shifts blame
       conversation to evidence.

  PR5  -> P5: Auto-updated golden-path docs that stay in
       sync with the latest template versions. Bootstrap
       time falls from 3 days to 30 minutes.

  PR6  -> P6: Slack bot answers top-50 platform questions
       autonomously. Cuts engineer interruption rate ~60%
       in customers measured.

  PR7  -> P7: Quarterly toil-reduction report, auto-
       generated, exportable to PDF. Career-visibility tool.

  PR8  -> P8: Self-onboarding wizard reduces engineer
       onboarding from 2 weeks to 2 days.

GAIN CREATORS (each references a specific gain)

  GC1  -> G1: Voluntary self-service usage is the metric
       the dashboard tracks. Visible to the platform engineer
       and the director.

  GC2  -> G2: Toil-reduction calculator generates dollar-
       value-of-time-saved estimates.

  GC3  -> G3: Template library is the table-stakes offering.

  GC4  -> G4: Service-team-engineer "no-code" config UI
       in beta; planned GA Q3.

  GC5  -> G5: SOC 2 + ISO 27001 audit log compliance.

  GC6  -> G6: NOT YET BUILT. Platform engineers can
       export their patterns as a portable resume artifact.
       (See gap below.)

  GC7  -> G7: NOT YET BUILT. Recognition/badge system for
       early-adopter engineers.

  GC8  -> G8: Daily wins email opt-in for the platform
       engineer to forward to manager. (Beta).


PART 3 — FIT ANALYSIS

LEVEL 1 — PROBLEM-SOLUTION FIT
  Question: do we understand the customer well enough?

  Pain coverage:
    P1 covered by PR1                YES
    P2 covered by PR2                YES
    P3 covered by PR3                YES
    P4 covered by PR4                YES
    P5 covered by PR5                YES
    P6 covered by PR6                YES
    P7 covered by PR7                YES
    P8 covered by PR8                YES

  Gain coverage:
    G1 covered by GC1                YES
    G2 covered by GC2                YES
    G3 covered by GC3                YES
    G4 covered by GC4                PARTIAL (beta)
    G5 covered by GC5                YES
    G6 covered by GC6                NO — GAP
    G7 covered by GC7                NO — GAP
    G8 covered by GC8                PARTIAL (beta)

  Verdict: STRONG problem-solution fit on pains.
           WEAK fit on emotional/career gains (G6, G7, G8).

  The platform engineer's CAREER MOBILITY job (J8) and
  visibility-to-manager job (J3) are real but unaddressed.
  This is where the next 2 quarters of product investment
  should go.

LEVEL 2 — PRODUCT-MARKET FIT
  Question: do customers behave the way the canvas predicts?

  Evidence:
    - 80% of platform engineers in the 9 interviews USE the
      product weekly
    - 65% would be "very disappointed" if the product went
      away (Sean Ellis test — close to PMF threshold of 40%)
    - NPS among platform engineers: +48
    - HOWEVER: 18% close rate suggests the BUYER (DevOps
      lead) is not as convinced.

  The mismatch:
    The USER (platform engineer) loves the product.
    The BUYER (DevOps lead) sees it as nice-to-have.
    The deal stalls.

  This is the central insight of the VPC: we have a strong
  USER value proposition but a weak BUYER value proposition.
  The same Customer Profile cannot serve both — they have
  different jobs.

LEVEL 3 — BUSINESS MODEL FIT
  Question: are we capturing enough value to sustain?

  Pricing today: per-engineer-on-platform seat license,
  $30/month. Median deal size: $11K/year.

  Issues:
    - Pricing scales with user count, which means buyer
      sees more cost as adoption grows — exactly the wrong
      incentive.
    - No premium tier for the career-mobility / manager-
      visibility features (G6, G7, G8) that would address
      the buyer.

  Recommendation: investigate flat-rate pricing per
  engineering org, NOT per user. Defer to a follow-up
  pricing experiment.


PART 4 — GAPS AND OPPORTUNITIES (RANKED)

  Rank  Gap                                       Source
  ----  ----------------------------------------  -------
  1     No BUYER (DevOps lead) value proposition  PMF
  2     No career-mobility / portability feature  G6
        (G6)
  3     No engineer-recognition system (G7)       G7
  4     "Daily wins" email is beta, not GA (G8)   G8
  5     Per-seat pricing penalizes adoption       BMF


PART 5 — REPOSITIONING RECOMMENDATION

The current positioning ("IDP builder for DevOps leaders")
points the marketing at the BUYER while the product value
is in the USER. The 18% close rate is the symptom.

PROPOSED REPOSITIONING (for founder + sales discussion):

  Target persona: Platform Engineer (USER), not DevOps
  Lead (BUYER).

  Primary message: "Stellaris makes you the platform
  engineer everyone wants to hire."
  (This connects to G6, G8, J3 — the previously-ignored
  jobs and gains.)

  Secondary message (for the buyer): "Engineering toil
  reduction with the metrics to prove it."
  (Connects to P3, PR3, G2.)

  Sales motion implication: platform engineers find
  Stellaris first (community-led / dev-led growth),
  then bring it to their DevOps lead with PR7 (toil
  report) as the buying-justification artifact.

  Product investment implication: Q3 builds the GC6
  (portability / portable patterns export) and GC7
  (recognition) features. Q4 builds the buyer-side
  business case automation (toil ROI calculator).


PART 6 — VALIDATION TODO

The repositioning is a hypothesis, not a conclusion. To
validate:

  V1  Run 6 more platform-engineer interviews with the
      explicit G6 / J3 / J8 probes. Goal: confirm the
      career-mobility job and the "platform engineer
      everyone wants to hire" framing resonates.
  V2  Run 3 win/loss interviews on the last 5 lost deals
      to confirm BUYER side of the mismatch.
  V3  Run a landing-page A/B test: current positioning
      vs. proposed. Measure click-to-demo.
  V4  Pricing exploration: flat-rate org pricing.
      Pricing experiment to follow.
  V5  Pre-build a mockup of the GC6 portability export
      and test it in interviews.


PART 7 — WHAT THE VPC DID NOT PRODUCE

  - A feature spec for GC6 or GC7. That comes from PRD
    work after this canvas.
  - A pricing recommendation. The VPC surfaced the
    pricing mismatch but pricing optimization is its own
    workstream.
  - A messaging document. The positioning hypothesis is
    here; the messaging doc is downstream.
  - A new go-to-market motion. The community-led growth
    implication is named but the GTM playbook is downstream.


PART 8 — KEY QUOTES FROM CUSTOMER INTERVIEWS (EVIDENCE
ANCHORS)

  J3 anchor: "I want my manager to see that I made the right
             call when she reviews this project in Q3."
             — Platform engineer, 240-eng company

  J8 anchor: "I want to be able to point to this on my
             resume in 18 months."
             — Platform engineer, 90-eng company

  P1 anchor: "Adoption is the number that matters and we
             don't have a way to make it go up."
             — Platform engineer, 410-eng company

  Sean Ellis: "Yeah, very disappointed. We've built the
             whole platform on top of this. Switching would
             be a quarter of work."
             — 5 of 9 platform engineers
```

## Why this works

- **Customer Profile written in the customer's language.** Jobs like "look like I made the right architectural call to my manager" come from a transcript, not from a product-team brainstorm. Less-experienced teams rewrite the jobs in product-marketing terms and lose the texture.
- **Both sides of the canvas.** A common error is to do Customer Profile only (and stop) or Value Map only (and reverse-engineer). The two together with explicit Pain → Pain Reliever and Gain → Gain Creator mappings is what makes fit gaps visible.
- **Ranking is the work.** Jobs ranked by importance. Pains by severity x frequency. Gains by desirability. Unranked lists hide the signal; ranked lists force commitments.
- **Surfaced the buyer/user split.** The level-2 PMF analysis named the central insight: USER loves the product, BUYER does not. This is the kind of finding that no single feature ship would have produced. It is a positioning insight.
- **G6 / J8 (career mobility) is the hidden lever.** Platform engineers care about portability and career signal. No competitor markets to this. The skill specifically calls out Unexpected gains as the high-value frontier — and this VPC found one.
- **Pricing implication surfaced.** Level-3 (business model fit) noticed that per-seat pricing penalizes the very adoption the product is trying to drive. This is downstream of the user/buyer mismatch, but the canvas made it visible.
- **Validation TODO is concrete.** 5 follow-up validation experiments named. The repositioning is named as a hypothesis, not a decision.

## What's next

- The repositioning hypothesis is validated via [`../brainstorm-experiments/`](../brainstorm-experiments/) (V3 landing-page test) and [`../customer-interview-script/`](../customer-interview-script/) (V1 + V2 follow-up interviews).
- The G6 / GC6 feature (portability) gets an assumption map via [`../identify-assumptions/`](../identify-assumptions/) before commit.
- The user-vs-buyer pricing exploration uses [`../../execution/pricing-prd/`](../../execution/pricing-prd/).
- The new positioning, once validated, feeds [`../../execution/product-vision/`](../../execution/product-vision/) for a refreshed product narrative.
- The toil-reduction report (PR7) connects to [`../../execution/status-update-generator/`](../../execution/status-update-generator/) for the format.
- A JTBD workshop ([`../jtbd-workshop/`](../jtbd-workshop/)) on the platform-engineer persona would deepen this canvas.
