/**
 * NO ACT IN THE CORPUS DIRECTORY MAY CONTAIN A WEB PAGE.
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
];

/**
 * THE SECOND KIND OF FURNITURE — PRINT, NOT WEB. Same defect class, different
 * source document, and it is the one that survived the first pass because every
 * signature above was written from the lex.bg incident.
 *
 * `content/law/acts/naredba-iz-2539.json` came out of a PDF through
 * `pdftotext -nopgbrk`. The flag suppresses the form feeds, not what is PRINTED
 * on the page: the вендор's footer, „Източник: Правно-информационни системи
 * „Сиела"" over „24/01/2025 г.", is body text as far as the extractor is
 * concerned, so it was appended to whichever article was open when the page
 * turned. It sits inside 16 of that act's 40 units — and in чл. 6 it lands
 * MID-SENTENCE, splitting т. 3 („…откаже да му" ⟨footer⟩ „бъде извършена
 * проверка…"). That article is the exhaustive list of offences that cost
 * контролни точки, and until this wave it was the citation printed behind every
 * „0 контролни точки" verdict in the simulator. A student who followed the chip
 * to check us met a statute with a vendor advertisement inside a sentence.
 *
 * Two signatures, both measured in the shipped bytes; neither can occur in the
 * text of a Bulgarian statute. A statute writes dates „24.01.2025 г.", with
 * dots — the slashes are the footer's own format.
 */
const PAGINATION: ReadonlyArray<readonly [RegExp, string]> = [
  [/Източник:\s*Правно-информационни\s+системи/, "a legal-database vendor's source stamp"],
  [/^\s*\d{2}\/\d{2}\/\d{4}\s*г\.\s*$/m, "a PDF page footer's datestamp, alone on its line"],
];

/**
 * THE DEBT, MEASURED — not a permission slip.
 *
 * Three acts carry this today and NONE of them can be cleaned from here. The
 * `textBg` of every unit is a verbatim slice produced by
 * `content/law/tools/build-corpus.mjs` out of `iz2539.txt` / `naredba38.txt`,
 * and those inputs are gitignored scratch: hand-editing the JSON would fix the
 * bytes while leaving the tool that regenerates them unchanged, which is how a
 * defect comes back a third time. Worse, deleting the footer out of чл. 6 would
 * silently JOIN the two halves of т. 3 and remove the only visible evidence
 * that the page ever broke there.
 *
 * So the ledger is EXACT and it is asserted by equality in BOTH directions. A
 * new act, a new unit or one more occurrence fails — that is the guard the next
 * ingest runs into. A unit that has been CLEANED fails too, and that is
 * deliberate: a frozen inventory that silently tolerates improvement stops
 * being a measurement of anything.
 *
 * THE FIX BELONGS IN THE EXTRACTION: drop a line matching either signature
 * before `splitByRegex`/`splitAnnexes` ever see it, then re-run
 * `build-corpus.mjs` and re-cut every quote. That is a content-lane change with
 * its own gate (every `quoteBg` in `penalties.json`, `n38.ts` and
 * `consequences.ts` is re-verified against the rebuilt files), not a test edit.
 */
const KNOWN_PAGINATION: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  // 34 units, 124 occurrences. Наредба № 38 is the examiner's marking scheme —
  // приложение № 5 is quoted on every fault card the simulator prints — so this
  // is the loudest of the three and the one worth re-ingesting first.
  "naredba-38": {
    "чл. 2": 2, "чл. 7": 2, "чл. 8": 2, "чл. 11": 2, "чл. 12": 2, "чл. 13": 2, "чл. 15": 8,
    "чл. 17": 2, "чл. 19": 2, "чл. 22": 2, "чл. 24": 2, "чл. 25": 2, "чл. 26": 2, "чл. 29": 2,
    "чл. 29а": 2, "чл. 34": 2, "чл. 35а": 2, "чл. 36": 2, "чл. 39": 2, "чл. 40": 2, "чл. 42": 2,
    "чл. 47": 2, "чл. 48а": 2, "чл. 53а": 2, "чл. 55а": 2, "чл. 58": 2, "чл. 59": 38,
    "приложение № 2": 2, "приложение № 2а": 2, "приложение № 3а": 2, "приложение № 5": 2,
    "приложение № 6": 2, "приложение № 7": 14, "приложение № 8": 4,
  },
  // 16 units, 58 occurrences. The 28.01.2025 photograph. No citation in the
  // product points here any more (`citation-version.test.ts` holds that line);
  // the act is kept so a superseded figure can be quoted and named.
  "naredba-iz-2539": {
    "чл. 2": 2, "чл. 6": 4, "чл. 8": 2, "чл. 9": 2, "чл. 10": 2, "чл. 15": 2, "чл. 18": 2,
    "чл. 26": 2, "чл. 30": 22, "приложение № 1": 4, "приложение № 3": 2, "приложение № 5": 2,
    "приложение № 7": 2, "приложение № 8": 2, "приложение № 9": 2, "приложение № 10": 4,
  },
  // 3 units, 3 occurrences — the camera-tolerance chain's second delegation.
  "naredba-sredstva-za-izmervane": {
    "чл. 418": 1, "чл. 423": 1, "чл. 430": 1,
  },
};

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
    // Everything except the three the specimen does not contain. Asserted by
    // NAME, not by count: a count hides which signature went dead, and one of
    // them had (the Cyrillic `\b` above).
    expect(missed).toEqual([
      "an ISO date on its own line",
      "a newsletter box",
      "raw HTML",
      "a bare URL",
    ]);
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
            `will run again (content/medical/tools/build-naredba-24.mjs).`,
    ).toBe(0);
  });

  it("no unit carries a vendor page footer that is not in the measured ledger", () => {
    /** Count every pagination signature in a unit, the same way the ledger was built. */
    const countIn = (text: string): number => {
      let n = 0;
      for (const [re] of PAGINATION) {
        const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
        n += (text.match(global) ?? []).length;
      }
      return n;
    };

    const measured: Record<string, Record<string, number>> = {};
    for (const file of actFiles()) {
      const act = JSON.parse(fs.readFileSync(file, "utf8")) as ActFile;
      for (const unit of act.units) {
        const n = countIn(unit.textBg);
        if (n === 0) continue;
        (measured[act.actId] ??= {})[unit.ref] = n;
      }
    }

    expect(
      measured,
      "Vendor page furniture in content/law/acts has MOVED.\n" +
        "  · a NEW act / unit / higher count = an ingest put a page footer inside statute text.\n" +
        "    Fix `content/law/tools/build-corpus.mjs` (drop the line before splitting), re-run it,\n" +
        "    and re-cut every quote — do NOT hand-edit the JSON, and do NOT widen this ledger.\n" +
        "  · a unit that is now CLEAN = the re-ingest happened. Delete its row (and, when an act\n" +
        "    reaches zero, promote its signatures into FURNITURE above, where the rule is absolute).",
    ).toEqual(KNOWN_PAGINATION);
  });

  it("the pagination signatures can fire — negative control", () => {
    const specimen =
      "3. когато водач на моторно превозно средство откаже да му\n\n" +
      'Източник: Правно-информационни системи "Сиела"\n\n24/01/2025 г.\n\nбъде извършена проверка';
    const missed = PAGINATION.filter(([re]) => !re.test(specimen)).map(([, what]) => what);
    expect(missed).toEqual([]);
    // …and they do NOT fire on a statute's own date format, which uses dots.
    const statute = "Обн. ДВ, бр. 1 от 4 януари 2013 г., изм. ДВ, бр. 108 от 27.12.2024 г.";
    expect(PAGINATION.filter(([re]) => re.test(statute))).toEqual([]);
  });

  it("the footer really is inside a sentence, not appended after one", () => {
    // The specific damage the ledger is holding, pinned rather than described:
    // чл. 6, т. 3 of the snapshot is one sentence with a vendor advertisement
    // in the middle of it. This is why the citation behind „0 контролни точки"
    // had to move, and why deleting the footer here would hide the seam.
    const act = JSON.parse(
      fs.readFileSync(path.join(ACTS_DIR, "naredba-iz-2539.json"), "utf8"),
    ) as ActFile;
    const art6 = act.units.find((u) => u.ref === "чл. 6");
    expect(art6).toBeDefined();
    const flat = art6!.textBg.replace(/\s+/g, " ");
    expect(flat).toContain('откаже да му Източник: Правно-информационни системи "Сиела" 24/01/2025 г. бъде извършена проверка');
    // The consolidated text — the one every citation now points at — is whole.
    const current = JSON.parse(
      fs.readFileSync(path.join(ACTS_DIR, "naredba-iz-2539-consolidated-dv49-2026.json"), "utf8"),
    ) as ActFile;
    const currentArt6 = current.units.find((u) => u.ref === "чл. 6");
    expect(currentArt6!.textBg).not.toMatch(/Източник:/);
    expect(currentArt6!.textBg.replace(/\s+/g, " ")).toContain("откаже да му бъде извършена проверка");
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
