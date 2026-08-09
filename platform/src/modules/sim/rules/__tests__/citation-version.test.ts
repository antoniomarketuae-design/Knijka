/**
 * WHICH TEXT OF НАРЕДБА № Iз-2539 A CHIP SENDS THE STUDENT TO.
 *
 * THE DEFECT, FIRST TIME. The fault card's speeding ladder showed „18 к.т." on
 * the „над 40 km/h" rung and offered the chip „Наредба № Iз-2539, чл. 6, ал. 1,
 * т. 12". The figure is real and is cut from the text consolidated through ДВ,
 * бр. 49 от 2026 г. The CHIP was a bare act name, and `lib/content/law/corpus.ts`
 * resolved a bare „Наредба № Iз-2539" to the 28.01.2025 SARS snapshot. That
 * snapshot's т. 12 reads „с над 50 км/час по чл. 182, ал. 1, т. 6". A student
 * who followed the citation found a sentence that does not cover the row it was
 * attached to: the product contradicting itself in the one place it was trying
 * to be verifiable.
 *
 * THE DEFECT, SECOND TIME — the same fault with a worse blast radius. Five more
 * bare citations stayed behind: the licence budget (39 / 26) and, worst,
 * `CP_LIST_HEADER`, the citation printed behind EVERY „0 контролни точки"
 * verdict on the card. „Не е в изчерпателния списък" is a claim about a
 * document being COMPLETE, and the copy it pointed at is not: 16 of the
 * snapshot's 40 units carry „Източник: Правно-информационни системи „Сиела" /
 * 24/01/2025 г." — a PDF page footer — inside their statute text, and in чл. 6
 * it lands mid-sentence in т. 3. The verdict was right. The evidence link was
 * not, and a negative is only as good as the copy of the list you prove it
 * against.
 *
 * WHAT THE FIX HAD TO BE, AND WHY IT IS NOT „REMEMBER TO NAME THE AMENDMENT".
 * Repointing five quotes fixes five quotes. The MECHANISM is that a bare act
 * name now means the text in force — the snapshot answers only to a citation
 * that says 2025 — plus the invariant below, which is checked in ONE direction
 * fewer than before because one bidirectional rule replaced two one-way ones:
 *
 *     for every quote on the card,
 *         actIdForActName(the chip the student reads)
 *       ≡ the act file the quote was cut from.
 *
 * Nothing can drift past that. A chip naming the wrong edition fails. A quote
 * moved to a different file without touching the chip fails. A bare name on a
 * quote cut from the snapshot fails, because a bare name no longer lands there.
 *
 * The alias table is read out of `corpus.ts` rather than restated, for the same
 * reason `freeze-question-citations.mjs` lifts it: two copies of a regex that
 * must agree do not stay agreed, and this one glues a Latin „i" to a Cyrillic
 * „з".
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { actIdForActName, isSupersededSnapshot, normaliseForMatch, SNAPSHOT_ACT_IDS } from "@/lib/content/law";
import { allLawQuotes } from "../consequences";

const ACTS_DIR = path.resolve(process.cwd(), "..", "content", "law", "acts");
const SNAPSHOT = "naredba-iz-2539.json";
const CONSOLIDATED = "naredba-iz-2539-consolidated-dv49-2026.json";

const readAct = (file: string): { actId: string; abbrBg: string; units: Array<{ ref: string; textBg: string }> } =>
  JSON.parse(fs.readFileSync(path.join(ACTS_DIR, file), "utf8"));

const unitText = (file: string, ref: string): string => {
  const unit = readAct(file).units.find((u) => u.ref === ref);
  return unit === undefined ? "" : normaliseForMatch(unit.textBg);
};

/** `actFile` is a filename; the corpus speaks in actIds. One hop, read off disk. */
const actIdOfFile = (file: string): string => readAct(file).actId;

/** Every quote on the card that touches Наредба № Iз-2539, in either edition. */
const iz2539Quotes = () =>
  allLawQuotes().filter((q) => q.actFile === SNAPSHOT || q.actFile === CONSOLIDATED);

describe("Наредба № Iз-2539 — the citation says which text", () => {
  it("the two editions really do disagree (otherwise this file guards nothing)", () => {
    expect(unitText(SNAPSHOT, "чл. 6")).toContain("- 8 контролни точки");
    expect(unitText(CONSOLIDATED, "чл. 6")).toContain("- 10 контролни точки");
    expect(unitText(SNAPSHOT, "чл. 6")).toContain("с над 50 км/час по чл. 182, ал. 1, т. 6");
    expect(unitText(CONSOLIDATED, "чл. 6")).toContain(
      "за превишаване на разрешената скорост по чл. 182, ал. 1, т. 5 и 6",
    );
  });

  it("the card cites at least one of them (the probe is not vacuous)", () => {
    expect(iz2539Quotes().length).toBeGreaterThan(0);
  });

  it("the chip a student reads resolves to the exact file the quote was cut from", () => {
    // SCOPED TO THE ACTS WE HOLD MORE THAN ONE EDITION OF — derived, not typed:
    // a snapshot and whatever replaced it. Those are the only quotes where the
    // chip can name the wrong TEXT while naming the right ARTICLE, and the only
    // aliases that match on a substring. „ЗДвП" is anchored `^здвп$`, so
    // feeding it a whole chip („ЗДвП чл. 182, ал. 1, т. 3") resolves to null by
    // design; asserting over those would be testing the anchor, not the edition.
    const wrong: string[] = [];
    for (const q of iz2539Quotes()) {
      const resolved = actIdForActName(q.citationBg);
      const expected = actIdOfFile(q.actFile);
      if (resolved !== expected) {
        wrong.push(`„${q.citationBg}" is cut from ${expected} but resolves to ${resolved ?? "NOTHING"}`);
      }
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("the direction check can fail — negative control", () => {
    // A bare chip beside a snapshot quote is the exact shape that shipped.
    expect(actIdForActName("Наредба № Iз-2539, чл. 6, ал. 1")).not.toBe(actIdOfFile(SNAPSHOT));
    // …and a 2025 chip beside a consolidation quote is the same fault mirrored.
    expect(actIdForActName("Наредба № Iз-2539 (ред. 28.01.2025 г.), чл. 6, ал. 1")).not.toBe(
      actIdOfFile(CONSOLIDATED),
    );
  });

  it("every quote on the card is verbatim in the file its citation resolves to", () => {
    for (const q of iz2539Quotes()) {
      expect(unitText(q.actFile, q.unitRef), q.citationBg).toContain(normaliseForMatch(q.quoteBg));
    }
  });

  it("nothing on the card is cut from a superseded snapshot at all", () => {
    // Not a stronger version of the rule above — a different one. The card may
    // legitimately quote a snapshot ONE day, to show a student a figure that
    // has been replaced; when that day comes this expectation is what forces
    // the decision to be made out loud instead of arrived at by a stale chip.
    const fromSnapshot = allLawQuotes()
      .filter((q) => isSupersededSnapshot(actIdOfFile(q.actFile)))
      .map((q) => q.citationBg);
    expect(fromSnapshot, fromSnapshot.join("\n")).toEqual([]);
  });
});

describe("a bare act name never lands on a superseded snapshot", () => {
  it("there is a snapshot to guard (the list is not empty)", () => {
    expect(SNAPSHOT_ACT_IDS.length).toBeGreaterThan(0);
    expect([...SNAPSHOT_ACT_IDS]).toContain("naredba-iz-2539");
  });

  /**
   * GENERIC OVER THE CORPUS, not a hand-written list of strings. The bare forms
   * are derived from the snapshot act's OWN `abbrBg` — strip a parenthetical,
   * strip a trailing „/YYYY" — so the next superseded pair someone adds is
   * covered on the day it is added, with no second list to remember.
   */
  it("no bare form of a snapshot's own name resolves to the snapshot", () => {
    const bad: string[] = [];
    for (const file of fs.readdirSync(ACTS_DIR).filter((f) => f.endsWith(".json"))) {
      const act = readAct(file);
      if (!isSupersededSnapshot(act.actId)) continue;
      const bare = new Set([
        act.abbrBg,
        act.abbrBg.replace(/\s*\([^)]*\)\s*$/, "").trim(),
        act.abbrBg.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*\/\s*\d{4}\s*$/, "").trim(),
      ]);
      for (const name of bare) {
        const landed = actIdForActName(name);
        if (landed !== null && isSupersededSnapshot(landed)) {
          bad.push(`„${name}" (a bare name) resolves to the snapshot ${landed}`);
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("the bare name means the text in force, and only 2025 reaches the photograph", () => {
    // The trap itself, asserted from both ends. The first line is the one that
    // used to read `.toBe("naredba-iz-2539")` — that was the defect, pinned.
    expect(actIdForActName("Наредба № Iз-2539, чл. 6, ал. 1, т. 12")).toBe(
      "naredba-iz-2539-consolidated-dv49-2026",
    );
    expect(actIdForActName("Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.), чл. 6, ал. 1, т. 12")).toBe(
      "naredba-iz-2539-consolidated-dv49-2026",
    );
    // …and the snapshot is still REACHABLE, or the superseded figure it is kept
    // for could not be quoted at all. Saying 2025 out loud is the whole cost.
    for (const explicit of [
      "Наредба № Iз-2539 (ред. 28.01.2025 г.), чл. 6, ал. 1, т. 1, б. „а“",
      "Наредба № Iз-2539 (редакция към 2025 г.), чл. 6",
      "Наредба № Iз-2539 (изм. ДВ, бр. 108 от 2024 г.), чл. 6",
      "Наредба № Iз-2539 (снимка 28.01.2025), чл. 2",
    ]) {
      expect(actIdForActName(explicit), explicit).toBe("naredba-iz-2539");
    }
  });

  it("the snapshot really is the only way to read the superseded figure", () => {
    // Why the file is kept, stated as a measurement rather than as a comment.
    expect(unitText(SNAPSHOT, "чл. 6")).toContain(
      "над 0,5 на хиляда до 0,8 на хиляда включително (чл. 174, ал. 1, т. 1 от ЗДвП) - 8 контролни точки;",
    );
    expect(unitText(CONSOLIDATED, "чл. 6")).not.toContain("(чл. 174, ал. 1, т. 1 от ЗДвП) - 8 контролни точки;");
  });
});
