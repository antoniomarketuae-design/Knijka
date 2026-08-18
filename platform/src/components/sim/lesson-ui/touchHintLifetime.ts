/**
 * WHEN THE FIRST-RUN TOUCH HINT STOPS BEING A HINT AND STARTS BEING A WINDOW
 * BLIND.
 *
 * THE DEFECT (catalogue sweep 2026-08-16/17, four separate frames of one
 * cause). `[data-hud="touch-hint"]` — «Ляв палец — волан. Десен палец — нагоре
 * газ, надолу спирачка.» — is mounted from `shouldShowTouchHint()` at scene
 * mount and, until this file, had exactly ONE exit: the student pressing
 * «РАЗБРАХ». It is a GHOST surface (no panel, no scrim — `GHOST_SURFACES` in
 * PlayAreaStyles), i.e. bare type printed straight onto the world. So for as
 * long as nobody presses the button, the world underneath it is gone. What the
 * sweep photographed:
 *
 *   sc-park-night   the card sits on the interior rear-view MIRROR — in the one
 *                   lesson whose briefing grades mirror use — for 43 of 43
 *                   driving frames, 03-ready (11:31:46) → 07-end (11:35:25),
 *                   3 min 39 s. Cropping the same mirror out of 07b-menu.png
 *                   (menu open, card suppressed) shows a working mirror: lit
 *                   windows, trees, a kerb, the guide ribbon. ~70 % of the glass
 *                   was covered by the hint the entire lesson.
 *   sc-rx-unguarded the teal line lands across the face of a round red-bordered
 *                   speed-limit sign while the bottom bar says «знакът важи» —
 *                   the HUD hiding the one sign the HUD says to obey.
 *   sc-sig-…-live   «РАЗБРАХ» itself prints over a 50 sign; the red annulus and
 *                   the figure show THROUGH the translucent pill.
 *
 * AND THE ONE CONTROL THAT CLEARED IT WAS DEAD WHILE DRIVING. The button bound
 * `onClick` only, and `modules/sim/hud/tapActivation.ts` is a whole file about
 * why that is unreachable here: a `click` born of a touch is a COMPATIBILITY
 * MOUSE EVENT, dispatched only for the PRIMARY touch point, so with a thumb
 * already resting on a pedal pad the press produces `pointerdown → pointerup`
 * and no `click` at all. That file's own census names this button — „the
 * first-run touch hint's «Разбрах»" — as the last honest residue of the fix.
 *
 * The two compound into the shape the frames show: a student who is driving
 * cannot dismiss the card, and the card will not leave on its own. That is not
 * a hint. That is a sticker on the windscreen.
 *
 * ── THE RULE, AND WHY IT IS NOT A TIMER ──────────────────────────────────────
 *
 * A countdown would be a guess about how fast someone reads. The product has a
 * far better signal, and it is the one the hint is ABOUT: the student drives.
 * The words teach where the thumbs go; a rolling car is proof they landed. So
 * the hint stands down the first time the car is genuinely moving — and it
 * borrows the rule engine's own floor for "moving" (`movingSpeedKmh`, 5 km/h,
 * `rules/types.ts`) rather than inventing a second one, so the hint's idea of
 * "he is driving now" is the grader's idea of it and the two cannot drift.
 *
 * THE FLOOR WAS CHECKED AGAINST THE SLOWEST LESSON IN THE COMPLAINT, NOT
 * ASSUMED. A parking drill is the case where a duty threshold chosen for street
 * driving could plausibly never be reached — and sc-park-night is the very
 * lesson whose mirror this card was sitting on. Re-driven on the deployed build
 * through `tools/mobile/lesson-audit.mjs` (mobile/right, 2556 × 1179, the same
 * profile as the sweep's frames):
 *
 *   drive: top 29 км/ч · 25 full stops · final -1 км/ч
 *
 * 29 km/h against a 5 km/h floor, crossed in the first seconds of the drive.
 * So on the exact lesson that produced „43 of 43 driving frames, 3 min 39 s" the
 * card now leaves before the second sampled frame, and the twenty-five standstills
 * later in the manoeuvre cannot bring it back. Had the drill crawled below the
 * floor throughout, this would have had to become accumulated path length
 * instead; it does not, and a state machine nobody needs is not free.
 *
 * ── THE HALF THAT IS EASY TO GET WRONG: AN AUTO-EXIT MUST NOT DELETE THE
 *    TEACHING ──────────────────────────────────────────────────────────────
 *
 * `dismissTouchHint()` writes `sim.touchHintSeen` to localStorage — pressed
 * once, the hint is gone for good on that device. Wiring the automatic exit
 * into that same persistence would mean a student who mashed the pad without
 * reading a word never sees the instruction again, and the fix for an
 * over-eager overlay would have quietly become a way to lose a lesson. A false
 * failure and a false pass are the same crime pointing opposite ways.
 *
 * So there are TWO exits and they are deliberately not equal:
 *
 *   «РАЗБРАХ»  read and acknowledged → hide AND persist (never again).
 *   car moves  hide for THIS drive only → the next lesson opens with it again,
 *              at a standstill, where it is legible and occludes nothing that
 *              is moving.
 *
 * The automatic one can only ever get the words out of the way. It can never
 * decide, on the student's behalf, that they were read.
 *
 * WHAT THIS FILE STILL CANNOT DO. It shortens the occlusion from "the whole
 * lesson" to "the seconds before the car rolls"; it does not choose the corner.
 * The corridor's geometry is written once in `lesson-ui/PlayAreaStyles.tsx`
 * from `modules/sim/hud/notifyColumn.ts`, and whether the top-right corridor
 * lands on the rear-view mirror is that file's question, not this one's.
 *
 * WHY THE FILE SITS HERE. Same reason as `sessionClock.ts` next door, in the
 * same words: importing `LessonScene.tsx` into a Node test drags in R3F, rapier
 * wasm and the district loader, so a decision that has to be checked cannot be
 * an expression at a call site inside it. `__tests__/touchHintLifetime.test.ts`
 * drives this pair; `../touchHintDismissal.test.ts` proves LessonScene actually
 * binds them, because handlers nobody bound are the bug `tapActivation.ts`
 * exists to fix.
 */

/**
 * The speed (km/h) at which the car counts as MOVING and the hint stands down.
 *
 * Not a new number: it is `DEFAULT_RULE_CONFIG.movingSpeedKmh` from
 * `modules/sim/rules/types.ts`, the threshold `rules/engine.ts` uses to decide
 * whether the driver is under way at all —
 *
 *   const moving = speed > cfg.movingSpeedKmh;        // engine.ts:987
 *
 * — and therefore the exact line past which the belt, the lights and every
 * other duty of a driver in motion begin to be graded. Copied by value rather
 * than imported so this stays a Node-testable leaf with no dependency on the
 * rules module; `__tests__/touchHintLifetime.test.ts` re-reads the config's
 * literal on every run so the two cannot drift apart in silence.
 */
export const TOUCH_HINT_MOVING_KMH = 5;

/**
 * How often the scene checks (ms) while the hint is up — and only while it is
 * up. One property read off the per-frame vehicle sample, ten times a second,
 * for the few seconds between the briefing and the car rolling; zero cost for
 * the rest of the session and zero on every device that never shows the hint.
 * Deliberately a poll and not a per-frame hook: this decides when a piece of
 * type disappears, and it must not add a line to the frame loop that grades.
 */
export const TOUCH_HINT_POLL_MS = 100;

/**
 * Has the car moved enough that the gesture hint is now only in the way?
 *
 * `Math.abs`, because reversing is driving — and the reverse gesture («пусни
 * палеца и натисни пак надолу») is one of the three things this card teaches,
 * so a student performing it has demonstrated the card more completely than one
 * who merely rolled forward. `sim.speedKmh` is a magnitude today; the absolute
 * value costs nothing and means a signed reading later cannot make the hint
 * immortal in R.
 *
 * NaN IS FALSE, AND THAT DIRECTION IS THE DELIBERATE ONE. A speed that cannot
 * be read is not evidence that the student is driving, and an unreadable number
 * must never be able to remove an instruction from the screen. It leaves the
 * hint exactly where a fresh scene leaves it — up, at a standstill, dismissable
 * by the button — which is the failure that costs nothing.
 *
 * A RESPAWN CANNOT TRIP THIS, AND THAT IS A PROPERTY RATHER THAN LUCK. The
 * sweep's sc-park-night row is about the car being teleported back to spawn
 * mid-drive (the kill-plane rescue at `VehicleRig.tsx`), and a rule that
 * measured DISTANCE would have banked that jump as several hundred metres of
 * "driving" by a student who had done none. `VehicleSim.reset()` sets linvel and
 * angvel to zero as part of the teleport, so a rule that measures SPEED reads a
 * respawned car as stopped — which it is.
 */
export function touchHintStandsDown(speedKmh: number): boolean {
  if (!Number.isFinite(speedKmh)) return false;
  return Math.abs(speedKmh) > TOUCH_HINT_MOVING_KMH;
}
