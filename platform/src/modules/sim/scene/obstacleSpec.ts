/**
 * Scenario-obstacle SPEC types — the data contract for a drill's obstacle set
 * (doc 76 §0). Plain data in district space; a ScenarioSpec's obstacle list
 * serializes to JSON through these shapes.
 *
 * Lives in the sim module, not in the R3F component that draws it (audit
 * M-19). The recipe builder and the held-scenery tables BUILD these lists and
 * are pure logic — a module importing its own data contract from a "use client"
 * component was the boundary the audit named, and it made the R3F file the
 * de-facto owner of a shape three other files author.
 *
 * Rendering, colliders and the contact-grading constants stay with the
 * component that owns them (components/sim/ScenarioObstacles.tsx).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * „THE STOPPED CAR HAS NO LAMPS" — WHY, EXACTLY, AND WHY NOT HERE — 2026-08-20.
 *
 *   sc-pk-smooth-stop/pc-right/04-t049s.png, routed to this file:
 *   „The obstacle the whole drill depends on is a blank white box. The 'спрял
 *    автомобил' stopped in the live lane has no rear lamps, no brake lights, no
 *    hazard lights, no number plate and no reflectors … A student cannot learn
 *    to read a stopped vehicle from a body with no signals on it."
 *
 * THE FRAME IS RIGHT. An 8× crop of it shows a flat grey cuboid with one black
 * bumper band and nothing else — no lens, no lamp, no plate. The drill's own
 * instruction 2 is «Напред в лентата е спрял автомобил», and its whole taught
 * act is reading that body and stopping short of it.
 *
 * THE CAUSE IS ONE LINE, AND IT IS IN `traffic/vehicleFleet.ts`:
 *     const SKIP_BODY_MATERIALS = new Set(["headlight", "taillight"]);
 * The GLB's lamp primitives are DROPPED from the merged body at fleet-build
 * time — deliberately, because `TrafficLayer` re-adds them as dynamic emissive
 * overlays for MOVING traffic, night-gated on its own `night` flag. A held
 * scenario obstacle never goes through that path: `scenarioSceneryProps.ts`
 * places this van (`kargo_v`, `visual: true`) and `ScenarioObstacles.tsx`
 * instances the merged body. Merged body minus lamp prims, plus no overlay,
 * equals the box in the frame. So the fix is a lamp pass for held bodies, in
 * `components/sim/ScenarioObstacles.tsx` (+ the rig's `lampY`, which
 * `vehicleFleet.ts` already keeps for exactly this kind of placement).
 *
 * THIS FILE'S SHARE, STATED AND DELIBERATELY NOT TAKEN. `ScenarioVehicleObstacle`
 * below has no way to say WHICH lamps a held body shows — no `lamps: "hazard" |
 * "brake" | "none"`. That is a real gap and it is this file's gap: a car
 * stopped in a live lane should be showing hazards, and today no drill can ask
 * for it. It is left unwritten ON PURPOSE. A field no renderer reads is a
 * schema that lies — an author would set it, the frame would not change, and
 * the next sweep would file the same finding against a spec that now claims to
 * support lamps. The field and the render pass must land in the SAME change.
 * Route them together.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ---------------------------------------------------------------------------

/** Common pose fields, district space (x east, y north, heading 0=N cw). */
interface ObstaclePose {
  x: number;
  y: number;
  headingDeg: number;
}

/** A parked fleet vehicle with a tight per-model collider. */
export interface ScenarioVehicleObstacle extends ObstaclePose {
  kind: "vehicle";
  /**
   * Fleet model basename ("vela_h3", "corva_s", "kargo_v", …), or
   * "box_truck" for the PROCEDURAL box-truck rig (the R3 #26 large-occluder
   * stopgap — vehicleFleet builds it after the GLB models, and the parked
   * pass instances it exactly like a GLB rig). Absent or unknown →
   * deterministic civilian pick from `seed` (parked pool — no police/route
   * minibus/hero SUV).
   */
  model?: string;
  /** Stable seed: paint palette pick (+ fallback model). Default: list index. */
  seed?: number;
  /**
   * HELD DRESSING: render the body through the same instanced parked pass but
   * mount NO collider — the TrafficLayer curb-decoration convention (visible,
   * not hittable). For drills whose collision consequence is authored in the
   * trace channel (recorder ObstacleRect2D) / objective zones, a purely
   * visual body must not add a crash surface the grading never authored
   * (scenarioSceneryProps.ts). Absent = hittable (the S0 default).
   */
  visual?: boolean;
  /**
   * HERO TINT (scene-still only): a fixed CSS colour written straight into the
   * parked paint shell's per-instance colour, overriding the seed→palette pick,
   * so the learner's own car reads as a distinct saturated body colour. Only
   * applies to palette-tinted models (the parked pool is all paintable). Absent
   * = ordinary palette tint (every sim caller leaves this unset).
   */
  heroColor?: string;
}

export type ScenarioPropKind = "cone" | "pole";

/** A small streetscape obstacle (traffic cone / полигон marker pole). */
export interface ScenarioPropObstacle extends ObstaclePose {
  kind: "prop";
  prop: ScenarioPropKind;
  /**
   * THE BODY STANDS ON THE CARRIAGEWAY (lane staticcardcopy, integrator rulings
   * C1/S1): its footprint centre measures `surfaceAt(...).under ===
   * "carriageway"` on the built road. Never authored by hand — stamped at scene
   * build by `scenarioSceneryProps.stampHeldOnCarriageway` and mounted as
   * `STATIC_ON_CARRIAGEWAY_USER_DATA` on the body's collider, which is all a
   * contact can read of it. Selects the shown COLLISION copy only. Absent
   * otherwise.
   */
  onCarriageway?: true;
}

/** A wall/pillar segment running along its heading. */
export interface ScenarioWallObstacle extends ObstaclePose {
  kind: "wall";
  /** Length along the heading, m. */
  lengthM: number;
  /** Default 1.2 m (parking-garage half-wall). */
  heightM?: number;
  /** Default 0.3 m. */
  thicknessM?: number;
  /**
   * THE BODY STANDS ON THE CARRIAGEWAY (lane staticcardcopy, integrator rulings
   * C1/S1): its footprint centre measures `surfaceAt(...).under ===
   * "carriageway"` on the built road. Never authored by hand — stamped at scene
   * build by `scenarioSceneryProps.stampHeldOnCarriageway` and mounted as
   * `STATIC_ON_CARRIAGEWAY_USER_DATA` on the body's collider, which is all a
   * contact can read of it. Selects the shown COLLISION copy only. Absent
   * otherwise.
   */
  onCarriageway?: true;
}

/**
 * A quadruped hazard body standing in the road (doc 72 §HZ „животно на пътя").
 * Mounts the SAME buildAnimalRig geometry TrafficLayer draws on the dart path,
 * but as HELD scenery — always rendered, no `hazardActive` trigger (the trace
 * recorder has no hazard channel, so reel clips never fire the dart). Visual
 * dressing ONLY: no collider (the grading lives in the authored trace), like a
 * `visual: true` vehicle — an animal must not add an unauthored crash surface.
 * `visual` is accepted for parity with vehicles/props and documents the intent;
 * animals are never hittable regardless of its value.
 */
export interface ScenarioAnimalObstacle extends ObstaclePose {
  kind: "animal";
  visual?: boolean;
}

/**
 * A ROAD-WORKS WORKER standing inside a coned-off area — a body in a hi-vis
 * vest with a retro-reflective band, on foot, on the closed side of the cones.
 *
 * WHY THIS KIND EXISTS AT ALL (wave 8, sc-merge-roadworks-shift). The drill's
 * instruction 1 is «в ремонтен участък между конусите работят хора и те те
 * виждат само осветен», and instruction 6 repeats it — the ENTIRE reason the
 * lesson makes the student switch on dipped beams is a person who has to see
 * him. `.audit-frames/sweep161/sc-merge-roadworks-shift/mobile-wrong/07-end.png`
 * shows a bare line of loose cones on open tarmac: no worker, so the reason for
 * the headlights is a sentence with nothing behind it. A student who never saw
 * the person cannot carry the habit to a real works site at dusk.
 *
 * NEVER HITTABLE, and this one is not the usual dressing convention — it is a
 * refusal. The only collision vocabulary a held body can reach here is
 * `ScenarioObstacles`' untagged fallback, which VehicleRig grades as
 * "staticObject" and the debrief names «Удар в неподвижно препятствие». Booking
 * a PERSON as an immovable object is a worse lie than the silence: the drill
 * would teach that running a worker down costs the same as clipping a bollard.
 * The vulnerable-user vocabulary lives in the rules engine and the pedestrian
 * channel, and until a held body can reach it, this kind renders and does not
 * grade. `visual` is accepted for parity and documents the intent; a worker is
 * never hittable regardless of its value. Placements therefore keep workers
 * well inside the closed area, where no legal line and no committed ghost goes
 * (measured per placement in scenarioSceneryProps.ts).
 */
export interface ScenarioWorkerObstacle extends ObstaclePose {
  kind: "worker";
  visual?: boolean;
}

/**
 * A FUEL-STATION FORECOURT — one canopy on four columns with pump islands
 * under it. Composite on purpose: the four pieces are only meaningful
 * together, and a caller that had to place a roof, four posts and four pumps
 * by hand would place them out of square the first time it was copied.
 *
 * WHY IT EXISTS (wave 8, sc-merge-from-property, major). «There is no petrol
 * station. The briefing places the student at the exit of a бензиностанция
 * facing a boulevard … the world is a bare grey apron on an empty green plain
 * with distant mountains — no pumps, no canopy, no shop, no forecourt.»
 * (.audit-frames/sweep161/sc-merge-from-property/mobile-right/05-stopped.png.)
 * The drill is ЗДвП чл. 25 — leaving a PROPERTY gives way to everything on the
 * road — and the whole reason the student is expected to creep out and look is
 * that he is coming off private ground. A car standing on featureless tarmac
 * has no reason to yield to anybody; that is the lesson the empty apron erases.
 *
 * The station's own frame, so a placement is one line: `headingDeg` points
 * along `lengthM`, `widthM` runs across it, and the islands are offsets ACROSS
 * the heading (signed, station-centred).
 *
 * COLLIDERS: the columns and the pumps get them (they are solid objects a car
 * can hit, and the untagged fallback grades „staticObject", which is what a
 * concrete post is). The canopy deck gets none — it is `clearanceM` overhead.
 * The island kerbs get none either, deliberately: a 0.18 m kerb collider is the
 * classic way to beach a rapier chassis on a lip it should have ridden over.
 */
export interface ScenarioFuelStationObstacle extends ObstaclePose {
  kind: "fuelStation";
  /** Canopy extent ALONG the heading, m. */
  lengthM: number;
  /** Canopy extent ACROSS the heading, m. */
  widthM: number;
  /** Underside of the canopy deck above the tarmac, m. */
  clearanceM: number;
  /** Pump-island centres, m across the heading (signed, station-centred). */
  islandOffsetsM: readonly number[];
  /** Half-length of each island along the heading, m. */
  islandHalfLengthM: number;
}

export type ScenarioObstacleSpec =
  | ScenarioVehicleObstacle
  | ScenarioPropObstacle
  | ScenarioWallObstacle
  | ScenarioAnimalObstacle
  | ScenarioWorkerObstacle
  | ScenarioFuelStationObstacle;

// ---------------------------------------------------------------------------
// THE STATIONARY COLLIDER BOXES — lane endings round 3 (integrator ruling E9)
// ---------------------------------------------------------------------------
//
// The header above keeps colliders with the component, and the MOUNT still
// lives there (components/sim/ScenarioObstacles.tsx: `ObstacleWall`,
// `PropInstances`). Two of its numbers moved here, unchanged, because a pure
// reader now needs them and must read the SAME numbers the colliders are
// mounted with, not a copy: the lesson engine's crash pin says which END of
// the car touched a stationary body at a COLLISION bill (lessons/finish.ts
// `crashPinContactEnd`), so the crash hold can tell a car pressed against a
// wall which way is away from it. The component imports both back and
// re-exports `PROP_COLLIDERS`, so every existing importer reads the same
// object.

/**
 * THE TAG ON A HELD WALL'S OR PROP'S COLLIDER WHOSE BODY STANDS ON THE
 * CARRIAGEWAY (lane staticcardcopy; ADR-014 amendment 2026-11-04). Mounted by
 * `components/sim/ScenarioObstacles.tsx` (which re-exports this very object)
 * on exactly the specs `onCarriageway` marks, and read by
 * `components/sim/VehicleRig.tsx hearChassisContact` through
 * `isStaticOnCarriagewayUserData`. It is NOT an NPC tag (no `npcCollider`,
 * so the contact still classifies "staticObject") and NOT the drive-over
 * surface (no `districtSurface`, so the body keeps the lesson's threshold):
 * it changes which sentence a contact prints, nothing else. A frozen module
 * constant so the `userData` identity is stable for the body's lifetime (the
 * `DISTRICT_SURFACE_USER_DATA` convention).
 */
export const STATIC_ON_CARRIAGEWAY_USER_DATA = Object.freeze({ staticOnCarriageway: true as const });

/** Narrowing reader for the contact ear (unknown → does the struck body
 *  stand on the carriageway?). */
export function isStaticOnCarriagewayUserData(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { staticOnCarriageway?: unknown }).staticOnCarriageway === true
  );
}

/** A wall's default thickness when the spec omits it, m (ObstacleWall). */
export const WALL_DEFAULT_THICKNESS_M = 0.3;

/**
 * Prop colliders — sized to what a bumper (chassis box bottom ≈ 0.28 m) can
 * actually reach, NOT the ground-level base plate (tools/blender/
 * scenario_props.py documents the same contract):
 *  - cone: 0.50 m tall, body ≈ Ø12–16 cm at bumper heights → 16 cm square.
 *  - pole: 1.5 m marker (колче), Ø5 cm shaft → 8 cm square (a hair generous
 *    so a brushing pass registers instead of tunnelling past a 5 cm sliver).
 * Half-extents: x = width, y = height, z = length (along the heading).
 */
export const PROP_COLLIDER_DIMS: Readonly<
  Record<ScenarioPropKind, { half: { x: number; y: number; z: number }; centerY: number }>
> = {
  cone: { half: { x: 0.08, y: 0.25, z: 0.08 }, centerY: 0.25 },
  pole: { half: { x: 0.04, y: 0.75, z: 0.04 }, centerY: 0.75 },
};

/**
 * The plan-view boxes (district metres, heading of the LENGTH axis, 0 = north,
 * clockwise — collision `Obb2D`) of the obstacles in `obstacles` that mount a
 * STATIONARY, untagged collider — the bodies a contact grades as
 * `staticObject`: walls (length along the heading, thickness across) and props
 * (`PROP_COLLIDER_DIMS`). Vehicles grade as `vehicle`, and animals, workers and
 * the forecourt are not listed (no box here is theirs to claim), so a contact
 * with one of those reads as an unlisted body — never a guess.
 */
export function staticContactBodiesOf(
  obstacles: readonly ScenarioObstacleSpec[],
): { x: number; y: number; headingDeg: number; halfLengthM: number; halfWidthM: number }[] {
  const out: { x: number; y: number; headingDeg: number; halfLengthM: number; halfWidthM: number }[] = [];
  for (const o of obstacles) {
    if (o.kind === "wall") {
      out.push({
        x: o.x,
        y: o.y,
        headingDeg: o.headingDeg,
        halfLengthM: o.lengthM / 2,
        halfWidthM: (o.thicknessM ?? WALL_DEFAULT_THICKNESS_M) / 2,
      });
    } else if (o.kind === "prop") {
      const d = PROP_COLLIDER_DIMS[o.prop];
      out.push({ x: o.x, y: o.y, headingDeg: o.headingDeg, halfLengthM: d.half.z, halfWidthM: d.half.x });
    }
  }
  return out;
}
