# 86 — Founder review of the 150 scenarios: the single defect ledger and the fix wave

**Date** 2026-07-30 · **Status** approved for automatic execution · **Supersedes** the 17 individual
audit reports · **Scope** `platform/src/modules/sim/**`, `content/world/**`, `tools/maps/**`,
`tools/blender/**`

---

## 0. What this document is

The founder played **50 of 154** catalogued scenarios and wrote up 50+ defects by hand
(`150 verdict hand written most important.txt`, `rephrased.txt`, `brief.txt`). Seventeen
independent audits then went through the code family by family. This file merges all of it into
**one ledger, merged by CAUSE**, and into **one fix plan partitioned by file ownership** so the
lanes can run in parallel without colliding.

Everything numbered below was verified against the tree on 2026-07-30 unless it says
`UNVERIFIED`. The census numbers come from walking all 154 `ScenarioSpec` literals and all 90
`content/world/*.json` districts, not from sampling.

### The catalog order is confirmed

Catalog order = `SCENARIO_TEMPLATES` order (`scenario/index.ts:94`). Walking it reproduces the
founder's numbering exactly:

| his # | scenario | his # | scenario |
|---|---|---|---|
| 1 | `sc-park-perp-rev` | 29 | `sc-pe-jaywalker` |
| 6 | `sc-roundabout-entry` | 37 | `sc-mw-discipline` |
| 9 | `sc-junction-stop` | 46 | `sc-ov-lane-keeping` |
| 20 | `sc-signal-controller` | **50** | **`sc-ov-ban-overtake`** |

His item 50 is catalog position 50. So **he has seen positions 1–50; positions 51–154 (104
scenarios) are unreviewed**, and section 7 projects each defect class onto them.

### Verdict

> **The simulator is not far from teaching correctly — but it is currently teaching incorrectly at
> scale, and the reason is one missing idea, not fifty missing fixes.**
>
> Nothing in the product ties **what a scenario grades** to **what its world contains**. The rule
> engine is honest about the car and blind about the street: `CROSSED_SOLID_LINE` is the *only*
> marking code that asks whether the paint exists, and `WRONG_LANE_FOR_DIRECTION` is the *only*
> code that reads a world object. The other 43 world-referencing codes convict on geometry alone.
> That single gap produced most of what he found: a centre line graded on 90 scenarios whose roads
> have no paint, a "50" plate on 83 scenarios' worth of 30/40/90/140 km/h streets, a green marker
> 27.7 m inside four junctions, and a car that spawns already in violation on 31 scenarios.
>
> The individual bugs are cheap. **Fifty-eight distinct defects: 20 are a single line or number,
> 13 more are one change in one engine or builder file that repairs 10–127 scenarios each, and the
> remaining 25 are per-family authoring that rides alongside the content deepening.** The expensive
> part is the gate in section 10 — and it is the only part that stops this from happening again on
> the next 150.

---

## 1. Severity ladder

| band | meaning | count |
|---|---|---|
| **teaches-falsehood** | a fault fires where the world does not justify it, or the guidance instructs something illegal. **This actively produces worse drivers** and is the top of the list. | **18** |
| **blocks-student** | cannot finish, cannot advance, must reload the browser. | **9** |
| **breaks-lesson** | the lesson cannot teach its objective — the traffic has already passed, the sign it is about does not exist, the quiz has no pictures. | **17** |
| **degrades** | real but survivable. | **12** |
| **cosmetic** | looks wrong. | **2** |
| | **TOTAL DISTINCT DEFECTS** | **58** |

---

## 2. The ledger — teaches-falsehood (18)

### T1 · Three lane codes grade against paint the world never draws
**90 of 154 scenarios · 62 of 90 districts · 421 unmarked two-way multi-lane edges in 74 districts**

`world/builders/constants.ts:278` `MARKED_CLASSES` = {motorway, trunk, primary(_link),
secondary(_link), tertiary(_link)}. `residential`, `unclassified`, `living_street` and `service`
are absent, and `markings.ts:723` (`if (!MARKED_CLASSES.has(eb.edge.class)) continue;`) skips the
entire lane-line pass for them. Meanwhile `rules/engine.ts:912-919` `centerLineCond` reads only
`tick.oneway`, `tick.laneId`, `tick.laneCount`, `tick.laneOffsetM`, `tick.indicator`; `:935-944`
`offCentre` reads only `|laneOffsetM|`; `:1100-1105` `hoggingLeft` reads only `laneId`. None asks
whether paint exists. On a two-way `lanes: 2` edge `lanesPerDir = 1`, so `laneId 0 === laneCount-1`
is **always** true — the "leftmost lane" guard is vacuous, and a 3.3 m drift bills
`CENTER_LINE_TOUCHED` after `centerLineSustainSec` 3.5 s.

The correct pattern already exists one screen above: `engine.ts:879-884` gates `CROSSED_SOLID_LINE`
on the authored `tick.solidCenterLine`. And `WRONG_LANE_FOR_DIRECTION` (`engine.ts:1679-1685`)
reads `meta.scenario.laneArrows` — the same block `markings.ts:517` paints from. Two precedents,
never generalised.

Test-pinned proof the paint is absent: `world/__tests__/lane-arrows-markings.test.ts:181`
`expect(base.markingQuads).toBe(0)` under the title *"the arrows are the ONLY paint on this map
(unclassified arms draw no lane lines)"*.

**Founder** items 1, 2, 27, 31, 46, 49, and the global *«Настъпване на осевата линия — major error,
it say we step on some line that doesnt exist at all»*. **He is right, and it is worse than he
thought: it is 90 scenarios, not "a couple of lessons".**

---

### T2 · Four map generators spawn the car ON the centreline — the fault fires 3.5 s after first movement, before the student has done anything
**31 of 154 scenarios · 41 spawn points across 15 districts**

`LessonScene.tsx:305-311` uses the spawn point verbatim, no lane snap. Every T/X-junction and
VRU generator writes arm spawns at `x = 0` or `y = 0` — the road centreline, not the lane centre.
`runtime/locator.ts:234-249` then computes `laneOffsetM = 4.0625` (lane centre at
`(1-1-0+0.5)·LANE_WIDTH_M`), which is above `laneKeepMaxOffsetM 3.25`, with `laneId 0 ===
laneCount-1`, `oneway false`, indicator off. `centerLineCond` is TRUE from the first moving frame.

Affected districts (census): `jx-equal-v1` 4, `jxg-giveway-v1` 1, `lot-45/narrow/par/perp-v1` 8,
`pe-jay-v1` 3, `sig-wave-v1` 1, `sx-v1` 3, `tj-emerge-v1` 3, `tj-occluded-v1` 3, `tj-rhr-v1` 3,
`tj-stop-v1` 3, `vu-bikelane-v1` 3, `vu-cyclist-v1` 3. Contrast every straight-street district,
which correctly spawns at `x = 4.06` — the convention `meta.scenario.laneCenterRightM` already
records.

**Founder** item 29 *«instantly error appeared»*; the Полигон *«out of nowhere after loading of the
screen this appears — Завиване без мигач»*; rephrased *"Unexpected Error on Lesson Start … the
user had not yet performed any action"*. **Exactly reproduced.**

---

### T3 · The green stop-marker for a `passSignal` objective is rendered at the junction's geometric CENTRE — up to 27.7 m past the stop line the same lesson grades
**9 of the 11 `passSignal` objectives · directly hits sc-junction-stop, sc-signal-response, sc-junction-scan, sc-junction-left, sc-signal-redyellow, sc-sig-controller-live, sc-sig-green-wave (×2), sc-sp-eco-coast**

`scene/guidanceRoute.ts:115-116` maps `passSignal` to `{ kind: "point", x: params.x, y: params.y,
marker: true }` with no offset back to the graded cut; `RouteGuidance.tsx:270` places the pillar +
ring there. Nine of eleven `passSignal` objectives author `x: 0, y: 0` — the junction node. The
derived stop line on those maps is 27.725 m out (`world/__tests__/tj-districts.test.ts`,
`sx-district.test.ts:368-378`), and `rules/types.ts:1175` `stopOvershootCenterM` is 1.2 m. A car
resting on the green circle is ~26.5 m past the overshoot threshold.

`sc-signal-response` instruction 3 literally says *«Спри на 1–2 метра ПРЕДИ стоп-линията»*
(`templates-junctions.ts:331`) while its own marker stands mid-box, and its mistake demo grades
`STOP_LINE_OVERSHOOT` (`:378`) for doing what the marker instructs.

The correct pattern exists once: `templates-junctions2.ts:134` pins `sc-jgap-line` to
`(4.06, −27.73)` with the comment *"the marker must say „спри ТУК", never mid-box"*.

**Founder** items 10, 21, and the global *"Incorrect Stop Position"* — *"the green circle … is
actually put AFTER the stop marked line"*. **He is right and this is the single most damaging
finding in the ledger:** it teaches a beginner to stop inside a junction.

---

### T4 · The kit has exactly one speed face (В26-50), so a 30 / 40 / 90 / 140 km/h street wears a "50" plate
**83 of 154 scenarios sit on a district whose posted limit is not 50**

`platform/public/sim/signs/` holds 18 GLBs and the only speed face is `sign_speed_limit_50.glb`;
`WorldProps.tsx:82-99` `SIGN_GLB` maps one speed kind (`limit50`) and `props.ts:424-429`
hard-codes it. The suppression guard at `props.ts:399-411` only fires on a *collinear zone drop
tail* (`touchingFar.length === 2`), a condition a single-edge street can never satisfy — so the
common case posts the lie, at `SCENARIO_SIGN_SCALE` prominence, making it the most legible object
on the map. Grading reads `tick.maxSpeedKmh` off the edge tag, so **sign says 50, detector says 40,
`SPEEDING_OVER_LIMIT` fires at 44** (`types.ts:1084` grace ratio 0.1, `:1088` grace max 5).

Already recorded in-tree as an inherited quirk:
`world/__tests__/ov-solid2-districts.test.ts:434-446` — *"its only limit face is `limit50` — so a
90 km/h road gets two „50" plates it should not have"*.

Worst instances: `sc-speed-zone` tells the student *«Ограничението тук е 30 км/ч, не 50»*
(`templates-sp.ts:484`) and bills `SPEEDING_DANGEROUS` for holding 50 while the only sign in the
world says 50. `mw-v1` posts "50" at the motorway spawn, exactly on the
`DRIVING_TOO_SLOW_FOR_MOTORWAY` threshold. `vu-child-v1` paints "30" on the tarmac and posts two
"50" plates on the kerb, on the same street.

**Founder** items 31, 33, 34, 36, 37, 47, 50. **Right on every one.**

---

### T5 · The only speed post on every junction micro-map stands 1 m BEHIND the spawn, facing away
**7 of 7 junction districts · 12+ scenarios**

`props.ts:412-429` places the entry plate `min(14, len·0.35)` m from the boundary dead-end and
yaws it to face the driver *entering* the district. Every scenario spawn sits 15 m from that same
dead-end — i.e. **1 m past the post, heading away from it**. Computed pairs: `tj-rhr-v1` sign
(0,−106) / spawn (0,−105); `tj-stop-v1` (0,−106)/(0,−105); `tj-emerge-v1` (0,−86)/(0,−85);
`tj-occluded-v1`, `jx-equal-v1`, `jxg-giveway-v1` (0,−116)/(0,−115); `sx-v1` east (106,0)/(105,0).

**Founder** items 31, 33, 34, 36 — *"no speed sign anywhere"*. He is describing a sign that is
physically behind his head.

---

### T6 · 58 parked car bodies sit INSIDE junction mouths, directly on the give-way sightline the student is graded on
**all 12 junction scenarios · 7 districts**

`traffic/TrafficLayer.tsx:236, 270-330` walks each edge's **untrimmed** geometry and starts
slotting bodies at `PARK_END_MARGIN_M = 11` m from the node, while the road ribbon is trimmed at
the junction mouth 27.125 m out (half-width 12.125 + corner 15). Slots at arc 11 / 17.6 / 24.2
land on the junction apron, where no carriageway is drawn. **The two layers use different
arclength frames.**

Bodies inside 27.125 m of a node: `tj-rhr-v1` 6, `tj-stop-v1` 6, `sx-v1` 8, `jxg-giveway-v1` 19,
`tj-emerge-v1` 6, `tj-occluded-v1` 6, `jx-equal-v1` 7 = **58**. Sightline from the graded yield
pose to the staged conflict car is blocked at perpendicular distances of 0.01 / 0.47 / 0.64 / 1.23
/ 1.72 m by ~4.5 m long, ~1.5 m tall bodies.

Second harm: it models parking **inside an intersection** — illegal under ЗДвП чл. 98 — as normal
street scenery in every junction lesson.

**Founder** item 13 — *"I can't see the car on the right because of the cars stopped on the
sidewalk"*. **Right, and the cars are not on the sidewalk; they are in the intersection.**

---

### T7 · `lineDistM: 18` borrowed the engine's conviction-core radius as a stop line, so the demonstrated-correct ghost stops 8.2 m PAST the painted line — and the witness release can then never fire from a lawful stop
**2 scenarios (sc-signal-dead = item 17, sc-signal-flashing = item 18), all rungs**

`templates-signals.ts:72` and `:211` author `lineDistM: 18`, which is `RHR_CORE_RADIUS_M`
(`runtime/worldRuntime.ts:317`), not the world's stop line at 27.725 m. The recorded shadow holds
0 km/h at `(4.06, −19.55)` for 8.0 s — 8.17 m **beyond** the line the world paints and the runtime
grades. At L1 the ghost car is on and the student follows it over the line
(`DEFAULT_LEVEL_AIDS[1].shadowCar`).

Same number, second harm: `PriorityFromRightRunner` releases the staged car only when
`playerLineDist = d − lineDistM ≤ 22` **and** the witness gate passes (`≤ 6` m or raw ETA `≤ 8` s,
`runners.ts:373-400`). A student who obeys instruction 4 and stops **at** the painted line sits at
`d ≈ 28-30`, so `playerLineDist ≈ 10-12`: the 6 m test fails, and at 0 km/h `rawEta = 10/0.5 = 20 s`
fails the 8 s test. The runner falls through to `cruise 0` and the car waits forever. Both faces of
his report — *"the traffic car crossed much quicker before I reach the crossroad"* and *"I let
everybody pass … but Error appeared that I made error"* — are this one number.

The same file contains the right number twice: `templates-signals.ts:486` and
`templates-signals2.ts:445` use `lineDistM 27.7`, and their shadows stop 3.3 m **before** the line.

> **Note for the fix wave:** `witnessArm` itself is a LANDED fix (commit `22f26d1`, 2026-07-20) and
> it works as designed. Do **not** rebuild the gate. It is defeated here purely by `lineDistM`.

---

### T8 · The green marker encodes neither the objective's acceptance radius nor its hidden speed cap, and has no "drive through" vs "stop here" vocabulary
**all 154 scenarios carry the marker; 177 speed-capped objectives across 127 scenarios are invisible contracts**

`guidanceRoute.ts:100-136` drops `params.radiusM` and `params.maxSpeedKmh`;
`RouteGuidance.tsx:64-65, 347-368` draws a fixed `PILLAR_RADIUS 1.0` cylinder with a 1.85 m ground
ring regardless of the objective. So:

* a student dead-centre on the ring at 20 km/h when the gate demands ≤5 km/h sees the marker pass
  under his bonnet and **nothing happens, with no on-screen reason**;
* a student 4.5 m to one side — half a perceptually-scaled 8.125 m lane — silently fails a
  radius-3.5 waypoint whose visible ring was 1.85 m;
* `sc-signal-hesitation`'s ring sits 7.3 m before the stop line, **inside** the 12 m
  `HESITATION_AT_GREEN` window (`rules/engine.ts:1412-1430`), so a student who reads the ring as a
  stop target commits the exact fault the lesson exists to grade.

`RouteGuidance` mounts for every lesson with objectives (`LessonScene.tsx:1175-1179`) and is **not**
gated on `aids.pathRibbon`, so this is live on L1–L5 of all 154.

**Founder** *«Another Major error I am stopping on top of the green cyrcle and nothing happens»*
(handwritten line 62), *«i crossed the green cyrcle we put and nothing happens after that»* (214),
item 19. **The trigger is strictly more forgiving than the drawn ring — so "I stopped exactly on
the circle" was never a tolerance problem. It is lateral exclusion or a hidden speed cap.**

---

### T9 · `sc-junction-scan` stages no traffic at all, yet its objective, teach copy and both mistake narrations assert a car approaching during the scan
**1 scenario — the family's flagship observation drill**

`SC_JUNCTION_SCAN` (`templates-junctions.ts:577-666`) has no `staged` array and no `traffic` on any
rung, so `SCENARIO_DEFAULT_TRAFFIC = {vehicleCount 0, pedestrianCount 0}` applies. The whole lesson
grades on `JUNCTION_SCAN_INCOMPLETE`, which reads only glance-keypress bookkeeping
(`engine.ts:1625-1634`) — never anything in the world. Its copy says the opposite four times:
`:582-583` *«вторият поглед наляво хваща колата, приближила, докато си гледал надясно»*, `:607`,
`:634` *«колата с предимство остана невидима»*, `:649`.

**Founder** item 12 — *"it asks the user to look left and right for traffic cars, but the road is
empty and there are no traffic cars moving at all on the map ever"*. **Verbatim correct.**

---

### T10 · `sc-pe-jaywalker` promises a green light the data delivers as RED for the entire plausible arrival window, and the red stall then destroys the jaywalk encounter
**1 scenario, 4 rungs**

No `signalPlan` and no `signalModes` are authored, so the live phase is the runtime clock.
`runtime/signals.ts:239` sets the cluster offset to `fnv1a(clusterId) % 50`. On `pe-jay-v1` the
junction `sx-n-c` and the signalized crossing `pej-x-1` are 34 m apart — inside `CLUSTER_LINK_M 40`
— so they merge into one cluster keyed `"pej-x-1"`, whose offset is 27 s. The NS axis is therefore
**RED for t = 0…21.9 s**. The player spawns 97 m from the stop line and arrives at t ≈ 9–18 s,
while instruction 2 says *«Светофарът за теб е зелен — премини кръстовището»*. `RED_LIGHT_CROSSED`
(опасна) is fully armed; at L4 it terminates the run.

Compounding: the staged walker releases at t ≈ 10 s and clears the carriageway at t ≈ 22 s —
exactly when the light turns. The student sits at a red he was told was green, watches her leave,
gets green, and drives through an empty crossing. **Nothing grades and nothing is taught.**

---

### T11 · `sc-pe-parked-row-scan`'s fault surface is INVERTED: the drill's own graded speed puts the car inside contact range of the child; illegal speeds clear it and grade nothing
**1 scenario, 5 rungs**

`triggerDistM 14` releases the child 14 m out and `ROW_ROAD_FROM_M 4.0` delays the on-road
occupancy flag by 1.54 s. Constant-speed closest-approach sweep at the L4 seeded trigger of
14.25 m: 18 km/h → 1.54 m clear; **20 km/h → 0.90 m HIT; 24 → 0.11 HIT; 30 → 1.17 HIT; 32 → 1.44
HIT**; 34 → 1.68 clear; 40 → 2.27 clear; 50 → 2.95 clear — and above 34 km/h `onRoadAtPass` is
false, so `PEDESTRIAN_NOT_YIELDED` cannot fire either. `PEDESTRIAN_CONTACT_M` is 1.5
(`runners.ts:58`). The objective's own cap is 32 km/h. Reaction + braking from 32 km/h is 14.5 m —
longer than the release distance.

**The obedient student is convicted of COLLISION (опасна + session terminate); the speeding student
is convicted of nothing.** Honest caveat: a student who brakes on the cue avoids contact — the
sweep assumes constant speed. The defect is that the **gradient runs the wrong way**.

---

### T12 · `sc-jx-blocked-exit`'s queue tail stands INSIDE the junction box, 11 m short of the far mouth its own copy says it stopped past
**1 scenario — but it is the entire premise of the drill**

`JXB_QUEUE_TAIL_Y = 16` (`templates-junctions4.ts:97`) with the comment *"just past the far mouth"*.
On `sx-v1` the far mouth is 27.125 m and the derived stop line 27.725 m — the file's own
`JX_STOP_LINE_Y` constant at `:78` states −27.73. So y=16 is **11.1 m short**: the tail car is
parked in the middle of the intersection. Instruction 2 (`:205`) tells the student *«опашката ѝ е
спряла веднага след отсрещния край»*. The lesson is "the exit is full, not the junction"; what is
rendered is a car blocking the junction.

---

### T13 · Teach copy names signs the map does not carry, and mis-cites one it does
**4 scenarios**

* `sc-junction-gap` (`templates-junctions2.ts:162-164`) and `sc-junction-left` (`:423-424`) name
  Б1 «Пропусни движението» inside lessons on `tj-emerge-v1`, which derives exactly one control —
  a stop sign — and zero give-way signs (`tj-junctions2-districts.test.ts:112-113` pins
  `signs.giveWay === 0`).
* `sc-jx-priority-confidence` (`templates-junctions3.ts:551-553`) names the «жълт ромб» priority
  diamond — `public/sim/signs/sign_priority_road.glb` exists on disk but has no `SignKind`, so it
  cannot be placed.
* `sc-ov-oneway` (`templates-lanes.ts:347, 396`) cites **В2** for what is **В1**. `content/signs/
  signs.json` is authoritative: В1 = «Забранено е влизането на пътни превозни средства» (the
  one-way mouth sign), В2 = «…в двете посоки». **The world is right and the copy is wrong** —
  `props.ts:329-372` correctly posts `noEntry` at the illegal west mouth.

**Founder** items 14, 16, 47.

---

### T14 · А1 / slippery / curve warning posts stand at the hazard's first metre instead of in advance of it
**4 scenarios**

`world/builders/zoneSigns.ts:129` places `waterPatch`, `icePatch` and `curveAdvisory` posts at
`zone.fromM` — the span START — while `railCrossing` at `:121-123` correctly uses
`RAIL_WARNING_AHEAD_M = 50`. Built positions: `sp-curve-v1` curve post at the arc start (220);
`ac-aqua-v1` slippery at the water start (240); `ac-ice-v1` at 210; `ac-bridge-v1` at 250. The
graded "slow down BEFORE" gates sit **upstream** of the only cue the world provides
(`sc-acq-before` y=225, `sc-acbi-before` y=235, `sc-aci-before` y=190).

This is why item 36 reads as *"no signs on the map at all"* even though the А1 does build: he
scans the approach and the post is at the corner.

---

### T15 · `sc-mw-emergency-lane` narrates a broken-down car that exists only in the recorded demo traces
**1 scenario, all 4 rungs**

`SC_MW_EMERGENCY_LANE` has no `staged` field; `mw-v1.json` contains two motorway edges, two
emergency-lane zones and spawn points. The template's own header admits it
(`templates-lanes.ts:981-984`): *"the live map hosts only the road."* Instruction 3 (`:1021`) and
the objective title (`:1028`) were written against the demo. Same class as his missing-sign family:
the lesson asks the student to react to an object the scene does not contain.

---

### T16 · The осева and the intra-direction lane dividers are painted identically, so no student can tell which line is which
**5 scenarios — every one of them a lane-discipline drill**

`markings.ts:743-751` loops every internal boundary `k = 1..lanes-1` and calls the **same**
`paintDashedLine(acc, offLine, DASH_WIDTH_M)`. On a 2+2 that yields three visually identical dashed
lines at −8.13, 0.00, +8.13 — the centre one separates **opposing** traffic, the outer two separate
same-direction lanes. The painter has no line-type concept outside `district.zones`.

Affected: `sc-ov-keep-right`, `sc-ov-crossing-overtake`, `sc-ov-ban-overtake`, `sc-ov-bus-lane`,
`sc-ln-decisive-change`.

**Founder** item 46 — *"no actual marking on the road showing which lane is which"*. This is the
half of his complaint that survives even on maps that DO have paint.

---

### T17 · Every lead vehicle is a `matchPlayer` rubber band, so the following drills grade the speedometer, not the gap — and the taught corrective action is physically impossible
**16 lead actors across 16 scenarios**

`traffic/staged.ts:438-442`: `target = playerSpeedMps + 0.55 × (gapM − gap)`, clamped to
`maxMatchSpeedMps`. `gap = gapM` is a stable fixed point: whatever the student does, the lead
mirrors it and the metric distance returns to the authored constant. `FOLLOWING_TOO_CLOSE`
(`engine.ts:1042-1049`) is a **time** gap, so with the metres frozen the fault is a pure function
of the speedometer. **Backing off does not open the gap; the lead slows to close it again.**

The counter-pattern already exists in the same file: `FTG_LEAD` (`templates-following.ts:867-868`)
uses `followGapM 150` against a ~95 m real gap precisely so the target always exceeds the cap and
the lead cruises independently — *"when the player eases off, the FRONT gap genuinely grows."*

**Founder** item 42 — *"the truck is seeing what the user car km/h is and is accelerating
proportionally… this is making the truck follow the user car"*. **His diagnosis is exactly right
and it generalises to 16 scenarios.**

---

### T18 · The pinned gaps are tuned so `FOLLOWING_TOO_CLOSE` fires at ordinary lawful speeds on four drills, and is unreachable on a fifth
**5 scenarios**

With the gap frozen, the fire speed is fully determined: `leadGapM < 0.35 × v[km/h]`, and
`leadGapM = followGapM − VEHICLE_LENGTH_M 4.1`.

| scenario | `followGapM` | graded gap | fires above | road posted | own gate cap |
|---|---|---|---|---|---|
| `sc-follow-distance` | 13 | 8.9 m | **25.4 km/h** | 50 | none |
| `sc-follow-truck` | 17 | 12.9 m | **36.9 km/h** | — | none on finish leg |
| `sc-fo-brakelight-chain` | 19 | 14.9 m | **42.6 km/h** | — | none on finish leg |
| `sc-ov-crossing-overtake` | 16 ±2 | 9.9–13.9 m | **~34 km/h** | 50 | 55 |
| `sc-fo-motorway-gap` | 76 | 71.9 m | **205 km/h** | 130 | governor caps at 150 |

`sc-follow-distance`'s instructions say *«Карай спокойно»* and its shipped shadow drives 26 km/h —
0.6 km/h of margin, a fact the template itself records at `:85-88`. Above each lead's
`maxMatchSpeedMps` the rubber band saturates and the gap closes monotonically to a graded
`COLLISION`.

**Founder** item 48 — *"I received an error I have been tailing him too close and in fact I
wasn't"*. **Confirmed with the arithmetic.**

---

## 3. The ledger — blocks-student (9)

### B1 · Ten scenarios have NO automatic finish at all
**10 of 154 · 6 roundabouts + 4 turn drills**

`lessons/finish.ts:142-154` returns a finish anchor only for `parkInBay`; every other
`completeManeuver` returns `null`, so `routeFinishZone` is `null` and `engine.ts:556` — the only
other terminator — can never fire. Driving to the end of any arm ends nothing.

`sc-ed-poligon-chain`, `sc-roundabout-entry`, `sc-maneuver-3point`, `sc-maneuver-uturn`,
`sc-mv-uturn-ban`, `sc-rb-exit-signal`, `sc-rb-circulate-priority`, `sc-rb-busy-gap`,
`sc-rb-lane-choice`, `sc-rb-ped-exit`.

**Founder** item 6 and the rephrased *"Lesson Never Finishes … The only solution was refreshing the
entire webpage."* **This is his single most-repeated complaint and it has an exact cause.**

---

### B2 · The route-finish rescue is disarmed on the FINAL objective
**platform-wide**

`engine.ts:556` consults the gate only while `currentIndex < objectives.length - 1`. A student
stranded on the last gate has no escape. Compounded by `objectives.ts:389-395`, which requires
`inZone && slowEnough` on the **same tick** — on the 0.15-grip ice and aquaplane marks a car that
overshoots by 5 m must reverse back into a 4 m circle or reload the page.

---

### B3 · The finish rescue inherits the terminal objective's deliberately lane-exclusive radius
**50 of 154 have a final objective radius below the 8.125 m lane pitch**

`finish.ts:131-137` copies the terminal objective's `x/y/radiusM/maxSpeedKmh` verbatim and
`routeFinishZone` only ever clamps the radius **down**. Templates choose radius 4–6 precisely so
the gate is satisfiable only from the right lane; the rescue inherits that exclusivity.

Guaranteed-unfinishable **after the scenario's own taught mistake**, 3 cases:
`sc-ln-boulevard-discipline` (final gate at x=12.19 r4 while the taught left-lane hog sits 8.13 m
away), `sc-ov-oneway` (final gate on the EAST arm while the taught `WRONG_WAY` mistake leaves the
car on the 140 m dead-end WEST arm, 250 m away), `sc-ln-decisive-change` (final gate r8 vs a lane
pitch of 8.125 — misses by 0.13 m).

---

### B4 · A blown speed-capped waypoint is unrecoverable and silently locks the next rung
**127 of 154 scenarios carry at least one; 177 capped objectives in total**

`reachZone` has no memory: pass through above the cap and it can never be satisfied again without
physically driving back. Objectives are strictly sequential. The route-finish gate then ends the
drive as FINISHED-but-NOT-PASSED. Because 128 of 154 templates author `rubric: { parTimeSec: N }`
and nothing else, `scoreRubric` has zero measured components, `rubric.ts:205` forces `stars = 1`
when `!completedAll`, and `progress.ts:19` `SCENARIO_UNLOCK_MIN_STARS = 2` — **so L2 stays locked.**

Window is `2 × radiusM = 16 m`; at 35 km/h that is 1.6 s. `toleranceScale` — the per-rung dial
`compile.ts:221` applies to every objective — is authored on **21 rungs out of 660**.

**Founder** global item 3 — *"it completely prevented me from continuing"*.

---

### B5 · Halt objectives are 3.5–5 m circles at ≤5–6 km/h, and the engine refuses any stopping position with a better sightline
**10 scenarios**

`sc-jxgb-yield` is `radiusM 4, maxSpeedKmh 6` at `(4.06, 118)` — the lawful stopping band is
anywhere `y < 122.275`, and the objective admits only the last 8 m of it. Worse, the sightline
from that forced pose to the conflict car is occluded by the T6 parked bodies at 0.86–1.72 m:
**the engine forces the one pose that cannot see.** Same shape: `sc-jxb-hold` (r4/≤5),
`sc-pesp-halt`, `sc-pnu-halt`, `sc-pzl-halt` (r4/≤5 each, 6 m short of the crossing), and the five
`sc-ac*-mark` gates on 0.15–0.4 grip.

**Founder** item 13 — *"if I don't stop on the green circle I can't do anything, I must do a
violation and go back to the green circle"*. **Right.**

---

### B6 · An unsignalled roundabout exit voids the traversal with no way out
**6 roundabout scenarios**

`lessons/objectives.ts:761-768`: leaving the ring past `exitRadiusM` without `tick.indicator ===
"right"` sets `entered = false; exitSignaled = false` — traversal void, redo. Combined with B1
(no finish anchor for a roundabout maneuver) there is **no termination path at all**: re-enter the
ring and redo it, or reload.

---

### B7 · `sc-sig-green-wave` is structurally unwinnable on Начинаещ
**1 scenario, every rung**

`governorCapKmh("beginner", 50) = 50 − 10 = 40 km/h`, while the district's wave is tuned to exactly
50 (`sig-wave-v1` `meta.scenario.wave = {speedKmh: 50, blockTravelSec: 19.01}`). At 40 km/h a block
takes 23.8 s, so the phase slips ~4.8 s per block and the second and third lamps cannot be caught.
Nothing refuses the tier and nothing tells the student why.

---

### B8 · Two scenarios cannot be completed unless the student overtakes — the safest legal choice is scored as a failure and locks the next rung
**2 scenarios**

`sc-ovcc-pass` (`templates-lanes2.ts:800`, reachZone at (300, 379.06) r4 on the **oncoming** bank)
and `sc-ovsr-pass` (`:1060`, (−2.5, 180) r5 on the oncoming bank) are mandatory success objectives
reachable only by committing the pass. A non-overtaking run hits `stars = 1` and the next rung
locks. **This directly inverts the CLAUDE.md north star: the lesson punishes the decision that
produces the safer driver.**

---

### B9 · Progress is hard-locked behind a rung the student may have failed on a false fault
**platform-wide**

`SCENARIO_UNLOCK_MIN_STARS = 2` + `stars = 1` when `!completedAll`. There is no
"continue anyway, come back later". Every false positive in section 2 therefore converts into a
progression wall.

**Founder** global item 3 — *"Users should always have the option to continue to the next lesson
immediately and return later."*

---

## 4. The ledger — breaks-lesson (17)

### L1 · The in-drive micro-quiz strips the sign artwork — every sign question in the simulator is unanswerable  ⚠ NEW, not in any auditor's set
**every sign-identification question the quiz trigger can pick**

`modules/sim/lessons/quiz-trigger.ts:50-64` — `MicroQuizOption` is `{ id, textBg }` and
`MicroQuizQuestion` has no `media` field. `app/(dashboard)/simulator/micro-quiz-actions.ts:72-79`
sanitizes the bank down to exactly those fields, **dropping `q.media` and `o.media`**, and
`components/sim/lesson-ui/MicroQuizOverlay.tsx:162` renders `option.textBg` alone. The theory
surface already does this correctly — `components/theory/QuestionMedia.tsx` has `SignFace` and
`hasSignOptions` over `/api/signs/<code>`. The data is truncated at the module boundary.

Result is exactly what he saw: *«Кой от показаните знаци ПРЕДУПРЕЖДАВА…»* followed by "Знак 1 /
Знак 2 / Знак 3 / Знак 4" and no pictures.

**Founder** — *"IN FACT MAJOR ERROR ANOTHER POP UP QUIZ APPEARED FOR SIGNS AND NO SIGNS ARE IN THE
MINI POP UP QUIZZES NO PICTURES OF them WE NEED MAJOR FIX"*. **Right. Four lines of type + one
render block + an interim guard that skips media questions until the render lands.**

---

### L2 · Traffic-light heads render at 1× on a 2.5×-exaggerated world while every sign beside them gets 1.5×, and a DARK head has no unlit read at all
**12 scenarios · 6 of 90 districts synthesise heads**

`props.ts:222` emits heads whenever `node.signalized && node.degree >= 3`, and it fires:
`sx-district.test.ts:87` pins `world.trafficLights.length === 8`. But **every** `signs.push` in
`props.ts` carries `...lessonSized` (the 1.5× `SCENARIO_SIGN_SCALE`) — `:287, :325, :364, :424` —
and the two `trafficLights.push` calls at `:229-234` and `:254-259` pass **no `scale`**.
`StaticTransform.scale` exists (`world/types.ts:227`) and `createOffsetInstancedMesh` explicitly
supports it *"so a scaled signal housing keeps its lenses registered"* (`three-helpers.ts:84-91`)
— **the plumbing was built and never wired.** Lens = `SphereGeometry(0.13)`; at the 76 m from
`sx-spawn-south` to the near head it subtends ~0.1°. In `dark` mode all three lenses are painted at
0.1× the on colour (`WorldProps.tsx:663-667`) — a near-black head on a dark pole.

**Founder** items 10, 17, 18, 19, 21, 29 — *"no traffic light exists at all"*. See §7 R1: he is
geometrically wrong and experientially right.

---

### L3 · No pedestrian signal head exists anywhere in the simulator
**1 scenario now; blocks a whole archetype family**

Repo-wide grep for `pedestrianSignal|pedSignal|pedestrianLight|walkSignal` in `modules/sim` returns
zero. Lamps are synthesised only from **road nodes** (`props.ts:221`), and a crossing is not a road
node (`network.ts:310`), so a `signalized: true` crossing gets no lamp for cars or pedestrians. The
`SignalController` **does** cluster signalized crossings for phase purposes, so the runtime believes
`pej-x-1` is signalized while nothing renders there. And `PedestrianDartOutRunner`
(`runners.ts:227-300`) never consults a phase at all — *"pedestrian on red" is narration, not
simulation.*

**Founder** item 29 — *"there must be traffic light for us to follow, but also a traffic light that
the pedestrian follows"*. **Correct on both counts, and neither exists.**

---

### L4 · The регулировчик is drawn at ordinary pedestrian scale, 2 of 3 controller scenarios still post him 27.7 m beyond the stop line, and no gesture-explanation bubble exists
**3 scenarios**

The officer is a staged pedestrian with pose `directTraffic` and gets the same hash-derived height
as any walker — `0.9 + (h&0xff)/255 × 0.22` on a scale-1 ≈ 1.73 m skeleton
(`TrafficLayer.tsx:115, :665`). On a 2.5×-exaggerated carriageway that reads at ~40% of expected
size. `SC_SIGNAL_CONTROLLER_EVENT.officer` was moved to `(0, −11)` with a comment quoting the
founder verbatim (`templates-signals.ts:458-479`), but `SC_SIG_CONTROLLER_LIVE_EVENT.officer`
(`templates-signals2.ts:440`) and `SC_SIG_CONTROLLER_POSTURES_EVENT.officer` (`:646`) are still
`(0,0)`. `TrafficLayer.tsx` contains no `Html`/label/bubble of any kind.

`sc-sig-controller-postures` is the worst case: its stated teach goal is *«разчети позата»* on a
figure the student cannot resolve at 27.7 m.

**Founder** item 20 — *"we spoke that we will make them bigger but I now see you have not done
that … each position must show some bubble stating what exactly he is pointing"*. **Right on all
three counts.**

---

### L5 · Guidance never looks ahead: the turn direction flips only after the student has committed into the junction
**8 of 12 junction scenarios, and every scenario whose exit is on a different arm**

The route is derived from `guidanceGoalFor(lesson, activeObjectiveIndex)` — a single point, no
look-ahead (`guidanceRoute.ts:100-135`). On `sc-junction-stop` the chain is approach (4.06,−45) →
passSignal (0,0) → exit (55,−4.06): while objective 2 is active the ribbon points **straight** up
the stem, and swings east only when objective 2 completes — which happens on the `stopLineCrossed`
event, i.e. the instant the nose passes the Б2 line. `TURN_WITHOUT_INDICATOR` is then billed on a
turn the guidance had not yet announced. The `RouteTurn` struct already exists
(`guidanceRoute.ts:70-85`); it is simply never fed from objective n+1.

**Founder** item 9 — *"the green line changes to right only after I cross the marking"*. **Right,
and it produces a false `TURN_WITHOUT_INDICATOR` on top of the confusion.**

---

### L6 · Staged NPCs have no indicator channel at all — the blinker is a cosmetic artefact of yaw rate and provably never arms during a lane-shift glide
**5 scenarios owe a signal**

`traffic/types.ts:110-125` — `TrafficVehicleState` has no `indicator` field and no `StagedCommand`
can set one. The renderer derives the lamp from motion: `TrafficLayer.tsx:881-887` computes
`yawRate`, `:971-974` arms the lamp only while `|steer| > 0.07`. A `laneShift` is a lateral glide
whose heading changes in a **single frame step**. For `sc-follow-cutin` (8.125 m over 1.5 s at
11 m/s) the step is 0.457 rad; at 60 fps the smoothed steer peaks at **0.0624 — below the 0.07
arming threshold**, and decays from there. The indicator never lights. At 30 fps it arms for ~2
frames ≈ 0.07 s, and the 0.55 blink duty puts that window in the lamp's OFF half 45% of the time.

The gap is already admitted in-tree for one instance (`templates-merging.ts:611-619`) while three
places in the same file assert the bus *«е подал ляв мигач»*.

**Founder** items 43, 44 — *"it is turning on the right signal very very very late"*. **He
understated it: the signal does not exist.**

---

### L7 · Conflict cars are released on a pure distance gate, so a student driving at the taught slow speed reaches an empty junction
**8 `priorityFromRight` specs of 13**

`PriorityFromRightRunner` commits the car the first tick `playerLineDist <= 22` unless the spec
authors `witnessArm`, which defers release until the player's ETA `<= etaSec` or they are within
`nearLineM`. `SC_JUNCTION_RHR_CONFLICT`, `SC_JX_GIVEWAY_CONFLICT` and
`SC_JX_EQUAL_RIGHT_CONFLICT` author none. Worked through for `sc-junction-rhr`: the car is fully
clear at ~6.1 s, while the player at the objective's own authored pace (`maxSpeedKmh 25`, and
instructions demanding *«намали отрано»* / *«приближи бавно»*) needs 5.8 s at 25 km/h, 9.6 s at
15 km/h, 14.4 s at 10 km/h. **If the student obeys instruction 4 and stops, the car crosses during
the stop.**

The fix already exists on the three specs in `templates-junctions2.ts`, patched by `22f26d1`;
`templates-junctions.ts` was last touched 2026-07-17 and never received that wave.

**Founder** items 8, 13, 15, 17, 18. **Right, and the fix is three lines copied from a sibling file.**

---

### L8 · A student who creeps under `minTriggerSpeedKmh` gets a pedestrian lesson with no pedestrian — and completes it clean
**all 12 `pedestrianDartOut` scenarios**

`runners.ts:243-247` arms the encounter only when `speedKmh >= minTriggerSpeedKmh`; `:239` then
silently cancels it once the player is past the crossing — no outcome, nothing to grade, no HUD
notice. The crossing objectives are `reachZone` with an **upper** speed bound and no lower one, so
crawling satisfies every gate, and `isPassing` returns true. **The student passes a чл. 119 drill
in which no pedestrian ever stepped onto the carriageway.** Thresholds are 6–10 km/h against graded
approach caps of 20–45, so the whole window below the trigger is a legal crawl.

---

### L9 · Pedestrians walk through parked cars — there is no pathfinding at all
**5 of 12 unambiguous ghost-throughs**

`runners.ts:174-190` stages the walker as a **2-point polyline**; `staged.ts:561-585` is pure arc
integration with no obstacle query, no collider and (unlike `updateStagedVehicle`) no avoidance.
Meanwhile `computeParkedCars` seats a body every 6.6 m at lateral offset **+10.125 m**, and the PE
walk runs x = −9.73 → +13.72, crossing 10.125 on **every** crossing scenario. Nearest-body
clearances: `pe-clear-v1` **0.2 m**, `pe-slow-v1` **1.4**, `pe-cane-v1` **1.8**, `pe-rain-v1`
**1.8**, `pe-bus-v1` **2.2 — and the walker's START is inside that body's footprint**;
`pe-jay-v1` 3.2, `pe-dart-v1` 3.6, `pe-child-v1` 5.6 clear. Parked half-length is ~2.25 m.

**The 8-for-8 correlation is the verification: the three that clear are exactly the three he did
NOT report ghosting on.** Second-order: the walk ends at x = 13.72, which is 1.69 m past the back
of the 3.5 m sidewalk, so the walker comes to permanent rest off the pavement.

**Founder** items 22, 23, 24, 28. Answer to his question: **there is no pathfinding to fix — the
walk is two authored points and the car is placed on top of them.**

---

### L10 · Night/rain drills never instruct the headlights while two headlight faults grade unconditionally, and the car always spawns dark
**34 of 154 scenarios compile a night/rain/fog condition without a lights instruction**

`scene/cabin.ts:183` initialises `headlights: "off"` regardless of `vehicleStart`;
`LessonScene.tsx:854` spawns "ready" but never touches the lamps. `engine.ts:857-866` arms
`HEADLIGHTS_OFF_AT_NIGHT` (**основна**) and `HEADLIGHTS_OFF_IN_RAIN` with no config gate.

Worst: `sc-ac-night-overdrive` instruction 1 states as fact *«Късите светлини са включени»* — a
false assertion of cockpit state — and the student then collects an основна fault that at L4 can
terminate the exam. `sc-crossing-rain-sprint` (night + rain, all rungs) has five instruction steps,
none about lights, and no lights code in `mistakes[]`. The correct counter-example is in the tree:
`sc-pe-night-unlit` instruction 1 says *«Провери, че късите светлини са включени»* and authors the
matching mistake demo.

**Founder** items 24, 41. **Right.**

---

### L11 · `sc-ac-wind-truck-pass` asks the student to overtake a truck the runner pins 60 m ahead of him forever
**1 scenario (+1 riding the same workaround)**

The rig is a `cutInLeadCar` (`paceAheadM 60`, `maxMatchSpeedMps 33`), used because
`BrakingLeadCarRunner.stage()` drops `actor.extraRightOffsetM` and cannot place a lead in `mw-v1`'s
cruise lane. The file admits it (`templates-conditions2.ts:677-688`): *"the rig PACES the player
and never physically falls behind — the overtake is not completed in world space."* Both success
gates complete without ever passing it. **The lesson scores a pass for an overtake that never
happened.**

---

### L12 · The empty world
**57 of 154 stage nothing at all · 74 stage exactly one actor · ambient traffic is 0 on all 660 rungs**

`traffic:` is authored on 6 of 154 templates, so `SCENARIO_DEFAULT_TRAFFIC = {vehicleCount 0,
pedestrianCount 0}` applies almost everywhere. The ambient pedestrian system
(`traffic/pedestrians.ts`, wired at `traffic/system.ts:186-201`) already populates around crossings
and is simply switched off by the scenario default. Copy promises crowds where one figure is
staged: `sc-crossing-bus-shadow` is titled «Пешеходц**И** иззад спрял камион» with one actor;
`sc-pe-school-patrol` says *«Изчакай ЦЯЛАТА група»* with one child; `sc-pe-zone-living` says
*«хората на платното»* with one walker.

**Founder** items 12, 18, 19, 22, 26, 33. **Right everywhere.**

---

### L13 · L1/L2/L3 compile to the same lesson; L4 adds only exam mode and a cold start; 106 of 154 have no L5
**154 of 154 · 660 rungs**

`compile.ts:180-262` — an empty rung `{ level: n }` contributes nothing. Of 660 authored rungs,
only **21** carry `toleranceScale`, **26** `stagedAdd`, **16** `physics`, **6** `traffic`. **105 of
154 scenarios have no rung delta of any kind.** The only differences are `DEFAULT_LEVEL_AIDS`
(L1 shadow+ribbon+hints+pauseOnError, L2 ribbon+idle hint, L3 nothing) and `examMode` at L4.
Structurally, `LevelSpec` has **no rubric field**, so "L3 grades tighter than L1" is not
expressible in the type system, and `params.ts:79-95` applies `toleranceScale` to `parkInBay`
tolerances **only** — never to a `reachZone` radius or speed cap.

**Founder** — *"L2 L3 L4 L5 They have Nothing More"*, *"L5 is completely dead"*. **Literally
accurate.** One correction: `ScenarioCatalog.tsx:148` renders only authored rungs, so for the 106
without an L5 he was not clicking a dead button — no tile exists.

---

### L14 · The desktop toast stack is not dismissible and stacks up to four 288 px cards
**platform-wide, roomy layouts only**

`HudToasts.tsx:161` renders the whole column `pointer-events-none`; every card at `:84, :114, :132`
is `pointer-events-none w-72`; `useHudToastQueue` at `:55` slices to `MAX_VISIBLE` and expires each
on a TTL. The compact/mobile path was fixed by the overlay wave (`LessonPlayShell.tsx:2090` —
`compact ? null : <HudToasts/>`), but **the desktop path he reviewed on is unchanged**: no
click-to-dismiss, no size reduction, no user setting. See §6 for what *was* fixed.

**Founder** global item 6.

---

### L15 · The end-of-lesson screen has no Space-to-skip and no "don't show this again"
`SessionEndScreen.tsx` registers no keyboard handler at all. `SimOverlay.tsx:183` does implement
Space/Enter acknowledgement — for overlay items, not for the session-end debrief.
**Founder** global item 2.

---

### L16 · There is no rear-view mirror in the chase view; Q/E only nudge the camera
**Founder** items 44, 45. He is describing a lesson (`sc-follow-tailgater`) whose entire subject is
a vehicle he structurally cannot see. `modules/sim/engine/reverseView.ts` exists for reverse; there
is no forward-driving rear window.

---

### L17 · The governor contradicts the lesson's own target speed
`DOMAIN_CAP_FLOOR_KMH = 30` (`vehicle/difficulty.ts:196`) bites on low-limit maps (the полигон) —
his item 5. Separately `sc-mw-discipline` instructs "stay below 125" on a map whose Нормален cap is
`domain + 10`; his item 37 says the lesson ends before he can accelerate. Same class as B7.

---

## 5. The ledger — degrades (12) and cosmetic (2)

| id | defect | scope | founder |
|---|---|---|---|
| **D1** | The 7 PE crossing maps are one generator with one parameter (`approachM`). All identical: 2 nodes, 1 edge, 1 zebra, 1 corner shop, 2 spawns. 9 of 12 PE scenarios sit on 7 copies of one street. **He is right about the map and wrong about the behaviour** — pace 0.75–2.6 m/s, release 26–56 m and cap 32–40 km/h do differ and do change the drill from patience to reaction. | 9 | 25, 26, 27, 28 |
| **D2** | Plural copy against a singular staged actor | 3 | 22, 26 |
| **D3** | Objective titles promise acts the gates do not measure: `sc-ovn-wait` «Изчакай» at `maxSpeedKmh 30` (its sibling on the same map uses 6); `sc-sgw-tl1/tl3` tick «Премини НА ЗЕЛЕНО» for a run that crossed on red (no `requireRedMet`) | 4 | 49 |
| **D4** | Hidden speed contracts: `sc-ovbo-hold` `maxSpeedKmh 75` on a road posted 90, solved for one specific drive speed; nothing in the HUD says 75 | 1 | — |
| **D5** | Four finished sign GLBs ship with no `SignKind` (`sign_pedestrian` А18, `sign_priority_road` Б3, `sign_settlement` Д11, `sign_service_fuel` Е7). The blue Д4 one-way plate does not exist at all | 0 direct | 47 |
| **D6** | No builder pass posts a sign at a mid-route limit change — `props.ts:383` iterates `network.deadEnds` only, so degree-2 transition nodes are structurally unreachable. `sc-sp-limit-end`, whose entire subject is the SCOPE of В26, ships with zero В26-40 posts and zero end plate | 3 | 31, 34 |
| **D7** | Rubric cannot vary by rung; 128 of 154 have `parTimeSec`-only rubrics, so `scoreRubric` has no measured component anywhere | 128 | — |
| **D8** | `sc-sp-wet-limit-plate` has nothing to fail at L1/L2 (dry, no actor, no cap) and `mistakeExperience.ts:53-68` compiles its rain-only fault onto that dry L1 | 1 | 3 |
| **D9** | The pre-drive lesson is 13 keyboard steps. Cockpit hotspots **do** exist and **are** mouse-clickable (`VitokCockpit.tsx:1554-1670`, `onPointerDown` at `:1659`) — but only in the cockpit camera and only as an alternative, never as the taught path | 1 | brief §Lesson 1 |
| **D10** | `PARKED_CLEAR_ZONES` is a per-template allowlist with exactly one entry (`sc-junction-stop`); `sc-junction-scan` and `sc-junction-gap` have the ghost line 0.84 m inside a car body | 2 | R3 #12/#14 |
| **D11** | Parking depth: 12 of 154 scenarios; the briefing promises two tasks and delivers one | 12 | brief §Parking |
| **D12** | `sc-ov-narrow`'s `FAILED_TO_YIELD` has two escape paths (brake-dab `standDown` within 3.0 s, sub-6 km/h squeeze). **UNVERIFIED** — needs a headless sweep, do not tune blind | 1 | 49 |
| **C1** | Rain renders bright/sunny, so headlights make no visible difference. **UNVERIFIED** — needs an R0 look-before-ship capture | ~14 | 41 |
| **C2** | Child and officer meshes are placeholder-quality | 4 | 20, 27 |

---

## 6. Already fixed — do NOT send the fix wave to redo this

The mobile wave landed hours before this ledger (`b7578a8`, `2b41b4f`, `efa412a`, `bb2fbff`,
`c14a216`, `265629d`, `7d6ea2a`). Checked, item by item:

| founder item | status | evidence |
|---|---|---|
| **Global 6 — notification spam, on mobile** | **FIXED** | `modules/sim/hud/overlayQueue.ts` — one overlay at a time, queued and counted, `OVERLAY_PEEK_MAX_FRACTION = 0.12`, never inside the centre band. `LessonPlayShell.tsx:2090` routes compact layouts into it. `SimOverlay.tsx:183` gives Space/Enter acknowledgement and `:290/:303` click-to-open/acknowledge. **The desktop path is NOT fixed — see L14.** |
| **"lesson never finishes" — the stalled-objective case** | **FIXED** | `lessons/finish.ts` (2026-07-28, `fe19240`) + `engine.ts:539-575`. Verified to yield a usable zone for every scenario whose terminal objective is a `reachZone`. **The residuals are B1 (no anchor for a maneuver), B2 (disarmed on the final objective) and B3 (inherited radius) — three different causes.** |
| **`witnessArm` conflict timing** | **FIXED where authored** | commit `22f26d1`, 2026-07-20. Works as designed. The 8 specs that lack it (L7) and the 2 defeated by `lineDistM` (T7) are the residual. **Do not rebuild the gate.** |
| **Scene opens in the wrong tier / engine off after a mode switch** | **FIXED** | `bb2fbff` "every scene opens at Нормален"; `c14a216` "a manual ready start is NEUTRAL". His global item 4. |
| **13-step pre-drive on every scenario** | **FIXED for scenarios** | `265629d` "scenes spawn ready to drive — the seatbelt is the only item left". Still live for the dedicated Урок 1 (D9). |
| **"Press Q for Left View" ping** | **ALREADY BUILT** | `components/sim/lesson-ui/GlanceEdgePings.tsx` — two soft pulsing «огледай» cues that fade into a ✓ when the graded glance registers. He did not see them because `glancePingsEligible` requires `ruleConfig.junctionScanObservationEnabled === true` **and** the Съветник setting on, and it renders L1–L2 only. **The fix is coverage and discoverability, not a new feature.** |
| **Mouse-clickable dashboard** | **PARTLY BUILT** | Named raycast hotspots per doc 69 exist and work: `VitokCockpit.tsx:1514-1670`, hover glow + `onPointerDown`. Only in cockpit camera. |
| **Dashboard backdrop / mobile canvas / iPhone crash** | **FIXED** | `7d6ea2a`, `fe19240`, `b7578a8`. |

---

## 7. Where he is wrong — with the evidence

He asked for the truth. Six of his observations are refuted.

**R1 — "There is no Б2 / Б1 sign, no traffic light, no centre line on the junction maps."**
They are all built. Signs and lights are **not stored in the district JSON**; they are synthesised
at build time. `props.ts:270-308` derives Б2/Б1 from `junctionPriorityControls`; `props.ts:221-263`
places two heads per approach on every signalized node. Pinned in the tree:
`tj-districts.test.ts:98-108` — `world.stats.signs.stop === 1`, at x 8–10, y ≈ −28.5, yaw ≈ 0
(facing the northbound driver), scale ≥ 1.3. `jxg-districts.test.ts:94` — `signs.giveWay === 4`.
`sx-district.test.ts:87` — `world.trafficLights.length === 8`. Every district correctly has **zero**
signs where the lesson says the junction is equal (`tj-rhr-v1`, `tj-occluded-v1`, `jx-equal-v1`).
*What he actually experienced is T2, T3, T5 and L2:* the only speed sign is behind him and lies, the
Б2 is real but its green marker points 27.7 m past it, and the lamp head is 1× on a 2.5× world.
**Do not open work items titled "add the missing Б2/Б1/light".**

**R2 — "The map again has the 4 roundabouts."**
Six districts contain roundabouts and **every one of them contains exactly one ring**:
`d2-v1`, `district-v1`, `rb-2lane-v1`, `rb-mini-v1`, `rb-ped-v1`, `rb-single-v1` — 6 rings in 90
districts. He is almost certainly reading the four **arms** of a four-arm mini-roundabout, or the
four apron quadrants, as four roundabouts. His *other* roundabout complaint — that the geometry does
not read as a proper roundabout — is a live design question and is not refuted.

**R3 — "The R-reverse warning shouldn't be there in automatic mode."**
In the sim's automatic mode the selector is still **P-R-N-D** (`vehicle/driveline.ts:49`,
`driveline.test.ts:62-121`), exactly like a real automatic gearbox, and reversing into a bay
requires selecting R. **The prompt is correct.** The only legitimate complaint is that it reads
like a manual-gearbox instruction; a copy pass can make it say «Премести лоста на R» instead.

**R4 — "L5 is offered everywhere and it's dead."**
Half right. `ScenarioCatalog.tsx:148` iterates `spec.levels`, so **106 of 154 scenarios show no L5
tile at all** — he was not clicking a dead button on those. Where L5 *does* exist (48), his verdict
holds: only 16 rungs across the whole catalog author `physics`, and several L5s are documented
in-tree as render-only.

**R5 — "L2 L3 L4 L5 have nothing more."**
Right about L2/L3 and right about the dead L5s, but **L1→L2→L3 does differ**: L1 has the shadow car,
the path ribbon, follow hints and pause-on-error; L2 keeps the ribbon and a 20 s idle hint; L3 has
neither. L4 adds exam protocol and a cold engine. The genuinely inert pairs are **L2/L3** and the
**L5s that only change weather**.

**R6 — "I stopped exactly on the green circle and nothing happened — the tolerance is too tight."**
The trigger is strictly **more forgiving** than the drawn marker: the visible ring is a
`ringGeometry` of outer radius ≈ 1.85 m (`RouteGuidance.tsx:65, :360`) against a 4–12 m trigger. It
was never tolerance. It is one of three other things: a hidden `maxSpeedKmh` the marker does not
show (T8), lateral exclusion from a radius smaller than the lane pitch (B3), or a still-active
earlier objective holding the sequential chain (B4). **Widening the radius alone will not fix it.**

---

## 8. The projection — what the remaining 104 carry

He has seen catalog positions 1–50. Here is what positions **51–154** contain, measured, so he does
not have to play them to find out.

| defect class | all 154 | he saw (1–50) | **UNSEEN (51–154)** |
|---|---|---|---|
| **T1** district paints zero lane lines → the осева fault is a lie | 90 | 29 | **61** |
| **T1b** district has ≥1 unmarked two-way multi-lane edge | 119 | 41 | **78** |
| **T2** spawns ON the centreline → instant `CENTER_LINE_TOUCHED` | 31 | 19 | **12** |
| **T3** `passSignal` marker authored at the junction node | 9 | 5 | **4** |
| **T4** district posts a limit ≠ 50 → the В26-50 plate lies | 83 | 28 | **55** |
| **T8/B4** carries ≥1 speed-capped `reachZone` (invisible, unrecoverable) | 127 | 47 | **80** |
| **B1** terminal `completeManeuver` ≠ `parkInBay` → no finish at all | 10 | 1 | **9** |
| **B3** final objective radius below the 8.125 m lane pitch | 50 | 8 | **42** |
| **B5** final objective radius < 5 m | 42 | 7 | **35** |
| **L10** night/rain/fog condition with no lights instruction | 34 | 6 | **28** |
| **L12** zero staged actors | 57 | 18 | **39** |
| **L12b** exactly one staged actor | 74 | 27 | **47** |
| **L13** no L5 authored | 106 | 39 | **67** |
| **L13b** no rung delta of any kind (all rungs bare) | 105 | 37 | **68** |
| **D7** rubric is `parTimeSec`-only | 128 | 46 | **82** |
| districts with a signalized node at all (L2/L3 exposure) | 19 | 8 | **11** |
| ≥2 staged actors (the only scenarios with real traffic) | 24 | 5 | **19** |

**Read it this way.** He found the defect rate he found because it is the real rate. The unseen 104
carry **more** of almost every class than the 50 he played, because the later waves reused the same
generators and the same bare rung ladders. Two classes are *worse* in the tail: **B1** (9 of the 10
no-finish scenarios are unseen — the roundabout and turn families sit at 51+) and **B3/B5** (42 and
35 of the tight terminal radii are unseen). **If he plays lessons 51–154 today he will hit a
hard progression block roughly every eleven lessons.**

---

## 9. The fix plan — 15 lanes, partitioned by file ownership

Lanes are **parallel**. The wave number is the earliest wave a lane may start given its
dependencies. No two lanes own the same file. Every lane states what it must NOT touch.

### Wave 0 — measurement first (1 lane)

**Lane 0 · THE GATE (report-only)**
*Owns* `platform/src/modules/sim/world/__tests__/world-referent.gate.test.ts` (new),
`platform/src/modules/sim/world/referents.ts` (new), `platform/src/modules/sim/world/__tests__/
expected-failures.json` (new).
*Closes* nothing yet — it **prints** the whole ledger as a machine-checked baseline so every other
lane can see its own progress.
*Gate* the file runs green in report-only mode and its printed failure count matches this document
(±0 for T1/T2/T3/T4, since those are exactly counted here).
*Must NOT touch* anything else. Read-only over the whole tree.

### Wave 1 — stop teaching falsehoods (5 lanes, fully parallel)

**Lane 1 · PAINT & LANE TRUTH**
*Owns* `world/builders/constants.ts`, `world/builders/markings.ts`, `runtime/spatial.ts`,
`runtime/locator.ts`, `rules/engine.ts` **lines 900–950 and 1095–1110 only**, `rules/types.ts`.
*Closes* **T1, T16**, and half of T2.
*Does* (a) add `residential`, `unclassified`, `living_street` to `MARKED_CLASSES` — Bulgarian
residential streets are marked, so this is also the correct render; (b) paint the centre boundary
(`off ≈ 0`) as solid/double М1 and same-direction dividers as dashed М3 inside the existing loop at
`markings.ts:743`; (c) publish `tick.centreLinePainted` / `tick.laneLinesPainted` from the same
class+zones decision the painter makes, and gate `centerLineCond`, `offCentre` and `hoggingLeft` on
it, exactly as `CROSSED_SOLID_LINE` is already gated on `tick.solidCenterLine`; (d) add a
junction-interior stand-down.
*Gate* `npm run test -- world` with the marking-count goldens re-baselined (≈40 districts move) +
`lane-arrows-markings.test.ts:181` re-baselined + the new paint-vs-code assertion in Lane 0's gate
flips green for all 90 scenarios.
*Must NOT touch* any `templates-*.ts`, any `content/world/*.json`, `guidanceRoute.ts`.

**Lane 2 · GUIDANCE GEOMETRY**
*Owns* `modules/sim/scene/guidanceRoute.ts`, `components/sim/RouteGuidance.tsx`.
*Closes* **T3, T8, L5**.
*Does* (a) resolve a `passSignal` marker to the approach's **stop line** from the runtime
(`worldRuntime.debugStopLines`) instead of trusting `params.x/y` — this fixes all 9 at once and
makes the class of defect unauthorable; (b) carry `radiusM` and `maxSpeedKmh` into `GuidanceGoal`
and size the ground ring to the real radius; (c) give the marker two affordances — a THROUGH gate
the ribbon passes vs a STOP bar with a «спри тук» glyph — keyed off whether completion needs a
halt, plus a live "too fast" tint; (d) feed `RouteTurn` from objective **n+1** so the upcoming turn
renders before the current waypoint is reached.
*Gate* new `guidance-geometry.test.ts`: for every scenario × rung, the marker is on the **approach
side** of every graded stop line within its radius, and the rendered ring radius equals the
objective radius.
*Must NOT touch* `templates-*.ts`, `rules/engine.ts`, `lessons/`.

**Lane 3 · SIGN KIT & PLACEMENT**
*Owns* `tools/blender/signs.py`, `tools/blender/signs_v2.py`, `platform/public/sim/signs/*`,
`world/types.ts` (`SignKind`), `world/components/WorldProps.tsx` (`SIGN_GLB`),
`world/builders/props.ts`, `world/builders/zoneSigns.ts`.
*Closes* **T4, T5, T14, L2, D5, D6**.
*Does* (a) author В26-{20,30,40,60,70,90,140} + В33 end-of-restriction from the existing
parametrised `v26.svg` numeral, plus Д4 one-way; (b) derive the plate **face** from
`ap.edge.maxspeed` and place **nothing** when the kit has no face — delete the `isDropTail` hack
entirely; (c) skip a dead-end entry post whose position lands within 25 m of a spawn on the same
edge, and place it 25–40 m **ahead** of the spawn instead; (d) new pass: post a plate at any
degree-2 node whose adjacent edges differ in `maxspeed`, and В33 where the limit rises; (e) give
`slippery`/`curve` the advance offset `railCrossing` already has; (f) **spread `...lessonSized`
into both `trafficLights.push` calls** and give the `dark` state a visible unlit read; (g) map the
four orphan GLBs (А18/Б3/Д11/Е7) and place А18 off `district.crossings`, Д11 at district entry.
*Gate* new `sign-truth.test.ts`: **no sign placement may state a limit different from the
`maxSpeedKmh` the reducer grades on that edge**, over all 90 districts; plus per-district sign
census assertions extended from `pe-districts.test.ts`.
*Must NOT touch* `rules/`, `lessons/`, `templates-*.ts`.

**Lane 4 · SCENERY & OCCLUSION**
*Owns* `traffic/TrafficLayer.tsx`, `scene/scenarioSceneryProps.ts`.
*Closes* **T6, L9 (the collision half), D10**.
*Does* (a) measure the curb walk against the **junction-trimmed** ribbon (`EdgeBuild.trimFrom/
trimTo`) instead of raw geometry — that removes all 58 apron bodies and makes чл. 98 true;
(b) derive clear zones from `district.crossings[]` inside `computeParkedCars` so no body sits on a
zebra — one rule kills the pedestrian ghost-through on all 90 districts; (c) delete
`PARKED_CLEAR_ZONES` entirely once (a) and (b) land.
*Gate* new `scenery-sightline.test.ts`: from every graded yield pose, the ray to every staged
conflict actor clears every parked body by ≥ 2.0 m; and no parked body's footprint intersects any
`district.crossings` rect or any committed trace sample.
*Must NOT touch* `rules/`, `lessons/`, `orchestrator/runners.ts`, `traffic/staged.ts`.

**Lane 5 · MICRO-QUIZ MEDIA (hotfix)**
*Owns* `modules/sim/lessons/quiz-trigger.ts`, `app/(dashboard)/simulator/micro-quiz-actions.ts`,
`components/sim/lesson-ui/MicroQuizOverlay.tsx`.
*Closes* **L1**.
*Does* add `media` to `MicroQuizQuestion` and `MicroQuizOption`, carry `q.media`/`o.media` through
the sanitizer, and render with the existing `SignFace` / `hasSignOptions` from
`components/theory/QuestionMedia.tsx`. **Interim guard in the same commit:** if the render is not
ready, skip any bank item carrying media so the quiz never asks about a picture it will not show.
*Gate* a test asserting that every question the bank can serve either has no media or renders it.
*Must NOT touch* the theory runner, `content/questions/**`.

### Wave 2 — unblock the student (3 lanes)

**Lane 6 · FINISH & PROGRESSION**
*Owns* `lessons/finish.ts`, `lessons/engine.ts`, `lessons/objectives.ts`,
`scenario/rubric.ts`, `scenario/progress.ts`.
*Closes* **B1, B2, B3, B4, B5 (engine half), B6, B9**.
*Does* (a) give `finishAnchor` a zone for **every** terminal maneuver, not just `parkInBay`
(roundabout → the exit arm; three-point turn → the finished pose); (b) drop the
`currentIndex < objectives.length - 1` guard at `engine.ts:556` and instead skip the rescue only
when the terminal objective has already completed — safe by construction, because `stepFinishGate`
refuses to trip until the car has been observed **outside** the zone once and then dwells;
(c) floor the rescue radius at one lane pitch (8.125 m) **before** the half-distance clamp, so a
car in any lane at the route's end trips it while the objective keeps its strict radius and still
records as not-done; (d) make a `reachZone` with `maxSpeedKmh` **latching** on the slowest speed
observed inside the zone, so one fast frame cannot permanently void it; (e) add a
`stopBeforeLine` objective kind that tests "stationary on the approach side of stop line X" instead
of a circle; (f) make an unsignalled roundabout exit a graded fault, not a silent traversal reset;
(g) add "continue anyway, come back later" — decouple `SCENARIO_UNLOCK_MIN_STARS` from linear
progression so a failed rung never walls the catalog.
*Gate* the **completability battery**: for every scenario × every authored rung, and for every k,
a synthetic drive that deliberately blows objective k must still terminate within par + 60 s. 660
rungs × (k+1) drives, headless.
*Must NOT touch* `templates-*.ts`, `guidanceRoute.ts`, `rules/engine.ts`.

**Lane 7 · ACTOR BEHAVIOUR**
*Owns* `orchestrator/runners.ts`, `traffic/staged.ts`, `traffic/types.ts`, `traffic/system.ts`.
*Closes* **L6, L7 (engine half), L8, L11, T17 (engine half)**.
*Does* (a) add `indicator?: "left"|"right"|"off"` to `TrafficVehicleState`, a `setIndicator`
`StagedCommand`, and assert it **3 s before** the glide in the cutIn/laneShift runners (the exam's
own «своевременно»); (b) add a **scheduled-cruise** mode to `BrakingLeadCarRunner` — a fixed speed
profile along the actor's own arc, independent of the player, with the existing `playerGuard` as
the only coupling; (c) forward `actor.extraRightOffsetM` in `BrakingLeadCarRunner.stage()`;
(d) release on distance + `approaching()` rather than `minTriggerSpeedKmh`, and when an encounter
really is cancelled, mark the crossing objectives **incomplete** so the debrief says «тази ситуация
не се случи» instead of awarding a pass; (e) widen `leadGapFor` to the actor's own profile length.
*Gate* the **encounter battery**: for every staged actor, a synthetic drive at the objective
chain's max permitted speed **and** at half of it must both meet the actor un-cleared; and every
lane-shift actor must show its indicator ≥ 2.5 s before the first lateral metre.
*Must NOT touch* `traffic/TrafficLayer.tsx` (Lane 4 owns it — Lane 4 reads the new `indicator`
field once Lane 7 lands it), `rules/`, `lessons/`.

**Lane 8 · VEHICLE, GOVERNOR & CABIN STATE**
*Owns* `modules/sim/vehicle/difficulty.ts`, `components/sim/VehicleRig.tsx` (cap threading only),
`modules/sim/scene/cabin.ts`, `components/sim/CameraRig.tsx`.
*Closes* **B7, L16, L17, and the engine half of L10**.
*Does* (a) floor the tier cap at the lesson's own declared required speed when a template publishes
one (`meta.scenario.wave.speedKmh`), and refuse/warn a tier that cannot drive the lesson;
(b) raise the motorway domain so a 125 km/h instruction is reachable; (c) initialise `headlights`
to `"low"` when the compiled environment carries night/rain/fog **and** `vehicleStart === "ready"`
— explicitly **not** for `sc-ac-night-lights`, `sc-ac-rain-lights`, `sc-ac-fog`, whose whole
subject is switching them on; (d) add the 10%-of-screen rear-view window on Q/E/F in chase view.
*Must NOT touch* `rules/engine.ts`, `templates-*.ts`.

### Wave 3 — per-family template truth (3 lanes, one per file group)

**Lane 9 · JUNCTIONS & SIGNALS DATA**
*Owns* `templates-junctions.ts`, `-junctions2.ts`, `-junctions3.ts`, `-junctions4.ts`,
`templates-signals.ts`, `-signals2.ts`, `templates-speed.ts`, and the matching
`content/traces/**` re-records.
*Closes* **T7, T9, T12, T13 (junction half), L4 (the two un-fixed officer posts), L7 (data half),
D3 (the `requireRedMet` half), B5 (data half)**.
*Key edits* `lineDistM 18 → 27.7` in `SC_SIGNAL_DEAD_CONFLICT` and `SC_SIGNAL_FLASHING_CONFLICT`
(+ 6 trace re-records); `witnessArm: { etaSec: 8, nearLineM: 6 }` on the three specs that lack it,
copied verbatim from `templates-junctions2.ts:74`; stage the car `sc-junction-scan`'s copy promises;
`JXB_QUEUE_TAIL_Y 16 → 34` and `sc-jxb-cross → 46`; officer to `(0,−11)` on the two remaining
specs; qualify the Б1 copy; retitle the two green-wave objectives or add a lamp gate.
*Gate* family trace re-record + zero-violation shadow replay + Lane 0's gate green for the family.

**Lane 10 · PEDESTRIANS & VRU DATA + DEPTH**
*Owns* `templates-pe.ts`, `-pe2.ts`, `templates-vru.ts`, `-vru2.ts`,
`tools/maps/gen_pe_crossings.mjs`, and the **new** `content/world/pe-*` districts it generates.
*Closes* **T10, T11, L10 (pe half), D1, D2**, and carries the **pedestrian-variety content
deepening**.
*Key edits* author `signalPlan` on `sc-pe-jaywalker` and retime the walker against the pinned
green; `triggerDistM 14 → ≥22` and `ROW_ROAD_FROM_M 4.0 → 1.6` on `sc-pe-parked-row-scan` + 2 trace
re-records; a lights step and a `HEADLIGHTS_OFF_AT_NIGHT` mistake on `sc-crossing-rain-sprint`.
*Deepening* `gen_pe_crossings.mjs` takes real per-archetype parameters, not just `approachM` — a
stopped-truck occluder for PE-10, a parked row for PE-04, an unlit block for PE-09, a bend before
the zebra, a bus bay, a mid-block crossing with a refuge island. Then **2–4 staged figures with
staggered `triggerDistM`** on every crossing whose copy promises a group, plus a non-zero
`traffic.pedestrianCount` so the pavements are not empty.
*Gate* the closest-approach invariant (§10 S5) + one R0 capture per new district.

**Lane 11 · LANES, FOLLOWING, CONDITIONS & SPEED DATA**
*Owns* `templates-lanes.ts`, `-lanes2.ts`, `-lanes3.ts`, `templates-following.ts`, `-following2.ts`,
`templates-conditions.ts`, `-conditions2.ts`, `templates-sp.ts`, `templates-speed2.ts`.
*Closes* **T15, T17 (data half), T18, B8, D3 (the `sc-ovn-wait` half), D4, D8, L10 (ac/sp half),
T13 (the В1/В2 copy fix)**.
*Key edits* re-tune every `followGapM` so the fire threshold sits **above** the map's posted limit
(`sc-follow-distance` 13 → ≥22, `sc-fo-motorway-gap` 76 → ~50); switch the four gap-drills off
`matchPlayer` onto Lane 7's scheduled cruise; stage the stalled car on `sc-mw-emergency-lane`;
demote `sc-ovcc-pass` / `sc-ovsr-pass` from required objectives to rubric bonuses;
`sc-ovn-wait maxSpeedKmh 30 → 6`; surface the 75 km/h ceiling on `sc-ov-being-overtaken`; make
`sc-sp-wet-limit-plate`'s L1 the wet rung; В2 → В1 in two strings.

### Wave 4 — depth (4 lanes)

**Lane 12 · THE LEVEL SEAM** — *owns* `scenario/types.ts`, `scenario/compile.ts`,
`scenario/params.ts`. *Closes* **L13 (seam), D7**. Adds `physics` and a **rubric override** to
`LevelSpec`, applies `toleranceScale` to `reachZone` radii and caps (not just `parkInBay`), and
gives `compileScenario` a level-derived default ladder so a silent rung still scales traffic and
tolerance from `level`. *Gate* golden compile snapshots re-baselined + **S4 rung-distinctness**
turns from report-only to enforcing.

**Lane 13 · RUNG AUTHORING, remaining families** — *owns* `templates-roundabout.ts`, `-roundabout2.ts`,
`templates-rail.ts`, `-rail2.ts`, `templates-merging.ts`, `-merging2.ts`, `templates-hazards.ts`,
`-hazards2.ts`, `templates-cockpit.ts`, `-cockpit2.ts`, `templates-maneuver.ts`,
`templates-flow.ts`, `templates-exam.ts`, `templates-reels.ts`. Authors real L2–L5 deltas for the
104 unseen scenarios using the seams Lane 12 lands, and adds a real staged conflict at every
junction in the family (**realistic traffic at every junction** — the founder's deepening ask).

**Lane 14 · PARKING DEPTH** — *owns* `templates-parking.ts`, `-parking2.ts`, `templates-pk.ts`,
`tools/maps/gen_lot_*.mjs`, new `content/world/lot-*` districts. Delivers the **10+ parking
variants** (kerbside on a hill, between two cars with a wall, angled reverse, loading bay,
underground ramp bay, disabled bay legality, snow-covered markings, night with one lamp, tandem
parallel exit, bay with a cyclist passing). Fixes the "two tasks promised, one delivered" briefing.

**Lane 15 · HUD & UX** — *owns* `modules/sim/hud/HudToasts.tsx`, `SessionEndScreen.tsx`,
`hud/index.ts`, `components/sim/lesson-ui/LessonPlayShell.tsx`,
`components/sim/lesson-ui/GlanceEdgePings.tsx`. *Closes* **L14, L15, D9**, and widens the glance
pings to every observation-graded lesson and to L1–L3. Roomy toasts become click-to-dismiss,
narrower, capped at two, with a persisted "quieter notifications" setting; the session-end screen
gets Space-to-skip, a visible «Space = пропусни» hint, and a "don't show automatically" setting.

---

## 10. The invariant — `scenario-world-referent`, the CI gate

> **STATUS, 2026-07-30: this gate is LIVE and ENFORCING.** Section 10 is the design as written
> before the wave; **§12 is what it measured and what it now fails on.** Four predicates were
> sharpened between wave 0 and wave 1 (T1, T4, T3b/S1, T8/B4) — each because a lane repaired the
> defect at a layer the wave-0 predicate was not looking at. Every wave-0 predicate is retained
> alongside as a `*raw` census row, and the reasoning is in `referents.ts` and in
> `expected-failures.json`'s header. Read §12.2 before trusting any number in this section.

This is the part that matters more than any single fix. It is what stops the next 150 from drifting
the same way.

**File** `platform/src/modules/sim/world/__tests__/world-referent.gate.test.ts`
**Runs on** `npm run test` (vitest), therefore on `.github/workflows/ci.yml` for every PR. No
browser, no rendering, no network. Target budget: under 90 s for the full 154 × 660 sweep.

### What it reads

1. `SCENARIO_TEMPLATES` — all 154 specs. For each spec × each authored rung,
   `compileScenario(spec, level)` → the real `LessonSpec`.
2. `buildWorldGeometry(district, seed)` for the spec's `spawn.districtId` — **the same builder the
   scene mounts**, so signs, lights, marking quads, derived stop lines, zones and parked-car slots
   are the built artefacts, not the JSON.
3. The scenario's **declared fault surface** = `⋃ mistakes[].codeRefs` ∪ every default-ON detector
   in `rules/catalog.ts` not disarmed by the compiled `ruleConfig`.
4. `content/traces/<id>/*.trace.json` for the recorded shadow and mistake demos.
5. `runtime/locator.ts` — to evaluate the spawn pose the way the runtime will.

### What it asserts

**Part A — per fault code (45 of the 58 covered).** For each code in the declared surface, a
REQUIRED-REFERENT predicate over the built world. If the code is in the surface and the predicate
is false, that is a failure.

| code group | required referent |
|---|---|
| `CENTER_LINE_TOUCHED`, `POOR_LANE_KEEPING`, `NOT_KEEPING_RIGHT` | a lane-boundary marking quad on **every** edge the objective chain touches |
| `CROSSED_SOLID_LINE` | a `solidCenterLine`/`noOvertaking` zone spanning the route *(already gated — the precedent)* |
| `WRONG_LANE_FOR_DIRECTION` | `meta.scenario.laneArrows` on the route *(already gated — the second precedent)* |
| `STOP_LINE_OVERSHOOT`, `STOP_SIGN_NO_FULL_STOP`, `FULL_STOP_AT_STOP_SIGN` | ≥1 built `signs.stop` **and** ≥1 derived stop line on an approach the route drives |
| `RED_LIGHT_CROSSED`, `RED_YELLOW_CROSSED`, `YELLOW_LIGHT_NOT_STOPPED`, `HESITATION_AT_GREEN` | ≥2 `trafficLights` at a node on the route, each with rendered `scale ≥ SCENARIO_SIGN_SCALE` |
| `CONTROLLER_SIGNAL_VIOLATED` | a staged `directTraffic` actor within 25 m of a graded stop line |
| `PEDESTRIAN_NOT_YIELDED`, `PEDESTRIAN_YIELDED`, `PEDESTRIAN_CROSSING_TOO_FAST`, `OVERTAKING_AT_CROSSING` | ≥1 `district.crossings` inside the route corridor |
| `SPEEDING_OVER_LIMIT`, `SPEEDING_DANGEROUS` | a built speed plate whose **face number equals** `edge.maxspeed` on every edge the route drives, or a Д11 settlement plate where the urban default applies |
| `SPEED_TOO_FAST_FOR_CURVE` | a `curve` sign posted ≥ 40 m **before** the curve zone's `fromM` |
| `SPEED_TOO_FAST_FOR_CONDITIONS` | the compiled environment sets a non-dry condition |
| `OVERTAKING_IN_BAN_ZONE`, `ILLEGAL_STOP_IN_BAN_ZONE` | the zone exists **and** its sign is posted at the span start |
| `DRIVING_IN_BUS_LANE` | a `busLane` zone **and** its painted seam |
| `EMERGENCY_LANE_DRIVING` | an `emergencyLane` zone on the route |
| `RAIL_CROSSING_VIOLATION` | a rail crossing on the route **and** its А39/А40 post ≥ 50 m ahead |
| `DRIVING_TOO_SLOW_FOR_MOTORWAY` | every route edge is class `motorway` |
| `WRONG_WAY` | ≥1 oneway edge on the route **and** a В1 face at its illegal mouth |
| `FAILED_TO_YIELD`, `YIELDED_TO_PRIORITY`, `EMERGENCY_NOT_YIELDED`, `VULNERABLE_PASS_TOO_CLOSE`, `COLLISION`, `FOLLOWING_TOO_CLOSE`, `FOLLOWING_TOO_CLOSE_FOR_RAIN`, `STANDSTILL_GAP_TOO_CLOSE`, `OVERTAKE_INSUFFICIENT_GAP`, `OVERTAKE_RETURN_TOO_EARLY` | ≥1 compiled `staged` actor of the matching kind, **plus the reachability sub-assertion**: driving at the objective chain's own maximum permitted speed **and** at half of it, the player must meet the actor before it clears |
| `JUNCTION_SCAN_INCOMPLETE`, `TURN_WITHOUT_OBSERVATION` | a degree ≥ 3 node on the route |
| `HEADLIGHTS_OFF_AT_NIGHT`, `HEADLIGHTS_OFF_IN_RAIN`, `FOG_LIGHTS_OFF_IN_FOG`, `HIGH_BEAM_NOT_DIPPED` | the compiled environment sets the condition **and** ≥1 `instructionsBg` step matches `/светлин\|фаров/` — *a scenario may not bill an основна fault for a duty its own copy never states* |
| `HARSH_BRAKING_NO_CAUSE` | **absence** assertion: no staged actor and no hazard zone within braking range of the graded point |

**The 13 codes with NO world referent** are listed in an explicit exported
`NO_WORLD_REFERENT: ReadonlySet<FaultCode>` so the exemption is a reviewed decision, not an
oversight: `SEATBELT_OFF_WHILE_MOVING`, `HANDBRAKE_LEFT_ON`, `ENGINE_STALLED`, `PREDRIVE_PERFECT`,
`PREDRIVE_SEATBELT_SKIPPED`, `PREDRIVE_STEP_SKIPPED`, `PREDRIVE_WRONG_ORDER`,
`MOVE_OFF_WITHOUT_OBSERVATION`, `LANE_CHANGE_WITHOUT_INDICATOR`, `LANE_CHANGE_WITHOUT_MIRROR_CHECK`,
`TURN_WITHOUT_INDICATOR`, `SAFE_LANE_CHANGE`, `CLEAN_DRIVING`. **45 + 13 = 58. The gate covers all
58 codes by construction: every code is either checked or explicitly exempted.**

**Part B — five structural assertions.**

* **S1 GUIDANCE TRUTH** — for every objective, the point `guidanceGoalFor` returns is on the
  **approach side** of every graded stop line within its radius, and its rendered ring radius equals
  the objective's `radiusM`. *(Closes T3 and T8 permanently.)*
* **S2 SPAWN LEGALITY** — the compiled spawn pose, evaluated through `runtime/locator.ts`, yields
  `laneOffsetM ≤ laneKeepMaxOffsetM` and raises **zero** violations in the first 5 s of a stationary
  tick stream. **A student may not begin a lesson already in violation.** *(Closes T2.)*
* **S3 TERMINABILITY** — `routeFinishZone(objectives)` is non-null, and for every k a synthetic
  drive that skips objective k still reaches it. *(Closes B1–B4.)*
* **S4 RUNG DISTINCTNESS** — any two authored rungs of one template differ in ≥1 compiled field
  other than `id`, `titleBg` and `aids`. *(Closes L13; enforcing from Wave 4.)*
* **S5 SURVIVABLE COMPLIANCE** — for every crossing/conflict template, closest approach to every
  staged actor while driving at the objective's own `maxSpeedKmh` is ≥ `PEDESTRIAN_CONTACT_M`.
  **Obeying the lesson may never produce a collision.** *(Closes T11.)*

### What it prints on failure

One block per violation, and nothing else — no stack traces, no diff dumps:

```
FAIL  sc-junction-stop @ L1     CODE  STOP_LINE_OVERSHOOT
  declared by : mistakes[0].codeRefs           templates-junctions.ts:250
  requires    : a Б2 face + a derived stop line on the approach the route drives
  world has   : signs.stop=1 @ (9.10, -28.50) scale 1.5  |  stopLines=1 @ y=-27.725
  route uses  : tj-e-s northbound                                    -> referent OK
  S1 GUIDANCE TRUTH violated:
    objective 2 "sc-jstop-line" marker = (0.00, 0.00)
    graded stop line          = (4.06, -27.73)
    marker is 27.73 m PAST the line, on the far side of the graded cut
  fix in      : templates-junctions.ts:223 (author the line) OR
                scene/guidanceRoute.ts:115 (derive it — closes 9 objectives at once)
```

Footer:

```
world-referent gate: 154 scenarios x 660 rungs | 45 codes checked, 13 exempt
  FAIL  T-class (falsehood) 172   B-class (blocked) 61   S-class (structural) 94
  allowlisted 0   newly-passing allowlist entries 0
```

### Escape hatch, and how it drains itself

`expected-failures.json` entries require `{ scenario, rung, code, reason, owner, issue }`. **The
gate also fails when an allowlisted entry starts passing** — so the allowlist can only shrink, and
a lane that fixes something is forced to delete its own entry in the same PR.

### Why this is the deepest fix in the document

Every finding in section 2 is an instance of one sentence: *a scenario graded something its world
did not contain.* The gate turns that sentence into a compile-time-ish contract. After it is
enforcing, **an author physically cannot ship a lesson about a sign that does not exist, a marker
past a stop line, a spawn already in violation, a car that has already gone, or a rung that is a
copy of the one before it.**

---

## 11. Execution summary

| wave | lanes | closes | can start |
|---|---|---|---|
| 0 | 0 | measurement baseline | immediately |
| 1 | 1, 2, 3, 4, 5 | T1–T6, T8, T14, T16, L1, L2, L5, L9, D5, D6, D10 | immediately, all parallel |
| 2 | 6, 7, 8 | B1–B7, B9, L6–L8, L11, L16, L17, T17(engine) | immediately (no file overlap with wave 1) |
| 3 | 9, 10, 11 | T7, T9–T13, T15, T18, B8, L4, L10, D1–D4, D8 | after wave 1 lands (traces re-record against the fixed world) |
| 4 | 12, 13, 14, 15 | L13, L14, L15, D7, D9, D11 + all content deepening | Lane 12 first, then 13/14 |
| final | 0 | flip the gate from report-only to enforcing | after wave 3 |

> **All six rows have run. See §12 for what actually closed (45 of 58), what did not (13), and the
> twelve drives that demonstrate the difference.**

**Total distinct defects: 58.** Twenty are a single line or number. Thirteen are one change in one
engine or builder file that repairs 10–127 scenarios each. The remaining twenty-five are per-family
authoring that the fix wave does alongside the content deepening the founder has already approved.

**One number to keep in view.** Of the 58, exactly **two** classes are responsible for more than
half of everything he reported: *grading without a world referent* (T1, T2, T4, T5, L2 — 90, 31,
83, 12 and 12 scenarios) and *a guidance marker that does not know where the law is* (T3, T8, L5 —
9, 154 and 8). Wave 1 lanes 1, 2 and 3 close both. **If nothing else in this plan ships, ship those
three lanes and the gate.**

---

## 12. CLOSE-OUT — the wave, measured (2026-07-30)

Fifteen lanes ran against the ledger. **The gate is now ENFORCING** (`WORLD_REFERENT_GATE=report`
restores the wave-0 narration for a bisect). This section is the arbiter's report, not the lanes':
where a lane said "done" and the gate disagreed, the gate is quoted.

**Full gate, this tree:** `npx tsc --noEmit` exits **0**. `npx vitest run --maxWorkers=4` —
**628 files passed, 9,479 tests passed, 165 skipped, 0 failed.**

### 12.1 The headline

| | wave 0 | now |
|---|---|---|
| **teaches-falsehood** (a code that CONVICTS on a world with no referent) | **1,090 rung-codes across 88 scenarios** | **113 across 29** |
| codes that produce any falsehood at all | 10 of 45 | **5 of 45** |
| S-class (structural) total | 63 | **53** |
| catalog | 155 templates / 669 rungs | 157 / 687 |

**89.6 % of the convicting falsehoods are gone.** The other 10.4 % are five codes, each named in
`expected-failures.json` with an owner and a ledger id, each pinned so it can only fall.

### 12.2 Per-class, wave-0 baseline vs now

Measured by `world-referent.gate.test.ts` both times, same harness.

| class | what it counts | wave 0 | now | |
|---|---|---|---|---|
| **T1** | district runs no lane-line pass at all | 90 | **0** | closed |
| **T2** | compiled spawn already outside the lane-keep envelope | 31 | **31** | **not touched** |
| **T3** | passSignal marker AUTHORED at (0,0) | 9 | **9** | see note |
| **T3b** | marker the student SEES, past the graded stop line | 10 | **0** | closed |
| **T4** | a route limit the world cannot state, or a plate that contradicts its road | 83 | **0** | closed |
| T4raw | *wave-0 proxy: "some edge is not 50"* | 83 | 85 | no longer a defect |
| **T6** | parked bodies inside a junction mouth | 58 bodies / 7 districts | **0** | closed (Lane 4's battery: 194 to 0 across 90 districts) |
| **T8** | a speed cap the marker never states | 177 (all caps) | **0** | closed |
| T8raw | *wave-0 proxy: capped reachZones* | 178 | 181 | a feature, once stated |
| **T14** | warning post standing at the hazard instead of before it | 10 | **4** | partial |
| **L2** | signal head below scenario scale on a graded route | 18 | **0** | closed |
| **L3** | signalized crossing with no buildable pedestrian head | 5 | **5** | **not touched** |
| **L10** | night/rain/fog graded with no lights instruction in the copy | 38 | **16** | partial |
| **L12** | stages nothing at all, yet carries conflict codes | 56 | **56** | **not touched** |
| **B1** | no automatic finish at all | 16 | **5** | closed (the 5 are single-objective routes, all rescued by Lane 6's terminal path) |
| **B3** | finish radius below the lane pitch | 57 | **8** | closed |
| **B4** | capped waypoint with no memory of a cap already honoured | 137 | **0** | closed |
| B4raw | *wave-0 proxy: scenarios carrying a capped zone* | 137 | 139 | a feature |
| **S1** | guidance marker past the line the same lesson grades | 12 | **2** | partial |
| **S2** | spawns already in violation | 31 | **31** | **not touched** |
| **S3** | terminability, static half | 73 | **13** | closed |
| **S4** | two identical rungs | 146 | **1** | closed |
| **S5** | obeying the objective's own cap still hits the walker | 8 | **6** | partial |

Three notes the numbers need:

- **T3 sits at 9 on purpose.** It reproduces this ledger's literal criterion — the *authored*
  coordinate — and is the gate's proof that it agrees with the document rather than with itself.
  Lane 2 did not re-author nine templates; it made the class **unauthorable**, resolving every
  `passSignal` against the runtime's own stop lines. What ships is T3b, and T3b is 0. Expect this
  row at 9 forever.
- **T4raw / T8raw / B4raw rose by 2, 3 and 2.** That is exactly Lane 15's two new parking drills
  (`sc-park-perp-forward`, `sc-park-parallel-exit`). Two new lessons, not two new defects — the
  reason is written into `expected-failures.json` under `raised`, which the gate now requires
  before it will accept a class that grew.
- **Four predicates were sharpened, and each is argued in the code.** Wave 0 measured the template
  where wave 1 measures the product: the lane-paint codes now read `tick.centreLinePainted` and are
  *disarmed* by unpainted road instead of convicting on geometry; the speed rule finally implements
  the sentence it always printed ("a face whose NUMBER equals `edge.maxspeed`") now that the kit has
  thirteen numerals instead of one; guidance is queried with the context the scene actually passes;
  and B4 probes the evaluator once, because one stateless `stepReachZone` broke all 137 at once and
  one latch repaired all 137 at once. Every wave-0 predicate is retained as a `*raw` row — nothing
  was deleted to make a number fall.

### 12.3 Closed: 45 of 58

**teaches-falsehood — 16 of 18.** T1, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T15, T16,
T17, T18.

**blocks-student — 9 of 9.** B1, B2, B3, B4, B5, B6, B7, B8, B9. *The only class closed outright.*

**breaks-lesson — 11 of 17.** L1, L2, L5, L6, L7, L9, L13, L14, L15, L16, L17.

**degrades / cosmetic — 9 of 14.** D1, D2, D3, D4, D5, D6, D9, D10, D11.

### 12.4 Still open: 13 of 58 — with the reason, not an excuse

| id | state | why it is still open |
|---|---|---|
| **T2** | **untouched, 31 scenarios / 15 districts** | The compiled spawn pose is 4.06 m off the lane centre against a 3.25 m envelope. Lane 1's brief called this "half of T2" and it built the paint half; nobody moved a spawn. This is the largest single unrepaired class in the document, and it fires 3.5 s into every one of those 31 drives. |
| **T14** | partial, 10 to 4 | `zoneSigns.ts` gained the advance offset for water / ice / curve, but `sc-merge-motorway-exit`'s А1 still stands 1.0 m *past* the arc it warns about. Budgeted under `SPEED_TOO_FAST_FOR_CURVE`. |
| **L3** | untouched, 5 | Structural, not per-district: neither `SignKind` nor `TrafficLightPlacement` has a pedestrian variant, and heads are synthesised from road nodes only. Every signalized crossing in the catalog is an unlit one. It needs a new sign kind, and no lane owned one. |
| **L4** | partial, 2 of 3 | The регулировчик is scaled and re-posted; the **gesture-explanation bubble is not on screen**. It needs `traffic/TrafficLayer.tsx` (Lane 4's file) and Lane 9 correctly refused to cross the boundary. This is his third-most-repeated ask. |
| **L8** | engine half only | Actor behaviour landed; the renderer must prefer the published `TrafficVehicleState.indicator` over its yaw-rate guess (`TrafficLayer.tsx:881-887`). One file, two lanes. |
| **L10** | partial, 38 to 16 | 16 scenarios still grade a lights duty the copy never states. Budgeted across three codes. |
| **L11** | engine seam only | The same cross-lane handoff as L8. |
| **L12** | untouched, 56 | 56 scenarios stage nothing on any rung while carrying conflict codes. This is the INERT band's centre of gravity and no lane owned it. |
| **D7** | authorable, not read | Lane 12 made `LevelSpec.rubric` and the par-time ladder authorable; two call sites still read `spec.rubric` directly and discard the override — `simulator/actions.ts` and its sibling. Neither file was Lane 12's. |
| **D8** | untouched | `sc-sp-wet-limit-plate` still has nothing to fail at L1 / L2. |
| **D12** | **UNVERIFIED** | `sc-ov-narrow`'s two escape paths were never swept. Do not tune blind — that is what this ledger said in July and it is still true. |
| **C1** | **UNVERIFIED** | Rain still needs an R0 look-before-ship capture. Nobody rendered it. |
| **C2** | untouched | Placeholder child and officer meshes. Art, not engineering — but it is one of the 58 and it is not done. |

Two further honesty items the lanes declared themselves:

- **No R0 look-before-ship capture was taken for the guidance renderer.** Lane 2's stop-line bar,
  the radius-sized ring, the cap chip and the dimmed look-ahead ribbon are asserted by unit tests
  and have **not been seen by a human**. Doc 66 R0 says look before shipping. Do that before the
  founder replays 12.5.
- **The INERT band (22,485 rung-codes) is NOT enforced.** An inert code is a declared surface the
  world can never arm — a broken lesson, not a lie — and it is L12's mass. Enforcing it today would
  mean allowlisting the catalog, which is not an escape hatch; it is a padlock on an open door.

### 12.5 What to re-play first — 12 drives, not 154

**Read this before you open the list.** Lane 15 inserted two new parking drills at positions 5 and
6, so **every catalog position after 4 has shifted by +2**. Your #9 `sc-junction-stop` is now #11;
your #29 `sc-pe-jaywalker` is #31; your #37 `sc-mw-discipline` is #39; your #50 `sc-ov-ban-overtake`
is #52. The positions below are the NEW ones.

One drive per repaired class, chosen so each shows a *different* fix. Nine of the twelve are
scenarios you already played.

| # | drive | the class it proves | what to look for |
|---|---|---|---|
| **11** | `sc-junction-stop` — **L1, then L2, then L3** | **S4 · a rung is now a different lesson** (146 to 1) and **T3b · the marker moved** | The green marker used to sit 27.7 m *inside* the box. It is now a bar across your lane at the stop line, 1–2 m before the paint. Then play L2 and L3 back to back: at wave 0, all three rungs were byte-identical on 146 of 155 templates. |
| **12** | `sc-signal-response` | **L2 · signal heads** and **T8 · the cap is visible** | The lamp is no longer 1× on a 2.5× street. The marker now says «не по-бързо от N км/ч» out loud — that hidden number is what «стоях точно на кръга и нищо не стана» actually was. |
| **19–20** | `sc-signal-dead` / `sc-signal-flashing` | **T7 · the stop line is where the paint is** | The demonstrated-correct ghost used to stop 8.2 m *past* the line. It now stops 1.8 m before it, and the witness release can fire from a lawful stop. A 10.0 m correction on both. |
| **10** | `sc-junction-rhr` | **T4 · the signs stopped lying** and **T6 · you can see the conflict car** | This map wore three «50» plates on a 40 street; it now wears three В26-40. Six parked bodies came out of the junction mouth — 10 of 19 junction conflicts were *fully blocked* at 0.00 m before this wave. |
| **39** | `sc-mw-discipline` | **T4 on a motorway** and **T16 · the осева reads differently from a lane divider** | Two «50» plates on a 140 road, now В26-140. |
| **1** | `sc-park-perp-rev` | **T1 · lane paint** — your catalog position 1 | The parking aisles carry no осева, and the engine now *refuses* to convict there instead of billing you for crossing a line nobody drew. 90 scenarios were graded against invisible paint; the number is 0. |
| **5–6** | `sc-park-perp-forward`, `sc-park-parallel-exit` | **D11 · parking depth** | Two drills that did not exist. Every maneuver drill's first task used to be satisfiable at 15 km/h; now none is. |
| **112** | `sc-pe-parked-row-scan` | **T11 · the inverted fault surface** | At the taught speed you used to *hit* the child; at an illegal speed you cleared him and were billed nothing. The collision band now starts at 36 km/h, and the release gives 12.2 m of margin instead of −1.1 m. |
| **40 + 43** | `sc-follow-distance`, `sc-follow-rain-gap` | **T18 · the following gap** | The shipped "correct" shadow was driving at 1.23 s and 1.30 s — *inside* the fire line. They now hold 2.60 s and 3.35 s. `sc-follow-rain-gap` is the worse of the two and is not in this ledger's body: a lesson teaching "at least 3 s in the wet" was demonstrating 1.30 s. |
| **92** | `sc-sig-green-wave` on **Начинаещ** | **B7 · structurally unwinnable** | The tier cap was 40 km/h against a wave solved for 50. The second and third greens were unreachable on every rung. |
| — | **Урок 1** (the pre-drive) | **D9 · thirteen shortcuts become a mouse** | The tutorial popup: an illustration, the WHY, the law, and one button. Your first instinct was to skip the lesson; this is the redesign. |
| — | **Урок 2 «Кръстовища и предимство»** | **D9 · the «огледай» cue** | You asked for it three times and it already existed — gated to 6 rungs of 679. It is now on 465 rungs and all 8 curriculum lessons. |

If you have half an hour: **11 (all three rungs), 12, 112, 40, and Урок 1.** Those five cover rung
distinctness, the marker, the sign kit, the inverted fault surface, the following gap and the
pre-drive — six of the eight classes behind more than half of everything you reported.

### 12.6 The wave is PARTIAL, and this is the tail

Nine of the fifteen lanes reported partial. **Forty-five defects are closed and thirteen are not.**
One severity class is finished outright — every blocks-student defect, B1 through B9. Ranked by what
a student actually feels, here is the rest:

1. **T2** — 31 scenarios convict 3.5 s after first movement. Move the spawns.
2. **L12** — 56 scenarios stage nothing while grading conflict.
3. **L10** — 16 scenarios bill an основна fault for a duty the copy never states.
4. **L4 bubble + L8 / L11 indicator** — three items, one file (`TrafficLayer.tsx`), one lane.
5. **D7 read side** — two call sites, and the rung rubric starts working.
6. **L3** — one new `SignKind`, and every signalized crossing stops lying.
7. **T14 / D8 / D12 / C1 / C2** — one scenario each, or a capture nobody has taken.

Nothing on that list is a research problem. The gate now fails on all of it, which is the only
reason it will get done.
