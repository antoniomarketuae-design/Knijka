# Scenario Studio — architecture for 400+ individual driving tasks

**Status: PROPOSAL for founder review — no production until approved.**
Founder brief 2026-07-15 (micro-scenarios, per-task maps, view modes, Shadow Car,
correct/incorrect demos, 5 difficulty levels, catalog UX, agent-scaled production).
Reference image: top-down parking lot with colored approach paths (red/yellow/green/blue)
into a perpendicular bay — the visual language for path teaching.

---

## 0. Critical analysis first (what the brief gets right, what it misses, where the traps are)

### What the brief gets right
- **One task = one focused map** is pedagogically correct (learning-occasion density,
  SWOV — the same research that drove the exam bank) and already PROVEN in our stack:
  the полигон is exactly this (purpose-built micro-district, own JSON, 16/16 contract
  tests on first run). The engine is map-agnostic at the data layer.
- **Teach both correct and incorrect** matches error-based-learning research — with one
  hard caveat (below).
- **Difficulty ladder** maps almost 1:1 onto machinery we ship today.

### The three traps to avoid
1. **The 400-hand-authored-scenarios trap.** 400 bespoke maps + scripts is an
   unmaintainable content swamp (every engine change breaks 400 artifacts). The exam
   bank already proved the correct shape: **author FAMILIES, generate VARIANTS**.
   Target: **~50–60 scenario TEMPLATES** (hand-designed, high quality) × parametric
   variants (bay width, traffic density, weather, night, tier) = **400–1,500 playable
   tasks** from a maintainable source of truth. 9 exam shells → 18,396 variants is the
   existence proof.
2. **The second-renderer trap.** "2D top-down view" must NOT become a separate 2D
   engine. It is an **orthographic camera mode over the same 3D scene** (+ path
   overlays like the reference image). One world, N cameras. Anything else doubles
   every asset and every bug forever.
3. **The re-simulation trap (Shadow Car).** Replaying a demonstration by re-running
   physics is fragile (solver nondeterminism across devices/frame rates). The Shadow
   Car must be a **recorded kinematic trace** played back as a ghost — bit-stable,
   scrubbable, slowable, comparable. Physics runs only for the STUDENT's car.

### What the brief is missing (added to the design)
- **Learner-model integration**: scenario results must feed the same concepts →
  mastery → readiness → XP loop as everything else (each template carries conceptIds
  from the 152-graph; doc 72 archetype ids for provenance). Otherwise the studio is a
  detached minigame.
- **The oncoming-traffic capability (N1)** is a hard dependency for ~10 of the listed
  situations ("waiting for a safe opportunity to turn left", merging, overtaking
  judgment). It is the #1 ranked missing capability in doc 72 and must be scheduled
  as ENGINE work inside this program, or those templates wait.
- **Low-speed physics fidelity**: parking scenarios live at 0–10 km/h in REVERSE with
  full steering locks. The raycast vehicle + A1 driveline support this, but the feel
  and the collision envelope at bumper-to-bumper distances need a dedicated tuning
  pass + tight obstacle colliders (parked cars in scenarios must be HITTABLE with
  precise boxes, not the 150-cap curb-decoration pass).
- **Weather gaps**: rain + night ship today; **fog and snow do not** (fog exists only
  as the rain-preset haze; snow needs ground/asset/handling work). Templates are
  tagged by required conditions so the catalog can ship before snow exists.
- **Incorrect-demo safety rule** (research-backed): wrong ways are DEMONSTRATED
  (watch the ghost fail, with narration) — the student is never scored on
  *performing* the wrong way, and incorrect demos are visually branded (red ghost,
  ❌ chrome) so no one memorizes a wrong pattern as neutral.
- **Attempt recording** (needed for compare-vs-shadow) doubles as the input for A15's
  replay/mistake-map and the future LLM debrief — one trace format serves all three.
- **Mobile parity**: every view mode must work with the P1 touch layer; top-down +
  scrub timeline are actually EASIER on mobile than cockpit — an opportunity, not a tax.
- **Locale field from day one** (`bg-BG`), but no country-agent work now — Bulgaria
  is the product (YAGNI on "country-specific regulation agents" until expansion).

### What we deliberately will NOT build
- A separate 2D engine (ortho camera instead) · re-simulated ghosts (traces instead)
- Free practice of illegal maneuvers (demos only) · snow/fog engine work in phase 1
- 400 bespoke maps (parametric map archetypes instead) · country packs.

---

## 1. What already exists (the 70%)

| Brief item | Existing machinery |
|---|---|
| Per-task maps | Multi-map seam (`LessonSpec.world.districtId`), полигон generator + contract tests (`tools/maps/gen_poligon.mjs` pattern) |
| Task grading | Objectives with hardened contracts (bay-locked parkInBay, stimulus-locked stops, met-red, exit-signal) + 30 Наредба-38 detectors + FP armor (70 innocent cases) |
| Real-life grounding | Doc 72: 151 archetypes with law refs, severities, frequency weights |
| Difficulty ladder | Instruction→Practice→Assess pre-drive modes; examMode (coach off); variant TIERS in the exam bank; difficulty presets (Начинаещ/Нормален/Напреднал) |
| "Follow the route" | A7 guidance ribbon (arclength shader, chevrons) — the Shadow PATH is a restyle of this |
| Correct-driver logic | **The C1 driver-bot**: plan-based signal handling, curvature-capped speeds, mirror scans, signaled turns — drives full exam routes with ZERO violations through the production stack. This IS the Shadow Car's brain and the QA gate. |
| Explain what/why/rule | Catalog: explanationBg + lawRef + correctiveBg for every code (type-enforced); teach-pause cards; warn-once policy |
| Scoring → learning loop | serializeRuleEvents → server regrade → concepts/mastery/readiness/XP (A14) |
| Views | Cockpit (contract-tested) + chase cameras; minimap machinery (2D polylines) |
| Staged actors/hazards | Orchestrator stage() API: 6 event kinds, deterministic seeds |
| Production discipline | Template→generate→property-validate→bot-verify→adversarial-revise (the exam-bank pipeline, battle-tested through waves B/C/D) |

**The genuinely new 30%:** ScenarioSpec + catalog UX · map-archetype generators ·
trace recording/ghost playback + timeline UI · orthographic top-down mode + path
overlays · incorrect-demo authoring · scenario rubric layer (placement/observation
scoring beyond violations) · low-speed/reverse tuning + precise obstacle colliders ·
oncoming machinery (N1) for the turn/merge families.

---

## 2. ScenarioSpec v1 (the standard template — one per TEMPLATE, variants derived)

```ts
interface ScenarioSpec {
  id: string;                      // "sc-park-perp-rev" (template) → variants "sc-park-perp-rev@L3-narrow-rain"
  family: ScenarioFamily;          // parking | junction | signals | pedestrians | lanes |
                                   // roundabout | merging | hazards | conditions | vru | exam-drills
  tagsBg: string[];                // catalog filters („паркиране", „заден ход")
  titleBg: string; objectiveBg: string;           // 1. name  2. learning objective
  archetypeIds: string[];          // doc-72 provenance (e.g. PK-02) — REQUIRED
  conceptIds: string[];            // 152-graph → mastery/readiness feed — REQUIRED
  map: { archetype: MapArchetype;  // parking-lot | t-junction | signal-x | roundabout | ...
         params: Record<string, number|string>;   // baySlots, bayWidthM, laneCount…
         districtId: string };     // generated + committed like poligon-v1
  start: SpawnRef;                 // 3. starting situation (+ cold/ready, gear)
  instructionsBg: StepText[];      // 5. numbered instructions (step-by-step view)
  success: ObjectiveParams[];      // 6. the graded contract (existing objective kinds)
  rubric?: RubricSpec;             // placement mm-accuracy, attempts, observation checks, par time
  shadow: TraceRef;                // 7. the correct demonstration (recorded trace)
  mistakes: MistakeDemo[];         // 9/10. { traceRef, titleBg, whatWentWrongBg, codeRefs[] }
  teach: { whenBg, whyBg, lawRef, examinerBg };   // the what/when/why/rule/expectation card set
  levels: LevelSpec[];             // L1..L5 param deltas (aids, traffic, conditions, tolerances)
  staged?: StagedEventSpec[];      // hazards/actors via the orchestrator
  conditions?: ConditionAxis;      // dry/rain (+night); fog/snow tags allowed, gated "soon"
  localeBg: "bg-BG";
}
```
Compiles INTO the existing lesson machinery (a scenario is a micro-lesson) — the
rules engine, teach-pause, escalation, wire grading, XP feeds all work unchanged.
**No engine fork.**

## 3. Map components (the archetype factory)
~12–15 parametric generators in `tools/maps/` (gen_poligon.mjs is the mold), each
emitting a valid district JSON + auto-running the contract battery (world builds,
runtime grades, traffic graph closes, spawns locate):
parking-lot (bays ⊥/∥/echelon, width/count/occupancy params) · straight-street
(lanes, parked cars, bus stop) · T-junction (priority variants) · X-junction
(signalized/uncontrolled) · roundabout (Ø, lanes) · merge-lane · rural-curve set ·
zebra block · narrow-street (meeting) · hill-ramp (needs slope capability — flagged) ·
motorway segment (doc 74 P3 risk noted). Every map: road + markings + signs + props +
obstacles + spawn + finish, nothing else (the brief's principle).

## 4. View & POV modes (one scene, N cameras)
- **Cockpit** (exists, contract-tested) · **Chase** (exists)
- **NEW Top-down**: orthographic camera, height/zoom presets, path overlays rendered
  as ground ribbons (reference image's colored lines = shadow trace in blue/green,
  student attempt in yellow, mistake demo in red)
- **NEW Orbit/cinematic**: damped free orbit for demo playback only (never graded)
- **NEW Step-by-step instructional**: the timeline pauses at authored keyframes with
  the teach cards (this + timeline = the founder's "4D": time, guidance, consequence)
- Grading runs ONLY in cockpit/chase; top-down/orbit are learning views. The
  cockpit-lock is about what GRADES, not about what the student may look at: since
  the 2026-07-17 ruling every rung L1–L5 allows top-down driving (§7), and a rung
  removes it only by authoring `topdownAllowed: false`.

## 5. Shadow Car (the ghost system)
- **Recording**: the C1 driver-bot (extended with maneuver primitives: reverse-park
  arcs, three-point turns) OR a hand-driven session, captured as `ScenarioTrace`:
  20 Hz kinematic samples {t, x, y, heading, steer, speedKmh, gear, indicators,
  brake/throttle, glance events, driveline events} + authored ANNOTATION keyframes
  {t, textBg, kind: observe|signal|brake|steer|wait}. Stored as versioned JSON next
  to the map (small: ~60 s ≈ 25 KB).
- **Playback**: translucent hero-car ghost (blue chrome; red for mistake demos),
  front wheels steer per trace, indicators blink, brake lights lit, observation
  moments flash a mirror/shoulder icon; path ribbon ahead/behind. Timeline UI:
  play/pause/0.25–1×/scrub/loop-section/step-to-next-annotation.
- **Follow & compare**: student drives WITH the ghost (offset tolerance ring, "you
  are 0.8 m wide of the line" hints at L1–L2); every attempt records the same trace
  format → side-by-side replay + deviation heat coloring + the A15 mistake map.
- **Validation rule**: every shadow trace must replay through the rules engine with
  ZERO violations (CI gate — a "correct" demo that grades dirty cannot ship).

## 6. Feedback & scoring
Three verdict classes, mapped to machinery that exists:
- **Illegal** = ViolationCodes (official points, terminates at опасна) — rules engine.
- **Unsafe-but-legal** = advisory events (0 т., coach card, counts in the rubric) —
  NEW thin class beside commendations (e.g. „твърде близо до колата отпред при
  паркиране", „не изчака достатъчно за сигурна пролука").
- **Correct** = commendations + rubric points.
`RubricSpec` (NEW, per template): placement accuracy (bay centering/heading —
parkInBay already measures), maneuver economy (attempts, direction changes),
observation completeness (glances at annotated moments), par time (never a hard
fail — time pressure only at L5). Final screen = official points + rubric stars
(1–3) + the existing corrective texts + „какво да подобриш" + retry. All results
feed mastery/XP via the shipped A14 path.

## 7. Difficulty levels (mapped to existing machinery)
| Level | Name | Aids | Machinery |
|---|---|---|---|
| L1 | Воден опит | Shadow ON + follow-hints + pause-on-error | teach-first coach, Instruction mode |
| L2 | Частична помощ | Path ribbon only, hints after idle | Practice mode patterns |
| L3 | Самостоятелно | No aids, normal grading | standard lesson grading |
| L4 | Изпитни условия | Coach OFF, official protocol | examMode (exists) |
| L5 | Усложнени | + traffic/pedestrians/rain/night/narrow/time | variant tiers + staged events + conditions |
Level = parameter delta on the SAME template — never a copy.
**Top-down (`topdownAllowed`) is granted on EVERY rung, L1–L5** — founder ruling
2026-07-17: it is a POV, not an aid (§12), and a reverse-park is unreadable without
it; denying it at L4 while every exam-bank practical variant granted it was an
inconsistency. §4's cockpit-lock governs the GRADED views only. A rung may still opt
out explicitly with `aids: { topdownAllowed: false }`; none ships that way today.

## 8. Catalog UX (the Simulator category)
`/simulator` gains a third zone (beside curriculum + exam): **„Сценарии"** — filter
chips (family, level, conditions, „изпитни упражнения"), search, per-card: title,
family icon, level dots, personal best stars, „с Shadow Car" badge. Progress feeds
the dashboard weak-spots/readiness like everything else. Levels gate softly
(L4 unlocks after L3 stars, etc.) — but any template's L1 is always open (this is a
practice library, not a second campaign).

## 9. Production pipeline (the assembly line; every stage gate is automated where possible)
1. **Research/spec** (doc-72-grounded): template one-pager — objective, archetypes,
   law refs, rubric, level deltas. [scenario-research + rule-validation agents]
2. **Map**: pick/extend archetype generator, emit district, contract battery green.
   [map agents]
3. **Correct path**: bot script (or hand drive) → trace → **auto-gate: replays with
   0 violations + completes the success contract**. [driving-behavior agents]
4. **Annotations + teach copy**: keyframes, what/when/why/rule/examiner texts —
   catalog-linked, law-cited. [content agents]
5. **Mistake demos**: 2–4 scripted wrong runs → traces; each MUST grade the exact
   intended codes (auto-asserted). [behavior agents]
6. **Wire + variants**: levels/conditions/tiers; property tests over every variant
   (the exam-bank pattern). [assembly agents]
7. **QA**: independent bot re-run + adversarial FP probe (innocent completion = 0
   violations) + human/founder spot-drive of new FAMILIES (not every variant).
   [QA agents — the C/D-wave discipline]
8. **Publish**: catalog entry + dashboard integration + docs.
Shared standards: naming (`sc-<family>-<slug>`), one PR per template, the A12 FP
rule for any detector touch, determinism law (no Date.now/random).

## 10. Roadmap
- **Phase P0 — the prototype (≈1 wave):** ONE template end-to-end, full structure
  1–15: **„Перпендикулярно паркиране на заден ход"** (the reference image):
  parking-lot archetype generator (params: bayWidth 2.7 m, 4 occupied neighbors) ·
  trace recorder + ghost renderer + timeline · top-down ortho mode + path overlays ·
  rubric v1 (placement/attempts/observation) · 1 correct + 2 mistake demos (too
  wide approach → clips neighbor; no observation → misses pedestrian) · L1–L4 ·
  catalog page v1 with this one card. **Gate: founder drives it and approves the
  form factor before any scale-out.**
- **P1 — machinery hardening + breadth proof (≈1–2 waves):** low-speed/reverse
  tuning pass + precise obstacle shells; attempt-compare view; then ONE template per
  family (~10 templates) to prove the pipeline generalizes; catalog filters.
- **P2 — the N1 engine build:** oncoming machinery (left-turn-across-path, gap
  acceptance, meeting on narrow street) — unlocks the turn/merge/overtake families.
- **P3 — scale:** template factory to ~50–60 templates × variants ⇒ 400–1,500 tasks;
  fog assets; slope capability (hill start family); rural/motorway archetypes as
  doc 74 planned.
- Non-goals until P3 ships: snow, country packs, free-roam anything.

## 11. Open decisions for the founder
1. Approve template-×-variant scale model (50–60 templates ⇒ 400+ tasks) vs literal
   400 hand-authored (strongly advise the former).
2. Approve prototype scenario = reverse perpendicular parking (matches the image).
3. Shadow Car ghost style: translucent hero car (recommended) vs arrow/wireframe.
4. Scenario access: free tier gets L1 of every template (recommended — the library
   IS the acquisition hook) vs gated behind premium_sim.
5. N1 (oncoming) scheduling: P2 as proposed, or earlier at the cost of P1 breadth.

---

## 12. FOUNDER RULINGS (2026-07-15) — the proposal is APPROVED with amendments
1. Scale model approved, amended: **150 hand-authored templates** (× parametric
   variants ⇒ well beyond 400 tasks). 2. Prototype = reverse perpendicular parking ✓.
3. Ghost = translucent car ✓. 4. Free tier gets L1 of every template ✓.
5. **N1 oncoming machinery: build NOW** (not P2). Additional immediate order:
**low-speed/reverse feel + precise colliders NOW**. Top-down mode confirmed as a
first-class POV option. Wrong-way content: demonstrated only, never practiced ✓.
Execution: ALL phases, autonomous, as many agents as required.
