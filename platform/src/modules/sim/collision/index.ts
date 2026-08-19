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
 * pair through this barrel today (checked: LessonScene, NpcColliders,
 * orchestrator/contact, traces/recorder, traces/scHzEmergencyStop,
 * world/referents); they stay exported because they are the primitive the
 * subdivision is built from. A caller holding two consecutive frames wants the
 * probe. A caller holding ONE pose — the traces channel, which replays a
 * scripted drive — wants `obbSeparationM`/`obbOverlap` and is not affected.
 *
 * `SWEEP_CHUNK_TRAVEL_M` / `SWEEP_FRAME_TRAVEL_M` are re-exported for the same
 * reason: `SWEEP_FRAME_TRAVEL_M` (60 m) is the threshold above which even the
 * probe DISCARDS the interval, and the module that owns the clock — the
 * orchestrator's director — is the only one that can violate it and, until it
 * could see the number, the only one that could not check. The margin it has
 * to keep is stated and tested in `__tests__/index.test.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE DOES NOT DO, because six sweep161 findings were routed here
 * for it and it cannot answer any of them (recorded so the next wave routes
 * them to a file that can):
 *
 *   · NO CONTACT RESPONSE. Nothing here moves a body. Adjudication says "these
 *     two boxes overlap by 1.77 m"; keeping them out of each other is rapier's
 *     job — the dynamic chassis collider (components/sim/VehicleRig), the
 *     kinematic NPC shells (components/sim/NpcColliders) and the static
 *     district trimeshes (sim/world/components/WorldColliders). sc-ov-abort
 *     mobile-wrong t192s and sc-ov-return-gap mobile-wrong t118s show the ego
 *     inside the lead car's body; no signed separation this module can return
 *     changes that.
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
 *     the crash, still grading): the building colliders are hollow full-height
 *     wall quads (sim/world/builders/buildings.ts `buildOne` — one quad per
 *     footprint edge, no floor, no cap), so once a body is inside there is no
 *     face left to push it out and no second event to report it.
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
  NPC_VEHICLE_SHELL_HALF_LENGTH_M,
  NPC_VEHICLE_SHELL_HALF_WIDTH_M,
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
