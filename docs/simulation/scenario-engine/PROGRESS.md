# Scenario Engine — Build Progress & Resume Point

**Last updated:** 2026-07-09 · **Branch:** `scenario-engine` · **Status:** Phase-1 done, Phase-2 in progress (3 adjudicator slices done)
**Read this first to resume.** Companion: the plan is [65_SCENARIO_BASED_LEARNING_ENGINE.md](../65_SCENARIO_BASED_LEARNING_ENGINE.md).
**Latest commits (newest first):** `c9ac71e` right-hand-rule adjudicator · `3caf6f5` conflictFromRight query · `0823d5b` this doc · `9ebb997` left-turn yield · `9ab9866` give-way yield · `8f1af51` priority pipeline · (+ Phase-1 & analysis below). **689 tests pass.**

---

## 1. TL;DR — where we are

Turning the 1,016-question theory bank into "learn by driving." The analysis + reusable event library are done; **teach-first-then-grade is live**; and the simulator now detects **~14 mistakes in real time** (was 7 at the start of this work), all flowing through the teach-first policy. Phase 2 (the priority/right-of-way framework) is **started**: the grading pipeline + two adjudicator slices (give-way yield, left-turn yield) are live.

## 2. Git state & how to revert

- Branch **`scenario-engine`** (NOT `main`). Working tree clean.
- Revert checkpoint = tag **`pre-scenario-engine`** (commit `2f534eb`).
  - `git reset --hard pre-scenario-engine` → drops the whole scenario engine, keeps the earlier session work (HUD UI, Kenney buildings, traffic).
  - `git checkout main` → back to pre-session state entirely.
- 9 commits since the checkpoint (newest first): `9ebb997` left-turn yield · `9ab9866` give-way adjudicator · `8f1af51` priority pipeline · `43bd7eb` keep-right · `9b5aa1f` wrong-way · `a0f4fb8` following-distance · `facfd39` weather detectors · `1af5f99` teach-first live + lane-keeping · `6b2a50c` analysis+library+policy.

## 3. What's built

### 3a. Analysis + reusable library (commit 6b2a50c)
- **19-agent analysis** of all 1,016 questions → **45 canonical events**, ~58% simulatable.
- `docs/simulation/scenario-engine/scenario-map.json` — all 1,016 rows (Q → scenario/trigger/detection/success/failure/feedback/event/policy/altMethod).
- `docs/simulation/scenario-engine/event-library.json` + `platform/src/modules/sim/scenarios/event-library.json` — the 45 events (law-corrected).
- `platform/src/modules/sim/scenarios/` — typed registry (`events.ts`), **teach-first-then-grade policy** (`policy.ts` `resolveEncounter`), catalog↔scenario map (`mapping.ts`), the **coach** (`coach.ts` `coachStep`/`coachSession`), `index.ts`. Tests: `events.test.ts`, `policy.test.ts`, `coach.test.ts`.

### 3b. Teach-first-then-grade (live, commit 1af5f99)
Integrated in `platform/src/modules/sim/lessons/engine.ts` `applyTick`. First encounter of a *minor* mistake → live "📚 Научи" lesson toast (`HudEvent` kind `"lesson"` in `contracts.ts`, rendered in `hud/HudToasts.tsx`), **not scored**; repeats graded. **Safety floor:** опасна / terminating errors always grade from tick one (`coach.ts`). Per-session counts in `LessonSessionState.scenarioEncounters`. **This is why existing rule tests didn't break** (опасна still grades immediately).

### 3c. Live detectors (rules/engine.ts + rules/catalog.ts, mapped in scenarios/mapping.ts)
Original 7: speeding (minor/dangerous), red-light, stop-sign no-stop, turn/lane-change indicator, lane-change mirror, seatbelt, headlights-at-night, pedestrian too-fast/not-yielded, collision.

**New this session** (catalog code · severity · scenario · thresholds in `DEFAULT_RULE_CONFIG`):
- `POOR_LANE_KEEPING` · второст. · ev-lane-discipline · `laneKeepMaxOffsetM 1.3`, `laneKeepSustainSec 3`
- `SPEED_TOO_FAST_FOR_CONDITIONS` · второст. · ev-speed-for-conditions · rain×0.85 / night×0.9 factor, sustain 3
- `HEADLIGHTS_OFF_IN_RAIN` · второст. · ev-adverse-weather · sustain 3 (day only; night covered by HEADLIGHTS_OFF_AT_NIGHT)
- `FOLLOWING_TOO_CLOSE` · основна · ev-following-distance · `followSafeSeconds 1.8`, `followMinGapM 4`, `followMinSpeedKmh 15`, sustain 2
- `WRONG_WAY` · опасна · ev-sign-prohibitory · one-way, heading vs geometry-forward > 120°, sustain 1.5
- `NOT_KEEPING_RIGHT` · второст. · ev-lane-discipline · non-rightmost lane on multi-lane, sustain 8
- `FAILED_TO_YIELD` · опасна · ev-junction-priority-sign · Phase-2 (see 3d)

New SimTick fields threaded (all optional): `rain`, `leadGapM`, `wrongWay`, `laneCount` (set in `worldRuntime.sample`, wired from `LessonScene`/traffic).

### 3d. Phase 2 — priority pipeline + adjudicator (commits 8f1af51, 9ab9866, 9ebb997)
- **Pipeline:** the reserved `prioritySituation` SimTick event is now graded by the reducer → `FAILED_TO_YIELD` when `violated` (situation carried in `detail`).
- **Adjudicator slice 1 — give-way/stop yield:** on crossing a give-way/stop line, `worldRuntime` calls `traffic.conflictNear()` (pure `conflictNearFor` — a moving *crossing/oncoming*, not same-direction, vehicle near the junction) → emits `prioritySituation{give-way}`. Wired via `runtime.setJunctionConflictQuery()` (mirrors `setPedestrianQuery`), `nodePos` map, hook in `fireLine`.
- **Adjudicator slice 2 — left-turn yield:** on `turnStarted:left` in a junction area, `worldRuntime` calls `traffic.oncomingNear()` (pure `oncomingNearFor` — vehicle *ahead* heading opposite) → emits `prioritySituation{left-turn}`. Wired via `runtime.setOncomingQuery()`, hook after `turns.update`.
- **Adjudicator slice 3 — right-hand rule (commit c9ac71e):** `worldRuntime` classifies uncontrolled equal junctions (`uncontrolledJunctions`: degree≥3, not signalized, no stop line guarding — 93 candidates in this district; `debugUncontrolledJunctions()` accessor) and tracks junction entry (`rhrNode`/`rhrFired`, one per visit). On entering the core (`RHR_CORE_RADIUS_M 9`) while moving with a vehicle from the RIGHT (`traffic.conflictFromRight` / `conflictFromRightFor`, wired via `setRightConflictQuery`) → emits `prioritySituation{right-hand-rule}`.
- Integration-tested against real geometry: `runtime/__tests__/priority-conflict.test.ts`, `left-turn-yield.test.ts`, `right-hand-rule.test.ts`. Traffic queries unit-tested: `traffic/{conflict,oncoming,right-conflict}.test.ts`.

## 4. The reusable pattern (how to add a detector)

**Field-based detector (reads a SimTick field):** add optional field to `SimTick` (rules/types.ts) → set it in `worldRuntime.sample` (or thread a param from `LessonScene`→`sample`) → add `ViolationCode` + `DEFAULT_RULE_CONFIG` thresholds → add `EpisodeState` + `stepEpisode` detector in `rules/engine.ts` → catalog spec in `rules/catalog.ts` → `scenarios/mapping.ts` → tests (`rules/__tests__/*.test.ts` using `tick`/`drive`/`codes` from `./fixtures`).

**Priority (Phase-2) detector:** worldRuntime detects the situation + calls a traffic query → emits `prioritySituation{situation, violated}`. Reducer already grades it. Add a `set*Query` (mirror `setPedestrianQuery`) if a new traffic query is needed; wire it in `LessonScene`'s load effect next to the others. Pure traffic helpers live in `traffic/system.ts` (`leadGapFor`, `conflictNearFor`, `oncomingNearFor`), unit-tested.

## 5. NEXT TASK: pick from these (right-hand rule is DONE — see §3d slice 3)

The three core right-of-way situations (give-way/stop, left-turn, right-hand rule) are live. Candidate next steps, easiest first:
1. **Roundabout-entry yield** — on entering the roundabout (`district.roundabouts`, `rb-1`), yield to circulating traffic. Reuse the conflict-query pattern; detect entry via proximity to the roundabout center + a "circulating vehicle present" query. Tractable.
2. **Refine FAILED_TO_YIELD scenarios** — currently all three situations map to one `FAILED_TO_YIELD` code → `ev-junction-priority-sign` (the `detail` distinguishes them). Optionally split into distinct catalog codes/scenarios (ev-junction-uncontrolled, ev-left-turn-yield-oncoming) for finer teach-first tracking + theory linkage.
3. **NPC actor library** (doc-65 Phase 2, BIGGER) — cyclist, tram, bus-pullout, emergency-vehicle. These need NEW traffic actor *types* (the traffic system only has cars + pedestrians), so it's a traffic-system expansion, not just a query. Highest coverage but most work.
4. **Priority-road guard** — not strictly needed yet (RHR only fires at equal junctions, and only on right-conflicts, so a priority driver isn't flagged), but revisit if false positives appear on test-drives.

## 6. Remaining roadmap (doc 65)

- **Phase 2 rest:** right-hand rule (above), priority-road, roundabout-entry yield, then the NPC **actor library** (cyclist, tram, bus-pullout, emergency-vehicle) — these need new traffic actor types.
- **Phase 3:** new signals/attention (gantry lane-control, dashboard telltales, driver-distraction, animal hazard, parking, police-stop, accident-scene conduct).
- **Phase 4:** vehicle-dynamics physics (skid/aquaplane/ice, ABS/threshold braking) — needs new Rapier friction/brake model.
- **Deferred Phase-1 items** (borderline, not clean quick wins): `illegal-stop zones` (false-positive-prone), `warning-sign anticipation` (needs new world sign entities — only 4 sign kinds exist).

## 7. Outstanding NON-code items

- ⚠️ **Founder has NOT driven any of this in a real browser yet.** Thresholds are test-verified but not feel-validated. Strongly worth a drive-and-tune pass. Server: `http://localhost:3000/simulator` (dev server runs on the host, PID-managed; `npm run dev` in `platform/` if down). `/simulator` requires login (register — no email verification).
- The headless preview panel throttles physics/rAF → the sim looks frozen there; must use a **real foreground browser tab**.
- Founder-side (unrelated to this work): `ANTHROPIC_API_KEY` (AI tutor), Stripe keys (payments), ~290 flagged questions to review, deploy.

## 8. Verify commands

`cd platform` then: `npx tsc --noEmit` · `npm test` (689 tests) · `npm run build`. All green as of the last commit (`c9ac71e`).
