/**
 * sc-rb-busy-gap — the authored drives (doc 76 §5/§9): ONE correct shadow
 * demonstration + TWO mistake demos for „Пролука в натоварено кръгово“ on the
 * committed rb-mini-v1 district, recorded with the template's OWN staged pair
 * (two roundaboutEntry cars, sc-rbg-lead + sc-rbg-follower — single truth,
 * imported from the template). The trace gate replays exactly these through the
 * production stack:
 *   - shadow: ZERO violations + the YIELDED_TO_PRIORITY commendation — the pair
 *     is waited out at the line and the ring is taken in the gap BEHIND it;
 *   - „Нахлуване пред циркулиращата кола“ grades EXACTLY FAILED_TO_YIELD;
 *   - „Влизане в твърде къса пролука“ grades EXACTLY FAILED_TO_YIELD +
 *     COLLISION.
 *
 * Geometry pinned to content/world/rb-mini-v1.json: ring centerline R = 18
 * around (0, 0), CCW (s → e → n → w); arm right-lane centers ±4.06; south spawn
 * (4.06, −93) heading north; ring limit 30, arms 40. This drill takes the SECOND
 * (north) exit, peeling off the ring arc at φ ≈ 150°.
 *
 * FOUR ENVELOPES DECIDE EVERY NUMBER BELOW — all four measured, not guessed:
 *
 *  · THE LEFT HALF-PLANE IS THE WHOLE GAME. FAILED_TO_YIELD (the runtime's
 *    roundabout tracker) fires when a MOVING car sits in the ring band AND in
 *    the driver's left half-plane (circulatingConflictFor: left · (car − player)
 *    ≥ 1.5) for YIELD_CONVICT_SUSTAIN_SEC = 0.9 s, while the driver is inward
 *    (≥ 0.3), moving (> 3 km/h) and not yet swept RB_ON_RING_DEG = 35° of
 *    azimuth. It is a HALF-PLANE, not a cone: at the mouth (heading 0) it is
 *    every ring point with x < 2.56 — over half the ring — and it ROTATES with
 *    the entry chord, so as the driver turns NE the north-east arc swings into
 *    it too. Only the SE/E arc is ever safe, and only briefly. Everything below
 *    is arithmetic on that one fact.
 *
 *  · THE CAR PACE IS PINNED AT 2.9 m/s, inherited from sc-roundabout-entry and
 *    re-proved here. Faster circulators sweep into the rotating left band
 *    mid-chord and convict an otherwise clean entry (measured on this district
 *    at 3.35 m/s). It is not a style choice, and it is also the exchange rate
 *    between the platoon's degrees and its seconds: 2.9 m/s on the 112.8 m lap
 *    is 9.27 °/s, a 39 s cycle, so the authored 26° offset is the 2.8 s gap the
 *    drill teaches you to refuse.
 *
 *  · THE RING PACE IS SET BY THE CAR AHEAD, not by the turn detector. This is the
 *    one dial that differs from the sibling ring drills (12 km/h) — see RING_KMH
 *    below for the measured °/s arithmetic. The detector's ceiling is real but
 *    slack here: it fires at |Σ heading deltas| > 55° over a sliding 3 s window
 *    inside a junction area, and the whole ring is junction area (the four mouths
 *    are intersection nodes ≤ 13.8 m from every ring point), which puts the wall
 *    at 20.7 km/h — twice this drill's pace.
 *
 *  · THE ENTRY IS A FLAT CHORD, not a ring-hugging arc: a nearly-straight NE
 *    line from the mouth to ~ring(48) sweeps the azimuth past the 35° stand-down
 *    in ~3 s with only ~40° of TOTAL heading change (under the 55° turn window),
 *    so it is both quick to ring priority AND indicator-free-clean.
 *
 * WHERE THE „4 s GAP" OF THE BACKLOG WENT (the honest note). The brief's
 * shadowPlan reads „crawls to the yield line, lets two ring cars pass, takes the
 * 4-second gap between them". Those two clauses cannot both be true — after two
 * cars have passed, the gap you take is by definition the one BEHIND them — and
 * the engine settles which half survives. The gap between the platoon's cars is
 * the TRAP, not the line: a car entering it is still mid-chord — inward, under
 * the azimuth stand-down, with the follower square in its rotating left band —
 * when the 0.9 s sustain expires, so it convicts and then it gets hit (measured;
 * that IS mistake demo 2). So the shadow does what the first clause says — waits
 * the platoon out and takes the gap behind it — and the „4-second gap between
 * them" is authored as the tempting wrong answer, at the 2.8 s the geometry
 * actually allows. The lesson the backlog was reaching for („пролуката се мери в
 * секунди, не в метри") survives whole, and the drill gains a sharper second
 * mistake — a driver who DID stop and DID yield once, and still got it wrong —
 * instead of a shadow that cannot exist.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_RB_BUSY_GAP } from "../lessons/scenario/templates-roundabout";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_RB_BUSY_GAP_ID = "sc-rb-busy-gap";

/** South-arm northbound lane center (2-lane arm, drawn lane 8.125 m). */
const X_LANE = 4.06;
/** Ring centerline radius (rb-mini-v1 meta.scenario). */
const R = 18;
/**
 * The ring pace — a STATION-KEEPING speed, and the one number this drill does not
 * share with its siblings. sc-roundabout-entry and sc-rb-circulate-priority both
 * circulate at 12 km/h; this one cannot, and the reason is that it is the only
 * ring drill that deliberately sits ~2.5 s BEHIND a car.
 *
 * Measured on rb-mini-v1: a staged circulator rides r ≈ 17.9 at cruise 2.9 m/s =
 * 9.27 °/s. The driver holds the ring centreline at r = 18, so 12 km/h is
 * 10.61 °/s — 1.34 °/s FASTER than the platoon. Over the ~10 s from the chord's
 * landing to the north exit that reels in ~13° of ring, and the driver rear-ends
 * the very car it correctly gave way to (COLLISION at t ≈ 32, measured, for every
 * launch phase up to φ = 32°). The siblings get away with 12 because their single
 * circulator is most of a lap ahead; here the whole point is to be right behind
 * it. 9.5 km/h = 8.40 °/s trails just under the platoon's own rate, so the gap
 * opens gently instead of closing — which is simply what following the car ahead
 * at ITS pace means. Both figures sit far under the 20.7 km/h turn-detector
 * ceiling: the ceiling is not what picks this number.
 */
const RING_KMH = 9.5;

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

/** The north-arm outbound lane (heading north, so the right-hand lane center is
 *  x = +4.06 — the same lane rbm-spawn-finish sits in at (4.06, 58)). */
const EXIT_NORTH: Array<[number, number]> = [
  [7.5, 19.0],
  [5.5, 22.0],
  [X_LANE, 26.0],
  [X_LANE, 40.0],
  [X_LANE, 58.0],
];

/**
 * The shared approach: roll down the south arm and come to REST on the yield
 * line at (4.06, −27.5). Arriving at rest is not decoration — it is what keeps
 * the whole wait innocent. The tracker arms at 30 m from the ring centre
 * (y ≈ −29.7 in this lane) and the pair is in the left half-plane for most of
 * the cycle, so any approach still rolling above RHR_MOVING_KMH (3) there is one
 * 0.9 s sustain away from a conviction. Stopped, the driver is untouchable —
 * and the drill's own „изчакай на линията" gate (≤ 6 km/h at y = −26) demands
 * exactly this anyway.
 */
function approachToLineSteps(): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60]], targetKmh: 40, stopAtEnd: false },
    { kind: "drive", points: [[X_LANE, -60], [X_LANE, -40], [X_LANE, -27.5]], targetKmh: 16 },
  ];
}

/**
 * The entry chord + the ring + the signalled north exit — the half of the drive
 * that is IDENTICAL in the shadow and in the barge demo, so that each demo
 * carries exactly ONE taught fault and never stacks a second on top.
 */
function ringAndExitSteps(): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "left" },
    {
      // FLAT-CHORD entry (the innocent-entry envelope — see the header).
      kind: "drive",
      points: [[X_LANE, -27.5], [6.0, -23.0], [8.5, -18.5], [11.0, -15.0], ring(48), ring(55)],
      targetKmh: 17,
      stopAtEnd: false,
    },
    {
      // The ring, flat and quiet, from the chord's landing past the east mouth
      // (φ = 90) — the first exit, which is not ours.
      kind: "drive",
      points: ringRun(60, 100),
      targetKmh: RING_KMH,
      stopAtEnd: false,
    },
    { kind: "indicator", setting: "right" },
    { kind: "glance", mirror: "right" },
    {
      // Ring to φ = 150° (the north peel-off point), then the gentle
      // indicator-announced blend onto the north arm's outbound lane. The step
      // opens at φ = 110, one ringRun stride past the previous step's φ = 100
      // end, so the path stays C¹-smooth and no spurious turnStarted fires at
      // the joint.
      kind: "drive",
      points: [...ringRun(110, 150), ...EXIT_NORTH],
      targetKmh: RING_KMH,
    },
    { kind: "indicator", setting: "off" },
    { kind: "pause", sec: 1.5, brake: true },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

/**
 * The wait at the line, in seconds, from the moment the car comes to rest there
 * (t = 12.25). THE dial of this template, and it is centred in a MEASURED window,
 * not guessed. The drive clock: the platoon arms at t ≈ 5.75 (the player passes
 * 60 m from the ring centre) and metronomes from there, so the lead crosses the
 * player's mouth at t = 15.8 and the follower at t = 18.6. Launching at
 * 12.25 + 10 = 22.25 puts the follower at φ = 33° and the lead at φ = 59°, and
 * the two walls sit at:
 *
 *   · φ_follower < 28° ⇒ COLLISION. The entry chord is a chord — it cuts ~6° of
 *     corner off the arc the follower rides — so the driver arrives on the ring
 *     having GAINED on it, and below 28° what is left is under the 3 m contact
 *     radius. (The wall moves with RING_KMH, which is the other half of the same
 *     closing-rate story: at 12 km/h it sits at 32°.)
 *   · φ_lead > 65° ⇒ FAILED_TO_YIELD, i.e. φ_follower > 38° at this platoon
 *     offset. Nothing to do with the follower: it is the LEAD, 60° up the ring
 *     and long gone, swinging into the driver's ROTATING left half-plane as the
 *     chord turns north-east — and convicting before the azimuth sweep reaches
 *     the 35° ring-priority stand-down.
 *
 * Clean run measured at φ_follower ∈ [28°, 38°]; 33° is its centre, ≈ 0.6 s of
 * margin either way. Also short enough to stay a decision rather than a vigil —
 * the „без вечно колебание" half of the objective, coached by parTimeSec 60.
 */
const SHADOW_WAIT_SEC = 10;

export function scRbBusyGapShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "В кръга има две коли, една след друга. И двете са с предимство — намаляваме отрано.",
      },
      ...approachToLineSteps(),
      {
        kind: "annotation",
        textBg: "Спираме на линията и гледаме наляво. Първата минава… но зад нея идва втора.",
      },
      { kind: "glance", mirror: "left" },
      {
        // The wait: both cars of the pair sweep through the mouth and out onto
        // the east arc. Stopped, so the left band is irrelevant (the tracker
        // needs > 3 km/h) — and the pause is what the „изчакай пролука" gate
        // reads. Braked: the ledger stays honest about why the car is still.
        kind: "pause",
        sec: SHADOW_WAIT_SEC,
        brake: true,
      },
      {
        kind: "annotation",
        textBg: "Пролуката между двете беше твърде къса. Тази ЗАД втората е истинската — влизаме решително.",
      },
      ...ringAndExitSteps(),
      {
        kind: "annotation",
        textBg: "Пропуснахме и двете, влязохме в реален интервал и излязохме с мигач — никой в кръга не намали заради нас.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Нахлуване пред циркулиращата кола“ (FAILED_TO_YIELD)
// ---------------------------------------------------------------------------

export function scRbBusyGapMistakeBargeScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: колата изобщо не намалява на входа — влиза пред първата циркулираща кола.",
      },
      { kind: "glance", mirror: "rear" },
      // The barger signals right (correct form — it takes the first exit), so
      // its ONLY graded fault is the refused priority.
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60], [X_LANE, -40]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "Първата кола в кръга приближава отляво… но нашата не спира." },
      {
        // Straight through the mouth at speed, cutting the lead off — the demo
        // freezes on the early ring right after the graded moment (driving on
        // with the cut-off car on the bumper would only stack unrelated noise
        // on top of the ONE taught mistake).
        kind: "drive",
        points: [[X_LANE, -40], [X_LANE, -26], [5.4, -21.5], [7.4, -18.3], ...ringRun(30, 60)],
        targetKmh: 22,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Влизащият НЯМА предимство: на входа стои Б1/Б2 (Б3 не се поставя там — Наредба № РД-02-21-1/23.11.2023, чл. 61, ал. 5), значи пропускаш движещите се в кръга (ЗДвП чл. 50, ал. 1) — дори с цената на пълно спиране на входа.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Влизане в твърде къса пролука“ (FAILED_TO_YIELD + COLLISION)
// ---------------------------------------------------------------------------

/**
 * The wait that ends one car too early: long enough to let the LEAD pass (t =
 * 15.8, so the demo is visibly NOT the barge — this driver did look and did give
 * way once), short enough that the launch at t = 18.75 lands in the platoon's
 * 2.8 s gap with the follower still 15° short of the mouth and square in the
 * driver's left band. Measured: the 0.9 s sustain expires at t = 19.1, mid-chord.
 */
const SHORT_GAP_WAIT_SEC = 6.5;

/**
 * The contact point, and it is MEASURED, not staged for effect. Replaying this
 * script with the production traffic system exposed (the same twin the trace gate
 * rebuilds) puts the follower 0.12 m from the driver at t = 23.40, with the
 * driver at (12.7, −12.9) — the two cars are in the same square metre, the
 * closest approach of the whole drive. The authored `collision` beat below sits
 * exactly there, so the ghost's crash depicts geometry rather than asserting it.
 */
const SHORT_GAP_CONTACT: [number, number] = [12.7, -12.9];

export function scRbBusyGapMistakeShortGapScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Този път входът започва правилно — колата спира и пропуска първата. Гледай КОЯ пролука взима после.",
      },
      ...approachToLineSteps(),
      { kind: "glance", mirror: "left" },
      {
        // Only the LEAD is waited out. That single act of patience is what makes
        // this the harder, more honest mistake: the driver знае правилото и все
        // пак не го е приложил докрай.
        kind: "pause",
        sec: SHORT_GAP_WAIT_SEC,
        brake: true,
      },
      { kind: "annotation", textBg: "Първата отмина — и кракът тръгва. Но на три секунди зад нея идва втора…" },
      {
        // The SAME flat chord as the shadow, taken one car too early: the
        // follower is square in the rotating left band for the whole sweep, so
        // the tracker convicts mid-chord (FAILED_TO_YIELD) — and then the two
        // paths intersect. The chord is truncated at the measured contact point.
        kind: "drive",
        points: [[X_LANE, -27.5], [6.0, -23.0], [8.5, -18.5], [11.0, -15.0], SHORT_GAP_CONTACT],
        targetKmh: 17,
        stopAtEnd: false,
      },
      {
        // The AUTHORED consequence (the S1 mistake-demo seam), and the reason it
        // has to be authored: the RoundaboutEntryRunner owns a contact branch of
        // its own, but it never reaches it here — both runners resolve the moment
        // the runtime's roundabout tracker emits the violation at t = 19.1, and a
        // resolved runner stops stepping. The priority fault ALWAYS lands 4 s
        // before the crash it causes, so on this encounter the crash can only be
        // authored. The trace gate proves the geometry independently rather than
        // taking this step's word for it.
        kind: "collision",
        withWhat: "vehicle",
      },
      {
        kind: "annotation",
        textBg: "Втората кола нямаше къде да отиде — пролуката така и не беше пролука.",
      },
      // The demo ENDS on the impact. 1.2 s is enough to render the beat and to
      // drain the authored contact into a tick, and it is deliberately under the
      // 1.5 s standstillGapSustainSec: the follower's playerGuard parks it against
      // the wreck, so a longer freeze bills the driver a second, unrelated
      // второстепенна („bumper-kissing at a standstill") for standing too close to
      // the car it has just hit. That is the engine narrating the aftermath, not
      // the taught fault — the same reason sc-roundabout-entry's barge demo cuts
      // the moment its priority fault lands.
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "„Пропусни движещите се в кръга“ не значи „изчакай една кола“. Влизаш само когато никой в кръга не трябва да намалява заради теб (ЗДвП чл. 50, ал. 1).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRbBusyGapTraceName = "shadow-correct" | "mistake-barge-lead" | "mistake-short-gap";

const SCRIPTS: Record<ScRbBusyGapTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scRbBusyGapShadowScript },
  "mistake-barge-lead": { kind: "mistake", script: scRbBusyGapMistakeBargeScript },
  "mistake-short-gap": { kind: "mistake", script: scRbBusyGapMistakeShortGapScript },
};

/**
 * Record one of the three drives against a loaded rb-mini-v1 document — the
 * TEMPLATE's staged pair armed (single truth), ambient traffic zero (the harness
 * law). Deterministic: same district → same trace.
 */
export function recordScRbBusyGapDrive(
  districtRaw: unknown,
  name: ScRbBusyGapTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_RB_BUSY_GAP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_RB_BUSY_GAP.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
