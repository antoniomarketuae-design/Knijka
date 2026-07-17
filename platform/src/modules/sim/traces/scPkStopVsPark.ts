/**
 * sc-pk-stop-vs-park — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „В27 срещу В28 — престой и паркиране" (PK-06) on the
 * committed pk-ban2-v1 district (В28 noParking @ y ∈ [70, 170] handing over to
 * В27 noStopping @ y ∈ [170, 290] — the ZONE-BAN `zones` layer's only
 * mixed-kind map). No staged actor: the trap is WHICH SIGN, not traffic —
 * ambient zero, so the ONLY thing the rule engine can grade is where the driver
 * chooses to rest.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: rests ~5 s at the curb MID-В28 (y = 120) to drop the passenger —
 *     the whole template's thesis, and ZERO violations, because престоят под
 *     В28 е разрешен (чл. 93) — then transits the В27 span without stopping and
 *     parks at the legal mark past both plates (y = 330);
 *   - „Пренесох правилото на В28 отвъд знака": the same casual rest five meters
 *     PAST the seam (y = 180) → grades EXACTLY ILLEGAL_STOP_IN_BAN_ZONE — the
 *     permission that did not travel;
 *   - „Само за минутка" под В27: a casual 5 s rest MID-В27 (y = 230) → EXACTLY
 *     ILLEGAL_STOP_IN_BAN_ZONE — no queue, no signal, no crossing: the map
 *     carries no armor at all, so the rest is the authored fault and nothing
 *     else.
 *
 * WHY THE SHADOW GLANCES BEFORE EVERY MOVE-OFF: it pulls away from rest twice
 * (once under В28, once at the bay), and a curb exit without observation is
 * PK-05. MOVE_OFF_WITHOUT_OBSERVATION is config-gated OFF by default and only
 * ever grades the FIRST move-off, so the glances are not what keeps this trace
 * green — they are what makes it a demonstration worth copying.
 *
 * KNOWN GAP (honest — the template header carries the full account): a LONG
 * stay under В28 is паркиране and the plate bans it, but no detector reads
 * `tick.noParkZone`, so there is no third demo. The ungraded 60 s stay is
 * pinned as a live tripwire in world/__tests__/pk-ban2-districts.test.ts.
 *
 * Geometry pinned to content/world/pk-ban2-v1.json: a 1+1 street on x = 0, lane
 * center x = 4.06, В28 [70, 170], В27 [170, 290], legal bay y = 330, spawn
 * pkb2-spawn-start (4.06, 15) heading north, 380 m long, limit 50 km/h.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PK_STOP_VS_PARK_ID = "sc-pk-stop-vs-park";

/** The single northbound lane center of pk-ban2-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — drop off under В28, transit В27, park
// ---------------------------------------------------------------------------

export function scPkStopVsParkShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Задачата: свали пътника и после паркирай. Улицата е подписана два пъти — В28, после В27." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "В28: паркирането е забранено, престоят — не. Тук пътникът може да слезе." },
      { kind: "drive", points: [[X_LANE, 70], [X_LANE, 120]], targetKmh: 20 },
      // The template's thesis, as a drive: a real rest inside the В28 span,
      // past the 4 s sustain the В27 detector uses — and innocent, because the
      // detector reads noStopZone and this span sets noParkZone (чл. 93).
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "Пътникът слезе, водачът остана зад волана — това е престой, не паркиране (чл. 93)." },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 170]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Знакът се смени: от 170-ия метър е В27 — тук не се спира изобщо, продължавай." },
      { kind: "drive", points: [[X_LANE, 170], [X_LANE, 230], [X_LANE, 295]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Двата знака са зад теб: сега намали плавно и паркирай на разрешеното място." },
      { kind: "drive", points: [[X_LANE, 295], [X_LANE, 330]], targetKmh: 18 },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "annotation", textBg: "Готово: престой там, където е разрешен, и паркиране чак след двете забрани." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — the В28 permission carried past the seam (y = 180)
// ---------------------------------------------------------------------------

export function scPkStopVsParkMistakePastSeamScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът прочете В28 („престоят е разрешен“) и продължи да го прилага и след знака В27." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 180]], targetKmh: 28 },
      // Five meters PAST the seam (180 > 170): a casual 5 s rest, past the 4 s
      // sustain; no queue, no signal, no crossing → the authored fault
      // convicts, nothing else.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "Зоната на В28 свърши при следващия знак — В27 не я продължава, а я затяга." },
      { kind: "drive", points: [[X_LANE, 180], [X_LANE, 260], [X_LANE, 330]], targetKmh: 28 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Разрешеното място беше десет метра назад — под предишния знак." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „само за минутка" mid-В27 (y = 230)
// ---------------------------------------------------------------------------

export function scPkStopVsParkMistakeMinuteScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „пусни ме тук за минутка“ — и колата спира по средата на участъка под В27." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 140], [X_LANE, 230]], targetKmh: 30 },
      // Mid-В27 (170 < 230 < 290): the same casual 5 s rest, the same clean
      // room, the opposite verdict from the shadow's — the pair IS the lesson.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "В27 не различава престой от паркиране: под него не се спира изобщо (чл. 98)." },
      { kind: "drive", points: [[X_LANE, 230], [X_LANE, 300], [X_LANE, 330]], targetKmh: 26 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Под В28 същата минута беше разрешена. Знакът, не минутата, решава." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPkStopVsParkTraceName =
  | "shadow-correct"
  | "mistake-permission-past-seam"
  | "mistake-minute-under-v27";

const SCRIPTS: Record<
  ScPkStopVsParkTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPkStopVsParkShadowScript },
  "mistake-permission-past-seam": { kind: "mistake", script: scPkStopVsParkMistakePastSeamScript },
  "mistake-minute-under-v27": { kind: "mistake", script: scPkStopVsParkMistakeMinuteScript },
};

/**
 * Record one of the three drives against a loaded pk-ban2-v1 document — no
 * staged events (the sign is the trap), ambient traffic zero (the harness
 * law). Deterministic: same district → same trace.
 */
export function recordScPkStopVsParkDrive(
  districtRaw: unknown,
  name: ScPkStopVsParkTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PK_STOP_VS_PARK_ID,
    kind,
    seed: 7,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
