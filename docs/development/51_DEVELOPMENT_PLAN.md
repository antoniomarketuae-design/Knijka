# Development Plan — 240-Hour Sprint

> Status: v1.0 — 2026-07-07, execution live. Scope authority: [04_MVP_SCOPE.md](../04_MVP_SCOPE.md). Method: founder + Claude, aggressive subagent parallelization with **audit gates** — parallel agents produce, dedicated auditors verify, CTO (Claude) reviews before merge. Nothing enters `main` unaudited.

## Execution Model

- **Inline (main session):** architecture contracts, scaffolding, integration, module wiring, code review of agent output, commits.
- **Agent fleets (parallel):** content generation (topic-partitioned), isolated feature modules, spikes. Partitioned by file path to avoid conflicts; worktree isolation where they'd collide.
- **Audit gates:** every fleet has a verification stage (schema validity, legal accuracy flags, exam-format compliance, build passes). Founder reviews Bulgarian content quality — the human loop of doc 61.

## Phases (hours are budget, not calendar)

| Phase | Hours | Contents | Gate |
|---|---|---|---|
| **P0 Foundations** | 0–20 | Repo, scaffold, data contracts, Prisma schema, auth, CI basics, deploy pipeline "hello world" live | App deploys; schema migrates |
| **P1 Content Wave 1** (parallel from h1) | agent-time | Curriculum + knowledge graph + ~300 draft questions + core signs, audited | JSON valid; audits pass; founder spot-review |
| **P2 Learning Core** | 20–60 | Practice engine, mastery model, mock exam (45/97/87/40), mistake review, readiness v1 | Full theory loop usable end-to-end |
| **P3 Tutor + Gamification + Payments** | 60–90 | AI tutor (grounded, cited), XP/streaks/achievements, dashboard, one-time packs | Payable product exists |
| **P4 Sim Core** | 30–110 (parallel track from h30) | Vehicle feel (spike → module), district from OSM, pre-drive procedure, rule engine v1 | **Hour-40 fallback checkpoint (ADR-005):** car feels credible or switch to Unity Web |
| **P5 Sim Lessons** | 110–170 | 8 scored lessons, micro-quizzes, scripted traffic, AI debrief, sim↔graph integration | Lesson loop: drive → score → debrief → readiness updates |
| **P6 Polish & Launch** | 170–240 | PWA, onboarding, landing, content review pass, cross-device QA, monitoring, launch | Sprint success criteria (doc 04) all green |

## Standards (sprint-weight)

TypeScript strict everywhere · module public APIs only (doc 05) · every content item `status`-tracked · conventional commits · main always deployable · secrets in env, never committed · cost instrumentation on every LLM call. Full standards doc (52) grows as patterns settle — rules are added when a second instance appears, not speculatively.

## Live Status

- ✅ P0 started: repo initialized, docs committed, scaffold running, content contracts published
- 🔄 P1 launched: content factory workflow (curriculum architect → per-topic question writers → per-topic auditors → graph consistency) + sign-catalog agent
- 🔄 Vehicle-feel spike agent launched (P4 de-risk, feeds hour-40 checkpoint)
