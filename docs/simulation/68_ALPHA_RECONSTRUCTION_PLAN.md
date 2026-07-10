# 68 · Alpha Reconstruction Plan — Prototype → Alpha

> **Agent 5 cross-analysis.** Synthesizes the four alpha-recon reports:
> [01 Steam/edu-sim market](alpha-recon/01_research_edu_driving_sims.md) (R1) · [02 industry/evidence benchmark](alpha-recon/02_research_industry_benchmark.md) (R2) · [03 simulator audit](alpha-recon/03_audit_our_simulator.md) (R3) · [04 exams/edu-flow audit](alpha-recon/04_audit_exams_edu_flow.md) (R4).
> **Date:** 2026-07-10 · **Branch:** `scenario-engine` · **Decision context:** founder rated the sim ~10%, called a feature-freeze, ordered reconstruction to Alpha.
> **Prime directive:** we are not building a smaller City Car Driving. We are building the world's first browser/phone **3D driving instructor** for the Bulgarian exam. Every choice below is weighed by *educational impact per unit of evidence* first (R2 §7), WebGL-on-a-phone feasibility second.

---

## 0. The one-paragraph thesis

The evidence base (R2) and the market (R1) agree on something extremely convenient for us: **everything that provably makes safer drivers is cheap to render, and everything expensive to render is educationally marginal.** Hazard anticipation (−11.3% crashes, UK national scale), scenario density, performed procedures, structured feedback with replay, and official-taxonomy scoring are the whole game — photorealism, motion rigs and open worlds are not. Our prototype has, unusually, already built the *hard invisible half* of that stack (law-cited rule engine, teach-first coach, deterministic traffic brain, CI-gated physics) and almost none of the *visible half* (operable car, believable street, staged encounters, phone support). The reconstruction is therefore not a rewrite — it is **re-skinning a near-Alpha brain with a body that performs instead of quizzes**, then wiring the results into the learner model.

---

## 1. Honest state of the prototype

### 1.1 Is the founder's "10%" right?

**Yes for the product experience; no for the engineering.** Split the verdict:

- **As the experienced product** ("a 3D instructor that teaches me to drive on my phone"): **~10% is accurate, arguably generous.** Phones get a refusal screen (R3 §5), the car cannot be started/geared/parked (R3 §1), the flagship pre-drive procedure is 0-of-13 performed (R4 §3), no scenario is ever staged (R4 D9), no practical-exam mode exists (R4 D15), and sim results feed nothing (R4 D13–D14).
- **As an engineering asset base:** **~40–45%.** The rule engine (22 law-cited violations, official опасна/основна/второстепенна scoring), teach-first coach, micro-quiz loop, OSM world pipeline, CI-gated vehicle tuning, camera rig and quality-tier system are near-Alpha and must survive intact (R3 §11).

### 1.2 Per-area scorecard (from R3 §10 + R4, cross-checked)

| Area | /10 | Verdict |
|---|---|---|
| Rule engine + scoring + coach | 8 | Best code in the repo; genuinely differentiated (law citations — no competitor on Earth does this, R1 §8) |
| Micro-quiz theory↔sim loop | 7 | The one closed circuit; server-graded into the same mastery store |
| Physics tuning + CI harness | 6.5 | Professional; undermined by binary inputs, cosmetic gearbox, arcade reverse |
| Traffic *brain* | 5 | Deterministic IDM + reservations is right; ghost cars, one-lane routes, pill pedestrians are not |
| UI/HUD & lesson flow | 6 | Teach-first live; letterboxed card, no fullscreen, no in-world guidance |
| World & road geometry | 4 | Correct 3.25 m lanes inside a 10:1 Dubai canyon with 2 m corners |
| Cockpit & vehicle operation | 3 | 17 grey boxes; no ignition/gears/clutch/parking brake; mirrors fake but graded |
| Immersion (audio/consequences) | 4 | Research-grade camera; near-silent, crash-proof world |
| Educational loop closure (readiness/XP/exam) | 2 | Sim results feed nothing; no practical-exam mode |
| ADR-005 phone compliance | 0 | Hard-blocked, not degraded |
| **Weighted** | **≈4.4 engineering / ≈1–2 experience** | Alpha-grade brain in a proof-of-concept body |

### 1.3 Where our assumptions were WRONG (the cross-analysis payoff)

1. **"Roads are too narrow → the road model is wrong."** Half-wrong. Lane width is *correct* (3.25 m BG standard). The read comes from (a) 42–170 m towers on 6.5 m streets — a ~10:1 canyon vs the real ~2:1 (R3 §2), (b) no parking lanes/verges in the cross-section, (c) 2 m corner radii, and (d) **camera GFOV calibration** — sims with wrong geometric-FOV distort perceived width and speed ~10%; optimum GFOV:display-FOV ≈ 1.22:1 (R2 §3.3). Two of the four fixes are constants; one is free.
2. **"We need better assets."** Mostly wrong. Evidence: cognitive/task fidelity drives training value; photorealism doesn't (Allen: FOV + controls carry the entire effect; cab bodywork adds nothing — R2 §3.3). Market: modest graphics are forgiven if geometry reads real (CCD 1.x, 83/100); *placeholder-look* is punished (BoomBit "PS1-esque") (R1 §6). We need a visual **floor** (no boxes-as-cars, no pill people, real proportions), not a ceiling.
3. **"The 45-event library ≈ a scenario engine."** Wrong. Data without an orchestrator stages nothing; "learn by driving" currently means "free-drive until a detector happens to fire" (R3 §8, R4 D9). SWOV names compressed scenario density as *the* unique value of sims (R2 §3.1) — free-roam collapses learning-occasion density. This is the single biggest pedagogical gap.
4. **"The checklist teaches the procedure."** Wrong, with aviation-grade counter-evidence: procedures train and retain in low-fidelity devices only when *performed* on controls (VPT/CPT ladder, Instruction→Practice→Assess — R2 §3.5). A quiz-checklist is pedagogically hollow — the founder's instinct is fully validated by the literature.
5. **"Cosmetic gearbox is fine for now."** Wrong for Bulgaria. Clutch + stalling is a top-loved genre feature (R1 §6), BG candidates overwhelmingly train/test on manuals, and hill start — a standard exam maneuver — is *impossible to teach* without stall physics (R4 §3).
6. **"Phone support can come later."** Strategy-violating drift. ADR-005 says mid-range phone; the shipped code refuses touch devices outright (R3 §5). Meanwhile the mobile tier (Ovilex ~100M installs) proves the teen appetite lives exactly there (R1 §3).
7. **"More detectors = more learning."** Backwards risk. The genre's #1 killer is **false positives** (BoomBit died on them; CCD 2.0 bleeding reviews on hair-trigger fines — R1 §6). Detector *precision* with tolerance bands beats detector coverage.

### 1.4 Where our assumptions were RIGHT (don't relitigate)

- **Teach-first-then-grade** — validated by CPT three-mode pattern, Green Dino adaptivity, NTNU pedagogy agent (R2 §7 T2-10). Strongest code in the repo; carry over intact.
- **Rule engine + LLM-for-dialogue split (ADR-002)** — NTNU's production AI instructor ("on par with human instructors") is exactly this architecture, not an end-to-end LLM (R2 §3.4).
- **Education-first release order** — CCD 2.0 shipped sandbox before school mode and sits at Mixed 61% (R1 §2.2).
- **Browser + mid-range phone (ADR-005)** — slowroads.io/3D Driving Class prove the tier; performance stutter is a top review-killer even on desktop (R1 §2.2, R2 §5).
- **Official-exam-taxonomy scoring** — 3D Driving Class's entire moat in Korea (R2 §2.2); de Winter shows sim telemetry predicts the real road test (R2 §3.1).
- **Fictional vehicles, no certificates, supplement-not-replacement positioning** — matches instructor consensus, the 2024 systematic review, BG law and school culture (R1 §5, R2 §4).

---

## 2. Consolidated weakness inventory (deduped, sourced)

Grouped by system; each item cites its source report. This is the complete defect universe the roadmap (§6) draws from.

### A. Vehicle operation (the founder's core complaint — confirmed everywhere)
| # | Weakness | Source |
|---|---|---|
| A1 | No engine on/off state anywhere; car drivable from frame 1, "engine start" = pressing "7" on an HTML list | R3 §1, R4 D1/D4 |
| A2 | Gearbox cosmetic (gear derived from speed); no PRND, no manual, no clutch, no stall; reverse = hold brake while stopped (mis-trains "select R, check behind") | R3 §1/§6, R4 §3 |
| A3 | No stateful parking brake — Space is a momentary drift button (rear grip 0.4); "release handbrake" step has nothing behind it | R3 §1, R4 §3 |
| A4 | 0 of 13 pre-drive steps performed via a real control; 6 steps have NO underlying system; 7 have an adjacent key NOT connected to the step | R4 §3 |
| A5 | Two parallel unconnected state machines (procedures/ vs cabin.ts+vehicle/) — the systemic root cause | R4 §0 |
| A6 | Contradictory grading: checklist "belt ✓" leaves `cabin.seatbeltOn=false` → SEATBELT_OFF_WHILE_MOVING fires on a student told they belted up; same class for lights/indicator | R4 D2 |
| A7 | `onPreDriveStep` never called from the 3D scene; SceneSlot contract item 4 unimplemented; dead checklist key hints collide with live driving keys | R4 D3, R3 §1 |
| A8 | Missing controls the BG exam expects: hazard lights, horn, wipers (rain renders, wipers don't), fog lights, dashboard telltales, seat/mirror adjustment, analog pedals | R4 §3 |
| A9 | Binary keyboard input — the "smooth stop" skill is performed by the beginner low-pass filter, not the student | R3 §6 |

### B. Perception layer (world, cockpit, immersion)
| # | Weakness | Source |
|---|---|---|
| B1 | Scale catastrophe: all 248 footprints clamped to 42–170 m towers over 6.5 m streets → 10:1 canyon makes streets read miniature | R3 §2 |
| B2 | Road cross-section = lanes×3.25 only — no parking lanes, verges, gutters; fixed 2.0 m sidewalks; 2.0 m corner radii vs real 6–12 m | R3 §2 |
| B3 | GFOV never calibrated (target ≈1.22:1 GFOV:display) — free fix for narrowness + speed underestimation + part of sim-sickness risk | R2 §3.3 |
| B4 | Cockpit = 17 grey boxes + 2 box seats; three-car identity split (GT-E exterior / Vitok box interior / FWD-hatch physics); GLB has no interior | R3 §1 |
| B5 | Mirrors fake but graded — static metallic plane, no door mirrors, yet LANE_CHANGE_WITHOUT_MIRROR_CHECK grades Q/E/F keypresses: trains key-pressing, not observing | R3 §1, R4 D12 |
| B6 | Letterboxed `aspect-video` dashboard card, zero fullscreen — "a driving lesson framed like a YouTube embed" | R3 §4 |
| B7 | Near-silent world: one procedural hum; no tyre/wind/brake/ambient/NPC audio — 26 silent cars; audio ≈ half of speed perception | R3 §7 |
| B8 | Parked cars are boxes; pedestrians are capsule pills; L5 hazard cue and L7 parking bay scored but never rendered | R3 §2/§9, R4 D8 |
| B9 | No in-world route guidance (text + 5 Hz minimap only); students self-navigate an unfamiliar OSM district | R3 §4 |
| B10 | Dead/stale code: RoadsterBody, VitokExterior/Wheels, legacy SimulatorApp stack, stale CC-BY footer attribution, conflicting steering-ratio constants | R3 §9 |

### C. Traffic & consequences
| # | Weakness | Source |
|---|---|---|
| C1 | NPC cars are unhittable ghosts (kinematic + no-overlap clamp); only "staticObject" collisions gradable — car-to-car crashes impossible in a driving-consequence product | R3 §3 |
| C2 | Single-lane loop routes — no lane changes, no overtaking anywhere in ambient traffic | R3 §3 |
| C3 | No buses, trams, cyclists, motorcycles — categories with dedicated exam questions and waiting library events | R3 §3, R4 §4 |
| C4 | 26 cars/20 peds in a 280 m bubble — empty streets beyond; industry lesson says fewer *scripted rule-abiding* agents beat dense broken traffic anyway | R3 §3, R1 §9 |

### D. Educational flow
| # | Weakness | Source |
|---|---|---|
| D1 | No scenario orchestration — nothing stages the child dart-out, right-priority car, braking lead; 45-event library is reactive coaching data only; 15/45 (33%) even detectable | R4 D9/§6, R3 §8 |
| D2 | Teach moment degraded: doc-65 promised pause + mini-lesson; shipped is an auto-dismissing pointer-events-none toast at speed | R4 D6 |
| D3 | Penalty escalation (×1.0→×2.0) computed in policy.ts, never applied by lessons/engine.ts | R4 D7 |
| D4 | Objectives verify geometry, not skill: L7 "park" = any reverse + any 1.5 s stop anywhere; L5 emergency stop has no stimulus (reaction untrained); L4 completes by driving past; L2 can complete on 3 greens | R4 D8/§4 |
| D5 | Curriculum-bricking risk: L2 stop-sign objective depends on an unverified stop-line heuristic at node n331942490; failure locks L3–L7 forever (strictly linear unlock, no remedial path — also CCD's most-hated flaw) | R4 D10, R1 §6 |
| D6 | No practical-exam mode; no exam-strict toggle (teach-first makes lesson passes systematically easier than an exam) | R4 D15 |
| D7 | Sim feeds nothing: readiness reads theory only; violations never touch mastery/scheduling; XP union closed so driving earns zero | R4 D13/D14 |
| D8 | Night pre-drive branch unreachable; no lesson sets `rain` so weather detectors unreachable; missing lesson types: hill start, parallel/bay parking, overtaking (33q/75pt — highest leverage), railway crossing, U-turn, tram/cyclist/bus/emergency-vehicle | R4 D11/§4 |
| D9 | Feedback misses: violation toasts omit the explanation text; no mistake map/replay; no session-history screen | R4 §5 |
| D10 | ~16 detectors never test-driven by a human; all pedagogy thresholds feel-unvalidated; no false-positive regression suite (the genre's #1 trust-killer) | R4 D17, R1 §6 |

### E. Platform
| # | Weakness | Source |
|---|---|---|
| E1 | Phones hard-blocked with a refusal screen; zero touch input — ADR-005 unmet entirely | R3 §5, R4 D16 |
| E2 | Mobile performance (Rapier WASM + Next shell + 26 agents + rule engine per frame) untested because untestable | R3 §5 |

---

## 3. Missing educational features & vehicle interactions — mapped to the Bulgarian practical exam

The Наредба-38 practical exam (~25 min city drive + maneuvers) is the target behavior model. Every control below is something the examiner watches for or the candidate must operate.

### 3.1 Vehicle-interaction gap table (build spec for the interactive cockpit)

| Control / interaction | Exam relevance (what the examiner checks) | Today | Alpha target |
|---|---|---|---|
| **Ignition / engine start-stop** | Start sequence order (after belt/mirrors); restart after stall | Absent — engine always on | `engineOn` state; start via cockpit hotspot or key; car dead without it |
| **Clutch + manual gearbox** | Smooth move-off, hill start, no stalling, right gear for speed | Absent — cosmetic gear string | Manual mode with clutch axis + stall; **auto-clutch assist toggle by difficulty** (CCD's proven pattern, R1 §2.1) |
| **Gear selector (min. PRND)** | Selecting R deliberately, P at parking | Reverse = brake-key overload | Explicit selector state, operable via hotspot/keys; R requires stationary + brake |
| **Stateful parking brake** | Released before move-off, applied at parking/hill | Momentary Space drift button | Engaged at spawn; lever toggle; physics drag + HANDBRAKE_LEFT_ON when driving with it |
| **Seatbelt** | Before moving; graded | Key B exists, unlinked to procedure | Single state source; hotspot + key; procedure subscribes |
| **Mirror adjustment (setup) + mirror observation (live)** | Pre-drive adjustment; glances before signal/maneuver | Adjustment absent; glances = camera-snap keys at a fake mirror | Adjustable in pre-drive; **render-to-texture mirrors** so a glance can actually inform a decision |
| **Indicators** | Before every maneuver; cancel after | Working + auto-cancel (keep) | Link to procedure + grade off single source |
| **Lights (off/low/high) + fog** | Day/night discipline, dazzle | 3-state exists; fog absent | Keep; add fog lights (чл. 74/75, ev-lights-usage) |
| **Hazard lights** | Emergency stop protocol (ev-emergency-stop-triangle) | Absent | Add state + telltale |
| **Horn** | Permitted-use awareness | Absent | Add (cheap; enables misuse detector later) |
| **Wipers** | Rain visibility (rain already renders on glass) | Absent | 2-speed toggle; visibility penalty when off in rain |
| **Dashboard telltales** | "Check instruments" pre-drive step; ev-warning-light | Speed + partial telltales only | Full telltale set (belt, handbrake, lights, engine, indicator) — makes step 5 performable |
| **Analog pedal shaping (keyboard)** | Smooth stops/starts are *graded skills* | Binary 0/1 | Attack/release ramps so smoothness is the student's |
| **Seat adjustment** | Pre-drive step 1 | Absent | Minimal: eye-height slider in pre-drive (camera), persisted |
| **Doors / Dutch reach** | Post-parking safety | Absent | Post-Alpha (doc 65 Phase 3) |

### 3.2 Missing educational features (ranked by evidence strength, R2 §7)

1. **Hazard-anticipation loop** (E:★★★) — staged latent hazards + "what you missed" RAPT-style replay. Bulgaria's own theory exam has included *animated hazard clips since July 2023* and **nobody trains them interactively** (R2 §2.3) — this is a state-validated content format sitting unowned.
2. **Scenario orchestration** (E:★★★) — 1–3 deterministic staged events per lesson from the 45-event vocabulary; compressed learning-occasion density is the sim's entire reason to exist (SWOV).
3. **Pause-based teach moments + multi-perspective replay** (E:★★★) — top-down/other-road-user replay is feedback "impossible in a car" (SWOV); restores the doc-65 promise.
4. **Interactive cockpit-procedure training** (E:★★) — Instruction→Practice→Assess modes per the aviation VPT pattern; checklist becomes read-only verification.
5. **Practical-exam mode** (E:★★) — coach off, staged route, official termination rules, examiner protocol; the product's name promises it.
6. **Theory↔sim↔readiness integration** (E:★★) — Fahren Lernen Max is market leader on exactly this loop; ours is one-directional today.
7. **Adverse/rare-condition modules** (E:★★) — night discipline, rain, emergency braking with *measured reaction time*; what BG schools already advertise their rigs with (R1 §5).
8. **Remedial micro-drills on failure** (E:★) — never a progression wall (CCD's most-hated flaw; our linear unlock has the same bug).
9. **Voice instructor callouts** (E:★) — 3D Fahrschule shipped multilingual voices in 2003; CCD's weak robotic voice is its most-criticized feature. Post-Alpha (BG TTS), but the text-callout architecture lands in Alpha.

---

## 4. What "Alpha" means — definition of done

**Alpha = a stranger with a mid-range Android phone and zero instructions can complete Lesson 1 through Exam Mode and correctly say: "this taught me something a листовка can't."**

Concretely, ALL of the following:

### The car is operated, not steered
- [ ] Engine start/stop, gear selector (PRND minimum; manual+clutch+stall behind a difficulty toggle), stateful parking brake engaged at spawn, belt, lights, indicators, hazards, wipers, horn — all operable via **both** cockpit hotspots and keys/touch, all reading one state source.
- [ ] The 13-step pre-drive procedure is **performed**: the machine subscribes to real state transitions; the checklist panel is read-only progress; the car physically won't drive off properly with the parking brake on; zero contradictory grading (A6 class eliminated).
- [ ] Mirrors render live rear views (RTT); at least one graded decision genuinely requires looking in one.
- [ ] One car identity: exterior, interior and physics agree (Aurelis GT-E or a purpose-built learner car — one, not three).

### The world reads real
- [ ] Mid-rise district (real 15–25 m heights), parking lanes + verges in the cross-section, 6–10 m corner radii, GFOV ≈1.22:1 — the founder no longer says "roads too narrow".
- [ ] No boxes-as-cars, no pill pedestrians in the player's sightline; L5 hazard and L7 bay are rendered entities.
- [ ] Ambient audio floor: tyres, wind, braking, NPC engines (procedural is fine; silence is not).
- [ ] Fullscreen immersive mode; in-world route guidance (arrows/ghost line).

### The lessons stage learning
- [ ] A scenario orchestrator stages ≥5 deterministic encounters across the curriculum (pedestrian dart-out, priority-from-right, braking lead car for measured reaction time, cyclist right-hook, roundabout entry), seeded per attempt.
- [ ] Teach moment = physics pause + mini-lesson card with law citation + acknowledgment (+ replay where feasible); penalty escalation wired.
- [ ] Every lesson objective verifies the behavior it names (bay geometry for L7, stimulus-triggered stop for L5, an actual red for L2); no objective can complete vacuously.
- [ ] No curriculum bricks: stop-line at n331942490 hand-verified; failed lesson routes to a remedial drill, never a wall.

### The loop closes
- [ ] **Exam mode** exists: performed pre-drive + ~10–15 min staged route + coach off + official scoring + examiner-style protocol.
- [ ] Sim results move the learner model: violations touch concept mastery/review scheduling, readiness blends theory+sim, sim lessons award XP.
- [ ] Detector trust: false-positive regression suite per detector, tolerance bands, founder has personally test-driven all detectors and signed thresholds.

### The platform promise holds
- [ ] Runs on a mid-range Android phone: touch controls, 30+ fps median at tier-low, <10 s load. **Alpha does not ship while ADR-005 is a refusal screen.**

Explicitly NOT required for Alpha: voice TTS, motorway/tram content, multiplayer, damage modeling, wheel hardware, more districts, AI-LLM debrief live.

---

## 5. Improvement catalog — adopt-from-industry vs our-own-wedge

### Adopt from industry (proven elsewhere; we implement our way)
| Improvement | Source pattern | Note |
|---|---|---|
| Performed pre-drive sequence, graded | CCD 1.x procedural floor (R1 §2.1); aviation VPT (R2 §3.5) | Table stakes — the genre's definition of "educational sim" |
| Clutch/stall with auto-clutch assist toggle | CCD (R1) | Assist toggle is the difficulty lever, not a physics fork |
| Instruction→Practice→Assess lesson modes | Aviation CPT (R2 §3.5) | Maps to our teach-first policy: modes, not new engines |
| Micro-lessons (1–3 min) + in-route checks | Virtual Driving School concept, Carnetsoft 16+5 skeleton (R1 §2.4/§4.2) | Carnetsoft's list is our Alpha lesson-tree checklist |
| Replay/error-analysis recording | CCD replay (R1); SWOV multi-perspective feedback (R2) | Also the input pipe for the LLM debrief later |
| Hazard-anticipation drills with miss-replay | RAPT, UK HPT, Green Dino +34% (R2 §3.2) | Highest-evidence feature in all driver ed |
| Official-deduction-table scoring | 3D Driving Class Korea (R2 §2.2) | We already have it — protect and market it |
| Scripted rule-abiding traffic over dense broken traffic | CCD 2.0/BoomBit failures (R1 §6) | Cheaper on phone GPU too |
| Tolerance bands + warn-once-then-grade + FP regression suite | BoomBit post-mortem, CCD 2.0 leniency demands (R1 §6) | Existential for trust |
| Remedial drill on failure, never a wall | CCD career complaints (R1 §6) | Applies to our linear unlock today |
| Night/rain/ice/emergency as named modules | BG schools' own marketing; Finland's dark-driving; ECA Faros naming (R1 §5, R2 §6) | Regulator-style module names add credibility |
| Theory+sim+dashboard one-account loop | Fahren Lernen Max (R2 §2.1) | We own both halves already — just wire them |
| GFOV calibration ≈1.22:1, stable horizon, short sessions | Sim-sickness/speed-perception literature (R2 §3.3) | Free; also mitigates the 10–20% sickness rate |

### Our own wedge (no one does this — protect and deepen)
| Improvement | Why it's ours |
|---|---|
| **Every graded event explains WHY with a law citation** (what happened → чл. → what to do instead → severity class) | R1 feature matrix: zero competitors explain; CCD's instructor is its weakest part. Extend to violation toasts (D9) and teach cards. |
| **Teach-first-then-grade coach** | Live and correct today; industry has assess-only or teach-only, never the escalating blend |
| **BG exam taxonomy as the rule engine + animated-hazard-clip training** | The state already publishes animated hazard questions (2023); nobody trains them interactively; our scenario events can mirror official clip situations 1:1 |
| **Browser + mid-range phone delivery of the full Tier-1 stack** | R2 §7: pieces exist separately worldwide; nobody has fused them, least of all in a browser |
| **Sim telemetry → readiness score** | de Winter: sim performance predicts the real road test — our readiness blend becomes a defensible "are you ready" claim no листовка app can copy |
| **Honest scope claims as positioning** | "Тренажор преди първото каране — учим възприятие, процедури и опасности; усетът за колата идва от инструктора ти." Wins instructor trust; pre-empts the #1 objection (R2 §4) |

---

## 6. Prioritized roadmap

Ordering logic: unbrick and de-risk first (days), then the four reconstruction pillars in dependency order (operable car → world read → staged learning → closed loop), phone track running parallel because it gates Alpha. Effort: S ≤ 1 day · M = 2–4 days · L = 1–2 weeks (founder+Claude velocity).

### Phase 0 — Quick wins (days; do top-down, most are independent)

| # | What | Why (educational impact) | Effort | Deps |
|---|---|---|---|---|
| QW1 | **Fullscreen mode** (requestFullscreen + immersive layout, kill the letterbox) | Presence precedes pedagogy; a lesson in a YouTube-embed frame reads as a toy (B6) | S | — |
| QW2 | **GFOV calibration pass** — set GFOV:display ≈1.22:1, verify speed/width perception with founder drive | Free fix for "roads too narrow" + speed underestimation + sickness risk (B3) | S | — |
| QW3 | **World scale constants**: building heights from OSM levels (fallback 15–25 m), corner radii 6–10 m, parking-lane strip + parked cars in the arterial cross-section | The single biggest visual-credibility lever; three constants-level changes (B1, B2) | M | — |
| QW4 | **Hand-verify/hard-place the Б2 stop line at n331942490** | Removes the curriculum-bricking risk (D5) | S | — |
| QW5 | **Fix contradictory grading + dead key hints**: checklist clicks set real cabin state (interim), remove phantom kbd hints | Stops actively lying to students (A6, A7) — interim until Phase 1 replaces the checklist | S | — |
| QW6 | **Founder detector drive-and-tune session** + log false positives → seed the FP regression suite | Detector trust is existential (D10); thresholds are feel-unvalidated | S–M | QW1 |
| QW7 | **Violation toasts include the explanation text** (already authored in the catalog) | Our moat is the WHY; today we hide it at the moment of learning (D9) | S | — |
| QW8 | **Analog keyboard ramps** (attack/release on throttle/brake) | Makes "smooth stop" the student's skill, not the filter's (A9) | S | — |
| QW9 | **Purge dead code + stale attribution** (RoadsterBody, VitokExterior, legacy stack, CC-BY footer, steering-ratio fork) | Hygiene before reconstruction; footer is a licensing error (B10) | S | — |
| QW10 | **Block driving during pre-drive phase** (physics gate + explanation) | Interim fix for D4 until real ignition lands | S | — |

### Phase 1 — Alpha core (the reconstruction, ~4–7 weeks)

**Pillar 1: the operable car (weeks 1–2)**
| # | What | Why | Effort | Deps |
|---|---|---|---|---|
| A1 | **Vehicle state machine v1**: `engineOn`, gear ∈ PRND (manual+clutch+stall behind difficulty toggle), stateful parking brake (engaged at spawn, physics drag), hazards, wipers, horn, fog lights, full telltale cluster. Single state source consumed by procedures, rules, HUD | Kills A1–A5, A8; the sine-qua-non of "3D instructor"; CCD's table-stakes floor | L | QW-none |
| A2 | **Performed pre-drive**: cockpit raycast hotspots (start button, belt, stalk, lever, selector) + keys; procedure machine subscribes to state transitions; delete checklist buttons → read-only progress panel; Instruction→Practice→Assess modes | The founder's #1 complaint; aviation-validated pattern; converts lesson 1 from quiz to training | M | A1 |
| A3 | **One car identity**: hero interior matching the GT-E (or commission interior via the Rodin/Blender pipeline) with hotspot-ready meshes; reconcile physics class | Cockpit is where the student lives; 17 grey boxes undermine every other investment (B4) | L | A1 (hotspot spec) |
| A4 | **Functional mirrors** (RTT at reduced res/rate, quality-tiered) + one graded decision requiring mirror information | Mirror grading is dishonest until then (B5); teaches observing, not key-pressing | M | A3 helps, not required |

**Pillar 2: the credible world (weeks 2–3, parallelizable)**
| # | What | Why | Effort | Deps |
|---|---|---|---|---|
| A5 | **Visual-floor asset pass**: parked-car GLBs (fleet exists — reuse), articulated low-poly pedestrians with walk cycle, rendered L5 hazard + L7 bay markings | Placeholder-look is punished even in educational products (B8; R1 §6) | M | — |
| A6 | **Audio pass**: procedural tyre/wind/brake + NPC engine hum + ambient bed; wiper/rain audio | ~half of speed perception; the weightless feel (B7) | M | — |
| A7 | **In-world route guidance**: 3D arrows or ghost line + objective markers | Students should spend attention on traffic, not navigation (B9) | M | — |

**Pillar 3: staged learning (weeks 3–5)**
| # | What | Why | Effort | Deps |
|---|---|---|---|---|
| A8 | **Scenario orchestrator v1** + 5 staged events: pedestrian dart-out (L4), priority-from-right (L2), braking lead car with measured reaction time (L5), cyclist right-hook, roundabout entry conflict. Deterministic seeds per attempt | THE pedagogical gap (D1); scenario density is the sim's entire evidence-based value | L | traffic system (exists) |
| A9 | **Teach moment = pause + card**: freeze physics (MicroQuizOverlay pattern), mini-lesson + citation + acknowledgment; wire ×1.0→×2.0 escalation; miss-replay where the event supports it | Restores the founder-approved doc-65 design (D2, D3); RAPT's replay is the evidence core | M | A8 for replays |
| A10 | **Objective hardening**: L7 bay geometry + alignment/attempts, L5 stimulus-locked stop, L2 requires meeting ≥1 red, L3 exit-signal check | Objectives must verify the behavior they name (D4) | M | A8 (L5), A5 (L7) |
| A11 | **Hittable traffic**: dynamic-body NPC proximity shells, car-to-car collision grading, near-miss detection | A driving-consequence product where crashes are impossible teaches invincibility (C1) | M | — |
| A12 | **FP regression suite + tolerance bands** formalized per detector; warn-once-then-grade for второстепенни in teach mode | Genre's #1 trust-killer, now systematized (D10) | M | QW6 seeds |

**Pillar 4: the closed loop (weeks 5–6)**
| # | What | Why | Effort | Deps |
|---|---|---|---|---|
| A13 | **Exam mode** („Пробен практически изпит"): performed pre-drive, 10–15 min staged route, coach OFF, official scoring + termination rules, examiner protocol screen | The product promise; no exam-strict mode exists (D6) | M | A2, A8 |
| A14 | **Learner-model integration**: open GamificationEvent union (sim XP), sim violations → concept mastery/review scheduling, readiness = blend(theory, sim), dashboard "sim weak spots" | Driving is the wedge yet earns nothing and informs nothing (D7); the Fahren-Lernen loop | M | — |
| A15 | **Session feedback v2**: mistake map on the minimap, session history screen, per-mistake "what should you have done" | Feedback quality gap (D9); input pipe for post-Alpha LLM debrief | M | — |

**Phone track (parallel from week 1 — gates Alpha ship)**
| # | What | Why | Effort | Deps |
|---|---|---|---|---|
| P1 | **Touch input layer**: steer (tilt or wheel-slider A/B test), pedal zones, control hotspots; remove the refusal gate | ADR-005 is currently unmet entirely (E1) | L | A1 (controls enumerate) |
| P2 | **Mobile perf validation**: Rapier+scene budget on a mid-range Android, tier-low targets 30 fps, <10 s load; cut agent counts per tier | Untested territory (E2); stutter is a top review-killer | M | P1 |

### Phase 2 — Post-Alpha (validated backlog, in rough order)
1. **Hazard-perception module** mirroring the official 2023 animated exam clips (interactive train-the-exam-format — open lane, R2 §2.3).
2. **New lessons by exam-leverage**: hill start (needs A1 clutch), parallel parking, **overtaking** (33q/75pt — needs lead+oncoming staging), railway crossing (always-grade), U-turn/reversing, adverse-weather lesson (rain flag already works end-to-end).
3. **BG TTS voice instructor** (text callout architecture from A9 makes this a rendering change; 3D Fahrschule did voices in 2003).
4. **LLM debrief live** (seam exists; replay data from A15 is the input).
5. Cyclist/tram/bus actors + their event families; second district; motorway segment.
6. Spaced re-practice / skill-decay scheduling (procedural-skill retention literature, R2 §3.5).
7. Wheel/gamepad-rumble support (upgrade path, never a requirement).
8. B2B2C: Книжка.AI as автошкола "sim hours" (CCD Enterprise pattern; BG schools already market rigs — R1 §5); France/Finland precedents as the Наредба-37 lobbying story.

---

## 7. What we deliberately will NOT build

| Not building | Why (evidence + strategy) |
|---|---|
| **Motion platform / force feedback beyond basic / cab hardware** | Zero browser feasibility; evidence says FOV + controls carry the training effect, hardware doesn't (Allen, R2 §3.3) |
| **Photorealistic assets / UE-grade rendering** | Cognitive fidelity drives learning; CCD 2.0 upgraded graphics and *lost* rating to stutter (R1 §2.2); phone budget is law |
| **VR** | Sickness, hardware reach, minors (ADR-004 adjacent); evidence-weak for our skills (R2 §7 T3) |
| **Open-world free-roam as the core mode** | Learning-occasion density collapses (SWOV); free-drive stays only as L0 acclimatization |
| **Dense "living city" traffic** | NPCs breaking graded rules = hypocrisy, the genre's #3 hate (R1 §6); fewer scripted rule-abiding agents win pedagogically and on GPU |
| **Damage model / crash cinematics** | Consequence = collision detection + debrief, not bodywork deformation; CCD's cosmetic damage is a noted weakness anyway |
| **Career/economy/car-unlock meta** | CCD 2.0 shipped it before the school and got Mixed 61%; our XP ties to *learning*, not vehicle ownership |
| **Real brands** | ADR-001; zero educational value, pure licensing risk |
| **Certificates / "replaces lessons" claims** | ADR-003; the 2024 systematic review and instructor consensus both say supplement — overclaiming burns the instructor channel we later need |
| **Handling-transfer marketing** ("learn car feel at home") | The one thing evidence says does NOT transfer; honest scope is a trust feature (R2 §4) |
| **End-to-end LLM instructor** | ADR-002; NTNU's production-validated architecture is rule-engine + knowledge-graph + pedagogy layer — the LLM stays in dialogue/debrief |
| **Multiplayer, police chases, mods** | Game-genre gravity; fails the north-star test |
| **Native app before browser Alpha** | ADR-005; slowroads.io proves the browser tier; app wrapping is a distribution decision for later |

---

## 8. Execution notes

- **Branch strategy:** continue on `scenario-engine`; the keep-list (R3 §11 — rules, scenarios, lessons, procedures, world pipeline, tuning+harness, CameraRig, quality tiers, traffic core) is contractually off-limits for rewrites. Reconstruction = new perception/interaction layers over the same brain.
- **Sequencing discipline:** Phase 0 is one focused week and visibly transforms the product (fullscreen + GFOV + scale constants + honest toasts). Do not let Pillar work start before QW4 (unbrick) and QW6 (detector trust baseline) are done.
- **Validation gates:** after Pillar 1, re-run the founder's lesson-1 test ("can I *perform* the pre-drive?"); after Pillar 3, a stranger-test on staged events; before Alpha ship, the §4 checklist verbatim on a mid-range Android.
- **The pitch numbers to carry** (R1 §4.1, R2 §3.2): Green Dino +25.5% pass rate / −64% first-year crashes; UK HPT −11.3% crashes; RAPT +28.8 pp hazard anticipation. These are the "why this exists" slide — and the pedagogy checklist for A8/A9.
