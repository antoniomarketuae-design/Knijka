/**
 * sc-roundabout-entry — the authored drives (doc 76 §5/§9): ONE correct
 * shadow demonstration + TWO mistake demos for „Кръгово движение" on the
 * committed rb-mini-v1 district, recorded with the template's OWN staged
 * circulating car (roundaboutEntry sc-rb-circulating — single truth,
 * imported from the template). The trace gate replays exactly these through
 * the production stack:
 *   - shadow: ZERO violations + the YIELDED_TO_PRIORITY commendation
 *     (waited the circulator out) + the roundabout objective completes;
 *   - „Влизане без пропускане" grades EXACTLY FAILED_TO_YIELD (the runtime's
 *     roundabout tracker, on what the circulating car HAD TO DO: the demo
 *     rolls over the give-way line without stopping, right in front of it, and
 *     the car brakes — founder ruling 2026-10-05, see BARGE_* below. It carries
 *     a right indicator so its ONLY graded fault is the priority);
 *   - „Излизане без десен мигач" grades EXACTLY TURN_WITHOUT_INDICATOR (the
 *     runtime's turn detector at the north exit joint — the honest existing
 *     code for RB-02; the L3 roundabout OBJECTIVE additionally voids such a
 *     traversal, proven in the bot suite).
 *
 * Geometry pinned to content/world/rb-mini-v1.json: ring centerline R = 18
 * around (0, 0), CCW; arm right-lane centers x = ±4.06 / y = ±4.06; south
 * spawn (4.06, −93) heading north; ring limit 30, arms 40.
 *
 * Two runtime windows must BOTH stay closed for the shadow, and they pull
 * opposite ways (worked out against the live circulator trajectory):
 *  · FAILED_TO_YIELD (roundabout tracker). HISTORY: it used to fire if a
 *    circulating car was on the driver's LEFT while he was still entering, and
 *    the BRISK flat-chord entry below (17 km/h, a nearly-straight NE line that
 *    sweeps 35° of azimuth with only ~40° of heading change) was authored to
 *    keep the 2.9 m/s car on his RIGHT until ring priority was held. Since the
 *    founder ruling of 2026-10-05 it fires only when a circulating car has to
 *    BRAKE because of the entry (or is touched) — and this drive enters behind
 *    the car it waited for, so nothing does. The chord is kept as authored.
 *  · COLLISION (rear-end): the driver circulates FASTER than the crawling
 *    car and would catch it at the north exit. Closed by MATCHED circulation
 *    (12 km/h ≈ the car's 2.9 m/s) after priority is won — the driver trails
 *    the car a constant arc and exits a full arc behind it.
 * Turn detector: turnStarted fires at |Σ heading deltas| > 55° over a sliding
 * 3 s window in a junction area. Circulation at 12 km/h on R = 18 is ~11°/s
 * (window ≈ 33° — never fires); the flat-chord entry's low heading change
 * never fires either; the no-signal EXIT demo deliberately swings ~70° at a
 * tight radius so the detector DOES fire — with no indicator, the graded
 * fault, and nothing else.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_ROUNDABOUT_ENTRY } from "../lessons/scenario/templates-flow";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_ROUNDABOUT_ENTRY_ID = "sc-roundabout-entry";

/** South-arm northbound lane center (2-lane arm, drawn lane 8.125 m). */
const X_LANE = 4.06;
/** Ring centerline radius (rb-mini-v1 meta.scenario). */
const R = 18;

/** Ring point at circulation angle φ (degrees from the SOUTH node, CCW
 * through EAST): (R sin φ, −R cos φ). */
function ring(phiDeg: number): [number, number] {
  const a = (phiDeg * Math.PI) / 180;
  return [R * Math.sin(a), -R * Math.cos(a)];
}

/** Sampled ring run φ0 → φ1 (CCW, 10° steps). */
function ringRun(phi0: number, phi1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let p = phi0; p <= phi1; p += 10) out.push(ring(p));
  return out;
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scRoundaboutEntryShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Приближаваме кръговото — намали отрано и гледай наляво." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60]], targetKmh: 30, stopAtEnd: false },
      {
        // Ease to a stop at the yield line (just inside the decision zone).
        kind: "drive",
        points: [[X_LANE, -60], [X_LANE, -40], [X_LANE, -27.5]],
        targetKmh: 16,
      },
      { kind: "annotation", textBg: "Кола се движи в кръга — тя е с предимство. Спри и я пропусни." },
      { kind: "glance", mirror: "left" },
      // Wait the circulator fully PAST the mouth and onto the east arc (to the
      // driver's RIGHT) before committing. With the car at cruise 3 m/s this
      // is ~7.5 s — long enough that the ring joint's right-hand-rule watch
      // no longer sees it crossing the mouth, and it sits on the east/SE arc
      // (the driver's right, never a give-way conflict) for the whole entry.
      { kind: "pause", sec: 9.0, brake: true },
      { kind: "annotation", textBg: "Тя премина — влизаме плътно след нея, в нейния интервал." },
      { kind: "glance", mirror: "left" },
      {
        // FLAT-CHORD entry (the innocent-entry envelope): a nearly-straight
        // NE line from the mouth to ~ring(48) rather than a tight ring-hugging
        // arc. This sweeps the azimuth-from-centre past RB_ON_RING_DEG (35°)
        // — the tracker's ring-priority stand-down — with only ~40° of TOTAL
        // heading change (well under the 55° turn-detector window), so it is
        // both quick to priority AND indicator-free-clean. Reaching stand-down
        // in ~3 s closes the FAILED_TO_YIELD window before the slow circulator
        // can loop onto the driver's left band.
        kind: "drive",
        points: [
          [X_LANE, -27.5],
          [6.0, -23.0],
          [8.5, -18.5],
          [11.0, -15.0],
          ring(48),
          ring(55),
        ],
        targetKmh: 17,
        stopAtEnd: false,
      },
      {
        // Circulate the east side to φ = 120° at a MATCHED pace (12 km/h ≈
        // the circulator's 2.9 m/s). The brisk entry above already bought ring
        // priority; holding this speed keeps the driver a constant arc BEHIND
        // the car for the whole loop, so it is never overtaken and rear-ended
        // at the north exit — the collision a faster circulation caused.
        kind: "drive",
        points: ringRun(60, 120),
        targetKmh: 12,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Преди твоя изход: десен мигач — обяви, че напускаш кръга." },
      { kind: "indicator", setting: "right" },
      {
        // Ring to φ = 150°, then the gentle exit blend onto the north arm.
        kind: "drive",
        points: [...ringRun(120, 150), [6.4, 20.5], [4.9, 25], [4.06, 30], [4.06, 40], [4.06, 52]],
        targetKmh: 12,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: пропусна кръга, влезе в интервал и излезе с десен мигач." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Влизане без пропускане" (FAILED_TO_YIELD)
// ---------------------------------------------------------------------------

/**
 * THE BARGE, RE-STAGED SO THAT IT REALLY CUTS THE CAR OFF (founder ruling
 * 2026-10-05, «bill forced braking»: „The lesson own "barge" demo gets
 * re-staged so it really cuts someone off").
 *
 * WHAT WAS WRONG WITH THE OLD ONE. It came through the mouth at 22 км/ч with
 * the staged car ~17 m behind its merge point, doing 2.9 m/s. A car going
 * twice the pace of the one behind it forces nothing: the crawler never had to
 * touch its brake, and the demo was «a priority fault» only because the grader
 * of the day convicted on where a car WAS. Judged by what happened — the
 * ruling — that drive is an entry nobody paid for, and it is no longer billed.
 *
 * WHAT A REAL ONE IS, on this ring. The circulator crawls at 2.9 m/s and its own
 * player guard (traffic/staged.ts step 2) starts braking for a body closer
 * than 9.6 m ahead of it. So a cut-off that does not depend on centimetres is
 * an entry AHEAD of the car by a driver who is then SLOWER than it: the car
 * closes on him for as long as he is in its way. That is also the commonest
 * real one — not a sprint through the mouth, but a driver who comes up fast,
 * dabs the brake, sees «enough room» and ROLLS over the give-way line without
 * stopping, in front of a car that is already there.
 *
 * THE TWO NUMBERS, both centred in MEASURED bands (the live chain, every rung
 * L1–L5, with the staged car's phase pushed ±3 m on top of its own seeded
 * jitter — 15 worlds per cell):
 *
 *   BARGE_BRAKE_Y   where the 26 км/ч approach ends and the roll begins.
 *                   −36 / −34 / −32 all work; −34 is the middle. It has to be
 *                   LATE: the runner syncs the car to the driver's ETA until
 *                   he is 14 m from the mouth, and a driver who slows early
 *                   lets it run past its station and sprint (a different,
 *                   unsteady choreography — measured, and avoided).
 *   BARGE_ROLL_KMH  the roll. 6–9 км/ч convicts on forced braking alone in
 *                   15 of 15 worlds; 5 and below the car arrives first and the
 *                   demo becomes a collision, 10 and above the driver gets
 *                   away ahead of it. 7.5 is the middle.
 *
 * Measured at these values: the nose is on the ring at t ≈ 13.7, the car has
 * shed the 0.3 m/s that convicts 1.0–2.7 s later and ~1.8 m/s by the time the
 * entry is over; nearest approach 6.1 m, no contact, no other fault.
 */
const BARGE_BRAKE_Y = -34;
const BARGE_ROLL_KMH = 7.5;

export function scRoundaboutEntryMistakeBargeScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: колата влиза в кръга, без да пропусне движещия се в него.",
      },
      { kind: "glance", mirror: "rear" },
      // The barger signals right (correct form — it takes the first exit),
      // so the ONLY graded fault is the refused priority.
      { kind: "indicator", setting: "right" },
      {
        // Up the arm at speed, and LATE on the brake (see BARGE_BRAKE_Y).
        kind: "drive",
        points: [[X_LANE, -93], [X_LANE, -60], [X_LANE, BARGE_BRAKE_Y]],
        targetKmh: 26,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Колата в кръга приближава отляво… но нашата не спира." },
      {
        // The roll: over the give-way line without stopping and onto the ring
        // right in front of the circulating car, slower than it — so the car
        // HAS to brake (the graded moment, ~1–3 s after the nose is on the
        // ring). The demo freezes on the early ring right after it: driving on
        // with the cut-off car on the bumper would only stack unrelated noise
        // on top of the ONE taught mistake.
        kind: "drive",
        points: [
          [X_LANE, BARGE_BRAKE_Y],
          [X_LANE, -26],
          [5.4, -21.5],
          [7.4, -18.3],
          ...ringRun(30, 40),
        ],
        targetKmh: BARGE_ROLL_KMH,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Влизащият НЯМА предимство: на входа стои Б1/Б2 (Б3 не се поставя там — Наредба № РД-02-21-1/23.11.2023 за пътните знаци), значи пропускаш движещите се в кръга (ЗДвП чл. 50, ал. 1) — дори с цената на пълно спиране.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Излизане без десен мигач" (TURN_WITHOUT_INDICATOR)
// ---------------------------------------------------------------------------

export function scRoundaboutEntryMistakeNoSignalScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Този път входът е правилен — гледай какво се обърква на изхода.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60]], targetKmh: 30, stopAtEnd: false },
      {
        kind: "drive",
        points: [[X_LANE, -60], [X_LANE, -40], [X_LANE, -27.5]],
        targetKmh: 16,
      },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 9.0, brake: true },
      { kind: "glance", mirror: "left" },
      {
        // The SAME clean brisk flat-chord entry as the shadow (the entry is
        // not the fault here) — reaches ring priority while the circulator is
        // still on the driver's right, so this demo carries NO entry violation…
        kind: "drive",
        points: [
          [X_LANE, -27.5],
          [6.0, -23.0],
          [8.5, -18.5],
          [11.0, -15.0],
          ring(48),
          ring(55),
        ],
        targetKmh: 17,
        stopAtEnd: false,
      },
      {
        // …then the SAME matched-pace (12 km/h) circulation as the shadow, so
        // the driver stays a constant arc BEHIND the car and never rear-ends
        // it — the only difference from the shadow is what happens at the exit.
        kind: "drive",
        points: ringRun(60, 120),
        targetKmh: 12,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Изходът идва — но мигач няма, и завоят е рязък…" },
      {
        // The SNAP exit: unlike the shadow's wide, indicator-announced blend,
        // a TIGHT ~70° right sweep off φ ≈ 150° onto the north arm (small
        // radius → the turn detector's 3 s window clears 55°) with NO
        // indicator — TURN_WITHOUT_INDICATOR, and nothing else (the circulator
        // is a full arc ahead, on the far/NW side).
        kind: "drive",
        points: [ring(130), ring(145), ring(155), [5.0, 19.5], [4.06, 23], [4.06, 28], [4.06, 40], [4.06, 54]],
        targetKmh: 14,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Никой около кръга не разбра, че колата излиза. Изходът е маневра — обявява се с десен мигач ПРЕДИ него.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRoundaboutEntryTraceName =
  | "shadow-correct"
  | "mistake-barge-entry"
  | "mistake-exit-no-signal";

const SCRIPTS: Record<ScRoundaboutEntryTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scRoundaboutEntryShadowScript },
  "mistake-barge-entry": { kind: "mistake", script: scRoundaboutEntryMistakeBargeScript },
  "mistake-exit-no-signal": { kind: "mistake", script: scRoundaboutEntryMistakeNoSignalScript },
};

/**
 * CLIP staging for this template (doc 66 R1 — produced-media honesty): NONE —
 * the clip re-enacts the compiled DRILL rig, like every demo that registers no
 * override.
 *
 * HISTORY, and why the override is gone rather than re-tuned. Until 2026-10-05
 * the barge clip (m0) swapped the circulator's `conflictLeadM` 14 → −30 «for the
 * clip only»: a sprint to the mouth that put the car ahead-left of the barging
 * ego, inside the chase camera's cone. It was needed because the old barge was
 * graded against a car 14 m upstream that it then outran — the viewer never
 * saw WHICH car had been «cut off», because no car had been.
 *
 * The demo is re-staged (founder ruling 2026-10-05 — see BARGE_BRAKE_Y): the
 * ego now rolls onto the ring ahead of the car and the car HAS TO BRAKE behind
 * it, on the drill's own staging. Under the old override that would be a false
 * clip: the sprinting car reaches the mouth first, and the picture is an ego
 * entering BEHIND the car it is captioned as having cut off. So the clip world
 * is the graded world again (clips/capture/captureFeedParity.test.ts replays it
 * and finds the conviction on the plan's fault time).
 *
 * WHAT THAT LEAVES FOR THE CLIP LANE: at the fault the cut-off car is 6–9 m
 * behind-left of the ego — outside a forward chase frame (the parity test's
 * checklist says so). The clip needs re-capturing and an R0 look, most likely
 * on the rear-aware camera the tailgater clips use. Not media this lane makes.
 */
export function scRoundaboutEntryClipStaged(): StagedEventSpec[] | null {
  return null;
}

/**
 * Record one of the three drives against a loaded rb-mini-v1 document — the
 * TEMPLATE's staged circulating car armed (single truth), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScRoundaboutEntryDrive(
  districtRaw: unknown,
  name: ScRoundaboutEntryTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_ROUNDABOUT_ENTRY_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_ROUNDABOUT_ENTRY.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
