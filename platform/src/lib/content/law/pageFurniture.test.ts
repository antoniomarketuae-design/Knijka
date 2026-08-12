/**
 * NO ACT IN THE CORPUS DIRECTORY MAY CONTAIN ANYTHING BUT THE ACT — not the web
 * page it was scraped from, and not the margin of the page it was printed on.
 *
 * WHAT HAPPENED, TWICE, FROM TWO DIFFERENT KINDS OF SOURCE. The web incident is
 * below; the print one is documented on the last two signatures. Both are the
 * same defect: an extractor cannot tell the document from its container, so the
 * container arrived as statute text and `LawActSchema` could not object,
 * because a forum post and an advertisement are both valid strings.
 *
 * WHAT HAPPENED. `content/law/acts/naredba-24.json` was ingested from lex.bg by
 * flattening the whole PAGE to lines and walking them. The site's top
 * navigation never leaked, because it arrives before the first unit exists to
 * append to. Its SIDEBAR did — 980 characters of it, 9.9% of the act's 9,854 —
 * straight into `приложение № 2 към чл. 12`: news headlines datestamped
 * 04.08.2026, three forum threads with reply counts, a „Хумор" section, a
 * newsletter box and the copyright line. The annex is REPEALED, so it has no
 * body of its own to stop the walk, and the walk kept going to the end of the
 * document.
 *
 * WHY IT WAS INERT AND WHY THAT IS NOT A DEFENCE. `naredba-24` is not in
 * `ACT_IDS`, so the corpus never loads it and no citation resolves against it —
 * nothing reached a student. But `content/law/README.md` asks the next person
 * to wire it in, which is one line, and the moment it is,
 * `getArticle("naredba-24", "приложение № 2")` hands a seventeen-year-old a
 * lex.bg forum post. `LawActSchema` cannot help: a forum post is a valid
 * string. The defect is real today and only its blast radius is pending.
 *
 * WHY THIS TEST READS THE DIRECTORY AND NOT THE CORPUS. `getLawCorpus()` loads
 * exactly the three acts in `ACT_IDS`, i.e. exactly the acts whose ingest has
 * already been trusted. Reading the corpus would have shown a clean tree while
 * the defective file sat next to it, which is the same trap this repo has now
 * found eight times: THE CHECK MUST NOT BE SCOPED BY THE THING IT IS CHECKING.
 * So the scan is over the FILES, and the acts pending ingest are the ones it
 * exists for.
 *
 * The signatures are not a style rule. Each one below was present in the bytes
 * that shipped, and none of them can occur in the text of a Bulgarian statute.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ACTS_DIR = path.resolve(process.cwd(), "..", "content", "law", "acts");

/** [pattern, what a reader would be looking at] */
const FURNITURE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}/, "a news datestamp (dd.mm.yyyy hh:mm)"],
  [/^\d{4}-\d{2}-\d{2}$/m, "an ISO date on its own line"],
  // NOT `\bмнения\b`. JavaScript's `\b` is ASCII-only, so on a Cyrillic word it
  // never fires — the signature matched nothing at all and the scan reported a
  // clean tree. The negative control below is the only reason that is known.
  [/(?<![А-Яа-яA-Za-z])мнения(?![А-Яа-яA-Za-z])/, "a forum thread's reply count"],
  [/Посети форума|Виж всички|Отписване/, "a sidebar call to action"],
  [/Lex\.bg|политика за поверителност|общи условия/, "a site footer"],
  [/^Хумор$/m, "a „Хумор“ section"],
  [/информационен e-mail бюлетин/, "a newsletter box"],
  [/<\/?(?:div|span|script|a|p|li|ul)\b/i, "raw HTML"],
  [/\bhttps?:\/\/\S/, "a bare URL"],

  /**
   * THE SECOND KIND OF FURNITURE — PRINT, NOT WEB. Same defect class, different
   * source document, and it survived the first pass because every signature
   * above was written from the lex.bg incident.
   *
   * Three наредби came out of PDFs through `pdftotext -nopgbrk`. The flag
   * suppresses the form feeds, not what is PRINTED on the page: the vendor's
   * footer, „Източник: Правно-информационни системи „Сиела"" over „24/01/2025
   * г.", is body text as far as the extractor is concerned, so it was appended
   * to whichever article was open when the page turned. 185 pieces of it
   * shipped — 124 in Наредба № 38 across 34 units, 58 in the Наредба № Iз-2539
   * snapshot across 16, 3 in НСИПМК — and in чл. 6 of the snapshot it landed
   * MID-SENTENCE, splitting т. 3 („…откаже да му" ⟨footer⟩ „бъде извършена
   * проверка…"). That article is the exhaustive list of offences that cost
   * контролни точки, and „0 контролни точки, не е в изчерпателния списък" is a
   * claim about a list being COMPLETE.
   *
   * These two rows were a frozen ledger of that debt until 2026-08-09, when
   * `content/law/tools/page-furniture.mjs` took the removal into the extraction
   * and `build-corpus.mjs` / `build-speed-acts.mjs` were re-run against
   * re-fetched originals whose sha256 still match `sources.json`. All three acts
   * are at zero, so the ledger is gone and the rule is absolute, which is what
   * the ledger's own instructions asked for.
   *
   * WHY THE DATE SIGNATURE INSISTS ON „г.". A Bulgarian statute writes a date
   * „24.01.2025 г." with dots — the slashes are the footer's own format. But
   * Наредба № 38 cites two EU Official Journals and the OJ style DOES use
   * slashes: „(ОВ L 321, 20/11/2012, стр. 54 - 58)". Those two are the only
   * slash-dates left in the corpus and they are statute text. The „г." only a
   * Bulgarian date carries is what tells them apart; the negative control below
   * pins both directions.
   */
  [/Източник:\s*Правно-информационни\s+системи/, "a legal-database vendor's source stamp"],
  [/\d{2}\/\d{2}\/\d{4}\s*г\./, "a PDF page footer's datestamp"],
];

interface ActUnit {
  ref: string;
  textBg: string;
}
interface ActFile {
  actId: string;
  units: ActUnit[];
}

function actFiles(): string[] {
  return fs
    .readdirSync(ACTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(ACTS_DIR, f));
}

describe("content/law/acts — statutes, not web pages", () => {
  it("the scan actually sees the acts (a probe over an empty directory passes everything)", () => {
    const files = actFiles();
    expect(files.length).toBeGreaterThanOrEqual(4);
    const units = files.flatMap(
      (f) => (JSON.parse(fs.readFileSync(f, "utf8")) as ActFile).units,
    );
    expect(units.length).toBeGreaterThan(300);
    expect(units.every((u) => typeof u.textBg === "string")).toBe(true);
    // The file this test was written for must be in scope even though it is
    // deliberately absent from ACT_IDS.
    expect(files.some((f) => f.endsWith("naredba-24.json"))).toBe(true);
  });

  it("the signatures can fire — negative control", () => {
    const specimen =
      "Приложение № 2 към чл. 12\n(Отм. - ДВ, бр. 114 от 2025 г.)\nНовини\n" +
      "Отново гавра с правото и така до безкрай!\n04.08.2026 06:45\nФорум\n" +
      "от danail7 на 02.08 13:10 1 мнения\nПосети форума\nХумор\n© Lex.bg";
    const missed = FURNITURE.filter(([re]) => !re.test(specimen)).map(([, what]) => what);
    // Everything except the ones this specimen does not contain. Asserted by
    // NAME, not by count: a count hides which signature went dead, and one of
    // them had (the Cyrillic `\b` above).
    expect(missed).toEqual([
      "an ISO date on its own line",
      "a newsletter box",
      "raw HTML",
      "a bare URL",
      "a legal-database vendor's source stamp",
      "a PDF page footer's datestamp",
    ]);
  });

  it("the print signatures can fire, and only on print furniture — negative control", () => {
    // The specimen is the exact damage that shipped: чл. 6, т. 3 of the
    // Iз-2539 snapshot, one sentence with an advertisement inside it.
    const specimen =
      "3. когато водач на моторно превозно средство откаже да му\n\n" +
      'Източник: Правно-информационни системи "Сиела"\n\n24/01/2025 г.\n\nбъде извършена проверка';
    const print = FURNITURE.filter(([, what]) => what.startsWith("a legal-database") || what.startsWith("a PDF page"));
    expect(print.length).toBe(2);
    expect(print.filter(([re]) => !re.test(specimen))).toEqual([]);

    // …and NOT on a statute's own date format, which uses dots.
    const statuteDate = "Обн. ДВ, бр. 1 от 4 януари 2013 г., изм. ДВ, бр. 108 от 27.12.2024 г.";
    // …nor on an EU Official Journal reference, which uses slashes and is the
    // reason the datestamp signature has to insist on „г.". Both of these are
    // real text in `naredba-38.json` — the only slash-dates left in the corpus.
    const officialJournal =
      "(ОВ L 321, 20/11/2012, стр. 54 - 58) и Директива 2013/47/ЕС … (ОВ L 261, 03/19/2013, стр. 29).";
    for (const text of [statuteDate, officialJournal]) {
      expect(
        FURNITURE.filter(([re]) => re.test(text)).map(([, what]) => what),
        text,
      ).toEqual([]);
    }
  });

  it("no unit of any act carries page furniture", () => {
    const problems: string[] = [];
    for (const file of actFiles()) {
      const act = JSON.parse(fs.readFileSync(file, "utf8")) as ActFile;
      for (const unit of act.units) {
        for (const [re, what] of FURNITURE) {
          const m = re.exec(unit.textBg);
          if (m === null) continue;
          const at = Math.max(0, (m.index ?? 0) - 20);
          problems.push(
            `  ${act.actId} · ${unit.ref}: ${what}\n` +
              `      …${unit.textBg.slice(at, at + 90).replace(/\n/g, " ⏎ ")}…`,
          );
        }
      }
    }
    expect(
      problems.length,
      problems.length === 0
        ? ""
        : `${problems.length} unit(s) in content/law/acts contain page furniture ` +
            `rather than statute text:\n${problems.join("\n")}\n\n` +
            `Fix the EXTRACTION, not the JSON — the ingest tool is the thing that ` +
            `will run again (content/law/tools/page-furniture.mjs owns the print ` +
            `signatures, content/medical/tools/build-naredba-24.mjs the web ones).`,
    ).toBe(0);
  });

  it("the sentence the page footer cut in half is whole again", () => {
    // WHAT THIS PINS. чл. 6, ал. 1 of Наредба № Iз-2539 is the exhaustive list
    // of offences that cost контролни точки, and т. 3 of it — refusing a breath
    // test — used to read „…откаже да му" ⟨advertisement⟩ „бъде извършена
    // проверка…". The product proves a negative against this list, so a hole in
    // it is not cosmetic. The removal is only trustworthy if the two halves
    // came back together as ONE sentence, which is why this is asserted against
    // the wording rather than against the absence of the footer.
    const snapshot = JSON.parse(
      fs.readFileSync(path.join(ACTS_DIR, "naredba-iz-2539.json"), "utf8"),
    ) as ActFile;
    const art6 = snapshot.units.find((u) => u.ref === "чл. 6");
    expect(art6).toBeDefined();
    const flat = art6!.textBg.replace(/\s+/g, " ");
    expect(flat).toContain("откаже да му бъде извършена проверка с техническо средство");
    expect(flat).not.toContain("Източник");

    // AND ALL 22 ITEMS ARE THERE. The seam is what made т. 3 unreachable; this
    // counts the list rather than trusting the sentence.
    const items = new Set(
      [...flat.matchAll(/(?:^|[;\s])(\d{1,2})\.\s(?=[а-яa-z(])/g)].map((m) => Number(m[1])),
    );
    const missing = Array.from({ length: 22 }, (_, i) => i + 1).filter((n) => !items.has(n));
    expect(missing, `чл. 6, ал. 1 is missing item(s) ${missing.join(", ")}`).toEqual([]);

    // THE INDEPENDENT WITNESS. The consolidation was ingested from lex.bg HTML
    // and never had a page, so it never had a page footer. Its т. 3 reads the
    // same across the join — which is what makes the rejoin a reconstruction of
    // the source and not a guess about it.
    const current = JSON.parse(
      fs.readFileSync(path.join(ACTS_DIR, "naredba-iz-2539-consolidated-dv49-2026.json"), "utf8"),
    ) as ActFile;
    const currentArt6 = current.units.find((u) => u.ref === "чл. 6");
    expect(currentArt6!.textBg.replace(/\s+/g, " ")).toContain(
      "откаже да му бъде извършена проверка с техническо средство",
    );
  });

  it("the repealed annex that carried it is now just its repeal note", () => {
    // The specific regression, pinned by size as well as by content: the annex
    // was 1,062 characters, of which 980 were the website.
    const act = JSON.parse(
      fs.readFileSync(path.join(ACTS_DIR, "naredba-24.json"), "utf8"),
    ) as ActFile;
    const annex = act.units.find((u) => u.ref.startsWith("приложение № 2"));
    expect(annex).toBeDefined();
    expect(annex!.textBg).toMatch(/^Приложение № 2 към чл\. 12\n\(Отм\./);
    expect(annex!.textBg.length).toBeLessThan(120);

    // And the article all 23 references actually point at is untouched.
    const art9 = act.units.find((u) => u.ref === "чл. 9");
    expect(art9).toBeDefined();
    expect(art9!.textBg).toContain("Обучението за оказване на първа долекарска помощ включва");
  });
});
