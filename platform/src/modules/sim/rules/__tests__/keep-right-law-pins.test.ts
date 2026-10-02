/**
 * FOUNDER RULING 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW» — every citation and
 * number the NOT_KEEPING_RIGHT surfaces put in front of a student, pinned to
 * the BANK (ADR-002: law by retrieval, never recall).
 *
 * The test does not type the article numbers it accepts. It finds, in
 * content/law/acts/zdvp.json, the ONE provision containing the duty's own
 * words («използва най-дясната свободна лента»), the ONE containing the town
 * exemption («в населените места, на пътно платно с две и повече пътни
 * ленти»), and derives «чл. N, ал. M, т. K» from the bank's own numbering. The
 * 80 km/h ceiling is read out of the retrieved т. 2 text and must equal the
 * engine's constant and every «80» the card prints.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "../catalog";
import { ROAD_CONSEQUENCES } from "../consequences";
import { KEEP_RIGHT_TOWN_MAX_KMH } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const zdvp = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8")) as {
  units: { ref: string; textBg: string }[];
};

interface Retrieved {
  cite: string;
  text: string;
}

/** The ONE provision containing `phrase`, named by the bank's own numbering
 *  (same derivation as lane-entry-copy-pins.test.ts). Null when absent or
 *  ambiguous. */
function retrieve(phrase: string): Retrieved | null {
  const hits = zdvp.units.filter((u) => u.textBg.includes(phrase));
  if (hits.length !== 1) return null;
  const u = hits[0];
  const at = u.textBg.indexOf(phrase);
  if (u.textBg.indexOf(phrase, at + 1) >= 0) return null;
  const before = u.textBg.slice(0, at);
  const paras = [...before.matchAll(/(^|\n|Чл\. \d+[а-я]*\. )\((\d+)\) /g)];
  let cite = u.ref;
  let from = 0;
  if (paras.length > 0) {
    const p = paras[paras.length - 1];
    cite += `, ал. ${p[2]}`;
    from = (p.index ?? 0) + p[0].length;
  }
  const points = [...before.slice(from).matchAll(/\n(\d+)\. /g)];
  let textFrom = from;
  if (points.length > 0) {
    const q = points[points.length - 1];
    cite += `, т. ${q[1]}`;
    textFrom = from + (q.index ?? 0) + q[0].length;
  }
  const end = u.textBg.indexOf("\n", at + phrase.length);
  return { cite, text: u.textBg.slice(textFrom, end < 0 ? undefined : end) };
}

const DUTY = retrieve("използва най-дясната свободна лента");
const TOWN = retrieve("в населените места, на пътно платно с две и повече пътни ленти за движение в една посока");
const SIGNAL = retrieve("когато навлизането по пътната лента се разрешава от светлинен сигнал");
const card = VIOLATIONS.NOT_KEEPING_RIGHT;

describe("the bank says what the ruling says", () => {
  it("the duty is чл. 15, ал. 1; the town exemption is чл. 15, ал. 2, т. 2; the signal exemption is ал. 2, т. 3", () => {
    expect(DUTY?.cite).toBe("чл. 15, ал. 1");
    expect(TOWN?.cite).toBe("чл. 15, ал. 2, т. 2");
    expect(SIGNAL?.cite).toBe("чл. 15, ал. 2, т. 3");
  });

  it("the engine's town ceiling IS the number in the retrieved т. 2 text", () => {
    const m = /не по-голяма от (\d+) [кk]m\/h/.exec(TOWN!.text);
    expect(m, TOWN!.text).not.toBeNull();
    expect(Number(m![1])).toBe(KEEP_RIGHT_TOWN_MAX_KMH);
  });
});

describe("the card cites the bank and says truly when the duty applies (THEO-4)", () => {
  it("lawRef is the retrieved duty", () => {
    expect(card.lawRef).toBe(`ЗДвП ${DUTY!.cite}`);
  });

  it("the explanation cites ал. 1 for the duty, then BOTH exemptions — ал. 2, т. 2 (town) and т. 3 (a light signal) — and nothing else", () => {
    expect(card.explanationBg).toContain(`(ЗДвП ${DUTY!.cite})`);
    const shortTown = TOWN!.cite.replace(/^чл\. \d+, /, ""); // «ал. 2, т. 2», read in the article just cited
    const shortSignal = SIGNAL!.cite.replace(/^чл\. \d+, /, ""); // «ал. 2, т. 3»
    expect(card.explanationBg).toContain(`(${shortTown})`);
    expect(card.explanationBg).toContain(`(${shortSignal})`);
    const cites = [...card.explanationBg.matchAll(/(?:чл\. \d+, )?ал\. \d+(?:, т\. \d+)?/g)].map((x) => x[0]);
    expect(cites).toEqual([DUTY!.cite, shortTown, shortSignal]);
  });

  it("round 2 (V4): the town case is not stated as the ONLY exemption — т. 3 is named in the bank's own words, and the card says this was no such case", () => {
    // «само в населено място» would be a universal the law does not make: ал. 2,
    // т. 3 frees a lane a light signal admits, in or out of a settlement.
    expect(card.explanationBg).not.toMatch(/само в населено място/u);
    expect(SIGNAL!.text).toContain("светлинен сигнал");
    const shortSignal = SIGNAL!.cite.replace(/^чл\. \d+, /, "");
    const clause = card.explanationBg.split(`(${shortSignal})`)[0].split(/[.;—]/u).pop() ?? "";
    expect(clause).toMatch(/светлинен сигнал/u);
    // The denial follows BOTH exemptions (it closes the sentence that names them),
    // so «такъв случай» denies т. 2 and т. 3 alike.
    expect(card.explanationBg).toContain(`(${shortSignal}) — тук не беше такъв случай.`);
    // No universal about what the law allows: «само», «единствено», «нито един».
    expect(card.explanationBg).not.toMatch(/(?<!\p{L})(?:само|единствен\p{L}*|нито)(?!\p{L})/iu);
  });

  it("it names the three roads where ал. 1 binds, with the bank's 80", () => {
    const n = KEEP_RIGHT_TOWN_MAX_KMH;
    expect(card.explanationBg).toContain("извън населено място");
    expect(card.explanationBg).toContain("на магистрала");
    expect(card.explanationBg).toContain(`над ${n} km/h`);
    // …and the town case it was NOT in, with the same number.
    expect(card.explanationBg).toContain(`в населено място, на платно с две и повече ленти в посока и ограничение до ${n} km/h`);
    // Every number on the card is that one number.
    expect([...card.explanationBg.matchAll(/\d+(?= km\/h)/g)].map((x) => Number(x[0]))).toEqual([n, n]);
  });

  it("the card no longer states ал. 1 as a rule of every road", () => {
    expect(card.explanationBg).not.toContain("Извън изпреварване се движи във възможно най-дясната свободна лента");
  });

  it("the road-consequence row quotes the retrieved ал. 1 verbatim", () => {
    const row = ROAD_CONSEQUENCES.NOT_KEEPING_RIGHT as unknown as {
      duties: { refBg?: string; quoteBg?: string; quote?: string }[];
    };
    const text = JSON.stringify(row.duties);
    expect(text).toContain(`ЗДвП ${DUTY!.cite}`);
    expect(text).toContain(
      "се движи възможно най-вдясно по платното за движение, а когато пътните ленти са очертани с пътна маркировка, използва най-дясната свободна лента.",
    );
  });
});
