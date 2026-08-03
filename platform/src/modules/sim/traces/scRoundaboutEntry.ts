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
 *     circulatingConflict tracker — the barge carries a right indicator so
 *     its ONLY graded fault is the priority);
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
 *  · FAILED_TO_YIELD (roundabout tracker): fires if a circulating car is on
 *    the driver's LEFT while the driver is still entering (inward, moving,
 *    azimuth-swept < RB_ON_RING_DEG = 35°). Closed by a BRISK flat-chord
 *    entry (17 km/h, a nearly-straight NE line that sweeps 35° of azimuth with
 *    only ~40° of heading change) so ring priority is held while the 2.9 m/s
 *    car is still on the driver's RIGHT (east arc).
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

import type { RoundaboutEntrySpec, StagedEventSpec } from "../contracts";
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
      { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60], [X_LANE, -40]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата в кръга приближава отляво… но нашата не спира." },
      {
        // Straight through the mouth at speed, cutting the circulator off —
        // the demo freezes on the early ring right after the graded moment
        // (driving on with the cut-off car on the bumper would only stack
        // unrelated noise on top of the ONE taught mistake).
        kind: "drive",
        points: [
          [X_LANE, -40],
          [X_LANE, -26],
          [5.4, -21.5],
          [7.4, -18.3],
          ...ringRun(30, 60),
        ],
        targetKmh: 22,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Влизащият НЯМА предимство: на входа стои Б1/Б2 (Б3 не се поставя там — Наредба № РД-02-21-1/23.11.2023, чл. 61, ал. 5), значи пропускаш движещите се в кръга (ЗДвП чл. 50, ал. 1) — дори с цената на пълно спиране.",
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
 * CLIP staged override (doc 66 R1 — produced-media honesty), the roundabout
 * twin of scFollowDistanceClipStaged. The barge demo's FAILED_TO_YIELD was
 * graded against the circulator RB_CIRCULATING.conflictLeadM = 14 m UPSTREAM of
 * the south node — on the SW arc, ~54° to the LEFT of the entry heading, so the
 * chase camera's forward cone (CHASE_FOV 44° → ~71° horizontal) never contains
 * it at the fault and R1 fails ("липсва vehicle": the viewer never sees WHICH
 * car the ego cut off). Pull the circulator DOWNSTREAM to ~the south node (the
 * mouth) for the CLIP ONLY: it then sits ahead-left of the barging car — the
 * very car it cut in front of — inside the frame (verified: at fault 11.58 s
 * the car is at (0.2, −18.0), in-frame across the whole presence beat; min
 * ego↔car gap 5.26 m > VEHICLE_CONTACT_M, so no contact fires — the barging ego
 * at ~6 m/s outruns the 2.9 m/s crawler).
 *
 * WHY a large NEGATIVE lead: the RoundaboutEntryRunner LOCKS the circulation
 * (drops it to the 2.9 m/s crawl) as the player reaches RB_LOCK_PLAYER_ENTRY_M,
 * ~1.2 s BEFORE this fast barge's fault — so conflictLeadM only sets where the
 * car is AT LOCK, and its sync is speed-capped (maxSyncSpeedMps 8.5). Any
 * sufficiently-downstream target (conflictS = southNodeS − conflictLeadM)
 * SATURATES that cap: the car runs flat-out from the arm until the lock and
 * lands at the mouth regardless of the exact magnitude (−30 and −40 land
 * identically), so this is a robust "sprint to the mouth", not a fragile pin.
 *
 * Clip-scoped: the recorder and the trace-gate read SC_ROUNDABOUT_ENTRY.staged
 * (the graded 14 m) unchanged, so grading is untouched. Only the barge demo
 * (m0) needs it; the exit demo (m1) frames its own circulator — drill default.
 */
export const RB_CLIP_CONFLICT_LEAD_M = -30;

export function scRoundaboutEntryClipStaged(mistakeIndex: number): StagedEventSpec[] | null {
  if (mistakeIndex !== 0) return null;
  const base = (SC_ROUNDABOUT_ENTRY.staged ?? []) as StagedEventSpec[];
  return base.map((spec) =>
    spec.kind === "roundaboutEntry" && spec.id === "sc-rb-circulating"
      ? ({ ...(spec as RoundaboutEntrySpec), conflictLeadM: RB_CLIP_CONFLICT_LEAD_M } as StagedEventSpec)
      : spec,
  );
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
