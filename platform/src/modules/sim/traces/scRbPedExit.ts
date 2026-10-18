/**
 * sc-rb-ped-exit — the authored drives (doc 76 §5/§9): ONE correct shadow
 * demonstration + TWO mistake demos for „Пешеходец на изхода от кръговото“ on
 * the committed rb-ped-v1 district, recorded with the template's OWN staged
 * actors (roundaboutEntry sc-rbp-circulating + pedestrianDartOut
 * sc-rbp-crosser — single truth, imported from the template).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + YIELDED_TO_PRIORITY (waited the circulator out
 *     at the mouth) + PEDESTRIAN_YIELDED (stopped in the pocket and waited the
 *     crosser off the carriageway) — the two halves of the drill, both proven
 *     on the events;
 *   - „Изход през пешеходеца“ grades EXACTLY PEDESTRIAN_NOT_YIELDED (the exit
 *     is signalled and the entry is clean — the ONLY fault is the person on the
 *     zebra);
 *   - „Заковаване на спирачката заради пътеката“ grades EXACTLY
 *     HARSH_BRAKING_NO_CAUSE, on the APPROACH ARM (see WHY below).
 *
 * Geometry pinned to content/world/rb-ped-v1.json: ring centerline R = 18
 * around (0, 0), CCW (s → e → n → w); arm right-lane centers ±4.06; south spawn
 * (4.06, −93) heading north; ring limit 30, arms 40; the give-way bar of the
 * south mouth painted at y = −35.725; the exit zebra rbp-x-n at (0, 30) on the
 * north arm, leaving a 7.94 m stop pocket between the circulatory
 * carriageway's outer edge (r = 22.06) and the crossing. This drill takes the
 * SECOND (north) exit.
 *
 * EVERY PATH HERE IS ONE THE PRODUCT CAR CAN DRIVE
 * (catalogue-demo-curvature:dae908c7). Until 2026-10-11 the two ring drives
 * were typed in as waypoints — the ring as 10° chords, the entry and the exit
 * as corners (31° at the peel: 2.13 m of «radius» against a car whose tightest
 * circle is 3.955 m) — with 3.2 m of ring skipped where two ring steps met.
 * They are now cut from one continuous line each, built with ./ringDrive and
 * ./ringMini (the family's shared entry and exit): the tightest radius either
 * asks for is the exit's 9 m. Pins:
 * traces/__tests__/ring-demos-drivable.test.ts. (The third drive, the phantom
 * brake on the approach arm, never turns; it is untouched, byte for byte.)
 *
 * WHERE THE CORRECT DRIVE WAITS AT THE MOUTH: with its nose 0.8 m short of the
 * painted give-way bar (centre y = −38.545), which is what its caption says —
 * «Спри на линията и я пропусни». The old shadow rolled 11 m past the bar.
 *
 * FOUR ENVELOPES DECIDE EVERY NUMBER BELOW — all four measured, not guessed:
 *
 *  · RING PACE = 12 km/h, a CEILING. The turn detector fires at |Σ heading
 *    deltas| > 55° over a sliding 3 s window inside a junction area, and the
 *    whole ring is junction area (the four mouths are intersection nodes
 *    ≤ 13.8 m from every ring point). Circulating R = 18 at v gives 57.3·v/R
 *    deg/s ⇒ a 3 s window of 9.55·v: 12 km/h ⇒ 32° (safe), 20.7 km/h ⇒ 55°
 *    (the hard wall). Inherited from sc-rb-circulate-priority, same ring.
 *
 *  · THE ENTRY is the family's (./ringMini MINI_ENTRY): a 10 m-radius right
 *    turn, a short chord and onto the ring's centreline at φ = 55° — 44.5° of
 *    heading change in all (under the 55° turn window), so it is
 *    indicator-free-clean. It is taken only after the circulator is fully past
 *    the mouth (the wait before the bar), which is what YIELDED_TO_PRIORITY
 *    reads.
 *
 *  · THE POCKET is 7.94 m of tarmac and the stop has to land IN it. The shadow
 *    stops at (4.06, 27) — nose ~1 m short of the zebra, tail ~2.9 m clear of
 *    the ring band. The exit must therefore be COMPLETE before it, and the
 *    family's is: the wheel is straight at y = 25.97, a metre before the car
 *    comes to rest, so it stands along the lane and not across the pocket.
 *
 *  · HARSH_BRAKING_NO_CAUSE CANNOT FIRE INSIDE THE RING, so the phantom-brake
 *    demo is staged on the APPROACH ARM. The detector's cause ledger clears only
 *    when nextJunctionM > 35 (harshBrakeJunctionClearM) and the onset speed is
 *    ≥ 35 km/h (harshBrakeMinSpeedKmh). On the ring nextJunctionM ≤ 13.8 m
 *    always — proven directly in world/__tests__/rb-ped-district.test.ts — and
 *    the 12 km/h ceiling above is 23 km/h under the onset floor besides. The
 *    demo brakes at y ≈ −68 (50 m from the south node, onset ~38 km/h), where
 *    the ledger is genuinely clear: rb-ped-v1 carries NO zebra on the entry arm
 *    precisely so `s.crossing === null` holds there. The template's second
 *    mistake carries the honest-scope note.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_RB_PED_EXIT } from "../lessons/scenario/templates-roundabout2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";
import type { RingPath, RingPathBuilder } from "./ringDrive";
import { MINI_BAR_STOP_Y, MINI_ENTRY, miniExit, miniPathFromSpawn } from "./ringMini";

export const SC_RB_PED_EXIT_ID = "sc-rb-ped-exit";

/** South-arm northbound / north-arm outbound lane center (2-lane arms). */
const X_LANE = 4.06;
/** Where the approach comes off the arm's pace. */
const Y_SLOW = -60;
/** The ring pace — the turn-detector ceiling, see the header. */
const RING_KMH = 12;
/** The stop in the pocket: nose short of the zebra, tail clear of the ring. */
const Y_POCKET = 27;
/**
 * Where the right indicator goes on: φ = 112°, the first metre of ring past
 * the far kerb of the east mouth (it spans φ 68°–112° at the ring's outer
 * edge) — «Първият изход е зад нас». A right lever any earlier would tell the
 * driver waiting at the east mouth that this car is leaving by his road.
 */
const SIGNAL_PHI_DEG = 112;

/** The wait before the bar, s — see sc-roundabout-entry (same ring, same car,
 *  same staging). Re-measured for THIS lesson's rungs: clean from 7 s to 14 s
 *  (at 6 s the car is struck on L1, L2 and L4; at 16 s a near miss is logged) —
 *  ENTRY_WAIT_WINDOW in traces/__tests__/ring-demos-drivable.test.ts. */
const ENTRY_WAIT_SEC = 10;
/**
 * The wait in the pocket, s. The crosser is released as the car comes within
 * 30 m of her and walks 16.25 m of carriageway at 1.2 m/s; the car comes to
 * rest in the pocket mid-walk and moves off once she is off the tarmac.
 * Measured on the live chain: she steps onto the far kerb 7.5 s after the car
 * comes to rest (L1–L4; 6.5 s on L5, where the second crosser is a sprinter),
 * so the 9.5 s wait leaves ≥ 2 s between her last step on the tarmac and the
 * wheels turning — «Освободи цялото платно — чак сега тръгваме» is true on
 * every rung. (The grader itself is indifferent from 6 s to 16 s.)
 */
const POCKET_WAIT_SEC = 9.5;

/** The dials a pin may sweep (absent = the authored drive). */
export interface RbPedExitDials {
  waitSec?: number;
  pocketWaitSec?: number;
}

/** Spawn → the stop before the bar → the family entry → the ring to the
 *  signal point → the family north exit, straight in the lane at y = 25.97. */
function toExitLane(): RingPathBuilder {
  return miniPathFromSpawn()
    .straightToY(Y_SLOW)
    .mark("slow")
    .straightToY(MINI_BAR_STOP_Y)
    .mark("line")
    .enterRing(MINI_ENTRY)
    .mark("ring")
    .ringTo(SIGNAL_PHI_DEG)
    .mark("signal")
    .exitRing(miniExit("north"))
    .mark("lane");
}

/** The correct drive: into the pocket, and — after the wait — over the zebra. */
function buildShadowPath(): RingPath {
  return toExitLane().straightToY(Y_POCKET).mark("pocket").straightToY(55).mark("end").build();
}
let shadowPath: RingPath | null = null;
const SHADOW = (): RingPath => (shadowPath ??= buildShadowPath());

/** The mistake: the same line, driven through the pocket without a stop. */
function buildThroughPath(): RingPath {
  return toExitLane().straightToY(55).mark("end").build();
}
let throughPath: RingPath | null = null;
const THROUGH = (): RingPath => (throughPath ??= buildThroughPath());

/**
 * The shared yield-and-enter opening: approach, stop before the bar, wait the
 * circulator past the mouth, then the family entry. Every drive whose fault is
 * NOT the entry reuses it verbatim.
 */
function cleanEntrySteps(p: RingPath, waitSec: number): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: p.between("start", "slow"), targetKmh: 30, stopAtEnd: false },
    {
      // Ease to a stop with the nose 0.8 m short of the give-way bar.
      kind: "drive",
      points: p.between("slow", "line", { stop: true }),
      targetKmh: 16,
    },
    { kind: "annotation", textBg: "Кола се движи в кръга — тя е с предимство. Спри на линията и я пропусни." },
    { kind: "glance", mirror: "left" },
    // Wait the circulator fully PAST the mouth and onto the east arc (to the
    // driver's RIGHT) before committing — the yield the commendation reads.
    { kind: "pause", sec: waitSec, brake: true },
    { kind: "annotation", textBg: "Тя премина — влизаме плътно след нея, в нейния интервал." },
    { kind: "glance", mirror: "left" },
    {
      // The family entry — see the header's second envelope.
      kind: "drive",
      points: p.between("line", "ring"),
      targetKmh: 17,
      stopAtEnd: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scRbPedExitShadowScript(dials: RbPedExitDials = {}): DriveScript {
  const p = SHADOW();
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Днес кръговото е само половината. Другата половина е това, което те чака НА изхода.",
      },
      ...cleanEntrySteps(p, dials.waitSec ?? ENTRY_WAIT_SEC),
      {
        // Circulate the east arc past the FIRST exit (east, φ = 90) at the ring
        // ceiling. No indicator yet: a right lever here would tell the driver
        // waiting at the east mouth that this car is leaving.
        kind: "drive",
        points: p.between("ring", "signal"),
        targetKmh: RING_KMH,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Първият изход е зад нас — нашият е следващият. СЕГА десен мигач.",
      },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        kind: "annotation",
        textBg: "И сега най-важното: вдигни очи от колата в кръга и погледни НАПРЕД — на пътеката слиза човек.",
      },
      {
        // Ring to φ = 130°, the family exit onto the north arm — and STOP IN
        // THE POCKET at y = 27: nose ~1 m short of the zebra, tail ~2.9 m clear
        // of the ring band, the car straight along the lane.
        kind: "drive",
        points: p.between("signal", "pocket", { stop: true }),
        targetKmh: RING_KMH,
      },
      {
        kind: "annotation",
        textBg: "Спряхме МЕЖДУ пръстена и пътеката — джобът е точно за една кола. Кръгът зад нас остава свободен.",
      },
      { kind: "glance", mirror: "left" },
      // Wait the crosser fully off the carriageway. She is released at ~30 m
      // (ring φ ≈ 105), walks 1.2 m/s across 16.25 m of tarmac + a stand-off:
      // clear ~15 s after release, and the pocket stop lands mid-walk.
      { kind: "pause", sec: dials.pocketWaitSec ?? POCKET_WAIT_SEC, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Освободи цялото платно — чак сега тръгваме." },
      {
        // Over the now-clear zebra and out to the finish reference.
        kind: "drive",
        points: p.between("pocket", "end", { stop: true }),
        targetKmh: 22,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Мигач след първия изход, поглед напред, спиране в джоба, изчакване — и чак тогава газ. Това е целият изход.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изход през пешеходеца“ (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scRbPedExitMistakeThroughPedScript(dials: RbPedExitDials = {}): DriveScript {
  const p = THROUGH();
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Входът, обиколката и мигачът са изрядни — и точно затова грешката се гледа трудно.",
      },
      ...cleanEntrySteps(p, dials.waitSec ?? ENTRY_WAIT_SEC),
      {
        kind: "drive",
        points: p.between("ring", "signal"),
        targetKmh: RING_KMH,
        stopAtEnd: false,
      },
      // The indicator IS given — correct form. The ONLY graded fault is the
      // person on the zebra, so nothing else may be wrong with this drive.
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Очите още са върху колата в кръга. Пътеката отпред просто не е погледната…" },
      {
        // The SAME exit as the shadow — and then straight THROUGH the pocket
        // and over the occupied crossing without a pause. She is still on the
        // western half (metres away, outside the 1.5 m contact radius): pure
        // „непропускане", no collision to muddy the card.
        kind: "drive",
        points: p.between("signal", "end", { stop: true }),
        targetKmh: RING_KMH,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Изходът от кръга е завой в улица — а пътеката в тази улица е като всяка друга: чл. 119, пропускаш стъпилия на нея. На кръговите пешеходците загиват тук, на изхода.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Заковаване на спирачката заради пътеката“
// (HARSH_BRAKING_NO_CAUSE, on the APPROACH ARM — see the header's fourth
// envelope and the template's honest-scope note)
// ---------------------------------------------------------------------------

export function scRbPedExitMistakePanicBrakeScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Същият изход, същият пешеходец — но гледай кракът кога и къде реагира.",
      },
      { kind: "glance", mirror: "rear" },
      {
        // Runway: from the spawn to y = −68 the car builds to ~38 km/h — over
        // the detector's 35 km/h onset floor, and 50 m from the south node, so
        // the junction-proximity armor (35 m) is genuinely off. The entry arm
        // carries no zebra, so the crossing gate (`s.crossing === null`) is off
        // too: the cause ledger here is truly clear. targetKmh is the arm's own
        // headroom, not the achieved speed — the bot's accel model tops out at
        // ~38 over this runway, which is the number that matters.
        kind: "drive",
        points: [[X_LANE, -93], [X_LANE, -68]],
        targetKmh: 50,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "„Там има пешеходец!“ — и колата се заковава насред правия участък." },
      {
        // THE STAB: maxDecelMps2 12 ⇒ a sustained ~8.4 m/s² stop, over the
        // detector's 7 m/s² emergency grade and held well past its 0.4 s
        // sustain. Without the override the step would ease down at the script
        // default (~4.5 m/s²) — a firm, lawful stop the detector rightly
        // ignores. The sc-rb-circulate-priority recipe, on the identical arm.
        kind: "drive",
        points: [[X_LANE, -68], [X_LANE, -60]],
        targetKmh: 50,
        stopAtEnd: true,
        maxDecelMps2: 12,
      },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пътеката е на седемдесет метра оттук — тя още не е твой проблем. Излишната спирачка изненадва движещия се зад теб; а същата спирачка в пръстена запушва цялото кръгово. Правилното място е едно: джобът между кръга и пътеката.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRbPedExitTraceName =
  | "shadow-correct"
  | "mistake-exit-through-ped"
  | "mistake-panic-brake";

const SCRIPTS: Record<ScRbPedExitTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scRbPedExitShadowScript },
  "mistake-exit-through-ped": { kind: "mistake", script: scRbPedExitMistakeThroughPedScript },
  "mistake-panic-brake": { kind: "mistake", script: scRbPedExitMistakePanicBrakeScript },
};

/**
 * Record one of the three drives against a loaded rb-ped-v1 document — the
 * TEMPLATE's staged circulating car AND crosser armed (single truth), ambient
 * traffic zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScRbPedExitDrive(
  districtRaw: unknown,
  name: ScRbPedExitTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_RB_PED_EXIT_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_RB_PED_EXIT.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
