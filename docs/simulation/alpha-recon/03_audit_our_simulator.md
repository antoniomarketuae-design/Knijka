# Objective Audit: Our Current Simulator (Prototype → Alpha Recon, Agent 3)

**Date:** 2026-07-10 · **Branch:** `scenario-engine` · **Scope:** `platform/src/components/sim/**`, `platform/src/modules/sim/**`, `public/sim/**`, `public/world/district-v1.json`
**Stance:** demanding product reviewer. The founder rated the product 10%; this audit explains *precisely why it feels that way despite genuinely strong engineering underneath* — and where the 10% impression is actually unfair.

---

## Executive verdict

**Overall: 4/10 as a desktop tech demo. 0/10 as the product ADR-005 promises (it is hard-blocked on phones). ~2/10 as a "3D driving instructor" — the instructor logic is real, but the student cannot *operate a car*, only steer a go-kart with WASD while clicking a quiz-style checklist.**

The codebase splits into two very different halves:

- **The invisible half is near-Alpha quality.** Rule engine (21 violation codes + 6 commendations, exam-taxonomy severities, law refs), teach-first-then-grade coach, pure lesson reducer with tests (700+ passing), deterministic IDM traffic with intersection reservations, a CI-gated physics harness, quality-tier system with an FPS probe. This is unusually disciplined for a prototype.
- **The visible half is a proof of concept.** Box-primitive cockpit, non-functional mirrors, a checklist you *answer* instead of *perform*, 42–170 m glass towers looming over 6.5 m-wide streets, pill pedestrians, letterboxed non-fullscreen canvas, and no touch input at all.

The founder's instinct is correct: **stop adding features; the perception layer (cockpit, world scale, interaction model) needs reconstruction, not iteration.** The grading/coaching core can and should be carried over intact.

---

## 1. Cockpit & vehicle controls — **3/10**

### What the student can actually operate
Complete input surface (`modules/sim/engine/input.ts:17-29`, `components/sim/cabin.ts:24-34`):

| Control | Key | Real interaction? |
|---|---|---|
| Throttle / brake / steer | W/S/A/D, arrows, gamepad | Yes (binary on keyboard — no analog pedals) |
| Handbrake | Space (held) | **Momentary only — there is no parking-brake state** |
| Indicators | `,` / `.` | Yes, with realistic auto-cancel (`cabin.ts:82-97`) |
| Headlights off/low/high | L | Yes |
| Seatbelt | B | Yes (toggle + click sound) |
| Mirror glances | Q/E/F | Camera snap only — see mirrors below |
| Camera / reset / pause | C / R / Esc | Yes |

### What does NOT exist — the founder's core complaint, confirmed in code
- **No ignition.** `VehicleSim` has no engine on/off state at all (`modules/sim/vehicle/VehicleSim.ts` — engine force is always available). "Запалване на двигателя" in Lesson 1 is pressing the **"7" key on a checklist** (`hud/PreDriveChecklist.tsx:20-34`), and the car drives identically whether you did it or not.
- **No gear selector.** The gearbox is explicitly cosmetic: `/** Cosmetic automatic gearbox for the HUD. */` (`VehicleSim.ts:331-341`) — gear is *derived from speed* for display. "Включи първа предавка (или D)" = pressing "9".
- **No clutch, no stalling, no creep, no Park/Reverse/Drive.** Reverse is an overload of the brake key when stopped (`VehicleSim.ts:229-235`). Bulgarian learners overwhelmingly train on manuals; the sim cannot even represent an automatic's PRND.
- **No parking-brake procedure.** The checklist step "release-handbrake" (key "0") has no vehicle state behind it; the physics handbrake is Space-held drifting assist (`tuning.ts:190-192` — handbrake sets rear grip 0.4 = **handbrake slides**, a racing feature, in a driving school).
- **The 13-step pre-drive checklist is UI theater.** `LessonScene.tsx` receives `onPreDriveStep` but **never wires it to anything in the 3D scene** — the only path is clicking the HTML list (`LessonPlayShell.tsx:497-505`). Worse, the physics car is **fully drivable during the pre-drive phase** — `applyTick` runs rules from second zero but nothing gates movement on the checklist (`lessons/engine.ts:150-158`); you can drive 300 m with the "engine not started".
- **Mirrors show nothing.** The interior mirror is a static metallic plane (`VitokCockpit.tsx:220-233` — `meshStandardMaterial metalness 0.85`, env-map glints only, no render-to-texture). There are **no door mirrors modelled at all**. Yet the rule engine *grades mirror checks* (`LANE_CHANGE_WITHOUT_MIRROR_CHECK`) — the student is graded on glancing at a mirror in which nothing can ever be seen. Pedagogically this teaches *pressing Q*, not *observing traffic*.

### The cockpit itself
- The entire interior is **17 grey box primitives + 2 seat boxes** (`VitokCockpit.tsx:24-50`): box dash, box gear knob, box A-pillars. Good draw-call discipline, zero resemblance to a car interior. No pedals, no stalk, no door handles, no textures.
- **Identity mismatch:** the exterior is the Rodin-generated "Aurelis GT-E" sports coupe (`HeroCarBody.tsx`), the interior is the „Виток" hatchback box-set, and the physics is a 1.2 t FWD compact (`tuning.ts:9-12`). The GLB **has no interior** ("no modelled interior, so the cockpit view keeps VitokCockpit" — `HeroCarBody.tsx:10-11`). Three different cars in one.
- The instrument cluster is honest craft: canvas-texture speedo with a real needle, gear/indicator/belt/handbrake/headlight telltales at 10 Hz (`vitok/cluster.ts`) — the one cockpit element that already reads "real product". No tachometer (meaningless anyway without a real drivetrain), static fuel.
- Windshield is a 14%-opacity plane (`VehicleRig.tsx:215-226`); no wipers even though rain droplets render on the glass (`WindshieldDroplets`).

**Verdict:** the *electrics* layer (indicators/lights/belt) is genuinely good; the *drivetrain interaction* layer — the thing lesson 1 is nominally about — does not exist. The checklist asks the student to *claim* they did 13 things; the sim should make them *do* ~6 of them.

---

## 2. Visuals & world / road geometry — **4/10**

### Roads: the numbers behind "far too narrow"
The lane width itself is **correct**: `LANE_WIDTH_M = 3.25` (`world/builders/constants.ts:8`) — the Bulgarian urban standard. The narrowness is real but comes from everything *around* the lane:

1. **Road width = lanes × 3.25 and nothing else** (`network.ts:74-80`). District data (`public/world/district-v1.json`): 206 of 323 edges are 2-lane two-way → **6.5 m curb-to-curb**; 66 edges are 1-lane → **3.25 m total**. Real Sofia residential streets read 9–12 m between curbs because of **parking lanes, gutters and verges — none of which are modelled**. A real Студентски град street has cars parked on both sides *plus* two travel lanes; ours has bare 6.5 m asphalt.
2. **Sidewalks are a fixed 2.0 m** (`constants.ts:20`) on every class. Sofia boulevards carry 4–6 m sidewalks; the fixed thin ribbon makes the corridor feel tighter and toy-like.
3. **Scale catastrophe — the actual root cause:** every one of the 248 OSM footprints is replaced by a **glass tower clamped to 42–170 m tall** (`cityBuildings.ts:56-60`: `H_MIN = 42`, `H_MAX = 50 floors × 3.4 m = 170 m`; "Tuned for a tall varied skyline"). Студентски град is a district of 15–25 m panel blocks. We put a Dubai skyline on 6.5 m streets with 2 m sidewalks and **zero setback** (towers sit on the OSM footprint edge). The canyon ratio (height:width ≈ 10:1 vs the real ~2:1) is what makes the founder's eye read "roads far too narrow" — the roads are borderline; the *proportions* are wrong.
4. **Junction corners have a 2.0 m open radius** (`constants.ts:25`). Real urban curb radii are 6–12 m; tight 2 m corners make every junction look like a model-railway crossing and force implausible turning lines.
5. Roundabout ring lanes get a hand-tuned minimum 2.4 m half-width patch (`network.ts:77-79`) — a symptom-level fix.

### Everything that reads placeholder
- **Parked cars are literally boxes** — by design, documented: "still the interim box car — GLB upgrade deferred" (`TrafficLayer.tsx:22-23`).
- **Pedestrians are capsule+sphere pills** (blob shadow + body + head instanced meshes, `TrafficLayer.tsx:683-701`), no limbs, no walk animation.
- Facades are procedural canvas textures (window-grid bays, `constants.ts:40-47`, `textures/canvasTextures.ts`); fine at distance, flat up close.
- L5's "hazard cue" and L7's "marked parking bay" are **acknowledged as unrendered** — the maneuvers are scored coordinate-free from speed/gear only (`lessons/specs.ts:16-19`): the student "parks" into an unmarked void.
- L2's stop-sign objective *depends on* procedural sign placement because "district-v1.json has no stop-sign data" (`specs.ts:13-15`) — the world and lesson author against assumptions of each other.
- One district only (~1.6 km², 297 nodes / 323 edges / 19 signals / 1 roundabout). Fine for Alpha; the pipeline (OSM → analyzed network → ribbons/junction patches/markings/props with shared cross-sections, `network.ts`, `roads.ts`, `markings.ts`, `props.ts`) is legitimately good engineering and *should survive the reconstruction*.
- Sign kit exists and is BG-correct (Б2/Б1/Д11/В26 placement logic in `props.ts:1-13`), streetlights + trees placed procedurally. Good bones.

**Verdict:** a strong procedural pipeline rendering the wrong city. Fixing three constants-level decisions (building height model, parking lanes/verge in the road cross-section, corner radii) plus real mid-rise building assets would transform the read more than any shader work.

---

## 3. Traffic believability — **5/10**

### Genuinely good
- Deterministic seeded system, zero per-frame allocation, one update path (`traffic/system.ts:1-12`).
- IDM-lite car following, signal compliance with yellow-commit logic, reservation slots at unsignalized intersections, pedestrian-crossing occupancy checks (`vehicles.ts:1-16`).
- Rule-engine integration is real: oncoming/right-conflict/circulating queries feed the priority adjudicators (`LessonScene.tsx:171-179`) — traffic exists *to be reasoned about*, which is exactly right for an instructor product.
- Visuals were upgraded once already: instanced GLB fleet (9 fictional models incl. rare police), rolling/steering wheels, brake/head/tail/blinker lamps, blob shadows (`TrafficLayer.tsx:5-29`, `vehicleFleet.ts`).

### Where it breaks believability and pedagogy
- **NPC cars are unhittable ghosts with a force field.** Agents are kinematic, "can never push the player" and a hard clamp guarantees "they also never overlap the player" (`vehicles.ts:10-12`). Consequence: **you cannot cause a car-to-car collision in a driving school sim.** The only graded collision type ever pushed is `"staticObject"` (`LessonScene.tsx:328-330`). Cutting off a priority vehicle produces a rule toast, never a crash — the most important consequence in driving is unrepresentable.
- 26 vehicles + 20 pedestrians anchored within 280 m (`LessonScene.tsx:162-169`) — streets read near-empty outside the bubble; anchoring was itself a patch for "nearest car was ~340 m away".
- **No lane changes, no overtaking** — agents follow fixed single-lane loop routes (`routes.ts`); multi-lane boulevards have all traffic glued to one lane.
- No buses, trucks, trams, cyclists, motorcycles — categories with dedicated exam questions (and the event library has cyclist/tram events waiting).
- Pedestrians: pills that cross at crossings; no jaywalking, no children-run-out event (the #1 hazard-perception scenario in the 45-event library).

---

## 4. UI / HUD & learning flow — **6/10** (best area)

### Working and genuinely differentiated
- **Teach-first-then-grade is live and correctly architected:** first minor mistake → "📚 lesson" toast with law citation, unscored; repeats graded; dangerous errors always grade (`lessons/engine.ts:160-197`, `scenarios/coach.ts`). This *is* the product's moat, and it works.
- 8-lesson curriculum with spawn points on real streets, sequential objectives, progress banner, session end screen with debrief + concept links + XP; server recomputes the authoritative debrief (`LessonPlayShell.tsx:400-410`).
- Contextual **micro-quizzes** triggered by driving context, pausing the sim, with frequency setting — the theory↔driving closed loop exists (`LessonPlayShell.tsx:225-268`).
- HUD craft is high: speed ring against the legal limit with the official +10 dangerous band (`SpeedCard.tsx`), gear/indicator/belt card, minimap at 5 Hz, toast queue, 150 ms snapshot polling so React never runs at frame rate.

### Broken flow
- **The sim is a letterboxed `aspect-video` card inside a dashboard page** (`LessonPlayShell.tsx:438-447`) — no fullscreen mode anywhere (grep confirms zero `requestFullscreen`). A driving lesson framed like a YouTube embed destroys presence before the first meter.
- The pre-drive checklist contradiction (§1): the flagship "performed procedure" is a clickable list floating over a drivable car.
- **No in-world guidance.** Objectives are text + a tiny minimap; there are no 3D route arrows, no ghost line, no instructor voice. In L2 ("pass three intersections") the student must self-navigate an unfamiliar OSM district from a 5 Hz minimap.
- No onboarding/tutorialization of the 14-key keyboard map beyond a static legend panel (`LessonScene.tsx:549-586`).
- Footer attribution says "3D vehicle: Max Hordin (CC-BY 4.0)" (`LessonPlayShell.tsx:544`) — stale (that's the retired roadster), and license-noise on every lesson.

---

## 5. Performance budget vs the phone promise — **desktop 6/10, ADR-005 compliance 0/10**

- **Phones are hard-blocked, full stop.** `isTouchOnlyDevice()` → "Симулаторът изисква клавиатура" gate (`LessonScene.tsx:200-208`). There is **no touch input layer at all** — the input class reads keyboards and standard gamepads only (`engine/input.ts`). ADR-005's "must run on a mid-range phone" is currently not a degraded experience; it is a refusal screen. **This is the single largest gap between stated strategy and shipped code.**
- The desktop budget discipline is real and quantified: three quality tiers with explicit ms budgets (half-res N8AO ≈1 ms, mipmap bloom ≈0.5 ms, SMAA ≈0.3 ms — `environment/quality.ts:80-116`), DPR caps 1.0/1.25/1.5, FPS-probe auto-tier with median filtering (`recommendQuality`), instanced everything (cockpit = 2 draw calls, traffic bounded by model count not agent count, towers instanced), merged road ribbons sharing junction vertices.
- Asset weight is phone-plausible: `public/sim` = 26 MB total, hero car 136 KB Draco, city towers 1.8 MB, two 1k HDRs. Rapier WASM + Next dashboard shell are the heavier concern, unmeasured on mobile because mobile is blocked.
- Physics: fixed 60 Hz with interpolation — correct; but 26 IDM agents + 20 peds + per-frame rule engine on a mid-range phone CPU is untested territory.

---

## 6. Physics & driving feel — **6.5/10** (with an asterisk)

- **The tuning work is the most professional part of the visible sim.** Mass-normalized suspension math with a written cheat sheet (`tuning.ts:17-36`), lateral-G → roll-torque coupling to fix raycast flatness (`VehicleSim.ts:388-411`), software anti-roll bars, speed-sensitive steering, understeer-biased μ split with a rollover margin argument (`tuning.ts:127-136`), aero drag/downforce, brake bias — and a **headless CI harness that gates 0–100, brake distance, curb strike and lane change** (`scripts/sim-harness.mjs`). Nobody builds that for a throwaway.
- Difficulty assists are the right educational lever done the right way: input-shaping only (throttle curve, 40 km/h beginner governor, steering low-pass) leaving physics constants CI-valid (`vehicle/difficulty.ts`).
- The asterisk:
  - **Automatic-only, gearless, stall-less** — see §1. "Car-like" in trajectory, not in operation.
  - **Binary keyboard input**: throttle/brake/steer are 0/1 from keys (`input.ts:62-64`); smooth inputs exist only via the difficulty low-pass or a gamepad. Fine-grained pedal modulation (the actual skill in smooth stops, L1's graded objective) is being *simulated by the assist filter*, not performed by the student.
  - Brake key doubles as reverse when stopped (`VehicleSim.ts:229-235`) — an arcade convention that actively mis-trains "select R, check behind, reverse".
  - Handbrake = drift button (rear grip 0.4, `tuning.ts:192`).
  - Physics chassis (compact hatch, 135 km/h top) vs GT-E coupe body vs box interior — feel, look and lore disagree.

---

## 7. Immersion coherence: audio, camera, feedback — **4/10**

- **Audio is a single procedural engine hum + blinker relay + thump + belt click** (`simAudio.ts:1-9` — "zero audio assets"). Missing: tyre/road noise, wind, braking, kerb strikes vs body strikes distinction, ambient city, rain audio, other vehicles (26 silent cars), pedestrian ambience. Audio is ~50% of speed perception in sims; its absence is a big reason the drive feels weightless.
- **Camera is quietly excellent**: damped cockpit eye, G-lean/roll/pitch head motion, look-into-turn, speed FOV widen, 55° cockpit FOV per research doc 63, mirror-glance choreography (`CameraRig.tsx`, `tuning.ts:279-293`). Carry it over untouched.
- Feedback loop gaps: no force/rumble (gamepad rumble unimplemented), no skid audio-visual, collision = generic thump + session event. Night/rain exist (nice: windshield droplets, headlight fill logic `VehicleRig.tsx:160-169`) but no wipers, no fog scenario.
- Coherence: HDRI reflections on a glossy GT parked in a boxy grey cockpit inside a letterboxed card — polish is distributed exactly where the student isn't looking.

---

## 8. Scenario engine reality check (the "45 events")

- The 45-event library is **data + policy only**: typed registry, teach-first policy, catalog→scenario mapping (`scenarios/`). What runs live is the **~14 rule-engine detectors** that fire when situations *naturally occur* (PROGRESS.md §3).
- There is **no scenario staging** — nothing spawns the child behind the bus, the cyclist in the blind spot, the tram, the red-X lane. The "learn by driving" promise currently means "get caught by detectors while free-driving a quiet district". Staged, repeatable encounters are the actual product and remain unbuilt.

---

## 9. Dead / placeholder inventory (delete or replace list)

| Item | Location | Status |
|---|---|---|
| `RoadsterBody.tsx` (CC-BY roadster) | components/sim | Dead — replaced by HeroCarBody; footer attribution still references it |
| `VitokExterior.tsx` + `VitokWheels.tsx` | components/sim/vitok | Dead as exterior (hero GLB shipped); cockpit still live |
| `SimulatorApp.tsx` + `SimScene.tsx` + `TestTrack.tsx` + `CabinHud` | components/sim | Legacy free-drive stack, only reachable via `/sim-visual-check` |
| Parked box cars | TrafficLayer.tsx | Acknowledged interim |
| Pill pedestrians | TrafficLayer.tsx | Placeholder |
| L5 hazard cue, L7 parking bay | world (absent) | Scored without being rendered |
| Interior mirror "glass" | VitokCockpit.tsx:229-232 | Fake (metallic plane) |
| Door mirrors | — | Absent entirely |
| Pre-drive cockpit hotspots | SceneSlot contract §4 | Contract written, never implemented |
| Touch input | — | Absent (phones blocked) |
| Fullscreen mode | — | Absent |
| Steering ratio fork | VitokCockpit.tsx:52-59 vs tuning.ts:211 | Two conflicting "correct" wheel ratios (3.5× visual vs 13× documented) |

---

## 10. Scorecard

| Area | /10 | One-line reason |
|---|---|---|
| Cockpit & controls | **3** | Working electrics + cluster; no ignition/gears/clutch/park-brake; mirrors fake; checklist is theater |
| World & road geometry | **4** | Correct 3.25 m lanes betrayed by 42–170 m towers, no parking lanes, 2 m sidewalks/corners |
| Traffic | **5** | Smart deterministic brain; ghost cars you can't hit, one-lane routes, pill pedestrians |
| UI/HUD & learning flow | **6** | Teach-first coach + micro-quizzes are real; letterboxed, no in-world guidance, checklist contradiction |
| Performance vs ADR-005 | **4** | Excellent desktop discipline; phones get a refusal screen — the ADR is unmet, not degraded |
| Physics & feel | **6.5** | CI-gated, credible dynamics; automatic-only, binary inputs, arcade reverse/handbrake |
| Immersion (audio/camera) | **4** | Research-grade camera; near-silent world, no consequences, polish misallocated |
| **Weighted overall** | **≈4.4** | Alpha-grade brain in a proof-of-concept body |

---

## 11. What must survive the reconstruction (do NOT rewrite)

1. Rule engine + catalog + coach + lesson reducer + tests (`modules/sim/rules`, `scenarios`, `lessons`, `procedures`).
2. The OSM→network→geometry pipeline (`world/builders`) — re-parameterize, don't replace.
3. Vehicle tuning + CI harness + difficulty input-shaping.
4. CameraRig, quality-tier system, instancing patterns, telemetry/ref architecture.
5. Traffic *system* (graph/routes/IDM/reservations) — its renderer and its "unhittable" clamp need replacing.

## 12. Top 10 reconstruction priorities (this audit's recommendation order)

1. **Touch controls + fullscreen** — the product does not exist on its target device today.
2. **Interactive car operation**: ignition, PRND (or manual w/ stall), parking brake toggle, performed pre-drive (press-and-hold interactions in the cockpit, checklist becomes *verification*, not input).
3. **World scale fix**: mid-rise building set (5–8 floors) + parking-lane/verge in the road cross-section + 6–10 m corner radii. Three changes, most of the perceived quality.
4. **Functional mirrors** (RTT or screen-space proxy) — mirror grading is dishonest until then.
5. **Hero car with a real interior** matching the physics class (one identity: car, cockpit, tuning).
6. **Hittable traffic** + car-to-car collision grading (the consequence model).
7. **Staged scenario encounters** — start with 5 of the 45 (pedestrian dart-out, right-hook cyclist, priority-from-right, bus stop, roundabout entry) placed on the district.
8. **Audio pass**: tyres, wind, braking, ambient, other vehicles (procedural is fine; silence is not).
9. **In-world route guidance** (arrow/ghost line) so lessons stop depending on the minimap.
10. **Analog input shaping for keyboard** (attack/release ramps on W/S) so smooth-stop skill is the student's, not the filter's.
