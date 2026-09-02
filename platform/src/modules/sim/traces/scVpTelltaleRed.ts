/**
 * sc-vp-telltale-red — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Червена лампа — спри сега" (VP-06, the red/amber
 * TRIAGE) on the committed ln-v1 district (the 400 m 2+2 boulevard, map REUSED
 * from sc-vp-telltale / sc-vp-police-stop), recorded with the template's OWN
 * staged telltale stimulus (telltaleStimulus sc-vptr-lamp — single truth,
 * imported from the template). No ambient traffic (seed 7); the stimulus runner
 * stages NO actor and emits ZERO SimTick events, so the ONLY things the stack
 * can grade are the driver's own speed/braking/lane choices and the authored
 * collision beat.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations; drives ON past the amber cue (continue-smoothly),
 *     then at the RED lamp mirror-signal-eases-right and RESTS in the curb-side
 *     stop zone (outcome "yielded");
 *   - „Каране нататък с червената лампа": drives on past the red lamp at a
 *     LAWFUL 45 km/h (so SPEEDING never joins), the seized engine coasts the car
 *     off line and the AUTHORED collision beat (staticObject — the roadside the
 *     telltale runner stages nothing else to hit) grades EXACTLY COLLISION;
 *   - „Паническо спиране в активната лента": the doc-72 VP-06 wrong reflex — a
 *     12 m/s²-envelope slam from 46 km/h to a dead stop mid-lane right after the
 *     red lamp — grades EXACTLY HARSH_BRAKING_NO_CAUSE. HONESTY NOTE (the
 *     scVpTelltale precedent, probed): the stimulus is NOT a forward cause in
 *     the harsh-brake ledger (leadGap / signal / junction / crossing channels
 *     only, and the telltale runner emits zero events), so the post-stimulus
 *     slam convicts exactly like the sc-vp-police-stop panic — the honest read:
 *     a red lamp asks for a PLANNED pull-over, never an emergency stop.
 *
 * Geometry pinned to content/world/ln-v1.json: northbound right-lane center
 * x = 12.19, curb x = 16.25; spawn ln-spawn-start (12.19, 15, heading 0 =
 * north), limit 50. The red lamp lights at y ≈ 175 (trigger radius 8); the halt
 * zone centers (13.9, 255) r 3 — offsets stay under the 3.25 m lane-keeping
 * threshold and inside the right lane. The AMBER lamp is a NARRATIVE cue only
 * (annotation) — the engine renders one telltale channel (see the template's
 * honest-limit note); the "continue-smoothly" verdict is the y = 110 checkpoint
 * the shadow passes while rolling.
 *
 * Rule envelope the scripts respect: SPEEDING_OVER_LIMIT needs speed > 55
 * (50 × 1.1 grace) sustained — the 45/46 km/h cruises never reach it;
 * HARSH_BRAKING needs onset ≥ 35 km/h and ≥ 7 m/s² for 0.4 s with no cause in
 * the ledger — the 46 km/h slam under a 12 m/s² envelope (~8.4 sustained) on the
 * empty street; the pause step zeroes speed in a single frame (no sustained
 * ramp), so the shadow's and the drive-on demo's stops never bill harsh. The
 * authored collision beat is pushed straight into the runtime (pushCollision),
 * speed-independent.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VP_TELLTALE_RED } from "../lessons/scenario/templates-cockpit2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VP_TELLTALE_RED_ID = "sc-vp-telltale-red";

/** Northbound right-lane center of ln-v1 (meta.scenario, pinned by value). */
const RIGHT = 12.19;
/** The curb-side halt point for the RED lamp (mirrors the template's stop zone
 *  by value). */
const STOP_X = 13.9;
const STOP_Y = 255;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — amber: drive on; red: signal, ease, rest
// ---------------------------------------------------------------------------

export function scVpTelltaleRedShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Карай спокойно в дясната лента и поглеждай таблото — цветът на лампата решава какво правиш.",
      },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 60]], targetKmh: 40, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Светна ЖЪЛТА лампа. Жълто значи „внимателно до сервиз“ — не спираме аварийно, продължаваме плавно.",
      },
      // Continue-smoothly past the amber: the y = 110 checkpoint is crossed
      // while rolling, then on to the red trigger corridor (y ≈ 175).
      { kind: "drive", points: [[RIGHT, 60], [RIGHT, 110], [RIGHT, 175]], targetKmh: 40, stopAtEnd: false },
      {
        kind: "annotation",
        textBg:
          "Сега светна ЧЕРВЕНА лампа за температура. Червено значи „спри безопасно СЕГА“ — огледало, десен мигач, плавно вдясно.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // Ease toward the right edge and shed speed — the planned, predictable
        // pull-over; rest lands in the red stop zone past the lamp.
        kind: "drive",
        points: [
          [RIGHT, 175],
          [12.8, 205],
          [13.5, 232],
          [STOP_X, STOP_Y],
        ],
        targetKmh: 22,
      },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "indicator", setting: "off" },
      {
        kind: "annotation",
        textBg: "Спряхме плътно вдясно и гасим двигателя — при червена лампа не се продължава.",
      },
      { kind: "pause", sec: 1.0, brake: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Каране нататък с червената лампа" (COLLISION)
// ---------------------------------------------------------------------------

export function scVpTelltaleRedMistakeDriveOnScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: червената лампа свети — а водачът натиска газта нататък, „до вкъщи е близо“.",
      },
      // Past the amber, past the red trigger — all at a LAWFUL 45 (the graced
      // band is 55), so the ONLY thing this demo shows is ignoring the red.
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 110], [RIGHT, 175]], targetKmh: 45, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Червеното не търпи „още малко“: маслото/температурата вече убиват двигателя в движение.",
      },
      // …and FAR ENOUGH that the ignore is actually adjudicated. The stimulus
      // resolves once its trigger is `ignoreBeyondM` (100 m) behind, i.e. at
      // y ≈ 275; the demo used to turn back into the roadside at y = 230, so
      // the one code its own title names could never fire and the card was left
      // convicting the crash alone (sc-vp-telltale-red:c172d48b).
      { kind: "drive", points: [[RIGHT, 175], [RIGHT, 285]], targetKmh: 45, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Двигателят блокира на скорост — колата поднася и удря това, което е пред нея.",
      },
      // The authored consequence (the scCrossingDart seam): the seized car is
      // carried off line into the roadside. Pushed straight into the runtime —
      // the telltale runner stages nothing geometric to hit.
      { kind: "collision", withWhat: "staticObject" },
      { kind: "pause", sec: 2.2, brake: true },
      {
        kind: "annotation",
        textBg: "Червена лампа = спри безопасно веднага, плътно вдясно, и гаси двигателя. Не се кара нататък.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Паническо спиране в активната лента"
// (HARSH_BRAKING_NO_CAUSE)
// ---------------------------------------------------------------------------

export function scVpTelltaleRedMistakePanicScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: лампата стряска — и кракът се забива в спирачката още в лентата.",
      },
      { kind: "glance", mirror: "rear" },
      // Cruise past the amber to the red trigger corridor (the lamp arms within
      // 8 m of y = 175, i.e. from y ≈ 167), still rolling.
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 110], [RIGHT, 172]], targetKmh: 46, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Червената лампа светна — и вместо план идва паника: аварийно спиране на място.",
      },
      // The panic slam: a 12 m/s² envelope from 46 km/h to a dead stop mid-lane
      // (~10 m ⇒ rests ≈ y 182), well short of the curb-side halt point.
      { kind: "drive", points: [[RIGHT, 172], [RIGHT, 205]], targetKmh: 46, maxDecelMps2: 12 },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Никой зад теб не очаква аварийно спиране в лентата. Червената лампа иска СПОКОЙНО спиране плътно вдясно — огледало, мигач, плавно.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVpTelltaleRedTraceName = "shadow-correct" | "mistake-drive-on" | "mistake-panic-lane";

const SCRIPTS: Record<
  ScVpTelltaleRedTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scVpTelltaleRedShadowScript },
  "mistake-drive-on": { kind: "mistake", script: scVpTelltaleRedMistakeDriveOnScript },
  "mistake-panic-lane": { kind: "mistake", script: scVpTelltaleRedMistakePanicScript },
};

/**
 * Record one of the three drives against a loaded ln-v1 document — the
 * TEMPLATE's staged telltale stimulus armed (single truth), ambient traffic
 * zero (the harness law). The stimulus runner stages NO actor and emits ZERO
 * SimTick events, so the drive-on demo needs the AUTHORED collision beat for its
 * COLLISION code. Deterministic: same district → same trace.
 */
export function recordScVpTelltaleRedDrive(
  districtRaw: unknown,
  name: ScVpTelltaleRedTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VP_TELLTALE_RED_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VP_TELLTALE_RED.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
