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

### 2a. Quality & Innovation program — `docs/simulation/82` (opened 2026-07-25)
The founder's verdict was *"a very basic Minecraft server with a car"*. Doc 82's finding: the renderer is the **strongest** part of the product; the worlds are empty. Four parallel workstreams:
- [x] **§2 Performance envelope (desktop half)** — the three budgets (phone/laptop/desktop) are transcribed into `environment/perfBudget.ts` and unit-tested; `PerfProbe` scores real per-second windows against them and emits a markdown artifact via `platform/scripts/perf-report.mjs`. §2.3's four structural fixes landed and are measured in §2.5: composer code-split (**−431 KB** of must-execute JS), device-signal tier seed (**−5.22 MB** on a phone's first visit), `suv_boxy_lux` out of the tier-`low` pool (−54k tris / −16 draws), `webglcontextlost` telemetry.
- [ ] **§2.4 THE PHONE GATE — still open, and every §2.2 number is a prediction until it closes.** A €125 Galaxy A16 over `chrome://inspect`, one 60-second `?simPerf=1` run, artifact committed to `docs/simulation/perf/`. Also unchecks `docs/simulation/68:191`. **Emulators do not emulate the GPU and will give a false green.**
- [~] **§3 Visual plan / §4 Feel plan** — the ~14 h P0 bundle (V1 lane markings · V2 cloud layer · V3 Vitosha ridge) and the feel work. In flight; the lanes tick their own items.
- [~] **§5 Genuine innovation** — the section that answers *"innovative"* (prettier is only §3). In flight.
- [ ] **Black rear-view mirror** (§3.2, §8) — `MirrorRig.tsx` has a real 256×96 render target but the glass renders solid black in the driver's eyeline. Re-confirmed 2026-07-26. 0.5 h, "fix immediately".
- [x] **§8 small corrections — 6 of 7 closed** (2026-07-26). Rule-catalog count in the tutor's retrieval header, the `public/sim/` licence register (now a *loaded-by* table, not an inventory), the tier-seed test, the dead `useAutoQualityProbe` export (recorded, deliberately not wired — it would change tier mid-drive). Remaining: the mirror, above.
- [x] **Asset hygiene** — 210 clip PNG keyframes (**247.3 MB**) pruned after verifying the manifest names only the WebP set, and `sky_clear_1k.hdr` (**1.5 MB**, referenced by nothing) removed from the deploy. `public/` fell 492.5 MB → 255.2 MB; the *deployed* half 181.0 → 179.6 MB.
- Not to be done: **§7** is a list of expensive things that would not help — `PERCEPTUAL_ROAD_SCALE` in particular (§3.3) is pinned by dozens of absolute-coordinate tests and would misfire the rule engine.

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
*Last updated: 2026-07-27 — **SESSION STATE AT COMPACTION.** Two workflows RUNNING (resumed after a
desktop-app crash): `wf_179dd1f4-1e7` = the founder verdict-board fixes (42 items -> 9 root causes: signs
drawn by code overflow their borders / car inside the junction / 4-mini-roundabouts / conflicts that do not
conflict / sign-vs-marking contradictions / broken geometry / no motive / collisions that should be
near-misses / **the founder ruled: COMPLETE 3D INSTRUMENT CLUSTER**), and `wf_e825fca9-32d` = the P7 hazard
engine. CRASH RECOVERY VERIFIED: backup branch `claude/crash-recovery-2026-07-26` (3,082 files, pushed),
git fsck clean, 64 sign SVGs valid, 592 content JSON valid, tsc 0 before resume. **Read the curated recap
`~/.claude/recaps/AI driver/2026-07-27.md` — it holds the full state, the deferred list and the founder-only
actions.** DEFERRED: hero car (needs a FRESH session + live Blender — proven that blind headless sculpting
fails; capital-B mcp__Blender__* does NOT speak this addon protocol), P8 (all 4 parts, founder approved),
the P7 clip batch, the tutor voice (blocked on the founder audition).*

*Last updated: 2026-07-26 — the **Simulator Quality & Innovation program** (docs/simulation/82) opened §2a above. Landed so far: the §2 performance envelope's desktop half + its four structural fixes, and 6 of the 7 §8 corrections including 248.8 MB of verified-unreferenced assets pruned. The one thing that would change the founder's verdict and has NOT happened is **§2.4, the phone measurement** — nothing in §2.2 is evidence until an A16 log is committed.*

*Previously updated: 2026-07-25 — FULL AUDIT (docs/80_FULL_AUDIT_2026-07-24.md) executed in full at commit 165a58b: 1005/1089 questions approved, answer-leak + 4 rule-engine false-fails + GDPR + entitlements + perf + ops + 2 innovations shipped. Gate: tsc 0 / 7281 tests / build OK.*

*Previously updated: 2026-07-21. When you touch a component, update its checkbox + status here.*
