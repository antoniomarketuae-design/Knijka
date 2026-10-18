/**
 * sc-rb-circulate-priority — the authored drives (doc 76 §5/§9): ONE correct
 * shadow demonstration + TWO mistake demos for „В кръга си с предимство“ on the
 * committed rb-mini-v1 district, recorded with the template's OWN staged waiting
 * car (priorityFromRight sc-rbc-waiter — single truth, imported from the
 * template). The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations — an unhesitating entry into the empty ring, a
 *     flat 12 km/h circulation past the east mouth on one line, and a signalled
 *     north exit;
 *   - „Паническо спиране заради чакащия на входа“ grades EXACTLY
 *     HARSH_BRAKING_NO_CAUSE;
 *   - „Колебливо криволичене в пръстена“ grades EXACTLY POOR_LANE_KEEPING.
 *
 * Geometry pinned to content/world/rb-mini-v1.json: ring centerline R = 18
 * around (0, 0), CCW (s → e → n → w); arm right-lane centers ±4.06; south spawn
 * (4.06, −93) heading north; ring limit 30, arms 40. This drill takes the SECOND
 * (north) exit.
 *
 * EVERY PATH HERE IS ONE THE PRODUCT CAR CAN DRIVE
 * (catalogue-demo-curvature:dae908c7). Until 2026-10-11 the drives were typed
 * in as waypoints — the ring as 10° chords, the entry and the exit as corners
 * (31° at the peel; the wandering demo's exit a 57° pivot: 1.1 m of «radius»
 * against a car whose tightest circle is 3.955 m) — with 3.2 m of ring skipped
 * where two ring steps met. They are now cut from one continuous line each,
 * built with ./ringDrive and ./ringMini (the family's shared entry and exit):
 * the tightest radius any of the three asks for is the exit's 9 m. Pins:
 * traces/__tests__/ring-demos-drivable.test.ts.
 *
 * THREE ENVELOPES DECIDE EVERY NUMBER BELOW — all three measured, not guessed:
 *
 *  · RING PACE = 12 km/h, and it is a CEILING, not a style choice. The turn
 *    detector fires at |Σ heading deltas| > 55° over a sliding 3 s window inside
 *    a junction area, and the whole ring is junction area (the four mouths are
 *    intersection nodes ≤ 13.8 m from every ring point). Circulating R = 18 at
 *    v gives 57.3·v/R deg/s ⇒ a 3 s window of 9.55·v: 12 km/h ⇒ 32° (safe),
 *    20.7 km/h ⇒ 55° (the hard wall), 25 km/h ⇒ 66° — measured: a 25 km/h
 *    circulation grades TURN_WITHOUT_INDICATOR on the ring alone, indicator or
 *    no indicator. Any brisker ring drill needs a bigger radius, not a braver
 *    script.
 *
 *  · HARSH_BRAKING_NO_CAUSE CANNOT FIRE INSIDE THE RING, so the panic-brake demo
 *    is staged on the APPROACH ARM. The detector's cause ledger clears only when
 *    nextJunctionM > 35 (harshBrakeJunctionClearM) and the onset speed is
 *    ≥ 35 km/h (harshBrakeMinSpeedKmh). On the ring, nextJunctionM ≤ 13.8 m
 *    always — the junction-proximity armor is permanently on — and the 12 km/h
 *    ceiling above is 23 km/h under the onset floor besides. Measured: a
 *    12 m/s² stab to a dead stop mid-ring grades NOTHING. The demo therefore
 *    brakes at y ≈ −68 (50 m from the south node, onset ~38 km/h), where the
 *    ledger is genuinely clear and the fault is genuinely visible.
 *
 *  · POOR_LANE_KEEPING needs |laneOffsetM| > 3.25 m held 3 s. The ring edge is
 *    oneway with lanes = 1, so the locator clamps laneOffsetM to ±4.06 (half the
 *    8.125 m drawn lane) and laneOffsetM = 4.06 − d: riding WIDE of the
 *    centerline at radius r puts d = (r − 18) + 4.06, so the tolerance breaks at
 *    r > 21.25. The demo holds r = DRIFT_R (see there for what that radius
 *    costs: on this ring the fault CANNOT be committed with the whole body on
 *    the tarmac).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_RB_CIRCULATE_PRIORITY } from "../lessons/scenario/templates-roundabout";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";
import type { RingPath, RingPathBuilder } from "./ringDrive";
import {
  MINI_BAR_STOP_Y,
  MINI_ENTRY,
  MINI_R,
  miniExit,
  miniPathFromSpawn,
} from "./ringMini";

export const SC_RB_CIRCULATE_PRIORITY_ID = "sc-rb-circulate-priority";

/** Where the approach comes off the arm's pace. */
const Y_SLOW = -60;
/** The ring pace — the turn-detector ceiling, see the header. */
const RING_KMH = 12;
/**
 * The wandering demo's pace, км/ч — a hesitant crawl, and it has to be: the
 * detector wants the car beyond the tolerance for 3 s on end, the family's
 * census wants the line really ridden — more than 1.5 s past that
 * (lessons/scenario/__tests__/roundabout-family-exit-census.test.ts) — and
 * there are only ~7 m of ring to spend them on (see DRIFT_* below). Measured
 * on the live chain, every rung: 6.5 км/ч rides it 3.88 s, 6 км/ч 4.22 s,
 * 5.5 км/ч 4.60 s, 5 км/ч 4.93 s. (Holding the drift further round instead —
 * to φ 124° — rides it longer at 5.5 км/ч, 5.18 s, but the steeper way back
 * in swings the rear 0.8 m over the kerb: past what the drivability pin
 * allows for this one exception. The pace is the cheaper lever.)
 */
const DRIFT_KMH = 5;
/**
 * The wandering demo's held radius, m — and what it costs.
 *
 * The lane-keeping tolerance breaks at r > 21.25 (the header's third envelope).
 * The ring's outer kerb is built at r = 21.80 (measured on the collider the
 * product hands physics: a chassis box centred on r = 18.00 is 2.95 m from the
 * pavement body), and the hero is 0.85 m to its side: a car whose WHOLE body is
 * on the tarmac has its centre at r ≤ 20.95, i.e. no further than 2.95 m off
 * the lane's centre — 0.30 m short of the fault. Inward the island's wall
 * stands at r = 13.75 and the tolerance breaks at r < 14.75: 0.15 m of air.
 * So on this ring the product can only book «не спазва лентата» against a car
 * that is riding the kerb — which is also what the demo's own caption says
 * («изнесе колата към външния ръб — и тя остана там») and what the old demo
 * did, further out (r = 21.8, the kerb under the car's centreline).
 *
 * 21.5 is the smallest radius that books the fault with a margin worth the
 * name: laneOffsetM −3.50, a quarter of a metre past the tolerance, the right
 * side of the body 0.55 m over the kerb line (the old demo: 0.85 m). It is the
 * one stretch of the whole family where a demo is NOT a quarter of a metre
 * clear of every static body, because that contact IS the picture of the
 * mistake; the drivability pins assert exactly that and nothing wider.
 */
const DRIFT_R = 21.5;
/**
 * Where the right indicator goes on: φ = 112°, the first metre of ring past
 * the far kerb of the east mouth (it spans φ 68°–112° at the ring's outer
 * edge) — the first exit, which is not ours.
 */
const SIGNAL_PHI_DEG = 112;

/** The dials a pin may sweep (absent = the authored drive). */
export interface RbCirculatePriorityDials {
  ringKmh?: number;
  driftKmh?: number;
}

/**
 * The shared approach + entry: roll down the south arm and take the empty ring
 * WITHOUT stopping. That is itself the lesson's first half — an empty roundabout
 * is not a stop sign — and it is what every drive whose fault lies elsewhere
 * reuses verbatim: down to 18 km/h by the give-way bar, a look left as the nose
 * reaches it, and the family entry (./ringMini MINI_ENTRY) at 17.
 */
function approachAndEntry(from: RingPathBuilder): RingPathBuilder {
  return from.straightToY(MINI_BAR_STOP_Y).mark("line").enterRing(MINI_ENTRY).mark("ring");
}

function cleanEntrySteps(p: RingPath): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: p.between("start", "slow"), targetKmh: 40, stopAtEnd: false },
    { kind: "drive", points: p.between("slow", "line"), targetKmh: 18, stopAtEnd: false },
    { kind: "glance", mirror: "left" },
    { kind: "drive", points: p.between("line", "ring"), targetKmh: 17, stopAtEnd: false },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

function buildShadowPath(): RingPath {
  return approachAndEntry(miniPathFromSpawn().straightToY(Y_SLOW).mark("slow"))
    .ringTo(SIGNAL_PHI_DEG)
    .mark("signal")
    .exitRing(miniExit("north"))
    .mark("lane")
    .straightToY(58)
    .mark("end")
    .build();
}
let shadowPath: RingPath | null = null;
const SHADOW = (): RingPath => (shadowPath ??= buildShadowPath());

export function scRbCirculatePriorityShadowScript(dials: RbCirculatePriorityDials = {}): DriveScript {
  const p = SHADOW();
  const ringKmh = dials.ringKmh ?? RING_KMH;
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Кръгът е празен, а на западния вход стои кола. Тя чака нас — влизаме, без да спираме.",
      },
      ...cleanEntrySteps(p),
      {
        kind: "annotation",
        textBg: "Празен кръг не се чака. Влязохме плавно, без спиране — сега една линия и една скорост.",
      },
      {
        // The ring, flat and quiet: one line on the centerline, one pace, held
        // from the entry's landing straight past the east mouth.
        kind: "drive",
        points: p.between("ring", "signal"),
        targetKmh: ringKmh,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Колата на запад още чака — и ще чака, докато освободим кръга. Това е нейното задължение, не нашето.",
      },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // Ring to φ = 130°, the family exit onto the north arm's lane, and on.
        kind: "drive",
        points: p.between("signal", "end", { stop: true }),
        targetKmh: ringKmh,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Една линия, една скорост, нула спирачка заради чакащия — и кръгът остана свободен зад нас.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Паническо спиране заради чакащия на входа“
// (HARSH_BRAKING_NO_CAUSE)
// ---------------------------------------------------------------------------

/** Where the stab begins, and where the car has stopped. */
const Y_STAB = -68;

function buildPanicBrakePath(): RingPath {
  return approachAndEntry(miniPathFromSpawn().straightToY(Y_STAB).mark("stab").straightToY(Y_SLOW).mark("slow"))
    .ringTo(SIGNAL_PHI_DEG)
    .mark("signal")
    .exitRing(miniExit("north"))
    .mark("lane")
    .straightToY(58)
    .mark("end")
    .build();
}
let panicPath: RingPath | null = null;
const PANIC = (): RingPath => (panicPath ??= buildPanicBrakePath());

export function scRbCirculatePriorityMistakePanicBrakeScript(dials: RbCirculatePriorityDials = {}): DriveScript {
  const p = PANIC();
  const ringKmh = dials.ringKmh ?? RING_KMH;
  return {
    steps: [
      { kind: "annotation", textBg: "Същият празен кръг, същата чакаща кола — гледай какво прави кракът." },
      { kind: "glance", mirror: "rear" },
      {
        // Runway: from the spawn to y = −68 the car builds to ~38 km/h — over
        // the detector's 35 km/h onset floor, and 50 m from the south node, so
        // the junction-proximity armor (35 m) is genuinely off.
        kind: "drive",
        points: p.between("start", "stab"),
        targetKmh: 50,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Кола стои на западния вход… и кракът скача на спирачката." },
      {
        // The stab: maxDecelMps2 12 ⇒ a sustained ~8.4 m/s² stop, over the
        // detector's 7 m/s² emergency grade. Nothing ahead, nothing crossing,
        // no signal, no junction inside 35 m — the cause ledger is empty and
        // this is exactly the „рязко спиране без причина" it is meant to catch.
        kind: "drive",
        points: p.between("stab", "slow", { stop: true }),
        targetKmh: 50,
        stopAtEnd: true,
        maxDecelMps2: 12,
      },
      { kind: "pause", sec: 3, brake: true },
      {
        kind: "annotation",
        textBg: "Спряла кола на входа не предявява предимство — тя чака теб. А зад теб може и да има някой.",
      },
      // From here the drive is the shadow's, so the ONE taught fault is never
      // stacked with a second: the entry, the ring and the signalled north exit
      // all replay clean.
      { kind: "drive", points: p.between("slow", "line"), targetKmh: 18, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: p.between("line", "ring"), targetKmh: 17, stopAtEnd: false },
      { kind: "drive", points: p.between("ring", "signal"), targetKmh: ringKmh, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: p.between("signal", "end", { stop: true }), targetKmh: ringKmh },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Кръговото не е „стоп“. Влиза се с преценка, не с паника — а вътре предимството вече е твое: чакащият на входа е този с Б1/Б2 и той пропуска теб (ЗДвП чл. 50, ал. 1).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Колебливо криволичене в пръстена“ (POOR_LANE_KEEPING)
// ---------------------------------------------------------------------------

/**
 * The drift's ring, in azimuth. The ring between the entry and the north exit
 * is short, and the product only reads the lane offset cleanly while the car
 * is located on ONE ring edge (past the east node the fix stays with the
 * south-east edge until φ ≈ 110° and its offset reads low there — measured),
 * so the three seconds have to be spent between φ 110° and the exit:
 *
 *   φ 55° → 100°   out from the centreline to DRIFT_R (the quintic lane-change
 *                  of ./ringDrive);
 *   φ 100° → 120°  held out there;
 *   φ 120° → 146°  back in, but only as far as r = DRIFT_BACK_R — there is no
 *                  ring left to regain the centreline;
 *   φ 146°         the wheel comes off the ring for a late, tight exit (6.5 m
 *                  radius, like the family's snap exit, but ANNOUNCED: the
 *                  indicator has been on since φ 124°) that lands on the lane's
 *                  centre.
 *
 * At DRIFT_KMH the car is beyond the tolerance, on the north-east edge, for
 * the time the family census pins (more than laneKeepSustainSec + 1.5 s).
 */
const DRIFT_OUT_BY_PHI_DEG = 100;
const DRIFT_HOLD_TO_PHI_DEG = 120;
const DRIFT_BACK_BY_PHI_DEG = 146;
const DRIFT_BACK_R = 19.6;
const DRIFT_SIGNAL_PHI_DEG = 124;
/**
 * Where the crawl ends: φ 136°, the car back inside the tolerance (it re-crosses
 * r = 21.25 at φ ≈ 129.5°) and headed for its exit. The exit itself is taken
 * at the ring pace — the demo's fault is the line, not a slow exit.
 */
const DRIFT_RECOVER_PHI_DEG = 136;

function buildWanderingPath(): RingPath {
  return approachAndEntry(miniPathFromSpawn().straightToY(Y_SLOW).mark("slow"))
    .ringShiftTo(DRIFT_OUT_BY_PHI_DEG, DRIFT_R)
    .mark("wide")
    .ringTo(DRIFT_HOLD_TO_PHI_DEG)
    .ringShiftTo(DRIFT_BACK_BY_PHI_DEG, DRIFT_BACK_R, { signal: DRIFT_SIGNAL_PHI_DEG, recover: DRIFT_RECOVER_PHI_DEG })
    .exitRing({
      ...miniExit("north"),
      peelPhiDeg: DRIFT_BACK_BY_PHI_DEG,
      turnRadiusM: 6.5,
      rampInM: 2,
      rampOutM: 2,
      joinRampM: 3,
    })
    .mark("lane")
    .straightToY(58)
    .mark("end")
    .build();
}
let wanderingPath: RingPath | null = null;
const WANDERING = (): RingPath => (wanderingPath ??= buildWanderingPath());

export function scRbCirculatePriorityMistakeWanderingScript(dials: RbCirculatePriorityDials = {}): DriveScript {
  const p = WANDERING();
  const driftKmh = dials.driftKmh ?? DRIFT_KMH;
  const ringKmh = dials.ringKmh ?? RING_KMH;
  return {
    steps: [
      { kind: "annotation", textBg: "Входът е чист — грешката е в самия пръстен, в линията." },
      ...cleanEntrySteps(p),
      {
        // The drift: „да го пусна ли" pushes the car off the centerline and out
        // toward the lane's outer edge over 45° of ring, then it simply stays
        // there. The detector grades SUSTAINED off-centre positioning — 3 s
        // beyond |laneOffsetM| = 3.25 — so what convicts is not the wobble but
        // the fact that the car never comes back to a line.
        kind: "drive",
        points: p.between("ring", "wide"),
        targetKmh: driftKmh,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Колебанието изнесе колата към външния ръб — и тя остана там." },
      {
        kind: "drive",
        points: p.between("wide", "signal"),
        targetKmh: driftKmh,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // The exit is announced and clean — the demo isolates the LINE, not the
        // signalling (that is sc-rb-exit-signal's lesson).
        kind: "drive",
        points: p.between("signal", "recover"),
        targetKmh: driftKmh,
        stopAtEnd: false,
      },
      {
        kind: "drive",
        points: p.between("recover", "end", { stop: true }),
        targetKmh: ringKmh,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "В кръговото другите четат намеренията ти по траекторията. Кола, която се лута в лентата, не казва нищо на никого.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRbCirculatePriorityTraceName =
  | "shadow-correct"
  | "mistake-panic-brake"
  | "mistake-wandering-line";

const SCRIPTS: Record<
  ScRbCirculatePriorityTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scRbCirculatePriorityShadowScript },
  "mistake-panic-brake": { kind: "mistake", script: scRbCirculatePriorityMistakePanicBrakeScript },
  "mistake-wandering-line": { kind: "mistake", script: scRbCirculatePriorityMistakeWanderingScript },
};

/**
 * Record one of the three drives against a loaded rb-mini-v1 document — the
 * TEMPLATE's staged waiting car armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScRbCirculatePriorityDrive(
  districtRaw: unknown,
  name: ScRbCirculatePriorityTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_RB_CIRCULATE_PRIORITY_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_RB_CIRCULATE_PRIORITY.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}

/** Geometry the drivability pins read back. */
export const SC_RB_CIRCULATE_PRIORITY_GEOMETRY = {
  MINI_R,
  DRIFT_R,
  DRIFT_OUT_BY_PHI_DEG,
  DRIFT_HOLD_TO_PHI_DEG,
  DRIFT_BACK_BY_PHI_DEG,
  DRIFT_BACK_R,
} as const;
