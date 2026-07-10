# 04 · Audit — Simulator Lessons/Exams & Educational Flow (Agent 4)

**Date:** 2026-07-10 · **Branch:** `scenario-engine` · **Scope:** `platform/src/modules/sim/{lessons,procedures,rules,scenarios,hud,engine,vehicle}`, `platform/src/components/sim/**`, `platform/src/app/(dashboard)/simulator/**`, docs 65 + scenario-engine/PROGRESS.md
**Core question:** where does the EDUCATION disconnect from the SIMULATION?

---

## 0. Executive summary

The pedagogical **back end** is genuinely strong: a pure, tested rule engine with 22 violation codes carrying official severity (опасна/основна/второстепенна), law citations and concept links; a teach-first-then-grade coach; official pass math (≤9 т. total, ≤6 основни, no опасна); server-side re-grading; deterministic debriefs; contextual micro-quizzes that feed the same mastery store as theory.

The **front end of the pedagogy is a UI shell, not a simulation**. The founder's lesson-1 observation is architecturally systemic, not an isolated bug: the pre-drive procedure, the "signal before move-off", the seatbelt, headlights, gears, handbrake — all exist as *two parallel, unconnected state machines*:

1. a **checklist machine** (`procedures/`) advanced by *clicking list items* in a side panel, and
2. a **cabin/vehicle state** (`components/sim/cabin.ts` + `vehicle/`) advanced by *keyboard keys* during driving.

Neither reads the other. The student can "complete" the seatbelt step by clicking it while the actual cabin seatbelt stays off (and then gets penalized for driving unbelted — contradictory feedback), or can press `B`/`L`/`,` in the cabin without the checklist noticing. There is **no engine start, no gear selection, no clutch, no stateful parking brake, no adjustable seat or mirrors** anywhere in the vehicle model — six of the 13 pre-drive steps refer to controls that do not exist in the simulation at all. The student answers *about* actions; nothing lets them *perform* the actions.

Beyond lesson 1: only 8 lessons exist (L0–L7), covering ~15 of the 45 scenario-library events, all *reactively* (a violation must happen to be coached) — there is **no scenario orchestration layer** that stages an event on purpose. There is **no practical-exam mode** at all. Sim results do not feed readiness, XP, or mastery (only micro-quiz answers do). The founder has never test-driven the 16 detectors (PROGRESS.md §7).

---

## 1. How the educational flow actually works today (verified pipeline)

```
/simulator (server page)
  └─ computeProgression(LESSONS, SimSessions)   — linear unlock, L0 always open
      └─ LessonSelectScreen → LessonPlayShell (owns the session end-to-end)
          ├─ SceneSlot → LessonScene (R3F + Rapier, district-v1.json world)
          │    ├─ SimInput:  W/A/S/D throttle-brake-steer, Space handbrake (momentary)
          │    ├─ CabinControls: , . indicators · L lights · B seatbelt · Q/E/F mirror glances
          │    └─ RuntimeDriver → WorldRuntime.sample() → SimTick 60/s → onTick
          ├─ lessons/engine.ts applyTick: rules reduceTick → coach (teach-first) → objectives
          ├─ PreDriveChecklist (L1 only): CLICK a list row → applyPreDriveStep → procedures/machine
          ├─ quiz-trigger: world event → concept → MicroQuizOverlay (pauses physics),
          │    graded server-side via learning.submitAnswer(context:"micro") → mastery ✓
          └─ finish → finishLessonAction: server re-grades wire events → SimSession row,
               deterministic debrief + concept links → SessionEndScreen. XP: none (union closed).
```

Key structural facts established by code reading:

- `VehicleInput` = `{throttle, brake, steer, handbrake}` only (`vehicle/VehicleSim.ts:38`). Gear is a **cosmetic display string** derived from speed ("R/N/1..5", `engine/telemetry.ts`); reverse is entered implicitly by holding brake while stopped. There is no engine on/off, no clutch, no stall, no manual gear state.
- `SimTick` (the rules contract) *does* carry `indicator, headlights, seatbeltOn, handbrakeOn, gear, mirrorGlance` — sampled from `CabinControls` + input each frame (`vehicleSample.ts`). The grading side is honest; the *actuation* side is keyboard toggles with no cockpit representation beyond HUD chips.
- The cockpit 3D model (`vitok/VitokCockpit.tsx`) has **zero interactive hotspots** (no onClick/onPointer/raycast anywhere in `components/sim/vitok/`).
- `LessonScene` receives `onPreDriveStep` as a prop and **never calls it** (grep: only declared, never invoked). SceneSlot's integrator contract item 4 ("forward cockpit interactions… as onPreDriveStep") is unimplemented. The only path into the pre-drive machine is clicking the checklist rows.

---

## 2. Disconnect inventory (education ⇄ simulation)

**D1 — The 13-step pre-drive checklist is answered, not performed (the founder's example, confirmed and worse than stated).**
`PreDriveChecklist.tsx` renders 13 buttons; clicking a button *is* the action. Six steps refer to vehicle systems that don't exist (see §3 table). Even the four steps whose systems DO exist (seatbelt, headlights, brake, signal) are not linked: clicking the row does **not** change the cabin/vehicle state, and operating the real control does **not** tick the row.

**D2 — Contradictory seatbelt grading.** Student clicks „Поставяне на колана“ ✓ → machine records `seatbeltOn: true` **in the procedure state only**. `cabin.seatbeltOn` remains `false`, so once they drive >5 km/h the rule engine fires `SEATBELT_OFF_WHILE_MOVING` (основна, 3 т.). The UI told them they belted up; the examiner then penalizes them for being unbelted. (machine.ts's header even documents double-flagging as "intentional" for a *skipped* belt — but it also hits students who *completed* the step.) Same latent bug class for headlights („Включване на светлините“ click ≠ `L` key) and signal („Подаване на мигач“ click ≠ `,` key).

**D3 — Dead key hints.** The checklist displays kbd hints (1…9, 0, F, S, Интервал) with a comment "the input layer owns actual key bindings" — no such bindings exist anywhere. Worse, the advertised keys collide with live driving keys: `S` = brake, `Space` = handbrake, `F` = rear-mirror glance.

**D4 — The car is fully driveable during the pre-drive phase.** Physics is not paused in `phase: "preDrive"`; the "engine" is effectively always running (throttle works from frame one). A student can drive the whole route with the checklist open: objectives silently don't advance (`applyTick` gates objectives on `phase === "driving"`), no explanation is given, and the 300 m they drove counts for nothing until they click „Потегляне“ — which then scores *skip* violations for the steps they "missed" while already 500 m down the road.

**D5 — "Move off" is a button, not a maneuver.** The step „Потегли плавно, когато пътят е свободен“ completes by click even while the car is stationary, in gear-N, unbelted, with pedestrians passing. Nothing checks the road actually was free, that the indicator was on (the cabin one), or that motion followed.

**D6 — Teach-first is a 4-second toast, not a teaching moment.** Doc 65 §5 (founder-approved): first encounter = "**pause**, contextual mini-lesson with the law citation". Shipped (`engine.ts` + `HudToasts.tsx`): a `pointer-events-none` toast („📚 Научи“) that auto-dismisses while the student is driving at speed. No pause, no acknowledgment, no replay, no illustration. The one mechanism that *does* pause (MicroQuizOverlay) is not used for teaching moments.

**D7 — Penalty escalation is designed but not wired.** `policy.ts` computes `penaltyMultiplier` (×1.0 → ×1.5 → ×2.0 on repeats — doc 65 promise). `lessons/engine.ts` uses only `decision.scored` and always applies catalog-fixed points. Repeat mistakes do not grade harder.

**D8 — Objectives measure geometry, not learning.** By design "objectives measure PROGRESSION, never correctness" (objectives.ts) — legitimate — but several are so loose they teach nothing:
- `l7-park` („Паркирай на заден ход в мястото“): completes for **any** reverse-gear moment + any 1.5 s stop **anywhere on the map**. There is no bay: grep confirms no parking-bay/hazard entity is rendered or checked (specs.ts admits scoring is "geometry-independent").
- `l5-emergency-stop`: no hazard is ever shown (specs.ts: world "should render a hazard cue" — it doesn't); the student brakes hard at a self-chosen moment, which trains nothing about reaction.
- `l4-crossings`: three `reachZone` passes — driving *past* a crossing completes it; yielding correctness is left to ambient-traffic luck (whether a pedestrian happens to be there).
- `l3-pass` roundabout: enter r≤26 m then exit r≥45 m — driving straight over the ring island would also complete it (violations aside).

**D9 — Scenario events happen by luck, not by design.** There is no spawner/orchestrator that stages an event (e.g. "pedestrian steps out at crossing X in L4", "car from the right at junction Y in L2"). Traffic is 26 ambient cars + 20 pedestrians anchored near spawn. Whether a lesson actually *exercises* its concepts depends on random NPC positions. The 45-event library (doc 65) is used only *reactively* — as a key for coaching violations after they occur.

**D10 — L2's stop-sign objective rests on a heuristic that may not fire.** specs.ts requires a Б2 stop line at node `n331942490`; `district-v1.json` contains **zero stopLines data** (verified) — lines are derived in `runtime/stoplines.ts` by a minor-meets-arterial heuristic that "over-approximates reality" and was never hand-verified at that node. If the heuristic doesn't classify that approach, objective `l2-stop-sign` can never complete and L3–L7 stay locked (linear unlock).

**D11 — Night pre-drive is unreachable.** The headlights checklist step is only *required* at night (`steps.ts`), but the only pre-drive lesson (L1) is a day lesson and the night lesson (L6) has `preDrive: false`. The one branch of the procedure that differs by conditions can never be exercised.

**D12 — Mirror "adjustment" vs mirror "glance" conflation.** The checklist teaches mirror *adjustment* (a setup action — doesn't exist in the vehicle); driving grades mirror *glances* (Q/E/F key taps that briefly swing the camera). Neither involves actually *seeing something in a mirror and deciding* — the glance is a keypress ritual the rule engine's `mirrorLookbackSec: 5` window accepts.

**D13 — Sim results don't feed the readiness/mastery system.** `computeReadiness` (learning module) reads only theory `Progress` rows. Sim violations produce `conceptIds` in the debrief → rendered as *links* to theory topics; they never lower mastery, schedule reviews, or move the readiness score. Only micro-quiz answers (max 2–4/session) touch mastery. The "closing the theory↔driving loop" claim in doc 65 §5 ("graded outcomes feed… the mastery/readiness score") is **not implemented**.

**D14 — No XP / gamification for sim.** `finishLessonAction` documents the integration ask: `GamificationEvent` union is closed (`practice_answer | exam_completed`), so sim lessons award `xpEarned: null` and the end screen hides the XP chip. Driving — the product's wedge — is the only activity that earns nothing.

**D15 — No practical-exam mode.** The exam module implements only the theory mock (45q/97/≥87/40min — correct). There is no sim counterpart: no exam-route mode, no examiner protocol (Наредба 38 practical: ~25 min city drive + maneuvers), no "exam readiness" gate combining theory + driving. Lessons pass/fail borrow the official point rule per session — good — but nothing simulates the actual practical exam experience the product name promises.

**D16 — Touch devices are hard-blocked.** `isTouchOnlyDevice()` gates the whole simulator with "отвори на компютър" — in direct tension with ADR-005 "must run on a mid-range phone". Currently no touch input layer exists at all.

**D17 — Founder/threshold validation gap.** PROGRESS.md §7: ~16 detectors + 6 commendations are unit-tested but *nobody has driven them in a browser*. All pedagogy thresholds (1.3 m lane offset, 1.8 s gap, 8 s keep-right…) are feel-unvalidated.

---

## 3. Missing-interaction inventory — pre-drive step by step

Every step of the 13-step procedure vs. what actually exists to perform it:

| # | Step (steps.ts) | Real interactive control? | What "performing" it is today | Vehicle/world state affected? |
|---|---|---|---|---|
| 1 | Настройка на седалката | **NONE** — no seat entity, no camera/seat position adjustment | click checklist row | none |
| 2 | Настройка на огледалата | **NONE** — mirrors not aim-able (glance keys exist, adjustment doesn't) | click row | none |
| 3 | Оглед на обстановката | **NONE** — no look-around requirement (free camera exists but is unmonitored) | click row | none |
| 4 | Поставяне на колана | **PARTIAL** — `B` key exists in cabin, but is NOT linked to the step | click row | **no** (cabin belt stays off → D2) |
| 5 | Проверка на контролните уреди | **NONE** — no dashboard state to check (cluster renders speed only; no telltales) | click row | none |
| 6 | Включване на светлините | **PARTIAL** — `L` key cycles off/low/high, NOT linked | click row | **no** |
| 7 | Запалване на двигателя | **NONE** — engine has no off state; throttle live from frame 1 | click row | none |
| 8 | Натискане на спирачката | **PARTIAL** — `S` is the brake, NOT linked (and not required to be held) | click row | none |
| 9 | Включване на предавка | **NONE** — no gear selector; gear is a cosmetic readout | click row | none |
| 10 | Освобождаване на ръчната | **NONE** — handbrake is a momentary Space *button*, never engaged at spawn; there is no parking-brake state to release | click row | none |
| 11 | Проверка в огледалата | **PARTIAL** — Q/E/F glance keys exist, NOT linked | click row | no |
| 12 | Подаване на мигач | **PARTIAL** — `,` key exists, NOT linked | click row | **no** (indicator stays off) |
| 13 | Потегляне | **PARTIAL** — driving exists, but the step completes by click while stationary | click row | none required |

**Score: 0 of 13 steps are performed through a real control.** 6 steps have no underlying system at all; 7 have a partial/adjacent system that is not connected.

### Vehicle controls a Bulgarian B-category exam expects that the sim lacks entirely

- **Ignition / engine start-stop** (and an engine that can be off, with the start-after-mirrors ordering actually enforceable)
- **Clutch + manual gearbox** (most BG candidates train/test on manual; no clutch → no stalling, no hill-start skill, no smooth-start skill)
- **Gear selector** of any kind (even automatic P-R-N-D; reverse today = hold brake while stopped)
- **Stateful parking brake** (engaged at spawn; movable lever; `HANDBRAKE_LEFT_ON` currently only fires if the student *holds Space* while driving)
- **Adjustable seat & mirrors** (any representation)
- **Hazard lights** (аварийни светлини — needed for emergency-stop event ev-emergency-stop-triangle)
- **Horn**
- **Wipers** (rain exists visually; wipers don't)
- **Fog lights** front/rear (ev-lights-usage teaches чл. 74/75 — not actuatable)
- **Dashboard telltales** (ev-warning-light is un-buildable; "check dashboard" step has nothing to show)
- **Analog pedals on keyboard** (throttle/brake are 0/1 binary; gamepad analog exists but is optional)
- **Doors / Dutch reach** (Phase-3 doc 65)

Present and functional (credit where due): steering, throttle/brake, momentary handbrake, indicators with realistic auto-cancel, 3-state headlights, seatbelt toggle, mirror glances with camera excursion, camera switch, difficulty presets, engine audio, gamepad.

---

## 4. Lesson-by-lesson audit (L0–L7)

| Lesson | Pedagogical intent | What is actually verified | Gap |
|---|---|---|---|
| L0 free drive | acclimatization + live rules | violations/commendations only; manual "finish" | fine as-is |
| L1 preparation | 13-step procedure + smooth move-off + smooth stop | checklist clicks; 300 m odometer; decel ≤3.5 m/s² | the entire procedure is theater (§3); "smooth move-off" not measured (no jerk/stall check) |
| L2 intersections | stop sign + 2 traffic lights | `stopLineCrossed` events within 30 m radii | depends on heuristic stop line (D10); no requirement the lights were *red at some point* — hitting 3 greens teaches nothing; priority adjudicators only fire if ambient traffic happens to conflict |
| L3 roundabout | yield on entry, signal on exit | enter/exit radii only | exit-signal discipline not checked (concept c-driver-signals listed but ungraded here — `TURN_WITHOUT_INDICATOR` needs a `turnStarted` event, roundabout exits don't emit one); yield graded only if a circulating NPC happens to be there |
| L4 crossings | approach speed + yielding to pedestrians | 3 reachZones | zones complete regardless of behavior; pedestrian presence is random; no staged "child steps out" event (the #1 exam-relevant hazard) |
| L5 emergency braking | reaction + hard controlled stop | ≥40 km/h then peak decel ≥5 m/s² to stop | **no hazard stimulus** — student self-triggers; reaction time (the actual skill, c-reaction-time) unmeasured; no ABS/lockup model |
| L6 night driving | lights + adapted speed | 400 m + smooth stop with `isNight` rules | fine as far as it goes; headlights ON is graded but *turning them on* is one keypress; no oncoming-dazzle event (c-dazzle-handling listed, nothing implements it) |
| L7 parking | reverse-park into a bay | any reverse + any 1.5 s stop | no bay geometry, no alignment/attempt-count/curb detection — the flagship maneuver lesson verifies essentially nothing (D8) |

**Missing lesson types** (vs. BG practical-exam & driving-school curriculum): hill start (needs clutch/brake-hold physics), reversing in a straight line / around a corner, **parallel parking**, perpendicular/garage parking, U-turn (ev-uturn-reverse), overtaking (ev-overtake — the single highest-leverage event: 33q/75pt), being overtaken, extra-urban/higher-speed roads, **motorway entry/exit** (no motorway in the district), railway crossing (always-grade event, unreachable), tram/bus/cyclist interactions (no such actors), emergency-vehicle response, narrow-street oncoming priority (ev-oncoming-meeting), driving by itinerary/sign navigation, eco-driving, adverse weather as a *lesson* (rain exists as env flag; no lesson uses it — `rain` is never set by any spec).

---

## 5. Progression, pass criteria, feedback quality

- **Unlocks:** strictly linear by `order`, previous lesson must have ≥1 passed attempt; L0 always open. No skill-based placement, no re-lock/decay, no spaced re-practice of a weak lesson. One bad dependency: any content/geometry bug in a lesson (e.g. D10) bricks the rest of the curriculum.
- **Pass rule per lesson:** official exam scoring (≤9 т., ≤6 основни, no опасна) **AND** all objectives **AND** not aborted — a sound, honest translation of doc 32 to a per-lesson unit. But note the tension: teach-first *unscores* first minor mistakes, so "passed" is systematically easier than an exam; there is no "exam-strict" mode where the coach is off.
- **Feedback quality — good bones:** every violation carries точки + severity + чл.-citation + a genuinely instructive Bulgarian explanation authored in the catalog (ADR-002-compliant). The debrief (deterministic template) is well structured: verdict → personal-best delta → theory-in-motion tally → what went well → worst mistakes grouped by severity → "practice this next" concept with a theory link. Server recomputes everything; client can't cheat scores.
- **Feedback quality — misses:** violation *toasts* show title+law but not the explanation (only "teach" toasts include it); there is no post-session **map/replay of where mistakes happened**, no per-mistake "what should you have done" walkthrough, no way to re-open a past debrief from the sim UI (stored in DB, no history screen), and the AI-tutor debrief seam is unwired (no API key; acceptable for now, the fallback is fine).
- **Micro-quizzes:** the best-integrated piece — triggered by real world events (crossing zones, stop lines, turns, priority situations), physics pauses, graded server-side into the same mastery as theory, tallied in the debrief. Limits: cap 2 (occasional) / 4 (frequent) per session; only 5 target concepts; picks the *first* unseen bank question rather than the weakest-mastery one.

---

## 6. Scenario-engine: planned vs live vs reachable in lessons

- Library: **45 events** (event-library.json, law-corrected). Detector mapping (`scenarios/mapping.ts`): 19 violation codes → **15 unique events**. So **15/45 (33%) of the event library is detectable at all**; the remaining 30 events (incl. the top-leverage ev-overtake, ev-illegal-stop-zone, ev-emergency-stop-triangle, ev-railway-crossing, ev-cyclist/tram/bus, ev-traffic-controller, ev-parking-maneuver…) have no detector, no actor, or no world entity.
- Of the 15 detectable, what a student can actually *encounter inside the 8 lessons* is narrower still — no lesson stages conflicts, so priority/following/pedestrian events depend on ambient-traffic chance (D9); rain events are unreachable (no lesson sets `rain`); `FAILED_TO_YIELD` four-way adjudicators are live but keyed to one shared scenario id (PROGRESS §5.3 notes the granularity loss).
- Teach-first policy is live but degraded (toast not pause — D6; no escalation — D7). Doc 65's per-question `altMethod` routing for the 431 non-simulatable questions (quiz/diagram/animation/checklist/impairment-demo) exists as data only — nothing consumes it.

---

## 7. What Alpha's educational loop should be

**Principle: every checklist item becomes a control; every lesson objective becomes a staged, observable behavior; every result moves the learner model.**

1. **Interactive cockpit v1 (kills D1–D5, §3).** Give the vehicle real state: `engineOn`, `parkingBrakeOn` (engaged at spawn), `gear ∈ {P,R,N,D}` or `{R,N,1..5}+clutch` per difficulty, `seatbelt`, `lights`, `indicator` — all operable from BOTH clickable cockpit hotspots (raycast targets on the Vitok/Aurelis cockpit meshes: key/start button, belt, stalk, lever, shifter) AND keyboard. **Delete the checklist buttons.** The pre-drive machine subscribes to *actual state transitions* (`onEngineStart`, `onBeltOn`, …) and its panel becomes a read-only progress display. The car must physically refuse to move off with the parking brake on (drag) and, on manual difficulty, stall without clutch — that IS the lesson.
2. **One state, one truth.** `CabinControls`/vehicle state is the single source; procedures, rules and HUD all read it. This automatically fixes contradiction D2 and makes the seatbelt/lights/indicator steps performable.
3. **Scenario orchestration layer (kills D8–D9).** A per-lesson script that *stages* events: spawn a pedestrian to step out in L4, a right-priority car in L2, a braking lead car for L5 (hazard stimulus + measured reaction time), a marked bay with geometry checks in L7. Reuse the 45-event library as the vocabulary; 1–3 staged events per lesson, deterministic seeds per attempt.
4. **Teach moment = pause + card (restores doc 65 §5).** On a first teachable encounter: freeze physics (the MicroQuizOverlay pattern already exists), show the mini-lesson + citation + a 5-second ghost replay, require acknowledgment, optionally a 1-question check, then resume with the situation reset. Wire `penaltyMultiplier` into scoring.
5. **Exam mode.** A "Пробен практически изпит" route: pre-drive performed on controls, ~10–15 min mixed route with staged events, coach OFF (always-grade), official termination rules, examiner-style protocol at the end. Gate it behind lesson completion; feed it into a combined readiness score.
6. **Close the loop into the learner model.** (a) Open the `GamificationEvent` union for `sim_lesson`; (b) let sim violations decrement/schedule the linked concepts in the learning store (they already carry `conceptId`); (c) readiness = f(theory mastery, sim mastery per event family) — even a crude 80/20 blend beats the current 100/0; (d) surface "your sim weak spots" on the dashboard next to weakest concepts.
7. **Lesson roadmap for Alpha (in order of exam value ÷ build cost):** hill start + stall/clutch (after control model), parallel parking + bay geometry, overtake (needs lead/oncoming staging — highest exam leverage), staged pedestrian hazards, adverse-weather lesson (rain flag already works end-to-end), railway crossing (always-grade), U-turn/reversing. Motorway/tram need world expansion — post-Alpha.
8. **Fix now regardless:** verify/hand-place the Б2 line at `n331942490` (D10, curriculum-bricking risk); bind or remove the dead checklist key hints (D3); block or explain driving during pre-drive (D4); founder drive-and-tune pass (D17).

---

## 8. File map (evidence)

| Area | Files |
|---|---|
| Pre-drive machine + steps | `platform/src/modules/sim/procedures/{steps,machine,types}.ts` |
| Checklist UI (click-to-complete) | `platform/src/modules/sim/hud/PreDriveChecklist.tsx` |
| Cabin controls (parallel state) | `platform/src/components/sim/cabin.ts`, `vehicleSample.ts` |
| Vehicle input/physics (no engine/gears/clutch) | `platform/src/modules/sim/engine/input.ts`, `vehicle/VehicleSim.ts`, `engine/telemetry.ts` |
| Lesson specs L0–L7 | `platform/src/modules/sim/lessons/specs.ts` |
| Session engine + coach wiring | `platform/src/modules/sim/lessons/engine.ts` |
| Objectives (loose maneuver checks) | `platform/src/modules/sim/lessons/objectives.ts` |
| Rules (22 codes, official scoring) | `platform/src/modules/sim/rules/{catalog,types,engine,summary,scoring}.ts` |
| Teach-first policy (escalation unwired) | `platform/src/modules/sim/scenarios/{policy,coach,mapping}.ts`, `event-library.json` |
| Micro-quiz loop (works) | `platform/src/modules/sim/lessons/quiz-trigger.ts`, `app/(dashboard)/simulator/micro-quiz-actions.ts` |
| Debrief + persistence (no XP, no readiness feed) | `platform/src/modules/sim/lessons/{debrief,wire,store,progression}.ts`, `app/(dashboard)/simulator/actions.ts` |
| Readiness (theory-only) | `platform/src/modules/learning/readiness.ts` |
| Shell / page flow | `platform/src/components/sim/lesson-ui/LessonPlayShell.tsx`, `LessonScene.tsx`, `app/(dashboard)/simulator/{page,simulator-client}.tsx` |
| Planned vs live | `docs/simulation/65_SCENARIO_BASED_LEARNING_ENGINE.md`, `docs/simulation/scenario-engine/PROGRESS.md` |
