/**
 * Every law citation the three keep-right lessons put in front of a student —
 * sc-ov-keep-right, sc-ln-boulevard-discipline, sc-vp-police-stop — and every
 * citation on the catalogue cards they can show, pinned to the BANK by
 * retrieval (ADR-002: law by retrieval, never recall).
 *
 * The test does not type the article numbers it accepts. It finds, in
 * content/law/acts/zdvp.json, the ONE provision containing each duty's own
 * words and derives «чл. N, ал. M, т. K» from the bank's numbering (the same
 * derivation as rules/__tests__/keep-right-law-pins.test.ts and
 * lane-entry-copy-pins.test.ts). Then:
 *   · the mistake cards cite EXACTLY their duties;
 *   · every citation in every shown text and every recorded caption equals a
 *     retrieved provision, and the sentence carrying it speaks of that
 *     provision's subject — a real article on the WRONG duty (the round-1
 *     verifier's N18: «(чл. 25, ал. 2)» for the signalling duty) is a red;
 *   · round 3 (W6b): the police lesson's three «(чл. 170)» are gone. чл. 170,
 *     ал. 3 is how the OFFICER gives the signal; the driver's duties are чл. 6,
 *     т. 2 (obey) and чл. 103 (stop). There is no «known-unaccepted» list any
 *     more, and no bare-article fallback: a citation is accepted only when it
 *     IS a retrieved provision;
 *   · round 3 (W6a): the POOR_LANE_KEEPING card — coached and billed in the
 *     boulevard lesson's weave, on a town street — no longer cites чл. 15,
 *     ал. 1 (the keep-right duty ал. 2, т. 2 switches off there). It cites the
 *     control duty the bank holds, чл. 20, ал. 1, and so does its «на пътя»
 *     row; the weave's own duty, чл. 5, ал. 2, т. 4, is cited by the lesson's
 *     card. No card these lessons can show cites the keep-right duty, except
 *     the one the engine shows only where it binds.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioSpec } from "../types";
import { VIOLATIONS } from "../../../rules/catalog";
import { ROAD_CONSEQUENCES } from "../../../rules/consequences";
import type { ViolationCode } from "../../../rules/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const zdvp = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8")) as {
  units: { ref: string; textBg: string }[];
};

/** The ONE provision containing `phrase`, named by the bank's own numbering. */
function retrieve(phrase: string): { cite: string; text: string } | null {
  const hits = zdvp.units.filter((u) => u.textBg.includes(phrase));
  if (hits.length !== 1) return null;
  const u = hits[0];
  const at = u.textBg.indexOf(phrase);
  if (u.textBg.indexOf(phrase, at + 1) >= 0) return null;
  const before = u.textBg.slice(0, at);
  // «(1)» opens a paragraph at the start of a line, right after «Чл. N.», or
  // after the article's own amendment note («Чл. 20. (Изм. - ДВ, …) (1) …»).
  const paras = [...before.matchAll(/(^|\n|Чл\. \d+[а-я]*\. (?:\([^()]*\) )?)\((\d+)\) /g)];
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

/** Each duty the lessons cite: the bank phrase that finds it, and the words a
 *  sentence citing it must use (its subject, in the lessons' own vocabulary). */
const DUTIES = {
  signal: { phrase: "своевременно да подаде ясен и достатъчен за възприемане сигнал", subject: /мигач|сигнал/iu },
  manoeuvre: { phrase: "трябва да се убеди, че няма да създаде опасност", subject: /опасност|огледал|поглед|убежда/iu },
  laneEntry: { phrase: "водачът е длъжен да пропусне пътните превозни средства, които се движат по нея", subject: /пропуска/iu },
  policeStop: { phrase: "длъжен да спре плавно в най-дясната част на платното", subject: /спр\p{L}*|спиране/iu },
  obey: {
    phrase: "изпълняват разпорежданията на лицата, упълномощени да регулират или да контролират движението по пътищата",
    subject: /разпорежд\p{L}*[^.!?]*изпълнява/iu,
  },
  weaving: { phrase: "последователно внезапно преминаване в лентите за движение", subject: /последователно внезапно преминаване/iu },
  keepRight: { phrase: "използва най-дясната свободна лента", subject: /най-дясната|задължителн|лявата лента/iu },
  townLane: {
    phrase: "в населените места, на пътно платно с две и повече пътни ленти за движение в една посока",
    subject: /по (?:твой )?избор|избора|най-удобната|удобна/iu,
  },
} as const;
type Duty = keyof typeof DUTIES;
const RETRIEVED = Object.fromEntries(
  (Object.keys(DUTIES) as Duty[]).map((k) => [k, retrieve(DUTIES[k].phrase)]),
) as Record<Duty, { cite: string; text: string } | null>;
/** Provisions the CARDS cite, and one the lessons must NOT cite for the driver. */
const CONTROL = retrieve("длъжни да контролират непрекъснато пътните превозни средства");
const OFFICER_SIGNAL = retrieve("Униформен полицай може да спира пътните превозни средства и чрез подаване на сигнал само с ръка");

const spec = (id: string): ScenarioSpec => {
  const s = SCENARIO_TEMPLATES.find((t) => t.id === id);
  if (!s) throw new Error(`no template ${id}`);
  return s;
};
const LESSONS = ["sc-ov-keep-right", "sc-ln-boulevard-discipline", "sc-vp-police-stop"] as const;
const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?…»"])\s+(?=[А-ЯЁA-Z„«])/u);

function captionsOf(s: ScenarioSpec): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const ref of [s.shadow, ...s.mistakes.map((m) => m.traceRef)]) {
    const trace = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ref.path), "utf-8")) as {
      events: { kind: string; textBg?: string; tSec: number }[];
    };
    for (const e of trace.events) {
      if (e.kind === "annotation" && e.textBg) out.push({ where: `${ref.path}@${e.tSec.toFixed(2)}`, text: e.textBg });
    }
  }
  return out;
}
function citedTexts(s: ScenarioSpec): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [{ where: "objectiveBg", text: s.objectiveBg }];
  for (const i of s.instructionsBg) out.push({ where: `step ${i.n}`, text: i.textBg });
  s.mistakes.forEach((m, k) => out.push({ where: `mistake ${k}`, text: m.whatWentWrongBg }));
  out.push({ where: "teach.whenBg", text: s.teach.whenBg }, { where: "teach.whyBg", text: s.teach.whyBg });
  out.push({ where: "teach.examinerBg", text: s.teach.examinerBg });
  return [...out, ...captionsOf(s)];
}

/** Every «(…)» citation group of a text, each cite resolved against the last
 *  full «чл. N» cited before it in the same text («(ал. 1)» after «чл. 15»). */
function citationsOf(text: string): { cite: string; sentence: string }[] {
  const out: { cite: string; sentence: string }[] = [];
  let article = "";
  for (const sentence of sentencesOf(text)) {
    for (const group of sentence.matchAll(/\(([^()]*(?:чл|ал)\. \d[^()]*)\)/gu)) {
      for (const part of group[1].split(/;\s*/u)) {
        const m = /(?:ЗДвП\s+)?(чл\. \d+[а-я]?)?\s*,?\s*(ал\. \d+)?\s*,?\s*(т\. \d+)?/u.exec(part.trim());
        if (!m || (!m[1] && !m[2])) continue;
        if (m[1]) article = m[1];
        const cite = [m[1] ?? article, m[2], m[3]].filter(Boolean).join(", ");
        out.push({ cite, sentence });
      }
    }
  }
  return out;
}

/** The retrieved duty a cite names — EXACTLY. (Round 2 also accepted a bare
 *  article whose retrieved provision sat inside it; that is how «(чл. 170)»
 *  passed for the driver's duty on the word «сигнал».) */
function dutyOf(cite: string): Duty | null {
  for (const k of Object.keys(DUTIES) as Duty[]) if (RETRIEVED[k]?.cite === cite) return k;
  return null;
}

describe("the bank holds every duty the lessons cite — one provision each", () => {
  it("each duty phrase retrieves exactly one provision", () => {
    for (const k of Object.keys(DUTIES) as Duty[]) expect(RETRIEVED[k], k).not.toBeNull();
    expect(CONTROL).not.toBeNull();
    expect(OFFICER_SIGNAL).not.toBeNull();
  });

  it("the numbering is the bank's: obey = чл. 6, т. 2; stop = чл. 103; the officer's signal = чл. 170, ал. 3; control = чл. 20, ал. 1; the weave = чл. 5, ал. 2, т. 4", () => {
    // Not what the test ACCEPTS (it derives that) — what the derivation yields
    // today, so a change in the bank's numbering is seen here first.
    expect(RETRIEVED.obey!.cite).toBe("чл. 6, т. 2");
    expect(RETRIEVED.policeStop!.cite).toBe("чл. 103");
    expect(OFFICER_SIGNAL!.cite).toBe("чл. 170, ал. 3");
    expect(CONTROL!.cite).toBe("чл. 20, ал. 1");
    expect(RETRIEVED.weaving!.cite).toBe("чл. 5, ал. 2, т. 4");
    expect(RETRIEVED.signal!.cite).toBe("чл. 26");
  });
});

describe("the mistake cards cite exactly their duties", () => {
  const cardCites = (id: string, k: number) => citationsOf(spec(id).mistakes[k].whatWentWrongBg).map((c) => c.cite);
  it("sc-ov-keep-right «без мигач» cites the signalling duty and nothing else", () => {
    expect(cardCites("sc-ov-keep-right", 0)).toEqual([RETRIEVED.signal!.cite]);
  });
  it("sc-ov-keep-right «без поглед в огледалото» cites the manoeuvre-safety duty and nothing else", () => {
    expect(cardCites("sc-ov-keep-right", 1)).toEqual([RETRIEVED.manoeuvre!.cite]);
  });
  it("sc-ln-boulevard-discipline «излизане без поглед» cites the manoeuvre-safety duty and nothing else", () => {
    expect(cardCites("sc-ln-boulevard-discipline", 0)).toEqual([RETRIEVED.manoeuvre!.cite]);
  });
  it("sc-ln-boulevard-discipline «лутане между лентите» cites the two duties weaving breaches — the signal and the ban on successive sudden lane changes (round 3, W6a)", () => {
    expect(cardCites("sc-ln-boulevard-discipline", 1)).toEqual([RETRIEVED.signal!.cite, RETRIEVED.weaving!.cite]);
    // …and says the ban in the bank's own words.
    expect(spec("sc-ln-boulevard-discipline").mistakes[1].whatWentWrongBg).toContain(DUTIES.weaving.phrase);
    expect(RETRIEVED.weaving!.text).toContain("да не извършва маневри, изразяващи се в последователно внезапно преминаване в лентите за движение");
  });
  it("sc-vp-police-stop «подминаване» cites the driver's stop duty and nothing else", () => {
    expect(cardCites("sc-vp-police-stop", 0)).toEqual([RETRIEVED.policeStop!.cite]);
  });
  it("the one card that cites nothing still cites nothing (a new citation is a review)", () => {
    expect(cardCites("sc-vp-police-stop", 1)).toEqual([]);
  });
});

describe("the police lesson cites the DRIVER's duties, not the officer's article (round 3, W6b)", () => {
  const s = spec("sc-vp-police-stop");
  const cites = (text: string) => citationsOf(text).map((c) => c.cite);

  it("the objective's «разпорежданията … се изпълняват» cites the duty to obey", () => {
    expect(cites(s.objectiveBg)).toEqual([RETRIEVED.obey!.cite]);
    expect(RETRIEVED.obey!.text).toContain("изпълняват разпорежданията");
  });
  it("step 2 — «сигналът за спиране е за теб: длъжен си да спреш» — cites the stop duty", () => {
    const step = s.instructionsBg.find((i) => i.n === 2)!;
    expect(cites(step.textBg)).toEqual([RETRIEVED.policeStop!.cite]);
    expect(step.textBg).toMatch(/длъжен си да спреш/u);
  });
  it("the shadow's caption at 14.70 cites the stop duty", () => {
    const at1470 = captionsOf(s).filter((c) => c.where.includes("shadow-correct") && c.where.endsWith("@14.70"));
    expect(at1470).toHaveLength(1);
    expect(cites(at1470[0].text)).toEqual([RETRIEVED.policeStop!.cite]);
  });
  it("the lesson's tag and teach-card reference name the stop duty", () => {
    expect(s.tagsBg).toContain(RETRIEVED.policeStop!.cite);
    expect(s.teach.lawRef).toBe(`ЗДвП ${RETRIEVED.policeStop!.cite}`);
  });
  it("nothing the lesson shows names the officer's article (чл. 170) any more", () => {
    const article = OFFICER_SIGNAL!.cite.split(",")[0]; // «чл. 170»
    const shown = [
      ...citedTexts(s).map((t) => t.text),
      ...s.tagsBg,
      s.titleBg,
      s.teach.lawRef,
      ...s.success.map((o) => o.titleBg),
      ...s.mistakes.map((m) => m.titleBg),
    ];
    expect(shown.filter((t) => t.includes(article))).toEqual([]);
  });
});

describe("every citation in the three lessons IS a retrieved duty, in a sentence about that duty", () => {
  for (const id of LESSONS) {
    it(id, () => {
      const bad: string[] = [];
      let n = 0;
      for (const { where, text } of citedTexts(spec(id))) {
        for (const { cite, sentence } of citationsOf(text)) {
          n++;
          const duty = dutyOf(cite);
          if (!duty) {
            bad.push(`${where}: «${cite}» is not a retrieved duty — «${sentence}»`);
            continue;
          }
          if (!DUTIES[duty].subject.test(sentence)) {
            bad.push(`${where}: «${cite}» (${duty}) in a sentence not about it — «${sentence}»`);
          }
        }
      }
      expect(bad).toEqual([]);
      expect(n, `${id}: the check read citations`).toBeGreaterThan(2);
    });
  }

  it("the reader is not blind to «чл. N, т. K»: it reads the point, not just the article", () => {
    expect(citationsOf("Разпорежданията се изпълняват (чл. 6, т. 2).").map((c) => c.cite)).toEqual(["чл. 6, т. 2"]);
    expect(citationsOf("А (чл. 15, ал. 2, т. 2); Б (ал. 1).").map((c) => c.cite)).toEqual(["чл. 15, ал. 2, т. 2", "чл. 15, ал. 1"]);
    expect(citationsOf("Две (чл. 26; чл. 25, ал. 1).").map((c) => c.cite)).toEqual(["чл. 26", "чл. 25, ал. 1"]);
    // a bare article is only itself: «чл. 170» is not «чл. 170, ал. 3», and names no retrieved duty
    expect(dutyOf("чл. 170")).toBeNull();
    expect(dutyOf("чл. 6")).toBeNull();
  });
});

describe("the cards these lessons show cite a duty that binds on the street they are shown on (round 3, W6a)", () => {
  /** The codes the three lessons can show — computed and reviewed in
   *  keep-right-lessons-reviewed-text (template refs + what the nine
   *  recordings produce). Read from that fixture so the two cannot drift. */
  const codes = Object.keys(
    (
      JSON.parse(fs.readFileSync(path.join(HERE, "keep-right-lessons-reviewed-text.json"), "utf-8")) as {
        codes: { violations: Record<string, string[]> };
      }
    ).codes.violations,
  ) as ViolationCode[];
  const KEEP_RIGHT_CITE = /чл\. ?15(?!\d)(?![а-я])(?!,\s*ал\. ?[2-7])/u;

  it("POOR_LANE_KEEPING — coached/billed in the boulevard weave — cites the control duty the bank holds, and only that", () => {
    expect(codes).toContain("POOR_LANE_KEEPING");
    expect(VIOLATIONS.POOR_LANE_KEEPING.lawRef).toBe(`ЗДвП ${CONTROL!.cite}`);
    // The bank has no provision on where the wheel runs relative to the lane
    // marking (ППЗДвП is not in the corpus), so the card cites nothing more.
    expect(zdvp.units.filter((u) => /върху маркировката|настъпва\p{L}* маркировк/iu.test(u.textBg))).toEqual([]);
  });

  it("its «на пътя» row shows that same duty, quoted from the bank — not the keep-right duty", () => {
    const row = ROAD_CONSEQUENCES.POOR_LANE_KEEPING;
    expect(row).toBeDefined();
    const duties = (row as unknown as { duties: { citationBg: string; quoteBg: string }[] }).duties;
    expect(duties.map((d) => d.citationBg)).toEqual([`ЗДвП ${CONTROL!.cite}`]);
    expect(duties[0].quoteBg).toBe(CONTROL!.text);
    expect(JSON.stringify(row)).not.toContain(RETRIEVED.keepRight!.text);
  });

  it("no card these lessons can show cites the keep-right duty (чл. 15, ал. 1 or a bare чл. 15) — except the card the engine shows only where it binds", () => {
    const citing: string[] = [];
    for (const code of codes) {
      const texts = [JSON.stringify(VIOLATIONS[code]), JSON.stringify(ROAD_CONSEQUENCES[code] ?? null)];
      if (texts.some((t) => KEEP_RIGHT_CITE.test(t))) citing.push(code);
    }
    expect(citing).toEqual(["NOT_KEEPING_RIGHT"]);
  });
});
