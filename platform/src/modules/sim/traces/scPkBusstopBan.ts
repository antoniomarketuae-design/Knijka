/**
 * sc-pk-busstop-ban — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Спирка не е паркинг" (PK-06, ЗДвП чл. 69 — founder ruling 2026-09-22) on
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
 *   - „Само за минутка" — чакане в джоба: a 24 s WAIT at y = 195, inside
 *     pkbs-z-stop-pocket → EXACTLY ILLEGAL_STOP_IN_BAN_ZONE (основна);
 *   - чакане върху зигзага: the same wait at y = 165, inside
 *     pkbs-z-stop-marking → EXACTLY ILLEGAL_STOP_IN_BAN_ZONE.
 *
 * WHY 24 s AND NOT THE OLD 5 s — founder follow-up ruling 2026-09-22, «Teach
 * чл. 69 as written». чл. 69 PERMITS a brief stop at a spirka to let passengers
 * alight (if it hinders no bus), so a 5 s rest is no longer an offence and the
 * reducer does not bill it. What the act bans there is parking (чл. 98, ал. 2,
 * т. 3; чл. 93, ал. 2 — stopped beyond the time a drop-off needs), and the
 * reducer bills a `law-bus-stop` rest after `busStopDropOffMaxSec` (20 s, the
 * product's allowance). 24 s clears it with margin and stays short of the
 * re-grade (20 + 6 s), so each demo bills exactly once. Both traces were
 * RE-RECORDED for this — the product now grades the 5 s rests as innocent.
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
      { kind: "annotation", textBg: "Зигзагът по платното започва тук: оттук нататък сме в зоната на спирката. Тук можеш само да свалиш пътник, без да пречиш на автобуса (чл. 69) — а ние ще чакаме, значи не спираме тук." },
      { kind: "drive", points: [[X_LANE, 140], [X_LANE, 180], [X_LANE, 215]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Джобът беше празен — но не намалихме към него. Празен джоб не значи свободен: автобусът идва след минута." },
      { kind: "drive", points: [[X_LANE, 215], [X_LANE, 225]], targetKmh: 35, stopAtEnd: false },
      { kind: "annotation", textBg: "Зоната на спирката е зад нас. Сега — десен мигач и спиране на първото разрешено място." },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, 225], [X_LANE, 250]], targetKmh: 20 },
      { kind: "pause", sec: 3, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово: подмина цялата спирка и спря 40 метра след нея — тук можем да чакаме, колкото трябва." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „само за минутка": WAITING in the pocket (pkbs-z-stop-pocket)
// ---------------------------------------------------------------------------

/** The demos' wait, s: past `busStopDropOffMaxSec` (20), short of its re-grade (26). */
const WAIT_SEC = 24;

export function scPkBusstopBanMistakeOnPocketScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „нали автобус няма, ще го изчакам тук“ — и колата влиза право в джоба на спирката." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 160], [X_LANE, 195]], targetKmh: 30 },
      // A WAIT inside pkbs-z-stop-pocket (y ∈ [180, 210]) — past the drop-off
      // allowance, so the stop is паркиране (чл. 93, ал. 2). No lead in the bay,
      // no stop line, no crossing anywhere on this map: every structural
      // innocent context is absent, so the authored fault convicts and nothing
      // else.
      { kind: "pause", sec: WAIT_SEC, brake: true },
      { kind: "annotation", textBg: "Да свалиш пътник тук е позволено (чл. 69). Да чакаш тук е паркиране (чл. 93, ал. 2) — а на спирка паркирането е забранено (чл. 98, ал. 2, т. 3)." },
      { kind: "drive", points: [[X_LANE, 195], [X_LANE, 225]], targetKmh: 30 },
      { kind: "annotation", textBg: "Зает джоб праща автобуса във втората лента — и пътниците му слизат между движещите се коли." },
      { kind: "drive", points: [[X_LANE, 225], [X_LANE, 250]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Мястото, където можеше да чакаш, беше на 40 метра напред — на няколко секунди път." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — WAITING on the зигзаг BEFORE the bay (pkbs-z-stop-marking)
// ---------------------------------------------------------------------------

export function scPkBusstopBanMistakeOnMarkingScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „аз не съм на спирката, аз съм преди нея“ — и колата спира върху зигзага, за да чака." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 165]], targetKmh: 30 },
      // Still the spirka: pkbs-z-stop-marking covers y ∈ [150, 180]. The zone is
      // what the зигзаг outlines, not what the навес covers — and the car WAITS
      // there, past the drop-off allowance.
      { kind: "pause", sec: WAIT_SEC, brake: true },
      { kind: "annotation", textBg: "„Преди спирката“ не значи „извън зоната ѝ“ — зоната е тази, която зигзагът очертава по платното, и чакането в нея е паркиране на спирка." },
      { kind: "drive", points: [[X_LANE, 165], [X_LANE, 195], [X_LANE, 225]], targetKmh: 30 },
      { kind: "annotation", textBg: "Колата, която чака тук, отнема на автобуса пътя, по който той влиза в джоба — затова той спира накриво или изобщо не влиза." },
      { kind: "drive", points: [[X_LANE, 225], [X_LANE, 250]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Едни и същи правила, две различни извинения — и едно място за чакане, само на 40 м след зоната." },
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
