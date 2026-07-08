# 65 · Scenario-Based Learning Engine — "Learn by Driving"

**Status:** Analysis complete · foundation code shipped · Phase-1 detectors next
**Date:** 2026-07-08
**Owner:** Technical co-founder
**Artifacts:**
- `docs/simulation/scenario-engine/scenario-map.json` — the per-question table (all 1,016 rows)
- `docs/simulation/scenario-engine/event-library.json` — the 45-event canonical library (law-corrected)
- `docs/simulation/scenario-engine/topics/*.json` — per-topic classification (16 files)
- `platform/src/modules/sim/scenarios/` — the shipped code module (registry + teach-first-then-grade)

---

## 1. Goal

Turn the 1,016-question theory bank from multiple-choice recall into an **immersive, scenario-based system where students learn by driving** — the simulator recognises their actions, catches mistakes, and teaches the matching theory *at the exact moment it becomes relevant*. This is the north-star wedge: the closest thing we have to "does it produce a safer, more competent real driver."

## 2. Method (why this isn't 1,000 write-ups)

The leverage is that questions already carry `conceptIds` into the 152-concept knowledge graph, so the real structure is **1,016 questions → 152 concepts → a small set of reusable simulator events**. We ran a 19-agent analysis: 16 agents (one per topic) classified every question against a seeded event taxonomy; a synthesiser deduplicated them into a canonical library; and two adversarial passes verified it — a **Bulgarian examiner** checking the *correct behaviour* is legally right, and the **sim engineer** checking each event is buildable in our engine.

Result: **45 reusable events cover the ~585 questions with a live-driving path — a ~13:1 reuse ratio.** That library *is* the modular event system; each new event is built once and covers ~13 questions.

## 3. The split — ~58% can be driven, and it's the *right* 58%

| Theory bank | Questions | Share |
|---|--:|--:|
| **Simulatable** (a real gradeable driving action) | 332 | 33% |
| **Partial** (a scenario illustrates it; grading is soft) | 253 | 25% |
| **Not simulatable** (pure knowledge/recall) | 431 | 42% |

The simulatable half concentrates in the highest-exam-weight, highest-safety topics; the non-simulatable half is compliance and recall:

| Topic | Q | Sim | Part | No | Live-path % |
|---|--:|--:|--:|--:|--:|
| Маневри/изпреварване | 65 | 48 | 14 | 3 | **95%** |
| Кръстовища/жп | 62 | 28 | 30 | 4 | **94%** |
| Предимство | 62 | 35 | 21 | 6 | **90%** |
| Светофари/маркировка | 64 | 36 | 16 | 12 | 81% |
| Магистрали/извънградски | 64 | 37 | 12 | 15 | 77% |
| Спиране/паркиране | 64 | 23 | 24 | 17 | 73% |
| Нощ/усложнени | 63 | 10 | 35 | 18 | 71% |
| Пешеходци/уязвими | 65 | 38 | 6 | 21 | 68% |
| Пътни знаци | 64 | 25 | 14 | 25 | 61% |
| Скорост/дистанция | 64 | 13 | 26 | 25 | 61% |
| Икономично/защитно | 63 | 18 | 17 | 28 | 56% |
| Автомобил/подготовка | 63 | 10 | 11 | 42 | 33% |
| Основни понятия | 63 | 7 | 8 | 48 | 24% |
| ПТП/първа помощ | 64 | 3 | 12 | 49 | 23% |
| Алкохол/годност | 63 | 0 | 5 | 58 | 8% |
| Документи/санкции | 63 | 1 | 2 | 60 | 5% |

## 4. The canonical event library (45 events)

Full specs (trigger · detection · success · failure · feedback · law) live in `event-library.json`; the per-question mapping in `scenario-map.json`. Families:

- **Junctions & priority** — uncontrolled right-hand rule · priority/give-way/stop sign · signalized (amber, arrows) · roundabout · railway crossing · traffic controller · left-turn yield · merge/give-way · narrow-section priority
- **Speed & distance** — speed limit · following distance · speed-for-conditions · motorway minimum speed
- **Lanes & maneuvers** — lane discipline · lane change · overtake · being-overtaken · turn positioning · U-turn/reverse · oncoming meeting
- **Signs & markings** — prohibitory · mandatory · warning · markings response
- **Vulnerable users** — marked crossing · unmarked/stepping-out hazard · school/zone regime · cyclist · tram · bus pull-out · animal hazard
- **Conditions & equipment** — lights usage · adverse weather · seatbelt · signaling discipline · warning-light (dashboard telltale) · driver-distraction
- **Stopping & parking** — illegal-stop zone · parking maneuver · emergency-stop + triangle
- **Special / dynamics** — emergency vehicle · motorway entry/exit · eco-defensive · accident-scene conduct · police-stop signal · lane-control signal · loss-of-control recovery · emergency-braking technique

The 5 highest-leverage events by exam points: **ev-overtake** (33q/75pt) · **ev-speed-for-conditions** (27q/48pt) · **ev-illegal-stop-zone** (29q/47pt) · **ev-emergency-stop-triangle** (21q/43pt) · **ev-junction-signalized** (24q/43pt).

## 5. Teach-first-then-grade (founder-approved, shipped)

The learning discipline, implemented in `platform/src/modules/sim/scenarios/policy.ts`:

- **`teach-first-then-grade`** (default): the **first** encounter of a scenario **teaches** — pause, contextual mini-lesson with the law citation, **no penalty**. Every **repeat grades**, and grades harder each time (penalty ×1.0 → ×1.5 → ×2.0, capped).
- **`always-grade`**: safety-critical scenarios (wrong-way, running a red, railway crossing) grade from the first encounter — but still show the lesson the first time.
- **`learn-only`**: illustrative, never penalised.

`resolveEncounter(eventId, priorEncounters)` is a pure function; the session/reducer owns the per-driver encounter counts. Graded outcomes feed the same official опасна/основна/второстепенна severity and the mastery/readiness score as theory — closing the theory↔driving loop.

## 6. Legal corrections applied (examiner pass)

The behaviour was sound everywhere (no event teaches a hazard), but six citations drifted off the concept bank's authoritative `lawRefs` and are **corrected in the shipped library** (ADR-002 demands citation accuracy for a minors' product):

| Event | Was | Corrected to |
|---|---|---|
| ev-roundabout | чл. 37/50 | **чл. 50а** (circulating traffic has priority) |
| ev-bus-pullout | чл. 100 | **чл. 67** (чл. 100 is "carry documents") |
| ev-cyclist | чл. 40 + "1.5 m law" | **чл. 42** (sufficient lateral distance; 1.5 m = guidance, not statute) + чл. 25/37 |
| ev-uturn-reverse | "U-turn banned at junctions" | **чл. 38** (actual ban locations) + чл. 40 (reversing) — U-turn at a junction is lawful |
| ev-lights-usage | "fog lamps <50 m" | **чл. 74/75** — front fog (reduced visibility + low beam) vs rear red fog (<50 m) |
| ev-zone-regime | чл. 116 | **чл. 62–63** (residential-zone regime) |

## 7. Feasibility & roadmap

**Live in the engine today (7):** speed-limit, stop-sign, marked-pedestrian-crossing, seatbelt, collision, signalized-junction, lane-change (+mirror/indicator).

**Phase 1 — Foundations & reuse (~18 events, low build, ~507 exam points).** New detectors that read SimTick fields we already emit (speed, isNight, laneId/laneOffset, heading, gear, indicator) + the wetness store: speed-for-conditions, following-distance (nearest-ahead gap), lane-discipline (keep-right), wrong-way (edge.oneway + heading), signaling/eco discipline, illegal-stop zones, warning-sign anticipation, full lights & adverse-weather. **No new subsystems.**

**Phase 2 — Junctions, priority & vulnerable users (~18 events, medium).** Build the **priority solver + NPC actor library** once (the SimTick `prioritySituation` event is reserved but v1 detectors ignore it; NPC cars + the directed lane graph already exist) → right-of-way, roundabout, merge, overtake, cyclist/tram/bus/emergency actors, railway crossing all fall out of it. Highest safety weight (~468 exam points).

**Phase 3 — New signals, environments & attention (~7 events, medium).** Overhead gantry signals, dashboard telltales, in-car distraction/fatigue UI, spawnable animals, parking + Dutch-reach, police-stop actor, post-crash conduct. Each closes a whole topic's only drivable action (admin, fitness, accidents).

**Phase 4 — Vehicle-dynamics physics (2 events, high).** Deferred: needs new Rapier physics (reduced-friction/aquaplane/ice, tyre-blowout/crosswind, ABS/threshold braking). Only ~42 points but strong "feel it to learn it" value once the friction/brake model exists.

## 8. The non-simulatable 431 → best alternative

Honest routing (never a fake "scenario") — held in `scenario-map.json` per question:

| Method | Questions | Use |
|---|--:|---|
| **quiz** | 237 | plain MCQ — fines, categories, definitions, thresholds |
| **diagram** | 59 | labelled stills — sign faces, car parts, road cross-sections |
| **animation** | 52 | short motion clip — crash physics, blind-second, airbag |
| **interactive-checklist** | 50 | branching steps — first aid, accident procedure, pre-drive |
| **impairment-demo** | 17 | illustrative effect mode — alcohol/fatigue (demonstrates, never grades) |
| **tutor-explanation** | 16 | defer to the grounded AI tutor |

## 9. What shipped now (revertable checkpoint `pre-scenario-engine`)

- The analysis + the two data deliverables (`scenario-map.json`, `event-library.json`, 16 topic files).
- The **`scenarios` code module**: typed 45-event registry (`events.ts`), the teach-first-then-grade engine (`policy.ts`), public API (`index.ts`), law-corrected library JSON, and 14 tests (registry integrity incl. the legal fixes + full policy escalation).

## 10. Next build step

Wire the module into the live drive: (1) add a per-session `Record<eventId, encounters>` to the rule-engine state; (2) implement the Phase-1 detectors (each emits a SimTick event → catalog entry → reducer consults `resolveEncounter`); (3) a "teach" HUD moment (pause + mini-lesson + citation) on first encounters. Each detector is a small, independently-verifiable increment on top of this foundation.
