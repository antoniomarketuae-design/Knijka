/**
 * WHAT A `lawRef` IS AN ANSWER TO — the slot boundary, guarded.
 *
 * `catalog.test.ts` checks a row's points against its own declared class.
 * `naredba-38-classification.test.ts` checks that class against Наредба № 38.
 * `consequences.test.ts` re-cuts every road figure out of the acts. None of
 * them ever looked at what the CITATION claims — and the citation was the
 * founder's complaint: „−10 т." with the chip „ЗДвП чл. 21", an article that
 * holds a table of speed limits and not one word about points, penalties or
 * опасни грешки. Nothing here could have caught it, because there was no rule
 * saying what the field is for. All 53 rows had one citation slot and it was
 * read as the source of whatever number sat beside it.
 *
 * There are now three questions and three slots:
 *
 *   lawRef                    WHAT RULE DID I BREAK        (catalog.ts)
 *   examMarkFor().citationBg  WHERE DO THE POINTS COME FROM (consequences.ts)
 *   realWorldBg / realWorldRefs  WHAT IT COSTS ON THE STREET (catalog.ts prose,
 *                             served through roadConsequenceFor)
 *
 * This file guards the FIRST slot and the boundary around it. The figures in
 * the third are re-cut from `content/law/acts/zdvp.json` here as well, because
 * `consequences.test.ts` grounds its own structured entries and the authored
 * prose is a second surface with the same ADR-002 duty — the „50 метра" a
 * previous wave invented and shipped approved is what both are guarding.
 *
 * THE PROBE IS UNDER TEST TOO: a verbatim checker that matches nothing passes
 * everything, so the negative controls feed it a fabricated fine and a
 * plausible paraphrase and require it to reject both.
 */

import { describe, expect, it } from "vitest";
import { resolveLawRef } from "@/lib/content/law";
import { VIOLATIONS } from "../catalog";
import { examMarkFor } from "../consequences";
import { parseRuleLawRef } from "../lawRef";
import type { ViolationCode } from "../types";

const CODES = Object.keys(VIOLATIONS).sort() as ViolationCode[];

/**
 * Comparison form for a verbatim check. Quote glyphs and whitespace are
 * TYPOGRAPHY — the act's text uses straight quotes and hard line wraps where
 * our copy uses „…“ — so they are normalised away. Words are not.
 */
const cmp = (s: string): string =>
  s
    .replace(/[„“”"«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** The act text behind one citation string, or null when it does not resolve. */
function unitTextFor(citation: string): string | null {
  const parsed = parseRuleLawRef(citation);
  if (parsed === null) return null;
  const found = resolveLawRef({ act: parsed.act, ref: parsed.ref });
  return found.found ? found.unit.textBg : null;
}

// ---------------------------------------------------------------------------
// Slot 1 — the rule broken, and what may not hide inside it
// ---------------------------------------------------------------------------

describe("lawRef is the rule broken, not the price list", () => {
  /**
   * The only two codes whose fault breaks nothing in ЗДвП or ППЗДвП: hesitating
   * on a green (there is no duty to move off — чл. 22, ал. 1 bans obstructing
   * while MOVING) and standing too close in a stopped queue (чл. 23, ал. 1
   * speaks of „движещото се пред него" and this detector arms only at v ≈ 0).
   * For these the exam ordinance IS the rule, and saying so teaches something
   * true: it costs a point on the sheet and nothing on the street.
   */
  const NAREDBA_ONLY: readonly ViolationCode[] = ["HESITATION_AT_GREEN", "STANDSTILL_GAP_TOO_CLOSE"];

  it("only the two exam-sheet-only faults cite Наредба № 38 as the rule", () => {
    const citing = CODES.filter((c) => VIOLATIONS[c].lawRef.includes("Наредба № 38"));
    expect(citing.sort()).toEqual([...NAREDBA_ONLY].sort());
  });

  it("…and they cite it in the canonical clause form, never a free-text gloss", () => {
    // Seven rows carried parentheticals like „Наредба № 38 (второстепенни грешки
    // — загасване на двигателя)" and „Наредба № 38 (рязко спиране — предпоставка
    // за ПТП)". приложение № 5 enumerates NOTHING under б. „а" and б. „б" —
    // both are single-sentence definitions — so every one of those lists was
    // invented. A наредба reference in this slot must be exactly the string the
    // exam-mark layer produces, so the two can never disagree.
    for (const code of NAREDBA_ONLY) {
      expect(VIOLATIONS[code].lawRef, code).toBe(examMarkFor(code).citationBg);
    }
    for (const code of CODES) {
      expect(VIOLATIONS[code].lawRef, code).not.toMatch(/Наредба № 38\s*\(/);
    }
  });

  it("no lawRef quotes the ten-point clause while charging less", () => {
    // „създаде предпоставка за допускане на ПТП" is case 5 of б. „в" — the
    // 10-point clause. HARSH_BRAKING_NO_CAUSE cited it while billing 3: the
    // wrong price and the wrong law in one string.
    for (const code of CODES) {
      if (/предпоставка за (допускане на )?ПТП/.test(VIOLATIONS[code].lawRef)) {
        expect(VIOLATIONS[code].severityClass, code).toBe("opasna");
      }
    }
  });

  it("no lawRef cites an article range — a range resolves to its first member only", () => {
    // „ЗДвП чл. 51–53" and „ЗДвП чл. 42–43" both resolved to чл. 51 / чл. 42 in
    // every checker in this repo, so two thirds of each citation was decoration.
    // Name the alineas, or name fewer articles.
    for (const code of CODES) {
      expect(VIOLATIONS[code].lawRef, code).not.toMatch(/чл\.\s*\d+\s*[–—-]\s*\d/);
    }
  });

  it("the exam-mark citation always names приложение № 5, т. 10 and resolves", () => {
    // The join this file cares about: whatever the rule-broken slot says, the
    // POINTS slot must always be able to answer „and where did the number come
    // from" with a unit the corpus can open.
    for (const code of CODES) {
      const mark = examMarkFor(code);
      expect(mark.citationBg, code).toContain("приложение № 5, т. 10");
      expect(unitTextFor(mark.citationBg), code).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Slot 3 — the authored street price, re-cut from the act on every run
// ---------------------------------------------------------------------------

describe("realWorldBg — every figure is retrieved, never recalled (ADR-002)", () => {
  const withConsequence = CODES.filter((c) => VIOLATIONS[c].realWorldBg !== undefined);

  it("the field and its citations travel together", () => {
    for (const code of CODES) {
      const spec = VIOLATIONS[code];
      expect(spec.realWorldBg === undefined, code).toBe(spec.realWorldRefs === undefined);
      if (spec.realWorldRefs !== undefined) {
        expect(spec.realWorldRefs.length, code).toBeGreaterThan(0);
      }
    }
  });

  it("every cited penalty article resolves in the corpus", () => {
    for (const code of withConsequence) {
      for (const ref of VIOLATIONS[code].realWorldRefs ?? []) {
        expect(unitTextFor(ref), `${code} → ${ref}`).not.toBeNull();
      }
    }
  });

  it("every лв amount occurs verbatim in one of the articles the row cites", () => {
    const misses: string[] = [];
    for (const code of withConsequence) {
      const texts = (VIOLATIONS[code].realWorldRefs ?? []).map((r) => cmp(unitTextFor(r) ?? ""));
      for (const m of VIOLATIONS[code].realWorldBg!.matchAll(/(\d+)\s*лв/g)) {
        const needle = `${m[1]} лв`;
        if (!texts.some((t) => t.includes(needle))) misses.push(`${code}: ${needle}`);
      }
    }
    expect(misses, misses.join("\n")).toEqual([]);
  });

  it("every лишаване duration occurs verbatim in one of those articles", () => {
    const misses: string[] = [];
    for (const code of withConsequence) {
      const texts = (VIOLATIONS[code].realWorldRefs ?? []).map((r) => cmp(unitTextFor(r) ?? ""));
      for (const m of VIOLATIONS[code].realWorldBg!.matchAll(
        /(един|два|три|четири|шест|\d+)\s+(месец|месеца)/g,
      )) {
        if (!texts.some((t) => t.includes(m[0]))) misses.push(`${code}: ${m[0]}`);
      }
    }
    expect(misses, misses.join("\n")).toEqual([]);
  });

  it("every quoted phrase is the act's own wording", () => {
    // The half that catches a plausible paraphrase, and it earned its keep: six
    // rows shipped „причини пътнотранспортно произшествие, ако деянието не
    // съставлява престъпление" as one quote when чл. 179, ал. 2 puts „, се
    // наказва с глоба в размер 300 лв.," between the halves. A quote in „…“ is
    // a promise that the law says exactly that; an ellipsis inside it splits the
    // promise into fragments, each of which must still be verbatim.
    const misses: string[] = [];
    for (const code of withConsequence) {
      const texts = (VIOLATIONS[code].realWorldRefs ?? []).map((r) => cmp(unitTextFor(r) ?? ""));
      for (const q of VIOLATIONS[code].realWorldBg!.matchAll(/„(.+?)“/g)) {
        for (const raw of q[1].split("…")) {
          const frag = cmp(raw).replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "");
          if (frag.length < 20) continue;
          if (!texts.some((t) => t.includes(frag))) misses.push(`${code}: ${frag}`);
        }
      }
    }
    expect(misses, misses.join("\n")).toEqual([]);
  });

  it("the checker can fail — negative controls", () => {
    const art183 = cmp(unitTextFor("ЗДвП чл. 183, ал. 4") ?? "");
    expect(art183.length).toBeGreaterThan(500);
    // A fine that is in the article…
    expect(art183.includes("100 лв")).toBe(true);
    // …and one that is not. 137 лв is the shape of an invented figure: plausible,
    // specific, absent.
    expect(art183.includes("137 лв")).toBe(false);
    // A phrase the article really carries, and a paraphrase it does not.
    expect(art183.includes("не спазва предимството на друг участник в движението")).toBe(true);
    expect(art183.includes("не пропуска участник с предимство")).toBe(false);
    // An act the corpus cannot open, and an article that does not exist.
    expect(unitTextFor("ППЗДвП чл. 31")).toBeNull();
    expect(unitTextFor("ЗДвП чл. 9999")).toBeNull();
  });

  it("the 16 rows with no street price are the ones we could not retrieve — or could not yet PRICE", () => {
    // PINNED BY NAME so adding a fine is a reviewed act and removing one is
    // visible. Each absence has a reason, written at the row:
    //  - CONTROLLER_SIGNAL_VIOLATED — no penalty article names the регулировчик
    //    on the DRIVER side (чл. 184 is the pedestrian article; чл. 179, ал. 1,
    //    т. 5 reaches signs, markings and „другите средства за сигнализиране",
    //    which a person is not). The residual чл. 185 may apply, but asserting
    //    it means asserting nothing else does — a judgement, not a retrieval.
    //    The most uncomfortable gap on the list: a 10-point code.
    //  - PEDESTRIAN_CROSSING_TOO_FAST — чл. 183, ал. 5, т. 2 prices „не осигури
    //    предимство"; this code fires on the APPROACH, before that is failed.
    //  - TURN_WITHOUT_OBSERVATION — чл. 183, ал. 4, т. 14 prices „неправилно се
    //    престроява"; a turn is not престрояване.
    //  - STOP_LINE_OVERSHOOT — the car stopped, so „преминава при сигнал" is not
    //    established.
    //  - JUNCTION_SCAN_INCOMPLETE / HARSH_BRAKING_NO_CAUSE — nothing prices a
    //    scan or a causeless brake until it produces a consequence, and that
    //    consequence is a different code.
    //  - ENGINE_STALLED / HANDBRAKE_LEFT_ON / HESITATION_AT_GREEN /
    //    STANDSTILL_GAP_TOO_CLOSE / PREDRIVE_STEP_SKIPPED / PREDRIVE_WRONG_ORDER
    //    — exam-sheet faults that are no road offence at all. Empty here is the
    //    correct and teachable answer.
    //  - DRIVING_TOO_SLOW_FOR_MOTORWAY — чл. 22, ал. 1 bans obstructing at low
    //    speed, but no penalty article names it.
    //  - DRIVING_TOO_SLOW_IN_TOWN (2026-09-01) — 14 → 15, and it is the SAME
    //    absence as the row above, on the town half of the same envelope: the
    //    duty was retrieved (чл. 22, ал. 1 and ал. 2, both quoted in the
    //    structured `ROAD_CONSEQUENCES` entry), and ЗДвП still prices nothing
    //    for it. The row is `conditional` with an empty `branches`, exactly like
    //    its sibling, so the honest answer reaches the student as a sentence
    //    („цената се плаща от колоната зад теб") rather than as a лв. figure
    //    nobody could cut out of an act.
    //  - STOPPED_WITHOUT_CAUSE (2026-09-01) — 15 → 16, and the THIRD absence of
    //    the same family, one step further down the envelope: the duty was
    //    retrieved (чл. 24, ал. 2, quoted verbatim in the structured
    //    `ROAD_CONSEQUENCES` entry) and ЗДвП prices nothing for it. It prices
    //    stopping where a SIGN forbids it — В27, which is
    //    ILLEGAL_STOP_IN_BAN_ZONE's own row and its own act — and nothing at all
    //    for stopping where stopping is merely pointless. Borrowing the В27
    //    figure would charge one code with another code's offence, which is the
    //    exact conflation the 2026-08-09 sweep that built this file removed.
    //  - OFF_CARRIAGEWAY (2026-08-30) — THE ONE ABSENCE ON THIS LIST THAT IS NOT
    //    A FAILED RETRIEVAL, which is why the title of this case now says „or
    //    could not yet PRICE". The article was found: чл. 183, ал. 2, т. 2,
    //    50 лв., „нарушава правилата за разположение на пътно превозно средство
    //    върху платното за движение" — the very provision NOT_KEEPING_RIGHT, the
    //    other half of the same чл. 15, ал. 1, is already charged under. It is
    //    not printed because that точка is a SHARED cluster (`offences.ts`
    //    SEPARATE_ACTS already holds NOT_KEEPING_RIGHT + CROSSED_SOLID_LINE
    //    under it), and `offences.test.ts` „leaves no catalogued code invisible
    //    to every census" refuses a bare authored лв. sentence for exactly that
    //    reason — it caught this row on its first run. Joining the cluster needs
    //    a structured ROAD_CONSEQUENCES entry plus a double-billing ruling in
    //    two files the lane that added the code does not own. The ruling it
    //    should inherit is written at the catalogue row: SEPARATE, because this
    //    code arms only on `edgeId === null` and NOT_KEEPING_RIGHT needs the car
    //    ON the carriageway, so the two cannot describe one act.
    expect(CODES.filter((c) => VIOLATIONS[c].realWorldBg === undefined)).toEqual([
      "CONTROLLER_SIGNAL_VIOLATED",
      "DRIVING_TOO_SLOW_FOR_MOTORWAY",
      "DRIVING_TOO_SLOW_IN_TOWN",
      "ENGINE_STALLED",
      "HANDBRAKE_LEFT_ON",
      "HARSH_BRAKING_NO_CAUSE",
      "HESITATION_AT_GREEN",
      "JUNCTION_SCAN_INCOMPLETE",
      "OFF_CARRIAGEWAY",
      "PEDESTRIAN_CROSSING_TOO_FAST",
      "PREDRIVE_STEP_SKIPPED",
      "PREDRIVE_WRONG_ORDER",
      "STANDSTILL_GAP_TOO_CLOSE",
      "STOPPED_WITHOUT_CAUSE",
      "STOP_LINE_OVERSHOOT",
      "TURN_WITHOUT_OBSERVATION",
    ]);
  });

  it("every ten-point code tells the student what it costs outside the exam", () => {
    // The rows where the gap hurt most: an опасна грешка is the one a student
    // will meet again on the street after the examiner is gone. Two are exempt
    // above with written reasons; the rest must carry a figure.
    const silent = CODES.filter(
      (c) => VIOLATIONS[c].severityClass === "opasna" && VIOLATIONS[c].realWorldBg === undefined,
    );
    expect(silent).toEqual(["CONTROLLER_SIGNAL_VIOLATED", "PEDESTRIAN_CROSSING_TOO_FAST"]);
  });
});
