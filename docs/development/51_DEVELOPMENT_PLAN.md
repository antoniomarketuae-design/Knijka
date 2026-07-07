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

## Live Status (updated 2026-07-07, end of day 1)

- ✅ **P0 Foundations** — repo, scaffold, Prisma data model, auth, local DB, deploy-ready build
- ✅ **P1 Content** — 16 topics, 152 concepts, **680 audited original questions** (waves 1+2), 64 signs; 188 flagged for founder review (excluded from exams); review file: content/review/FLAGGED-FOR-REVIEW.md
- ✅ **P2 Learning Core** — practice engine (mastery, SM-2-lite, prerequisite gating), official-format mock exams (45/97/87/40:00), theory + exam UIs, readiness v1; verified end-to-end in browser
- ✅ **P3 Monetization layer** — AI tutor (grounded, cost-tracked; awaiting ANTHROPIC_API_KEY), gamification (XP/streaks/achievements/missions), Stripe one-time packs + free-tier quotas (awaiting Stripe keys)
- ✅ **P4 Sim Core (foundations)** — vehicle physics in /simulator (harness = CI gate), Sofia Студентски град district from OSM (doc 17), rule engine on official taxonomy + 13-step pre-drive machine
- ⏭ **P5 next** — assemble driving lessons: district rendering in the sim scene, SimTick emission from the 3D world to the rule engine, 8 scored lessons, AI debrief wiring
- Then **P6** — PWA packaging, onboarding, landing polish, deploy, content review pass, launch
- Tests: **340 passing** · build green · ~23 commits
