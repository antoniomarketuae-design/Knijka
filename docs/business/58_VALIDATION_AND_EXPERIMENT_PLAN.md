# Validation and Experiment Plan

> Status: skeleton — 2026-07-07. Hypotheses inherited from [56_VISION_ANALYSIS_AND_CRITIQUE.md](../56_VISION_ANALYSIS_AND_CRITIQUE.md) §4. To be expanded into concrete experiments once founder questions (56 §7) are answered.

## Principle

The vision assumes; the company tests. Every horizon gate requires its riskiest hypotheses validated with real users or real money — not opinions.

## Hypothesis Backlog

| # | Hypothesis | Validation method (draft) | Status |
|---|-----------|---------------------------|--------|
| A1 | Students pay for premium AI theory prep | H0 launch with paid tier; landing-page pre-orders before that | Untested — price anchors researched: €9.90/3mo incumbent exists; our rec. €9.99–14.99 one-time (doc 41) |
| A2 | Schools pay per-student for digital tooling | 5–10 discovery interviews with Bulgarian driving-school owners | Untested |
| A3 | Sim practice improves real pass rates | Cohort tracking vs national average (H1+); literature review first | Untested |
| A4 | Target students have capable hardware | Survey in H0 app + market device data | De-risked by browser delivery targeting Iris Xe-class laptops (ADR-005); confirm via survey |
| A5 | Regulatory recognition of sim hours achievable | Interviews: ИААА (Автомобилна администрация), school associations | **Invalidated for now** — 2019 proposal (4 of 31h) rejected; nothing in 2026 drafts. France (10/20h since 2019) is the advocacy precedent; revisit with efficacy data (docs 31, 41) |
| A6 | AI tutoring fits unit economics | Cost instrumentation in H0 tutor from day one | Untested — hybrid architecture (ADR-002) designed to make it true |
| A7 | Medium fidelity educationally sufficient | Literature review (45/46) + H1 A/B where feasible | Supported — TU Delft (n=23,000, NL): sim-trained students pass ~34% more often; formal review pending |
| A8 | Parents influence purchase | H0 checkout data: who pays? | Untested |

## Horizon Gates (draft)

- **Gate H0→H1:** A1 validated (paying users), A2 signal (≥1 school pilot agreed), A6 measured.
- **Gate H1→H2:** A3 early evidence, A4 answered, retention of sim users demonstrated.
- **Gate H2→H3:** B2B revenue repeatable; efficacy data publishable.
