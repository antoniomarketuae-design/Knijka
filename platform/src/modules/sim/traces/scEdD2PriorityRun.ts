/**
 * sc-ed-d2-priority-run — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for the „Лозенец" exam PRIORITY chain (ED-02) on
 * the committed d2-v1 district (ADR-007), recorded with the template's OWN
 * staged actors (single truth, imported from the template) and the
 * junction-scan drill ENABLED via the recorder's ruleConfig override — the
 * per-lesson opt-in the config-gated detector exists for (types.ts).
 *
 * WHY THIS EXACT CHAIN (the debug pass the backlog asks for — it has one
 * answer, not a preference). Two independent facts about d2-v1 pin it:
 *
 *  1. d2-v1 derives just THREE Б2 stop lines from the whole 21.7 km cut, and
 *     two are unusable — n3790209881 dead-ends into the map edge (2 reachable
 *     nodes), n2952140105 is 1163 m of one-way ramp from the nearest two-way
 *     junction. Only n2945503673 reaches real two-way topology, over Стоян
 *     Михайловски. That also forces a signal the drill never asked for: the
 *     ramp complex's ONE link to Стоян Михайловски is n4873770118.
 *  2. The traffic lane graph excludes class „service" (traffic/types.ts), so no
 *     actor can stage on one. n348203930 is a textbook equal junction ON this
 *     route — uncontrolled, and the route drives straight through it — but its
 *     only cross arm is service, so the car from the right cannot exist there.
 *     The right-hand conflict therefore lives at n248572866 (Галичица,
 *     residential), 222 m further down Златовръх — and the left turn has to
 *     come BEFORE it, at n4547529959, the only left turn on the corridor whose
 *     opposing approach is stageable (пл. Велчова завера, tertiary).
 *
 * THE SEGMENT (~927 m, the Яворов ramp → Стоян Михайловски → Златовръх):
 *   s=0     spawn on the e171919146.0 slip road, hdg 215 — the Б2 approach;
 *   s≈44    Б2 STOP LINE (e171919146.0@42.7:stopSign, node n2945503673) — the
 *           only graded stop sign on the route and the drill's whole point:
 *           full stop + ляво-дясно scan, or the two mistake demos' faults;
 *   s≈370   signal cluster n4873770118 (ns group, natural offset 17 ⇒ ns green
 *           over t∈[33,53) of the 50 s cycle) — the shadow arrives inside the
 *           green window; no signalOffsets dial, it is Лозенец's own clock;
 *   s≈560   the lane shift into Стоян Михайловски's INNER lane (mirror first,
 *           then indicator) — a left turn is not taken from the curb lane;
 *   s≈621   n4547529959 — THE LEFT TURN onto Златовръх, across the staged
 *           oncoming (чл. 37). Measured: turning at +6.5 s of wait took a 3.1 s
 *           gap and the runtime convicted FAILED_TO_YIELD, correctly — so the
 *           shadow waits the car out, which is the lesson anyway;
 *   s≈665   n348203930 — an uncontrolled node the route passes straight
 *           through (see fact 2: no stageable cross arm);
 *   s≈887   n248572866 — THE EQUAL JUNCTION: the staged car comes from the
 *           RIGHT off Галичица and the player gives way (чл. 37);
 *   s≈927   the segment ends on Златовръх, past the junction.
 *
 * The two mid-route zebras (n6309210293, n6387824913) are marked-unsignalized
 * but carry NO pedestrian: PEDESTRIAN_CROSSING_TOO_FAST is gated on
 * `pedestrianSeen`, so they are scenery here, not a second grading axis.
 *
 * ROUTE DERIVED, NOT PASTED (the scEdD2CityRun precedent): d2-v1 is real OSM,
 * so the authored content is the LEG list; deriving the line makes the
 * committed traces a byte-gate on the map itself. UNLIKE the city run, this
 * route CANNOT use one uniform lane offset — its legs run 1, 2 and 3 lanes
 * oneway and 4/5 lanes two-way, so each leg is offset to ITS OWN curb-lane
 * center (locator.ts: oneway centers the bank on the polyline, two-way puts
 * lanesPerDir lanes per side) and the joints are smoothed into the lane
 * shifts a real car actually drives.
 */

import type { StagedEventSpec } from "../contracts";
import { PERCEPTUAL_ROAD_SCALE } from "../contracts";
import { SC_ED_D2_PRIORITY_RUN } from "../lessons/scenario/templates-exam";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_ED_D2_PRIORITY_RUN_ID = "sc-ed-d2-priority-run";

type Pt = [number, number];

/** Scaled lane width (spatial.ts LANE_WIDTH_M — the district authoring law). */
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;

/**
 * Lane-center offsets to the RIGHT of the polyline (locator.ts computeLane,
 * inverted): a ONEWAY bank is CENTERED on the geometry, so its lane j (0 =
 * curb) sits W×(lanes−1)/2 − j×W right of it; a TWO-WAY edge banks lanesPerDir
 * lanes on each side, so its lane j sits (lanesPerDir−0.5−j)×W right of it.
 * Named constants, because these ARE the authored content of the drive line.
 */
/** oneway, 1 lane: the bank's only lane center IS the polyline. */
const OW1_CURB = 0;
/** oneway, 2 lanes: curb lane center. */
const OW2_CURB = LANE_W / 2; // 4.0625
/** oneway, 3 lanes: curb lane center. */
const OW3_CURB = LANE_W; // 8.125
/** two-way, lanesPerDir 2: curb lane (laneId 0) center. */
const TW2_CURB = 1.5 * LANE_W; // 12.1875
/** two-way, lanesPerDir 2: INNER lane (laneId 1) center — the left-turn lane. */
const TW2_INNER = 0.5 * LANE_W; // 4.0625
/** two-way, lanesPerDir 1: the only lane's center. */
const TW1_CURB = 0.5 * LANE_W; // 4.0625

/**
 * The authored segment: [edgeId, travel is geometry-forward, lane-center
 * offset right of the polyline]. The offset is authored per leg, not derived:
 * legs 8–9 deliberately sit in the INNER lane of Стоян Михайловски because the
 * route turns LEFT at n4547529959, and taking a left turn out of the curb lane
 * would be the wrong lane discipline even where no detector grades it (the
 * shadow indicates and mirror-checks into it — see the script). Every offset
 * is asserted against the committed map by the district battery.
 */
const LEGS: ReadonlyArray<readonly [string, boolean, number]> = [
  ["e171919146.0", true, OW1_CURB], // slip road → the Б2 approach
  ["e695511390.0", true, OW1_CURB], // n2945503673 → n4547530454
  ["e248750627.1", true, OW2_CURB], // → n11195450043
  ["e677692188.0", true, OW3_CURB], // → the n4873770118 signal
  ["e751678613.0", true, TW2_CURB], // RIGHT onto Стоян Михайловски (5 lanes)
  ["e285878100.0", true, TW2_CURB], // → n6309210294
  ["e673714439.0", true, TW2_CURB], // → n7980951755
  ["e855867078.0", true, TW2_INNER], // the pre-turn lane shift → n6309210293
  ["e856821052.0", true, TW2_INNER], // → n4547529959
  ["e23040421.0", true, TW1_CURB], // LEFT onto Златовръх — across the oncoming
  ["e1382335108.0", true, TW1_CURB], // → n348203930
  ["e1382335109.0", true, TW1_CURB], // → n253549280
  ["e856821053.0", true, TW1_CURB], // → n248572866 (the equal junction)
  ["e856821053.1", true, TW1_CURB], // clear it southbound → n11868151855
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
 * Moving-average pass (endpoints pinned) — load-bearing exactly as in
 * scEdD2CityRun, and more so here: this route changes curb offset by up to
 * 8.1 m between legs, and an unsmoothed lateral step is both a >55° heading
 * swing (a phantom `turnStarted` ⇒ TURN_WITHOUT_INDICATOR for driving
 * straight) and a laneOffset spike. Rounding turns those steps into the lane
 * shifts a real car drives through a widening.
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
 * The priority chain's drive line, curb lane throughout, in travel order.
 * Deterministic from the committed d2-v1 document alone.
 */
export function buildScEdD2PriorityRoute(districtRaw: unknown): Pt[] {
  const byId = new Map((districtRaw as RawDistrict).roads.edges.map((e) => [e.id, e]));
  const chain: Pt[] = [];
  for (const [id, fwd, laneOffM] of LEGS) {
    const e = byId.get(id);
    if (!e) throw new Error(`sc-ed-d2-priority-run: d2-v1 is missing leg edge ${id}`);
    const geom = (fwd ? e.geometry : [...e.geometry].reverse()).map((p) => [p[0], p[1]] as Pt);
    // Offset EACH leg to its OWN authored lane before joining — the lane
    // offset changes between legs, so a single post-hoc offset would be a lie.
    const off = offsetRight(densify(geom, 4), laneOffM);
    for (const p of off) {
      const last = chain[chain.length - 1];
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1e-6) continue;
      chain.push(p);
    }
  }
  return smooth(densify(chain, 4), 8, 4);
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
export function scEdD2PriorityRouteLength(districtRaw: unknown): number {
  const r = buildScEdD2PriorityRoute(districtRaw);
  return cum(r)[r.length - 1];
}

// ---------------------------------------------------------------------------
// Segment landmarks (arclengths along the drive line above)
// ---------------------------------------------------------------------------

/** The Б2 stop line (e171919146.0@42.7:stopSign, node n2945503673). */
const S_B2_LINE = 44.1;
/** Rest 6 m short of it — a legal full stop behind the line. */
const S_B2_STOP = S_B2_LINE - 6;
/** The n4873770118 signal's stop line (e677692188.0@28.3:trafficLight). */
const S_SIGNAL_LINE = 369.7;
/** The pre-turn lane shift into Стоян Михайловски's inner lane. */
const S_LANE_SHIFT = 560;
/** n4547529959 — THE LEFT TURN onto Златовръх, across the staged oncoming. */
const S_LEFT = 620.9;
/** Wait pose for the left turn — short of the node, wheels straight. */
const S_LEFT_WAIT = S_LEFT - 12;
/** n248572866 — THE EQUAL JUNCTION (the staged car comes from the right). */
const S_EQUAL = 887.4;
/**
 * The yield pose for the equal junction: 20 m short of the node, i.e. OUTSIDE
 * the runtime's 18 m right-hand-rule conviction core — a student resting here
 * while the right-hand car crosses is structurally innocent (the jx-equal
 * precedent, templates-junctions3.ts).
 */
const S_EQUAL_YIELD = S_EQUAL - 20;
/** End of the authored segment (Златовръх, past n248572866). */
const S_END = 927.0;

/** Exam pace on the 50 km/h ramp/boulevard legs. */
const KMH_CRUISE = 45;
/** The Б2 approach — a slip road you are stopping on. */
const KMH_APPROACH = 30;
/** Златовръх (limit 40 at the n4547529959 mouth) and the junction chain. */
const KMH_LOCAL = 25;
/** Turning pace. */
const KMH_TURN = 18;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scEdD2PriorityRunShadowScript(route: ReadonlyArray<Pt>): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Изпитен сегмент „Лозенец“ — предимства: знак Б2, равнозначно кръстовище и ляв завой. Карай както на изпит.",
      },
      { kind: "glance", mirror: "rear" },
      // ---- Beat 1: the Б2 — full stop, then the ляво-дясно-ляво scan --------
      {
        kind: "drive",
        points: sliceRoute(route, 0, S_B2_STOP),
        targetKmh: KMH_APPROACH,
        stopAtEnd: true,
      },
      { kind: "annotation", textBg: "Знак Б2 „Спри!“ — пълно спиране ПРЕД линията, винаги." },
      { kind: "pause", sec: 1.0, brake: true },
      // Separate the glances with brief brake-holds so EACH reaches the rule
      // engine (the recorder consumes one pendingGlance per frame — consecutive
      // glance markers would collapse to the last one).
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 0.6, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "pause", sec: 0.6, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 0.6, brake: true },
      { kind: "annotation", textBg: "Ляво-дясно-ляво — вторият поглед наляво е за колата, приближила междувременно." },
      // ---- The ramp to the signalized junction ------------------------------
      {
        kind: "drive",
        points: sliceRoute(route, S_B2_STOP, S_SIGNAL_LINE - 55),
        targetKmh: KMH_CRUISE,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Светофарът е зелен — премини равномерно и завий надясно по „Стоян Михайловски“." },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: sliceRoute(route, S_SIGNAL_LINE - 55, S_SIGNAL_LINE + 35),
        targetKmh: KMH_TURN,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      {
        kind: "drive",
        points: sliceRoute(route, S_SIGNAL_LINE + 35, S_LANE_SHIFT - 30),
        targetKmh: KMH_CRUISE,
        stopAtEnd: false,
      },
      // ---- The pre-turn lane shift (mirror + indicator, then move) ----------
      { kind: "annotation", textBg: "Преди левия завой се престрой в лявата лента — първо огледало, после мигач." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      // ---- Beat 2: the LEFT TURN across the oncoming ------------------------
      {
        kind: "drive",
        points: sliceRoute(route, S_LANE_SHIFT - 30, S_LEFT_WAIT),
        targetKmh: KMH_LOCAL,
        stopAtEnd: true,
      },
      {
        kind: "annotation",
        textBg: "Ляв завой: изчакай насрещния да мине — с прави колела, за да не те изтласка при удар отзад.",
      },
      // The wait is LONG on purpose and it is measured, not guessed: the
      // oncoming releases when the player comes to rest and then has 110 m of
      // пл. Велчова завера to cover at 7 m/s. Turning at +6.5 s took a 3.1 s
      // gap and the runtime's left-turn tracker convicted FAILED_TO_YIELD —
      // correctly. Waiting it out is the lesson, so the shadow waits it out.
      { kind: "pause", sec: 16.0, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Насрещният мина — завий по „Златовръх“." },
      {
        kind: "drive",
        points: sliceRoute(route, S_LEFT_WAIT, S_LEFT + 16),
        targetKmh: KMH_TURN,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      // ---- Beat 3: the equal junction — give way to the RIGHT ---------------
      {
        kind: "annotation",
        textBg: "Надолу по „Златовръх“: кръстовищата тук са РАВНОЗНАЧНИ — няма знаци, значи важи „предимство на дясната“.",
      },
      {
        kind: "drive",
        points: sliceRoute(route, S_LEFT + 16, S_EQUAL_YIELD),
        targetKmh: KMH_LOCAL,
        stopAtEnd: true,
      },
      { kind: "annotation", textBg: "Отдясно по „Галичица“ идва кола — предимството е нейно. Пропускаш я." },
      { kind: "glance", mirror: "right" },
      { kind: "pause", sec: 5.0, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Мина — продължаваш. Предимството е правило, не изненада." },
      {
        kind: "drive",
        points: sliceRoute(route, S_EQUAL_YIELD, S_END),
        targetKmh: KMH_LOCAL,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Три кръстовища, три различни правила, нито една отсъдена грешка — това гледа изпитващият.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Търкаляне през стоп-линията" (STOP_SIGN_NO_FULL_STOP)
// ---------------------------------------------------------------------------

/**
 * The classic „почти спрях": the car rolls the Б2 line at ~12 km/h. It DOES
 * look left and right on the roll — which is exactly what makes the demo
 * surgical: the scan is fresh, so JUNCTION_SCAN_INCOMPLETE cannot fire and the
 * sheet carries the ONE fault the card is about. („Огледах се“ is also the
 * excuse the student actually makes, which is why the clip grants it.)
 * The clip ends 60 m past the node — far short of the signal at s≈370 — so no
 * other graded feature exists on it.
 */
export function scEdD2PriorityRunMistakeRollingScript(route: ReadonlyArray<Pt>): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „почти спрях“ — колата се търкаля през стоп-линията, без изобщо да спре.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: sliceRoute(route, 0, 32), targetKmh: 12, stopAtEnd: false },
      // Glances on the ROLL, and DELIBERATELY LATE: both must land inside the
      // 5 s junctionScanLookback at the line (s=44.1), or the demo bills the
      // scan as well and stops being the isolated „почти спрях" it claims to
      // be. At 12 km/h the last 12 m are ~3.6 s, so 32 m and 38 m are the
      // authored glance points.
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: sliceRoute(route, 32, 38), targetKmh: 12, stopAtEnd: false },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: sliceRoute(route, 38, 130), targetKmh: 12, stopAtEnd: true },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "На Б2 се спира ДОКРАЙ — колелата неподвижни. „Почти спрях“ не съществува нито в закона, нито на изпита.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Незавършен оглед" (JUNCTION_SCAN_INCOMPLETE)
// ---------------------------------------------------------------------------

/**
 * The inverse fault on the same line: a textbook FULL STOP (so the sheet earns
 * FULL_STOP_AT_STOP_SIGN and STOP_SIGN_NO_FULL_STOP cannot fire) followed by a
 * SINGLE left glance. The right — where the Яворов carriageway this slip road
 * must yield to actually comes from — is never checked. This is the
 * config-gated JU-23 detector's whole point, and the reason this drill enables
 * it: the stop was legal, the observation was not.
 */
export function scEdD2PriorityRunMistakePartialScanScript(route: ReadonlyArray<Pt>): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: спира образцово на Б2 — но поглежда само наляво и потегля.",
      },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: sliceRoute(route, 0, S_B2_STOP),
        targetKmh: KMH_APPROACH,
        stopAtEnd: true,
      },
      { kind: "annotation", textBg: "Пълното спиране е налице — огледът не е." },
      { kind: "pause", sec: 2.0, brake: true },
      // A single LEFT glance — the right is never checked.
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: sliceRoute(route, S_B2_STOP, 130), targetKmh: KMH_APPROACH, stopAtEnd: true },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Един поглед не стига: колите с предимство идват отдясно. Оглеждай ляво-дясно-ляво, чак тогава потегляй.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScEdD2PriorityRunTraceName =
  | "shadow-correct"
  | "mistake-rolling-stop"
  | "mistake-partial-scan";

export const SC_ED_D2_PRIORITY_RUN_TRACE_NAMES: readonly ScEdD2PriorityRunTraceName[] = [
  "shadow-correct",
  "mistake-rolling-stop",
  "mistake-partial-scan",
];

const SCRIPTS: Record<
  ScEdD2PriorityRunTraceName,
  { kind: "shadow" | "mistake"; script: (route: ReadonlyArray<Pt>) => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scEdD2PriorityRunShadowScript },
  "mistake-rolling-stop": { kind: "mistake", script: scEdD2PriorityRunMistakeRollingScript },
  "mistake-partial-scan": { kind: "mistake", script: scEdD2PriorityRunMistakePartialScanScript },
};

/**
 * Record one of the three drives against a loaded d2-v1 document — the
 * TEMPLATE's staged actors armed (single truth), the map's NATURAL signal
 * offsets (no dial), the junction-scan drill ENABLED, ambient traffic zero.
 */
export function recordScEdD2PriorityRunDrive(
  districtRaw: unknown,
  name: ScEdD2PriorityRunTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  const route = buildScEdD2PriorityRoute(districtRaw);
  return recordScriptedDrive(districtRaw, script(route), {
    scenarioId: SC_ED_D2_PRIORITY_RUN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_ED_D2_PRIORITY_RUN.staged ?? [])] as StagedEventSpec[],
    ruleConfig: { junctionScanObservationEnabled: true },
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
