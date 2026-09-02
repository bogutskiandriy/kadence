# North Star Metric Specification

**Team / Product:** [Team name]
**Author(s):** [PM, exec sponsor, data lead]
**Date:** [YYYY-MM-DD]
**Review cadence:** Quarterly
**Status:** [Draft / Approved / In production]

---

## 1. The North Star Metric

**NSM name:** [The single number, written as a complete metric name]

**Definition:** [Plain-language definition that a new hire can understand]

**Archetype:** [Attention / Transaction / Productivity / Communication / Subscriber]

**Current value:** [Most recent number]
**Target value:** [Goal]
**Target date:** [YYYY-MM-DD]

**Why this metric:**
[2-3 sentences explaining why this metric represents the value the product delivers.]

**Rejected alternatives:**
- [Candidate 1]: rejected because [reason]
- [Candidate 2]: rejected because [reason]

---

## 2. Five-test scorecard

| Test | Pass? | Notes |
|------|-------|-------|
| Customer value: NSM up = customer got more value | [Yes/No] | |
| Strategic alignment: matches how we make money | [Yes/No] | |
| Leading, not lagging: predicts long-term success | [Yes/No] | |
| Single number: one dashboard tile | [Yes/No] | |
| Movable: team can affect within a quarter | [Yes/No] | |

---

## 3. Input metrics

**Formula:** `NSM = [explicit math relating inputs to NSM]`

| # | Input name | Current | Target | Target date | Owner |
|---|------------|---------|--------|-------------|-------|
| 1 | [Input metric] | [val] | [val] | [date] | [name] |
| 2 | [Input metric] | [val] | [val] | [date] | [name] |
| 3 | [Input metric] | [val] | [val] | [date] | [name] |
| 4 | [Input metric] (optional) | [val] | [val] | [date] | [name] |
| 5 | [Input metric] (optional) | [val] | [val] | [date] | [name] |

---

## 4. Leading indicators

Per input, 2-3 indicators that move BEFORE the input does.

### Input 1: [name]

- [Leading indicator 1 -- moves how far in advance?]
- [Leading indicator 2]
- [Leading indicator 3] (optional)

### Input 2: [name]

- [Leading indicator 1]
- [Leading indicator 2]
- [Leading indicator 3] (optional)

### Input 3: [name]

- [Leading indicator 1]
- [Leading indicator 2]

### Input 4: [name] (optional)

- [Leading indicator 1]
- [Leading indicator 2]

### Input 5: [name] (optional)

- [Leading indicator 1]
- [Leading indicator 2]

---

## 5. Anti-metrics (must NOT move in the wrong direction)

| Anti-metric | Threshold | Current | Owner |
|-------------|-----------|---------|-------|
| [Metric] | [e.g., "must stay below 4.0%"] | [value] | [name] |
| [Metric] | [threshold] | [value] | [name] |

---

## 6. Counter-metrics (business protection)

| Counter-metric | Threshold | Current | Owner |
|----------------|-----------|---------|-------|
| [Metric] | [e.g., "must stay above 18%"] | [value] | [name] |

---

## 7. JSON spec (for `metric_tree_builder.py`)

```json
{
  "nsm": {
    "name": "[NSM]",
    "archetype": "[productivity|attention|transaction|communication|subscriber]",
    "formula": "[explicit formula]",
    "current": 0,
    "target": 0,
    "due": "YYYY-MM-DD"
  },
  "inputs": [
    {
      "name": "[Input 1]",
      "formula_role": "[role in formula, e.g., 'WAU' or 'sessions per WAU']",
      "current": 0,
      "target": 0,
      "leading_indicators": [
        "[Lead 1]",
        "[Lead 2]"
      ]
    },
    {
      "name": "[Input 2]",
      "formula_role": "[role]",
      "current": 0,
      "target": 0,
      "leading_indicators": [
        "[Lead 1]",
        "[Lead 2]"
      ]
    }
  ],
  "anti_metrics": [
    {"name": "[Anti-metric 1]", "threshold": "[threshold]"},
    {"name": "[Anti-metric 2]", "threshold": "[threshold]"}
  ],
  "counter_metrics": [
    {"name": "[Counter-metric 1]", "threshold": "[threshold]"}
  ]
}
```

---

## 8. OKR alignment

| OKR Key Result | Which input it moves |
|----------------|----------------------|
| [KR1] | [Input #] |
| [KR2] | [Input #] |
| [KR3] | [Input #] |

---

## 9. Approval

- [ ] All 5 tests pass
- [ ] Formula verified against last quarter's actuals
- [ ] Leading indicators move before inputs (verified)
- [ ] At least 2 anti-metrics and 1 counter-metric with thresholds
- [ ] Sponsor sign-off

**Sponsor:** [Name]
**Sign-off date:** [YYYY-MM-DD]
**Next review:** [YYYY-MM-DD]
