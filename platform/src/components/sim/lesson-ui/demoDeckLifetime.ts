/**
 * WHEN THE DEMONSTRATION STOPS BEING A DEMONSTRATION AND STARTS BEING A VOICE
 * IN THE STUDENT'S CAR.
 *
 * THE DEFECT (wave-C corpus, seven rows, three of them critical). The shadow
 * demonstration deck plays a recorded drive and captions it in the FIRST
 * PERSON — «Спряхме плътно вдясно…», «потегляме», «Възглавницата е
 * възстановена…». `createTraceClock()` returns `playing: true`, so the replay
 * starts at mount and then runs on its own wall clock for the rest of the
 * lesson. Nothing in `LessonScene` ever stopped it for the one event that
 * matters: the student starting to drive.
 *
 * Two frames, both from the certified corpus, both at speed:
 *
 *   sc-hz-breakdown-pulloff  pc-right 04-t124s — «Спряхме плътно вдясно…»
 *                            while the car is doing 6 км/ч IN THE RUNNING LANE,
 *                            playhead parked 0:26/0:26.
 *   sc-follow-cutin          pc-right 04-t034s — «Възглавницата е възстановена
 *                            …» printed over ЗАДАЧА 1/3 at 12 км/ч,
 *                            scrubber 0:28/0:40, replay still running.
 *
 * A student cannot tell that a first-person sentence on their windscreen
 * describes a replay and not their own driving. Doc 64 THEO-4 requires this
 * product to explain every decision it announces; a sentence that congratulates
 * the student for a manoeuvre they did not make explains the wrong drive.
 *
 * THE PAUSE IS NOT THE WHOLE FIX, and that is the part that is easy to miss.
 * `activeAnnotationIndex` (traces/sample.ts) clears a caption `windowSec` after
 * it fires — but only while the playhead MOVES. A clock stopped inside that
 * window pins its caption on the glass for the rest of the lesson, which is
 * exactly what the 0:26/0:26 frame above is. So the deck must both stop the
 * clock AND stop rendering the caption; either alone leaves a frame like these.
 *
 * THIS IS THE THIRD USE OF ONE PATTERN, deliberately. `touchHintLifetime` and
 * `controlsLegendLifetime` already stand their surfaces down on first movement,
 * with the same threshold and the same NaN rule, and a fourth reader should
 * find three files that agree rather than three that each improvised.
 */

/**
 * Above this the student is DRIVING and the demonstration stands down.
 *
 * Five km/h is the number its two siblings use, and it is not a taste: below it
 * sit the creep of a released brake on a camber and the rock of a car settling
 * on its springs, neither of which is a student having started. Sharing the
 * constant matters more than tuning it — three surfaces that vanish at three
 * different speeds would read as three bugs.
 */
export const DEMO_DECK_MOVING_KMH = 5;

/**
 * The poll that trips the latch. 250 ms, as the controls legend uses: this is
 * furniture standing itself down, not a rule that grades, and it must never buy
 * a place in the frame loop. Four reads a second is far inside the reaction
 * time of anyone noticing a caption disappear.
 */
export const DEMO_DECK_POLL_MS = 250;

/**
 * True when the demonstration must stand down: the car is moving under the
 * student's own control.
 *
 * NaN IS FALSE, AND THAT DIRECTION IS THE DELIBERATE ONE — the same ruling its
 * siblings carry. A speed that cannot be read is not evidence that the student
 * is driving. Reading it as driving would silence the demonstration on exactly
 * the lessons whose instrumentation is broken, which is where a student needs
 * the demonstration most. Unreadable therefore leaves the deck exactly as a
 * fresh scene leaves it — playing, captioning, closable by its own control.
 *
 * A RESPAWN CANNOT TRIP THIS. The kill-plane rescue teleports the car, and a
 * rule that measured DISTANCE would bank that jump as metres of driving.
 * `VehicleSim.reset()` zeroes linvel and angvel as part of the teleport, so a
 * rule that measures SPEED reads a respawned car as stopped — which it is.
 */
export function demoDeckStandsDown(speedKmh: number): boolean {
  if (!Number.isFinite(speedKmh)) return false;
  return Math.abs(speedKmh) > DEMO_DECK_MOVING_KMH;
}

/**
 * …AND THE OTHER END OF THE SAME LIFETIME: WHEN IT STARTS.
 *
 * The stand-down above closed the half of the defect that happens at speed. It
 * cannot touch the half that happens at ZERO, and the corpus photographed that
 * one too:
 *
 *   sc-ed-poligon-chain  pc-right 01-arrival — the cluster reads 0 км/ч in D,
 *                        no control has been touched, and the deck already
 *                        reads 0:22 / 2:44 with «Центрирано в мястото. Излез
 *                        напред и продължи по правата към втората станция.» on
 *                        the glass. (sc-ed-poligon-chain:746682ab, critical)
 *   sc-merge-lane-end    pc-right 01-arrival — 0 км/ч, task 1 «Влей се в
 *                        оставащата лента…» unstarted, and the caption reads
 *                        «Вписахме се в пролуката с едно движение — никой в
 *                        лявата лента не спря…». (sc-merge-lane-end:16d2fa64)
 *
 * THE MECHANISM IS `createTraceClock()`'s `playing: true`. The replay starts on
 * the Canvas's first frame and runs on wall time while the student reads the
 * six-step ИНСТРУКЦИИ panel beside it, so twenty-odd seconds of demonstration
 * are spent before the lesson has begun and the student looks up at whatever
 * sentence the playhead happens to be standing on. On both frames above that
 * sentence is in the first-person COMPLETED voice — the same 42 captions the
 * stand-down block counted — so the product's first words to a student who has
 * driven nothing are congratulations for a manoeuvre that never happened. Doc
 * 64 THEO-4: this product explains every decision it announces, and there is no
 * decision here to explain, because nothing was done.
 *
 * SO THE DEMONSTRATION WAITS FOR ITS AUDIENCE. The deck opens parked at 0:00
 * and the student presses ▶ — the transport that was always there, and the same
 * gesture the stand-down block already ends on («a student who wants the
 * demonstration back reopens it, deliberately»). Nothing is taken away and no
 * caption is edited: the bank is untouched, the ghost still drives the recorded
 * line, and the aid is still `DEFAULT_LEVEL_AIDS[1].shadowCar`.
 *
 * IT IS ALSO THE ONLY READING THAT LEAVES THE TWO HALVES COHERENT. Since the
 * stand-down landed, a demonstration cannot be followed WHILE driving — it goes
 * quiet above 5 км/ч. A replay that can only be watched from a standstill and
 * yet starts itself before the student is ready to watch is a demonstration
 * arranged so that it is missed.
 *
 * Structurally typed rather than importing `TraceClock`, so this file stays the
 * dependency-free pure module its two siblings are.
 */
export function demoDeckAtRest<T extends { tSec: number; playing: boolean }>(clock: T): T {
  clock.playing = false;
  clock.tSec = 0;
  return clock;
}
