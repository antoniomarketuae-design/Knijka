/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SAME DECISION, IN THE READER'S OWN CONTROLS — doc 91 §J-WAVE-4, item 2.
 *
 * The defect this exists to close: `LessonPlayShell`'s driveline hints told a
 * PHONE student to „задръж съединителя и включи първа (Z + ])", and then the
 * engine graded him for not doing it. Twelve strings named a key a phone does
 * not have; the worst of them is the one that teaches the manual start, i.e.
 * the first thing „Напреднал" says to anybody who switches tier.
 *
 * THEO-4 (founder-ratified) forbids a bare verdict: the student is owed the
 * reasoning. Reasoning he cannot act on is not reasoning — it is a verdict with
 * decoration. So the answer is NOT to delete the key names (a keyboard student
 * still needs „Z + ]"), and it is not to write a second, shorter, touch-only
 * card either: two authored cards drift, and the one that drifts is always the
 * one nobody is looking at.
 *
 * SO THE SENTENCE IS AUTHORED ONCE AND THE CONTROL IS NAMED TWICE. Each hint
 * stays a single Bulgarian sentence with the teaching in it; the only thing
 * that varies is the phrase naming the control the student must reach for. That
 * is what makes „the same decision" a property of the code rather than a claim
 * in a commit message — there is literally one sentence, so the two readers
 * cannot be taught different things.
 *
 * WHY A PHRASE TABLE AND NOT A `showKeyHints` BOOLEAN. The HUD already has the
 * boolean idiom (`TelltaleEdgePings.showKeyHints`, `CameraAidHint.showKeyHint`,
 * `TeachMomentOverlay`'s `touch`) and it is right where it is used: there the
 * key cap is DECORATION beside a control the student can already see, so
 * hiding it costs nothing. Here the control's name IS the instruction — «СЪЕД»
 * is inside a sheet the student has never opened — so suppressing it leaves the
 * card saying „hold the clutch" with no way to find the clutch. Same reason
 * `PRE_DRIVE_STEP_CONTROLS` carries `keys` AND `clickBg` per row rather than
 * one and a flag: one row, one control, one phrasing per input.
 *
 * THE TOUCH NAMES ARE THE SHIPPED CELL FACES, verbatim from
 * `components/sim/TouchControls.tsx` — «ДВИГ», «РЪЧНА», «СЪЕД», «◄P», «M►»,
 * «D►», and the rail button «Кола» that reveals the strip they live in.
 * `controlPhrases.test.ts` reads that file and fails if a face is renamed, so
 * this table cannot quietly start naming a button that no longer exists. That
 * is the exact failure mode the drivetrain pad's reverse promise was
 * (`touchLabels.test.ts`): a sentence that was true when it was written.
 *
 * WHICH READER GETS WHICH. The caller decides, from `hasTouchScreen()` — the
 * same predicate that decides whether `TouchControls` mounts at all. So the
 * copy names on-screen cells exactly when those cells are on screen, including
 * on a touch laptop, where both are true. It is never inferred from viewport
 * width and never from `maxTouchPoints` alone (WebKit reports 0).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { TransmissionMode } from "../vehicle/driveline";

/**
 * Which vocabulary a card speaks.
 *
 *  · "keyboard" — the desktop cockpit: the MOUSE is the instruction (founder
 *    2026-07-30, „first and upmost it must be with the mouse") and the key cap
 *    rides along in brackets as the advanced footnote. One reader, one sentence
 *    — this is not „keyboard instead of mouse", it is the desktop pair.
 *  · "touch" — the on-screen controls, named by the face printed on them.
 */
export type HintInput = "keyboard" | "touch";

/** `hasTouchScreen()` → the vocabulary. One line, so no caller re-decides it. */
export function hintInputFor(touchCapable: boolean): HintInput {
  return touchCapable ? "touch" : "keyboard";
}

/**
 * Every driveline cell named below lives in the ⚙ strip, which is CLOSED by
 * default and opens from the rail button «Кола». A card that says „натисни
 * «СЪЕД»" to a student who has never opened that strip has named a control he
 * cannot see, which is the defect one step along rather than the fix — so any
 * touch sentence that names a strip cell carries this, once, at the end.
 *
 * Kept short deliberately: it is appended to a `explanationBg` (the WHY behind
 * «ЗАЩО», which is never truncated — see `reverseStuckHint`), but it is still
 * a sentence a student reads mid-drive.
 */
/**
 * ⚠ „ГОРЕ НА ЕКРАНА" WAS TRUE UNTIL 2026-08-13 AND IS NOW WRONG.
 *
 * «Кола» left the top rail in the control redesign: it was 110.7 mm from either
 * thumb sideways and 101.7 mm upright, in a corner no thumb reaches without
 * regripping the phone. It is the lowest station on the right-hand arc now —
 * directly above the throttle thumb, under the three mirrors — so a sentence
 * that sends a student to the top of the screen sends them to the wrong end of
 * it. This is the same class of defect as the drivetrain pad's reverse promise:
 * a sentence that was true when it was written.
 */
export const TOUCH_SHEET_LOCATOR_BG = "Тези бутони са зад „Кола“ вдясно, над газта.";

/** Append the locator to a touch sentence that names a ⚙-strip cell. */
export function withSheetLocatorBg(input: HintInput, sentence: string): string {
  return input === "touch" ? `${sentence} ${TOUCH_SHEET_LOCATOR_BG}` : sentence;
}

/** Capitalise a phrase used at the start of a sentence (Bulgarian is 1 cp). */
export function capBg(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

// ---------------------------------------------------------------------------
// THE TABLE. Two forms per control, because Bulgarian needs both:
//   ·Act  — an imperative („натисни «ДВИГ»") that can open a clause;
//   ·With — an adjunct („с «D►»") that hangs off a verb already in the sentence.
// Anything that needs a third form needs a row here, not an inline literal at
// the call site: an inline literal is how the twelve strings happened.
// ---------------------------------------------------------------------------

/** The clutch as the OBJECT of „натисни / задръж". Manual tier only — an
 *  automatic has no clutch and «СЪЕД» is not rendered there. */
export function clutchObjBg(input: HintInput): string {
  return input === "touch" ? "„СЪЕД“" : "съединителя (Z)";
}

/** …and as „keep it pressed" (the state, not the press). */
export function clutchHeldObjBg(input: HintInput): string {
  return input === "touch" ? "„СЪЕД“ натиснат" : "съединителя натиснат (Z)";
}

/** Start / stop the engine, as an imperative. */
export function starterActBg(input: HintInput): string {
  return input === "touch" ? "натисни „ДВИГ“" : "щракни стартера на конзолата (клавиш I)";
}

/** …and as „with the starter", for a clause that already has its verb. */
export function starterWithBg(input: HintInput): string {
  return input === "touch" ? "с „ДВИГ“" : "с I";
}

/** Release / set the parking brake, as an imperative. */
export function parkingBrakeActBg(input: HintInput): string {
  return input === "touch"
    ? "натисни „РЪЧНА“"
    : "щракни ключа на ръчната спирачка (клавиш Space)";
}

/**
 * ONE STEP UP THE GATE — and the touch face depends on the gearbox, because
 * the cell does: the gate is P—R—N—D on an automatic and P—R—N—M1…M5 on
 * „Напреднал", so `TouchControls` prints «D►» on one and «M►» on the other.
 * A card that said «D►» on the manual tier would be naming a button that is
 * not on the screen it is being read on.
 */
export function gearUpWithBg(input: HintInput, transmission: TransmissionMode): string {
  if (input !== "touch") return "с клавиш ]";
  return transmission === "manual" ? "с „M►“" : "с „D►“";
}

/** …the same step as an imperative. */
export function gearUpActBg(input: HintInput, transmission: TransmissionMode): string {
  if (input !== "touch") return "щракни скоростния лост напред (клавиш ])";
  return transmission === "manual" ? "натисни „M►“" : "натисни „D►“";
}

/** One step back down the gate (towards P). Same cell in both gearboxes. */
export function gearDownWithBg(input: HintInput): string {
  return input === "touch" ? "с „◄P“" : "с клавиш [";
}

/** …as an imperative. */
export function gearDownActBg(input: HintInput): string {
  return input === "touch" ? "натисни „◄P“" : "щракни скоростния лост назад (клавиш [)";
}

/**
 * THE INSTRUMENT CLUSTER'S STALL LABEL — the one accessible name that has to
 * get somebody out of a dead car, so it is a whole authored sentence rather
 * than a phrase slotted into one.
 *
 * It says the CLUTCH conditionally („при ръчна кутия") instead of naming the
 * gearbox, because `DashboardStatus` does not carry the transmission and a
 * stall outlives the box it happened in (see `stuckStartHint`'s "stalled"
 * branch). Better a sentence true in both than a confident one wrong in one.
 * The locator is inside it: a screen-reader user cannot see the ⚙ strip either.
 */
export const STALL_RESTART_LABEL_BG: Record<HintInput, string> = {
  keyboard: "Двигателят угасна — рестартирай (Z + I)",
  touch: "Двигателят угасна — рестартирай с „ДВИГ“ в „Кола“ вдясно; при ръчна кутия задръж и „СЪЕД“",
};

/**
 * THE LEVER ITSELF, as a verb. „Щракни" is the desktop instruction and it is
 * WRONG on a phone twice over — there is no mouse, and the 3-D lever is not
 * what a thumb reaches for; the stepper cells are. Neutral on touch.
 */
export function leverActBg(input: HintInput): string {
  return input === "touch" ? "премести скоростния лост" : "щракни скоростния лост";
}
