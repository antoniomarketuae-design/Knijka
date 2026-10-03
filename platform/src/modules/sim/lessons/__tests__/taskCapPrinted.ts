/**
 * THE TASK CEILING, ROUND 14 — THE PRINTED NUMBERS, READ BACK (not a test file). R1-THEO4-ROUNDED-ENVELOPE answered as
 * a class: the round-13 card builder tested `v > env` and printed `Math.round(env)`, and the lane's own census restated
 * the same rounding, so expectation and product agreed on a false sentence («… с 42,8 км/ч … — и над 43 км/ч, които
 * дъждът оставя от знака 50»). This reader imports NOTHING of the card builders and none of their formatting: it reads
 * the sentence the student reads, parses every number back out of it as PRINTED (a decimal comma, any number of
 * decimals), and checks every comparison the sentence states between those printed numbers.
 *
 * The comparisons the speed cards of this product state, each «the measured speed is over N»:
 *   «над N км/ч» (the weather's envelope, the task's ceiling) · «над ограничението от знака N км/ч» · «при таван на
 *   задачата N км/ч» (the card of a bill over the cap) · «при разрешени N км/ч» (a speeding bill) · «при
 *   препоръчителни N км/ч от табелата» (a bend bill).
 * The measured speed is the number the card opens with («Отчетена скорост X км/ч» / «Мина точката на задачата с X
 * км/ч»). Anything the reader cannot parse is reported (`unparsed`), never passed: a matcher must report what it
 * cannot read.
 */

/** A printed number back to a number: «42,5» → 42.5, «119» → 119. */
export const printedNumber = (s: string): number => Number(s.replace(",", "."));

const HEAD = /^(?:Отчетена скорост|Мина точката на задачата с) (\d+(?:,\d+)?) км\/ч/;
const COMPARISONS: ReadonlyArray<[string, RegExp]> = [
  ["над N км/ч", /(?:—|,) (?:и )?над (\d+(?:,\d+)?) км\/ч/g],
  ["над ограничението от знака N", /над ограничението от знака (\d+(?:,\d+)?) км\/ч/g],
  ["над тавана на задачата N", /над тавана на задачата (\d+(?:,\d+)?) км\/ч/g],
  ["при таван на задачата N", /при таван на задачата (\d+(?:,\d+)?) км\/ч/g],
  ["при разрешени N", /при разрешени (\d+(?:,\d+)?) км\/ч/g],
  ["при препоръчителни N", /при препоръчителни (\d+(?:,\d+)?) км\/ч/g],
];

/** Does the card open with a measured speed this reader knows how to read? */
export const measuredOpening = (text: string): number | null => {
  const m = HEAD.exec(text);
  return m === null ? null : printedNumber(m[1]);
};

/**
 * THE OBJECTIVE'S OWN TWO SPEED TOASTS (round 14, R1 answered as a class — found by the grep the class asked for, not
 * by this reader: `lessons/engine.ts` printed `Math.round(speed)` beside a strict comparison, and 9 committed recorder
 * legs read «… не повече от 10 км/ч, а стигна дотук с 10 км/ч»). Each states the measured speed M against the task's
 * line N: «не повече от N км/ч, а стигна дотук с M км/ч» / «…, а върху точката вдигна скоростта до M км/ч» (M over N);
 * «с поне N км/ч, а мина с M км/ч» (M under N). «малко над N» / «малко под N» name the side and the line without a
 * second number. A toast that opens «Задачата иска» and prints a speed in a shape this reader does not know is reported.
 */
const OBJECTIVE_TOASTS: ReadonlyArray<[string, RegExp, "over" | "under"]> = [
  ["не повече от N …, а стигна дотук с M", /не повече от (\d+(?:,\d+)?) км\/ч, а (?:стигна дотук с|върху точката вдигна скоростта до) (малко над )?(\d+(?:,\d+)?) км\/ч/g, "over"],
  ["с поне N …, а мина с M", /с поне (\d+(?:,\d+)?) км\/ч, а мина с (малко под )?(\d+(?:,\d+)?) км\/ч/g, "under"],
];
export function falseObjectiveToastClaims(text: string): string[] {
  if (!text.startsWith("Задачата иска")) return [];
  const first = text.split(". ")[0];
  const bad: string[] = [];
  let recognised = 0;
  for (const [name, re, side] of OBJECTIVE_TOASTS) {
    for (const m of first.matchAll(re)) {
      recognised++;
      const line = printedNumber(m[1]);
      const v = printedNumber(m[3]);
      if (m[2] !== undefined) {
        if (v !== line) bad.push(`«${m[0]}» — «малко ${side === "over" ? "над" : "под"}» names ${m[3]}, the line is ${m[1]}`);
      } else if (side === "over" ? !(v > line) : !(v < line)) bad.push(`«${m[0]}» (${name}) — ${v} is not ${side === "over" ? "over" : "under"} ${line}`);
    }
  }
  if (recognised === 0 && /\d+(?:,\d+)? км\/ч/.test(first)) bad.push(`unparsed objective toast «${first}»`);
  return bad;
}

/**
 * Every comparison the card's FIRST SENTENCE states that does not hold between its printed numbers. A card with no
 * measured opening has nothing to check (the catalogue's explanation alone) — except the objective's own speed toasts
 * (`falseObjectiveToastClaims`). A number word this reader does not know («над» followed by something other than a
 * recognised phrase) inside a measured opening is reported as unparsed.
 */
export function falsePrintedClaims(text: string): string[] {
  const x = measuredOpening(text);
  if (x === null) return falseObjectiveToastClaims(text);
  const first = text.split(". ")[0];
  const bad: string[] = [];
  let recognised = 0;
  for (const [name, re] of COMPARISONS) {
    for (const m of first.matchAll(re)) {
      recognised++;
      const n = printedNumber(m[1]);
      if (!(x > n)) bad.push(`«${String(x).replace(".", ",")} … ${name.replace("N", m[1])}» — ${x} is not over ${n}`);
    }
  }
  // Every «над» in the opening must have been one of the recognised phrases.
  const overWords = [...first.matchAll(/над /g)].length;
  const overRecognised = [...first.matchAll(/над (?:ограничението от знака |тавана на задачата )?\d/g)].length;
  if (overWords !== overRecognised) bad.push(`unparsed «над» in «${first}»`);
  if (recognised === 0 && /\d/.test(first.replace(HEAD, ""))) bad.push(`unparsed numbers in «${first}»`);
  return bad;
}

/** The numbers a card prints in its opening, in order (for the census's coverage of decimals). */
export function printedNumbersOf(text: string): number[] {
  const first = text.split(". ")[0];
  return [...first.matchAll(/(\d+(?:,\d+)?) км\/ч/g)].map((m) => printedNumber(m[1]));
}
