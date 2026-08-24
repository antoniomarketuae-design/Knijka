/**
 * sc-ed-d2-city-run — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for the „Лозенец" exam city segment (ED-01) on the
 * committed d2-v1 district — the FIRST template to drive the second exam
 * district (ADR-007), recorded with the template's OWN staged walker
 * (pedestrianDartOut sc-edcr-ped — single truth, imported from the template).
 *
 * WHY THE ROUTE IS DERIVED, NOT PASTED (the one deliberate break with the
 * hand-authored micro-map traces): d2-v1 is REAL OSM topology, so the drive
 * line is ~240 smoothed points of бул. Драган Цанков. Pasting that as a
 * literal would be unreadable AND unverifiable; deriving it from the district
 * the recorder is already handed keeps the authored content down to what is
 * actually authored — the LEG list (which edges, which way) — and makes the
 * committed traces a byte-gate on the map itself: re-cut Лозенец and the gate
 * fails loudly instead of drifting. The TEMPLATE stays data-only (its
 * coordinates are denormalized literals); only this dev-time recorder reads
 * the district, exactly as the d2-district battery's innocent drive does.
 *
 * THE SEGMENT (all бул. Драган Цанков, ~971 m, SE → NW):
 *   s=0     spawn (795.1, −359.7) hdg 327 — the boulevard's SE end;
 *   s=68    signal cluster n1286733599 (ns group) — GREEN at t≈5.8 (natural
 *           offset 0: ns green [0,20) of the 50 s cycle) — cross, no stop;
 *   s=337   signal cluster n152073034 (ew group) — RED on arrival (natural
 *           offset 40 ⇒ ew red until t=35, green [35,55)): the shadow STOPS
 *           at the line and waits it out — the segment's exam beat;
 *   s=337…841 the keep-right boulevard stretch (4–5 lanes, limit 50);
 *   s=877   the zebra n331946209 — a mid-block marked crossing (degree-2 node,
 *           no junction of its own) where the staged walker steps off the
 *           LEFT curb; the shadow yields, mistake 2 does not.
 *
 * Both signal phases are the map's NATURAL FNV-1a offsets — no signalOffsets
 * dial. The red at cluster 2 is not staged; it is what Лозенец actually shows
 * a car that leaves the SE end at t=0, which is why the shadow and the
 * red-light demo can share one world and differ only in the driver's choice.
 */

import type { StagedEventSpec } from "../contracts";
import { PERCEPTUAL_ROAD_SCALE } from "../contracts";
import { SC_ED_D2_CITY_RUN } from "../lessons/scenario/templates-exam";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_ED_D2_CITY_RUN_ID = "sc-ed-d2-city-run";

type Pt = [number, number];

/** Scaled lane width (spatial.ts LANE_WIDTH_M — the district-v1 authoring law). */
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;
/**
 * Curb-lane center offset from the centerline, m. EVERY leg below is a 4- or
 * 5-lane two-way edge ⇒ lanesPerDir = floor(lanes/2) = 2 for all of them, so
 * ONE uniform offset holds the whole route and the drive line can be built as
 * a single centerline chain offset once — no per-leg seams to zigzag over.
 */
const CURB_OFF = (2 - 0.5) * LANE_W;

/** The authored segment: [edgeId, travel is geometry-forward]. */
const LEGS: ReadonlyArray<readonly [string, boolean]> = [
  ["e601140178.0", true], // SE end → cluster 1 (stop line at s≈37 of the edge)
  ["e29435479.0", true], // cluster 1 → n285651635
  ["e601140177.0", true], // → n4331413444
  ["e435203751.0", true], // → cluster 2 (stop line at s≈83 of the edge)
  ["e435203752.0", false], // cluster 2 → n2617536251
  ["e1233248921.0", false], // → n152073035
  ["e171919144.0", true], // the long keep-right stretch → the zebra node
  ["e1131622979.0", true], // past the zebra → n2038686042
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
 * Moving-average pass (endpoints pinned). WHY IT IS LOAD-BEARING: a raw
 * offset chain kinks at every leg joint, and a kink inside a junction area is
 * a >55° heading swing over the 3 s window — i.e. the TurnDetector fires
 * `turnStarted` and the drive grades TURN_WITHOUT_INDICATOR for driving
 * STRAIGHT down a boulevard. Rounding the joints is what a real car does with
 * a steering wheel; without it the segment is unauthorable.
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
 * The exam segment's drive line, curb lane, in travel order. Deterministic
 * from the committed d2-v1 document alone (the exam-districts battery pins
 * every leg it reads).
 */
export function buildScEdD2Route(districtRaw: unknown): Pt[] {
  const byId = new Map((districtRaw as RawDistrict).roads.edges.map((e) => [e.id, e]));
  const center: Pt[] = [];
  for (const [id, fwd] of LEGS) {
    const e = byId.get(id);
    if (!e) throw new Error(`sc-ed-d2-city-run: d2-v1 is missing leg edge ${id}`);
    const geom = fwd ? e.geometry : [...e.geometry].reverse();
    for (const p of geom) {
      const last = center[center.length - 1];
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1e-6) continue;
      center.push([p[0], p[1]]);
    }
  }
  return smooth(offsetRight(densify(center, 4), CURB_OFF), 6, 3);
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
export function scEdD2RouteLength(districtRaw: unknown): number {
  const r = buildScEdD2Route(districtRaw);
  return cum(r)[r.length - 1];
}

// ---------------------------------------------------------------------------
// Segment landmarks (arclengths along the drive line above)
// ---------------------------------------------------------------------------

/** Stop line of signal cluster 2 (n152073034, ew group) — crossed at s≈337.5. */
const S_C2_LINE = 337.5;
/** Rest 6 m short of it — a legal stop behind the line. */
const S_C2_STOP = S_C2_LINE - 6;
/** The zebra n331946209 sits at s≈876.7; its 35 m zone arms at s≈842. */
const S_ZEBRA = 876.7;
/**
 * Start shedding speed 60 m out — 25 m BEFORE the crossing zone arms, so the
 * car is settled at the cap on entry instead of still braking through it. The
 * margin is the point: `PEDESTRIAN_CROSSING_TOO_FAST` exempts a driver who is
 * `respondingByBraking`, so a late lift would pass the gate for the WRONG
 * reason (innocent because still braking, not because it was slow enough).
 */
const S_ZEBRA_SLOW = S_ZEBRA - 60;
/** Rest 7 m short of the zebra — the яв wait line. */
const S_ZEBRA_STOP = S_ZEBRA - 7;
/** End of the authored segment. */
const S_END = 971;

/** Exam pace on the 50 km/h boulevard. */
const KMH_CRUISE = 45;
/** Under the 30 km/h crossing-approach cap (cfg.crossingApproachMaxKmh). */
const KMH_CROSSING = 28;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scEdD2CityRunShadowScript(route: ReadonlyArray<Pt>): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Изпитен сегмент „Лозенец“: два светофара, пътека и дясна лента. Карай както на изпит.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "glance", mirror: "left" },
      // Cluster 1 on GREEN (ns group, natural offset 0 — green over t≈5.8):
      // an exam pass is a pass, not a courtesy stop.
      {
        kind: "drive",
        points: sliceRoute(route, 0, S_C2_STOP),
        targetKmh: KMH_CRUISE,
        stopAtEnd: true,
      },
      {
        kind: "annotation",
        textBg: "Вторият светофар е червен — спри ПРЕД стоп-линията и изчакай, без да пълзиш напред.",
      },
      // The ew group turns green at t=35; the arrival rests at t≈30.
      { kind: "pause", sec: 6.0, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Зелено — потегляй веднага, без бавене." },
      {
        kind: "drive",
        points: sliceRoute(route, S_C2_STOP, S_ZEBRA_SLOW),
        targetKmh: KMH_CRUISE,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Дръж дясната лента по булеварда и намали за пътеката — пешеходец слиза отляво.",
      },
      { kind: "glance", mirror: "right" },
      {
        kind: "drive",
        points: sliceRoute(route, S_ZEBRA_SLOW, S_ZEBRA_STOP),
        targetKmh: KMH_CROSSING,
        stopAtEnd: true,
      },
      { kind: "annotation", textBg: "Спри и я изчакай да освободи платното напълно (чл. 119)." },
      { kind: "pause", sec: 7.0, brake: true },
      { kind: "glance", mirror: "left" },
      // No-spoiler voice (sc-zebra-approach:8dda834f class): condition before command.
      { kind: "annotation", textBg: "Довърши сегмента спокойно едва когато пътеката е чиста." },
      { kind: "drive", points: sliceRoute(route, S_ZEBRA_STOP, S_END), targetKmh: KMH_CROSSING },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Изпитен сегмент без нито една отсъдена грешка — точно това гледа изпитващият.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Преминаване на червено" (RED_LIGHT_CROSSED)
// ---------------------------------------------------------------------------

/**
 * The SAME world, one different choice: identical approach, but the car keeps
 * its 45 km/h through the red at cluster 2 instead of stopping. The clip ends
 * just past the junction — it never reaches the zebra's 35 m zone, so the
 * staged walker never releases and the red light stands alone on the sheet.
 */
export function scEdD2CityRunMistakeRedScript(route: ReadonlyArray<Pt>): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „ще успея да мина“ — колата влиза в кръстовището на червено.",
      },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: sliceRoute(route, 0, 420),
        targetKmh: KMH_CRUISE,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Преминаване на червен сигнал е опасна грешка — изпитът приключва на място.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Непропуснат пешеходец" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

/**
 * A focused clip of the segment's LAST leg — it starts past cluster 2, so no
 * stop line is ever crossed and no signal code can contaminate the sheet. The
 * approach speed is the lawful 28 km/h (under the crossing cap), so the ONLY
 * fault it demonstrates is the refusal to yield: the walker is still on the
 * far half when the car sweeps over the crossing — непропускане, not contact.
 */
export function scEdD2CityRunMistakePedScript(route: ReadonlyArray<Pt>): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: пешеходецът вече е на платното, но колата не спира — „ще се размине“.",
      },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: sliceRoute(route, 420, S_ZEBRA_SLOW),
        targetKmh: KMH_CRUISE,
        stopAtEnd: false,
      },
      {
        kind: "drive",
        points: sliceRoute(route, S_ZEBRA_SLOW, S_END),
        targetKmh: KMH_CROSSING,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Стъпилият на пътеката пешеходец се пропуска ВИНАГИ (чл. 119) — премерената скорост не е извинение да не спреш.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScEdD2CityRunTraceName = "shadow-correct" | "mistake-red-light" | "mistake-no-yield";

export const SC_ED_D2_CITY_RUN_TRACE_NAMES: readonly ScEdD2CityRunTraceName[] = [
  "shadow-correct",
  "mistake-red-light",
  "mistake-no-yield",
];

const SCRIPTS: Record<
  ScEdD2CityRunTraceName,
  { kind: "shadow" | "mistake"; script: (route: ReadonlyArray<Pt>) => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scEdD2CityRunShadowScript },
  "mistake-red-light": { kind: "mistake", script: scEdD2CityRunMistakeRedScript },
  "mistake-no-yield": { kind: "mistake", script: scEdD2CityRunMistakePedScript },
};

/**
 * Record one of the three drives against a loaded d2-v1 document — the
 * TEMPLATE's staged walker armed (single truth), the map's NATURAL signal
 * offsets (no dial: the red at cluster 2 is Лозенец's own), ambient traffic
 * zero. Deterministic: same district → same trace.
 */
export function recordScEdD2CityRunDrive(
  districtRaw: unknown,
  name: ScEdD2CityRunTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  const route = buildScEdD2Route(districtRaw);
  return recordScriptedDrive(districtRaw, script(route), {
    scenarioId: SC_ED_D2_CITY_RUN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_ED_D2_CITY_RUN.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
