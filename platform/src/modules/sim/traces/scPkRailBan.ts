/**
 * sc-pk-rail-ban — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Никакъв престой около жп прелез" (PK-06 + RX-03, ЗДвП
 * чл. 98) on the committed pk-rail-v1 district. No staged actor, ambient traffic
 * ZERO (the harness law): the trap is the ZONE, not traffic — so the ONLY thing
 * the rule engine can grade is where the driver chooses to rest.
 *
 * THE CROSSING IS EMPTY ON PURPOSE, on both counts:
 *  - no queue tail. A lead within banZoneStopQueueGapM would acquit every rest
 *    in a ban span as queue-shaped (the sc-pk-busstop-ban lesson, verbatim), and
 *    the „спрях зад колоната" drill already exists — it is sc-rx-queue-clear, on
 *    rx-guarded-v1, and it teaches the opposite half of this subject;
 *  - no train. The authored barrier falls at t = 480 s of a 600 s cycle and the
 *    longest drive here ends around t ≈ 60, so every drive lives in the OPEN
 *    window: railBarred is never true, „entered-barred" can never fire, and the
 *    only rail arm in play is the rest-ON-tracks one. That is not a dodge — it
 *    is the template's whole precondition (see the ScenarioSpec header: a lawful
 *    wait at a lowered barrier inside a ban span would convict).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: crosses the whole zone at cruise — no hesitation before the rails,
 *     one unbroken motion over the band (чл. 52 asks no stop of a guarded-open
 *     crossing), no relief stop after them — and rests at the LEGAL bay 74 m past
 *     everything (y = 330) → ZERO violations;
 *   - „Престой в зоната пред прелеза": a casual 6 s rest at y = 175, inside
 *     pkr-z-ban-before → EXACTLY ILLEGAL_STOP_IN_BAN_ZONE (основна);
 *   - „Спиране върху самата прелезна ивица": a 6 s rest at y = 203, mid-band,
 *     where NO ban span reaches → EXACTLY RAIL_CROSSING_VIOLATION (опасна,
 *     detail "stopped-on-track").
 *
 * The two demos are 28 metres apart and grade DIFFERENT codes — that separation
 * is the template. It only holds because the map authors the ban spans up to the
 * rails and never over them (tools/maps/gen_pk_rail.mjs); the district battery
 * proves both verdicts through the real reducer before a single frame is
 * recorded here.
 *
 * Every stop uses the default SCRIPT_DECEL (4.6 m/s², below the
 * harshBrakeDecelMps2 = 7 threshold), so no demo smuggles in a
 * HARSH_BRAKING_NO_CAUSE alongside the fault it is meant to teach. Both demos
 * recover to the legal bay: the fault is the REST, never the route.
 *
 * Geometry pinned to content/world/pk-rail-v1.json: a 1+1 street on x = 0, lane
 * center x = 4.06, чл. 98 spans y ∈ [150, 200] and [206, 256], guarded track band
 * y ∈ [200, 206] (А34), СТОП line y = 195, legal bay y = 330, spawn
 * pkr-spawn-start (4.06, 15) heading north, 400 m long, limit 50 km/h.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PK_RAIL_BAN_ID = "sc-pk-rail-ban";

/** The single northbound lane center of pk-rail-v1. */
const X_LANE = 4.06;
/** Mid-band: the six metres no чл. 98 span reaches — RX-03's ground. */
const Y_RAILS = 203;
/** Mid-approach-ban: 25 m short of the near rail, deep inside pkr-z-ban-before. */
const Y_BAN = 175;
/** The ONE legal mark, 74 m past every span. */
const Y_BAY = 330;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the zone is crossed, never occupied
// ---------------------------------------------------------------------------

export function scPkRailBanShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Задачата: „спри някъде тук за малко“. Напред е железопътен прелез — а около него престоят е забранен от закона, не от знак." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90], [X_LANE, 145]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Оттук нататък сме в зоната на прелеза (чл. 98). Табела няма — и точно затова мястото изглежда свободно." },
      // Through the WHOLE approach ban at cruise: the drill's first claim is that
      // the decision is made early, not shopped for at the rails.
      { kind: "drive", points: [[X_LANE, 145], [X_LANE, 180], [X_LANE, 196]], targetKmh: 40, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Бариерата е вдигната и прелезът е охраняем — не сме длъжни да спираме. Не спираме и „за всеки случай“." },
      // The band in one unbroken motion (чл. 52: guarded + open = no stop duty).
      { kind: "drive", points: [[X_LANE, 196], [X_LANE, 206], [X_LANE, 235]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Коловозът е преминат на едно движение. Забраната обаче продължава и от тази страна — „минах прелеза“ не значи „вече може“." },
      { kind: "drive", points: [[X_LANE, 235], [X_LANE, 275], [X_LANE, 300]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Цялата зона е зад нас. Сега — десен мигач и спиране на първото разрешено място." },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, 300], [X_LANE, Y_BAY]], targetKmh: 20 },
      { kind: "pause", sec: 3, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово: спирането никога не е било забранено — забранено беше МЯСТОТО. То свърши на 256-ия метър." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „за секунда“ in the approach ban (pkr-z-ban-before)
// ---------------------------------------------------------------------------

export function scPkRailBanMistakeStopBeforeCrossingScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „бариерата е вдигната, никого не преча“ — и колата спира на десетина метра пред релсите." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90], [X_LANE, 150], [X_LANE, Y_BAN]], targetKmh: 30 },
      // A casual 6 s rest inside pkr-z-ban-before (y ∈ [150, 200]) — past the 4 s
      // sustain. No lead, no stop line, no crossing anywhere on this map: every
      // structural innocent context is absent, so the authored fault convicts and
      // nothing else. The rails are still 25 m away, so no rail arm can arm.
      { kind: "pause", sec: 6, brake: true },
      { kind: "annotation", textBg: "Около прелеза престой няма — от двете страни, и то без никакъв знак (чл. 98)." },
      { kind: "annotation", textBg: "Спрялата тук кола крие идващия влак от всички зад нея — а те решават да минат по това, което виждат." },
      // The transit itself is lawful and must cost nothing — the fault was the
      // rest, and the sheet has to say exactly that.
      { kind: "drive", points: [[X_LANE, Y_BAN], [X_LANE, 206], [X_LANE, 275]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 275], [X_LANE, Y_BAY]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Разрешеното място беше на 150 метра напред — по-малко от петнайсет секунди шофиране." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — the rest ON the band (pkr-z-railcrossing, RX-03)
// ---------------------------------------------------------------------------

export function scPkRailBanMistakeStopOnRailsScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: същото решение, двайсет и осем метра по-нататък — колата спира между релсите." },
      { kind: "glance", mirror: "rear" },
      // Through the approach ban WITHOUT resting (a stop here would bill the
      // other demo's code and blur the pair) and onto the band, stopping at 203.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90], [X_LANE, 160]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 160], [X_LANE, Y_RAILS]], targetKmh: 18 },
      { kind: "annotation", textBg: "И колата остава там, където никога не се спира: върху коловоза, без изход напред." },
      // Rest ON the band: 6 s ≫ the 2 s sustain — one bill, once. No чл. 98 span
      // reaches these six metres, so the ONLY code here is the опасна one.
      { kind: "pause", sec: 6, brake: true },
      { kind: "annotation", textBg: "Тук извинение няма — нито „колоната спря“, нито „само за миг“. Влакът спира след километър и не завива." },
      { kind: "drive", points: [[X_LANE, Y_RAILS], [X_LANE, 240], [X_LANE, 275]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 275], [X_LANE, Y_BAY]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Двете грешки са на шест метра една от друга — и се оценяват различно: основна пред прелеза, опасна върху него." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPkRailBanTraceName =
  | "shadow-correct"
  | "mistake-stop-before-crossing"
  | "mistake-stop-on-rails";

const SCRIPTS: Record<
  ScPkRailBanTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPkRailBanShadowScript },
  "mistake-stop-before-crossing": {
    kind: "mistake",
    script: scPkRailBanMistakeStopBeforeCrossingScript,
  },
  "mistake-stop-on-rails": { kind: "mistake", script: scPkRailBanMistakeStopOnRailsScript },
};

/**
 * Record one of the three drives against a loaded pk-rail-v1 document — no
 * staged events (the zone is the trap), ambient traffic zero (the harness law).
 * Deterministic: same district → same trace.
 */
export function recordScPkRailBanDrive(
  districtRaw: unknown,
  name: ScPkRailBanTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PK_RAIL_BAN_ID,
    kind,
    seed: 7,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
