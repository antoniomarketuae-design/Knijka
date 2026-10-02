/**
 * FOUNDER RULING 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW» — the three urban
 * lessons that used to TEACH keep-right as their mistake (sc-ov-keep-right,
 * sc-ln-boulevard-discipline, sc-vp-police-stop) must say only true things
 * under the ruling, on every surface a student reads: the briefing, the steps,
 * the objective titles, the mistake cards, the teach cards and the recorded
 * demo captions.
 *
 * WHY THESE THREE ARE TOWN STREETS — measured on the BUILT world, not taken
 * from the lesson prose: each runs on a district whose every edge is posted
 * ≤ 80 by tag, is not a motorway and is not dressed as an извънградски път by
 * the world builder (isExtraUrbanCarriageway), with two marked lanes one way.
 * That is ЗДвП чл. 15, ал. 2, т. 2 — the lane is the driver's choice — so:
 *   · no mistake demo may cite NOT_KEEPING_RIGHT;
 *   · no sentence may cite bare «чл. 15» as a keep-right duty, or ал. 1
 *     without naming where it binds (извън населено място);
 *   · a sentence that cites ал. 2, т. 2 says it is the town case, with the
 *     bank's 80;
 *   · the slogans that stated ал. 1 as a rule of every road are gone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioSpec } from "../types";
import { isExtraUrbanCarriageway, isMotorwayCarriageway } from "../../../world/builders/constants";
import { KEEP_RIGHT_TOWN_MAX_KMH } from "../../../rules/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const LESSONS = ["sc-ov-keep-right", "sc-ln-boulevard-discipline", "sc-vp-police-stop"] as const;

const spec = (id: string): ScenarioSpec => {
  const s = SCENARIO_TEMPLATES.find((t) => t.id === id);
  if (!s) throw new Error(`no template ${id}`);
  return s;
};

interface Edge {
  class: string;
  oneway: boolean;
  lanes: number;
  maxspeed: number;
  maxspeedSource?: string;
  motorway?: boolean;
}
const districtEdges = (id: string): Edge[] =>
  (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as {
    roads: { edges: Edge[] };
  }).roads.edges;

/** Every string the lesson shows a student, with where it came from. */
function shownTexts(s: ScenarioSpec): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  out.push({ where: "objectiveBg", text: s.objectiveBg });
  for (const i of s.instructionsBg) out.push({ where: `step ${i.n}`, text: i.textBg });
  for (const o of s.success) out.push({ where: `objective ${o.id}`, text: o.titleBg });
  s.mistakes.forEach((m, k) => {
    out.push({ where: `mistake ${k} title`, text: m.titleBg });
    out.push({ where: `mistake ${k} card`, text: m.whatWentWrongBg });
  });
  out.push({ where: "teach.whenBg", text: s.teach.whenBg });
  out.push({ where: "teach.whyBg", text: s.teach.whyBg });
  out.push({ where: "teach.examinerBg", text: s.teach.examinerBg });
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
/** Sentences — split only where a capital follows, so «чл. 15, ал. 2, т. 2»
 *  stays one citation (an abbreviation dot is followed by a digit or a small
 *  letter). The splitter is checked below, because a splitter that broke on
 *  «чл.» would hand every citation check a fragment and pass blind. */
const sentences = (text: string): string[] => text.split(/(?<=[.!?…»"])\s+(?=[А-ЯЁA-Z„«])/u);

describe("the sentence splitter reads what it claims to", () => {
  it("keeps a citation whole and still splits real sentences", () => {
    const t =
      "Тук лентата е по избор (чл. 15, ал. 2, т. 2). Извън населено място дясната е задължителна (ал. 1). Край.";
    expect(sentences(t)).toEqual([
      "Тук лентата е по избор (чл. 15, ал. 2, т. 2).",
      "Извън населено място дясната е задължителна (ал. 1).",
      "Край.",
    ]);
  });
});

describe("the three lessons really run on town streets (the BUILT district)", () => {
  for (const id of LESSONS) {
    it(`${id}: every edge is ≤ 80, not a motorway, not an извънградски път — and two marked lanes one way`, () => {
      const edges = districtEdges(spec(id).map.districtId);
      expect(edges.length).toBeGreaterThan(0);
      for (const e of edges) {
        expect(e.maxspeed, id).toBeLessThanOrEqual(KEEP_RIGHT_TOWN_MAX_KMH);
        expect(isMotorwayCarriageway(e), id).toBe(false);
        expect(isExtraUrbanCarriageway(e), id).toBe(false);
      }
      expect(edges.some((e) => (e.oneway ? e.lanes : e.lanes / 2) >= 2), id).toBe(true);
    });
  }
});

describe("no mistake demo teaches a keep-right bill the law does not make here", () => {
  for (const id of LESSONS) {
    it(`${id}: NOT_KEEPING_RIGHT is in no codeRefs and no incidentalCodeRefs`, () => {
      for (const m of spec(id).mistakes) {
        expect(m.codeRefs, `${id}: ${m.titleBg}`).not.toContain("NOT_KEEPING_RIGHT");
        expect(m.incidentalCodeRefs ?? [], `${id}: ${m.titleBg}`).not.toContain("NOT_KEEPING_RIGHT");
      }
    });
  }
});

describe("every sentence is true under ал. 2, т. 2", () => {
  for (const id of LESSONS) {
    const texts = shownTexts(spec(id));

    it(`${id}: no bare «чл. 15» and no ал. 1 without naming where it binds`, () => {
      const bad: string[] = [];
      let alinea1 = 0;
      for (const { where, text } of texts) {
        for (const sent of sentences(text)) {
          if (/чл\. 15(?!, ал\.)/u.test(sent)) bad.push(`${where}: bare чл. 15 — «${sent}»`);
          if (/\(ал\. 1\)|чл\. 15, ал\. 1(?!\d)/u.test(sent)) {
            alinea1++;
            if (!/извън населено място/iu.test(sent)) {
              bad.push(`${where}: ал. 1 without «извън населено място» — «${sent}»`);
            }
          }
        }
      }
      expect(bad).toEqual([]);
      // Not vacuous: the two lessons that name the duty cite ал. 1 somewhere.
      if (id !== "sc-vp-police-stop") expect(alinea1, id).toBeGreaterThan(0);
    });

    it(`${id}: ал. 2, т. 2 is cited as the TOWN case, with the bank's 80`, () => {
      const bad: string[] = [];
      for (const { where, text } of texts) {
        for (const sent of sentences(text)) {
          if (!/ал\. 2, т\. 2/u.test(sent)) continue;
          if (!/в града|в населено място|населените места/iu.test(sent)) bad.push(`${where}: no town — «${sent}»`);
          const nums = [...sent.matchAll(/(\d+) км\/ч/gu)].map((m) => Number(m[1]));
          if (nums.length > 0 && nums.some((n) => n !== KEEP_RIGHT_TOWN_MAX_KMH)) bad.push(`${where}: ${nums}`);
        }
      }
      expect(bad).toEqual([]);
    });

    it(`${id}: the every-road keep-right slogans are gone`, () => {
      const SLOGANS = [
        /мястото ти (?:е|не е) (?:във? |там|тук)/iu,
        /в дясната се живее/iu,
        /лявата (?:лента )?е за (?:изпреварване|маневра)[^.]*не за (?:пътуване|скорост)/iu,
        /висене/iu,
        /отбелязана грешка/iu,
      ];
      const bad: string[] = [];
      for (const { where, text } of texts) {
        for (const re of SLOGANS) if (re.test(text)) bad.push(`${where}: ${re} — «${text}»`);
      }
      expect(bad).toEqual([]);
    });
  }

  it("the two lessons that still name the duty say where it binds — outside a settlement, on a motorway, above 80", () => {
    for (const id of ["sc-ov-keep-right", "sc-ln-boulevard-discipline"]) {
      const all = shownTexts(spec(id)).map((t) => t.text).join(" ");
      expect(all, id).toMatch(/извън населено място/iu);
      expect(all, id).toMatch(/магистрала/u);
      expect(all, id).toContain(`над ${KEEP_RIGHT_TOWN_MAX_KMH} км/ч`);
    }
  });
});
