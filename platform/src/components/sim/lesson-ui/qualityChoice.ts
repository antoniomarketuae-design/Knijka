/**
 * THE QUALITY CONTROL'S VOCABULARY — doc 91 §I26(c).
 *
 * His complaint, verbatim: *"if the frame rate is bad he still has to leave the
 * session to change anything."* Until this file the lesson menu was
 * `Съветник · Въпроси · Карта · Изход от цял екран · Завърши сесията ·
 * ← Всички уроци` — no quality entry anywhere, so a student whose phone is
 * drowning had exactly one move: abandon the lesson.
 *
 * WHY THE COPY LIVES IN ITS OWN FILE AND NOT IN THE COMPONENT. Under THEO-4
 * (founder-ratified: no bare verdicts, the student is owed the reasoning) a
 * setting that changes the experience SILENTLY is the same defect one layer
 * out. So the sentence a student reads before the tier changes is a product
 * requirement, not a label — and a product requirement gets a pure function and
 * a unit test (`qualityChoice.test.ts`), not a string interpolated at a JSX
 * call site where nothing can check it.
 *
 * WHAT EACH LINE HAS TO DO, and this is the whole brief for the copy:
 *   · name what the tier BUYS (otherwise "Високо" is a bare verdict), and
 *   · name what it COSTS (otherwise a student who picks «Високо» and drops to
 *     20 fps was never told that was the trade), and
 *   · fit two lines of 10 px type in a 208 px column — MEASURED, not guessed:
 *     the compact sheet is 240 px wide (`w-60`), less 12 px of sheet padding
 *     and 20 px of row padding. A third line costs 12.5 px of menu height, and
 *     the menu has 8 px of clearance over the indicator arc on the tightest
 *     profile in the ladder (galaxy-gesturebar-portrait). Every string below is
 *     ≤ 70 characters for that reason. See `LessonPlayShell`'s PlayMenu.
 */

import type { QualityPreset } from "./types";

/**
 * What the student can choose, including handing the choice back.
 *
 * `auto` is not a fourth tier — it is the ABSENCE of a choice, which is what
 * the store has always meant by "nothing persisted" (`loadQualityPreset()`
 * falls back to `seedQualityLevel()`). Naming it makes the auto-probe's lane
 * visible instead of implicit: with `auto` selected the device's own measured
 * ledger decides the tier at the next cold start (`useAutoQualityProbe` →
 * `QualityLedger` → `seedQualityLevel`), and the moment the student picks a
 * tier by hand that ledger stops deciding anything for them. Without an `auto`
 * row the control would be a one-way door: one press and the probe is overruled
 * forever, with no way back and nothing on screen saying so.
 */
export type QualitySelection = QualityPreset | "auto";

/**
 * The cycle order of the one menu row.
 *
 * ONE ROW, NOT FOUR. The compact sheet is 240 px wide and the menu already
 * stands on the top rail in portrait (doc 91 §I11: 3 of 10 controls dead with
 * an expanded panel up). A radio group of four is four rows or an unreadable
 * 52 px-per-pill strip; a cycling row is the shape «Въпроси» already uses in
 * this same sheet, so it costs one row and teaches nothing new.
 *
 * `auto` FIRST because it is the default and the resting state — a student who
 * cycles all the way round comes home to it rather than to a tier they were
 * never asked about.
 */
export const QUALITY_CYCLE: readonly QualitySelection[] = ["auto", "low", "medium", "high"];

/** The next selection when the row is pressed. */
export function nextQualitySelection(current: QualitySelection): QualitySelection {
  const i = QUALITY_CYCLE.indexOf(current);
  return QUALITY_CYCLE[(i + 1) % QUALITY_CYCLE.length];
}

/** The tier word, on its own. */
export function qualityLevelLabelBg(preset: QualityPreset): string {
  switch (preset) {
    case "low":
      return "Ниско";
    case "medium":
      return "Средно";
    case "high":
      return "Високо";
  }
}

/**
 * The right-hand state word of the row.
 *
 * On `auto` it names BOTH facts — that nothing was chosen, and what that
 * currently resolves to — because "Авто" alone would hide the only number the
 * student actually cares about while their phone is stuttering.
 */
export function qualityValueBg(
  selection: QualitySelection,
  effective: QualityPreset,
): string {
  return selection === "auto"
    ? `Авто · ${qualityLevelLabelBg(effective)}`
    : qualityLevelLabelBg(selection);
}

/**
 * THE TRADE, IN WORDS — the line under the row, and the reason this control is
 * not just a switch.
 *
 * Each line names the gain and the price in the same breath. «Високо» is the
 * one that matters most and it is the only one that names a way back, because
 * it is the only choice that can make the session worse than it was.
 *
 * NO NUMBERS. "dpr 3" and "9× the fragments" are true and they are what the
 * engineering ruling is about, but the reader is seventeen and mid-lesson; the
 * sentence has to be actionable at a glance. What a student needs to know is
 * that sharper costs frames and how to undo it.
 */
export function qualityTradeBg(
  selection: QualitySelection,
  effective: QualityPreset,
): string {
  if (selection === "auto") {
    return `Приложението избира според телефона ти. Сега: ${qualityLevelLabelBg(effective)}.`;
  }
  switch (selection) {
    case "low":
      return "Най-плавното. Без сенки и отблясъци, по-мека картина.";
    case "medium":
      return "Сенки, отблясъци и по-плътни текстури. По-натоварващо.";
    case "high":
      return "Пълна резолюция + всички ефекти. Най-рязко, но и най-тежко.";
  }
}

/** The longest trade line may not wrap past two lines — see the header. */
export const QUALITY_TRADE_MAX_CHARS = 70;

/**
 * The accessible name of the row: the label, the state, and the trade in one
 * string, because a screen-reader user gets the value and the caption as
 * separate unlabelled spans otherwise.
 */
export function qualityAriaLabelBg(
  selection: QualitySelection,
  effective: QualityPreset,
): string {
  return `Качество на картината: ${qualityValueBg(selection, effective)}. ${qualityTradeBg(
    selection,
    effective,
  )} Натисни, за да смениш.`;
}
