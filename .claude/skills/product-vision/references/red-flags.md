# Red Flags: Product Vision

> Common ways this skill's output goes wrong -- concrete examples, why they're bad, and how to fix them.

## How to use this document

Scan before sharing a vision document, vision deck, or vision-of-the-future narrative. Each red flag has bad and good quoted examples.

---

## Red Flag 1: Vision = Mission

**Symptom.** The "vision" reads like a corporate mission statement -- present tense, abstract, never expires.
**Why it's bad.** A mission is your reason for existing today. A vision is a description of a *future* state, dated and concrete, that the team can rally to and eventually retire. Conflating them produces something that energizes nobody, because there is no destination -- only a stance.
**Bad example:**
> "Our vision: empower modern teams to do their best work."
**Good example:**
> "By 2031, every distributed engineering team will run async-by-default ceremonies in our product, and the median company will save 6 hours of meeting time per engineer per week. We measure this in our own customer base and report it quarterly."
**How to catch it.** If the statement has no date and no measurable end state, it is a mission, not a vision.

---

## Red Flag 2: 12-Month Vision

**Symptom.** "Our vision for 2027" -- a horizon that is shorter than the average engineering reorg.
**Why it's bad.** Vision exists to align decisions that take years to play out. Twelve months is a roadmap, eighteen is a plan, three years is a strategy. Vision lives at 5-10 years. Anything shorter forces you to revise the vision every planning cycle, which destroys its anchoring value.
**Bad example:**
> "By end of 2027 we will be the leading async-first collaboration tool for distributed teams."
**Good example:**
> "By 2034 we will be the default operating system for distributed engineering teams -- the place async work, decisions, and rituals live by default, not by exception."
**How to catch it.** Vision horizon < 5 years = re-scope as a strategy or roadmap.

---

## Red Flag 3: Vision Without a Customer

**Symptom.** Vision describes the product, the company, the technology -- never names the people who benefit.
**Why it's bad.** Vision is the story of what the world looks like *for someone* after you have succeeded. Strip the customer and you have a vanity statement. Teams ship features for themselves, not customers.
**Bad example:**
> "Our vision is to build the most advanced, AI-native, cloud-scale collaboration platform."
**Good example:**
> "Our vision: distributed engineering managers spend their day coaching their team and writing code reviews, not chasing status. By 2032 the average EM at our customers will spend < 2 hours / week on status-gathering, down from a benchmark of 9."
**How to catch it.** Search the vision for a noun describing a human role. If absent, rewrite.

---

## Red Flag 4: Vision Plagiarized From Cagan / Pichler Templates

**Symptom.** The vision uses Marty Cagan's exact format ("for X who Y, our product is Z that does W, unlike V, our product W'"), filled in like Mad Libs, with no organizational fingerprint.
**Why it's bad.** Templates are scaffolding, not output. A copy-paste vision lacks the specificity that makes the team believe it -- it sounds like a hundred other startups. Worse, leadership can tell, and the document loses credibility fast.
**Bad example:**
> "For modern distributed teams who struggle with synchronous meetings, AcmeCo is a collaboration platform that enables async work. Unlike Slack, AcmeCo prioritizes thoughtful written exchange."
**Good example:**
> "By 2032, the EM at a 40-person remote startup will run her Monday from her kitchen in Lisbon. Stand-up, retrospective, and next-sprint planning all happen before she opens her IDE -- written, threaded, and resolved without a single video call. The week's burn-down updates itself from her team's commits. That is the world AcmeCo exists to create."
**How to catch it.** If the vision could be a competitor's vision with the company name swapped, rewrite.

---

## Red Flag 5: Vision That Doesn't Force Trade-offs

**Symptom.** Vision lists every customer segment, use case, and benefit. Nothing is excluded.
**Why it's bad.** A vision's strategic value is what it *rules out*. "We will be everything to everyone" lets the team ship anything. A real vision draws a circle around the world you intend to win, leaving things outside the circle.
**Bad example:**
> "We will be the platform of choice for engineering, design, marketing, sales, and ops teams in companies of every size, from solo founders to Fortune 500."
**Good example:**
> "We will be the platform of choice for distributed engineering teams of 20-200 people. We will not chase Fortune 500 enterprise (their procurement is incompatible with our pricing) and we will not serve teams below 20 (the value of structure does not appear yet). We measure success in this segment only."
**How to catch it.** Ask: what would we say "no" to because of this vision? If the answer is nothing, the vision has no teeth.

---

## Red Flag 6: Vision With No Strategic Narrative

**Symptom.** A one-line vision statement floats alone. No story of *why now*, *why us*, or *what changes*.
**Why it's bad.** People do not commit to a sentence -- they commit to a story. A vision needs a 1-2 page narrative explaining the world shift that makes it possible, the wedge that lets your company win, and the future state in lived detail.
**Bad example:**
> "Our vision: be the OS for distributed engineering teams. (End of document.)"
**Good example:**
> "[2-page narrative covering: (1) the 2020-2025 shift to remote engineering and what broke; (2) why no incumbent has solved it (Slack is a chat tool retrofitted; Jira optimizes for ticketing not flow); (3) the wedge -- async ceremony tooling -- and why we win there first; (4) a day-in-the-life of the EM at our customer in 2032; (5) the measurable end state and how we know we have arrived.]"
**How to catch it.** A vision document under one page is a tagline, not a vision.

---

## Red Flag 7: Vision With Numbers That Are Just Big

**Symptom.** Vision claims $10B ARR, 100M users, 1B in revenue by 2030 -- arbitrary big numbers with no derivation.
**Why it's bad.** Bottom-up sizing connects vision to a defensible market. Unmoored big numbers are wishful, signal lack of rigor, and get torn apart by anyone running the math. Worse, the team learns to discount future numerical claims.
**Bad example:**
> "By 2030 we will be a $10B ARR company."
**Good example:**
> "By 2030 we serve 12% of the addressable market of distributed engineering teams (20-200 people, English-speaking, > $1M revenue). Bottom-up: ~180K such teams globally x ~22% paid penetration of our category x $48K average ACV = $1.9B ARR. Sources and segment math in `tam-bottom-up.xlsx`."
**How to catch it.** Any big number in the vision without a derivation file = remove or rewrite.

---

## Red Flag 8: Vision That Was Never Stress-Tested With the Team

**Symptom.** The CEO or CPO writes the vision in isolation and broadcasts it.
**Why it's bad.** A vision the team did not contribute to is a vision the team will not defend. Engineering will quietly disagree about feasibility, sales will quietly disagree about market, and the vision becomes leadership theater.
**Bad example:**
> "CEO wrote the vision over a weekend, sent it Monday at all-hands, no Q&A scheduled."
**Good example:**
> "Vision draft circulated to leadership (week 1), red-teamed in a 90-min session with VPs of Eng, Sales, Customer Success (week 2), revised, then taken to the team for a structured 'what would have to be true' workshop (week 3). Final published with the trade-offs and dissents addressed in an appendix."
**How to catch it.** No record of stress-test = the vision is the CEO's, not the company's.

---

## Red Flag 9: Vision That Mentions Specific Features

**Symptom.** Vision describes the dropdown menus, AI agents, or integrations the product will ship.
**Why it's bad.** Vision is feature-agnostic by design. Features are means, not ends. Locking the vision to specific features ages it instantly and constrains future strategy ("our vision says we will ship X, so we must").
**Bad example:**
> "Our vision: an AI agent that auto-summarizes every meeting, an integrated Jira-style board, voice notes with auto-transcribe..."
**Good example:**
> "Our vision: distributed engineering teams operate with zero status-meeting overhead. How we achieve that will change -- AI agents today, something different in 2030 -- but the outcome (zero status overhead) is the constant."
**How to catch it.** Search the vision for product nouns (dashboard, agent, board, dropdown). If present, abstract them up.

---

## Red Flag 10: Vision Used as a Roadmap

**Symptom.** Quarterly planning meetings cite "the vision says we need an AI agent next quarter" as a justification.
**Why it's bad.** Vision is the destination. Roadmap is the path. The vision should anchor *direction* (we are still solving this) but never specify *cadence* (we ship this by Q3). Confusing the two corrupts both artifacts.
**Bad example:**
> "Vision says we will be AI-first. Q2 roadmap: ship AI agent."
**Good example:**
> "Vision says zero status-meeting overhead by 2032. Q2 roadmap candidates evaluated against that outcome -- AI agent for meeting summaries scores well (RICE 2400), so it is in. Q2 also includes async retro tooling (RICE 2100), which serves the same vision."
**How to catch it.** Find every roadmap doc that cites the vision. If it cites the vision *as a deadline*, fix.

---

## Red Flag Quick Reference

| # | Anti-pattern | One-line check |
|---|---|---|
| 1 | Vision = mission | No date + no end state = mission, not vision |
| 2 | 12-month vision | Horizon < 5 years = re-scope as strategy |
| 3 | Vision without a customer | Search for a human role noun |
| 4 | Template plagiarism | Could a competitor swap the name and use it? |
| 5 | No trade-offs | What does this vision rule out? |
| 6 | Statement, not narrative | Under 1 page = tagline, not vision |
| 7 | Arbitrary big numbers | Every number needs a derivation file |
| 8 | No team stress-test | No red-team record = leadership theater |
| 9 | Mentions specific features | Product nouns in the vision = abstract them up |
| 10 | Vision used as roadmap deadline | Roadmaps cite outcomes, not vision dates |

## Related Reading

- `SKILL.md` -- vision crafting frameworks (Pichler Vision Board, Cagan, Moore, Raskin, Amazon Working Backwards)
- `references/vision-crafting.md` -- step-by-step authoring guide
- Sibling skill: `execution/north-star-metric/` -- the metric tree that operationalizes the vision
- Sibling skill: `execution/outcome-roadmap/` -- bridge vision to quarterly work
- Sibling skill: `discovery/jtbd-workshop/` -- the customer jobs the vision is about
