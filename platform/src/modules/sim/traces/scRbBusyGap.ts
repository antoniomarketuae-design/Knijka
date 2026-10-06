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
 * READ THIS FIRST (2026-10-05). The first envelope below — «THE LEFT
 * HALF-PLANE IS THE WHOLE GAME» — and every later sentence that speaks of the
 * 0.9 s sustain or of a car «in the driver's left band» convicting describe
 * the grader these drives were AUTHORED AGAINST: one that billed an entry on
 * where a circulating car was. It is gone. Founder ruling 2026-10-05, «bill
 * forced braking»: an entry is FAILED_TO_YIELD when a circulating car has to
 * BRAKE because of it (the car's own account, runtime/worldRuntime.ts §4c) or
 * is touched — and for no other reason. The drives did not have to move for
 * that, except two: the barge, which under the old grader was billed for a car
 * it outran, is re-staged (BARGE_KMH); and the short gap, which drove into the
 * side of a car that was already going by, is re-staged to take the gap in
 * FRONT of the follower (SHORT_GAP_WAIT_SEC — round 4 of the ruling: yielding
 * is about the mouth he enters by and the cars that had not yet passed it).
 * What each drive is billed on now:
 *
 *   shadow      nothing — no car on the ring loses any speed because of it
 *               (the trace gate measures that against a world without him);
 *   barge       the LEAD has to brake, 0.4 s after his nose is on the ring;
 *   short gap   the FOLLOWER has to brake, at t = 20.87 — its tail still
 *               1.4 m short of his mouth — and the two bodies meet on the next
 *               frame (20.88): FAILED_TO_YIELD, then COLLISION. Its guard
 *               looks down its own lane and he comes at it from the side, so
 *               it brakes late and hard: 2.90 m/s to a stop.
 *
 * The paragraphs are kept because the geometry in them is still true and the
 * phasing arithmetic still explains where every car is.
 *
 * FOUR ENVELOPES DECIDED EVERY NUMBER BELOW — all four measured, not guessed:
 *
 *  · THE LEFT HALF-PLANE WAS THE WHOLE GAME. FAILED_TO_YIELD (the runtime's
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
 * line at (4.06, −27.5). Arriving at rest is what the drill's own „изчакай на
 * линията" gate (≤ 6 km/h at y = −26) demands. (It used to be what kept the
 * wait innocent, too: under the presence grader any approach still rolling
 * above 3 км/ч inside 30 m of the ring was one 0.9 s sustain away from a
 * conviction. Since 2026-10-05 no approach is billed, rolling or not — only an
 * entry that makes a circulating car brake.)
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
 *     offset — a wall that NO LONGER EXISTS (2026-10-04). Nothing to do with the
 *     follower: it was the LEAD, 60° up the ring and long gone, swinging into
 *     the driver's ROTATING left half-plane as the chord turns north-east — and
 *     convicting before the azimuth sweep reaches the 35° ring-priority
 *     stand-down. It billed a driver who waited 11–15 s, merged BEHIND the whole
 *     platoon and forced nobody to slow (sc-rb-busy-gap:a6f83f6b / 8f50287b,
 *     «the scoring punishes patience»). `circulatingConflictFor` clause (R)
 *     DEPARTING AND CLEAR now drops a car that has already passed his entry, so
 *     the clean L1 window runs from the 10 s wait to the platoon's next lap
 *     (measured 10–32.5 s on the live chain; 33 s+ is the ring coming round
 *     again, honestly billed).
 *
 * The 10 s wait sits at the bottom of that window — the collision wall above is
 * the one still standing — and it stays short enough to be a decision rather
 * than a vigil: the „без вечно колебание" half of the objective, coached by
 * parTimeSec 60.
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

/**
 * THE BARGE'S ONE SPEED, км/ч — held from the spawn to the ring, because the
 * card says so («Колата дори не намали на входа: влезе в кръга с непроменена
 * скорост пред първата циркулираща кола») and the demo has to be that drive.
 *
 * RE-STAGED 2026-10-05 (founder ruling «bill forced braking»: „The lesson own
 * "barge" demo gets re-staged so it really cuts someone off"). The old barge
 * came through the mouth at 22 км/ч with the lead ~11 m behind its merge point
 * and outran it: the lead held 2.90 m/s to the end, nobody had to brake, and
 * the drive was «a priority fault» only to a grader that convicted on where a
 * car WAS. Judged by what happened it is an entry nobody paid for.
 *
 * The platoon is a metronome from the moment the driver passes 60 m from the
 * ring centre (the sync is pinned out — see the template), so WHEN he reaches
 * the ring is set by this speed alone, on every rung and under every seed.
 * MEASURED on the live chain, identical at L1–L5:
 *
 *   12 км/ч  the lead is in the mouth as he arrives — COLLISION (0.1 m)
 *   14       he merges ~7 m ahead of it; the lead sheds 2.47 m/s
 *   15       ~8 m ahead; the lead sheds 1.08 m/s (2.90 → 1.82)   ← authored
 *   16       ~9 m ahead; the lead sheds 0.60 m/s
 *   17 +     he is clear ahead of it: nothing is forced, nothing is billed
 *
 * 15 is the middle of the band in which the lead really has to brake and the
 * two cars never touch (nearest 6.2 m). The conviction lands 0.4 s after his
 * nose is on the ring, on the lead's own braking.
 */
const BARGE_KMH = 15;

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
      {
        kind: "drive",
        points: [[X_LANE, -93], [X_LANE, -60], [X_LANE, -40]],
        targetKmh: BARGE_KMH,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Първата кола в кръга приближава отляво… но нашата не спира." },
      {
        // Straight through the mouth at the same speed, right in front of the
        // lead — which has to brake (the graded moment). The demo freezes on
        // the early ring right after it (driving on with the cut-off car on
        // the bumper would only stack unrelated noise on top of the ONE taught
        // mistake).
        kind: "drive",
        points: [[X_LANE, -40], [X_LANE, -26], [5.4, -21.5], [7.4, -18.3], ...ringRun(30, 60)],
        targetKmh: BARGE_KMH,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Влизащият НЯМА предимство: на входа стои Б1/Б2 (Б3 не се поставя там — Наредба № РД-02-21-1/23.11.2023 за пътните знаци), значи пропускаш движещите се в кръга (ЗДвП чл. 50, ал. 1) — дори с цената на пълно спиране на входа.",
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
 * way once), short enough that the launch at t = 17.85 lands in the platoon's
 * 2.8 s gap IN FRONT of the follower.
 *
 * RE-STAGED 2026-10-06 (founder ruling 2026-10-05, round 4), 6.5 s → 5.6 s. With
 * 6.5 s his nose came onto the ring at t = 20.90 with the follower's body
 * already ACROSS his mouth (its tail 1.3 m short of it); the follower went by
 * without lifting and he drove into its rear quarter at 21.78, 0.4 s after its
 * tail had cleared the mouth. Judged at the mouth, that is running into a car
 * that has gone by — a collision, not «влезе пред кола» — and the demo no
 * longer committed the fault its card names. A second less at the line puts
 * him where the lesson says he is. Measured (live chain, L1–L5):
 *
 *   t 20.00  his nose is on the ring: the lead's tail 4.2 m PAST his mouth,
 *            the follower's tail 3.9 m SHORT of it (its nose at the mouth)
 *   t 20.87  the follower has lost 0.3 m/s to him, 1.4 m short of clearing the
 *            mouth — FAILED_TO_YIELD — and brakes on to a stop
 *   t 20.88  the two bodies overlap — COLLISION
 *
 * The window, on this chord: 5.5–5.7 s gives this picture on every rung. At
 * 5.4 s the follower has stopped by the time they meet and the live chain bills
 * the fault without the crash; from 5.8 s the touch comes within half a metre
 * of the follower clearing the mouth.
 */
const SHORT_GAP_WAIT_SEC = 5.6;

/**
 * The contact point, and it is MEASURED, not staged for effect: replaying this
 * script through the live chain (and through the trace gate's own traffic twin)
 * the driver's body and the follower's first overlap at t = 20.88 with the
 * driver at (8.27, −18.91), on the chord between (6, −23) and (8.5, −18.5). The
 * chord is cut there and the authored `collision` beat below sits exactly on
 * it, so the ghost's crash depicts geometry rather than asserting it.
 */
const SHORT_GAP_CONTACT: [number, number] = [8.27, -18.91];

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
        // The SAME flat chord as the shadow, taken one car too early: he comes
        // onto the ring in front of the follower, which has to brake for him
        // (FAILED_TO_YIELD) and still cannot avoid him (COLLISION, one frame
        // later). The chord is truncated at the measured contact point.
        kind: "drive",
        points: [[X_LANE, -27.5], [6.0, -23.0], SHORT_GAP_CONTACT],
        targetKmh: 17,
        stopAtEnd: false,
      },
      {
        // The AUTHORED consequence (the S1 mistake-demo seam). HISTORY: it had
        // to be authored when contact was a branch of the runner's own step() and
        // a resolved runner stopped stepping. The director's ContactSentinel has
        // billed the crash from the geometry since B81 (t = 20.88), so this beat
        // is redundant — it lands inside the same unbroken overlap and folds
        // into the same accident. Kept because the annotation copy is timed
        // against it; the trace gate proves the geometry independently.
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
