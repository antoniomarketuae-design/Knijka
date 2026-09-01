/**
 * WHICH MIRROR IS WORTH RENDERING THIS FRAME — the decision half of MirrorRig,
 * split out the way `mirrorPass.ts` and `mirrorInstanceCull.ts` already are, so
 * "the left door mirror is alive on the preset a student actually gets" is a
 * unit test and not a promise.
 *
 * ── THE DEFECT, MEASURED ON THE DEPLOYED BUILD (2026-08-16) ─────────────────
 *
 * Founder: „the left door mirror is a featureless matte-black pod with no glass
 * and no reflection". It is, and the mechanism was one function in MirrorRig:
 * `activeKindsFor()` returned `["rear"]` for BOTH `medium` and `low`, so the
 * door glass kept its authored dark-gloss material and never carried a pass.
 *
 * That is not a corner case, it is the default everywhere:
 *   · `lesson-ui/types.ts` DEFAULT_PRESET is `medium`;
 *   · `environment/quality.ts` `autoQualityCeiling()` HARD-CAPS every
 *     touch-only device at `med` — doc 82 §2.2's dpr ruling — so no phone can
 *     ever reach `high`, whatever it measures. The founder plays on a phone.
 *
 * MEASURED, iPhone-16 landscape, `sc-vp-handbrake` L1, the SAME 105 × 95 px
 * rect of left-door glass in every run (the mirror is rigid to the car, so at
 * the same held-left glance it lands on identical screen pixels — only the
 * reflected content differs):
 *
 *     preset            mean L    median L   near-black (L < 20)
 *     medium (shipped)    23.3        0            73.9 %
 *     auto   (→ medium)   18.3        0            72.1 %
 *     high               109.4      108             0.9 %
 *
 * The median pixel of the mirror a student is told to check is literally ZERO.
 * At `high` the same rect carries road, kerb, lane dashes and a bus.
 *
 * ── WHY THE ANSWER IS NOT „TURN THE DOORS ON EVERYWHERE" ────────────────────
 *
 * Because the budget MirrorRig's header defends is real: one 256×96 rear pass
 * measured 0.61–1.13 ms of a 2.4–3.2 ms GPU frame at phone dimensions on `low`
 * — 25–34 % of the whole tier-low GPU budget. Two more free-running door passes
 * would be the 0d1c922 FPS regression again.
 *
 * The way out is a fact about where the door mirrors ARE. `cabinLook.ts` has
 * measured it: at the driving pose the LEFT door mirror's centre projects at
 * frame-x **−0.005** (outside the left edge) and the RIGHT at **1.358** (a
 * third of a screen past the right edge). NEITHER door mirror is in the picture
 * while the student is looking where he drives. A pass that refreshes them on
 * every frame of every drive is rendering, at real cost, into two quads nobody
 * can see — and then going dark in the one moment they can.
 *
 * So the pass follows the head: a door mirror renders while the driver is
 * LOOKING THROUGH IT and not otherwise. Two ways to be looking through it, and
 * both must count, because both really exist in this cockpit:
 *   · the graded glance — Q/E, or the mirror hotspot, latched by
 *     `CabinControls.glance()`. Held at full deflection while the key is down;
 *   · the mouse-driven CABIN LOOK pose `mirrorLeft` / `mirrorRight`
 *     (`cabinLookStore`), which is how a student reaches the right door mirror
 *     at all — it is a third of a screen off the edge, so `cabinLook`'s reach
 *     table sends him there. Gating on the glance ALONE would have left the
 *     mouse path staring at dark gloss, which is the same defect wearing the
 *     other input device.
 *
 * Cost of this rule: zero on every frame no student is glancing, and one
 * 160×96 reduced-scene pass on the cadence below when he is. `high` is left
 * free-running exactly as it was, so nothing that works today gets slower.
 *
 * GRADING IS UNTOUCHED, and this module cannot touch it: the graded mirror
 * check is the `glance()` press, not the picture. This decides pixels only.
 */

import type { CabinLookPoseId } from "./cabinLook";

export type MirrorKind = "rear" | "left" | "right";
/**
 * What the driver is LOOKING AT this frame — which is not always a mirror.
 * `shoulder` is the blind-spot check (scene/cabin.ts `MirrorGlanceKind`): the
 * head goes past the B-pillar and out the left rear quarter, where no glass on
 * this car is in frame. It is admitted here rather than being filtered by every
 * caller so the invariant cannot be lost at a call site — the equality below
 * simply never matches a `MirrorKind`, so a shoulder check schedules no mirror
 * pass and marks no glass attended. Widening `MirrorKind` itself would instead
 * have rendered a door mirror as ATTENDED for a look that never reached it.
 */
export type HeldLook = MirrorKind | "shoulder";
export type MirrorQuality = "low" | "medium" | "high";

export const MIRROR_KINDS: readonly MirrorKind[] = ["rear", "left", "right"];

/** A frame cadence: render on frames where `frame % interval === phase`. */
export interface MirrorCadence {
  interval: number;
  phase: number;
}

/**
 * Per-mirror cadence at `medium`/`high`. Phases are DISJOINT — rear owns the
 * even frames, the doors own 1 and 3 mod 4 — so at most one mirror pass can
 * ever run in a frame. That invariant is asserted by the test, not assumed:
 * it is the only thing standing between this rig and three full district
 * re-renders in one frame.
 */
export const MIRROR_CADENCE: Record<MirrorKind, MirrorCadence> = {
  rear: { interval: 2, phase: 0 },
  left: { interval: 4, phase: 1 },
  right: { interval: 4, phase: 3 },
};

/**
 * `low`'s cadences.
 *
 * THE REAR'S 8 IS UNTOUCHED, and its rationale moved here with it rather than
 * being deleted (doc 91 §I21 / §D12f, 2026-08-12, originally 4): the pass is a
 * FIXED 256×96 target, so unlike the main pass its cost does not shrink with
 * the viewport. Measured at phone dimensions, tier low, it was **0.61–1.13 ms
 * of a 2.4–3.2 ms GPU frame — 25–34 % of the whole tier-low GPU budget for 7 %
 * of the canvas pixels**. With §I19 (frameloop="demand" behind a card) landed
 * it was the largest single remaining per-frame GPU line at `low`, exactly as
 * §J-10 predicted. What that cut costs, stated: the rear glass refreshes
 * ~7.5×/s instead of ~15×/s on the tier where it is smallest and dimmest. It
 * is still a live mirror — a tailgater lesson stays playable (doc 62 #44).
 *
 * THE DOORS GET 8 AS WELL — deliberately not the 4 they use on medium. Against
 * the numbers above, a door refreshing twice as often as the safety-critical
 * rear mirror would be backwards. And unlike the rear they are not paying it
 * continuously: `selectMirrorPass` only reaches them while the head is turned
 * their way, so on `low` the honest description is „one extra 160×96 pass at
 * ~7.5 Hz, for the second or two a glance lasts".
 *
 * Phases 2 and 6 stay clear of the rear's 0, so the one-pass-per-frame
 * invariant survives on low too (0,8,16… vs 2,10,18… vs 6,14,22…). The test
 * sweeps that rather than trusting this sentence.
 */
export const LOW_MIRROR_CADENCE: Record<MirrorKind, MirrorCadence> = {
  rear: { interval: 8, phase: 0 },
  left: { interval: 8, phase: 2 },
  right: { interval: 8, phase: 6 },
};

export function mirrorCadenceFor(preset: MirrorQuality, kind: MirrorKind): MirrorCadence {
  return preset === "low" ? LOW_MIRROR_CADENCE[kind] : MIRROR_CADENCE[kind];
}

/**
 * Which mirrors get a render target at all.
 *
 * ALL THREE, ON EVERY TIER — this is the line that used to read
 * `["rear"]` for medium and low. The tier no longer decides WHETHER a door
 * mirror can ever show anything; it decides how often it refreshes while the
 * driver is looking through it (`mirrorCadenceFor`) — see the header.
 *
 * Memory cost of the two door targets, stated: 160×96 RGBA16F + depth each,
 * ~0.25 MB on top of the rear's ~0.2 MB. That is the whole price on `low`,
 * and it buys the mirror the exam grades him for checking.
 */
export function mirrorKindsFor(_preset: MirrorQuality): readonly MirrorKind[] {
  return MIRROR_KINDS;
}

/** The cabin-look pose that aims the head at a door mirror. Mirrors
 *  `cabinLook.CABIN_LOOK_FOR_HOTSPOT`'s entries for the two door hotspots. */
export function doorLookPose(kind: "left" | "right"): CabinLookPoseId {
  return kind === "left" ? "mirrorLeft" : "mirrorRight";
}

/**
 * Is the driver looking through this mirror right now?
 *
 * The REAR mirror is always `true`: it sits above the dash inside the
 * windscreen frame and is in the picture at the driving pose — it is the
 * tailgater instrument (doc 62 #44) and must never depend on being asked for.
 * Only the two door mirrors, which are off-frame at rest, follow the head.
 *
 * `glanceStrength > 0` rather than `=== 1` on purpose: the envelope is still
 * non-zero through the ease-out (`GLANCE_EASE_S`, and the cabin keeps the
 * mirror kind set through it), so the glass stays live while the head swings
 * home instead of going black under a moving eye.
 *
 * AND `> 0` RATHER THAN „is a mirror kind set at all", which would also have
 * worked and would have been one frame quicker. Read out of `GlanceHold`:
 * `start()` sets `mirror` but leaves `env` at 0 until the first `update()`, and
 * the ease-out clears `mirror` only once `env` reaches 0 — so a non-null
 * `mirror` really does mean „a glance is in progress", and gating on it alone
 * would cover the press frame too. The strength test is kept because this is a
 * BUDGET gate: if anything ever leaves `mirror` set without an envelope, the
 * kind-only version pays for a door pass on every frame forever, while this
 * version simply stops. What it costs is one frame at 60 Hz (16 ms) at the
 * instant the head has not yet moved and the door mirror is still off-frame.
 */
export function mirrorIsAttended(
  kind: MirrorKind,
  glanceMirror: HeldLook | null,
  glanceStrength: number,
  lookPose: CabinLookPoseId,
): boolean {
  if (kind === "rear") return true;
  if (glanceMirror === kind && glanceStrength > 0) return true;
  return lookPose === doorLookPose(kind);
}

/** Bit per kind, so `selectMirrorPass` can be told which targets have never
 *  been rendered without the caller allocating a Set every frame. */
export const MIRROR_BIT: Record<MirrorKind, number> = { rear: 1, left: 2, right: 4 };

/**
 * The one mirror to render this frame, or null.
 *
 * Positional args and no object literal: this runs inside `useFrame` and must
 * not make the caller allocate — the same rule `engine/glanceView.ts` states.
 *
 * `unprimedMask` is the PRIMING escape hatch and it is not decoration. The RTT
 * material is swapped onto the glass when the rig mounts, so a door target that
 * has never been rendered would show an uninitialised buffer the first time the
 * student turns his head — a black quad, i.e. exactly the defect this module
 * exists to remove, surviving into the first glance of every lesson. A mirror
 * whose bit is still set is therefore eligible on its own phase regardless of
 * attention; two passes, once per scene, and then the rule takes over.
 */
export function selectMirrorPass(
  frame: number,
  preset: MirrorQuality,
  glanceMirror: HeldLook | null,
  glanceStrength: number,
  lookPose: CabinLookPoseId,
  unprimedMask: number,
): MirrorKind | null {
  for (const kind of MIRROR_KINDS) {
    const c = mirrorCadenceFor(preset, kind);
    if (frame % c.interval !== c.phase) continue;

    // `high` keeps the free-running doors it has always had — this lane adds
    // the tiers that had none and changes nothing that already works.
    //
    // ── 2026-08-15, AND THE ATTENTION GATE STAYS ────────────────────────────
    // A review pass proposed free-running the doors here at every preset, to
    // kill the stale-frame problem noted below. The measurement in
    // `mirrorAttention.test.ts` («eyes forward and no glance = not one door
    // pass») refused it, correctly: one 256×96 rear pass is 0.61–1.13 ms of a
    // 2.4–3.2 ms tier-low GPU frame, so two more free-running door passes
    // roughly DOUBLE the GPU frame on the tier the founder has already called
    // "brutally low". That is the 0d1c922 FPS regression, re-bought.
    //
    // THE RESIDUAL IS REAL AND IS NOT SOLVED BY RENDERING MORE. Between the
    // priming frame and the first glance, a door mirror holds the spawn
    // moment's reflection, and the doors are NOT fully off-frame at rest —
    // measured at ~47% of the left mirror's width on screen at the `forward`
    // pose, against this module's own "off-frame at rest" premise. A crisp
    // stale reflection reads as a live one, and a mirror that lies about what
    // is beside you is worse for a learner than glass that is visibly off.
    //
    // The cheap fix is on the MATERIAL, not the render budget: leave the door
    // glass on its inert material until the mirror is first attended, so the
    // unattended state is honestly blank rather than honestly-shaped and
    // wrong. That is a rig change (VitokCockpit's material swap), it needs its
    // own frame to verify by eye, and it is recorded rather than rushed.
    if (preset === "high") return kind;
    if ((unprimedMask & MIRROR_BIT[kind]) !== 0) return kind;
    if (mirrorIsAttended(kind, glanceMirror, glanceStrength, lookPose)) return kind;
  }
  return null;
}
