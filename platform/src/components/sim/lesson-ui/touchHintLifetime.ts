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
 * THREE HONEST QUALIFICATIONS, because the temptation here is to overclaim.
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
 * THIRD, AND IT IS THE ONE THAT UNDERCUTS THE COUNT ITSELF (added by the
 * adversarial verifier, 2026-08-23). Sweep 161 was driven by a harness that
 * could accelerate and brake and COULD NOT STEER. When steering was taught and
 * the 92 worst lessons were re-driven, 13 of them turned out to be instrument
 * artifacts. So „11 of 224 never move" is a measurement of that instrument as
 * much as of the product, and it may not be quoted as a standing fact. On the
 * two sweeps that photograph the CURRENT build with a steering harness — the
 * same 174 mobile runs this file counts two sections down — every single run
 * crosses 5 км/ч, and the photographed exemplar (sc-park-parallel-exit) is not
 * in either sweep at all. That does not make the class empty. It makes its size
 * on the current build UNMEASURED, which is a different sentence and the only
 * one the tree supports.
 *
 * AND THE SAME 174 RUNS SAY THE PHOTOGRAPHED DEFECT IS ALREADY CLOSED ON THEM.
 * Scanning each run log's PAINTED list (the «·» lines) for the card's own words
 * («Ляв палец — волан…»): PAINTED at 03-ready in 174 of 174 runs, listed as NOT
 * ON THE GLASS at 01-arrival and 02-briefing in 174 of 174, and present in no
 * painted list from 04- onward in any run — 0 of 174. The speed exit, already
 * shipped, takes it off the glass before the first sampled driving frame, and
 * the mirror in those frames is clear. And the ON-GLASS window those runs leave
 * is 12.2 s min · 13.5 p50 · 14.9 p90 · 18.1 MAX (03-ready → first 04 frame,
 * same 174 runs, frame mtimes), so a 120 s ceiling could not have fired on ANY
 * of them even if it were wired — it is 6.6× the longest painted window the
 * catalogue currently produces. What is left for the ceiling is exactly the
 * population that is no longer countable here, which is the honest reason it is
 * still worth having and also the honest reason nobody should call wiring it
 * urgent.
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
 *                and `hud/HudToasts.tsx:72-73` carries this product's own figure for
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
 * read `Date.now()`: a throttled interval accumulates SLOWER than the wall, and
 * over-counting would delete teaching while under-counting only leaves a card up
 * on a stationary picture a little longer.
 *
 * ⚠ THIS PARAGRAPH USED TO NAME TWO CASES IT DOES NOT COVER, AND BOTH ARE
 *   CORRECTED RATHER THAN QUIETLY DROPPED, because a false reassurance in a file
 *   this long is worse than no sentence at all.
 *
 *   „a backgrounded tab … accumulates SLOWER"  TRUE AND NOT ENOUGH. A tenth of
 *      the rate still reaches 120 s after twenty minutes in a pocket, and no
 *      sweep in this repo has ever backgrounded a tab to check the tenth. That
 *      case is now answered where it belongs — `touchHintOnGlass` refuses a
 *      document whose `visibilityState` is `"hidden"`, so the rate is zero
 *      rather than merely assumed low.
 *   „or a paused lesson"                        SIMPLY WRONG, and it was never
 *      checked. `menuPaused` pauses PHYSICS (`LessonScene.tsx`,
 *      `physicsPaused={paused || menuPaused}`); it does not touch the interval,
 *      and the pause scrim is `z-20 bg-background` under a card that is `z-30`,
 *      so the card stays painted and the clock would run at full wall rate. That
 *      is left ALONE on purpose: on a pause screen this card is the most legible
 *      it ever is — opaque backdrop, nothing moving — so time there really is
 *      time in front of a reader. What was wrong was the reason given, not the
 *      behaviour.
 *
 * ── AND THE TICK THIS FILE USED TO PRESCRIBE COUNTED TIME THE CARD WAS NOT ON
 *    THE GLASS. 174 OF 174 MOBILE DRIVES. ──────────────────────────────────────
 *
 * The paragraph above is right about the CLOCK and was wrong about the
 * CONDITION. `shownMs += TOUCH_HINT_POLL_MS` — the increment this file
 * prescribed until now — advances on every delivered tick, and the poll is born
 * at scene mount, which is not the moment the card appears. The card is MOUNTED
 * throughout `01-arrival` and `02-briefing` and PAINTED in neither, because the
 * shell's own priority ladder hides it with `display: none` while the overlay
 * column speaks:
 *
 *   PlayAreaStyles.tsx:1224  [data-sim-compact="on"][data-sim-overlay-active="on"]
 *                            [data-hud="touch-hint"] { display: none }
 *                            — rank 1 is „the lesson talking": a graded fault, a
 *                            task, a teach card, and the ИНСТРУКЦИИ line that
 *                            every lesson opens with.
 *   PlayAreaStyles.tsx:1536  html[data-sim-car-sheet="open"] [data-hud="touch-hint"]
 *                            { display: none } — the ⚙ sheet is modal and wins.
 *
 * `showTouchHint` stays true through all of it (the ladder is a cascade rule,
 * not a state change), so the interval keeps firing and the old increment kept
 * counting. THE MEASUREMENT, from the sweeps that photograph the current build
 * (`.audit-frames/proof/frames` + `.audit-frames/rebase/frames`, 174 mobile
 * run.logs, 2026-08-22). `tools/mobile/lesson-audit.mjs` prints, per frame, what
 * the DOM holds and the picture does not — its `painted()` at :692 walks the
 * ancestor chain for display/visibility/opacity/content-visibility and then
 * demands a ≥1 px box:
 *
 *   ✗ NOT ON THE GLASS — touch-hint: Завърти телефона хоризонтално…
 *
 *   174 / 174 runs carry that line, at exactly two frames each — 348 in total,
 *   every one of them `01-arrival` or `02-briefing` and none anywhere else.
 *   Reproduce (written without a glob, because a star-slash would close this
 *   block comment):
 *     grep -rah --include=run.log 'NOT ON THE GLASS — touch-hint' \
 *       .audit-frames/proof/frames .audit-frames/rebase/frames
 *   …and to see that it is two frames per run and which two:
 *     awk '/^  \[[0-9]/{lbl=$1} /NOT ON THE GLASS — touch-hint/{print lbl}' \
 *       .audit-frames/proof/frames/sc-rx-unguarded__mobile-right/run.log
 *
 *   And the WINDOW, from the frame mtimes of those same 174 runs, 01-arrival →
 *   03-ready: min 17.1 s · p50 18.0 s · p90 19.6 s · max 21.8 s. That is a ROBOT
 *   that presses «Разбрах» the instant the button exists, on a briefing whose own
 *   fold reads «↓ ОЩЕ 20 РЕДА». A seventeen-year-old reading it is not measured
 *   here and is not faster.
 *
 * So the old increment spent ~18 s of a 120 s ceiling — 15 % of it — before the
 * card had been on screen for one frame, on every mobile lesson in the
 * catalogue.
 *
 * ONE THING IS MEASURED AND THE OTHER IS ONLY DEDUCED, AND THE TWO ARE NOT
 * WORTH CONFLATING. The arrival/briefing window is photographed 348 times. The
 * mid-drive case — rank 1 is „the lesson talking", so every graded fault, task
 * and teach card hides this card again while it speaks — follows from the same
 * cascade rule but appears in no frame, for a reason that is itself the good
 * news: by the time a lesson talks, the SPEED exit has already taken the card
 * away in 213 of 224 measured runs. It is the 11 that never move, the ones this
 * ceiling exists for, that would sit through both.
 *
 * That is the crime this file names two paragraphs down, arriving from the
 * direction nobody was watching: not „the card was never read" but „the clock
 * that decides it was furniture ran while it was invisible". A ceiling that
 * fires on a card the student was never shown deletes the teaching outright.
 *
 * THE FIX IS THE CONDITION, NOT THE NUMBER — `touchHintAccrue(shownMs, onGlass)`
 * below advances by one poll only when the card is actually painted, and the
 * bounds the ceiling was derived against stay exactly what they were, because
 * they were always about time IN FRONT OF A READER. And the unknown case fails
 * the way everything in this file fails: a scene that cannot tell whether the
 * card is on the glass does not accrue, so the ceiling arrives late or never
 * rather than early. Late costs a card on a stationary picture. Early costs a
 * lesson.
 *
 * ⚠ THE CEILING IS NOT WIRED YET, AND THIS PARAGRAPH IS HERE SO NOBODY READS THE
 *   ONE ABOVE AS A DESCRIPTION OF WHAT SHIPS. As of this commit `LessonScene`
 *   still calls `touchHintStandsDown(sampleRef.current.speedKmh)` — the speed
 *   exit alone. The rule, its bounds and its proof live here; the change that
 *   spends them lives in a file this lane does not own:
 *
 *     const hintRef = useRef<HTMLDivElement | null>(null);   // + on the card
 *     …
 *     useEffect(() => {
 *       if (!showTouchHint) return;
 *       let shownMs = 0;                                   // + the clock
 *       const id = window.setInterval(() => {
 *         shownMs = touchHintAccrue(                       // + one PAINTED tick
 *           shownMs,
 *           touchHintOnGlass(hintRef.current),
 *         );
 *         if (touchHintShouldHide(sampleRef.current.speedKmh, shownMs))
 *           setShowTouchHint(false);                       // + both exits
 *       }, TOUCH_HINT_POLL_MS);
 *       return () => window.clearInterval(id);
 *     }, [showTouchHint]);
 *
 *   `touchHintAccrue` is not optional sugar and `shownMs += TOUCH_HINT_POLL_MS`
 *   is not an acceptable inlining of it: the whole content of this correction is
 *   the second argument. `__tests__/touchHintLifetime.test.ts` reads
 *   `LessonScene.tsx` as source and FAILS on a scene that reaches for the
 *   ceiling without the on-glass accumulator, so the half-wired version cannot
 *   land quietly. That block also asserts the CURRENT call, so it goes red the
 *   moment the edit lands — deliberately. Whoever makes it updates that
 *   assertion to `touchHintShouldHide(sampleRef.current.speedKmh, shownMs)` in
 *   the same commit, and the ceiling is live.
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
 *              And the two minutes are two minutes ON THE GLASS — arrival, the
 *              briefing and every teach card that outranks this one are time the
 *              card was `display: none`, and time a card was not shown is not
 *              time it was ignored. (Awaiting the call-site change flagged
 *              above; the rule is here, the scene does not spend it yet.)
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
 * AND THAT QUESTION IS STILL PHOTOGRAPHED, SO IT IS RECORDED HERE RATHER THAN
 * LEFT AS A HYPOTHETICAL. On the current build the card's remaining life is the
 * `03-ready` window, measured over the 122 mobile runs of `.audit-frames/proof2`
 * from their own frame mtimes (03-ready → first 04 frame): min 12.6 s · p50
 * 13.9 · p90 15.1 · max 17.2. And on
 * `proof2/frames/sc-rx-unguarded__mobile-right/03-ready.png` and
 * `…/sc-maneuver-uturn__mobile-right/03-ready.png` it spends that window printed
 * across the INTERIOR REAR-VIEW MIRROR, which is the surface sc-park-night's row
 * was about and the one a student is meant to use in exactly this window, before
 * moving off. The lifetime cannot answer it: this is the card at its shortest
 * and at a standstill, which is the state the whole file argues FOR. Only the
 * corner can, and the corner is `notifyColumn.ts`'s.
 *
 * AND THE MIRROR IS NOT THE ONLY OCCLUDER THE TWO MAJOR ROWS NAME. Both are
 * recorded here rather than left in a closure note, because a row whose
 * touch-hint half is closed reads like a closed row. Each of the two concedes
 * that half in its own words — the card really does clear — and then names a
 * DIFFERENT surface still covering the thing its lesson grades. Neither is this
 * file's, and neither is `notifyColumn.ts`'s either:
 *
 *   sc-maneuver-uturn  the route pill «Следвай синята линия» is printed THROUGH
 *                      «Л ОГЛЕДАЛО» — the left-mirror glance label, on the one
 *                      manoeuvre graded on mirror glances. Still true on the
 *                      current build: open
 *                      `proof2/frames/sc-maneuver-uturn__mobile-right/04-t072s.png`
 *                      and the pill's rounded right border cuts the «Л» while
 *                      «линия» overprints «ОГЛЕДАЛО». The touch hint is long
 *                      gone from that frame; only the occluder changed. The
 *                      row's own scope line: the pill's placement.
 *   sc-rx-unguarded    the WORLD label «Спри тук · спри — под 5 км/ч» at the
 *                      approach is still half hidden — no longer by «РАЗБРАХ»
 *                      and the teach panel, which did leave, but behind the
 *                      Андреевски кръст sign and its mast, drawn across the
 *                      plate. The row's own scope line: world-label placement,
 *                      not the HUD corridor.
 *
 * Recorded by the adversarial verifier, 2026-08-24, from the rows' own „why"
 * text and — for the uturn one — from the frame above, opened rather than
 * quoted. A lifetime rule cannot move either of them; naming them is the only
 * thing this file can honestly do with them.
 *
 * AND IT IS NOT AN INPUT BLOCKER — THE CHARGE SHOULD BE DROPPED, NOT INHERITED.
 * Sweep 161 filed its two CRITICAL rows (sc-sp-harsh-brake, sc-speed-transition)
 * against this file on the theory that the card was „the most likely input
 * blocker" for a car that would not move. THREE things refute it, and every one
 * was opened rather than taken from the paragraph this one replaces:
 *
 *   the source   the card's container is `pointer-events-none` (`LessonScene
 *                .tsx`, `[data-hud="touch-hint"]`) and the only element on it
 *                that takes a pointer is the «РАЗБРАХ» pill — one 44 px control
 *                in the top-right corridor, nowhere near the thumb pads. A card
 *                that cannot receive a touch cannot swallow one.
 *   the frames   the premise was wrong anyway. Both cars moved, on the very
 *                drives that filed the rows. `sweep161/sc-sp-harsh-brake/mobile-
 *                right/04-t001s.png` reads 20 км/ч with the selector in D;
 *                `sweep161/sc-speed-transition/mobile-right/04-t002s.png` reads
 *                19 км/ч. Both were read off the cluster in the picture. The
 *                findings generalised from later frames that happened to read 0
 *                — a saw-tooth is not a stationary car.
 *   the pill on  AND ONE OF THE TWO ROWS IDENTIFIED THE WRONG CARD. sc-speed-
 *   the cited    transition cites `07-end` for „the first-run touch hint and its
 *   frame        РАЗБРАХ pill are still on screen". Open it: the surface on that
 *                frame is the BRIEFING — «ИНСТРУКЦИИ · Потегли по правата улица
 *                … ↓ ОЩЕ 14 РЕДА», with «ПРОЧЕТИ» beside «РАЗБРАХ». This card's
 *                own words are nowhere on it, and they could not be: the overlay
 *                ladder (`PlayAreaStyles.tsx:1224`) sets `display: none` on
 *                `[data-hud="touch-hint"]` precisely WHILE that line speaks. Two
 *                different surfaces share one Bulgarian word for „got it", and
 *                the row was written from the word.
 *
 * AND THE CURRENT BUILD SETTLES IT. `.audit-frames/proof2` (2026-08-23, the
 * steered harness, HEAD 769bfd4): both lessons' mobile-right drives move from
 * their first sampled frame — 13 and 19 км/ч at 04-t002s — and sc-sp-harsh-brake
 * comes back ИЗДЪРЖАН. NOT AN ALL-CLEAR FOR THE LESSON: sc-speed-transition is
 * still НЕЗАВЪРШЕН on that same build. Its car moves and this card is off the
 * glass throughout, so whatever ends it early is somebody else's row — which is
 * the whole point of the three refutations above, not a mitigation of them.
 * Across ALL 122 mobile runs in that sweep the card's own words are painted at
 * `03-ready` and at no other frame, 122 of 122; the speed exit takes it off the
 * glass before the first driving frame everywhere.
 *   Reproduce (the glob has no trailing slash on purpose: a star followed by a
 *   slash would close this block comment):
 *     for d in .audit-frames/proof2/frames/*mobile*; do awk '/^  \[[0-9]/{l=$1}
 *       /· Ляв палец — волан/{print l}' "$d/run.log"; done | sort | uniq -c
 *
 * Whatever stops those two lessons finishing lives in the touch input path
 * (`TouchControls.tsx`), the drive gate, or — on the sc-speed-transition frame
 * above — in whatever left the briefing overlay standing with 14 unread lines at
 * `07-end`, which is the overlay queue's question and not this card's. It is not
 * this card, and a lifetime rule is not where it will be found.
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
 *   const moving = speed > cfg.movingSpeedKmh;        // rules/engine.ts:1607
 *
 * — and therefore the exact line past which the belt, the lights and every
 * other duty of a driver in motion begin to be graded. Copied by value rather
 * than imported so this stays a Node-testable leaf with no dependency on the
 * rules module; `__tests__/touchHintLifetime.test.ts` re-reads the config's
 * literal on every run so the two cannot drift apart in silence.
 */
export const TOUCH_HINT_MOVING_KMH = 5;

/**
 * How often the scene checks (ms) while the hint is MOUNTED — and only while it
 * is mounted. Zero cost for the rest of the session and zero on every device
 * that never shows the hint. Deliberately a poll and not a per-frame hook: this
 * decides when a piece of type disappears, and it must not add a line to the
 * frame loop that grades.
 *
 * WHAT ONE TICK COSTS, STATED HONESTLY BECAUSE IT GREW. It used to be one
 * property read off the vehicle sample. It is now that plus one
 * `touchHintOnGlass()` — a short ancestor walk of `getComputedStyle` and one
 * `getClientRects()` on a single element, i.e. one forced style/layout flush per
 * tick. The window that costs is measured, not guessed: the card is mounted for
 * the 17.1–21.8 s of arrival + briefing (174 mobile runs, above) and then for
 * the 1–15 s until the car rolls, after which the effect tears the interval
 * down. ~200–400 flushes of a DOM that is not being mutated, none of them
 * inside the render loop, in exchange for a ceiling that cannot fire on a card
 * nobody was shown.
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
 *              reading-speed figure, `hud/HudToasts.tsx:72-73`, the one it already
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
 * `shownMs` is ACCUMULATED ON-GLASS POLL TIME. Two words are load-bearing and
 * each one is a separate refusal.
 *
 * POLL, not wall-clock: the scene accrues per DELIVERED tick rather than reading
 * `Date.now()`, so an interval the browser throttles cannot bank time it did not
 * deliver.
 *
 * ON-GLASS, not mounted: `touchHintAccrue` advances only on ticks where the card
 * is actually painted. Every mobile lesson in the catalogue mounts this card
 * ~18 s before it is visible (arrival + briefing, `display: none` behind the
 * overlay ladder — the measurement is in the header), and every teach card
 * mid-drive hides it again. Counting that time would have made the ceiling fire
 * on a card the student had never been shown. The same predicate is what refuses
 * a backgrounded tab outright: throttling made that case slow, `visibilityState`
 * makes it zero, and the difference is twenty minutes of pocket against never.
 *
 * The error this design admits is „the card stayed up longer than two minutes of
 * wall-clock on a picture that was not moving"; the error it refuses is „the
 * card vanished while the student was elsewhere, or before he had seen it".
 *
 * A CLOCK THAT CANNOT BE READ IS FALSE, exactly as an unreadable speed is. NaN
 * and ±Infinity are not evidence that two minutes have passed, and the same rule
 * holds for both inputs of this pair: a broken number may leave the teaching on
 * the screen, and may never take it off.
 */
export function touchHintOutstayed(shownMs: number): boolean {
  if (!Number.isFinite(shownMs)) return false;
  return shownMs >= TOUCH_HINT_MAX_SHOWN_MS;
}

/**
 * Is the card ACTUALLY ON THE GLASS this tick — painted, not merely mounted?
 *
 * The predicate is deliberately the audit harness's, near enough verbatim:
 * `painted()` in `tools/mobile/lesson-audit.mjs:692`, which is the instrument
 * that photographed this defect and prints «✗ NOT ON THE GLASS — touch-hint» for
 * the 348 frames the header counts. The product and the thing that judges the
 * product should not hold two different opinions about whether a student can see
 * a card.
 *
 * …WITH EXACTLY ONE DELIBERATE DIVERGENCE, AND IT IS NAMED HERE SO THE SENTENCE
 * ABOVE STAYS TRUE. A HIDDEN DOCUMENT IS NOT GLASS. The harness photographs a
 * foregrounded page and has no reason to ask; a phone does. When the student
 * takes a call, switches app, or the screen locks, `visibilityState` goes
 * `"hidden"` while every question `painted()` asks keeps answering YES — the
 * computed styles are untouched and `getBoundingClientRect()` still returns the
 * card's real box. So the harness's predicate, imported verbatim, would have
 * counted a phone in a pocket as time in front of a reader, which is this file's
 * one forbidden direction: a ceiling that fires on a card the student was never
 * shown deletes the teaching outright.
 *
 * THE MITIGATION THE HEADER USED TO RELY ON IS A RATE, NOT A STOP, AND THE
 * ARITHMETIC IS THE WHOLE ARGUMENT. „A backgrounded tab accumulates SLOWER than
 * the wall" was the answer this file gave, and slower is not never: take the
 * throttle at its most generous commonly-quoted figure, 1 Hz, and the 1 200
 * ticks of `TOUCH_HINT_MAX_SHOWN_MS` still arrive after twenty minutes of a
 * phone in a pocket. Nothing in this repo has ever measured what any engine
 * actually does to this interval — no sweep backgrounds a tab — so the old
 * sentence was a claim about a browser, made without a measurement, standing in
 * for a claim about a student. This one needs neither: a document that says it
 * is hidden is telling us the student is not there.
 *
 * AN ENGINE THAT CANNOT ANSWER FALLS THROUGH TO THE PAINT QUESTIONS, which is
 * exactly the answer it gives today, so this can only ever take ticks AWAY from
 * the ceiling and never add one. Only the literal string `"hidden"` refuses;
 * `undefined` (a non-DOM document object, an engine without the API) is not read
 * as evidence of anything.
 *
 * WHY THE ANCESTOR WALK. The two shipped suppressions
 * (`PlayAreaStyles.tsx:1224` and `:1536`) both hit the card's own element, so
 * its own computed `display` would answer today. The walk is here for the case
 * that is one commit away and would fail silently: a hidden PARENT — the HUD
 * layer, the play area, a `hidden` attribute on the stage — leaves the card's
 * own `display` reading `flex` while nothing is on screen. `visibility`
 * inherits, so a child reports it; `opacity` does NOT, which is exactly why
 * reading only the card would over-count in the direction that deletes teaching.
 *
 * WHY THE RECT IS A SECOND QUESTION AND NOT A REPEAT. Copied from the harness's
 * own note: a `display: contents` wrapper and a baseline-aligned inline box both
 * report a degenerate border box while painting, so the fallback across
 * `getClientRects()` has to stay. A card clipped to nothing by the corridor's
 * `max-height` — the exact failure `PlayAreaStyles` fixed by giving the words
 * their own scroller — is not on the glass either, and this is what notices.
 *
 * NO DOM IS FALSE. A null ref (the first tick after mount, before React
 * attaches), a document with no view (SSR, a detached node) — none of these is
 * evidence that a student is looking at the card, and the whole asymmetry of
 * this file is that an unreadable input may leave teaching up and may never take
 * it down.
 */
export function touchHintOnGlass(el: Element | null | undefined): boolean {
  if (!el) return false;
  const doc = el.ownerDocument;
  const view = doc?.defaultView;
  if (!view) return false;
  // The one question the harness does not ask, because a harness is never
  // backgrounded and a phone always is. Styles and rects survive an app switch
  // intact, so without this the clock runs on a screen nobody is holding.
  if (doc.visibilityState === "hidden") return false;
  for (
    let n: Element | null = el;
    n && n.nodeType === 1;
    n = n.parentElement
  ) {
    const cs = view.getComputedStyle(n);
    if (!cs) return false;
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (Number(cs.opacity) === 0) return false;
    if (cs.contentVisibility === "hidden") return false;
  }
  const r = el.getBoundingClientRect();
  if (r.width >= 1 && r.height >= 1) return true;
  for (const q of el.getClientRects()) if (q.width >= 1 && q.height >= 1) return true;
  return false;
}

/**
 * One tick of the ceiling's clock. THE SECOND ARGUMENT IS THE WHOLE POINT.
 *
 * `shownMs += TOUCH_HINT_POLL_MS` is what this file used to prescribe and it is
 * wrong in the one direction that costs a lesson: the interval is born with the
 * scene, and the card spends the first 17.1–21.8 s of every mobile lesson
 * mounted and `display: none` behind the briefing (174 of 174 drives — the
 * header carries the count, the frames and the reproduction). Time a card was
 * not shown is not time it was ignored.
 *
 * So the clock advances on PAINTED ticks only, and a tick that cannot be judged
 * — `onGlass` false because the ref is null, the document detached, the answer
 * unknown — advances nothing. Both non-advancing cases push the ceiling LATER,
 * which is the failure that leaves a card on a stationary picture; the failure
 * it refuses is a ceiling arriving EARLY, which deletes the only place the thumb
 * layout and the reverse gesture are written down.
 *
 * A non-finite `shownMs` propagates rather than being repaired. `touchHintOutstayed`
 * already reads an unreadable clock as „not outstayed", so a corrupted
 * accumulator can only ever leave the words up — never remove them — and a
 * silent reset to 0 here would hide the corruption instead of failing safe.
 */
export function touchHintAccrue(shownMs: number, onGlass: boolean): number {
  if (!onGlass) return shownMs;
  return shownMs + TOUCH_HINT_POLL_MS;
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
 *
 * `shownMs` MUST come from `touchHintAccrue`, not from a `+=` at the call site.
 * The two differ by ~18 s on every mobile lesson in the catalogue, in the
 * direction that fires the ceiling on a card the student never saw.
 */
export function touchHintShouldHide(speedKmh: number, shownMs: number): boolean {
  return touchHintStandsDown(speedKmh) || touchHintOutstayed(shownMs);
}
