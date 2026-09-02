# Example: Acme Analytics — Pre-Mortem for "Shared Dashboards v1" Launch

> Real-world scenario showing how to apply this skill end-to-end.

## Context

Acme Analytics (Series-B B2B data platform) is preparing to launch "Shared Dashboards v1" — public/auth-gated dashboard sharing. The 3 most-load-bearing assumptions were validated in the assumption-mapping work; engineering has built v1 behind a feature flag. Launch is scheduled for 2026-08-15. Before commit, the PM (Priya) wants a structured pre-mortem with the full product trio + adjacent stakeholders.

Confidence in the room is high — assumptions tested green, engineering is on schedule, sales is excited. That's exactly the moment a pre-mortem matters. The pre-mortem skill is being applied to surface what could go wrong, classify each risk as Tiger / Paper Tiger / Elephant, and assign mitigations.

## Inputs

- Feature: Shared Dashboards v1 — public link + magic-link guest viewer
- Launch target: 2026-08-15
- Assumptions tested green: V2 (renewal signal), U2 (external viewer comprehension), V1 (25% will share)
- Team: Priya (PM), Liang (Designer), Reza (Engineer), Anna (VP Product), Renata (CS lead), Yusuf (Security lead)
- 60-minute pre-mortem session
- Constraint: must produce ranked Tigers + mitigation owners by EOD
- Constraint: this is not a re-litigation of the build decision; it is a stress test

## Applying the skill

1. **Used the "14 days after launch, it failed" framing.** Did not say "what could go wrong?" — that produces hand-waving. Said "It is 2026-08-29. The launch has failed. Why?" — that produces concrete failure narratives.
2. **Silent generation, then share-out.** Each of 6 participants wrote their failure narratives independently for 10 minutes. Group-mode produces 5-7 risks; silent-mode produced 23.
3. **Classified each risk as Tiger / Paper Tiger / Elephant.** Explicitly walked through each one and named the category with evidence.
4. **Surfaced Elephants intentionally.** Priya asked the explicit question: "What is the risk that we all know about but no one is saying out loud?" Three Elephants surfaced.
5. **Wrote mitigations only for Tigers and Elephants.** Did NOT spend time mitigating Paper Tigers — those are documented and parked.
6. **Assigned owners with dates.** Every Tiger and Elephant got a named owner and a deadline before launch.

## The artifact

```
================================================================
  PRE-MORTEM — SHARED DASHBOARDS v1
  Date:     2026-05-22
  Duration: 60 minutes
  Facilitator: Priya Rao
  Participants: Priya (PM), Liang (Designer), Reza (Eng),
                Anna (VP Product), Renata (CS),
                Yusuf (Security)
  Launch target: 2026-08-15
================================================================


PART 1 — THE THOUGHT EXPERIMENT (10 MIN SILENT)

Framing read at start:
  "It is August 29, 2026. Shared Dashboards v1 launched
   on August 15, two weeks ago, and has failed. By 'failed'
   I mean one or more of: customer trust damaged, ARR
   negatively impacted, public incident, internal team
   morale damaged, or quietly rolled back. Take 10 minutes,
   silently. Write down every plausible reason why."

Total raw risks generated: 23


PART 2 — ALL 23 RISKS CLASSIFIED

[TIGER = real, evidence-backed, must mitigate]
[PAPER TIGER = sounds scary, low evidence or low impact]
[ELEPHANT = known but unspoken; surfaced deliberately]

  ID    Risk                                              Class
  ----  -----------------------------------------------   -----
  R1    A customer accidentally shares a dashboard
        containing PII; data leak makes the news          TIGER
  R2    External viewers don't understand context;
        bounce; customer concludes feature is broken      TIGER
  R3    Cross-tenant data leak in the embed framework     TIGER
  R4    CS gets flooded with permission-confusion
        tickets in the first week                         TIGER
  R5    Sales overpromises; demos a use case v1
        doesn't support                                   TIGER
  R6    Anna's CFO-pet pricing change lands the same
        week and confuses customers                       ELEPHANT
  R7    The competitor (Sigma) announces a similar
        feature the week we launch                        PAPER TIGER
  R8    Server can't scale to 10x traffic                 PAPER TIGER
  R9    Embed dependency on third-party SDK breaks
        on a customer's old browser                       PAPER TIGER
  R10   Sharing causes tier-3 seat cannibalization        TIGER
  R11   The lead engineer Reza is interviewing
        elsewhere and may leave before GA                 ELEPHANT
  R12   We launch but 40% of mid-market never sees
        the announcement                                  TIGER
  R13   Magic-link auth gets blocked by enterprise
        email security filters                            TIGER
  R14   Public dashboards get indexed by search engines
        and customer data shows up in Google              TIGER
  R15   GDPR/compliance review hasn't happened for
        the "anonymous viewer" data flow                  TIGER
  R16   Customer's CISO blocks the feature for security
        review and the customer drops it                  TIGER
  R17   Internal CS team doesn't have training in time    TIGER
  R18   The marketing materials get the messaging wrong
        and confuse the buyer                             PAPER TIGER
  R19   Mid-market customers love it but never tell
        their renewal AE, so renewal narrative doesn't
        change                                            TIGER
  R20   Renata's CS team has been told to deprioritize
        this feature in favor of a different initiative   ELEPHANT
  R21   Embedded analytics customers ALREADY paying for
        embedding get angry that "embedded" is now free   TIGER
  R22   Feature flag bug exposes the feature to all
        accounts on day 1, including tier-1 (not licensed) TIGER
  R23   Post-launch instrumentation isn't wired; we
        can't measure impact                              TIGER


PART 3 — TIGER COUNT

  TIGER: 14
  ELEPHANT: 3
  PAPER TIGER: 6

Average pre-mortem has 6-10 Tigers. 14 is high. Two reasons:
  - The feature touches security, billing, comms, and CS
    all at once.
  - The silent-generation method surfaced more than a group
    discussion would have.


PART 4 — TIGERS — DETAILED MITIGATIONS

R1  Accidental PII share
    Likelihood: medium. Evidence: 3 customers in our top-20
    have admin dashboards that include named lists.
    Impact: high — brand damage + GDPR.
    Mitigation:
      - Pre-share check that scans for "looks like PII"
        patterns (emails, phones, SSN format) and warns
        the sharer.
      - Sharing default is "auth-gated guest viewer," not
        public.
      - Public-link option requires a second confirmation.
    Owner: Liang + Reza
    Deadline: 2026-07-15

R2  External viewers don't understand context
    Likelihood: medium. Evidence: U2 experiment passed at
    6/8 but two viewers were confused.
    Impact: medium — customers conclude feature is broken
    even when it works.
    Mitigation:
      - Shared-dashboard view includes a "context" header
        block (filters, date range, definitions)
        editable by the sharer.
      - First-time view shows a one-line "this dashboard
        was shared with you by [name]" affordance.
    Owner: Liang
    Deadline: 2026-08-01

R3  Cross-tenant data leak in embed
    Likelihood: low. Evidence: Reza's prior on the embed
    framework is high.
    Impact: SEVERE — company-ending if it happens.
    Mitigation:
      - Penetration test on the embed flow scheduled
        2026-07-22.
      - Row-level security review pre-launch.
      - Bug bounty pre-announcement to the security
        researcher community 2026-08-01.
    Owner: Yusuf + Reza
    Deadline: 2026-08-08 (1 week before launch)

R4  CS flood for permission confusion
    Likelihood: high. Evidence: pre-launch usability
    testing showed permission UI confusion in 3 of 8 cases.
    Impact: medium — CS bandwidth + first-week perception.
    Mitigation:
      - CS pre-trained with a 90-min walkthrough +
        rehearsed 12 tickets in advance.
      - First-week dedicated #shared-dashboards Slack
        channel with eng + PM on rotation.
      - Updated FAQ in support portal pre-launch.
    Owner: Renata
    Deadline: 2026-08-08

R5  Sales overpromise
    Likelihood: high. Evidence: this happened with the last
    two major launches.
    Impact: medium — customer expectations vs reality
    mismatch.
    Mitigation:
      - Sales enablement deck explicitly lists "v1 does
        and does not."
      - 2 sales engineers review demo scripts pre-launch.
      - Roadmap "coming-in-v2" page published to set
        expectations.
    Owner: Anna (VP Product)
    Deadline: 2026-08-01

R10 Tier-3 seat cannibalization
    Likelihood: medium. Evidence: V3 in assumption map was
    parked because untestable.
    Impact: medium — ARR drag.
    Mitigation:
      - Launch with usage cap: tier-1 = 1 shared dashboard,
        tier-2 = 10, tier-3 = unlimited.
      - 30-day post-launch ARR review with finance to
        catch cannibalization signal early.
      - Pricing brief reviewed with CRO pre-launch.
    Owner: Priya + Finance contact
    Deadline: 2026-08-08

R12 40% of mid-market never sees the announcement
    Likelihood: high. Evidence: last 2 launches had
    similar coverage.
    Impact: medium — usage adoption lag.
    Mitigation:
      - 3-channel announcement: in-app banner, email,
        webinar.
      - CS reach-out to top-100 accounts personally.
      - Pricing page updated.
      - PR blog post + Twitter.
    Owner: Marketing partner + Renata
    Deadline: 2026-08-15

R13 Magic-link auth blocked by enterprise email filters
    Likelihood: medium. Evidence: this happens for 8% of
    transactional emails to enterprise customers today.
    Impact: medium — usability for enterprise viewers.
    Mitigation:
      - Send-from domain dedicated and SPF/DKIM aligned.
      - Magic-link expiry 24h (longer = more deliverability
        time).
      - Fallback: "didn't get the email? Reach out to your
        sharer" affordance.
    Owner: Reza + Marketing partner
    Deadline: 2026-08-01

R14 Public dashboards get indexed by Google
    Likelihood: high if not prevented. Evidence: default
    web behavior.
    Impact: HIGH — customer data exposure.
    Mitigation:
      - robots.txt disallow + noindex headers on all public
        share URLs.
      - Random + non-guessable share URL (UUIDv4).
      - Periodic Google search query for indexed share URLs
        (automated weekly).
    Owner: Reza + Yusuf
    Deadline: 2026-08-08

R15 GDPR review hasn't happened
    Likelihood: certain if not done. Evidence: it has not
    been done.
    Impact: SEVERE — regulatory risk.
    Mitigation:
      - DPIA filed with legal counsel 2026-06-15.
      - Anonymous-viewer data minimization audit.
      - Privacy policy updated.
    Owner: Yusuf + Legal
    Deadline: 2026-07-15

R16 Customer CISO blocks the feature
    Likelihood: medium. Evidence: 2 enterprise customers
    already asked.
    Impact: medium — slow enterprise adoption.
    Mitigation:
      - Pre-publish a security overview document.
      - SOC 2 control mapping document.
      - Sales engineering CISO talking points.
    Owner: Yusuf
    Deadline: 2026-08-01

R17 CS team not trained in time
    Likelihood: medium. Same root cause as R4.
    Impact: medium.
    Mitigation: (same as R4)
    Owner: Renata
    Deadline: 2026-08-08

R19 Mid-market loves it but doesn't tell AE
    Likelihood: high. Evidence: V2 experiment confirmed
    customers value it but only 12 of 30 mentioned it
    spontaneously.
    Impact: medium — renewal narrative doesn't update.
    Mitigation:
      - Quarterly business review template adds a
        "Shared Dashboards" usage card.
      - CS save script anchors on shared dashboards usage.
      - 90-day post-launch QBR data review.
    Owner: Renata + Priya
    Deadline: 2026-08-15 (template), 2026-11-15 (review)

R21 Embedded analytics customers get angry
    Likelihood: medium. Evidence: embedded customers pay
    a separate fee.
    Impact: medium — customer backlash.
    Mitigation:
      - Pre-launch 1:1 outreach to embedded customers (~24
        accounts) explaining how v1 is different from
        full embedding (no white-label, no SSO, no JS SDK).
      - Roadmap "embedded v2" page published.
    Owner: Priya + Renata
    Deadline: 2026-08-08

R22 Feature flag bug exposes to wrong accounts
    Likelihood: low. Evidence: feature flag system has
    had 2 bugs in 18 months.
    Impact: high — billing dispute + bad first impression
    for tier-1 users.
    Mitigation:
      - Soft launch to 10 internal accounts first.
      - Then 50 friendly customers for 1 week.
      - Then tier-2 and tier-3 only via flag check.
      - Audit flag values pre-launch and 24h after.
    Owner: Reza
    Deadline: 2026-08-15 (launch day)

R23 Post-launch instrumentation isn't wired
    Likelihood: medium. Evidence: this is the highest-
    risk gap in every Acme launch.
    Impact: high — can't measure success or learn.
    Mitigation:
      - Instrumentation as part of definition of done.
      - Pre-launch dashboard review.
      - One PM-owned launch dashboard, day-1.
    Owner: Priya + Sofia (data analyst)
    Deadline: 2026-08-08


PART 5 — ELEPHANTS — NAMED AND ADDRESSED

E1 (R6) — CFO pricing change collision
  What it is: Anna's CFO is pushing a tier restructuring
  to land the same week as Shared Dashboards. No one in
  the room had said this aloud before today.
  Mitigation: Anna will request the pricing change move
  by 4 weeks. If it can't move, the launch moves.
  Owner: Anna
  Deadline: 2026-06-01 (decision)

E2 (R11) — Lead engineer interviewing
  What it is: Reza is interviewing elsewhere. The team
  has been pretending this isn't happening.
  Mitigation: Anna has a private conversation with Reza
  this week. Either we know he's staying through GA, or
  we have a documented handoff plan. Either way, this
  feature does not ship without engineering continuity.
  Owner: Anna
  Deadline: 2026-06-01

E3 (R20) — CS deprioritized this internally
  What it is: Renata's leadership told the CS team to
  prioritize a different initiative. CS is going to be
  thin on the ground for this launch.
  Mitigation: Renata escalates with her director to get
  explicit allocation of CS bandwidth for the first
  4 weeks post-launch.
  Owner: Renata
  Deadline: 2026-06-15


PART 6 — PAPER TIGERS — DOCUMENTED, PARKED

  R7   Competitor announces same week. Possible, low impact.
        Acme launch goes ahead regardless.
  R8   10x scale problem. Engineering modeled this; current
        infra handles 100x baseline easily.
  R9   Third-party SDK breaks on old browsers. <2% of
        traffic on browsers >2 years old.
  R18  Marketing materials get messaging wrong. Marketing
        partner is in the room and accountable.
  Other minor PRD-quality risks ...


PART 7 — LAUNCH READINESS GATE

The launch will be considered ready when ALL the
following are TRUE:
  - All 14 Tigers have an "in-progress" or "complete"
    status with named owner
  - All 3 Elephants have been resolved (no more
    "unspoken" status)
  - Penetration test (R3) is COMPLETE and clean
  - GDPR / DPIA (R15) is COMPLETE
  - Robots.txt + noindex (R14) is verified in staging

If any of these is incomplete at T-7, the launch slips.
The slip authority sits with Priya alone, with Anna's
backstop.


PART 8 — POST-LAUNCH PRE-MORTEM REVIEW

The team will re-read this pre-mortem on 2026-08-29 —
exactly 14 days after launch.

For each Tiger, did the mitigation work?
For each Elephant, did naming it help?
For each Paper Tiger, did we make the right call to park
it?

This is the most important step. It calibrates the team's
risk intuition for the next pre-mortem.
```

## Why this works

- **The "14 days after, it failed" framing.** Concrete past-tense narrative beats abstract "what could go wrong" by a wide margin. Participants generate specific failure stories, not vague concerns.
- **Silent generation surfaced 23 risks, not 7.** Group discussion would have stopped at the obvious. The silent 10 minutes is the lever.
- **Three Elephants surfaced.** The CFO collision, the engineer interviewing, and the CS deprioritization. None had been in any meeting note. The single question "what is the thing we all know about and aren't saying?" produced all three.
- **Tigers got mitigations, Paper Tigers did not.** Spending time mitigating Paper Tigers wastes pre-launch cycles. Documented and parked is the right disposition.
- **Each Tiger has an owner and a date.** Mitigations without owners are vapor. The list is operational, not just intellectual.
- **Launch readiness gate is explicit.** All 14 Tigers in progress + all 3 Elephants resolved + penetration test + DPIA + indexing controls. Without these, the launch slips. The slip authority is named (Priya, with Anna backstop).
- **Post-launch review built in.** The team commits to re-reading on Day 14. This is the calibration loop — most teams pre-mortem and then never look at the doc again. The review is what teaches the team to do better pre-mortems next time.

## What's next

- Each Tiger mitigation becomes a tracked task in [`../../execution/dependency-map/`](../../execution/dependency-map/) with explicit dependencies.
- The launch readiness gate maps to [`../../execution/launch-playbook/`](../../execution/launch-playbook/).
- Post-launch monitoring uses [`../../execution/activation-funnel/`](../../execution/activation-funnel/) for the usage signals and [`../../execution/north-star-metric/`](../../execution/north-star-metric/) for the renewal narrative.
- If anything goes wrong despite the mitigations, run [`../../execution/post-mortem/`](../../execution/post-mortem/) for blameless RCA.
- The CS pre-training (R4 / R17) hooks into [`../../execution/customer-feedback-triage/`](../../execution/customer-feedback-triage/).
- Comms plan (R12) is sequenced via [`../../execution/launch-playbook/`](../../execution/launch-playbook/) and [`../../execution/release-notes/`](../../execution/release-notes/).
