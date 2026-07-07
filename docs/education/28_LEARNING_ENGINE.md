# Learning Engine

> Status: v1.0 — 2026-07-07, implemented in `platform/src/modules/learning/` (41 unit tests). This doc records the v1 algorithms and parameters; tune only with data (docs/research/62), never by taste.

## Mastery Model (per concept, 0..1)

- Correct answer: `mastery += (1 − mastery) × gain`, gain by question weight — 1pt: 0.25, 2pt: 0.35, 3pt: 0.45.
- Wrong answer: `mastery ×= 0.6`, lapse counter increments.
- Multi-concept questions update every linked concept; reported before/after is the average.

## Spaced Repetition (SM-2-lite)

Intervals **[1, 3, 7, 16, 35] days**. Advance only on correct-when-due (or first answer); answering early while not due leaves the schedule untouched — drilling cannot inflate intervals. Wrong → consecutive-reps reset, due again in 1 day.

## Practice Session Builder

Priority order: **(1) due reviews** (most overdue first; never prerequisite-gated — spaced repetition owns already-studied concepts) → **(2) weak concepts** (mastery < 0.8, weakest first) → **(3) new concepts** in topic order. Hard rules: a weak/new concept is eligible only when its prerequisites are ≥ 0.5 mastery (the knowledge graph gate — never drill roundabouts before priority rules); questions answered correctly in the last 2h excluded; round-robin across concepts for variety; sessions return fewer questions rather than violate gating.

## Readiness Score v1

`score = 100 × Σ(difficulty × mastery × recency) / Σ(difficulty)` over **all** concepts — unseen concepts count as 0, which is the built-in coverage penalty. Recency: 1.0 within 7 days of last practice on the concept, decaying linearly to a 0.5 floor at 30 days. Output: overall score, per-topic scores, top-5 weakest concepts. **v2 (post-sprint): calibrate against real exam outcomes users report — the score must become a validated predictor (docs/research/62), not a heuristic.**

## Content Status Policy

- **Practice/micro:** `draft`, `approved`, and `needs-review` all eligible (flagged items still teach; their issues are wording-level).
- **Mock exams:** `draft` + `approved` only — `needs-review` NEVER appears in an exam (an exam must not contain a question we wouldn't defend).
- `QuestionAttempt.points` stores the question's official weight (1/2/3), not points earned (derivable from `correct`).

## Known v1 Limitations (revisit with data)

Fixed gains/decay parameters (no per-user learning-rate estimation) · recency window is heuristic · question order within a concept is deterministic (add seeded shuffle) · no interleaving policy across topics yet · readiness uncalibrated until real exam-outcome feedback exists.
