/**
 * sc-pk-busstop-ban — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Спирка не е паркинг" (PK-06, ЗДвП чл. 98, ал. 1) on
 * the committed pk-busstop-v1 district. No staged actor, ambient traffic ZERO
 * (the harness law): the trap is the ZONE, not traffic — so the ONLY thing the
 * rule engine can grade is where the driver chooses to rest.
 *
 * THE POCKET IS EMPTY ON PURPOSE. A staged bus would be a lead vehicle within
 * banZoneStopQueueGapM, and every rest behind it would read as queue-shaped and
 * be acquitted. „Празна е, само за секунда" is the misconception; an empty bay
 * is the only honest way to stage it.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: transits the WHOLE stop zone without slowing into the pocket,
 *     indicates right and rests at the LEGAL bay 40 m past it (y = 250) →
 *     ZERO violations;
 *   - „Само да сваля пътник" върху спирката: a casual 5 s rest at y = 195,
 *     inside pkbs-z-stop-pocket → EXACTLY ILLEGAL_STOP_IN_BAN_ZONE (основна);
 *   - „Престой в зоната на маркировката": the same casual rest at y = 165,
 *     inside pkbs-z-stop-marking → EXACTLY ILLEGAL_STOP_IN_BAN_ZONE.
 *
 * Both demos rest in DIFFERENT authored spans — one continuous ban, two
 * different excuses. Unlike sc-pk-crossing-ban (whose zebra span is acquitted
 * by the ~35 m crossing arm), BOTH spans here convict: the district carries
 * ZERO crossings and ZERO intersections, so CrossingZoneTracker never arms and
 * buildStopLines emits nothing. Nothing can acquit these rests as
 * traffic-shaped.
 *
 * Every stop uses the default SCRIPT_DECEL (4.6 m/s², below the
 * harshBrakeDecelMps2 = 7 threshold), so no demo smuggles in a
 * HARSH_BRAKING_NO_CAUSE alongside the fault it is meant to teach.
 *
 * Geometry pinned to content/world/pk-busstop-v1.json: a 1+1 street on x = 0,
 * lane center x = 4.06, зигзаг approach y ∈ [150, 180], bus pocket
 * y ∈ [180, 210], legal bay at y = 250, spawn pkbs-spawn-start (4.06, 15)
 * heading north, 340 m long, limit 50 km/h.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PK_BUSSTOP_BAN_ID = "sc-pk-busstop-ban";

/** The single northbound lane center of pk-busstop-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — read the зигзаг, rest past the zone
// ---------------------------------------------------------------------------

export function scPkBusstopBanShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Задачата: „остави ме тук“. Напред вдясно е автобусна спирка — а зоната ѝ е по-голяма от навеса." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 140]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Зигзагът по платното започва тук: оттук нататък сме в зоната на спирката и престоят е забранен (чл. 98, ал. 1)." },
      { kind: "drive", points: [[X_LANE, 140], [X_LANE, 180], [X_LANE, 215]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Джобът беше празен — но не намалихме към него. Празен джоб не значи свободен: автобусът идва след минута." },
      { kind: "drive", points: [[X_LANE, 215], [X_LANE, 225]], targetKmh: 35, stopAtEnd: false },
      { kind: "annotation", textBg: "Зоната на спирката е зад нас. Сега — десен мигач и спиране на първото разрешено място." },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, 225], [X_LANE, 250]], targetKmh: 20 },
      { kind: "pause", sec: 3, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово: подмина цялата спирка и спря 40 метра след нея, където престоят е позволен." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „само за секунда" IN the pocket (pkbs-z-stop-pocket)
// ---------------------------------------------------------------------------

export function scPkBusstopBanMistakeOnPocketScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „нали автобус няма, за секунда е“ — и колата влиза право в джоба на спирката." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 160], [X_LANE, 195]], targetKmh: 30 },
      // A casual 5 s rest inside pkbs-z-stop-pocket (y ∈ [180, 210]) — past the
      // 4 s sustain. No lead in the bay, no stop line, no crossing anywhere on
      // this map: every structural innocent context is absent, so the authored
      // fault convicts and nothing else.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "На спирката престой няма — дори кратък, дори когато е празна (чл. 98, ал. 1)." },
      { kind: "drive", points: [[X_LANE, 195], [X_LANE, 225]], targetKmh: 30 },
      { kind: "annotation", textBg: "Зает джоб праща автобуса във втората лента — и пътниците му слизат между движещите се коли." },
      { kind: "drive", points: [[X_LANE, 225], [X_LANE, 250]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Разрешеното място беше на 40 метра напред — по-малко от една секунда шофиране." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — a rest on the зигзаг BEFORE the bay (pkbs-z-stop-marking)
// ---------------------------------------------------------------------------

export function scPkBusstopBanMistakeOnMarkingScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „аз не съм на спирката, аз съм преди нея“ — и колата спира върху зигзага." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 165]], targetKmh: 30 },
      // Still the spirka: pkbs-z-stop-marking covers y ∈ [150, 180]. The zone is
      // what the зигзаг outlines (Наредба № 2/2001), not what the navesut covers.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "„Преди спирката“ не значи „извън зоната ѝ“ — зоната е тази, която зигзагът очертава по платното." },
      { kind: "drive", points: [[X_LANE, 165], [X_LANE, 195], [X_LANE, 225]], targetKmh: 30 },
      { kind: "annotation", textBg: "Спрялата тук кола отнема на автобуса пътя, по който той влиза в джоба — затова той спира накриво или изобщо не влиза." },
      { kind: "drive", points: [[X_LANE, 225], [X_LANE, 250]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Едно и също правило, две различни извинения — и едно разрешено място, само на 40 м след зоната." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPkBusstopBanTraceName =
  | "shadow-correct"
  | "mistake-stop-on-pocket"
  | "mistake-stop-on-marking";

const SCRIPTS: Record<
  ScPkBusstopBanTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPkBusstopBanShadowScript },
  "mistake-stop-on-pocket": { kind: "mistake", script: scPkBusstopBanMistakeOnPocketScript },
  "mistake-stop-on-marking": { kind: "mistake", script: scPkBusstopBanMistakeOnMarkingScript },
};

/**
 * Record one of the three drives against a loaded pk-busstop-v1 document — no
 * staged events (the zone is the trap), ambient traffic zero (the harness law).
 * Deterministic: same district → same trace.
 */
export function recordScPkBusstopBanDrive(
  districtRaw: unknown,
  name: ScPkBusstopBanTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PK_BUSSTOP_BAN_ID,
    kind,
    seed: 7,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
