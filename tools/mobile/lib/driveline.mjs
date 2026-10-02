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
/* THE ONE THING IN THIS FILE THAT TOUCHES DISK, and it is confined to one
 * loader. §2b has to know the band the ENGINE grades in, and a band retyped
 * here is a band that stops mirroring the product the day an ADR moves it — so
 * `readSpeedingConfig` reads `rules/types.ts` and `speedingConfigFrom` (pure,
 * and the one the test drives) parses it. Node only; nothing here is imported
 * into a browser. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
 * THE TWO PHRASINGS A TASK CAP REACHES THE GLASS IN. Read off the product's own
 * glass, never from the template: what the engine grades and what the student
 * is told are two facts (`shownCapKmh` clamps to the posted limit), and the one
 * a `wrong` leg must be seen to beat is the one on screen.
 *
 *   1. `lessons/advisor.ts` / `LessonPlayShell.tsx` — `${titleBg} — дръж под
 *      ${shown} км/ч`, on the objective banner and the advisor card.
 *   2. `hud/StatusDashboard.tsx:661` — `· задачата иска ≤{bindingKmh}`, amber,
 *      on the cockpit strip, `data-hud="governor-task-binds"`, printed whenever
 *      the task's cap is the number the student is actually billed against.
 *
 * THIS DOCBLOCK USED TO SAY PHRASING 1 WAS „THE ONLY" ONE, and that sentence
 * kept two rows unjudgeable. Wave 46's truck-spray lane measured it on
 * `w37/frames/sc-ac-truck-spray__pc-wrong/04-t060s.png`: the disc reads 140 and
 * the strip reads «задачата иска ≤80», while the objective banner states the
 * task with no cap in it (the lane's verifier found no «дръж под» on that
 * surface). So the w45 sidecar said `"done": "no-cap"` — „no «дръж под N км/ч»
 * is on the glass" — about a lesson whose cap was painted in amber in front of
 * the driver. `sc-ac-truck-spray:990e5f64` (critical) and `:8ed4d8b3` have been
 * refused for want of the antecedent on every sweep since wave C: no wrong leg
 * in w17, w34–w37 or w45 topped 66 км/ч, because nothing told the hold there
 * was a cap to beat.
 * The product already knew there are two surfaces: `advisor.ts:562` recovers
 * the strip's figure with a regex of its own.
 *
 * Phrasing 2 needs no unit: the strip prints the numeral straight after `≤`.
 * The truncation guard on phrasing 1 is unchanged — «… дръж под 63 км/» still
 * reads as no cap.
 */
export const TASK_CAP_RE = /(?:дръж\s+под\s+(\d+(?:[.,]\d+)?)\s*км\/ч|задачата\s+иска\s+≤\s*(\d+(?:[.,]\d+)?))/gu;

/** The cockpit strip's binding-cap span (phrasing 2 above). Read in the SAME
 *  `evaluate` as the banner and the advisor, appended to `taskCapText` only —
 *  never to the reverse-demand text, whose regexes must see exactly the two
 *  surfaces they always saw. */
export const TASK_CAP_STRIP_SEL = '[data-hud="governor-task-binds"]';

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
    const v = Number(String(m[1] ?? m[2]).replace(",", "."));
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

/**
 * The PHRASE on the glass that carried the cap `taskCapKmh` returns, verbatim
 * (whitespace collapsed). `null` when no cap is shown.
 *
 * WHY A LOG NEEDS THIS. The w46 sweep's run.log for sc-ac-truck-spray/pc-wrong
 * said the leg beat «дръж под 80 км/ч» — a phrase that was never on that
 * lesson's glass. The cap was read off the cockpit strip as «задачата иска
 * ≤80»; the log line was simply written back when phrasing 1 was the only one
 * this harness knew. A judge reading it would conclude the objective banner
 * named the cap, which is the exact opposite of the THEO-4 row filed against
 * that banner the same day. A log must quote what the student saw.
 */
export function taskCapPhrase(text) {
  if (typeof text !== "string" || text === "") return null;
  let best = null;
  for (const m of text.matchAll(new RegExp(TASK_CAP_RE.source, TASK_CAP_RE.flags))) {
    const v = Number(String(m[1] ?? m[2]).replace(",", "."));
    if (Number.isFinite(v) && v > 0 && (best === null || v > best.v)) best = { v, phrase: m[0].replace(/\s+/g, " ") };
  }
  return best ? best.phrase : null;
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
      why: "no task cap is on the glass — neither «дръж под N км/ч» on the banner or advisor nor «задачата иска ≤N» on the cockpit strip — so this leg has no antecedent to exercise and its rest cadence is untouched",
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

/**
 * THE OVER-CAP HOLD'S OWN SCAN STEP — THE TWIN OF §2b's, AND IT IS HERE
 * BECAUSE TWO OF ITS LINES SURVIVED A MUTATION RUN THIS SESSION.
 *
 * §2b's scan was extracted first. With it driven, two mutations aimed at the
 * SAME SHAPES five lines above it in the same block were run against the suite
 * and both left it GREEN at 149/149:
 *
 *   `overCapFrom ??= now` → `overCapFrom = now`   — the clock restarts on every
 *     cap RISE, so `overCap.ms` reads ~0 for ever and OVER_CAP_MAX_MS (45 s)
 *     becomes a dead branch. This is M4's defect, on the sibling clock, and M4
 *     is the mutation the previous pass was refused for missing.
 *   `if (p.kmh > overCap.topKmh) overCap.topKmh = p.kmh;` → disabled — the top
 *     of the dial never moves off its -1 sentinel, so `overCapHold` compares a
 *     cap against -1 and the hold can never be beaten. Z-top, on the twin.
 *
 * That is the lane's own documented failure mode: pinning exactly what was
 * named while the same class re-opens one layer up. The over-cap block is the
 * layer up, so it gets the same treatment rather than a disclosure.
 *
 * NOTHING ABOUT WHAT IT COMPUTES CHANGED — every branch is transcribed from the
 * block it left, including `needKmh`, which is written into the sidecar and
 * read by nothing (`overCapHold` derives its own `need` from `capKmh +
 * marginKmh`); it is preserved exactly rather than tidied, because a published
 * field's disappearance is a change to what ~200 committed legs carry.
 *
 * @returns {{capKmh:null|number, capPhrase:null|string, needKmh:null|number,
 *            topKmh:number, from:null|number, capRose:boolean}}
 */
export function overCapScanStep({
  kmh = null,
  shown = null,
  phrase = null,
  now = 0,
  state = null,
  marginKmh = OVER_CAP_MARGIN_KMH,
} = {}) {
  const fin = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const speed = (v) => (fin(v) !== null && v > 0 ? v : null);
  const st = state && typeof state === "object" ? state : {};

  let capKmh = speed(st.capKmh);
  let capPhrase = typeof st.capPhrase === "string" ? st.capPhrase : null;
  let needKmh = fin(st.needKmh);
  let from = fin(st.from);

  /* THE HIGHEST CAP EVER SHOWN, not the current one: a task can be credited and
   * the next posted mid-leg, and beating the highest beats every cap this leg
   * was ever asked about. */
  const seen = speed(shown);
  const capRose = seen !== null && (capKmh === null || seen > capKmh);
  if (capRose) {
    capKmh = seen;
    capPhrase = typeof phrase === "string" ? phrase : null;
    needKmh = seen + (fin(marginKmh) === null ? OVER_CAP_MARGIN_KMH : marginKmh);
    // `??=`, NEVER `=` — the surviving mutation named in the header. The clock
    // starts the first time a cap is seen and not at t0, so a lane whose banner
    // takes twenty seconds to mount is not charged for them.
    from ??= fin(now);
  }

  const priorTop = fin(st.topKmh) === null ? -1 : st.topKmh;
  const dial = fin(kmh);
  return { capKmh, capPhrase, needKmh, from, capRose, topKmh: dial !== null && dial > priorTop ? dial : priorTop };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2b · TOUCHING A LIMIT IS NOT BEING BILLED FOR IT — THE SUSTAIN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `sc-follow-tailgater:63c0c28c` (critical) has been closed and overturned four
 * times, and every overturn says the same thing: the penalty points on its
 * wrong leg are this harness's own careless rests, not the lesson's act. The
 * row's own text names the two acts the drill teaches — „the punishing brake
 * check at the tailgater and the guilty acceleration" (`mistakes[0]`
 * HARSH_BRAKING_NO_CAUSE, `mistakes[1]` SPEEDING_OVER_LIMIT, in
 * `scenario/templates-following.ts:1872-1886`) — and the w47 routing pass
 * refused to rule with „the row stays open: it needs a wrong leg that really
 * commits the offence."
 *
 * ── WHY SECTION 2's HOLD IS NOT ENOUGH, MEASURED ON w51 ────────────────────
 * `.audit-frames/w51/frames/sc-follow-tailgater__pc-wrong/run.log`:
 *
 *   over-cap: task cap 36 км/ч … BEATEN at t=4s … top on the flat 47 км/ч
 *   DRIVE: wrong · top 58 км/ч · 3 full stops
 *
 * Two separate reasons that leg cannot be asked about SPEEDING_OVER_LIMIT:
 *
 *  1. THE NUMBER IT WAS HELD AGAINST IS THE WRONG ONE. Section 2's hold
 *     releases on the TASK cap («задачата иска ≤36» here, so `need` = 41), and
 *     the изпитен лист is not billed against a drill instruction:
 *     `rules/engine.ts:3242` grades `tick.maxSpeedKmh`, the POSTED limit, and
 *     `engine.ts:1298-1310` says in so many words that the task cap „reaches
 *     the glass and the objective gate and never the изпитен лист". On ln-v1
 *     the posted disc is 50 and the task cap is 36 — beating 41 proves nothing
 *     about the code the row is about. (The 36 is measured — w51's own
 *     `_audit-status.json` `overCap.capKmh`; the 50 is the LESSON's own claim
 *     about its road, `templates-following.ts:1884` «вдигна над 55 км/ч в
 *     ограничение 50». The w51 run.log predates `POSTED_LIMIT_SEL` and records
 *     no disc at all, so it is not the source for that number.)
 *  2. TOUCHING IS NOT SUSTAINING. `speedingMinor` is a SUSTAINED episode
 *     (`engine.ts:3251-3266`, `cfg.speedingMinorSustainSec`), so a dial that
 *     peaks at 58 for one sample and is returned to zero by the 45 m cadence
 *     is never a fault, only a blip. The w51 leg topped 58 over a posted 50 and
 *     the debrief booked no «Превишена скорост» at all.
 *
 * ── WHAT THIS DOES AND, MORE IMPORTANTLY, WHAT IT DOES NOT CLAIM ───────────
 * It holds the first rest back while the leg ACCRUES seconds strictly above
 * `postedKmh + marginKmh`, and then it reports the two numbers it measured —
 * the metres/seconds held and the accrued over-limit time. IT DOES NOT ASSERT
 * THAT THE ENGINE WAS BILLED. It reads the engine's BAND
 * (`speedingBands`, engine.ts:2639) so that it does not accrue outside the one
 * the row's code is graded in — see `speedingBandsKmh` below — but it cannot
 * see the engine's sustain state, its re-arm or its repeat ceiling, and a
 * harness that asserted „the antecedent was exercised" from its own margin
 * would be the reassuring-direction failure this whole file exists to refuse.
 * The judge gets the measurement and the debrief, and decides.
 *
 * THE MARGIN IS THE HARNESS'S OWN, AND IT IS NOT A CLAIM ABOUT THE LAW. It is
 * `OVER_CAP_MARGIN_KMH` reused for the reason that constant already states —
 * one dial unit is a rounding artefact, 5 км/ч is not. That it happens to
 * coincide with the engine's own grace on a 50 road is a fact a judge may check
 * off the debrief; it is not an input to this decision.
 *
 * ── THE PRODUCT'S OWN LEDGER RULES, AND WHY A PROBE CLOCK THAT ONLY GOES UP
 *    LIES IN THE REASSURING DIRECTION (2026-09-18; every line below re-read
 *    off the product 2026-09-19, and one CORRECTION made then — see the band's
 *    upper end, which this list was missing) ─────────────────────────────────
 * The first cut of this hold accrued `overSec` monotonically: every tick over
 * `needKmh` added its whole interval and nothing ever took any of it back. The
 * engine does not work that way, and the difference is not academic — it is the
 * difference between „3 s accrued, the MEASUREMENT the row needs is on the
 * record" and an engine ledger sitting at exactly 0.
 *
 * Read off the product this session, by line:
 *
 *   · `rules/engine.ts:3244` — `const speedReset = speed <= limit;`. The reset
 *     is the POSTED number itself, with NO margin, and it is what
 *     `stepSustainedEpisode` (engine.ts:2432) is handed for `speedingMinor`
 *     (engine.ts:3251-3262).
 *   · `engine.ts:2443-2446` — the reset arm WIPES the ledger:
 *     `e.qualifiedSec = 0; e.lastQualAt = null;`. So a dial that dips to or
 *     below the posted disc for ONE sample gives every accrued second back.
 *     A 56/49/56/49 trajectory over a posted 50 never reaches an episode at
 *     all, while a monotonic probe clock would have printed 3 s and called the
 *     antecedent delivered.
 *   · `engine.ts:2473` — the accrual is capped per step:
 *     `e.qualifiedSec += e.lastQualAt === null ? 0 : Math.max(0, Math.min(t - e.lastQualAt, 2));`
 *     Two things, not one: no single step may add more than 2 s
 *     (`OVER_LIMIT_STEP_CAP_SEC`), and the FIRST qualifying step after any gap
 *     adds ZERO. A harness whose worst measured tick is 1,155 ms is under the
 *     cap in ordinary running — but a stalled tick is precisely when a
 *     monotonic clock would have handed itself the sustain for free.
 *   · `engine.ts:2459-2469` — between the posted number and this harness's own
 *     `needKmh` the engine is in its `!cond` arm with `accrue` true: the clock
 *     STOPS (`e.lastQualAt = null`) and the ledger SURVIVES (`if (!accrue)
 *     e.qualifiedSec = 0;` does not fire). Not a reset, not an accrual.
 *   · `engine.ts:3251` — AND THE BAND HAS AN UPPER END:
 *     `speed > bands.gradedAbove && speed <= bands.dangerousAbove`. Above the
 *     опасна line the same `!cond` arm runs and the code booked is a different
 *     one (SPEEDING_DANGEROUS, `engine.ts:3375`/`:3391`), so accruing there
 *     would hand a SPEEDING_OVER_LIMIT row an antecedent the изпитен лист
 *     never billed under it. The bound is READ off `rules/types.ts` rather
 *     than typed — `speedingBandsKmh`/`readSpeedingConfig` below.
 *
 * `overLimitHold` therefore takes an `overSec` ITS CALLER HAS ALREADY KEPT
 * under those four rules — which is precisely why it cannot be the guard over
 * them. Those four rules now live in `overLimitLedgerStep` below, where a test
 * drives a speed SEQUENCE through them; `lesson-audit.mjs`'s flat block keeps
 * the wiring and nothing else. The harness
 * reads the engine's BAND but still cannot see its `cfg.speedingMinorSustainSec`
 * = 2 (`rules/types.ts:1767`), its re-arm or its repeat ceiling — it is
 * mirroring the LEDGER's arithmetic, not predicting the bill.
 *
 * THE SAME THREE REFUSALS AS SECTION 2, for the same reason:
 *   · NO DISC ON THE GLASS → no rest is ever held, byte-identical to today —
 *     and it does NOT latch. The disc is painted by the dashboard and the first
 *     flat tick can beat it there; a `done:"no-disc"` that stuck would end the
 *     hold for the whole leg on one early tick. It retries until a disc appears
 *     or a ceiling wins, and only then is it reported — as a hold that was
 *     never ATTEMPTED, which is not the same fact as a hold that FAILED.
 *   · TWO CEILINGS ON THE HOLD — a DISTANCE one and a CLOCK one, whichever
 *     comes first (`overLimitHold`, which suppresses the cadence every tick so
 *     its metres genuinely accumulate).
 *   · BUT ONE CEILING ON THE SEARCH, and only one: the CLOCK
 *     (`overLimitSearchCeiling`, whose docblock carries the arithmetic). No
 *     rest is held back while the search looks, so the cadence keeps chopping
 *     and a distance ceiling can never be reached inside the 20 s. It was
 *     written as „150 m / 20 s, whichever comes first" and the 150 m half
 *     could not fire; it is now removed rather than reworded.
 *   · AND THE CEILING REACHED WITHOUT THE SUSTAIN IS SAID LOUDLY.
 *
 * AND IT IS OFF EVERYWHERE EXCEPT THE LANES THAT ASKED FOR IT — see
 * `SUSTAINED_OVER_LIMIT_LANES`. This is an instrument change, not a repair:
 * nothing it does may close a row, and a change that re-timed all ~200 `wrong`
 * lanes to settle one of them would invalidate the evidence under the other
 * 199.
 */

/** The В26 disc's accessible name on BOTH dashboard variants —
 *  `hud/StatusDashboard.tsx:982` (compact) and `:1098` (roomy), both
 *  `aria-label={`Ограничение ${limit} км/ч`}` where `limit` is the rounded
 *  `tick.maxSpeedKmh` the reducer itself bills against. A production surface a
 *  student is looking at; no test id was added to the product to read it. */
export const POSTED_LIMIT_SEL = '[aria-label^="Ограничение "]';

/** The posted limit off those labels. Both variants are in the DOM and carry
 *  the SAME numeral, so the max is the numeral; `null` when the disc is not on
 *  the glass, which is „no witness could speak" and not „no limit". */
export function postedLimitKmh(labels) {
  if (!Array.isArray(labels)) return null;
  let best = null;
  for (const l of labels) {
    const m = typeof l === "string" ? l.match(/Ограничение\s+(\d+(?:[.,]\d+)?)\s*км\/ч/u) : null;
    if (!m) continue;
    const v = Number(m[1].replace(",", "."));
    if (Number.isFinite(v) && v > 0 && (best === null || v > best)) best = v;
  }
  return best;
}

/* ── THE ENGINE'S OWN TWO BANDS, READ OFF THE PRODUCT RATHER THAN RETYPED ───
 *
 * WHY A LOWER BOUND WAS NOT ENOUGH, AND WHY THE MISSING HALF ERRED REASSURING.
 * The accrual arm in `lesson-audit.mjs` used to be „faster than `needKmh`",
 * with no ceiling. The engine's minor band has BOTH ends
 * (`rules/engine.ts:3251`):
 *
 *     speedingMinorCond = speed > bands.gradedAbove && speed <= bands.dangerousAbove
 *
 * Above `dangerousAbove` the engine is in the `!cond` arm
 * (`engine.ts:2459-2469`: the clock stops, the ledger survives) and it books a
 * DIFFERENT code — SPEEDING_DANGEROUS (`engine.ts:3375`, `:3391`). A leg held
 * at 65 over a posted 50 therefore accrued the harness's sustain, `run.log`
 * named SPEEDING_OVER_LIMIT and `leg-evidence.mjs` printed „the antecedent was
 * DRIVEN" — for an episode the изпитен лист never billed under that code.
 *
 * READ, NOT RETYPED. `dangerousSpeedOverKmh` is a CONFIG FIELD the engine
 * resolves at run time (unlike `OVER_LIMIT_STEP_CAP_SEC` below, which is a
 * literal in the product and so has to be restated), and `types.ts:1766` marks
 * it «official, do not change without an ADR» — i.e. the one number whose
 * movement must not leave a silent copy behind in a tool.
 *
 * AND THE LOWER BOUND STAYS THE HARNESS'S OWN. `needKmh` is still
 * `posted + OVER_CAP_MARGIN_KMH`, for the reason the section header gives; it
 * coincides with `gradedAbove` only from posted 50 up, where the 10 % ratio is
 * already capped at 5 км/ч. MEASURED this session by calling
 * `speedingBandsKmh` on the parsed config (grace 0.1 / cap 5 / опасна +10):
 * posted 30 → graded 33, опасна 40, while `needKmh` is 35; posted 50 → 55 / 60
 * and `needKmh` 55; posted 90 → 95 / 100 and `needKmh` 95 (and posted 140 →
 * 145 / 150). Below 50 the harness demands MORE speed than the
 * engine's own band starts at, which is the refusing direction and is left
 * alone. */

/** The product file `speedingBands` reads its three numbers out of. Resolved
 *  from this module's own URL, so it does not depend on the cwd — the tools
 *  tests run from `platform/` and a drive runs from the repo root. */
export const RULES_TYPES_PATH = fileURLToPath(
  new URL("../../../platform/src/modules/sim/rules/types.ts", import.meta.url),
);

/** The three fields `speedingBands(limit, cfg)` reads (`engine.ts:2639-2644`). */
export const SPEEDING_CFG_FIELDS = ["speedingGraceRatio", "speedingGraceMaxKmh", "dangerousSpeedOverKmh"];

/**
 * Parse those three numbers out of the product's config SOURCE.
 *
 * A MATCHER MUST REPORT WHAT IT CANNOT READ — the standing rule this repo has
 * paid for three times. So: a field with no numeric assignment is `missing`,
 * and a field with MORE THAN ONE is `ambiguous` rather than „take the first".
 * The interface declarations at `types.ts:928/934/936` are `field: number;`
 * and carry no literal, so they do not match; a second config object that did
 * would make this refuse rather than guess.
 *
 * @returns {{ok: boolean, cfg: null|{speedingGraceRatio:number,speedingGraceMaxKmh:number,dangerousSpeedOverKmh:number}, why: null|string}}
 */
export function speedingConfigFrom(source) {
  if (typeof source !== "string" || source === "") {
    return { ok: false, cfg: null, why: "the rule-config source was empty or not a string — nothing was parsed" };
  }
  const cfg = {};
  const missing = [];
  const ambiguous = [];
  for (const field of SPEEDING_CFG_FIELDS) {
    const hits = [...source.matchAll(new RegExp(`^[ \\t]*${field}:[ \\t]*(-?\\d+(?:\\.\\d+)?)[ \\t]*,`, "gmu"))];
    if (hits.length === 0) missing.push(field);
    else if (hits.length > 1) ambiguous.push(`${field} (${hits.length} assignments)`);
    else cfg[field] = Number(hits[0][1]);
  }
  if (missing.length || ambiguous.length) {
    return {
      ok: false,
      cfg: null,
      why:
        `the engine's speeding bands could not be read from the product` +
        `${missing.length ? ` — no numeric assignment for ${missing.join(", ")}` : ""}` +
        `${ambiguous.length ? ` — more than one assignment for ${ambiguous.join(", ")}, which this parser refuses to guess between` : ""}`,
    };
  }
  return { ok: true, cfg, why: null };
}

let speedingConfigCache = null;
/** …and the same, off disk, cached per path. A read that FAILS is cached too:
 *  a drive must not pay the I/O twice to be told the same thing. */
export function readSpeedingConfig(path = RULES_TYPES_PATH) {
  if (speedingConfigCache && speedingConfigCache.path === path) return speedingConfigCache.read;
  let source = null;
  try {
    source = readFileSync(path, "utf8");
  } catch (e) {
    const read = { ok: false, cfg: null, why: `could not read ${path}: ${String(e && e.message ? e.message : e)}` };
    speedingConfigCache = { path, read };
    return read;
  }
  const read = speedingConfigFrom(source);
  speedingConfigCache = { path, read };
  return read;
}

/** `speedingBands` (`rules/engine.ts:2639-2644`), by the engine's own formula:
 *  the grace is the RATIO capped in absolute km/h, the опасна line is a flat
 *  +N. `null` — never a default band — when the limit or the config is not
 *  something this can compute from. */
export function speedingBandsKmh(limit, cfg) {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return null;
  if (!cfg || SPEEDING_CFG_FIELDS.some((f) => !Number.isFinite(cfg[f]))) return null;
  const grace = Math.min(limit * cfg.speedingGraceRatio, cfg.speedingGraceMaxKmh);
  return { gradedAbove: limit + grace, dangerousAbove: limit + cfg.dangerousSpeedOverKmh };
}

/** How long the dial must stay over the posted limit before the cadence may
 *  chop it. The ENGINE's own window is `cfg.speedingMinorSustainSec` = 2 s
 *  (`rules/engine.ts:1260`, and it ACCRUES rather than requiring consecutive
 *  seconds — `SPEEDING_SUSTAIN_ACCRUES`, engine.ts:3262); this is 3 because
 *  the probe samples at ~2 Hz (w51 `TICK COST`: idle ×106 med 510 ms), so 2 s
 *  is four samples and one long tick would spend half of it. The extra second
 *  is the harness's sampling margin and nothing else. */
export const OVER_LIMIT_SUSTAIN_SEC = 3;
/** THE MOST ONE TICK MAY ADD TO THE LEDGER, mirroring the engine's own cap:
 *  `Math.min(t - e.lastQualAt, 2)` at `rules/engine.ts:2473`. It is 2 there and
 *  2 here, and it is a LITERAL in the product rather than a config field, which
 *  is why it is restated rather than read. Measured this session: the worst
 *  tick w51 recorded on this lane is 1,155 ms, comfortably under — the cap is
 *  for the stalled tick, which is exactly the tick a monotonic clock would have
 *  used to hand itself the sustain. */
export const OVER_LIMIT_STEP_CAP_SEC = 2;
/** Distance ceiling on the hold. Deliberately far tighter than the task cap's
 *  400 m: ln-v1 is a 400 m road (`templates-following.ts:1669` — «on ln-v1
 *  (reused 400 m 2+2»), so a 400 m hold is „this leg never rests",
 *  which would take the rest evidence away from every other row on the lane.
 *  The arithmetic it has to cover: 3 s at 55 км/ч (15,3 m/s) is 46 m, and the
 *  w51 leg was at 55 км/ч by t=5 s on the flat
 *  (`.audit-frames/w51/frames/sc-follow-tailgater__pc-wrong/run.log:95`,
 *  «[04-t005s] 55 км/ч»). THE RUN.LOG RECORDS TIME, NOT DISTANCE — an earlier
 *  draft of this line said „in ~45 m", which was inferred from
 *  `FLAT_REST_EVERY_M` and never measured. 46 m fits inside 150 m with room to
 *  spare either way. */
export const OVER_LIMIT_MAX_M = 150;
/** Clock ceiling, for a leg that is not covering ground. 20 s at ~2 Hz is ~40
 *  samples; a leg that has not accrued 3 s over the disc in 40 samples of held
 *  throttle is not going to. */
export const OVER_LIMIT_MAX_MS = 20_000;

/**
 * HAS THE NO-DISC SEARCH LOOKED LONG ENOUGH TO GIVE UP? A CLOCK, AND ONLY A
 * CLOCK — AND THE DISTANCE HALF IS REFUSED RATHER THAN FIXED.
 *
 * The first cut of the search gave up on `flatM >= OVER_LIMIT_MAX_M ||
 * searchMs >= OVER_LIMIT_MAX_MS` and its log, §2b above and the guard test all
 * said „150 m / 20 s, whichever comes first". The first half could not fire:
 * `flatM` is the REST CADENCE's counter and is zeroed every
 * `FLAT_REST_EVERY_M` = 45 m, and no rest is held back while the search is
 * still looking, so it never passes ~45 m.
 *
 * GIVING THE SEARCH ITS OWN UNRESET COUNTER DOES NOT FIX IT EITHER, and this
 * is the measurement that decided it (arithmetic on three committed constants,
 * run this session): 150 m of flat needs THREE completed 45 m stretches
 * (135 m) plus part of a fourth, each completed stretch is followed by a rest
 * phase costing at least `FLAT_REST_HOLD_MS` = 8 s (or `FLAT_REST_GIVEUP_MS` =
 * 15 s when the car will not stop), so ≥24 s of STANDSTILL alone must pass
 * before 150 m can be covered — against a 20 s ceiling, before a single second
 * of driving is counted. The clock always wins. A second unreachable branch
 * dressed as a reachable one is what this lane was refused for; the honest
 * move is to have one ceiling and say so.
 *
 * `OVER_LIMIT_MAX_M` is NOT dead — it still bounds `overLimitHold`, where the
 * hold suppresses the cadence every tick and `flatM` therefore does grow past
 * 45 m. It is only the SEARCH that has no distance half.
 *
 * @returns {{give: boolean, latch: null|"clock"}}
 */
export function overLimitSearchCeiling({ searchMs = 0, maxMs = OVER_LIMIT_MAX_MS } = {}) {
  if (Number.isFinite(searchMs) && searchMs >= maxMs) return { give: true, latch: "clock" };
  return { give: false, latch: null };
}

/* ── THE LEDGER ITSELF, MOVED HERE SO A TEST CAN DRIVE A SPEED SEQUENCE ─────
 *
 * WHY THIS MOVED (2026-09-19, and it is the whole reason this lane was refused
 * a fourth time). `overLimitHold` above takes `overSec` as an INPUT. MEASURED
 * on the test file as it stood before this extraction: 9 `overLimitHold(` call
 * sites, and 9 of the 9 pass an `overSec:` of their own. Every one of them
 * therefore HANDS IT the number
 * whose computation is the thing under suspicion — the four engine rules §2b
 * spends sixty lines mirroring were, until this extraction, reachable only by
 * driving a browser, and the guards standing over them were `assert.match`
 * calls against `lesson-audit.mjs` READ AS A STRING. A source matcher can see
 * that an arm EXISTS. It cannot see that the arm computes the wrong number,
 * and the judge's own mutation proved it: widening the accrual arm's upper
 * bound by 100 км/ч — i.e. re-creating the defect the bound was added for, a
 * leg held at 65 over a posted 50 accruing into the SPEEDING_OVER_LIMIT ledger
 * — left the suite green at 127/127.
 *
 * So the three arms are a pure function here, `lesson-audit.mjs` keeps only
 * the wiring, and `__tests__/driveline.test.mjs` drives 56,57,65,56,57,58 over
 * a posted 50 through them and asserts where the seconds land. Exactly the
 * move this section already made for `overLimitSearchCeiling`, for exactly the
 * same reason.
 *
 * NOTHING ABOUT THE ARITHMETIC CHANGED. The arms are transcribed, in order,
 * from the block they left; the only additions are the three-valued refusals
 * this file's one rule requires — a dial, a disc or a band that is not a
 * finite number now breaks the run of over-limit ticks instead of being
 * compared with `!== null` and silently passing.
 */

/**
 * ONE TICK OF THE OVER-POSTED-LIMIT LEDGER, under the engine's own four rules
 * (`rules/engine.ts:3244`, `:2443-2446`, `:2473`, `:2459-2469`, `:3251` — the
 * list with line numbers is in §2b's header above).
 *
 * @returns {{overSec:number, resets:number, qualAt:null|number,
 *            arm:"no-dial"|"reset"|"accrue"|"stopped"}}
 *   `arm` is which of the engine's three arms this tick took, and it is
 *   returned rather than inferred so a test can assert the ROUTING and not
 *   only the total: "stopped" and "reset" both leave `overSec` unchanged on a
 *   tick that had nothing to give back, and they are not the same fact.
 */
export function overLimitLedgerStep({
  kmh = null,
  now = 0,
  postedKmh = null,
  needKmh = null,
  dangerousAboveKmh = null,
  overSec = 0,
  resets = 0,
  qualAt = null,
  stepCapSec = OVER_LIMIT_STEP_CAP_SEC,
} = {}) {
  const fin = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const sec = fin(overSec) === null || overSec < 0 ? 0 : overSec;
  const hits = fin(resets) === null || resets < 0 ? 0 : resets;
  const dial = fin(kmh);
  const posted = fin(postedKmh);
  const need = fin(needKmh);
  const dangerous = fin(dangerousAboveKmh);
  const cap = fin(stepCapSec) === null ? OVER_LIMIT_STEP_CAP_SEC : stepCapSec;
  // A TICK WITH NO DIAL IS NOT A TICK UNDER THE LIMIT. The run breaks, exactly
  // as the engine's `lastQualAt = null` breaks it, and nothing is credited.
  if (dial === null) return { overSec: sec, resets: hits, qualAt: null, arm: "no-dial" };
  // 1 · `engine.ts:3244` + `:2445` — the reset is the POSTED number with NO
  //     margin, and it WIPES the ledger.
  if (posted !== null && dial <= posted) {
    return { overSec: 0, resets: sec > 0 ? hits + 1 : hits, qualAt: null, arm: "reset" };
  }
  // 2 · `engine.ts:3251` — the minor band, BOTH ends. Above `dangerousAbove`
  //     the engine books SPEEDING_DANGEROUS, a different code, so this arm is
  //     bounded there and the tick falls to arm 3.
  if (need !== null && dial > need && dangerous !== null && dial <= dangerous) {
    // `engine.ts:2473` — the first qualifying step after a break credits ZERO,
    // and no single step may add more than the cap.
    const step = fin(qualAt) === null ? 0 : Math.min(Math.max(0, now - qualAt) / 1000, cap);
    return { overSec: sec + step, resets: hits, qualAt: now, arm: "accrue" };
  }
  // 3 · `engine.ts:2459-2469` — the `!cond` arm with `accrue` true: the clock
  //     STOPS and the ledger SURVIVES. Neither a reset nor an accrual.
  return { overSec: sec, resets: hits, qualAt: null, arm: "stopped" };
}

/**
 * THE TWO NUMBERS A HOLD'S CEILINGS ARE MEASURED IN — the metres of held
 * throttle and the milliseconds since the cap or the disc was first seen.
 *
 * ONE FUNCTION FOR BOTH HOLDS, and that is the point. `overCap.metres = flatM`
 * and `overLimit.metres = flatM` were two copies of the same line in the same
 * block, each feeding a ceiling nothing executed; mutating either to `0` made
 * its distance ceiling a dead branch and the suite stayed green. They are now
 * one call each into this, and the test below drives a leg to
 * `OVER_LIMIT_MAX_M` and asserts the hold actually ends on "metres".
 *
 * `from === null` is „the cap/disc has not been seen yet" and reads 0 ms, not
 * „the whole drive so far": a lane whose banner takes twenty seconds to mount
 * must not have those twenty seconds charged to its hold.
 *
 * @returns {{metres:number, ms:number}}
 */
export function holdCeilingFeeds({ flatM = null, now = 0, from = null } = {}) {
  const metres = typeof flatM === "number" && Number.isFinite(flatM) && flatM > 0 ? flatM : 0;
  const started = typeof from === "number" && Number.isFinite(from) ? from : null;
  const ms = started === null || !Number.isFinite(now) ? 0 : Math.max(0, now - started);
  return { metres, ms };
}

/**
 * THE NO-DISC SEARCH'S CLOCK, WHICH STARTS ONCE AND IS NEVER RESTARTED.
 *
 * `overLimitSearchFrom ??= now` was the whole of this, inline, and a judge's
 * mutation to `overLimitSearchFrom = now` — the counter-zeroed-by-its-own-
 * cadence shape this lane has already removed once, from the distance half of
 * `overLimitSearchCeiling` — left the suite green at 127/127. With it applied
 * the search's ONLY ceiling can never be reached: `searchMs` is 0 on every
 * tick for ever, `done` never latches, and the loud that tells a judge the
 * disc was never painted never fires. The test drives 41 ticks through this.
 *
 * @returns {{searchFrom:number, searchMs:number}} `searchFrom` is what the
 *   caller must store back — the FIRST tick's clock, not this one's.
 */
export function overLimitSearchClock({ now = 0, searchFrom = null } = {}) {
  const from = typeof searchFrom === "number" && Number.isFinite(searchFrom) ? searchFrom : now;
  return { searchFrom: from, searchMs: Number.isFinite(now) ? Math.max(0, now - from) : 0 };
}

/* ── THE SCAN STEP — THE OTHER HALF OF THE TICK, AND THE HALF NOBODY DROVE ──
 *
 * `overLimitLedgerStep` above was extracted because the guards over the ACCRUAL
 * ARMS were `assert.match` calls against `lesson-audit.mjs` read as a string.
 * That extraction pinned the ledger's CALL ARGUMENTS and stopped there — so the
 * assignments that put the arguments INTO the object in the first place were
 * never a surface at all. Nine mutations of those store-backs were run against
 * the suite as it stood and all nine left it GREEN at 135/135 (measured this
 * session; the baseline run is `node --test ../tools/mobile/__tests__/
 * driveline.test.mjs` → `pass 135 / fail 0`).
 *
 * ONE OF THE NINE IS MATERIAL AND NOT COVERAGE DEBT, and this is the
 * measurement that says so. Mutate `needKmh = posted + OVER_CAP_MARGIN_KMH` to
 * `needKmh = posted` and drive the REAL `overLimitLedgerStep` with a leg pinned
 * at 52 км/ч over a posted 50, ten ticks of 500 ms:
 *
 *   need 55 (as shipped) → overSec 0.0 s, arms: stopped ×10
 *   need 50 (mutated)    → overSec 4.5 s, arms: accrue ×10  → past
 *                          OVER_LIMIT_SUSTAIN_SEC = 3, so the hold reports
 *                          "sustained"
 *
 * …while the ENGINE's own `gradedAbove` for a posted 50 is 55 (grace =
 * min(50 × 0.1, 5) = 5, off `rules/types.ts:1761-1766` this session), so the
 * изпитен лист bills NOTHING at 52. The harness would certify an antecedent as
 * DRIVEN and print "accrued INSIDE it" about a band the leg never entered.
 * That is the ledger extraction's own defect mirrored at the band's LOWER edge,
 * in the same object, and it was unpinned.
 *
 * SO THE ARITHMETIC MOVES HERE, exactly as the ledger's did. `lesson-audit.mjs`
 * keeps the wiring; this function is driven by `__tests__/driveline.test.mjs`.
 * Nothing about what it computes changed — every branch is transcribed from the
 * block it left, and the only additions are the three-valued refusals this
 * file's one rule requires plus the two FLAGS below, which report states that
 * were previously invisible rather than changing any.
 *
 * THE TWO FLAGS, AND WHY EACH IS A STRENGTHENING AND NOT A LOOSENING:
 *
 *  · `needBelowGraded` — the harness's own `needKmh` sitting BELOW the engine's
 *    `gradedAbove`. Measured: for a posted 50 the two are EQUAL (55 and 55), so
 *    the mirror is exact today by coincidence of two independent constants,
 *    `OVER_CAP_MARGIN_KMH = 5` here and `speedingGraceMaxKmh = 5` there. Move
 *    either and the harness accrues seconds in a band the engine does not bill
 *    — silently, in the reassuring direction. Nothing guarded that coincidence.
 *  · `topAboveBand` — the top of the flat ABOVE `dangerousAbove`. Up there the
 *    engine books SPEEDING_DANGEROUS (a different code), so a leg that went
 *    there has contaminated the antecedent it was driven to buy. `>` and not
 *    `>=`: a top exactly ON `dangerousAbove` is still inside the minor band the
 *    ledger's arm 2 accrues in, and must stay silent.
 *
 * @param {object}   a
 * @param {number?}  a.kmh    this tick's dial
 * @param {number?}  a.posted this tick's В26 disc, off `postedLimitKmh`
 * @param {object?}  a.cfg    the engine's speeding config, off `readSpeedingConfig`
 * @param {number}   a.now    this tick's clock
 * @param {object?}  a.state  the previous tick's answer (all fields optional)
 * @returns {{postedKmh:null|number, needKmh:null|number, gradedAboveKmh:null|number,
 *            dangerousAboveKmh:null|number, topKmh:number, flatTicks:number,
 *            noDiscTicks:number, from:null|number, discRose:boolean,
 *            needBelowGraded:boolean, topAboveBand:boolean}}
 */
export function overLimitScanStep({
  kmh = null,
  posted = null,
  cfg = null,
  now = 0,
  state = null,
  marginKmh = OVER_CAP_MARGIN_KMH,
} = {}) {
  const fin = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  // A SPEED IS POSITIVE OR IT IS NOT A SPEED — the same rule `leg-evidence.mjs`
  // had to learn when a `postedKmh` of -1 rendered «В26 disc -1 км/ч» through a
  // guard that asked only whether the value was a number.
  const speed = (v) => (fin(v) !== null && v > 0 ? v : null);
  const count = (v) => (fin(v) !== null && v >= 0 ? Math.trunc(v) : 0);
  const st = state && typeof state === "object" ? state : {};

  /* THIS CALL IS THE FLAT TICK. The counter is the ONE field of the object with
   * no legitimate zero: `0` means the drive ended before the flat phase, which
   * `p.end` (lesson-audit.mjs:7593) and an uncleared pause layer
   * (:7658) both do, and both sit ABOVE the flat phase at :8434 — so it is
   * reachable on any lane. Counting it here rather than at the call site is
   * what lets a test assert that a tick which found no disc still COUNTS. */
  const flatTicks = count(st.flatTicks) + 1;

  let postedKmh = speed(st.postedKmh);
  let needKmh = fin(st.needKmh);
  let gradedAboveKmh = fin(st.gradedAboveKmh);
  let dangerousAboveKmh = fin(st.dangerousAboveKmh);
  let from = fin(st.from);

  /* ON A RISE ONLY, and that is transcribed rather than widened. A disc that
   * DROPS mid-leg — 50 into a 30 zone — would leave the band and every sentence
   * built on it describing the road the car has left; it cannot fire today
   * (`content/world/ln-v1.json` holds ONE edge at maxspeed 50) and widening the
   * condition would change what ~200 committed legs measured. The state object
   * in `lesson-audit.mjs` carries the same note. */
  const seen = speed(posted);
  const discRose = seen !== null && (postedKmh === null || seen > postedKmh);
  if (discRose) {
    postedKmh = seen;
    needKmh = seen + (fin(marginKmh) === null ? OVER_CAP_MARGIN_KMH : marginKmh);
    // THE ENGINE'S OWN BAND, BY THE ENGINE'S OWN FORMULA. Read three-valued: a
    // band that silently became a default is the reassuring-direction failure
    // this whole section exists to refuse.
    const bands = speedingBandsKmh(seen, cfg);
    gradedAboveKmh = bands ? bands.gradedAbove : null;
    dangerousAboveKmh = bands ? bands.dangerousAbove : null;
    /* THE HOLD'S CLOCK STARTS ONCE — `??=`, never `=`. This is the sibling of
     * `overLimitSearchClock`'s own start, whose mutation to `=` left the suite
     * green at 127/127 for the previous pass: restarted on every rise, the
     * clock reads ~0 ms for ever and the ceiling it feeds can never fire. It
     * starts when a disc is FIRST seen and not at t0, because a lane whose
     * dashboard takes twenty seconds to paint the disc must not have those
     * twenty seconds charged to its hold. */
    from ??= fin(now);
  }

  /* THE ONE INPUT ON WHICH THIS IS NOT BYTE-EQUIVALENT TO THE LINE IT REPLACES,
   * AND IT IS DELIBERATE — found by running the old inline line and this one
   * over the SAME stream, 4,375 ticks across 300 randomised drives (this
   * session), comparing all eight fields every tick. Exactly one divergent
   * input: a dial of `null`. `null > -1` is TRUE in JavaScript — null coerces
   * to 0 — so `if (p.kmh > overLimit.topKmh)` STORED `null` as the top of the
   * flat. This refuses a non-number and keeps the sentinel.
   *
   * IT CANNOT FIRE ON THE DRIVE PATH: an unreadable dial is `-1`, never null or
   * undefined (`lesson-audit.mjs:1097`, `:1149`, `:6753`, and the probe's own
   * catch at `:7005`). And both values render identically to every consumer —
   * MEASURED: `overLimitNoteLine` prints «top on the flat NOT RECORDED» for -1
   * and for null, and `leg-evidence.mjs` prints «top NOT RECORDED км/ч» for
   * both. Nothing a judge reads changes; what changes is that a non-number can
   * no longer become the published top. */
  const priorTop = fin(st.topKmh) === null ? -1 : st.topKmh;
  const dial = fin(kmh);
  const topKmh = dial !== null && dial > priorTop ? dial : priorTop;

  /* A TICK ON WHICH NO DISC WAS RESOLVED. This counter used to be incremented
   * inside the `lim.done === "no-disc"` branch downstream. `overLimitHold`
   * returns that verdict on exactly one condition — `on === true` (passed as a
   * literal at the call site) and `postedKmh` not a finite number > 0 — so the
   * predicate below is the same predicate, evaluated where it can be driven.
   * The value at every point that reads it is unchanged. */
  const noDiscTicks = count(st.noDiscTicks) + (postedKmh === null ? 1 : 0);

  return {
    postedKmh,
    needKmh,
    gradedAboveKmh,
    dangerousAboveKmh,
    topKmh,
    flatTicks,
    noDiscTicks,
    from,
    discRose,
    needBelowGraded: needKmh !== null && gradedAboveKmh !== null && needKmh < gradedAboveKmh,
    topAboveBand: dangerousAboveKmh !== null && topKmh > dangerousAboveKmh,
  };
}

/**
 * SECONDS SINCE A CLOCK, OR `null` — NEVER A PLAUSIBLE ZERO.
 *
 * `Math.round((now - t0) / 1000)` was written out at both holds' success sites
 * (`overCap.provenAtSec`, `overLimit.sustainedAtSec`), and both feed the single
 * most quotable sentence each hold produces: «HELD THE ROAD'S OWN LIMIT OPEN at
 * t=Ns». Nothing executed either copy, so a divisor of 100 in place of 1000 —
 * a ten-fold wrong reading in a judging brief — was invisible to the suite.
 * One function, both sites, and a test drives it: the same move
 * `holdCeilingFeeds` made for the two `metres`/`ms` copies.
 *
 * `null` rather than 0 when either end is not a finite number, for this file's
 * one rule; and negatives clamp to 0, because a hold whose success is stamped
 * at «t=-3s» is a sentinel printed as a measurement — the shape
 * `leg-evidence.mjs` was refused for. Neither can fire on the drive path, where
 * `now >= t0` by construction; both are pinned so they cannot start to.
 *
 * @returns {null|number} whole seconds, or `null` when it was not measurable
 */
export function elapsedSec({ now = null, from = null } = {}) {
  const a = typeof now === "number" && Number.isFinite(now) ? now : null;
  const b = typeof from === "number" && Number.isFinite(from) ? from : null;
  if (a === null || b === null) return null;
  return Math.round(Math.max(0, a - b) / 1000);
}

/**
 * THE `run.log` LINE FOR THE OVER-LIMIT HOLD — AND THE THIRD PLACE THE INITIAL
 * STATE WAS BEING PUBLISHED AS A MEASUREMENT.
 *
 * `leg-evidence.mjs` got this treatment and `lesson-audit.mjs` got the loud.
 * The NOTE underneath that loud did not, and it is the line a judge quotes.
 * MEASURED this session, the real template against the real initialiser
 * (`lesson-audit.mjs:10319-10323` against the initialiser at `:7269-7326`, both
 * as that file stood at the start of this session, with `on:true`):
 *
 *   «… · 0 flat tick(s) ran · top on the flat -1 км/ч · 0.0 s accrued over the
 *    need (target 3 s) · NOT HELD …»
 *
 * Three invented numbers in one line: `-1` as a dial reading, `(?, ?]` as a
 * band, and `0.0 s accrued` — which is not „absent", it is the REFUTING
 * number. The loud above it mitigates and does not prevent; a reader who
 * copies one sentence copies this one.
 *
 * THE UNRUN CASE GETS ITS OWN SENTENCE rather than a field-by-field "NOT
 * RECORDED", because the two facts are different: „the hold ran and accrued
 * nothing" refutes a sustained-overspeed row, and „the hold never ran" leaves
 * it UNJUDGED. `overSec: 0` is a measurement in the first and an invention in
 * the second, and only `flatTicks` can tell them apart.
 *
 * @returns {string} one line, safe to quote
 */
export function overLimitNoteLine(state = null, { sustainSec = OVER_LIMIT_SUSTAIN_SEC } = {}) {
  const o = state && typeof state === "object" ? state : {};
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const speed = (v) => (num(v) !== null && v > 0 ? v : null);
  const ranTicks = num(o.flatTicks) !== null && o.flatTicks >= 0 ? o.flatTicks : null;

  if (ranTicks === null || ranTicks === 0) {
    return (
      `over-limit (SUSTAINED_OVER_LIMIT_LANES): NOT ONE FLAT TICK RAN (${ranTicks === null ? "the counter is missing" : "0 counted"}) — ` +
      `the drive ended before the flat phase, so no В26 disc was looked for, not one second was accrued and none was ` +
      `refused. EVERY FIELD OF THIS BLOCK IS ITS INITIAL STATE AND NOTHING HERE WAS MEASURED: a row about what the ` +
      `engine books for a SUSTAINED over-speed is UNJUDGED from this leg and is NOT refuted by it.`
    );
  }

  const disc = speed(o.postedKmh) !== null ? `${o.postedKmh} км/ч` : "NOT ON THE GLASS";
  const need = speed(o.needKmh) !== null ? `>${o.needKmh} км/ч` : "NOT RECORDED";
  const band =
    speed(o.gradedAboveKmh) !== null && speed(o.dangerousAboveKmh) !== null
      ? `(${o.gradedAboveKmh}, ${o.dangerousAboveKmh}] км/ч`
      : "NOT RECORDED";
  // `>= 0` and not `isFinite`: the field's initial value is the sentinel -1.
  const top = num(o.topKmh) !== null && o.topKmh >= 0 ? `${o.topKmh} км/ч` : "NOT RECORDED";
  const secs = num(o.overSec) !== null && o.overSec >= 0 ? `${o.overSec.toFixed(1)} s` : "NOT RECORDED";
  const at = num(o.sustainedAtSec) !== null && o.sustainedAtSec >= 0 ? `t=${o.sustainedAtSec}s` : "a time this leg did not record";
  const held = o.sustained === true ? `HELD at ${at}` : "NOT HELD";
  const rests = num(o.restsHeld) !== null && o.restsHeld >= 0 ? `${o.restsHeld}` : "NOT RECORDED";
  const why = typeof o.why === "string" && o.why !== "" ? o.why : "-";

  /* THE TWO FLAGS REACH THE LINE, or they are two more predicates nothing
   * reads — the measured failure mode of this whole programme (51 of 82 audited
   * repairs shipped a predicate no consumer read). */
  const contaminated =
    o.topAboveBand === true
      ? ` · ⚠ THE TOP OF THE FLAT WENT ABOVE THE ENGINE'S MINOR BAND — up there the engine books SPEEDING_DANGEROUS, a ` +
        `DIFFERENT code, so seconds spent there do not support a SUSTAINED_OVER_LIMIT row`
      : "";
  const mirrorBroken =
    o.needBelowGraded === true
      ? ` · ⚠ THIS HARNESS'S OWN need SITS BELOW THE ENGINE'S gradedAbove — it is accruing seconds in a band the ` +
        `изпитен лист bills NOTHING for, and any "sustained" verdict on this line is the harness's, not the engine's`
      : "";

  return (
    `over-limit (SUSTAINED_OVER_LIMIT_LANES): В26 disc ${disc} · need ${need} · engine band ${band} · ` +
    `${ranTicks} flat tick(s) ran · top on the flat ${top} · ` +
    `${secs} accrued over the need (target ${sustainSec} s) · ` +
    `${held} · ${rests} rest(s) held back · ${why}${contaminated}${mirrorBroken}`
  );
}

/**
 * THE LANES THIS IS ON FOR, AND THE ROW EACH ONE SERVES.
 *
 * An allowlist and not a default, for the reason the section header gives: a
 * harness change is not a repair, and re-timing every `wrong` lane to serve one
 * row would move the evidence under all the others. Adding a lane here is a
 * statement that an OPEN row on it needs a SUSTAINED over-posted-limit
 * antecedent that the 45 m cadence is currently chopping — the same kind of
 * per-route statement the product itself makes with `ruleConfig:
 * { needlessStopEnabled: true }`.
 */
export const SUSTAINED_OVER_LIMIT_LANES = new Map([
  [
    "sc-follow-tailgater",
    "sc-follow-tailgater:63c0c28c (critical, PARTIAL on its fourth overturn) — the drill's mistakes[1] «Гузно ускоряване» grades SPEEDING_OVER_LIMIT off the player's own dial, and w51's leg topped 58 over a posted 50 without ever holding it: 3 careless rests, 0 «Превишена скорост»",
  ],
]);

/** `{ on, why }` for a scenario id. `why` is the row the lane was added for and
 *  is printed on the drive, so a reader never meets the changed cadence without
 *  meeting the reason for it. */
export function sustainedOverLimitLane(scenario) {
  const why = typeof scenario === "string" ? SUSTAINED_OVER_LIMIT_LANES.get(scenario) ?? null : null;
  return { on: why !== null, why };
}

/**
 * Should the `wrong` leg's first rest be held back one more tick so the dial
 * can ACCRUE time over the posted disc?
 *
 * @returns {{hold: boolean, done: null|"sustained"|"metres"|"clock"|"no-disc"|"off", why: string}}
 *   `done` is the reason the hold ENDED and is what the log prints; `null`
 *   means it has not ended. `"sustained"` says the MEASUREMENT was taken — it
 *   does not say the engine billed it.
 *
 *   `"no-disc"` IS THE ONE ANSWER A CALLER MUST NOT LATCH ON. It means „this
 *   tick had no posted number to hold the dial over", and the dashboard can
 *   paint the disc after the first flat tick — so it is a not-yet, not a
 *   verdict, and the caller keeps asking until a disc appears or one of the two
 *   ceilings it also owns is reached. Latching it would end the hold on tick
 *   one AND then report a failure for an attempt that never happened.
 */
export function overLimitHold({
  on = false,
  postedKmh = null,
  overSec = 0,
  sustainSec = OVER_LIMIT_SUSTAIN_SEC,
  topKmh = -1,
  metres = 0,
  ms = 0,
  marginKmh = OVER_CAP_MARGIN_KMH,
  maxM = OVER_LIMIT_MAX_M,
  maxMs = OVER_LIMIT_MAX_MS,
} = {}) {
  if (on !== true) {
    return {
      hold: false,
      done: "off",
      why: "this lane is not in SUSTAINED_OVER_LIMIT_LANES — its rest cadence is untouched",
    };
  }
  if (typeof postedKmh !== "number" || !Number.isFinite(postedKmh) || postedKmh <= 0) {
    return {
      hold: false,
      done: "no-disc",
      why: "the В26 disc «Ограничение N км/ч» is not on the glass ON THIS TICK, so there is no posted number to hold the dial over and this tick's rest cadence is untouched — ask again next tick, and do not latch this",
    };
  }
  const need = postedKmh + marginKmh;
  if (typeof overSec === "number" && Number.isFinite(overSec) && overSec >= sustainSec) {
    return {
      hold: false,
      done: "sustained",
      why:
        `the dial held above ${need} км/ч (posted ${postedKmh} + ${marginKmh} margin) for ${overSec.toFixed(1)} s of ` +
        `accrued time, top ${topKmh} км/ч — the MEASUREMENT the row needs is on the record. Whether the engine's own ` +
        `grace band and sustain window turn it into a bill is the debrief's answer, not this harness's`,
    };
  }
  if (metres >= maxM) {
    return {
      hold: false,
      done: "metres",
      why:
        `${Math.round(metres)} m of held throttle accrued only ${Number(overSec || 0).toFixed(1)} s above ${need} км/ч ` +
        `(top ${topKmh} км/ч) — the hold gives up at ${maxM} m and the leg rests. THE ANTECEDENT WAS NOT EXERCISED.`,
    };
  }
  if (ms >= maxMs) {
    return {
      hold: false,
      done: "clock",
      why:
        `${Math.round(ms / 1000)} s of held throttle accrued only ${Number(overSec || 0).toFixed(1)} s above ${need} км/ч ` +
        `(top ${topKmh} км/ч) — the hold gives up at ${maxMs / 1000} s and the leg rests. THE ANTECEDENT WAS NOT EXERCISED.`,
    };
  }
  return {
    hold: true,
    done: null,
    why:
      `holding the rest back until the dial has spent ${sustainSec} s above ${need} км/ч ` +
      `(posted ${postedKmh} + ${marginKmh} margin); ${Number(overSec || 0).toFixed(1)} s so far, top ${topKmh} км/ч`,
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
 * The product's FOUR end verdicts, matched WHOLE. `НЕЗАВЪРШЕН` is neither a
 * pass nor a fail: the lesson was not finished, so it is not a draw of the
 * quantity the row is about, and it is counted separately rather than folded
 * into the denominator's numerator.
 *
 * ── «НЕ Е ВЗЕТ» IS THE FOURTH, AND IT IS ITS OWN BUCKET — ADR-009, 2026-09-18.
 *
 * Founder Ruling A: in a PRACTICE scenario lesson, committing the mistake that
 * lesson exists to teach means the lesson is not passed, even the first time,
 * and NO наказателни точки are taken for that first occurrence. The изпитен
 * лист therefore reads «в допустимото» while the lesson is refused — which is
 * precisely why `SessionEndScreen`'s pill needed a word that is neither
 * «Издържан» nor «Неиздържан».
 *
 * WHY IT MAY NOT BE FOLDED INTO EITHER EXISTING BUCKET, in the two directions
 * a judge would read it:
 *  · as a PASS — the student did not pass; the row would say the product
 *    credited a lesson it refused;
 *  · as a FAIL — «Неиздържан» means the изпитен лист convicted him, and on
 *    these drives it did not. A pass rate built on that conflation would
 *    attribute a spotless sheet to a broken grader.
 * It is not `unfinished` either: the route was driven to the end. It is a
 * fourth state of one finished drive, so it is a fourth key.
 *
 * ⚠ THE SUBSTRING TRAP HAS A SECOND MOUTH ON THIS WORD. «НЕ Е ВЗЕТ» is three
 * tokens, and the product prints it inside a pill the harness reads with
 * whitespace already collapsed (`lesson-audit.mjs` `t()`), so the match is on
 * the single-spaced form. A `.includes("ВЗЕТ")` test would also match the
 * catalogue's «взето»; whole-string equality is the only form that cannot.
 *
 * ⚠ AND ABOUT 10 RIGHT LEGS WILL READ IT ON THE NEXT SWEEP (doc 92 §12 R3).
 * That is expected behaviour, not a regression: a right leg that commits the
 * lesson's own mistake is now refused by design. A judge must check the leg's
 * own inputs before filing a product finding — which it can only do if this
 * function hands it the word instead of hiding it inside `fail`.
 */
export function classifyVerdict(verdict) {
  const v = String(verdict ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  if (v === "") return "unknown";
  if (v === "НЕИЗДЪРЖАН") return "fail";
  if (v === "ИЗДЪРЖАН") return "pass";
  if (v === "НЕЗАВЪРШЕН") return "unfinished";
  if (v === "НЕ Е ВЗЕТ") return "lessonMistake";
  return "unknown";
}

/** At least this many judgeable drives before a rate is published at all. */
export const RATE_MIN_N = 2;

/**
 * ═══ WHAT MAY ENTER A PASS-RATE DENOMINATOR, AND WHY `exit === 0` IS NOT IT ══
 *
 * The three open rows this series exists to settle all say the same sentence
 * in their own verdict lines — «Needs N repeats of a TRACKED reference drive at
 * one commit» (`sc-ln-obstacle-meeting:114706e0`, w47) — and they say WHY: on
 * the last three sweeps «every recorded fail was a harness driving act», so a
 * series of untracked draws measures this harness's variance and not the
 * product's. `exit === 0` cannot express that. It means «the drive happened and
 * every frame was written»; it is silent about whether the car was steered.
 *
 * MEASURED ON THE ROW'S OWN LESSON, w47 at head 7648edf7 (the three
 * `_audit-status.json` files under `.audit-frames/w47/frames/`):
 *
 *   sc-ln-obstacle-meeting__pc-right     drove · tracking INTERMITTENT @ 0.69 · fidelity drifted  (5.3 m off)
 *   sc-ln-obstacle-meeting__mobile-right drove · tracking TRACKED      @ 0.977 · fidelity on-line (≤2.57 m)
 *   sc-ln-obstacle-meeting__mobile-wrong drove · tracking NOT-INVOKED  @ 0     · fidelity off-route (62%)
 *
 * All three exit 0. All three enter the denominator under the old rule, and the
 * w47 judge threw the first one out by hand — «pc-right is INTERMITTENT 69%
 * (STEERED BADLY)». A rule a judge has to apply by hand is a rule the harness
 * does not have.
 *
 * ── TWO WITNESSES, AND NEITHER ONE ALONE ──────────────────────────────────
 *
 * `guidance.tracking.verdict` is the field that already says the word. It is
 * `summariseTracking`'s own ladder (lib/guidance.mjs). `not-invoked`,
 * `speed-unreadable` and `blind` raise «THIS DRIVE WAS NOT STEERED»;
 * `wandered` and `intermittent` raise «THIS DRIVE STEERED BADLY». It is not
 * invented here and it is not re-derived here; it is read.
 *   AN EARLIER DRAFT CALLED `tracked` "the ONE value that raises no loud()",
 *   and that is false: `never-moved` raises none either (the ladder at
 *   lesson-audit.mjs:10792-10810 has three loud branches and that value is in
 *   none of them). No hole follows — a `never-moved` draw is refused here like
 *   any other non-`tracked` value — but the sentence was a JUSTIFICATION for
 *   reading this field, and a justification that does not reproduce is the
 *   defect this directory keeps meeting. The real justification is narrower and
 *   survives: `tracked` is the only value the ladder treats as a drive that
 *   steered, and this gate admits only that one.
 *
 * It is also not sufficient, and `tools/audit/route-fidelity.mjs` says so in
 * its own header off a 279-lane recount: `sc-junction-rhr/pc-right` was
 * certified `tracked` at 37.5 m off the authored line. That verdict grades the
 * control law's own error signal against a locally-straight centreline; it
 * never asks where the car was.
 *
 * The converse is equally measured, and I measured it this session on
 * `.audit-frames/w47/frames/sc-park-wall__*` with `laneFidelity()`:
 *
 *   pc-wrong     tracking not-invoked @ 0     · fidelity ON-LINE (≤2.47 m, 77%)
 *   mobile-wrong tracking not-invoked @ 0     · fidelity ON-LINE (≤2.44 m, 77%)
 *   pc-right     tracking intermittent @ 0.783 · fidelity drifted (6.7 m)
 *   mobile-right tracking tracked      @ 1     · fidelity on-line (≤2.92 m, 89%)
 *
 * The two `wrong` legs hold the flat throttle in a straight line with the
 * steering loop never invoked, and the route witness calls them ON-LINE —
 * because a straight road is a straight line. So fidelity alone admits an
 * UNSTEERED drive and tracking alone admits a DRIFTED one. The two are
 * independent by construction (a pixel scan of the ribbon; a chassis pose from
 * `window.__camProbe` against the lesson's own authored trace), which is
 * exactly why BOTH are required and neither is a fallback for the other.
 *
 * ── SILENCE REFUSES, AND THAT IS THE OPPOSITE OF `classifyDrive`'S RULE ────
 *
 * `verdict-surface.mjs` refuses to CONDEMN a drive on a field its ledger never
 * carried, and is right to: silence there would fail every pre-census drive as
 * «dead». Here the direction is inverted. A draw is being ADMITTED into a
 * denominator that a `refutes` will be published from, so a missing witness
 * must REFUSE the draw — «I cannot show this was tracked» and «this was
 * tracked» are the two sentences this whole programme keeps confusing, and
 * admitting on silence is the reassuring direction.
 *
 * ── AND A REFUSAL IS COUNTED, NEVER DROPPED ───────────────────────────────
 *
 * `passRate` publishes `dispatched`, `admitted` and `refused` with a reason
 * count for each refusal, because an operator cannot otherwise tell a clean
 * 8/8 from an 8/8 that silently threw twelve draws away. A filter that quietly
 * shrinks a denominator is a worse instrument than no filter.
 */
export const TRACKED_VERDICT = "tracked";

/** `routeFidelity`'s verdict for a drive that held its lesson's authored line.
 *  The other three (`drifted`, `off-route`, `no-witness`) all refuse. */
export const ON_LINE_VERDICT = "on-line";

/**
 * THE TWO WITNESSES, LIFTED OFF THE ARTEFACTS AND NOWHERE ELSE.
 *
 * This exists as a function, rather than as seven `st?.a?.b ?? null` lines
 * inline in the series loop, for the reason §J of the test file exists at all:
 * a predicate nothing reads is this programme's measured failure mode, and an
 * extraction buried in a loop that only runs behind two browsers can only ever
 * be checked by grepping the source for its own text. As a function it is
 * EXECUTED against status objects shaped like the real ones.
 *
 * Every field defaults to `null` and `null` REFUSES in `admitDraw` — see the
 * silence paragraph above. A ledger from an older drive that predates
 * `guidance.tracking` therefore refuses, which is correct: it is not evidence
 * that the drive was tracked, and nobody may publish a rate from it.
 *
 * @param status a parsed `_audit-status.json`, or null if it never arrived.
 * @param fidelity `laneFidelity()`'s record for the same folder, or null.
 */
export function drawWitnesses(status, fidelity) {
  const st = status ?? null;
  const fid = fidelity ?? null;
  return {
    driveClass: st?.drive?.class ?? null,
    tracking: st?.guidance?.tracking?.verdict ?? null,
    trackingSeenFrac: st?.guidance?.tracking?.seenFrac ?? null,
    fidelity: fid?.verdict ?? null,
    fidelityMaxCrossM: fid?.maxCrossTrackM ?? null,
    fidelityCoverage: fid?.routeCoveredFrac ?? null,
    fidelityWhy: fid?.why ?? null,
  };
}

/**
 * Does this draw belong in a pass-rate denominator?
 *
 * @param run one entry of the series: `{exit, driveClass, tracking, fidelity}`.
 *   `tracking` is `guidance.tracking.verdict` from the drive's own
 *   `_audit-status.json`; `fidelity` is `laneFidelity().verdict` for the same
 *   folder. Both are READ, not recomputed here.
 * @returns {{admitted: boolean, reason: string, why: string}} — `reason` is the
 *   key the report counts by, `why` the sentence it prints.
 */
export function admitDraw(run) {
  const r = run ?? {};
  const said = (v) => (v == null || v === "" ? "the ledger is silent" : `«${String(v)}»`);
  if (r.exit !== 0) {
    return {
      admitted: false,
      reason: "not-judgeable",
      why: `exit ${r.exit ?? "?"} — this lane could not be judged, so it is a draw of the harness and not of the lesson`,
    };
  }
  if (r.driveClass !== "drove") {
    return {
      admitted: false,
      reason: "no-drive",
      why: `drive class ${said(r.driveClass)} — only «drove» is a drive; a lane whose status file never arrived exits 0 with nothing in it`,
    };
  }
  if (r.tracking !== TRACKED_VERDICT) {
    return {
      admitted: false,
      reason: "untracked",
      why: `tracking verdict ${said(r.tracking)} — the row asks for repeats of a TRACKED reference drive, and this draw is not one`,
    };
  }
  // AN ABSENCE IS NOT A MEASUREMENT, AND THE SENTENCE MAY NOT PRETEND IT IS.
  // Both branches refuse — that is not in question — but the old single reason
  // asserted «the car was not on the line» even when the ledger held nothing at
  // all, which states a fact about the drive from the fact that nobody wrote one
  // down. That is the reassuring-direction failure inverted, and it is just as
  // wrong: an operator reading the refusal ledger should be able to tell «we
  // measured, and it was off the line» from «no route witness was produced».
  if (r.fidelity === null || r.fidelity === undefined) {
    return {
      admitted: false,
      reason: "off-line",
      why: `route fidelity ${said(r.fidelity)} — no route witness was produced for this draw, so nothing says where the car was and it cannot stand as a repeat of the reference drive`,
    };
  }
  if (r.fidelity !== ON_LINE_VERDICT) {
    return {
      admitted: false,
      reason: "off-line",
      why: `route fidelity ${said(r.fidelity)} — the wheel was busy, but the car was not on the line this lesson authored`,
    };
  }
  return {
    admitted: true,
    reason: "admitted",
    why: `tracked and on-line — this draw is a repeat of the reference drive`,
  };
}

/**
 * @param runs [{exit, verdict, head, driveClass, tracking, fidelity}] — one
 *   entry per drive in the series. Only draws `admitDraw` ADMITS enter the
 *   denominator; every refusal is counted and reported. See the block above.
 */
export function passRate(runs) {
  const rows = Array.isArray(runs) ? runs : [];
  const rulings = rows.map((r) => ({ run: r, ruling: admitDraw(r) }));
  const judgeable = rulings.filter((x) => x.ruling.admitted).map((x) => x.run);
  const refusals = rulings
    .filter((x) => !x.ruling.admitted)
    .map((x, _i) => ({ i: x.run?.i ?? null, dir: x.run?.dir ?? null, reason: x.ruling.reason, why: x.ruling.why }));
  // Seeded at 0 for the same reason `counts` is: a reason that appears only
  // when it happens reads as `undefined` in a report that prints all four.
  const refusedBy = { "not-judgeable": 0, "no-drive": 0, untracked: 0, "off-line": 0 };
  for (const f of refusals) refusedBy[f.reason] += 1;
  // Every key `classifyVerdict` can return, seeded at 0 — including
  // `lessonMistake` (ADR-009). A key that appears only when the state occurs
  // reads as `undefined` in a report that prints all four, and `undefined + 1`
  // is NaN in the one arithmetic this file exists to keep honest.
  const counts = { pass: 0, fail: 0, unfinished: 0, lessonMistake: 0, unknown: 0 };
  for (const r of judgeable) counts[classifyVerdict(r?.verdict)] += 1;
  const n = judgeable.length;
  const k = counts.pass;
  // The HEADs are taken over EVERY dispatched row and not over the admitted
  // ones. A tree that moved mid-series is a fact about the series, and reading
  // it off the survivors only would let a refused draw hide the move.
  const heads = [...new Set(rows.map((r) => r?.head).filter(Boolean))];
  const buildStable = heads.length <= 1;
  // The sentence every report below appends, so that no rate is ever printed
  // without the size of the pile it was NOT computed from.
  const ledger =
    refusals.length === 0
      ? `all ${rows.length} dispatched draw(s) were admitted`
      : `${refusals.length} of ${rows.length} dispatched draw(s) were REFUSED (` +
        Object.entries(refusedBy)
          .filter(([, c]) => c > 0)
          .map(([reason, c]) => `${reason} ${c}`)
          .join(", ") +
        `) and are not in this denominator`;
  if (n < RATE_MIN_N) {
    return {
      n,
      dispatched: rows.length,
      admitted: n,
      refused: refusals.length,
      refusedBy,
      refusals,
      counts,
      passes: k,
      point: null,
      lo95: null,
      hi95: null,
      buildStable,
      heads,
      why: `a rate needs at least ${RATE_MIN_N} admitted drives and this series admitted ${n} — no rate is published; ${ledger}`,
    };
  }
  const { lo, hi } = wilson(k, n);
  return {
    n,
    dispatched: rows.length,
    admitted: n,
    refused: refusals.length,
    refusedBy,
    refusals,
    counts,
    passes: k,
    point: k / n,
    lo95: lo,
    hi95: hi,
    buildStable,
    heads,
    why: buildStable
      ? `${k} of ${n} admitted drives passed; ${ledger}`
      : `${k} of ${n} admitted drives passed, BUT the tree moved during the series (${heads.length} distinct HEADs) — this rate is not about one build; ${ledger}`,
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
  // THE REFUSED PILE TRAVELS WITH THE VERDICT. `rate.why` carries it, but a
  // reader quoting «refutes» quotes THIS sentence, and «(2/2)» with twelve
  // draws thrown away says something very different from «(2/2)» out of two.
  const aside =
    rate.refused > 0
      ? `, after refusing ${rate.refused} of ${rate.dispatched} dispatched draw(s)`
      : "";
  return inside
    ? {
        verdict: "consistent",
        why: `${pct(claim)} lies inside the 95% interval ${pct(rate.lo95)}–${pct(rate.hi95)} (${rate.passes}/${rate.n}${aside}) — this series does not refute it`,
      }
    : {
        verdict: "refutes",
        why: `${pct(claim)} lies OUTSIDE the 95% interval ${pct(rate.lo95)}–${pct(rate.hi95)} (${rate.passes}/${rate.n}${aside})`,
      };
}

/**
 * THE CLAIM IS THE ROW'S, NOT THE HARNESS'S.
 *
 * `1 / 8` was hardcoded at the single call site, so every repeat row was
 * compared against 12.5% whatever it actually claimed. That is right for
 * `sc-ln-obstacle-meeting:114706e0` (six НЕИЗДЪРЖАН / one ИЗДЪРЖАН / one
 * НЕЗАВЪРШЕН over eight drives) and wrong for the two rows beside it:
 * `sc-ln-obstacle-meeting:56ff9740` («Retiring needs a repeat rate») and
 * `sc-park-wall:1edd6ff2` («Retiring this needs a repeat rate on legs that can
 * park») are cross-leg orderings and name no fraction at all.
 *
 * ⚠ AN UNPARSEABLE CLAIM RETURNS `null`, NEVER A NUMBER. `rateVerdict` answers
 * „cannot-say" to a non-number, which is the honest reading of «nobody told me
 * what this row claims»; falling back to 12.5% would reinstate the exact defect
 * in a place harder to see. It is the same rule the evidence block is held to
 * — a `??` may fall back to a SENTENCE saying the number is absent, and never
 * to a number.
 *
 * @param text `1/8`, `0.125`, `12.5%` or `13%` — however the row states it.
 * @returns {{claim: number|null, source: string|null, why: string}}
 */
export function parseClaim(text) {
  const raw = String(text ?? "").trim();
  if (raw === "") {
    return { claim: null, source: null, why: "no claimed rate was given — this series measures a rate and compares it to nothing" };
  }
  let value = null;
  const frac = raw.match(/^(-?[\d.]+)\s*\/\s*(-?[\d.]+)$/);
  const pct = raw.match(/^(-?[\d.]+)\s*%$/);
  if (frac) {
    const a = Number(frac[1]);
    const b = Number(frac[2]);
    value = Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : null;
  } else if (pct) {
    const a = Number(pct[1]);
    value = Number.isFinite(a) ? a / 100 : null;
  } else {
    const a = Number(raw);
    value = Number.isFinite(a) ? a : null;
  }
  if (value === null || !Number.isFinite(value) || value < 0 || value > 1) {
    return {
      claim: null,
      source: raw,
      why: `«${raw}» is not a rate between 0 and 1 — no comparison is made rather than one against a number nobody claimed`,
    };
  }
  return { claim: value, source: raw, why: `the row claims ${(value * 100).toFixed(1)}% (read as «${raw}»)` };
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

/* ═══════════════════════════════════════════════════════════════════════════
 * 5 · WRONG-LEG PROFILES — WHEN A `wrong` LEG RESTS, DECLARED PER LESSON,
 *     PEDALS ONLY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Four open rows cannot be judged because the `wrong` leg never COMMITS the
 * antecedent the row is about, and in every case the thing standing in the way
 * is the leg's own careless-rest cadence (`FLAT_REST_EVERY_M` = 45 m,
 * `FLAT_REST_HOLD_MS` = 8 s, `FLAT_REST_MAX_MS` = 20 s in `lesson-audit.mjs`).
 * (Each bullet is the ROW's reasoning, kept here as the reason the profile
 * exists. No line a profile prints repeats it — see THE LINES below.)
 *
 *   · sc-signal-flashing:0d68b149 — the row says every rest is a frame at or
 *     under the posted limit held for 8 s, which ends the speeding episode
 *     before the drive does. TAKING THE RESTS AWAY IS THE WHOLE PROFILE. The
 *     plain flat throttle every `wrong` leg uses already sits inside the minor
 *     band on this map (the round-1 verifier's `verify/longsim.mjs`: 58.9 км/ч
 *     terminal; the 35 archived wrong legs topped out at 56–59). ROUND 1 put a
 *     bang-bang throttle governor on the leg on a false premise; it was
 *     DELETED. Nothing in this section touches the throttle.
 *   · sc-ov-keep-right:64391c6a — the 8 s rests cut the left-lane run into
 *     stints of 9, 8, 9 and 7 s, shorter than the keep-right sustain.
 *   · sc-ac-truck-spray:3f5a3ef3 — the staged truck holds its gap by matching
 *     the player, so the only way to close on it in SECONDS is speed, and
 *     every 45 m the leg is returned to zero.
 *   · sc-pk-busstop-ban:b103c282 — the rest lands wherever 45 m says; on
 *     `.audit-frames/w61/frames/sc-pk-busstop-ban__pc-wrong` the second rest
 *     landed inside the зона and stood 8 s — but the zone's basis is
 *     `law-bus-stop` (founder follow-up ruling 2026-09-22 «Teach чл. 69 as
 *     written»), whose hold is the drop-off, not the 4 s ban-zone rest.
 *
 * ── ROUND 7 — NOTHING IN THIS SECTION READS PRODUCT SOURCE ─────────────────
 * Rounds 2–5 predicted what the engine bills, and each round's verifier found
 * a product edit under which the printed prediction was false; round 6 stopped
 * predicting, but still READ product source at drive time to SIZE the
 * behaviour, behind pins that refused on drift. The round-6 verifier (journal
 * wf_4869c413-09a, «verify», REFUTED) showed that chase does not converge
 * either: six comment-only or whitespace-only product edits refused a profile
 * and turned 25–27 tests red (V6-C1…C6), and five exotic edits (a quoted and a
 * computed spread key, `Object.defineProperty`, two destructuring shadows)
 * changed a sizing constant with every pin holding (V6-D1…D5). So — the
 * integrator's decision, round 7, binding:
 *   · every sizing number (the band, the sustains, the drop-off hold, the
 *     poll, the stint length, the gap bands, the HUD's rounding) is a DECLARED
 *     HARNESS DESIGN CONSTANT in `PROFILE_DESIGN` below. Each carries the
 *     product source it was sized from and the commit (`PROFILE_SIZED_AT`),
 *     in a `// sized from … at 4112566` comment above its declaration and in
 *     its record;
 *   · nothing here opens a product file, at drive time or ever — no reader, no
 *     pin, no refusal on drift. The lines print the numbers «sized at
 *     4112566»; the one input a line says is read at drive time is the zone's
 *     AUTHORED content (round 8: the SIZING label names it);
 *   · if the product later changes, a leg may commit its antecedent less
 *     aptly, and its OBSERVED readings will show it. No line depends on the
 *     product's current code, so no drift detection is needed.
 * The doctrine is unchanged: pedals only, no pose, no prediction of any
 * engine outcome, lessons without a profile byte-identical.
 *
 * ── THE LINES ARE STRUCTURAL (round 7) ─────────────────────────────────────
 * Every line a profile can emit — start, mid-drive, rest, outcome, and the three
 * clauses `lesson-audit.mjs` prints about it — is rendered by ONE function
 * (`renderProfileText`) from ONE enumerated table of observation templates
 * (`PROFILE_LINE_TEMPLATES`). A template's slots are TYPED: a finite number, an
 * identifier-shaped token, one of the table's own `name` / `told` / `row`
 * texts, or another template. No free text can reach a line, so a test can
 * enumerate every sentence a profile is able to say and check each one — it
 * does, against a closed vocabulary with no product actor, no product action,
 * no modal and no causal connective in it — and another test checks that no
 * other code path in this section or in the harness emits profile text.
 *
 * ── THE READINGS ARE WHAT THE HARNESS READ (round 7, from the round-6
 *    verifier's OBS-* findings) ───────────────────────────────────────────
 *   · REST OPPORTUNITIES held back are counted per stretch of the ordinary
 *     cadence (each time its 45 m / 20 s point came due while the profile
 *     held the rest, counted once from the last), never per tick;
 *   · the LONGEST INTERVAL between two flat readings is the WALL clock the
 *     possible-in-band tally and the end gap use, each tick's own work
 *     included, never capped;
 *   · the END GAP (last flat reading → the finish's clock) is measured, and
 *     the finish-open HELD needs it inside that longest interval;
 *   · a posted disc left UNREAD after its first reading is counted, and the
 *     finish-open HELD needs the disc read on every flat tick.
 *
 * ── ROUND 8 (the round-7 verifier's conditions, journal wf_aba0687f-0d8) ────
 *   · the truck drill's taught 3 s is a DESIGN CONSTANT (`drillTaughtGapSec`,
 *     sized from the lesson content at 4112566) and its reading says so; the
 *     zone braking model names only what the MODEL holds, no product physics;
 *   · the SIZING label says exactly what is read to size a profile: nothing,
 *     or — for the zone profile — the authored world file and the lesson's
 *     authored trace (content JSON), and no other file;
 *   · the harness's rest summary says the profile CHANGED WHEN RESTS FELL only
 *     when it held a due rest back or booked one; and on a lane whose zone rest
 *     was booked, the harness's older «each held 8s» is replaced by the true
 *     holds (`wrongLegRestHoldsClause`);
 *   · ONE EMISSION PATH, STRUCTURALLY: every text a profile hands the harness is
 *     `renderProfileText(spec)` for a spec the same module can hand back — each
 *     text function is a two-line wrapper over its `…Spec` twin, and every
 *     mid-drive line is a FROZEN `{ loud, line, spec }` from `sayLine`; the
 *     test re-renders every one with its own renderer;
 *   · an authored zone whose basis is not an identifier, or whose span has no
 *     finite bounds, is REFUSED (it used to throw inside the renderer).
 *
 * ── ROUND 9 (the round-8 verifier's findings, journal wf_db205df2-0a4) ──────
 *   · EVERY SENTENCE ABOUT THE HARNESS ITSELF IS TRUE OF ITS CODE: the harness
 *     DOES read the dev pose probe — `guidePose` on every flat and flat-rest
 *     tick, into its guidance samples — so no line says it does not; what is
 *     true, and what the lines now say, is that NO PROFILE DECISION reads it
 *     and nothing on a wrong leg's flat phase turns a wheel. The road witness
 *     records the lane on a wrong leg too, and the keep-right line says so.
 *     The test checks each such sentence against facts read off the harness's
 *     code (`harnessFacts`), never against an older sentence;
 *   · the mobile refusal names the population its number is over
 *     (`ODO_CENSUS_ALL_WRONG_LEGS`), not one lesson's own minimum;
 *   · the rest-opportunity stretch is summed from zero, on the harness's own
 *     arithmetic, and a new flat phase is read off `phaseTicks` as well;
 *   · the emission gates ban the MECHANISMS an obfuscated bypass needs, in the
 *     whole lib and the whole harness (the threat model is in the test file).
 *
 * ── ROUND 10 (the round-9 verifier's findings, journal wf_9db04348-e1b) ──────
 *   · EVERY SENTENCE THAT CITES A CENSUS NAMES ITS POPULATION, and every bound
 *     it cites is a declared record's own number: the odometer band is sized
 *     on a census of 12 of this lesson's archived pc wrong legs (0.935–1.028,
 *     `ODO_CENSUS_ZONE_PC`) with its low end WIDENED to 0.911, a
 *     sc-signal-flashing MOBILE leg's reading (`ODO_RATIO_LOW_END`) — round 9's
 *     refusal said «sized on this lesson's archived pc legs only», which its
 *     own low end contradicts; the reaction band names its 322 transitions
 *     (`REACTION_CENSUS`), the creep its twelve legs (`ZONE_CREEP_CENSUS`), the
 *     long-frame allowance its tick-cost census (`TICKCOST_CENSUS`);
 *   · five imprecise sentences made true: the braking line BOOKS braking (the
 *     brake goes down on a later, flat-rest tick); the truck row says how the
 *     w61 leg's first stretch ran; every declared lane's rest summary says the
 *     drive's end ended any hold still open; a zone rest that never came to
 *     rest says braking was booked and whether the harness gave it up or the
 *     drive ended; the cadence clauses name the harness's own task-cap and
 *     over-limit holds;
 *   · NO PRINT IN THE LIB: nothing here names `console`, `process`, `stdout` or
 *     `stderr`, and the lib's claim literals are a pinned census; and the lib's
 *     builtins are checked AT RUNTIME, in a child process, around its import
 *     and its export calls (the test file: each export's first 40 calls and every 200th after them).
 *
 * ── HARNESS STAGE H1 (plan57 pedalLane 1–4, 2026-09-27) ─────────────────────
 * Four more rows, each an antecedent the 45 m cadence (or the flat throttle)
 * keeps a `wrong` leg from committing:
 *   · sc-vp-telltale-red:c172d48b — a STEADY pace at or under the disc past
 *     the red lamp: every rest is a full stop, and a full stop (or any 5 км/ч
 *     shed inside 6 s) is the drive the product acquits (`pace`, lamp);
 *   · sc-vu-emergency:155903c1 / :4056508c — a pace over the yield floor
 *     through the approach: the first 45 m rest stands the car (`pace`, em);
 *   · sc-hz-brake-dont-swerve:f0023997 — no rest into the obstacle, at the
 *     plain flat throttle, until the impact-flash element mounts (`to-impact`);
 *   · sc-follow-tailgater:63c0c28c — brake to rest from ≥ 35 км/ч with the car
 *     behind closed up on the PROX badge (`brake-check`), the badge OBSERVED
 *     on the page, never predicted from a pose.
 * Their constants were sized at 01de885 (`PROFILE_SIZED_AT_H1`), and each
 * record names its own commit; a label prints every commit its profile's
 * constants were sized at. The plan names these NOT pedal-reachable, and they
 * get no H1 profile: sc-roundabout-entry:08a0b701, sc-mv-uturn-ban,
 * sc-ov-solid-line and sc-fo-motorway-gap (withdrawn below);
 * sc-ac-truck-spray:3f5a3ef3 is retired by ruling, and its round-7 profile
 * above is left exactly as it stands.
 *
 * ── WHAT A PROFILE MAY DO, AND WHAT IT MAY NOT ─────────────────────────────
 *   · PEDALS ONLY: a profile changes WHEN the leg rests, and two profiles book
 *     one brake each (the zone rest, the brake-check). No wheel on any `wrong`
 *     leg, and no decision here reads the dev pose probe (founder RULING-1 /
 *     RULING-2: never a wrong drive). The throttle is governed on exactly the
 *     two `pace` profiles of harness stage H1 (`pacePedal`, declared in the
 *     table as `kind: "pace"`, its command handed out as `pedal` and applied
 *     by the harness); every other profile, and every lane without one, keeps
 *     the plain flat throttle, and no governor ever touches the brake. The
 *     inputs are what a `wrong` leg already reads — the dial, the
 *     dial-integrated odometer (the SAME increment `FLAT_REST_EVERY_M` is
 *     measured in), the HUD's own DOM (the follow-gap chip, the В26 disc, and
 *     since H1 the rear proximity badge and a page-side count of impact-flash
 *     element mounts) — plus AUTHORED content geometry
 *     (`content/world`, `content/traces`: JSON data, not product source)
 *     through dead reckoning.
 *   · IT CHANGES WHEN RESTS HAPPEN, NEVER WHETHER THEY ARE RECORDED: every
 *     rest still goes through the `flat-rest` phase and its «came to REST»
 *     line, so WHERE the car rested stays readable.
 *   · HARD CEILINGS: every profile has a distance and a clock ceiling measured
 *     from its first flat tick, after which the ordinary cadence resumes.
 *   · EVERY OTHER LESSON IS BYTE-IDENTICAL: a scenario with no row here gets a
 *     state with `declared:false`, every function below returns the neutral
 *     answer (the same state object, no line), and `flatRestDue` reduces to
 *     the transition that stood in `lesson-audit.mjs`.
 *   · ONE PROFILE CLOCK, PAUSED TIME EXCLUDED: the profile clock is the sum of
 *     the harness's own `now - lastTickAt` intervals — which the pause drain
 *     resets, and which leave out each tick's own work — each clamped at the
 *     per-frame cap, so a frozen world or a stalled tick is never credited.
 *   · THE HUD'S ROUNDING IS PART OF THE MEASUREMENT: a band edge is only
 *     called crossed when the reading is past it by the half quantum, and an
 *     opening gap only when it grew by more than the rounding can fake.
 *
 * ── ONE PROFILE WAS WITHDRAWN — DO NOT RE-ADD IT ───────────────────────────
 * sc-fo-motorway-gap:d18105c7 had a `lead-close` profile in round 1. The
 * round-1 verifier (`verify/motorway.mjs`) showed neither route is reachable
 * with pedals on that geometry and that the profile REAR-ENDED THE BRAKING
 * LEAD at y ≈ 852 on a leg that PASSED before it existed.
 * `WITHDRAWN_WRONG_LEG_PROFILES` carries the evidence, and a test refuses the
 * row if it comes back into the table.
 *
 * ── AND ONE ROW IS DECLINED, ON PURPOSE ────────────────────────────────────
 * sc-jx-priority-confidence:9c987e7b is NOT in the table: its antecedent is
 * the RIGHT leg's old roll cadence, every frame it was judged on is a `-right`
 * leg, and a `wrong` leg governed down to 15–19 км/ч with needless stops is
 * the careful leg under another name. It needs a RIGHT-leg variant.
 *
 * ── HISTORY ─────────────────────────────────────────────────────────────────
 *   · round 3: the finish-open verdict reads the UPPER tally; a disc change
 *     is followed and counted (N13); the curtain route is WITHDRAWN
 *     (`WITHDRAWN_PROFILE_ROUTES`); the zone's numbers are census BANDS and
 *     the zone profile runs on pc only (R-F9);
 *   · round 4: a disc increase is a fixture (V3-03); the upper tally credits
 *     each band entry's reading age (N-REGRADE-STALE);
 *   · round 6: no line predicts an engine outcome; verdict words
 *     `HELD_AS_SIZED` / `NOT_HELD_AS_SIZED` are statements about readings;
 *   · round 7: the design constants replace every product read and pin; the
 *     template table replaces the round-6 forbidden-word scan.
 */

/* ── THE DESIGN CONSTANTS (round 7) ──────────────────────────────────────── */

/** The commit every product-derived design constant below was sized at. */
export const PROFILE_SIZED_AT = "4112566";

/** The commit the harness stage H1 constants below were sized at (the four
 *  H1 profiles). Every record names its own commit; a line prints the commits
 *  of the constants its profile is sized from, never one it was not. */
export const PROFILE_SIZED_AT_H1 = "01de885";

/** Every commit a design constant below was sized at, in order. */
export const PROFILE_SIZED_COMMITS = Object.freeze([PROFILE_SIZED_AT, PROFILE_SIZED_AT_H1]);

/** One declared design constant: its value, its unit, the product source it
 *  was sized from and the commit — frozen. Pure. */
function sizedAt(value, unit, from, at = PROFILE_SIZED_AT) {
  return Object.freeze({ value, unit, from, at });
}

/**
 * THE HARNESS'S DESIGN CONSTANTS. Every number a profile is sized from, each
 * copied ONCE from the product source its comment names, at `PROFILE_SIZED_AT`.
 * Nothing reads them back from the product: they are the harness's own
 * numbers from here on, and a line prints them as «sized at 4112566».
 */
export const PROFILE_DESIGN = Object.freeze({
  // sized from engine.ts speedingBands, types.ts DEFAULT_RULE_CONFIG.speedingGraceRatio at 4112566
  speedingGraceRatio: sizedAt(0.1, "", "engine.ts speedingBands, types.ts DEFAULT_RULE_CONFIG.speedingGraceRatio"),
  // sized from engine.ts speedingBands, types.ts DEFAULT_RULE_CONFIG.speedingGraceMaxKmh at 4112566
  speedingGraceMaxKmh: sizedAt(5, "км/ч", "engine.ts speedingBands, types.ts DEFAULT_RULE_CONFIG.speedingGraceMaxKmh"),
  // sized from engine.ts speedingBands, types.ts DEFAULT_RULE_CONFIG.dangerousSpeedOverKmh at 4112566
  dangerousSpeedOverKmh: sizedAt(10, "км/ч", "engine.ts speedingBands, types.ts DEFAULT_RULE_CONFIG.dangerousSpeedOverKmh"),
  // sized from engine.ts stepSustainedEpisode(s.speedingMinor), types.ts DEFAULT_RULE_CONFIG.speedingMinorSustainSec at 4112566
  speedingMinorSustainSec: sizedAt(2, "s", "engine.ts stepSustainedEpisode(s.speedingMinor), types.ts DEFAULT_RULE_CONFIG.speedingMinorSustainSec"),
  // sized from engine.ts SPEED_REGRADE_SEC at 4112566
  SPEED_REGRADE_SEC: sizedAt(6, "s", "engine.ts SPEED_REGRADE_SEC"),
  // sized from StatusDashboard.tsx DASHBOARD_POLL_MS at 4112566
  DASHBOARD_POLL_MS: sizedAt(100, "ms", "StatusDashboard.tsx DASHBOARD_POLL_MS"),
  // sized from dashboardStatus.ts displaySpeedKmh at 4112566
  dialHalfQuantumKmh: sizedAt(0.5, "км/ч", "dashboardStatus.ts displaySpeedKmh"),
  // sized from sessionClock.ts PHYSICS_MAX_FRAME_DT at 4112566
  physicsMaxFrameMs: sizedAt(500, "ms", "sessionClock.ts PHYSICS_MAX_FRAME_DT"),
  // sized from types.ts DEFAULT_RULE_CONFIG.movingSpeedKmh at 4112566
  movingSpeedKmh: sizedAt(5, "км/ч", "types.ts DEFAULT_RULE_CONFIG.movingSpeedKmh"),
  // sized from engine.ts stepEpisode(s.keepRight), types.ts DEFAULT_RULE_CONFIG.keepRightSustainSec at 4112566
  keepRightSustainSec: sizedAt(12, "s", "engine.ts stepEpisode(s.keepRight), types.ts DEFAULT_RULE_CONFIG.keepRightSustainSec"),
  // sized from engine.ts safeGapM, types.ts DEFAULT_RULE_CONFIG.followSafeSeconds at 4112566
  followSafeSeconds: sizedAt(1.8, "s", "engine.ts safeGapM, types.ts DEFAULT_RULE_CONFIG.followSafeSeconds"),
  // sized from engine.ts tailgating, types.ts DEFAULT_RULE_CONFIG.followFireRatio at 4112566
  followFireRatio: sizedAt(0.7, "", "engine.ts tailgating, types.ts DEFAULT_RULE_CONFIG.followFireRatio"),
  // sized from engine.ts stepEpisode(s.following), types.ts DEFAULT_RULE_CONFIG.followSustainSec at 4112566
  followSustainSec: sizedAt(2, "s", "engine.ts stepEpisode(s.following), types.ts DEFAULT_RULE_CONFIG.followSustainSec"),
  // sized from engine.ts tailgating, types.ts DEFAULT_RULE_CONFIG.followMinSpeedKmh at 4112566
  followMinSpeedKmh: sizedAt(20, "км/ч", "engine.ts tailgating, types.ts DEFAULT_RULE_CONFIG.followMinSpeedKmh"),
  // sized from engine.ts tailgating, types.ts DEFAULT_RULE_CONFIG.followRecoveryRateMps at 4112566
  followRecoveryRateMps: sizedAt(0.5, "m/s", "engine.ts tailgating, types.ts DEFAULT_RULE_CONFIG.followRecoveryRateMps"),
  // sized from engine.ts rainSafeGapM, types.ts DEFAULT_RULE_CONFIG.followRainSecondsFactor at 4112566
  followRainSecondsFactor: sizedAt(1.6, "", "engine.ts rainSafeGapM, types.ts DEFAULT_RULE_CONFIG.followRainSecondsFactor"),
  // sized from engine.ts stepEpisode(s.followingRain), types.ts DEFAULT_RULE_CONFIG.followRainSustainSec at 4112566
  followRainSustainSec: sizedAt(3, "s", "engine.ts stepEpisode(s.followingRain), types.ts DEFAULT_RULE_CONFIG.followRainSustainSec"),
  // sized from followGap.ts stepFollowCue at 4112566
  chipMetreQuantumM: sizedAt(1, "m", "followGap.ts stepFollowCue"),
  // sized from followGap.ts stepFollowCue at 4112566
  chipSecondsHalfQuantum: sizedAt(0.05, "s", "followGap.ts stepFollowCue"),
  // sized from engine.ts banZoneRestSec, types.ts DEFAULT_RULE_CONFIG.banZoneStopRestSec at 4112566
  banZoneStopRestSec: sizedAt(4, "s", "engine.ts banZoneRestSec, types.ts DEFAULT_RULE_CONFIG.banZoneStopRestSec"),
  // sized from engine.ts banZoneRestSec, types.ts DEFAULT_RULE_CONFIG.busStopDropOffMaxSec at 4112566
  busStopDropOffMaxSec: sizedAt(20, "s", "engine.ts banZoneRestSec, types.ts DEFAULT_RULE_CONFIG.busStopDropOffMaxSec"),
  // sized from engine.ts BAN_ZONE_REST_REGRADE_SEC at 4112566
  BAN_ZONE_REST_REGRADE_SEC: sizedAt(6, "s", "engine.ts BAN_ZONE_REST_REGRADE_SEC"),
  // sized from engine.ts illegalBanRest, types.ts DEFAULT_RULE_CONFIG.fullStopMaxSpeedKmh at 4112566
  fullStopMaxSpeedKmh: sizedAt(1, "км/ч", "engine.ts illegalBanRest, types.ts DEFAULT_RULE_CONFIG.fullStopMaxSpeedKmh"),
  // sized from tuning.ts BRAKE_FORCE_N at 4112566
  BRAKE_FORCE_N: sizedAt(11000, "N", "tuning.ts BRAKE_FORCE_N"),
  // sized from tuning.ts CHASSIS_MASS at 4112566
  CHASSIS_MASS: sizedAt(1220, "kg", "tuning.ts CHASSIS_MASS"),
  // sized from templates-conditions2.ts SC_AC_TRUCK_SPRAY.instructionsBg(5) at 4112566
  drillTaughtGapSec: sizedAt(3, "s", "templates-conditions2.ts SC_AC_TRUCK_SPRAY.instructionsBg(5)"),
  // ── harness stage H1 (the four profiles below the first four), each sized at PROFILE_SIZED_AT_H1 ──
  // sized from engine.ts WARNING_LAMP_REGRADE_SEC at 01de885
  WARNING_LAMP_REGRADE_SEC: sizedAt(6, "s", "engine.ts WARNING_LAMP_REGRADE_SEC", PROFILE_SIZED_AT_H1),
  // sized from engine.ts WARNING_LAMP_COMPLY_DROP_KMH at 01de885
  WARNING_LAMP_COMPLY_DROP_KMH: sizedAt(5, "км/ч", "engine.ts WARNING_LAMP_COMPLY_DROP_KMH", PROFILE_SIZED_AT_H1),
  // sized from engine.ts WARNING_LAMP_COMPLY_DROP_KMH at 01de885
  warningLampBillSec: sizedAt(23.7, "s", "engine.ts WARNING_LAMP_COMPLY_DROP_KMH", PROFILE_SIZED_AT_H1),
  // sized from engine.ts WARNING_LAMP_COMPLY_DROP_KMH at 01de885
  warningLampHeldPaceKmh: sizedAt(45, "км/ч", "engine.ts WARNING_LAMP_COMPLY_DROP_KMH", PROFILE_SIZED_AT_H1),
  // (H1 round 3, N5a: where the lamp run STARTS — past the launch. warningLampBillSec was measured on a drive held at
  // warningLampHeldPaceKmh; a reading WARNING_LAMP_COMPLY_DROP_KMH or more under that pace is, by the product's own
  // comply test, a car that is not holding it, so the run starts on the first reading at or over 45 − 5 = 40 by the
  // dial's rounding and never on a launch reading over movingSpeedKmh.)
  // sized from engine.ts WARNING_LAMP_COMPLY_DROP_KMH at 01de885
  warningLampRunStartKmh: sizedAt(40, "км/ч", "engine.ts WARNING_LAMP_COMPLY_DROP_KMH", PROFILE_SIZED_AT_H1),
  // sized from templates-vru.ts EM_APPROACH.yieldSlowKmh at 01de885
  emYieldSlowKmh: sizedAt(38, "км/ч", "templates-vru.ts EM_APPROACH.yieldSlowKmh", PROFILE_SIZED_AT_H1),
  // sized from runners.ts EM_SPEED_MARGIN_KMH at 01de885
  EM_SPEED_MARGIN_KMH: sizedAt(2, "км/ч", "runners.ts EM_SPEED_MARGIN_KMH", PROFILE_SIZED_AT_H1),
  // sized from runners.ts EM_CLOSING_MIN_KMH at 01de885
  EM_CLOSING_MIN_KMH: sizedAt(3, "км/ч", "runners.ts EM_CLOSING_MIN_KMH", PROFILE_SIZED_AT_H1),
  // sized from ln-v1.json maxspeed at 01de885
  emRunTopKmh: sizedAt(50, "км/ч", "ln-v1.json maxspeed", PROFILE_SIZED_AT_H1),
  // sized from templates-vru.ts EM_APPROACH.actor.accelMps2 at 01de885
  emActorAccelMps2: sizedAt(1.5, "m/s²", "templates-vru.ts EM_APPROACH.actor.accelMps2", PROFILE_SIZED_AT_H1),
  // sized from templates-vru.ts EM_APPROACH.responseWindowSec at 01de885
  emResponseWindowSec: sizedAt(7, "s", "templates-vru.ts EM_APPROACH.responseWindowSec", PROFILE_SIZED_AT_H1),
  // sized from runners.ts EmergencyApproachRunner.stage at 01de885
  emResponseJitterSec: sizedAt(0.4, "s", "runners.ts EmergencyApproachRunner.stage", PROFILE_SIZED_AT_H1),
  // sized from types.ts DEFAULT_RULE_CONFIG.harshBrakeMinSpeedKmh at 01de885
  harshBrakeMinSpeedKmh: sizedAt(35, "км/ч", "types.ts DEFAULT_RULE_CONFIG.harshBrakeMinSpeedKmh", PROFILE_SIZED_AT_H1),
  // sized from types.ts DEFAULT_RULE_CONFIG.harshBrakeDecelMps2 at 01de885
  harshBrakeDecelMps2: sizedAt(7, "m/s²", "types.ts DEFAULT_RULE_CONFIG.harshBrakeDecelMps2", PROFILE_SIZED_AT_H1),
  // sized from types.ts DEFAULT_RULE_CONFIG.harshBrakeSustainSec at 01de885
  harshBrakeSustainSec: sizedAt(0.4, "s", "types.ts DEFAULT_RULE_CONFIG.harshBrakeSustainSec", PROFILE_SIZED_AT_H1),
  // sized from rearProximity.ts REAR_CUE_WARN_M at 01de885
  REAR_CUE_WARN_M: sizedAt(8, "m", "rearProximity.ts REAR_CUE_WARN_M", PROFILE_SIZED_AT_H1),
  // sized from rearProximity.ts stepRearCue at 01de885
  rearBadgeHalfQuantumM: sizedAt(0.5, "m", "rearProximity.ts stepRearCue", PROFILE_SIZED_AT_H1),
  // sized from templates-following.ts SC_FOLLOW_TAILGATER.success, ln-v1.json spawnPoints at 01de885
  ftgCalmZoneNearRouteM: sizedAt(175, "m", "templates-following.ts SC_FOLLOW_TAILGATER.success, ln-v1.json spawnPoints", PROFILE_SIZED_AT_H1),
  // sized from templates-hazards2.ts DEBRIS_Y, hz-debris-v1.json spawnPoints at 01de885
  debrisRouteM: sizedAt(175, "m", "templates-hazards2.ts DEBRIS_Y, hz-debris-v1.json spawnPoints", PROFILE_SIZED_AT_H1),
  // sized from tuning.ts ENGINE_FORCE_CURVE, tuning.ts ROLLING_RESISTANCE_N, tuning.ts AERO_DRAG, tuning.ts CHASSIS_LINEAR_DAMPING, tuning.ts CHASSIS_MASS at 01de885
  paceDutyBase: sizedAt(0.15, "", "tuning.ts ENGINE_FORCE_CURVE, tuning.ts ROLLING_RESISTANCE_N, tuning.ts AERO_DRAG, tuning.ts CHASSIS_LINEAR_DAMPING, tuning.ts CHASSIS_MASS", PROFILE_SIZED_AT_H1),
});

/** The dial is `Math.round(|speed|)`, so a reading N covers [N − 0.5, N + 0.5):
 *  a band edge is called crossed only when the reading is past it by this. */
export const DIAL_HALF_QUANTUM_KMH = PROFILE_DESIGN.dialHalfQuantumKmh.value;
/** The most sim time ONE frame can add, in ms, however long it blocked. */
export const PHYSICS_MAX_FRAME_MS = PROFILE_DESIGN.physicsMaxFrameMs.value;
/** The chip's metres are whole metres: the DIFFERENCE of two readings can be
 *  off by one whole metre with the true gap standing still. */
export const FOLLOW_CHIP_METRE_QUANTUM_M = PROFILE_DESIGN.chipMetreQuantumM.value;
/** The chip's seconds are tenths: ±0.05 s. */
export const FOLLOW_CHIP_SECONDS_HALF_QUANTUM = PROFILE_DESIGN.chipSecondsHalfQuantum.value;

/** The harness's own sampling margin on a SECONDS window — the same +1 s
 *  `OVER_LIMIT_SUSTAIN_SEC` adds, for the same reason (~2 Hz ticks, a measured
 *  worst tick of 1,155 ms). The harness's number. */
export const PROFILE_SUSTAIN_MARGIN_SEC = 1;

/** The most ONE interval may add to any profile clock, in ms — §2's
 *  `OVER_LIMIT_STEP_CAP_SEC` (its provenance is there). A second defence behind
 *  the pause drain's `lastTickAt` reset. */
export const PROFILE_STEP_CAP_MS = OVER_LIMIT_STEP_CAP_SEC * 1000;

/* ── HOW OLD A DIAL READING CAN BE (round 4, N-REGRADE-STALE) ───────────────
 * The dial a `wrong` leg reads is the dashboard's DOM, committed on the poll
 * interval, and `lesson-audit.mjs` takes `now` AFTER `await probe`. The age of
 * a reading is bounded term by term: `now − probeAt` (MEASURED per tick), the
 * poll (`DASHBOARD_POLL_MS`, a design constant), two frames
 * (`DIAL_FRAME_ALLOWANCE_MS`) and a census-sized long-frame allowance per
 * platform — the one term no measurement on the leg covers, so SIZED, not a
 * bound. No allowance above one clamped frame buys anything. */

/** Two frames at a 20 fps floor. The harness's allowance. */
export const DIAL_FRAME_ALLOWANCE_MS = 100;

/** THE TICK-COST CENSUS the long-frame allowance is sized on (round 10: named,
 *  as every census a line cites is): `r4/tickcost-census.mjs` over the TICK
 *  COST line of every archived sc-signal-flashing wrong leg, re-run in round 10
 *  (`pedal/r10/tickcost-census-r10.txt`, the same legs): pc 5 legs, the
 *  longest probe wait on each 34–99 ms; mobile 30 legs, the longest probe wait
 *  on each 190–923 ms. An evidence record, frozen. */
export const TICKCOST_CENSUS = Object.freeze({
  lesson: "sc-signal-flashing",
  pc: Object.freeze({ legs: 5, longestMinMs: 34, longestMaxMs: 99 }),
  mobile: Object.freeze({ legs: 30, longestMinMs: 190, longestMaxMs: 923 }),
});

/** The unmeasured long frame, by platform, off `TICKCOST_CENSUS`: pc's 5
 *  archived legs never kept a probe waiting past 99 ms → 100; mobile's 30 did
 *  on every one (190–923 ms), and the only allowance that census justifies is
 *  the clamp itself, which collapses the sizing — so mobile gets 0, stated
 *  rather than hidden. A platform the census does not name gets the larger. */
export const DIAL_LONG_FRAME_ALLOWANCE_MS = Object.freeze({ pc: 100, mobile: 0 });

/** The part of a reading's age no probe on this leg measures — poll + two
 *  frames + the platform's long-frame allowance, in ms. `null` without a
 *  poll. Pure. */
export function dialLagAllowanceMs(platform, pollMs) {
  if (typeof pollMs !== "number" || !Number.isFinite(pollMs) || pollMs <= 0) return null;
  const lf = Object.hasOwn(DIAL_LONG_FRAME_ALLOWANCE_MS, platform ?? "")
    ? DIAL_LONG_FRAME_ALLOWANCE_MS[platform]
    : Math.max(...Object.values(DIAL_LONG_FRAME_ALLOWANCE_MS));
  return pollMs + DIAL_FRAME_ALLOWANCE_MS + Math.min(lf, PHYSICS_MAX_FRAME_MS);
}

/** How far back the opening-gap test looks: the rate is measured against the
 *  newest reading at least this old, so the one-metre rounding quantum is
 *  spread over ≥ 2 s (round-1 verifier, F7). */
export const OPENING_WINDOW_MS = 2000;

/** The keep-right run's margin over `keepRightSustainSec` — larger than the
 *  one above because the profile clock leaves out each tick's own work (the
 *  safe direction) and a pause can land mid-run. The harness's number. */
export const STINT_MARGIN_SEC = 4;

/** The zone hold's margin over drop-off + re-grade window: a sim clock up to
 *  ~23 % behind the wall on a loaded box, plus one tick either side of the
 *  pause that lands on the first threshold. The harness's number. */
export const ZONE_REST_MARGIN_SEC = 8;

/* ── THE ZONE REST'S DEAD RECKONING, SIZED FROM THE CENSUS (round 3, R-F9) ──
 * Every number below is a CENSUS BAND and none is called a bound on a new leg:
 * the printed rest interval is the band the census puts the rest in. */

/** THE REACTION CENSUS — the population the reaction band below is sized on
 *  (round 10: every sentence that cites a census names its population, from
 *  the round-9 verifier's FALSE-SELF-STATEMENT-REFUSAL-SIZING). The round-2
 *  verifier's `verify2/reaction.mjs` over every archived wrong leg (pc and
 *  mobile) in the named waves: each flat → flat-rest transition whose decision
 *  tick read over 20 км/ч and that reached rest, the travel from the decision
 *  tick's pose to the rest pose less the braking part, over the decision
 *  speed. 322 transitions; its 5th percentile (index 16 of the sorted 322) is
 *  0.48 s and its maximum 1.90 s (`verify2/reaction-census.txt`). An evidence
 *  record, frozen; a line prints its numbers, nothing else. */
export const REACTION_CENSUS = Object.freeze({
  transitions: 322,
  p5: 0.48,
  max: 1.9,
  waves: "w47 w52 w61 w62 w62-signal",
  method: "travel from the decision tick's pose to the rest pose, less v²/(2 × 11000/1220), over v — every flat to flat-rest transition of an archived wrong leg whose decision tick read over 20 км/ч and that reached rest",
});

/** Seconds from the DECISION tick to rest beyond the braking distance, as a
 *  band: `REACTION_CENSUS`, p5 0.48 → max 1.90 s. 16 of the 322 reacted
 *  faster; the room for them is `ZONE_REST_RESIDUAL_M`. */
export const ZONE_REST_REACT_MIN_S = 0.48;
export const ZONE_REST_REACT_MAX_S = 1.9;

/** THE ODOMETER CENSUS THE ZONE'S BAND IS SIZED ON (round 10): twelve of this
 *  lesson's archived pc wrong legs — every one of the 42 folders on disk that
 *  recorded pose samples (`pedal/r10/busstop-legs-r10.txt`; the other 30 carry
 *  none) — the flat odometer over the pose path —
 *  `r3/odo-census.mjs` (the same method as `ODO_CENSUS_ALL_WRONG_LEGS` below),
 *  re-run in round 10 (`pedal/r10/odo-census-r10.txt`): 0.935 (w41) to 1.028
 *  (canary-54c02a8-152435). An evidence record, frozen. */
export const ODO_CENSUS_ZONE_PC = Object.freeze({
  lesson: "sc-pk-busstop-ban",
  platform: "pc",
  legs: 12,
  min: 0.935,
  max: 1.028,
  waves: "w41 w42 w43 w45 w46 w47 w51 w52 w61 w62 canary-54c02a8-152043 canary-54c02a8-152435",
});

/** …AND WHERE THE BAND'S LOW END COMES FROM (round 10): not this lesson, and
 *  not a pc leg. Round 2's `ODO_RATIO_MIN` took the lowest of seven archived
 *  legs (the round-1 verifier's `verify/odo-ratio.mjs`: «w62 signal 0.911»),
 *  and the round-10 re-run of the census names that reading: the
 *  sc-signal-flashing MOBILE wrong leg, 0.911 in both w61 and w62-signal. The
 *  low end was kept, WIDENED below this lesson's own 0.935, and a line says so.
 *  An evidence record, frozen. */
export const ODO_RATIO_LOW_END = Object.freeze({
  ratio: 0.911,
  leg: "sc-signal-flashing__mobile-wrong",
  waves: "w61 w62-signal",
  from: "round 2's ODO_RATIO_MIN, the lowest of the round-1 verifier's seven legs (verify/odo-ratio.mjs, «w62 signal 0.911»)",
});

/** THE FLAT ODOMETER AGAINST THE TRUE PATH, as a census band: a census of
 *  twelve of this lesson's archived pc wrong legs read 0.935–1.028 (`ODO_CENSUS_ZONE_PC`); the
 *  low end is WIDENED to round 2's 0.911, which is a sc-signal-flashing MOBILE
 *  leg's reading (`ODO_RATIO_LOW_END`) — every line that prints the band says
 *  both. Mobile flat odometers read far lower (`ODO_CENSUS_ALL_WRONG_LEGS`),
 *  so the zone profile runs on `ZONE_REST_PLATFORMS` only. */
export const ODO_RATIO_MIN = 0.911;
export const ODO_RATIO_MAX = 1.028;
/** The platforms the zone census covers — the only ones the zone profile runs on. */
export const ZONE_REST_PLATFORMS = Object.freeze(["pc"]);

/** THE HARNESS'S ODOMETER CENSUS OVER EVERY ARCHIVED WRONG LEG — the population the mobile refusal's number is
 *  over (round 9, from the round-8 verifier's CENSUS-0729: the refusal used to print 0.729, which is only
 *  sc-signal-flashing's own minimum). Round 3's `r3/odo-census.mjs`, re-run unchanged in round 9
 *  (`r9/odo-census-rerun.txt`, the same 328 legs): per leg, the flat odometer — the dial integrated over the
 *  harness's own tick intervals — over the pose path, on consecutive flat → flat samples, legs with ≥ 50 m of path.
 *  An evidence record, frozen; a line prints its numbers and its date, nothing else. */
export const ODO_CENSUS_ALL_WRONG_LEGS = Object.freeze({
  legs: 328,
  mobileLegs: 158,
  mobileMinRatio: 0.524,
  mobileMinLeg: "sc-park-gap-long__mobile-wrong in w41",
  measured: "2026-09-25",
  waves: "w41 w42 w43 w45 w46 w47 w51 w52 w61 w62 w62-signal canary-54c02a8-152043 canary-54c02a8-152435",
  method: "flat odometer (dial / 3.6 × the harness's own dtMs) over the pose path (hypot of wx, wz) on consecutive flat samples, legs with at least 50 m of pose path",
});

/** THE CREEP CENSUS (round 10: named, as every census a line cites is): the
 *  same twelve pc legs, the first guidance sample's pose against the authored
 *  spawn — `r3/creep-census.mjs`, re-run in round 10
 *  (`pedal/r10/creep-census-r10.txt`): 0.84–2.01 m. An evidence record. */
export const ZONE_CREEP_CENSUS = Object.freeze({ legs: 12, min: 0.84, max: 2.01 });

/** The creep before the flat odometer starts (`ZONE_CREEP_CENSUS`, 0.84–2.01
 *  m, rounded up). Added to the far end of the interval only. */
export const ZONE_REST_CREEP_M = 2.1;

/** Room kept between the rest interval and each zone edge for what the census
 *  bands leave out. The harness's margin, stated as such. */
export const ZONE_REST_RESIDUAL_M = 5;

/* ── HARNESS STAGE H1 — THE PACE GOVERNOR, THE REAR BADGE, THE IMPACT COUNT ──
 *
 * Two of the H1 profiles hold a PACE: a wrong leg's plain flat throttle tops
 * 58–59 км/ч on a posted 50 (the round-1 verifier's longsim), which is not the
 * antecedent either row needs (a steady pace at or under the disc; a pace over
 * a floor and under the disc). The throttle is the only pedal a governor
 * touches — it never presses the brake — and the keyboard throttle is ON or
 * OFF, so a pace is held by PULSES: on a tick whose dial reads under the
 * target, the throttle goes down for a fraction of the tick's own interval and
 * comes up again inside the same tick.
 *
 * WHY PULSES, AND NOT ROUND 1'S BANG-BANG: held down for a whole ~0.5 s tick
 * at 45 км/ч the car gains ~5.6 км/ч (3.14 m/s², `paceDutyBase`'s own
 * arithmetic below), which is more than WARNING_LAMP_COMPLY_DROP_KMH on its
 * own — a bang-bang ripple would read as a driver shedding speed on every
 * cycle. The DUTY BASE is the fraction of time the throttle must be down to
 * hold 45 км/ч in the model (`paceDutyBase`, sized from tuning.ts at
 * 01de885): throttle 4200 N less R = AERO_DRAG·v² + LINEAR_DAMPING·MASS·v =
 * 370.6 N → +3.139 m/s²; coast R + ROLLING_RESISTANCE_N 280 N → −0.533 m/s²;
 * 0.533 / (3.139 + 0.533) = 0.145 → 0.15. The model holds no engine braking;
 * the gain below closes what it leaves out. None of this is a prediction: the
 * READINGS say what the pace was, and a profile holds as sized only on them. */

/** Under `target − this` the throttle is down for the whole tick (the launch). The harness's number. */
export const PACE_FULL_BAND_KMH = 6;
/** Duty added per км/ч the dial reads under the target. The harness's number. */
export const PACE_DUTY_GAIN_PER_KMH = 0.05;
/** The shortest and longest throttle pulse, in ms of wall clock. The harness's numbers. */
export const PACE_MIN_PULSE_MS = 40;
export const PACE_MAX_PULSE_MS = 600;
/** The emergency profile's target, over its run floor (emYieldSlowKmh + EM_SPEED_MARGIN_KMH): half the
 *  10 км/ч between that floor (40) and the posted 50 on ln-v1. The harness's number. */
export const EM_PACE_ABOVE_FLOOR_KMH = 5;

/* ── H1 ROUND 2 — THE EMERGENCY RUN'S SIZING, RE-DERIVED (the round-1 verifier's N5) ──
 * runners.ts EmergencyApproachRunner at 01de885 arms the duty on the first
 * frame the ambulance is behind by 2–armBehindM 60 m AND its speed is over the
 * car's by EM_CLOSING_MIN_KMH; the ambulance ramps from rest at
 * emActorAccelMps2 from its release, which falls before the run's first
 * reading (release needs the car at most releaseGapM 14 + 4 m ahead of the
 * ambulance's hold, 15 m behind the spawn — 3 m of travel — and the run's
 * first reading is over 40 км/ч). Round 1 sized the arm on the governor's
 * TARGET (45 → 8.9 s); a run may read up to its top (`emRunTopKmh`, the posted
 * 50 on ln-v1), so the arm is sized on that top plus the dial's rounding:
 * (50 + 0.5 + 3) / 3.6 / 1.5 = 9.91 s. The 60 m gate does not bind a paced car
 * (the gap peaks near 43 m for a car held at 50 from a 5 s launch). What the
 * readings cannot see is the product's own clock falling behind the profile
 * clock on a loaded box — the ~23 % figure `ZONE_REST_MARGIN_SEC`'s comment names, taken as a ratio of the
 * 17.3 s of arm + window + spread: the harness's lag allowance below (a declared judgement; its direction is stated
 * under the lamp run's allowance). */
/** The emergency run's allowance for a product clock behind the profile clock, in seconds. The harness's number. */
export const EM_RUN_LAG_MARGIN_SEC = 4;
/* ── H1 ROUND 3 — THE LAMP RUN'S LAG ALLOWANCE (the round-1 verifier's N5a, owed by round 2) ──
 * The same allowance, on the same ratio: 0.23 — the «~23 % behind» figure `ZONE_REST_MARGIN_SEC`'s comment (the
 * constant is sized at 4112566) names — of the product seconds the run must cover.
 * The emergency run: ceil(0.23 × (9.91 + 7 + 0.4)) = ceil(3.98) = 4 s (above).
 * The lamp run: ceil(0.23 × (warningLampBillSec 23.7 + WARNING_LAMP_REGRADE_SEC 6))
 * = ceil(6.83) = 7 s.
 * H1 ROUND 5 (the round-3/4 verifiers' LAMP-VERDICT-AND-LAG-RATIO) — A DECLARED JUDGEMENT, NOT A MEASUREMENT. No
 * measurement file backs 0.23: `ZONE_REST_MARGIN_SEC`'s own «~23 %» names none either (it entered at 0e810ad with no
 * archive), and a repo-wide search finds the figure only in these comments. Its DIRECTION, stated: the allowance is
 * ratio × the product seconds S the run must cover, so a profile run of S + allowance covers a product clock running at
 * S / (S + allowance) of the profile clock — 29.7 / 36.7 = 81 % (lamp), 17.31 / 21.31 = 81 % (emergency), i.e. up to ~19 %
 * behind, NOT a product clock 23 % behind (that reading needs ratio / (1 − ratio) × S: 9 s and 6 s). No printed line
 * states the ratio or either coverage — they print only «the harness's N s lag allowance» — and a profile holds as
 * sized only on its own readings; a measured product-vs-profile clock ratio on the P1 lanes is still owed. */
/** The fraction of the product seconds a run must cover that it adds as its lag allowance — a declared judgement (above), not a measurement. The harness's number. */
export const PRODUCT_CLOCK_LAG_RATIO = 0.23;
/** The lamp run's allowance for a product clock behind the profile clock, in seconds. The harness's number. */
export const LAMP_RUN_LAG_MARGIN_SEC = 7;

/* ── H1 ROUND 2 — THE BRAKE-CHECK'S METRE CEILING, SIZED ON A CENSUS THAT COVERS IT (the round-1 verifier's F4) ──
 * Round 1 sized the ceiling on another lesson's pc census (sc-pk-busstop-ban,
 * 0.935) and ran it on mobile too. The harness's own odometer census
 * (`ODO_CENSUS_ALL_WRONG_LEGS`, r9/odo-census-rerun.txt) holds this lesson's
 * own 18 archived wrong legs, and they read FAR under `ODO_RATIO_MIN`: its w43
 * pc leg 0.577, the lowest pc leg in the whole census. The ceiling is therefore
 * sized on the census's lowest reading of ANY leg, pc or mobile (0.524), so one
 * ceiling serves both platforms, and the booking is refused on a tick that
 * reaches a ceiling (a booking never lands past it). */
/** This lesson's own legs in the harness's odometer census (the same file and method as
 *  `ODO_CENSUS_ALL_WRONG_LEGS`), and the census's lowest pc reading. An evidence record, frozen. */
export const ODO_CENSUS_BRAKE_CHECK = Object.freeze({
  lesson: "sc-follow-tailgater",
  pc: Object.freeze({ legs: 9, min: 0.577, max: 1.009, minWave: "w43" }),
  mobile: Object.freeze({ legs: 9, min: 0.826, max: 1.004, minWave: "w52" }),
  allPcLegs: 170,
  allPcMin: 0.577,
});
/** The ratio the brake-check's metre ceiling is sized on: the lowest reading of the whole census, any platform. */
export const BRAKE_CHECK_ODO_RATIO = Math.min(
  ODO_RATIO_MIN,
  ODO_CENSUS_ALL_WRONG_LEGS.mobileMinRatio,
  ODO_CENSUS_BRAKE_CHECK.allPcMin,
  ODO_CENSUS_BRAKE_CHECK.pc.min,
  ODO_CENSUS_BRAKE_CHECK.mobile.min,
);
/** Room kept past the stop for what the census bands leave out (the creep before the flat odometer starts among it). The harness's number. */
export const BRAKE_CHECK_RESIDUAL_M = 5;

/* ── H1 ROUND 2 · P1 — THE LESSONS WHOSE LANES TAKE EVENT SHOTS (the round-1 verifier's C3) ──
 * Round 1 armed the page-side witness and its shots on EVERY lane. They are
 * armed on these lessons' lanes only (both legs: plan57 probeLane P1 and the
 * L-CARD re-drives); every other lane installs no witness, registers no
 * binding, takes no event shot, waits for none at its end and prints no
 * event-shot line, and its probe reads neither the rear badge nor the witness. */
export const EVENT_SHOT_LESSONS = Object.freeze(["sc-sp-curve", "sc-hz-brake-dont-swerve", "sc-vu-emergency", "sc-roundabout-entry"]);
/** What a lane of `scenario` reads beyond the pre-H1 probe — pure: the event witness and its shots
 *  (`EVENT_SHOT_LESSONS`), and the rear badge (a lesson whose declared profile is a brake-check). */
export function h1ProbeReads(scenario) {
  const decl = typeof scenario === "string" ? wrongLegProfileFor(scenario) : null;
  return Object.freeze({
    eventShots: typeof scenario === "string" && EVENT_SHOT_LESSONS.includes(scenario),
    rear: decl !== null && decl.kind === "brake-check",
  });
}

/** THE PACE PEDAL FOR ONE TICK — pure. `down`: the throttle held the whole tick;
 *  `up`: held up the whole tick; `pulse`: down for `ms`, then up, inside the tick.
 *  An unread dial lets the throttle up (no reading, no acceleration). */
export function pacePedal(dial, { targetKmh, dtMs } = {}) {
  if (typeof dial !== "number" || !Number.isFinite(dial) || dial < 0) return Object.freeze({ act: "up", ms: null });
  if (typeof targetKmh !== "number" || !Number.isFinite(targetKmh)) return Object.freeze({ act: "up", ms: null });
  if (dial >= targetKmh) return Object.freeze({ act: "up", ms: null });
  if (dial < targetKmh - PACE_FULL_BAND_KMH) return Object.freeze({ act: "down", ms: null });
  const dt = typeof dtMs === "number" && Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const duty = PROFILE_DESIGN.paceDutyBase.value + PACE_DUTY_GAIN_PER_KMH * (targetKmh - dial);
  const ms = Math.round(Math.min(PACE_MAX_PULSE_MS, Math.max(PACE_MIN_PULSE_MS, duty * dt)));
  return Object.freeze({ act: "pulse", ms });
}

/** THE REAR PROXIMITY BADGE's label, as the product prints it (rearProximity.ts
 *  `rearCueLabelBg` at 01de885): «Кола отзад · N м» / «Велосипедист отзад · N м».
 *  The reverse-travel twin in the same box («Заден ход · N м») is metres DRIVEN,
 *  not a body behind, and is deliberately not matched. */
export const REAR_PROX_LABEL_RE = /^(Кола|Велосипедист) отзад · (\d+) м$/u;

/**
 * THE REAR GAP, OBSERVED — the harness's read of the PROX badge off the page
 * (`[data-hud="rear-proximity"] [role="status"]`'s aria-label), parsed. Pure.
 *   · `raw` not an object, or `ok !== true` → `{ ok:false }`: the read did not
 *     come back, and nothing may be decided from it;
 *   · `label === null` → `{ ok:true, present:false }`: no badge on the glass
 *     (nothing within the badge's range behind);
 *   · a label → `{ ok:true, present:true, parsed, meters, kind }`, `parsed`
 *     false for any label `REAR_PROX_LABEL_RE` does not match.
 */
export function parseRearProximity(raw) {
  if (!raw || typeof raw !== "object" || raw.ok !== true) return Object.freeze({ ok: false, present: null, parsed: false, meters: null, kind: null });
  if (raw.label === null || raw.label === undefined) return Object.freeze({ ok: true, present: false, parsed: false, meters: null, kind: null });
  const m = typeof raw.label === "string" ? raw.label.trim().match(REAR_PROX_LABEL_RE) : null;
  if (!m) return Object.freeze({ ok: true, present: true, parsed: false, meters: null, kind: null });
  return Object.freeze({ ok: true, present: true, parsed: true, meters: Number(m[2]), kind: m[1] === "Кола" ? "vehicle" : "cyclist" });
}

/* ── THE LINES — ONE TEMPLATE TABLE, ONE RENDERER (round 7) ─────────────────
 *
 * EVERY sentence a profile can put in `run.log` is one of these templates. A
 * slot is `{name:kind}` or `{name:kind|FALLBACK}` — the fallback is printed
 * when the value is null — and its kind is one of:
 *   n · n1 · n2 · n3 · r   a finite number: as is, to 1 / 2 / 3 decimals,
 *                           rounded to a whole number;
 *   tok                     an identifier-shaped token (no whitespace);
 *   toks                    a non-empty list of tokens, joined « + »;
 *   txt                     one of the declared table's own `name` / `told`
 *                           / `row` texts, and nothing else;
 *   frag · opt · frags      another template (`opt`: or nothing; `frags`: a
 *                           non-empty list, joined «; »).
 * `renderProfileText` refuses anything else, so a line can carry no text that
 * is not in this table or in the profile table. The test file enumerates
 * every template and checks its words against a closed observation
 * vocabulary. */
export const PROFILE_LINE_TEMPLATES = Object.freeze({
  // ── the verdict words, and the sizing label ──
  "verdict.held": "ANTECEDENT HELD AS SIZED",
  "verdict.notHeld": "ANTECEDENT NOT HELD AS SIZED",
  "sizing.label": "SIZING (the harness's design constants, sized at {at:tok}; no file is read to size them, and nothing here is a prediction)",
  "sizing.labelZone": "SIZING (the harness's design constants, sized at {at:tok}, and the zone's span and basis, read at drive time from authored content: the world file {world:tok} and the lesson's trace file {trace:tok}; no other file is read to size them, and nothing here is a prediction)",
  // ── the start line ──
  "start.on": "WRONG-LEG PROFILE: {name:txt} — {told:txt}. For {row:txt}. Ceilings {maxM:n} m / {maxS:n} s from its first flat tick, after which the ordinary{every:opt} cadence resumes.{zone:opt} {sizing:frag}.",
  "start.refused": "WRONG-LEG PROFILE: {name:txt} — REFUSED, NOT RUN: {why:frag}. This leg drives the ordinary{every:opt} cadence and holds nothing back for {row:txt}.",
  "start.every": " {m:n} m",
  "start.zone": " Zone {zones:toks} ({basis:tok}) lies at [{from:n1}, {to:n1}] m of route (authored geometry); the hold is {hold:n} s.",
  // ── the two refusals left: nothing is read, so nothing else can refuse ──
  "refused.span": "the authored zone was not placed on the route — {why:frag|the span is unknown}",
  "refused.platform": "the dead reckoning's {odo:frag}; this leg is «{platform:tok|unknown}», and in the harness's odometer census of {legs:n} archived wrong legs ({mobile:n} of them mobile, measured {at:tok}) a mobile flat odometer read as low as {min:n} of the true path, far outside {rmin:n}–{rmax:n}",
  // ── the census bands, each with the population it is sized on (round 10) ──
  "census.odo": "census odometer ratio {rmin:n}–{rmax:n}, sized on a census of {legs:n} of this lesson's archived pc wrong legs ({lo:n}–{hi:n}) with its low end widened to {rmin:n}, the reading of a sc-signal-flashing mobile wrong leg",
  "census.creep": "creep up to {creep:n} m, over the same {legs:n} legs' {lo:n}–{hi:n} m",
  "census.react": "census reaction {min:n}–{max:n} s, from percentile 5 to the maximum of a census of {n:n} flat to flat-rest transitions on archived wrong legs",
  "census.lfPc": "sized on a census of {legs:n} of this lesson's archived pc wrong legs, whose longest probe waits read at most {max:n} ms",
  "census.lfMobile": "none for mobile, stated: in a census of {legs:n} of this lesson's archived mobile wrong legs, each kept a probe waiting {lo:n}–{hi:n} ms at its longest",
  "census.lfOther": "the larger of the pc and mobile allowances, for a platform this lesson's tick-cost census does not name",
  "span.noWorld": "the world file was not readable",
  "span.shortTrace": "the authored trace has fewer than two samples",
  "span.noZone": "zone «{id:tok}» is not in the world file",
  "span.noIds": "no zone ids were declared",
  "span.edges": "the declared zones are on different edges",
  "span.bases": "the declared zones carry different bases, and no one hold applies",
  "span.basis": "the declared zones carry no basis that is an identifier, and no hold was sized from one",
  "span.bounds": "the placed span has no finite bounds",
  "span.kind": "a declared zone is not a noStopping span",
  "span.gap": "the declared zones are not contiguous ({a:n} m → {b:n} m)",
  "span.noGeom": "edge «{id:tok}» has no geometry",
  "span.offEdge": "the authored start is {off:n1|?} m off edge «{id:tok}» — it is not on this road",
  "span.still": "the authored trace never moves 5 m from its start",
  "span.behind": "the span starts {m:n1} m from the authored start — it is not ahead of it",
  "span.noHeading": "the authored trace carries no heading, and its straightness was not checked",
  "span.turns": "the authored route turns {deg:n1}° before the far edge of the span, and a wrong leg turns no wheel on its flat phase",
  "span.unreadable": "the authored geometry was not readable ({code:tok|unknown})",
  // ── mid-drive lines ──
  "say.held": "      WRONG-LEG PROFILE {name:txt}: ANTECEDENT HELD AS SIZED ({how:tok}) at t={at:n}s — OBSERVED: {obs:frag}",
  "say.notHeld": "WRONG-LEG PROFILE {name:txt}: ANTECEDENT NOT HELD AS SIZED — OBSERVED: {obs:frag}; the ordinary cadence resumes.",
  "say.notHeldEnd": "WRONG-LEG PROFILE {name:txt}: ANTECEDENT NOT HELD AS SIZED — OBSERVED: {obs:frag}.",
  "say.braking": "      WRONG-LEG PROFILE {name:txt}: braking BOOKED at t={at:n}s — the throttle stays down to the end of this tick; each flat-rest tick after it lets the throttle up, and the first one whose dial does not read 0–{fs:n} км/ч puts the brake down. HARNESS ESTIMATE (dead reckoning over the census bands named here, each with the population it is sized on; not a measured position): flat odometer {odo:n} m → true path {tlo:n}–{thi:n} m ({odoBand:frag}; {creepBand:frag}) + a stop of {near:n}–{far:n} m at {kmh:n} км/ч ({reactBand:frag}; {model:frag}) → rest estimated at [{lo:n}, {hi:n}] m of route against the authored span [{from:n1}, {to:n1}] m ({place:frag}). No profile decision reads the pose: the harness reads the dev pose probe on every flat and flat-rest tick and records what it returns among its guidance samples, and this estimate does not use it.",
  "ceiling.metres": "{m:r} m of flat after the profile started reached its {max:n} m ceiling",
  "ceiling.clock": "{s:r} s after the profile started reached its {max:n} s ceiling",
  "obs.ceiling": "{why:frag} before the readings met the sizing",
  "obs.stint": "one moving run of {run:n1} s on the profile clock — every reading above movingSpeedKmh {moving:n} км/ч, no rest held, no dip, {unread:n} unread tick(s) inside it not credited — against the sized {target:n} s (keepRightSustainSec {keep:n} + {margin:n}); which lane the car ran in is no profile input, and the harness's road witness, when it is on, records the lane the dev road probe publishes in _audit-road.json.gz",
  "obs.gapBase": "the chip's seconds read under {line:n2} s (by its {h:n} s rounding) on every reading of a {run:n1} s run on the profile clock, with the dial at ≥ followMinSpeedKmh {min:n} км/ч by its {hq:n} км/ч rounding and the chip's metres not opening, against the sized {target:n} s (followSustainSec {sus:n} + {margin:n}); chip minimum {minSec:n|-} с / {minM:n|-} м",
  "obs.gapRain": "the chip's seconds read inside [{base:n2}, {rain:n3}) s (by its {h:n} s rounding) on every reading of a {run:n1} s run on the profile clock, with the dial at ≥ followMinSpeedKmh {min:n} км/ч by its {hq:n} км/ч rounding and the chip's metres not opening, against the sized {target:n} s (followRainSustainSec {sus:n} + {margin:n}); chip minimum {minSec:n|-} с / {minM:n|-} м",
  "obs.zoneBlind": "the dial was unreadable on the approach at t={at:n}s with the flat odometer at {odo:n1} m — the dead reckoning has a gap of unknown length from here, and no rest was booked from it",
  "obs.zoneMissed": "the flat odometer read {odo:n1} m (at least {trueLo:n1} m of true path by the census odometer ratio's high end {rmax:n}, the highest of a census of {legs:n} of this lesson's archived pc wrong legs) — past the far edge of the zone ({to:n1} m) with no braking booked",
  "zone.inside": "inside, ≥ {res:n} m from both edges",
  "zone.unverified": "NOT verified inside",
  "zone.model": "braking model v²/(2 × {decel:n2|?} m/s²), BRAKE_FORCE_N / CHASSIS_MASS (design constants sized at {at:tok}): the whole brake force at the road on a level surface at grip 1, with no lower grip, no slope and no front/rear split in the model",
  // ── the zone rest's end ──
  "zone.stood": "the dial read ≤ fullStopMaxSpeedKmh {fs:n} км/ч continuously for {held:n1} s on the profile clock ({stirs:n} stir(s), {breaks:n} break(s), {unread:n} unread tick(s) not credited), against the sized {bar:n} s",
  "zone.est": "braking was booked at t={at:n}s at {kmh:n} км/ч with the flat odometer at {odo:n} m (true path {tlo:n}–{thi:n} m), and the HARNESS ESTIMATE of the rest is [{lo:n}, {hi:n}] m of route (a stop of {near:n}–{far:n} m; dead reckoning over census bands sized on {legs:n} of this lesson's archived pc wrong legs and {n:n} flat to flat-rest transitions on archived wrong legs, not a measured position; {model:frag})",
  "zone.estNone": "no braking was booked, and the harness has no estimate",
  "obs.zoneNoRest": "braking was booked for the zone rest, and no flat-rest tick after it read the dial at 0–{fs:n} км/ч before {end:frag} — the car was not seen at rest on the dial; {est:frag}",
  "zone.endGaveUp": "the harness gave the rest up",
  "zone.endDrive": "the drive ended",
  "obs.zoneHeld": "{stood:frag}; {est:frag} — inside the authored {basis:tok} span [{from:n1}, {to:n1}] m by ≥ {res:n} m",
  "obs.zoneUnverified": "{stood:frag}; {est:frag} — not inside the authored span [{from:n1}, {to:n1}] m by {res:n} m, and the harness's dead reckoning did not place the car inside it",
  "obs.midHold": "the drive ended mid-hold — {obs:frag}",
  "obs.open": "the drive ended with the profile still open ({kind:tok})",
  // ── the finish-open end ──
  "obs.finishHeld": "no careless rest was taken on {ticks:n} flat tick(s), the posted disc read {disc:n} on every one of them, and the drive reached its end screen; the first flat reading, {first:n} км/ч, was certainly below the band ({lo:n}, {hi:n}] and the last, {last:n} км/ч, certainly inside it (by the dial's {hq:n} км/ч rounding); the in-band tally read {inBand:n1} s on the profile clock (sized ≥ {sizedIn:n} s) and the possible-in-band tally {poss:n1} s of wall clock (sized < {sizedWin:n} s; {age:n1} s of it the reading-age allowance); the last flat reading was taken {gap:r} ms of wall clock before the finish's clock, inside the longest wall interval between two flat readings ({maxWall:r} ms), and by the harness's estimate up to {prevAge:r|?} ms before its tick",
  "obs.finishUnmet": "the readings did not meet the finish-open sizing: {unmet:frags}",
  "unmet.noRecord": "no band record",
  "unmet.notEnded": "the drive did not reach its end screen",
  "unmet.released": "a ceiling had released the profile before the end, and its last reading is not the drive's last",
  "unmet.noDisc": "no posted disc was read, and no band was sized",
  "unmet.discUnread": "the posted disc was unread on {n:n} of {t:n} flat tick(s) ({after:n} of them after its first reading), and the profile is sized on one disc read on every tick",
  "unmet.discChanged": "the posted disc changed {n:n} time(s) while the profile held (last disc {disc:n}), and the profile is sized on one disc",
  "unmet.first": "the first flat reading ({first:n|UNREAD} км/ч) was not certainly below the band's floor {lo:n|?} by the dial's {hq:n} км/ч rounding",
  "unmet.last": "the last flat reading ({last:n|UNREAD} км/ч) was not inside ({lo:n|?}, {hi:n|?}] by the dial's {hq:n} км/ч rounding",
  "unmet.inBand": "the in-band tally read {v:n1} s against the sized {s:n} s (speedingMinorSustainSec {m:n} + {margin:n})",
  "unmet.window": "the possible-in-band tally read {v:n1} s, not under the sized {s:n} s (speedingMinorSustainSec {m:n} + SPEED_REGRADE_SEC {r:n})",
  "unmet.endGap": "the last flat reading was taken {gap:r|?} ms of wall clock before the finish's clock, and the longest wall interval between two flat readings was {maxWall:r|NONE} ms",
  // ── the outcome line ──
  "outcome.refused": "WRONG-LEG PROFILE OUTCOME: {name:txt} — ANTECEDENT NOT HELD AS SIZED (REFUSED, NOT RUN): {why:frag}. This leg drove the ordinary cadence.",
  "outcome.noTicks": "WRONG-LEG PROFILE OUTCOME: {name:txt} — ANTECEDENT NOT HELD AS SIZED: not one flat tick ran, and the harness has no readings. {sizing:frag}.",
  "outcome.held": "WRONG-LEG PROFILE OUTCOME: {name:txt} — ANTECEDENT HELD AS SIZED ({how:tok}) at t={at:n}s — OBSERVED: {obs:frag} · READINGS: {readings:frag} · {rests:frag} · {end:frag}. {clock:frag} {sizing:frag}.",
  "outcome.notHeld": "WRONG-LEG PROFILE OUTCOME: {name:txt} — ANTECEDENT NOT HELD AS SIZED ({done:tok|open}) — OBSERVED: {obs:frag|-} · READINGS: {readings:frag} · {rests:frag} · {end:frag}. {clock:frag} {sizing:frag}.",
  "outcome.clock": "The profile clock sums the harness's own tick intervals, paused time and each tick's own work left out, each interval capped at {cap:n} s.",
  "rests": "{opp:n} rest opportunity(ies) held back (the {every:n|?} m / {maxS:n|?} s cadence came due {opp:n} time(s) while the harness's own task-cap and over-limit holds were not holding and the profile held it, each stretch counted once) on {held:n} held flat tick(s), {forced:n} rest(s) booked by the profile",
  "end.reached": "the drive reached its end screen",
  "end.notReached": "the drive did NOT reach its end screen",
  "end.unknown": "the drive's end not yet recorded",
  "readings.finish": "disc {disc:n|NOT SEEN} ({changes:n} change(s)), read on {discRead:n} of {ticks:n} flat tick(s) ({unreadAfter:n} unread after its first reading, {unreadBefore:n} before it) · band ({lo:n|?}, {hi:n|?}] sized over that disc · in-band tally {inBand:n1} s on the profile clock ({dips:n} dip(s) to ≤ the disc wiped it) · possible-in-band tally {poss:n1} s of wall clock ({age:n1} s of it reading-age allowance; allowance {lag:n|?} ms beyond each probe's wait; {unmeasured:n} tick(s) without a probe clock) · {inTicks:n} in-band / {aboveTicks:n} above-band / {unread:n} unread dial reading(s) of {ticks:n} flat tick(s) · first {first:n|UNREAD} · top {top:n|NOT RECORDED} · last {last:n|UNREAD} км/ч · longest wall interval between two flat readings {maxWall:r|NONE} ms (each tick's own work in it, not capped) · end gap {gap:r|NOT RECORDED} ms",
  "readings.stint": "best moving run {best:n1} s on the profile clock (sized {target:n} s) · {dips:n} dip(s) to ≤ movingSpeedKmh · {unread:n} unread tick(s), {unreadBest:n} of them inside the best run",
  "readings.lead": "lead on the chip {lead:n} tick(s), absent {absent:n}, unparsed {unparsed:n}, on a band edge {edge:n}, opening {opening:n} · chip minimum {minSec:n|-} с / {minM:n|-} м · best run under {base:n2} s: {baseBest:n1} s (sized {baseSus:n} s){rain:opt}{rule:opt} · top {top:n|NOT RECORDED} км/ч",
  "readings.leadRain": " · best run in [{base:n2}, {rain:n3}) s: {best:n1} s (sized {sus:n} s)",
  "readings.leadRule": " · {sec:n1} s under the drill's taught {rule:n} s (a design constant sized at {at:tok})",
  "readings.zone": "{braking:frag} · longest continuous rest {best:n1} s of the {hold:n} s hold (sized {sized:n} s) · {stirs:n} stir(s), {breaks:n} break(s), {unread:n} unread tick(s)",
  "zone.brakingBooked": "braking booked at t={at:n}s at {kmh:n} км/ч, flat odometer {odo:n} m, estimated rest [{lo:n}, {hi:n}] m (harness estimate)",
  "zone.brakingNever": "braking NEVER BOOKED",
  // ── the sizing, per kind ──
  "sizing": "{label:frag}: {detail:frag}",
  "sizing.finish": "band over a disc D = (D + min(D × speedingGraceRatio {gr:n}, speedingGraceMaxKmh {gm:n}), D + dangerousSpeedOverKmh {dg:n}]; in-band target ≥ speedingMinorSustainSec {ms:n} s + the harness's {margin:n} s = {tin:n} s; possible-in-band target < speedingMinorSustainSec {ms:n} s + SPEED_REGRADE_SEC {rg:n} s = {tw:n} s; reading-age allowance {lag:n|?} ms = DASHBOARD_POLL_MS {poll:n} ms + two frames {frames:n} ms + this platform's long-frame allowance {lf:n|?} ms ({lfBasis:frag}), beside each probe's measured wait",
  "sizing.stint": "one moving run sized to keepRightSustainSec {keep:n} s + the harness's {margin:n} s = {target:n} s; moving line movingSpeedKmh {moving:n} км/ч",
  "sizing.lead": "base line followSafeSeconds {safe:n} × followFireRatio {fire:n} = {base:n2} s{rain:opt}; runs sized to followSustainSec {sus:n} s{rainSus:opt} + the harness's {margin:n} s; speed floor followMinSpeedKmh {min:n} км/ч; opening rate followRecoveryRateMps {rate:n} m/s{drill:opt}",
  "sizing.leadDrill": "; the drill's taught gap drillTaughtGapSec {rule:n} s, a reading only (no run is sized to it)",
  "sizing.leadRain": "; rain line × followRainSecondsFactor {factor:n} = {rain:n3} s",
  "sizing.leadRainSus": " / followRainSustainSec {sus:n} s",
  "sizing.zone": "{drop:frag}; BAN_ZONE_REST_REGRADE_SEC {rg:n} s; hold = {thr:n} + {rg:n} + the harness's {zm:n} s = {hold:n} s; sized hold = {thr:n} + {rg:n} + {margin:n} s = {sized:n} s; rest line fullStopMaxSpeedKmh {fs:n} км/ч, moving line movingSpeedKmh {moving:n} км/ч; deceleration BRAKE_FORCE_N {force:n} N / CHASSIS_MASS {mass:n} kg = {decel:n2} m/s²",
  "sizing.dropBus": "drop-off busStopDropOffMaxSec {bus:n} s for the {basis:tok} basis (banZoneStopRestSec {ban:n} s for any other)",
  "sizing.dropOther": "banZoneStopRestSec {ban:n} s for the {basis:tok|?} basis (busStopDropOffMaxSec {bus:n} s for law-bus-stop)",
  // ── harness stage H1: the label that names each commit, and the three new kinds ──
  "sizing.labelAt": "SIZING (the harness's design constants, each sized at the commit its own record names — {at:toks}; no file is read to size them, and nothing here is a prediction)",
  "sizing.pace": "{governor:frag}; the run credits a reading when the dial reads over {floor:n} км/ч by its {hq:n} км/ч rounding and at or under the posted disc{cap:opt}, and a disc read inside the run other than the one it started under breaks it{drop:opt}{start:opt}; one run sized to {run:n1} s ({why:frag})",
  "pace.startLamp": "; the run starts on its first reading it credits that is at or over warningLampRunStartKmh {start:n} км/ч by its {hq:n} км/ч rounding (warningLampHeldPaceKmh {pace:n} less WARNING_LAMP_COMPLY_DROP_KMH {drop:n}), and a reading under it before the run starts does not start or break it",
  "pace.governor": "a pace governor on the dial, target {target:n} км/ч: under {full:n} км/ч the harness holds the throttle down for the whole tick, at or over the target it lets the throttle up for the whole tick, and between them it presses the throttle for (paceDutyBase {base:n2} + {gain:n2} per км/ч under the target) of the tick's own interval, from {pulseLoMs:n} to {pulseHiMs:n} ms, then lets it up; an unread dial lets the throttle up; the brake is never touched by it",
  "pace.drop": "; a reading breaks the run, and does not start it, when the fastest reading of the {win:n} s before it on the profile clock (readings before the run started among them) is {lim:n} км/ч or more above it (WARNING_LAMP_COMPLY_DROP_KMH {drop:n} less twice the dial's rounding, over WARNING_LAMP_REGRADE_SEC {win:n} s)",
  "pace.whyLamp": "warningLampBillSec {lampSec:n} + WARNING_LAMP_REGRADE_SEC {rg:n} + the harness's {lag:n} s lag allowance + the harness's {margin:n} s, measured on a drive held at warningLampHeldPaceKmh {pace:n} км/ч",
  "pace.whyEm": "(emRunTopKmh {top:n} + the dial's {hq:n} км/ч rounding + EM_CLOSING_MIN_KMH {closing:n}) / 3.6 / emActorAccelMps2 {accel:n} = {arm:n2} s + emResponseWindowSec {win:n} s + its {jit:n} s spread + the harness's {lag:n} s lag allowance + the harness's {margin:n} s",
  "pace.capSized": " and at or under emRunTopKmh {cap:n} км/ч",
  "obs.paceHeld": "one run of {run:n1} s on the profile clock from its first reading at t={from:n}s (flat odometer {odo:n1} m there): every read dial over {floor:n} км/ч by its rounding and at or under the posted {disc:n}, the disc it started under (no other disc read inside it; {discUnread:n} tick(s) inside it with the disc unread){cap:opt}{drop:opt}, no rest held, {unread:n} unread tick(s) inside it not credited — against the sized {target:n1} s",
  "pace.capHeld": ", and at or under emRunTopKmh {cap:n} км/ч",
  "pace.dropHeld": ", and no reading {lim:n} км/ч or more under the fastest of the {win:n} s before it (the largest such gap read {max:n} км/ч)",
  "obs.paceBroken": "the first run broke at t={at:n}s after {run:n1} s on the profile clock, against the sized {target:n1} s: {why:frag}",
  "pace.brokeFloor": "the dial read {kmh:n} км/ч, not over {floor:n} км/ч by its {hq:n} км/ч rounding",
  "pace.brokeDisc": "the dial read {kmh:n} км/ч, over the posted {disc:n}",
  "pace.brokeDiscChange": "the posted disc read {disc:n} км/ч, not the {was:n} the run started under",
  "pace.brokeCap": "the dial read {kmh:n} км/ч, over emRunTopKmh {cap:n} км/ч",
  "pace.brokeDrop": "the dial read {kmh:n} км/ч, {gap:n} км/ч under the fastest reading of the {win:n} s before it",
  "readings.pace": "disc {disc:n|NOT SEEN} ({changes:n} change(s), {unreadDisc:n} unread tick(s)) · first run {first:n1} s (sized {target:n1} s){broke:opt} · top {top:n|NOT RECORDED} км/ч · the first run's own readings (its start reading and each reading it credited{notBroke:opt}): lowest {low:n|-} км/ч{gap:opt} · governor commands the harness applied: throttle held down {down:n} tick(s), pulsed {pulse:n} ({pulseMs:r} ms in all), let up {up:n} · {unread:n} unread dial reading(s)",
  "pace.brokeAt": ", broken at t={at:n}s",
  "pace.gapRead": ", largest gap under the fastest reading of the {win:n} s before it {gap:n|-} км/ч",
  // H1 ROUND 5 (R4-READINGS-GAP-EXCLUDES-BREAK): the readings line says whose readings its lowest and its largest gap are.
  "pace.notBroke": ", not the reading that broke it",
  "sizing.impact": "no rest from the first flat tick until the harness's count of impact-flash element mounts reads over its base — its reading on the first flat tick, or 0 when its first reading after unread flat tick(s) is 0 — at the plain flat throttle every wrong leg uses (no governor); a first reading over 0 after unread flat tick(s), or a count under its reading before, ends the profile with nothing held; the flat odometer ceiling lies past debrisRouteM {route:n} m of route on any odometer ratio up to {ratio:n}",
  "obs.impact": "the harness's count of impact-flash element mounts read {n:n} at t={at:n}s, over {base:frag}, with the flat odometer at {odo:n1} m and the dial at {kmh:n|UNREAD} км/ч (the reading before it {prev:n|UNREAD} км/ч); no rest was taken from the first flat tick",
  "impact.baseFirst": "{base:n} at the first flat tick",
  "impact.baseZero": "0, its first reading, at t={at:n}s after {k:n} unread flat tick(s): a count that reads 0 had no mounts before it",
  "obs.impactBaseUnread": "the harness's count of impact-flash element mounts was unread on the first {k:n} flat tick(s), and its first reading at t={at:n}s read {n:n}, over 0: mounts on the unread tick(s) and mounts before the first flat tick read the same, and nothing was held from a guess",
  "obs.impactFell": "the harness's count of impact-flash element mounts read {n:n} at t={at:n}s, under the {was:n} it read before: the count restarted, and nothing was held from a guess",
  "readings.impact": "impact-flash element mounts {n:n|UNREAD} (first flat tick {first:n|UNREAD}, base {base:n|UNREAD}), {unread:n} unread count(s) · top {top:n|NOT RECORDED} км/ч · last {last:n|UNREAD} км/ч",
  "sizing.brake": "braking to rest is booked on the first tick whose rear proximity badge reads under REAR_CUE_WARN_M {warn:n} m by its {rq:n} m rounding and whose dial reads at or over harshBrakeMinSpeedKmh {min:n} км/ч and at or under the {roomKmh:n} км/ч its stop room is sized at, each by its {dq:n} км/ч rounding, and never on a tick that reaches a ceiling; the full brake in the model is BRAKE_FORCE_N {force:n} N / CHASSIS_MASS {mass:n} kg = {full:n2} m/s², against harshBrakeDecelMps2 {decel:n} m/s² over harshBrakeSustainSec {sus:n} s; {ceiling:frag}",
  "brake.ceiling": "at the {maxM:n} m flat odometer ceiling, a flat odometer reading {ratio:n} of the true path is {routeM:n1} m along the route, and {routeM:n1} + a stop of up to {room:n} m ({model:frag}) + the harness's {resid:n} m = {total:n1} m, under ftgCalmZoneNearRouteM {zone:n} m; {ratio:n} is the lowest reading in the harness's odometer census of {legs:n} archived wrong legs ({mobile:n} of them mobile, measured {at:tok}), where this lesson's {pcLegs:n} pc legs read {pcLo:n}–{pcHi:n} and its {mLegs:n} mobile legs {mLo:n}–{mHi:n} — a census band, not a bound; the wall clock ceiling is {maxS:n} s",
  "brake.room": "{kmh:n} км/ч over the model's full brake, after the reaction maximum {react:n} s of a census of {n:n} flat to flat-rest transitions on archived wrong legs",
  "obs.brakeCheck": "the rear proximity badge read {m:n} м (under REAR_CUE_WARN_M {warn:n} m by its {rq:n} m rounding) and the dial read {kmh:n} км/ч (at or over harshBrakeMinSpeedKmh {min:n} by its {dq:n} км/ч rounding) at t={at:n}s with the flat odometer at {odo:n1} m; braking BOOKED — the throttle stays down to the end of this tick; each flat-rest tick after it lets the throttle up, and the first one whose dial does not read 0–{fs:n} км/ч puts the brake down",
  "obs.rearBlind": "the rear proximity read did not come back from the probe at t={at:n}s, and nothing was booked from a guess",
  "obs.rearUnread": "the rear proximity badge was on the page at t={at:n}s with a label the harness does not parse, and nothing was booked from a guess",
  "readings.brake": "rear badge read on {reads:n} tick(s), absent on {absent:n} · nearest {min:n|-} м · {close:n} tick(s) whose badge read at or under {closeM:n} m (REAR_CUE_WARN_M {warn:n} less the badge's {rq:n} m rounding) · {fast:n} tick(s) whose dial read at or over {fastKmh:n} км/ч (harshBrakeMinSpeedKmh {minKmh:n} plus the dial's {dq:n} км/ч rounding) · top {top:n|NOT RECORDED} км/ч{booked:opt}",
  "brake.booked": " · braking booked at t={at:n}s at {kmh:n} км/ч with the badge at {m:n} м and the flat odometer at {odo:n1} m",
  // ── the clauses lesson-audit.mjs prints about a declared profile ──
  "rest.zone": "{hold:n}s on the profile clock — WRONG-LEG PROFILE {name:txt}: a hold sized from {thr:n} s (the {basis:tok} basis) + BAN_ZONE_REST_REGRADE_SEC {rg:n} s + the harness's {margin:n} s, sized at {at:tok}. The profile placed this rest by DEAD RECKONING, not by the pose: the harness reads the dev pose probe on every flat and flat-rest tick and records what it returns among its guidance samples, and no profile decision reads it.",
  "rest.plain": "{hold:n|?}s, the harness's ordinary hold (WRONG-LEG PROFILE {name:txt} is declared on this lane). The harness reads the dev pose probe on every flat and flat-rest tick and records what it returns among its guidance samples; no profile decision reads it.",
  "summary": " AND A WRONG-LEG PROFILE ({name:txt}) CHANGED WHEN THESE RESTS FELL: {rests:frag}{zone:opt}. Each rest above has its own «came to REST» line, the harness reads the dev pose probe on every flat and flat-rest tick and records what it returns among its guidance samples, and every stop is still this instrument's act.",
  "summary.unchanged": " AND A WRONG-LEG PROFILE ({name:txt}) WAS ON FOR THIS LANE AND HELD NO DUE REST BACK AND BOOKED NONE: {rests:frag}. Every rest above fell on a tick where the {every:n|?} m / {maxS:n|?} s cadence was due and the harness's own task-cap and over-limit holds were not holding, and every stop is still this instrument's act.",
  "summary.zoneRest": " (the zone rest's longest continuous run was {best:n1} s on the profile clock, against a {hold:n} s hold and a sized {sized:n} s)",
  "summary.zoneNone": " (no zone rest was booked)",
  // ── the true holds, in place of the harness's older «each held 8s», on a lane whose zone rest was booked ──
  "rest.holds": "{plain:n} held on the ordinary {hold:n|?}s hold of wall clock and {zone:n} held on the zone profile's own tally (a {zhold:n} s hold of continuous rest on the profile clock, with a wall ceiling of {wall:n} s; its longest continuous run read {best:n1} s); the drive's end ended any hold still open",
  // ── …and on every other DECLARED lane (round 10: «each held 8s» is false when the drive ends mid-hold) ──
  "rest.holdsPlain": "each held on the ordinary {hold:n|?}s hold of wall clock, and the drive's end ended any hold still open",
});

/** A slot: `{name:kind}` or `{name:kind|fallback}`. */
const PROFILE_SLOT_RE = /\{([A-Za-z][A-Za-z0-9]*):([a-z0-9]+)(?:\|([^{}]*))?\}/g;
/** An identifier-shaped token: no whitespace, so no sentence. */
const PROFILE_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_.:\-]*$/;
let profileTableTexts = null;

/**
 * THE ONE RENDERER. Turns a template spec `{tpl, f}` into its text, checking
 * every slot against its kind — and refusing a missing slot, an extra field,
 * an unknown template, a string where a number belongs, a token with
 * whitespace in it, or a `txt` that is not one of the profile table's own
 * texts. Pure.
 */
export function renderProfileText(spec) {
  if (!spec || typeof spec !== "object" || typeof spec.tpl !== "string" || !Object.hasOwn(PROFILE_LINE_TEMPLATES, spec.tpl)) {
    throw new TypeError(`renderProfileText: not a profile template spec (${spec && typeof spec === "object" ? spec.tpl : typeof spec})`);
  }
  const f = spec.f && typeof spec.f === "object" ? spec.f : {};
  const used = new Set();
  const bad = (name, why) => new TypeError(`renderProfileText: ${spec.tpl} slot «${name}» ${why}`);
  const text = PROFILE_LINE_TEMPLATES[spec.tpl].replace(PROFILE_SLOT_RE, (all, name, kind, fallback) => {
    used.add(name);
    const v = f[name];
    if (v === null || v === undefined) {
      if (kind === "opt") return "";
      if (fallback !== undefined) return fallback;
      throw bad(name, "is empty");
    }
    switch (kind) {
      case "n":
      case "n1":
      case "n2":
      case "n3":
      case "r":
        if (typeof v !== "number" || !Number.isFinite(v)) throw bad(name, `is not a finite number (${typeof v})`);
        return kind === "n" ? String(v) : kind === "r" ? String(Math.round(v)) : v.toFixed(Number(kind.slice(1)));
      case "tok":
        if (typeof v !== "string" || !PROFILE_TOKEN_RE.test(v)) throw bad(name, "is not a token");
        return v;
      case "toks":
        if (!Array.isArray(v) || v.length === 0 || v.some((t) => typeof t !== "string" || !PROFILE_TOKEN_RE.test(t))) throw bad(name, "is not a list of tokens");
        return v.join(" + ");
      case "txt":
        profileTableTexts ??= new Set([...WRONG_LEG_PROFILES.values()].flatMap((p) => [p.name, p.told, p.row]));
        if (typeof v !== "string" || !profileTableTexts.has(v)) throw bad(name, "is not one of the profile table's own texts");
        return v;
      case "frag":
      case "opt":
        return renderProfileText(v);
      case "frags":
        if (!Array.isArray(v) || v.length === 0) throw bad(name, "is not a list of templates");
        return v.map(renderProfileText).join("; ");
      default:
        throw bad(name, `has an unknown kind «${kind}»`);
    }
  });
  for (const k of Object.keys(f)) if (!used.has(k)) throw bad(k, "is not in the template");
  return text;
}

/** A template spec — validated by rendering it once, frozen, JSON-safe (it
 *  rides the sidecar). A null field is kept as null, never undefined. */
export function profileText(tpl, f = {}) {
  const fields = {};
  for (const [k, v] of Object.entries(f ?? {})) fields[k] = v === undefined ? null : v;
  const spec = Object.freeze({ tpl, f: Object.freeze(fields) });
  renderProfileText(spec);
  return spec;
}

/** The verdict words and the sizing label, rendered from the table. */
export const HELD_AS_SIZED = renderProfileText(profileText("verdict.held"));
export const NOT_HELD_AS_SIZED = renderProfileText(profileText("verdict.notHeld"));
export const SIZING_LABEL = renderProfileText(profileText("sizing.label", { at: PROFILE_SIZED_AT }));

/** The braking model the zone rest's dead reckoning ASSUMES — what the MODEL
 *  holds, from design constants — as a line prints it. Pure. */
export function zoneBrakingModel(decel) {
  return renderProfileText(zoneModelSpec(decel));
}
function zoneModelSpec(decel) {
  return profileText("zone.model", { decel: typeof decel === "number" && Number.isFinite(decel) ? decel : null, at: PROFILE_SIZED_AT });
}

/* ── THE CENSUS BANDS, EACH WITH THE POPULATION IT IS SIZED ON (round 10) ──
 * The round-9 verifier's FALSE-SELF-STATEMENT-REFUSAL-SIZING: the refusal said
 * the odometer band was «sized on this lesson's archived pc legs only» while
 * its low end is a sc-signal-flashing MOBILE leg. Every line that cites a band
 * now prints it through one of these, so the band, the population it is sized
 * on and every bound are the declared records' own numbers, and the test file
 * checks each cited bound against the declared constant. Pure. */
function odoBandSpec() {
  return profileText("census.odo", { rmin: ODO_RATIO_MIN, rmax: ODO_RATIO_MAX, legs: ODO_CENSUS_ZONE_PC.legs, lo: ODO_CENSUS_ZONE_PC.min, hi: ODO_CENSUS_ZONE_PC.max });
}
function creepBandSpec() {
  return profileText("census.creep", { creep: ZONE_REST_CREEP_M, legs: ZONE_CREEP_CENSUS.legs, lo: ZONE_CREEP_CENSUS.min, hi: ZONE_CREEP_CENSUS.max });
}
function reactBandSpec() {
  return profileText("census.react", { min: ZONE_REST_REACT_MIN_S, max: ZONE_REST_REACT_MAX_S, n: REACTION_CENSUS.transitions });
}
/** The long-frame allowance's population, by platform (`TICKCOST_CENSUS`). */
function longFrameBasisSpec(platform) {
  if (platform === "pc") return profileText("census.lfPc", { legs: TICKCOST_CENSUS.pc.legs, max: TICKCOST_CENSUS.pc.longestMaxMs });
  if (platform === "mobile") return profileText("census.lfMobile", { legs: TICKCOST_CENSUS.mobile.legs, lo: TICKCOST_CENSUS.mobile.longestMinMs, hi: TICKCOST_CENSUS.mobile.longestMaxMs });
  return profileText("census.lfOther");
}

/** The name of the lesson's authored trace file the zone span is read from
 *  (`readZoneRouteSpan`), as the zone profile's SIZING label names it. */
export const ZONE_TRACE_FILE = "shadow-correct.trace.json";

/**
 * THE TABLE. One row per lesson, and a row is a statement that an OPEN row on
 * that lesson needs an antecedent the 45 m cadence is chopping — the same kind
 * of per-lane statement `SUSTAINED_OVER_LIMIT_LANES` makes. `told` is printed
 * on the drive verbatim, so a judge never meets the changed cadence without
 * meeting what it was for; `row` names the finding and the antecedent it
 * needs, in the harness's own words (round 7: no row text quotes a claim about
 * the product any more). `sizedBy` lists the design constants
 * (`PROFILE_DESIGN`) the profile is sized from.
 */
export const WRONG_LEG_PROFILES = new Map([
  [
    "sc-signal-flashing",
    Object.freeze({
      name: "no-careless-rest-to-the-finish",
      kind: "finish-open",
      row: "sc-signal-flashing:0d68b149 (critical) — its antecedent: a wrong leg that takes no careless rest from its first flat tick to the end screen",
      told: "take no careless rest from the first flat tick to the end screen, at the plain flat throttle every wrong leg uses (no governor), and tally every dial reading against the band the harness sized over the posted disc",
      sizedBy: Object.freeze(["speedingGraceRatio", "speedingGraceMaxKmh", "dangerousSpeedOverKmh", "speedingMinorSustainSec", "SPEED_REGRADE_SEC", "DASHBOARD_POLL_MS", "dialHalfQuantumKmh", "physicsMaxFrameMs"]),
      maxM: 400,
      maxMs: 60_000,
    }),
  ],
  [
    "sc-ov-keep-right",
    Object.freeze({
      name: "one-run-past-the-keep-right-sustain",
      kind: "stint",
      row: "sc-ov-keep-right:64391c6a — its antecedent: this lesson's wrong leg with its careless rests held back, in one moving run longer than the 45 m cadence leaves it",
      told: "hold every careless rest back until ONE moving run (the dial above movingSpeedKmh on every reading, no rest, no dip) has lasted keepRightSustainSec + a margin on the profile clock, then rest on the ordinary cadence",
      sizedBy: Object.freeze(["keepRightSustainSec", "movingSpeedKmh"]),
      maxM: 600,
      maxMs: 60_000,
    }),
  ],
  [
    "sc-ac-truck-spray",
    Object.freeze({
      name: "close-on-the-truck-into-its-spray",
      kind: "lead-close",
      line: "rain",
      // (The drill's taught gap — recorded as a reading, nothing more — is the
      // design constant `drillTaughtGapSec`, with its provenance, round 8.)
      // (Round 10, the round-9 verifier's IMPRECISE-SELF-STATEMENTS b: the w61 leg did NOT rest every 45 m — its first
      // flat stretch ran t=0–13 s, 162.8 m of flat odometer, under the harness's task-cap hold (its run.log: «BEAT ITS
      // TASK CAP at t=13s … over 163 m»); then 7 stops, each «holds it for 8s», every later stretch 49.5–52.5 m.)
      row: "sc-ac-truck-spray:3f5a3ef3 — its antecedent: a wrong leg that closes on the truck at flat throttle; the w61 wrong leg's first flat stretch ran 13 s and 163 m under the harness's task-cap hold, after which it came to rest 7 times on the 45 m cadence and held each rest for the ordinary 8 s hold, and its last frame read «Дистанция · 47 м · 3,1 с» on the chip",
      told: "hold every careless rest back while the follow-gap chip reads a lead, at flat throttle, until the chip's own seconds have read inside the rain band (followSafeSeconds × followFireRatio × [1, followRainSecondsFactor]) for followRainSustainSec + 1 s, or under its base line for followSustainSec + 1 s",
      sizedBy: Object.freeze([
        "followSafeSeconds",
        "followFireRatio",
        "followSustainSec",
        "followMinSpeedKmh",
        "followRecoveryRateMps",
        "followRainSecondsFactor",
        "followRainSustainSec",
        "dialHalfQuantumKmh",
        "chipMetreQuantumM",
        "chipSecondsHalfQuantum",
        "drillTaughtGapSec",
      ]),
      maxM: 1000,
      maxMs: 75_000,
    }),
  ],
  [
    "sc-pk-busstop-ban",
    Object.freeze({
      name: "come-to-rest-inside-the-bus-stop-zone",
      kind: "zone-rest",
      zone: Object.freeze({ world: "pk-busstop-v1", zoneIds: Object.freeze(["pkbs-z-stop-marking", "pkbs-z-stop-pocket"]) }),
      row: "sc-pk-busstop-ban:b103c282 — its antecedent: a wrong leg that comes to rest inside the authored bus-stop zone and stands there",
      // (Round 10: «brake on the tick» was «braking NOW»'s sibling — the brake goes down on a later, flat-rest tick —
      // and «the census» named no population; the told now books the braking and names both populations.)
      told: "hold every careless rest back from the start, then book braking on the tick whose dead-reckoned rest INTERVAL (the flat odometer over the odometer ratio band sized on a census of 12 of this lesson's archived pc wrong legs with its low end widened to the reading of a sc-signal-flashing mobile wrong leg, plus a stop over the reaction band of a census of 322 flat to flat-rest transitions on archived wrong legs and the braking model) is centred on the middle of the authored зона на спирката, and stand there — the throttle kept off through any pause layer — for the hold sized from the zone basis's drop-off, BAN_ZONE_REST_REGRADE_SEC and a margin",
      sizedBy: Object.freeze(["banZoneStopRestSec", "busStopDropOffMaxSec", "BAN_ZONE_REST_REGRADE_SEC", "movingSpeedKmh", "fullStopMaxSpeedKmh", "BRAKE_FORCE_N", "CHASSIS_MASS"]),
      maxM: 400,
      maxMs: 60_000,
    }),
  ],
  // ── HARNESS STAGE H1 (plan57 pedalLane 1–4): four more rows, pedals only ──
  [
    "sc-vp-telltale-red",
    Object.freeze({
      name: "steady-pace-past-the-red-lamp",
      kind: "pace",
      pace: "lamp",
      row: "sc-vp-telltale-red:c172d48b — its antecedent: a wrong leg that takes no careless rest and keeps one steady pace at or under the posted disc past the red lamp and the kerb-side halt zone, for longer than WARNING_LAMP_REGRADE_SEC after the lamp's ignore point",
      told: "take no careless rest from the first flat tick, pace the throttle on the dial to warningLampHeldPaceKmh at or under the posted disc, and count ONE run of readings under one disc, started on the first reading it credits that is at or over warningLampRunStartKmh by the dial's 0.5 км/ч rounding, with no drop of WARNING_LAMP_COMPLY_DROP_KMH inside WARNING_LAMP_REGRADE_SEC until it has lasted warningLampBillSec + WARNING_LAMP_REGRADE_SEC + a lag allowance + a margin on the profile clock, then rest on the ordinary cadence",
      sizedBy: Object.freeze(["WARNING_LAMP_REGRADE_SEC", "WARNING_LAMP_COMPLY_DROP_KMH", "warningLampBillSec", "warningLampHeldPaceKmh", "warningLampRunStartKmh", "dialHalfQuantumKmh", "movingSpeedKmh", "paceDutyBase"]),
      // (H1 round 3: 450 → 610, so the metre ceiling lies past a 6 s launch and the sized 37.7 s run at the posted 50:
      // 43.7 × 50 / 3.6 = 606.9 m — the emergency row's own check.)
      maxM: 610,
      maxMs: 60_000,
    }),
  ],
  [
    "sc-vu-emergency",
    Object.freeze({
      name: "pace-over-the-yield-floor-through-the-approach",
      kind: "pace",
      pace: "em",
      row: "sc-vu-emergency:155903c1 (critical) and sc-vu-emergency:4056508c (critical) — their antecedent: a wrong leg that takes no careless rest and holds a pace over emYieldSlowKmh + EM_SPEED_MARGIN_KMH and at or under the posted disc from its first flat tick through the emergency approach's response window",
      told: "take no careless rest from the first flat tick, pace the throttle on the dial to a target between emYieldSlowKmh + EM_SPEED_MARGIN_KMH and the posted disc, and count ONE run of readings under one disc, each over that floor by the dial's 0.5 км/ч rounding and at or under the disc and emRunTopKmh, started on the first such reading, until it has lasted the sized run on the profile clock, then rest on the ordinary cadence",
      sizedBy: Object.freeze(["emYieldSlowKmh", "EM_SPEED_MARGIN_KMH", "EM_CLOSING_MIN_KMH", "emActorAccelMps2", "emResponseWindowSec", "emResponseJitterSec", "emRunTopKmh", "dialHalfQuantumKmh", "paceDutyBase"]),
      maxM: 400,
      maxMs: 40_000,
    }),
  ],
  [
    "sc-hz-brake-dont-swerve",
    Object.freeze({
      name: "no-rest-into-the-obstacle",
      kind: "to-impact",
      row: "sc-hz-brake-dont-swerve:f0023997 — its antecedent: the drill's own mistake-late-brake, a wrong leg that takes no rest into the obstacle at the plain flat throttle; its frames are the impact-flash element and the views after it",
      told: "hold every careless rest back from the first flat tick, at the plain flat throttle every wrong leg uses (no governor), until the harness's count of impact-flash element mounts reads over its base, then rest on the ordinary cadence; a first reading over 0 after unread flat tick(s), or a count under its reading before, ends the profile with nothing held",
      sizedBy: Object.freeze(["debrisRouteM", "dialHalfQuantumKmh"]),
      maxM: 185,
      maxMs: 45_000,
    }),
  ],
  [
    "sc-follow-tailgater",
    Object.freeze({
      name: "brake-check-the-tailgater",
      kind: "brake-check",
      row: "sc-follow-tailgater:63c0c28c (critical) — its antecedent: a wrong leg that brakes to rest in the live lane from harshBrakeMinSpeedKmh or more, with the car behind closed up on the rear proximity badge, short of the calm zone",
      told: "hold every careless rest back at the plain flat throttle every wrong leg uses (no governor) until one tick reads the rear proximity badge under REAR_CUE_WARN_M and the dial at harshBrakeMinSpeedKmh or more, then book braking to rest on that tick when it has not reached a ceiling; the badge is read off the page on every tick, and a read that did not come back, or a label that does not parse, ends the profile with nothing booked",
      sizedBy: Object.freeze(["REAR_CUE_WARN_M", "rearBadgeHalfQuantumM", "harshBrakeMinSpeedKmh", "harshBrakeDecelMps2", "harshBrakeSustainSec", "ftgCalmZoneNearRouteM", "dialHalfQuantumKmh", "fullStopMaxSpeedKmh", "BRAKE_FORCE_N", "CHASSIS_MASS"]),
      maxM: 64,
      maxMs: 10_000,
    }),
  ],
]);

/** Profiles that were in the table and were TAKEN OUT on evidence, with the
 *  evidence. A test refuses any id here that is also in `WRONG_LEG_PROFILES`.
 *  An evidence record: no template reads it, and no line prints it. */
export const WITHDRAWN_WRONG_LEG_PROFILES = new Map([
  [
    "sc-fo-motorway-gap",
    Object.freeze({
      name: "close-on-the-lead-without-resting",
      withdrawn: "2026-09-25 (pedal-profile lane, round 2)",
      why:
        "unreachable with pedals on this geometry, and it caused a crash: FMG_LEAD matches the player up to 34 m/s, so at y 720 (where it brakes) the gap is still 2.08 s; during its ~4.5 m/s² stop the chip is under 1.26 s for only ~1.6–1.8 s of harness run against the 3.0 s needed; the cap route needs 145 км/ч and the car is at ~135; nothing released the suppression, so the leg rear-ended the braking lead at y ≈ 852 with ~96 км/ч closing speed — a leg that PASSED before (w47). Round-1 verifier, verify/motorway.mjs.",
    }),
  ],
]);

/** ROUTES inside a profile that were TAKEN OUT on evidence, with the evidence —
 *  the same discipline one level down. An evidence record: no line prints it. */
export const WITHDRAWN_PROFILE_ROUTES = new Map([
  [
    "sc-ac-truck-spray/curtain",
    Object.freeze({
      withdrawn: "2026-09-25 (pedal-profile lane, round 3, N-CURTAIN)",
      why:
        "WRONG REFERENT, IN THE FALSE-ACHIEVED DIRECTION, AND NO HONEST CONVERSION CAN FIRE FIRST. " +
        "The chip's metres are leadGapFor's nose-to-tail gap on the PLAYER's forward axis (centre distance − (PLAYER_HALF_LENGTH_M 2.05 + truck half 3.75)), for any lead within LEAD_CORRIDOR_M 4.0 m laterally; " +
        "the product applies SPRAY_NEAR_M 22 to eyeGapM — the straight-line distance from the CAMERA to the truck rig's tail (TrafficLayer.tsx, the ВОДНАТА ПЕЛЕНА block) — and the cockpit camera sits at COCKPIT_EYE z −0.255 (2.305 m behind the nose), " +
        "moves up to 1.2 × COCKPIT_LEAN_LONGITUDINAL 0.03 m further aft under acceleration, follows through a damped lerp (B67 contract < 0.15 m), and is somewhere else entirely in the chase and top-down views and the crash exterior cut. " +
        "So round 2's «chip 21 м = IN the pelena» was an eye gap of 22.8–23.8 m: outside the plume. " +
        "The only conversion that can only under-claim (triangle inequality over any truck heading, lateral up to the corridor, lean and follow error, the chip's half-metre rounding) puts the line at chip ≤ 10 m. " +
        "The truck is pinned at a 58.2 m gap up to 33 m/s and never brakes (cut tier locked), so at ≤ ~1.2 m/s of closing that is ≥ 40 s away — past the 1000 m ceiling (~29 s at 34 m/s) and the y 860 finish — while gap-base (3 s under the chip's 1.21 s) fires first, and gap-rain came first in 100 % of the round-2 verifier's 1000 modelled runs (verify2/truck-v2.mjs). " +
        "A route that cannot fire first measures nothing (the dead-predicate class), so it is removed rather than converted.",
    }),
  ],
]);

/** The declared row for a scenario, or `null`. */
export function wrongLegProfileFor(scenario) {
  return typeof scenario === "string" ? WRONG_LEG_PROFILES.get(scenario) ?? null : null;
}

/** The hold a rest in a no-stopping span of this basis was sized from: the
 *  drop-off for `law-bus-stop`, the ban-zone rest for any other basis (design
 *  constants). `null` when a number is missing. */
export function banZoneRestThresholdSec(basis, c) {
  const k = basis === "law-bus-stop" ? c?.busStopDropOffMaxSec : c?.banZoneStopRestSec;
  return typeof k === "number" && Number.isFinite(k) && k > 0 ? k : null;
}

/** Metres from the DECISION tick to rest at `kmh` after a reaction of
 *  `reactS`: `v·reactS + v²/(2·decel)`. `null` for a dial that is not a speed,
 *  or a reaction or deceleration that is not a number. */
export function stopDistanceM(kmh, { reactS = null, decel = null } = {}) {
  if (typeof kmh !== "number" || !Number.isFinite(kmh) || kmh < 0) return null;
  if (typeof decel !== "number" || !Number.isFinite(decel) || decel <= 0) return null;
  if (typeof reactS !== "number" || !Number.isFinite(reactS)) return null;
  const v = kmh / 3.6;
  return v * reactS + (v * v) / (2 * decel);
}

/**
 * WHERE THE CENSUS PUTS THE REST IF THE CAR BRAKES NOW — an INTERVAL in route
 * metres from the authored start, never a point, and never called a bound. Pure.
 *
 *   lo = odoM / ratioMax          + v·reactMinS + v²/(2·decel)
 *   hi = odoM / ratioMin + creepM + v·reactMaxS + v²/(2·decel)
 *
 * @returns {null|{lo:number, hi:number, mid:number, nearStopM:number, farStopM:number}}
 */
export function zoneRestInterval(odoM, kmh, {
  reactMinS = ZONE_REST_REACT_MIN_S,
  reactMaxS = ZONE_REST_REACT_MAX_S,
  decel = null,
  ratioMin = ODO_RATIO_MIN,
  ratioMax = ODO_RATIO_MAX,
  creepM = ZONE_REST_CREEP_M,
} = {}) {
  const nearStopM = stopDistanceM(kmh, { reactS: reactMinS, decel });
  const farStopM = stopDistanceM(kmh, { reactS: reactMaxS, decel });
  if (nearStopM === null || farStopM === null || typeof odoM !== "number" || !Number.isFinite(odoM) || odoM < 0) return null;
  const lo = odoM / ratioMax + nearStopM;
  const hi = odoM / ratioMin + creepM + farStopM;
  return { lo, hi, mid: (lo + hi) / 2, nearStopM, farStopM };
}

/* ── THE ZONE, IN ROUTE METRES FROM THE AUTHORED START ───────────────────── */

/**
 * Where an authored no-stopping span lies ALONG THE ROUTE, measured from the
 * authored start — pure. Refuses rather than guesses on every shape the dead
 * reckoning cannot survive (a missing zone, zones on different edges or bases,
 * a gap between them, a start off the edge, a span behind the start, and —
 * because a `wrong` leg never steers — a route that is not straight to the far
 * edge). `why` is a template spec (`renderProfileText`).
 *
 * @returns {{ok:boolean, fromM:null|number, toM:null|number, basis:null|string, edgeId:null|string, startEdgeM:null|number, why:null|object}}
 */
export function zoneRouteSpanFrom({ world = null, zoneIds = [], trace = [] } = {}) {
  const no = (tpl, f) => ({ ok: false, fromM: null, toM: null, basis: null, edgeId: null, startEdgeM: null, why: profileText(tpl, f) });
  if (!world || typeof world !== "object") return no("span.noWorld");
  if (!Array.isArray(trace) || trace.length < 2) return no("span.shortTrace");
  const zones = [];
  for (const id of zoneIds) {
    const z = Array.isArray(world.zones) ? world.zones.find((q) => q && q.id === id) : null;
    if (!z) return no("span.noZone", { id });
    zones.push(z);
  }
  if (zones.length === 0) return no("span.noIds");
  const edgeId = zones[0].edgeId;
  const basis = zones[0].basis ?? null;
  if (zones.some((z) => z.edgeId !== edgeId)) return no("span.edges");
  if (zones.some((z) => (z.basis ?? null) !== basis)) return no("span.bases");
  // THE BASIS SIZES THE HOLD, and a line prints it as a token: an authored basis
  // that is not an identifier is refused here, never thrown by the renderer
  // (round 8, from the round-7 verifier's CONTENT-BASIS-THROW).
  if (typeof basis !== "string" || !PROFILE_TOKEN_RE.test(basis)) return no("span.basis");
  if (zones.some((z) => z.kind !== "noStopping")) return no("span.kind");
  zones.sort((a, b) => a.fromM - b.fromM);
  for (let i = 1; i < zones.length; i++) {
    if (zones[i].fromM !== zones[i - 1].toM) return no("span.gap", { a: zones[i - 1].toM, b: zones[i].fromM });
  }
  const edge = Array.isArray(world.roads?.edges) ? world.roads.edges.find((e) => e && e.id === edgeId) : null;
  const geom = edge && Array.isArray(edge.geometry) ? edge.geometry : null;
  if (!geom || geom.length < 2) return no("span.noGeom", { id: edgeId });
  // Project a point onto the polyline: arclength and lateral offset.
  const project = (p) => {
    let best = null;
    let run = 0;
    for (let i = 1; i < geom.length; i++) {
      const [ax, ay] = geom[i - 1];
      const [bx, by] = geom[i];
      const dx = bx - ax;
      const dy = by - ay;
      const L = Math.hypot(dx, dy);
      if (L === 0) continue;
      const u = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (L * L)));
      const off = Math.hypot(p.x - (ax + u * dx), p.y - (ay + u * dy));
      if (best === null || off < best.off) best = { s: run + u * L, off };
      run += L;
    }
    return best;
  };
  const start = project(trace[0]);
  if (!start || start.off > 10) return no("span.offEdge", { off: start ? start.off : null, id: edgeId });
  const lo = zones[0].fromM;
  const hi = zones[zones.length - 1].toM;
  // Which way the route runs along the edge — off the first sample ≥ 5 m on.
  const ahead = trace.find((q) => Math.hypot(q.x - trace[0].x, q.y - trace[0].y) >= 5);
  if (!ahead) return no("span.still");
  const fwd = project(ahead).s >= start.s;
  const fromM = fwd ? lo - start.s : start.s - hi;
  const toM = fwd ? hi - start.s : start.s - lo;
  if (!(fromM > 0)) return no("span.behind", { m: fromM });
  // THE CAR CANNOT STEER, SO THE ROUTE MUST BE STRAIGHT UP TO THE FAR EDGE.
  let travelled = 0;
  const h0 = typeof trace[0].headingDeg === "number" ? trace[0].headingDeg : null;
  for (let i = 1; i < trace.length && travelled <= toM; i++) {
    travelled += Math.hypot(trace[i].x - trace[i - 1].x, trace[i].y - trace[i - 1].y);
    const h = trace[i].headingDeg;
    if (h0 === null || typeof h !== "number") return no("span.noHeading");
    const d = Math.abs(((h - h0 + 540) % 360) - 180);
    if (d > 2) return no("span.turns", { deg: d });
  }
  return { ok: true, fromM, toM, basis, edgeId, startEdgeM: start.s, why: null };
}

/** …off disk: `content/world/<world>.json` and the lesson's own shipped
 *  `shadow-correct.trace.json` — AUTHORED CONTENT (JSON data), never product
 *  source. A file that cannot be read refuses the profile, naming the error
 *  code only. */
export function readZoneRouteSpan(scenario, zone) {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  try {
    const world = JSON.parse(readFileSync(root + "content/world/" + zone.world + ".json", "utf8"));
    const tr = JSON.parse(readFileSync(root + "content/traces/" + scenario + "/shadow-correct.trace.json", "utf8"));
    return zoneRouteSpanFrom({ world, zoneIds: zone.zoneIds, trace: tr.samples });
  } catch (e) {
    const code = e && typeof e.code === "string" && PROFILE_TOKEN_RE.test(e.code) ? e.code : e && e.name === "SyntaxError" ? "SyntaxError" : null;
    return { ok: false, fromM: null, toM: null, basis: null, edgeId: null, startEdgeM: null, why: profileText("span.unreadable", { code }) };
  }
}

/* ── THE STATE ─────────────────────────────────────────────────────────── */

const fin = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A profile's design values — the `sizedBy` constants' numbers, by name. */
function designValues(decl) {
  return Object.fromEntries(decl.sizedBy.map((k) => [k, PROFILE_DESIGN[k].value]));
}

/** The SIZING label — exactly what is read to size the profile: no file for
 *  a profile sized from design constants alone; for the zone profile, the
 *  authored world file and the lesson's authored trace (content JSON) its span
 *  and basis come from, and no other file (round 8). */
function sizingLabelSpec(decl) {
  if (decl.kind === "zone-rest") {
    return profileText("sizing.labelZone", { at: PROFILE_SIZED_AT, world: decl.zone.world + ".json", trace: ZONE_TRACE_FILE });
  }
  // HARNESS STAGE H1: a profile sized from constants of more than one commit names every one of them, in the
  // order `PROFILE_SIZED_COMMITS` lists them; one sized at a single commit keeps the label that stood.
  const ats = PROFILE_SIZED_COMMITS.filter((c) => decl.sizedBy.some((k) => PROFILE_DESIGN[k].at === c));
  if (ats.length === 1 && ats[0] === PROFILE_SIZED_AT) return profileText("sizing.label", { at: PROFILE_SIZED_AT });
  return profileText("sizing.labelAt", { at: ats });
}

/** The sized run of a `pace` profile, in seconds, and the template that says
 *  where it comes from — from the design constants and the governor's target. Pure. */
function paceRunSizing(decl, own) {
  const m = PROFILE_SUSTAIN_MARGIN_SEC;
  if (decl.pace === "lamp") {
    return {
      // H1 ROUND 3 (N5a): + the lag allowance, on the ratio the emergency run's is.
      runSec: own.warningLampBillSec + own.WARNING_LAMP_REGRADE_SEC + LAMP_RUN_LAG_MARGIN_SEC + m,
      why: profileText("pace.whyLamp", { lampSec: own.warningLampBillSec, rg: own.WARNING_LAMP_REGRADE_SEC, lag: LAMP_RUN_LAG_MARGIN_SEC, margin: m, pace: own.warningLampHeldPaceKmh }),
    };
  }
  // H1 ROUND 2 (N5): the arm is sized on the run's TOP — the fastest a credited reading may be — plus the dial's
  // rounding, never on the governor's target; then the window, its spread, the lag allowance and the margin.
  const top = own.emRunTopKmh;
  const hq = own.dialHalfQuantumKmh;
  const arm = (top + hq + own.EM_CLOSING_MIN_KMH) / 3.6 / own.emActorAccelMps2;
  return {
    runSec: arm + own.emResponseWindowSec + own.emResponseJitterSec + EM_RUN_LAG_MARGIN_SEC + m,
    why: profileText("pace.whyEm", { top, hq, closing: own.EM_CLOSING_MIN_KMH, accel: own.emActorAccelMps2, arm, win: own.emResponseWindowSec, jit: own.emResponseJitterSec, lag: EM_RUN_LAG_MARGIN_SEC, margin: m }),
  };
}

/** A `pace` profile's numbers: the governor's target, the run's floor, the drop
 *  limit (the lamp only) and the sized run. Pure. */
function paceNumbers(decl, own) {
  const hq = own.dialHalfQuantumKmh;
  const lamp = decl.pace === "lamp";
  const floor = lamp ? own.movingSpeedKmh : own.emYieldSlowKmh + own.EM_SPEED_MARGIN_KMH;
  const target = lamp ? own.warningLampHeldPaceKmh : floor + EM_PACE_ABOVE_FLOOR_KMH;
  const { runSec, why } = paceRunSizing(decl, own);
  return {
    targetKmh: target,
    floorKmh: floor,
    dropLimitKmh: lamp ? own.WARNING_LAMP_COMPLY_DROP_KMH - 2 * hq : null,
    dropWindowSec: lamp ? own.WARNING_LAMP_REGRADE_SEC : null,
    // H1 ROUND 2 (N5): the emergency run credits no reading over the top its arm is sized on.
    runTopKmh: lamp ? null : own.emRunTopKmh,
    // H1 ROUND 3 (N5a): the lamp run starts past the launch; the emergency run starts on its floor (null: no other start).
    startKmh: lamp ? own.warningLampRunStartKmh : null,
    runSec,
    why,
  };
}

/** The brake-check's metre ceiling, as the arithmetic its sizing sentence prints (H1 round 2, F4): the route a
 *  booking under the ceiling can lie at on a flat odometer reading `BRAKE_CHECK_ODO_RATIO` of the true path, plus the
 *  stop and the harness's residual, against the calm zone. Pure. */
function brakeCeilingSpec(decl, own) {
  const room = Number(brakeCheckRoomM(own).toFixed(1));
  const routeM = decl.maxM / BRAKE_CHECK_ODO_RATIO;
  const AW = ODO_CENSUS_ALL_WRONG_LEGS;
  const OWN = ODO_CENSUS_BRAKE_CHECK;
  return profileText("brake.ceiling", {
    maxM: decl.maxM, ratio: BRAKE_CHECK_ODO_RATIO, routeM, room, resid: BRAKE_CHECK_RESIDUAL_M, total: routeM + room + BRAKE_CHECK_RESIDUAL_M, zone: own.ftgCalmZoneNearRouteM,
    model: profileText("brake.room", { kmh: BRAKE_CHECK_ROOM_KMH, react: ZONE_REST_REACT_MAX_S, n: REACTION_CENSUS.transitions }),
    legs: AW.legs, mobile: AW.mobileLegs, at: AW.measured,
    pcLegs: OWN.pc.legs, pcLo: OWN.pc.min, pcHi: OWN.pc.max, mLegs: OWN.mobile.legs, mLo: OWN.mobile.min, mHi: OWN.mobile.max,
    maxS: decl.maxMs / 1000,
  });
}

/** The stop the brake-check's ceilings leave room for: the fastest the flat throttle is seen to reach on a
 *  posted-50 map (the round-1 verifier's 58.9 km/h terminal, rounded up to 60) over the model's full brake,
 *  after the reaction census's maximum. Pure. */
export const BRAKE_CHECK_ROOM_KMH = 60;
/** H1 ROUND 3 (R2-F5): the brake-check's two lines, each the one its booking tests AND its readings tally print — a badge
 *  reading at or under REAR_CUE_WARN_M less its rounding, a dial reading at or over harshBrakeMinSpeedKmh plus its. Pure. */
function brakeCloseAtM(c) {
  return c.REAR_CUE_WARN_M - c.rearBadgeHalfQuantumM;
}
function brakeFastAtKmh(c) {
  return c.harshBrakeMinSpeedKmh + DIAL_HALF_QUANTUM_KMH;
}
function brakeCheckRoomM(own) {
  return stopDistanceM(BRAKE_CHECK_ROOM_KMH, { reactS: ZONE_REST_REACT_MAX_S, decel: own.BRAKE_FORCE_N / own.CHASSIS_MASS });
}

/** The SIZING clause a line prints: the design constants the profile was
 *  sized from and the targets built from them, labelled «sized at 4112566». */
function sizingSpec(decl, own, extra = {}) {
  const m = PROFILE_SUSTAIN_MARGIN_SEC;
  let detail = null;
  if (decl.kind === "finish-open") {
    const lag = extra.dialLagMs ?? null;
    detail = profileText("sizing.finish", {
      gr: own.speedingGraceRatio,
      gm: own.speedingGraceMaxKmh,
      dg: own.dangerousSpeedOverKmh,
      ms: own.speedingMinorSustainSec,
      margin: m,
      tin: own.speedingMinorSustainSec + m,
      rg: own.SPEED_REGRADE_SEC,
      tw: own.speedingMinorSustainSec + own.SPEED_REGRADE_SEC,
      lag,
      poll: own.DASHBOARD_POLL_MS,
      frames: DIAL_FRAME_ALLOWANCE_MS,
      lf: lag === null ? null : lag - own.DASHBOARD_POLL_MS - DIAL_FRAME_ALLOWANCE_MS,
      lfBasis: longFrameBasisSpec(extra.platform ?? null),
    });
  } else if (decl.kind === "stint") {
    detail = profileText("sizing.stint", { keep: own.keepRightSustainSec, margin: STINT_MARGIN_SEC, target: own.keepRightSustainSec + STINT_MARGIN_SEC, moving: own.movingSpeedKmh });
  } else if (decl.kind === "lead-close") {
    const base = own.followSafeSeconds * own.followFireRatio;
    const rain = decl.line === "rain";
    detail = profileText("sizing.lead", {
      safe: own.followSafeSeconds,
      fire: own.followFireRatio,
      base,
      rain: rain ? profileText("sizing.leadRain", { factor: own.followRainSecondsFactor, rain: base * own.followRainSecondsFactor }) : null,
      sus: own.followSustainSec,
      rainSus: rain ? profileText("sizing.leadRainSus", { sus: own.followRainSustainSec }) : null,
      margin: m,
      min: own.followMinSpeedKmh,
      rate: own.followRecoveryRateMps,
      drill: typeof own.drillTaughtGapSec === "number" ? profileText("sizing.leadDrill", { rule: own.drillTaughtGapSec }) : null,
    });
  } else if (decl.kind === "zone-rest") {
    const thr = extra.thresholdSec;
    const drop =
      extra.basis === "law-bus-stop"
        ? profileText("sizing.dropBus", { bus: own.busStopDropOffMaxSec, basis: extra.basis, ban: own.banZoneStopRestSec })
        : profileText("sizing.dropOther", { ban: own.banZoneStopRestSec, basis: extra.basis ?? null, bus: own.busStopDropOffMaxSec });
    detail = profileText("sizing.zone", {
      drop,
      rg: own.BAN_ZONE_REST_REGRADE_SEC,
      thr,
      zm: ZONE_REST_MARGIN_SEC,
      hold: thr + own.BAN_ZONE_REST_REGRADE_SEC + ZONE_REST_MARGIN_SEC,
      margin: m,
      sized: thr + own.BAN_ZONE_REST_REGRADE_SEC + m,
      fs: own.fullStopMaxSpeedKmh,
      moving: own.movingSpeedKmh,
      force: own.BRAKE_FORCE_N,
      mass: own.CHASSIS_MASS,
      decel: own.BRAKE_FORCE_N / own.CHASSIS_MASS,
    });
  } else if (decl.kind === "pace") {
    const P = paceNumbers(decl, own);
    detail = profileText("sizing.pace", {
      governor: profileText("pace.governor", {
        target: P.targetKmh, full: P.targetKmh - PACE_FULL_BAND_KMH, base: own.paceDutyBase, gain: PACE_DUTY_GAIN_PER_KMH, pulseLoMs: PACE_MIN_PULSE_MS, pulseHiMs: PACE_MAX_PULSE_MS,
      }),
      floor: P.floorKmh,
      hq: own.dialHalfQuantumKmh,
      cap: P.runTopKmh === null ? null : profileText("pace.capSized", { cap: P.runTopKmh }),
      drop: P.dropLimitKmh === null ? null : profileText("pace.drop", { win: P.dropWindowSec, lim: P.dropLimitKmh, drop: own.WARNING_LAMP_COMPLY_DROP_KMH }),
      start: P.startKmh === null ? null : profileText("pace.startLamp", { start: P.startKmh, hq: own.dialHalfQuantumKmh, pace: own.warningLampHeldPaceKmh, drop: own.WARNING_LAMP_COMPLY_DROP_KMH }),
      run: P.runSec,
      why: P.why,
    });
  } else if (decl.kind === "to-impact") {
    detail = profileText("sizing.impact", { route: own.debrisRouteM, ratio: Number((decl.maxM / own.debrisRouteM).toFixed(3)) });
  } else if (decl.kind === "brake-check") {
    const decel = own.BRAKE_FORCE_N / own.CHASSIS_MASS;
    detail = profileText("sizing.brake", {
      warn: own.REAR_CUE_WARN_M, rq: own.rearBadgeHalfQuantumM, min: own.harshBrakeMinSpeedKmh, roomKmh: BRAKE_CHECK_ROOM_KMH, dq: own.dialHalfQuantumKmh,
      force: own.BRAKE_FORCE_N, mass: own.CHASSIS_MASS, full: decel, decel: own.harshBrakeDecelMps2, sus: own.harshBrakeSustainSec,
      ceiling: brakeCeilingSpec(decl, own),
    });
  }
  return profileText("sizing", { label: sizingLabelSpec(decl), detail });
}

/** Why a zone span the profile was handed cannot be used, as a template spec —
 *  or `null` when it can. A span that is `ok` must still carry finite bounds
 *  and an identifier basis (round 8: these used to throw in the renderer). */
function zoneSpanRefusal(span) {
  if (!span || typeof span !== "object") return profileText("refused.span", { why: null });
  if (span.ok !== true) return profileText("refused.span", { why: span.why && typeof span.why === "object" ? span.why : null });
  if (typeof span.basis !== "string" || !PROFILE_TOKEN_RE.test(span.basis)) return profileText("refused.span", { why: profileText("span.basis") });
  if (fin(span.fromM) === null || fin(span.toM) === null || !(span.toM > span.fromM)) return profileText("refused.span", { why: profileText("span.bounds") });
  return null;
}

/**
 * The per-leg state. `declared:false` for every scenario not in the table and
 * for every `right` leg (pass `scenario: null`), and then nothing below ever
 * changes a decision. Nothing here reads a product file: the numbers are the
 * design constants (`PROFILE_DESIGN`).
 *
 * @param {string|null} scenario
 * @param {{zoneSpan?:object, platform?:string|null}} deps — `platform` is
 *   lesson-audit's PLATFORM («pc» | «mobile»); the zone profile refuses off
 *   its census's platform, and the finish-open profile sizes its long-frame
 *   allowance by it.
 */
export function createWrongLegProfile(scenario, { zoneSpan = null, platform = null } = {}) {
  const decl = wrongLegProfileFor(scenario);
  const base = {
    declared: decl !== null,
    on: false,
    scenario: typeof scenario === "string" ? scenario : null,
    name: decl ? decl.name : null,
    kind: decl ? decl.kind : null,
    row: decl ? decl.row : null,
    told: decl ? decl.told : null,
    maxM: decl ? decl.maxM : null,
    maxMs: decl ? decl.maxMs : null,
    sizedAt: decl ? PROFILE_SIZED_AT : null,
    refused: null,
    flatTicks: 0,
    startedAt: null,
    odoM: 0,
    ms: 0,
    clockMs: 0,
    // THE WALL CLOCK between two flat readings (round 7): `now` to `now`, each
    // tick's own work in it, never capped — the clock the end gap is on.
    prevFlatAt: null,
    maxWallMs: null,
    heldTicks: 0,
    // REST OPPORTUNITIES held back (round 7): each time the ordinary
    // cadence came due while the profile held the rest, counted once per
    // stretch (`wrongLegRestOpportunity`). Round 9: the stretch's metres
    // (`sinceM`) are SUMMED FROM ZERO over each flat tick's own step
    // (`tickM`), the arithmetic of the harness's `flatM` after a rest, and a
    // new flat phase is also read off `phaseTicks` (`lastTicks`).
    opportunities: { count: 0, atM: null, atMs: null, lastM: null, lastMs: null, everyM: null, maxMs: null, sinceM: null, tickM: null, lastTicks: null },
    restsForced: 0,
    active: false,
    done: null,
    heldAsSized: false,
    heldAtSec: null,
    how: null,
    observed: null,
    driveEnded: null,
    sizedFrom: null,
    c: null,
  };
  if (!decl) return base;
  const own = designValues(decl);
  const st = { ...base, on: true, active: true, c: own };
  if (decl.kind === "finish-open") {
    st.finish = {
      postedKmh: null, gradedAboveKmh: null, dangerousAboveKmh: null, limitChanges: 0,
      // The disc, tick by tick (round 7): read, or unread before / after its first reading.
      discReadTicks: 0, discUnreadBefore: 0, discUnreadAfter: 0,
      // THE IN-BAND TALLY (the lower ledger, certain readings, the profile
      // clock), and the dips to ≤ the disc that wiped it.
      inBandSec: 0, dips: 0, qualAt: null,
      // THE POSSIBLE-IN-BAND TALLY (the upper ledger) — WALL time over every
      // interval a reading could have been in the band, never reset — and its
      // READING-AGE allowance.
      possibleSec: 0, prevSide: null, prevNow: null, finalMs: null,
      uncreditedMs: 0, prevAgeMs: null, ageCreditSec: 0, probeUnmeasured: 0,
      dialLagMs: dialLagAllowanceMs(platform, own.DASHBOARD_POLL_MS),
      firstSeen: false, firstKmh: null,
      inBandTicks: 0, aboveBandTicks: 0, unreadTicks: 0,
      topKmh: -1, lastKmh: null, lastInBand: null,
      // The sizing targets, from the design constants.
      minorSustainSec: own.speedingMinorSustainSec,
      regradeSec: own.SPEED_REGRADE_SEC,
      sizedInBandSec: own.speedingMinorSustainSec + PROFILE_SUSTAIN_MARGIN_SEC,
      sizedWindowSec: own.speedingMinorSustainSec + own.SPEED_REGRADE_SEC,
    };
    st.sizedFrom = sizingSpec(decl, own, { dialLagMs: st.finish.dialLagMs, platform });
  } else if (decl.kind === "stint") {
    st.stint = { curSec: 0, bestSec: 0, targetSec: own.keepRightSustainSec + STINT_MARGIN_SEC, dips: 0, unreadTicks: 0, unreadInRun: 0, unreadInBest: 0 };
    st.sizedFrom = sizingSpec(decl, own);
  } else if (decl.kind === "lead-close") {
    const baseLine = own.followSafeSeconds * own.followFireRatio;
    const rainLine = decl.line === "rain" ? baseLine * own.followRainSecondsFactor : null;
    st.lead = {
      line: decl.line,
      baseLineSec: baseLine,
      rainLineSec: rainLine,
      baseSustainSec: own.followSustainSec + PROFILE_SUSTAIN_MARGIN_SEC,
      rainSustainSec: rainLine === null ? null : own.followRainSustainSec + PROFILE_SUSTAIN_MARGIN_SEC,
      // The drill's taught gap: a design constant (round 8), read as a tally only.
      lessonRuleSec: own.drillTaughtGapSec ?? null,
      leadTicks: 0, noLeadTicks: 0, unparsedTicks: 0, edgeTicks: 0,
      minSec: null, minM: null, underLessonRuleSec: 0,
      baseRunSec: 0, baseBestSec: 0, baseQual: false,
      rainRunSec: 0, rainBestSec: 0, rainQual: false,
      openingTicks: 0, recent: [], topKmh: -1,
    };
    st.sizedFrom = sizingSpec(decl, own);
  } else if (decl.kind === "zone-rest") {
    const span = zoneSpan && typeof zoneSpan === "object" ? zoneSpan : null;
    const unusable = zoneSpanRefusal(span);
    if (unusable !== null) return { ...st, on: false, active: false, refused: unusable };
    // THE CENSUS IS pc LEGS (R-F9): a platform it does not cover is refused
    // rather than dead-reckoned on an odometer nobody has measured there.
    if (!ZONE_REST_PLATFORMS.includes(platform)) {
      return {
        ...st, on: false, active: false,
        refused: profileText("refused.platform", {
          odo: odoBandSpec(),
          platform: typeof platform === "string" && PROFILE_TOKEN_RE.test(platform) ? platform : null,
          legs: ODO_CENSUS_ALL_WRONG_LEGS.legs,
          mobile: ODO_CENSUS_ALL_WRONG_LEGS.mobileLegs,
          at: ODO_CENSUS_ALL_WRONG_LEGS.measured,
          min: ODO_CENSUS_ALL_WRONG_LEGS.mobileMinRatio,
          rmin: ODO_RATIO_MIN,
          rmax: ODO_RATIO_MAX,
        }),
      };
    }
    const thr = banZoneRestThresholdSec(span.basis, own);
    const holdSec = thr + own.BAN_ZONE_REST_REGRADE_SEC + ZONE_REST_MARGIN_SEC;
    st.zone = {
      world: decl.zone.world, zoneIds: [...decl.zone.zoneIds], basis: span.basis,
      fromM: span.fromM, toM: span.toM, aimM: (span.fromM + span.toM) / 2, residualM: ZONE_REST_RESIDUAL_M,
      thresholdSec: thr, regradeSec: own.BAN_ZONE_REST_REGRADE_SEC, holdSec,
      // THE SIZED HOLD carries the same +1 s sampling margin every other
      // sizing here carries.
      sizedHoldSec: thr + own.BAN_ZONE_REST_REGRADE_SEC + PROFILE_SUSTAIN_MARGIN_SEC,
      decel: own.BRAKE_FORCE_N / own.CHASSIS_MASS, reactMinS: ZONE_REST_REACT_MIN_S, reactMaxS: ZONE_REST_REACT_MAX_S,
      ratioMin: ODO_RATIO_MIN, ratioMax: ODO_RATIO_MAX, creepM: ZONE_REST_CREEP_M,
      phase: "approach", decision: null, heldMs: 0, bestHeldMs: 0, restQual: false,
      breaks: 0, stirs: 0, unreadTicks: 0, restAtSec: null,
    };
    st.sizedFrom = sizingSpec(decl, own, { thresholdSec: thr, basis: span.basis });
  } else if (decl.kind === "pace") {
    const P = paceNumbers(decl, own);
    st.pace = {
      mode: decl.pace,
      goalKmh: P.targetKmh, floorKmh: P.floorKmh, dropLimitKmh: P.dropLimitKmh, dropWindowSec: P.dropWindowSec, sizedRunSec: P.runSec, runTopKmh: P.runTopKmh, startKmh: P.startKmh,
      // The disc, tick by tick: the last one read, how often it changed, how often it was unread.
      postedKmh: null, discChanges: 0, discUnread: 0,
      // H1 ROUND 2 (F3): the ONE disc the run is held under — the disc read when it started — and the ticks inside
      // the run whose disc was unread.
      runDiscKmh: null, runDiscUnread: 0,
      // The readings of the trailing window on the profile clock (the lamp profile only).
      recent: [],
      // THE FIRST RUN — the only one that counts: started on its first qualifying reading (which credits nothing),
      // grown on every later one, broken on the first reading that does not qualify.
      started: false, runSec: 0, fromSec: null, fromOdoM: null, broken: false, brokeAtSec: null, broke: null,
      runUnread: 0, lowKmh: null, maxGapKmh: null, topKmh: -1, unreadTicks: 0,
      // The governor's commands, counted.
      down: 0, up: 0, pulse: 0, pulseMs: 0,
    };
    st.sizedFrom = sizingSpec(decl, own);
  } else if (decl.kind === "to-impact") {
    // H1 ROUND 2 (F2): the first flat tick's reading (`first`, null when unread — `firstSeen` says the tick has run),
    // the base and how it was taken (`baseAtSec`/`baseAfter`: the tick and the unread flat ticks before it when the base
    // is a first reading of 0 after unread ones), and the last reading (`lastN`) a falling count is measured against.
    st.impact = { base: null, n: null, unread: 0, topKmh: -1, lastKmh: null, heldAt: null, firstSeen: false, first: null, baseAtSec: null, baseAfter: 0, lastN: null };
    st.sizedFrom = sizingSpec(decl, own);
  } else if (decl.kind === "brake-check") {
    st.brake = { reads: 0, absent: 0, minM: null, close: 0, fast: 0, topKmh: -1, booked: null };
    st.sizedFrom = sizingSpec(decl, own);
  }
  return st;
}

/** The neutral answer — what every lane without a profile gets, every tick. */
export const NEUTRAL_PROFILE_STEP = Object.freeze({ suppressRest: false, forceRest: false, say: null });

/** A line to print: rendered from the template table, and nowhere else —
 *  FROZEN, and carrying the spec it was rendered from, so nothing can append
 *  to it after rendering and a reader can re-render it (round 8). */
function sayLine(loud, tpl, f) {
  const spec = profileText(tpl, f);
  return Object.freeze({ loud, line: renderProfileText(spec), spec });
}

/**
 * ONE FLAT TICK of the profile — pure. `tick`:
 *   now, t0         — this tick's clock and the drive's
 *   kmh             — the dial (−1 when unreadable)
 *   flatStepM       — the SAME metres the caller adds to `flatM` this tick
 *   dtMs            — the same interval (`now - lastTickAt`, which the pause
 *                     drain resets, so it holds no frozen time)
 *   postedKmh       — `postedLimitKmh(p.postedLabels)`
 *   follow          — `parseHazard(p.hazard).follow` (null = no lead chip)
 *   probeAt         — the wall clock taken immediately BEFORE the probe that
 *                     read `kmh` (lesson-audit's `tickStart`); only the
 *                     finish-open profile reads it
 *   rear            — `parseRearProximity(p.rearProx)` (H1: the brake-check)
 *   impact          — the page-side count of impact-flash element mounts, or
 *                     null when unread (H1: no rest into the obstacle)
 *
 * A `pace` profile's step also carries `pedal` — the governor's throttle
 * command for this tick (`pacePedal`), or `null` on the tick it stops; no
 * other step carries the key, so every other lane keeps the plain throttle.
 *
 * @returns {{state:object, suppressRest:boolean, forceRest:boolean, say:null|{loud:boolean,line:string}, pedal?:null|{act:string,ms:null|number}}}
 */
export function wrongLegFlatStep(state, tick = {}) {
  if (!state || state.on !== true || state.active !== true) return { state, ...NEUTRAL_PROFILE_STEP };
  const s = structuredClone(state);
  const now = fin(tick.now) ?? 0;
  const kmh = fin(tick.kmh);
  const dial = kmh !== null && kmh >= 0 ? kmh : null;
  const dtMs = Math.min(Math.max(0, fin(tick.dtMs) ?? 0), PROFILE_STEP_CAP_MS);
  const dtSec = dtMs / 1000;
  s.flatTicks += 1;
  s.startedAt ??= now;
  s.clockMs += dtMs;
  // THE WALL INTERVAL since the last flat reading — each tick's own work in
  // it, never capped (round 7, from OBS-END-GAP-AND-INTERVAL).
  if (s.prevFlatAt !== null) {
    const wall = Math.max(0, now - s.prevFlatAt);
    if (s.maxWallMs === null || wall > s.maxWallMs) s.maxWallMs = wall;
  }
  s.prevFlatAt = now;
  const stepM = fin(tick.flatStepM);
  if (stepM !== null && stepM > 0) s.odoM += stepM;
  // THIS TICK'S OWN STEP, exactly as the harness adds it to `flatM` — the rest
  // opportunity's stretch is summed from these (round 9, P4-FLOAT-TIE).
  s.opportunities.tickM = stepM ?? 0;
  s.ms = Math.max(0, now - s.startedAt);
  const atSec = elapsedSec({ now, from: fin(tick.t0) });
  const out = { suppressRest: false, forceRest: false, say: null };
  const held = (how, obs) => {
    s.heldAsSized = true;
    s.heldAtSec = atSec;
    s.how = how;
    s.observed = obs;
    out.say = sayLine(false, "say.held", { name: s.name, how, at: atSec, obs });
  };

  if (s.kind === "finish-open") {
    // NO GOVERNOR, NOTHING HELD MID-DRIVE. The profile holds every rest back
    // and tallies its readings; which verdict word the drive gets is decided
    // at its end, by `wrongLegProfileFinish`.
    const f = s.finish;
    const posted = fin(tick.postedKmh) !== null && tick.postedKmh > 0 ? tick.postedKmh : null;
    // THE DISC, EVERY TICK (round 7, from OBS-DISC-UNREAD): unread before its
    // first reading, or AFTER it — the second kind used to be silent.
    if (posted === null) {
      if (f.postedKmh === null) f.discUnreadBefore += 1;
      else f.discUnreadAfter += 1;
    } else {
      f.discReadTicks += 1;
    }
    if (posted !== null && posted !== f.postedKmh) {
      // THE BAND FOLLOWS THE DISC (round 3, N13) — and a CHANGE, as opposed to
      // the first disc, is counted.
      if (f.postedKmh !== null) f.limitChanges += 1;
      const bands = speedingBandsKmh(posted, {
        speedingGraceRatio: s.c.speedingGraceRatio,
        speedingGraceMaxKmh: s.c.speedingGraceMaxKmh,
        dangerousSpeedOverKmh: s.c.dangerousSpeedOverKmh,
      });
      f.postedKmh = posted;
      f.gradedAboveKmh = bands ? bands.gradedAbove : null;
      f.dangerousAboveKmh = bands ? bands.dangerousAbove : null;
    }
    if (s.flatTicks === 1) {
      f.firstSeen = true;
      f.firstKmh = dial;
    }
    if (dial === null) f.unreadTicks += 1;
    if (dial !== null && dial > f.topKmh) f.topKmh = dial;
    f.lastKmh = dial;
    // IN THE BAND AT THE DIAL'S RESOLUTION: the reading must be past each edge
    // by the half quantum.
    const lo = f.gradedAboveKmh === null ? null : f.gradedAboveKmh + DIAL_HALF_QUANTUM_KMH;
    const hi = f.dangerousAboveKmh === null ? null : f.dangerousAboveKmh - DIAL_HALF_QUANTUM_KMH;
    if (lo !== null && dial !== null) {
      const inBand = dial > lo && dial <= hi;
      f.lastInBand = inBand;
      if (inBand) f.inBandTicks += 1;
      if (dial > f.dangerousAboveKmh) f.aboveBandTicks += 1;
    } else {
      f.lastInBand = null;
    }
    // THE IN-BAND TALLY — the §2b ledger on the profile clock, with the band
    // narrowed to the dial's certain readings.
    const led = overLimitLedgerStep({
      kmh: dial,
      now: s.clockMs,
      postedKmh: f.postedKmh,
      needKmh: lo,
      dangerousAboveKmh: hi,
      overSec: f.inBandSec,
      resets: f.dips,
      qualAt: f.qualAt,
    });
    f.inBandSec = led.overSec;
    f.dips = led.resets;
    f.qualAt = led.qualAt;
    // THE POSSIBLE-IN-BAND TALLY (rounds 3–4) — a tally of the harness's OWN
    // readings in WALL time between flat ticks: an interval is credited unless
    // BOTH its readings sit certainly outside the band on the SAME side; an
    // unread dial or an unknown band is credited; never reset, never capped;
    // the interval before the first reading is credited unless that reading is
    // certainly below; the one after the last is added by the finish; a
    // credited interval that ends an uncredited run also credits the closing
    // reading's AGE BOUND (measured probe wait + `dialLagMs`), capped at the
    // run. Its two limits, stated with it: an excursion hidden between two
    // certainly-below readings, and a reading older than its age bound.
    const lo2 = f.gradedAboveKmh;
    const hi2 = f.dangerousAboveKmh;
    const side =
      lo2 === null || hi2 === null || dial === null
        ? 0
        : dial + DIAL_HALF_QUANTUM_KMH <= lo2
          ? -1
          : dial - DIAL_HALF_QUANTUM_KMH > hi2
            ? 1
            : 0;
    const wallMs = f.prevNow === null ? Math.max(0, fin(tick.dtMs) ?? 0) : Math.max(0, now - f.prevNow);
    const outside = side !== 0 && (f.prevSide === null ? side === -1 : f.prevSide === side);
    if (!outside) {
      f.possibleSec += wallMs / 1000;
      if (f.uncreditedMs > 0) {
        const tail = Math.min(f.uncreditedMs, f.prevAgeMs ?? f.uncreditedMs);
        f.possibleSec += tail / 1000;
        f.ageCreditSec += tail / 1000;
      }
      f.uncreditedMs = 0;
    } else {
      f.uncreditedMs += wallMs;
    }
    // THIS reading's age bound, for the interval after it.
    const probeAt = fin(tick.probeAt);
    const measuredMs = probeAt !== null && probeAt <= now ? now - probeAt : fin(tick.dtMs);
    if (!(probeAt !== null && probeAt <= now)) f.probeUnmeasured += 1;
    f.prevAgeMs = measuredMs !== null && f.dialLagMs !== null ? Math.max(0, measuredMs) + f.dialLagMs : null;
    f.prevSide = side;
    f.prevNow = now;
    out.suppressRest = true;
  } else if (s.kind === "stint") {
    const t = s.stint;
    if (dial === null) {
      // No dial is no reading: the run neither grows nor breaks — but the
      // tick is COUNTED, inside the run when there is one (round 7).
      t.unreadTicks += 1;
      if (t.curSec > 0) t.unreadInRun += 1;
    } else if (dial > s.c.movingSpeedKmh) {
      t.curSec += dtSec;
    } else {
      if (t.curSec > 0) t.dips += 1;
      t.curSec = 0;
      t.unreadInRun = 0;
    }
    if (t.curSec > t.bestSec) {
      t.bestSec = t.curSec;
      t.unreadInBest = t.unreadInRun;
    }
    if (t.curSec >= t.targetSec) {
      held(
        "stint",
        profileText("obs.stint", { run: t.curSec, moving: s.c.movingSpeedKmh, unread: t.unreadInRun, target: t.targetSec, keep: s.c.keepRightSustainSec, margin: STINT_MARGIN_SEC }),
      );
      s.active = false;
      s.done = "held-as-sized";
    } else {
      out.suppressRest = true;
    }
  } else if (s.kind === "lead-close") {
    const L = s.lead;
    if (dial !== null && dial > L.topKmh) L.topKmh = dial;
    const f = tick.follow && typeof tick.follow === "object" ? tick.follow : null;
    const lead = f !== null && f.present === true && f.parsed === true && fin(f.meters) !== null;
    if (f !== null && f.present === true && f.parsed !== true) L.unparsedTicks += 1;
    if (!lead) {
      L.noLeadTicks += 1;
      L.baseRunSec = 0; L.baseQual = false;
      L.rainRunSec = 0; L.rainQual = false;
      L.recent = [];
    } else {
      L.leadTicks += 1;
      const m = f.meters;
      const sec = fin(f.heldSec);
      if (L.minM === null || m < L.minM) L.minM = m;
      if (sec !== null && (L.minSec === null || sec < L.minSec)) L.minSec = sec;
      // THE OPENING GUARD at the chip's resolution: the rate is taken against
      // the newest reading at least OPENING_WINDOW_MS old on the profile clock,
      // and the rounding of the two readings is subtracted first.
      L.recent.push({ m, at: s.clockMs });
      while (L.recent.length >= 2 && L.recent[1].at <= s.clockMs - OPENING_WINDOW_MS) L.recent.shift();
      let opening = false;
      const anchor = L.recent.length >= 2 ? L.recent[0] : null;
      if (anchor !== null && s.clockMs > anchor.at) {
        opening = (m - anchor.m - FOLLOW_CHIP_METRE_QUANTUM_M) / ((s.clockMs - anchor.at) / 1000) >= s.c.followRecoveryRateMps;
      }
      if (opening) L.openingTicks += 1;
      // «Fast enough» at the DIAL's resolution.
      const fast = dial !== null && dial - DIAL_HALF_QUANTUM_KMH >= s.c.followMinSpeedKmh;
      const h = FOLLOW_CHIP_SECONDS_HALF_QUANTUM;
      // Inside a band only when the tenth-of-a-second reading is inside it by
      // the half quantum; a reading on an edge is neither, and breaks both runs.
      const underBase = sec !== null && sec + h < L.baseLineSec;
      const underRain = L.rainLineSec !== null && sec !== null && sec - h >= L.baseLineSec && sec + h < L.rainLineSec;
      if (sec !== null && !underBase && !underRain && sec - h < (L.rainLineSec ?? L.baseLineSec)) L.edgeTicks += 1;
      if (L.lessonRuleSec !== null && sec !== null && sec < L.lessonRuleSec) L.underLessonRuleSec += dtSec;
      // Consecutive: the first qualifying tick after a break credits nothing.
      const qb = fast && underBase && !opening;
      L.baseRunSec = qb ? (L.baseQual ? L.baseRunSec + dtSec : 0) : 0;
      L.baseQual = qb;
      if (L.baseRunSec > L.baseBestSec) L.baseBestSec = L.baseRunSec;
      const qr = fast && underRain && !opening;
      L.rainRunSec = qr ? (L.rainQual ? L.rainRunSec + dtSec : 0) : 0;
      L.rainQual = qr;
      if (L.rainRunSec > L.rainBestSec) L.rainBestSec = L.rainRunSec;
      const common = { h, min: s.c.followMinSpeedKmh, hq: DIAL_HALF_QUANTUM_KMH, margin: PROFILE_SUSTAIN_MARGIN_SEC, minSec: L.minSec, minM: L.minM };
      if (!s.heldAsSized && L.baseRunSec >= L.baseSustainSec) {
        held("gap-base", profileText("obs.gapBase", { ...common, line: L.baseLineSec, run: L.baseRunSec, target: L.baseSustainSec, sus: s.c.followSustainSec }));
      } else if (!s.heldAsSized && L.rainSustainSec !== null && L.rainRunSec >= L.rainSustainSec) {
        held("gap-rain", profileText("obs.gapRain", { ...common, base: L.baseLineSec, rain: L.rainLineSec, run: L.rainRunSec, target: L.rainSustainSec, sus: s.c.followRainSustainSec }));
      }
      // (No third route: the chip's METRES alone hold nothing —
      // WITHDRAWN_PROFILE_ROUTES carries why.)
    }
    if (s.heldAsSized) {
      s.active = false;
      s.done = "held-as-sized";
    } else {
      out.suppressRest = lead;
    }
  } else if (s.kind === "zone-rest") {
    const z = s.zone;
    if (z.phase === "approach") {
      out.suppressRest = true;
      if (dial === null) {
        // AN UNREAD DIAL ON THE APPROACH BREAKS THE DEAD RECKONING: the car
        // kept moving while the odometer stood still. Neither advanced nor
        // skipped: REFUSED, here, loudly.
        z.unreadTicks += 1;
        z.phase = "done";
        s.active = false;
        s.done = "blind";
        s.observed = profileText("obs.zoneBlind", { at: atSec, odo: s.odoM });
        out.suppressRest = false;
        out.say = sayLine(true, "say.notHeld", { name: s.name, obs: s.observed });
      } else if (s.odoM / z.ratioMax > z.toM) {
        z.phase = "done";
        s.active = false;
        s.done = "missed";
        s.observed = profileText("obs.zoneMissed", { odo: s.odoM, trueLo: s.odoM / z.ratioMax, rmax: z.ratioMax, legs: ODO_CENSUS_ZONE_PC.legs, to: z.toM });
        out.suppressRest = false;
        out.say = sayLine(true, "say.notHeld", { name: s.name, obs: s.observed });
      } else if (dial > s.c.fullStopMaxSpeedKmh) {
        const iv = zoneRestInterval(s.odoM, dial, { reactMinS: z.reactMinS, reactMaxS: z.reactMaxS, decel: z.decel, ratioMin: z.ratioMin, ratioMax: z.ratioMax, creepM: z.creepM });
        const halfStep = (dial / 3.6) * dtSec * 0.5;
        if (iv !== null && iv.mid + halfStep >= z.aimM) {
          z.decision = {
            atSec,
            odoM: Number(s.odoM.toFixed(1)),
            kmh: dial,
            // THE HARNESS'S ESTIMATE, as intervals: where the car is now and
            // where it rests.
            trueLoM: Number((s.odoM / z.ratioMax).toFixed(1)),
            trueHiM: Number((s.odoM / z.ratioMin + z.creepM).toFixed(1)),
            nearStopM: Number(iv.nearStopM.toFixed(1)),
            farStopM: Number(iv.farStopM.toFixed(1)),
            restLoM: Number(iv.lo.toFixed(1)),
            restHiM: Number(iv.hi.toFixed(1)),
            inside: iv.lo >= z.fromM + z.residualM && iv.hi <= z.toM - z.residualM,
          };
          z.phase = "braking";
          s.restsForced += 1;
          out.forceRest = true;
          out.suppressRest = false;
          const d = z.decision;
          out.say = sayLine(false, "say.braking", {
            name: s.name, at: atSec, fs: s.c.fullStopMaxSpeedKmh, odo: d.odoM, tlo: d.trueLoM, thi: d.trueHiM, odoBand: odoBandSpec(), creepBand: creepBandSpec(),
            near: d.nearStopM, far: d.farStopM, kmh: dial, reactBand: reactBandSpec(), model: zoneModelSpec(z.decel),
            lo: d.restLoM, hi: d.restHiM, from: z.fromM, to: z.toM,
            place: d.inside ? profileText("zone.inside", { res: z.residualM }) : profileText("zone.unverified"),
          });
        }
      }
    }
  } else if (s.kind === "pace") {
    // HARNESS STAGE H1 — THE PACE. The governor's command for this tick
    // (`pacePedal`, the throttle only), and ONE run of readings: each reading
    // over the floor by the dial's rounding, at or under the last disc read,
    // and — on the lamp profile — not `dropLimitKmh` or more under the fastest
    // reading of the trailing window on the profile clock.
    const P = s.pace;
    const hq = DIAL_HALF_QUANTUM_KMH;
    const posted = fin(tick.postedKmh) !== null && tick.postedKmh > 0 ? tick.postedKmh : null;
    if (posted === null) {
      P.discUnread += 1;
    } else {
      if (P.postedKmh !== null && posted !== P.postedKmh) P.discChanges += 1;
      P.postedKmh = posted;
    }
    // H1 ROUND 2 (F1): the command is COUNTED only once it is handed out — after the ceilings, below — never on the
    // tick the profile stops, where the harness applies the plain flat throttle instead.
    out.pedal = pacePedal(dial, { targetKmh: P.goalKmh, dtMs: fin(tick.dtMs) });
    if (dial !== null && dial > P.topKmh) P.topKmh = dial;
    if (dial === null) {
      // No dial is no reading: the run neither grows nor breaks, and the tick is counted.
      P.unreadTicks += 1;
      if (P.started && !P.broken) P.runUnread += 1;
    } else {
      let gap = null;
      if (P.dropWindowSec !== null) {
        while (P.recent.length > 0 && P.recent[0].at < s.clockMs - P.dropWindowSec * 1000) P.recent.shift();
        // H1 ROUND 5: a reading at or over every reading of the window is 0 км/ч under its fastest, never a negative gap.
        gap = P.recent.length > 0 ? Math.max(0, Math.max(...P.recent.map((r) => r.kmh)) - dial) : 0;
        P.recent.push({ at: s.clockMs, kmh: dial });
      }
      // H1 ROUND 2 (F3): inside the run a reading is tested against the ONE disc the run started under, and a disc read
      // inside it that is not that disc breaks it; before the run, against the disc last read. (N5: the emergency
      // run also credits no reading over its top, runTopKmh.)
      const disc = P.started ? P.runDiscKmh : P.postedKmh;
      const floorOk = dial - hq > P.floorKmh;
      const discSame = !P.started || posted === null || posted === P.runDiscKmh;
      const discOk = disc !== null && dial <= disc;
      const capOk = P.runTopKmh === null || dial <= P.runTopKmh;
      const dropOk = gap === null || gap < P.dropLimitKmh;
      const qualifies = floorOk && discSame && discOk && capOk && dropOk;
      // H1 ROUND 3 (N5a): …and the lamp run starts only on a reading past the launch — at or over its start by the dial's
      // rounding; a qualifying reading under it before the run starts neither starts nor breaks it.
      const startOk = P.startKmh === null || dial - hq >= P.startKmh;
      if (!P.started) {
        if (qualifies && startOk) {
          P.started = true;
          P.fromSec = atSec;
          P.fromOdoM = s.odoM;
          P.lowKmh = dial;
          // H1 ROUND 5 (R4-READINGS-GAP-EXCLUDES-BREAK): the run's own readings are its start reading and each reading it
          // credits — the lowest and the largest gap are taken over the same readings (the reading that breaks it is not one).
          P.maxGapKmh = gap;
          P.runDiscKmh = P.postedKmh;
        }
      } else if (!P.broken) {
        if (qualifies) {
          P.runSec += dtSec;
          if (dial < P.lowKmh) P.lowKmh = dial;
          if (gap !== null && gap > P.maxGapKmh) P.maxGapKmh = gap;
        } else {
          P.broken = true;
          P.brokeAtSec = atSec;
          P.broke = !discSame
            ? profileText("pace.brokeDiscChange", { disc: posted, was: P.runDiscKmh })
            : !floorOk
              ? profileText("pace.brokeFloor", { kmh: dial, floor: P.floorKmh, hq })
              : !discOk
                ? profileText("pace.brokeDisc", { kmh: dial, disc })
                : !capOk
                  ? profileText("pace.brokeCap", { kmh: dial, cap: P.runTopKmh })
                  : profileText("pace.brokeDrop", { kmh: dial, gap, win: P.dropWindowSec });
        }
      }
    }
    // …and a disc read inside the run on a tick whose dial was unread breaks it too, and a tick inside the run whose
    // disc was unread is counted.
    if (P.started && !P.broken && dial === null && posted !== null && posted !== P.runDiscKmh) {
      P.broken = true;
      P.brokeAtSec = atSec;
      P.broke = profileText("pace.brokeDiscChange", { disc: posted, was: P.runDiscKmh });
    }
    if (P.started && !P.broken && posted === null) P.runDiscUnread += 1;
    if (P.broken) {
      s.active = false;
      s.done = "run-broken";
      s.observed = profileText("obs.paceBroken", { at: P.brokeAtSec, run: P.runSec, target: P.sizedRunSec, why: P.broke });
      out.say = sayLine(true, "say.notHeld", { name: s.name, obs: s.observed });
    } else if (P.started && P.runSec >= P.sizedRunSec) {
      held(
        "pace",
        profileText("obs.paceHeld", {
          run: P.runSec, from: P.fromSec, odo: P.fromOdoM, floor: P.floorKmh, disc: P.runDiscKmh, discUnread: P.runDiscUnread,
          cap: P.runTopKmh === null ? null : profileText("pace.capHeld", { cap: P.runTopKmh }),
          drop: P.dropLimitKmh === null ? null : profileText("pace.dropHeld", { lim: P.dropLimitKmh, win: P.dropWindowSec, max: P.maxGapKmh }),
          unread: P.runUnread, target: P.sizedRunSec,
        }),
      );
      s.active = false;
      s.done = "held-as-sized";
    } else {
      out.suppressRest = true;
    }
  } else if (s.kind === "to-impact") {
    // HARNESS STAGE H1 — NO REST INTO THE OBSTACLE. The harness's count of
    // impact-flash element mounts (a page-side witness, so a 700 ms flash
    // between two probes is still counted) — its first reading is the base.
    const I = s.impact;
    if (dial !== null && dial > I.topKmh) I.topKmh = dial;
    const prev = I.lastKmh;
    I.lastKmh = dial;
    const n0 = fin(tick.impact);
    const n = n0 === null || n0 < 0 ? null : n0;
    // H1 ROUND 2 (F2): the base is the FIRST FLAT TICK's reading. When that tick is unread, a first reading of 0 is a
    // certain base (a count that reads 0 had no mounts before it); a first reading over 0 cannot tell a mount on the
    // unread ticks from one before the first flat tick, and is refused loudly — never absorbed into the base. A
    // reading under the one before it (the page's count restarted) is refused the same way.
    const firstTick = !I.firstSeen;
    I.firstSeen = true;
    if (firstTick) I.first = n;
    const stop = (done, obs) => {
      s.active = false;
      s.done = done;
      s.observed = obs;
      out.say = sayLine(true, "say.notHeld", { name: s.name, obs });
    };
    if (n === null) {
      I.unread += 1;
      if (I.base === null) I.baseAfter += 1;
      out.suppressRest = true;
    } else if (I.lastN !== null && n < I.lastN) {
      I.n = n;
      stop("count-fell", profileText("obs.impactFell", { n, at: atSec, was: I.lastN }));
    } else if (I.base === null && !firstTick && n > 0) {
      I.n = n;
      I.lastN = n;
      stop("base-unread", profileText("obs.impactBaseUnread", { k: I.baseAfter, at: atSec, n }));
    } else {
      if (I.base === null) {
        I.base = n;
        if (!firstTick) I.baseAtSec = atSec;
      }
      I.n = n;
      I.lastN = n;
      if (n > I.base) {
        I.heldAt = atSec;
        const base = I.baseAtSec === null ? profileText("impact.baseFirst", { base: I.base }) : profileText("impact.baseZero", { at: I.baseAtSec, k: I.baseAfter });
        held("impact", profileText("obs.impact", { n, at: atSec, base, odo: s.odoM, kmh: dial, prev }));
        s.active = false;
        s.done = "held-as-sized";
      } else {
        out.suppressRest = true;
      }
    }
  } else if (s.kind === "brake-check") {
    // HARNESS STAGE H1 — BRAKE-CHECK THE CAR BEHIND. The rear gap is the PROX
    // badge OBSERVED on the page (`parseRearProximity`); a read that did not
    // come back, or a label that does not parse, ends the profile loudly and
    // books nothing — no guess, and no pose.
    const B = s.brake;
    if (dial !== null && dial > B.topKmh) B.topKmh = dial;
    const r = tick.rear && typeof tick.rear === "object" ? tick.rear : null;
    if (r === null || r.ok !== true) {
      s.active = false;
      s.done = "blind";
      s.observed = profileText("obs.rearBlind", { at: atSec });
      out.say = sayLine(true, "say.notHeld", { name: s.name, obs: s.observed });
    } else if (r.present === true && (r.parsed !== true || fin(r.meters) === null)) {
      s.active = false;
      s.done = "unreadable";
      s.observed = profileText("obs.rearUnread", { at: atSec });
      out.say = sayLine(true, "say.notHeld", { name: s.name, obs: s.observed });
    } else {
      out.suppressRest = true;
      if (r.present === true) {
        B.reads += 1;
        if (B.minM === null || r.meters < B.minM) B.minM = r.meters;
      } else {
        B.absent += 1;
      }
      // H1 ROUND 3 (R2-F5): each test is the ONE line readings.brake prints for its tally — the badge at or under
      // REAR_CUE_WARN_M less its rounding, the dial at or over harshBrakeMinSpeedKmh plus its rounding (the same tests as
      // before, written as the lines they are, so a tally can never be counted against a line other than the one it names).
      const closed = r.present === true && r.meters <= brakeCloseAtM(s.c);
      const fast = dial !== null && dial >= brakeFastAtKmh(s.c);
      // H1 ROUND 2 (F4): …and no faster than the speed its stop room is sized at, by the dial's rounding — a booking
      // over it would outrun the room the ceiling sentence prints.
      const inRoom = dial !== null && dial + DIAL_HALF_QUANTUM_KMH <= BRAKE_CHECK_ROOM_KMH;
      if (closed) B.close += 1;
      if (fast) B.fast += 1;
      // H1 ROUND 2 (F4): the ceilings are checked BEFORE the booking — a tick that reaches one books nothing, and the
      // ceiling below releases the profile on it.
      const underCeilings = s.odoM < s.maxM && s.ms < s.maxMs;
      if (closed && fast && inRoom && underCeilings) {
        B.booked = { atSec, kmh: dial, m: r.meters, odoM: Number(s.odoM.toFixed(1)) };
        s.restsForced += 1;
        out.forceRest = true;
        out.suppressRest = false;
        held(
          "brake-check",
          profileText("obs.brakeCheck", {
            m: r.meters, warn: s.c.REAR_CUE_WARN_M, rq: s.c.rearBadgeHalfQuantumM, kmh: dial, min: s.c.harshBrakeMinSpeedKmh, dq: DIAL_HALF_QUANTUM_KMH,
            at: atSec, odo: s.odoM, fs: s.c.fullStopMaxSpeedKmh,
          }),
        );
        s.active = false;
        s.done = "held-as-sized";
      }
    }
  }
  // HARNESS STAGE H1: the governor's command rides out only while the profile is still running after this
  // tick; a profile that stops here hands the leg back to the plain flat throttle on this very tick.

  // THE CEILINGS — after the tick's readings, so a target met on the ceiling
  // tick still counts. (A profile whose readings held as sized is no longer
  // active — every kind stops there — so a ceiling only ever ends one that
  // did not.)
  if (s.active && s.done === null && !out.forceRest) {
    const why =
      s.odoM >= s.maxM
        ? profileText("ceiling.metres", { m: s.odoM, max: s.maxM })
        : s.ms >= s.maxMs
          ? profileText("ceiling.clock", { s: s.ms / 1000, max: s.maxMs / 1000 })
          : null;
    if (why !== null) {
      s.active = false;
      s.done = s.odoM >= s.maxM ? "metres" : "clock";
      if (s.zone) s.zone.phase = "done";
      out.suppressRest = false;
      s.observed = profileText("obs.ceiling", { why });
      out.say = sayLine(true, "say.notHeld", { name: s.name, obs: s.observed });
    }
  }
  if (out.pedal !== undefined && s.active !== true) out.pedal = null;
  // H1 ROUND 2 (F1): THE GOVERNOR'S TALLY IS THE ACTS THE HARNESS APPLIES — a command is counted here, once it rides
  // out; the harness applies every truthy `pedal` through `paceThrottle`, and the plain flat throttle otherwise.
  if (out.pedal) {
    const P = s.pace;
    if (out.pedal.act === "down") P.down += 1;
    else if (out.pedal.act === "up") P.up += 1;
    else {
      P.pulse += 1;
      P.pulseMs += out.pedal.ms;
    }
  }
  // A HELD flat tick is one whose rest the profile actually held back — counted
  // after the ceiling, which releases the rest on its own tick (round 7).
  if (out.suppressRest) s.heldTicks += 1;
  return { state: s, ...out };
}

/**
 * THE FLAT → FLAT-REST TRANSITION. With no profile (`suppress` and `force`
 * both false) this is, clause for clause, the condition that stood in
 * `lesson-audit.mjs`:
 *   `!holdRest && (flatM >= FLAT_REST_EVERY_M || now - phaseAt >= FLAT_REST_MAX_MS) && phaseTicks >= 1`
 * A profile can hold it back (`suppress`) or book it now (`force`, the zone
 * rest); `phaseTicks >= 1` binds both.
 */
export function flatRestDue({ holdRest = false, suppress = false, force = false, flatM = 0, sincePhaseMs = 0, phaseTicks = 0, everyM, maxMs } = {}) {
  const due = flatM >= everyM || sincePhaseMs >= maxMs;
  return (force === true || (!holdRest && suppress !== true && due)) && phaseTicks >= 1;
}

/**
 * REST OPPORTUNITIES HELD BACK (round 7, from OBS-RESTS-HELD-BACK) — pure.
 * Called on EVERY flat tick with the transition's own inputs. When the
 * ORDINARY cadence (`flatRestDue` with no profile) is due, the profile held
 * the rest back and booked none, that is an opportunity held back — counted
 * ONCE per stretch: the next one needs another `everyM` of flat metres, or
 * another `maxMs` of the phase clock, after the last one counted — exactly
 * when the ordinary cadence would have come due again had it rested there.
 * The stretch's metres are SUMMED FROM ZERO over each flat tick's own step
 * (round 9): the harness's `flatM` restarts at 0 after a rest and adds each
 * step to it, and a difference of two running sums lands on the other side
 * of an exact 45 m about one leg in three thousand (the round-8 verifier's
 * P4-FLOAT-TIE). Every call also watches for a restart: a new flat phase (a
 * rest ran) — `flatM` falling, or `phaseTicks` not advancing — restarts the
 * whole stretch; the phase clock falling alone is the pause drain's reset,
 * which restarts its time half from the drain (the drain always comes after
 * the last count). Never counted per tick. The same state object comes back
 * on every lane without a running profile, and once the profile has stopped
 * holding.
 */
export function wrongLegRestOpportunity(state, { holdRest = false, suppress = false, force = false, flatM = 0, sincePhaseMs = 0, phaseTicks = 0, everyM, maxMs } = {}) {
  if (!state || state.on !== true || state.active !== true || !state.opportunities) return state;
  const s = structuredClone(state);
  const q = s.opportunities;
  q.everyM = fin(everyM);
  q.maxMs = fin(maxMs);
  // A NEW FLAT PHASE — a rest ran: `flatM` fell, or (round 9) the phase's tick
  // count did not advance, which also catches a rest taken on an odometer
  // smaller than the next phase's first step, where `flatM` never falls.
  if ((q.lastM !== null && flatM < q.lastM) || (q.lastTicks !== null && phaseTicks <= q.lastTicks)) {
    q.atM = null;
    q.atMs = null;
  } else if (q.lastMs !== null && sincePhaseMs < q.lastMs && q.atMs !== null) {
    q.atMs = 0;
  }
  // THE STRETCH'S METRES, summed from zero over the flat ticks' own steps
  // since the last count — the same additions, in the same order, that the
  // harness's `flatM` makes after a rest. A difference of two running sums
  // (`flatM - atM`) can land either side of a tie the harness's own sum is on
  // (round 9, from the round-8 verifier's P4-FLOAT-TIE).
  q.sinceM = q.atM === null ? null : (q.sinceM ?? 0) + (q.tickM ?? 0);
  q.lastTicks = phaseTicks;
  q.lastM = flatM;
  q.lastMs = sincePhaseMs;
  const ordinary = flatRestDue({ holdRest, flatM, sincePhaseMs, phaseTicks, everyM, maxMs });
  if (ordinary && suppress === true && force !== true) {
    if (q.atM === null || q.sinceM >= everyM || sincePhaseMs - q.atMs >= maxMs) {
      q.count += 1;
      q.atM = flatM;
      q.atMs = sincePhaseMs;
      q.sinceM = 0;
    }
  }
  return s;
}

/** Is the profile holding a zone rest (braking into it or standing in it)? */
export function zoneRestEngaged(state) {
  return !!(state && state.on === true && state.kind === "zone-rest" && state.zone && (state.zone.phase === "braking" || state.zone.phase === "holding"));
}

/** After a pause drain a `wrong` leg re-presses the throttle. Not while it is
 *  standing out a zone rest, and not while a `pace` profile governs it (H1:
 *  its next flat tick hands out the throttle command; a re-press would add a
 *  whole-tick surge to the pace). `true` on every other lane. */
export function resumeThrottleAfterPause(state) {
  if (state && state.on === true && state.active === true && state.kind === "pace") return false;
  return !zoneRestEngaged(state);
}

/**
 * The car has just come to rest in `flat-rest`. How long is THIS rest held?
 * The default `holdMs` unless this is the profile's zone rest. `kmh` is the
 * booking tick's dial (round 7): the continuous rest is credited from the
 * next tick only when that reading is at or under `fullStopMaxSpeedKmh`.
 * @returns {{state:object, holdMs:number, zone:boolean}}
 */
export function wrongLegRestBooked(state, { now = 0, t0 = null, holdMs, kmh = null } = {}) {
  if (!state || state.on !== true || state.kind !== "zone-rest" || state.zone?.phase !== "braking") return { state, holdMs, zone: false };
  const s = structuredClone(state);
  s.zone.phase = "holding";
  s.zone.restAtSec = elapsedSec({ now, from: fin(t0) });
  s.zone.heldMs = 0;
  const dial = fin(kmh);
  s.zone.restQual = dial !== null && dial >= 0 && dial <= s.c.fullStopMaxSpeedKmh;
  return { state: s, holdMs: s.zone.holdSec * 1000, zone: true };
}

/**
 * One `flat-rest` tick after the rest was booked:
 *   · at or under `fullStopMaxSpeedKmh` the continuous run grows by the tick's
 *     interval (clamped);
 *   · over it but not over `movingSpeedKmh` the run is ZEROED and the next
 *     at-rest tick credits nothing (a STIR);
 *   · over `movingSpeedKmh` it is zeroed as well (a BREAK).
 * A dial of −1 is no reading: nothing is credited, nothing is broken, and
 * the tick is counted.
 */
export function wrongLegRestTick(state, { kmh = null, dtMs = 0 } = {}) {
  if (!state || state.on !== true || state.kind !== "zone-rest" || state.zone?.phase !== "holding") return state;
  const s = structuredClone(state);
  const z = s.zone;
  const dial = fin(kmh);
  if (dial === null || dial < 0) {
    z.unreadTicks += 1;
  } else if (dial <= s.c.fullStopMaxSpeedKmh) {
    if (z.restQual) z.heldMs += Math.min(Math.max(0, fin(dtMs) ?? 0), PROFILE_STEP_CAP_MS);
    z.restQual = true;
  } else {
    if (dial > s.c.movingSpeedKmh) z.breaks += 1;
    else z.stirs += 1;
    z.heldMs = 0;
    z.restQual = false;
  }
  if (z.heldMs > z.bestHeldMs) z.bestHeldMs = z.heldMs;
  return s;
}

/** The WALL-CLOCK ceiling on one zone hold, so a hold whose tally keeps being
 *  zeroed cannot pin the leg in `flat-rest` for the rest of its budget. Twice
 *  the 34 s hold plus 20 s for a pause's drain ≈ 90 s. */
export const ZONE_REST_WALL_CEILING_MS = 90_000;

/** Is the current rest over? The default is the wall clock since the rest was
 *  booked, exactly as it stood; a zone hold is its own paused-excluded tally,
 *  bounded by `ZONE_REST_WALL_CEILING_MS`. */
export function flatRestHoldDone({ now = 0, restAt = 0, holdMs, state = null } = {}) {
  if (state && state.on === true && state.kind === "zone-rest" && state.zone?.phase === "holding") {
    return state.zone.heldMs >= state.zone.holdSec * 1000 || now - restAt >= ZONE_REST_WALL_CEILING_MS;
  }
  return now - restAt >= holdMs;
}

/** Where the zone rest's dead reckoning put the car, as a template spec. */
function zoneEstimateSpec(z) {
  const d = z.decision;
  if (!d) return profileText("zone.estNone");
  return profileText("zone.est", {
    at: d.atSec, kmh: d.kmh, odo: d.odoM, tlo: d.trueLoM, thi: d.trueHiM, lo: d.restLoM, hi: d.restHiM,
    near: d.nearStopM, far: d.farStopM, legs: ODO_CENSUS_ZONE_PC.legs, n: REACTION_CENSUS.transitions, model: zoneModelSpec(z.decel),
  });
}

/** The rest ended — held out, or given up because the car never came to rest.
 *  `atDriveEnd` is `wrongLegProfileFinish`'s own call (round 10, the round-9
 *  verifier's IMPRECISE-SELF-STATEMENTS d): a zone rest still braking when the
 *  drive ended — even on the booking tick itself, before any flat-rest tick
 *  pressed the brake — says the DRIVE ended, and one the harness gave up says
 *  THAT; neither says the brake was pressed.
 *  @returns {{state:object, say:null|{loud:boolean,line:string}}} */
export function wrongLegRestEnded(state, { now = 0, t0 = null, gaveUp = false, atDriveEnd = false } = {}) {
  if (!zoneRestEngaged(state)) return { state, say: null };
  const s = structuredClone(state);
  const z = s.zone;
  const atSec = elapsedSec({ now, from: fin(t0) });
  s.active = false;
  if (gaveUp || z.phase === "braking") {
    z.phase = "done";
    s.done = "no-rest";
    s.observed = profileText("obs.zoneNoRest", { fs: s.c.fullStopMaxSpeedKmh, end: profileText(atDriveEnd === true ? "zone.endDrive" : "zone.endGaveUp"), est: zoneEstimateSpec(z) });
    return { state: s, say: sayLine(true, "say.notHeldEnd", { name: s.name, obs: s.observed }) };
  }
  z.phase = "done";
  const held = z.heldMs / 1000;
  const bar = z.sizedHoldSec;
  const stood = profileText("zone.stood", { fs: s.c.fullStopMaxSpeedKmh, held, stirs: z.stirs, breaks: z.breaks, unread: z.unreadTicks, bar });
  if (z.decision?.inside === true && held >= bar) {
    s.done = "held-as-sized";
    s.heldAsSized = true;
    s.heldAtSec = atSec;
    s.how = "zone-rest";
    s.observed = profileText("obs.zoneHeld", { stood, est: zoneEstimateSpec(z), basis: z.basis, from: z.fromM, to: z.toM, res: z.residualM });
    return { state: s, say: sayLine(false, "say.held", { name: s.name, how: "zone-rest", at: atSec, obs: s.observed }) };
  }
  // «unverified-place», never «outside»: the leg did not SHOW the car away
  // from the span, it failed to place it inside.
  s.done = z.decision?.inside === true ? "short-hold" : "unverified-place";
  s.observed = z.decision?.inside === true ? stood : profileText("obs.zoneUnverified", { stood, est: zoneEstimateSpec(z), from: z.fromM, to: z.toM, res: z.residualM });
  return { state: s, say: sayLine(true, "say.notHeldEnd", { name: s.name, obs: s.observed }) };
}

/**
 * THE FINISH-OPEN SIZING — did the leg's readings meet what the profile was
 * sized to? Pure. A statement about the READINGS only. Each target, and the
 * template when it is unmet:
 *   · the drive reached its END SCREEN (the harness's `ended` flag);
 *   · no ceiling had released the profile before the end;
 *   · a posted disc was read, and READ ON EVERY FLAT TICK (round 7);
 *   · one disc throughout (round 3, N13);
 *   · the FIRST flat reading certainly below the band;
 *   · the LAST flat reading certainly inside the band;
 *   · the in-band tally ≥ its sized target;
 *   · the possible-in-band tally < its sized target;
 *   · the END GAP (last flat reading → the finish's clock, wall) inside the
 *     longest wall interval between two flat readings (round 7).
 * @returns {{held:boolean, unmet:object[]}} — `unmet` are template specs.
 */
export function finishOpenSizing(f, { active = false, driveEnded = false, maxWallMs = null } = {}) {
  const unmet = [];
  if (!f || typeof f !== "object") return { held: false, unmet: [profileText("unmet.noRecord")] };
  const hq = DIAL_HALF_QUANTUM_KMH;
  if (driveEnded !== true) unmet.push(profileText("unmet.notEnded"));
  if (active !== true) unmet.push(profileText("unmet.released"));
  if (f.gradedAboveKmh === null) unmet.push(profileText("unmet.noDisc"));
  const discUnread = (f.discUnreadBefore ?? 0) + (f.discUnreadAfter ?? 0);
  if (discUnread !== 0) {
    unmet.push(profileText("unmet.discUnread", { n: discUnread, t: discUnread + (f.discReadTicks ?? 0), after: f.discUnreadAfter ?? 0 }));
  }
  if (f.limitChanges !== 0) unmet.push(profileText("unmet.discChanged", { n: f.limitChanges, disc: f.postedKmh }));
  if (!(f.firstSeen === true && f.firstKmh !== null && f.gradedAboveKmh !== null && f.firstKmh + hq <= f.gradedAboveKmh)) {
    unmet.push(profileText("unmet.first", { first: f.firstKmh, lo: f.gradedAboveKmh, hq }));
  }
  if (f.lastInBand !== true) {
    unmet.push(profileText("unmet.last", { last: f.lastKmh, lo: f.gradedAboveKmh, hi: f.dangerousAboveKmh, hq }));
  }
  if (!(f.inBandSec >= f.sizedInBandSec)) {
    unmet.push(profileText("unmet.inBand", { v: f.inBandSec, s: f.sizedInBandSec, m: f.minorSustainSec, margin: PROFILE_SUSTAIN_MARGIN_SEC }));
  }
  if (!(f.possibleSec < f.sizedWindowSec)) {
    unmet.push(profileText("unmet.window", { v: f.possibleSec, s: f.sizedWindowSec, m: f.minorSustainSec, r: f.regradeSec }));
  }
  const gap = fin(f.finalMs);
  const wall = fin(maxWallMs);
  if (!(gap !== null && wall !== null && gap <= wall)) unmet.push(profileText("unmet.endGap", { gap, maxWall: wall }));
  return { held: unmet.length === 0, unmet };
}

/**
 * The drive is over. Closes whatever is still open, records whether the drive
 * reached its end screen, and gives the finish-open profile its verdict word
 * (`finishOpenSizing`). The end gap is MEASURED: the finish's clock less the
 * last flat reading's, on the wall clock.
 */
export function wrongLegProfileFinish(state, { now = 0, t0 = null, driveEnded = false } = {}) {
  if (!state || state.declared !== true) return { state, say: null };
  const s = structuredClone(state);
  if (s.on !== true) return { state: s, say: null };
  const atSec = elapsedSec({ now, from: fin(t0) });
  s.driveEnded = driveEnded === true;
  if (s.kind === "finish-open" && !s.heldAsSized && s.done === null) {
    const f = s.finish;
    // THE LAST INTERVAL of the possible-in-band tally: from the last flat
    // reading to the finish's own clock — credited whole — and THE END GAP.
    if (f.prevNow !== null) {
      f.finalMs = Math.max(0, now - f.prevNow);
      f.possibleSec += f.finalMs / 1000;
      // …and, as on every credited interval, the reading-age tail of an
      // uncredited run it closes (round 4).
      if (f.uncreditedMs > 0) {
        const tail = Math.min(f.uncreditedMs, f.prevAgeMs ?? f.uncreditedMs);
        f.possibleSec += tail / 1000;
        f.ageCreditSec += tail / 1000;
        f.uncreditedMs = 0;
      }
      f.prevNow = now;
    }
    const v = finishOpenSizing(f, { active: s.active, driveEnded, maxWallMs: s.maxWallMs });
    if (v.held) {
      s.heldAsSized = true;
      s.heldAtSec = atSec;
      s.how = "finish-in-band";
      s.done = "held-as-sized";
      s.observed = profileText("obs.finishHeld", {
        ticks: s.flatTicks, disc: f.postedKmh, first: f.firstKmh, lo: f.gradedAboveKmh, hi: f.dangerousAboveKmh, last: f.lastKmh,
        hq: DIAL_HALF_QUANTUM_KMH, inBand: f.inBandSec, sizedIn: f.sizedInBandSec, poss: f.possibleSec, sizedWin: f.sizedWindowSec,
        age: f.ageCreditSec, gap: f.finalMs, maxWall: s.maxWallMs, prevAge: f.prevAgeMs,
      });
    } else {
      s.done = "ended";
      s.observed = profileText("obs.finishUnmet", { unmet: v.unmet });
    }
  }
  if (zoneRestEngaged(s)) {
    const r = wrongLegRestEnded(s, { now, t0, gaveUp: s.zone.phase === "braking", atDriveEnd: true });
    Object.assign(s, r.state);
    if (s.done === "short-hold") {
      s.done = "ended";
      s.observed = profileText("obs.midHold", { obs: s.observed });
    }
  }
  if (s.done === null) s.done = s.heldAsSized ? "held-as-sized" : "ended";
  if (!s.heldAsSized && s.observed === null) s.observed = profileText("obs.open", { kind: s.kind });
  s.active = false;
  return { state: s, say: null };
}

/* ── THE TEXTS THE HARNESS PRINTS — each one `renderProfileText(spec)` ──────
 * Round 8 (the round-7 verifier's GATE-BYPASS): every text function below is
 * a two-line wrapper over its `…Spec` twin, and the test pins each wrapper's
 * body and re-renders every text the battery produces from the twin's spec —
 * so no text can be appended after rendering without a test going red. */

/** The start line's spec: «WRONG-LEG PROFILE: <name> — <what it will do>», or
 *  the refusal. `null` for a lane with no profile. */
export function wrongLegProfileStartSpec(state, { everyM = null } = {}) {
  if (!state || state.declared !== true) return null;
  const every = fin(everyM) === null ? null : profileText("start.every", { m: everyM });
  if (state.on !== true) return profileText("start.refused", { name: state.name, why: state.refused, every, row: state.row });
  const zone =
    state.kind === "zone-rest" && state.zone
      ? profileText("start.zone", { zones: state.zone.zoneIds, basis: state.zone.basis, from: state.zone.fromM, to: state.zone.toM, hold: state.zone.holdSec })
      : null;
  return profileText("start.on", { name: state.name, told: state.told, row: state.row, maxM: state.maxM, maxS: state.maxMs / 1000, every, zone, sizing: state.sizedFrom });
}

/** The start line, rendered — `null` for a lane with no profile (the silence
 *  it printed before). */
export function wrongLegProfileStartLine(state, opts) {
  const spec = wrongLegProfileStartSpec(state, opts);
  return spec === null ? null : renderProfileText(spec);
}

/** The REST OPPORTUNITIES clause: counted per stretch, never per tick. */
function restsSpec(state) {
  const o = state.opportunities ?? {};
  return profileText("rests", {
    opp: o.count ?? 0,
    every: fin(o.everyM),
    maxS: fin(o.maxMs) === null ? null : o.maxMs / 1000,
    held: state.heldTicks ?? 0,
    forced: state.restsForced ?? 0,
  });
}

/** The READINGS clause of the outcome line — the harness's own tallies, by kind. */
function readingsSpec(state) {
  if (state.kind === "finish-open") {
    const f = state.finish;
    return profileText("readings.finish", {
      disc: f.postedKmh, changes: f.limitChanges, discRead: f.discReadTicks, ticks: state.flatTicks,
      unreadAfter: f.discUnreadAfter, unreadBefore: f.discUnreadBefore, lo: f.gradedAboveKmh, hi: f.dangerousAboveKmh,
      inBand: f.inBandSec, dips: f.dips, poss: f.possibleSec, age: f.ageCreditSec, lag: f.dialLagMs, unmeasured: f.probeUnmeasured,
      inTicks: f.inBandTicks, aboveTicks: f.aboveBandTicks, unread: f.unreadTicks,
      first: f.firstKmh, top: f.topKmh >= 0 ? f.topKmh : null, last: f.lastKmh, maxWall: state.maxWallMs, gap: f.finalMs,
    });
  }
  if (state.kind === "stint") {
    const t = state.stint;
    return profileText("readings.stint", { best: t.bestSec, target: t.targetSec, dips: t.dips, unread: t.unreadTicks, unreadBest: t.unreadInBest });
  }
  if (state.kind === "lead-close") {
    const L = state.lead;
    return profileText("readings.lead", {
      lead: L.leadTicks, absent: L.noLeadTicks, unparsed: L.unparsedTicks, edge: L.edgeTicks, opening: L.openingTicks,
      minSec: L.minSec, minM: L.minM, base: L.baseLineSec, baseBest: L.baseBestSec, baseSus: L.baseSustainSec,
      rain: L.rainLineSec === null ? null : profileText("readings.leadRain", { base: L.baseLineSec, rain: L.rainLineSec, best: L.rainBestSec, sus: L.rainSustainSec }),
      rule: L.lessonRuleSec === null ? null : profileText("readings.leadRule", { sec: L.underLessonRuleSec, rule: L.lessonRuleSec, at: PROFILE_SIZED_AT }),
      top: L.topKmh >= 0 ? L.topKmh : null,
    });
  }
  if (state.kind === "pace") {
    const P = state.pace;
    return profileText("readings.pace", {
      disc: P.postedKmh, changes: P.discChanges, unreadDisc: P.discUnread, first: P.runSec, target: P.sizedRunSec,
      broke: P.broken ? profileText("pace.brokeAt", { at: P.brokeAtSec }) : null,
      top: P.topKmh >= 0 ? P.topKmh : null, notBroke: P.broken ? profileText("pace.notBroke") : null, low: P.lowKmh,
      gap: P.dropWindowSec === null ? null : profileText("pace.gapRead", { win: P.dropWindowSec, gap: P.maxGapKmh }),
      down: P.down, pulse: P.pulse, pulseMs: P.pulseMs, up: P.up, unread: P.unreadTicks,
    });
  }
  if (state.kind === "to-impact") {
    const I = state.impact;
    return profileText("readings.impact", { n: I.n, first: I.first, base: I.base, unread: I.unread, top: I.topKmh >= 0 ? I.topKmh : null, last: I.lastKmh });
  }
  if (state.kind === "brake-check") {
    const B = state.brake;
    return profileText("readings.brake", {
      reads: B.reads, absent: B.absent, min: B.minM, close: B.close, closeM: brakeCloseAtM(state.c), warn: state.c.REAR_CUE_WARN_M, rq: state.c.rearBadgeHalfQuantumM,
      fast: B.fast, fastKmh: brakeFastAtKmh(state.c), minKmh: state.c.harshBrakeMinSpeedKmh, dq: DIAL_HALF_QUANTUM_KMH,
      top: B.topKmh >= 0 ? B.topKmh : null,
      booked: B.booked === null ? null : profileText("brake.booked", { at: B.booked.atSec, kmh: B.booked.kmh, m: B.booked.m, odo: B.booked.odoM }),
    });
  }
  const z = state.zone;
  const d = z.decision;
  return profileText("readings.zone", {
    braking: d ? profileText("zone.brakingBooked", { at: d.atSec, kmh: d.kmh, odo: d.odoM, lo: d.restLoM, hi: d.restHiM }) : profileText("zone.brakingNever"),
    best: z.bestHeldMs / 1000, hold: z.holdSec, sized: z.sizedHoldSec, stirs: z.stirs, breaks: z.breaks, unread: z.unreadTicks,
  });
}

/** The outcome line's spec — what the harness OBSERVED, its readings, and the
 *  design constants the profile was sized from. `HELD_AS_SIZED` only when the
 *  readings met the sizing; otherwise `NOT_HELD_AS_SIZED`. `null` for a lane
 *  with no profile. */
export function wrongLegProfileOutcomeSpec(state) {
  if (!state || state.declared !== true) return null;
  // A DECLARED profile that never ran is said again at the END, where a judge
  // reads outcomes.
  if (state.on !== true) return profileText("outcome.refused", { name: state.name, why: state.refused });
  if (state.flatTicks === 0) return profileText("outcome.noTicks", { name: state.name, sizing: state.sizedFrom });
  const end = profileText(state.driveEnded === true ? "end.reached" : state.driveEnded === false ? "end.notReached" : "end.unknown");
  const common = {
    name: state.name, obs: state.observed, readings: readingsSpec(state), rests: restsSpec(state), end,
    clock: profileText("outcome.clock", { cap: PROFILE_STEP_CAP_MS / 1000 }), sizing: state.sizedFrom,
  };
  return state.heldAsSized
    ? profileText("outcome.held", { ...common, how: state.how, at: state.heldAtSec })
    : profileText("outcome.notHeld", { ...common, done: state.done });
}

/** The outcome line, rendered — `null` for a lane with no profile. */
export function wrongLegProfileOutcomeLine(state) {
  const spec = wrongLegProfileOutcomeSpec(state);
  return spec === null ? null : renderProfileText(spec);
}

/**
 * `lesson-audit.mjs`'s rest note, after «…holds it for », on a DECLARED lane —
 * or `null` on every lane without one, which keeps the sentence that always
 * stood there. The zone rest names its sized hold; every other rest on a
 * declared lane names the harness's ordinary hold and nothing about the
 * product (round 7: the «ban-zone sustain» sentence is not printed on a
 * declared lane). This is the spec; `wrongLegRestHoldNote` renders it.
 */
export function wrongLegRestHoldNoteSpec(state, booked, { holdMs } = {}) {
  if (!state || state.declared !== true) return null;
  if (booked && booked.zone === true && state.zone) {
    return profileText("rest.zone", {
      hold: booked.holdMs / 1000, name: state.name, thr: state.zone.thresholdSec, basis: state.zone.basis,
      rg: state.zone.regradeSec, margin: ZONE_REST_MARGIN_SEC, at: PROFILE_SIZED_AT,
    });
  }
  return profileText("rest.plain", { hold: fin(holdMs) === null ? null : holdMs / 1000, name: state.name });
}

/** The rest note, rendered — `null` on every lane without a declared profile. */
export function wrongLegRestHoldNote(state, booked, opts) {
  const spec = wrongLegRestHoldNoteSpec(state, booked, opts);
  return spec === null ? null : renderProfileText(spec);
}

/**
 * `lesson-audit.mjs`'s rest summary clause for a RUNNING profile — the rest
 * opportunities it held back (per stretch) and the rests it booked, and, for
 * the zone profile, what the zone rest's hold actually read (or that none was
 * booked). `null` on every other lane.
 *
 * «CHANGED WHEN THESE RESTS FELL» only when the profile held a due rest back
 * or booked one (round 8, from the round-7 verifier's FALSE-SELF-CLAIMS): with
 * neither, every rest fell on a tick where the ordinary cadence was due and
 * the profile did not hold it — `wrongLegRestOpportunity` counts the FIRST such
 * tick of any stretch, so a count of 0 means there was none — and the clause
 * says exactly that.
 */
export function wrongLegRestSummarySpec(state) {
  if (!state || state.on !== true) return null;
  const rests = restsSpec(state);
  if ((state.opportunities?.count ?? 0) === 0 && (state.restsForced ?? 0) === 0) {
    const o = state.opportunities ?? {};
    return profileText("summary.unchanged", { name: state.name, rests, every: fin(o.everyM), maxS: fin(o.maxMs) === null ? null : o.maxMs / 1000 });
  }
  const zone =
    state.kind === "zone-rest" && state.zone
      ? state.restsForced > 0
        ? profileText("summary.zoneRest", { best: state.zone.bestHeldMs / 1000, hold: state.zone.holdSec, sized: state.zone.sizedHoldSec })
        : profileText("summary.zoneNone")
      : null;
  return profileText("summary", { name: state.name, rests, zone });
}

/** The rest summary clause, rendered — "" on every lane without a running profile. */
export function wrongLegRestSummary(state) {
  const spec = wrongLegRestSummarySpec(state);
  return spec === null ? "" : renderProfileText(spec);
}

/**
 * THE TRUE HOLDS, in place of the harness's older «each held 8s» (round 8, from
 * the round-7 verifier's FALSE-SELF-CLAIMS): on a lane whose zone rest was
 * BOOKED (the car came to rest for it, `wrongLegRestBooked`), that rest was held
 * on the zone profile's own tally, not for `holdMs`. `stops` is the harness's
 * count of rests the car came to rest in (`stopsMade`), the zone rest among
 * them.
 *
 * ROUND 10 (the round-9 verifier's IMPRECISE-SELF-STATEMENTS c): on EVERY OTHER
 * DECLARED lane — the profile on or refused — «each held 8s» is not true either
 * when the drive ends mid-hold: the loop's end lifts the brake on a hold still
 * open. Those lanes get `rest.holdsPlain` (the ordinary hold of wall clock, and
 * the drive's end ending any hold still open). `null` only on a lane with NO
 * declared profile, which keeps the 4112566 words byte for byte.
 */
export function wrongLegRestHoldsSpec(state, { stops = null, holdMs = null } = {}) {
  if (!state || state.declared !== true) return null;
  const n = fin(stops);
  if (n === null || n < 1) return null;
  const hold = fin(holdMs) === null ? null : holdMs / 1000;
  if (state.on !== true || state.kind !== "zone-rest" || !state.zone || state.zone.restAtSec === null) return profileText("rest.holdsPlain", { hold });
  return profileText("rest.holds", {
    plain: n - 1,
    hold,
    zone: 1,
    zhold: state.zone.holdSec,
    wall: ZONE_REST_WALL_CEILING_MS / 1000,
    best: state.zone.bestHeldMs / 1000,
  });
}

/** The holds clause, rendered — `null` where the older words stand (a lane with no declared profile). */
export function wrongLegRestHoldsClause(state, opts) {
  const spec = wrongLegRestHoldsSpec(state, opts);
  return spec === null ? null : renderProfileText(spec);
}
