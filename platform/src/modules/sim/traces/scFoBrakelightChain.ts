/**
 * sc-fo-brakelight-chain — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Стоповете два автомобила напред" (FO-05 +
 * FO-01, the two-car chain) on the committed fo-brake-v1 district, recorded
 * with the template's OWN staged actors (cutInLeadCar sc-fbc-mid + brakingLead
 * Car sc-fbc-head — single truth, imported from the template). Ambient traffic
 * ZERO (seed 7): the ONLY actors are the two chain cars.
 *
 * The choreography (runners: CutInLeadCarRunner + BrakingLeadCarRunner):
 *   - sc-fbc-mid paces the player's OWN lane pinned ~19 m of centers ahead
 *     (≈ 14.9 m of bumpers — the gap the rule engine reads, since leadGapFor
 *     takes the NEAREST vehicle in the corridor);
 *   - sc-fbc-head paces ~46 m ahead — visible over the middle car, never
 *     reachable past it — and brake-slams at y = 258, i.e. with the player at
 *     ~212. THAT is the stimulus: brake lights two cars ahead;
 *   - the middle car "reacts" ~12 m later (it reaches its cutAt y = 244 with
 *     the player at ~225) by locking a 1 m/s crawl — but ONLY if the player is
 *     STILL above 33 km/h there. A player who read the head's lights is already
 *     slower than that, so the shadow never triggers it at all.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: 26 km/h behind the pinned ~14.9 m (≈ 2.1 s), lifts AT the head's
 *     slam, rolls to rest ~30 m short of the stopped chain → ZERO violations +
 *     CLEAN_DRIVING, then resumes with the queue to the finish;
 *   - „Гледане само в бронята отпред": the SAME pinned metres at 48 km/h
 *     (≈ 1.1 s) → grades EXACTLY FOLLOWING_TOO_CLOSE. The head's slam never
 *     enters the picture — which is the whole point of the demo;
 *   - „Късно пълно спиране до сблъсък": a legal 38 km/h approach (the pinned
 *     gap is INNOCENT at that speed — no following code), but no lift at the
 *     head's lights → the middle car's own panic fires → rear-ends it →
 *     grades EXACTLY COLLISION.
 *
 * Geometry pinned to content/world/fo-brake-v1.json: a 1+1 straight street on
 * x = 0, right-lane center x = 4.06, spawn fo-spawn-approach (4.06, 15) heading
 * north, 420 m long, limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_FO_BRAKELIGHT_CHAIN } from "../lessons/scenario/templates-following2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_FO_BRAKELIGHT_CHAIN_ID = "sc-fo-brakelight-chain";

/** Northbound right-lane center of fo-brake-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — read the head's lights, lift early
// ---------------------------------------------------------------------------

export function scFoBrakelightChainShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пред теб е колона от две коли — дръж 2 секунди и гледай през предния, не в него." },
      { kind: "glance", mirror: "rear" },
      // Calm 26 km/h behind the pinned ~14.9 m: ~2.1 s of gap — the taught
      // posture. Carry it up to the head's slam (head reaches y = 258 with the
      // player at ~212).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 212]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "Стоповете на ПЪРВАТА кола светнаха — вдигни газта веднага, преди твоят преден да е реагирал." },
      // The lift lands the player at rest well short of the stopped chain — and
      // below the middle car's 33 km/h panic gate, so its cut never fires.
      { kind: "drive", points: [[X_LANE, 212], [X_LANE, 224]], targetKmh: 26, stopAtEnd: true },
      { kind: "pause", sec: 4.5, brake: true },
      { kind: "annotation", textBg: "Спря плавно зад колоната — предупреждението дойде цяла кола по-рано." },
      // The head resolved and drove on (resumeAfterSec 3) — the queue rolls.
      { kind: "drive", points: [[X_LANE, 224], [X_LANE, 300], [X_LANE, 380]], targetKmh: 26 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: погледът напред ти даде секундите, дистанцията — метрите." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Гледане само в бронята отпред" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFoBrakelightChainMistakeBumperStareScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: поглед, залепен в бронята на предния — и дистанция под секунда и половина." },
      { kind: "glance", mirror: "rear" },
      // The SAME pinned metres as the shadow, at 48 km/h: ~1.1 s. The stare
      // never reaches the head, so the drive never reaches its slam either.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 190]], targetKmh: 48, stopAtEnd: true },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Петнайсет метра на 48 км/ч е под секунда и половина — а предупреждението беше цяла кола по-напред." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Късно пълно спиране до сблъсък" (COLLISION)
// ---------------------------------------------------------------------------

export function scFoBrakelightChainMistakeLateBrakeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: дистанцията е приемлива, но погледът не стига по-далеч от предната кола." },
      { kind: "glance", mirror: "rear" },
      // A LEGAL 38 km/h behind the same pinned gap — innocent on its own. The
      // head slams at player ~212 and the driver does not lift: at player ~225
      // the middle car's own panic fires (still above the 33 km/h gate).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 238]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Средната кола се закова — научи за спирането едва от нейните стопове." },
      // The full brake arrives with no metres left: a 12 m/s² stab that only
      // starts once the gap is already gone. It lands ~4 m late.
      { kind: "drive", points: [[X_LANE, 238], [X_LANE, 252]], targetKmh: 38, stopAtEnd: true, maxDecelMps2: 12 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Удар отзад: гледаш ли през колоната, спираш с крак; гледаш ли в бронята — с бронята." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Honesty probe (gate-only, never committed as a demo) — the panic slam
// ---------------------------------------------------------------------------

/**
 * The bumper-starer's OTHER flavor: a full panic slam the moment the middle car
 * lights up. A lead inside 45 m IS a forward cause in the harsh-brake ledger
 * (rules/engine.ts noBrakeCause), so HARSH_BRAKING_NO_CAUSE honestly must NOT
 * fire here — the sc-follow-cutin precedent verbatim. The gate replays this
 * probe and asserts the code is absent: no shipped code grades the panic stop
 * behind a chain, which is exactly why the committed demo pair is a gap demo
 * and a contact demo instead.
 */
export function scFoBrakelightChainProbePanicSlamScript(): DriveScript {
  return {
    steps: [
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 226]], targetKmh: 38, stopAtEnd: false },
      // The slam: a 12 m/s² envelope down to a dead stop behind the crawling
      // middle car.
      { kind: "drive", points: [[X_LANE, 226], [X_LANE, 240]], targetKmh: 38, maxDecelMps2: 12 },
      { kind: "pause", sec: 2, brake: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScFoBrakelightChainTraceName =
  | "shadow-correct"
  | "mistake-bumper-stare"
  | "mistake-late-brake";

const SCRIPTS: Record<
  ScFoBrakelightChainTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scFoBrakelightChainShadowScript },
  "mistake-bumper-stare": { kind: "mistake", script: scFoBrakelightChainMistakeBumperStareScript },
  "mistake-late-brake": { kind: "mistake", script: scFoBrakelightChainMistakeLateBrakeScript },
};

/**
 * Record one of the three drives against a loaded fo-brake-v1 document — the
 * TEMPLATE's staged chain armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScFoBrakelightChainDrive(
  districtRaw: unknown,
  name: ScFoBrakelightChainTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_FO_BRAKELIGHT_CHAIN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_FO_BRAKELIGHT_CHAIN.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}

/** Record the gate-only panic-slam probe (never serialized/committed). */
export function recordScFoBrakelightChainPanicSlamProbe(districtRaw: unknown): RecordedDrive {
  return recordScriptedDrive(districtRaw, scFoBrakelightChainProbePanicSlamScript(), {
    scenarioId: SC_FO_BRAKELIGHT_CHAIN_ID,
    kind: "mistake",
    seed: 7,
    stagedEvents: [...(SC_FO_BRAKELIGHT_CHAIN.staged ?? [])] as StagedEventSpec[],
  });
}
