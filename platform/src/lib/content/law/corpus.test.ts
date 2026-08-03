/**
 * The law source layer, tested against the REAL corpus in content/law.
 *
 * The point of these tests is not that a function returns something — it is
 * that the something is the actual statute. Several assertions therefore quote
 * the law verbatim; if the corpus is ever rebuilt from a different file, they
 * fail loudly instead of quietly serving different numbers.
 */
import { describe, expect, it } from "vitest";
import {
  actIdForActName,
  describeControlPoints,
  describeExamPoints,
  describeFine,
  getArticle,
  getLawCorpus,
  getPenalty,
  listPenalties,
  normaliseForMatch,
  normaliseUnitRef,
  penaltiesForArticle,
  resolveCitation,
  resolveLawRef,
  verifyCitations,
} from "./index";
import {
  ControlPointsPenaltySchema,
  ExamPointsPenaltySchema,
  FinePenaltySchema,
  LawSourceSchema,
} from "./schemas";

// --------------------------------------------------------------------------
// The corpus itself
// --------------------------------------------------------------------------

describe("law corpus", () => {
  it("loads the three ingested acts", () => {
    const { acts } = getLawCorpus();
    expect([...acts.keys()].sort()).toEqual(["naredba-38", "naredba-iz-2539", "zdvp"]);
  });

  it("ЗДвП is the June 2026 consolidation the founder linked", () => {
    const zdvp = getLawCorpus().acts.get("zdvp")!;
    expect(zdvp.consolidatedThroughBg).toBe("ДВ, бр. 55 от 16.06.2026 г.");
    // The amendment history in the file itself must end at that amendment.
    expect(zdvp.promulgationBg).toContain("бр. 55 от 16.06.2026 г.");
  });

  it("addresses every article of ЗДвП, including the awkward ones", () => {
    const zdvp = getLawCorpus().acts.get("zdvp")!;
    expect(zdvp.units.length).toBeGreaterThanOrEqual(277);
    for (const ref of ["чл. 1", "чл. 5", "чл. 137в", "чл. 167а1", "чл. 189и", "чл. 190"]) {
      expect(zdvp.units.some((u) => u.ref === ref), `missing ${ref}`).toBe(true);
    }
  });

  it("pins every full-text source to an exact file (bytes + sha256)", () => {
    const full = getLawCorpus().sources.sources.filter((s) => s.coverage === "full-text");
    expect(full.length).toBe(3);
    for (const s of full) {
      expect(LawSourceSchema.safeParse(s).success).toBe(true);
      expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(s.bytes).toBeGreaterThan(0);
    }
    const zdvpSrc = full.find((s) => s.actId === "zdvp")!;
    expect(zdvpSrc.url).toContain("mtc.government.bg");
    expect(zdvpSrc.url).toContain("16062026");
    expect(zdvpSrc.sha256).toBe(
      "185cc3a5fc18b3cf0446470918b5feca85a619776d9567ceb78b01860d11a11e",
    );
  });

  it("catalogues the SARS нормативна база even where the text is not ingested", () => {
    const { sources } = getLawCorpus();
    expect(sources.registerUrl).toBe("https://www.sars.gov.bg/normativna-uredba/bg-zakonodatelstvo/");
    const indexOnly = sources.sources.filter((s) => s.coverage === "index-only");
    expect(indexOnly.length).toBeGreaterThanOrEqual(20);
    // Index-only entries must not pretend to carry text.
    for (const s of indexOnly) {
      expect(s.sha256).toBeNull();
      expect(s.extraction).toBeNull();
    }
    // The sign ordinance the sign catalogue cites is in the register.
    expect(sources.sources.some((s) => /РД-02-21-1/i.test(s.titleBg))).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Retrieval — a real article with its real text
// --------------------------------------------------------------------------

describe("getArticle", () => {
  it("returns the actual text of ЗДвП чл. 186 — the article that defines a ФИШ", () => {
    const hit = getArticle("zdvp", "чл. 186", { paragraphRef: "ал. 1" });
    expect(hit.found).toBe(true);
    if (!hit.found) return;
    expect(hit.unit.textBg).toContain("може да бъде наложена с фиш глоба");
    expect(hit.unit.textBg).toContain("за броя контролни точки, които се отнемат");
    expect(hit.unit.contextBg).toBe("Глава седма · АДМИНИСТРАТИВНОНАКАЗАТЕЛНА ОТГОВОРНОСТ");
    expect(hit.citationBg).toBe("ЗДвП, чл. 186, ал. 1 (ДВ, бр. 55 от 16.06.2026 г.)");
    expect(hit.source?.url).toContain("mtc.government.bg");
  });

  it("returns ЗДвП чл. 189 — the article that defines an АКТ", () => {
    const hit = getArticle("zdvp", "чл. 189");
    expect(hit.found).toBe(true);
    if (!hit.found) return;
    expect(hit.unit.textBg).toContain(
      "Актовете, с които се установяват нарушенията по този закон",
    );
  });

  it("returns the максимален размер of контролни точки from the наредба, not from memory", () => {
    const hit = getArticle("naredba-iz-2539", "чл. 2");
    expect(hit.found).toBe(true);
    if (!hit.found) return;
    expect(normaliseForMatch(hit.unit.textBg)).toContain(
      "Максималният размер на контролните точки за отчет на извършваните нарушения на Закона за движението по пътищата (ЗДвП) е 39",
    );
  });

  it("returns the theory-exam format from Наредба № 38 чл. 39 (docs/education/32 is law here)", () => {
    const hit = getArticle("naredba-38", "чл. 39", { paragraphRef: "ал. 1" });
    expect(hit.found).toBe(true);
    if (!hit.found) return;
    const text = normaliseForMatch(hit.unit.textBg);
    expect(text).toContain("съдържат 45 въпроса");
    expect(text).toContain("Максималният брой точки, от правилни отговори на всички изпитни въпроси, е 97");
    expect(text).toContain("не по-малко от 87 точки");
  });

  it("misses explicitly instead of guessing a nearby article", () => {
    const miss = getArticle("zdvp", "чл. 9999");
    expect(miss).toEqual({
      found: false,
      reason: "unit-not-found",
      queriedActId: "zdvp",
      queriedRef: "чл. 9999",
    });
    const noAct = getArticle("kodeks-na-truda", "чл. 1");
    expect(noAct.found).toBe(false);
    if (noAct.found) return;
    expect(noAct.reason).toBe("act-not-in-corpus");
  });
});

describe("ref + act normalisation", () => {
  it.each([
    ["Чл. 47", "чл. 47"],
    ["чл.47", "чл. 47"],
    ["чл. 47, ал. 1, т. 5", "чл. 47"],
    ["чл. 183а", "чл. 183а"],
    ["чл. 167а1", "чл. 167а1"],
    ["чл. 47 ?", "чл. 47"],
    ["Приложение № 5", "приложение № 5"],
    // A trailing Cyrillic word must never be eaten as a suffix letter. Both of
    // these silently produced "§ 6д" / "чл. 6о" before, i.e. a guaranteed miss.
    ["§ 6 ДР", "§ 6"],
    ["§ 6, т. 30 ДР", "§ 6"],
    ["§ 6а", "§ 6а"],
    ["чл. 6 от ЗДвП", "чл. 6"],
    ["чл. 183, ал. 4, т. 14", "чл. 183"],
  ])("normalises %s -> %s", (input, expected) => {
    expect(normaliseUnitRef(input)).toBe(expected);
  });

  it("resolves the ЗДвП definitions paragraph, the most-cited unit after the articles", () => {
    const hit = getArticle("zdvp", "§ 6, т. 30 ДР");
    expect(hit.found).toBe(true);
    if (!hit.found) return;
    expect(hit.unit.ref).toBe("§ 6");
    expect(hit.unit.contextBg).toBe("ДОПЪЛНИТЕЛНИ РАЗПОРЕДБИ");
    expect(hit.unit.textBg).toContain("По смисъла на този закон:");
    expect(hit.unit.textBg).toContain('"Път" е всяка земна площ или съоръжение');
  });

  it("returns null for something that is not a reference", () => {
    expect(normaliseUnitRef("параграф пети")).toBeNull();
  });

  it("maps act names used across content/ onto corpus acts", () => {
    expect(actIdForActName("ЗДвП")).toBe("zdvp");
    expect(actIdForActName("Закон за движението по пътищата")).toBe("zdvp");
    expect(actIdForActName("Наредба № Iз-2539")).toBe("naredba-iz-2539");
    expect(actIdForActName("Наредба № 38")).toBe("naredba-38");
    // Not in the corpus -> null, never a nearest match.
    expect(actIdForActName("Наредба РД-02-21-1/2023")).toBeNull();
  });
});

describe("resolveLawRef — the existing content citation shape", () => {
  it("resolves a lawRef exactly as content/ already writes it", () => {
    const hit = resolveLawRef({ act: "ЗДвП", ref: "чл. 47" });
    expect(hit.found).toBe(true);
    if (!hit.found) return;
    expect(hit.unit.ref).toBe("чл. 47");
    expect(hit.unit.textBg.startsWith("Чл. 47.")).toBe(true);
  });

  it("reports an act we have no text for without inventing one", () => {
    const miss = resolveLawRef({ act: "Наредба РД-02-21-1/2023", ref: "Приложение № 1" });
    expect(miss.found).toBe(false);
    if (miss.found) return;
    expect(miss.reason).toBe("act-not-in-corpus");
    expect(miss.queriedActId).toBeNull();
  });
});

// --------------------------------------------------------------------------
// Three systems, kept apart
// --------------------------------------------------------------------------

describe("penalty bank — three systems, never one number", () => {
  it("every citation quote really occurs in the stored statute", () => {
    const { acts, penalties } = getLawCorpus();
    expect(verifyCitations(acts, penalties)).toEqual([]);
  });

  it("keeps глоба / контролни точки / изпитни точки in separate fields", () => {
    for (const p of listPenalties()) {
      expect(FinePenaltySchema.safeParse(p.fine).success).toBe(true);
      expect(ControlPointsPenaltySchema.safeParse(p.controlPoints).success).toBe(true);
      if (p.examPoints) expect(ExamPointsPenaltySchema.safeParse(p.examPoints).success).toBe(true);
      expect(p.fine.system).toBe("fine");
      expect(p.controlPoints.system).toBe("controlPoints");
    }
  });

  it("marks фиш vs акт on every fine, with the rule that decides it", () => {
    for (const p of listPenalties()) {
      expect(["фиш", "акт"]).toContain(p.fine.instrument);
      const rule = resolveCitation(p.fine.instrumentSource);
      expect(rule.found, `${p.id} instrumentSource must resolve`).toBe(true);
      if (!rule.found) continue;
      expect(["чл. 186", "чл. 189"]).toContain(rule.unit.ref);
    }
  });

  it("the same behaviour costs different amounts in each system", () => {
    const p = getPenalty("pen-b2-no-stop-danger")!;
    expect(p.fine.amountBgn).toBe(200); // ЗДвП чл. 179, ал. 1
    expect(p.controlPoints.points).toBe(10); // Наредба № Iз-2539 чл. 6, ал. 1, т. 15
    expect(p.examPoints?.points).toBe(10); // Наредба № 38, прил. № 5 — a DIFFERENT 10
    expect(p.fine.source.actId).toBe("zdvp");
    expect(p.controlPoints.source.actId).toBe("naredba-iz-2539");
    expect(p.examPoints?.source.actId).toBe("naredba-38");
  });

  it("distinguishes the same manoeuvre with and without created danger", () => {
    const plain = getPenalty("pen-b2-no-stop")!;
    const danger = getPenalty("pen-b2-no-stop-danger")!;
    expect(plain.fine.amountBgn).toBe(100);
    expect(plain.fine.instrument).toBe("фиш");
    expect(plain.controlPoints.status).toBe("not-listed");
    expect(plain.controlPoints.points).toBe(0);
    expect(danger.fine.amountBgn).toBe(200);
    expect(danger.fine.instrument).toBe("акт");
    expect(danger.controlPoints.points).toBe(10);
  });

  it("a фиш-only offence takes no контролни точки, and says which list says so", () => {
    for (const p of listPenalties()) {
      if (p.controlPoints.status !== "not-listed") continue;
      expect(p.controlPoints.points).toBe(0);
      const list = resolveCitation(p.controlPoints.source);
      expect(list.found).toBe(true);
      if (!list.found) continue;
      expect(list.act.actId).toBe("naredba-iz-2539");
      expect(p.controlPoints.noteBg).toBeTruthy();
    }
  });

  it("finds the penalties attached to an article", () => {
    const hits = penaltiesForArticle("zdvp", "чл. 183");
    expect(hits.map((p) => p.id).sort()).toEqual([
      "pen-b2-no-stop",
      "pen-crosswalk-no-yield",
      "pen-red-light",
    ]);
  });
});

// --------------------------------------------------------------------------
// The founder's ruling, executable
// --------------------------------------------------------------------------

describe("ungrounded figures show the rule and the article, NO number", () => {
  it("renders a null value with a live citation and the reason", () => {
    const p = getPenalty("pen-crosswalk-no-yield")!;
    const exam = describeExamPoints(p)!;
    expect(p.examPoints?.status).toBe("unknown");
    expect(exam.valueBg).toBeNull(); // <- no digit, not "0", not "~10"
    expect(exam.citationBg).toContain("Наредба № 38");
    expect(exam.citationBg).toContain("приложение № 5");
    expect(exam.quoteBg.length).toBeGreaterThan(20);
    expect(exam.noteBg).toBeTruthy();
  });

  it("still renders the grounded figures of the same penalty", () => {
    const p = getPenalty("pen-crosswalk-no-yield")!;
    expect(describeFine(p).valueBg).toBe("150 лв. (акт)");
    expect(describeControlPoints(p).valueBg).toBe("10 контролни точки");
  });

  it("the schema refuses a number on an ungrounded figure", () => {
    const guessed = {
      system: "controlPoints" as const,
      status: "unknown" as const,
      points: 10, // a plausible guess — exactly what must not be storable
      source: {
        actId: "naredba-iz-2539",
        ref: "чл. 6",
        quoteBg: "се отнемат контролни точки, както следва",
      },
      noteBg: null,
    };
    const result = ControlPointsPenaltySchema.safeParse(guessed);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("NO NUMBER");
  });

  it("the schema refuses a missing number on a grounded figure", () => {
    const result = ControlPointsPenaltySchema.safeParse({
      system: "controlPoints",
      status: "grounded",
      points: null,
      source: { actId: "zdvp", ref: "чл. 183", quoteBg: "не осигури предимство" },
      noteBg: null,
    });
    expect(result.success).toBe(false);
  });

  it("a grounded figure's quote must actually STATE the number", () => {
    // Every fine quote in the bank says its own amount…
    for (const p of listPenalties()) {
      if (p.fine.status !== "grounded" || p.fine.amountBgn === null) continue;
      expect(p.fine.source.quoteBg, p.id).toContain(`${p.fine.amountBgn} лв.`);
    }
    // …and changing the amount without changing the law is caught.
    const { acts, penalties } = getLawCorpus();
    const tampered = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    tampered.fine.amountBgn = 500; // the quote still says 150 лв.
    const problems = verifyCitations(acts, [tampered]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("quote does not state the figure");
    expect(problems[0]).toContain("500 лв.");
  });

  it("the offence text is carried as a second, equally verified quote", () => {
    const p = getPenalty("pen-b2-no-stop")!;
    // The amount lives in the alinea opening, the behaviour in т. 14 below it.
    expect(p.fine.source.quoteBg).toBe("Наказва се с глоба 100 лв. водач, който:");
    expect(p.fine.source.contextQuoteBg).toContain("не спира на пътен знак");
    // …and both reach a renderer.
    const shown = describeFine(p);
    expect(shown.quoteBg).toContain("100 лв.");
    expect(shown.contextQuoteBg).toContain("не спира на пътен знак");
    expect(describeControlPoints(p).contextQuoteBg).toBeNull();
    const { acts } = getLawCorpus();
    const tampered = structuredClone(p);
    tampered.fine.source.contextQuoteBg = "кара с 300 km/h по тротоара";
    expect(verifyCitations(acts, [tampered])[0]).toContain("contextQuote is NOT in");
  });

  it("a citation whose quote is not in the law is rejected by verifyCitations", () => {
    const { acts, penalties } = getLawCorpus();
    const tampered = structuredClone(penalties[0] as unknown as (typeof penalties)[number]);
    tampered.controlPoints.source.quoteBg = "водачът се наказва с глоба 12 345 лв.";
    const problems = verifyCitations(acts, [tampered]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("quote is NOT in");
  });
});

// --------------------------------------------------------------------------
// Guard rails
// --------------------------------------------------------------------------

describe("corpus hygiene", () => {
  it("stores plain text — no markup that a renderer could execute", () => {
    for (const act of getLawCorpus().acts.values()) {
      for (const unit of act.units) {
        expect(unit.textBg, `${act.actId} ${unit.ref}`).not.toMatch(/<\s*(script|iframe|img|a)\b/i);
      }
    }
  });

  it("every act unit is uniquely addressable", () => {
    for (const act of getLawCorpus().acts.values()) {
      const refs = act.units.map((u) => u.ref);
      expect(new Set(refs).size).toBe(refs.length);
    }
  });

  it("every penalty is draft/needs-review until a human has checked it", () => {
    for (const p of listPenalties()) {
      expect(["draft", "needs-review", "approved"]).toContain(p.status);
    }
  });
});
