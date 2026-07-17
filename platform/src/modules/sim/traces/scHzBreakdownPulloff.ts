/**
 * sc-hz-breakdown-pulloff — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Авария на магистралата — протоколът" (PK-10,
 * ЗДвП чл. 58, т. 3) on the committed mw-v1 motorway segment (map REUSED from
 * sc-mw-emergency-lane). Recorded with the template's OWN staged telltale
 * stimulus (SC_HZ_BREAKDOWN_TELLTALE — single truth, imported from the
 * template); NO physical obstacle (the breakdown is the dashboard lamp, not a
 * car on the road), ambient traffic ZERO (seed 7). The telltale runner emits
 * ZERO SimTick events, so the ONLY things the stack grades are the driver's own
 * lane and braking choices.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING — signals, eases across to the
 *     emergency lane in one continuous braking diagonal and STOPS hard right
 *     (x = 8.13). The stop never grades EMERGENCY_LANE_DRIVING (firm braking
 *     keeps the clock reset; the halt disarms it) and never grades
 *     HARSH_BRAKING_NO_CAUSE (the pull-off decel stays under the 7 m/s²
 *     threshold, and the arc runs off the normal driving line);
 *   - „Каране по аварийната лента до изхода": a SIGNALLED drift into laneId 0
 *     then hundreds of metres RIDDEN at ~90 km/h — sustained travel in the
 *     emergency lane grades EXACTLY EMERGENCY_LANE_DRIVING, once (one excursion,
 *     one bill), and NEVER a lane-change code (the drift is mirror+indicator);
 *   - „Спиране в активната лента при работеща кола": a 12 m/s²-envelope slam
 *     from ~100 km/h to a dead stop MID-LANE (x = 0) right after the lamp —
 *     grades EXACTLY HARSH_BRAKING_NO_CAUSE (the dashboard lamp is not a forward
 *     cause in the ledger; the telltale runner emits nothing).
 *
 * Geometry pinned to content/world/mw-v1.json (meta.scenario): northbound
 * carriageway — cruise lane (laneId 1) x = 0, emergency lane (laneId 0)
 * x = 8.13; spawn mw-spawn-approach (0, 15) heading 0 = north; limit 140;
 * length 1000. The red temperature lamp lights at y = 250 (trigger radius 8);
 * the compliant halt sits at (8.13, 378).
 *
 * Rule envelope the scripts respect (rules/types.ts defaults):
 *   - EMERGENCY_LANE_DRIVING needs sustained (≥ 3 s) travel in laneId 0 with
 *     decel < 1 m/s² — the shadow BRAKES the whole way in (clock resets every
 *     tick), the shoulder-drive demo CRUISES it at 90 for ~17 s (fires once);
 *   - HARSH_BRAKING needs onset ≥ 35 km/h and ≥ 7 m/s² for 0.4 s with no cause
 *     — the lane-stop demo's ~100 km/h slam under a 12 m/s² envelope
 *     (≈ 8.4 m/s² sustained) on the empty carriageway lands it; the shadow's
 *     default ~4.6 m/s² script decel stays far under the harsh threshold.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_HZ_BREAKDOWN_PULLOFF } from "../lessons/scenario/templates-hazards2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_HZ_BREAKDOWN_PULLOFF_ID = "sc-hz-breakdown-pulloff";

/** mw-v1 northbound lane centers (meta.scenario — the L7 copy truth). */
const X_CRUISE = 0; // laneId 1 — the right TRAVEL lane
const X_EMERG = 8.13; // laneId 0 — the emergency lane

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — signal, ease across, stop hard right
// ---------------------------------------------------------------------------

export function scHzBreakdownPulloffShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Магистрала: вдясно от нас е аварийната лента — само за принудително спиране." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 150], [X_CRUISE, 280]], targetKmh: 95, stopAtEnd: false },
      {
        kind: "annotation",
        textBg:
          "Червената лампа за налягане на маслото светна — двигателят отказва. Без паника: огледало, десен мигач и плавно излизане вдясно.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // One continuous braking diagonal from the travel lane into the
        // emergency lane, to a full stop hard right. The polyline is ≈ the
        // natural stopping distance from 95 km/h, so the car brakes the whole
        // way (targetKmh sits above entry → the stop-envelope governs) — the
        // emergency-lane clock never accumulates and the halt disarms it.
        kind: "drive",
        points: [
          [X_CRUISE, 280],
          [4.0, 315],
          [X_EMERG, 342],
          [X_EMERG, 378],
        ],
        targetKmh: 100,
      },
      { kind: "annotation", textBg: "Прекосихме в едно движение и спираме максимално вдясно — предвидимо за движещите се зад нас." },
      { kind: "pause", sec: 2.0, brake: true },
      { kind: "indicator", setting: "off" },
      {
        kind: "annotation",
        textBg: "Спряхме плътно вдясно в аварийната лента и гасим двигателя — потокът отляво остава чист.",
      },
      { kind: "pause", sec: 1.0, brake: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Каране по аварийната лента до изхода" (EMERGENCY_LANE_DRIVING)
// ---------------------------------------------------------------------------

export function scHzBreakdownPulloffMistakeShoulderDriveScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: вместо да спре, водачът подкарва по аварийната лента до следващия изход." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 150], [X_CRUISE, 280]], targetKmh: 92, stopAtEnd: false },
      { kind: "annotation", textBg: "Лампата свети — но колата само се мести вдясно и продължава по лентата за принудително спиране." },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_CRUISE, 280], [4.0, 315], [X_EMERG, 345]], targetKmh: 90, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      {
        kind: "annotation",
        textBg: "Стотици метри по аварийната лента — коридорът на линейката е зает и напред може да стои друга аварирала кола.",
      },
      // Ride the emergency lane at ~90 for hundreds of metres — the sustained
      // travel the detector grades (one excursion, one bill).
      { kind: "drive", points: [[X_EMERG, 345], [X_EMERG, 780]], targetKmh: 90, stopAtEnd: false },
      { kind: "annotation", textBg: "Чак при изхода колата спира — но грешката вече е направена." },
      { kind: "drive", points: [[X_EMERG, 780], [X_EMERG, 880]], targetKmh: 90 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Движението по аварийната лента е забранено — при повреда се спира в нея, не се пътува по нея." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Спиране в активната лента при работеща кола" (HARSH_BRAKING_NO_CAUSE)
// ---------------------------------------------------------------------------

export function scHzBreakdownPulloffMistakeLaneStopScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: лампата стряска — и кракът се забива в спирачката още в активната лента." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 150], [X_CRUISE, 300]], targetKmh: 100, stopAtEnd: false },
      { kind: "annotation", textBg: "Вместо план — паника: аварийно спиране на място, насред лентата за движение." },
      // The panic slam: a 12 m/s² envelope from ~100 km/h to a dead stop in the
      // travel lane (x = 0), on the normal driving line — HARSH_BRAKING_NO_CAUSE.
      { kind: "drive", points: [[X_CRUISE, 300], [X_CRUISE, 350]], targetKmh: 100, maxDecelMps2: 12 },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Спрял в активната лента автомобил при магистрална скорост зад него е предпоставка за верижен удар. Повредата иска план: плавно намаляване и излизане вдясно, чак там — спиране.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScHzBreakdownPulloffTraceName =
  | "shadow-correct"
  | "mistake-shoulder-drive"
  | "mistake-lane-stop";

const SCRIPTS: Record<
  ScHzBreakdownPulloffTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scHzBreakdownPulloffShadowScript },
  "mistake-shoulder-drive": { kind: "mistake", script: scHzBreakdownPulloffMistakeShoulderDriveScript },
  "mistake-lane-stop": { kind: "mistake", script: scHzBreakdownPulloffMistakeLaneStopScript },
};

/**
 * Record one of the three drives against a loaded mw-v1 document — the
 * TEMPLATE's staged telltale stimulus armed (single truth), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScHzBreakdownPulloffDrive(
  districtRaw: unknown,
  name: ScHzBreakdownPulloffTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_HZ_BREAKDOWN_PULLOFF_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_HZ_BREAKDOWN_PULLOFF.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
