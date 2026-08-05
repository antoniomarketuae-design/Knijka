/**
 * sc-lane-change — the authored drives (doc 76 §5/§9): ONE correct shadow
 * demonstration + TWO mistake demos for „Смяна на лента" on the committed
 * ln-v1 district, recorded with the template's OWN staged target-lane pace car
 * (brakingLeadCar sc-lc-blindspot — single truth, imported from the template).
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + the SAFE_LANE_CHANGE commendation (mirror →
 *     signal → shoulder → move, the учебен ред);
 *   - „Престрояване без мигач" grades EXACTLY LANE_CHANGE_WITHOUT_INDICATOR;
 *   - „Престрояване без огледало" grades EXACTLY LANE_CHANGE_WITHOUT_MIRROR_CHECK.
 *
 * Geometry pinned to content/world/ln-v1.json: a 2+2 straight boulevard on
 * y ∈ [0, 400], RIGHT-lane center x = 12.19, LEFT-lane center x = 4.06 (lane
 * boundary x = 8.125), spawn ln-spawn-start (12.19, 15) heading north, limit
 * 50 km/h.
 *
 * Rule envelope the scripts respect (rules/engine.ts §3, cfg defaults): the
 * lane change grades when tick.laneId crosses the boundary at ≥ 10 km/h in a
 * forward gear. indicatorOk = a matching-direction indicator within
 * indicatorLookbackSec = 3 s; mirrorOk = a matching-direction glance within
 * mirrorLookbackSec = 5 s. So the shadow arms BOTH before the crossing — but
 * on the AUTHORED CADENCE below (register B21), never stacked on one frame;
 * each mistake arms exactly one and withholds the other. The pace car is
 * deterministic moving traffic (its slam tier is authored out of the play
 * corridor in the template) and never grades — it is the blind-spot presence
 * the mirror check exists for, not a braking drill.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_LANE_CHANGE } from "../lessons/scenario/templates-flow";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_LANE_CHANGE_ID = "sc-lane-change";

/** Right-lane (start) and left-lane (target) centers of ln-v1. */
const X_RIGHT = 12.19;
const X_LEFT = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

/**
 * REGISTER B21, THE TIMING CONSTANT — founder: *„he must press almost at the
 * same time few buttons … just a second."*
 *
 * That constant was **0.00 s**, and it lived here. `indicator`, `glance` and
 * `annotation` are ZERO-DURATION script steps (recorder.ts `continue`s without
 * advancing a frame), so the previous version of this demonstration put FIVE
 * events on one timestamp — measured in the committed recording at t = 15.60 s:
 *
 *     15.60  annotation  „Провери лявото огледало…"
 *     15.60  glance-left                              ← огледало
 *     15.60  signal-on                                ← мигач
 *     15.60  annotation  „Ляв мигач, после бърз поглед…"  ← overwrites the above
 *     15.60  glance-left                              ← рамо
 *
 * The first bubble was on screen for **zero seconds** and the three taught acts
 * happened on ONE frame. This is the L1 „Пълна помощ" rung, so it is the very
 * first thing a 17-year-old sees, and it is a demonstration — it is the model
 * he copies. He read it exactly right: it showed him three buttons at once.
 *
 * The rule engine never demanded that (`indicatorLookbackSec` 3 s refreshes
 * every tick the stalk is on; `mirrorLookbackSec` 5 s), and a deliberate
 * beginner drive passes clean — measured 2026-08-04 on /dev/drive-rig with a
 * 3.0 s read pause, a 1.6 s mirror hold, a 1.2 s hesitation and a 1.4 s
 * shoulder check between the beats: both objectives green, zero faults. So the
 * fix is not to loosen grading, it is to stop TEACHING simultaneity.
 *
 * THE CADENCE NOW AUTHORED (40 km/h ⇒ 11.11 m/s, so metres of road ARE the
 * seconds; each beat is a cue, a gap to read it, the act, and a gap to see it):
 *
 *     y=101  bubble „Първо огледалото…"      A
 *     y=125  glance-left                      ОГЛЕДАЛО   (+2.2 s)
 *     y=150  bubble „Прецени скоростта…"      B          (+2.2 s)
 *     y=174  bubble „Сега ляв мигач…"         C          (+2.2 s)
 *     y=194  indicator-left                   МИГАЧ      (+1.8 s)
 *     y=205  bubble „Поглед през рамо…"       D          (+1.0 s)
 *     y=225  glance-left                      РАМО       (+1.8 s)
 *     y=230  wheel over                       ВОЛАН      (+0.45 s)
 *
 * мигач → волан = 3.2 s, which is the template's own `examinerBg` contract
 * («навременен мигач — 2–3 секунди преди преместването»), and рамо → волан is
 * deliberately the SHORTEST gap: the blind-spot check is the last thing before
 * the wheel, not a separate ceremony. Every annotation now lives ≥ 2 s (the
 * 4 s `sample.ts` window caps the two long ones). The drill is not slower —
 * same 40 km/h, same road, same ~30 s; the beats are simply spread along it
 * instead of stacked on one frame. `shadow-pacing.test.ts` pins the floor.
 */
export function scLaneChangeShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Установи се в дясната лента с постоянна скорост." },
      { kind: "glance", mirror: "rear" },
      // Settle in the RIGHT lane (satisfies the cruise objective at 12.19,150).
      // ONE continuous path from here to the wheel: the old script's second
      // drive step began at y = 175 while the car stood at y = 160, so the
      // ghost teleported 15 m mid-demonstration.
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 60], [X_RIGHT, 101]], targetKmh: 40, stopAtEnd: false },

      // — БЕАТ 1: ОГЛЕДАЛО. The cue lands, and the head turns 2.2 s later.
      { kind: "annotation", textBg: "Първо огледалото — виж лявата лента." },
      { kind: "drive", points: [[X_RIGHT, 101], [X_RIGHT, 125]], targetKmh: 40, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_RIGHT, 125], [X_RIGHT, 150]], targetKmh: 40, stopAtEnd: false },
      // The look has a PURPOSE, said while the head is still on the mirror.
      { kind: "annotation", textBg: "Прецени скоростта на колата зад теб." },
      { kind: "drive", points: [[X_RIGHT, 150], [X_RIGHT, 174]], targetKmh: 40, stopAtEnd: false },

      // — БЕАТ 2: МИГАЧ, armed 3.2 s before the wheel moves (ЗДвП чл. 25).
      { kind: "annotation", textBg: "Сега ляв мигач — сигналът е преди маневрата." },
      { kind: "drive", points: [[X_RIGHT, 174], [X_RIGHT, 194]], targetKmh: 40, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_RIGHT, 194], [X_RIGHT, 205]], targetKmh: 40, stopAtEnd: false },

      // — БЕАТ 3: РАМО, the last act before the wheel. The glance lands at
      //   t=21.52 of the recording and the laneId boundary x = 8.125 falls at
      //   ~y=248, so the demonstration itself uses ~5 s of the 8 s
      //   mirrorLookbackSec (register B21 widened it from 5). The margin is
      //   deliberate and it is the POINT of this row: the shadow must show a
      //   pace a beginner can copy without racing, not the tightest legal one.
      { kind: "annotation", textBg: "Поглед през рамо към мъртвата зона." },
      { kind: "drive", points: [[X_RIGHT, 205], [X_RIGHT, 225]], targetKmh: 40, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_RIGHT, 225], [X_RIGHT, 230]], targetKmh: 40, stopAtEnd: false },

      // — БЕАТ 4: ВОЛАН. Smooth diagonal that is centred in the LEFT lane by
      //   the sc-lc-change waypoint (4.06, 260) the student has to reach.
      { kind: "annotation", textBg: "Чак сега воланът — плавно и по диагонал." },
      {
        kind: "drive",
        points: [[X_RIGHT, 230], [10.6, 240], [7.4, 252], [4.6, 264], [X_LEFT, 272], [X_LEFT, 300]],
        targetKmh: 40,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_LEFT, 300], [X_LEFT, 330]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: огледало, мигач, рамо, маневра — по реда." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Престрояване без мигач" (LANE_CHANGE_WITHOUT_INDICATOR)
// ---------------------------------------------------------------------------

export function scLaneChangeMistakeNoIndicatorScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: воланът тръгва наляво без ляв мигач." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 90], [X_RIGHT, 160]], targetKmh: 40, stopAtEnd: false },
      // The driver DID look (mirror is OK) — the isolated fault is the missing
      // indicator, so NO left-signal is ever armed.
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Огледа се, но не подаде мигач — и се престрои." },
      {
        kind: "drive",
        points: [[X_RIGHT, 175], [10.0, 188], [6.0, 205], [X_LEFT, 225], [X_LEFT, 270]],
        targetKmh: 40,
        stopAtEnd: false,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Мигачът предхожда маневрата: движещият се отзад в лявата лента няма как да предвиди престрояването ти без него.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Престрояване без огледало" (LANE_CHANGE_WITHOUT_MIRROR_CHECK)
// ---------------------------------------------------------------------------

export function scLaneChangeMistakeNoMirrorScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: мигач има, но воланът тръгва без поглед в огледалото." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 90], [X_RIGHT, 160]], targetKmh: 40, stopAtEnd: false },
      // The driver DID signal (indicator is OK) — the isolated fault is the
      // missing mirror/shoulder check, so NO left glance is ever made (the
      // rear glance above does not clear the left blind spot).
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "Мигач — да. Но никакъв поглед наляво към мъртвата зона." },
      {
        kind: "drive",
        points: [[X_RIGHT, 175], [10.0, 188], [6.0, 205], [X_LEFT, 225], [X_LEFT, 270]],
        targetKmh: 40,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Огледалото не показва мъртвата зона — точно там се движеше кола. Редът е железен: огледало → мигач → рамо → маневра.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScLaneChangeTraceName =
  | "shadow-correct"
  | "mistake-no-indicator"
  | "mistake-no-mirror";

const SCRIPTS: Record<ScLaneChangeTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scLaneChangeShadowScript },
  "mistake-no-indicator": { kind: "mistake", script: scLaneChangeMistakeNoIndicatorScript },
  "mistake-no-mirror": { kind: "mistake", script: scLaneChangeMistakeNoMirrorScript },
};

/**
 * Record one of the three drives against a loaded ln-v1 document — the
 * TEMPLATE's staged pace car armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScLaneChangeDrive(
  districtRaw: unknown,
  name: ScLaneChangeTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_LANE_CHANGE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_LANE_CHANGE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
