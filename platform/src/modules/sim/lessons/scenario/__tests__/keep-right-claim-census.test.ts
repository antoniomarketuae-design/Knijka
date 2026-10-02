/**
 * FOUNDER RULING 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW» — round 3 (W2b): the
 * PRODUCT-WIDE keep-right claim census. What is read, how «where it is shown»
 * and «does ал. 1 bind there» are computed, and why the vocabulary is wide, are
 * documented in `keepRightCensus.ts`.
 *
 * WHAT THIS FILE HOLDS
 *   1. The matcher reads the sentences earlier rounds' verifiers planted (and
 *      a list of paraphrases) — a census that cannot see the claim is blind.
 *   2. Every sentence in the product carrying the vocabulary is in the
 *      REVIEWED fixture `keep-right-claim-census.json`, classified
 *        duty       asserts the чл. 15, ал. 1 duty (keep right / the left lane
 *                   is not for travelling);
 *        exemption  states the town choice of lane (ал. 2, т. 2);
 *        both       one sentence doing both («…извън населено място дясната е
 *                   задължителна; в града … избираш»);
 *        other      mentions a lane or a side without asserting either (a task
 *                   instruction, a description of the recording, another duty —
 *                   чл. 103's «най-дясната част», чл. 35's right turn, the
 *                   overtake's return, the emergency corridor…).
 *      A NEW sentence anywhere in the product is a red here until someone reads
 *      it; so is a fixture entry whose sentence is gone. Count + list are exact
 *      (`keep-right-claim-census.counts.json`).
 *   3. A sentence that READS like the duty (`STRONG`) cannot be filed under
 *      «other» without a written reason.
 *   4. Every «duty» sentence is TRUE where it is shown: it names ал. 1's own
 *      scope, or its text unit states the town exemption with both conditions,
 *      or it is shown only on roads where ал. 1 binds (measured on the built
 *      maps), or it belongs to the NOT_KEEPING_RIGHT card the engine shows only
 *      there. The theory module's road-less general statements that fail this
 *      are listed by exact sentence in `keep-right-claim-census.known-theory.json`
 *      — approved question-bank / concept content with its own review ledger,
 *      which this repair reports and does not rewrite — never skipped.
 *   5. Every «exemption» sentence carries т. 2's two conditions (same rule,
 *      same known list), or says «Тук» on a street that IS a т. 2 street.
 *   6. WHERE each duty / exemption sentence is shown — surface, locator, the
 *      districts and whether ал. 1 binds on each, and the verdict — equals the
 *      reviewed list. A sentence that starts showing somewhere new is a red.
 *   7. (round 5, R4-3) SERVED. The question bank is read as the loader serves
 *      it; which rows default practice DEALS is asked of the product's own
 *      practice builder; each question showing in the reviewed list says its
 *      status, whether it is served and the scene its stem sets. And the rule
 *      R4-3 was missing: a duty sentence that a student is served, unbounded,
 *      on a TOWN scene is a red — never excusable on a stem that names two or
 *      more lanes one way (ал. 2, т. 2's own street), and otherwise only by a
 *      written reason in `dutyOnTownSceneWhereAl1Binds` of the known list.
 *
 * RE-RECORD — after READING every new sentence against ЗДвП чл. 15:
 *   RECORD_KEEP_RIGHT_CENSUS=1 npx vitest run src/modules/sim/lessons/scenario/__tests__/keep-right-claim-census.test.ts
 * writes new sentences as class «UNREVIEWED» (still a red), drops the gone
 * ones, and recomputes the `shown` lists and the counts; set each class by hand.
 * The whole census as a report (every sentence, every showing, every verdict):
 *   KEEP_RIGHT_CENSUS_DUMP=/abs/path.json npx vitest run …/keep-right-claim-census.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { containsStaffAnnotation } from "@/lib/content/sanitize";
import {
  AL1_SCOPE,
  districtRoadClass,
  dutyVerdict,
  exemptionVerdict,
  namesTwoOrMoreLanesOneWay,
  runCensus,
  sceneOf,
  sentencesOf,
  showingLine,
  statesTownExemption,
  strongOf,
  vocabOf,
  type Occurrence,
  type Surface,
} from "./keepRightCensus";
import { practiceServedQuestionIds, questionsAsServed } from "./servedQuestions";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "keep-right-claim-census.json");
const COUNTS_FILE = path.join(HERE, "keep-right-claim-census.counts.json");
const KNOWN_FILE = path.join(HERE, "keep-right-claim-census.known-theory.json");
const RECORD = process.env.RECORD_KEEP_RIGHT_CENSUS === "1";

type ClaimClass = "duty" | "exemption" | "both" | "other" | "UNREVIEWED";
interface Reviewed {
  note: string;
  sentences: Record<string, { class: ClaimClass; why?: string }>;
  /**
   * A decision for ONE showing of a sentence that is shown in more than one
   * place with different meanings — keyed «sentence @@ surface | locator».
   * Today exactly one: «ЗДвП чл. 15, ал. 1» is the keep-right duty on the
   * NOT_KEEPING_RIGHT card and the CARRIAGEWAY duty on OFF_CARRIAGEWAY.
   */
  occurrence: Record<string, { class: ClaimClass; why: string }>;
  shown: Record<string, string[]>;
}
/**
 * Road-less general statements of the theory module (question bank, concept
 * summaries) that assert the duty, or the town choice, WITHOUT its conditions
 * in the sentence, its unit or the question's stem. Exact sentences, each with
 * the reason it stands: an edit to one is a red, and so is a fix that leaves a
 * stale entry behind.
 */
interface KnownTheory {
  duty: Record<string, string>;
  exemption: Record<string, string>;
  /**
   * Round 5. Duty sentences of `duty` above that a student IS served on a TOWN
   * stem, each with the reason ал. 1 binds in that scene all the same (a
   * two-way street with one lane each way is not ал. 2, т. 2's street). Never
   * a stem that names two or more lanes one way — the test refuses it.
   */
  dutyOnTownSceneWhereAl1Binds: Record<string, string>;
}

const census = runCensus();
/** The question ids DEFAULT PRACTICE deals — asked of the product's own builder (servedQuestions.ts). */
const served = await practiceServedQuestionIds();
const reviewed = JSON.parse(fs.readFileSync(FIXTURE, "utf-8")) as Reviewed;
const known = JSON.parse(fs.readFileSync(KNOWN_FILE, "utf-8")) as KnownTheory;

const isDuty = (c: ClaimClass | undefined) => c === "duty" || c === "both";
const isExemption = (c: ClaimClass | undefined) => c === "exemption" || c === "both";
const isTheorySurface = (s: Surface) => s === "question" || s === "concept";
const occurrenceKey = (sentence: string, o: Occurrence) => `${sentence} @@ ${o.surface} | ${o.where}`;
/** The class of ONE showing: the sentence's, unless that showing has its own decision. */
const classAt = (sentence: string, o: Occurrence): ClaimClass =>
  reviewed.occurrence[occurrenceKey(sentence, o)]?.class ?? reviewed.sentences[sentence]?.class ?? "UNREVIEWED";

function shownOf(sentence: string): string[] {
  const occ = census.sentences.get(sentence) ?? [];
  return occ
    .map((o) => {
      const cls = classAt(sentence, o);
      const parts: string[] = [];
      if (isDuty(cls)) parts.push(`duty:${dutyVerdict(sentence, o)}`);
      if (isExemption(cls)) parts.push(`exemption:${exemptionVerdict(sentence, o)}`);
      if (parts.length === 0) parts.push(`${cls}: ${reviewed.occurrence[occurrenceKey(sentence, o)]?.why ?? ""}`);
      return showingLine(sentence, o, parts.join(" + "), served);
    })
    .sort();
}
function countsNow() {
  const by: Record<string, number> = { duty: 0, exemption: 0, both: 0, other: 0 };
  for (const v of Object.values(reviewed.sentences)) by[v.class] = (by[v.class] ?? 0) + 1;
  const bySurface: Record<string, number> = {};
  for (const occ of census.sentences.values()) {
    for (const k of new Set(occ.map((o) => o.surface))) bySurface[k] = (bySurface[k] ?? 0) + 1;
  }
  return { total: census.sentences.size, ...by, distractors: census.distractors, bySurface };
}

if (RECORD) {
  const next: Reviewed = { note: reviewed.note, sentences: {}, occurrence: reviewed.occurrence ?? {}, shown: {} };
  for (const s of [...census.sentences.keys()].sort()) next.sentences[s] = reviewed.sentences[s] ?? { class: "UNREVIEWED" };
  reviewed.sentences = next.sentences;
  reviewed.occurrence = next.occurrence;
  for (const [s, v] of Object.entries(next.sentences)) {
    if (isDuty(v.class) || isExemption(v.class)) next.shown[s] = shownOf(s);
  }
  fs.writeFileSync(FIXTURE, JSON.stringify(next, null, 1) + "\n");
  reviewed.shown = next.shown;
  fs.writeFileSync(COUNTS_FILE, JSON.stringify(countsNow(), null, 1) + "\n");
}
if (process.env.KEEP_RIGHT_CENSUS_DUMP) {
  const dump = [...census.sentences.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([s, occ]) => ({
      sentence: s,
      class: reviewed.sentences[s]?.class ?? "UNREVIEWED",
      why: reviewed.sentences[s]?.why,
      vocab: vocabOf(s),
      strong: strongOf(s),
      shown: occ.map((o) => showingLine(s, o, `duty:${dutyVerdict(s, o)} / exemption:${exemptionVerdict(s, o)}`, served)),
    }));
  fs.writeFileSync(
    process.env.KEEP_RIGHT_CENSUS_DUMP,
    JSON.stringify({ read: census.read, distractors: census.distractors, sentences: dump }, null, 1),
  );
}

describe("1. the matcher reads the claim, in the words it has been planted in", () => {
  /** Every false keep-right sentence a verifier planted in rounds 1–2, the
   *  retired slogans, and paraphrases. */
  const PLANTED = [
    "Извън изпреварване мястото ти е в най-дясната свободна лента.", // round-2 X01
    "А след маневрата се прибираш вдясно: в лявата лента не се пътува.", // X02
    "А лявата лента при свободна дясна е отделна грешка.", // X03
    "И в населено място лявата лента е само за изпреварване.", // X04
    "Първото има един отговор навсякъде: дясната лента — лявата е само за изпреварване, и в града.", // X05
    "Стигни края на отсечката в дясната лента — там е мястото ти", // Y01
    "Сигналът е задължителен винаги и навсякъде — както и дясната лента.", // Y02
    "Продължителното движение в лявата лента без изпреварване е второстепенна грешка.", // round-1 N13
    "А оставането в лявата лента при свободна дясна е отделно нарушение.", // N14
    "Дръж дясната — тя е лентата ти за движение.", // N15
    "Лявата лента се посещава.",
    "В дясната се живее.",
    "Лявата е за по-бързите.",
    "Правилото „дръж дясно“ важи навсякъде.",
    "Мястото ти е възможно най-вдясно.",
    "Лявата лента не е за движение „по принцип“ — тя е за изпреварване и завой наляво.",
    "Висенето в лявата лента е грешка на всеки път.",
    "В лявата лента се стои само докато изпреварваш (чл. 15).",
    "Извън изпреварване се движи във възможно най-дясната свободна лента.",
    "Вляво се кара само докато изпреварваш.",
    "След маневрата се върни вдясно — там се пътува.",
    "Не се задържай вляво: бързата лента е само за изпреварване.",
  ];

  it("every planted sentence carries the census vocabulary — none can enter the product unread", () => {
    expect(PLANTED.filter((s) => vocabOf(s).length === 0)).toEqual([]);
  });

  it("STRONG reads the duty in every one of them — none could be filed under «other» without a written reason", () => {
    // STRONG is not the gate (the vocabulary is: every sentence it catches must
    // be read and classified by a person). It only stops a reviewer from
    // filing an obvious duty sentence under «other» silently.
    expect(PLANTED.filter((s) => strongOf(s).length === 0)).toEqual([]);
  });

  it("a sentence that only turns, signals or looks to a side is NOT in the census (the vocabulary is about where to BE)", () => {
    for (const s of [
      "Завий надясно на кръстовището.",
      "Пусни десен мигач и погледни в дясното огледало.",
      "Пешеходец слиза на платното отляво.",
    ]) {
      expect(vocabOf(s), s).toEqual([]);
    }
  });

  it("ал. 1's scope and т. 2's two conditions are read from the sentence", () => {
    expect(AL1_SCOPE.test("Извън населено място използваш най-дясната свободна лента.")).toBe(true);
    expect(AL1_SCOPE.test("По магистралата мястото ти е възможно най-вдясно.")).toBe(true);
    expect(AL1_SCOPE.test("Където е разрешено над 80 км/ч, дясната е задължителна.")).toBe(true);
    expect(AL1_SCOPE.test("Лявата лента се посещава.")).toBe(false);
    expect(statesTownExemption("В населено място, на две и повече ленти в посока до 80 км/ч, избираш най-удобната.")).toBe(true);
    // one condition missing is not the exemption the law wrote
    expect(statesTownExemption("В населено място с очертани ленти можеш да избереш най-удобната.")).toBe(false);
    expect(statesTownExemption("В града, на две и повече ленти в посока, избираш най-удобната.")).toBe(false);
    expect(statesTownExemption("На две и повече ленти в посока до 80 км/ч избираш най-удобната.")).toBe(false);
  });

  it("the SCENE of a stem is read: ал. 1's own scope, a town, or no road — and ал. 2, т. 2's street (two or more lanes one way) is recognised", () => {
    // the R4-3 stem, and the town lane-choice question's
    const R43 = "В града двете ленти в твоята посока са задръстени. По някое време твоята дясна лента потегля и ти подминаваш няколко коли от лявата колона.";
    expect(sceneOf(R43)).toBe("town");
    expect(namesTwoOrMoreLanesOneWay(R43)).toBe(true);
    const BOULEVARD = "Караш лек автомобил в населено място по булевард с две ленти в твоята посока.";
    expect(sceneOf(BOULEVARD)).toBe("town");
    expect(namesTwoOrMoreLanesOneWay(BOULEVARD)).toBe(true);
    for (const stem of [
      "На градска улица с три ленти в една посока караш в средната.",
      "В града караш по платно с две и повече пътни ленти за движение в една посока.",
      "Булевардът е четирилентов.",
    ]) {
      expect(sceneOf(stem), stem).toBe("town");
      expect(namesTwoOrMoreLanesOneWay(stem), stem).toBe(true);
    }
    // a town street with ONE lane each way is a town scene, and not a т. 2 street
    const TWO_WAY = "Улицата е двупосочна и напълно празна, а колата ти се движи в лявата (насрещната) лента.";
    expect(sceneOf(TWO_WAY)).toBe("town");
    expect(namesTwoOrMoreLanesOneWay(TWO_WAY)).toBe(false);
    expect(sceneOf("Улицата, по която караш, има изградена велоалея.")).toBe("town");
    // ал. 1's own scope — «извънградски» and «извън населено място» are NOT towns
    expect(sceneOf("Движиш се извън населено място по път с две пътни ленти в твоята посока.")).toBe("al1-scope");
    expect(sceneOf("Караш бавен автомобил по двупосочен извънградски път и зад теб се е събрала колона.")).toBe("al1-scope");
    expect(sceneOf("Движиш се по трилентова автомагистрала при слаб трафик.")).toBe("al1-scope");
    // a stem that names BOTH is a town scene: a student can read the answer on a town street
    expect(sceneOf("Важи ли правилото и в населено място, и извън населено място?")).toBe("town");
    // no road at all
    expect(sceneOf("Автомобил е започнал да те изпреварва. Кое от изброените ти е забранено?")).toBe("no-road");
    expect(sceneOf("В коя част на двупосочен път трябва да се движиш при нормални условия?")).toBe("no-road");
    expect(sceneOf(undefined)).toBe("no-road");
  });
});

describe("2. every sentence with the vocabulary, anywhere in the product, has been read", () => {
  it("the census is not blind: every surface read its source", () => {
    // Floors (≈ 70 % of what each surface reads today), not pins: they fail
    // only if a source stops being read.
    const floors: Record<Surface, number> = {
      catalog: 390,
      consequences: 640,
      n38: 95,
      template: 2900,
      caption: 1300,
      theory: 760,
      question: 2700,
      concept: 1000,
      source: 3900,
    };
    for (const k of Object.keys(floors) as Surface[]) expect(census.read[k], k).toBeGreaterThan(floors[k]);
  });

  it("no sentence is unreviewed, and no reviewed sentence is gone (the list is exact)", () => {
    const now = [...census.sentences.keys()];
    const unreviewed = now.filter((s) => !reviewed.sentences[s] || reviewed.sentences[s].class === "UNREVIEWED");
    const stale = Object.keys(reviewed.sentences).filter((s) => !census.sentences.has(s));
    expect(unreviewed, "NEW sentences with keep-right vocabulary — read each against ЗДвП чл. 15, then classify it in the fixture").toEqual([]);
    expect(stale, "fixture entries whose sentence is no longer in the product").toEqual([]);
  });

  it("the count: sentences by class and by surface, and the distractors not read as claims", () => {
    expect(countsNow()).toEqual(JSON.parse(fs.readFileSync(COUNTS_FILE, "utf-8")));
  });
});

describe("3. a sentence that reads like the duty is never filed under «other» without a reason", () => {
  it("every STRONG sentence is «duty», «exemption», «both», or «other» with a written why", () => {
    const bad: string[] = [];
    for (const [s, v] of Object.entries(reviewed.sentences)) {
      if (v.class !== "other" || strongOf(s).length === 0) continue;
      if (!v.why || v.why.trim().length < 12) bad.push(`${strongOf(s).join("+")}: ${s}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("4. every sentence that asserts the keep-right duty is true where it is shown", () => {
  const onRoad: string[] = [];
  const theory = new Set<string>();
  for (const s of Object.keys(reviewed.sentences)) {
    for (const o of census.sentences.get(s) ?? []) {
      if (!isDuty(classAt(s, o)) || dutyVerdict(s, o) !== "UNBOUNDED") continue;
      if (isTheorySurface(o.surface)) theory.add(s);
      else onRoad.push(`${o.surface} | ${o.where} | ${s}`);
    }
  }

  it("no duty sentence is unbounded on a surface with a road (catalogue, consequences, exam sheet, templates, captions, theory beats, code)", () => {
    expect(onRoad).toEqual([]);
  });

  it("the road-less theory statements that are unbounded are exactly the known, reported list", () => {
    expect([...theory].sort()).toEqual(Object.keys(known.duty).sort());
  });

  it("the districts: the three lessons' boulevards and Лозенец are т. 2 streets to the built world, the motorway and the rural road are not", () => {
    for (const id of ["ov-keepright-v1", "ln-v1", "wb-boulevard-v1", "d2-v1"]) {
      expect(districtRoadClass(id).cls, id).not.toBe("binds");
      expect(districtRoadClass(id).t2, id).toBeGreaterThan(0);
    }
    expect(districtRoadClass("mw-v1").cls).toBe("binds");
    expect(districtRoadClass("mw-v1").binding).toBeGreaterThan(0);
    // one lane per direction: ал. 1's «възможно най-вдясно» is never switched off
    expect(districtRoadClass("ov-oncoming-v1")).toEqual({ cls: "binds", t2: 0, binding: 0 });
  });
});

describe("4b. SERVED — what a student is actually dealt, asked of the product (round 5, R4-3)", () => {
  const rows = questionsAsServed();
  const byStatus: Record<string, { served: number; parked: number }> = {};
  for (const q of rows) {
    const b = (byStatus[q.status] ??= { served: 0, parked: 0 });
    if (served.has(q.id)) b.served++;
    else b.parked++;
  }

  it("default practice deals EVERY approved row and EVERY needs-review row — a needs-review sentence is a sentence a student reads", () => {
    // This is the serving default R4-3 came through (modules/learning/session.ts:
    // `includeUnreviewed`, default true). The day the founder keeps unreviewed
    // rows out of practice this turns red ON PURPOSE: the «served» notes of the
    // reviewed list change with it and every one must be re-read.
    expect(rows.length).toBeGreaterThan(1000);
    expect(Object.keys(byStatus).sort()).toEqual(["approved", "needs-review"]);
    expect(byStatus.approved.parked).toBe(0);
    expect(byStatus["needs-review"].parked).toBe(0);
    expect(byStatus.approved.served).toBeGreaterThan(700);
    expect(byStatus["needs-review"].served).toBeGreaterThan(200);
    expect(served.size).toBe(rows.length);
  });

  it("the text the census reads is the SERVED text: no staff note is in it, though the bank's files carry them", () => {
    expect(rows.filter((q) => containsStaffAnnotation(q.explanationBg ?? "") || containsStaffAnnotation(q.textBg)).map((q) => q.id)).toEqual([]);
    // not vacuous: the R4-3 row's FILE has a [REVIEW: …] note in front of the explanation a student never sees
    const dir = path.join(HERE, "../../../../../../..", "content", "questions");
    const raw = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as { id: string; explanationBg?: string }[]);
    expect(raw.length).toBe(rows.length);
    expect(raw.filter((q) => containsStaffAnnotation(q.explanationBg ?? "")).length).toBeGreaterThan(50);
    expect(containsStaffAnnotation(raw.find((q) => q.id === "q-manevri-031")?.explanationBg ?? "")).toBe(true);
    // every sentence the census read on the question surface carries its row's status
    for (const occ of census.sentences.values()) {
      for (const o of occ) if (o.surface === "question") expect(o.status === "approved" || o.status === "needs-review", o.where).toBe(true);
    }
  });

  // THE RULE. A duty sentence, unbounded, that a student is served on a town
  // scene. Concept summaries have no status — the theory hub shows them all —
  // so they count as served, and their scene is their own text.
  const offenders: string[] = [];
  const excused = new Set<string>();
  for (const s of Object.keys(reviewed.sentences)) {
    for (const o of census.sentences.get(s) ?? []) {
      if (!isTheorySurface(o.surface)) continue;
      if (!isDuty(classAt(s, o)) || dutyVerdict(s, o) !== "UNBOUNDED") continue;
      const stem = o.scene ?? o.unit;
      if (sceneOf(stem) !== "town") continue;
      const isServed = o.surface === "concept" || (o.questionId !== undefined && served.has(o.questionId));
      if (!isServed) continue;
      if (!namesTwoOrMoreLanesOneWay(stem) && known.dutyOnTownSceneWhereAl1Binds[s] !== undefined) {
        excused.add(s);
        continue;
      }
      offenders.push(`${o.where} | ${o.status ?? "concept"} | ${namesTwoOrMoreLanesOneWay(stem) ? "TWO OR MORE LANES ONE WAY — ал. 2, т. 2's own street" : "town scene"} | ${s}`);
    }
  }

  it("NO duty sentence a student is served sits unbounded on a town scene (the q-manevri-031 class)", () => {
    expect(
      offenders,
      "a served sentence asserts чл. 15, ал. 1's duty on a town stem — in a settlement, on two or more marked lanes one way at ≤ 80 km/h, ал. 1 is not applied (ал. 2, т. 2): bound the sentence, or cite what the law says there",
    ).toEqual([]);
  });

  it("a duty sentence on a town stem is NOT bounded by another sentence of its explanation that names ал. 1's scope — only by its own words, or by the stem", () => {
    const town = "В града двете ленти в твоята посока са задръстени.";
    const duty = "Мястото ти е в най-дясната свободна лента (чл. 15, ал. 1).";
    const o: Occurrence = {
      surface: "question",
      where: "q-x:explanationBg",
      unit: `${town}\n${duty} Извън населено място глобата е същата.`,
      scene: town,
      road: { kind: "none" },
      questionId: "q-x",
      status: "approved",
    };
    expect(dutyVerdict(duty, o)).toBe("UNBOUNDED");
    // its own words bound it; so does a stem that is itself out of town
    expect(dutyVerdict("Извън населено място мястото ти е в най-дясната свободна лента.", o)).toBe("sentence-names-al1-scope");
    const rural = "Движиш се извън населено място по път с две ленти в твоята посока.";
    expect(dutyVerdict(duty, { ...o, unit: `${rural}\n${duty}`, scene: rural })).toBe("theory-scene-names-al1-scope");
  });

  it("no question a student is served on ал. 2, т. 2's own street — a town stem naming two or more lanes one way — CITES чл. 15, ал. 1 beside it", () => {
    // The lawRefs half of R4-3: the citation is printed beside the question
    // (WhyPanel, exam result, tutor) and is a claim like any sentence.
    const t2Stems = rows.filter((q) => served.has(q.id) && sceneOf(q.textBg) === "town" && namesTwoOrMoreLanesOneWay(q.textBg));
    const citing = t2Stems.filter((q) => q.lawRefs.some((r) => /^чл\. ?15, ал\. ?1(?!\d)/u.test(r.ref.trim()))).map((q) => q.id);
    expect(citing).toEqual([]);
    // not vacuous: the bank's two т. 2 stems are read
    expect(t2Stems.map((q) => q.id)).toEqual(expect.arrayContaining(["q-manevri-031", "q-manevri-032"]));
  });

  it("the town scenes where ал. 1 DOES bind are exactly the reviewed ones, each with its reason — and none of them names two or more lanes one way", () => {
    expect([...excused].sort()).toEqual(Object.keys(known.dutyOnTownSceneWhereAl1Binds).sort());
    for (const [s, why] of Object.entries(known.dutyOnTownSceneWhereAl1Binds)) {
      expect(why.length, s).toBeGreaterThan(40);
      expect(known.duty[s], `${s} — not in the known duty list`).toBeDefined();
      for (const o of census.sentences.get(s) ?? []) expect(namesTwoOrMoreLanesOneWay(o.scene ?? o.unit), `${o.where}: ${s}`).toBe(false);
    }
  });
});

describe("5. every sentence that states the town choice of lane carries т. 2's two conditions", () => {
  const onRoad: string[] = [];
  const theory = new Set<string>();
  for (const s of Object.keys(reviewed.sentences)) {
    for (const o of census.sentences.get(s) ?? []) {
      if (!isExemption(classAt(s, o)) || exemptionVerdict(s, o) !== "UNCONDITIONED") continue;
      if (isTheorySurface(o.surface)) theory.add(s);
      else onRoad.push(`${o.surface} | ${o.where} | ${s}`);
    }
  }

  it("in the sentence or its own unit — or it says «Тук» on a street that IS a т. 2 street", () => {
    expect(onRoad).toEqual([]);
  });

  it("the road-less theory statements without the conditions are exactly the known, reported list", () => {
    expect([...theory].sort()).toEqual(Object.keys(known.exemption).sort());
  });

  it("the known list holds nothing shown on a road, and every entry says why it stands", () => {
    for (const [s, why] of [...Object.entries(known.duty), ...Object.entries(known.exemption)]) {
      const occ = census.sentences.get(s) ?? [];
      expect(occ.length, s).toBeGreaterThan(0);
      expect(occ.every((o) => isTheorySurface(o.surface)), `${s} — also shown on a surface with a road`).toBe(true);
      expect(why.length, s).toBeGreaterThan(12);
    }
  });
});

describe("6. where each duty / exemption sentence is shown, and whether ал. 1 binds there", () => {
  it("equals the reviewed list (surface | locator | districts=class | verdict)", () => {
    const now: Record<string, string[]> = {};
    for (const [s, v] of Object.entries(reviewed.sentences)) {
      if (isDuty(v.class) || isExemption(v.class)) now[s] = shownOf(s);
    }
    expect(now).toEqual(reviewed.shown);
  });

  it("every per-showing decision names a showing that exists, and says why", () => {
    for (const [key, v] of Object.entries(reviewed.occurrence)) {
      const [sentence] = key.split(" @@ ");
      const occ = census.sentences.get(sentence) ?? [];
      expect(occ.some((o) => occurrenceKey(sentence, o) === key), key).toBe(true);
      expect(v.why.length, key).toBeGreaterThan(12);
    }
    // One today. A second is a decision someone must take on purpose.
    expect(Object.keys(reviewed.occurrence)).toEqual(["ЗДвП чл. 15, ал. 1 @@ catalog | VIOLATIONS.OFF_CARRIAGEWAY.lawRef"]);
  });

  it("the fixture's keys are single sentences (the splitter and the fixture agree)", () => {
    for (const s of Object.keys(reviewed.sentences)) expect(sentencesOf(s), s).toEqual([s]);
  });
});
