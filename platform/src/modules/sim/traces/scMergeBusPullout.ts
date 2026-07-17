/**
 * sc-merge-bus-pullout — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Автобусът потегля от спирката" (ЗДвП чл. 67) on the
 * committed mg-busstop-v1 district. Ambient traffic ZERO (seed 7), dry day; the
 * ONLY staged actor is the bus of SC_MERGE_BUS_PULLOUT.staged — the shipped
 * cutInLeadCar runner, whose only SimTick event is a collision on physical
 * contact (contracts.ts). Everything else the gate asserts comes from the
 * PLAYER's own channels.
 *
 * THE ENCOUNTER (runner: CutInLeadCarRunner, actor: MGB_BUS): the box rig sits
 * in the бус лента at the спирка (x = 12.1875, arc 140) with its matchPlayer
 * target clamped to zero — a real dwell — until the player closes to ~55 m of
 * it. It then rolls out of the bay, and at arc 176 (the bay's exit, cutAt) it
 * locks an 8.5 m/s cruise and laneShift-glides 8.125 m LEFT over 2.5 s into the
 * player's lane. From there the shipped FOLLOWING_TOO_CLOSE pipeline grades what
 * the driver does with the space he was legally required to give.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: reads the halted bus early, mirror, EASES from 45 to 28 as the rig
 *     comes out, lets it in, then settles behind it in its own ~31 km/h pace →
 *     ZERO violations + CLEAN_DRIVING (the followRecoveryRateMps guard keeps the
 *     handover innocent — the gap is opening, so no episode ever sustains);
 *   - „Форсиране покрай потеглящия автобус": throttle at the pull-out instead of
 *     the lift, up to 48 (UNDER the posted 50 — nothing here may grade as
 *     speeding), contact while the rig is still mid-glide → EXACTLY COLLISION;
 *   - „Залепване зад автобуса след вливането": eases correctly, then closes to
 *     ~7 m of bumpers behind the merged bus and HOLDS it →
 *     EXACTLY FOLLOWING_TOO_CLOSE.
 *
 * HONEST PROXY (flagged, the scMergeAccelLane / scMergeLaneEnd precedent): the
 * „форсиране" consequence is an AUTHORED contact (DriveStep.collision), not a
 * physical overlap. Two reasons, both structural:
 *   1. staged actors are POINT geometry for every query (contracts.ts
 *      VehicleProfile: „the leadGap/conflict queries stay point-based"), so the
 *      12 m corpus a driver actually side-swipes while it swings out does not
 *      exist to collide with — only its center does;
 *   2. the only contact the runner CAN produce is a rear-end (centerGap < 3 m),
 *      and driving into the bus's back would take ~6 s of sub-14 m gap first —
 *      which is FOLLOWING_TOO_CLOSE, i.e. the OTHER demo. The beat lands ~1.5 s
 *      after the cut, while the rig is still crossing the lead corridor, so the
 *      forcing demo grades its own fault and nothing else.
 * The gate proves the geometry the beat depicts (throttle, not lift, with the
 * bus already coming out) and that no code but COLLISION is earned.
 *
 * Geometry pinned to content/world/mg-busstop-v1.json (meta.scenario): the
 * two-way street runs on x = 0 — бус лента (laneId 0) x = 12.1875, general lane
 * (laneId 1) x = 4.0625; the спирка window is y ∈ [130, 176]; the street ends at
 * y = 400; spawn mgb-spawn-start (4.06, 15) heading 0; urban limit 50.
 *
 * PACING LAWS the numbers obey (probed, not guessed — mg-busstop-districts
 * .test.ts re-proves each against the real reducer):
 *  - the бус лента span covers the FULL edge, so tick.busLaneRight is true on
 *    every frame: a 400 m general-lane cruise (~35 s, three times
 *    keepRightSustainSec) can never grade NOT_KEEPING_RIGHT, and the player
 *    never enters laneId 0, so DRIVING_IN_BUS_LANE can never arm either;
 *  - the bus in the bay is 8.125 m off the player's lane — beyond
 *    LEAD_CORRIDOR_M (4 m) — so leadGapM is Infinity for the whole approach:
 *    closing on a halted bus is structurally unbillable, and the following duty
 *    begins the moment the rig crosses into the corridor, ~1.3 s into its glide;
 *  - nothing brakes harder than the recorder's default 4.6 m/s², which is under
 *    harshBrakeDecelMps2 (7): the ease that lets the bus out can never read as a
 *    causeless slam (and once the rig is in the corridor it is a forward cause
 *    anyway);
 *  - every drive stays at or under 48 km/h on a 50 street — no demo here is
 *    allowed to leak SPEEDING_OVER_LIMIT into its authored codes;
 *  - the street is ONE edge, so no segment joint exists and no lane delta can be
 *    dropped inside laneChangeJointGraceSec. The player never changes lane at
 *    all: this is the merging family's one template where SOMEONE ELSE merges.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_MERGE_BUS_PULLOUT } from "../lessons/scenario/templates-merging";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MERGE_BUS_PULLOUT_ID = "sc-merge-bus-pullout";

/** mg-busstop-v1 lane centers (meta.scenario — the L7 copy truth). */
const GEN = 4.0625; // laneId 1 — the general lane; the player never leaves it
/** mg-busstop-v1 spawn (meta.scenario). */
const SPAWN: readonly [number, number] = [GEN, 15];

/** Approach cruise, under the posted 50. */
const CRUISE_KMH = 45;
/** The taught lift as the rig comes out — „намали" in numbers (чл. 67). A
 *  4.6 m/s² recorder decel from 45 is far under the harsh-brake threshold. */
const EASE_KMH = 28;
/** The bus's own locked pace once it is in the lane (8.5 m/s ≈ 31 km/h): the
 *  drive that correctly gave way settles into it. */
const BUS_PACE_KMH = 31;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — see it early, lift, let it out, follow
// ---------------------------------------------------------------------------

export function scMergeBusPulloutShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Караме в лявата, обща лента. Дясната е бус лента — в нея е спирката, и там не се кара." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [SPAWN, [GEN, 96]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "На спирката стои автобус от редовната линия. Виждаме го отдалеч — а спрелият автобус винаги означава едно: всеки момент може да потегли." },
      // Mirror BEFORE the lift, not after it: the lift is a message to the car
      // behind, and it deserves to be sent before the pedal moves.
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[GEN, 96], [GEN, 138]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Ляв мигач на автобуса — и корпусът му тръгва да излиза. В населено място решението не е наше: длъжни сме да го пропуснем (чл. 67)." },
      // The taught beat: газта надолу, не спирачката до дъно. The gap in front
      // opens, so nothing in the follow pipeline can ever sustain here.
      { kind: "drive", points: [[GEN, 138], [GEN, 176]], targetKmh: EASE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Отпуснахме газта и му отворихме мястото. Не му е нужна учтивост — нужни са му метрите пред нас." },
      { kind: "drive", points: [[GEN, 176], [GEN, 300]], targetKmh: BUS_PACE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Автобусът е в лентата, ние сме зад него на две секунди — оттук се вижда и пътят, и стоповете му." },
      { kind: "drive", points: [[GEN, 300], [GEN, 385]], targetKmh: BUS_PACE_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: видяхме го рано, пуснахме го с газта и се наредихме зад него. Загубени секунди — нула: той пак щеше да е пред нас." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Форсиране покрай потеглящия автобус" (COLLISION)
// ---------------------------------------------------------------------------

export function scMergeBusPulloutMistakeForcePastScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: автобусът вече излиза от спирката — а водачът натиска газта, „да мине преди него“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [SPAWN, [GEN, 138]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Мигачът свети, корпусът тръгва — а водачът вижда само пролуката отляво на носа му." },
      // Throttle where the lift belongs — and still UNDER the posted 50, so the
      // only thing this demo can earn is what it earns.
      { kind: "drive", points: [[GEN, 138], [GEN, 176]], targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "Дванайсет метра корпус се завъртат в лентата. От кабината, на два метра височина, водачът на автобуса не вижда точно тук." },
      { kind: "drive", points: [[GEN, 176], [GEN, 186]], targetKmh: 48, stopAtEnd: false },
      // The authored consequence: the rig is where the throttle went (see the
      // module header — the corpus a driver side-swipes is not modelled).
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.6, brake: true },
      { kind: "annotation", textBg: "Тук не се преценява — пропуска се. Няколкото „спечелени“ секунди не съществуват: автобусът пак ще е пред теб на следващия светофар." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Залепване зад автобуса след вливането"
// (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scMergeBusPulloutMistakeGlueBehindScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът пропуска автобуса коректно — и веднага залепва за него, „да си върне загубеното“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [SPAWN, [GEN, 138]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Дотук всичко е по учебник: газта надолу, автобусът излиза, мястото му е дадено." },
      { kind: "drive", points: [[GEN, 138], [GEN, 176]], targetKmh: EASE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "И тук идва сметката: „изгубих време заради него“. Газ — и на няколко метра зад дванайсеттонната задница." },
      // ONE continuous step at 34 against the bus's ~31: the cushion the driver
      // was legally handed (~23 m) is eaten at ~0.9 m/s, down to a couple of car
      // lengths — and never to contact. Deliberately a SINGLE speed: the
      // recovery-rate guard reads the gap's RATE, so ANY lift on the way (even
      // a 40 → 31 settle) opens the gap for a moment, resets the episode and
      // bills a SECOND time. Continuous tailgating is ONE episode
      // (stepEpisode's `reset = !tailgating` contract), so this demo grades
      // FOLLOWING_TOO_CLOSE exactly once — which is what the §9 assert needs.
      { kind: "drive", points: [[GEN, 176], [GEN, 382]], targetKmh: 34 },
      { kind: "annotation", textBg: "Зад автобус на две коли разстояние не се вижда нищо: нито платното, нито пешеходецът пред него, нито собствените му стопове навреме." },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Пропускането не е услуга, за която да си вземеш ресто. Две секунди зад автобуса са единственото място, от което можеш да реагираш." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScMergeBusPulloutTraceName =
  | "shadow-correct"
  | "mistake-force-past"
  | "mistake-glue-behind";

const SCRIPTS: Record<
  ScMergeBusPulloutTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scMergeBusPulloutShadowScript },
  "mistake-force-past": { kind: "mistake", script: scMergeBusPulloutMistakeForcePastScript },
  "mistake-glue-behind": { kind: "mistake", script: scMergeBusPulloutMistakeGlueBehindScript },
};

/**
 * Record one of the three drives against a loaded mg-busstop-v1 document — the
 * TEMPLATE's staged bus armed (single truth), ambient traffic zero (the harness
 * law). Deterministic: same district → same trace.
 */
export function recordScMergeBusPulloutDrive(
  districtRaw: unknown,
  name: ScMergeBusPulloutTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MERGE_BUS_PULLOUT_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_MERGE_BUS_PULLOUT.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
