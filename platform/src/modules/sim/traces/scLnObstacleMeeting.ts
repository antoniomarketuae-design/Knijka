/**
 * sc-ln-obstacle-meeting — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Препятствието е в твоята половина" (doc 72
 * OV-18 „Обект на платното — заобикаляне" × OV-14 narrow meeting) on the
 * committed ov-narrow-v1 district (240 m two-way street, ONE lane per direction,
 * limit 40), with the template's OWN staged actors (single truth, imported from
 * the template):
 *  - the oncoming QUEUE, in authored order: car #1 is the oncomingStream
 *    (sc-lnom-stream — clockwork, released on the player's first movement,
 *    tracking y ≈ 221 − 5.5·t); car #2 is the narrowMeeting actor
 *    (sc-lnom-meeting — synced to arrive as the player arrives, whatever pace
 *    the student drove up at);
 *  - the parked row (the narrowMeeting props at y = 148 / 161, x = 4.06) —
 *    the player's own half, closed.
 *
 * THE ONE HINGE. Car #1 is a pure function of time and car #2 is a pure function
 * of the PLAYER: that is the drill. The shadow's patience and both mistakes'
 * disaster come out of the same two specs with nothing scripted underneath —
 * every demo meets car #1 at the same place on the clock, and what differs is
 * only whether the car was in its own lane when it got there.
 *
 * The trace gate replays exactly these through the production stack:
 *  - shadow: stops in its OWN lane at y = 130, waits out BOTH oncoming cars,
 *    then rounds the parked row at 12 km/h with the left indicator lit and comes
 *    home → ZERO violations + YIELDED_TO_PRIORITY (the narrowMeeting runner's
 *    own reserved vocabulary for the wait);
 *  - „Изнасяне в насрещното пред идваща кола": swings onto the oncoming bank at
 *    16 km/h in front of car #1 and keeps rolling. The staged car's playerGuard
 *    brakes it to a standstill ~6 m short — and the demo drives into it anyway →
 *    EXACTLY COLLISION, through the shipped OncomingStreamRunner contact check.
 *    No scripted collision beat: the contact is physical and geometric;
 *  - „Провиране с настъпване на осевата под насрещен": rides x = 0.4
 *    (laneOffsetM ≈ 3.66 > the 3.25 m laneKeepMaxOffsetM, indicator dark, own
 *    bank) for ~5 s → CENTER_LINE_TOUCHED (3.5 s sustain), then leans out to
 *    x = −2 to squeeze past and hits car #1 → EXACTLY those two. The generic
 *    POOR_LANE_KEEPING is SUPPRESSED by design (centerLineCond arms ⇒ the
 *    engine's "one act, one code" ruling stands the generic clock down); the
 *    lean-out itself sits at |laneOffsetM| = 2.06, inside the tolerance.
 *
 * WHY NEITHER MISTAKE LEAKS FAILED_TO_YIELD (the OV-14 runner's narrow-passage
 * bill, which sc-ov-narrow's demos exist to grade): the barge condition needs
 * the player INSIDE the section (playerAlong ≥ −2 ⇒ y ≥ 138) for 0.9 s. Both
 * demos are stopped by the crash at y ≈ 126-131, short of it — they never reach
 * the стеснение, because the car with the right of way was already there. The
 * runner's own contact check cannot fire either: its actor (car #2) is still
 * north of y = 160 when both demos end.
 *
 * Geometry pinned to content/world/ov-narrow-v1.json: street on x = 0, player
 * (northbound) lane center x = +4.06, oncoming (southbound) center x = −4.06,
 * spawn nm-spawn-approach (4.06, 15) heading north; 240 m, limit 40.
 * laneOffsetM is measured from the NEAREST lane center (+ = toward the осева),
 * so it peaks at ≈ 4.06 on the paint itself and shrinks again past it — the
 * center-line band is |x| < 0.81 (nm-district.test.ts pins the whole curve).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_LN_OBSTACLE_MEETING } from "../lessons/scenario/templates-lanes2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_LN_OBSTACLE_MEETING_ID = "sc-ln-obstacle-meeting";

/** Player (northbound) lane center, the oncoming center, and the two lines the
 *  mistakes ride: the осева itself and the lean-out that meets car #1. */
const X_OWN = 4.06;
const X_ONC = -4.06;
const X_LINE = 0.4; // laneOffsetM ≈ 3.66 — riding the осева, still own bank
const X_LEAN = -2; // laneOffsetM ≈ 2.06 — over the line, inside the tolerance

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — wait out the WHOLE queue, then one arc
// ---------------------------------------------------------------------------

export function scLnObstacleMeetingShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Тясна двупосочна улица. Напред паркиран ред заема твоята половина — заобикалянето минава през насрещната лента." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 112]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Препятствието е от ТВОЯТА страна — предимството е на насрещния. Намаляваш и спираш в своята лента." },
      { kind: "glance", mirror: "left" },
      // Ease to a stop in the OWN lane, ~16 m short of the parked row and a
      // dozen metres short of the section (y = 140) — the wait gate.
      { kind: "drive", points: [[X_OWN, 112], [X_OWN, 130]], targetKmh: 12 },
      { kind: "annotation", textBg: "Първата насрещна кола минава. Не тръгвай след нея — зад нея идва втора." },
      // 15 s: car #1 passes the stopped nose at t ≈ 17, car #2 (the synced one)
      // at t ≈ 29 — the wait is authored to outlast the WHOLE queue, with margin.
      { kind: "pause", sec: 15, brake: true },
      { kind: "annotation", textBg: "Втората кола отмина и насрещната лента е празна докрай — чак сега тръгваш." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      // ONE committed arc around the parked row at 12 km/h (far under the 20 km/h
      // corridor-commit bar — заобикаляне, not изпреварване), back to own lane.
      {
        kind: "drive",
        points: [
          [X_OWN, 130],
          [2, 138],
          [X_ONC, 146],
          [X_ONC, 166],
          [2, 176],
          [X_OWN, 186],
        ],
        targetKmh: 12,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 186], [X_OWN, 215]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Изчака целия насрещен поток и мина с една спокойна дъга — точно това иска чл. 44." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изнасяне в насрещното пред идваща кола" (COLLISION)
// ---------------------------------------------------------------------------

export function scLnObstacleMeetingMistakePullOutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата не спира, а се изнася в насрещната лента пред приближаващия автомобил." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 95]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "„Ще успея преди него“ — мигач, и направо в чуждата лента." },
      { kind: "indicator", setting: "left" },
      // Onto the oncoming bank at 16 km/h and straight on: car #1 is inbound,
      // its playerGuard stops it dead — and this drive keeps going.
      {
        kind: "drive",
        points: [
          [X_OWN, 95],
          [2, 102],
          [X_ONC, 112],
          [X_ONC, 136],
        ],
        targetKmh: 16,
      },
      { kind: "pause", sec: 2, brake: true },
      {
        kind: "annotation",
        textBg: "Насрещният спря напълно — и пак се удариха. Препятствието е в твоята половина: чака се, не се дели платното.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Провиране с настъпване на осевата" (CENTER_LINE_TOUCHED +
// COLLISION)
// ---------------------------------------------------------------------------

export function scLnObstacleMeetingMistakeSqueezeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: вместо да изчака, колата увисва върху осевата линия и се провира срещу насрещния." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 88]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Нито в своята лента, нито в насрещната — тоест в двете едновременно." },
      // ~5 s riding the paint with the indicator dark: the CENTER_LINE_TOUCHED
      // sustain is 3.5 s (nothing is announced — that is the point).
      { kind: "drive", points: [[X_OWN, 88], [X_LINE, 100], [X_LINE, 120]], targetKmh: 15, stopAtEnd: false },
      { kind: "annotation", textBg: "Паркираните коли не се провират — и колата ляга още по-наляво, в лентата на насрещния." },
      // Ends at y = 132: the crash is the end of this drive, and it happens SIX
      // metres short of the section (y = 140) — so the OV-14 barge condition
      // (playerAlong ≥ −2 ⇒ y ≥ 138) is never armed and FAILED_TO_YIELD, which
      // is sc-ov-narrow's code for a different act, cannot leak in.
      { kind: "drive", points: [[X_LINE, 120], [X_LEAN, 128], [X_LEAN, 132]], targetKmh: 15 },
      { kind: "pause", sec: 2, brake: true },
      {
        kind: "annotation",
        textBg: "Осевата не е половин решение: сантиметрите, които си оставил на насрещния, не стигат за преценка.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScLnObstacleMeetingTraceName =
  | "shadow-correct"
  | "mistake-pull-out"
  | "mistake-squeeze";

const SCRIPTS: Record<
  ScLnObstacleMeetingTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scLnObstacleMeetingShadowScript },
  "mistake-pull-out": { kind: "mistake", script: scLnObstacleMeetingMistakePullOutScript },
  "mistake-squeeze": { kind: "mistake", script: scLnObstacleMeetingMistakeSqueezeScript },
};

/**
 * Record one sc-ln-obstacle-meeting drive against its loaded ov-narrow-v1
 * document — the TEMPLATE's staged queue armed (single truth), ambient traffic
 * zero. Deterministic: same district → same trace.
 */
export function recordScLnObstacleMeetingDrive(
  districtRaw: unknown,
  name: ScLnObstacleMeetingTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_LN_OBSTACLE_MEETING_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_LN_OBSTACLE_MEETING.staged ?? [])] as StagedEventSpec[],
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
