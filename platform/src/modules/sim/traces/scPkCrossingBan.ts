/**
 * sc-pk-crossing-ban — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Спиране до пешеходна пътека — къде е позволено"
 * (PK-06, ЗДвП чл. 98, ал. 1) on the committed pk-banx-v1 district. No staged
 * actor, ambient traffic ZERO (the harness law): the trap is the LAW, not
 * traffic — so the ONLY thing the rule engine can grade is where the driver
 * chooses to rest.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: transits both чл. 98 ban groups without resting, crosses the
 *     zebra, indicates right and rests at the LEGAL bay past it (y = 300) →
 *     ZERO violations;
 *   - „Престой на метри преди кръстовището": a casual 5 s rest at y = 140,
 *     inside pkx-z-jx-before → EXACTLY ILLEGAL_STOP_IN_BAN_ZONE (основна);
 *   - „Спиране върху ъгъла на кръстовището": the same casual rest at y = 160,
 *     inside pkx-z-jx-after → EXACTLY ILLEGAL_STOP_IN_BAN_ZONE.
 *
 * Both demos rest in DIFFERENT authored spans (the junction ban is two spans —
 * the node splits the street). Neither rests at the ZEBRA: the detector
 * requires `s.crossing === null` and the CrossingZoneTracker arms ~35 m out, so
 * a rest before a crossing is structurally acquitted today — see the template
 * header (templates-parking2.ts) and the pinned district battery. Both rest
 * sites sit >100 m from the zebra, well clear of that arm radius, and the map
 * derives ZERO stop lines (every edge is `residential`), so nothing acquits
 * them as traffic-shaped.
 *
 * Geometry pinned to content/world/pk-banx-v1.json: a 1+1 street on x = 0, lane
 * center x = 4.06, unsignalized degree-4 junction at y = 150, marked zebra at
 * y = 260, legal bay at y = 300, spawn pkx-spawn-start (4.06, 15) heading
 * north, 360 m long, limit 50 km/h.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PK_CROSSING_BAN_ID = "sc-pk-crossing-ban";

/** The single northbound lane center of pk-banx-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — read the road, rest past the zebra
// ---------------------------------------------------------------------------

export function scPkCrossingBanShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Задачата: „спри тук за малко“. Знак за забрана няма — местата, където не се спира, ги казва законът." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 136]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Напред е кръстовище: на него и на 5 м от него престоят е забранен (чл. 98) — минаваме без да спираме." },
      { kind: "drive", points: [[X_LANE, 136], [X_LANE, 150], [X_LANE, 170]], targetKmh: 35, stopAtEnd: false },
      { kind: "annotation", textBg: "Ъгълът остана зад нас — спрялата там кола щеше да скрие идващите по напречната улица." },
      { kind: "drive", points: [[X_LANE, 170], [X_LANE, 230], [X_LANE, 252]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходна пътека: пред нея не се спира — твоята кола е стената, зад която пешеходецът не се вижда." },
      { kind: "drive", points: [[X_LANE, 252], [X_LANE, 265]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Пътеката е премината. Сега — десен мигач и спиране на първото разрешено място." },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, 265], [X_LANE, 300]], targetKmh: 20 },
      { kind: "pause", sec: 3, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово: подмина забранените места и спря там, където престоят е позволен — след пътеката." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — a rest metres BEFORE the junction (pkx-z-jx-before)
// ---------------------------------------------------------------------------

export function scPkCrossingBanMistakeBeforeJunctionScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „то тук е широко, ще се разминат“ — и колата спира на метри преди кръстовището." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 140]], targetKmh: 30 },
      // A casual 5 s rest inside pkx-z-jx-before (y ∈ [136.87, 150]) — past the
      // 4 s sustain. No queue, no stop line, no crossing within 35 m: the
      // structural innocent contexts are all absent, so the authored fault
      // convicts and nothing else.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "На кръстовището и на по-малко от 5 м от него престой няма — забраната е в закона, не на табела (чл. 98)." },
      { kind: "drive", points: [[X_LANE, 140], [X_LANE, 200], [X_LANE, 240]], targetKmh: 30 },
      { kind: "annotation", textBg: "Спрялата кола тук крие от теб идващите по напречната улица — а теб от тях." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 300]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Разрешеното място беше на секунди напред — след пътеката." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — a rest ON THE CORNER past the junction (pkx-z-jx-after)
// ---------------------------------------------------------------------------

export function scPkCrossingBanMistakeOnCornerScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: подминава кръстовището и спира веднага след него — точно върху ъгъла." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110], [X_LANE, 160]], targetKmh: 32 },
      // Still inside the ban: pkx-z-jx-after covers y ∈ [150, 163.13] — the
      // чл. 98 т. 2 ban runs on BOTH sides of the junction.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "„След кръстовището“ не значи „извън забраната“ — тя важи от двете страни, на 5 м от него." },
      { kind: "drive", points: [[X_LANE, 160], [X_LANE, 220], [X_LANE, 250]], targetKmh: 30 },
      { kind: "annotation", textBg: "Ъгълът е мястото, откъдето завиват колите и пресичат пешеходците — спрялата кола ги избутва в платното." },
      { kind: "drive", points: [[X_LANE, 250], [X_LANE, 300]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Десет метра търпение деляха грешката от правилното спиране." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPkCrossingBanTraceName =
  | "shadow-correct"
  | "mistake-stop-before-junction"
  | "mistake-stop-on-corner";

const SCRIPTS: Record<
  ScPkCrossingBanTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPkCrossingBanShadowScript },
  "mistake-stop-before-junction": {
    kind: "mistake",
    script: scPkCrossingBanMistakeBeforeJunctionScript,
  },
  "mistake-stop-on-corner": { kind: "mistake", script: scPkCrossingBanMistakeOnCornerScript },
};

/**
 * Record one of the three drives against a loaded pk-banx-v1 document — no
 * staged events (the law is the trap), ambient traffic zero (the harness law).
 * Deterministic: same district → same trace.
 */
export function recordScPkCrossingBanDrive(
  districtRaw: unknown,
  name: ScPkCrossingBanTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PK_CROSSING_BAN_ID,
    kind,
    seed: 7,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
