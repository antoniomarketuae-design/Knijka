/**
 * sc-ac-bridge-ice — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Мостът замръзва пръв" (doc 72 AC-08, the ANTICIPATION
 * arm) on the committed ac-bridge-v1 district (520 m street, limit 50),
 * recorded on a COLD CLEAR MORNING — day, DRY, no weather flag at all: the
 * invisible ice under a blue sky IS the doc-72 surprise. No lane actors,
 * ambient traffic ZERO (seed 7). The hazards are the map's icePatch deck span
 * [250, 340] and the bridge's own PARAPETS, staged as recorder obstacle rects
 * (the sc-ac-ice / sc-ac-aquaplane mold) — and, since row sc-ac-ice:86eab7e9,
 * BUILT in the world at exactly those faces (world/builders/bridgeDeck.ts: the
 * deck, both walls, their pylons, in the wall collider). The replays are drawn
 * over that wall, so a ghost must never be left inside it:
 * traces/__tests__/sc-ac-bridge-ice-ghost-meets-built-wall.test.ts measures the
 * DRAWN ghost (hero_car.glb fitted to the collider width) against the BUILT
 * faces.
 *
 * WHY PARAPETS AND NOT A STALLED CAR (the sc-ac-ice device — read before
 * "aligning" these):
 *   - sc-ac-ice puts a stalled car on its span because its shadow's job is to
 *     STOP. This shadow's job is to CROSS: lift off before the near abutment,
 *     hold the crawl across the deck, and put the throttle down only past the
 *     far one. A car parked in the lane would replace that lesson with sc-ac-
 *     ice's, and there would be no reason for this template to exist.
 *   - The parapets are what a bridge actually IS, physically and pedagogically:
 *     the one place on the map where being off-line has a hard edge and there
 *     is no verge, no shoulder and no room to run out a slide. They sit clear
 *     of every line the shadow drives, so they cost the correct demo nothing —
 *     and they are exactly there when the brake-on-ice demo needs them.
 *
 * DUAL-CHANNEL HONESTY (the 4a design note, bridge edition — read before
 * editing):
 *   - The LIVE student session runs the REAL ice: NO physics flag is authored
 *     (base grip 1 — the clear dry morning); the district's icePatch drops the
 *     live grip to MIN(1, 0.15) = 0.15 across [250, 340] at ANY speed (ice has
 *     no float gate — runtime/surface.ts). Measured at 0.15: braking ≈ 5.5×
 *     dry distance, steering ≈ 0.14× (vehicle/surface-grip.test.ts).
 *   - These RECORDED demos are KINEMATIC, so the ice truth is AUTHORED: every
 *     on-deck ramp uses ICE_DECEL = SCRIPT_DECEL × ICE_PATCH_GRIP_FACTOR ≈
 *     0.69 m/s² — the same ~0.15 scaling the live car obeys on the span. The
 *     brake-on-deck demo shows that a held brake at 0.69 m/s² sheds ~5 km/h in
 *     the meters available and takes the car's DIRECTION with it; the shadow
 *     never brakes on the deck at all, because it never needs to.
 *
 * The trace gate replays exactly these through the production stack, day dry:
 *   - shadow: ~45 km/h approach, eases to ~24 on the DRY asphalt well before
 *     the near abutment (the objective zone y = 235 ± 10, cap 30), holds the
 *     crawl dead-straight across the whole deck (still ≤ 30 at the far
 *     abutment — the y = 335 ± 8 gate), and only then accelerates to ~48 on
 *     the dry far side, resting at the end → ZERO violations + CLEAN_DRIVING;
 *   - „Мостът с пътна скорост": legal 50 carried onto the deck; the tail steps
 *     out and the car wanders the curb side past x = 7.3125 for 3.45 s
 *     (measured — past the 3 s POOR_LANE_KEEPING sustain), peaking at x = 7.90
 *     so the hero edge misses the parapet face by ~0.95 m, and gathering itself
 *     only past the far abutment → EXACTLY POOR_LANE_KEEPING (never a speed
 *     code: 50 = the posted limit, dry day, no conditions envelope — see the
 *     template header);
 *   - „Спирачка ВЪРХУ леда": 50 onto the deck, brake pressed ON the ice at
 *     y = 255 — over the ~37 m to the wall the held pedal sheds ~7.5 km/h
 *     while the car's momentum carries it off-line into the east parapet at
 *     ~42 km/h, and the replay ENDS against the wall's face → EXACTLY
 *     COLLISION. Never
 *     HARSH_BRAKING_NO_CAUSE: −7 m/s² is unreachable at 0.15 grip, which is the
 *     whole point. Never POOR_LANE_KEEPING either — the car is off-line and
 *     MOVING for 1.05 s before the wall stops it (measured), a third of the 3 s
 *     sustain: on a bridge the parapet arrives before the paperwork.
 *
 * Geometry pinned to content/world/ac-bridge-v1.json: street on x = 0,
 * right-lane center x = 4.06 (drawn lane 8.125 m), spawn ac-bridge-spawn-
 * approach (4.06, 15) heading north, 520 m, limit 50, icePatch deck [250, 340].
 * Lane detectors (DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM = 3.25): the curb side
 * of the band ends at x = 7.3125 (POOR_LANE_KEEPING, 3 s sustain); the осева
 * side at x = 0.8125 (CENTER_LINE_TOUCHED) — every drive here stays east of the
 * lane center, so that detector never arms. The parapets stand at x = ±10.2
 * with a 0.5 m half-width, i.e. inner faces at ±9.7 — 1.58 m beyond the
 * carriageway edge (the deck's footway). The hero footprint is
 * CHASSIS_HALF_EXTENTS (half-width 0.85, half-length 2.02), so a centered car
 * touches the east face once its centre passes ~8.5 at the shallow headings
 * these polylines carry.
 */

import { ICE_PATCH_GRIP_FACTOR } from "../vehicle";
import { SC_AC_BRIDGE_ICE } from "../lessons/scenario/templates-conditions2";
import {
  recordScriptedDrive,
  SCRIPT_DECEL,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_BRIDGE_ICE_ID = "sc-ac-bridge-ice";

/** Northbound right-lane center of ac-bridge-v1. */
const LANE_X = 4.06;
/** The deck (the icePatch span — battery-pinned against the map). */
const DECK_FROM = 250;
const DECK_TO = 340;
/** Parapet centre offset + half-width → inner faces at ±9.7 (see the header). */
const PARAPET_X = 10.2;
const PARAPET_HALF_W = 0.5;

/**
 * The AUTHORED on-ice envelope of every on-deck ramp in this file: SCRIPT_DECEL
 * × ICE_PATCH_GRIP_FACTOR ≈ 0.69 m/s² — the dual-channel honesty contract
 * (change the physics factor and the ghosts follow on the next re-record).
 */
export const ICE_DECEL = SCRIPT_DECEL * ICE_PATCH_GRIP_FACTOR;

/**
 * The bridge parapets: two walls running the length of the deck, one per side.
 * The ONE thing a bridge always has and an ordinary street never does — no
 * verge, no shoulder, nowhere for a slide to run out. The shadow never comes
 * within 5 m of either.
 */
export function bridgeParapetObstacles(): ObstacleRect2D[] {
  return [
    {
      x: PARAPET_X,
      y: (DECK_FROM + DECK_TO) / 2,
      headingDeg: 0,
      halfWidthM: PARAPET_HALF_W,
      halfLengthM: (DECK_TO - DECK_FROM) / 2,
      withWhat: "staticObject" as const,
    },
    {
      x: -PARAPET_X,
      y: (DECK_FROM + DECK_TO) / 2,
      headingDeg: 0,
      halfWidthM: PARAPET_HALF_W,
      halfLengthM: (DECK_TO - DECK_FROM) / 2,
      withWhat: "staticObject" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — lift off BEFORE the deck, cross steady,
// throttle only past the far abutment
// ---------------------------------------------------------------------------

export function scAcBridgeIceShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Ясна зимна сутрин около нулата. Улицата е суха и черна — и точно затова нищо не те подготвя за това, което идва." },
      { kind: "glance", mirror: "rear" },
      // EVERY CAPTION BELOW IS PLACED FOR ITS WHOLE WINDOW, not for the
      // instant it appears (row sc-ac-ice:86eab7e9, round-3 verifier
      // ANNOT-WINDOW). The product keeps a caption up for 4 s or until the next
      // one (traces/sample.ts activeAnnotationIndex), so each line is emitted
      // where what it says stays true for that long, and the drive is split
      // there — on straight polylines, so the path is unchanged.
      // traces/__tests__/sc-ac-bridge-ice-caption-windows.test.ts holds every
      // caption against the ghost at 60 Hz over its whole window.
      //
      // Legal ~45 on the dry approach — nothing to see here yet.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 100], [LANE_X, 150]], targetKmh: 45, stopAtEnd: false },
      // Was „…и пътят тръгва над дерето: това е мост." The deck is built; the
      // ravine is not (bridgeDeck.ts: the ground backdrop would cover a carved
      // gorge), so the line names what the student sees from y ≈ 150 to 193:
      // the street's own blocks end at 200, and the abutment pylons and
      // parapets stand ahead at 250.
      //
      // Round 4 said «Сградите свършват от двете страни» — ALL the buildings —
      // and the BUILT world does not keep that (round-4 verifier
      // RIM-BUILDINGS): the world rim (world/builders/worldRim.ts) stands
      // 15–22 m masses at |x| 80–99 on both sides for the whole length of the
      // map, beside the whole bridge. The rim is kept and the SENTENCE changed,
      // because the rim is the city edge every authored map carries so that
      // the car never leaves the drawn world (the void frames of the w11
      // sweep); opening it beside this span would put that defect back for a
      // cue the lesson does not need — what marks the structure is the street's
      // frontage ending and the abutments ahead, and both are true. So the line
      // names the blocks BESIDE the carriageway, and says what else the
      // student sees: the town far off to either side.
      // traces/__tests__/sc-ac-bridge-ice-caption-windows.test.ts reads both
      // sets off the built walls.
      { kind: "annotation", textBg: "Блоковете край платното свършват от двете страни — градът остава далеч встрани, а напред са устоите и парапетите: това е мост. Под платното му няма топла земя — той е заледен, докато улицата е суха." },
      { kind: "drive", points: [[LANE_X, 150], [LANE_X, 180]], targetKmh: 45, stopAtEnd: false },
      // THE DECISION, taken on DRY asphalt: the ease-down completes ~15 m
      // before the near abutment, so the objective zone (y = 235 ± 10, cap 30)
      // is passed at ~24. This is the entire template in one step.
      { kind: "drive", points: [[LANE_X, 180], [LANE_X, 200]], targetKmh: 24, stopAtEnd: false },
      // Was „Знакът А15 е на близкия устой." The zone-sign pass posts the А15
      // HAZARD_WARNING_AHEAD_M = 60 m before the ice (y = 190). Round 3 played
      // this at y ≈ 240, and at 24 km/h its 4 s window ran onto the deck: «the
      // abutment is ahead» stood over the ice for most of it. From y = 200 the
      // window ends near 227 — the whole car past the sign, the front short of
      // the abutment, the car still on the dry, on every frame it is up.
      { kind: "annotation", textBg: "Знакът А15 остана зад нас, устоят е пред нас. Решението се взима ТУК, на сухото — върху леда спирачката вече няма да я има." },
      { kind: "drive", points: [[LANE_X, 200], [LANE_X, 240]], targetKmh: 24, stopAtEnd: false },
      // The transit: dead-straight, constant crawl, not one correction. No
      // braking ramp anywhere on the span — the shadow never needs one.
      { kind: "drive", points: [[LANE_X, 240], [LANE_X, 255]], targetKmh: 24, stopAtEnd: false },
      // ON the deck, where the steady crawl it describes is happening. It used
      // to play at the far abutment, over the ACCELERATION the next step makes
      // — «и никакво ускорение» while the car sped up from 24 to 48.
      { kind: "annotation", textBg: "Равна газ, прав волан, нула корекции. И никакво ускорение — газта върху лед е също толкова рязка команда, колкото спирачката." },
      { kind: "drive", points: [[LANE_X, 255], [LANE_X, 345]], targetKmh: 24, stopAtEnd: false },
      // Only NOW the throttle: the far abutment is behind, the dry street is
      // back, and normal speed is not merely allowed — it is correct. The line
      // plays as the throttle goes down (it used to play 85 m later, over the
      // cruise and the brake to the stop — «чак сега газ» with the foot off).
      { kind: "annotation", textBg: "Устоят е зад нас, асфалтът пак е сух — чак сега газ. Мостът се минава, не се спира на него." },
      { kind: "drive", points: [[LANE_X, 345], [LANE_X, 430]], targetKmh: 48, stopAtEnd: false },
      { kind: "drive", points: [[LANE_X, 430], [LANE_X, 490]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Правилото: открито съоръжение в мразовита сутрин = лед, докато не се докаже обратното. Скоростта пада ПРЕДИ него." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Мостът с пътна скорост — задницата тръгва"
// (POOR_LANE_KEEPING)
// ---------------------------------------------------------------------------

export function scAcBridgeIceMistakeRoadSpeedScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: 50 по моста — „нали е в ограничението, пътят е сух“. Сухата беше улицата, не съоръжението." },
      { kind: "glance", mirror: "rear" },
      // Legal 50 (the posted limit; dry day — no conditions envelope) carried
      // straight onto the deck. Nothing the engine can bill… yet.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 120], [LANE_X, DECK_FROM]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Първите метри лед — и задницата тръгва. Воланът върху 15% сцепление не води: той моли." },
      // THE SLIDE, authored into the polyline: the tail steps out and the car
      // wanders the curb side past x = 7.3125 for 3.45 s (measured — past the
      // 3 s POOR_LANE_KEEPING sustain), peaking at x = 7.90 so the hero edge
      // misses the east parapet's face (9.7) by ~0.95 m. It gathers itself only
      // once the far abutment and its dry asphalt are behind.
      {
        kind: "drive",
        points: [[LANE_X, DECK_FROM], [5.6, 266], [7.6, 282], [7.9, 320], [6.4, DECK_TO], [LANE_X, 362]],
        targetKmh: 50,
        stopAtEnd: false,
      },
      // Played HERE, once the car is back on its line past the deck, so it is
      // said in the PAST (row sc-ac-ice:86eab7e9, round-3 verifier
      // ROADSPEED-CAPTION): it used to say «се носи … на около метър от
      // парапета» in the present over 4 s of straight driving in the lane,
      // 6.6 m from any railing. The numbers are the slide's own — peak 3.84 m
      // off the lane centre, the body's edge ~0.95 m from the parapet face —
      // held by traces/__tests__/sc-ac-bridge-ice-caption-windows.test.ts.
      { kind: "annotation", textBg: "Колата се носеше странично почти четири метра встрани от линията си, на около метър от парапета — а мост не прощава линия: няма банкет, няма къде да излезеш." },
      { kind: "drive", points: [[LANE_X, 362], [LANE_X, 440]], targetKmh: 45 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Оцеляването беше късмет, не умение. Ограничението е таван за платно в добро състояние — на мост в мразовита сутрин състоянието е лед (чл. 20, ал. 2)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Спирачка ВЪРХУ леда" (COLLISION)
// ---------------------------------------------------------------------------

export function scAcBridgeIceMistakeBrakeOnDeckScript(): DriveScript {
  return {
    steps: [
      // «75 метра по-късно ОТ ПРАВИЛНИЯ ВОДАЧ»: this demo's first brake is at
      // y ≈ 255.7, the shadow's ease-down starts at y ≈ 180.6 (both measured
      // off the recordings by sc-ac-bridge-ice-caption-windows.test.ts). It
      // used to say «90 метра по-късно», with no referent and no recording
      // that gives 90.
      { kind: "annotation", textBg: "Грешката: този водач разбра, че мостът е лед — но го разбра 75 метра по-късно от правилния водач, вече върху него." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 120], [LANE_X, 255]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Кракът натиска спирачката ВЪРХУ съоръжението — и не отговаря нищо. Педалът не спира колата; той ѝ отнема посоката." },
      // The brake ON the ice, authored honestly: the held pedal delivers only
      // the ICE envelope (≈ 0.69 m/s²), so over the ~37 m to the wall it sheds
      // ~7.5 km/h while the car's momentum carries it off-line into the east
      // parapet (inner face 9.7) at ~42 km/h. For scale: a DRY brake from 50
      // stops this car in ~24 m — it would never have reached the wall at all.
      // The car is off-line and moving for well under the 3 s lane-keeping
      // sustain, so the ONLY code is the wall.
      //
      // THE POLYLINE ENDS AT THE WALL (row sc-ac-ice:86eab7e9, round-2 F3).
      // It used to run on to (9.3, 296): the recorder BOOKS a contact but
      // never stops the pose, so once the parapet was built the ghost drove
      // its front corner 0.75 m into the concrete and sat there for the last
      // 1.5 s of the replay. The end point is now the pose at which the
      // chassis's front-right corner has just crossed the face (x ≈ 9.713 at
      // this ~8.9° heading — the SAT overlap the COLLISION needs) and the
      // drawn body (hero_car.glb, ~4.22 m) is ≤ 3 cm into it: the car stops
      // AGAINST the wall, and the kinematic stop at the polyline end is the
      // impact.
      {
        kind: "drive",
        points: [[LANE_X, 255], [6.0, 275], [8.56, 291.3]],
        targetKmh: 50,
        maxDecelMps2: ICE_DECEL,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Забележи какво НЕ се случи: няма рязко спиране — на лед то е физически невъзможно. Затова намаляването не е реакция, а предвиждане: преди устоя, на чист асфалт (чл. 20, ал. 2)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcBridgeIceTraceName =
  | "shadow-correct"
  | "mistake-road-speed"
  | "mistake-brake-on-deck";

const SCRIPTS: Record<
  ScAcBridgeIceTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcBridgeIceShadowScript },
  "mistake-road-speed": { kind: "mistake", script: scAcBridgeIceMistakeRoadSpeedScript },
  "mistake-brake-on-deck": { kind: "mistake", script: scAcBridgeIceMistakeBrakeOnDeckScript },
};

/**
 * Record one of the three drives against a loaded ac-bridge-v1 document — on
 * the DAY-DRY cold morning (no weather flag: the ice is map data, not a render
 * tag), the parapets armed, ambient traffic zero (the harness law).
 * collisionMinKmh 5 so even a slowed slide into the wall grades COLLISION.
 * Deterministic: same district → same trace.
 */
export function recordScAcBridgeIceDrive(
  districtRaw: unknown,
  name: ScAcBridgeIceTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_BRIDGE_ICE_ID,
    kind,
    seed: 7,
    ...(SC_AC_BRIDGE_ICE.staged && SC_AC_BRIDGE_ICE.staged.length > 0
      ? { stagedEvents: [...SC_AC_BRIDGE_ICE.staged] }
      : {}),
    obstacles: bridgeParapetObstacles(),
    collisionMinKmh: 5,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
