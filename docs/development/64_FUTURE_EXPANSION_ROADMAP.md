# 64 · Future Expansion Roadmap — the living master backlog

> **Founder's law for this file:** never delete ideas — group them, merge
> duplicates, keep organized, write as professional product requirements.

**Maintenance rules:** append and merge, never remove. A superseded idea is
marked `[MERGED → id]` or `[SUPERSEDED → id]`, keeping its text. Every
requirement carries: **What · Why (educational value) · Effort (S/M/L) ·
Deps**. Horizons: **Now** (current program: the doc 62 bug waves + D-programs),
**Next** (after the waves land), **Later** (needs prerequisites or a decision).
Modules: **Theory / Simulator / Platform / Infra**. Sources: doc 62 (founder
review R3), doc 63 (QA register), CLAIMS.md, PROGRESS.md, docs 65/71/72/76.

## 0. Horizon overview

| Horizon | Theory | Simulator | Platform | Infra |
|---|---|---|---|---|
| Now | — (design starts Next) | SIM-1…SIM-6 (D1–D6), SIM-7 assets | PLT-6 (726 questions review) | — |
| Next | THEO-1…THEO-4 (interactive redesign) | SIM-8…SIM-11 | PLT-1…PLT-5 | INF-1, INF-2 |
| Later | THEO-5 | SIM-12…SIM-16 | PLT-7, PLT-8 | INF-3 |

Open founder decisions are collected in §5 regardless of horizon.

---

## 1. Theory module

### THEO-1 · Scenario-based visual questions — **Next · L**

**What.** Replace press-correct/wrong text items ("raw, not interactive,
boring" — founder) with visual, situational question types:

1. **Sign identification:** photo/render of a sign, 3–5 answer options.
2. **Intersection "what happens next":** image of a junction state → choose
   the correct next action.
3. **Situation classes to cover (each a template family):** priority /
   right-of-way · roundabout entry and exit · zebra/pedestrian scenes (incl.
   the turning-car case: signal? wait? yield?) · traffic lights and phases ·
   lane choice and positioning · overtaking legality · parking legality ·
   highway/motorway conduct · weather-dependent rules · night driving ·
   emergency situations.

**Why.** P3: picture-first questions train recognition the way the road
presents it — visually, in context. The exam itself is image-heavy.
**Effort.** L (new question schema fields + renderer + authoring per family).
**Deps.** Content pipeline (docs/education/61); image/render source — the sim
itself can screenshot staged scenes (cheaper than illustration); content
schema rules stay: original questions only, `lawRefs` on every item,
`status: draft` until reviewed (content/SCHEMA.md).

### THEO-2 · Interactive feedback on every answer — **Next · M/L**

**What.**
- **Wrong answer →** an educational popup, never a bare "X": WHY it is wrong +
  the relevant image with the key element HIGHLIGHTED + a short animation +
  a 10–20 s mini reel of the situation playing out + an explicit
  wrong-vs-right comparison + the real-world consequence.
- **Correct answer →** a brief real-world reinforcement of WHY it was right —
  never a bare "Correct". Founder's canonical example: you proceed on green
  and a red-runner crosses — the reinforcement shows the defensive glance
  before proceeding that would save you even when you are in the right.

**Why.** P2 applied to theory: feedback is the lesson, not the verdict. This
is the why-window (P1) instantiated for theory answers.
**Effort.** M for the popup framework + reinforcement copy; L including reels.
**Deps.** THEO-1 imagery; reel source = the sim trace/ghost machinery (doc 76
§5) rendering 10–20 s clips — no bespoke video pipeline needed to start;
ADR-002: any generated explanation text must be retrieval+citation, never
free-recalled law.

### THEO-3 · Learning through mistakes (mistake-experience simulations) — **Next · L**

**What.** Guided simulations where the user INTENTIONALLY performs the wrong
action, then: **pause → explain → show the accident/dangerous outcome → cite
the violated rule (lawRef) → retry correctly.** Seed catalog (founder's list):

1. Crossing a zebra without stopping for the pedestrian.
2. Turning without a mirror check.
3. Ignoring a stop sign.
4. Speeding into a corner.
5. Tailgating.
6. Overtaking where forbidden.

Founder's framing: **"emotional learning instead of passive memorization."**

**Why.** The mistake, its consequence, and the rule arrive as one memory.
Doc 63 QA-S3 shows the inverse today: drills where no mistake is possible.
**Effort.** L (a mode + per-scenario consequence staging), but see the
alignment note — the machinery is substantially built.
**Deps / ALIGNMENT NOTE (important):** this is an **evolution of existing
machinery, not a new system**: the codebase already has **per-template mistake
trace demos — red ghosts** (doc 76 §5: incorrect demos are visually branded
red, narrated, and the student is never scored while the wrong way is shown)
and a **teach-first-then-grade engine**
(`platform/src/modules/sim/scenarios/policy.ts` `resolveEncounter`,
`coach.ts`, integrated in `lessons/engine.ts` `applyTick` — first minor
mistake teaches, repeats grade, dangerous errors always grade). The
mistake-experience mode composes: student drives the wrong way in a sandboxed
non-scored pass (teach-first already knows how to suppress scoring) →
consequence scene (D2 reels) → lawRef citation (already on every template) →
graded retry. New work is the consequence scenes and the mode UI, not the
grading or trace foundations.

### THEO-4 · The goal statement (product principle) — **Next · S**

**What.** Adopt as the theory module's requirement-zero, verbatim intent: a
**virtual driving instructor that explains every decision** — building safe
driving instincts, not exam-passing. Every theory feature PR must state how it
serves this (mirrors the north-star test in CLAUDE.md).
**Why.** Keeps THEO-1…3 from degenerating into prettier flashcards.
**Effort.** S (process rule). **Deps.** none.

### THEO-5 · Draft-bank graduation — **Now→Later (rolling) · M**

**What.** Review the **726 draft theory questions** to `approved`
(CLAIMS.md; the mock-exam generator already samples them under the official
45/97/≥87/40min format). Fold new THEO-1 visual types into the same review
gate. ~290 flagged questions noted in PROGRESS §7 are part of this pass.
**Why.** Bank quality is the ceiling on every theory feature.
**Effort.** M (editorial). **Deps.** founder/reviewer time; content SCHEMA.

---

## 2. Simulator module

### SIM-1 · Why-window on every drill (D1) — **Now · M**

**What.** P1, ordered for ALL content: a mini window showing **WHY, WHAT and
BECAUSE** — the reason for everything the platform asks. Per doc 62 triage:
the template teach/lawRef content ALREADY EXISTS; what is missing is the UI.
**Why.** Rules without reasons produce HUD-obedience (doc 63 §4).
**Effort.** M. **Deps.** none — data is in the templates; render as pre-drill
card + on-demand overlay.

### SIM-2 · Mistake-experience content in the sim (D2) — **Now/Next · L**

**What.** Consequence scenes/reels for the sim side of THEO-3: staged crash or
near-miss outcomes for the wrong action (first targets from QA: unmotivated
braking QA-35, truck-overtake QA-42, the P2 seed list).
**Why/Deps.** See THEO-3 alignment note — red-ghost + teach-first machinery
exists; scenes are the new asset class. **Effort.** L.

### SIM-3 · Unfailable-drill redesign (D3) — **Now · M/L**

**What.** Redesign the speed/lane family (QA-30/31/32/45/46/47) so every
drill has at least one failable decision; merge duplicates (31→30). Includes
**P5, the escalating speed-zone road:** a LONG road — sign 50 → hold under
50 → sign 30 → drop to 30 — signed, staged, failable. Detectors already live
(`NOT_KEEPING_RIGHT`, `POOR_LANE_KEEPING`, `WRONG_WAY`, speeding); the world
must create their conditions.
**Why.** QA-S3: a drill where no mistake is possible teaches nothing.
**Effort.** M per drill, L for the family. **Deps.** W-WORLD sign assets;
failability CI gate (doc 63 Part D #17) locks the class shut.

### SIM-4 · Micro-tutorials in context (D5) — **Now · M**

**What.** P4: pause-card quizzes at the point of need. **First: controller
postures** — 4–5 pictures of regulator postures + meanings BEFORE the graded
controller encounter (QA-20). Pattern: the existing MicroQuizOverlay
pause-and-card (alpha-recon doc 04 §4).
**Why.** Teach-then-grade instead of grade-blind.
**Effort.** M. **Deps.** posture imagery; multi-flip
`SignalControllerSchedule` (CLAIMS engine follow-up) for halt→proceed→halt.

### SIM-5 · Better NPC actors where the actor IS the lesson (D6) — **Now · L**

**What.** P6: bus (QA-26), child+ball (QA-27), white-cane pedestrian (QA-28),
bigger/better controller (QA-20). Already on CLAIMS as needs-asset; the R3
review RAISED their priority — absence makes drills "completely wrong."
**Why.** Occlusion, child-inference, and VRU-care lessons are impossible
without their actors.
**Effort.** L (rigs + behaviors). **Deps.** asset pipeline (Blender/Rodin per
doc 67 workflow); interim: staged held truck at BUS_OBSTACLE (open decision
§5).

### SIM-6 · Asset & dressing backlog (from CLAIMS, unchanged, grouped) — **Now/Next · M**

**What.** Motorcycle rig · sign faces (В25, В26-30/40, В28, А19, Д15/Д16,
end-of-limit, „при мокра настилка" plate, advisory plates 40/50/60, В2,
motorway exit boards) · rail/tram track paint · bus-stop dressing
(навес/зигзаг/джоб) · bike-lane paint · door-open prop · motorway
guardrail/мантинела · BUS lane decal · held-scenery one-liners
(sc-ac-night-overdrive stalled trailer, sc-hz-brake-dont-swerve debris,
sc-ln-obstacle-meeting, sc-vu-door-zone timed door, aqua/ice parapet rects) ·
hazard-light blink on stalled vans.
**Why.** Doc 63 §7: every missing item is a lesson rendered partially false.
**Effort.** S each, M as a program. **Deps.** none for the render-wiring
items (the m8 pattern — visuals driven by graded data).

### SIM-7 · World-truth and failability CI gates — **Now · M**

**What.** Two permanent gates (doc 63 Part D #17–18): (a) rendered signal
state == graded state each tick; every graded lawRef has its sign/marking in
the world; traces never intersect colliders; (b) every template can fail
under a naive run.
**Why.** Kills the QA-S1/S3/S4/blue-path classes permanently instead of
re-fixing per review.
**Effort.** M. **Deps.** the world-truth audit foundation already used for
copy fixes.

### SIM-8 · NPC actor library (doc 65 Phase 2 remainder) — **Next · L**

**What.** Cyclist (overtake clearance чл.42), tram (yield), bus-pullout
(чл.67-family — lawRef divergence is an open decision, §5),
emergency-vehicle (pull over). New traffic actor TYPES (today: cars +
pedestrians) — meshes, routing, detection; a traffic-system expansion, per
PROGRESS §5 its own focused effort.
**Why.** Highest remaining scenario coverage of the 45 canonical events
(1,016 questions → 45 events, ~58% simulatable).
**Effort.** L. **Deps.** SIM-5 rigs experience; drive-and-tune pass first
(PROGRESS §5 item 1).

### SIM-9 · Realistic traffic timing as invariant — **Next · M**

**What.** Generalize W-TIME: no encounter armed by wall clock alone;
player-relative arming everywhere; CI slow-drive run per template.
**Why.** QA-S2. **Effort.** M. **Deps.** W-TIME wave landing.

### SIM-10 · Signals/attention phase (doc 65 Phase 3) — **Later · L**

**What.** Gantry lane-control, dashboard telltales, driver-distraction,
animal hazard, parking scenarios, police-stop, accident-scene conduct.
**Why.** Broadens event coverage past junction priority.
**Effort.** L. **Deps.** SIM-8.

### SIM-11 · Camera/POV program — **Next · M**

**What.** Junction-framing assist (QA-18), working cockpit mirrors + chase
rear-awareness (QA-44), look-left/right edge-ping affordances (S5), then doc
73 head-turn/glance model.
**Why.** Perception channels ARE the graded skills.
**Effort.** M. **Deps.** W-COCKPIT wave.

### SIM-12 · Vehicle dynamics: ABS/threshold-braking feel (doc 65 Phase 4) — **Later · L**

**What.** Skid/aquaplane/ice + ABS/threshold braking — needs a new Rapier
friction/brake model. Deferred program, carried here so it is never lost.
**Why.** Emergency-stop feel is where "emotional learning" meets physics.
**Effort.** L. **Deps.** physics bandwidth; perf budget (doc 71).

### SIM-13 · Exam shells over d2-v1 (Лозенец) — **Later · L**

**What.** The next bank multiplier: route shells over the second district,
under the doc 72 §16 distinctness + innocent-bot contracts (currently 9
shells → **18,396 exam variants** on district-v1, which the shell axis
saturates — ADR: "a second district is worth more than any actor").
**Why.** Fresh, non-repeating mock routes at scale.
**Effort.** L. **Deps.** d2-v1 validation battery; SIM-14 visual pass
desirable first.

### SIM-14 · D2 buildings/visual pass — **Later · L**

**What.** The doc 71 program applied to d2-v1 (Лозенец): buildings, dressing,
lighting inside the WebGL perf budget.
**Why.** A second district that reads as a real place, not toy-town.
**Effort.** L. **Deps.** doc 71 pipeline (trim sheets, baking, KTX2/Draco).

### SIM-15 · Engine/content follow-ups (from CLAIMS, unchanged) — **Next · S/M**

**What.** sc-mfp-stream / sc-mfp-stream-2 hold.offsetM retune (3-car stream
collapses to a clump — harmless but dishonest) · accelerationLane zone kind →
keep-right exemption (merge-wave ticket) · multi-flip
SignalControllerSchedule · rx-map founder eyeball of sign placements.
**Effort.** S each. **Deps.** none.

### SIM-16 · Hero player car via Rodin (doc 67) — **Later · M**

**What.** Generate the hero vehicle per doc 67 spec through the Blender MCP +
Rodin pipeline (pending item, carried so it is not lost).
**Why.** Cockpit fidelity underpins SIM-11/doc 73.
**Effort.** M. **Deps.** Blender MCP session availability.

---

## 3. Platform module

### PLT-1 · Replay + before/after compare — **Next · M**

**What.** Record the student's kinematic trace, replay with violation markers;
overlay vs the blue ghost (doc 76 attempt-compare view, productized).
**Why.** Seeing your own mistake beats being told. **Effort.** M.
**Deps.** trace recorder (doc 76 machinery).

### PLT-2 · Session debrief + instructor voice — **Next · M/L**

**What.** End-of-session LLM debrief over trace + violations, citations from
the content bank only (ADR-002 — the AI NEVER free-recalls law); scripted
voice lines keyed to HudEvent kinds (doc 25) before any generative voice.
**Why.** The virtual-instructor goal (THEO-4) on the sim side.
**Effort.** M text, L voice. **Deps.** ANTHROPIC_API_KEY provisioning
(PROGRESS §7); THEO-2 popup framework reuse.

### PLT-3 · Adaptive difficulty + spaced repetition — **Next · M**

**What.** Feed violation/commendation streams into
`platform/src/modules/learning` (readiness, simFeed, store) to select drill
variants, pressure levels, and re-queue failed drills as scheduled review
(doc 30). Prerequisite fix: the difficulty governor becomes
per-lesson-domain aware (QA-37 / W-SPD).
**Why.** Mistakes become curriculum, not events. **Effort.** M.
**Deps.** W-SPD; SIM-3 variants to choose among.

### PLT-4 · Learning analytics & exam-readiness dashboard — **Next · M**

**What.** Per-concept mastery (152 concepts) + per-violation-code trends +
time-to-first-mistake on the dashboard; one combined "ready for the real
exam" score backed by unlimited fresh mocks from the 18,396-variant bank
(format fixed: 45q/97pts/≥87/40min).
**Why.** Doc 26 analytics vision, scoped to what the stores already hold.
**Effort.** M. **Deps.** none hard; PLT-3 enriches it.

### PLT-5 · Accessibility pass — **Next · M**

**What.** Colorblind-safe lamp/ghost palettes (no color-only signals — add
shape/position cues), remappable controls, subtitles for voice, reduced-motion
mode.
**Why.** Minors, varied hardware, legal prudence. **Effort.** M. **Deps.** SIM-11 for lamp render touchpoints.

### PLT-6 · Content review operations — **Now · M**

**What.** = THEO-5 (726 drafts + ~290 flagged), tracked platform-side because
it gates exam quality. **Deps.** reviewer time.

### PLT-7 · Sound design pass — **Later · M**

**What.** Indicator tick, wiper rhythm, rain layers, honest warning tones
(only after W-SPD makes warnings true). **Why.** Audio is an unused teaching
channel (doc 63 §7 sound register). **Effort.** M. **Deps.** W-SPD, W-COCKPIT.

### PLT-8 · Gamification deepening — **Later · M**

**What.** Extend `modules/gamification` (XP exists) toward streaks/mastery
badges aligned with commendations — never certificates (ADR-003).
**Why.** Retention for 17–18-year-olds without falsifying credentials.
**Effort.** M. **Deps.** PLT-4 data.

---

## 4. Infra module

### INF-1 · Named tunnel / stable staging domain — **Next · S**

**What.** Replace the rotating trycloudflare quick-tunnel URL (doc 61: URL
rotates on restart, grep-from-pm2-logs workaround) with a named tunnel on a
stable domain.
**Why.** Founder/tester links must not expire mid-QA round. **Effort.** S.
**Deps.** Cloudflare account config on the VPS.

### INF-2 · Cloudflare Access gate on staging — **Next · S**

**What.** Auth gate in front of staging so QA builds are not publicly
crawlable (minors' data prudence, GDPR posture per ADR-004).
**Why.** Staging holds real test accounts. **Effort.** S. **Deps.** INF-1.

### INF-3 · Performance budget guard — **Later · M**

**What.** Automated FPS/memory floor per doc 71 budget; the 16 GB dev box is
the canary. No roadmap item ships below the floor.
**Why.** Every SIM item above adds load. **Effort.** M. **Deps.** doc 71
tooling (toktx install noted as blocker in quality-gap 13).

---

## 5. Open founder decisions (grouped; from CLAIMS.md + doc 62/63 — kept until decided)

**World/content semantics:**
1. В27 auto-posts on lessons teaching „забраната важи БЕЗ знак" — signless flag for law-implied zones?
2. М2 marking-code contradiction (dashed vs wide-solid-edge — two generators, both cite Наредба № 2) — also blocks the clean QA-50 fix.
3. Bus-pullout lawRef divergence (чл. 67 / 68? / 69? across three sources).

**Scenario staging:**
4. School patrol: multi-child group + lowering paddle vs re-scope.
5. „Колона" pressure on empty streets: stage 1–2 scenery cars or keep singular copy (QA-40 argues: stage).
6. sc-crossing-bus-shadow: staged held truck at the BUS_OBSTACLE rect until a bus rig exists (spec change → trace gates deliberately).

**Product behavior:**
7. Green-but-1★ CTA behavior (next-scenario vs force-unlock next level).
8. Steering sharpness (QA-38): founder says feels too sharp but do NOT change lightly — needs a dedicated feel session, not a patch.
9. Drill 21 „Тръгване на червено-жълто" full revision scope after W-SIG lands.
10. Ghost-line color semantics (blue vs green): unify to one color or add an on-screen legend (QA-15).

**Deferred design questions carried from doc 76:** Shadow-Car ghost style is
decided (translucent hero car; red = mistake demo); free tier gets L1 of
every template — retained here as context for THEO-3/SIM-2.

---

## 6. Change log

- 2026-07-20 — File created. Seeded from founder review R3 (doc 62), QA
  register (doc 63), CLAIMS.md backlog, PROGRESS.md deferred items, and the
  founder's interactive-theory proposal (THEO-1…4 written as PRD-grade
  requirements).
