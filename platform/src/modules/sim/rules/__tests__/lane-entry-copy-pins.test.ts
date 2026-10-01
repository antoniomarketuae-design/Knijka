/**
 * EVERY SENTENCE THE FORCED-BRAKING RULING PUT IN FRONT OF A STUDENT, PINNED
 * (sc-merge-lane-end:0487bcec round 4, verifier finding F2).
 *
 * WHY. Round 3 added a card, a contact copy, a mistake card, road-consequence
 * rows and demo captions, and checked them only loosely (a word here, a length
 * there). Five mutants that made a SHOWN sentence false survived every suite:
 * the card citing «чл. 25, ал. 1» (W15), the contact copy citing «чл. 23,
 * ал. 1» (W16), the peek turned to «Ти имаше предимство.» (W29), the mistake
 * card saying the car «не се наложи да намалява» (W30) and the catalogue saying
 * it «може да продължи спокойно» (W31). This file makes any such edit red, two
 * independent ways:
 *
 *   1. LAW BY RETRIEVAL (ADR-002). Every article a sentence cites must be one
 *      the BANK says carries the duty or the fine the sentence is about. The
 *      test does not type the article numbers it accepts: it finds, in
 *      content/law/acts/zdvp.json, the one paragraph that contains the duty's
 *      own words („навлизане изцяло или частично в съседна пътна лента"), the
 *      one точка that contains the т. 14 deed, and the one that contains the
 *      т. 5 danger clause, and derives „чл. N, ал. M, т. K" from the bank's
 *      own numbering. A citation that is not that provision (or a coarser
 *      reference to it, „чл. 183, ал. 4") is red.
 *   2. THE TEXT AS REVIEWED. Each sentence is pinned verbatim to the text it
 *      was reviewed as (round 3's copy, which its verifier read and reported
 *      true, plus round 4's one correction below). Changing a word of copy
 *      that grades a student is a decision; making it means changing the pin
 *      here in the same diff, where a reviewer sees it.
 *
 * ROUND 4'S ONE COPY CORRECTION (round 3 verifier, F10): the card said the
 * car's driver had to brake hard «дори ако е реагирал до секунда» — "even with
 * any reaction up to a second". The rule measures exactly ONE second of
 * reaction; a driver who reacted in half a second can need less than the
 * 7 m/s² line, so on some billed frames that clause was false. It now says
 * what is measured: after the normal second of reaction.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLLISION_CONTACT_COPY, VIOLATIONS } from "../catalog";
import { ROAD_CONSEQUENCES } from "../consequences";
import { N38_BASIS } from "../n38";
import { SC_MERGE_LANE_END } from "../../lessons/scenario/templates-merging";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const zdvp = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8")) as {
  units: { ref: string; textBg: string }[];
};

interface Retrieved {
  /** e.g. "чл. 25, ал. 2" — built from the bank's own numbering */
  cite: string;
  /** the алинея (or точка) text the phrase was found in */
  text: string;
}

/**
 * Find the ONE provision of ЗДвП whose text contains `phrase` and name it the
 * way the product cites: `чл. N`, the алинея whose "(M)" marker opens the
 * text the phrase sits in, and — when the phrase sits in an enumerated точка
 * ("K. …" at a line start) — `т. K`. Null when the bank has no such text, or
 * has it more than once (an ambiguous retrieval is not a retrieval).
 */
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

/** Every "чл. N[, ал. M][, т. K]" a sentence cites. */
const citationsIn = (text: string): string[] =>
  [...text.matchAll(/[Чч]л\. \d+(?:, ал\. \d+)?(?:, т\. \d+)?/g)].map((m) => m[0].replace(/^Ч/, "ч"));

/** A citation is grounded when it IS a retrieved provision, or a coarser
 *  reference to one ("чл. 183, ал. 4" for "чл. 183, ал. 4, т. 14"). */
function ungrounded(text: string, allowed: readonly (Retrieved | null)[]): string[] {
  return citationsIn(text).filter((c) => !allowed.some((r) => r !== null && (r.cite === c || r.cite.startsWith(`${c}, `))));
}

// The duty the ruling bills, and the two fines the card prices — RETRIEVED.
const YIELD = retrieve("навлизане изцяло или частично в съседна пътна лента");
const FINE_T14 = retrieve("неправилно се престроява или не спазва предимството на друг участник в движението");
const DANGER_T5 = retrieve(
  "правилата за предимство, за разминаване, за изпреварване или за заобикаляне, ако от това е създадена непосредствена опасност",
);

/** The texts as reviewed (see the header). */
const REVIEWED = {
  "card": {
    "titleBg": "Вмъкване твърде близо пред кола",
    "explanationBg": "Влезе в съседната лента толкова близо пред кола, която вече се движеше по нея, че след нормалната секунда за реакция водачът ѝ трябва да спира рязко, за да не те удари. Който навлиза изцяло или частично в съседна лента, пропуска движещите се по нея (чл. 25, ал. 2). Лентата не става твоя, когато мигачът светне, а когато зад теб има достатъчно място колата в нея да продължи, без да спира заради теб.",
    "peekBg": "Принуди я да спира рязко.",
    "correctiveBg": "Преди волана: огледало от страната на маневрата и поглед през рамо — колко близо е колата в лентата и колко бързо идва? Ако не може да продължи, без да намали заради теб, отпусни газта, пусни я да мине и влез в пролуката ЗАД нея. Мигачът обявява, но не отваря място.",
    "realWorldBg": "Извън изпита: глоба 100 лв. по ЗДвП чл. 183, ал. 4 — водач, който „неправилно се престроява или не спазва предимството на друг участник в движението“. Създадена ли е с това непосредствена опасност за движението, вече е чл. 179, ал. 1, т. 5 — глоба в размер 200 лв."
  },
  "cutIn": {
    "titleBg": "Удар след вмъкване пред кола",
    "explanationBg": "Удар с друго превозно средство секунди след като влезе в съседната лента твърде близо пред кола, която вече се движеше по нея. Тя имаше предимство (чл. 25, ал. 2), а ти ѝ остави по-малко място, отколкото ѝ трябваше, за да спре спокойно. Пролуката се избира в огледалото и през рамото, преди воланът да тръгне — не с надеждата, че другият ще спре.",
    "peekBg": "Тя имаше предимство."
  },
  "consequences": {
    "offenceBg": "неспазено предимство при престрояване",
    "noteBg": "Същата точка като престрояването без поглед, но друго деяние от нея: не „неправилно се престроява“, а „не спазва предимството“ — колата, която вече е в лентата, е тази с предимството.",
    "priorityDangerNoteBg": "От петте предложения на чл. 179, ал. 1, т. 5 наредбата взима само две: изпреварването (т. 9 — 13 к.т.) и неспирането на знак „Спри!“ (т. 15 — 10 к.т.). Неспазването на правилата за предимство при престрояване не е сред тях, затова тук точки не падат."
  },
  "n38RationaleBg": "Осъжда само ИЗМЕРЕН конфликт: реално превозно средство вече се движи в лентата, в която влиза изпитваният, зад него; разстоянието между тях и скоростта, с която го настига, се четат в кадъра на навлизането, и вмъкването се таксува само ако след една секунда реакция то трябва да спира по-рязко от прага, при който продуктът нарича собственото спиране на ученика рязко (7 m/s²). Колата с предимство, принудена да спира аварийно, за да избегне удар, е създадената предпоставка за ПТП, която клаузата иска — затова и двата шаблона на стеснение на лентата наричат принуждаването да спира опасна грешка. За разлика от OVERTAKE_RETURN_TOO_EARLY (кратка дистанция в секунди, основна) тук се иска доказано рязко спиране.",
  "pushOutCard": {
    "titleBg": "Изтласкване на кола от съседната лента",
    "whatWentWrongBg": "Мигачът светна и воланът тръгна веднага след него — без нито един поглед в огледалото и без проверка на мъртвата зона. В лявата лента обаче вече имаше кола, която идваше отзад съвсем близо: тя се движи по своята лента, а твоята свършва — значи ти си този, който се съобразява (чл. 25, ал. 2). Вмъкна се толкова близо пред нея, че водачът ѝ трябваше да спира рязко, за да не те удари. „Ще ме пуснат“ не е маневра. Мигачът обявява намерението ти, но не проверява дали лентата е свободна — това правят огледалото и рамото, ПРЕДИ волана."
  },
  "instructions": {
    "4": "Изравни темпото си с потока в лявата лента. Ако колата до теб е почти наравно — отпусни газта и я пусни да мине; пролуката зад нея е твоята.",
    "6": "Влез в пролуката с едно плавно движение и изключи мигача. Твоята лента свърши — значи ти се съобразяваш: никой в лявата лента не бива да спира или да отбива заради теб."
  },
  "captions": {
    "leShadow": [
      "Караме в дясната лента — тя свършва след около 180 метра. Стеснението е наше: ние се съобразяваме.",
      "В лявото огледало: зад нас в лявата лента има кола. Нейната лента продължава — нашата свършва.",
      "Отпускаме газта и я пускаме да мине. Пролуката ЗАД нея е нашата — не тази пред нея.",
      "Ляв мигач, още веднъж огледало и поглед през рамо в мъртвата зона — чак тогава воланът.",
      "Вписахме се в пролуката зад нея с едно движение — никой в лявата лента не спря и не отби заради нас. Мигачът се изключва.",
      "Готово: ранно решение, пълна проверка, вливане в пролука. Твоята лента свършва — значи ти се съобразяваш."
    ],
    "lePush": [
      "Грешка: мигач — и веднага волан. Нито огледало, нито поглед през рамо.",
      "В лявата лента вече има кола — идва отзад, съвсем близо. Тя е в своята лента, нашата свършва. А водачът дори не е погледнал.",
      "Колата в лявата лента трябваше да спира рязко, за да не ни удари. „Ще ме пуснат“ не е маневра. Огледалото и рамото са ПРЕДИ волана — винаги."
    ],
    "rwShadow": [
      "Караме в дясната лента. Напред знаците и конусите казват едно: тази лента е затворена за ремонт.",
      "В лявото огледало: зад нас в лявата лента има кола. Нейната лента продължава — нашата свършва след конусите.",
      "Отпускаме газта и я пускаме да мине. Пролуката ЗАД нея е нашата — не тази пред нея.",
      "Ляв мигач, още веднъж огледало и поглед през рамо в мъртвата зона — чак тогава воланът.",
      "Вписахме се в пролуката зад нея с едно движение, много преди първия конус — никой в лявата лента не спря и не отби заради нас. Мигачът се изключва.",
      "Временното ограничение е закон: 30 през целия участък. Между конусите работят хора — там тясното е за всички.",
      "Готово: ранно решение, пълна проверка, вливане в пролука и временната скорост — спазена докрай. Нито един конус не мръдна."
    ]
  }
} as const;

describe("the retrieval works, and can fail (a matcher must report what it cannot read)", () => {
  it("the three provisions are found exactly once each, and the duty paragraph says what the card relies on", () => {
    expect(YIELD, "the yield-to-the-lane duty is not in the bank").not.toBeNull();
    expect(FINE_T14, "the т. 14 deed is not in the bank").not.toBeNull();
    expect(DANGER_T5, "the т. 5 danger clause is not in the bank").not.toBeNull();
    expect(YIELD!.text).toMatch(/^При извършване на маневра/);
    expect(YIELD!.text).toContain("водачът е длъжен да пропусне пътните превозни средства, които се движат по нея");
    // the numbering is the bank's: the fine paragraph is the one that prices 100 лв.
    expect(FINE_T14!.cite.startsWith("чл. 183, ал. ")).toBe(true);
    expect(DANGER_T5!.cite.startsWith("чл. 179, ал. ")).toBe(true);
  });
  it("negative controls: an absent phrase retrieves nothing; a wrong article is flagged", () => {
    expect(retrieve("тази фраза я няма в закона")).toBeNull();
    expect(ungrounded("пропуска движещите се по нея (чл. 25, ал. 1).", [YIELD])).toEqual(["чл. 25, ал. 1"]);
    expect(ungrounded("Тя имаше предимство (чл. 23, ал. 1)", [YIELD])).toEqual(["чл. 23, ал. 1"]);
    expect(ungrounded("пропуска движещите се по нея (чл. 25, ал. 2).", [YIELD])).toEqual([]);
  });
});

describe("every citation in the ruling's copy is the provision the bank retrieves", () => {
  const card = VIOLATIONS.LANE_ENTRY_FORCED_BRAKING;
  const cut = COLLISION_CONTACT_COPY.vehicleCutIn;
  const road = ROAD_CONSEQUENCES.LANE_ENTRY_FORCED_BRAKING!;
  const pushOut = SC_MERGE_LANE_END.mistakes!.find((m) => m.codeRefs.includes("LANE_ENTRY_FORCED_BRAKING"))!;

  it("the card's lawRef IS the retrieved duty, and its prose cites that and nothing else", () => {
    expect(card.lawRef).toBe(`ЗДвП ${YIELD!.cite}`);
    expect(citationsIn(card.explanationBg)).toEqual([YIELD!.cite]);
    for (const t of [card.titleBg, card.peekBg ?? "", card.correctiveBg ?? ""]) expect(ungrounded(t, [YIELD])).toEqual([]);
  });

  it("the card's real-world price cites the retrieved т. 14 fine and the retrieved т. 5 escalation", () => {
    expect(card.realWorldRefs).toEqual([`ЗДвП ${FINE_T14!.cite}`, `ЗДвП ${DANGER_T5!.cite}`]);
    expect(ungrounded(card.realWorldBg ?? "", [FINE_T14, DANGER_T5])).toEqual([]);
    expect(citationsIn(card.realWorldBg ?? "").length).toBe(2);
    // the quoted deed is the bank's own words, from that very точка
    expect(FINE_T14!.text).toContain("неправилно се престроява или не спазва предимството на друг участник в движението");
  });

  it("the cut-in contact copy cites the retrieved duty (not чл. 23, not ал. 1)", () => {
    expect(citationsIn(cut.explanationBg)).toEqual([YIELD!.cite]);
    expect(ungrounded(cut.titleBg + cut.peekBg, [YIELD])).toEqual([]);
  });

  it("the push-out mistake card cites the retrieved duty", () => {
    expect(citationsIn(pushOut.whatWentWrongBg)).toEqual([YIELD!.cite]);
  });

  it("the road-consequence row: duty, deed, fine and escalation are each the retrieved provision, and each quote is in THAT provision", () => {
    expect(road.kind).toBe("single");
    if (road.kind !== "single") return;
    expect((road.duties ?? []).map((d) => d.citationBg)).toEqual([`ЗДвП ${YIELD!.cite}`]);
    expect(YIELD!.text).toContain(road.duties![0].quoteBg);
    expect(road.offenceQuote!.citationBg).toBe(`ЗДвП ${FINE_T14!.cite}`);
    expect(FINE_T14!.text).toContain(road.offenceQuote!.quoteBg.replace(/;$/, ""));
    expect(road.fine.source.citationBg).toBe(`ЗДвП ${FINE_T14!.cite}`);
    expect(road.escalation?.[0].fine.source.citationBg).toBe(`ЗДвП ${DANGER_T5!.cite}`);
    const priorityNote = road.escalation?.[0].controlPoints.noteBg ?? "";
    expect(ungrounded(priorityNote, [DANGER_T5])).toEqual([]);
  });
});

describe("every sentence is the text it was reviewed as", () => {
  const card = VIOLATIONS.LANE_ENTRY_FORCED_BRAKING;
  it("the card (title, explanation, peek, corrective, real-world)", () => {
    expect({
      titleBg: card.titleBg,
      explanationBg: card.explanationBg,
      peekBg: card.peekBg,
      correctiveBg: card.correctiveBg,
      realWorldBg: card.realWorldBg,
    }).toEqual(REVIEWED.card);
  });
  it("the cut-in contact copy", () => {
    expect(COLLISION_CONTACT_COPY.vehicleCutIn).toEqual(REVIEWED.cutIn);
  });
  it("the road-consequence row's own sentences", () => {
    const road = ROAD_CONSEQUENCES.LANE_ENTRY_FORCED_BRAKING!;
    if (road.kind !== "single") throw new Error("not a single row");
    expect({
      offenceBg: road.offenceBg,
      noteBg: road.noteBg,
      priorityDangerNoteBg: road.escalation?.[0].controlPoints.noteBg,
    }).toEqual(REVIEWED.consequences);
  });
  it("the Наредба № 38 rationale", () => {
    expect(N38_BASIS.LANE_ENTRY_FORCED_BRAKING.rationaleBg).toBe(REVIEWED.n38RationaleBg);
  });
  it("the push-out mistake card, and the codes it fires on", () => {
    const m = SC_MERGE_LANE_END.mistakes!.find((x) => x.titleBg === REVIEWED.pushOutCard.titleBg)!;
    expect({ titleBg: m.titleBg, whatWentWrongBg: m.whatWentWrongBg }).toEqual(REVIEWED.pushOutCard);
    expect(m.codeRefs).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK", "LANE_ENTRY_FORCED_BRAKING"]);
  });
  it("the two instructions the ruling's truth rests on (step 4 — the gap behind the car is yours; step 6 — nobody brakes for you)", () => {
    const by = Object.fromEntries(SC_MERGE_LANE_END.instructionsBg.map((s) => [s.n, s.textBg]));
    expect({ 4: by[4], 6: by[6] }).toEqual(REVIEWED.instructions);
  });
  it("the re-recorded demos' captions, in order (committed traces — the trace suites pin the generators to them)", () => {
    const captions = (spec: string, name: string) =>
      (
        JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", spec, `${name}.trace.json`), "utf-8")).events as {
          kind: string;
          textBg?: string;
        }[]
      )
        .filter((e) => e.kind === "annotation")
        .map((e) => e.textBg);
    expect({
      leShadow: captions("sc-merge-lane-end", "shadow-correct"),
      lePush: captions("sc-merge-lane-end", "mistake-push-out"),
      rwShadow: captions("sc-merge-roadworks-shift", "shadow-correct"),
    }).toEqual(REVIEWED.captions);
  });
});
