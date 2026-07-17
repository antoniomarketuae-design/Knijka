/**
 * sc-ed-d2-stop-address — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for the Наредба-38 command „Спрете на удобно
 * място" (ED-03) on the committed d2-v1 district (ADR-007), with the
 * move-off-observation drill ENABLED via the recorder's ruleConfig override —
 * mirrored from SC_ED_D2_STOP_ADDRESS.ruleConfig so the recorder grades exactly
 * what the LIVE lesson grades (the sc-vp-handbrake / sc-ed-d2-priority-run
 * precedent). The serialized trace bytes never depend on the config.
 *
 * THE BLOCK (Незабравка e76856228.0, one leg, 375 m of two-way residential):
 *   s=0     spawn (343.0, −127.6) hdg 229.2 — at rest against the curb at the
 *           street's NE end; the FIRST move-off is the graded one (engine.ts
 *           latches s.moveOff.done on the first crossing of movingSpeedKmh),
 *           which is why the drill opens here instead of closing here;
 *   s=60    settled in the lane at exam pace (the move-off gate);
 *   s=190   the command lands — „спрете на удобно място";
 *   s=220   the planned-approach gate (≤ 32 km/h — where „плавно" gets teeth);
 *   s=256   the chosen legal stretch: mid-block, straight, 121 m clear of the
 *           block's only junction (n1119524707, uncontrolled, at s≈377);
 *   s=377   that junction — never reached by any of the three drives.
 *
 * WHY THIS BLOCK IS THE WHOLE TUNING: e76856228.0 carries NO crossing, NO
 * derived stop line and NO signal (the exam-districts battery pins all three),
 * and lanesPerDir is 1, so LANE_CHANGE_* and NOT_KEEPING_RIGHT cannot exist
 * either. Every entry in the HARSH_BRAKING_NO_CAUSE cause ledger (engine.ts) is
 * therefore positively ABSENT — no lead (ambient zero, no staged actors), no
 * forbidding signal, no crossing, no stop line within 60 m, no junction within
 * 35 m of the slam — which is what lets the dive demo convict on that code and
 * nothing else. The scSpHarshBrake precedent, on real Лозенец topology.
 *
 * ROUTE DERIVED, NOT PASTED (the scEdD2CityRun precedent): d2-v1 is real OSM, so
 * the authored content is the LEG, not ~100 pasted points; deriving the line
 * makes the committed traces a byte-gate on the map itself. One leg, one offset:
 * a two-way 2-lane edge is lanesPerDir 1, so its only lane center sits half a
 * lane right of the polyline (locator.ts computeLane, inverted).
 *
 * The trace gate replays exactly these through the production stack with the
 * move-off drill ENABLED:
 *   - shadow: mirror + shoulder glance at rest, left indicator, pull away,
 *     45 km/h down the block, right indicator, planned ease-down and a smooth
 *     stop on the legal stretch → ZERO violations;
 *   - „Спиране на първото зърнато място": the same observed pull-away (isolated
 *     — one fault per card), then a 12 m/s²-envelope slam onto the first gap at
 *     s≈160 → EXACTLY HARSH_BRAKING_NO_CAUSE;
 *   - „Потегляне без оглед": the shadow's drive with the indicator intact and
 *     the two opening glances removed → EXACTLY MOVE_OFF_WITHOUT_OBSERVATION.
 */

import { PERCEPTUAL_ROAD_SCALE } from "../contracts";
import { SC_ED_D2_STOP_ADDRESS } from "../lessons/scenario/templates-exam";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_ED_D2_STOP_ADDRESS_ID = "sc-ed-d2-stop-address";

type Pt = [number, number];

/** Scaled lane width (spatial.ts LANE_WIDTH_M — the district authoring law). */
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;
/**
 * Curb-lane center offset from the polyline, m. Незабравка is a TWO-WAY 2-lane
 * edge ⇒ lanesPerDir = floor(2/2) = 1, so each bank holds exactly one lane and
 * its center sits half a lane width right of the geometry (locator.ts). One leg,
 * one offset — no per-leg seams to zigzag over.
 */
const CURB_OFF = 0.5 * LANE_W; // 4.0625

/** The authored block: [edgeId, travel is geometry-forward]. */
const LEGS: ReadonlyArray<readonly [string, boolean]> = [
  ["e76856228.0", true], // Незабравка, NE cut end → n1119524707 (the junction)
];

interface RawDistrict {
  roads: { edges: Array<{ id: string; geometry: number[][] }> };
}

/** Offset a polyline to the RIGHT of its travel direction (x-east/y-north). */
function offsetRight(pts: ReadonlyArray<readonly [number, number]>, offM: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    out.push([pts[i][0] + (dy / len) * offM, pts[i][1] - (dx / len) * offM]);
  }
  return out;
}

/** Resample so no segment exceeds stepM — gives offsetRight/smooth real corners to round. */
function densify(pts: ReadonlyArray<readonly [number, number]>, stepM: number): Pt[] {
  const out: Pt[] = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const n = Math.max(1, Math.ceil(len / stepM));
    for (let k = 1; k <= n; k++) {
      out.push([
        pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * (k / n),
        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (k / n),
      ]);
    }
  }
  return out;
}

/**
 * Moving-average pass (endpoints pinned). TUNED (3, 2), NOT the city run's
 * (6, 3): Незабравка's OSM polyline bends ~20° at one vertex (s≈224), and the
 * heavier kernel cuts that corner hard enough to push the drive line 3.14 m off
 * lane center — a hair under laneKeepMaxOffsetM (3.25) and far too close to a
 * POOR_LANE_KEEPING conviction to author against. (3, 2) keeps the worst offset
 * at 1.41 m while the sharpest 37 m heading swing (the TurnDetector's 3 s window
 * at 45 km/h) stays at 27°, half of the 55° that would fire TURN_WITHOUT_
 * INDICATOR for driving straight down a street. Both numbers are pinned by the
 * exam-districts battery.
 */
function smooth(pts: Pt[], passes: number, win: number): Pt[] {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const next: Pt[] = [cur[0]];
    for (let i = 1; i < cur.length - 1; i++) {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let k = Math.max(0, i - win); k <= Math.min(cur.length - 1, i + win); k++) {
        sx += cur[k][0];
        sy += cur[k][1];
        n++;
      }
      next.push([sx / n, sy / n]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/**
 * The block's drive line, curb lane, in travel order. Deterministic from the
 * committed d2-v1 document alone (the exam-districts battery pins the leg).
 */
export function buildScEdD2StopAddressRoute(districtRaw: unknown): Pt[] {
  const byId = new Map((districtRaw as RawDistrict).roads.edges.map((e) => [e.id, e]));
  const center: Pt[] = [];
  for (const [id, fwd] of LEGS) {
    const e = byId.get(id);
    if (!e) throw new Error(`sc-ed-d2-stop-address: d2-v1 is missing leg edge ${id}`);
    const geom = fwd ? e.geometry : [...e.geometry].reverse();
    for (const p of geom) {
      const last = center[center.length - 1];
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1e-6) continue;
      center.push([p[0], p[1]]);
    }
  }
  return smooth(offsetRight(densify(center, 4), CURB_OFF), 3, 2);
}

/** Cumulative arclengths of a polyline. */
function cum(pts: ReadonlyArray<Pt>): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) {
    acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return acc;
}

/** Sub-polyline between arclengths s0..s1 (endpoints interpolated). */
export function sliceRoute(pts: ReadonlyArray<Pt>, s0: number, s1: number): Pt[] {
  const acc = cum(pts);
  const at = (i: number, f: number): Pt => [
    pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
    pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f,
  ];
  const out: Pt[] = [];
  for (let i = 1; i < pts.length; i++) {
    const lo = acc[i - 1];
    const hi = acc[i];
    const seg = hi - lo;
    if (seg <= 0 || hi <= s0 || lo >= s1) continue;
    if (out.length === 0) out.push(at(i, Math.max(0, (s0 - lo) / seg)));
    if (hi >= s1) {
      out.push(at(i, Math.min(1, (s1 - lo) / seg)));
      break;
    }
    out.push([pts[i][0], pts[i][1]]);
  }
  return out;
}

/** Total drive-line length (the battery asserts this). */
export function scEdD2StopAddressRouteLength(districtRaw: unknown): number {
  const r = buildScEdD2StopAddressRoute(districtRaw);
  return cum(r)[r.length - 1];
}

// ---------------------------------------------------------------------------
// Block landmarks (arclengths along the drive line above)
// ---------------------------------------------------------------------------

/** Settled in the lane after the pull-away (the move-off gate at s=60). */
const S_SETTLED = 60;
/** Where the examiner's command lands — 66 m of thinking room before the ease. */
const S_COMMAND = 190;
/** The planned-approach gate: ≤ 32 km/h, 36 m short of the stop. */
const S_APPROACH = 220;
/** The chosen legal stretch — mid-block, 121 m clear of the block's junction. */
const S_STOP = 256;
/**
 * The dive demo's „first gap": far enough in that the slam starts from a real
 * 45 km/h (harshBrakeMinSpeedKmh 35), and 217 m short of the block's only
 * junction — well outside harshBrakeJunctionClearM (35), so the stop is
 * causeless by construction rather than by luck.
 */
const S_DIVE_STOP = 160;

/** Exam pace on the 50 km/h residential block. */
const KMH_CRUISE = 45;
/** The pull-away's first metres. */
const KMH_MOVEOFF = 30;
/** Маневрена скорост for the ease-down (under the sc-edsa-planned-approach gate). */
const KMH_APPROACH = 28;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — оглед, мигач, plan, curb
// ---------------------------------------------------------------------------

export function scEdD2StopAddressShadowScript(route: ReadonlyArray<Pt>): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Стоиш до бордюра на „Незабравка“. Изпитващият казва „продължете“ — потеглянето от място е маневра.",
      },
      // The checklist's real last step, both inside the detector's 7 s lookback
      // (moveOffLookbackSec) of the pull-away below: mirror THEN shoulder.
      { kind: "glance", mirror: "rear" },
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Огледало и поглед през лявото рамо — и чак сега мигач наляво." },
      { kind: "indicator", setting: "left" },
      { kind: "pause", sec: 0.6, brake: true },
      {
        kind: "drive",
        points: sliceRoute(route, 0, S_SETTLED),
        targetKmh: KMH_MOVEOFF,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Влез в лентата и набери спокойни 45 км/ч — ограничението е 50." },
      {
        kind: "drive",
        points: sliceRoute(route, S_SETTLED, S_COMMAND),
        targetKmh: KMH_CRUISE,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg:
          "„Спрете на удобно място“. Не тук: кръстовището в края на улицата е забранено (чл. 98) — правата отсечка по средата е мястото.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "right" },
      // The plan: shed speed EARLY, so the last metres are a settle, not a stop.
      {
        kind: "drive",
        points: sliceRoute(route, S_COMMAND, S_APPROACH),
        targetKmh: KMH_APPROACH,
        stopAtEnd: false,
      },
      {
        kind: "drive",
        points: sliceRoute(route, S_APPROACH, S_STOP),
        targetKmh: KMH_APPROACH,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 4.0, brake: true },
      { kind: "indicator", setting: "off" },
      {
        kind: "annotation",
        textBg:
          "Плътно вдясно до бордюра, спряно напълно, без нито едно рязко движение — точно това е „удобно място“.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Спиране на първото зърнато място" (HARSH_BRAKING_NO_CAUSE)
//   The observation is done CORRECTLY here (glances + indicator intact): the
//   ONLY fault is the unplanned stop. One card, one thing to fix.
// ---------------------------------------------------------------------------

export function scEdD2StopAddressMistakeDiveScript(route: ReadonlyArray<Pt>): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „спрете на удобно място“ е чуто като „спрете веднага“.",
      },
      // The pull-away is exemplary — the fault must not be two faults.
      { kind: "glance", mirror: "rear" },
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "pause", sec: 0.6, brake: true },
      {
        kind: "drive",
        points: sliceRoute(route, 0, S_SETTLED),
        targetKmh: KMH_MOVEOFF,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "„Ето тук има място!“ — забелязано един момент преди самата пролука." },
      // The 12 m/s² envelope (0.7 × ⇒ a sustained ~8.4 m/s² stab) turns the
      // planned stop into an emergency one: braking starts ~9 m before rest
      // instead of ~25. Onset 45 km/h ≥ harshBrakeMinSpeedKmh, sustained well
      // past the 0.4 s the detector wants — and the street offers no cause.
      {
        kind: "drive",
        points: sliceRoute(route, S_SETTLED, S_DIVE_STOP),
        targetKmh: KMH_CRUISE,
        maxDecelMps2: 12,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пред колата няма нищо — само едно място, видяно късно. Мястото, за което трябва да набиеш спирачките, вече не е удобно.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Потегляне без оглед" (MOVE_OFF_WITHOUT_OBSERVATION)
//   The indicator IS given and the stop further on is the shadow's own planned
//   one: the ONLY fault is the missing оглед before the wheels turn.
// ---------------------------------------------------------------------------

export function scEdD2StopAddressMistakeNoObservationScript(route: ReadonlyArray<Pt>): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: мигачът е подаден — и колата тръгва веднага, без нито един поглед назад.",
      },
      // NO rear/left glance anywhere before the pull-away → the first move-off
      // grades MOVE_OFF_WITHOUT_OBSERVATION. The indicator stays correct, the
      // speed legal, the later stop planned: no other code can attach.
      { kind: "indicator", setting: "left" },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "drive",
        points: sliceRoute(route, 0, S_SETTLED),
        targetKmh: KMH_MOVEOFF,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      {
        kind: "annotation",
        textBg: "Мигачът казва на другите какво смяташ да правиш. Той не ти показва какво има зад теб.",
      },
      {
        kind: "drive",
        points: sliceRoute(route, S_SETTLED, S_COMMAND),
        targetKmh: KMH_CRUISE,
        stopAtEnd: false,
      },
      // The rest of the drill is done properly — the card names ONE thing.
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: sliceRoute(route, S_COMMAND, S_APPROACH),
        targetKmh: KMH_APPROACH,
        stopAtEnd: false,
      },
      {
        kind: "drive",
        points: sliceRoute(route, S_APPROACH, S_STOP),
        targetKmh: KMH_APPROACH,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 2.0, brake: true },
      { kind: "indicator", setting: "off" },
      {
        kind: "annotation",
        textBg:
          "Огледът не е формалност преди мигача — той е причината да знаеш, че можеш да тръгнеш (чл. 25).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScEdD2StopAddressTraceName =
  | "shadow-correct"
  | "mistake-first-spot-dive"
  | "mistake-no-observation";

export const SC_ED_D2_STOP_ADDRESS_TRACE_NAMES: readonly ScEdD2StopAddressTraceName[] = [
  "shadow-correct",
  "mistake-first-spot-dive",
  "mistake-no-observation",
];

const SCRIPTS: Record<
  ScEdD2StopAddressTraceName,
  { kind: "shadow" | "mistake"; script: (route: ReadonlyArray<Pt>) => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scEdD2StopAddressShadowScript },
  "mistake-first-spot-dive": { kind: "mistake", script: scEdD2StopAddressMistakeDiveScript },
  "mistake-no-observation": {
    kind: "mistake",
    script: scEdD2StopAddressMistakeNoObservationScript,
  },
};

/**
 * Record one of the three drives against a loaded d2-v1 document — NO staged
 * actors (the block is the trap, and it has none), ambient traffic zero, dry
 * day, the move-off-observation drill ENABLED via ruleConfig (mirrored from
 * SC_ED_D2_STOP_ADDRESS.ruleConfig so the LIVE lesson grades what the recorder
 * grades). Deterministic: same district → same trace (rule config does not
 * affect the serialized trace bytes).
 */
export function recordScEdD2StopAddressDrive(
  districtRaw: unknown,
  name: ScEdD2StopAddressTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  const route = buildScEdD2StopAddressRoute(districtRaw);
  return recordScriptedDrive(districtRaw, script(route), {
    scenarioId: SC_ED_D2_STOP_ADDRESS_ID,
    kind,
    seed: 7,
    ruleConfig: { ...(SC_ED_D2_STOP_ADDRESS.ruleConfig ?? {}) },
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
