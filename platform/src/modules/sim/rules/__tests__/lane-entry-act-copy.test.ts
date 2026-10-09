/**
 * THE CARD OF A RETURN THAT MADE THE OVERTAKEN VEHICLE BRAKE HARD — every
 * sentence pinned, every citation retrieved (sc-ac-wind-truck-pass:ff1d4290
 * round 2; the discipline of `lane-entry-copy-pins.test.ts`, one act over).
 *
 * WHY THE ACT HAS ITS OWN ROW. LANE_ENTRY_FORCED_BRAKING is billed on two
 * bases since round 2 (`rules/types.ts`, the `laneEntryAnswer` event). The
 * pooled card is written for the first — the lane-drop cut-in — and two of its
 * sentences are false or wrong advice on the second:
 *   · «…след нормалната секунда за реакция водачът ѝ трябва да спира рязко, за
 *     да не те удари» is what an entry DEMANDS of a vehicle that is catching
 *     him. A student who has just overtaken a slower truck is drawing away from
 *     it; nothing has to brake so as not to hit him.
 *   · «…пусни я да мине и влез в пролуката ЗАД нея» tells a driver who has
 *     just finished overtaking to drop back behind the vehicle he passed.
 * This file fails if the act's row is removed (the pooled card would then
 * print on the act), if a sentence of it changes without this pin changing in
 * the same diff, or if a citation in it is not the provision the bank holds.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { actCopy, LANE_ENTRY_ACT_COPY, makeViolation, PER_ACT_COPY, violationCorrectiveBg, violationPeekBg, VIOLATIONS } from "../catalog";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const zdvp = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8")) as {
  units: { ref: string; textBg: string }[];
};

/**
 * Find the ONE provision of ЗДвП whose text contains `phrase` and name it the
 * way the product cites it — „чл. N, ал. M[, т. K]" from the bank's own
 * numbering (the retrieval of `lane-entry-copy-pins.test.ts`, verbatim). Null
 * when the bank has no such text or has it more than once.
 */
function retrieve(phrase: string): { cite: string; text: string } | null {
  const hits = zdvp.units.filter((u) => u.textBg.includes(phrase));
  if (hits.length !== 1) return null;
  const u = hits[0]!;
  const at = u.textBg.indexOf(phrase);
  if (u.textBg.indexOf(phrase, at + 1) >= 0) return null;
  const before = u.textBg.slice(0, at);
  const paras = [...before.matchAll(/(^|\n|Чл\. \d+[а-я]*\. )\((\d+)\) /g)];
  let cite = u.ref;
  let from = 0;
  if (paras.length > 0) {
    const p = paras[paras.length - 1]!;
    cite += `, ал. ${p[2]}`;
    from = (p.index ?? 0) + p[0].length;
  }
  const points = [...before.slice(from).matchAll(/\n(\d+)\. /g)];
  let textFrom = from;
  if (points.length > 0) {
    const q = points[points.length - 1]!;
    cite += `, т. ${q[1]}`;
    textFrom = from + (q.index ?? 0) + q[0].length;
  }
  const end = u.textBg.indexOf("\n", at + phrase.length);
  return { cite, text: u.textBg.slice(textFrom, end < 0 ? undefined : end) };
}
const citationsIn = (text: string): string[] =>
  [...text.matchAll(/[Чч]л\. \d+(?:, ал\. \d+)?(?:, т\. \d+)?/g)].map((m) => m[0].replace(/^Ч/, "ч"));

// The two duties the card states — RETRIEVED by their own words.
const YIELD_TO_LANE = retrieve("навлизане изцяло или частично в съседна пътна лента");
const NOT_FORCE_TO_SLOW = retrieve("без да го принуждава да намалява скоростта");

/** The text as reviewed. Changing a word of copy that grades a student is a
 *  decision; making it means changing this pin in the same diff. */
const REVIEWED = {
  titleBg: "Прибиране твърде близо пред изпреварения",
  explanationBg:
    "Влезе в лентата толкова близо пред превозно средство, което вече се движеше по нея, че водачът му трябваше да спира рязко заради теб. Който навлиза в съседна лента, пропуска движещите се по нея (чл. 25, ал. 2), а който изпреварва, заема място пред изпреварения, без да го принуждава да намалява скоростта (чл. 42, ал. 1, т. 2). Мигачът обявява прибирането, но не отваря място.",
  peekBg: "Накара го да спира рязко.",
  correctiveBg:
    "След изпреварване остани в лентата за изпреварване, докато видиш в огледалото ЦЯЛОТО превозно средство, което задмина — чак тогава десен мигач и плавно надясно. Вижда ли се само част от него или още е до теб, рано е: продължи напред. Мигачът обявява, но не отваря място.",
} as const;

describe("the retrieval works, and can fail", () => {
  it("both duties are found exactly once, and each says what the card relies on", () => {
    expect(YIELD_TO_LANE?.cite).toBe("чл. 25, ал. 2");
    expect(YIELD_TO_LANE!.text).toContain("водачът е длъжен да пропусне пътните превозни средства, които се движат по нея");
    expect(NOT_FORCE_TO_SLOW?.cite).toBe("чл. 42, ал. 1, т. 2");
    expect(NOT_FORCE_TO_SLOW!.text).toContain("може да заеме място в пътната лента пред изпреварваното пътно превозно средство");
    expect(retrieve("тази фраза я няма в закона")).toBeNull();
  });
});

describe("LANE_ENTRY_FORCED_BRAKING / overtakeReturn — the act's own card", () => {
  const row = LANE_ENTRY_ACT_COPY.overtakeReturn;

  it("is registered, so `makeViolation`, the peek and the corrective all resolve the ACT and not the lane-drop card", () => {
    expect(PER_ACT_COPY.LANE_ENTRY_FORCED_BRAKING).toBe(LANE_ENTRY_ACT_COPY);
    expect(actCopy("LANE_ENTRY_FORCED_BRAKING", "overtakeReturn")).toBe(row);
    const pooled = VIOLATIONS.LANE_ENTRY_FORCED_BRAKING;
    const e = makeViolation("LANE_ENTRY_FORCED_BRAKING", 12, { detail: "overtakeReturn" });
    expect(e.titleBg).toBe(row.titleBg);
    expect(e.explanationBg).toBe(row.explanationBg);
    expect(e.detail).toBe("overtakeReturn");
    expect(violationPeekBg("LANE_ENTRY_FORCED_BRAKING", "overtakeReturn")).toBe(row.peekBg);
    expect(violationCorrectiveBg("LANE_ENTRY_FORCED_BRAKING", "overtakeReturn")).toBe(row.correctiveBg);
    // The grade does not move with the copy: same severity, points, law.
    expect(e.severityClass).toBe(pooled.severityClass);
    expect(e.points).toBe(pooled.points);
    expect(e.lawRef).toBe(pooled.lawRef);
    // …and the lane-drop cut-in keeps the pooled card, byte for byte.
    const drop = makeViolation("LANE_ENTRY_FORCED_BRAKING", 12);
    expect(drop.titleBg).toBe(pooled.titleBg);
    expect(drop.explanationBg).toBe(pooled.explanationBg);
    expect(violationCorrectiveBg("LANE_ENTRY_FORCED_BRAKING", undefined)).toBe(pooled.correctiveBg);
  });

  it("every sentence is the text it was reviewed as", () => {
    expect(row).toEqual(REVIEWED);
  });

  it("does NOT carry the two sentences of the pooled card that are the lane-drop act's own", () => {
    const all = `${row.titleBg} ${row.explanationBg} ${row.peekBg} ${row.correctiveBg}`;
    // The kinematic claim — false when he is the faster of the two.
    expect(all).not.toContain("за да не те удари");
    expect(all).not.toContain("секунда за реакция");
    // The lane-drop advice — wrong for a driver who has just overtaken.
    expect(all).not.toContain("пусни я да мине");
    expect(all).not.toContain("ЗАД нея");
    // What it says instead is what was measured: the vehicle was already
    // travelling in that lane, and its driver had to brake hard BECAUSE OF HIM.
    expect(row.explanationBg).toContain("което вече се движеше по нея");
    expect(row.explanationBg).toContain("трябваше да спира рязко заради теб");
    // …and the advice is step 8 of the lesson it is billed on.
    expect(row.correctiveBg).toContain("ЦЯЛОТО превозно средство");
    expect(row.correctiveBg).toContain("десен мигач");
  });

  it("cites exactly the two retrieved provisions, in the prose and nowhere else", () => {
    expect(citationsIn(row.explanationBg)).toEqual([YIELD_TO_LANE!.cite, NOT_FORCE_TO_SLOW!.cite]);
    expect(citationsIn(row.titleBg + row.peekBg + row.correctiveBg)).toEqual([]);
    // The pooled row's lawRef — which the act inherits — IS the first of them.
    expect(VIOLATIONS.LANE_ENTRY_FORCED_BRAKING.lawRef).toBe(`ЗДвП ${YIELD_TO_LANE!.cite}`);
    // The second sentence is the article's own words, minus the grammar.
    expect(NOT_FORCE_TO_SLOW!.text).toContain("без да го принуждава да намалява скоростта");
    expect(row.explanationBg).toContain("без да го принуждава да намалява скоростта");
  });
});
