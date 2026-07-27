/**
 * sc-vp-police-stop — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Спиране по полицейски сигнал" (VP-11, ADR-006 stage
 * 1c) on the committed ln-v1 district (the 400 m 2+2 boulevard, map REUSED),
 * recorded with the template's OWN staged officer figure (policeStop
 * sc-vpps-officer — single truth, imported from the template). No ambient
 * traffic (seed 7); the officer runner emits ZERO SimTick events, so the ONLY
 * things the stack can grade are the driver's own lane/braking choices — the
 * completion contract is the template's curb-side low-speed stop zone.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations; mirror, right indicator, eased right and rested
 *     in the stop zone at the officer (outcome "yielded");
 *   - „Подминаване на сигнала": a CLEAN left lane change around the officer,
 *     then hogging the left lane past him — grades EXACTLY NOT_KEEPING_RIGHT
 *     (the 12 s keep-right sustain; the ignored signal itself shows as the
 *     unreached stop zone + the "passedWithoutStopping" outcome);
 *   - „Паника в лентата": the doc-72 mistake verbatim — a startled ±0.7 m
 *     weave and then a 12 m/s²-envelope slam from 46 km/h to a dead stop
 *     mid-lane at y = 196, ten metres short of the halt zone at the officer —
 *     grades EXACTLY HARSH_BRAKING_NO_CAUSE (no cause exists on the empty
 *     street; a routine stop signal wants a PLANNED pull-over, not a slam).
 *
 * Geometry pinned to content/world/ln-v1.json: northbound right-lane center
 * x = 12.19, left-lane center x = 4.06, divider x = 8.125, curb x = 16.25;
 * spawn ln-spawn-start (12.19, 15, heading 0 = north), limit 50. The officer
 * stands at (15.6, 208) — ON the carriageway edge, clear of the curb-parked
 * decoration he used to be buried in (templates-cockpit PS_OFFICER carries the
 * founder note); the halt zone centers (13.9, 206) r 3 — offsets stay under the
 * 3.25 m lane-keeping threshold and inside the right lane.
 *
 * Rule envelope the scripts respect: NOT_KEEPING_RIGHT needs laneId > 0 for
 * 12 s sustained with the left indicator OFF (the demo turns it off right
 * after settling, then cruises ~18 s of left lane); the lane change itself is
 * CLEAN (glance-left → indicator → glance-left, boundary crossed ~2 s later —
 * inside both lookbacks) so no lane-change code pollutes. HARSH_BRAKING needs
 * onset ≥ 35 km/h and ≥ 7 m/s² for 0.4 s with no cause in the ledger — the
 * 46 km/h slam under a 12 m/s² envelope (~8.4 sustained) on the empty street.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VP_POLICE_STOP } from "../lessons/scenario/templates-cockpit";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VP_POLICE_STOP_ID = "sc-vp-police-stop";

/** Northbound lane centers of ln-v1 (meta.scenario, pinned by value). */
const RIGHT = 12.19;
const LEFT = 4.06;
/** The curb-side halt point (mirrors the template's stop zone by value). */
const STOP_X = 13.9;
const STOP_Y = 206;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — mirror, signal, ease right, rest
// ---------------------------------------------------------------------------

export function scVpPoliceStopShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Карай спокойно в дясната лента — и гледай далеч напред." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 90], [RIGHT, 150]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Полицай на тротоара с вдигната ръка — сигналът е за нас и е задължителен (чл. 170)." },
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // Ease toward the right edge and shed speed early — the planned,
        // predictable pull-over; rest lands in the stop zone at the officer.
        kind: "drive",
        points: [
          [RIGHT, 150],
          [12.8, 170],
          [13.6, 188],
          [STOP_X, STOP_Y],
        ],
        targetKmh: 24,
      },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "indicator", setting: "off" },
      {
        kind: "annotation",
        textBg: "Спряхме плътно вдясно при полицая: двигателят работи, ръцете на волана — чакаме указания.",
      },
      { kind: "pause", sec: 1.0, brake: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Подминаване на сигнала" (NOT_KEEPING_RIGHT + failed stop)
// ---------------------------------------------------------------------------

export function scVpPoliceStopMistakeDrivePastScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: сигналът е видян… и водачът решава да го „заобиколи“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 70], [RIGHT, 120]], targetKmh: 38, stopAtEnd: false },
      // The evasion is a CLEAN lane change (mirror → indicator → shoulder) —
      // the isolated fault is what follows: ignoring the officer and hogging
      // the left lane past him.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      {
        kind: "drive",
        points: [
          [RIGHT, 120],
          [10.0, 133],
          [6.0, 150],
          [LEFT, 170],
          [LEFT, 185],
        ],
        targetKmh: 38,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Полицаят остава зад колата — разпореждането за спиране е просто подминато." },
      { kind: "drive", points: [[LEFT, 185], [LEFT, 290], [LEFT, 380]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Сигналът на контролния орган е задължителен (чл. 170) — а „висенето“ вляво при празна дясна лента е отделна грешка (чл. 15).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Паника в лентата" (HARSH_BRAKING_NO_CAUSE + failed stop)
// ---------------------------------------------------------------------------

export function scVpPoliceStopMistakePanicScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: сигналът стряска — и кракът се забива в спирачката още в лентата." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 100]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Полицаят вдига палката — а колата не отбива: кормилото трепва и спирачката се забива насред платното." },
      // The panic slam, now with the PANIC IN IT (founder review 2026-07-27:
      // „it says panic in the lane but panic about what … there is no panic
      // just a car driving straight"). Two changes, both purely in the ghost's
      // own path, neither touching the graded envelope:
      //   - the polyline carries a damped ±0.7 m weave over the last 60 m: the
      //     startled hands. It is authored as many SHORT segments on purpose —
      //     the recorder's pose heading is piecewise constant per segment, so
      //     few long legs would snap the body between angles instead of rocking
      //     it; these keep every step under ~5° and the car visibly squirms.
      //     It stays FAR inside laneKeepMaxOffsetM (3.25) and never leaves
      //     lane 0, so no lane code can arm;
      //   - the rest is at y = 196, not 183 — still ~10 m short of the halt
      //     zone (r = 3 at (13.9, 206)), so the stop objective is still unmet
      //     and the outcome is still the failed pull-over, but the officer is
      //     now ~13 m ahead instead of ~27 and reads at full size in the frame
      //     the fault marker lands on.
      // The 12 m/s² envelope from 46 km/h is unchanged — that is what
      // HARSH_BRAKING_NO_CAUSE grades (onset ≥ 35 km/h, ≥ 7 m/s² for 0.4 s).
      {
        kind: "drive",
        points: [
          [RIGHT, 100],
          [12.35, 138],
          [12.75, 147],
          [12.7, 155],
          [12.1, 162],
          [11.55, 169],
          [11.5, 175],
          [11.9, 181],
          [12.35, 186],
          [12.4, 191],
          [RIGHT, 196],
        ],
        targetKmh: 46,
        maxDecelMps2: 12,
      },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Никой зад теб не очаква аварийно спиране без причина. Сигналът иска СПОКОЙНО спиране плътно вдясно при полицая — огледало, мигач, плавно (чл. 170).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVpPoliceStopTraceName = "shadow-correct" | "mistake-drive-past" | "mistake-panic-stop";

const SCRIPTS: Record<
  ScVpPoliceStopTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scVpPoliceStopShadowScript },
  "mistake-drive-past": { kind: "mistake", script: scVpPoliceStopMistakeDrivePastScript },
  "mistake-panic-stop": { kind: "mistake", script: scVpPoliceStopMistakePanicScript },
};

/**
 * Record one of the three drives against a loaded ln-v1 document — the
 * TEMPLATE's staged officer figure armed (single truth), ambient traffic zero
 * (the harness law). Deterministic: same district → same trace.
 */
export function recordScVpPoliceStopDrive(
  districtRaw: unknown,
  name: ScVpPoliceStopTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VP_POLICE_STOP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VP_POLICE_STOP.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
