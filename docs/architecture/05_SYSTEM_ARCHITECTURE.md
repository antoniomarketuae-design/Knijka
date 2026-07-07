# System Architecture

> Status: v1.0 — sprint architecture (2026-07-07). Deliberately simple where simplicity wins hours; module boundaries deliberately strict where future scale depends on them. Evolves with ADRs.

## Repository Layout

```
E:\AI driver
├── docs/           # source of truth (this tree)
├── content/        # versioned learning content (JSON) — see content/SCHEMA.md
├── platform/       # Next.js app: web platform + PWA + simulator module
└── spike/          # throwaway prototypes (e.g. vehicle-feel); never imported by platform
```

One deployable app for the sprint (platform). Modularity is enforced by folder boundaries and interface contracts inside it — not by premature microservices. Migration path to services exists per module (below).

## Platform Modules (`platform/src/modules/`)

| Module | Responsibility | Never does |
|---|---|---|
| `auth` | Accounts, sessions, GDPR consent flows | Business logic |
| `learning` | Curriculum, knowledge graph, mastery model, adaptive practice, spaced repetition | UI, LLM calls |
| `exam` | Mock exams (45q/97pt/87/40min per doc 32), scoring, attempt history | Content authoring |
| `tutor` | AI tutor: retrieval over `content/` + law corpus, Claude API calls, per-user context | Free-recall legal answers (ADR-002) |
| `gamification` | XP, levels, streaks, achievements, daily goals | Learning decisions |
| `analytics` | Event ingestion, readiness score v1, progress reports | — |
| `payments` | One-time packs, entitlements (doc 41 pricing) | — |
| `sim` | The 3D simulator (R3F): vehicle, world, procedures, rule engine, lessons, debrief handoff | Direct DB access — talks through `learning`/`analytics` APIs |

**The rule that matters:** modules communicate through typed interfaces in `platform/src/modules/<name>/index.ts` (its public API). No cross-module imports of internals. Business logic stays out of React components. This is what makes every subsystem replaceable (vision requirement) without paying a distributed-systems tax during the sprint.

## Sim Module Internals (`modules/sim/`)

`engine/` (R3F scene, loop) · `vehicle/` (Rapier controller, ADR-005) · `world/` (district loader from OSM-derived data, signals) · `procedures/` (pre-drive sequence state machine) · `rules/` (rule engine v1: pure functions over sim state ticks → violations/events; zero LLM, zero latency — ADR-002) · `lessons/` (lesson definitions: objectives, triggers, scoring rubric mirroring official taxonomy doc 32) · `traffic/` (scripted spline followers) · `hud/`.

Rule engine events flow to `analytics` (telemetry) and `tutor` (debrief input). The knowledge graph links sim mistakes ↔ theory concepts — the closed loop no competitor has (doc 41 gap #3).

## Data Model (Prisma/Postgres — core entities)

`User` (+ consent, birth year) · `Progress` (user × concept mastery, spaced-rep state) · `QuestionAttempt` · `ExamAttempt` · `SimSession` (lesson, events JSON, score) · `Entitlement` (pack purchases) · `GamificationState` (xp, streak, achievements) · `TutorConversation`. Content (topics/concepts/questions/signs) is **file-based JSON in `content/`** for the sprint — versioned in git, loaded/validated at build time, seeded to DB read-models. DB-backed content authoring comes post-sprint (doc 61 pipeline).

## AI Layer (ADR-002 hybrid, sprint slice)

1. **Rule engine** — deterministic, in sim tick loop.
2. **Content bank** — `content/` JSON + law summaries; tutor answers = retrieval + citation, template-first.
3. **LLM (Claude API)** — tutor dialogue, lesson debriefs, weekly progress synthesis. Server-side only, cost-instrumented from day one (doc 60), per-user daily budget caps.

## Cross-Cutting

- **Delivery:** Vercel (or equivalent) for platform; PWA manifest for app install. Sim assets (glTF/textures) on CDN with aggressive caching.
- **Observability:** structured event log from day one (every learning event is also product analytics — doc 62 depends on it).
- **Security/GDPR:** minors' data → minimal PII, consent gates, EU region hosting, export/delete endpoints (legal/50). No biometrics (ADR-004).
- **i18n:** Bulgarian-first; all strings externalized — country packs are content + locale, not forks (doc 61).
