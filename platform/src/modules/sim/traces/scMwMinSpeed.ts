/**
 * sc-mw-min-speed — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Магистрален ритъм — не пълзи" (SP-10 + OV-11) on the
 * committed mw-v1 district (divided 2+2 posted 140, each carriageway an
 * emergency curb lane + 2 travel lanes). ONE staged actor (the flow car —
 * MWM_FLOW_CAR in templates-speed2.ts), ambient traffic ZERO (seed 7), dry
 * daylight.
 *
 * The two mistake demos differ by EXACTLY ONE variable — the lane. Both crawl
 * at the same authored 40 km/h:
 *   - mistake-crawl-right (x = 0, laneId 1): DRIVING_TOO_SLOW_FOR_MOTORWAY;
 *   - mistake-crawl-left  (x = −8.12, laneId 2): that PLUS NOT_KEEPING_RIGHT.
 * Holding the speed fixed is what makes the second code attributable to the
 * lane alone — the whole reason this template exists next to sc-mw-discipline.
 *
 * THE STAGED ACTOR'S CLOCK (why the left-lane demo is the SHORT one):
 * the flow car holds at (0, 2), 13 m behind the spawn, and releaseGapM 8 is
 * under that — so it releases on frame 1 and, since 13 m is already inside the
 * latch window (followBehindM 26 + 4), it latches immediately too. pressureSec
 * therefore runs from t ≈ 0 in EVERY drive and the pass commits at a shared
 * t ≈ 28 s. The pass is a laneShift into the LEFT lane, so:
 *   - shadow (43.8 s) and mistake-crawl-right (43.0 s) run past it and the
 *     pass plays out in full into an empty overtaking lane — the beat the
 *     cards describe („трябваше да излиза отляво, за да се измъкне"); the
 *     encounter resolves at t ≈ 36.2 / 34.3 respectively;
 *   - mistake-crawl-left is authored to END at t ≈ 20.5, long before the
 *     commit, so the actor is never commanded into the lane the player is
 *     occupying. That is not a workaround dressed as a story — it IS the
 *     story: nobody gets past a crawler who is sitting in the overtaking lane.
 * The deadline is MEASURED, not assumed: a probe drive that crawled the left
 * lane for 66 s put the flow car level with the player (leadGapM 0) at
 * t = 31.8. The demo ends 11.3 s earlier. The gate PROVES the margin held
 * structurally — tick.leadGapM stays non-finite for the whole demo ⇒ no
 * vehicle ever entered the player's 4 m lead corridor, and the encounter
 * never resolves ⇒ the pass never completed.
 * Both codes of the left-lane demo are in the bank well before that: the crawl
 * needs motorwaySlowSustainSec 4 on a plateau that starts at t ≈ 5 (fires at
 * t = 9.03), keep-right needs keepRightSustainSec 12 from the first moving
 * frame (fires at t = 12.62). ~8 s of tail, asserted on the gate.
 *
 * WHY THE FLOW CAR NEVER EXEMPTS THE CRAWL: the motorway-slow detector is
 * innocent while a lead sits within motorwaySlowQueueGapM (60 m) — congestion
 * is not a crawl. The flow car is BEHIND for the whole pressure phase (never a
 * lead), and once it passes it rides the LEFT lane, 8.125 m off the player's
 * axis — outside traffic/system.ts's 4 m LEAD_CORRIDOR_M. So it is never a
 * lead in any drive, and the conviction stays honest (the backlog's own
 * „keep the drill corridor congestion-free" flag).
 *
 * RECORDER SPEED HONESTY (traces/recorder.ts — no top-speed cap; only the
 * authored targetKmh, accel 2.2 m/s² and the curve cap a straight never
 * triggers): the authored 110 records its real speed, and the crawl/brake
 * transitions ride |a| ≈ 2.2–4.6 m/s², far above the crawl detector's 0.5
 * steady band — only the held plateaus grade (the A12 transition exemption).
 *
 * Geometry pinned to content/world/mw-v1.json (meta.scenario): northbound
 * carriageway on x = 0 — cruise lane (laneId 1) center x = 0, left lane
 * (laneId 2) x = -8.12, emergency lane (laneId 0) x = 8.13; spawn
 * mw-spawn-approach (0, 15) heading north; limit 140; length 1000.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_MW_MIN_SPEED } from "../lessons/scenario/templates-speed2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MW_MIN_SPEED_ID = "sc-mw-min-speed";

/** mw-v1 northbound lane centers (meta.scenario — the L7 copy truth). */
const X_CRUISE = 0;
const X_LEFT = -8.12;
/** The authored crawl — one speed, two lanes (the template's single variable). */
const CRAWL_KMH = 40;
/** The authored flow-speed cruise: well under the posted 140, well over чл. 54's line. */
const FLOW_KMH = 110;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scMwMinSpeedShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Автомагистрала, ограничение 140. Целта не е таванът, а ритъмът на потока — в дясната лента за движение." },
      { kind: "glance", mirror: "rear" },
      // Confident acceleration to flow speed in the RIGHT travel lane. Passes
      // the sc-mwms-join gate (0, 300) already established at 110.
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 340]], targetKmh: FLOW_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Установени 110 км/ч — далеч под тавана и точно в ритъма. Дясната лента е нашата." },
      { kind: "glance", mirror: "rear" },
      // Through the sc-mwms-hold gate (0, 640). The flow car's pass commits
      // around here (t ≈ 28) — it goes left, we hold our lane and our speed.
      { kind: "drive", points: [[X_CRUISE, 340], [X_CRUISE, 700]], targetKmh: FLOW_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата зад нас иска по-бързо — изпреварва отляво и си отива. Не ускоряваме заради нея и не спираме да ѝ правим път: държим ритъма." },
      { kind: "drive", points: [[X_CRUISE, 700], [X_CRUISE, 955]], targetKmh: FLOW_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: ритъм на потока, дясна лента, нула излишни маневри — така магистралата остава предсказуема за всички." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Пълзене с 40 в активната лента"
//                  (DRIVING_TOO_SLOW_FOR_MOTORWAY)
// ---------------------------------------------------------------------------

export function scMwMinSpeedMistakeCrawlRightScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата запълзява с 40 км/ч по свободна магистрала — лентата е вярната, скоростта не е." },
      { kind: "glance", mirror: "rear" },
      // The held causeless crawl in the RIGHT travel lane. Transitions
      // (accelerating to 40, braking at the end) stay exempt by |a|; only the
      // plateau grades, once. It clears sc-mwms-join (0, 300) — the crawler is
      // in the right lane; it is the RHYTHM that is wrong.
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 200]], targetKmh: CRAWL_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Потокът тук се движи със 120–140: разликата от 80–100 км/ч е самата опасност — те те застигат почти като неподвижно препятствие." },
      { kind: "drive", points: [[X_CRUISE, 200], [X_CRUISE, 320]], targetKmh: CRAWL_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Виж зад себе си: колата, която идваше с магистрална скорост, вече е свалена до твоите 40. Твоето пълзене стана и нейно." },
      { kind: "drive", points: [[X_CRUISE, 320], [X_CRUISE, 430]], targetKmh: CRAWL_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Тя се измъкна отляво. Общ минимум няма, но чл. 54 пуска тук само коли, способни на над 50 — по-бавното е препятствие по конструкция." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Пълзене с 40, и то в лявата лента"
//                  (DRIVING_TOO_SLOW_FOR_MOTORWAY + NOT_KEEPING_RIGHT)
// ---------------------------------------------------------------------------

export function scMwMinSpeedMistakeCrawlLeftScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: същите 40 км/ч, но в ЛЯВАТА лента — при напълно свободна дясна." },
      { kind: "glance", mirror: "rear" },
      // The SAME crawl, one lane over: laneId 2 with no left indicator and the
      // right travel lane free the whole way ⇒ keep-right bills on top of the
      // crawl. Deliberately the SHORT demo — it ends at t ≈ 20.5 s, while the
      // flow car's pass does not commit until t ≈ 28 and could not reach this
      // lane before t ≈ 31.8 (measured; see the module header). Both codes are
      // in the bank by t = 12.62.
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 110]], targetKmh: CRAWL_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Двойна сметка: бавен си И заемаш лентата за изпреварване. Дясната лента е празна — там ти е мястото." },
      { kind: "drive", points: [[X_LEFT, 110], [X_LEFT, 180]], targetKmh: CRAWL_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Колата зад теб остана заклещена: пълзящият в лявата лента не просто пречи — той спира изпреварването изобщо." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScMwMinSpeedTraceName =
  | "shadow-correct"
  | "mistake-crawl-right"
  | "mistake-crawl-left";

const SCRIPTS: Record<
  ScMwMinSpeedTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scMwMinSpeedShadowScript },
  "mistake-crawl-right": { kind: "mistake", script: scMwMinSpeedMistakeCrawlRightScript },
  "mistake-crawl-left": { kind: "mistake", script: scMwMinSpeedMistakeCrawlLeftScript },
};

/**
 * Record one of the three drives against a loaded mw-v1 document — dry
 * daylight, the template's own staged flow car, ambient traffic zero.
 * Deterministic: same district → same trace.
 */
export function recordScMwMinSpeedDrive(
  districtRaw: unknown,
  name: ScMwMinSpeedTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MW_MIN_SPEED_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_MW_MIN_SPEED.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
