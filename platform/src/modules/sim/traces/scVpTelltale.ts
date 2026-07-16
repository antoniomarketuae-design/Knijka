/**
 * sc-vp-telltale — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Контролна лампа в движение" (VP-06, N11 cockpit-
 * stimuli batch #10) on the committed ln-v1 district (the 400 m 2+2
 * boulevard, map REUSED from sc-vp-police-stop), recorded with the template's
 * OWN staged telltale stimulus (telltaleStimulus sc-vptt-lamp — single truth,
 * imported from the template). No ambient traffic (seed 7); the stimulus
 * runner stages NO actor and emits ZERO SimTick events, so the ONLY things
 * the stack can grade are the driver's own speed/braking choices — the
 * completion contract is the template's curb-side low-speed stop zone.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations; mirror, right indicator, eased right and
 *     rested in the stop zone past the lamp (outcome "yielded");
 *   - „Игнорирана лампа": drives on past the lamp and HURRIES (the classic
 *     ignore story — push on to get home before the car dies): sustained
 *     58 km/h in the 50 zone grades EXACTLY SPEEDING_OVER_LIMIT (>10% grace,
 *     ≤ +10 so never SPEEDING_DANGEROUS; the ignored lamp itself shows as
 *     the unreached stop zone + the "passedWithoutStopping" outcome);
 *   - „Паника в лентата": the doc-72 VP-06 wrong reflex — a 12 m/s²-envelope
 *     slam from 46 km/h to a dead stop mid-lane right after the lamp —
 *     grades EXACTLY HARSH_BRAKING_NO_CAUSE. HONESTY NOTE (probed): the
 *     stimulus is NOT a forward cause in the harsh-brake ledger (it reads
 *     leadGap / closing-lead / signal / junction / crossing / hazard-event
 *     channels only, and the telltale runner emits zero events), so the
 *     post-stimulus slam convicts exactly like the sc-vp-police-stop panic —
 *     the honest read: a red lamp asks for a PLANNED pull-over, never an
 *     emergency stop.
 *
 * Geometry pinned to content/world/ln-v1.json: northbound right-lane center
 * x = 12.19, curb x = 16.25; spawn ln-spawn-start (12.19, 15, heading 0 =
 * north), limit 50. The lamp lights at y ≈ 140 (trigger radius 8); the halt
 * zone centers (13.9, 220) r 3 — offsets stay under the 3.25 m lane-keeping
 * threshold and inside the right lane.
 *
 * Rule envelope the scripts respect: SPEEDING_OVER_LIMIT needs speed > 55
 * (50 × 1.1 grace) sustained 2 s and ≤ 60 — the 58 km/h cruise holds it for
 * ~10 s; HARSH_BRAKING needs onset ≥ 35 km/h and ≥ 7 m/s² for 0.4 s with no
 * cause in the ledger — the 46 km/h slam under a 12 m/s² envelope (~8.4
 * sustained) on the empty street. The shadow's default 4.6 m/s² script decel
 * stays far under the 7 m/s² harsh threshold.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VP_TELLTALE } from "../lessons/scenario/templates-cockpit";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VP_TELLTALE_ID = "sc-vp-telltale";

/** Northbound right-lane center of ln-v1 (meta.scenario, pinned by value). */
const RIGHT = 12.19;
/** The curb-side halt point (mirrors the template's stop zone by value). */
const STOP_X = 13.9;
const STOP_Y = 220;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — notice, signal, ease right, rest
// ---------------------------------------------------------------------------

export function scVpTelltaleShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Карай спокойно в дясната лента — и си създай навика да поглеждаш таблото." },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 90], [RIGHT, 140]], targetKmh: 40, stopAtEnd: false },
      {
        kind: "annotation",
        textBg:
          "Червената лампа за температура светна! Без паника: червена лампа значи „спри безопасно сега“ — не на място и не „до вкъщи“.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // Ease toward the right edge and shed speed early — the planned,
        // predictable pull-over; rest lands in the stop zone past the lamp.
        kind: "drive",
        points: [
          [RIGHT, 140],
          [12.8, 168],
          [13.5, 195],
          [STOP_X, STOP_Y],
        ],
        targetKmh: 22,
      },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "indicator", setting: "off" },
      {
        kind: "annotation",
        textBg: "Спряхме плътно вдясно: при червена лампа двигателят се гаси и не се продължава.",
      },
      { kind: "pause", sec: 1.0, brake: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Игнорирана лампа" (SPEEDING_OVER_LIMIT + failed stop)
// ---------------------------------------------------------------------------

export function scVpTelltaleMistakeIgnoreScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: лампата светва… а водачът само натиска газта — „ще стигна до вкъщи“." },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 100], [RIGHT, 140]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Червената лампа свети — но вместо спиране идва бързане: газ над ограничението." },
      { kind: "drive", points: [[RIGHT, 140], [RIGHT, 380]], targetKmh: 58 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Прегряващ двигател не се лекува с газ: няколко километра с червена лампа значат скъсан двигател насред пътя — а бързането прати колата и над ограничението (чл. 21).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Паника в лентата" (HARSH_BRAKING_NO_CAUSE + failed stop)
// ---------------------------------------------------------------------------

export function scVpTelltaleMistakePanicScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: лампата стряска — и кракът се забива в спирачката още в лентата." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 100]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Лампата светва — и вместо план идва паника: аварийно спиране на място." },
      // The panic slam: a 12 m/s² envelope from 46 km/h to a dead stop at
      // y ≈ 183 — mid-lane, ~37 m short of the curb-side halt point.
      { kind: "drive", points: [[RIGHT, 100], [RIGHT, 183]], targetKmh: 46, maxDecelMps2: 12 },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Никой зад теб не очаква аварийно спиране без причина. Червената лампа иска СПОКОЙНО спиране плътно вдясно — огледало, мигач, плавно.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVpTelltaleTraceName = "shadow-correct" | "mistake-ignore" | "mistake-panic-stop";

const SCRIPTS: Record<
  ScVpTelltaleTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scVpTelltaleShadowScript },
  "mistake-ignore": { kind: "mistake", script: scVpTelltaleMistakeIgnoreScript },
  "mistake-panic-stop": { kind: "mistake", script: scVpTelltaleMistakePanicScript },
};

/**
 * Record one of the three drives against a loaded ln-v1 document — the
 * TEMPLATE's staged telltale stimulus armed (single truth), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScVpTelltaleDrive(
  districtRaw: unknown,
  name: ScVpTelltaleTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VP_TELLTALE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VP_TELLTALE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
