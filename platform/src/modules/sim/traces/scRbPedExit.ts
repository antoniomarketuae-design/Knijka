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
 * (4.06, −93) heading north; ring limit 30, arms 40; the exit zebra rbp-x-n at
 * (0, 30) on the north arm, leaving a 7.94 m stop pocket between the
 * circulatory carriageway's outer edge (r = 22.06) and the crossing. This drill
 * takes the SECOND (north) exit, peeling off the ring arc at φ ≈ 150° — the
 * peel sc-rb-circulate-priority proved on the identical ring.
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
 *  · THE ENTRY is the brisk flat NE chord the other rb-* drills proved: it
 *    sweeps the azimuth-from-centre past RB_ON_RING_DEG (35° — the roundabout
 *    tracker's ring-priority stand-down) fast, with only ~40° of TOTAL heading
 *    change (under the 55° turn window), so it is both quick to priority AND
 *    indicator-free-clean. It is taken only after the circulator is fully past
 *    the mouth (the 9 s wait), which is what YIELDED_TO_PRIORITY reads.
 *
 *  · THE POCKET is 7.94 m of tarmac and the stop has to land IN it. The shadow
 *    stops at (4.06, 27) — nose ~2 m short of the zebra, tail ~1.9 m clear of
 *    the ring band. The exit blend must therefore be COMPLETE by y ≈ 26, which
 *    is why EXIT_NORTH reaches the lane center at y = 26.0 and not later:
 *    stopping mid-blend would put the car across the pocket diagonally.
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

export const SC_RB_PED_EXIT_ID = "sc-rb-ped-exit";

/** South-arm northbound / north-arm outbound lane center (2-lane arms). */
const X_LANE = 4.06;
/** Ring centerline radius (rb-ped-v1 meta.scenario). */
const R = 18;
/** The exit zebra rbp-x-n on the north arm's centerline. */
const Y_CROSSING = 30;
/** The ring pace — the turn-detector ceiling, see the header. */
const RING_KMH = 12;
/** The stop in the pocket: nose short of the zebra, tail clear of the ring. */
const Y_POCKET = 27;

/** Ring point at circulation angle φ (degrees from the SOUTH node, CCW through
 * EAST — φ 90 = east, 180 = north, 270 = west): (R sin φ, −R cos φ). */
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

/**
 * The north-arm exit blend, from the φ = 150° peel onto the outbound lane
 * (x = +4.06 — heading north, the right-hand lane; the lane rbp-spawn-finish
 * sits in). It is COMPLETE at y = 26, which is what leaves the pocket a
 * straight-line stop rather than a diagonal one (the third envelope).
 */
const EXIT_BLEND: Array<[number, number]> = [
  [7.5, 19.0],
  [5.5, 22.0],
  [X_LANE, 26.0],
];

/**
 * The shared yield-and-enter opening: approach, wait the circulator past the
 * mouth, then take the brisk flat-chord entry that wins ring priority. Every
 * drive whose fault is NOT the entry reuses it verbatim.
 */
function cleanEntrySteps(): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60]], targetKmh: 30, stopAtEnd: false },
    {
      // Ease to a stop at the yield line (just inside the decision zone —
      // ring 18 + entry margin 12 = 30 m from the centre).
      kind: "drive",
      points: [[X_LANE, -60], [X_LANE, -40], [X_LANE, -27.5]],
      targetKmh: 16,
    },
    { kind: "annotation", textBg: "Кола се движи в кръга — тя е с предимство. Спри на линията и я пропусни." },
    { kind: "glance", mirror: "left" },
    // Wait the circulator fully PAST the mouth and onto the east arc (to the
    // driver's RIGHT) before committing — the yield the commendation reads.
    { kind: "pause", sec: 9.0, brake: true },
    { kind: "annotation", textBg: "Тя премина — влизаме плътно след нея, в нейния интервал." },
    { kind: "glance", mirror: "left" },
    {
      // FLAT-CHORD entry — see the header's second envelope.
      kind: "drive",
      points: [[X_LANE, -27.5], [6.0, -23.0], [8.5, -18.5], [11.0, -15.0], ring(48), ring(55)],
      targetKmh: 17,
      stopAtEnd: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scRbPedExitShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Днес кръговото е само половината. Другата половина е това, което те чака НА изхода.",
      },
      ...cleanEntrySteps(),
      {
        // Circulate the east arc past the FIRST exit (east, φ = 90) at the ring
        // ceiling. No indicator yet: a right lever here would tell the driver
        // waiting at the east mouth that this car is leaving.
        kind: "drive",
        points: ringRun(60, 100),
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
        // Ring to the φ = 150° peel, then the indicator-announced blend onto the
        // north arm — and STOP IN THE POCKET at y = 27: nose ~3 m short of the
        // zebra, tail ~1.9 m clear of the ring band. The step opens at φ = 110,
        // one ringRun stride past the previous step's φ = 100 end, so the path
        // stays C¹-smooth and no spurious turnStarted fires at the joint.
        kind: "drive",
        points: [...ringRun(110, 150), ...EXIT_BLEND, [X_LANE, Y_POCKET]],
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
      { kind: "pause", sec: 9.5, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Освободи цялото платно — чак сега тръгваме." },
      {
        // Over the now-clear zebra and out to the finish reference.
        kind: "drive",
        points: [[X_LANE, Y_POCKET], [X_LANE, 40], [X_LANE, 55]],
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

export function scRbPedExitMistakeThroughPedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Входът, обиколката и мигачът са изрядни — и точно затова грешката се гледа трудно.",
      },
      ...cleanEntrySteps(),
      {
        kind: "drive",
        points: ringRun(60, 100),
        targetKmh: RING_KMH,
        stopAtEnd: false,
      },
      // The indicator IS given — correct form. The ONLY graded fault is the
      // person on the zebra, so nothing else may be wrong with this drive.
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Очите още са върху колата в кръга. Пътеката отпред просто не е погледната…" },
      {
        // The SAME peel and blend as the shadow — and then straight THROUGH the
        // pocket and over the occupied crossing without a pause. She is still on
        // the western half (~4 m away, far outside the 1.5 m contact radius):
        // pure „непропускане", no collision to muddy the card.
        kind: "drive",
        points: [...ringRun(110, 150), ...EXIT_BLEND, [X_LANE, 40], [X_LANE, 55]],
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
