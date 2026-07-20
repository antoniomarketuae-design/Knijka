# AI Driving Academy (working name)

AI-powered driving education platform: Bulgarian theory academy (adaptive practice + AI tutor + official-format mock exams) fused with a browser driving simulator (cockpit-first, real Sofia street topology, rule-engine scoring). B2C, 17–18-year-olds, Bulgaria first.

## Source of truth

`docs/` — start at [docs/README.md](docs/README.md). Key: 00 vision · 01 north star · 04 MVP scope (240h sprint tiers) · architecture/05 module boundaries · architecture/07 ADRs · education/32 exact exam format · business/41 competitors/pricing · development/51 execution plan. **Code follows docs; changes to strategy/architecture get an ADR first.**

## Hard rules

- North star test for every feature: does it produce safer, more competent real drivers?
- Theory-module requirement-zero (doc 64 THEO-4, founder-ratified): every theory feature must act as a **virtual driving instructor that explains every decision** — no bare correct/wrong verdicts anywhere, ever. A theory PR states how it serves this.
- ADR-001 fictional vehicles (no real brands) · ADR-002 hybrid AI (rule engine real-time, content-bank grounding, LLM for dialogue/debriefs only — the AI must NEVER free-recall Bulgarian law; retrieval + citation only) · ADR-003 no certificates · ADR-005 Three.js+R3F+Rapier, browser-first.
- Content: original questions only (never copy official listovki), every item cites `lawRefs`, `status: draft` until reviewed. Contract: [content/SCHEMA.md](content/SCHEMA.md).
- Mock exam format is law: 45 questions / 97 points / ≥87 pass / 40 min / 1-2-3 weights (docs/education/32).
- Modules talk only through their public `index.ts` APIs (docs/architecture/05). No cross-module internal imports. Business logic out of components.
- GDPR: users are minors — minimal PII, consent gates, no biometrics (ADR-004).

## Layout & commands

`platform/` Next.js app (TS, Tailwind, App Router, src dir) — `npm run dev` inside. `content/` versioned JSON learning content. `spike/` throwaway prototypes, never imported.

## Two-developer mode

Two developers (each with their own Claude) share this repo. **Before starting ANY work item, follow [docs/development/61_TWO_DEV_COLLABORATION.md](docs/development/61_TWO_DEV_COLLABORATION.md)**: claim the item first (GitHub Issue self-assign), work on your own branch (`<name>/<slug>`), full gate before PR, never commit to the integration branch directly. Staging = the `vps` remote's `/opt/knijka/deploy.sh` (doc 61 has the details).
