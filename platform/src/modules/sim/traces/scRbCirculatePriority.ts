/**
 * sc-rb-circulate-priority — the authored drives (doc 76 §5/§9): ONE correct
 * shadow demonstration + TWO mistake demos for „В кръга си с предимство“ on the
 * committed rb-mini-v1 district, recorded with the template's OWN staged waiting
 * car (priorityFromRight sc-rbc-waiter — single truth, imported from the
 * template). The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations — an unhesitating entry into the empty ring, a
 *     flat 12 km/h circulation past the east mouth on one line, and a signalled
 *     north exit;
 *   - „Паническо спиране заради чакащия на входа“ grades EXACTLY
 *     HARSH_BRAKING_NO_CAUSE;
 *   - „Колебливо криволичене в пръстена“ grades EXACTLY POOR_LANE_KEEPING.
 *
 * Geometry pinned to content/world/rb-mini-v1.json: ring centerline R = 18
 * around (0, 0), CCW (s → e → n → w); arm right-lane centers ±4.06; south spawn
 * (4.06, −93) heading north; ring limit 30, arms 40. This drill takes the SECOND
 * (north) exit, peeling off the ring arc at φ ≈ 150° — the same peel geometry
 * sc-roundabout-entry proved, and a different exit from sc-rb-exit-signal's
 * west (φ ≈ 240°) so the two roundabout templates never play alike.
 *
 * THREE ENVELOPES DECIDE EVERY NUMBER BELOW — all three measured, not guessed:
 *
 *  · RING PACE = 12 km/h, and it is a CEILING, not a style choice. The turn
 *    detector fires at |Σ heading deltas| > 55° over a sliding 3 s window inside
 *    a junction area, and the whole ring is junction area (the four mouths are
 *    intersection nodes ≤ 13.8 m from every ring point). Circulating R = 18 at
 *    v gives 57.3·v/R deg/s ⇒ a 3 s window of 9.55·v: 12 km/h ⇒ 32° (safe),
 *    20.7 km/h ⇒ 55° (the hard wall), 25 km/h ⇒ 66° — measured: a 25 km/h
 *    circulation grades TURN_WITHOUT_INDICATOR on the ring alone, indicator or
 *    no indicator. Any brisker ring drill needs a bigger radius, not a braver
 *    script.
 *
 *  · HARSH_BRAKING_NO_CAUSE CANNOT FIRE INSIDE THE RING, so the panic-brake demo
 *    is staged on the APPROACH ARM. The detector's cause ledger clears only when
 *    nextJunctionM > 35 (harshBrakeJunctionClearM) and the onset speed is
 *    ≥ 35 km/h (harshBrakeMinSpeedKmh). On the ring, nextJunctionM ≤ 13.8 m
 *    always — the junction-proximity armor is permanently on — and the 12 km/h
 *    ceiling above is 23 km/h under the onset floor besides. Measured: a
 *    12 m/s² stab to a dead stop mid-ring grades NOTHING. The demo therefore
 *    brakes at y ≈ −68 (50 m from the south node, onset ~38 km/h), where the
 *    ledger is genuinely clear and the fault is genuinely visible.
 *
 *  · POOR_LANE_KEEPING needs |laneOffsetM| > 3.25 m held 3 s. The ring edge is
 *    oneway with lanes = 1, so the locator clamps laneOffsetM to ±4.06 (half the
 *    8.125 m drawn lane) and laneOffsetM = 4.06 − d: riding WIDE of the
 *    centerline at radius r puts d = (r − 18) + 4.06, so the tolerance breaks at
 *    r > 21.25. The demo holds r = 21.8 (laneOffsetM ≈ −3.80, 0.55 m of margin)
 *    and does it at 10 km/h with a 5°-strided radius ramp: the drift's own
 *    curvature stacks on the ring's sweep, and at 12 km/h with mixed 10°/5°
 *    strides the kinked joint measured 55°+ and double-billed
 *    TURN_WITHOUT_INDICATOR on top of the taught fault.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_RB_CIRCULATE_PRIORITY } from "../lessons/scenario/templates-roundabout";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_RB_CIRCULATE_PRIORITY_ID = "sc-rb-circulate-priority";

/** South-arm northbound lane center (2-lane arm, drawn lane 8.125 m). */
const X_LANE = 4.06;
/** Ring centerline radius (rb-mini-v1 meta.scenario). */
const R = 18;
/** The ring pace — the turn-detector ceiling, see the header. */
const RING_KMH = 12;
/** The wandering demo's pace (its drift curvature eats the turn margin). */
const DRIFT_KMH = 10;
/** The wandering demo's held radius: laneOffsetM ≈ −3.80, past the 3.25 tolerance. */
const DRIFT_R = 21.8;

/** Ring point at circulation angle φ (degrees from the SOUTH node, CCW through
 * EAST — φ 90 = east, 180 = north, 270 = west): (r sin φ, −r cos φ). */
function ring(phiDeg: number, radius = R): [number, number] {
  const a = (phiDeg * Math.PI) / 180;
  return [radius * Math.sin(a), -radius * Math.cos(a)];
}

/** Sampled ring run φ0 → φ1 (CCW, 10° steps) at a fixed radius. */
function ringRun(phi0: number, phi1: number, radius = R): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let p = phi0; p <= phi1; p += 10) out.push(ring(p, radius));
  return out;
}

/** Radius ramp φ0 → φ1, r0 → r1, interpolated linearly in φ (5° steps — the fine
 *  stride the drift needs so no kinked joint counts as a turn; see the header's
 *  third envelope). */
function ramp(phi0: number, phi1: number, r0: number, r1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let p = phi0; p <= phi1; p += 5) {
    out.push(ring(p, r0 + ((r1 - r0) * (p - phi0)) / (phi1 - phi0)));
  }
  return out;
}

/** The north-arm outbound lane (heading north, so the right-hand lane center is
 *  x = +4.06 — the same lane rbm-spawn-finish sits in at (4.06, 58)). */
const EXIT_NORTH: Array<[number, number]> = [
  [7.5, 19.0],
  [5.5, 22.0],
  [X_LANE, 26.0],
  [X_LANE, 40.0],
  [X_LANE, 58.0],
];

/**
 * The shared approach + entry: roll down the south arm and take the empty ring
 * WITHOUT stopping. That is itself the lesson's first half — an empty roundabout
 * is not a stop sign — and it is what every drive whose fault lies elsewhere
 * reuses verbatim. The entry is the same flat NE chord the other rb-mini drills
 * proved: it sweeps the azimuth-from-centre past RB_ON_RING_DEG (35°) fast, so
 * ring priority is won early, with only ~40° of TOTAL heading change (under the
 * 55° turn window), so it is indicator-free-clean.
 */
function cleanEntrySteps(): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60]], targetKmh: 40, stopAtEnd: false },
    { kind: "drive", points: [[X_LANE, -60], [X_LANE, -40], [X_LANE, -27.5]], targetKmh: 18, stopAtEnd: false },
    { kind: "glance", mirror: "left" },
    {
      kind: "drive",
      points: [[X_LANE, -27.5], [6.0, -23.0], [8.5, -18.5], [11.0, -15.0], ring(48), ring(55)],
      targetKmh: 17,
      stopAtEnd: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scRbCirculatePriorityShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Кръгът е празен, а на западния вход стои кола. Тя чака нас — влизаме, без да спираме.",
      },
      ...cleanEntrySteps(),
      {
        kind: "annotation",
        textBg: "Празен кръг не се чака. Влязохме плавно, без спиране — сега една линия и една скорост.",
      },
      {
        // The ring, flat and quiet: one line on the centerline, one pace. The
        // 12 km/h is the turn-detector ceiling (header), and it is held from the
        // entry chord's exit angle straight past the east mouth (φ = 90).
        kind: "drive",
        points: ringRun(60, 100),
        targetKmh: RING_KMH,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Колата на запад още чака — и ще чака, докато освободим кръга. Това е нейното задължение, не нашето.",
      },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // Ring to φ = 150° (the north peel-off point), then the gentle
        // indicator-announced blend onto the north arm's outbound lane. The step
        // opens at φ = 110, one ringRun stride past the previous step's φ = 100
        // end, so the path stays C¹-smooth and no spurious turnStarted fires at
        // the joint.
        kind: "drive",
        points: [...ringRun(110, 150), ...EXIT_NORTH],
        targetKmh: RING_KMH,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Една линия, една скорост, нула спирачка заради чакащия — и кръгът остана свободен зад нас.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Паническо спиране заради чакащия на входа“
// (HARSH_BRAKING_NO_CAUSE)
// ---------------------------------------------------------------------------

export function scRbCirculatePriorityMistakePanicBrakeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Същият празен кръг, същата чакаща кола — гледай какво прави кракът." },
      { kind: "glance", mirror: "rear" },
      {
        // Runway: from the spawn to y = −68 the car builds to ~38 km/h — over
        // the detector's 35 km/h onset floor, and 50 m from the south node, so
        // the junction-proximity armor (35 m) is genuinely off.
        kind: "drive",
        points: [[X_LANE, -93], [X_LANE, -68]],
        targetKmh: 50,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Кола стои на западния вход… и кракът скача на спирачката." },
      {
        // The stab: maxDecelMps2 12 ⇒ a sustained ~8.4 m/s² stop, over the
        // detector's 7 m/s² emergency grade. Nothing ahead, nothing crossing,
        // no signal, no junction inside 35 m — the cause ledger is empty and
        // this is exactly the „рязко спиране без причина" it is meant to catch.
        kind: "drive",
        points: [[X_LANE, -68], [X_LANE, -60]],
        targetKmh: 50,
        stopAtEnd: true,
        maxDecelMps2: 12,
      },
      { kind: "pause", sec: 3, brake: true },
      {
        kind: "annotation",
        textBg: "Спряла кола на входа не предявява предимство — тя чака теб. А зад теб може и да има някой.",
      },
      // From here the drive is the shadow's, so the ONE taught fault is never
      // stacked with a second: the entry, the ring and the signalled north exit
      // all replay clean.
      { kind: "drive", points: [[X_LANE, -60], [X_LANE, -40], [X_LANE, -27.5]], targetKmh: 18, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      {
        kind: "drive",
        points: [[X_LANE, -27.5], [6.0, -23.0], [8.5, -18.5], [11.0, -15.0], ring(48), ring(55)],
        targetKmh: 17,
        stopAtEnd: false,
      },
      { kind: "drive", points: ringRun(60, 100), targetKmh: RING_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [...ringRun(110, 150), ...EXIT_NORTH], targetKmh: RING_KMH },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Кръговото не е „стоп“. Влиза се с преценка, не с паника — а вътре предимството вече е твое по чл. 50а.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Колебливо криволичене в пръстена“ (POOR_LANE_KEEPING)
// ---------------------------------------------------------------------------

export function scRbCirculatePriorityMistakeWanderingScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Входът е чист — грешката е в самия пръстен, в линията." },
      ...cleanEntrySteps(),
      {
        // The drift: „да го пусна ли" pushes the car off the centerline and out
        // toward the lane's outer edge over 55° of ring, then it simply stays
        // there. The detector grades SUSTAINED off-centre positioning — 3 s
        // beyond |laneOffsetM| = 3.25 — so what convicts is not the wobble but
        // the fact that the car never comes back to a line.
        kind: "drive",
        points: ramp(55, 110, R, DRIFT_R),
        targetKmh: DRIFT_KMH,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Колебанието изнесе колата към външния ръб — и тя остана там." },
      {
        kind: "drive",
        points: ringRun(110, 140, DRIFT_R),
        targetKmh: DRIFT_KMH,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // The exit is announced and clean — the demo isolates the LINE, not the
        // signalling (that is sc-rb-exit-signal's lesson).
        kind: "drive",
        points: [...ramp(140, 155, DRIFT_R, 19.5), ...EXIT_NORTH],
        targetKmh: DRIFT_KMH,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "В кръговото другите четат намеренията ти по траекторията. Кола, която се лута в лентата, не казва нищо на никого.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRbCirculatePriorityTraceName =
  | "shadow-correct"
  | "mistake-panic-brake"
  | "mistake-wandering-line";

const SCRIPTS: Record<
  ScRbCirculatePriorityTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scRbCirculatePriorityShadowScript },
  "mistake-panic-brake": { kind: "mistake", script: scRbCirculatePriorityMistakePanicBrakeScript },
  "mistake-wandering-line": { kind: "mistake", script: scRbCirculatePriorityMistakeWanderingScript },
};

/**
 * Record one of the three drives against a loaded rb-mini-v1 document — the
 * TEMPLATE's staged waiting car armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScRbCirculatePriorityDrive(
  districtRaw: unknown,
  name: ScRbCirculatePriorityTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_RB_CIRCULATE_PRIORITY_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_RB_CIRCULATE_PRIORITY.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
