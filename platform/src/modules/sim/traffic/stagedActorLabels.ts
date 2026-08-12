/**
 * A CAPTION ANCHORED TO A STAGED ACTOR — doc 87 B40(a).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROBLEM, AND WHY THE PRESCRIBED FIX WAS REFUSED
 * ─────────────────────────────────────────────────────────────────────────────
 * «Спане на зелено» teaches a fault by SHOWING somebody commit it: one car
 * standing at the far stop line of the same axis, on the same green, not
 * moving. The founder's sentence on it was „who ? who is sleeping on green".
 *
 * An earlier lane prescribed a brake-lamp fix and its own frame disproved it.
 * The staging is arithmetic, not opinion: the actor holds at `nodeIndex 1,
 * offsetM −29` on the path `sx-n-n → sx-n-c → sx-n-s`, i.e. arc 61 of a 150 m
 * leg, i.e. district y = +29, in the ONCOMING lane. Instruction 3 points at it
 * from y = −33.5. That is **62 m, NOSE-ON** — the student is looking at the
 * FRONT of the car. No rear cue reaches him: not a brake lamp, not a tail lamp,
 * not a hazard flash off the back. The gate's own words: „it is not a light on
 * the back of a car the student is looking at the front of."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT ACTUALLY CARRIES „THIS ONE IS NOT MOVING" AT 62 m
 * ─────────────────────────────────────────────────────────────────────────────
 * Measured, not assumed. A 1.8 m car at 62 m through this camera (hFOV 75.4°
 * over 1422 px) computes to 31 px wide, and the shipped frame measured 26. At
 * 26 px a car is a coloured smudge: you cannot read a lamp on it, you cannot
 * read which way it faces, and — the part that matters — you cannot tell it
 * apart from the other stationary smudges in the same frame (the 2026-08-03
 * look wave photographed exactly that: „a ~30 px dark shape among other
 * stationary vehicles"). Every cue that lives ON the car dies at that size.
 * Three things survive 26 px, and only three:
 *
 *   1. WORDS drawn at a size the DISTANCE cannot shrink — a billboarded card
 *      that grows with range so its APPARENT size stays constant. This is the
 *      B35 channel (`world/components/worldLabel.ts`), already built, already
 *      photographed being read at 43.7 m on the dead-signal head.
 *   2. WHERE the card is: it points down at ONE car, which answers „which
 *      one?" — the half of his question the copy alone could never answer.
 *   3. WHEN the card is there: it is armed ONLY while the actor is genuinely
 *      stationary and it drops the frame it starts to roll. The card cannot
 *      outlive its own claim, so „не помръдва" is never printed over a moving
 *      car. That is the honesty rule of this file and it is enforced in
 *      `TrafficLayer` by reading the actor's live speed, never a phase flag.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A WORLD PLANE AND NOT A HUD CARD
 * ─────────────────────────────────────────────────────────────────────────────
 * `worldLabel.ts` argues it for the signal head and every word transfers: four
 * register rows record DOM overlays painting over each other and over the very
 * thing they annotate. A world plane depth-TESTS, costs one draw, and cannot
 * collide with any HUD layer. It is also the only kind of caption that can
 * POINT — a HUD chip saying „look left beyond the junction" is what the
 * instruction card already said, and it is what did not work.
 *
 * WHY IT DOES NOT CHEAT THE DRILL. Nothing here is graded. The fault this
 * lesson scores is the STUDENT'S hesitation (`HESITATION_AT_GREEN`); the
 * sleeper is scenery with a teaching job (`templates-signals.ts` says so at
 * length, and its `slamAt` is deliberately off-map so the encounter never
 * adjudicates). Naming the demonstration cannot make the demonstration easier
 * to pass, because the demonstration is not the test.
 *
 * ADR-002 — THE LAW IS RETRIEVED, NOT RECALLED. The caption carries the rule's
 * NAME with no article number, byte-identical to the string the lesson's own
 * `teach.lawRef` already froze („ППЗДвП светлинни сигнали за регулиране на
 * движението"). The corpus does not hold ППЗДвП, so no number is invented —
 * the founder's standing ruling. `__tests__/staged-actor-label.test.ts` asserts
 * the two strings are the same bytes rather than trusting this paragraph.
 */
import type { StagedActorLabelKind } from "../contracts";
import type { WorldLabelCopy } from "../world/components/worldLabel";

/**
 * The authored captions, one per kind.
 *
 * The wording is the LESSON'S own, moved to where he is looking: instruction 3
 * already says «Колата там е с ЛИЦЕ към теб… Брой наум до три: зеленото ѝ
 * свети, а тя не помръдва». The card is that sentence, over that car.
 */
export const STAGED_ACTOR_LABELS: Readonly<Record<StagedActorLabelKind, WorldLabelCopy>> = {
  standingOnGreen: {
    headlineBg: "ТАЗИ КОЛА НЕ ТРЪГВА",
    line1Bg: "Зеленото ѝ свети, а тя стои",
    line2Bg: "Ето това е „спане на зелено“",
    lawRef: "ППЗДвП светлинни сигнали за регулиране на движението",
    // The colour of the signal she is ignoring. An amber or red accent here
    // would say „she has a reason", which is the opposite of the lesson.
    accent: "#66d97a",
  },
};

/**
 * Beyond this the caption is dropped rather than grown further, m.
 *
 * 120 m is chosen off the geometry rather than by taste: `sx-spawn-south` is at
 * y = −105 and the sleeper stands at y = +29, so the card has to survive 134 m
 * to be visible from the spawn — and it deliberately is NOT. The student should
 * meet the instruction card first and look for the shape himself; the caption
 * appears as he closes, and is comfortably present by y = −33.5 (62 m), which
 * is the pose instruction 3 points at.
 */
export const STAGED_ACTOR_LABEL_MAX_DIST_M = 120;

/**
 * Distance at which the card is drawn at 1:1 world size, m — the same 18 m as
 * the signal-head channel, so the two captions read at the same size on screen.
 */
export const STAGED_ACTOR_LABEL_REF_DIST_M = 18;

/**
 * Growth ceiling. The signal head's 3.4 holds apparent size out to 61 m and
 * this subject stands at 62; 6.0 holds it to 108 m, which covers the whole
 * window between `STAGED_ACTOR_LABEL_MAX_DIST_M` and the stop line. Past the
 * ceiling the card simply shrinks with distance like any other object.
 */
export const STAGED_ACTOR_LABEL_MAX_SCALE = 6;

/**
 * Roof height of a car body, m — where the card's tail points.
 *
 * The B35 caption anchored at the unscaled head height and rendered INSIDE the
 * housing: present in the scene graph, invisible in the frame, and it took a
 * measured placement dump to find. So this number is the fleet's, not a guess:
 * `vehicleFleet` seats every civilian body on the ground plane and the tallest
 * standard car crown sits at ~1.5 m.
 */
export const STAGED_ACTOR_LABEL_ROOF_M = 1.5;

/**
 * A staged actor is STANDING below this speed, m/s.
 *
 * 0.3 m/s is 1.1 km/h — under the traffic system's own creep noise and far
 * under the 4 km/h at which `BrakingLeadCarRunner` considers the player to be
 * moving. The card is gone within one frame of the actor pulling away.
 */
export const STAGED_ACTOR_LABEL_STILL_MPS = 0.3;
