/**
 * sc-vu-cyclist-group — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Изпреварване на група велосипедисти" (VU-02, the
 * column variant) on the committed vu-pass-v1 street, recorded with the
 * template's OWN staged actors (the five cyclistRightHook riders + the single
 * oncomingStream car — single truth, imported from the template). No ambient
 * traffic (seed 7).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + YIELDED_TO_PRIORITY (five clean verdicts — the
 *     wide oncoming-bank line at ~7.4 m of air, committed only after the
 *     oncoming car has passed);
 *   - „Тесен просвет покрай колоната" grades EXACTLY VULNERABLE_PASS_TOO_CLOSE
 *     (a sub-20 km/h squeeze at ~1.1 m of air past all five — under the follow
 *     grading floor, so no FOLLOWING code can pollute it);
 *   - „Прибиране между велосипедистите" grades EXACTLY VULNERABLE_PASS_TOO_CLOSE
 *     + FOLLOWING_TOO_CLOSE + COLLISION — one act, three verdicts (see below).
 *
 * GEOMETRY, pinned to content/world/vu-pass-v1.json + the template's constants
 * (the vu-cyclist-group district battery asserts every one against the map and
 * against the runtime's own thresholds):
 *   · 360 m S→N street on x = 0; northbound lane center x = 4.0625, southbound
 *     x = −4.0625; the riders' curb line x = 6.6625 (lane + extraRightOffsetM
 *     2.6); no zones ⇒ no М1 span ⇒ crossing the crown is free.
 *   · The column: riders 1..5 (lead → tail) at y = 180/160/140/120/100 at t = 0,
 *     all rolling at 3 m/s from the first frame (releaseDistM > spawn distance).
 *   · The oncoming car: y = 110 at t = 0, southbound at 12 m/s.
 * Lateral honesty (runtime VULNERABLE_PASS_* doc): every threshold is
 * CENTER-TO-CENTER; subtract the ~1.25 m body allowance for air.
 *   wide line x −2.0  → 8.66 m centers ≈ 7.4 m air  (≥ 2.75 SAFE → yielded)
 *   squeeze  x  4.3   → 2.36 m centers ≈ 1.1 m air  (< 2.45 CONVICT, > 2.2 contact)
 *   cut-in   x  5.2   → 1.46 m centers              (< 2.2 ⇒ the runner's contact)
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VU_CYCLIST_GROUP } from "../lessons/scenario/templates-vru2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VU_CYCLIST_GROUP_ID = "sc-vu-cyclist-group";

/** Northbound lane center of vu-pass-v1. */
const LANE_X = 4.06;
/** The wide oncoming-bank line (≈ 7.4 m of air to the riders' curb line). */
const PASS_X = -2.0;
/** The squeeze line (≈ 1.1 m of air — the taught mistake, no contact). */
const SQUEEZE_X = 4.3;
/** The cut-in line: inside the runner's 2.2 m contact radius. */
const CUT_X = 5.2;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — wait out the oncoming, then ONE wide
// pass of the whole column, home only after the lead rider is clear.
//
// TIMING (the numbers the drive is built on): the player rolls at ~45 km/h
// (12.5 m/s) while the oncoming car closes at 12 m/s from y = 110 — they meet
// around y ≈ 50, well before the column. The move out happens at y 62 → 78,
// which is BOTH after the meeting and before the tail rider (y ≈ 120 by then)
// is anywhere near the lead corridor. From there the player closes on the
// column at ~9.5 m/s. The excursion runs y 78 → 268 — ~190 m and ~15 s on the
// wrong side of the crown, unbroken — and the return lands with the lead rider
// ~20 m astern: „целият в огледалото", which is the rule the copy teaches.
// ---------------------------------------------------------------------------

export function scVuCyclistGroupShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Пред теб — колона от петима велосипедисти. Изпреварва се като едно цяло, не на части.",
      },
      { kind: "glance", mirror: "left" },
      // Hold the lane while the oncoming car comes through: the maneuver is
      // ~15 s long, so it does not start against a car that is already here.
      {
        kind: "drive",
        points: [
          [LANE_X, 15],
          [LANE_X, 62],
        ],
        targetKmh: 45,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Насрещната кола отмина — едва сега прозорецът е твой. Маневрата иска около 15 секунди.",
      },
      { kind: "indicator", setting: "left" },
      // Out to the oncoming bank EARLY — before the tail rider is close enough
      // to read as a lead. The line is then HELD past all five riders.
      {
        kind: "drive",
        points: [
          [LANE_X, 62],
          [PASS_X, 78],
          [PASS_X, 268],
        ],
        targetKmh: 45,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Широка дъга покрай ВСИЧКИ петима — просветът се държи до последния, не до първия.",
      },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      // Home only now: the lead rider is fully in the mirror.
      {
        kind: "drive",
        points: [
          [PASS_X, 268],
          [LANE_X, 288],
          [LANE_X, 335],
        ],
        targetKmh: 45,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Един прозорец, едно решение, една маневра — точно това иска чл. 42 при група.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Тесен просвет покрай колоната" (VULNERABLE_PASS_TOO_CLOSE)
//
// The driver never leaves his lane and worms up the whole column at 18 km/h.
// Sub-20 km/h keeps the follow detector structurally off (followMinSpeedKmh);
// the pass floor (15 km/h) still grades every squeeze — creeping in a queue
// would not. At 5 m/s against riders at 3 m/s the closing rate is only 2 m/s,
// which is the demo's quiet second point: worming past an 80 m column takes
// ~40 s, and the street runs out first. It bills FOUR riders (measured) and
// never reaches the lead one — one code, four times.
// ---------------------------------------------------------------------------

export function scVuCyclistGroupMistakeNarrowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: колата не излиза от лентата — ще се провре покрай петима на метър въздух.",
      },
      { kind: "glance", mirror: "left" },
      {
        kind: "drive",
        points: [
          [LANE_X, 15],
          [SQUEEZE_X, 40],
          [SQUEEZE_X, 100],
        ],
        targetKmh: 45,
        stopAtEnd: false,
      },
      // Ease to a worm-past pace behind the tail rider and hold the line.
      {
        kind: "drive",
        points: [
          [SQUEEZE_X, 100],
          [SQUEEZE_X, 120],
        ],
        targetKmh: 18,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Първият велосипедист мина на една ръка… и колата продължава напред покрай следващия.",
      },
      // Hold the worm pace to the very end. The demo deliberately NEVER
      // accelerates away: riders 2 and 1 are still up the road when the street
      // runs out, and a car that speeds up behind a cyclist it has not passed
      // is a FOLLOWING_TOO_CLOSE demo — a different lesson, and one that would
      // pollute this drive's verdict. The taught fault here is the clearance,
      // billed once per rider; the drive ends still stuck in the column, which
      // is exactly what worming past a group earns you.
      {
        kind: "drive",
        points: [
          [SQUEEZE_X, 120],
          [SQUEEZE_X, 320],
        ],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Метър въздух не е дистанция — а при група е пет пъти един и същи залог. Излизаш широко или чакаш (чл. 42).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Прибиране между велосипедистите"
//        (VULNERABLE_PASS_TOO_CLOSE + FOLLOWING_TOO_CLOSE + COLLISION)
//
// The half-maneuver: a correct wide start (riders 5 and 4 pass clean and DO
// earn their yielded verdicts — the demo's honesty is that the first half was
// right), then the driver loses his nerve mid-column and dives back into the
// "gap" between riders 3 and 2.
//   · The dive lands on the SQUEEZE line before rider 3's alongside window
//     opens → that window records ~2.36 m of centers → VULNERABLE_PASS_TOO_CLOSE.
//   · Landing in a 20 m hole at 45 km/h leaves ~1.6 s to the rider ahead, held
//     long enough to sustain → FOLLOWING_TOO_CLOSE (twice, deduped by the gate).
//   · The car then drifts to the CUT line — 1.4625 m of centres, i.e. 0.21 m of
//     clear air past a rider's handlebar. THIS USED TO BE A THIRD CODE: the old
//     CYCLIST_CONTACT_M was an isotropic 2.2 m circle around two POINTS, so it
//     called that a COLLISION. Exact body geometry (sim/collision, 2026-08-10)
//     does not, and the demo is honest without it — 21 cm is the worst pass the
//     street can be driven and the clearance code is the one чл. 42 names.
//
// TWO CODES FOR ONE ACT, and deliberately so. The backlog asked this demo for
// OVERTAKE_RETURN_TOO_EARLY; that code is structurally unreachable against a
// cyclist column (traffic/system.ts `sameDirVehicleNearFor` skips every cyclist
// proxy — „the cyclist pass is VU-02's act", the one-act-one-code ruling), so
// the honest question is what the engine ACTUALLY bills for an early return
// onto a bike. It bills the harm, itemised: the clearance you stole from the
// rider you cut past, the distance you never had to the rider you cut in front
// of, and the contact. That IS doc-72 OV-09's harm — it simply arrives under
// three shipped codes instead of one unreachable one. Reported in the agent
// notes; if OVERTAKE_RETURN ever admits cyclist mates, this demo gains a
// fourth verdict and loses nothing.
// ---------------------------------------------------------------------------

export function scVuCyclistGroupMistakeCutInScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Началото е правилно: изчакано насрещно, ляв мигач и широка дъга покрай колоната.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      {
        kind: "drive",
        points: [
          [LANE_X, 15],
          [LANE_X, 62],
        ],
        targetKmh: 45,
        stopAtEnd: false,
      },
      // Riders 5 and 4 go by on the honest wide line — they DO earn their
      // yielded verdicts, and that is the demo's point: the first half was
      // right, which is exactly why the driver felt entitled to the second.
      {
        kind: "drive",
        points: [
          [LANE_X, 62],
          [PASS_X, 78],
          [PASS_X, 163],
        ],
        targetKmh: 45,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Маневрата е дълга и водачът се отказва по средата — вижда „пролука“ между третия и втория.",
      },
      { kind: "indicator", setting: "right" },
      // THE DIVE — landed BY y 184, which is 10 m before rider 3's alongside
      // window opens (|along| ≤ 5.5 m around y ≈ 194). The landing must beat
      // the window: the tracker grades the MINIMUM lateral it sees while the
      // rider is beside the car, so a dive still in progress there would be
      // measured mid-sweep, out at 5 m of air, and rider 3 would be acquitted.
      {
        kind: "drive",
        points: [
          [PASS_X, 163],
          [SQUEEZE_X, 184],
        ],
        targetKmh: 45,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Пролука между два велосипеда няма — тя е дълга колкото колата ти и без никакъв резерв.",
      },
      // HOLD the squeeze line across the whole of rider 3's window (y 184 →
      // 202): a steady 2.36 m of centers ≈ 1.1 m of air — inside the convict
      // band (< 2.45) and, deliberately, still 0.16 m OUTSIDE the 2.2 m contact
      // bar. Drifting closer here would hand the episode to the collision
      // machinery ("one act, one code") and rider 3's bill would vanish.
      {
        kind: "drive",
        points: [
          [SQUEEZE_X, 184],
          [SQUEEZE_X, 202],
        ],
        targetKmh: 45,
        stopAtEnd: false,
      },
      // Only NOW, with rider 3 billed and falling back, the car drifts the last
      // 0.9 m toward the curb and runs into rider 2 — the rider it never had
      // room to pass. Contact lands ~1.9 s after the gap first reads short,
      // i.e. inside followSustainSec (2 s): the cut kills before „несъобразена
      // дистанция" can even be argued, which is the whole horror of the beat.
      {
        kind: "drive",
        points: [
          [SQUEEZE_X, 202],
          [CUT_X, 214],
          [CUT_X, 226],
        ],
        targetKmh: 45,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Изпреварването на група завършва след ПОСЛЕДНИЯ преден велосипедист — или изобщо не започва (чл. 42).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVuCyclistGroupTraceName = "shadow-correct" | "mistake-narrow" | "mistake-cut-in";

const SCRIPTS: Record<
  ScVuCyclistGroupTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scVuCyclistGroupShadowScript },
  "mistake-narrow": { kind: "mistake", script: scVuCyclistGroupMistakeNarrowScript },
  "mistake-cut-in": { kind: "mistake", script: scVuCyclistGroupMistakeCutInScript },
};

/**
 * Record one of the three drives against a loaded vu-pass-v1 document — the
 * TEMPLATE's staged column + oncoming car armed (single truth), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScVuCyclistGroupDrive(
  districtRaw: unknown,
  name: ScVuCyclistGroupTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VU_CYCLIST_GROUP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VU_CYCLIST_GROUP.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
