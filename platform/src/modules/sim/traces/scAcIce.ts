/**
 * sc-ac-ice — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Черен лед" (doc 72 AC-08 ice band — the icePatch
 * slice of the surface-patch unlock) on the committed ac-ice-v1 district
 * (360 m street, limit 50), recorded on a COLD CLEAR MORNING — day, DRY, no
 * weather flag at all: the invisible ice IS the doc-72 surprise. No lane
 * actors, ambient traffic ZERO (seed 7): the hazards are the map's icePatch
 * span [210, 300] (black ice on ordinary street asphalt — ac-ice-v1 carries no
 * bridge geometry, and the deck arm of AC-08 is sc-ac-bridge-ice's) and a
 * STALLED CAR standing on it at
 * y = 290 — the car that already slid to a stop there — staged as a recorder
 * obstacle rect (the wet-braking mold).
 *
 * DUAL-CHANNEL HONESTY (the 4a design note, ice edition — read before
 * editing):
 *   - The LIVE student session runs the REAL ice: NO physics flag is
 *     authored (base grip 1 — the clear dry morning); the district's
 *     icePatch drops the live grip to MIN(1, 0.15) = 0.15 across [210, 300]
 *     at ANY speed (ice has no float gate — runtime/surface.ts). Measured at
 *     0.15: braking ≈ 5.5× dry distance, steering ≈ 0.14×
 *     (vehicle/surface-grip.test.ts).
 *   - These RECORDED demos are KINEMATIC, so the ice truth is AUTHORED:
 *     every on-ice ramp uses ICE_DECEL = SCRIPT_DECEL ×
 *     ICE_PATCH_GRIP_FACTOR ≈ 0.69 m/s² — the same ~0.15 scaling the live
 *     car obeys on the span. The brake-on-ice mistake shows that even a held
 *     brake at 0.69 m/s² cannot stop 50 km/h in the meters available; the
 *     shadow starts the SAME feeble envelope absurdly early and rests
 *     exactly at the mark.
 *
 * The trace gate replays exactly these through the production stack, day dry:
 *   - shadow: ~40 km/h approach, crawls to ~25 BEFORE the bridge (the dry
 *     asphalt is where slowing still works), steady across the ice, then the
 *     feather-light ICE_DECEL stop at the mark (y = 280), ~5.7 m short of
 *     the stalled car → ZERO violations + CLEAN_DRIVING;
 *   - „Спирачка върху леда": legal 50 onto the span, brake pressed ON the
 *     ice at y ≈ 235 — the 0.69 m/s² envelope sheds barely 10 km/h over
 *     ~50 m and the car slides into the stalled car at ~40 km/h → EXACTLY
 *     COLLISION (never a speed code: 50 = the posted limit, dry day, no
 *     conditions envelope);
 *   - „Рязък волан върху леда": ~45 km/h and a panic yank around the
 *     stalled car — the slide glides wide to the curb side and wobbles
 *     along it (x > 7.3125 from y ≈ 243 to ≈ 303 — ~4.7 s at 45 km/h, past
 *     the 3 s POOR_LANE_KEEPING sustain), squeezing past the car by
 *     centimeters → EXACTLY POOR_LANE_KEEPING.
 *
 * Geometry pinned to content/world/ac-ice-v1.json: street on x = 0, right-
 * lane center x = 4.06 (drawn lane 8.125 m), spawn ac-ice-spawn-approach
 * (4.06, 15) heading north, 360 m, limit 50, icePatch [210, 300]. The
 * stalled car sits centred at (4.06, 290); the hero footprint clears it from
 * a stop at y = 280 (nose 282.02 vs its rear face at 287.75) and overlaps it
 * once the centre passes ~285.7. Lane detectors: the curb side of the band
 * ends at x = 7.3125 (POOR_LANE_KEEPING, 3 s sustain); the curb-side pass
 * keeps ≥ 1.8 m of clearance to the car rect (7.7 − 0.85 = 6.85 vs
 * 4.06 + 0.9 = 4.96) — a near-miss, never a contact.
 */

import { ICE_PATCH_GRIP_FACTOR } from "../vehicle";
import { SC_AC_ICE } from "../lessons/scenario/templates-conditions";
import {
  recordScriptedDrive,
  SCRIPT_DECEL,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_ICE_ID = "sc-ac-ice";

/** Northbound right-lane center of ac-ice-v1. */
const LANE_X = 4.06;
/** The stop mark the shadow crawls to (denormalized in the template). */
const STOP_MARK_Y = 280;
/** The stalled car's centre in the lane — ON the icy span. */
const CAR_Y = 290;

/**
 * The AUTHORED on-ice envelope of every ice ramp in this file: SCRIPT_DECEL
 * × ICE_PATCH_GRIP_FACTOR ≈ 0.69 m/s² — the dual-channel honesty contract
 * (change the physics factor and the ghosts follow on the next re-record).
 */
export const ICE_DECEL = SCRIPT_DECEL * ICE_PATCH_GRIP_FACTOR;

/** The stalled car (the wet-braking vehicle footprint) centred in the lane
 *  at (4.06, 290): the obstruction the driver must stop short of. */
export function iceCarObstacle(): ObstacleRect2D[] {
  return [
    {
      x: LANE_X,
      y: CAR_Y,
      headingDeg: 0,
      halfWidthM: 0.9,
      halfLengthM: 2.25,
      withWhat: "vehicle" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — crawl BEFORE the ice, feather the stop
// ---------------------------------------------------------------------------

export function scAcIceShadowScript(): DriveScript {
  return {
    steps: [
      // sc-ac-ice:04e6d074 — CRITICAL, and this caption is the whole of what
      // survived. templates-conditions.ts re-authored the lesson around BLACK
      // ICE ON AN ORDINARY STREET and struck the bridge from steps 1, 2, 4, 7
      // and 9, writing down why: ac-ice-v1 has no deck, and the bridge arm of
      // AC-08 has its own lesson on ac-bridge-v1, «whose icePatch IS authored
      // as a deck». The captions were not re-authored with the steps, so the
      // bridge went on being TAUGHT over the windscreen —
      // `.audit-frames/w10-1/frames/sc-ac-ice__pc-right/04-t086s.png`, and the
      // round-10 judge read the pavement parapet at 04-t097s as a deck and
      // closed the clause on it. It is not one: that frame is the B65 railing
      // beside the footway with green ground behind it, the road running dead
      // straight through, and ac-ice-v1's document carries no bridge geometry
      // at all — only the icePatch span [210, 300] and its А15.
      //
      // WHAT THE CAPTION NOW NAMES IS WHAT THE MAP HOLDS: the posted А15 and
      // the invisible ice. The bridge thermodynamics are not lost — they are
      // knowledge about Bulgarian roads and live in `teach.whenBg`, where they
      // are not a claim about this street.
      { kind: "annotation", textBg: "Ясна студена сутрин след влажна нощ — и знак А15 „Опасност от хлъзгане“ напред. Черният лед хваща пръв тук: асфалтът изглежда сух, а не е." },
      { kind: "glance", mirror: "rear" },
      // Legal ~40 on the dry approach.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 80], [LANE_X, 160]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Смъкваме до пълзене ОЩЕ ТУК, на сухия асфалт — върху леда спирачката вече няма да я има." },
      // Crawl established BEFORE the span (the objective zone y 190 ± 10,
      // cap 30, is passed at ~25); the slow-down happens on DRY tarmac at
      // the comfortable dry envelope — the honest place for it.
      { kind: "drive", points: [[LANE_X, 160], [LANE_X, 195]], targetKmh: 25, stopAtEnd: false },
      // „Напред е закъсал автомобил" struck for the reason the template writes
      // down itself: the stalled car «has no `scenarioSceneryProps.ts` entry»,
      // so the scene never draws it and the live student is sent to look at
      // nothing. What the guidance layer DOES draw is the marked stop position,
      // so that is what the caption points at.
      { kind: "annotation", textBg: "Върху леда: равна газ, прав волан, никакви резки движения. Спирането е към маркираната позиция напред." },
      // The on-ice crawl + the feather-light stop: the ICE envelope
      // (≈ 0.69 m/s²) needs ~50 m from 25 km/h, so the ghost starts easing
      // around y ≈ 230 — absurdly early by dry habit, exactly right on ice.
      { kind: "drive", points: [[LANE_X, 195], [LANE_X, STOP_MARK_Y]], targetKmh: 25, maxDecelMps2: ICE_DECEL },
      { kind: "pause", sec: 2, brake: true },
      { kind: "annotation", textBg: "Спряхме свръхплавно на позицията — ледът получи нула резки команди." },
      { kind: "annotation", textBg: "Правилото: сутрин под нулата асфалтът е лед, докато не се докаже обратното. Скоростта пада ПРЕДИ него." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Спирачка върху леда" (COLLISION)
// ---------------------------------------------------------------------------

export function scAcIceMistakeBrakeOnIceScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: улицата изглежда суха, колата носи 50 — а платното напред е заледено и никой не намали преди него." },
      { kind: "glance", mirror: "rear" },
      // Legal 50 (the posted limit; dry day — no conditions envelope) carried
      // straight ONTO the ice.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 80], [LANE_X, 235]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Закъсалият автомобил изниква напред — и кракът натиска спирачката ВЪРХУ леда." },
      // The brake ON the ice, authored honestly: the held pedal delivers only
      // the ICE envelope (≈ 0.69 m/s²) — over the ~50 m to the stalled car it
      // sheds barely 10 km/h and the slide ends IN the car at ~40 km/h.
      { kind: "drive", points: [[LANE_X, 235], [LANE_X, 291]], targetKmh: 50, maxDecelMps2: ICE_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "При 15% сцепление спирачката не спира — тя се моли. Намаляването е трябвало да стане преди леда, на чист асфалт (чл. 20, ал. 2)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Рязък волан върху леда" (POOR_LANE_KEEPING)
// ---------------------------------------------------------------------------

export function scAcIceMistakeHarshSteerScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: вместо спирачка — паническо дръпване на волана върху леда." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 80], [LANE_X, 200]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "Закъсалият е напред, скоростта е висока — и ръцете дръпват волана рязко надясно. Върху лед завъртяното колело не води: то ПОДНАСЯ." },
      // The slide, authored into the polyline: the yank sends the car
      // gliding wide to the curb side, wobbling along it (x > 7.3125 from
      // y ≈ 243 to ≈ 303 — ~4.7 s at 45 km/h, past the 3 s POOR_LANE_KEEPING
      // sustain) and squeezing past the stalled car by ~1.9 m — luck, not
      // control; the line only comes back after the bridge.
      {
        kind: "drive",
        points: [[LANE_X, 200], [6.0, 228], [7.7, 248], [7.7, 298], [6.0, 318], [LANE_X, 338]],
        targetKmh: 45,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Колата се плъзга косо покрай закъсалия на сантиметри и се олюлява чак до бордюра — никой не я кара в тези секунди." },
      { kind: "drive", points: [[LANE_X, 338], [LANE_X, 350]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Оцеляването беше късмет. На лед всяко движение е малко и плавно — а истинската корекция е скоростта, паднала преди леда." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcIceTraceName = "shadow-correct" | "mistake-brake-on-ice" | "mistake-harsh-steer";

const SCRIPTS: Record<
  ScAcIceTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcIceShadowScript },
  "mistake-brake-on-ice": { kind: "mistake", script: scAcIceMistakeBrakeOnIceScript },
  "mistake-harsh-steer": { kind: "mistake", script: scAcIceMistakeHarshSteerScript },
};

/**
 * Record one of the three drives against a loaded ac-ice-v1 document — on
 * the DAY-DRY cold morning (no weather flag: the ice is map data, not a
 * render tag), the stalled-car obstacle armed, ambient traffic zero (the
 * harness law). collisionMinKmh 5 so even a slowed slide into the car grades
 * COLLISION. Deterministic: same district → same trace.
 */
export function recordScAcIceDrive(
  districtRaw: unknown,
  name: ScAcIceTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_ICE_ID,
    kind,
    seed: 7,
    ...(SC_AC_ICE.staged && SC_AC_ICE.staged.length > 0
      ? { stagedEvents: [...SC_AC_ICE.staged] }
      : {}),
    obstacles: iceCarObstacle(),
    collisionMinKmh: 5,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
