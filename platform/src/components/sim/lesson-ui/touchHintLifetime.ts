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
 * later in the manoeuvre cannot bring it back.
 *
 * ── AND THEN THE WHOLE CATALOGUE WAS DRIVEN, AND THE DISMISSED CASE TURNED OUT
 *    TO EXIST ───────────────────────────────────────────────────────────────────
 *
 * The paragraph above used to end „Had the drill crawled below the floor
 * throughout, this would have had to become accumulated path length instead; it
 * does not". One lesson was checked and the class was closed on it. Sweep 161
 * (`.audit-frames/sweep161`, 2026-08-17) then drove all 174 scenarios on both
 * platforms and both drive qualities and logged the cluster readout at every
 * sampled frame, so the class is now countable instead of assumed. Over the 224
 * mobile runs that carry speed samples:
 *
 *   213 runs cross 5 км/ч.  First crossing: p50 1 s, p90 2 s, WORST 15 s
 *                           (sc-lane-control-signal/mobile-right; then 12 s
 *                           sc-rx-tram-stop-doors/mobile-right, then 7 s).
 *    11 runs never read above it in ANY sample — top speed 0–1 км/ч. The
 *                           photographed one is sc-park-parallel-exit/mobile-
 *                           right: „POSITIVE CONTROL: 0 км/ч after 5 s of
 *                           throttle", and 04-t006s shows this card across the
 *                           interior mirror with the cluster at 0. That IS the
 *                           crawling parking drill this file had reasoned away.
 *
 * Reproduce both numbers from the run logs (no glob ending in a star-slash: this
 * is a block comment, and the sweep's own path would close it):
 *   grep -rhoE --include=run.log --include=log.txt \
 *     '\[04-t[0-9]+s\] +-?[0-9]+ км/ч' .audit-frames/sweep161
 *
 * TWO HONEST QUALIFICATIONS, because the temptation here is to overclaim.
 * FIRST, none of those 11 runs is a long drive: most ended within seconds and
 * one never rendered at all, so the ceiling below is not being sold as the fix
 * for a photographed three-minute lesson — the speed exit already is that.
 * SECOND, and this is the one that sets the margin: p50 = 1 s is a ROBOT's
 * reaction time. `tools/mobile/lesson-audit.mjs` opens the throttle the instant
 * the drive stage begins. A seventeen-year-old on a first lesson reads the
 * briefing, finds the pads and fumbles; nothing in this sweep measures how long
 * THAT takes. So 15 s bounds when the speed exit fires for the harness, and
 * bounds nothing at all for a student.
 *
 * ── THE SECOND EXIT: NOT A COUNTDOWN ON READING, A PROOF OF NON-IMMORTALITY ───
 *
 * The objection at the top of this file stands and is not walked back: a
 * countdown tuned to reading speed would replace the student's judgement with a
 * guess, and it would fire at a STANDSTILL, where this card occludes a mirror
 * with nothing moving in it and costs the least it ever costs. That is the
 * cheapest moment to leave the words up and the most expensive moment to delete
 * them, and any number chosen near a reader's pace gets that trade backwards.
 *
 * What is added instead is the guarantee the rule above cannot give on its own:
 * a ghost surface on the windscreen has a LAST moment, whatever the car does.
 * The number is set far outside every reading argument on both sides:
 *
 *   vs. reading  the card is 130 characters of Bulgarian in landscape (61 + 69),
 *                and `hud/HudToasts.tsx:60` carries this product's own figure for
 *                reading under driving load — „~15 chars/s", the one it spends on
 *                TEACHING_TOAST_TTL_MS = 8000. 130 ÷ 15 = 8.7 s, so two minutes
 *                is 13.8× the time this product itself budgets for these words.
 *                Nobody can call that a reading timer.
 *   vs. driving  8.0× the worst first-move in 213 measured mobile drives. A
 *                student eight times slower off the mark than the harness still
 *                gets the EVIDENCED exit — „you drove" — and not the timeout.
 *
 * So TOUCH_HINT_MAX_SHOWN_MS = 120 s. It is not expected to fire in a working
 * lesson and the measurement says it cannot; what it removes is the word
 * „never" from the sentence „the card will not leave on its own", which is the
 * sentence at the top of this file.
 *
 * IT IS THE POLL'S OWN CLOCK, NOT THE WALL'S, AND THAT DIRECTION IS DELIBERATE.
 * The scene must accumulate `TOUCH_HINT_POLL_MS` per DELIVERED tick rather than
 * read `Date.now()`, so that a backgrounded tab (where browsers throttle
 * intervals toward 1 Hz) or a paused lesson accumulates SLOWER than the wall and
 * the words outlive a screen nobody was looking at. Over-counting would delete
 * teaching; under-counting only leaves a card up on a stationary picture a
 * little longer.
 *
 * ⚠ THE CEILING IS NOT WIRED YET, AND THIS PARAGRAPH IS HERE SO NOBODY READS THE
 *   ONE ABOVE AS A DESCRIPTION OF WHAT SHIPS. As of this commit `LessonScene`
 *   still calls `touchHintStandsDown(sampleRef.current.speedKmh)` — the speed
 *   exit alone. The rule, its bounds and its proof live here; the three-line
 *   change that spends them lives in a file this lane does not own:
 *
 *     useEffect(() => {
 *       if (!showTouchHint) return;
 *       let shownMs = 0;                                   // + the clock
 *       const id = window.setInterval(() => {
 *         shownMs += TOUCH_HINT_POLL_MS;                   // + one tick
 *         if (touchHintShouldHide(sampleRef.current.speedKmh, shownMs))
 *           setShowTouchHint(false);                       // + both exits
 *       }, TOUCH_HINT_POLL_MS);
 *       return () => window.clearInterval(id);
 *     }, [showTouchHint]);
 *
 *   `__tests__/touchHintLifetime.test.ts`'s binding block asserts the CURRENT
 *   call, so it goes red the moment that edit lands — deliberately. Whoever
 *   makes it updates that assertion to `touchHintShouldHide(sampleRef.current
 *   .speedKmh, shownMs)` in the same commit, and the ceiling is live.
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
 * So there are THREE exits and only the first of them is allowed to remember:
 *
 *   «РАЗБРАХ»  read and acknowledged → hide AND persist (never again).
 *   car moves  hide for THIS drive only → the next lesson opens with it again,
 *              at a standstill, where it is legible and occludes nothing that
 *              is moving.
 *   2 min up   the same non-persisting hide, so that a car which never moves
 *              cannot make the card immortal. Same storage rule for the same
 *              reason: a clock running out is not a student saying he read it.
 *              (Awaiting the call-site change flagged above; the rule is here,
 *              the scene does not spend it yet.)
 *
 * The two automatic ones can only ever get the words out of the way. Neither can
 * decide, on the student's behalf, that they were read.
 *
 * WHAT THIS FILE STILL CANNOT DO. It shortens the occlusion from „the whole
 * lesson" to „the seconds before the car rolls", and — once the ⚠ wiring above
 * lands — to two minutes when the car never rolls at all. It does not choose the
 * corner: the corridor's geometry is written once in `lesson-ui/
 * PlayAreaStyles.tsx` from `modules/sim/hud/notifyColumn.ts`, and whether the
 * top-right corridor lands on the rear-view mirror is that file's question.
 *
 * AND IT IS NOT AN INPUT BLOCKER — THE CHARGE SHOULD BE DROPPED, NOT INHERITED.
 * Sweep 161 filed its two CRITICAL rows (sc-sp-harsh-brake, sc-speed-transition)
 * against this file on the theory that the card was „the most likely input
 * blocker" for a car that would not move. Two things refute it, and both are
 * checkable:
 *
 *   the source   the card's container is `pointer-events-none` (`LessonScene
 *                .tsx`, `[data-hud="touch-hint"]`) and the only element on it
 *                that takes a pointer is the «РАЗБРАХ» pill — one 44 px control
 *                in the top-right corridor, nowhere near the thumb pads. A card
 *                that cannot receive a touch cannot swallow one.
 *   the frames   the premise was wrong anyway. Both cars moved. sc-sp-harsh-
 *                brake/mobile-right reads 20 км/ч at 04-t001s (and 12, 13, 18
 *                at t028/t059/t092); sc-speed-transition/mobile-right reads
 *                19 км/ч at 04-t002s. The finding generalised from three late
 *                frames that happened to read 0. Under the speed exit both
 *                cards are gone inside two seconds.
 *
 * Whatever stops those two lessons finishing lives in the touch input path
 * (`TouchControls.tsx`) or the drive gate. It is not this card, and a lifetime
 * rule is not where it will be found.
 *
 * WHY THE FILE SITS HERE. Same reason as `sessionClock.ts` next door, in the
 * same words: importing `LessonScene.tsx` into a Node test drags in R3F, rapier
 * wasm and the district loader, so a decision that has to be checked cannot be
 * an expression at a call site inside it. `__tests__/touchHintLifetime.test.ts`
 * drives this pair AND reads `LessonScene.tsx` as source to prove the scene
 * actually binds them, because handlers nobody bound are the bug
 * `tapActivation.ts` exists to fix. (The header used to send that second half to
 * `../touchHintDismissal.test.ts`, which has never existed in this tree — a
 * citation to a file nobody can open is a claim nobody can check.)
 */

/**
 * The speed (km/h) at which the car counts as MOVING and the hint stands down.
 *
 * Not a new number: it is `DEFAULT_RULE_CONFIG.movingSpeedKmh` from
 * `modules/sim/rules/types.ts`, the threshold `rules/engine.ts` uses to decide
 * whether the driver is under way at all —
 *
 *   const moving = speed > cfg.movingSpeedKmh;        // rules/engine.ts:1228
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
 * angvel to zero as part of the teleport (`vehicle/VehicleSim.ts:637-638`), so a
 * rule that measures SPEED reads a respawned car as stopped — which it is.
 */
export function touchHintStandsDown(speedKmh: number): boolean {
  if (!Number.isFinite(speedKmh)) return false;
  return Math.abs(speedKmh) > TOUCH_HINT_MOVING_KMH;
}

/**
 * The last moment this card may stand on the windscreen, whatever the car does.
 *
 * Both bounds are measured, neither is picked (the derivation is in the header
 * under „A PROOF OF NON-IMMORTALITY"):
 *
 *   read time  130 landscape characters ÷ 15 chars/s — the product's own
 *              reading-speed figure, `hud/HudToasts.tsx:60`, the one it already
 *              spends on TEACHING_TOAST_TTL_MS — is 8.7 s. Two minutes is 13.8×
 *              that, so this cannot be mistaken for a reading countdown.
 *   worst move over the 213 mobile runs in sweep 161 that ever cross 5 км/ч, the
 *              LATEST first crossing is 15 s (sc-lane-control-signal/mobile-
 *              right). Two minutes is 8.0× that — and the 8× is the margin that
 *              covers the gap between the harness, which opens the throttle the
 *              instant the stage starts, and a student who does not. A ceiling
 *              set anywhere near the measurement itself would start firing on
 *              slow beginners, which is a check that credits everybody wearing
 *              the costume of a lifetime.
 */
export const TOUCH_HINT_MAX_SHOWN_MS = 120_000;

/**
 * Has the card been on screen so long that it is furniture rather than a hint?
 *
 * `shownMs` is ACCUMULATED POLL TIME, not wall-clock: the scene adds
 * `TOUCH_HINT_POLL_MS` per delivered tick, so time spent in a backgrounded tab —
 * where the interval is throttled to roughly 1 Hz — counts at roughly a tenth of
 * its real length, and the words survive a screen nobody was watching. The error
 * this design admits is „the card stayed up longer than 45 s on a picture that
 * was not moving"; the error it refuses is „the card vanished while the student
 * was elsewhere".
 *
 * A CLOCK THAT CANNOT BE READ IS FALSE, exactly as an unreadable speed is. NaN
 * and ±Infinity are not evidence that 45 s have passed, and the same rule holds
 * for both inputs of this pair: a broken number may leave the teaching on the
 * screen, and may never take it off.
 */
export function touchHintOutstayed(shownMs: number): boolean {
  if (!Number.isFinite(shownMs)) return false;
  return shownMs >= TOUCH_HINT_MAX_SHOWN_MS;
}

/**
 * The one call the scene makes: hide the hint yet?
 *
 * Two exits, OR'd, and the order of the arguments is the order of preference —
 * the speed exit is the evidenced one (a rolling car proved the words landed)
 * and in 213 of the 224 measured mobile runs it is the one that fires, within
 * 2 s at p90 and 15 s at worst. The ceiling is for the residue that measurement
 * found: the 11 runs where the car never once read above the floor, and any
 * future lesson that joins them.
 *
 * Neither writes `sim.touchHintSeen`. Both are „hide for this drive"; only
 * «РАЗБРАХ» is „and never again".
 */
export function touchHintShouldHide(speedKmh: number, shownMs: number): boolean {
  return touchHintStandsDown(speedKmh) || touchHintOutstayed(shownMs);
}
