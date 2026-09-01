/**
 * sc-pk-move-off — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Потегляне от място без оглеждане" (doc 72 PK-05
 * „Move-off without observation" / DVSA move-off top-5) on the committed
 * vp-ready-v1 straight street (map REUSED — a 360 m 1+1 street, limit 50, dry
 * day; the cockpit-family map already hosts sc-vp-readiness).
 *
 * The move-off-observation detector ships config-OFF (types.ts
 * moveOffObservationEnabled: the A12 whole-commute pulls away from rest
 * unglanced by default), so this DRILL enables it via the recorder's ruleConfig
 * override — exactly the per-lesson opt-in the config comment describes (the
 * sc-junction-scan precedent). The serialized trace bytes never depend on the
 * config; only the graded `ruleEvents` do.
 *
 * The trace gate replays exactly these through the production stack with the
 * move-off drill ENABLED:
 *   - shadow: comes to REST at the curb, glances left + over the shoulder
 *     (rear) and THEN pulls away → ZERO violations + CLEAN_DRIVING (a centered,
 *     legal ~40 km/h drive up the street);
 *   - „Без оглеждане": pulls away from rest with NO mirror/shoulder glance at
 *     all → grades EXACTLY MOVE_OFF_WITHOUT_OBSERVATION;
 *   - „Само към бордюра": glances only RIGHT (toward the curb, away from the
 *     traffic that can hit you) before moving off → EXACTLY
 *     MOVE_OFF_WITHOUT_OBSERVATION (the detector wants a mirror behind you —
 *     left OR rear — AND the shoulder check; a curb-side look is neither).
 *
 * Geometry pinned to content/world/vp-ready-v1.json: the street runs south →
 * north on x = 0, right-lane center x = 4.06, length 360 m, spawn
 * vp-spawn-approach (4.06, 15). Nothing else is on the map (no crossing,
 * junction, signal or sign) and every drive stays centered and under the limit,
 * so the ONLY thing the rule engine can grade is the move-off observation.
 */

import { SC_PK_MOVE_OFF } from "../lessons/scenario/templates-cockpit";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PK_MOVE_OFF_ID = "sc-pk-move-off";

/** Right-lane center of vp-ready-v1 (1+1 street, drawn lane 8.125 m). */
const LANE_X = 4.06;

/** The northbound run up the street, shared by every drive (rest → cruise). */
const RUN: Array<[number, number]> = [
  [LANE_X, 16],
  [LANE_X, 20],
  [LANE_X, 40],
  [LANE_X, 120],
  [LANE_X, 220],
  [LANE_X, 330],
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — rest, observe, then move off
// ---------------------------------------------------------------------------

export function scPkMoveOffShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Спрял си на банкета. Преди да потеглиш: първо огледалата и поглед през рамо." },
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "annotation", textBg: "И през рамо — мъртвата зона зад лявото рамо крие приближаваща кола или колоездач." },
      // …AND THIS STEP USED TO BE `mirror: "rear"`. The annotation above it has
      // always said „през рамо" while the recording performed the INTERIOR
      // MIRROR, because until 2026-09-01 the cabin had no shoulder check to
      // record: the authoritative demonstration of this drill demonstrated the
      // very substitution the drill exists to convict. It is the real act now.
      { kind: "glance", mirror: "shoulder" },
      { kind: "annotation", textBg: "Чисто е — потегляме плавно и се нареждаме в дясната лента." },
      { kind: "drive", points: RUN, targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Точно така се потегля от място: огледало, поглед през рамо и чак тогава движение." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Без оглеждане" (MOVE_OFF_WITHOUT_OBSERVATION)
// ---------------------------------------------------------------------------

export function scPkMoveOffMistakeNoLookScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: потегля направо от банкета, без нито едно оглеждане." },
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "annotation", textBg: "Никакво огледало, никакъв поглед през рамо — колата просто тръгва в лентата." },
      { kind: "drive", points: RUN, targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Потеглянето от място е маневра: приближаващият отзад остана невидим. Огледай се ПРЕДИ да тръгнеш." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Само към бордюра" (MOVE_OFF_WITHOUT_OBSERVATION)
// ---------------------------------------------------------------------------

export function scPkMoveOffMistakeCurbGlanceScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: поглежда само надясно, към бордюра — но опасността идва отзад-отляво." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "annotation", textBg: "Поглед към тротоара не е оглеждане за потегляне: липсват огледалото и рамото отляво." },
      { kind: "drive", points: RUN, targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Преди потегляне се гледа НАЗАД и НАЛЯВО — оттам идват колите, които могат да те ударят." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPkMoveOffTraceName = "shadow-correct" | "mistake-no-look" | "mistake-curb-glance";

const SCRIPTS: Record<ScPkMoveOffTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scPkMoveOffShadowScript },
  "mistake-no-look": { kind: "mistake", script: scPkMoveOffMistakeNoLookScript },
  "mistake-curb-glance": { kind: "mistake", script: scPkMoveOffMistakeCurbGlanceScript },
};

/**
 * Record one of the three drives against a loaded vp-ready-v1 document — the
 * move-off-observation drill ENABLED via ruleConfig (the config-gated
 * detector's per-lesson opt-in, mirrored in SC_PK_MOVE_OFF.ruleConfig so the
 * LIVE lesson grades the student's own attempt too), ambient traffic zero.
 * Deterministic: same district → same trace (rule config does not affect the
 * serialized trace bytes).
 */
export function recordScPkMoveOffDrive(
  districtRaw: unknown,
  name: ScPkMoveOffTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PK_MOVE_OFF_ID,
    kind,
    seed: 7,
    ruleConfig: { ...(SC_PK_MOVE_OFF.ruleConfig ?? {}) },
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
