/**
 * sc-pk-ban-stop — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Спиране в забранена зона" (PK-06, ADR-006 stage 2a)
 * on the committed pk-ban-v1 district (В27 noStopping @ y ∈ [70, 190] — the
 * ZONE-BAN `zones` layer). No staged actor: the trap is the SIGN, not traffic
 * — ambient zero, so the ONLY thing the rule engine can grade is where the
 * driver chooses to rest.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: transits the В27 span without stopping and rests at the LEGAL
 *     mark past the zone end (y = 235) → ZERO violations;
 *   - „Само за минутка": a casual 5 s curb rest MID-zone (y = 130) → grades
 *     EXACTLY ILLEGAL_STOP_IN_BAN_ZONE (основна, чл. 98) — no queue, no
 *     signal, no crossing: the structural innocent contexts are absent, so
 *     the rest is the authored fault and nothing else;
 *   - „Почти в края": the same casual rest a few meters BEFORE the span ends
 *     (y = 180) → EXACTLY ILLEGAL_STOP_IN_BAN_ZONE — the ban runs to its end.
 *
 * Geometry pinned to content/world/pk-ban-v1.json: a 1+1 street on x = 0,
 * lane center x = 4.06, В27 span [70, 190], spawn pkb-spawn-start (4.06, 15)
 * heading north, 300 m long, limit 50 km/h.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PK_BAN_STOP_ID = "sc-pk-ban-stop";

/** The single northbound lane center of pk-ban-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — transit the zone, rest after it
// ---------------------------------------------------------------------------

export function scPkBanStopShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Задачата: спри „за малко“ — но участъкът напред е под знак В27, забранени престой и паркиране." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 70], [X_LANE, 130]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "В зоната на В27 не се спира изобщо — продължи с равномерна скорост." },
      { kind: "drive", points: [[X_LANE, 130], [X_LANE, 195]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Краят на зоната: сега намали плавно и спри на разрешеното място." },
      { kind: "drive", points: [[X_LANE, 195], [X_LANE, 235]], targetKmh: 20 },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "annotation", textBg: "Готово: премина зоната без престой и спря чак където е позволено." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Само за минутка" mid-zone (ILLEGAL_STOP_IN_BAN_ZONE)
// ---------------------------------------------------------------------------

export function scPkBanStopMistakeInZoneScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „пусни ме тук за малко“ — и колата спира по средата на зоната В27." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90], [X_LANE, 130]], targetKmh: 28 },
      // A casual 5 s rest INSIDE the span — past the 4 s sustain; no queue,
      // no signal, no crossing → the authored fault convicts, nothing else.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "Престой под В27 няма — нито дълъг, нито „само за минутка“ (чл. 98)." },
      { kind: "drive", points: [[X_LANE, 130], [X_LANE, 200], [X_LANE, 240]], targetKmh: 28 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Правилното място беше на няколко секунди напред — след края на зоната." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Почти в края" of the zone (ILLEGAL_STOP_IN_BAN_ZONE)
// ---------------------------------------------------------------------------

export function scPkBanStopMistakeAtEdgeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: изчаква „почти до края“ на зоната — и спира няколко метра преди тя да свърши." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 180]], targetKmh: 30 },
      // Still INSIDE the span (180 < 190): the ban runs to its end.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "„Почти след зоната“ е все още в зоната — забраната важи до края на участъка." },
      { kind: "drive", points: [[X_LANE, 180], [X_LANE, 240]], targetKmh: 26 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Десет метра търпение деляха грешката от правилното спиране." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPkBanStopTraceName =
  | "shadow-correct"
  | "mistake-stop-in-zone"
  | "mistake-stop-at-edge";

const SCRIPTS: Record<
  ScPkBanStopTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPkBanStopShadowScript },
  "mistake-stop-in-zone": { kind: "mistake", script: scPkBanStopMistakeInZoneScript },
  "mistake-stop-at-edge": { kind: "mistake", script: scPkBanStopMistakeAtEdgeScript },
};

/**
 * Record one of the three drives against a loaded pk-ban-v1 document — no
 * staged events (the sign is the trap), ambient traffic zero (the harness
 * law). Deterministic: same district → same trace.
 */
export function recordScPkBanStopDrive(
  districtRaw: unknown,
  name: ScPkBanStopTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PK_BAN_STOP_ID,
    kind,
    seed: 7,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
