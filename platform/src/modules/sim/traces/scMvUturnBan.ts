/**
 * sc-mv-uturn-ban — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Къде обратният завой е забранен" (doc 72 OV-17 / PK-12;
 * ЗДвП чл. 38) on the committed mv-uturn-v1 boulevard, recorded with the
 * template's OWN staged stream (single truth, imported from the template).
 *
 * Geometry pinned to content/world/mv-uturn-v1.json: a 620 m 2+2 boulevard on
 * x = 0, limit 50; outer-lane centre x = ±12.19, inner x = ±4.06, carriageway
 * |x| ≤ 16.25. The М1 непрекъсната осева + В23 posting span y ∈ [40, 220]; the
 * tempting spot is y = 130; the median gap is the cross-street junction node
 * mvu-n-gap at y = 280, with the marking dashed from y = 220. Ambient traffic
 * ZERO (seed 7) — the ONLY live participants are the three staged oncoming cars.
 *
 * The trace gate replays exactly these through the production stack:
 *  - shadow: passes the banned stretch, changes to the inner lane on the dashed
 *    run-in (mirror + indicator → SAFE_LANE_CHANGE), stops at the opening, waits
 *    ALL THREE oncoming cars out, then reverses direction in ONE forward arc →
 *    ZERO violations, movements = 1;
 *  - „Обръщане през плътната линия": the same arc at the TEMPTING spot, inside
 *    the М1 span → grades EXACTLY CROSSED_SOLID_LINE;
 *  - „Обратен завой пред насрещния поток": the right place, the wrong second —
 *    launches after car 0 into car 1's sub-2-second gap → EXACTLY
 *    FAILED_TO_YIELD (the JU-10 tracker at the junction) + COLLISION.
 *
 * THE THREE SPEED BANDS, AND WHY THEY ARE NOT DECORATION (the whole tuning
 * story of this file, in one place):
 *  - laneChangeMinSpeedKmh = 10. This boulevard is the family's only 2+2 with a
 *    graded U-turn, so the arc RENUMBERS lanes under the car: outer(0) → inner(1)
 *    → [bank flip] → inner(1) → outer(0). That last delta reads as a RIGHT lane
 *    change to the reducer, and no sane U-turn script can signal right through
 *    it — so every arc that completes runs at CREEP (8/9 km/h), under the
 *    detector's own speed floor, exactly as sc-maneuver-uturn's does. The one
 *    arc that does NOT creep (mistake-into-stream, 20 km/h — a turn commit needs
 *    55° inside the TurnDetector's 3 s window) is also the one that never gets
 *    past the inner lane: it is struck at ~110°, still on laneId 1, so no delta
 *    exists to grade.
 *  - RHR_YIELD_KMH = 8. The JU-10 tracker only records a convict-tight gap while
 *    the player is MOVING above it — a waiter reads every passing nose as tight
 *    and is innocent by definition. That is why the mistake LAUNCHES rather than
 *    creeps, and why the shadow's creep is its own acquittal.
 *  - movingSpeedKmh = 5. CROSSED_SOLID_LINE needs the wrong-bank excursion above
 *    it: the banned arc runs at 9 km/h, which holds the ~4.25 m of opposing-bank
 *    geometry (the 30° of arc between crossing x = 0 and pointing due west) for
 *    ~1.7 s — well past the 0.6 s sustain, and still under the lane floor.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_MV_UTURN_BAN } from "../lessons/scenario/templates-parking2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MV_UTURN_BAN_ID = "sc-mv-uturn-ban";

/** Northbound OUTER (curb) / INNER lane centres of mv-uturn-v1. */
const LANE_OUT = 12.19;
const LANE_IN = 4.06;
/** Cruise on the boulevard — under the 50 limit with room for the envelope. */
const CRUISE_KMH = 46;
/** Every COMPLETED arc creeps: under laneChangeMinSpeedKmh (see the header). */
const CREEP_KMH = 8;
/** The banned arc — still under the lane floor, still over the moving floor. */
const BAN_CREEP_KMH = 9;
/** The mistake's launch — over RHR_YIELD_KMH, fast enough to commit a turn. */
const LAUNCH_KMH = 20;

/**
 * One U-turn arc as a polyline: the semicircle of radius (x0 − xEnd)/2 swept
 * LEFT from a northbound lane centre at (x0, y0) to the opposing bank. Pure —
 * the recorder follows the points, so the shape is the author's, not a servo's.
 * `toDeg` cuts the sweep short (the struck demo never finishes its turn).
 */
function uturnArc(
  x0: number,
  y0: number,
  xEnd: number,
  toDeg = 180,
): Array<[number, number]> {
  const r = (x0 - xEnd) / 2;
  const cx = x0 - r;
  const pts: Array<[number, number]> = [];
  const steps = Math.max(2, Math.round(toDeg / 15));
  for (let i = 0; i <= steps; i++) {
    const th = ((toDeg * i) / steps) * (Math.PI / 180);
    pts.push([round2(cx + r * Math.cos(th)), round2(y0 + r * Math.sin(th))]);
  }
  return pts;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** The lawful arc: inner lane → opposing outer lane, launched from y = 264 so
 *  its exit lands inside the map's own 40 m turn box (meta.scenario.uturnCorridor). */
const LEGAL_ARC = uturnArc(LANE_IN, 264, -LANE_OUT);
/** The banned arc: the identical geometry, 150 m too early — inside the М1 span. */
const BANNED_ARC = uturnArc(LANE_IN, 124, -LANE_OUT);
/** The struck arc: cut at 110°, still on the inner bank when car 1 arrives. */
const STRUCK_ARC = uturnArc(LANE_IN, 264, -LANE_OUT, 110);

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — read the ban, drive on, wait, turn
// ---------------------------------------------------------------------------

export function scMvUturnBanShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Осевата е плътна и е поставен знак В23: до 220-ия метър обратният завой е забранен, колкото и широко да е платното.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_OUT, 15], [LANE_OUT, 90]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Ето го изкушението: широко, празно, „никой не идва“. Плътната линия не се пресича — подминаваме.",
      },
      { kind: "drive", points: [[LANE_OUT, 90], [LANE_OUT, 130], [LANE_OUT, 195]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "От 220-ия метър маркировката се прекъсва — забраната свършва. Оглеждаме се и минаваме във вътрешната лента.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[LANE_OUT, 195], [8, 215], [LANE_IN, 235]], targetKmh: 34, stopAtEnd: false },
      // Roll up to the opening and STOP: the width is not a right of way.
      { kind: "drive", points: [[LANE_IN, 235], [LANE_IN, 264]], targetKmh: 22 },
      {
        kind: "annotation",
        textBg: "Отворът при страничната улица — тук е разрешено. Спираме и пропускаме НАСРЕЩНИТЕ, не само първата кола.",
      },
      { kind: "glance", mirror: "left" },
      // The patience the drill is about: all three oncoming cars pass the gap
      // (t ≈ 24 / 29 / 34 s of the stream's own clock) before the wheel moves.
      { kind: "pause", sec: 14.5, brake: true },
      {
        kind: "annotation",
        textBg: "Потокът мина. Волан наляво и ЕДНА плавна дъга с пешеходна скорост — без връщане назад.",
      },
      { kind: "drive", points: LEGAL_ARC, targetKmh: CREEP_KMH, stopAtEnd: false },
      // Straighten out and settle in the opposite-direction outer lane.
      { kind: "drive", points: [[-LANE_OUT, 264], [-LANE_OUT, 263]], targetKmh: CREEP_KMH },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Готово: 150 метра търпение — и същата маневра, направена там, където е законна и безопасна.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Обръщане през плътната линия" (CROSSED_SOLID_LINE)
// ---------------------------------------------------------------------------

export function scMvUturnBanMistakeCrossSolidScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „платното е широко, а насреща няма никой“ — и колата обръща там, където линията е плътна.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_OUT, 15], [LANE_OUT, 82]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      // Everything about the setup is textbook — mirror, indicator, inner lane.
      // That is the point: the maneuver is executed correctly and is illegal.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[LANE_OUT, 82], [8, 96], [LANE_IN, 110]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[LANE_IN, 110], [LANE_IN, 124]], targetKmh: 14 },
      { kind: "pause", sec: 0.8, brake: true },
      {
        kind: "annotation",
        textBg: "Мигач, оглеждане, вътрешна лента — всичко по учебник. И въпреки това е забранено: осевата е непрекъсната.",
      },
      { kind: "drive", points: BANNED_ARC, targetKmh: BAN_CREEP_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // Away down the opposing carriageway — „и нищо не се случи“, което е
      // точно причината грешката да се повтаря.
      { kind: "drive", points: [[-LANE_OUT, 124], [-LANE_OUT, 90]], targetKmh: 28 },
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg: "Непрекъснатата осева не се пресича по никаква причина — включително за обръщане. Знакът В23 казва същото с думи.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Обратен завой пред насрещния поток"
// (FAILED_TO_YIELD at the LAWFUL gap + COLLISION)
// ---------------------------------------------------------------------------

export function scMvUturnBanMistakeIntoStreamScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: мястото е правилно, моментът — не. Първата кола мина и водачът реши, че е чисто.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_OUT, 15], [LANE_OUT, 90]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "drive", points: [[LANE_OUT, 90], [LANE_OUT, 130], [LANE_OUT, 195]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[LANE_OUT, 195], [8, 215], [LANE_IN, 235]], targetKmh: 34, stopAtEnd: false },
      { kind: "drive", points: [[LANE_IN, 235], [LANE_IN, 264]], targetKmh: 22 },
      { kind: "annotation", textBg: "Спира на отвора и пропуска първите две насрещни — дотук всичко е по учебник." },
      // THE demo hangs on this pause. The JU-10 tracker convicts only when the
      // turn COMMITS into a tight gap while the player is MOVING (> 8 km/h;
      // worldRuntime LEFT_TURN_CONVICT_GAP_SEC = 2.0) — a waiter reads every
      // passing nose as tight and is innocent by definition. Car 2's measured
      // gap sits inside the convict band for t ∈ [32.6, 34.3] of the stream's
      // own clock; launching here puts the 55° commit at t ≈ 33.2, ~1.2 s before
      // it reaches the node. Half a second earlier and the same drive grades
      // YIELDED_TO_PRIORITY — a commendation for the act that gets people killed.
      { kind: "pause", sec: 4.2, brake: true },
      { kind: "annotation", textBg: "…и тръгва пред третата. Обръщането отнема секунди, в които няма спиране и няма връщане." },
      { kind: "drive", points: STRUCK_ARC, targetKmh: LAUNCH_KMH, stopAtEnd: false },
      // The AUTHORED consequence (the scJxEqualLeft precedent): at this frame the
      // car sits stalled across the inner oncoming lane at (−6.8, 271.7) and car 2
      // is 5 m away closing at 8 m/s. It never actually lands, because
      // OncomingStreamRunner stages every car with playerGuard by contract — the
      // stream emergency-brakes rather than ram a gambler, "and the runtime's
      // gap-memory latch keeps the conviction honest against the guard's rescue"
      // (contracts.ts OncomingStreamSpec). Verified, not assumed: with this step
      // removed the drive grades FAILED_TO_YIELD and nothing else. So the
      // conviction above is REAL and measured off the real gap; the impact is
      // narrated, because the harness is merciful and the boulevard is not.
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.2, brake: true },
      {
        kind: "annotation",
        textBg: "Пропускаш ЦЕЛИЯ поток, не първата кола. „Разрешено“ казва къде може да обърнеш, не кога.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScMvUturnBanTraceName =
  | "shadow-correct"
  | "mistake-cross-solid"
  | "mistake-into-stream";

const SCRIPTS: Record<
  ScMvUturnBanTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scMvUturnBanShadowScript },
  "mistake-cross-solid": { kind: "mistake", script: scMvUturnBanMistakeCrossSolidScript },
  "mistake-into-stream": { kind: "mistake", script: scMvUturnBanMistakeIntoStreamScript },
};

/**
 * Record one of the three drives against a loaded mv-uturn-v1 document — the
 * TEMPLATE's staged oncoming stream armed (single truth), ambient traffic zero
 * (the harness law). Deterministic: same district → same trace.
 */
export function recordScMvUturnBanDrive(
  districtRaw: unknown,
  name: ScMvUturnBanTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MV_UTURN_BAN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_MV_UTURN_BAN.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
