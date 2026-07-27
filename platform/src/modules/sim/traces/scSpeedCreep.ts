/**
 * sc-speed-creep — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Пълзящо превишаване" (SP-01 + SP-03) on the committed
 * sp-creep2-v1 district — the founder R3 P5 road (doc 62 #30: „a LONG road:
 * sign 50 → hold under 50 → sign 30 → drop to 30. Signed, staged, failable").
 * No staged actors, ambient traffic ZERO (seed 7): the ONLY thing the rule
 * engine can grade is the driver's own speed against the LOCAL edge limit —
 * 50 on the 400 m approach, 30 in the 280 m zone.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (46 km/h held on the approach,
 *     an early lift at the zone sign, ~27 km/h held through the zone);
 *   - „Носене с потока по подхода": steady ~57 km/h on the 50 approach grades
 *     EXACTLY SPEEDING_OVER_LIMIT (51–60 → второстепенна), NEVER the
 *     dangerous band; the zone is then driven correctly;
 *   - „Пълзене в зоната 30": a correct zone entry at ~27 creeping up to ~37
 *     grades EXACTLY SPEEDING_OVER_LIMIT against the LOCAL 30 (31–40 band),
 *     never SPEEDING_DANGEROUS (> 40). The demo starts mid-approach (y = 330)
 *     so its clean prefix stays under the 250 m CLEAN_DRIVING streak, and its
 *     conviction is authored ONTO a painted „30" road numeral — this is the
 *     demo the clip pilot renders for ev-speed-limit, and the numeral is the
 *     only cap the chase camera can keep in the fault frame (see
 *     SC_SPEED_CREEP_ZONE_GLYPH_Y and the templates-sp.ts ordering note).
 *
 * Geometry pinned to content/world/sp-creep2-v1.json:
 *   street on x = 0, right-lane center x = 4.06, spawn sp-tr-spawn-approach
 *   (4.06, 15) heading north; approach y ∈ [0, 400] @ 50, zone y ∈ [400, 680]
 *   @ 30 (the В26-50 entry plate + painted „30" road numerals are the world's
 *   own signage for the two caps).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SPEED_CREEP } from "../lessons/scenario/templates-sp";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SPEED_CREEP_ID = "sc-speed-creep";

/** Northbound right-lane center of sp-creep2-v1. */
const X_LANE = 4.06;
/** The 50→30 transition line (sp-creep2-v1 meta.scenario.transitionY). */
const ZONE_Y = 400;

/**
 * WHERE THE PAINTED „30" NUMERALS LAND — the only rendered statement of the
 * zone cap on this map (props.ts posts no В26-30 face: the sign kit ships the
 * 50 disc only, and posting a 50 over a 30 edge would lie).
 *
 * markings.ts paints one numeral station per SPEED_GLYPH_PITCH_M (120 m) along
 * the zone edge, starting SPEED_GLYPH_INSET_M (20 m) in, each glyph
 * SPEED_GLYPH_DIGIT_H_M (6 m) long in the driver's own lane; the edge is
 * trimmed 0.8 m at each end first. On sp-creep2-v1's zone edge (y ∈ [400, 680])
 * that puts the station BASES at y ≈ 420.8, 540.8, 660.8 — pinned by value
 * here, re-asserted against the committed map + constants by the gate test.
 */
export const SC_SPEED_CREEP_ZONE_GLYPH_Y = [420.8, 540.8, 660.8] as const;
/** Length of one painted numeral along the road (SPEED_GLYPH_DIGIT_H_M), m. */
export const SC_SPEED_CREEP_ZONE_GLYPH_LEN_M = 6;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scSpeedCreepShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Дълга улица, знак 50 на входа — установи 46 км/ч и ги ЗАДРЪЖ: таванът е граница, не цел." },
      { kind: "glance", mirror: "rear" },
      // 46 km/h — comfortably under the 50 limit for the whole approach.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 200]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Проверявай стрелката на всеки няколко секунди — при дълго равномерно каране скоростта пълзи неусетно." },
      { kind: "drive", points: [[X_LANE, 200], [X_LANE, 330]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Напред започва зона 30 — цифрите са на самото платно. Вдигни газта ОТРАНО." },
      // Early lift: into the zone already under 30.
      { kind: "drive", points: [[X_LANE, 330], [X_LANE, 405]], targetKmh: 27, stopAtEnd: false },
      { kind: "annotation", textBg: "В зоната: 26–28 км/ч. Същият навик, по-нисък таван — и тук стрелката пълзи." },
      { kind: "drive", points: [[X_LANE, 405], [X_LANE, 560]], targetKmh: 27, stopAtEnd: false },
      { kind: "annotation", textBg: "Дръж под 30 до самия край на зоната — дъното на урока е самоконтролът, не участъкът." },
      { kind: "drive", points: [[X_LANE, 560], [X_LANE, 660]], targetKmh: 27 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: два тавана, нито едно превишаване — стрелката се проверява, не се усеща." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Носене с потока по подхода" (SPEEDING_OVER_LIMIT @ 50)
// ---------------------------------------------------------------------------

export function scSpeedCreepMistakeFlowAlongScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: потокът се носи с 56–58 и водачът върви с него — над тавана 50.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold ~57 km/h — above the 55 graced limit, under the 60 dangerous band:
      // sustained → SPEEDING_OVER_LIMIT alone (второстепенна).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 170]], targetKmh: 57, stopAtEnd: false },
      { kind: "annotation", textBg: "51–60 км/ч в зона 50 е второстепенна грешка — таванът е 50, не потокът." },
      { kind: "drive", points: [[X_LANE, 170], [X_LANE, 310]], targetKmh: 57, stopAtEnd: false },
      { kind: "annotation", textBg: "Пред зоната 30 водачът все пак намалява правилно — но грешката по подхода вече е записана." },
      // Correct, early slow-down into the zone — the zone itself stays clean.
      { kind: "drive", points: [[X_LANE, 310], [X_LANE, 405]], targetKmh: 27, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 405], [X_LANE, 480]], targetKmh: 27 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Дори „с потока“, над ограничението е грешка — свали газта до под 50." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Пълзене в зоната 30" (SPEEDING_OVER_LIMIT @ 30)
// ---------------------------------------------------------------------------

export function scSpeedCreepMistakeZoneCreepScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: правилно влизане в зоната 30 — и после стрелката пълзи, без поглед към нея.",
      },
      { kind: "glance", mirror: "rear" },
      // FOUNDER R0 („a car driving forward in a city street, nothing else"):
      // this demo is the one the why-panel serves for ev-speed-limit, and a
      // speeding clip is unreadable unless the CAP is in the same frame as the
      // needle. sp-creep2-v1 posts no В26 face at the zone entry (the kit ships
      // only the 50 disc), so the cap that CAN be framed is the painted „30"
      // on the tarmac — 6 m tall, in the driver's own lane, at the glyph
      // stations SPEED_GLYPH_* place along the zone edge (see SC_SPEED_CREEP_ZONE_GLYPH_Y).
      // The whole drive is authored to put the ❌ ON one of them.
      //
      // The start is at y = 330, not 280: the first violation now lands ~213 m
      // in, which keeps the clean prefix under the 250 m CLEAN_DRIVING streak
      // (this demo must not earn the shadow's positive) while still showing the
      // 50 → 30 transition and the first painted numeral before the fault.
      { kind: "drive", points: [[X_LANE, 330], [X_LANE, 398]], targetKmh: 44, stopAtEnd: false },
      // Correct early lift and a correct zone entry at ~27 — over the first
      // painted „30" station (y ≈ 421) at a speed that respects it.
      { kind: "drive", points: [[X_LANE, 398], [X_LANE, 470]], targetKmh: 27, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 470], [X_LANE, 517]], targetKmh: 27, stopAtEnd: false },
      { kind: "annotation", textBg: "Усещането при 37 в зона 30 е „бавно“ — но таванът тук е 30, не 50." },
      // The creep: 27 → 37 and hold — the 31–40 minor band of the LOCAL 30,
      // never the > 40 dangerous band. Opening the throttle at y = 517 puts the
      // conviction ~26 m later (33 km/h crossed after ~6 m, then the 2 s
      // speedingMinorSustainSec at ~10 m/s) — i.e. on the SECOND painted „30".
      { kind: "drive", points: [[X_LANE, 517], [X_LANE, 640]], targetKmh: 37 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "37 в зона 30 е същата второстепенна грешка като 57 в зона 50 — проверявай стрелката, особено при нисък таван." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpeedCreepTraceName = "shadow-correct" | "mistake-flow-along" | "mistake-zone-creep";

const SCRIPTS: Record<
  ScSpeedCreepTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpeedCreepShadowScript },
  "mistake-flow-along": { kind: "mistake", script: scSpeedCreepMistakeFlowAlongScript },
  "mistake-zone-creep": { kind: "mistake", script: scSpeedCreepMistakeZoneCreepScript },
};

/**
 * Record one of the three drives against a loaded sp-creep2-v1 document — no
 * staged actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScSpeedCreepDrive(
  districtRaw: unknown,
  name: ScSpeedCreepTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SPEED_CREEP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_SPEED_CREEP.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}

/** Kept for template docs: the zone begins at this y (meta.scenario.transitionY). */
export const SC_SPEED_CREEP_ZONE_Y = ZONE_Y;
