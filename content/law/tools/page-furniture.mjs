/**
 * THE VENDOR WATERMARK, REMOVED IN THE EXTRACTION — and a refusal so a third
 * ingest cannot bring it back.
 *
 * WHAT WAS IN THE ACTS. Three of the наредби we hold were extracted from PDFs
 * served by sars.gov.bg and damtn.government.bg that were themselves printed
 * out of a commercial legal database. Every page carries the database's own
 * advertisement in the bottom
 * margin — „Източник: Правно-информационни системи „Сиела"" over „24/01/2025
 * г." — and `pdftotext` cannot tell a margin from a paragraph, so it emitted
 * the advertisement in reading order, at the page seam, inside whatever article
 * was open. 185 pieces of it shipped as statute text: 124 in Наредба № 38
 * across 34 units (including приложение № 5, the practical-exam marking scheme
 * quoted on every fault card the simulator prints), 58 in the Наредба № Iз-2539
 * snapshot across 16, and 3 in НСИПМК.
 *
 * WHY THAT IS NOT COSMETIC. In the Iз-2539 snapshot the seam falls INSIDE чл. 6,
 * ал. 1, т. 3 — „…трамвай или самоходна машина откаже да му" ⟨advertisement⟩
 * „бъде извършена проверка…". чл. 6, ал. 1 is the EXHAUSTIVE list of offences
 * that cost контролни точки, and the product proves a negative against it
 * („0 контролни точки — не е в изчерпателния списък"). A student who followed the
 * citation to check us met a list with a sentence cut in half and a vendor
 * advertisement in the gap.
 *
 * WHY A FILTER AND NOT A HAND EDIT. `textBg` is a verbatim slice of the
 * extracted text. Editing the JSON would fix the bytes and leave the tool that
 * regenerates them unchanged — which is precisely how this defect got a second
 * and a third act. So the removal happens HERE, before anything is split, and
 * `assertNoVendorPagination` refuses to emit an act that still carries any.
 *
 * WHAT THE REMOVAL IS ALLOWED TO DO, EXACTLY.
 *   · Delete the advertisement. Nothing else is deleted, ever.
 *   · Close the seam it opened. The advertisement arrived with a blank line on
 *     each side (pdftotext's paragraph separator), so simply dropping it would
 *     leave „…откаже да му" and „бъде извършена…" as two paragraphs — the
 *     sentence still broken, just no longer by an advertisement. When the seam
 *     is MID-SENTENCE the two halves are rejoined with one space; when the page
 *     turned at a paragraph boundary the paragraph boundary is kept. The test
 *     of „mid-sentence" is mechanical (see `isMidSentence`) and the result is
 *     verifiable against an independent witness: the rejoined чл. 6, т. 3 reads
 *     word for word like the same provision in the lex.bg consolidation, which
 *     was ingested from HTML and never had a page.
 *
 * Used by `build-corpus.mjs` (Наредба № Iз-2539, Наредба № 38) and
 * `build-speed-acts.mjs` (НСИПМК). `platform/src/lib/content/law/pageFurniture.test.ts`
 * asserts the property over every file in `content/law/acts/`, ingested by any
 * tool or none.
 */

/** „Източник: Правно-информационни системи „Сиела"" — the advertisement itself. */
const STAMP_SRC = String.raw`Източник:\s*Правно-информационни\s+системи\s*[«"„“”]\s*Сиела\s*[»"„“”]`;

/**
 * The snapshot date printed under it — „24/01/2025 г.".
 *
 * SLASHES AND „г." TOGETHER, and both halves are load-bearing. A Bulgarian
 * statute writes a date „24.01.2025 г." or „4 януари 2013 г.", never with
 * slashes — but Наредба № 38 cites two EU Official Journals, and the OJ
 * reference style DOES use them: „(ОВ L 321, 20/11/2012, стр. 54 - 58)" and
 * „(ОВ L 261, 03/19/2013, стр. 29)". Those are statute text. Requiring the „г."
 * that only a Bulgarian date carries is what tells the two apart, and the
 * negative control in `pageFurniture.test.ts` pins it.
 */
const DATE_SRC = String.raw`\d{2}/\d{2}/\d{4}\s*г\.`;

/** Whitespace including whole blank lines — what pdftotext puts around a page seam. */
const GAP = String.raw`[ \t]*(?:\r?\n[ \t]*)*`;

/** The stamp, with the date it carries when the extractor kept them together. */
const STAMP_BLOCK = new RegExp(`${GAP}${STAMP_SRC}(?:${GAP}${DATE_SRC})?${GAP}`, "g");

/**
 * A date the column order stranded away from its stamp. It happens twice, both
 * times in a wide table that pdftotext reads column-first: in the Iз-2539
 * snapshot приложение № 10 puts the date seven lines below its stamp, on a line
 * of its own; in НСИПМК one lands glued to a table cell („2 16/12/2024 г.").
 *
 * These are matched by VALUE, not by shape — only the exact date string this
 * document's stamps were already carrying is removed (see `stripVendorPagination`).
 * A slash-date this filter has not already seen 138 times in the same file is
 * left alone and then trips the refusal, which is the outcome we want.
 */
const loneDatePatterns = (date) => {
  const lit = date.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, String.raw`\s*`);
  return [
    // the whole line, and the newline that made it a line
    new RegExp(String.raw`\r?\n[ \t]*${lit}[ \t]*(?=\r?\n|$)`, "g"),
    // …or glued to a cell, in which case only the date goes
    new RegExp(String.raw`[ \t]*${lit}`, "g"),
  ];
};

/**
 * THE SIGNATURES, for the refusal. Same two patterns, unanchored, so that any
 * survivor — a form the removal did not anticipate — stops the build.
 */
export const VENDOR_PAGINATION_SIGNATURES = Object.freeze([
  Object.freeze([new RegExp(STAMP_SRC), "a legal-database vendor's source stamp"]),
  Object.freeze([new RegExp(DATE_SRC), "a PDF page footer's datestamp"]),
]);

/** A closing character: the fragment before the seam had finished a sentence. */
const TERMINAL = /[.;:!?»”"')\]]/;
/** The text after the seam continues the same sentence. */
const CONTINUES_SENTENCE = /^[а-яa-z]/;
/**
 * The text after the seam opens a unit of its own, so there is nothing to
 * rejoin even if the fragment before it looks unfinished.
 *
 * NOT `Раздел\b`. JavaScript's `\b` is ASCII-only, so after a Cyrillic letter
 * it needs an ASCII word character to fire and a following SPACE kills it — the
 * pattern would silently match nothing at all. Same trap `build-corpus.mjs`
 * documents on `isStructural` and `pageFurniture.test.ts` on „мнения"; the
 * whitespace is matched explicitly instead.
 */
const OPENS_A_UNIT = /^(?:Чл\.\s*\d|§\s*\d|Приложение\s+№|(?:Раздел|Глава)(?:\s|$))/;
/**
 * …and the mirror: the fragment before the seam IS a heading, complete on its
 * own line. Joining it to what follows would also destroy the newline that
 * `splitAnnexes` reads the „към чл. N" context out of.
 */
const IS_A_HEADING =
  /(?:^|\n)(?:Приложение\s+№\s*\d+[а-я]?\s+към\s+[^\n]*|(?:Раздел|Глава)(?:\s[^\n]*)?)$/;

/**
 * Did the page turn in the middle of a sentence?
 *
 * `before` and `after` are the surrounding text with the advertisement and all
 * of its whitespace already removed, so `before` ends and `after` begins on a
 * non-whitespace character.
 */
function isMidSentence(before, after) {
  if (before.length === 0 || after.length === 0) return false;
  if (OPENS_A_UNIT.test(after)) return false;
  if (IS_A_HEADING.test(before)) return false;
  if (!TERMINAL.test(before.slice(-1))) return true;
  return CONTINUES_SENTENCE.test(after.slice(0, 1));
}

/**
 * Remove every occurrence of the vendor's page furniture from an extracted
 * text, closing each seam it opened.
 *
 * Returns the cleaned text plus a report the caller prints, so a change in the
 * source PDF shows up as a changed count rather than as silence.
 */
export function stripVendorPagination(text, label = "text") {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const dates = new Set();
  let joined = 0;
  let kept = 0;
  let dropped = 0;

  let out = text.replace(STAMP_BLOCK, (match, offset) => {
    const date = match.match(new RegExp(DATE_SRC));
    if (date !== null) dates.add(date[0].replace(/\s+/g, " "));
    const before = text.slice(0, offset);
    const after = text.slice(offset + match.length);
    if (before.length === 0 || after.length === 0) {
      dropped += 1;
      return "";
    }
    if (isMidSentence(before, after)) {
      joined += 1;
      return " ";
    }
    kept += 1;
    return eol + eol;
  });

  /**
   * ONE SNAPSHOT DATE PER DOCUMENT. Every date removed came off the same print
   * run, so they are all the same string. If a second one ever appears, the
   * pattern has caught something that is not this footer and the build must
   * stop rather than delete it.
   */
  if (dates.size > 1) {
    throw new Error(
      `${label}: removed ${dates.size} DIFFERENT slash-dates (${[...dates].join(", ")}) — ` +
        `a vendor footer prints one date per run, so at least one of these is not the footer. ` +
        `Refusing to delete text this filter does not understand.`,
    );
  }

  // Whatever the column order stranded, matched by the value we just measured.
  let lone = 0;
  const [wholeLine, glued] = dates.size === 1 ? loneDatePatterns([...dates][0]) : [null, null];
  if (wholeLine !== null) {
    out = out.replace(wholeLine, () => (lone += 1, ""));
    out = out.replace(glued, () => (lone += 1, ""));
  }

  const removed = joined + kept + dropped + lone;

  for (const [re, what] of VENDOR_PAGINATION_SIGNATURES) {
    const survivors = out.match(new RegExp(re.source, "g"));
    if (survivors !== null) {
      throw new Error(
        `${label}: ${survivors.length} occurrence(s) of ${what} survived the filter — ` +
          `the footer has a shape this tool does not handle. Fix the pattern; do not edit the JSON.`,
      );
    }
  }

  return {
    text: out,
    report: { removed, joined, paragraphKept: kept, atEdge: dropped, loneDate: lone, date: [...dates][0] ?? null },
  };
}

/**
 * THE REFUSAL. Scan the units an ingest is about to write and throw rather than
 * emit an act with an advertisement inside a sentence.
 */
export function assertNoVendorPagination(units, actId) {
  const dirty = [];
  for (const unit of units) {
    for (const [re, what] of VENDOR_PAGINATION_SIGNATURES) {
      const m = re.exec(unit.textBg);
      if (m === null) continue;
      const at = Math.max(0, m.index - 30);
      dirty.push(
        `  ${unit.ref}: ${what}\n      …${unit.textBg.slice(at, at + 110).replace(/\n/g, " ⏎ ")}…`,
      );
    }
  }
  if (dirty.length > 0) {
    throw new Error(
      `${actId}: page furniture in ${dirty.length} place(s) — refusing to emit an act that ` +
        `would hand a student a vendor advertisement as law:\n${dirty.join("\n")}`,
    );
  }
}
