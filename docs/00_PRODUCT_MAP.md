# Product Map — the master "did we forget anything?" checklist

> **Purpose.** The single place listing EVERY major product component + its status. **Read this FIRST at the start of every session**, before diving into any task.
>
> **Why it exists.** Created 2026-07-21 after **Half A (the ~500 sign/picture "why-wrong" visuals) was nearly lost** — task-memory tracked the *active work* (the reels) but not the *whole vision*, so a huge component silently fell off the radar. The founder remembered it; the system didn't. This file is the fix: task-memory = what we're doing NOW; **this = the WHOLE thing, so nothing gets dropped.**
>
> **Rule:** if a real component isn't on this list, ADD it. Update statuses each session.

---

## 1. Theory Academy — 1,089 questions
- [x] Question bank: 1,089 questions (`content/questions/*.json`), `status: draft` until reviewed, every item cites `lawRefs`
- [x] Adaptive practice + official-format mock exams (45q / 97pts / ≥87 pass / 40 min / 1-2-3 weights)
- [ ] **Interactive "why wrong / why right"** — the founder's CORE vision (THEO-4: no bare correct/wrong; a virtual instructor explains every decision). **TWO HALVES — do not forget either:**
  - [~] **HALF A — sign/rule/picture questions (504):** SCOPED 2026-07-21 — **0 new artwork needed.** Only **~101 are picture-relevant** (57 sign-recognition, 32 priority/right-of-way, 12 markings); the other **~403 are text-knowledge** (fines/docs/definitions) already served by `WhyPanel`'s text + citations. Components already exist: `QuestionMediaView`/`SignFace`/`SceneStill` (theory/QuestionMedia.tsx, SceneStill.tsx) render sign faces + procedural top-down diagrams from data; art is 100% covered by the 64-sign SVG catalog (content/signs/) + 88 procedural district maps (public/world/). **BUILD = (1) a picture-card path in `WhyPanel` (show the question's media + highlight the correct option, for Half A where sim===null), (2) a data pass: ~28 of the ~101 picture-relevant questions lack media → add a `signRef` or `sceneStill` spec (73 already wired).** Net-new drawings: 0.
  - [~] **HALF B — driving-behavior questions (~585):** Why-wrong = a **3D sim REEL**; behaviors cluster into **45 mistake-types**. **STATUS (2026-07-21 eve):** resolver DONE (EVENT_TO_SCENARIO); all 20 wire-ups wired (plan = 39 clips). Of the 19 new reels rendered: **12 OK, 7 to FIX** (6 missing their key actor + 1 timeout — see recap). Still TODO: **Claude-R0 the 12 vs the fidelity checklist**, **fix the 7**, **build the 5 new scenarios** (2 need assets), + the 2 pilot taste-pass fixes. Original 20 pilot reels: taste-pass #1 done, 6 verified, emergency-lane + overtake-ban still open.
  - Also: ~504 questions have no mistake-type mapped yet → text-only → a mapping pass (Task B) assigns them to the 45 types.
- [ ] AI tutor (LLM dialogue over the content bank; retrieval + citation only, never free-recall of law — ADR-002)

## 2. Simulator
- [x] 150 scenario templates (18k+ exam variants); cockpit-first, real Sofia topology, rule-engine scoring
- [x] Headless clip renderer — Claude produces reels himself, no founder browser
- [ ] Founder visual audit of all 150 scenarios (the review-reel; the Half-B reels double as this)
- [ ] 2 pilot taste-pass fixes still open: emergency-lane hard-block, overtake-ban reframe

## 3. Infra / ops
- [x] Staging (VPS `knijka` :3100 + rotating cloudflare quick-tunnel), two-dev protocol, CI gate
- [ ] Stable NAMED staging tunnel (fixed domain — the quick-tunnel URL keeps rotating/lost)
- [x] Node 24.18 on the dev box; openclaw (founder's other assistant) restored + healthy

## 4. Continuity system — LIVE (hooks in `.claude/settings.local.json`, verified firing 2026-07-21)
- [x] **This Product Map** — auto-injected at **SessionStart + PostCompact** (so the full vision returns after every compaction).
- [x] **Auto transcript snapshot** — **SessionEnd** hook copies every session's transcript to `E:\ai-driver-recaps\raw\` — fully automatic, no dependence on Claude.
- [x] **Persist reminder** — **PreCompact** hook nudges Claude to update this Map + write a curated recap before context is summarized.
- [~] **Curated dated recaps** — `E:\ai-driver-recaps\<date>.md`, written by Claude when reminded (the raw snapshot above is the lossless backstop).
- Hook scripts: `.claude/hooks-inject-map.js`, `-precompact.js`, `-sessionend.js`. Task-memory keeps the ACTIVE thread; this Map = the whole vision.

---
*Last updated: 2026-07-21. When you touch a component, update its checkbox + status here.*
