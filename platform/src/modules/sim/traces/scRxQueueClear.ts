/**
 * sc-rx-queue-clear — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Не стъпвай на релсите без изход" (RX-03) on the
 * committed rx-guarded-v1 district, recorded with the template's OWN staged
 * queue tail (brakingLeadCar sc-rxq-tail — single truth, imported from the
 * template). The tail rests at y = 166 (ten meters past the far rail) and
 * rolls 32 s after the player first comes to rest.
 *
 * THE CLOCK (why every step's timing is load-bearing): the barrier timetable
 * is WORLD DATA — down [0, 40) of every 90 s. All three drives therefore make
 * their band entry inside the OPEN window [40, 90), so „entered-barred" can
 * never fire and the ONLY rail arm in play is the rest-ON-tracks one. The
 * shared spine is: approach at 28 km/h → stop at the line (y = 146) at t ≈ 20
 * → the queue tail's runner resolves on that stop → the tail rolls at t ≈ 52.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: waits out the barrier AND the queue at the line, crosses at
 *     t ≈ 57 in one move behind the departing tail → ZERO violations +
 *     CLEAN_DRIVING;
 *   - „Спиране върху релсите зад колоната": after the lift (t ≈ 42) creeps
 *     onto the band and stops at y = 153 with the tail still halted 8.9 m
 *     ahead → EXACTLY RAIL_CROSSING_VIOLATION, once, detail "stopped-on-track"
 *     (the gap is far too wide for the standstill code — one fault, one bill);
 *   - „Залепване зад спрелия на сантиметри": crosses cleanly after the lift
 *     and pulls up to y = 160.8 — 4.8 m CLEAR of the band, 1.1 m off the
 *     tail's bumper → EXACTLY STANDSTILL_GAP_TOO_CLOSE (no rail code: the
 *     transit never rests on the band, and чл. 52 asks no stop of a
 *     guarded-open crossing).
 *
 * Geometry pinned to content/world/rx-guarded-v1.json: a 1+1 street on x = 0,
 * lane center x = 4.06, band [150, 156], stop line y = 145, barrier down
 * [0, 40) of 90 s, spawn rxg-spawn-start (4.06, 15) heading north, 300 m,
 * limit 50. The standstill detector reads the RECORDER's leadGapM (bumper gap
 * = 166 − playerY − 4.1 m), so the shadow rests at y = 146 (~15.9 m), the
 * rails demo at y = 153 (~8.9 m) and the kiss at y = 160.8 (~1.1 m).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_RX_QUEUE_CLEAR } from "../lessons/scenario/templates-rail2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_RX_QUEUE_CLEAR_ID = "sc-rx-queue-clear";

/** The single northbound lane center of rx-guarded-v1. */
const X_LANE = 4.06;
/** The stop-line rest pose: nose short of the band, center 4 m before it. */
const Y_HOLD = 146;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — wait for the EXIT, not for the barrier
// ---------------------------------------------------------------------------

export function scRxQueueClearShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред е охраняем жп прелез (А34) — а отвъд релсите се е образувала колона." },
      { kind: "glance", mirror: "rear" },
      // Arrive at the stop line ~t = 20 s: the barrier is still down, and the
      // queue tail is halted 20 m ahead, just beyond the far rail.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, Y_HOLD]], targetKmh: 28 },
      { kind: "annotation", textBg: "Спри зад стоп-линията — пред теб са релсите, а мястото отвъд тях е заето." },
      // The wait outlasts BOTH gates: the lift (t = 40) and the queue (t ≈ 52).
      { kind: "pause", sec: 35, brake: true },
      { kind: "annotation", textBg: "Бариерата е вдигната, но колоната още стои — вдигната бариера не значи „влез“." },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Колоната се отлепи и отсрещната страна е свободна: сега преминаваш — на едно движение." },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, Y_HOLD], [X_LANE, 190]], targetKmh: 25, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 190], [X_LANE, 283]], targetKmh: 32 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: решението е взето ПРЕДИ релсите — има ли отсреща място за цялата кола." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Спиране върху релсите зад колоната"
// (RAIL_CROSSING_VIOLATION, detail "stopped-on-track")
// ---------------------------------------------------------------------------

export function scRxQueueClearMistakeStopOnRailsScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „бариерата се вдигна — значи тръгвам“, макар отсреща да няма място." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, Y_HOLD]], targetKmh: 28 },
      // Wait out the barred window only (t 20 → 42) — the queue is still there.
      { kind: "pause", sec: 22, brake: true },
      { kind: "annotation", textBg: "Бариерата се вдигна… но колоната отвъд релсите не е помръднала." },
      // Creep onto the band (entry ~t 44.6) and freeze mid-track at y = 153.
      { kind: "drive", points: [[X_LANE, Y_HOLD], [X_LANE, 153]], targetKmh: 8 },
      { kind: "annotation", textBg: "И колата остава там, където никога не се спира: между релсите, без изход напред." },
      // Rest ON the band: 14 s ≫ the 2 s sustain — one bill, once.
      { kind: "pause", sec: 14, brake: true },
      { kind: "annotation", textBg: "Ако сега бариерата тръгне надолу, изход няма — влакът спира след километър и не завива." },
      { kind: "drive", points: [[X_LANE, 153], [X_LANE, 283]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "На прелеза се влиза само когато отсрещната страна е свободна (чл. 52–53)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Залепване зад спрелия на сантиметри"
// (STANDSTILL_GAP_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scRxQueueClearMistakeBumperKissScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: прелезът е преминат правилно, но колата спира опряна в предната." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, Y_HOLD]], targetKmh: 28 },
      // Wait out the barred window (t 20 → 42), then cross while the tail
      // still stands — the transit itself is lawful (чл. 52: guarded + open).
      { kind: "pause", sec: 22, brake: true },
      { kind: "annotation", textBg: "След вдигането колата преминава коловоза без спиране — дотук всичко е наред." },
      // Entry ~t 43.7 (3.7 s into the open window), band cleared at ~14 km/h,
      // rest 4.8 m past the far rail and 1.1 m off the tail's bumper.
      { kind: "drive", points: [[X_LANE, Y_HOLD], [X_LANE, 160.8]], targetKmh: 14 },
      { kind: "annotation", textBg: "…но спира на сантиметри от бронята на предния — без нито метър резерв." },
      // The glue outlasts the 1.5 s sustain (bills ~t 48.4) and the demo ends
      // before the tail rolls at t ≈ 51.7 — the picture stays the frozen kiss.
      { kind: "pause", sec: 4, brake: true },
      { kind: "annotation", textBg: "Дистанцията при спиране е изходът ти — на прелез тя е разликата между живот и смърт." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRxQueueClearTraceName =
  | "shadow-correct"
  | "mistake-stop-on-rails"
  | "mistake-bumper-kiss";

const SCRIPTS: Record<
  ScRxQueueClearTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scRxQueueClearShadowScript },
  "mistake-stop-on-rails": { kind: "mistake", script: scRxQueueClearMistakeStopOnRailsScript },
  "mistake-bumper-kiss": { kind: "mistake", script: scRxQueueClearMistakeBumperKissScript },
};

/**
 * Record one of the three drives against a loaded rx-guarded-v1 document — the
 * TEMPLATE's staged queue tail armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScRxQueueClearDrive(
  districtRaw: unknown,
  name: ScRxQueueClearTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_RX_QUEUE_CLEAR_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_RX_QUEUE_CLEAR.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
