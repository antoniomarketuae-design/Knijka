/**
 * THE ONE PLACE THE LEV IS TURNED INTO THE EURO.
 *
 * Bulgaria adopted the euro on 2026-01-01 at the irrevocably fixed rate
 * 1 EUR = 1.95583 BGN, and the dual-circulation window closed that January. A
 * seventeen-year-old cannot pay a глоба in лева: the електронен фиш that lands
 * in the letterbox is denominated in euro, and the product already settles in
 * euro (`modules/payments/packs.ts`, currency decision 2026-07-07).
 *
 * THE ACTS, HOWEVER, STILL SAY „лв." — every one of them, in the sentence the
 * citation quotes. So the two figures must travel together, and in this order:
 *
 *     51,13 € (100 лв. по текста на закона)
 *
 * The euro first, because that is what he pays; the lev kept, because dropping
 * it would break the promise a citation makes — that the quoted sentence and
 * the number beside it say the same thing. Corroborated by the founder's own
 * електронен фиш: 100 лв. under ЗДвП чл. 182, ал. 1, т. 3, billed at 51,13 EUR.
 *
 * WHY IT LIVES IN lib/ AND NOT IN THE MODULE THAT NEEDED IT FIRST. Two surfaces
 * quote money at a student — the law layer's `describeFine` and the simulator's
 * fault card — and they were rendering different currencies for the same
 * offence: EUR on the five structured codes, лв. on the forty authored ones.
 * One rate, one formatter, one policy, imported by both. This file is pure
 * arithmetic on purpose: `lib/content/law` is server-only (node:fs) and
 * `modules/sim/rules` is client code, so anything they share must be neither.
 */

/** The irrevocably fixed conversion rate, 1 EUR = 1.95583 BGN. */
export const BGN_PER_EUR = 1.95583;

/** Euro cents for a лв. amount written in an act. Rounded to the cent. */
export function eurCentsFromBgn(amountBgn: number): number {
  return Math.round((amountBgn * 100) / BGN_PER_EUR);
}

/** „5113" → „51,13 €" (Bulgarian decimal comma). */
export function formatEur(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const frac = String(Math.abs(cents % 100)).padStart(2, "0");
  return `${whole},${frac} €`;
}

/** „100" → „51,13 € (100 лв.)" — the euro he pays, the lev the act names. */
export function bgnWithEurBg(amountBgn: number, levSuffixBg = "лв."): string {
  return `${formatEur(eurCentsFromBgn(amountBgn))} (${formatBgnAmount(amountBgn)} ${levSuffixBg})`;
}

/** „300" → „300"; „51.5" → „51,5". Renders the lev exactly as an act writes it. */
function formatBgnAmount(amountBgn: number): string {
  return Number.isInteger(amountBgn) ? String(amountBgn) : String(amountBgn).replace(".", ",");
}

/**
 * Spans of `text` that are VERBATIM QUOTATIONS of an act („…“) and therefore
 * may not be edited. Rewriting a currency inside one would turn a quotation
 * into a paraphrase while it still wears quotation marks — the precise defect
 * the whole citation layer exists to prevent, and
 * `rules/__tests__/catalog-consequences.test.ts` re-cuts those fragments out of
 * the statute on every run, so an edit there would also fail the build.
 */
function quotedSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const re = /„[^“]*“?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) spans.push({ start: m.index, end: m.index + m[0].length });
  return spans;
}

/**
 * Put the euro beside every лв. figure in AUTHORED PROSE, leaving quotations of
 * the act untouched.
 *
 *   „…се наказва с глоба в размер 300 лв."
 *     → „…се наказва с глоба в размер 153,39 € (300 лв.)"
 *
 * Three refusals, each one a way this could lie:
 *  - inside „…“ — the act's own words, see `quotedSpans`;
 *  - where a „€" already stands right beside the figure, on either side — the
 *    sentence has been written in both currencies by hand („51,13 € (100 лв.)")
 *    and must not be doubled. The window is deliberately narrow so a euro
 *    mentioned earlier in a long sentence does not suppress a later лв.;
 *  - „лв." that is part of a larger token (a locator, a compound) — the regex
 *    requires the abbreviation to end the word.
 */
export function withEurBg(text: string): string {
  const skip = quotedSpans(text);
  const inQuote = (i: number): boolean => skip.some((s) => i >= s.start && i < s.end);
  return text.replace(/(\d+(?:[.,]\d+)?)\s*лв\.?(?![а-яА-Я])/g, (whole, amount: string, offset: number) => {
    if (inQuote(offset)) return whole;
    const neighbourhood = text.slice(Math.max(0, offset - 12), offset + whole.length + 24);
    if (neighbourhood.includes("€")) return whole;
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return whole;
    return bgnWithEurBg(value);
  });
}
