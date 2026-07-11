# 72 · Real-Life Scenario Taxonomy — the ground truth for 1000+ sim exams

**Status:** v1.0 — research synthesis complete
**Date:** 2026-07-12
**Owner:** A1 (scenario-taxonomy lane of the exam-generation program)
**Upstream:** docs/education/32 (official Наредба № 38 scoring — LAW for this doc) · docs/simulation/65 (45-event canonical library) · `platform/src/modules/sim/rules/types.ts` (22 ViolationCodes) · `platform/src/modules/sim/orchestrator/` (5 staged-event kinds)
**Rule:** every archetype below is grounded in (a) what real drivers actually do wrong on real roads, per recorded evidence, and (b) what the real Bulgarian practical exam actually grades. Nothing is invented for gameplay.

---

## 1. Method & evidence base

Four research lanes, exhausted in Bulgarian + English:

1. **Наредба № 38 + examiner practice (BG).** Official taxonomy: **опасни грешки (10 т., изпитът се прекратява)** — влизане на червен сигнал/срещу регулировчик, движение срещу еднопосочно/пътен възел, неспиране на Б2 „Спри!“, намеса на комисията при опасно действие, ПТП; plus >10 km/h over the limit (doc 32). **Основни (3 т.)** = неправилни действия от липса на знания/умения. **Второстепенни (1 т.)** = правилни, но неточни действия (мигач, настъпване на осева линия, близка дистанция, закъснели действия, загасване). Pass ≤ 9 т., от които ≤ 6 от основни. Protocol: 25–35 min in-town, **≥ 3 regulated junctions, ≥ 5 right turns, ≥ 5 left turns, one обратен завой, lane crossing on a two-lane road, slope stop/start, parallel or perpendicular parking** (Наредба 38 route requirements as reproduced by school sites). Instructor-forum consensus on top скъсване causes: STOP without full stop, yellow-treated-as-green, pedestrian not yielded, mirrors/seat/belt skipped, отнемане на предимство, harsh braking, too-close distance, stalling.
2. **Novice-driver crash causation (EU/BG).** SWOV young-drivers fact sheet: novices are over-represented in **single-vehicle, run-off-road and loss-of-control-in-curve** crashes; highest risk in first 6–12 months; hazard-anticipation is the trainable deficit. ERSO: **40–60% of all crashes occur at junctions**. NHTSA: **rear-end = 29% of all crashes**; young drivers over-represented in speeding fatals. EU: **70% of urban road deaths are vulnerable road users**. Bulgaria: 2nd-worst EU fatality rate (74/million, 2024); 18–24 risk ≈ 4× the 30–59 band (МВР/SBA).
3. **DVSA (UK) — the best-documented fault system.** Top-10 fail causes, stable for years: **#1 junction observation**, #2 mirror use on direction change, #3 steering control, #4 right-turn positioning, #5 move-off observation, #6 traffic-light response (incl. waiting at green filter, stopping past the line), #7 move-off control (stalls, rolling back, handbrake), #8 normal positioning (lane straddle), #9 road-marking response (solid lines, arrows, boxes), #10 reverse-park control. Marking logic: **minor** (≤15 allowed) vs **serious** (potential danger) vs **dangerous** (actual danger) — one serious/dangerous = fail; a habitual minor escalates to serious. Hazard-perception clip taxonomy: ~13 archetype families; **pedestrian hazards ≈ 35% of clips, emerging vehicles ≈ 25%**, plus cyclists, parked-car occlusions, animals, meeting situations.
4. **German Prüfungsrichtlinie + Fahrschule catalog.** Automatic fail (erhebliches Fehlverhalten) examples: passing a school/line bus with hazards on at > 20 km/h, settling into the oncoming lane to turn left, **no reaction to children/elderly/helpless persons**, violating Verkehrsverbote, insufficient observation causing danger, hitting a person/vehicle/object; fail also on **repetition/accumulation** of lesser faults. Grundfahraufgaben Klasse B: emergency brake from ~30 km/h (schlagartig, full deceleration), reverse right around a corner, parallel reverse park, perpendicular park, turning-in-road — with codified faults (curb contact, no parallel end pose, **> 2 correction moves**, insufficient observation).

**Vocabulary this doc maps into (read-only contract):** 22 `ViolationCode`s + 6 commendations (`rules/types.ts`, `rules/catalog.ts`); SimTick events `stopLineCrossed / crossingZoneEntered / crossingPassed / turnStarted / collision / mirrorGlance / prioritySituation`; staged-event kinds `pedestrianDartOut / priorityFromRight / brakingLeadCar / cyclistRightHook / roundaboutEntry` driven through the traffic `stage()` port (vehicle actors on the lane graph with hold/cruise/matchPlayer/brake commands; pedestrian actors on a path with a road-occupancy span); lesson conditions `timeOfDay day|dusk|night` + `rain`; exam mode per doc 32 termination rules; 45-event library ids `ev-*` (doc 65).

## 2. How to read an archetype

```
ID · Име (BG) / Name (EN)
Real life:  the concrete situation as it happens on Bulgarian streets
Mistake:    what recorded drivers actually do wrong
Evidence:   the source lane(s) that ground it
Н38:        severity class per Наредба 38 (опасна 10 / основна 3 / второстепенна 1; „прекратяване“ where official)
Engine:     ViolationCode(s)/commendations that grade it ← detector/staged kind; ✅ FULL (stageable today) /
            🟡 PARTIAL (graded, but the situation can't be fully staged/authored yet) /
            🔴 NEW: one-line spec of the missing capability
Cond:       D(ay)/N(ight)/R(ain) applicability — ×N/×R = the conditions axis multiplies difficulty honestly
W:          exam-generation frequency weight 1 (rare flavor) … 5 (core, most exams)
```

A `NEW:` tag names ONE capability; capabilities are deduplicated and ranked in §16. Archetypes are **situation archetypes**, one level more concrete than doc 65's 45 events: each references its `ev-*` parent, and one event typically fans out into 3–6 archetypes (that fan-out is where the exam variety honestly comes from).

---

## 3. Family VP — Vehicle procedure & cockpit discipline (13)

**VP-01 · Пропусната подготовка преди потегляне / Pre-drive procedure skipped**
Real life: candidate jumps in and drives; seat wrong, mirrors show sky, belt off. Real exams START here — BG examiners quiz vehicle checks before moving (doc 32).
Mistake: skipping/mis-ordering seat → mirrors → belt → engine → gear → handbrake → shoulder check.
Evidence: Н38 pre-drive quiz; BG instructor consensus (seat/mirrors/belt among top скъсване causes); DVSA "move off safely" top-5.
Н38: второстепенна per step, основна for the belt. W: 5. Cond: D/N/R.
Engine: PREDRIVE_STEP_SKIPPED / PREDRIVE_SEATBELT_SKIPPED / PREDRIVE_WRONG_ORDER / PREDRIVE_PERFECT ← procedures/machine.ts, preDriveMode instruction/practice/assess — ✅ FULL (lib ev-seatbelt / c-pre-drive-check)

**VP-02 · Колан по време на движение / Belt off while moving**
Real life: belt unclipped mid-drive ("it's 200 m"), or clicked behind the back — real BG habit.
Mistake: driving unbelted; not re-securing after a stop.
Evidence: Н38 основна; BG road-safety campaigns; catalog c-seatbelts.
Н38: основна (3). W: 4. Cond: D/N/R.
Engine: SEATBELT_OFF_WHILE_MOVING ← belt detector (1 s sustain) — ✅ FULL (ev-seatbelt)

**VP-03 · Потегляне на грешна предавка / Move-off in wrong gear**
Real life: selects R instead of D at a parallel-park exit, lurches backward toward the car behind; or moves off in N and revs.
Mistake: no gear check before releasing brake.
Evidence: DVSA "move off — control"; Grundfahraufgaben observation faults.
Н38: второстепенна (основна if it creates danger). W: 2. Cond: D/N/R.
Engine: 🟡 PARTIAL — `gear` is on every SimTick; reverse motion at move-off is detectable, but no detector grades it. NEW: move-off gear/rollback check inside the existing move-off window.

**VP-04 · Загасване на двигателя / Repeated stalling**
Real life: stall at green, at the Б2, on the hill — the classic exam-nerves error; official второстепенна in BG practice.
Mistake: clutch/brake mismanagement at move-off (manual fleet).
Evidence: BG instructor lists („загасване на автомобила“ = 1 т.); DVSA move-off control ("repeated stalling").
Н38: второстепенна each; fail by accumulation. W: 3. Cond: D/N/R.
Engine: 🔴 NEW: stall event on SimTick (engine-state channel exists in driveline; expose `stalled` tick event) → grade второстепенна via a new small detector; escalation on repetition already exists (scenarios/policy).

**VP-05 · Ръчна спирачка при потегляне / Handbrake left on**
Real life: pulls away with the handbrake set, car drags, dash lamp on.
Mistake: no release in the move-off sequence; ignoring the telltale.
Evidence: BG pre-drive procedure; DVSA move-off control.
Н38: второстепенна (1). W: 3. Cond: D/N/R.
Engine: HANDBRAKE_LEFT_ON ← handbrake detector (1.5 s sustain) — ✅ FULL

**VP-06 · Контролна лампа по време на движение / Dashboard warning light response**
Real life: oil/temp/brake lamp lights mid-drive; driver ignores it for kilometers.
Mistake: not categorizing red-lamp = stop now vs amber = check soon.
Evidence: ev-warning-light (doc 65 — the only drivable action of the vehicle-knowledge topic).
Н38: второстепенна (training value; not an exam-route staple). W: 1. Cond: D/N/R.
Engine: 🔴 NEW: cockpit telltale stimulus (director-triggered dash lamp + expected response window: safe stop or verbal ack) — Phase-3 item in doc 65.

**VP-07 · Дисциплина на огледалата / Mirror-check cadence**
Real life: drives minutes without a single mirror glance; brakes without knowing what's behind — DVSA's #2 fail cause worldwide.
Mistake: no mirror before braking/direction change/speed change.
Evidence: DVSA top-10 #2 ("changing direction/pulling up with no mirror checks"); BG основна for maneuver without огледало.
Н38: основна at maneuvers; второстепенна as cadence. W: 4. Cond: D/N/R ×N.
Engine: 🟡 PARTIAL — LANE_CHANGE_WITHOUT_MIRROR_CHECK covers lane changes (mirrorGlance channel, 5 s lookback). NEW: extend mirror-lookback grading to braking-to-stop and move-off windows (same channel, two more windows).

**VP-08 · Гладкост на волана / Steering control (jerk)**
Real life: saw-tooth steering, kerb clips on turns, over-correction wobble after lane change.
Mistake: gripping at full lock, late big inputs instead of early small ones.
Evidence: DVSA top-10 #3 (steering control — mounting the kerb); Grundfahraufgaben curb-contact fault.
Н38: второстепенна (основна when kerb hit). W: 3. Cond: D/N/R ×R.
Engine: 🟡 PARTIAL — POOR_LANE_KEEPING catches the outcome (sustained off-center); collision(staticObject) catches kerb strikes if kerbs are colliders. NEW: steering-smoothness metric (heading-rate jerk percentile) as a debrief stat, not a violation.

**VP-09 · Плавно спиране / Smooth, planned stops**
Real life: BG examiners explicitly fail „много рязко спиране, което създава предпоставка за ПТП“; passengers' heads nod = bad plan.
Mistake: late sighting → hard brake at the line instead of early lift-off.
Evidence: BG examiner practice (explicit скъсване cause); eco-defensive curriculum.
Н38: основна when it endangers (rear traffic), else второстепенна. W: 4. Cond: D/N/R ×R.
Engine: 🟡 PARTIAL — smoothStop maneuver objective exists (maxDecelMs2 3.5); NEW: route-wide no-cause harsh-brake detector (decel > threshold with no hazard/stimulus active — the director knows when hazards are live, so false positives are controllable).

**VP-10 · Икономично каране / Eco-driving discipline**
Real life: full-throttle spurts between red lights, engine screaming in 2nd.
Mistake: accelerating into visible red; no anticipation of flow.
Evidence: ev-eco-defensive (63q topic); CIECA GDE matrix level-2 goals.
Н38: not scored on the real exam — learn-only. W: 1. Cond: D.
Engine: 🟡 PARTIAL — `rpm` optional field reserved on SimTick; NEW: eco detector (rpm/throttle windows) emitting commendation-style feedback only (no violation).

**VP-11 · Спиране по полицейски сигнал / Police stop signal**
Real life: patrol signals stop with a raised stop-paddle; new drivers panic-brake in-lane instead of pulling right.
Mistake: stopping in the traffic lane / ignoring the signal.
Evidence: ev-police-stop-signal (doc 65 Phase 3); ЗДвП driver obligations.
Н38: основна (опасна if the stop endangers). W: 1. Cond: D/N.
Engine: 🔴 NEW: police actor (roadside prop + signal state) + pull-over evaluator (reuses parkInBay-style rest check on the shoulder zone).

**VP-12 · Поведение след ПТП / Post-collision conduct**
Real life: after any contact the exam is over — but the LEARNING moment is hazards-on, secure scene, triangle at distance, no fleeing.
Mistake: driving off; standing in live traffic.
Evidence: ev-accident-scene-conduct; ПТП/първа помощ topic (64q).
Н38: n/a (exam already terminated) — post-terminate teach beat. W: 1. Cond: D/N/R.
Engine: 🟡 PARTIAL — COLLISION terminates and the sim continues for learning (types.ts); NEW: post-collision interactive checklist (hazards, triangle placement) as a debrief-mode mini-procedure (Phase 3).

**VP-13 · Разсейване от телефон / In-car distraction event**
Real life: phone buzzes on the seat; two seconds of glance = 28 m blind at 50 km/h. Top young-driver killer factor worldwide.
Mistake: glancing at the stimulus instead of ignoring/parking.
Evidence: CDC/NHTSA teen-driver distraction data; ev-driver-distraction.
Н38: основна (examiner marks lack of attention). W: 2. Cond: D/N ×N.
Engine: 🔴 NEW: distraction stimulus channel (director fires a cockpit event; gaze-off-road proxy measured via existing mirror/hotspot gaze input) — grades attention lapse only when a staged hazard coincides.

---

## 4. Family JU — Junctions, priority & signals (24)

**JU-01 · Отнемане на предимство отдясно / Right-hand-rule blind entry**
Real life: equal uncontrolled Sofia backstreet junction; a car approaches from the right at 30–40 km/h, half-masked by parked vans. Novices scan left only — or not at all — and roll in.
Mistake: enters without slowing or looking right; right-side car brakes hard.
Evidence: DVSA #1 fail cause (junction observation); ERSO 40–60% of crashes at junctions; Н38 „отнемане на предимство“ — интервенция = прекратяване.
Н38: опасна (10, прекратяване при намеса). W: 5. Cond: D/N/R ×N.
Engine: FAILED_TO_YIELD / YIELDED_TO_PRIORITY ← prioritySituation("right-hand-rule") RHR tracker; staged `priorityFromRight` (junction-type agnostic) — ✅ FULL (ev-junction-uncontrolled)

**JU-02 · Влизане от „Пропусни“ без изчакване / Give-way (Б1) rolling entry**
Real life: minor road meets boulevard under Б1; candidate treats the empty-looking main road as clear, rolls across the shark teeth as a car arrives at 50.
Mistake: no speed reduction to observable-and-stoppable; commits on a glance.
Evidence: DVSA junctions/observation; Н38 основна→опасна ladder; BG school routes drill this daily.
Н38: опасна when a priority vehicle is forced to react; основна as approach error. W: 5. Cond: D/N/R.
Engine: FAILED_TO_YIELD / YIELDED_TO_PRIORITY ← prioritySituation("give-way") stop-line adjudication; staged `priorityFromRight` at a guarded junction (the shipped l2/lex-exam-1 geometry) — ✅ FULL (ev-junction-priority-sign)

**JU-03 · „Почти спрях“ на Б2 / Stop-sign rolling stop**
Real life: THE canonical BG скъсване: 5 km/h creep over the stop line, "it was clear". Terminates the real exam on the spot.
Mistake: no full stop (wheels stationary) before the line; no Л-Д-Л scan.
Evidence: Н38 official termination item („не спре на пътен знак Б2“); every BG instructor top-10 list.
Н38: опасна (10, прекратяване). W: 5. Cond: D/N/R.
Engine: STOP_SIGN_NO_FULL_STOP / FULL_STOP_AT_STOP_SIGN ← stopLineCrossed(stopSign) + full-stop recency detector — ✅ FULL (ev-stop-sign)

**JU-04 · Спрял, но потегля в дупка, която я няма / Stop-then-misjudged-gap pull-out**
Real life: candidate DOES stop at the Б2, then pulls out 1.5 s ahead of a 50-km/h car — the stop was theater, the gap judgment failed.
Mistake: accepts a sub-3-second gap; looks but doesn't compute closing speed.
Evidence: DVSA "emerging into the path of other vehicles" (top fail refinement); junction-crash literature (look-but-fail-to-see).
Н38: опасна (10). W: 5. Cond: D/N/R ×N (headlight-distance illusion).
Engine: FAILED_TO_YIELD ← give-way conflictNear at line crossing; staged `priorityFromRight` with leadSec tuned tight — ✅ FULL (seed-varied leadSec is exactly this dial)

**JU-05 · Преминаване на червено / Red-light entry**
Real life: light flips to red on a 50-km/h approach; candidate carries speed through 0.5–1.5 s of red. One of the two most lethal urban violations in BG.
Mistake: no amber-decision made earlier, so red arrives mid-junction.
Evidence: Н38 official termination item; BG crash statistics (junction fatality share).
Н38: опасна (10, прекратяване). W: 5. Cond: D/N/R.
Engine: RED_LIGHT_CROSSED ← stopLineCrossed(trafficLight, red) — ✅ FULL (ev-junction-signalized)

**JU-06 · Жълтото като зелено / Amber-gambling (dilemma zone)**
Real life: BG instructor lists literally name „третиране на жълтото като зелено“ a top скъсване cause: amber at 30 m, candidate ACCELERATES.
Mistake: accelerating into amber instead of the brake-or-clear decision; also its twin — panic-braking ON the line when clearing was safer (rear-end bait).
Evidence: BG instructor consensus; dilemma-zone literature; Н38 grades entry „при забраняващ сигнал“.
Н38: опасна if entry lands on red; основна for the late no-decision. W: 4. Cond: D/N/R ×R (braking distance).
Engine: 🟡 PARTIAL — stopLineCrossed reports `yellow` at crossing but no rule consumes it. NEW: amber adjudication (yellow-crossing graded by whether a comfortable stop was possible: speed/distance at phase flip — needs the director to know signal phase, see N2 signal-phase API) + staged phase control to GUARANTEE the dilemma window.

**JU-07 · Десен завой на червено / Right turn on red (illegal in BG)**
Real life: US-habit myth among young drivers; BG allows right-on-red ONLY with a green-arrow панел. Candidates roll the right turn through red at empty junctions.
Mistake: treating red as yield for right turns.
Evidence: ЗДвП/ППЗДвП чл. 31; BG driving-school corrections.
Н38: опасна (10, прекратяване — it IS red-light entry). W: 3. Cond: D/N.
Engine: RED_LIGHT_CROSSED ← same detector (turn direction irrelevant to the crossing event) — ✅ FULL today when phases happen to align; NEW (shared): N2 signal-phase control to stage it deterministically.

**JU-08 · Потегляне на червено-жълто / Red+amber creep**
Real life: BG lights show red+yellow before green; nervous candidates release the brake and enter on the combination.
Mistake: moving before green (red+yellow = prepare, not go).
Evidence: ППЗДвП signal semantics; examiner second-degree marks.
Н38: второстепенна (основна if entering the box). W: 2. Cond: D/N.
Engine: 🟡 PARTIAL — runtime SIGNAL_TIMING has the redYellow phase but stopLineCrossed's lightState union is red|yellow|green. NEW: extend lightState with "redYellow" (one union member + one catalog rule) — smallest NEW in this doc.

**JU-09 · Спане на зелено / Green hesitation & filter-arrow freeze**
Real life: DVSA explicitly fails "waiting at a green filter light when it's safe to proceed"; BG examiners mark „закъснели действия“ (1 т.). Blocking a full cycle enrages real traffic.
Mistake: not moving within ~3 s of green with a clear box; freezing on green arrows.
Evidence: DVSA top-10 #6; BG второстепенни list („закъснели действия“).
Н38: второстепенна (fail by accumulation). W: 3. Cond: D/N.
Engine: 🔴 NEW: hesitation detector (stationary at line + green + clear-ahead for > N s → второстепенна) — needs signal-phase visibility to the rule layer (N2) + leadGap-style clear-ahead flag.

**JU-10 · Ляв завой срещу насрещните / Left turn across oncoming**
Real life: THE left-turn killer: candidate turns left at a light/junction across a 50-km/h oncoming stream, misjudging arrival by 1–2 s. Also German "erheblich": settling into the oncoming lane while waiting.
Mistake: turning across an oncoming vehicle < 4 s away; creeping past the center point angled into the oncoming lane.
Evidence: junction-crash literature (LTAP/OD is a top severe-crash geometry); German erhebliches Fehlverhalten; ev-left-turn-yield-oncoming.
Н38: опасна (10). W: 5. Cond: D/N/R ×N.
Engine: 🔴 NEW: oncoming-stream actor choreography + left-turn-across-path adjudication emitting prioritySituation("left-turn-oncoming") — the reserved SimTick vocabulary and FAILED_TO_YIELD grading are ALREADY in place; missing is the world-side adjudicator + actor timing (top of the build list, N1).

**JU-11 · Рязане на левия завой / Left-turn corner cut**
Real life: turning left, candidate apexes across the oncoming lane's junction mouth — meets a car waiting there nose-to-nose.
Mistake: turning before the junction center; DVSA: "it should not cut the corner when turning right [UK-mirrored]".
Evidence: DVSA top-10 #4; German erheblich (Einordnen auf Gegenfahrstreifen).
Н38: основна (опасна with oncoming present). W: 4. Cond: D/N/R.
Engine: 🟡 PARTIAL — turnStarted + laneOffset/heading exist; nothing grades path-through-junction. NEW: turn-path box evaluator (junction polygon + correct-side gate; one geometry check in the director, emits existing prioritySituation or a positioning violation).

**JU-12 · Широк десен завой / Right-turn wide swing**
Real life: right turn taken into the FAR lane of the target road (or swinging left first, „замах“) — meets overtakers and confuses followers.
Mistake: exit-lane discipline ignored; entry too fast to hold the tight arc.
Evidence: DVSA junctions marking; Grundfahraufgaben arc faults; BG основна „неправилно завиване“.
Н38: основна (3). W: 4. Cond: D/N/R ×R.
Engine: 🟡 PARTIAL — laneId on exit + turnStarted exist; NEW: same turn-path box evaluator as JU-11 (one capability, two archetypes).

**JU-13 · Скорост на приближаване към кръстовище / Junction approach speed**
Real life: approaches a blind/equal junction at full 50 with no lift-off, no brake cover. Examiners read throttle discipline as THE competence signal.
Mistake: no „готовност за спиране“ approach envelope.
Evidence: BG методика (junction approach behavior graded); DVSA "approach speed" refinements; ERSO junction share.
Н38: основна (второстепенна if mild). W: 4. Cond: D/N/R ×N ×R.
Engine: 🔴 NEW: junction-approach-speed detector (zone before uncontrolled/guarded junctions with a max approach envelope — a clone of the crossingApproach zone machinery pointed at junction nodes).

**JU-14 · Грешна лента за посоката / Wrong lane through the junction**
Real life: goes straight from a left-turn-only lane (marked with arrows) or turns from the through lane across a queue.
Mistake: ignores lane arrows/Г-signs on approach; realizes too late and swerves.
Evidence: DVSA #9 (road markings: "not following directional arrows"); BG маркировка questions (64q topic).
Н38: основна (3); опасна if it forces a conflict. W: 4. Cond: D/N.
Engine: 🔴 NEW: lane-intent map layer (per-approach-lane allowed movements in district data) + crossing-vs-lane check at turnStarted — grading fits TURN_WITHOUT_INDICATOR-style основна or a new markings code.

**JU-15 · Спиране върху стоп-линията или пътеката / Overshooting the line at red**
Real life: stops with the nose 1–2 m past the line, on the zebra; pedestrians squeeze around the bonnet.
Mistake: late braking decision at amber; no line awareness.
Evidence: DVSA #6 ("stopping beyond the advanced stop line"); BG второстепенна.
Н38: второстепенна (основна when the crossing is blocked with peds present). W: 3. Cond: D/N/R ×R.
Engine: 🟡 PARTIAL — stopLineCrossed(red) fires only on CROSSING; a stop 1 m past the line without full entry is invisible. NEW: stop-position check (rest position vs line offset when halting at red — small geometry rule on the existing line data).

**JU-16 · Навлизане в задръстено кръстовище / Block-the-box**
Real life: green, but the exit is a standing queue; candidate enters anyway and strands mid-box as the cross-flow gets green.
Mistake: green treated as GO instead of GO-IF-EXIT-CLEAR.
Evidence: DVSA #9 (yellow box); ЗДвП junction-entry rule; urban-gridlock reality.
Н38: основна (3). W: 2. Cond: D/N.
Engine: 🔴 NEW: queue-tail actor set (stationary column past the junction) + box-occupancy check (player stationary inside junction polygon while cross-phase goes green).

**JU-17 · Излизане от Т-образно с ограничена видимост / Restricted-view T emergence**
Real life: T-junction walled by a building/van; the only safe technique is creep-and-peek. Novices either blast out or freeze.
Mistake: emerging at walking-speed-plus with the sightline still blocked.
Evidence: DVSA #1 (effective observation BEFORE emerging); hazard-perception occlusion clips.
Н38: опасна when conflict results; основна as technique. W: 4. Cond: D/N/R ×N.
Engine: ✅ FULL — staged `priorityFromRight` at a T with a sight-blocking prop (world dressing, zero grading change); adjudication identical to JU-01/02 (the l3 T n415949424 pattern)

**JU-18 · Регулировчик / Traffic-controller signals**
Real life: police officer overrides the lights (junction works, protocol events); candidates obey the LIGHTS instead of the officer. Official termination item in Н38 (срещу сигнала на регулировчика).
Mistake: misreading arm positions; obeying green against the officer's stop.
Evidence: Н38 termination list; ev-traffic-controller (62q junction topic).
Н38: опасна (10, прекратяване). W: 2. Cond: D/N.
Engine: 🔴 NEW: controller actor (posed figure + semantic signal state overriding the junction's light state) feeding the SAME stopLineCrossed adjudication (control="trafficLight" with officer-state resolved by the world).

**JU-19 · Сляпо следване през кръстовище / Platoon blindness**
Real life: lead car clears the give-way; candidate follows glued to its bumper WITHOUT their own observation — the lead car "used up" the gap.
Mistake: outsourcing the priority decision to the car ahead.
Evidence: DVSA junction observation; rear-end + junction crash overlap; BG instructor drills („твоето предимство е твое решение“).
Н38: опасна when conflict results. W: 3. Cond: D/N/R.
Engine: 🟡 PARTIAL — all grading pieces exist (give-way adjudication + FOLLOWING_TOO_CLOSE); NEW: two-actor choreography preset (lead car through the gap + priority car timed onto the follower) in the director — no new grading, one new staging recipe.

**JU-20 · Мигащо жълто / Flashing-amber (dead signal) fallback**
Real life: night-mode flashing amber at a signalized junction; the rules silently become the SIGNS (or RHR). Most candidates have never seen it live.
Mistake: treating flashing amber as green — no yield to the now-priority cross street.
Evidence: ППЗДвП signal semantics; BG night-driving reality (many Sofia signals flash after 22:00 - to verify per junction).
Н38: опасна (priority violation). W: 2. Cond: N (defining), D rare.
Engine: 🔴 NEW: signal-mode state (normal/flashing/off) in the world + phase API (N2); grading falls back to the EXISTING give-way/RHR adjudication automatically once the mode maps to "unsignalized".

**JU-21 · Пресичане на двупосочен булевард на две стъпки / Two-stage dual-carriageway crossing**
Real life: crossing/left-turning over a boulevard with a median: gap-judging TWO independent streams; novices clear the first and strand in the median angled into lane one.
Mistake: committing across both streams as one decision.
Evidence: junction-crash geometry (crossing-path); BG boulevard grid reality.
Н38: опасна (conflict) / основна (positioning). W: 3. Cond: D/N/R ×N.
Engine: 🟡 PARTIAL — two staged priority cars adjudicate each stream today, but median-refuge positioning needs the turn-path evaluator (JU-11's NEW) + a median zone in district data.

**JU-22 · Предимството следва завоя / Priority road bends away**
Real life: Б1/Б3 with a Т-табела: the priority road CURVES; straight-ahead is actually leaving the priority road. Candidates keep "their" priority into the side street — or yield when they shouldn't.
Mistake: misreading the priority topology; indicator/positioning chaos.
Evidence: German Fahrschule catalogs drill this hard (abknickende Vorfahrt); BG знаци topic questions.
Н38: основна → опасна ladder. W: 2. Cond: D/N.
Engine: 🔴 NEW: curved-priority junction semantics in district data (priority-path edge pairs) + signage; adjudication then reuses give-way/RHR trackers unchanged.

**JU-23 · Един поглед не стига / Single-glance emergence (Л-Д-Л discipline)**
Real life: candidate looks left-right ONCE at t-5s, then emerges into what changed. BG instructors teach ляво-дясно-ЛЯВО (the second left look).
Mistake: stale observation; no re-check after the pause.
Evidence: "looked but failed to see" — the most-cited junction crash factor (UK STATS19 contributory data); BG instructor technique.
Н38: основна (observation quality). W: 3. Cond: D/N/R.
Engine: 🟡 PARTIAL — gaze channel exists (mirrorGlance is the input-layer's gaze event); NEW: junction-scan check (fresh left-right gaze within N s before line crossing — a lookback clone of the lane-change mirror rule pointed at junction lines).

**JU-24 · Сянката на левия завиващ / Left-turner's shadow**
Real life: oncoming car waits to turn left; candidate turns left too (or proceeds straight) — and a straight-through car hidden BEHIND the turner arrives at speed through the shadow.
Mistake: accepting an occluded gap as empty.
Evidence: hazard-perception occlusion archetype; LTAP crash literature; German examiner scenarios.
Н38: опасна (10). W: 3. Cond: D/N/R ×N.
Engine: 🔴 NEW: multi-actor occlusion choreography (stationary left-turner + hidden through-car), then EXISTING left-turn/priority adjudication (N1) grades it — a staging recipe on top of JU-10's capability.

---

## 5. Family RB — Roundabouts (6)

**RB-01 · Влизане без пропускане на кръга / Entry without yielding to circulating traffic**
Real life: the dominant roundabout crash geometry everywhere studied: entering driver looks late/never left, enters into a circulator's nose. чл. 50а: circulating traffic has priority.
Mistake: entry without a left-scan; misjudging circulator speed.
Evidence: IIHS/Maryland studies — entering-circulating ≈ "almost all" single-lane roundabout crashes; ev-roundabout (law-corrected чл. 50а).
Н38: опасна (10). W: 5. Cond: D/N/R ×N ×R.
Engine: FAILED_TO_YIELD / YIELDED_TO_PRIORITY ← prioritySituation("roundabout") circulatingConflict tracker; staged `roundaboutEntry` — ✅ FULL

**RB-02 · Излизане без десен мигач / Exit without right indicator**
Real life: circles past their exit unsignaled; the entering driver at the next mouth can't read intent and stalls the whole node.
Mistake: no right indicator in the exit window.
Evidence: BG второстепенна signaling discipline; roundabout instruction canon.
Н38: второстепенна (1). W: 4. Cond: D/N/R.
Engine: ✅ FULL — the roundabout maneuver evaluator already voids an unsignaled exit (A10) + TURN_WITHOUT_INDICATOR channel

**RB-03 · Колебание и спиране в кръга / Needless stop inside the ring**
Real life: candidate STOPS inside the roundabout to let an entering car in — inverting priority, rear-end bait for the circulator behind.
Mistake: yielding to entries while circulating; crawling the ring at 5 km/h clear.
Evidence: roundabout instruction canon; BG „закъснели действия“ marks; hesitation-fail logic (DVSA "undue hesitation").
Н38: второстепенна → основна (creates danger behind). W: 3. Cond: D/N/R.
Engine: 🔴 NEW: in-ring hesitation check (stationary/near-stop inside the ring polygon with no conflict ahead → второстепенна) — ring polygon exists (center+radius in specs); needs only a clear-ahead flag.

**RB-04 · Грешна лента в двулентово кръгово / Multi-lane roundabout lane discipline**
Real life: enters the inner lane then exits directly across the outer lane (exiting-circulating crash — the dominant MULTI-lane roundabout geometry per US studies).
Mistake: exit from inner lane; no mirror/signal across the outer.
Evidence: WA-state long-term study (exiting-circulating dominates multi-lane); BG Sofia two-lane roundabouts.
Н38: основна → опасна. W: 2. Cond: D/N/R.
Engine: 🔴 NEW: a multi-lane roundabout in the world (district has single-lane rb-1 only) + lane-tracked ring; grading then falls to existing lane-change + priority vocabulary.

**RB-05 · Пешеходец на изхода на кръговото / Pedestrian at the roundabout exit**
Real life: zebra 5 m after the exit mouth; driver's attention is 100% on circulating traffic, zero on the crossing — accelerates out INTO the pedestrian.
Mistake: attention tunnel on vehicles; no exit-scan.
Evidence: hazard-perception attention-switch archetype; VRU-at-roundabout studies (70% urban deaths are VRUs).
Н38: опасна (10). W: 3. Cond: D/N/R ×N.
Engine: 🟡 PARTIAL — all pieces exist (crossing zone events + staged pedestrianDartOut timed by the director on ring exit) but district-v1 has no crossing at rb-1's mouths; needs WORLD data (a crossing asset at an exit), zero new code.

**RB-06 · Кръгът като обратен завой / Roundabout as U-turn (full circulation discipline)**
Real life: using the ring to reverse direction (legal, exam-relevant — lex-exam-1 does exactly this): long circulation past 3 mouths, holding lane and signaling ONLY at the final exit.
Mistake: early right indicator (reads as exiting at every mouth) or drift toward mouths.
Evidence: BG exam routes use roundabout turnarounds (обратен завой requirement); instruction canon.
Н38: второстепенна (signaling/positioning). W: 3. Cond: D/N/R.
Engine: ✅ FULL — roundabout evaluator (enter/exit radius + exit-window indicator) + POOR_LANE_KEEPING; the lex-exam-1 „~5/6 around“ objective IS this archetype

---

## 6. Family PE — Pedestrians & crossings (16)

**PE-01 · Приближаване без готовност / Hot approach to an occupied-curb zebra**
Real life: pedestrian visibly waiting at the curb; candidate maintains 50 to the paint. Н38 explicitly: скорост на приближаване, позволяваща спиране = graded; „предпоставка за ПТП“ = опасна.
Mistake: no lift-off/cover-brake entering the ~25–30 m zone; > 30 km/h with the crossing occupied-adjacent.
Evidence: Н38 опасна item (PEDESTRIAN_CROSSING_TOO_FAST is its codification); BG „не спира на пешеходец“ = top скъсване cause; HP clips: ped ≈ 35%.
Н38: опасна (10). W: 5. Cond: D/N/R ×N ×R.
Engine: PEDESTRIAN_CROSSING_TOO_FAST ← crossingZoneEntered + approach-speed detector (brake-response guard) — ✅ FULL (ev-ped-crossing-marked)

**PE-02 · Внезапен пешеходец на пътеката / Dart-out at a marked crossing**
Real life: pedestrian steps out from the curb as the car closes — teenagers with phones, the defining urban emergency for new drivers.
Mistake: late reaction (> 1.2 s), swerve instead of brake, or drives through the occupied crossing.
Evidence: hazard-perception canon (ped steps onto zebra); SWOV hazard-anticipation deficit; BG pedestrian fatality share.
Н38: опасна (10) / ПТП = прекратяване. W: 5. Cond: D/N/R ×N ×R.
Engine: PEDESTRIAN_NOT_YIELDED / PEDESTRIAN_YIELDED / COLLISION(pedestrian) ← staged `pedestrianDartOut` + crossing occupancy + measured reaction time — ✅ FULL

**PE-03 · Минаване зад гърба на пешеходеца / Squeezing past a pedestrian on the crossing**
Real life: pedestrian is on the far half; candidate threads through „behind their back". Catalog corrective is explicit: не заобикаляй, дори да изглежда, че има място.
Mistake: not waiting for the pedestrian to CLEAR the crossing; lane-threading around them.
Evidence: ЗДвП чл. 119 (yield = let them pass, stopping if needed); BG examiner practice.
Н38: опасна (10). W: 4. Cond: D/N/R.
Engine: PEDESTRIAN_NOT_YIELDED ← crossingPassed(occupied) — ✅ FULL (occupancy span covers the whole roadway)

**PE-04 · Дете между паркирани коли / Child occluded by parked cars (unmarked)**
Real life: ball or child emerges between parked vans mid-block near a school — the German "erheblich" case (no reaction to children = automatic fail) and the canonical hazard-perception clip.
Mistake: no speed/position adjustment along a parked row with child-cues (ball, gate, ice-cream van).
Evidence: German Prüfungsrichtlinie (fehlende Reaktion bei Kindern); HP occlusion clips; child-pedestrian crash geometry (mid-block dart).
Н38: опасна (10) on conflict; the ANTICIPATION is what's trained. W: 4. Cond: D/N ×N.
Engine: 🟡 PARTIAL — the L5 ballDartOut visual + brakingLeadCar reaction machinery cover the STIMULUS, and collision(pedestrian) the worst case; NEW: occluded pedestrian spawn (pedestrian actor path starting BEHIND a parked-vehicle prop, no crossing id) + unmarked-hazard grading via SPEED_TOO_FAST_FOR_CONDITIONS-style care envelope.

**PE-05 · Завиване през пътеката на изхода / Turn across the parallel crossing**
Real life: turning at a green light, the zebra on the EXIT leg carries pedestrians who also have green — priority is theirs (чл. 120). #1 urban turn-conflict with walkers.
Mistake: attention on the gap in traffic; enters the exit crossing while occupied.
Evidence: urban VRU crash geometry (turning-vehicle/crossing-ped); DVSA #4 (watch for pedestrians when turning).
Н38: опасна (10). W: 4. Cond: D/N/R ×N.
Engine: 🟡 PARTIAL — crossing events fire per crossingId, so IF the exit leg has a crossing asset, occupancy grading is free; NEW: walk-profile pedestrian actor (normal crossing walk with signal awareness, vs the dart profile) + world crossings on junction exit legs.

**PE-06 · Пътека със светофар — закъснели / Signalized crossing stragglers**
Real life: player's light goes green; a slow pedestrian is still mid-crossing from their expiring phase. Green ≠ clear.
Mistake: launching on green into the straggler.
Evidence: ЗДвП: pedestrians who lawfully entered must be allowed to finish; signal-timing reality.
Н38: опасна (10). W: 3. Cond: D/N/R ×N.
Engine: 🟡 PARTIAL — occupancy grading exists; NEW: pedestrian-signal phase linkage (N2 extension: ped phases + a walk actor launched legally-then-caught) — no new grading codes.

**PE-07 · Училищна зона / School zone regime**
Real life: 07:30, school gate cluster: kids cluster at the fence, a marshal, parked drop-offs door-popping. BG school zones post 30 (often time-limited).
Mistake: keeping 50 through the zone; no scan of the gate cluster.
Evidence: ev-zone-regime (чл. 62–63 corrected); child-crash clustering around schools; German children-reaction fail item.
Н38: опасна (speeding >10 in the 30 zone) / основна. W: 4. Cond: D ×R (school hours).
Evidence note: needs zone signage in world.
Engine: 🟡 PARTIAL — SPEEDING_* grades automatically once maxSpeedKmh reflects the zone; NEW: speed-zone map layer (30-zone polygons + signage props; detector untouched).

**PE-08 · Бавен пешеходец / The slow crosser (elderly)**
Real life: elderly person needs 12+ seconds to cross; candidates creep INTO the crossing to pressure, or start rolling before clearance. German list: no reaction to elderly/helpless = fail.
Mistake: creeping while occupied; visible impatience (revving, nosing).
Evidence: German erheblich item; ЗДвП чл. 120; BG examiner practice.
Н38: опасна (creep-through) / основна (pressure creep). W: 3. Cond: D/N/R.
Engine: ✅ FULL — pedestrianDartOut spec with speedMps ≈ 0.8 IS the slow crosser (occupancy just lasts longer); yield commendation + NOT_YIELDED unchanged

**PE-09 · Тъмни дрехи, тъмен участък / Night pedestrian, mid-block, dark clothes**
Real life: BG's deadliest pedestrian profile: unlit secondary street, dark clothing, crossing 30 m from the zebra. Visibility < 30 m on lows.
Mistake: overdriving the headlight throw; no edge-scan on unlit blocks.
Evidence: BG/EU pedestrian fatality concentration in darkness; SWOV night-risk multipliers for novices.
Н38: опасна on conflict; incorporates SPEED_TOO_FAST_FOR_CONDITIONS. W: 4. Cond: N (defining) ×R.
Engine: 🟡 PARTIAL — night condition + unmarked walker possible via pedestrian actor w/o crossingId, graded only via collision today; NEW: per-segment lighting flag (the types.ts night-factor note anticipates exactly this) so the conditions-speed detector arms on unlit segments.

**PE-10 · Пешеходци иззад спрял автобус / Pedestrians emerging around a stopped bus**
Real life: bus at a stop occludes its nose; passengers cut in front of it. The classic „bus shadow" kill zone.
Mistake: passing the stopped bus at speed with zero crossing-anticipation.
Evidence: HP clip family (bus stops); German school-bus passing rules; BG urban bus-stop density.
Н38: опасна on conflict / основна as care failure. W: 4. Cond: D/N ×R.
Engine: 🔴 NEW: bus actor (large staged vehicle, stop-and-dwell command at bus-stop props) + occluded ped spawn (PE-04's capability) — grading via existing crossing/collision vocabulary.

**PE-11 · Изпреварване пред пътека / Overtaking a car stopped at a zebra**
Real life: the law's single most explicit crossing rule (чл. 119): NEVER pass a vehicle that stopped before a crossing. The stopped car IS the pedestrian evidence.
Mistake: pulling around the „slow" stopped car straight over the occupied zebra.
Evidence: ЗДвП чл. 119(5)-type prohibition; child-dart crash reports behind yielded vehicles; taught in every BG school.
Н38: опасна (10). W: 4. Cond: D/N/R.
Engine: 🔴 NEW: stopped-yielding-car choreography (staged car braking at the crossing while the ped walks) + pass-detection (player overtakes within the crossing zone → emit crossingPassed-adjacent adjudication; grades PEDESTRIAN_NOT_YIELDED + a lane-change record) — high-value, small build on existing actors.

**PE-12 · Капанът на махването / The wave-through trap**
Real life: candidate stops, waves the pedestrian across — into lane 2 where a car doesn't stop. Waving = assuming authority over other lanes.
Mistake: gesturing pedestrians into unverified lanes; stopping where stopping misleads.
Evidence: multi-lane crossing crash pattern (the „double-threat"); driving-school defensive canon.
Н38: not directly gradable — pedagogy via debrief. W: 1. Cond: D.
Engine: 🔴 NEW: two-lane crossing choreography (parallel-lane car actor that does NOT stop) — the player's own grading stays standard; the LESSON is the observed near-miss (learn-only policy).

**PE-13 · Пешеходец на червено за него / Jaywalker against the red man**
Real life: pedestrian enters against their red — the candidate legally has green but чл. 20's care duty still owns the outcome.
Mistake: asserting right-of-way with the horn/throttle instead of braking.
Evidence: ЗДвП чл. 20 general care duty (COLLISION catalog cites it); real Sofia behavior.
Н38: ПТП = прекратяване regardless of ped fault. W: 3. Cond: D/N ×N.
Engine: ✅ FULL — pedestrianDartOut AT a signalized crossing while the player has green: occupancy events + collision adjudication don't care about the ped's signal (correctly — the care duty doesn't either); commendation for the yield

**PE-14 · Белият бастун / White-cane pedestrian**
Real life: blind pedestrian signals with the cane — absolute priority, everywhere, always (explicit in ЗДвП).
Mistake: not recognizing the cane as an unconditional stop command.
Evidence: ЗДвП blind-pedestrian clause; BG theory-bank presence (пешеходци topic).
Н38: опасна (10). W: 1. Cond: D.
Engine: 🟡 PARTIAL — mechanically identical to PE-08 (slow walker, absolute yield); NEW: actor visual variant (cane pose) so the RECOGNITION is what's being trained; grading unchanged.

**PE-15 · Жилищна зона / Residential zone (Д15/Д16)**
Real life: signed жилищна зона: pedestrians may USE the roadway, children play, speed cap is walking-pace-plus (чл. 62–63 regime).
Mistake: driving 40 through; treating peds on the road as violators.
Evidence: ev-zone-regime (law-corrected чл. 62–63); BG residential-block reality (Студентски град!).
Н38: основна → опасна (speed + care). W: 2. Cond: D/N.
Engine: 🟡 PARTIAL — SPEEDING_* + care grading work once the zone caps maxSpeedKmh (PE-07's zone layer); free-roaming ped actors in-zone are the pedestrian-actor variant capability.

**PE-16 · Пътека в дъжд — спринтьорът / Rain sprinter at the zebra**
Real life: downpour: pedestrian SPRINTS for cover across the zebra with an umbrella blocking their view of you; your braking distance is 1.4× and their entry is faster than any dart profile.
Mistake: dry-weather approach speed in rain at crossings.
Evidence: rain crash-risk multipliers; HP adverse-weather clips; combines two graded axes honestly.
Н38: опасна (10). W: 3. Cond: R (defining) ×N.
Engine: ✅ FULL — pedestrianDartOut (speedMps ↑) + rain condition (crossing approach detector unchanged; rain factor already tightens the conditions-speed envelope)

---

## 7. Family VU — Vulnerable road users (14)

**VU-01 · Десен завой през велосипедист / Cyclist right hook**
Real life: cyclist rides the curb line; car turns right across them at the junction — the #1 car-cyclist urban kill geometry.
Mistake: no mirror-right/shoulder check before the turn; misjudging the cyclist's speed.
Evidence: urban cyclist crash canon; ev-cyclist (чл. 42 corrected + чл. 25/37).
Н38: опасна (10). W: 5. Cond: D/N/R ×N.
Engine: FAILED_TO_YIELD / YIELDED_TO_PRIORITY / COLLISION(cyclist) ← staged `cyclistRightHook` (prioritySituation "cyclist-right-hook") — ✅ FULL (v1 proxy-actor caveat, audit C3)

**VU-02 · Тясно изпреварване на колело / Close pass on a cyclist**
Real life: squeezing past a cyclist within half a meter at 50 — the daily terror that kills cycling. чл. 42: достатъчна странична дистанция (1.5 m = guidance).
Mistake: passing without changing line; not waiting for an oncoming gap.
Evidence: ev-cyclist law pass; close-pass enforcement literature (UK West Midlands ops).
Н38: основна (опасна if the cyclist wobbles/reacts). W: 4. Cond: D/N/R ×R.
Engine: 🔴 NEW: lateral-clearance detector around VRU actors (min lateral distance @ pass speed, actor-tagged) — actor exists (cyclist proxy); one geometric rule + severity ladder.

**VU-03 · Колелото завива около дупка / Cyclist swerve-out**
Real life: cyclist swings 1 m left around a pothole/drain/parked car exactly as you pass — the reason the passing margin exists.
Mistake: passing with zero margin budget for the swerve.
Evidence: cyclist-crash contributory data (road-surface swerves); HP cyclist clips.
Н38: опасна on contact; the margin is the lesson. W: 3. Cond: D/N/R ×R ×N.
Engine: 🔴 NEW: path-deviation command for staged actors (scripted lateral offset pulse at a trigger point) — pairs with VU-02's lateral detector; collision grading exists.

**VU-04 · Вратата / The door zone**
Real life: parked-car door swings open into your lane at 1 m — dooring. Cyclists die from it; cars total mirrors and children.
Mistake: hugging the parked row (< 1 m) instead of holding a door-width off.
Evidence: dooring crash literature; Dutch-reach pedagogy (doc 65 Phase 3 mentions it).
Н38: основна (positioning) / ПТП = прекратяване. W: 3. Cond: D/N ×N.
Engine: 🔴 NEW: door-swing actor (parked-vehicle prop with a timed door collider + optional exiting-ped) + the parked-row lateral-offset zone (shares VU-02's lateral machinery).

**VU-05 · Колоездач срещу еднопосочното / Contra-flow cyclist**
Real life: one-way street, cyclist coming AT you (illegal but constant in Sofia); turn-in drivers never scan the "impossible" direction.
Mistake: entering/turning while scanning only the legal flow direction.
Evidence: contra-flow cyclist crash pattern; BG urban reality.
Н38: опасна on conflict (care duty). W: 2. Cond: D/N ×N.
Engine: 🟡 PARTIAL — cyclist proxy CAN be staged on a reverse path (stage() takes explicit pathNodes); grading via collision + care; NEW: none strictly — a staging recipe; flag as recipe-only.

**VU-06 · Велопътека при десен завой / Signalized cycle-crossing at the turn**
Real life: separate cycle crossing parallel to the zebra; cyclists arrive FAST (25 km/h — 5× walker speed) from behind on the right at green.
Mistake: mirror-checked for slow walkers, not for a 25-km/h cyclist closing from behind.
Evidence: cycle-crossing crash studies (approach-speed illusion); ev-cyclist.
Н38: опасна (10). W: 2. Cond: D/N/R.
Engine: 🟡 PARTIAL — cyclistRightHook machinery IS this with higher cruiseSpeedMps; a true cycle-path world lane is missing (extraRightOffsetM approximates it) — recipe + world dressing.

**VU-07 · Мотор между колоните / Filtering motorcycle**
Real life: motorcycle lane-splits up the queue at the light; your lane change / door of opportunity cuts them off.
Mistake: queue lane-change without a mirror for the filtering PTW.
Evidence: PTW filtering crash pattern (urban EU); DVSA "watch for motorcyclists".
Н38: основна → опасна. W: 2. Cond: D/N.
Engine: 🔴 NEW: narrow fast actor with between-lane pathing (lane-graph offset paths at queue sites) — grading falls to LANE_CHANGE_WITHOUT_MIRROR_CHECK + collision(vehicle); the actor is the missing half.

**VU-08 · Тротинетка / E-scooter chaos agent**
Real life: e-scooter hops curb→zebra→roadway at 20 km/h with zero signaling — the 2020s' defining urban VRU, heavily present in Студентски град.
Mistake: pattern-matching it as a pedestrian (it's 4× faster) or as a bike (it ignores bike lines).
Evidence: e-scooter injury statistics (EU urban EDs); BG scooter-fleet density.
Н38: опасна on conflict. W: 3. Cond: D/N ×N.
Engine: 🔴 NEW: e-scooter actor profile (ped-actor pathing at vehicle-ish speed, curb-crossing capable) — grading rides existing crossing occupancy + collision; actor + speed profile are the build.

**VU-09 · Линейка отзад / Emergency vehicle from behind**
Real life: siren closes from behind in dense traffic; the correct move is decisive right-pull + stop, not freeze or panic-brake in-lane. чл. 67 ЗДвП special-regime rules.
Mistake: freezing mid-lane; braking hard; blocking the corridor.
Evidence: ev-emergency-vehicle; emergency-corridor pedagogy (DE Rettungsgasse canon).
Н38: основна (закъснели действия) → опасна (obstruction). W: 3. Cond: D/N/R ×N.
Engine: 🔴 NEW: emergency actor (siren/lights state, closing-from-behind pathing on the player's edge) + yield evaluator (pull-right + slow/stop within window → commendation; obstruction → violation via prioritySituation("emergency")) — the reserved prioritySituation vocabulary covers grading.

**VU-10 · Линейка през кръстовището / Emergency vehicle through the red**
Real life: your light is green; ambulance crosses against it. Green + siren = their junction.
Mistake: entering on green into the siren's path (audio ignored, visual tunnel).
Evidence: intersection EV-crash pattern; ev-emergency-vehicle.
Н38: опасна (10). W: 2. Cond: D/N ×N.
Engine: 🔴 NEW: same emergency actor, junction-crossing recipe; adjudication = prioritySituation("emergency", violated) at box entry — extends VU-09's capability, no extra grading.

**VU-11 · Потеглящ автобус / Bus pulling out (чл. 67)**
Real life: in urban areas you MUST yield to a bus signaling out of its stop. Everyone „doesn't see" the indicator.
Mistake: passing the indicating bus instead of braking to release it.
Evidence: ev-bus-pullout (law-corrected чл. 67); urban bus-priority rule.
Н38: основна (3). W: 3. Cond: D/N/R.
Engine: 🔴 NEW: bus actor (PE-10's build: dwell at stop + indicate + merge command) + yield adjudication via prioritySituation("bus-pullout") — grading vocabulary reserved and ready.

**VU-12 · Училищен автобус с аварийки / School bus with hazards on**
Real life: German erheblich item verbatim: passing a school/line bus with hazards at a stop at > 20 km/h = automatic fail. BG mirrors the care rule for children at bus stops.
Mistake: passing fast where children unload.
Evidence: German Prüfungsrichtlinie (the >20 km/h line); child-crash clustering at stops.
Н38: опасна (care toward children). W: 2. Cond: D ×R.
Engine: 🔴 NEW: recipe on the bus actor (hazards state) + a pass-speed check zone around it (clone of crossingApproach machinery, actor-anchored).

**VU-13 · Куче на пътя / Animal dart**
Real life: stray dog darts across a Sofia side street (BG's stray density makes this a REAL archetype, not flavor); braking-vs-swerving decision at 40 km/h.
Mistake: full swerve into the oncoming lane / no reaction.
Evidence: ev-animal-hazard; run-off-road swerve crashes; BG stray statistics.
Н38: не се санкционира прегазването само по себе си — the swerve into conflict is what grades. W: 2. Cond: D/N ×N (defining at night).
Engine: 🟡 PARTIAL — the ballDartOut hazard visual + reaction timer (brakingLeadCar machinery) proxy it today (L5 IS an abstract animal-dart); NEW: animal actor visual + collision class (currently pedestrian/cyclist/vehicle/staticObject — needs "animal" or maps to staticObject honestly labeled).

**VU-14 · Каруца зад завоя / Horse cart / agri vehicle around the bend**
Real life: rural BG constant: 10-km/h cart or tractor right after a curve; closing speed 60+ → overtake decision under oncoming uncertainty.
Mistake: late detection + impulsive overtake across the solid line.
Evidence: BG rural crash reports; slow-vehicle rear-end/overtake pattern; SWOV novice rural over-representation.
Н38: основна → опасна (overtake violation). W: 2. Cond: D ×N ×R.
Engine: 🔴 NEW: rural road segment in a future district + slow-vehicle actor profile; grading rides FOLLOWING_TOO_CLOSE + overtaking family (OV) capabilities.

---

## 8. Family SP — Speed management (13)

**SP-01 · Пълзящо превишаване / Creeping over the limit**
Real life: urban 50, traffic flows at 55–58; the candidate „flows along". The limit is a ceiling, not a target.
Mistake: 51–60 km/h sustained; no speedometer cadence.
Evidence: speed-crash exponential (SWOV speed fact sheet); BG enforcement tolerance mythology.
Н38: второстепенна (within +10). W: 5. Cond: D/N/R.
Engine: SPEEDING_OVER_LIMIT ← speeding detector (grace + sustain) — ✅ FULL (ev-speed-limit)

**SP-02 · Над +10 км/ч / Dangerous speeding**
Real life: > 10 over = official опасна on the BG exam (doc 32) — instant fail, full stop.
Mistake: throttle-blind acceleration downhill / after junctions.
Evidence: doc 32 official; Н38 опасна list.
Н38: опасна (10). W: 5. Cond: D/N/R.
Engine: SPEEDING_DANGEROUS ← dangerous-speeding detector — ✅ FULL

**SP-03 · Преходът на зони / Zone-transition blindness (50→30)**
Real life: enters a posted 30 zone (school/hospital/residential) still at 50 — the transition sign „didn't register".
Mistake: no anticipatory lift at the sign; speed adaptation lag > 100 m.
Evidence: zone-compliance studies; BG 30-zone rollout in Sofia.
Н38: второстепенна → опасна (per the over-amount in-zone). W: 4. Cond: D/N ×N.
Engine: 🟡 PARTIAL — detectors grade automatically off maxSpeedKmh; NEW: speed-zone map layer (world data: zone polygons + signage) — same capability as PE-07, counted once.

**SP-04 · Скорост в дъжд / Rain speed discipline**
Real life: posted 50 in standing water: aquaplane risk starts ~80 but grip/visibility demand ~40. Candidates hold dry-road speed.
Mistake: no 10–15% reduction in rain; full speed through puddled stretches.
Evidence: wet-road crash multipliers; catalog corrective („свали 10–15% под ограничението").
Н38: второстепенна (несъобразена скорост). W: 4. Cond: R (defining).
Engine: SPEED_TOO_FAST_FOR_CONDITIONS ← conditions detector (rain factor 0.85) — ✅ FULL (ev-speed-for-conditions)

**SP-05 · Скорост в завой / Curve overspeed (loss of control)**
Real life: SWOV's headline novice finding: single-vehicle loss-of-control IN CURVES is THE novice over-representation. Entry 10 km/h too hot, mid-curve panic lift, spin/run-off.
Mistake: braking IN the curve instead of before; misreading curve sharpness at night.
Evidence: SWOV young-driver fact sheet (curve LOC); ERSO run-off-road data.
Н38: основна (несъобразена скорост) → ПТП. W: 4. Cond: D/N/R ×N ×R (defining amplifiers).
Engine: 🔴 NEW: curve-speed envelope (advisory-speed zones on curved segments — world data + a conditions-detector clone keyed to curvature); true skid physics is Phase 4, but the SPEED envelope is gradable NOW without it.

**SP-06 · Влачене / Obstructively slow driving**
Real life: 27 in a clear 50 out of fear — real BG examiners mark it (движение без необходимост с ниска скорост pattern; DVSA: „undue hesitation").
Mistake: sustained ≪ limit speed with free flow behind; braking for nothing.
Evidence: BG „закъснели действия" second-degree family; DVSA hesitation marking.
Н38: второстепенна (fail by accumulation). W: 3. Cond: D/N/R.
Engine: 🔴 NEW: slow-driving detector (sustained < ~60% of limit, clear ahead via leadGapM, no hazard staged — director knows) — второстепенна only, generous sustain.

**SP-07 · Скорост при ограничена видимост нощем / Overdriving the headlights**
Real life: unlit segment, lows throw ~50 m; stopping from 70 needs more. The types.ts night-factor note anticipates per-segment lighting.
Mistake: driving at the posted limit where the VISIBLE distance is the real limit.
Evidence: чл. 20 (спиране в осветената зона); night fatality multipliers.
Н38: основна (несъобразена скорост). W: 3. Cond: N (defining) ×R.
Engine: 🟡 PARTIAL — conditions detector exists with nightFactor=1 BY DESIGN for lit streets; NEW: per-segment `unlit` world flag arming a night factor exactly as the config comment prescribes.

**SP-08 · Знак А-група без реакция / No response to warning signs**
Real life: А-sign (children / crossing ahead / curve / uneven road) passes with zero speed change — the sign was decoration.
Mistake: no anticipatory adjustment in the sign's zone of action.
Evidence: ev-sign-warning; doc 65 Phase-1 „warning-sign anticipation"; sign-compliance literature.
Н38: второстепенна → основна. W: 3. Cond: D/N/R ×N.
Engine: 🔴 NEW: warning-sign anticipation detector (sign-anchored expectation window: measurable lift-off/speed delta) — doc 65 already scopes it Phase 1.
 
**SP-09 · Спурт между светофари / Red-light drag racing**
Real life: full-throttle to the visibly-red next light, brake hard, repeat. Aggression + fuel + rear-end bait; eco-defensive anti-pattern.
Mistake: accelerating INTO a red; no flow anticipation.
Evidence: eco-defensive canon (ev-eco-defensive); rear-end crash inputs (NHTSA 29%).
Н38: второстепенна (rough driving pattern). W: 2. Cond: D/N.
Engine: 🟡 PARTIAL — harsh-brake half comes with VP-09's no-cause-brake detector; the accelerate-at-red half needs N2 phase visibility. Recipe over two shared capabilities.

**SP-10 · Минимална скорост на магистрала / Motorway minimum + flow speed**
Real life: 70 in lane 1 of a 140 motorway is a mobile chicane; ramp merges below flow speed kill.
Mistake: cruising far below flow; merging at 60 into 120 traffic.
Evidence: ev-motorway-entry-exit; motorway speed-differential crash studies.
Н38: основна. W: 2. Cond: D/N/R.
Engine: 🔴 NEW: motorway world segment (out of district scope; future map) — detectors (min-speed clone of speeding, merge adjudication) are trivial once the road exists.

**SP-11 · Рязко спиране без причина / Causeless hard braking**
Real life: BG examiners explicitly list „много рязко спиране, което създава предпоставка за ПТП" as a fail cause — phantom braking is graded, not just collisions.
Mistake: hard pedal stabs for shadows, parked cars, GPS confusion.
Evidence: BG examiner practice (explicit); rear-end causation (the braker causes it).
Н38: основна (предпоставка за ПТП). W: 3. Cond: D/N/R.
Engine: 🔴 NEW: no-cause harsh-brake detector (same as VP-09; counted once — decel spike with no staged hazard/conflict/signal cause in the director's ledger).

**SP-12 · Скорост пред пътека / Crossing-zone speed even when „empty"**
Real life: 50+ through crossing zones with no visible pedestrian — the approach envelope is unconditional where sightlines are poor (parked rows).
Mistake: treating empty-looking zebras as non-events.
Evidence: Н38 approach-speed grading; PE-01's zone logic generalized.
Н38: второстепенна (envelope) / опасна when occupied. W: 3. Cond: D/N/R ×N.
Engine: ✅ FULL — crossingZoneEntered events fire per-crossing regardless of occupancy; the approach detector arms on occupancy today — flipping an „always-envelope" config variant per lesson is a spec knob, not new code (crossingApproachMaxKmh applies; occupancy false = teach-mode nudge)

**SP-13 · Скорост на изпреварващия поток / Pace-matching speeders**
Real life: everyone's doing 65; social proof drags the candidate along. The exam doesn't grade the flow — it grades YOU.
Mistake: matching ambient NPC speed above the limit.
Evidence: social-conformity speed studies; BG boulevard flow reality.
Н38: второстепенна/опасна per the over-amount. W: 3. Cond: D/N.
Engine: ✅ FULL — SPEEDING_* don't care about NPCs; the AUTHORING move is ambient-traffic speed set above limit (traffic module config) — a staging recipe making an existing detector psychologically hard

---

## 9. Family FO — Following & gap management (8)

**FO-01 · Лепене / Steady-state tailgating**
Real life: sub-1.3 s gap at 50 in the daily commute — the top BG второстепенна („близка дистанция") and the #1 crash-type feeder (rear-end = 29% of all crashes, NHTSA).
Mistake: no 2-second reference; gap shrinks as attention drifts.
Evidence: NHTSA 29%; GIDAS rear-end share; BG examiner list („много близка дистанция" = fail-grade when severe).
Н38: основна (несъобразена дистанция; „много близка" ≈ опасна in examiner practice). W: 5. Cond: D/N/R ×R.
Engine: FOLLOWING_TOO_CLOSE ← 2-second detector (fire ratio, recovery guard, queue exemption) — ✅ FULL (ev-following-distance)

**FO-02 · Внезапно спиране на предния / Lead-car brake slam**
Real life: lead car slams for a reason you can't see (that's WHY the gap exists); reaction + stop without contact.
Mistake: late brake onset (> 1.2 s), under-braking then panic, or swerve-past into the hazard.
Evidence: rear-end causation (72% information-admission failures, GIDAS-adjacent); emergency-brake pedagogy (Gefahrbremsung).
Н38: ПТП = прекратяване; „рязко без причина" excluded — here the cause is staged. W: 5. Cond: D/N/R ×R ×N.
Engine: COLLISION / measured reactionTimeSec + stopGapM ← staged `brakingLeadCar` (stimulus-locked objective) — ✅ FULL (ev-emergency-braking)

**FO-03 · Вклиняване / Cut-in recovery**
Real life: a car merges 4 m ahead; your 2-second cushion is stolen through no fault of yours. The graded skill: rebuild it calmly (lift, don't punish-brake).
Mistake: holding the stolen gap (tailgating by inertia) or brake-stabbing (rear-end bait).
Evidence: cut-in as top ADAS/crash scenario; the engine's followRecoveryRateMps guard exists precisely for it.
Н38: основна if the short gap is HELD. W: 4. Cond: D/N/R.
Engine: 🟡 PARTIAL — grading is fully ready (recovery-rate guard exempts the innocent phase; holding it fires); NEW: cut-in actor recipe (staged vehicle lane-merge command in front of the player — needs a lane-change path command for staged actors, small traffic-port addition).

**FO-04 · Дистанция в дъжд / Wet-road following**
Real life: braking distance ~1.5× wet; the 2-second rule becomes 3+. Nobody adds it.
Mistake: dry-gap habits in rain; following spray-blind.
Evidence: wet-stopping-distance physics; catalog explanation text already teaches „при дъжд увеличи дистанцията".
Н38: основна. W: 3. Cond: R (defining).
Engine: 🟡 PARTIAL — one config knob (rain-scaled followSafeSeconds) — NEW: rain-aware following config (arguably the cheapest NEW in the doc; flag for an A-series tuning pass).

**FO-05 · Колона / Stop-and-go queue discipline**
Real life: queue compression: rolling at 15 with 1-s gaps is NORMAL (the engine's queue exemption knows it); the skill is smooth harmonics — no accordion slams.
Mistake: throttle-brake oscillation amplifying the wave.
Evidence: traffic-wave literature; the A12 FP-case notes in types.ts document the band.
Н38: not penalized (correctly) — smoothness coaching only. W: 2. Cond: D/N/R.
Engine: ✅ FULL as learn-only — existing exemptions make it penalty-free; debrief smoothness stat optional (VP-08's metric)

**FO-06 · Зад камион / Following a truck (vision blocked)**
Real life: behind a truck you see NOTHING; the gap must buy the vision you lost. Novices tuck in closer to „see past".
Mistake: sub-2s gap behind high vehicles; peek-weaving at speed.
Evidence: truck rear-end severity data (GIDAS HGV studies); defensive canon.
Н38: основна. W: 2. Cond: D/N/R ×R.
Engine: 🔴 NEW: large-vehicle actor profile (box truck visual on the vehicle actor; leadGap detector unchanged) — one asset + profile, zero grading change.

**FO-07 · Лепка отзад / Being tailgated**
Real life: aggressive follower 3 m behind at 50. Correct: increase FRONT gap, let them pass; wrong: brake-check (assault with a vehicle).
Mistake: brake-checking; speeding up guiltily.
Evidence: defensive-driving canon; road-rage crash inputs.
Н38: not directly graded — behavior response training. W: 2. Cond: D/N.
Engine: 🔴 NEW: rear-tailgater actor (matchPlayer from behind — the command exists, pathing behind the player is the new bit) + front-gap-increase check (existing leadGap telemetry) — learn-only policy.

**FO-08 · Дистанция на спиране в колона / Standstill gap (see wheels rule)**
Real life: stopping bumper-kissing at the light: no escape lane, roll-back contact risk on hills.
Mistake: closing to < 1 car-length at stops behind traffic.
Evidence: instructor canon (see-the-tyres rule); hill-start chain collisions.
Н38: второстепенна. W: 2. Cond: D/N/R.
Engine: 🟡 PARTIAL — leadGapM at standstill is on every tick; NEW: standstill-gap check (tiny rule under the existing follow family, active only at v≈0 behind a stopped lead).

---

## 10. Family OV — Overtaking, lane discipline & on-road maneuvers (18)

**OV-01 · Престрояване без огледало / Lane change without mirror**
Real life: DVSA's #2 global fail: direction change with zero mirror evidence. A whole car hides in the blind spot.
Mistake: wheel first, eyes never.
Evidence: DVSA top-10 #2; BG основна (маневра без оглеждане).
Н38: основна (3). W: 5. Cond: D/N/R.
Engine: LANE_CHANGE_WITHOUT_MIRROR_CHECK / SAFE_LANE_CHANGE ← mirror lookback (5 s, maneuver side) — ✅ FULL (ev-lane-change)

**OV-02 · Престрояване без мигач / Lane change without indicator**
Real life: BG второстепенна list verbatim („непускане на мигач"); the follower can't price your move.
Mistake: signal DURING or after the move, or never.
Evidence: BG list; DVSA signals category.
Н38: основна in code (unsafe maneuver family; BG practice often 1 т. when isolated). W: 5. Cond: D/N/R.
Engine: LANE_CHANGE_WITHOUT_INDICATOR ← indicator lookback (3 s) — ✅ FULL

**OV-03 · Колата в мъртвата зона / The blind-spot car**
Real life: mirror checked — car sits EXACTLY in the blind spot; only a shoulder check finds it. The mirror ritual passes, the crash happens anyway.
Mistake: mirror-only confidence; no head check.
Evidence: blind-spot sideswipe crash pattern; BG „огледало → мигач → МЪРТВА ЗОНА → маневра" corrective (catalog text!).
Н38: опасна on conflict. W: 4. Cond: D/N/R ×N.
Engine: 🔴 NEW: alongside-actor choreography (staged vehicle pacing the blind spot via matchPlayer with lateral offset) + sideswipe contact — grading via collision(vehicle) + existing mirror rules; the pacing command variant is the build.

**OV-04 · Изпреварване през непрекъсната / Overtake across the solid line**
Real life: double solid on the boulevard; candidate strays/commits across it to pass a slow car. BG list: „настъпване на осева линия" = 1 т.; full crossing to overtake = маневра violation.
Mistake: line treated as advisory; no plan B behind the slow vehicle.
Evidence: BG второстепенна list (настъпване) + маркировка rules; DVSA #9 (solid white lines).
Н38: второстепенна (touch) → основна/опасна (full crossing against oncoming). W: 4. Cond: D/N/R.
Engine: 🔴 NEW: markings legality layer (line type per edge side in district data) + line-crossing check off laneOffset/laneId (geometry already on the tick) — grading slots as a markings violation family.

**OV-05 · Изпреварване срещу насрещен / Overtake with oncoming too close**
Real life: THE rural head-on killer and the highest-severity decision a B-driver makes: pull out at closing speed 160 km/h with a 6-second corridor that needs 10.
Mistake: gap arithmetic by hope; no abort plan; acceleration hesitation mid-pass.
Evidence: head-on overtaking fatality share (rural EU); ev-overtake is the #1 exam-weight event (33q/75pt); SWOV novice rural over-representation.
Н38: опасна (10, намеса). W: 4 (5 once rural segments exist). Cond: D ×N ×R.
Engine: 🔴 NEW: oncoming-stream choreography + overtake-corridor adjudication (out-lane occupancy vs oncoming ETA; abort detection) — the single biggest missing capability (N1/N3); grading emits prioritySituation("overtake") → FAILED_TO_YIELD + collision.

**OV-06 · Изпреварване при забрана / Overtake under a ban (В24/крест)**
Real life: no-overtaking sign zone (crest, school stretch); candidate passes a tractor anyway — legal blindness, not skill failure.
Mistake: sign-zone unawareness during a „justified" pass.
Evidence: ev-sign-prohibitory; BG знаци topic; German Verkehrsverbote = erheblich.
Н38: основна → опасна. W: 2. Cond: D.
Engine: 🔴 NEW: sign-zone legality layer (shares SP-03/PE-07's zone-map capability: overtake-ban polygons consulted by OV-05's corridor adjudicator).

**OV-07 · Изпреварване на пътека / Overtaking at a pedestrian crossing**
Real life: passing ON the zebra approach — banned outright because the passed car IS your sightline. Overlaps PE-11 but from the overtaking side: the SLOW car ahead may be slow because of the crossing.
Mistake: passing within the crossing's approach zone.
Evidence: ЗДвП crossing-overtake ban; PE-11's crash pattern.
Н38: опасна (10). W: 3. Cond: D/N/R.
Engine: 🟡 PARTIAL — crossing zones + lane changes are both on the tick; NEW: small composite rule (lane-change/pass event INSIDE an armed crossing zone → violation) — pure rule composition, no world/actor build.

**OV-08 · Изпреварване преди кръстовище / Overtaking into a junction**
Real life: passing across a junction mouth: the passed car turns left into you, or a right-emerger meets you head-on in THEIR lane.
Mistake: initiating a pass with a junction inside the corridor.
Evidence: junction-overtake ban (ЗДвП); crash geometry (overtake-turn conflict).
Н38: опасна. W: 2. Cond: D/N.
Engine: 🔴 NEW: corridor-vs-junction check inside OV-05's adjudicator (junction nodes are known; one geometry predicate once the corridor exists).

**OV-09 · Ранно прибиране / Cutting back in too early**
Real life: completes the pass and dives back in 5 m ahead of the passed car's bumper (mirror discipline: „прибери се, когато го видиш в огледалото за обратно виждане" — catalog text).
Mistake: return before the full car shows in the CENTER mirror.
Evidence: catalog corrective (NOT_KEEPING_RIGHT text); DVSA overtaking guidance.
Н38: основна (cut-off). W: 3. Cond: D/N/R.
Engine: 🟡 PARTIAL — passed-actor gap on return is measurable (staged actor telemetry); NEW: return-gap check keyed to the overtaken actor (rides OV-05's corridor state machine).

**OV-10 · Ускоряване докато те изпреварват / Speeding up while overtaken**
Real life: ego response: the overtaker pulls alongside, the candidate unconsciously accelerates — stretching the overtaker's exposure window. Explicitly banned (ЗДвП чл. 42(2)).
Mistake: throttle-up with a vehicle alongside left.
Evidence: ЗДвП being-overtaken duty; ev-overtake sub-case; German catalog (Überholtwerden).
Н38: основна (3). W: 2. Cond: D.
Engine: 🔴 NEW: being-overtaken detector (speed increase while an actor occupies alongside-left window — needs OV-03's alongside telemetry; one rule on top).

**OV-11 · Висене в лявата лента / Left-lane hogging**
Real life: parks in lane 2 of the boulevard at 45 „to be safe" — everyone undertakes them; чл. 15: дръж се вдясно.
Mistake: sustained left-lane cruising with the right lane free.
Evidence: keep-right law; flow-disruption studies; catalog entry NOT_KEEPING_RIGHT.
Н38: второстепенна (1). W: 3. Cond: D/N/R.
Engine: NOT_KEEPING_RIGHT ← keep-right detector (12 s sustain, indicator exemption) — ✅ FULL (ev-lane-discipline)

**OV-12 · Возене по линията / Lane straddling**
Real life: two-lane boulevard, car rides the divider for a block — DVSA #8 (normal positioning), BG „настъпване на осева линия".
Mistake: sustained off-center toward/onto the line; unclear lane ownership.
Evidence: DVSA top-10 #8; BG второстепенна list.
Н38: второстепенна (1). W: 4. Cond: D/N/R ×N ×R.
Engine: POOR_LANE_KEEPING ← lane-keep detector (offset + sustain, perceptual-scale-aware) — ✅ FULL

**OV-13 · Влизане срещу еднопосочна / Wrong-way entry**
Real life: misses the В2 „Влизането забранено" and turns INTO the one-way against flow — official termination item, and the catalog corrective (stop immediately, hazards, reverse out) is the real-world recovery drill.
Mistake: sign scan failure at the turn decision.
Evidence: Н38 termination list („срещу движението… еднопосочно"); wrong-way crash severity.
Н38: опасна (10, прекратяване). W: 4. Cond: D/N ×N.
Engine: WRONG_WAY ← oneway+heading detector (1.5 s sustain) — ✅ FULL (ev-sign-prohibitory)

**OV-14 · Разминаване в тясна улица / Narrow-street meeting**
Real life: parked rows leave ONE usable lane; oncoming car arrives. Rule: the side WITH the obstruction yields (чл. допълнение — narrow-passage priority). Студентски град's daily negotiation.
Mistake: forcing in when the obstruction is on your side; mirror-clipping parked cars while squeezing.
Evidence: ev-oncoming-meeting; urban sideswipe/mirror-strike frequency; German Fahrschule „Engstelle" drills.
Н38: основна (3) / ПТП. W: 4. Cond: D/N/R ×N.
Engine: 🔴 NEW: narrow-passage choreography (parked-row props narrowing to one lane + oncoming actor timed to arrive) + passage-priority adjudication (obstruction-side yield → prioritySituation("narrow-passage")) — actors and grading vocabulary exist; the adjudicator + prop pattern are new.

**OV-15 · Включване в движението / Merging from the curb/driveway**
Real life: pulling out from a bus bay/driveway/parking into flowing traffic — „включване в движението" is its own ЗДвП duty (yield to EVERYTHING on the road).
Mistake: nosing into flow expecting a zipper; half-lane creep occupying the lane.
Evidence: ev-merge-giveway; move-off observation (DVSA #5) at road scale.
Н38: основна → опасна. W: 4. Cond: D/N/R ×N.
Engine: 🟡 PARTIAL — the give-way adjudication machinery covers the conflict once armed at a merge point; NEW: merge-point staging recipe (priorityFromRight variant anchored to curb exits — mostly authoring, small adjudicator tweak for same-direction merge geometry).

**OV-16 · Цип-принцип / Zipper merge at a lane drop**
Real life: two lanes → one (roadworks); alternate feeding is the law of the zipper. BG reality: nobody zips, everybody fights.
Mistake: blocking the merger; or barging without alternating.
Evidence: zipper-merge law (ЗДвП аналог); German Reißverschluss canon; roadworks crash data.
Н38: основна (obstruction). W: 2. Cond: D/N/R.
Engine: 🔴 NEW: lane-drop world zone (cones/works props + laneCount transition) + alternation adjudication (who-entered-when ledger in the director) — grading emits prioritySituation("zipper").

**OV-17 · Обратен завой на грешно място / U-turn where prohibited**
Real life: U-turn is LAWFUL at junctions (чл. 38 — the event library's own legal correction!) but banned on crossings, tunnels, bridges, low-visibility, solid lines. Candidates either fear legal U-turns or fire illegal ones.
Mistake: U-turn over a solid line / at a pedestrian crossing; OR refusing the examiner's lawful U-turn instruction.
Evidence: ev-uturn-reverse (law-corrected чл. 38 + чл. 40); Н38 route REQUIRES one обратен завой.
Н38: основна → опасна (location-dependent). W: 3. Cond: D/N.
Engine: 🟡 PARTIAL — the lex-exam-1 block-turnaround + roundabout U-turn cover the LEGAL executions today; NEW: U-turn legality zones (markings/location bans in the zone layer) + a U-turn maneuver evaluator (heading-reversal detection exists in raw telemetry).

**OV-18 · Обект на платното — заобикаляне / Obstacle swerve without rear check**
Real life: double-parked delivery van in your lane: the pass into the oncoming/left lane is a LANE CHANGE with all its duties, at zero notice. Candidates swerve on reflex, mirror never consulted.
Mistake: crossing into the adjacent lane around the obstacle without mirror/signal/oncoming check.
Evidence: urban double-parking reality; sideswipe pattern; DVSA mirrors category.
Н38: основна (3) / опасна vs oncoming. W: 4. Cond: D/N/R ×N.
Engine: 🟡 PARTIAL — LANE_CHANGE_WITHOUT_MIRROR_CHECK/INDICATOR fire on the swerve TODAY (laneId shift); NEW: double-parked obstacle prop (stationary vehicle actor mid-lane — stage() with a hold pose already does this; an authoring recipe more than code) + oncoming pairing for the full dilemma (OV-14's adjudicator).

---

## 11. Family PK — Parking, stopping & low-speed maneuvering (14)

**PK-01 · Успореден паркинг на заден / Reverse parallel park**
Real life: THE Наредба-38 required maneuver (successful паркиране succesivно or перпендикулярно); graded on control, observation, and result (inside the bay, parallel, curb-safe).
Mistake: > 2 correction pulls (German codified fault), curb mount, abandoning mid-maneuver, no 360° observation during.
Evidence: Н38 route requirement; DVSA #10 (reverse-park control: „complete misjudgement = serious"); Grundfahraufgaben fault list.
Н38: основна (3) per failed element; второстепенни for touches. W: 5. Cond: D/N/R ×N.
Engine: parkInBay maneuver evaluator (bay-locked: center 0.5 m, heading 10°, reverse used, 1.5 s hold) + collision(staticObject) for curb — ✅ FULL (ev-parking-maneuver)

**PK-02 · Гараж на заден / Perpendicular bay reverse**
Real life: the OTHER Н38 parking option (перпендикулярно); supermarket-lot geometry, swing-out awareness.
Mistake: wrong start offset, nose-swing into the neighbor lane, three-plus shuffles.
Evidence: Н38 alternative maneuver; Grundfahraufgaben (Quer).
Н38: основна per element. W: 3. Cond: D/N.
Engine: 🟡 PARTIAL — the evaluator is bay-shape-agnostic in principle; NEW: perpendicular bay spec variant (bay heading ⊥ street + approach-side param) + a painted lot in district data.

**PK-03 · Потегляне по наклон / Hill start (rollback)**
Real life: Н38 explicitly requires „потегляне по наклон" on the route. Rollback > ~0.5 m toward the car behind = the classic fail; stall + rollback = panic spiral.
Mistake: clutch-handbrake timing; no rear check before the roll.
Evidence: Н38 route requirement; DVSA move-off control („rolling backwards"); FO-08's chain-collision input.
Н38: основна (3); ПТП on contact. W: 4. Cond: D/N/R.
Engine: 🔴 NEW: slope zones in the world (district-v1 is flat; needs graded segments or a synthetic ramp) + rollback detector (position regression in gear — telemetry exists) + optional rear-car actor for stakes.

**PK-04 · Ръчна при потегляне / Move-off with handbrake set**
(Cockpit twin of VP-05, kept for family completeness of the Н38 „потегляне" checklist.)
Real life/Mistake/Evidence: as VP-05.
Н38: второстепенна. W: — (counted under VP-05, not double-counted in totals).
Engine: HANDBRAKE_LEFT_ON — ✅ FULL

**PK-05 · Потегляне без оглеждане / Move-off without observation**
Real life: DVSA top-5 verbatim: „attempting to move off without checking mirrors for other road users" — pulling out from the curb into a passing car/cyclist.
Mistake: no mirror + blind-spot routine before releasing the brake at the curb.
Evidence: DVSA #5; BG изпит starts with EXACTLY this moment (потегляне от място).
Н38: основна (3). W: 5. Cond: D/N/R ×N.
Engine: 🟡 PARTIAL — mirrorGlance channel + indicator exist; the lane-change rule doesn't arm at v=0 curb exits. NEW: move-off observation window (mirror+signal lookback armed on first motion from rest at curbside — a clone of the lane-change rule with a rest-start trigger). Pairs with a passing-car actor for stakes (existing staging).

**PK-06 · Спиране в забранена зона / Stopping in a prohibited zone**
Real life: „пусни ме тук за малко" — on the bus stop, 3 m from the junction corner, on the crossing, second row. ev-illegal-stop-zone is the #3 exam-weight event (29q/47pt).
Mistake: zone-blind stopping when asked to „спри тук, където е безопасно" (examiner instruction!).
Evidence: ev-illegal-stop-zone; ЗДвП чл. 98 ban list; BG urban enforcement reality.
Н38: основна (3). W: 4. Cond: D/N/R.
Engine: 🔴 NEW: stopping-legality zone layer (ban polygons: junctions ±, crossings ±, stops ±, hydrants…) + at-rest check → needs a new violation entry in the catalog (severity основна) — the one place this doc proposes a NEW CODE (or reuse detail-tagged PREDRIVE-style generic; decision for the rules owner).
Engine note: „спри тук" examiner-instruction objectives already exist (reachZone + rest).

**PK-07 · Паркиране срещу посоката / Parking against the direction**
Real life: parking on the LEFT curb facing oncoming (illegal on two-way streets) — BG habit imported from narrow-street desperation.
Mistake: crossing the street to a left-side bay on a two-way.
Evidence: ЗДвП parking-side rules; BG enforcement blitzes.
Н38: второстепенна → основна. W: 1. Cond: D/N.
Engine: 🟡 PARTIAL — heading-vs-edge-direction at rest is computable from the tick today; NEW: tiny at-rest orientation check bound to bay/curb zones (rides PK-06's zone layer).

**PK-08 · Отваряне на вратата / Door discipline (Dutch reach)**
Real life: parked: door flung into the cyclist you never mirrored. The EXIT is part of the drive (doc 65 Phase 3 lists Dutch-reach explicitly).
Mistake: no mirror/shoulder before opening; door as weapon.
Evidence: dooring casualty data; ev-parking-maneuver sub-item; NL pedagogy.
Н38: основна (creating danger when exiting). W: 1. Cond: D/N ×N.
Engine: 🔴 NEW: end-of-session door-check interaction (cockpit hotspot sequence post-park + a timed passing cyclist actor) — cockpit hotspot contract (doc 69) is the natural home.

**PK-09 · Спиране върху пътека/кръстовище в колона / Queue tail on a crossing**
Real life: queue advances; candidate stops ON the zebra / inside the junction box because they followed without exit-space budgeting.
Mistake: entering a crossing/box without space to clear it.
Evidence: JU-16's box logic at crossings; ЗДвП stopping bans; urban gridlock photos every day.
Н38: второстепенна → основна (peds forced around). W: 3. Cond: D/N/R.
Engine: 🔴 NEW: at-rest-on-zone check (player stationary with footprint intersecting crossing/junction polygons — geometry exists for crossings today; shares JU-16's box polygon) + queue actor recipe.

**PK-10 · Принудително спиране / Breakdown: triangle & vest**
Real life: flat tire on the boulevard: hazards, vest BEFORE exiting, triangle at 30+ m — ev-emergency-stop-triangle is the #4 exam-weight event (21q/43pt).
Mistake: no hazards; standing in live traffic; triangle at 5 m.
Evidence: ev-emergency-stop-triangle; ЗДвП обозначаване rules; roadside-fatality data.
Н38: основна (procedure). W: 2. Cond: D/N/R ×N (night vest/triangle distances).
Engine: 🔴 NEW: breakdown procedure module (director-triggered failure state + interactive checklist: hazards switch exists in cockpit, vest/triangle as staged interactions) — Phase-3 class build, high exam-weight payoff.

**PK-11 · Заден ход зад ъгъла / Reverse around the corner**
Real life: German Grundfahraufgabe + BG маневра family: reverse right around a corner holding the curb line, full 360° observation, pausing for road users.
Mistake: curb mount, wide drift into the far lane, reversing blind.
Evidence: Grundfahraufgaben GA 2.1 fault list (Bordstein, Parallelposition, >2 Korrekturzüge, Verkehrsbeobachtung).
Н38: основна per element. W: 2. Cond: D/N.
Engine: 🔴 NEW: reverse-corner evaluator (curb-offset corridor along a corner arc + observation cadence) — reuses parkInBay's rest/alignment machinery on a moving corridor.

**PK-12 · Обръщане в три хода / Three-point turn**
Real life: narrow street turnaround with traffic both ways — Н38's обратен завой when no junction/roundabout serves; the discipline is segment-wise observation (look BEFORE each of the three moves).
Mistake: rolling the three moves as one blind ballet; nose/tail overhang into traffic.
Evidence: Н38 обратен завой requirement; German Umkehren GA; DVSA turn-in-road faults.
Н38: основна per element; опасна vs traffic. W: 3. Cond: D/N.
Engine: 🔴 NEW: turn-in-road evaluator (3-segment state machine over gear/heading telemetry + per-segment observation checks) + optional timed traffic actor.

**PK-13 · Осигуряване на наклон / Securing on a slope**
Real life: parked on a hill: handbrake + gear + WHEELS TURNED to the curb (uphill: away; downhill: into) — the theory question everyone gets wrong, drivable as a procedure.
Mistake: handbrake-only faith; wheels straight.
Evidence: ev-parking-maneuver / c-parking-slope-securing (L7's own conceptIds!); runaway-car incidents.
Н38: второстепенна. W: 1. Cond: D/N.
Engine: 🔴 NEW: slope-park procedure check (needs PK-03's slope zones + steering-angle-at-rest reading — telemetry exists in the vehicle model).

**PK-14 · Плавно спиране на позиция / Precision smooth stop**
Real life: „спри плавно на автобусната маркировка" — the examiner's stop-here instruction: smooth decel to a POINT, no kerb strike, no 40-cm gap.
Mistake: harsh final meter; stopping wide of the kerb; overshooting the mark.
Evidence: BG „плавно спиране" grading (explicit скъсване cause when harsh); DVSA „pull up on the right" exercise.
Н38: второстепенна → основна (harsh). W: 3. Cond: D/N/R ×R.
Engine: ✅ FULL — smoothStop completeManeuver objective (minApproachKmh, maxDecelMs2) + reachZone composition exists in the lesson vocabulary today

---

## 12. Family RX — Railway & tram crossings (5)

**RX-01 · Прелез с бариери / Guarded rail crossing (barriers/lights)**
Real life: flashing red + descending barrier; the fatal move is beating the barrier. Rail-crossing crashes are rare but near-100% fatal — and жп прелез is a REQUIRED theory topic (62q junction/жп topic).
Mistake: entering on flashing red; stopping ON the tracks in queue; zig-zagging half-barriers.
Evidence: ev-railway-crossing; rail-crossing fatality severity; Н38 „навлизане при забраняващ сигнал" logic extends.
Н38: опасна (10, прекратяване-class). W: 3. Cond: D/N/R ×N.
Engine: 🔴 NEW: rail-crossing world asset (track, barrier/light state machine, approach zone) — grading then maps onto stopLineCrossed-style adjudication (control variant „railCrossing") + COLLISION; no district track exists today.

**RX-02 · Неохраняем прелез / Unguarded crossing (А-sign + St Andrew's cross)**
Real life: rural unguarded crossing: the DRIVER is the barrier — slow to observable speed, look both ways along the track, cross without stopping ON it.
Mistake: rolling across sign-blind at 50; stopping mid-tracks in hesitation.
Evidence: ev-railway-crossing; unguarded-crossing crash reports (BG rural lines).
Н38: опасна. W: 2. Cond: D ×N ×R.
Engine: 🔴 NEW: same rail asset, unguarded variant (approach-speed envelope + track-zone no-stop check) — shares RX-01's build.

**RX-03 · Опашка върху прелеза / Queue tail on the tracks**
Real life: NEVER enter the crossing without clear exit — the queue compresses, the barrier drops on your roof. Same discipline as JU-16, mortal stakes.
Mistake: following the queue onto the tracks.
Evidence: rail-authority campaigns; JU-16 geometry with a train.
Н38: опасна. W: 2. Cond: D/N.
Engine: 🔴 NEW: track-zone occupancy check + queue actor (JU-16's recipe on RX-01's asset).

**RX-04 · Трамвайна спирка с остров / Tram stop island rules**
Real life: tram stops, doors open toward the island/roadway — passing rules flip (stop behind, or crawl where an island exists). Sofia-specific daily scenario.
Mistake: sailing past open tram doors at 40 into stepping passengers.
Evidence: ev-tram; Sofia tram-network reality; ЗДвП tram-stop clauses.
Н38: опасна (peds) / основна. W: 2. Cond: D/N ×N.
Engine: 🔴 NEW: tram actor + stop-island world props + door-state passenger spawns — the biggest single asset ask in this doc; grading falls to existing ped occupancy/collision once spawned.

**RX-05 · Релси в платното / In-carriageway tram tracks**
Real life: turning ACROSS tracks embedded in the road: trams brake 3× worse and CANNOT swerve; the left-turn-across-tram is Sofia's signature heavy crash.
Mistake: turning across an approaching tram („it'll stop") or riding the slippery rails in rain.
Evidence: ev-tram; tram-collision severity data; wet-rail grip physics.
Н38: опасна (10). W: 2. Cond: D/N/R ×R (rails in rain).
Engine: 🔴 NEW: tram actor on track paths + track-crossing adjudication (JU-10's left-turn-across-path machinery pointed at a rail vehicle) — rides N1 + RX-04's actor.

---

## 13. Family AC — Adverse conditions (13)

**AC-01 · Нощем без светлини / Night, headlights off**
Real life: pulls out of a lit parking area at night, dash is bright (LED clusters!), road ahead barely lit — drives blind and invisible. Modern-car epidemic.
Mistake: no light check at engine start after dark.
Evidence: night crash multipliers; DRL/dash-brightness trap literature; BG основна.
Н38: основна (3). W: 4. Cond: N (defining).
Engine: HEADLIGHTS_OFF_AT_NIGHT ← isNight + headlights detector — ✅ FULL (ev-lights-usage)

**AC-02 · Дъжд без светлини / Rain, lights off**
Real life: daytime downpour, grey car, no lights: invisible in every mirror. The wipers-on-lights-on rule (catalog corrective verbatim).
Mistake: „I can see fine" — lights are for BEING seen.
Evidence: reduced-visibility law (чл. 70); catalog rule; BG второстепенна.
Н38: второстепенна (1). W: 3. Cond: R (defining).
Engine: HEADLIGHTS_OFF_IN_RAIN ← rain + headlights detector — ✅ FULL

**AC-03 · Заслепяване на насрещните / High beams vs oncoming**
Real life: highs left on into an oncoming car: 3–5 s of mutual blindness at closing 100 km/h. чл. 74: dip on meeting.
Mistake: no dip; or dipping too late (inside 200 m).
Evidence: dazzle-crash pattern; ЗДвП dipping duty; c-dazzle-handling concept (L6's own list).
Н38: основна (3). W: 3. Cond: N (defining) ×R.
Engine: 🔴 NEW: oncoming actor (N1) + dip-check rule (headlights=="high" while oncoming within window — the HeadlightState channel already carries "high"; the ACTOR is the missing half).

**AC-04 · Дълги зад кола / High beams behind a lead car**
Real life: highs into the lead car's mirrors for kilometers — the tailgating of light.
Mistake: no dip when closing on a lead vehicle.
Evidence: чл. 74 following-dip duty; night-driving canon.
Н38: второстепенна → основна. W: 2. Cond: N (defining).
Engine: 🟡 PARTIAL — leadGapM + headlights("high") are both on the tick TODAY; one small rule (dip within N s of acquiring a lead) — the cheapest night detector available.

**AC-05 · Фарове за мъгла / Fog-lamp discipline**
Real life: fog bank on the ring road: front fogs legal at reduced visibility; REAR red fog only under 50 m — and everyone leaves it burning to blind followers for weeks.
Mistake: rear fog outside <50 m visibility; highs INTO fog (white wall effect).
Evidence: ev-lights-usage (law-corrected чл. 74/75 split); fog pileup case studies.
Н38: второстепенна. W: 1. Cond: fog (NEW condition).
Engine: 🔴 NEW: fog condition (visibility param on the tick + rendering) + fog-lamp states (front/rear channels beside HeadlightState) + the чл. 74/75 rule pair.

**AC-06 · Здрач / Dusk transition**
Real life: the half-hour where unlit cars vanish against grey asphalt — lights legally required „от залез", practically earlier. Specs already model dusk (`timeOfDay: "dusk"`).
Mistake: waiting for full dark; judging by own vision, not others'.
Evidence: dusk crash spike data; чл. 70 twilight clause.
Н38: второстепенна → основна. W: 2. Cond: dusk (defining).
Engine: 🟡 PARTIAL — dusk exists in lesson conditions but isNight is binary; NEW: dusk semantics for the lights detector (a "lightsRequired" world flag decoupled from isNight — one tick field, detector reuse).

**AC-07 · Аквапланинг / Standing-water aquaplane**
Real life: puddle strip at 70+: steering goes silent, the car floats. The correct response (off throttle, NO brake, straight wheel) is pure trained reflex.
Mistake: braking/steering in the float; entering at speed.
Evidence: aquaplane physics; SWOV wet-road novice data; doc 65 Phase 4.
Н38: несъобразена скорост → ПТП. W: 2. Cond: R (defining).
Engine: 🔴 NEW: Phase-4 friction physics (doc 65 explicitly defers reduced-friction/aquaplane to the Rapier friction model) + water-strip world zones. Speed-envelope PRE-teaching stageable now via SP-04.

**AC-08 · Лед по моста / Black ice / winter grip**
Real life: first frost, bridge deck freezes before the road; grip vanishes without visual warning.
Mistake: normal speed over frost-prone spots; steering corrections that spin it.
Evidence: winter first-frost crash spikes; bridge-ice physics; doc 65 Phase 4.
Н38: несъобразена скорост. W: 1. Cond: winter (NEW condition).
Engine: 🔴 NEW: Phase-4 friction + winter condition — same subsystem as AC-07, listed separately because the CUE structure (invisible hazard) differs pedagogically.

**AC-09 · Ниско слънце / Low-sun glare**
Real life: westbound at 18:00: the windscreen becomes a lightbox; pedestrians at crossings simply disappear. Visor + speed-down is the whole skill.
Mistake: maintaining speed while functionally blind for seconds.
Evidence: glare-crash clusters (low-sun hours); insurer data on sun-strike claims.
Н38: несъобразена скорост (основна when it matters). W: 1. Cond: D (low-sun windows).
Engine: 🔴 NEW: glare condition (sun-angle rendering + a visibility flag arming the conditions-speed envelope) — learn-first family; grading conservative.

**AC-10 · Запотено стъкло / Fogged windscreen at start**
Real life: rainy-morning start: glass opaque, candidate drives off peering through a fist-sized clear patch. Pre-drive's weather appendix.
Mistake: moving off before demist; wiping-while-driving.
Evidence: cold-start visibility rules (ЗДвП technical fitness); instructor pre-drive drills.
Н38: основна (visibility not ensured). W: 1. Cond: R/winter.
Engine: 🔴 NEW: cockpit demist interaction (windshield opacity state + climate hotspot in the doc-69 hotspot contract; a pre-drive step variant) — extends the EXISTING pre-drive machine with a conditional step.

**AC-11 · Заслепен от насрещни дълги / Being dazzled**
Real life: oncoming highs blind YOU: the trained response is eyes to the right road edge + off throttle, never brake-slam or flash-war.
Mistake: staring into the light; hard braking mid-lane; retaliation flashing.
Evidence: c-dazzle-handling (L6 conceptIds); night head-on drift crashes.
Н38: not directly graded — response training (speed envelope grades). W: 1. Cond: N (defining).
Engine: 🔴 NEW: dazzle stimulus (oncoming actor with highs + screen-glare visual + expected speed response) — rides N1's oncoming actor; grading via SPEED_TOO_FAST_FOR_CONDITIONS envelope during the stimulus window.

**AC-12 · Страничен вятър / Crosswind gust**
Real life: gap between buildings / bridge: a gust shoves the car half a lane. Grip-and-correct, expect it at the NEXT gap.
Mistake: over-correction (the real killer — the second swerve); no anticipation at gaps.
Evidence: crosswind rollover/drift incidents; doc 65 Phase-4 (tyre-blowout/crosswind pairing).
Н38: n/a (control quality). W: 1. Cond: wind (NEW condition).
Engine: 🔴 NEW: Phase-4 lateral-impulse physics + wind zones — the POOR_LANE_KEEPING detector would grade the outcome unchanged.

**AC-13 · Първият дъжд / First-rain film**
Real life: first minutes of rain after dry weeks: oil+dust film = the slipperiest the road ever gets — BEFORE it looks properly wet. Every instructor's favorite trap question, drivable.
Mistake: delaying the rain-speed discount until the road „looks wet".
Evidence: first-rain grip studies; instructor canon; the sim's wetness store (doc 65 Phase 1) models onset.
Н38: второстепенна (несъобразена скорост). W: 2. Cond: R (onset window defining).
Engine: ✅ FULL — flip `rain` mid-session (per-tick field) + SPEED_TOO_FAST_FOR_CONDITIONS with its 3 s sustain; the wetness-onset narrative is authoring, not code

---

## 14. Family SN — Signs, markings & road-signal furniture (8)

**SN-01 · „Влизането забранено" / No-entry compliance (В1/В2)**
Real life: the one-way's mouth guarded only by the red circle; GPS says turn, the sign says no. OV-13's sibling from the SIGN-reading side.
Mistake: sign scan failure under navigation load.
Evidence: Н38 termination item; wrong-way entries at one-way mouths.
Н38: опасна (10, прекратяване). W: 4. Cond: D/N ×N.
Engine: ✅ FULL — WRONG_WAY detector fires on the entry (oneway edges + heading); catalog corrective already teaches the В2-scan (counted once with OV-13 in exam-generation pools)

**SN-02 · Задължителна посока / Mandatory-direction signs (Г-group)**
Real life: Г1 „само направо" at the works entrance; candidate turns anyway following memory, not signs.
Mistake: movement against a mandatory arrow.
Evidence: ev-markings-response; BG знаци topic (64q).
Н38: основна (3). W: 2. Cond: D/N.
Engine: 🔴 NEW: lane-intent/movement legality layer (shared with JU-14 — per-node allowed movements) + turnStarted check.

**SN-03 · Непрекъсната линия / Solid-line discipline**
Real life: BG второстепенни list VERBATIM: „настъпване на осева линия" = 1 т. — wheels touching the solid center line, graded on every exam, constantly.
Mistake: lazy line-riding through curves; crossing to dodge potholes.
Evidence: BG official second-degree list; DVSA #9 (solid white lines).
Н38: второстепенна (touch) / основна (crossing). W: 4. Cond: D/N/R ×N.
Engine: 🔴 NEW: markings layer (line type per edge in district data) + touch/cross rule off laneOffsetM (telemetry exists; shared with OV-04 — counted once).

**SN-04 · Стрелки на платното / Lane-arrow compliance**
Real life: approach arrows appear 50 m before the junction; the straight-arrow lane driver turns left across the queue. JU-14 from the MARKING side.
Mistake: late arrow reading; „arrow blindness" at night/rain (paint visibility).
Evidence: DVSA #9 („not following directional arrows"); BG маркировка questions.
Н38: основна (3). W: 3. Cond: D/N/R ×R (worn paint).
Engine: 🔴 NEW: same lane-intent layer as SN-02/JU-14 (one capability, three archetypes).

**SN-05 · Бус лента / Bus-lane discipline**
Real life: Sofia bus lanes with hour plates: driving in it at 08:30 = violation; NOT using it for the right turn where prescribed = also wrong. Two-sided trap.
Mistake: cruising the bus lane; or refusing the legal right-turn entry.
Evidence: Sofia bus-lane enforcement (camera blitzes); ЗДвП bus-lane rules.
Н38: основна (3). W: 2. Cond: D (hour-gated).
Engine: 🔴 NEW: bus-lane zone (lane-tagged legality in the zone layer, time-of-day term) — laneId telemetry does the rest.

**SN-06 · „Зъби" и стоп-линия / Yield teeth & stop-line paint**
Real life: give-way triangles (акулски зъби) and painted STOP bar where the SIGN is obscured by a truck/tree — the paint IS the law when the sign is invisible.
Mistake: paint ignored when the vertical sign is missed.
Evidence: markings-as-primary rule; BG worn-paint reality.
Н38: as the underlying priority violation. W: 2. Cond: D/N/R ×R ×N.
Engine: 🟡 PARTIAL — the give-way/stop adjudication is sign-agnostic already (stopLineCrossed + conflict checks); the markings are world DRESSING for the recognition training — an authoring/asset task, zero grading change.

**SN-07 · Временна организация / Roadworks signage & lane shift**
Real life: orange signs + cones re-route the lane 2 m left; paint conflicts with cones (cones win). Novices follow the OLD paint into the works.
Mistake: obeying permanent markings over temporary layout; speed through works untouched.
Evidence: roadworks crash rates; temporary-regulation precedence rule.
Н38: основна (3). W: 2. Cond: D/N ×N.
Engine: 🔴 NEW: works-zone world kit (cones/beacons props + temporary lane path overriding laneId mapping + works speed cap in the zone layer) — pairs with OV-16's lane drop.

**SN-08 · Сигнали над лентите / Gantry lane signals (X / arrow)**
Real life: boulevard tidal lanes: red X over YOUR lane means it belongs to oncoming in 200 m. Rare, deadly to misread, on the theory exam.
Mistake: riding a red-X lane; late merges off it.
Evidence: ev-lane-control-signal (doc 65 Phase 3); tidal-flow head-on incidents.
Н38: опасна (it is oncoming-lane entry). W: 1. Cond: D/N.
Engine: 🔴 NEW: gantry signal world asset + per-lane signal state (the WRONG_WAY/lane machinery grades the outcome once the lane's legal direction flips with the signal).

---

## 15. Coverage matrix — what is stageable TODAY vs what needs building

**152 catalogued entries · 151 unique archetypes** (PK-04 is a cross-family alias of VP-05). Status per the legend (§2): ✅ FULL = stageable + gradable today with shipped detectors/staged kinds (authoring only); 🟡 PARTIAL = grading/telemetry substantially exists, a small rule, recipe or world-dressing is missing; 🔴 NEW = a genuinely new capability (actor, world layer, subsystem, physics, input channel).

| Family | Archetypes | ✅ FULL | 🟡 PARTIAL | 🔴 NEW |
|---|--:|--:|--:|--:|
| VP Vehicle procedure & cockpit | 13 | 3 | 6 | 4 |
| JU Junctions, priority & signals | 24 | 7 | 8 | 9 |
| RB Roundabouts | 6 | 3 | 1 | 2 |
| PE Pedestrians & crossings | 16 | 6 | 7 | 3 |
| VU Vulnerable road users | 14 | 1 | 3 | 10 |
| SP Speed management | 13 | 5 | 3 | 5 |
| FO Following & gaps | 8 | 3 | 3 | 2 |
| OV Overtaking, lanes & maneuvers | 18 | 5 | 5 | 8 |
| PK Parking, stopping & low-speed (13 unique) | 13 | 2 | 3 | 8 |
| RX Railway & tram | 5 | 0 | 0 | 5 |
| AC Adverse conditions | 13 | 3 | 2 | 8 |
| SN Signs & markings | 8 | 1 | 1 | 6 |
| **Total** | **151** | **39 (26%)** | **42 (28%)** | **70 (46%)** |

Read honestly: **81 archetypes (54%) are within reach of the CURRENT engine** (39 free + 42 needing only small rules/recipes/world dressing), and they include the entire Наредба-38 termination core (Б2, red light, wrong-way, pedestrian, collision, priority) — the exam's spine is already stageable. The 70 NEW cluster into 13 capabilities below; the long tail (rail/tram, physics, fog/winter) is genuinely deferred work and is priced as such.

### Ranked build list (deduplicated capabilities, by unlocked-archetype-weight per effort)

| # | Capability | Unlocks (archetypes) | Effort | Notes |
|---|---|---|---|---|
| 1 | **Small-rule detector pack** — move-off observation window, stop-position at red, standstill gap, hesitation/slow-driving, causeless harsh brake, junction-approach envelope, junction-scan lookback, being-overtaken, crossing-zone overtake composite, at-rest-on-zone, rest orientation, stall event, high-beam dip-behind, rain-follow knob | ~15 🟡→✅ (VP-03/04/07/09, JU-13/15/23, SP-06/11, FO-04/08, OV-07/10, PK-05/09, AC-04) | S–M | Pure rules/engine work on EXISTING telemetry; no world, no actors. Biggest single jump: FULL 39→~54 |
| 2 | **N1 · Oncoming machinery** — oncoming actor streams + left-turn-across-path / overtake-corridor / narrow-passage adjudication (prioritySituation vocabulary is reserved & graded already) | ~10 (JU-10/24, OV-05/08/09/14/18-full, AC-03/11, VU-14-part) | L | The single highest-severity unlock: LTAP + head-on families. Doc 65 Phase-2's „priority solver" IS this |
| 3 | **N2 · Signal-phase API** — director-controlled phases, redYellow in stopLineCrossed, ped phases, flashing/dead mode | ~7 (JU-06/07-determinism/08/09/20, PE-06, SP-09) | M | Makes every light encounter deterministic per seed — exam-generation gold |
| 4 | **N3 · Legality/zone map layer** — speed zones (30/school/residential), stopping/overtaking/U-turn bans, bus lanes, line types, lane-intent arrows | ~12 (SP-03, PE-07/15, OV-04/06/17, PK-06/07, SN-02/03/04/05, JU-14) | M–L | One data layer, three families; detectors mostly exist (SPEEDING_*) or are small rules |
| 5 | **N4 · Pedestrian actor variants** — occluded spawns, walk profiles, unmarked mid-block, white cane, e-scooter profile | ~7 (PE-04/05/09/12/14, VU-08, PE-10-part) | M | pedestrianDartOut generalization; grading untouched |
| 6 | **N5 · Public-transport & large actors** — bus (dwell/indicate/merge/hazards), school bus, box-truck profile | ~4 (PE-10, VU-11/12, FO-06) | M | Unlocks чл. 67 + the bus-shadow kill zone |
| 7 | **N7 · Maneuver evaluator pack v2** — perpendicular bay, reverse-corner, 3-point turn, U-turn evaluator, slope zones + rollback + slope-park, door-check | ~7 (PK-02/03/08/11/12/13, OV-17-full) | M–L | Completes the Наредба-38 REQUIRED maneuver set (наклон + обратен завой + 2nd parking form) |
| 8 | **N8 · VRU interaction pack** — lateral-clearance detector, path-deviation command, door-swing actor, alongside/blind-spot pacing, filtering PTW | ~6 (VU-02/03/04/07, OV-03/10-full) | M | Rides the existing cyclist proxy; adds the safety-margin geometry |
| 9 | **N9 · Authority actors** — emergency vehicle (siren, behind/junction), police stop, traffic controller | ~4 (VU-09/10, VP-11, JU-18) | M | prioritySituation("emergency") vocabulary reserved; Н38 termination item (controller) lives here |
| 10 | **N11 · Cockpit stimuli pack** — telltales, distraction events, breakdown/triangle procedure, demist | ~5 (VP-06/13, PK-10, AC-10, VP-12-full) | M | Doc-69 hotspot contract is the natural seam; high exam-weight (triangle = 43 pts of theory bank) |
| 11 | **N12 · World variety kit** — multi-lane roundabout, exit-leg crossings, curve-advisory zones, unlit segments, works/lane-drop kit, gantries | ~9 (RB-04/05, SP-05/07, OV-16, SN-07/08, PE-05-part, JU-16) | L | District data + assets; each item small, the kit is long |
| 12 | **N10 · Rail & tram pack** — crossing asset (guarded/unguarded), tram actor + islands, track adjudication | 5 (RX-01..05) | L | Self-contained; Sofia realism demands it eventually — nothing else depends on it |
| 13 | **N13 · Phase-4 physics** — friction/aquaplane/ice, crosswind impulse, ABS/threshold feel | ~5 (AC-07/08/12, SP-05-feel, VU-13-swerve) | XL | Already deferred by doc 65 Phase 4 (~42 exam points); everything above is independent of it |

Sequencing note: capabilities 1+3+4 (rules + signals + zones) are pure engine/data work with no new actors and lift coverage to **~95/151 (63%)**; adding 2+5+6 (oncoming, ped variants, buses) reaches **~120/151 (79%)** and covers every family except RX and physics-gated AC entries.

## 16. The combinatorial math — 1000+ DISTINCT exams, honestly

**Definition (the honesty contract):** two generated exams are DISTINCT iff they differ in at least one of: (a) route shell, (b) global conditions, (c) the archetype assigned to a graded slot, or (d) a discrete parameter TIER of an assigned archetype (e.g. give-way car lead-gap tier tight/comfortable — tiers are authored, not RNG). **Per-seed jitter (±3 m trigger, ±0.12 s lead) does NOT count** — seeds guarantee replay determinism and freshness-on-retry (director contract: same seed+attempt = identical staging), but a jittered copy is the same exam pedagogically.

**Slot model** (matches the shipped lex-exam-1 anatomy): a route shell exposes graded SLOTS — pre-drive (always), N_j junction slots, N_c crossing slots, 1 lead-car slot, 0–1 roundabout slot, 0–1 cyclist slot, 1 parking slot, + route-wide detector families (speed/following/lane) that condition-overlays modulate.

**Today (shipped engine, district-v1):**
- Route shells: lex-exam-1 ships; the graded set (1×Б2, 2 lights, 1 roundabout, T-junctions, 2 crossings, 1 bay) supports **~4 honestly distinct shells** (different leg orders/turnarounds over the same assets).
- Conditions: day / night / rain / rain+night = **4** (specs support it today).
- Slot assignments from the 39 FULL archetypes: junction slot ∈ {JU-01, JU-02, JU-04-tight, JU-17, none} = 5; crossing slot ∈ {PE-02, PE-08, PE-13, PE-16 (rain-gated), none} ≈ 4.5 avg; lead-car ∈ {FO-02, pressure-only, none} = 3; roundabout ∈ {RB-01, RB-06} = 2; cyclist ∈ {VU-01, none} = 2.
- **4 shells × 4 conditions × (5 × 4.5 × 3 × 2 × 2 = 270) ≈ 4,320 nominal → ≥ ~1,500 after honest dedupe** (condition-gated variants collapse some cells; single-junction shells drop a factor).

So the raw 1000 is numerically crossable TODAY — but it would sample only **39/151 archetypes (26%)** of what real exams test. That is the honest gap: **count was never the bottleneck; breadth is.** A candidate could grind 50 of these and never meet a left-turn-across-oncoming — the situation most likely to kill them.

**After Wave 1 (build items 1–3–4: rules + signals + zones — no new actors):** FULL ≈ 95. Junction slots gain the signal-phase axis (amber-dilemma / hesitation / red+yellow / flashing ≈ ×4 per signalized slot) and zone overlays (30-zone / school / residential ≈ 3 route-wide variants). 4 shells × 4 conditions × 270 × 4 × 3 ≈ **51,800 nominal; > 10,000 surviving dedupe**, now sampling ~63% of the taxonomy.

**After Wave 2 (items 2–5–6: oncoming, ped variants, buses):** every high-weight family is stageable (~120/151). Junction slot count per route rises (left-turn slots become gradable): with 6 shells (second district or route generator) × 4 conditions × junction 8 × crossing 6 × lead 3 × rb 2 × cyclist/VRU 4 × signal 4 × zone 3 = 6×4×(8·6·3·2·4·4·3 = 13,824) ≈ **331k nominal**. The floor claim we can defend publicly: **≥ 1,000 distinct exams each differing in at least one GRADED ENCOUNTER, drawn from ≥ 100 real-world archetypes, before any seed jitter** — reached at Wave 2 with margin ×300.

The generator's real constraints, honestly named: (1) route-shell authoring against a finite district (the multiplier that saturates first — a second district or a route-synthesis pass over the lane graph is worth more than any actor); (2) condition-gating consistency (rain-gated archetypes must not deplete dry pools); (3) difficulty balance — slot assignment must respect a target опасна-exposure budget per exam (2–3 termination-class encounters, doc 32 pass math), which the weight column (W) exists to drive.

## 17. Sources

**Bulgarian exam & law:** Наредба № 38 (rta.government.bg/upload/9175/n38.pdf) · ИААА методика — категория В (rta.government.bg/upload/646/metodikavb.pdf) · docs/education/32 (verified format + termination list) · shofiorskikursove-varna.com/izpit-praktika (route requirements: ≥3 regulated junctions, ≥5 right/5 left turns, обратен завой, slope start, parking) · avtokurs.alle.bg (опасни/основни/второстепенни reproduction) · uchasedakaram.com, sba.bg, avtolegion.bg (instructor top-скъсване lists) · pravatami.bg (procedure/appeals).
**Crash causation:** SWOV young-drivers fact sheet (swov.nl/en/fact-sheet/young-drivers) · ERSO junctions (40–60% share) & country profile Bulgaria · EC road-safety young-drivers statistics · NHTSA rear-end 29% + young-driver speeding fatals · IIHS roundabouts (entering-circulating dominance; Maryland/WA studies) · ETSC PIN (Bulgaria 74 deaths/million, 2024) · EU urban VRU 70% share · CDC teen-driver distraction.
**UK DVSA:** safedrivingforlife.info top-10 fail causes (with per-item examples) · gov.uk Ready-to-Pass fault marking (minor/serious/dangerous logic) · DL25 16 fault categories · hazard-perception clip taxonomy (theorytestadvice.co.uk; ped ≈35% / emerging ≈25% clip shares).
**German system:** Prüfungsrichtlinie Anlage 3 (fahrtipps.de) — fail criteria incl. bus-with-hazards >20 km/h, oncoming-lane left-turn positioning, no-reaction-to-children, repetition/accumulation fails · Grundfahraufgaben Klasse B (click-learn.de, degener.de) — Gefahrbremsung ~30 km/h, reverse-corner, parallel/perpendicular park, Umkehren, codified faults (curb, >2 corrections, observation).

*Related docs: 65 (event library — every archetype references its ev-* parent) · 68 (A8 director architecture the staging assumptions come from) · 32 (scoring law). This taxonomy feeds the exam-generator spec (next doc in the program).*
