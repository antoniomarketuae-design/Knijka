// Shared weather channel between the environment rig (writer) and the rest of
// the sim (readers): road wetness and rain intensity, both 0..1.
//
// Module-level store, NOT React state: SimEnvironment steps it once per frame
// and consumers inside useFrame read it imperatively (getWetness) at zero
// cost. The React hooks (useWetness/useRainIntensity) are for occasional
// consumers (material props, overlays) — they re-render only on quantized
// 0.01 changes, i.e. ~100 renders spread over a several-second transition and
// none at steady state.
//
//   wetness       — how soaked the road looks. Ramps up in ~4 s of rain and
//                   dries out over ~12 s after it stops (asymmetric on
//                   purpose: puddles outlive the shower). The world module
//                   maps it to roughness/darkening via wetnessToRoadParams.
//   rainIntensity — how hard it is raining *right now* (cloud cover, streak
//                   opacity, light dimming). Faster in/out than wetness.
//   fogIntensity  — how dense the FOG weather is *right now* (doc 72 AC-03).
//                   Drives the FogExp2 density/color blend, the light dims and
//                   the SkyDome gray-out. Slower in/out than rain — fog banks
//                   roll in, they don't switch. Fog does NOT wet the road
//                   (wetness stays a rain channel).
//   snowIntensity — how heavy the SNOW weather is *right now* (doc 72 AC-08
//                   winter grip). Drives a colder fog-like haze, a milder rig
//                   dim, a cold SkyDome wash, the SnowFlakes fall opacity and
//                   the cold ground-bounce whitening (SNOW_GROUND_WHITEN).
//                   Like fog, snow does NOT wet the road (white ground
//                   textures remain asset work).
//
// WHAT THIS STORE DOES NOT CARRY, MEASURED — sweep161, six BROKEN findings.
//
// 1. THE SNOW HAZE IS NOT „LIGHTER THAN THE FOG BANK". That claim stood in
//    this header until it was measured, and the frames refute it. sc-ac-snow,
//    sc-ac-fog, sc-ac-rain-lights and sc-ac-wet-braking all run the SAME map
//    (`ac-rain-v1`, 360 m straight street) under the SAME day preset, so their
//    `pc-right/03-ready.png` frames are a clean A/B. Mean sRGB, identical
//    rectangles:
//
//                        near road (620,500 120x30)   far road (830,395 60x14)
//      sc-ac-snow          72.4/ 84.8/ 97.8  L 82.6     126.5/137.0/151.9 L 135.5
//      sc-ac-fog           75.4/ 86.9/ 99.1  L 84.8     140.7/149.8/162.9 L 148.6
//      sc-ac-rain-lights   83.1/ 84.1/ 82.6  L 83.6     113.8/117.6/124.6 L 117.3
//
//    Snow renders 2.6% DARKER than fog near and 8.8% darker far — the two are
//    within a few percent of each other on every channel, and what difference
//    exists points the WRONG WAY for a snow-covered street. The audit's words
//    for the same frames: „the snow preset appears to fall through to the fog
//    preset", and „the road is bare grey asphalt … not one flake falls".
//    Confirmed by eye on the two `pc-right/03-ready.png` frames side by side:
//    sky, haze, asphalt and light are indistinguishable, and no flake appears
//    in either.
//
//    THAT TABLE IS sweep161 AND IT IS NOW HISTORY FOR THE NEAR ROAD ONLY.
//    Re-measured 2026-08-22 in the same two rectangles on
//    `.audit-frames/rebase/…/03-ready.png`, the re-drive at HEAD:
//
//                        near road                     far road
//      sc-ac-snow          95.7/108.7/122.1  L 106.9    137.9/153.1/164.8 L 150.7
//      sc-ac-fog           77.4/ 88.3/ 99.8  L  86.8    141.5/155.4/166.4 L 153.3
//
//    READ THE L COLUMN DOWN A TABLE, NEVER ACROSS THE TWO. Every RGB triple
//    on both tables reproduces to the digit at HEAD (re-measured 2026-08-23,
//    same rectangles, same frames), but the two L columns are computed with
//    DIFFERENT luma weights: the sweep161 rows are Rec.601 (0.299/0.587/0.114
//    — 72.4/84.8/97.8 gives 82.6), the rebase rows are Rec.709 (0.2126/0.7152/
//    0.0722 — the same triple gives 83.1, which is the figure §2's before/after
//    pair uses for that very frame). Every comparison drawn below stays inside
//    one formula and stands; only a subtraction ACROSS the tables would invent
//    a ~0.5 drift that is not in the pixels.
//
//    NEAR: snow is 23% BRIGHTER than fog — the road half of §2 landed and the
//    sign is reversed. FAR: 150.7 against 153.3, still 1.7% apart, because the
//    far field is haze and the haze is what THIS note is about. So §1 stands
//    unfixed exactly where it always lived, and its scope is now visible: the
//    two lessons diverge where the student's own lane is and converge into one
//    grey wall beyond it. Flakes DO now reach the frame (a handful of white
//    specks, countable by eye on the snow crop) — sparse, not absent.
//
//    THE HAZE HALF IS NOT FIXABLE FROM THIS FILE — the store already holds
//    four separate, correctly-ramped channels and hands snow and fog to the
//    same readers, saturated at 1 in both lessons. The differentiation lives
//    in `presets.ts` — DAY, the preset those frames were shot under:
//    snowWeather #e8ebef/0.012 against fogWeather #c9cdd2/0.020, a paler grey
//    at 0.6× the density, and the same ratio at dusk (0.013/0.022) and night
//    (0.015/0.024). Re-measured 2026-08-19: this note used to cite „0.022 …
//    HALF", which paired the DAY snow density against the DUSK fog one — a
//    stated measurement that did not reproduce, in a file whose whole
//    discipline is that its numbers do. Less haze reveals more dark asphalt,
//    which is the whole of the 3% and its wrong sign. Also
//    `SimEnvironment.tsx` (the `scratch.fogGoal` blend, the
//    `fogObj.density` damp and the SNOW_*_DIM / FOG_*_DIM constants) and
//    `SkyDome.tsx` (SNOW_SKY_WASH 0.75 vs FOG_SKY_WASH 0.85).
//
//    THE FLAKE HALF is `SnowFlakes.tsx`: the mesh mounts (SimEnvironment,
//    gated on `snowVisible && qp.snowParticles > 0`) and reads
//    getSnowIntensity() — which
//    this store saturates at 1 — so the missing flakes are geometry, not
//    signal. FLAKE_SIZE is 0.028 m in a box of AREA_HALF 20 m; a 2.8 cm quad
//    at cockpit distance is sub-pixel. The audit's „not one flake falls" was
//    two defects wearing one sentence, and only one of them was SnowFlakes:
//    before the scene-boundary primer the snow channel started at 0 and took
//    ~6 s to saturate, so `01-arrival` and `03-ready` were clear-weather
//    frames whatever SnowFlakes did. That half is closed — on the 2026-08-22
//    re-drive the flakes are THERE at 03-ready. What is left is density and
//    size: about half a dozen specks in a cockpit view, which reads as dust,
//    not as snowfall. That is the honest remaining defect and it is geometry.
//
//    THE ROAD HALF is this file, it is fixed below, and as of 2026-08-22 it
//    is the one half of this finding that has been MEASURED ON THE STUDENT'S
//    OWN SCREEN — see 2.
//
// 2. THE ROAD-SURFACE MAPPING BEARS SNOW, ITS READER PASSES IT, AND THE
//    STUDENT CAN SEE IT. `wetnessToRoadParams` is the only road-material
//    mapping in the codebase (StaticWorld consumes it for asphalt, decals and
//    paint) and its only input was RAIN wetness, so no amount of snow could
//    move the road by one shade — sc-ac-snow rendered clean grey asphalt while
//    it was graded at 40% grip. `roadSurfaceToParams` (below) is that mapping
//    with the snow term it was missing, and `wetnessToRoadParams` is now its
//    `snow: 0` case, so every dry and rain scene is bit-identical.
//
//    THIS NOTE USED TO SAY THE OPPOSITE, AND SAYING IT IS THE POINT. Until
//    2026-08-22 it read „IT CHANGES NO PIXEL UNTIL ITS READER PASSES THE
//    VALUE … So this finding is NOT closed", and listed as measured fact that
//    `index.ts` did not export `roadSurfaceToParams` and that `StaticWorld.tsx`
//    called the rain-only mapping at :279, :294 and :313. All of that landed in
//    the SAME commit as the mapping (ed2dd6f, 2026-08-19) and the note was left
//    behind. A reader who trusted it would have re-done work already done, or
//    filed the routing open a third time — which is exactly the cost this file
//    keeps paying and exactly why every claim here is dated.
//
//    RE-MEASURED 2026-08-22 against the tree and against the frames:
//      · `index.ts` exports `roadSurfaceToParams` and the type
//        `RoadSurfaceState` beside `wetnessToRoadParams`.
//      · `StaticWorld.tsx` takes `const snow = useSnowIntensity();` beside
//        `const wetness = useWetness();` and passes `{ wet: wetness, snow }`
//        on the ROAD and DECAL calls. PAINT stays on `wetnessToRoadParams`,
//        deliberately: brightening the markings buries them in the road, and
//        the rule engine grades lane keeping and stop lines off exactly those
//        markings. StaticWorld's own comment now says so at that call site.
//      · The routing guard at the foot of the test file is GREEN, and its
//        companion test cuts each leg out of the REAL sources in memory and
//        watches that axis go false — so the green is load-bearing, not
//        vacuous.
//      · AND THE PIXELS MOVED. Audit near-road rectangle (620,500 120×30) on
//        `pc-right/03-ready.png`, `ac-rain-v1` + DAY preset in both lessons:
//
//                          sc-ac-snow          sc-ac-fog (control)
//          sweep161        mean sRGB L 83.1     L 85.3      snow 2.6% DARKER
//          rebase, HEAD    L 106.9              L 86.8      snow 23% BRIGHTER
//
//        The sign the audit convicted is reversed, the control drifted 1.8%
//        across the two builds, and the effect holds for the whole drive
//        (L 106.9 at arrival, 119.3 at t001s, 120.0 at t100s, 126.6 stopped).
//
//    THE ASSERTION THAT EXISTED TO CATCH THE HALF-ROUTED STATE WAS DELETED BY
//    THE CHANGE THAT CAUSED IT. The old test „carries no snow/ice term"
//    carried the docblock „a snow term added here must arrive together with
//    its StaticWorld reader, or this assertion is the thing that goes red".
//    Its body never implemented that promise (it compared f(0) with f(0) and
//    could not go red for any implementation), and the lane that shipped the
//    snow term removed it and replaced it with an assertion that the road
//    rendered under full snow EQUALS the dry road — the defect asserted as
//    correct. The test file now carries the guard that promise describes.
//
//    WHAT IS STILL OPEN ON sc-ac-snow, so the green above is not read as the
//    whole finding: the FLAKES are thin (`SnowFlakes.tsx` — a handful of
//    sub-pixel quads reach the frame, countable by eye on the same
//    `03-ready`), and the HAZE is still fog's — see 1. Neither is this file.
//
// 2a. THE ROAD WAS THE ONLY SURFACE SNOW COULD LAND ON, AND THAT IS NOW FIXED
//    ELSEWHERE — 2026-08-26, routed OUT of this file so the next reader does
//    not re-derive it. The w11 re-judge of `sc-ac-snow:cfb2d46d` narrowed the
//    row to „snow accumulates on the ground plane only; canopies, railings and
//    building faces take none", and the cause was one sentence long: the two
//    call sites in §2 above were the ONLY consumers of the snow channel that
//    changed a surface, so the whole world outside the carriageway rendered
//    July. The general term now lives in
//    `world/textures/snowCover.ts` — a per-fragment `mix` toward this file's
//    own DAY `snowWeather` colour, weighted by the world normal's Y, attached
//    to the five shared prop materials in `WorldProps.makeSharedMaterials()`
//    and driven once per frame by `DistrictWorld` off `getSnowIntensity()`.
//    It had to be per-fragment and not a `roadSurfaceToParams` sibling: that
//    mapping is right for a road BECAUSE a road is flat, and a whole-material
//    tint on a tree lights its underside as brightly as its top and stops it
//    reading as a tree. Nothing in this store changed and nothing needed to.
//    Still open there and stated honestly at that file: no R0 look has been
//    done on the result, and vehicles (TrafficLayer's parked row, the most
//    visible bare up-facing surface left in `01-arrival`) are not covered.
//
// 2b. ICE STILL HAS NO CHANNEL, AND MUST NOT GET A ROAD-MATERIAL ONE.
//    sc-ac-ice and sc-ac-bridge-ice author `weather: "dry"` (the vocabulary is
//    {dry|rain|fog|snow}, there is no cold state to author) and render high
//    summer under a briefing that says „зимна сутрин е около нулата" — full
//    green trees, blue sky, warm facades, verified by eye on
//    `sc-ac-bridge-ice/mobile-right/04-t076s.png` and
//    `sc-ac-ice/pc-right/03-ready.png`. The fix is NOT to make the ice
//    visible: black ice is invisible, and that is the lesson those two teach.
//    What is missing is the SEASON, and none of it lives here — a `cold`/
//    `winter` flag on `LessonSpec.environment` (contracts.ts) + compile.ts,
//    a winter grade in `presets.ts` (low cold sun, no warm facade bounce),
//    and bare trees / grey verges in the world module. Routed, not fixed.
//
//    RE-VERIFIED 2026-08-22, because „there is no cold state to author" is the
//    load-bearing claim and a routing note is worth nothing if it has gone
//    stale: `contracts.ts:240` still types the field
//    `environment?: { timeOfDay?: "day"|"dusk"|"night"; rain?; fog?; snow? }`
//    and `lessons/scenario/types.ts:190` still spells the authoring vocabulary
//    `weather?: "dry" | "rain" | "fog" | "snow"`. Nothing between a lesson and
//    this store can say „winter", so no amount of work in this file could put
//    a season on the ice pair's street. And the symptom is unchanged on the
//    steered re-drive at HEAD
//    (`.audit-frames/rebase/frames/sc-ac-bridge-ice__pc-right/03-ready.png`):
//    full-leaf green trees, blue sky, warm sunlight on the facades, under a
//    step 1 that reads «Потегли внимателно — зимна сутрин е около нулата, а
//    улицата е суха и черна.» The А15 post is placed; the season it warns
//    about is not.
//
// 2c. AND THE SEASON IS NOW THE SMALLER HALF OF IT. MEASURED 2026-08-27 —
//    „SAME STRETCH OF STREET" IS A BUILDER, NOT A PRESET, AND IT ARRIVED IN
//    WAVE 3. §2b routes the ice pair's summer look to a `winter` flag +
//    `presets.ts` + „bare trees / grey verges in the world module", and that
//    is still the right address for the LIGHT and the FOLIAGE. It is no
//    longer the whole address, and a reader who works only that list will
//    re-derive a season for a defect that is 43 m of invented city block.
//
//    `world/builders/worldRim.ts` (added in bbf1223, the wave-3 repair for
//    „the world simply runs out and the car keeps going") builds a CONTIGUOUS
//    BELT OF BUILDING MASSES around every district whose `meta.mapKind` is a
//    string — 102 `scenario-*` + poligon-v1, i.e. every map any lesson in this
//    file runs on. `buildWorldGeometry.ts:472` calls it unconditionally and
//    hands the result to `buildBuildings(..., extraVolumes)`, which pushes the
//    masses through the SAME walls / roofs / collider accumulators as an
//    authored блок. Read out of `builders/constants.ts`, the belt's OUTER face
//    stands at TERRAIN_MARGIN_M(60) − WORLD_RIM_TERRAIN_INSET_M(3) = 57 m
//    outside the declared box; its NOMINAL inner face at 57 −
//    TERMINUS_CLOSE_DEPTH_M(14) = 43 m, and a mass may step in by up to
//    WORLD_RIM_STEP_M(6) more, so 37…43 m is the honest inner band. Height is
//    clamped to 9…22 m (TERMINUS_CLOSE_MIN/MAX_HEIGHT_M).
//
//    ON THE ICE PAIR'S OWN MAPS. ac-ice-v1, ac-night-v1 and ac-rain-v1 declare
//    the IDENTICAL box (minX −28.12, minY 0, maxX 14.125, maxY 360), so the
//    belt's east run stands at x 51.1…71.1 and its west run at x −85.1…−65.1,
//    both for the full 360 m plus the corners. The own lane is x = 4.06, so
//    the nearest face is 47.1…53.1 m off the student's right shoulder; a 22 m
//    mass at 47 m subtends 25°. Those three lessons author ONE building each
//    (ac-ice-v1 height 6 „default", ac-night-v1 7 „default"); ac-rain-v1
//    authors 19. Every OTHER block face in their frames is this belt.
//
//    AND IT IS THE SAME BELT, MASS FOR MASS. The id is composed at
//    worldRim.ts:264 as `world-rim-${side}-${i}` — the DISTRICT IS NOT IN IT.
//    So `hash01('rim-depth:'+id)`, `hashString('rim-height:'+id)` and — via
//    `buildings.ts:268` — `facadeVariant(b.id, …)` all return the same values
//    on any two districts that split their runs the same way. Two 360 m
//    streets with one bounds box get the same positions, the same depths, the
//    same heights and the same facade variants. That is the whole of the audit
//    row this file has been carrying as a weather problem — sc-ac-ice
//    :86eab7e9, „the same mid-rise block facades … as sc-ac-bridge-ice" — and
//    nothing in this store, in `presets.ts` or in a season flag can move it.
//
//    IT ALSO RE-DRESSES MAPS THAT ARE NOT STREETS: mw-v1 authors ONE building
//    over 2,606 m of motorway and ov-crest-v1 TWO over 900 m of извънградски
//    път, which is why sc-ac-truck-spray's «Магистрала» and sc-ov-crest-curve's
//    «Учебен извънградски път» both photograph as a boulevard walled by
//    six-storey blocks in w13 while their district JSONs are unchanged (the
//    `content/world/` and `platform/public/world/` copies are byte-identical
//    for all fifteen maps in this lane — the world that loads IS the world
//    that is authored). The w13 judges read that as „the route itself was
//    rebuilt"; the route was not touched.
//
//    THE EXACT EDITS, NEITHER OF THEM IN THIS FILE:
//      · worldRim.ts:264 — put the district in the mass id
//        (`world-rim-${district.meta.district}-${side}-${i}`), or key the three
//        hashes off it, so the belt stops being one building repeated across
//        the catalogue;
//      · worldRim.ts — the belt's KIND must follow the road class. A rim for
//        `class: "motorway"` or a rural `unclassified` is a treeline, an
//        embankment or a field edge, not a 22 m facade; today `frontageHeightM`
//        is the only per-district input and it clamps to [9, 22] whatever the
//        map is.
//    A THIRD ONE IS GRADED, AND IT IS THE SHARP ONE: the belt's walls go into
//    `colliders.buildings` (buildings.ts:269 — the same accumulator), so
//    reaching the edge of the drawn world is now booked as «Удар в неподвижно
//    препятствие», Наредба № 38 прил. 5 т. 10 б. „в", −10 изпитни точки,
//    ОПАСНА ГРЕШКА, exam terminated. On `.audit-frames/w13/frames/
//    sc-ov-oneway__pc-right` the RIGHT leg ends exactly there: 0 км/ч against a
//    flat unlit facade at 04-t133s, objectives 2/3 unmet, and the fault card's
//    own words are «пътят ѝ е излязъл извън платното за движение». Before
//    wave 3 that drive ended on a green plane and graded nothing. Leaving the
//    training area must not be a Наредба-38 dangerous error — it needs its own
//    end-of-drive event, or the rim colliders must be excluded from COLLISION.
//    Filed against the world/scene lane; nothing here can reach it.
//
// 3. THIS STORE HOLDS THE LOOK; NOTHING HOLDS THE GRIP, AND THE TWO ARE
//    AUTHORED SEPARATELY. What the student SEES comes from
//    `environment.{rain,fog,snow}` → setWeatherTarget → these channels. What
//    the car DOES comes from `LessonSpec.physics.{wetGrip,snowGrip}` →
//    VehicleRig `gripFactor`, an independent authored field that LessonScene
//    documents as „never derived from environment.rain/snow". Census
//    RE-MEASURED 2026-08-22 over the 38 `lessons/scenario/templates-*.ts`
//    files with comments stripped (the „47 / 15" this note first gave did not
//    reproduce and called its unit „lessons"; the 2026-08-19 re-count of
//    „45 / 14" is now 44 / 14, one rain authoring having moved in the repair
//    rounds — the drift is the reason this line carries its method): 44
//    authorings of `weather: "rain"` against 14 of `physics: { wetGrip: true }`
//    — so ~30 render a soaked road and brake on dry grip. For scale, the whole
//    corpus authors `weather: "fog"` twice, `weather: "snow"` once,
//    `snowGrip` once and `crosswind` twice. The unit is TEMPLATE
//    AUTHORINGS, not lessons: each expands to variants, so the per-lesson
//    figure is larger and only the compiled corpus can give it; the gap is
//    the point, not its third digit. And the ice pair renders a dry summer
//    street and runs ICE_PATCH_GRIP_FACTOR 0.15. The rule engine grades off
//    the PICTURE (`tick.rain/fog/snow` → conditionSpeed*Factor, and
//    FOLLOWING_TOO_CLOSE_FOR_RAIN, whose stated justification is „in rain the
//    braking distance grows ~1.5×" — true only in the 14). Reconciling those
//    two authored fields is a templates/compile change, not a store change,
//    and it must not be done by deriving grip from the weather tag: the
//    shadow traces of the render-only-rain lessons were recorded at dry
//    decel, so flipping them to wet grip would fail students against a ghost
//    they cannot match.
//
// 3b. TWO CORRECTIONS TO 3, BOTH READ OUT OF THE CODE RATHER THAN INFERRED.
//    · SEEN AND GRADED DO COME FROM ONE SOURCE. `lesson.environment.{rain,
//      fog,snow}` feeds BOTH this store (LessonScene's `<SimEnvironment rain
//      fog snow>` props → setWeatherTarget) AND the tick the engine grades on
//      (LessonScene's `runtime.sample(sample, t, isNight, rain, …, fog, snow)`
//      → `tick.rain/fog/snow` → engine.ts `const raining = tick.rain === true`,
//      the conditionSpeed*Factor site). One authored field, two
//      consumers. The single place they COULD disagree was this store's own
//      state, because it is a module singleton that ramps from 0 and outlives
//      a scene: the engine's flag is true on frame 1 while the picture took
//      4-6 s to arrive, and a dry lesson opened after a rain one was graded
//      dry over a wet road for 12 s. That is what `primeWeather` closes.
//    · THE ~30 RENDER-ONLY-RAIN TEMPLATES ARE NOT SILENT. compile.ts'
//      LADDER_COPY_ORDER carries a distinct rung for each case — „Мокър паваж"
//      when rain AND wetGrip are both authored („настилката държи около 70%…"),
//      and „В дъжд" when only the rain is („включи чистачките…", no grip
//      claim). The student is told which one they are in. The genuinely
//      unnarrated direction is the MIRROR: grip WITHOUT a picture. The ladder
//      has a rung for that too („Настилката вече е истинска"), but it fires on
//      `physics.wetGrip/snowGrip`, and the ice pair's 0.15 arrives as
//      `built.gripPatches` from the DISTRICT's zone spans instead — so nothing
//      tells the student the road changed, and nothing in the picture shows
//      it. A car that slides on what looks like dry summer asphalt convicts
//      the student of a mistake the scene never let them see coming. That is
//      the founder's own false-failure complaint, and it is the sharpest
//      unclosed thing behind sc-ac-ice / sc-ac-bridge-ice. Routed:
//      compile.ts (a gripPatches rung) + the season work in 2b.
//
// 4. TWO FINDINGS ROUTED HERE HAVE NO CHANNEL IN THIS STORE AT ALL, AND ONE
//    MUST NOT BE GIVEN ONE.
//    · sc-ac-crosswind („the wheel shows no counter-steer at any point, there
//      is no wind force visible in the car's attitude"). Wind is real in the
//      physics — `components/sim/LessonScene.tsx:2009-2017` passes VehicleRig's
//      `windLateralN` / `windGustAmplitudeN` / `windGustPeriodSec` from
//      `lesson.physics.crosswind` (re-verified 2026-08-22) — and is rendered by
//      nothing. A wind channel HERE would be a fifth 0..1 number with no author
//      (nothing writes `environment.wind`) and no reader, i.e. exactly the dead
//      API this lane is meant not to add. The lesson needs the disturbance made
//      VISIBLE where it already exists: body attitude in VehicleRig and the
//      cockpit wheel, which `HeroCarBody.tsx:361` drives from `sim.steerRad` —
//      the DRIVER'S INPUT, so it can only ever show a correction that was made,
//      never the push that demanded one.
//
//      TWO CORRECTIONS TO THE FINDING ITSELF, from the steered proof drive at
//      dd4e598 (`.audit-frames/proof/frames/sc-ac-crosswind__pc-right/`),
//      because the frame it was filed on came from a harness that could not
//      steer. „The wheel shows no counter-steer at any point" was measured on a
//      drive with no steering input at all — the wheel was telling the truth,
//      and that half is an instrument artifact. And „nothing in the cockpit
//      reports a lateral disturbance" is no longer so: at t103s the scene
//      carries a live wind coaching line, «Вятърът диша: отслабне ли поривът,
//      отпускаш корекцията плавно — никога с втори замах.» What survives both
//      corrections is the half that matters for the picture: the wind is
//      NARRATED and never SHOWN — no bend, no drift cue, nothing in the world
//      that a student could learn to read before the push arrives.
//    · sc-ac-truck-spray („the water curtain the lesson is named after never
//      exists"). Spray is emitted BY an NPC and occludes the air behind that
//      one vehicle — it is not a scene-wide 0..1 like fog, and putting it in
//      this store would make every driver in the lesson spray. Routed to the
//      NPC/effects layer; the only correct claim on this store is that spray
//      should ride the rain channel's intensity, not replace it.
//
//      STILL REPRODUCES AT HEAD, checked on the steered re-drive
//      (`.audit-frames/rebase/frames/sc-ac-truck-spray__pc-right/04-t101s.png`)
//      so this routing is not being carried forward on a stale frame: the rain
//      streaks fall, the carriageway is wet-dark, the truck's tail lamps are
//      lit — and the air behind it is perfectly clear. Briefing item 3 says
//      „гумите му вдигат пелена от пръски, в която не се вижда нищо"; the
//      student sees straight through it to the horizon. Nothing in this store
//      changed that and nothing in this store can.
//
//      AND THE ONE PIECE OF EVIDENCE THAT SAID OTHERWISE IS THE ROUTE MARKER —
//      2026-08-25. The w10-4 re-judge downgraded this row to PARTIAL on the
//      reading that „from about t150 a translucent pale-cyan column is drawn
//      attached to the truck and rising from its roof … absent at 04-t001s and
//      04-t059s". Opened: `.audit-frames/w10-4/frames/sc-ac-truck-spray__pc-
//      right/04-t188s.png` carries TWO such columns, at x ≈ 1105 and x ≈ 1310
//      LANE NOTE 2026-08-27: the w14 re-drive settles this without the column
//      argument at all. On `.audit-frames/w14/frames/sc-ac-truck-spray__pc-
//      right/04-t101s.png` (run stamped 2026-08-27T17:09:37Z in that folder’s
//      `_audit-status.json`) the truck sits mid-frame with its tail-lamp bar
//      crisp, and the lane dashes, the hard shoulder, the grass verge, the
//      treeline and the tower blocks BEHIND it are every one of them sharp.
//      There is no column on the truck in this frame and no curtain across the
//      carriageway. The round blobs scattered over the glass are
//      `WindshieldDroplets` — an ego-camera overlay off `useRainIntensity`,
//      not something the truck emits.
//      of a 1440-wide shot, and the truck is at x ≈ 848. They are on the
//      VERGE, not on the vehicle — and the frame prints their name in its own
//      top-left legend: «стрелка и стълб светлина — завоят и целта по
//      маршрута». They are the route/target beacons (the same pale-cyan column
//      stands over «Карай дотук» on the night lessons), they appear at t150
//      because that is when the ego gets within draw range of the route end,
//      and they have nothing to do with rain. The air behind the truck is still
//      perfectly clear on that frame: no plume, no curtain, no visibility loss,
//      with ИНСТРУКЦИИ step 3 «гумите му вдигат пелена от пръски, в която не се
//      вижда нищо» legible beside it. The row stands whole and stays routed.

// 5. THE WAVE-7 RE-VERIFICATION — 2026-08-27, EIGHT ROWS, ONE VERDICT EACH.
//
//    Eight sweep findings are filed against THIS FILE and every one of them was
//    re-driven at HEAD and re-judged „still present". They are: sc-ac-crosswind
//    :a9db1738, sc-ac-bridge-ice:7eb16029, sc-ac-truck-spray:6f13e17b and
//    :ebaacf94, sc-ac-snow:f1673b60, :cfb2d46d and :0c76a9e9, sc-ac-ice
//    :86eab7e9 and :5372f176. NOT ONE OF THEM IS FIXABLE FROM THIS STORE, and
//    that is not a shrug — §1 through §4 already said so, row by row, and the
//    only thing a fifth wave can add is whether those routings are still TRUE.
//    They were re-taken rather than re-read. What changed, what did not, and
//    which frames it was measured on:
//
//    THE FRAMES. `.audit-frames/w14/frames/` is the 2026-08-27 re-drive (each
//    scenario folder carries an `_audit-status.json` stamped 17:09–17:47Z) and
//    is the freshest evidence in the corpus; `.audit-frames/w13/frames/` is the
//    round before it and is used wherever a SNOW-vs-FOG or ICE-vs-BRIDGE-ICE
//    A/B is needed, because w14 did not re-drive sc-ac-fog and a comparison
//    across two builds is the mistake §1's L-column warning is about.
//
//    THE ROAD TERM IS ALIVE AT HEAD AND REPRODUCES TO THE DIGIT (f1673b60,
//    0c76a9e9). Audit rectangles, `pc-right/03-ready.png`, ac-rain-v1 + DAY in
//    both lessons, mean sRGB with L709 (the rebase-table formula):
//
//                       near (620,500 120×30)      far (830,395 60×14)
//      snow  w13        95.2/108.0/121.3  L 106.3  137.9/153.0/165.1  L 150.7
//      snow  w14        95.2/108.0/121.3  L 106.3  137.9/153.2/165.0  L 150.8
//      fog   w13        76.8/ 87.5/ 98.9  L  86.1  141.5/155.2/166.0  L 153.1
//
//    Snow is 23.5% BRIGHTER than fog in the student's own lane and 1.5% apart
//    from it in the far field — the exact split §1 and §2 describe, two rounds
//    later, on a re-drive neither of them saw. So `roadSurfaceToParams` and its
//    StaticWorld readers are doing their whole job, and what is left of both
//    snow rows is the HAZE (`presets.ts` snowWeather #e8ebef/0.012 against
//    fogWeather #c9cdd2/0.020, plus SimEnvironment's SNOW_*_DIM/FOG_*_DIM and
//    SkyDome's SNOW_SKY_WASH/FOG_SKY_WASH) and the FLAKES (`SnowFlakes.tsx`
//    FLAKE_SIZE 0.028 m). Looked at, not only measured: on a 700×220 crop of
//    each `03-ready` the snow carriageway is plainly the paler of the two and
//    carries countable white specks the fog frame does not — but sky, bank and
//    far field are one grey wall in both, so „a student cannot tell them apart
//    from the arrival screen" survives as a statement about the HAZE. Neither
//    file is this one.
//
//    2a's OFF-ROAD TERM SHIPPED, AND ITS R0 LOOK IS DONE HERE FOR THE FIRST
//    TIME (cfb2d46d). `world/textures/snowCover.ts` is wired at HEAD —
//    `DistrictWorld.tsx:101` writes the uniform from `getSnowIntensity()` and
//    `WorldProps.tsx:653-654` attaches the hook in `makeSharedMaterials()`. It
//    is alive: at 8× on a 70×55 crop of the near street tree, the same tree in
//    the same pose is faintly paler on its UP-facing side in sc-ac-snow than in
//    sc-ac-fog. It is also nowhere near enough, and the row's own four nouns
//    say why. `makeSharedMaterials` covers five materials — signBody,
//    signalHousing, streetSteel, tree, furniture — so of „kerbs, pavements,
//    guard rail and building faces" only the RAILING (streetSteel) was ever in
//    scope; kerbs and pavements are StaticWorld's road/terrain materials and
//    facades are the buildings path, and none of the three has a snow term at
//    all. Measured on the w13 A/B, same camera, same map, L709:
//      tree canopy (500,350 24×24)   snow 142.1   fog 156.7
//      pavement    (400,405 60×10)   snow 112.4   fog 116.5
//      parked row  (1030,368 80×10)  snow  73.5   fog 103.7
//    Every off-carriageway surface reads DARKER in the snow lesson than in the
//    fog one, because at those distances the denser fog bank is what the pixel
//    is made of. The honest state: the prop half landed and is sub-threshold,
//    the road/terrain, building and vehicle halves were never started.
//
//    THE ICE PAIR IS NOT „NEARLY" IDENTICAL, IT IS IDENTICAL (5372f176, and
//    86eab7e9's other half). w13 `03-ready`, THREE rectangles, two DIFFERENT
//    districts (ac-ice-v1 520 m vs ac-bridge-v1 — ac-bridge-v1's own bounds are
//    minX −28.13 maxX 28.13, maxY 520, so this is not one map wearing two ids):
//                       near L709   mid (620,400) L709   far L709
//      sc-ac-ice          117.3          123.2             130.6
//      sc-ac-bridge-ice   117.5          123.3             130.6
//    Two-tenths of a level apart on every band. Both author `weather: "dry"`
//    under DAY, so this is exactly what the pipeline is built to produce, and
//    no edit in this file could make a black-ice street and a frozen deck look
//    like different mornings while both are spelled `dry`. Confirmed by eye on
//    `w14/.../sc-ac-bridge-ice__pc-right/03-ready.png` and `04-t075s.png`:
//    full-leaf green trees, warm sunlit facades and blue-grey sky under a coach
//    line that reads «Ясна зимна сутрин около нулата.»
//
//    AND 2b's ROUTING IS STILL LITERALLY TRUE, re-read in the tree rather than
//    trusted: `contracts.ts:276` still types `environment?: { timeOfDay?:
//    "day"|"dusk"|"night"; rain?; fog?; snow? }` and
//    `lessons/scenario/types.ts`'s `ConditionAxis` is still
//    `{ weather?: "dry"|"rain"|"fog"|"snow"; night?: boolean }`. There is no
//    token between a lesson and this store that can say „winter" (7eb16029).
//
//    THE WIND IS LIVE AND UNRENDERED, AND MUST NOT GET A CHANNEL HERE
//    (a9db1738). Re-read end to end 2026-08-27: `LessonScene.tsx:2296-2298`
//    passes `windLateralN = −CROSSWIND_BRIDGE_N`, `windGustAmplitudeN =
//    −CROSSWIND_GUST_AMPLITUDE_N` and `windGustPeriodSec` whenever
//    `lesson.physics.crosswind` is authored, and `VehicleSim.ts:510-518` adds
//    `windLateralN + amplitude·sin(2π·t/period)` to the body every step. So the
//    force is real, constant and position-independent — and on
//    `w14/.../sc-ac-crosswind__mobile-right/04-t101s.png` nothing in the world
//    moves for it: static tree blobs, no dust, no debris, no windsock. A fifth
//    0..1 in this store would have no author (nothing writes
//    `environment.wind`) and no reader, i.e. the dead predicate this lane
//    exists to stop shipping. The disturbance has to be shown where it already
//    exists — the world props and the car's own attitude.
//
//    ONE THING THIS ROUND DID CLOSE, and it was in a template, not here: the
//    lesson that named the wind's phase — sc-ac-wind-truck-pass — was telling
//    the student he was sheltered behind the truck and that the blow would land
//    at the cab line. Neither is in the physics above, and POOR_LANE_KEEPING
//    grades him on the drift that belief produces. Fixed at
//    `lessons/scenario/templates-conditions2.ts` (instructions 3 and 6, and the
//    objective); the DEPICTION half stays routed to the render layer.

import { useSyncExternalStore } from "react";

// THE EIGHT RAMP RATES BELOW STATE A WEATHER ORDER, AND IT IS NOW ENFORCED.
// Rain is a switch, fog rolls in, snow is the slowest front in both
// directions, and the road stays wet after the shower has passed. Measured
// 2026-08-22 by mutating each constant and running the test file: five of the
// eight — RAIN_OUT, FOG_IN, FOG_OUT, SNOW_IN, SNOW_OUT — could be set to ANY
// value with every test still green, because the per-channel ramp tests assert
// that the store ramps at whatever the constant says (a true claim about the
// store, no claim about the constant). „the ramp grammar" in weather.test.ts
// now pins each channel's PLACE in that order. It deliberately does not pin
// any rate's absolute magnitude — nothing in this repo says snow must arrive
// in six seconds rather than nine, and a bound invented to redden a mutant is
// decoration. The magnitude is bounded where it matters instead: PRIME_DT_SEC
// is derived from these rates, so a slower channel lengthens the priming step
// and no scene can open partway through its ramp.

/** Wetness rise rate while raining (1/s → full soak in ~4 s). */
export const WETNESS_IN_PER_SEC = 1 / 4;
/** Wetness decay rate after rain stops (1/s → dry in ~12 s). */
export const WETNESS_OUT_PER_SEC = 1 / 12;
/** Rain intensity rise rate (1/s). */
export const RAIN_IN_PER_SEC = 1 / 1.5;
/** Rain intensity decay rate (1/s). */
export const RAIN_OUT_PER_SEC = 1 / 3;
/** Fog intensity rise rate (1/s → full bank in ~5 s). */
export const FOG_IN_PER_SEC = 1 / 5;
/** Fog intensity decay rate (1/s → lifts in ~6 s). */
export const FOG_OUT_PER_SEC = 1 / 6;
/** Snow intensity rise rate (1/s → full snowfall in ~6 s — weather fronts
 *  arrive, they don't switch; slowest of the three channels). */
export const SNOW_IN_PER_SEC = 1 / 6;
/** Snow intensity decay rate (1/s → clears in ~8 s). */
export const SNOW_OUT_PER_SEC = 1 / 8;

/**
 * EVERY ramp rate in this store, by name. `primeWeather`'s single step has to
 * outrun the slowest of them, and the old spelling of that was a hand-written
 * `PRIME_DT_SEC = 20` under a comment naming WETNESS_OUT_PER_SEC as the
 * slowest — true when it was written, and silently false the moment anyone
 * adds a slower channel. A number derived from the rates cannot go stale, and
 * the test reflects over this module's exports to prove no rate escaped the
 * registry (a rate added and not listed here fails that check, rather than
 * quietly leaving primed scenes partway through their ramp).
 */
export const WEATHER_RATES = {
  WETNESS_IN_PER_SEC,
  WETNESS_OUT_PER_SEC,
  RAIN_IN_PER_SEC,
  RAIN_OUT_PER_SEC,
  FOG_IN_PER_SEC,
  FOG_OUT_PER_SEC,
  SNOW_IN_PER_SEC,
  SNOW_OUT_PER_SEC,
} as const;

/** Seconds the slowest channel needs to cross its full 0..1 range. */
export const SLOWEST_TRAVERSE_SEC = Math.max(
  ...Object.values(WEATHER_RATES).map((rate) => 1 / rate),
);

/**
 * dt handed to `primeWeather`'s single step. Derived, with a ×2 margin, so
 * that the priming contract survives the next channel.
 *
 * The margin is NOT decoration: `approach` clamps at the target, so exactly
 * one traverse looks sufficient — but `(1 / 12) * 12 === 0.9999999999999999`,
 * so a step of exactly 12 s leaves wetness at ~1.1e-16 instead of 0. That
 * residue quantizes to 0 (the React hooks would never see it) while
 * `getWetness()` — what the per-frame road material actually reads — returns
 * a non-zero. A primed dry scene would render imperceptibly damp forever.
 *
 * AND „DERIVED" IS NOW ITSELF TESTED, because it was not. Measured 2026-08-22:
 * putting the hand-written `20` back — the exact spelling the WEATHER_RATES
 * docblock above convicts — left every test in this file GREEN. The two
 * guards that existed both ask whether the step outruns TODAY's slowest rate,
 * which any literal above 12 does; the failure the derivation prevents is a
 * literal that goes stale when a SLOWER channel is added, and nothing was
 * watching for it. weather.test.ts now asserts the ratio to
 * SLOWEST_TRAVERSE_SEC instead, which reddens the literal and reddens a stale
 * one the day the registry grows. What it still cannot do is tell a large
 * literal (1000) from a derivation — that limit is written out at the test.
 */
export const PRIME_DT_SEC = 2 * SLOWEST_TRAVERSE_SEC;

let wetness = 0;
let wetnessTarget = 0;
let rainIntensity = 0;
let rainTarget = 0;
let fogIntensity = 0;
let fogTarget = 0;
let snowIntensity = 0;
let snowTarget = 0;

const listeners = new Set<() => void>();

function quantize(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** `a` at t=0, `b` at t=1. At t=0 this returns `a` EXACTLY (`a + 0`), which is
 *  what makes the snow term below provably free for every dry and rain
 *  scene — see the byte-identity test. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function approach(current: number, target: number, ratePerSec: number, dtSec: number): number {
  const maxDelta = ratePerSec * dtSec;
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/**
 * Set the targets from the lesson's rain/fog/snow flags. Called by
 * SimEnvironment.
 *
 * EVERY CHANNEL IS NAMED EXPLICITLY — no defaults. `fog` and `snow` shipped as
 * `fog = false, snow = false` so the callers that predated them stayed
 * byte-identical, and this file's own test canonised that as „the additive
 * API". It is not additive, it is destructive: the store is a module-level
 * singleton with three writers, so `setWeatherTarget(true)` does not mean
 * „start raining", it means „start raining AND stop the snow AND lift the
 * fog". A channel added tomorrow would be silently cleared by every caller
 * written today, which is precisely how a rendered condition disappears from
 * a lesson without anyone getting an error. Required parameters move that to
 * compile time: all three production call sites (SimEnvironment, the
 * clip-capture and scene-still dev routes) already pass three arguments, so
 * this is a no-op at runtime and a guard against the next channel.
 */
export function setWeatherTarget(rain: boolean, fog: boolean, snow: boolean): void {
  wetnessTarget = rain ? 1 : 0;
  rainTarget = rain ? 1 : 0;
  fogTarget = fog ? 1 : 0;
  snowTarget = snow ? 1 : 0;
}

/**
 * Enter a scene ALREADY in its weather — the „settle on frame 1" contract the
 * rig's own lighting damp implements with dt→∞, which this store never had.
 *
 * A lesson's weather is a STANDING CONDITION, not an event: sc-ac-snow is not
 * a clear street where it begins to snow, it is a snowy street. But the
 * channels always start at 0 and ramp (snow takes ~6 s to saturate), and the
 * store is a module singleton that nothing in the LIVE path ever resets — only
 * the two dev routes do. Both consequences are visible:
 *
 *   · the first frame of every weather lesson is a CLEAR-weather frame, and
 *     SkyDome/SimEnvironment snap their damped rig onto that clear goal
 *     (`dt = initialized ? min(delta, 0.1) : 1000`) before easing toward the
 *     ramping one;
 *   · weather LEAKS between lessons — a dry lesson opened after a rain lesson
 *     renders a wet road for ~12 s (WETNESS_OUT_PER_SEC), after a snow lesson
 *     a snow haze for ~8 s.
 *
 * `clip-capture` hit the first one in the founder's round-3 review („rain road
 * too bright, can't tell rain from dry") and answered it by hand-rolling
 * `resetWeather(); setWeatherTarget(…); stepWeather(PRIME_DT)` under a
 * fourteen-line comment; `scene-still` copied the incantation. That sequence
 * is this function, and the reason it exists belongs next to the state it
 * primes rather than in two dev routes.
 *
 * THE LIVE PATH NOW USES IT — 2026-08-19, and the route was traced end to end
 * rather than assumed, because the debt note this replaces was read past twice.
 * `SimEnvironment` primes on its FIRST effect run and ramps on every later
 * `[rain, fog, snow]` change: a mid-drive weather change is a transition the
 * student should watch happen, only the scene boundary is a cut.
 *
 * That boundary is real, which was the open question. `LessonScene` mounts
 * `<SimEnvironment>` with no key of its own, but `LessonPlayShell` renders
 * `<SceneSlot key={sceneEpoch}>` and its owner keys the SHELL on the lesson id.
 * So a different lesson remounts the whole subtree, and «Повтори» bumps
 * `sceneEpoch` to remount it again — the prime fires on both, which is exactly
 * the pair of moments a previous scene's rain could otherwise ramp into.
 *
 * `environment/index.ts` exports this too. It did not until the same day, and
 * doc 05's module boundary meant the two dev capture routes that exist to use
 * it could not reach it: a helper the boundary rule hides is a helper that does
 * not exist.
 */
export function primeWeather(rain: boolean, fog: boolean, snow: boolean): void {
  setWeatherTarget(rain, fog, snow);
  // ONE step, longer than the slowest traverse in the store — `approach`
  // clamps to the target, so any dt past the ramp lands exactly on it. That
  // single step is the whole mechanism: it carries a channel DOWN from a
  // previous scene's value just as exactly as it carries one up, which is why
  // there is no `resetWeather()` here. Both dev routes open with one — and a
  // mutation run proved it dead: removing it changes nothing, because they
  // both step with dt = 1000 straight afterwards. A redundant call that reads
  // like the safety is worse than none, since the next reader trusts it.
  stepWeather(PRIME_DT_SEC);
}

/**
 * Advance the weather toward its targets. Called once per frame by
 * SimEnvironment; safe to call from tests with synthetic dt.
 */
export function stepWeather(dtSec: number): void {
  if (dtSec <= 0) return;
  const prevW = quantize(wetness);
  const prevR = quantize(rainIntensity);
  const prevF = quantize(fogIntensity);
  const prevS = quantize(snowIntensity);
  wetness = clamp01(
    approach(wetness, wetnessTarget, wetness < wetnessTarget ? WETNESS_IN_PER_SEC : WETNESS_OUT_PER_SEC, dtSec),
  );
  rainIntensity = clamp01(
    approach(rainIntensity, rainTarget, rainIntensity < rainTarget ? RAIN_IN_PER_SEC : RAIN_OUT_PER_SEC, dtSec),
  );
  fogIntensity = clamp01(
    approach(fogIntensity, fogTarget, fogIntensity < fogTarget ? FOG_IN_PER_SEC : FOG_OUT_PER_SEC, dtSec),
  );
  snowIntensity = clamp01(
    approach(snowIntensity, snowTarget, snowIntensity < snowTarget ? SNOW_IN_PER_SEC : SNOW_OUT_PER_SEC, dtSec),
  );
  if (
    quantize(wetness) !== prevW ||
    quantize(rainIntensity) !== prevR ||
    quantize(fogIntensity) !== prevF ||
    quantize(snowIntensity) !== prevS
  ) {
    for (const fn of listeners) fn();
  }
}

/** Imperative read for per-frame consumers (shader uniforms, useFrame). */
export function getWetness(): number {
  return wetness;
}

/** Imperative read of current rain intensity 0..1. */
export function getRainIntensity(): number {
  return rainIntensity;
}

/** Imperative read of current FOG intensity 0..1 (per-frame consumers). */
export function getFogIntensity(): number {
  return fogIntensity;
}

/** Imperative read of current SNOW intensity 0..1 (per-frame consumers). */
export function getSnowIntensity(): number {
  return snowIntensity;
}

/** Reset to bone-dry and clear. For tests and full sim teardown. */
export function resetWeather(): void {
  wetness = 0;
  wetnessTarget = 0;
  rainIntensity = 0;
  rainTarget = 0;
  fogIntensity = 0;
  fogTarget = 0;
  snowIntensity = 0;
  snowTarget = 0;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Road wetness 0..1, quantized to 0.01. The world module consumes this for
 * the wet-road look; grip logic may read getWetness() directly.
 */
export function useWetness(): number {
  return useSyncExternalStore(
    subscribe,
    () => quantize(wetness),
    () => 0,
  );
}

/** Rain intensity 0..1, quantized to 0.01 (drives overlays like droplets). */
export function useRainIntensity(): number {
  return useSyncExternalStore(
    subscribe,
    () => quantize(rainIntensity),
    () => 0,
  );
}

// `useFogIntensity` STOOD HERE AND NOTHING MOUNTED IT — removed 2026-08-26.
//
// Its three siblings all have live React consumers: `useWetness` and
// `useSnowIntensity` in `StaticWorld.tsx`, `useRainIntensity` in
// `WindshieldDroplets.tsx`. Fog has none, and it is not an oversight — fog is
// the one channel of the four that no React tree ever needs, because it is
// consumed per FRAME inside `SkyDome.tsx` (`getFogIntensity()` at the imperative
// getter, in the render loop, deliberately outside React so a 0.01 step does not
// re-render the scene graph). The hook's own doc string said „occasional React
// consumers" and there were none, in this tree or in any prior commit.
//
// It also had ZERO tests, so this deletion removes nothing that was ever
// proved. `getFogIntensity` — the getter that actually paints the fog — is
// untouched above and stays under `weather.test.ts`.

/** Snow intensity 0..1, quantized to 0.01 (occasional React consumers). */
export function useSnowIntensity(): number {
  return useSyncExternalStore(
    subscribe,
    () => quantize(snowIntensity),
    () => 0,
  );
}

export interface RoadWetnessParams {
  /** Assign to MeshStandardMaterial.roughness on road surfaces. */
  roughness: number;
  /**
   * Multiply the road's base color by this. Wet asphalt darkens (< 1); snow
   * lying on it BRIGHTENS it (> 1) — the one channel in this pair that can
   * point either way, and the reason a snow-covered street stopped having to
   * render as bare grey.
   */
  darken: number;
}

/**
 * What is lying ON the road right now. Two independent 0..1 components,
 * because they are two different materials with opposite optics: water
 * darkens and glosses, snow brightens and mattes.
 */
export interface RoadSurfaceState {
  /** Rain water on the road — the store's `wetness` channel (`getWetness`). */
  wet: number;
  /** Snow on the road — the store's `snowIntensity` channel
   *  (`getSnowIntensity` / `useSnowIntensity`, both already exported from the
   *  module barrel). */
  snow: number;
}

/**
 * How much a fully snow-covered road brightens its own albedo.
 *
 * THIS WAS THE ONE NUMBER IN THIS FILE NO TEST COULD VALIDATE — REASONED, not
 * measured, shipped with an R0 look owed. THE R0 LOOK HAS NOW BEEN DONE; its
 * result is at the foot of this block. The reasoning it was checked against:
 *
 *  · Bounded BELOW by 1: the audit measured sc-ac-snow's road at mean sRGB
 *    L 82.6 near / 135.5 far against sc-ac-fog's L 84.8 / 148.6 on the same
 *    map under the same preset — snow rendering 2.6% and 8.8% DARKER than
 *    fog. Anything ≤ 1 keeps that wrong way round.
 *  · Bounded ABOVE by the lane markings. StaticWorld tints the road
 *    `darken × ROAD_ALBEDO_TINT (0.72) × asphaltMapTexel` and paints the
 *    markings at #e9e7df × 1.0 ≈ 0.91. Snow that buried them would be
 *    photographically truer and pedagogically a trap: the rule engine grades
 *    lane keeping and stop lines off those markings, so a picture that
 *    removes them fails students on a skill it just took away. This is a
 *    DUSTED road, deliberately, not a buried one.
 *
 *    EVERY NUMBER PAST THIS POINT DEPENDS ON `asphaltMapTexel`, AND NOTHING
 *    HERE CAN READ IT — the asphalt is a photo loaded at runtime. Worked
 *    through 2026-08-19 so the R0 look knows what it is checking: the road
 *    reaches the paint at `1.8 × 0.72 × t ≥ 0.91`, i.e. `t ≥ 0.70`, and it
 *    reaches the composer's bloom threshold (0.9, med/high) at the same `t`.
 *    A mid-grey map (t ≈ 0.45) lands the snowed road at ≈ 0.58 — clearly
 *    below the paint, no bloom, and about two fifths of the way from the dry
 *    road to the markings. This note used to assert „roughly two thirds" and
 *    „below the bloom threshold" as if computed; they hold for a brighter map
 *    (t ≈ 0.55) and not for a darker one, which is exactly why the R0 look is
 *    the check and this arithmetic is only the thing it is looking for.
 *    Neither the round-2 wet retune's white-sheet failure nor this one can be
 *    ruled out from a unit test (StaticWorld's R5 comment).
 *
 * THE R0 LOOK, DONE 2026-08-22 — on the audit's own re-drive at HEAD
 * (`.audit-frames/rebase/frames/sc-ac-snow__pc-right/03-ready.png`) rather
 * than on `/dev/scene-still`, because that drive is a photograph of the
 * shipped build with the shipped value in it, which is what R0 asks for.
 * Its two stated criteria came out differently, and both answers matter:
 *
 *  · „THE LANE MARKINGS MUST STILL BE THE BRIGHTEST THING IN THE CARRIAGEWAY"
 *    — PASSES. Over a near carriageway band (600,402 400×40) with the green
 *    guidance ribbon and the blue shadow path filtered out by saturation, the
 *    road sits at L 129.7 and the dashed marking at L 171.4: the markings are
 *    32% brighter than the surface they are painted on, and they read plainly
 *    by eye. The margin did narrow — the same band on the pre-fix frame gives
 *    109.7 / 171.1, so the road came up 18% and the paint did not move, which
 *    is precisely the intended asymmetry (StaticWorld keeps PAINT on the
 *    rain-only mapping). A DUSTED road, not a buried one, as designed.
 *
 *  · „THE ROAD MUST READ PALER THAN THE CONCRETE PAVEMENT" — FAILS, and the
 *    criterion is unreachable from this file. Distance-matched across the
 *    kerb, the snowed carriageway is L 123.6 against the pavement's L 169.4.
 *    It cannot be otherwise: the world module puts no snow on pavements, so
 *    this criterion asks a road multiply to out-brighten un-snowed concrete.
 *    The achievable form of it is met — on the same map and preset the snowed
 *    carriageway is now paler than the FOG road (129.7 vs 120.0 in that band,
 *    and 106.9 vs 86.8 in the audit's own near rectangle), where before the
 *    term it was darker than it. When the season work of 2b lands and the
 *    pavements go white, re-run this criterion; until then it is measuring the
 *    world module, not this constant.
 *
 * TWO WRONG MEASUREMENTS WERE MADE BEFORE THESE, and they are recorded because
 * both failed in the reassuring direction's mirror — they convicted a fix that
 * works. A fixed rectangle compared across two runs caught the GREEN GUIDANCE
 * RIBBON in one frame and bare road in the other (the runs are steered and
 * unsteered, so the car is not in the same place); a wider band caught the
 * ИНСТРУКЦИИ panel's white text and reported it as lane-marking contrast. Any
 * ROI on these frames must be checked by cropping and LOOKING at it first.
 *
 * WHAT THE MEASUREMENT BOUGHT THE TESTS: the 0.8 multiply moved the near road
 * +28.6% on screen against a control that drifted +1.8%, i.e. the renderer
 * compresses this multiply by roughly 2.8× in the near field (and ~7× far,
 * where the haze dominates). That is what let the separation floor in
 * weather.test.ts be set from evidence instead of from the old claim that
 * „0.15 on an albedo multiply is ~15%", which it is not.
 */
export const SNOW_ROAD_BRIGHTEN = 1.8;

/**
 * Map what is lying on the road to standard-material params for road surfaces.
 * Dry: rough matte asphalt. Wet: darker + glossy so the sky/streetlights smear
 * into reflections. Snow: brighter and back to matte. Pure — unit-tested.
 *
 * WHY THIS EXISTS (sweep161, sc-ac-snow part A, critical: „the road is bare
 * grey asphalt with clean white lane markings … the student is being taught
 * winter grip on a picture of a dry summer street"). This is the ONLY
 * road-material mapping in the codebase — StaticWorld drives asphalt, decals
 * and paint through it — and until now its only input was RAIN wetness, so no
 * amount of snow could move the road by one shade. The previous lane read
 * that correctly and then concluded the fix was world-module asset work
 * („white ground cover … snow textures / meshes on the road", SnowFlakes.tsx
 * header). It is not: the albedo multiply the wet road already rides is
 * enough, costs no texture, no plane above the road and no z-fighting with
 * the raised markings — which is precisely why that plane was rejected.
 *
 * ORDERING: water first, then snow ON TOP of it. Snow is the last thing to
 * land on the surface, so it wins — the same „the denser bank wins" discipline
 * SimEnvironment uses when it blends the rain haze, then snow, then fog.
 *
 * NO ICE TERM, AND THAT IS THE POINT. sc-ac-ice and sc-ac-bridge-ice are also
 * routed to this file, and the tempting read of them is „the road should look
 * icy". It must not. Black ice is invisible — that is the whole lesson
 * (bridge-ice briefing item 2: „Прочети знака А15 … той не е украса", item 3:
 * „откритите участъци замръзват първи"). A road material that revealed ice
 * would teach a seventeen-year-old that they can see it, which is a false
 * certificate for a skill nobody has. What those two lessons are missing is
 * the SEASON — see the header note, routed out.
 */
export function roadSurfaceToParams(
  surface: RoadSurfaceState,
  opts?: {
    dryRoughness?: number;
    wetRoughness?: number;
    wetDarken?: number;
    snowRoughness?: number;
    snowBrighten?: number;
  },
): RoadWetnessParams {
  const dryRoughness = opts?.dryRoughness ?? 0.92;
  const wetRoughness = opts?.wetRoughness ?? 0.42;
  const wetDarken = opts?.wetDarken ?? 0.62;
  // Snow does not gloss the road, it UN-glosses it: fresh snow is the mattest
  // surface a street ever has. Defaulting to the caller's own dryRoughness
  // means a snowed-over wet road returns to the roughness that caller
  // authored for dry, rather than to a number invented in this file — and it
  // is the reason each of StaticWorld's three call sites (road 1.0, decals
  // 0.95, paint 0.85) keeps its own character under snow.
  const snowRoughness = opts?.snowRoughness ?? dryRoughness;
  const snowBrighten = opts?.snowBrighten ?? SNOW_ROAD_BRIGHTEN;
  const w = clamp01(surface.wet);
  const s = clamp01(surface.snow);
  return {
    roughness: lerp(lerp(dryRoughness, wetRoughness, w), snowRoughness, s),
    darken: lerp(lerp(1, wetDarken, w), snowBrighten, s),
  };
}

/**
 * The rain-only case of `roadSurfaceToParams`, kept because it is the shipped
 * signature: StaticWorld's three call sites and the module barrel both spell
 * it this way, and at `snow: 0` the lerp above returns its first argument
 * EXACTLY (`a + (b - a) * 0`), so every dry and every rain scene is
 * bit-identical to before the snow term existed. That identity is pinned by
 * test, over the three shipped opts bags, rather than asserted here.
 */
export function wetnessToRoadParams(
  w: number,
  opts?: { dryRoughness?: number; wetRoughness?: number; wetDarken?: number },
): RoadWetnessParams {
  return roadSurfaceToParams({ wet: w, snow: 0 }, opts);
}
