/**
 * THE SOUND CONTROL'S VOCABULARY — the second row in the ⚙ sheet to carry a
 * trade line, and it is here for the same reason the first one is.
 *
 * Nine w10 rows, seven lessons: „no evidence of audio anywhere, and no way to
 * control it". The mix was never the problem — `scene/simAudio.ts` is live on
 * every lesson (built at `LessonScene.tsx:1589`, fed per frame by
 * `VehicleRig.tsx:620`). What was missing is the CONTROL, and it was reachable
 * only from a keyboard key, i.e. not at all on the six mobile `07b-menu.png`
 * frames. The whole diagnosis is on `scene/simAudioMuteStore.ts`; this file is
 * only the words.
 *
 * WHAT THIS ROW DOES NOT CLOSE, because the verifier proved it does not: those
 * rows each name volume AND mute AND a state indicator, and this ships mute
 * only. And the чл. 91 siren the two sc-vu-emergency rows are about has the
 * oscillators but never fires on those frames — no emergency actor is spawned,
 * so `sirenM` stays `Infinity` (the store's header has the trace). One noun of
 * three, on rows that stay open.
 *
 * WHY THE COPY LIVES IN ITS OWN FILE AND NOT AT THE JSX CALL SITE. Exactly
 * `qualityChoice.ts`'s argument, which applies here harder. Under THEO-4
 * (founder-ratified: no bare verdicts, the student is owed the reasoning) a
 * setting that changes the experience SILENTLY is the same defect one layer out
 * — and silence is the one setting in this product that changes what the
 * student LEARNS. Doc 82 §4.4: a muted session teaches a systematically FASTER
 * car than the student will really drive (~3.2 km/h of over-production;
 * ~10 % in visual-only sims), because audio is about half of speed perception.
 * A student is free to choose it; he may not be allowed to choose it without
 * being told. So the sentence is a product requirement, gets a pure function
 * and a unit test, and «Звук изкл.» never ships as a bare state word.
 *
 * THE SAME 70-CHARACTER CEILING, AND IT IS THE SAME COLUMN. `qualityChoice.ts`
 * measured it: the compact sheet is 240 px wide (`w-60`), less 12 px of sheet
 * padding and 20 px of row padding, leaves 208 px; two lines of 10 px type is
 * what `PlayMenuRow`'s `gap-0.5 py-1.5` branch budgets, and a third line costs
 * 12.5 px of menu height the sheet does not have on the tightest profile in the
 * ladder (galaxy-gesturebar-portrait, 8 px of clearance over the indicator
 * arc). The ceiling is restated here rather than imported so that a future edit
 * to either row cannot silently spend the other's line — and `soundChoice.
 * test.ts` holds both strings to it.
 */

/**
 * The right-hand state word of the row.
 *
 * «вкл.»/«изкл.» rather than a speaker glyph struck through: the sheet's other
 * two toggles («Съветник», «Карта») already say вкл./изкл., and a row that
 * states its state in a different register is a row the student has to stop and
 * decode. `AudioLessonPrompt` keeps the glyph — it is a one-shot notice with no
 * neighbours to agree with.
 */
export function soundValueBg(muted: boolean): string {
  return muted ? "изкл." : "вкл.";
}

/**
 * THE TRADE, IN WORDS — the line under the row.
 *
 * Both states name the same fact from the side the student is standing on,
 * because the fact is what the row exists to deliver: sound is not decoration,
 * it is half of how fast the car feels. The muted line is the one that also
 * names the way back, for `qualityTradeBg`'s reason — it is the only choice
 * that can make the lesson teach the wrong thing.
 *
 * NO NUMBERS. „~3.2 km/h of over-production" is the evidence and it belongs in
 * the header above; the reader is seventeen and mid-lesson, and the sentence
 * has to be actionable at a glance.
 */
export function soundHintBg(muted: boolean): string {
  return muted
    ? "Без звук ще караш по-бързо, отколкото усещаш. Включи го."
    : "Двигателят и гумите носят половината от усещането за скорост.";
}

/** The longest trade line may not wrap past two lines — see the header. */
export const SOUND_HINT_MAX_CHARS = 70;

/**
 * The accessible name of the row: the label, the state and the trade in one
 * string, because a screen-reader user gets the value and the caption as
 * separate unlabelled spans otherwise. `qualityAriaLabelBg`'s shape exactly.
 */
export function soundAriaLabelBg(muted: boolean): string {
  return `Звук на симулатора: ${soundValueBg(muted)}. ${soundHintBg(muted)} Натисни, за да смениш.`;
}
