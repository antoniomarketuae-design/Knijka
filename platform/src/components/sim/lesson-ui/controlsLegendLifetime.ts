/**
 * WHEN THE KEYBOARD LEGEND STOPS BEING A REFERENCE AND STARTS BEING A BLIND.
 *
 * THE DEFECT (catalogue sweep 2026-08-17, three PC frames of one cause).
 * `[data-hud="controls-help"]` — the «⌨ Клавиши · за напреднали» sheet — is
 * mounted `open` on every desktop lesson that does not open with the pre-drive
 * procedure (`LessonScene`: `defaultOpen={!touchOnly && !driveLockedAtMount}`)
 * and, until this file, had exactly ONE exit: the student clicking the pill.
 * It is also a GHOST surface (`GHOST_SURFACES` in `PlayAreaStyles`), i.e. its
 * `bg-background/80` is stripped to `transparent !important` and what is left is
 * bare type printed straight onto the street. So on every frame the sweep took
 * of a desktop drive, the top-left quarter of the windscreen was a list of key
 * caps over a building:
 *
 *   sc-junction-rhr   01-arrival — the sheet is open before the student has
 *                     touched anything, over the left third of the glass, in a
 *                     right-hand-priority lesson whose own step 1 is «първо
 *                     наляво, после НАДЯСНО». Ghost text on the facades.
 *   sc-follow-distance 04-t012s — 12 s in, 11 км/ч, car under way: STILL open,
 *                     still over the buildings, and the gear row has broken as
 *                     «скорости: към P / към» with an orphaned «D» below it.
 *   sc-jx-giveway-b1  01-arrival — open, and the shadow-ribbon legend («синя …
 *                     зелена …») is drawn across it, so two ghost text layers
 *                     overlap on the world.
 *
 * AND IT IS AT ITS SHORTEST EXACTLY WHEN IT IS IN THE WAY. While the
 * demonstration deck is open, `PlayAreaStyles` caps this panel so it does not
 * land on the deck — measured in the frames above, the cap leaves four of the
 * eleven essential rows visible and scrolls the rest. So mid-drive the sheet is
 * simultaneously occluding the road AND showing under half of what it is for.
 *
 * ── THE RULE, AND WHY IT IS NOT „COLLAPSE IT BY DEFAULT" ─────────────────────
 *
 * The component's own header carries the founder-facing reason the default is
 * open: „Collapsing it outright would hide the keyboard from a first-time
 * student who has no other way to discover the controls." That is still true at
 * a standstill, and nothing here touches it — a lesson still OPENS with the
 * sheet exactly as it did.
 *
 * What is new is that the sheet now has a lifetime, and it borrows the one the
 * first-run touch hint got for the identical failure next door
 * (`touchHintLifetime.ts`): the student drives. A list of key bindings is read
 * before the car rolls or not at all; a rolling car is proof the reading is
 * over. So the legend collapses to its pill the first time the car is genuinely
 * moving — at the rule engine's own floor for „moving" (`movingSpeedKmh`,
 * 5 km/h, `rules/types.ts`), so the legend's idea of „he is driving now" is the
 * grader's idea of it and the two cannot drift.
 *
 * ── THE HALF THAT IS EASY TO GET WRONG: IT MUST NOT FIGHT THE STUDENT ────────
 *
 * A student who reaches up mid-drive and re-opens the sheet has answered the
 * question this rule is guessing at. If the collapse were a standing condition
 * rather than a one-time event, that click would be undone within 250 ms and the
 * one control this panel has would look broken — the „auto-hide that will not
 * let you look" is the same crime as the panel that will not go away, pointing
 * the other way. So the automatic exit fires ONCE per mounted scene, is latched
 * in a ref, and after it has fired the poll never runs again for that lesson.
 *
 * Nor does it persist: there is no storage write here, deliberately. The pill is
 * a per-lesson piece of furniture and the next lesson opens with the sheet again,
 * at a standstill, where it is legible and covers nothing that is moving.
 *
 * WHAT THIS FILE STILL CANNOT DO. It ends the occlusion at the moment the car
 * rolls; it does not make the sheet legible in the seconds before that. The
 * missing panel is the UNPANEL register's deliberate choice (`GHOST_SURFACES`)
 * and the four-row cap is `PlayAreaStyles`' collision rule with the demo deck —
 * both are that file's questions, not this one's.
 *
 * WHY THE FILE SITS HERE. Same reason as `sessionClock.ts` and
 * `touchHintLifetime.ts` beside it, in the same words: importing
 * `LessonScene.tsx` into a Node test drags in R3F, rapier wasm and the district
 * loader, so a decision that has to be checked cannot be an expression at a call
 * site inside it. `__tests__/controlsLegendLifetime.test.ts` drives this pair and
 * also reads `LessonScene.tsx` as source to prove the scene actually binds them.
 */

/**
 * The speed (km/h) at which the car counts as MOVING and the legend collapses.
 *
 * Not a new number, and not a second opinion: it is
 * `DEFAULT_RULE_CONFIG.movingSpeedKmh` from `modules/sim/rules/types.ts`, the
 * threshold `rules/engine.ts` uses to decide whether the driver is under way at
 * all —
 *
 *   const moving = speed > cfg.movingSpeedKmh;        // engine.ts
 *
 * — and therefore the same line the first-run touch hint stands down at
 * (`TOUCH_HINT_MOVING_KMH`). Copied by value rather than imported so this stays
 * a Node-testable leaf with no dependency on the rules module; the test re-reads
 * the config's literal on every run, so the copy cannot drift in silence.
 */
export const CONTROLS_LEGEND_MOVING_KMH = 5;

/**
 * How often the scene checks (ms) — and only while the legend is open AND the
 * one-time collapse has not yet fired, i.e. for the seconds between the lesson
 * opening and the car rolling. Zero cost afterwards, zero on every touch-only
 * device (which starts collapsed) and zero on every pre-drive lesson.
 *
 * Slower than the hint's 100 ms on purpose. The hint is bare type over the
 * middle of a phone screen and every tenth of a second of it is a tenth of the
 * road; this is a corner panel on a desktop, and a quarter second is the cadence
 * this file's neighbours already poll cabin state at (`CABIN_POLL_MS`). It is
 * deliberately a poll and not a per-frame hook: this decides when a static list
 * folds itself away, and it must not add a line to the frame loop that grades.
 */
export const CONTROLS_LEGEND_POLL_MS = 250;

/**
 * Has the car moved enough that the key list is now only in the way?
 *
 * `Math.abs`, because reversing is driving: a student backing into a bay is as
 * far past reading key caps as one accelerating away, and `sim.speedKmh` being a
 * magnitude today must not be the reason a signed reading later makes the panel
 * immortal in R.
 *
 * NaN IS FALSE, AND THAT DIRECTION IS THE DELIBERATE ONE. A speed that cannot be
 * read is not evidence that the student is driving, and an unreadable number
 * must never be able to take a list of controls off the screen. It leaves the
 * legend exactly where a fresh scene leaves it — open, at a standstill,
 * collapsible by its own pill — which is the failure that costs nothing.
 *
 * A RESPAWN CANNOT TRIP THIS, for the same reason it cannot trip the hint: the
 * kill-plane rescue in `VehicleRig.tsx` teleports the car, and a rule that
 * measured DISTANCE would bank that jump as metres of driving. `VehicleSim.
 * reset()` zeroes linvel and angvel as part of the teleport, so a rule that
 * measures SPEED reads a respawned car as stopped — which it is.
 */
export function controlsLegendStandsDown(speedKmh: number): boolean {
  if (!Number.isFinite(speedKmh)) return false;
  return Math.abs(speedKmh) > CONTROLS_LEGEND_MOVING_KMH;
}
