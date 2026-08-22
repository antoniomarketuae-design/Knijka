/**
 * sim/collision — public API (module barrel, docs/architecture/05).
 *
 * Exact 2D body geometry for contact ADJUDICATION: oriented-bounding-box SAT
 * with a SIGNED separation (positive = metres of air, negative = penetration
 * depth), a box-vs-disc test for pedestrians, and — through `ContactProbe` —
 * a swept test that closes the between-frames tunnelling hole. See obb.ts for
 * the defect this replaces and bodies.ts for where every dimension is measured
 * from.
 *
 * ---------------------------------------------------------------------------
 * WHICH ENTRY POINT. `ContactProbe` IS THE ONE THAT DOES NOT DEPEND ON THE
 * FRAME RATE. The line above used to credit "a swept variant" without naming
 * it, and the bare `swept*` functions do NOT carry that guarantee.
 *
 * `sweptObbSeparationM` / `sweptObbDiscSeparationM` refuse any interval whose
 * relative travel exceeds `SWEEP_TELEPORT_M` (12 m) and fall back to the
 * current pose alone — correct, because such a jump used to be impossible for
 * real motion under the director's old `Math.min(delta, 0.1)` clamp (82.8 m/s
 * of worst-case closing × 0.1 s = 8.28 m). Since 2026-08-16 the lesson clock
 * advances by the world time physics integrated, capped by @react-three/
 * rapier's own `clamp(dt, 0, 0.5)` (lesson-ui/sessionClock.ts), so one frame is
 * worth up to 41.4 m and the fallback went from unreachable to routine.
 * MEASURED in probe.ts, two cars nose-to-nose down one lane, on the bare
 * `swept*` pair (`__tests__/probe.test.ts` drives the same geometry through
 * the probe; `__tests__/index.test.ts` drives it through this barrel):
 *
 *   tick     each car   relative travel   min separation   crash reported
 *   1/60 s    50 km/h        0.46 m          −1.770 m           YES
 *   0.500 s   50 km/h       13.89 m          +0.930 m           NO  ← over 12
 *   0.500 s  168 km/h       46.67 m         +15.930 m           NO
 *
 * `ContactProbe` subdivides such an interval and returns the minimum over it,
 * so a head-on is a head-on at every tick. No consumer imports the bare swept
 * pair through this barrel, and that is now WALKED rather than remembered:
 * `__tests__/index.test.ts` parses every import in `platform/src`, resolves the
 * ones that land anywhere in this DIRECTORY, and fails on any outside name
 * reaching `sweptObbSeparationM`/`sweptObbDiscSeparationM` — or namespace-
 * importing the module, which would reach them without naming them. IT SAID
 * „this file" AND CHECKED ONLY THE BARREL until 2026-08-23, when a verifier
 * wrote `import { SWEEP_TELEPORT_M } from "../collision/obb"` in a file
 * outside the directory and the guard stayed GREEN: every guarded name was
 * reachable one path segment past the barrel, and nothing else in the tree
 * forbids a deep import. The walk now resolves to the directory, so the
 * sentence above and the test below say the same thing. They stay exported
 * because they are the primitive the subdivision is built from. A caller
 * holding two consecutive frames wants the probe. A caller holding ONE pose —
 * the traces channel, which replays a scripted drive — wants
 * `obbSeparationM`/`obbOverlap` and is not affected.
 *
 * THIS SENTENCE USED TO CARRY THE LIST ITSELF («checked: LessonScene,
 * NpcColliders, orchestrator/contact, traces/recorder, traces/scHzEmergencyStop,
 * world/referents») and the list had already gone stale: the tree has EIGHT
 * non-test importers of this barrel, not six — `traffic/system.ts` (which takes
 * `PLAYER_HALF_LENGTH_M` under an alias, deliberately, and says why) and
 * `traffic/types.ts` were both missing. The conclusion was never wrong; the
 * evidence for it was, and the next reader re-checking by walking those six
 * names would have re-derived a wrong answer from a right one. A hand-kept list
 * has no failure mode — which is the same sentence this module already learned
 * about hand-kept EXPORT lists, one paragraph up.
 *
 * `SWEEP_CHUNK_TRAVEL_M` / `SWEEP_FRAME_TRAVEL_M` are re-exported for the same
 * reason: `SWEEP_FRAME_TRAVEL_M` (60 m) is the threshold above which even the
 * probe DISCARDS the interval, and the module that owns the clock — the
 * orchestrator's director — is the one that can violate it. It still does not
 * read either number: NOTHING outside this directory imports
 * `SWEEP_FRAME_TRAVEL_M`, `SWEEP_CHUNK_TRAVEL_M` or `SWEEP_TELEPORT_M`, and
 * that is the same walk, in the same test, rather than a date typed beside a
 * grep. The budget is therefore held by `__tests__/index.test.ts` alone, and
 * that sentence used to read „the only one that could not check", which
 * described an intention rather than the tree.
 *
 * The walk checks each guarded name is a LIVE EXPORT before it looks for
 * importers, because a guard written as a list of strings stops guarding the
 * moment one of them is renamed and then passes forever — a substring catches
 * deletion, never neutralisation.
 *
 * HOW MUCH ROOM THAT 60 m LEAVES IS NOT STATED HERE, DELIBERATELY. It was, and
 * for a day this file and probe.ts published two DIFFERENT margins for one
 * constant: this one measured against what `relativeTravelM` actually sums,
 * probe.ts's — the ORIGIN of the figure — inherited from an arithmetic that
 * counted only the translation half and overstated the room twelvefold. The
 * correction had been applied to the file that noticed rather than to the file
 * the number came from, and two doc-comments that agree only because someone
 * edited both disagree again on the next edit. So the figure now lives ONCE,
 * at the constant's own declaration in probe.ts, where `__tests__/index.test.ts`
 * recomputes it from `PHYSICS_MAX_FRAME_DT` (lesson-ui/sessionClock.ts) and the
 * scenario bank's authored speeds and pins that sentence against the result.
 * The same test fails if this file grows a competing number. Read it there —
 * it is far tighter than the 60 makes it look, and the reason it is worth a
 * gate is that the next reader budgets against whichever figure they meet
 * first.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE DOES NOT DO, because six sweep161 findings were routed here
 * for it and it cannot answer any of them.
 *
 * THEY ARE NOW RE-ROUTED, with the proof for each, in
 * `.audit-frames/routing-collision.json` — nine rows, because reading the
 * corpus for the six turned up three more parked on the string
 * „platform/src/modules/sim/collision", a DIRECTORY with no filename, which is
 * a second way to be invisible to a wave that groups findings by file. The
 * refutation that applies to all nine is that this directory imports neither
 * three nor @react-three/rapier nor react nor the raw engine under them
 * (`@dimforge/rapier3d`, `@dimforge/rapier3d-compat` — added to the guard
 * 2026-08-23, because the capability these rows are routed away from is
 * „can create a rapier body", and the raw engine grants it without the
 * wrapper; it is what NpcColliders.tsx and VehicleRig.tsx, the two files the
 * rows were routed TO, actually import) — TRANSITIVELY, its whole import
 * closure is nine plain-TypeScript files — and that the barrel below exports
 * only constants, functions that return a number or a boolean, three body
 * builders and one pose-memory class. Nothing here can create a body, move
 * one, draw one or end a lesson.
 *
 * THAT USED TO BE „one grep", AND A GREP IS WHY THIS PARAGRAPH IS WORTH
 * READING TWICE. Four CRITICAL rows are routed out of this module on those two
 * sentences, and until 2026-08-22 nothing could fail if either stopped being
 * true: someone adding a rapier import here would not have broken a test, they
 * would have broken a comment, and the refutation those four rows rest on would
 * have quietly become false while every row stayed shut. Both sentences are now
 * assertions in `__tests__/index.test.ts` — the closure is walked with comments
 * stripped (this file and probe.ts both DISCUSS rapier at length, so a grep for
 * the word answers wrong), and the export surface is checked by kind, so a mesh
 * or a component would arrive as a red rather than as a new capability nobody
 * noticed. Keep that true — it is what makes this module testable without a
 * browser, and it is also the reason a finding about a body that did not stop
 * can never be closed by editing it:
 *
 *   · NO CONTACT RESPONSE. Nothing here moves a body. Adjudication says "these
 *     two boxes overlap by 1.77 m"; keeping them out of each other is rapier's
 *     job — the dynamic chassis collider (components/sim/VehicleRig), the
 *     kinematic NPC shells (components/sim/NpcColliders) and the static
 *     district trimeshes (sim/world/components/WorldColliders). sc-ov-abort
 *     mobile-wrong t192s and sc-ov-return-gap mobile-wrong t118s show the ego
 *     inside the lead car's body; no signed separation this module can return
 *     changes that.
 *
 *     HALF OF BOTH ROWS HAS SINCE BEEN PAID, and the next reader should not
 *     re-fix it: the „42 separate «Пътнотранспортно произшествие» for one
 *     continuous contact" and the „25 collisions / 252 наказателни точки" those
 *     two rows were filed on are the EPISODE LATCH, and rules/engine.ts now
 *     answers it — `CONTACT_LEAD_GAP_M` (a second accident needs the bodies to
 *     have been SEEN apart, not merely 2 m of path, because a shunt supplies
 *     path) and `CONTACT_REVERSE_TRAVEL_M` (the same floor asked of the one
 *     motion that can supply it, for the bodies the gap channel cannot speak
 *     for). Read on 2026-08-22 and green: `rules/__tests__/
 *     sweep161-fault-episodes.test.ts` + `contact-episode-per-body.test.ts`,
 *     39 tests. What is still OPEN on those two rows is the physics half alone
 *     — the ego passing through the staged lead — and it is the half that
 *     decides what the student is taught: fixing only the latch turns 252
 *     points into 10 and makes the lesson LOOK correct while the car still
 *     drives through the body it is being taught to keep a gap from.
 *   · NO STATIC-WORLD BODY. bodies.ts sizes the player, the NPC vehicle shell
 *     and the pedestrian disc. There is no building, wall or kerb body, so the
 *     geometric sentinel (orchestrator/contact.ts) can only ever watch STAGED
 *     ACTORS, and a contact with the district is known only from rapier's
 *     one-shot `onCollisionEnter` → `"staticObject"`. That is why a car that
 *     ends up inside a facade goes on being graded in silence
 *     (sc-ln-turn-lane-arrows mobile-wrong t039s and sc-ov-being-overtaken
 *     mobile-wrong t052s at 0 km/h with the windscreen full of interior
 *     backfaces; sc-ac-night-overdrive pc-wrong t039s flush inside a facade at
 *     95 km/h; sc-ac-aquaplane mobile-wrong t034s inside world geometry after
 *     the crash, still grading). Verified while re-routing them, and stated as
 *     what was READ rather than as a diagnosis: `buildOne`
 *     (sim/world/builders/buildings.ts) writes to its collider accumulator at
 *     lines 212-216 and nowhere else in the file — one full-height quad per
 *     footprint edge, no floor triangle, no roof cap — and WorldColliders
 *     merges the lot into ONE TrimeshCollider. Why a car reaches the far side
 *     of that surface is the open question, and the sharpest frame is
 *     sc-ac-night-overdrive's: the speedometer still reads 95 км/ч with the
 *     windscreen full of facade, which is not a body that was stopped and
 *     re-accelerated. Both buildings.ts and terminus.ts state in their own
 *     headers that such a mass „cannot be driven through".
 *
 *     ONE HYPOTHESIS IS NOW DEAD, MEASURED 2026-08-22 SO THE NEXT LANE DOES NOT
 *     SPEND ITSELF ON IT. `routing-collision.json` asks, as its FIRST
 *     measurement for the sc-ac-night-overdrive row, whether the terminus
 *     closure contributes any collider index at all — „if the index count is
 *     zero for the closure, the defect is upstream in terminus.ts/
 *     buildWorldGeometry.ts rather than in the quad geometry". IT IS NOT ZERO.
 *     Built headlessly through `buildWorldGeometry`, `ov-oncoming-v1` yields
 *     ONE authored building plus FOUR terminus closure meshes and a building
 *     collider of 40 triangles — 20 full-height quads, exactly 4 (the authored
 *     block) + 16 (four closures × four edges) — whose vertices cluster at
 *     district y ≈ 40…58 (the authored block the ego passes in the first
 *     seconds) AND at y ≈ 918…938, the far end where the frame was taken. Wall
 *     height runs 0 → 17.06 m. `ac-aqua-v1` and `ac-night-v1` measure the same
 *     shape (40 tris, closures at y ≈ 538…558 / 378…398); `ln-arrows-v1` has
 *     two blocks, eight closures and 80 tris. And the mass is MOUNTED: no
 *     LESSON path passes `physics={false}`, so `DistrictWorld`'s `physics = true`
 *     default mounts `WorldColliders` under every lesson. (That sentence read
 *     „nothing passes `physics={false}`" until 2026-08-23, and one caller
 *     does: `/dev/scene-still` (SceneStillScene.tsx:609), a still-frame
 *     renderer with no car in it. The conclusion is untouched; the wording was
 *     wider than the tree, which is the exact failure this header spends two
 *     paragraphs on above.) The chassis `<RigidBody>` carries `ccd`
 *     (VehicleRig.tsx) and is force-driven (vehicle/VehicleSim.ts —
 *     `addForce`/`applyImpulseAtPoint`),
 *     with `setTranslation` only on spawn and reset, so it is not a teleported
 *     body that CCD would be unable to help.
 *
 *     So the wall exists, is full height, is in the physics world, and is at
 *     the place the car went through. WHAT REMAINS is why a swept dynamic body
 *     crosses it — and it is worth noticing that this is the SAME defect class
 *     this module already fixed one layer up: the GRADER stopped tunnelling
 *     when `ContactProbe` learned to subdivide a long interval, and the frames
 *     say the PHYSICS has not. Measured on the tree of 2026-08-22, while
 *     another lane had `buildWorldGeometry.ts` open on the terminus seam — so
 *     re-measure before quoting the triangle counts, and treat the shape of the
 *     answer (mass present, mounted, at the right place) as the load-bearing
 *     half.
 *   · NO FINISH RULE EITHER, and that half is lessons/finish.ts's — nothing
 *     ends a lesson whose car has come to rest inside the scenery, the same
 *     gap already on the books at sc-park-night.
 *   · NO ACCIDENT COUNT. "How many accidents is this" is the rule engine's
 *     question (`collisionSeparationSec`, and the per-body episode landing in
 *     runtime/worldRuntime.ts). This module reports geometry per frame; a
 *     rising-edge latch here would be a second, worse answer — see the
 *     measurement in orchestrator/contact.ts's header.
 */

export {
  CONTACT_TOLERANCE_M,
  obbDiscSeparationM,
  obbOverlap,
  obbSeparationM,
  SWEEP_MAX_STEPS,
  SWEEP_RESOLUTION_M,
  SWEEP_TELEPORT_M,
  sweptObbDiscSeparationM,
  sweptObbSeparationM,
  type Obb2D,
  type SweepPose,
} from "./obb";

export {
  actorObb,
  headingOfDir,
  PEDESTRIAN_BODY_RADIUS_M,
  playerObb,
  PLAYER_HALF_LENGTH_M,
  PLAYER_HALF_WIDTH_M,
  type ActorPose,
} from "./bodies";

export {
  ContactProbe,
  isContact,
  SWEEP_CHUNK_TRAVEL_M,
  SWEEP_FRAME_TRAVEL_M,
} from "./probe";
