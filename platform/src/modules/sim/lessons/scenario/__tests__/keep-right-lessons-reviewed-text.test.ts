/**
 * FOUNDER RULING 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW» — EVERY student-facing
 * text of the three re-scoped lessons, and of everything they can SHOW, is
 * pinned VERBATIM to the reviewed copy in `keep-right-lessons-reviewed-text.json`.
 *
 * WHY VERBATIM. Round 1 guarded these lessons with semantic checks (no bare
 * «чл. 15», no ал. 1 without «извън населено място», five fixed slogans). The
 * verifier put the SAME false claim back in other words — «Продължителното
 * движение в лявата лента без изпреварване е второстепенна грешка.», «А
 * оставането в лявата лента при свободна дясна е отделно нарушение.», «— тя е
 * лентата ти за движение» — and every check stayed green. No pattern list can
 * enumerate the ways to say a false thing; a verbatim pin makes ANY edit a red
 * test, so a changed sentence cannot reach a student without someone reading
 * it against ЗДвП чл. 15, ал. 2 again. The semantic checks stay
 * (keep-right-lessons-truth.test.ts, caption-truth.test.ts,
 * keep-right-lessons-citations.test.ts, keep-right-claim-census.test.ts): they
 * say WHY a text is wrong; this file says THAT it changed.
 *
 * WHAT IS PINNED — read structurally, so a new field is caught too:
 *   · templates: every string under a key ending in «Bg» (any depth: title,
 *     tags, objective, steps, objective titles, mistake titles and cards, teach
 *     cards, rung complications), every «lawRef», and — whatever its key is
 *     called — every string that holds a Cyrillic letter (a text a student
 *     could read cannot hide under a field name the walk does not know);
 *   · compiled: the same walk over `compileScenario` at every authored rung —
 *     the briefing, description and objective titles the player renders;
 *   · captions: every annotation of every recorded demo, keyed «index@time»;
 *   · catalog (round 3, W2a): EVERY card these lessons can show, not only
 *     NOT_KEEPING_RIGHT. Round 2 pinned that one card, and the verifier
 *     appended «Извън изпреварване мястото ти е в най-дясната свободна лента.»
 *     to LANE_CHANGE_WITHOUT_INDICATOR and «…в лявата лента не се пътува.» to
 *     LANE_CHANGE_WITHOUT_MIRROR_CHECK — cards these lessons coach and bill —
 *     and nothing turned red. The set of codes is COMPUTED, never typed: every
 *     code in a mistake's `codeRefs` / `incidentalCodeRefs`, every violation
 *     and commendation the nine recordings actually produce when re-recorded
 *     through the production rule engine, and NOT_KEEPING_RIGHT (the card the
 *     ruling is about). For each code: the catalogue card, its per-act copy,
 *     its «на пътя» consequence row and its exam-sheet rationale — every
 *     string each holds. A lesson that starts showing another code turns this
 *     red until that card has been read too.
 *   · theory (round 3, W3): every beat of l-maneuvers-lanes (the whole lesson
 *     is «Избор и смяна на лента»); every beat of l-basics-obligations that
 *     touches lane choice (its concept is one of the lane concepts, or one of
 *     its sentences carries the census vocabulary — computed); and every beat
 *     of ANY theory lesson whose visual plays one of the three lessons'
 *     recordings. Grounds are reviewer provenance, not shown, and are left out.
 *
 * RE-RECORD — only after the changed text has been REVIEWED against the law
 * bank; recording is that review's signature, not a way to make red go away:
 *   RECORD_REVIEWED_TEXT=1 npx vitest run src/modules/sim/lessons/scenario/__tests__/keep-right-lessons-reviewed-text.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import { compileScenario } from "../compile";
import { COMMENDATIONS, PER_ACT_COPY, VIOLATIONS } from "../../../rules/catalog";
import { ROAD_CONSEQUENCES } from "../../../rules/consequences";
import { N38_BASIS } from "../../../rules/n38";
import type { CommendationCode, ViolationCode } from "../../../rules/types";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScLnBoulevardDisciplineDrive } from "../../../traces/scLnBoulevardDiscipline";
import { recordScOvKeepRightDrive } from "../../../traces/scOvKeepRight";
import { recordScVpPoliceStopDrive } from "../../../traces/scVpPoliceStop";
import { sentencesOf, vocabOf } from "./keepRightCensus";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const FIXTURE = path.join(HERE, "keep-right-lessons-reviewed-text.json");
const RECORD = process.env.RECORD_REVIEWED_TEXT === "1";
const LESSONS = ["sc-ov-keep-right", "sc-ln-boulevard-discipline", "sc-vp-police-stop"] as const;
type LessonId = (typeof LESSONS)[number];
/** The theory lesson pinned whole, and the one pinned where it touches lane choice. */
const THEORY_WHOLE = "l-maneuvers-lanes";
const THEORY_LANE_BEATS = "l-basics-obligations";
const LANE_CONCEPTS = new Set(["c-right-side-rule", "c-lane-choice", "c-lane-change"]);

type TextMap = Record<string, string>;
/** Mixed-script words that are names, not typos: «Наредба № Iз-2539» is the
 *  ordinance's own designation (a Roman numeral and a Cyrillic letter). */
const KNOWN_MIXED = new Set<string>(["Iз"]);

/** Every string under a key ending in «Bg» (or «lawRef»), at any depth — plus
 *  any string holding a Cyrillic letter, under any key. */
function shownStrings(root: unknown): TextMap {
  const out: TextMap = {};
  const walk = (o: unknown, p: string, shown: boolean) => {
    if (typeof o === "string") {
      if (shown || /\p{Script=Cyrillic}/u.test(o)) out[p] = o;
      return;
    }
    if (Array.isArray(o)) {
      o.forEach((v, i) => walk(v, `${p}[${i}]`, shown));
      return;
    }
    if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k, /Bg$|^lawRef$/u.test(k));
    }
  };
  walk(root, "", false);
  return out;
}

/** Every string of a catalogue card, at any depth (the whole card is shown copy). */
function allStrings(root: unknown): TextMap {
  const out: TextMap = {};
  const walk = (o: unknown, p: string) => {
    if (typeof o === "string") out[p] = o;
    else if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${p}[${i}]`));
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k);
  };
  walk(root, "");
  return out;
}

const spec = (id: string) => {
  const s = SCENARIO_TEMPLATES.find((t) => t.id === id);
  if (!s) throw new Error(`no template ${id}`);
  return s;
};

/** Re-record a lesson's demos through the production rule engine: what each
 *  recording actually bills, coaches and praises. */
const RECORDERS: Record<LessonId, (district: unknown, name: string) => RecordedDrive> = {
  "sc-ov-keep-right": (d, n) => recordScOvKeepRightDrive(d, n as Parameters<typeof recordScOvKeepRightDrive>[1]),
  "sc-ln-boulevard-discipline": (d, n) =>
    recordScLnBoulevardDisciplineDrive(d, n as Parameters<typeof recordScLnBoulevardDisciplineDrive>[1]),
  "sc-vp-police-stop": (d, n) => recordScVpPoliceStopDrive(d, n as Parameters<typeof recordScVpPoliceStopDrive>[1]),
};
const traceName = (p: string) => path.basename(p).replace(".trace.json", "");

/** Every code the three lessons can put in front of a student, and why — and,
 *  per recording, the copy each event was actually STAMPED with (a per-act or
 *  per-situation title replaces the pooled one: the police shadow's praise is
 *  «…по сигнал», not the junction's «отстъпено предимство»). */
function codesShown(): {
  violations: Record<string, string[]>;
  commendations: Record<string, string[]>;
  recorded: Record<string, string[]>;
} {
  const violations: Record<string, string[]> = { NOT_KEEPING_RIGHT: ["the card the ruling is about"] };
  const commendations: Record<string, string[]> = {};
  const recorded: Record<string, string[]> = {};
  const note = (into: Record<string, string[]>, code: string, why: string) => {
    (into[code] ??= []).push(why);
  };
  for (const id of LESSONS) {
    const s = spec(id);
    for (const m of s.mistakes) {
      for (const c of m.codeRefs) note(violations, c, `${id}: codeRefs`);
      for (const c of m.incidentalCodeRefs ?? []) note(violations, c, `${id}: incidentalCodeRefs`);
    }
    const district = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "content", "world", `${s.map.districtId}.json`), "utf-8"),
    ) as unknown;
    for (const ref of [s.shadow, ...s.mistakes.map((m) => m.traceRef)]) {
      const drive = RECORDERS[id](district, traceName(ref.path));
      const lines: string[] = [];
      for (const e of drive.ruleEvents) {
        const where = `${id}/${traceName(ref.path)}: recorded`;
        if (e.kind === "violation") {
          note(violations, e.code, where);
          lines.push(`violation ${e.code}${e.detail ? ` [${e.detail}]` : ""} — «${e.titleBg}» — ${e.lawRef} — «${e.explanationBg}»`);
        } else if (e.kind === "commendation") {
          note(commendations, e.code, where);
          lines.push(`commendation ${e.code}${e.situation ? ` [${e.situation}]` : ""} — «${e.titleBg}»`);
        }
      }
      recorded[`${id}/${traceName(ref.path)}`] = lines;
    }
  }
  const uniq = (r: Record<string, string[]>) =>
    Object.fromEntries(
      Object.keys(r)
        .sort()
        .map((k) => [k, [...new Set(r[k])].sort()]),
    );
  return { violations: uniq(violations), commendations: uniq(commendations), recorded };
}

interface Beat {
  id: string;
  conceptId?: string;
  visual?: { templateId?: string };
  grounds?: unknown;
}
const shownOfBeat = (beat: Beat): TextMap =>
  shownStrings(Object.fromEntries(Object.entries(beat).filter(([key]) => key !== "grounds")));
const touchesLaneChoice = (beat: Beat): boolean =>
  (beat.conceptId !== undefined && LANE_CONCEPTS.has(beat.conceptId)) ||
  Object.values(shownOfBeat(beat)).some((text) => sentencesOf(text).some((s) => vocabOf(s).length > 0));

function theoryBeats(): Record<string, TextMap> {
  const out: Record<string, TextMap> = {};
  const dir = path.join(REPO_ROOT, "content", "lessons");
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json")) continue;
    const lesson = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as { id: string; beats: Beat[] };
    for (const beat of lesson.beats) {
      const plays = beat.visual?.templateId !== undefined && (LESSONS as readonly string[]).includes(beat.visual.templateId);
      const inScope =
        lesson.id === THEORY_WHOLE || (lesson.id === THEORY_LANE_BEATS && touchesLaneChoice(beat)) || plays;
      if (inScope) out[`${lesson.id}/${beat.id}`] = shownOfBeat(beat);
    }
  }
  return out;
}

function actual() {
  const templates: Record<string, TextMap> = {};
  const compiled: Record<string, Record<string, TextMap>> = {};
  const captions: Record<string, TextMap> = {};
  for (const id of LESSONS) {
    const s = spec(id);
    templates[id] = shownStrings(s);
    compiled[id] = Object.fromEntries(s.levels.map((l) => [`L${l.level}`, shownStrings(compileScenario(s, l.level))]));
    for (const ref of [s.shadow, ...s.mistakes.map((m) => m.traceRef)]) {
      const trace = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ref.path), "utf-8")) as {
        events: { kind: string; textBg?: string; tSec: number }[];
      };
      captions[ref.path] = Object.fromEntries(
        trace.events.filter((e) => e.kind === "annotation").map((e, i) => [`${i}@${e.tSec.toFixed(2)}`, e.textBg ?? ""]),
      );
    }
  }
  const codes = codesShown();
  const catalog: Record<string, TextMap> = {};
  for (const code of Object.keys(codes.violations) as ViolationCode[]) {
    catalog[code] = allStrings({
      card: VIOLATIONS[code],
      perAct: PER_ACT_COPY[code] ?? null,
      onTheRoad: ROAD_CONSEQUENCES[code] ?? null,
      examSheet: N38_BASIS[code],
    });
  }
  const commendations: Record<string, TextMap> = {};
  for (const code of Object.keys(codes.commendations) as CommendationCode[]) {
    commendations[code] = allStrings(COMMENDATIONS[code]);
  }
  return { templates, compiled, captions, codes, catalog, commendations, theory: theoryBeats() };
}

const now = actual();
if (RECORD) fs.writeFileSync(FIXTURE, JSON.stringify(now, null, 2) + "\n");
const reviewed = JSON.parse(fs.readFileSync(FIXTURE, "utf-8")) as ReturnType<typeof actual>;

describe("every student-facing text of the three lessons is the reviewed text, verbatim", () => {
  for (const id of LESSONS) {
    it(`${id}: template texts (title, tags, objective, steps, objective titles, mistake cards, teach cards, rungs)`, () => {
      expect(now.templates[id]).toEqual(reviewed.templates[id]);
    });
    it(`${id}: the compiled lesson at every authored rung (briefing, description, objective titles)`, () => {
      expect(now.compiled[id]).toEqual(reviewed.compiled[id]);
    });
  }
  it("every recorded caption of the nine demos, by time", () => {
    expect(now.captions).toEqual(reviewed.captions);
  });

  it("the codes these lessons can show — template refs and what the nine recordings actually produce, with the copy each event was stamped with — are the reviewed set", () => {
    // A lesson that starts billing, coaching or praising another code shows
    // another card: that card has to be read before this list moves.
    expect(now.codes).toEqual(reviewed.codes);
  });
  it("every catalogue card those codes show: the card, its per-act copy, its «на пътя» row, its exam-sheet rationale", () => {
    expect(now.catalog).toEqual(reviewed.catalog);
  });
  it("every commendation card the recordings earn", () => {
    expect(now.commendations).toEqual(reviewed.commendations);
  });

  it("the theory beats: all of l-maneuvers-lanes, the lane-choice beats of l-basics-obligations, and every beat that plays one of the three lessons' recordings", () => {
    expect(now.theory).toEqual(reviewed.theory);
  });

  it("no pinned word mixes Latin and Cyrillic letters (a homoglyph reads right and searches wrong)", () => {
    // Round 2 found «колa» (Latin «a») in the weaving card; the verbatim pin
    // would otherwise have frozen it as reviewed.
    const mixed = new Set<string>();
    const scan = (o: unknown) => {
      if (typeof o === "string") {
        for (const w of o.split(/[^\p{L}]+/u)) {
          if (/\p{Script=Latin}/u.test(w) && /\p{Script=Cyrillic}/u.test(w)) mixed.add(w);
        }
      } else if (o && typeof o === "object") for (const v of Object.values(o)) scan(v);
    };
    scan(now);
    expect([...mixed].filter((w) => !KNOWN_MIXED.has(w))).toEqual([]);
  });

  it("the pin is not vacuous: it holds the texts that carry the ruling, and the cards the round-2 verifier edited", () => {
    const all = JSON.stringify(reviewed);
    expect(Object.keys(reviewed.captions)).toHaveLength(9);
    for (const id of LESSONS) expect(Object.keys(reviewed.templates[id]).length, id).toBeGreaterThan(15);
    expect(all).toContain("(чл. 15, ал. 2, т. 2)");
    expect(all).toContain("(ал. 2, т. 3)");
    expect(Object.keys(reviewed.catalog.NOT_KEEPING_RIGHT)).toEqual(
      expect.arrayContaining(["card.titleBg", "card.explanationBg", "card.peekBg", "card.correctiveBg", "card.lawRef", "card.realWorldBg"]),
    );
    // The cards the three lessons really coach / bill (measured by re-recording).
    expect(Object.keys(reviewed.catalog)).toEqual(
      expect.arrayContaining([
        "LANE_CHANGE_WITHOUT_INDICATOR",
        "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
        "POLICE_STOP_SIGNAL_IGNORED",
        "HARSH_BRAKING_NO_CAUSE",
        "POOR_LANE_KEEPING",
      ]),
    );
    for (const code of Object.keys(reviewed.catalog)) {
      expect(reviewed.catalog[code]["card.explanationBg"], code).toBeTruthy();
      expect(reviewed.catalog[code]["card.correctiveBg"], code).toBeTruthy();
    }
    // Theory: every beat of the lanes lesson, the lane beats of the basics
    // lesson, and the two police beats that play sc-vp-police-stop.
    const beats = Object.keys(reviewed.theory);
    expect(beats.filter((b) => b.startsWith(`${THEORY_WHOLE}/`))).toHaveLength(8);
    expect(beats).toEqual(
      expect.arrayContaining([
        "l-basics-obligations/b-open",
        "l-basics-obligations/b-right-side-rule",
        "l-basics-obligations/b-check-right-side",
        "l-basics-obligations/b-recap",
        "l-admin-newdriver-police/b-police-interaction",
        "l-admin-newdriver-police/b-board-police-stop",
      ]),
    );
    expect(all).toContain("същото оставане вляво не е нарушение");
    expect(all).not.toContain("Лявата лента се посещава. В дясната се живее.");
  });
});

