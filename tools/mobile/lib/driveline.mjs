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
