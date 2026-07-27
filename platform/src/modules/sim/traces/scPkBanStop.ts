/**
 * sc-pk-ban-stop — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Спиране в забранена зона" (PK-06, ADR-006 stage 2a)
 * on the committed pk-ban-v1 district (В27 noStopping @ y ∈ [70, 190] — the
 * ZONE-BAN `zones` layer). No staged actor: the trap is the SIGN, not traffic
 * — ambient zero, so the ONLY thing the rule engine can grade is where the
 * driver chooses to rest.
 *
 * ALL THREE DRIVES NOW PULL OVER TO THE CURB TO STOP (X_CURB below — founder
 * review 2026-07-27: „currently the car is stopping in the middle of the
 * road"). A stop is a manoeuvre — mirror, right indicator, ease in beside the
 * curb-parked cars — and a demo that halts dead centre in a live lane reads as
 * a simulator artefact rather than the act В27 forbids. Lateral position is not
 * a grading channel here (see X_CURB), so the three verdicts are unchanged.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: transits the В27 span without stopping and rests at the LEGAL
 *     mark past the zone end (y = 235, curb-side) → ZERO violations;
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
/**
 * Where a car actually comes to rest when its driver stops „за малко", m
 * (founder review 2026-07-27: „in real live situations the driver goes abit
 * right to the other cars close by and than stops and currently the car is
 * stopping in the middle of the road" — and the map's own defaults note says
 * the same: „спри чак след края на зоната, плътно вдясно").
 *
 * 6.3 puts the body against the curb line (the carriageway edge is ≈ 8.1; the
 * В27 plate stands at x = 8.93) and alongside the curb-parked decoration the
 * TrafficLayer draws there, which is the visual reason a student reads the
 * manoeuvre as „пуска някого", not as a car freezing in a traffic lane.
 * GRADING IS UNAFFECTED, and deliberately so:
 *   - |laneOffsetM| = 2.24 — well inside laneKeepMaxOffsetM (3.25), so no
 *     lane-keeping code; the street is 1+1, so laneId never moves either;
 *   - the ban detector reads the ZONE SPAN and the rest, not the lateral
 *     position: pulling over does not buy absolution under В27, which is the
 *     whole lesson (чл. 98);
 *   - the legal-stop objective (reachZone x = 4.06, r = 4) still contains it.
 */
const X_CURB = 6.3;

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
      { kind: "annotation", textBg: "Краят на зоната: сега мигач надясно, приближи плътно до тротоара и спри на разрешеното място." },
      { kind: "indicator", setting: "right" },
      // Ease to the curb over the last 40 m — a stop „плътно вдясно", not a
      // car parked in a moving lane (see X_CURB). The last leg is deliberately
      // near-parallel to the kerb (0.1 m over 7 m ⇒ under 1° of residual yaw):
      // a car left at 10° to the kerb reads as abandoned, not parked.
      {
        kind: "drive",
        points: [
          [X_LANE, 195],
          [4.6, 206],
          [5.6, 218],
          [6.2, 228],
          [X_CURB, 235],
        ],
        targetKmh: 20,
      },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово: премина зоната без престой и спря чак където е позволено — плътно вдясно, без да пречи." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Само за минутка" mid-zone (ILLEGAL_STOP_IN_BAN_ZONE)
// ---------------------------------------------------------------------------

export function scPkBanStopMistakeInZoneScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „пусни ме тук за малко“ — и колата отбива към бордюра насред зоната В27." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90], [X_LANE, 108]], targetKmh: 28, stopAtEnd: false },
      // The manoeuvre a driver actually makes: mirror, right indicator, tuck in
      // beside the curb-parked cars — and stop. The founder's note is the whole
      // point of these three steps: a car that halts dead centre in a live lane
      // reads as a simulator artefact, so the clip never showed the ACT the
      // sign forbids. It does now, and В27 still bills it.
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: [
          [X_LANE, 108],
          [4.6, 114],
          [5.6, 122],
          [6.2, 127],
          [X_CURB, 130],
        ],
        targetKmh: 24,
      },
      // A casual 5 s rest INSIDE the span — past the 4 s sustain; no queue,
      // no signal, no crossing → the authored fault convicts, nothing else.
      { kind: "pause", sec: 5, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Плътно вдясно или не — престой под В27 няма, нито дълъг, нито „само за минутка“ (чл. 98)." },
      {
        kind: "drive",
        points: [[X_CURB, 130], [6.2, 134], [5.2, 141], [X_LANE, 150], [X_LANE, 200], [X_LANE, 240]],
        targetKmh: 28,
      },
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
      { kind: "annotation", textBg: "Грешка: изчаква „почти до края“ на зоната — и отбива няколко метра преди тя да свърши." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 158]], targetKmh: 30, stopAtEnd: false },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      // Curb-side again (X_CURB) — and still INSIDE the span (180 < 190): the
      // ban runs to its end, and pulling over is not an exemption.
      {
        kind: "drive",
        points: [
          [X_LANE, 158],
          [4.6, 164],
          [5.6, 172],
          [6.2, 177],
          [X_CURB, 180],
        ],
        targetKmh: 24,
      },
      { kind: "pause", sec: 5, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "„Почти след зоната“ е все още в зоната — забраната важи до края на участъка." },
      {
        kind: "drive",
        points: [[X_CURB, 180], [6.2, 184], [5.2, 191], [X_LANE, 200], [X_LANE, 240]],
        targetKmh: 26,
      },
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
