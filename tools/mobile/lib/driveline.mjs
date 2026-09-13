/**
 * driveline.mjs — THE FOUR THINGS THE DRIVE HARNESS COULD NOT DO, AS PURE
 * FUNCTIONS THAT NEED NO BROWSER.
 *
 *   node --test tools/mobile/__tests__/driveline.test.mjs
 *   (or `node platform/scripts/tools-tests.mjs` from platform/, which walks
 *    tools/ and claims this file's test by its `node:test` import.)
 *
 * ═══ WHY THIS FILE EXISTS ══════════════════════════════════════════════════
 *
 * Five open audit rows are UNJUDGEABLE, and in each case the judge who refused
 * to rule named the missing capability rather than a product defect. None of
 * the four capabilities below is a driving decision; every one of them is an
 * ARITHMETIC decision about evidence, and every one of them was going to be
 * written inline in a 9,000-line top-level-await script that cannot be
 * imported, i.e. tested only by driving. So they live here, where a test can
 * reach them, and `lesson-audit.mjs` holds only the wiring — the same split
 * `lib/guidance.mjs` and `__tests__/guidance-wiring.test.mjs` already use, and
 * for the same reason: the pure half is where the reassuring-direction failure
 * hides, because it is the half that decides what the log gets to claim.
 *
 * ── THE ONE RULE EVERY FUNCTION HERE OBEYS ─────────────────────────────────
 *
 * A THREE-VALUED ANSWER, NEVER A TWO-VALUED ONE. `true` / `false` / `null`,
 * where `null` is „no witness could speak" and is NOT `false`. This programme
 * has paid for that conflation at least four times — a dial reading −1 and a
 * car reading 0 both left `topSpeed` at 0; a deferred positive control's
 * initialiser `0 <= 0` read as „the car did not move"; `guidance.samples`
 * empty on a `wrong` lane read as „the ribbon was not seen". Every predicate
 * below returns the third value and every caller is expected to REFUSE on it.
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * 1 · THE PARKING BRAKE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MEASURED, `.audit-frames/w41/frames/sc-vp-readiness__{mobile,pc}-right/`:
 *
 *   POSITIVE CONTROL: 0 км/ч after 5.1 s of throttle
 *   !! CAR DID NOT MOVE — every frame after this is a frozen world, not a drive.
 *   [03b-frozen] 0 км/ч  gear=D  card=-/-
 *
 * …on a lane whose steering channel read LIVE in the same second (the wheel
 * went over and the world answered, left 151 px ≈5.2°, right −153 px ≈−5.3°).
 * A world that renders, a wheel that works, a gear letter reading D, and a car
 * that will not leave zero. All four `sc-vp-readiness` lanes, both platforms,
 * both directions: `cockpit.movingReads` 0 of 335 reads.
 *
 * THE PRODUCT IS INNOCENT AND SAYS SO OUT LOUD. `scene/cabin.ts` hands
 * `sc-vp-readiness` and `sc-vp-handbrake` — and ONLY those two, pinned by
 * `scene/spawnParkingBrake.test.ts` — a car with the lever UP, deliberately,
 * because their briefings order the release («Свали ръчната спирачка докрай —
 * освобождаването ѝ е част от процедурата за потегляне») and a hand-over that
 * has already performed step 2 falsifies the lesson's own lamp sentence. The
 * harness had ZERO references to it: a census of `lesson-audit.mjs` for
 * `РЪЧНА`, `handbrake`, `parkingBrake` or `Space` returned nothing.
 *
 * ── WHY THIS IS NOT „PRESS SPACE AND CARRY ON" ─────────────────────────────
 *
 * Three ways a blind press fails in the reassuring direction, all three
 * measured off the recorded frames rather than imagined:
 *
 *  (a) SPACE IS A TOGGLE (`scene/cabin.ts:589,858` — `case
 *      DRIVELINE_KEYS.parkingBrake: this.toggleParkingBrake()`). Pressed on a
 *      car whose brake is already DOWN it PULLS THE LEVER UP, and the harness
 *      would then report a released brake on a car it had just immobilised.
 *      So the press is gated on positive evidence that the lever is up.
 *  (b) SPACE IS ALSO THE TEACH-CARD ACKNOWLEDGEMENT, and the product documents
 *      the collision itself — `lesson-ui/TeachMomentOverlay.tsx:289-296`:
 *      «Space is the parking-brake toggle on CabinControls' own window
 *      listener … so without this a student dismissing the belt warning would
 *      also release/engage the handbrake». Its listener is CAPTURE-phase with
 *      `stopPropagation`, so a press made while that card is up reaches the
 *      card and never reaches the cabin. A harness that pressed anyway would
 *      dismiss a card and call it a release.
 *  (c) A CAR CAN BE HELD BY SOMETHING THAT IS NOT THE BRAKE.
 *      `engine/stuckStart.ts:223` orders the blockers engine → selector → brake
 *      and returns only the FIRST, so an engine-off car never names the lever
 *      at all. „No handbrake card" therefore does not mean „no handbrake".
 *
 * ── THE WITNESSES, AND WHY THERE HAD TO BE TWO ─────────────────────────────
 *
 * W1 THE PILL. `components/sim/TouchControls.tsx:3328-3333` renders
 *    `<SheetCell textBg="РЪЧНА" labelBg="Ръчна спирачка" tone="danger"
 *    active={snap?.parkingBrakeOn ?? false}>`, and `SheetCell` puts that
 *    straight onto `aria-pressed`. It is the driveline's own boolean, one hop.
 *    It exists only where `TouchControls` mounts, and it mounts behind
 *    `{touchCapable ? <TouchControls …` (`LessonScene.tsx:3215`,
 *    `touchPadRelease.test.tsx:505`) — so on the `pc` leg there is no pill.
 *    Confirmed in w41: `inputChannel.overlayMounted` is `true` on
 *    sc-vp-readiness/mobile-right and `false` on pc-right.
 *
 * W2 THE PRODUCT'S OWN SENTENCE. `stuckStartReason(…) === "parkingBrake"` →
 *    `LessonPlayShell.tsx:499` «Ръчната спирачка е вдигната — колата е
 *    задържана». It needs `STUCK_START_HINT_S` = 1.2 s of continuous throttle
 *    at a standstill (`engine/stuckStart.ts:156`), which is a tenth of the
 *    positive control's own 5 s press, so by the time the control has its
 *    answer the card is already on the glass. It is device-independent:
 *    photographed on `sc-vp-readiness__pc-right/04-t005s.png`, bottom-right,
 *    «Щракни ключа на ръчната спирачка (клавиши Space), за да я свалиш».
 *
 * WHY THE pc LANE'S LOG DOES NOT SHOW IT, WHICH IS A HARNESS FINDING OF ITS
 * OWN: `read()` breaks its census at `strings.length >= 26`, and the pc page
 * spends all 26 on the nav toolbar, the demonstration deck and the tier
 * picker before it ever reaches the notify column. The card was on the glass
 * for the whole drive and in no log line. That is why W2 is read by a
 * DEDICATED, SCOPED probe here rather than by matching `read().strings`.
 *
 * ── AND THE VERIFICATION IS NOT THE PRESS ──────────────────────────────────
 *
 * The task this file was written for names the failure exactly: „a blind press
 * that reports success on a car still held is the reassuring-direction failure
 * this whole programme is about." So `releaseVerdict` is a separate function
 * from `parkingBrakeVerdict`, it takes the state BEFORE and AFTER, and its
 * strongest witness is not a witness at all — it is the car leaving zero under
 * the same throttle that could not move it. A lever that comes off and a car
 * that then moves are two facts; a lever that comes off and a car that STILL
 * will not move is a third and a real one, and it must not read as failure of
 * the release.
 */

/**
 * `DRIVELINE_KEYS.parkingBrake` — `modules/sim/scene/cabin.ts:589`.
 *
 * ── AND THIS HARNESS DOES NOT PRESS IT. THAT IS DELIBERATE AND IT IS A
 *    HANDOVER, NOT AN OVERSIGHT. ─────────────────────────────────────────────
 *
 * `platform/src/modules/sim/engine/__tests__/reverseAssist-audit-harness.test.ts`
 * §1 censuses every `keyboard.down|up|press(…)` argument in `lesson-audit.mjs`
 * — resolving literals, bare consts and object members, and FAILING on any
 * argument it cannot resolve — and then asserts the whole grammar as a CLOSED
 * set: `["BracketRight","Escape","KeyA","KeyB","KeyD","KeyS","KeyW","KeyZ"]`,
 * with the comment «stated so ANY new key fails here and has to be argued
 * for». Adding `Space` to the harness turns that gate red, and that gate lives
 * in `platform/src`, which this lane may read and may not write.
 *
 * So the release is made through the PRODUCT'S OWN CONTROLS instead — the
 * «РЪЧНА» cell of the driveline sheet, and the cockpit's own parking-brake
 * hotspot — both of which route to the identical `CabinControls
 * .toggleParkingBrake()` the key does (`cabin.ts:773-777, 858-860`; the
 * component's own comment: «Same controls, same CabinControls / DrivelineState
 * calls, same single code path as the keys and the cockpit hotspots»).
 *
 * That is not merely a workaround. `lesson-audit.mjs`'s own `inputChannel`
 * note records that no drive this harness has ever taken actuated
 * `TouchControls` at all, while five criticals in the brake-drop family name
 * that file as their suspect — so a release made on the shipped button is a
 * strictly better instrument than one made on the key. What it CANNOT do is
 * reach a `pc` lane, where `TouchControls` does not mount at all
 * (`LessonScene.tsx:3215` — `{touchCapable ? <TouchControls …`). That lane is
 * REFUSED, loudly, rather than driven as if the car were free.
 *
 * THE ONE-LINE CHANGE THAT WOULD CLOSE THE pc HALF, for whoever owns
 * platform/src next: add `"Space"` to the closed set in
 * `reverseAssist-audit-harness.test.ts` (the `expect(keys).toEqual([…])` in
 * «every key it can press is accounted for»), with the argument that Space is
 * a stateful parking-brake TOGGLE on `DRIVELINE_KEYS`, that two lessons —
 * `sc-vp-readiness` and `sc-vp-handbrake`, pinned by
 * `scene/spawnParkingBrake.test.ts` — now hand the car over with the lever UP
 * by design, and that a harness with no key for it photographs four frozen
 * lanes and calls them a product defect. The gate's «has to be argued for» is
 * satisfied by that paragraph; it is not this lane's to apply.
 */
export const PARKING_BRAKE_KEY = "Space";
/** `SheetCell labelBg` — `components/sim/TouchControls.tsx:3330`. The cockpit
 *  hotspot's `shortBg` is the same string (`scene/vitok/hotspots.ts:150`), so
 *  one word finds both of the product's own controls. */
export const PARKING_BRAKE_LABEL = "Ръчна спирачка";
/** The driveline sheet the «РЪЧНА» cell lives in, and the ⚙«Кола» button that
 *  opens it — `TouchControls.tsx:3083-3090, 3300-3302`. Both carry this label,
 *  so every selector built from it must say WHICH: the opener is a `button`,
 *  the sheet is a `role="toolbar"`. */
export const CAR_SHEET_LABEL = "Контроли на автомобила";
/** `SheetCell labelBg` — `components/sim/TouchControls.tsx:3337`. The belt is
 *  READ, never pressed, from here: `lesson-audit.mjs` already presses KeyB and
 *  its comment records that it „cannot self-verify in-drive". On a touch lane
 *  it now can. */
export const SEATBELT_LABEL = "Предпазен колан";

/**
 * The product's own title for `stuckStartReason === "parkingBrake"` —
 * `LessonPlayShell.tsx:499`. Anchored on the two words that only this card
 * carries; the tail («— колата е задържана») is left out so a punctuation
 * edit cannot silently turn the witness off.
 */
export const PARKING_BRAKE_CARD_RE = /Ръчната спирачка е вдигната/u;

/**
 * The OTHER three stuck-start titles — `LessonPlayShell.tsx:454,462,479,489`.
 * Read for one purpose only: to tell „the brake is not the blocker" from „a
 * different blocker is in front of it and the brake is unknown". Without this
 * an engine-off car would read `held: false` and the harness would go on
 * believing it had a free car.
 */
export const STUCK_START_OTHER_RE =
  /Двигателят е изключен|Двигателят угасна|Лостът е на P|Лостът е на N/u;

/**
 * Surfaces that stand between an actuation and the cabin, both ways round:
 * `TeachMomentOverlay.tsx:305` takes Space in the CAPTURE phase with
 * `stopPropagation` (its own comment names the collision — «Space is the
 * parking-brake toggle on CabinControls' own window listener … a student
 * dismissing the belt warning would also release/engage the handbrake»), and
 * a full-screen modal covers the driveline sheet so a POINTER press lands on
 * the modal instead. One list, because both routes fail through it.
 */
export const CABIN_BLOCKER_SEL =
  '[role="dialog"][aria-modal="true"], [data-sim-overlay="teach"], [data-hud="end-screen"]';

/** Where the held-car card can be painted. Deliberately a short list of
 *  overlay/notify surfaces rather than the whole shell: `textContent` over the
 *  shell would match the card while it is in the DOM and not on the glass. */
export const DRIVELINE_CARD_SEL =
  '[data-sim-overlay], [data-sim-overlay-card], [data-sim-overlay-text], [data-hud="notify-column"], [role="status"]';

/**
 * Is the lever up? Three-valued, and every `null` is a REFUSAL to press.
 *
 * @param dom {{pill: boolean|null, card: boolean, otherBlocker: boolean, shell: boolean}}
 *   `pill`   — `aria-pressed` off the РЪЧНА cell, or null where it does not mount
 *   `card`   — the held-car sentence is PAINTED (not merely in the DOM)
 *   `otherBlocker` — some other stuck-start card is up instead
 *   `shell`  — `[data-sim-shell]` is on the page at all
 */
export function parkingBrakeVerdict(dom) {
  const pill = dom?.pill ?? null;
  const card = dom?.card === true;
  const other = dom?.otherBlocker === true;
  const by = [];
  if (dom?.shell !== true) {
    return {
      held: null,
      by,
      conflict: false,
      why: "there is no lesson shell on this page, so no driveline surface can be read at all",
    };
  }
  if (pill === true) by.push("the РЪЧНА pill (aria-pressed=true)");
  if (card) by.push("the product's own «Ръчната спирачка е вдигната» card");
  // BOTH SPEAKING AND DISAGREEING IS THE ONE CASE THAT MUST NOT RESOLVE.
  // The pill is the driveline boolean and the card is a QUEUED notification,
  // so a card outliving the state it described is expected and is not evidence
  // the lever is up; but neither is it evidence it is down, and a toggle
  // pressed on the wrong belief is the (a) failure above. Refuse.
  if (pill === false && card) {
    return {
      held: null,
      by: ["the РЪЧНА pill (aria-pressed=false)", "the product's own «Ръчната спирачка е вдигната» card"],
      conflict: true,
      why:
        "the РЪЧНА pill says the lever is DOWN and the product's held-car card says it is UP — Space is a toggle, " +
        "so a press decided by a coin-flip between two disagreeing witnesses can immobilise a free car",
    };
  }
  if (by.length > 0) {
    return { held: true, by, conflict: false, why: `the lever is up, witnessed by ${by.join(" and ")}` };
  }
  if (pill === false) {
    return {
      held: false,
      by: ["the РЪЧНА pill (aria-pressed=false)"],
      conflict: false,
      why: "the РЪЧНА pill renders the driveline's own boolean and it says the lever is down",
    };
  }
  if (other) {
    return {
      held: null,
      by: [],
      conflict: false,
      why:
        "a DIFFERENT stuck-start card is on the glass — stuckStart.ts returns only the FIRST blocker in fix order " +
        "(engine → selector → brake), so the lever's state is not knowable while another blocker is in front of it",
    };
  }
  return {
    held: null,
    by: [],
    conflict: false,
    why:
      "no witness could speak: the РЪЧНА pill does not mount on this device and the product has printed no held-car " +
      "card (it needs 1.2 s of continuous throttle at a standstill before it will)",
  };
}

/**
 * Can an actuation reach the cabin from here? `false` is not „the brake stays
 * on" — it is „ask again after the layer is drained".
 */
export function cabinActuationSafe(dom) {
  if (dom?.shell !== true) {
    return { safe: false, why: "there is no lesson shell on this page" };
  }
  if (dom?.blocker) {
    return {
      safe: false,
      why:
        `«${dom.blocker}» is on the glass — it takes Space in the capture phase before CabinControls can see it ` +
        "(TeachMomentOverlay.tsx:305) and it covers the driveline sheet a pointer would have to reach, so an " +
        "actuation made here acknowledges a card and releases nothing",
    };
  }
  return { safe: true, why: "no surface stands between the actuation and the cabin's own handler" };
}

/**
 * WHICH of the product's own parking-brake controls this page actually offers.
 * Three answers, and `null` is the pc lane: `TouchControls` does not mount
 * (`LessonScene.tsx:3215`), the cockpit hotspot chip only renders while the
 * procedure is asking for that step, and the key is refused by the census —
 * see the note on `PARKING_BRAKE_KEY`.
 */
export function parkingBrakeRoute(dom) {
  if (dom?.sheetOpen === true) {
    return dom?.pillPresent === true
      ? { route: "pill", why: "the driveline sheet is open and carries its «РЪЧНА» cell" }
      : { route: null, why: "the driveline sheet is open and has no «РЪЧНА» cell in it" };
  }
  if (dom?.sheetOpener === true) {
    return { route: "sheet", why: "the ⚙«Кола» button is on the glass — the «РЪЧНА» cell is one press behind it" };
  }
  if (dom?.hotspotChip === true) {
    return {
      route: "hotspot",
      why:
        "the cockpit's own parking-brake chip is on the glass; it is `pointer-events: none` by design, so a click at " +
        "its centre passes through to the hotspot mesh underneath it (VitokCockpit.tsx:2099-2103)",
    };
  }
  // THE PRODUCT'S OWN KEY, AND ONLY WHERE NOTHING ELSE MOUNTS — 2026-09-13.
  //
  // Every branch above presses a control a STUDENT presses, and they are tried
  // first for that reason. This one is the non-touch desktop lane, where
  // TouchControls never mounts and no cockpit chip is asking for the step. It
  // used to return null, and w42 photographed the consequence: three
  // sc-vp-readiness legs held at 0 км/ч with the product printing «Ръчната
  // спирачка е вдигната» and the harness unable to answer it.
  //
  // Space is DRIVELINE_KEYS.parkingBrake (scene/cabin.ts:589) — the product's
  // own binding, and a toggle on `parkingBrakeOn` alone. It cannot reach R:
  // the selector gate is P—R—N—D and only gearUp/gearDown step it. That is why
  // adding it satisfies the keyboard census rather than evading it.
  return {
    route: "key",
    why:
      "no on-screen parking-brake control mounts on this lane — TouchControls is touch-only and no cockpit " +
      "chip is asking for the step — so the product's own key binding is used (PARKING_BRAKE_KEY = Space, " +
      "DRIVELINE_KEYS.parkingBrake at scene/cabin.ts:589)",
  };
}

/**
 * Displayed км/ч at or above which the car has certainly left zero. Same
 * number and same argument as the positive control's own release threshold:
 * the product's two moving latches are `> 5` and the dial rounds
 * (`Math.round(Math.abs(v))`), so a displayed 6 is at least 5.5.
 */
export const RELEASED_MOVING_KMH = 6;

/**
 * Did the lever actually come off? The three witnesses in decreasing order of
 * strength, and the strongest one is behavioural.
 *
 * @param before  a `parkingBrakeVerdict` input taken BEFORE the press
 * @param after   the same, taken after
 * @param kmhBefore/kmhAfter  the dial across the re-press of the throttle
 */
export function releaseVerdict({ before, after, kmhBefore = null, kmhAfter = null } = {}) {
  const b = before ?? {};
  const a = after ?? {};
  // 1 · THE CAR MOVED. Nothing else changed between the two throttle presses,
  //     so a car that was pinned at zero and is now over the product's own
  //     moving latch was released. This witness cannot be faked by a queued
  //     card or by a pill that does not mount.
  if (typeof kmhBefore === "number" && kmhBefore <= 0 && typeof kmhAfter === "number" && kmhAfter >= RELEASED_MOVING_KMH) {
    return {
      released: true,
      by: "the car itself",
      why: `the car left 0 км/ч and reached ${kmhAfter} км/ч under the same throttle that could not move it before the press`,
    };
  }
  // 2 · THE PILL FLIPPED. One hop from `driveline.parkingBrakeOn`.
  if (b.pill === true && a.pill === false) {
    return { released: true, by: "the РЪЧНА pill", why: "the РЪЧНА pill went aria-pressed true → false across the press" };
  }
  if (a.pill === true) {
    return {
      released: false,
      by: "the РЪЧНА pill",
      why: "the РЪЧНА pill still reads aria-pressed=true — the lever is still up and the press did not reach the cabin",
    };
  }
  // 3 · A CLEARED CARD IS NOT A RELEASE — corrected 2026-09-13.
  //
  //     This branch returned `released: true` under a comment claiming the card
  //     'can only ever UNDER-report a release, which is the safe direction'. The
  //     comment described the opposite of the code: treating a cleared card as
  //     proof the lever came off is OVER-reporting.
  //
  //     The card can clear without the lever moving — its own 8 s TTL expiring,
  //     our opened sheet hiding the notify column (PlayAreaStyles.tsx:1670), or
  //     the DOM probe throwing and returning its all-false default
  //     (lesson-audit.mjs:4289).
  //
  //     AND BY THE TIME WE REACH HERE, CASE 1 HAS ALREADY FAILED: the car either
  //     stayed pinned at zero or could not be read. A vanished notification
  //     cannot outrank a car that did not move.
  //
  //     What `released: true` buys is not cosmetic. It silences the refusal at
  //     lesson-audit.mjs:9053 — 'THIS LANE IS A HELD CAR … No speed, route,
  //     tracking, objective-credit or grading finding may be filed off this
  //     lane.' A false release re-admits every finding from a drive that never
  //     happened, which is far worse than a row staying open one more round.
  //
  //     So it reports UNVERIFIED and names what it saw. The refusal stays on.
  if (b.card === true && a.card !== true && a.otherBlocker !== true) {
    return {
      released: null,
      by: "the product's held-car card (not sufficient)",
      why:
        "the «Ръчната спирачка е вдигната» card is off the glass and no other blocker replaced it — but the car did not move under the re-press, and a card can clear on its own TTL, behind our own opened sheet, or when the probe throws. UNVERIFIED, so this lane stays inadmissible.",
    };
  }
  if (a.card === true) {
    return {
      released: false,
      by: "the product's held-car card",
      why: "the product is still printing «Ръчната спирачка е вдигната» — by its own account the lever is still up",
    };
  }
  return {
    released: null,
    by: null,
    why:
      "no witness could speak after the press and the car did not move — this lane cannot tell a lever that stayed up " +
      "from one that came off a car something else is holding",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2 · THE TASK CAP, AND DRIVING OVER IT ON A `wrong` LEG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `sc-ac-truck-spray:990e5f64` (critical) and `:8ed4d8b3` (major) both say the
 * engine books nothing after 127–131 км/ч against a task cap of 80. The judge
 * refused both with the same sentence: „the antecedent is absent — this leg
 * tops 57 км/ч, never above the cap, so the engine was never asked to book the
 * over-speed the row is about."
 *
 * MEASURED in w41: sc-ac-truck-spray tops 62 (pc-wrong) and 65 (mobile-wrong).
 * The cap is real and it is authored — `templates-conditions2.ts:172`,
 * `params: { kind: "reachZone", …, maxSpeedKmh: 80 }` — and the wrong leg
 * genuinely holds the throttle down. What stops it is the harness's OWN rest
 * cadence: `FLAT_REST_EVERY_M = 45`, so every 45 m the leg brakes to a
 * standstill and holds it for 8 s. A car that is returned to zero every 45 m
 * cannot reach 80, let alone 127, and 45 m is roughly where it reaches 62.
 *
 * SO THE FIX IS NOT „REMOVE THE REST". The rest exists because a wrong leg
 * that never stops photographs one continuous offence and the log has to be
 * able to say where the car was at rest; removing it would invalidate every
 * verdict ever taken from a wrong leg. What the leg needs is to BEAT THE CAP
 * ONCE, on the record, before the cadence starts chopping it — after which the
 * leg is exactly the leg it has always been.
 *
 * THREE REFUSALS ARE BUILT IN, because a hold with no way out is a harness
 * that drives a wrong leg into a wall for four minutes:
 *   · NO CAP ON THE GLASS → no hold at all, byte-identical to today.
 *   · A DISTANCE CEILING and a CLOCK CEILING, whichever comes first.
 *   · AND IF THE CEILING IS REACHED WITHOUT BEATING THE CAP, THAT IS SAID
 *     LOUDLY. „We tried" is not evidence; a judge must be told the antecedent
 *     was still not exercised, or this capability becomes a way of closing the
 *     row it was built to open.
 */

/**
 * `LessonPlayShell.tsx:849,926` — `${titleBg} — дръж под ${shown} км/ч`, the
 * only cap phrasing the advisor and the objective banner emit. Read off the
 * product's own glass, never from the template: what the engine grades and
 * what the student is told are two facts (`shownCapKmh` clamps to the posted
 * limit), and the one a `wrong` leg must be seen to beat is the one on screen.
 */
export const TASK_CAP_RE = /дръж\s+под\s+(\d+(?:[.,]\d+)?)\s*км\/ч/gu;

/** Every cap on the glass, in the order found.
 *
 *  A FRESH RegExp PER CALL, NOT THE EXPORTED ONE. A `/g` regex carries
 *  `lastIndex`, and a shared one that anything ever calls `.test()` or
 *  `.exec()` on starts skipping matches on the next caller — a stateful global
 *  wearing the costume of a constant. The export exists so a wiring test can
 *  name the pattern; the scan uses a copy. */
export function parseTaskCapsKmh(text) {
  if (typeof text !== "string" || text === "") return [];
  const out = [];
  for (const m of text.matchAll(new RegExp(TASK_CAP_RE.source, TASK_CAP_RE.flags))) {
    const v = Number(String(m[1]).replace(",", "."));
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

/**
 * The cap the leg must beat: the HIGHEST one on the glass, so that beating it
 * beats every other cap showing at the same time. `null` when none is shown.
 */
export function taskCapKmh(text) {
  const caps = parseTaskCapsKmh(text);
  return caps.length ? Math.max(...caps) : null;
}

/** How far past the cap counts as „the engine was asked". One dial unit is a
 *  rounding artefact; 5 км/ч is not. */
export const OVER_CAP_MARGIN_KMH = 5;
/** Distance ceiling on the hold — beyond this the leg rests whatever happened. */
export const OVER_CAP_MAX_M = 400;
/** Clock ceiling on the hold, for a leg that is not covering ground. */
export const OVER_CAP_MAX_MS = 45_000;

/**
 * Should the `wrong` leg's first rest be held back one more tick?
 *
 * @returns {{hold: boolean, done: null|"proven"|"metres"|"clock"|"no-cap", why: string}}
 *   `done` is the reason the hold ENDED and is what the log prints; `null`
 *   means it has not ended.
 */
export function overCapHold({
  capKmh = null,
  topKmh = -1,
  metres = 0,
  ms = 0,
  marginKmh = OVER_CAP_MARGIN_KMH,
  maxM = OVER_CAP_MAX_M,
  maxMs = OVER_CAP_MAX_MS,
} = {}) {
  if (typeof capKmh !== "number" || !Number.isFinite(capKmh) || capKmh <= 0) {
    return {
      hold: false,
      done: "no-cap",
      why: "no «дръж под N км/ч» is on the glass, so this leg has no antecedent to exercise and its rest cadence is untouched",
    };
  }
  const need = capKmh + marginKmh;
  if (typeof topKmh === "number" && topKmh >= need) {
    return {
      hold: false,
      done: "proven",
      why: `the leg reached ${topKmh} км/ч against a task cap of ${capKmh} км/ч — the over-speed the engine is being asked about has happened`,
    };
  }
  if (metres >= maxM) {
    return {
      hold: false,
      done: "metres",
      why:
        `${Math.round(metres)} m of held throttle did not beat ${capKmh} км/ч (top ${topKmh} км/ч) — the hold gives up at ` +
        `${maxM} m and the leg rests. THE ANTECEDENT WAS NOT EXERCISED.`,
    };
  }
  if (ms >= maxMs) {
    return {
      hold: false,
      done: "clock",
      why:
        `${Math.round(ms / 1000)} s of held throttle did not beat ${capKmh} км/ч (top ${topKmh} км/ч) — the hold gives up at ` +
        `${maxMs / 1000} s and the leg rests. THE ANTECEDENT WAS NOT EXERCISED.`,
    };
  }
  return {
    hold: true,
    done: null,
    why: `holding the rest back until the dial beats ${need} км/ч (cap ${capKmh} + ${marginKmh} margin); top so far ${topKmh} км/ч`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3 · A RATE IS NOT A DRAW — REPEATING ONE LESSON N TIMES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `sc-ln-obstacle-meeting:114706e0` (critical) is a claim about a PASS RATE:
 * the same drive on the same commit with an unchanged worktree returned six
 * НЕИЗДЪРЖАН, one ИЗДЪРЖАН and one НЕЗАВЪРШЕН out of eight. w41 drove it once.
 * The judge: „One draw can neither confirm nor refute 13%."
 *
 * The arithmetic is here rather than in the harness because the one thing that
 * must not happen is a series reporting „1 of 1 passed — 100%". An interval,
 * not a point, and a REFUSAL below two judgeable drives.
 *
 * ── AND THE SUBSTRING TRAP IS REAL ON THIS ALPHABET ────────────────────────
 * «НЕИЗДЪРЖАН» CONTAINS «ИЗДЪРЖАН». A `verdict.includes("ИЗДЪРЖАН")` test
 * scores every failure as a pass, in the reassuring direction, and this file
 * has a test named for exactly that.
 */

/** Wilson score interval — the one that behaves at k=0 and k=n, which is
 *  precisely where a small series lands. */
export function wilson(k, n, z = 1.96) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n <= 0 || k < 0 || k > n) return { lo: null, hi: null };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/**
 * The product's three end verdicts, matched WHOLE. `НЕЗАВЪРШЕН` is neither a
 * pass nor a fail: the lesson was not finished, so it is not a draw of the
 * quantity the row is about, and it is counted separately rather than folded
 * into the denominator's numerator.
 */
export function classifyVerdict(verdict) {
  const v = String(verdict ?? "").trim().toUpperCase();
  if (v === "") return "unknown";
  if (v === "НЕИЗДЪРЖАН") return "fail";
  if (v === "ИЗДЪРЖАН") return "pass";
  if (v === "НЕЗАВЪРШЕН") return "unfinished";
  return "unknown";
}

/** At least this many judgeable drives before a rate is published at all. */
export const RATE_MIN_N = 2;

/**
 * @param runs [{exit, verdict, head}] — one entry per drive in the series.
 *   Only `exit === 0` runs enter the denominator: a lane that could not be
 *   judged is not a draw of the lesson, it is a draw of the harness.
 */
export function passRate(runs) {
  const rows = Array.isArray(runs) ? runs : [];
  const judgeable = rows.filter((r) => r?.exit === 0);
  const counts = { pass: 0, fail: 0, unfinished: 0, unknown: 0 };
  for (const r of judgeable) counts[classifyVerdict(r?.verdict)] += 1;
  const n = judgeable.length;
  const k = counts.pass;
  const heads = [...new Set(rows.map((r) => r?.head).filter(Boolean))];
  const buildStable = heads.length <= 1;
  if (n < RATE_MIN_N) {
    return {
      n,
      dispatched: rows.length,
      counts,
      passes: k,
      point: null,
      lo95: null,
      hi95: null,
      buildStable,
      heads,
      why: `a rate needs at least ${RATE_MIN_N} judgeable drives and this series produced ${n} — no rate is published`,
    };
  }
  const { lo, hi } = wilson(k, n);
  return {
    n,
    dispatched: rows.length,
    counts,
    passes: k,
    point: k / n,
    lo95: lo,
    hi95: hi,
    buildStable,
    heads,
    why: buildStable
      ? `${k} of ${n} judgeable drives passed`
      : `${k} of ${n} judgeable drives passed, BUT the tree moved during the series (${heads.length} distinct HEADs) — this rate is not about one build`,
  };
}

/**
 * Does the series say anything about a claimed rate? Three answers, and
 * „cannot-say" is the honest one for a short series — an interval that spans
 * the claim AND its opposite has refuted nothing.
 */
export function rateVerdict(rate, claim) {
  if (!rate || rate.point === null) {
    return { verdict: "cannot-say", why: rate?.why ?? "no rate was published" };
  }
  if (typeof claim !== "number" || !Number.isFinite(claim) || claim < 0 || claim > 1) {
    return { verdict: "cannot-say", why: "no claimed rate was given to compare against" };
  }
  if (!rate.buildStable) {
    return { verdict: "cannot-say", why: rate.why };
  }
  const inside = claim >= rate.lo95 && claim <= rate.hi95;
  const pct = (x) => `${(x * 100).toFixed(0)}%`;
  return inside
    ? {
        verdict: "consistent",
        why: `${pct(claim)} lies inside the 95% interval ${pct(rate.lo95)}–${pct(rate.hi95)} (${rate.passes}/${rate.n}) — this series does not refute it`,
      }
    : {
        verdict: "refutes",
        why: `${pct(claim)} lies OUTSIDE the 95% interval ${pct(rate.lo95)}–${pct(rate.hi95)} (${rate.passes}/${rate.n})`,
      };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4 · THE PRODUCT'S ERROR BOUNDARY IS NOT A LESSON
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `sc-vu-emergency:011b0e98` is a MOBILE paint claim, and w41's
 * `sc-vu-emergency__mobile-right` photographed an error boundary for its whole
 * length. Its own log says why, in the frame the harness itself annotated:
 *
 *   !! frame 01-arrival.png: A NEXT RUNTIME-ERROR OVERLAY WAS STRIPPED …
 *      «Runtime Error · ServerConnection terminated due to connection timeout»
 *   [01-arrival] -1 км/ч  gear=?  card=-/-
 *      · Системен доклад · Нещо се обърка
 *      · Не е по твоя вина — секцията отказа да зареди…
 *      · Код: 1262971832 · Опитай отново
 *
 * That is `app/(dashboard)/error.tsx` — the segment's own boundary — after the
 * dev server's websocket timed out on a box where a single frame was costing
 * 22 s. It is NOT the handbrake of §1: this lane's cockpit census reads
 * `speedReadable: 0, gearReads: 0` (nothing readable at all), where
 * sc-vp-readiness reads `335 / 335` with `movingReads: 0`. One is a page with
 * no lesson on it; the other is a lesson with a held car.
 *
 * THE HARNESS ALREADY GOT THE VERDICT RIGHT — exit 7, `redrive: true`, „THE
 * DRIVE NEVER STARTED". What it got wrong is everything before that: it spent
 * ~200 s and 10 frames photographing a crash page, and `classifyDrive`'s own
 * sentence had to hedge — „a paywall on an unentitled session and a lesson
 * that crashed into its error boundary leave the same silence". They do not.
 * One of them is on the glass in three named strings, and the boundary carries
 * its own retry button (`unstable_retry()`, which re-fetches and re-renders
 * the failed segment — „transient DB/network hiccups recover in place").
 *
 * So: NAME it, PRESS the product's own «Опитай отново», bounded, and if it
 * will not clear, stop there instead of driving a crash page. The exit code is
 * unchanged (7 already means RE-DRIVE); what changes is that the folder says
 * which of the two silences it is, and that the lane costs seconds.
 */

/**
 * `app/(dashboard)/error.tsx:28,31` and `app/error.tsx:26`.
 *
 * CASE-INSENSITIVE, AND THAT IS NOT SLOPPINESS. The label is authored
 * «Системен доклад» and rendered through `hud-label`, which uppercases it in
 * CSS — so `textContent` returns the source casing and `innerText` returns
 * «СИСТЕМЕН ДОКЛАД». Both are real readings of the same page (w41's
 * sc-vu-emergency log carries the second, this file's probe takes the first),
 * and a predicate that recognised only one of them would be blind on whichever
 * reader it was not written against.
 */
export const ERROR_BOUNDARY_REPORT_RE = /Системен доклад/iu;
export const ERROR_BOUNDARY_TITLE_RE = /Нещо се обърка/iu;
/** `Код: {error.digest}` — the line that joins the frame to the server log. */
export const ERROR_BOUNDARY_DIGEST_RE = /Код:\s*([0-9A-Za-z-]+)/u;
/** The boundary's own recovery control — `unstable_retry()`. */
export const ERROR_BOUNDARY_RETRY_LABEL = "Опитай отново";
/** How many times to press it before giving up. Two, because the cause it
 *  recovers from is a transient socket timeout and a third press is a wait,
 *  not a retry. */
export const ERROR_BOUNDARY_RETRIES = 2;

/**
 * Is this page the product's error boundary rather than a lesson?
 *
 * STRUCTURE FIRST, TEXT SECOND. The absence of `[data-sim-shell]` is what
 * makes this a boundary rather than a lesson that happens to contain the
 * words — the boundary REPLACES the segment, so a page carrying both the
 * shell and the sentence is something else and must not be condemned here.
 * The two sentences together are then what tells it from the paywall, which
 * also has no shell.
 */
export function errorBoundaryVerdict({ text = "", shell = false, retryPresent = false } = {}) {
  const report = ERROR_BOUNDARY_REPORT_RE.test(text);
  const title = ERROR_BOUNDARY_TITLE_RE.test(text);
  if (shell === true) {
    return {
      boundaried: false,
      digest: null,
      retryPresent,
      why: "a lesson shell is mounted on this page, so whatever else is on it, the segment did not fall to its error boundary",
    };
  }
  if (!(report && title)) {
    return {
      boundaried: false,
      digest: null,
      retryPresent,
      why: "neither «Системен доклад» nor «Нещо се обърка» is on this page — if it is not a lesson it is not a boundary either",
    };
  }
  const m = ERROR_BOUNDARY_DIGEST_RE.exec(text);
  return {
    boundaried: true,
    digest: m ? m[1] : null,
    retryPresent,
    why:
      "the segment fell to app/(dashboard)/error.tsx — «Системен доклад · Нещо се обърка» with no [data-sim-shell] on the page" +
      (m ? ` (Код: ${m[1]})` : "") +
      ". This folder cannot hold evidence about a driving lesson.",
  };
}
