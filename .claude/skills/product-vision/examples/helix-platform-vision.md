# Example: Product Vision for Helix Platform

> Real-world scenario showing how to apply this skill end-to-end.

## Context

Helix Platform is a developer infrastructure startup, Series A, 30 people. They sell a managed runtime for AI agent backends -- think "Vercel for autonomous agents." The product is six months past general availability and has 40 paying teams. The CEO (Mira) is preparing for a Series B raise and the board needs a 3-year product vision document. The Head of Product (Devraj) has six weeks to deliver it.

The previous vision deck was a feature list. Investors and recruits both bounced off it. Devraj wants a vision that is *narrative*-shaped (so it survives screenshots and re-tellings) and *bounded* (so the engineering team can use it to say "no"). He uses the Pichler Vision Board for structure and Andy Raskin's strategic narrative for the opening section.

## Inputs

- Existing product: managed runtime + observability for agent backends
- Target customer: applied-AI engineering teams at Series A-D startups (5-50 engineers)
- North Star Metric: weekly active agent runs (not human DAU -- agents are the users)
- Competitive landscape: AWS Lambda, Modal, Replicate, plus self-hosted stacks
- 3-year horizon: through Q2 2029
- CEO red lines: this vision must not commit to becoming a "general PaaS" -- agents are the wedge

## Applying the skill

1. **Open with the Raskin strategic narrative.** Five beats: Name the Change, Show the Stakes, Reveal the Promised Land, Position the Obstacles, Present Evidence. This is the opening 250 words of the document and the script every Helix employee learns by heart.
2. **Use the Pichler Vision Board** for the structured middle section: Vision, Target Group, Needs, Product, Business Goals. This forces the team to name *who is excluded* by the vision.
3. **Add Crossing the Chasm positioning.** Helix is moving from innovators to early adopters; the document names the chasm explicitly and what evidence will prove the team has crossed it.
4. **Add the Amazon Working Backwards "future press release"** as the closing artifact. A press release dated 2029-05-22 that describes the world Helix is trying to make true.
5. **Include explicit non-goals.** Three things Helix will *not* do, with rationale.

## The artifact

---

# Helix Platform: Product Vision, 2026 -- 2029

**Author:** Devraj Sundaram, Head of Product
**Date:** 2026-05-22
**Status:** v1.0, board-reviewed
**Time horizon:** 3 years (through Q2 2029)

## 1. The strategic narrative

**The change happening in the world.** Software is being written by software. In 18 months, the median production application will have at least one autonomous agent running inside it -- doing intake, doing research, doing remediation. Every engineering team that ships agents will need a place to *run* them. Today they cobble that place together from Lambda, Kafka, Redis, and a pile of glue code.

**The stakes.** Agents do not behave like web apps. They are long-running, stateful, expensive, and they fail in ways nobody has good tools for. Teams that try to retrofit their existing stack are spending 30-50% of agent-engineering effort on infrastructure instead of product. The company that gives them a runtime built for agents wins the next decade of backend infrastructure spend.

**The promised land.** A world where shipping an agent feels like deploying a function -- you write the logic, the runtime handles the state, the retries, the cost ceilings, and the observability. Teams that move to Helix recover that 30-50% and ship agents in days instead of months.

**The obstacles.** Two. First, agent infrastructure does not have a category yet -- Helix has to teach the market what to ask for. Second, AWS will ship "Lambda for agents" in the next 18 months; Helix must own the developer experience and the agent-native abstractions before that happens.

**The evidence.** 40 paying teams at GA-month-six. 92% gross retention. Three of the top-15 YC W26 companies built their agent stack on Helix.

## 2. Pichler Vision Board

### Vision

By 2029, every applied-AI engineering team in a Series A-D startup chooses Helix to run their agents the way that generation chose Vercel to run their web apps. "Deploying agents" becomes a one-line command, and the agent-runtime category is a recognized line item in every infrastructure budget.

### Target group

**Primary:** Applied-AI engineering teams at Series A-D startups (5-50 engineers) shipping production agents. The team has one tech lead who chose the agent stack and is held accountable for its reliability and cost.

**Secondary:** Platform engineering teams at Series C-D companies (50-300 engineers) standardizing agent infrastructure across multiple product teams.

**Out of scope:** Hobbyists (no spend), enterprise IT (selling cycle is too long for current motion), researchers (use cases are not production-shaped).

### Needs

1. **Run long-lived agents reliably.** Multi-hour or multi-day execution without losing state.
2. **Control cost.** Hard ceilings per agent run, per tenant, per workflow.
3. **Observe what the agent did.** A timeline of every tool call, prompt, and decision -- replayable.
4. **Recover from failure.** Resume from the last good checkpoint without re-running the whole agent.
5. **Move fast.** Deploy a new agent version in under 90 seconds.

### Product

Helix is a managed runtime for AI agent backends. Three layers:

- **Runtime:** Long-lived execution with persistent state, durable retries, cost ceilings.
- **Observability:** Replayable timelines, prompt-level tracing, structured eval hooks.
- **Tooling:** Local dev parity, CI integration, framework adapters (LangGraph, Mastra, Vercel AI SDK).

### Business goals

- $50M ARR by Q2 2029 (current: $4.2M ARR Q2 2026)
- 250 paying teams (current: 40)
- 85% net dollar retention (current: 108%)
- Category recognition: "agent runtime" is named in two of the top-five industry analyst reports by 2028

## 3. Positioning (Crossing the Chasm)

| Dimension | Helix | Lambda / Modal | Self-hosted |
|-----------|-------|---------------|-------------|
| Built for agents | Yes | No (generic compute) | DIY |
| Long-running state | First-class | Workarounds | DIY |
| Replayable timelines | First-class | None | DIY |
| Cost ceilings per run | Built-in | None | DIY |
| Time-to-first-agent | <1 hour | 1-2 weeks | 1-3 months |

**Chasm-crossing evidence we need:** by end of 2026, four named reference customers at >$100K ACV, plus two Fortune-2000 logos in pilot.

## 4. Non-goals (what Helix will not do)

- **General-purpose PaaS.** We will not host web apps, batch jobs, or non-agent workloads. If a customer wants Lambda, we will recommend Lambda. This focus is the source of our edge.
- **Build the agent framework.** LangGraph, Mastra, and the Vercel AI SDK already exist. We integrate; we do not compete.
- **Self-hosted enterprise SKU before 2028.** It is a category-changing investment and a distraction in the wedge phase.

## 5. Future press release (Q2 2029)

> **Helix Crosses 250 Paying Teams; Agent Runtime Becomes a Standard Infrastructure Category**
>
> *San Francisco, 2029-05-22* -- Helix Platform announced today that its managed agent runtime now powers production agents at more than 250 engineering teams, including 14 of the Fortune 500. The milestone marks the maturation of "agent runtime" as a distinct infrastructure category, recognized in the 2029 Gartner Hype Cycle for Cloud Computing.
>
> "Three years ago, every applied-AI team was rebuilding the same infrastructure," said Mira Chen, CEO of Helix. "Today they pick Helix and ship in days. We turned the agent stack into a deploy-once decision."
>
> Customers report a median 4x faster time-to-production for new agents and a 60% reduction in infrastructure-related incidents. Helix added 210 new customers in the past 12 months, growing ARR from $4.2M to $50M.

## 6. What changes if this vision is right

- **Hiring filter.** We hire for agent-runtime depth, not generic infra depth.
- **Roadmap filter.** Every initiative is scored against "moves us toward the Promised Land for the target group." If it does not, it is descoped.
- **Pricing.** We price per agent-run, not per CPU-minute. Pricing tracks the unit of value.
- **Partnerships.** We integrate deeply with the top three agent frameworks; we do not partner with general PaaS vendors.

## Why this works

- The vision opens with a Raskin narrative (Change -> Stakes -> Promised Land -> Obstacles -> Evidence), giving every Helix employee a memorable 60-second story.
- The Pichler Vision Board forces the team to name the *target group* tightly and the *non-goals* explicitly. Both prevent scope drift.
- Crossing the Chasm positioning anchors the competitive story; the chasm evidence is measurable, not aspirational.
- The future press release is a forcing function -- if leadership cannot agree on the press release, they do not yet agree on the vision.
- Non-goals are spelled out, not implied. Saying "no general PaaS, no agent framework, no self-hosted before 2028" makes the strategy auditable.

## What's next

- Cross-link to `../brainstorm-okrs/` to derive 2026 OKRs from this vision.
- Run `../north-star-metric/` to formalize "weekly active agent runs" as the NSM with input metric tree.
- Use `../outcome-roadmap/` to translate the 3-year vision into a Now/Next/Later roadmap.
- Use `../roadmap-communication/` to produce exec, customer, and engineering variants of the roadmap that ladder to this vision.
- Re-review the vision document quarterly; archive deprecated versions with date and rationale.
