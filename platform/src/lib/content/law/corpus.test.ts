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
  describeDisqualification,
  describeExamPoints,
  describeFine,
  getArticle,
  getLawCorpus,
  getPenalty,
  listPenalties,
  normaliseForMatch,
  normaliseUnitRef,
  offencePhraseMatchesConduct,
  penaltiesForArticle,
  resolveCitation,
  resolveLawRef,
  verifyCitations,
  type PenaltyEntry,
} from "./index";
import {
  ControlPointsPenaltySchema,
  ExamPointsPenaltySchema,
  FinePenaltySchema,
  LawSourceSchema,
  PenaltyConductSchema,
  PenaltyEntrySchema,
} from "./schemas";

// --------------------------------------------------------------------------
// The corpus itself
// --------------------------------------------------------------------------

describe("law corpus", () => {
  it("loads every ingested act", () => {
    const { acts } = getLawCorpus();
    expect([...acts.keys()].sort()).toEqual([
      "naredba-38",
      "naredba-8121z-532",
      "naredba-iz-2539",
      "naredba-iz-2539-consolidated-dv49-2026",
      "naredba-sredstva-za-izmervane",
      "zdvp",
    ]);
  });

  /**
   * The two Наредба № Iз-2539 texts disagree, so which one a citation reaches
   * cannot be left to luck. A BARE NAME MEANS THE TEXT IN FORCE — it used to
   * mean the 2025 snapshot, on the reasoning that no existing citation should
   * silently move, and that is precisely how „0 контролни точки" ended up cited
   * to a copy of the exhaustive list with a PDF page footer inside чл. 6. The
   * snapshot is kept so a superseded figure can be QUOTED, and it now answers
   * only to a citation that names 2025.
   */
  it("tells the two Наредба № Iз-2539 texts apart by the version in the citation", () => {
    expect(actIdForActName("Наредба № Iз-2539")).toBe("naredba-iz-2539-consolidated-dv49-2026");
    for (const versioned of [
      "Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.)",
      "Наредба № Iз-2539 (консолидирана 2026)",
      "Наредба № Iз-2539, изм. ДВ бр. 49",
    ]) {
      expect(actIdForActName(versioned), versioned).toBe("naredba-iz-2539-consolidated-dv49-2026");
    }
    // The photograph, reachable only by saying so.
    for (const dated of [
      "Наредба № Iз-2539 (ред. 28.01.2025 г.)",
      "Наредба № Iз-2539 (изм. ДВ, бр. 108 от 2024 г.)",
    ]) {
      expect(actIdForActName(dated), dated).toBe("naredba-iz-2539");
    }
    // …and they really do disagree, which is why the split exists at all.
    const snapshot = getArticle("naredba-iz-2539", "чл. 6")!;
    const current = getArticle("naredba-iz-2539-consolidated-dv49-2026", "чл. 6")!;
    expect(snapshot.found && snapshot.unit.textBg).toContain("- 8 контролни точки");
    expect(current.found && current.unit.textBg).toContain("- 10 контролни точки");
  });

  it("can open the tolerance chain a camera fine rests on", () => {
    // No article of ЗДвП states the deduction; it is two delegations away, and
    // that is why „3 km/h" reads as folk knowledge. Both links are now openable.
    const order = getArticle("naredba-8121z-532", "чл. 16");
    expect(order.found).toBe(true);
    if (order.found) expect(order.unit.textBg).toContain("приспада максимално допустимата грешка");
    const size = getArticle("naredba-sredstva-za-izmervane", "чл. 425");
    expect(size.found).toBe(true);
    if (size.found) {
      expect(size.unit.textBg).toContain("± 3 km/h за скорости до 100 km/h");
      expect(size.unit.textBg).toContain("± 3 % от измерената стойност за скорости над 100 km/h");
    }
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
    // 3 consolidated acts + the 2 ЗИД acts of Наредба № Iз-2539 registered on
    // 2026-08-09, + the 3 registered for the speeding ladder on the same day.
    //
    // The SARS copy of Наредба № Iз-2539 is still the 28.01.2025 snapshot
    // (measured: the pinned URL returns the recorded 226435 bytes,
    // last-modified 28.01.2025), so it carries neither ДВ, бр. 22 от 2026 г.
    // nor бр. 49 — holding the amending acts is how a superseded figure gets
    // NAMED instead of silently served. It is no longer the only recourse:
    // src-naredba-iz-2539-consolidated-lex is a text consolidated THROUGH
    // бр. 49, held under its own actId so that swapping penalties.json onto it
    // stays a deliberate act rather than a side effect of a re-fetch.
    //
    // The other two are what makes the camera tolerance citable at all:
    // Наредба № 8121з-532 чл. 16, ал. 5 orders the максимално допустима грешка
    // deducted from the measured speed, and НСИПМК чл. 425 is where that error
    // is ± 3 km/h (≤ 100 km/h) / ± 3 % (above).
    expect(full.length).toBe(8);
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
    // THE ABBREVIATION IS A NUMBER. Returning null for „прил. № 2" did not just
    // fail to resolve — every citation gate in the repo reads null as
    // „numberless", the one verdict that lets a ref through on an act we cannot
    // open. 74 bank citations rode that hole (40 distinct, all on
    // Наредба № РД-02-21-1). If these rows go red, the hole is back.
    ["прил. № 2, знак Б2", "приложение № 2"],
    ["прил. № 5", "приложение № 5"],
    ["прил.5", "приложение № 5"],
    ["Прил. № 3, знаци В26 и В33", "приложение № 3"],
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
    // „прил" is a prefix of ordinary Bulgarian words. Widening the annex form
    // to the abbreviation must not turn prose into a citation — a false
    // POSITIVE here would refuse honest numberless refs, which is the same
    // damage in the other direction.
    expect(normaliseUnitRef("прилагане на знака")).toBeNull();
    expect(normaliseUnitRef("приложим за товарни автомобили")).toBeNull();
    // The numberless shape the ruling actually wants, unchanged.
    expect(normaliseUnitRef("знак Б2")).toBeNull();
    expect(normaliseUnitRef("група В (забранителни знаци)")).toBeNull();
  });

  it("maps act names used across content/ onto corpus acts", () => {
    expect(actIdForActName("ЗДвП")).toBe("zdvp");
    expect(actIdForActName("Закон за движението по пътищата")).toBe("zdvp");
    // A bare наредба name means the text in force, like every other row here.
    expect(actIdForActName("Наредба № Iз-2539")).toBe("naredba-iz-2539-consolidated-dv49-2026");
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

  it("marks фиш / електронен фиш / акт on every fine, with the rule that permits it", () => {
    for (const p of listPenalties()) {
      if (p.fine.instrument === null) {
        // No instrument may be claimed where the ban is unestablished, and the
        // citation goes with it — see the derivation test below.
        expect(p.fine.instrumentSource, `${p.id} must not cite a rule it does not invoke`).toBeNull();
        continue;
      }
      expect(["фиш", "електронен фиш", "акт"]).toContain(p.fine.instrument);
      expect(p.fine.instrumentSource, `${p.id} names an instrument, so it must cite the rule`).not.toBeNull();
      const rule = resolveCitation(p.fine.instrumentSource!);
      expect(rule.found, `${p.id} instrumentSource must resolve`).toBe(true);
      if (!rule.found) continue;
      expect(["чл. 186", "чл. 189"]).toContain(rule.unit.ref);
    }
  });

  /**
   * THE REGRESSION GUARD FOR THIS WHOLE DIRECTORY.
   *
   * Three of the first six entries said "акт" because someone reasoned „това
   * носи контролни точки, значи трябва наказателно постановление". That
   * inference died with ДВ, бр. 64 от 2025 г. The instrument follows the BAN,
   * and nothing else — so assert the derivation over every entry rather than
   * spot-checking the three that were wrong.
   */
  it("derives the instrument from лишаване от право, never from the контролни точки", () => {
    for (const p of listPenalties()) {
      const ban = p.disqualification;
      if (ban.status === "grounded") {
        expect(p.fine.instrument, `${p.id}: ban ⇒ акт only`).toBe("акт");
      } else if (ban.status === "not-listed") {
        expect(["фиш", "електронен фиш"], `${p.id}: no ban ⇒ a фиш is lawful`).toContain(
          p.fine.instrument,
        );
      } else {
        expect(p.fine.instrument, `${p.id}: ban unknown ⇒ claim no instrument`).toBeNull();
      }
      // …and the points must NOT be able to predict it. pen-b2-no-stop-danger
      // costs 10 контролни точки and still arrives on a фиш; pen-alcohol-05-08
      // has no points figure at all and can only arrive on an акт.
    }
    const danger = getPenalty("pen-b2-no-stop-danger")!;
    expect(danger.controlPoints.points).toBe(10);
    expect(danger.fine.instrument).toBe("фиш");
  });

  it("says what the camera can and cannot send you", () => {
    // The founder's own ticket: 78 km/h measured on a 50 road, 3 km/h deducted,
    // 25 over → чл. 182, ал. 1, т. 3. Money only.
    const his = getPenalty("pen-speeding-urban-21-30")!;
    expect(his.fine.amountBgn).toBe(100);
    expect(his.fine.instrument).toBe("електронен фиш");
    expect(his.controlPoints.points).toBe(0); // NOT his licence
    expect(his.disqualification.status).toBe("not-listed"); // which is why a camera may issue it
    expect(his.examPoints?.points).toBe(10); // a DIFFERENT 10 — the exam sheet
    // …and the rule that lets the camera do it is the ban-free condition itself.
    expect(his.fine.instrumentSource!.paragraphRef).toBe("ал. 4");
    expect(his.fine.instrumentSource!.quoteBg).toContain("не е предвидено наказание лишаване");
  });

  it("the same behaviour costs different amounts in each system", () => {
    const p = getPenalty("pen-b2-no-stop-danger")!;
    expect(p.fine.amountBgn).toBe(200); // ЗДвП чл. 179, ал. 1
    expect(p.controlPoints.points).toBe(10); // Наредба № Iз-2539 чл. 6, ал. 1, т. 15
    expect(p.examPoints?.points).toBe(10); // Наредба № 38, прил. № 5 — a DIFFERENT 10
    expect(p.fine.source.actId).toBe("zdvp");
    expect(p.controlPoints.source.actId).toBe("naredba-iz-2539-consolidated-dv49-2026");
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
    // CORRECTED 2026-08-09. This asserted "акт" on the inference „контролни
    // точки се отнемат само с наказателно постановление, значи по акт". ДВ,
    // бр. 64 от 2025 г. (в сила от 7.09.2025 г.) ended that: it added „за броя
    // контролни точки, които се отнемат" to the data a ФИШ must carry
    // (чл. 186, ал. 1), and ал. 8 makes an unpaid фиш an enforceable
    // наказателно постановление. The only test чл. 186, ал. 1 states is whether
    // ЛИШАВАНЕ is provided — and чл. 179 contains the word zero times
    // (measured against the ingested ЗДвП, consolidated to ДВ, бр. 55 от
    // 16.06.2026). So a фиш is permissible here, and the danger tier is still
    // distinguished by what actually differs: 200 лв. against 100, and 10
    // контролни точки against none.
    expect(danger.fine.instrument).toBe("фиш");
    expect(danger.controlPoints.points).toBe(10);
    expect(plain.controlPoints.points).toBe(0);
  });

  it("a фиш-only offence takes no контролни точки, and says which list says so", () => {
    for (const p of listPenalties()) {
      if (p.controlPoints.status !== "not-listed") continue;
      expect(p.controlPoints.points).toBe(0);
      const list = resolveCitation(p.controlPoints.source);
      expect(list.found).toBe(true);
      if (!list.found) continue;
      expect(list.act.actId).toBe("naredba-iz-2539-consolidated-dv49-2026");
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

  it("keeps the four consequences of one offence in four separate fields", () => {
    // Same tier, four answers, four scales, four different documents. This is
    // the shape a result screen needs so it can never print a bare „−10 т.".
    const p = getPenalty("pen-speeding-urban-21-30")!;
    expect(describeFine(p).valueBg).toBe("51,13 € (100 лв.) (електронен фиш)");
    expect(describeControlPoints(p).valueBg).toBe("0 контролни точки");
    expect(describeDisqualification(p).valueBg).toBe("не се предвижда лишаване от право");
    expect(describeExamPoints(p)!.valueBg).toBe("10 наказателни точки (опасна грешка)");
    // Three different acts behind them — nothing here is one number reused.
    expect(p.fine.source.actId).toBe("zdvp");
    expect(p.controlPoints.source.actId).toBe("naredba-iz-2539-consolidated-dv49-2026");
    expect(p.examPoints!.source.actId).toBe("naredba-38");
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
    // "(фиш)" since 2026-08-09 — чл. 183, ал. 5 provides no лишаване (лишаване
    // appears in чл. 183 only at ал. 6 повторно and ал. 7/8), so чл. 186, ал. 1
    // permits a фиш, and the same алинея now makes the фиш carry the points.
    expect(describeFine(p).valueBg).toBe("76,69 € (150 лв.) (фиш)");
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
// A quote can be verbatim, contain the figure, and still be about someone
// else's offence — the hole all of the above rode through
// --------------------------------------------------------------------------

describe("a grounded figure must name the offence it prices", () => {
  /**
   * THE SIX ROWS. Наредба № 38, приложение № 5, т. 10, б. „в" states „10
   * наказателни точки" ONCE, in a header, then lists six offences under it. All
   * six penalties with an examPoints figure carried the header plus the FIRST
   * indent — the traffic-light case — so a student who sped, who missed a Б2 or
   * who failed to yield at a crossing was shown a sentence about a red light as
   * the source of his 10 points. Both existing checks passed on all six: the
   * quote WAS in the act, and it DID contain the number.
   */
  it("each examPoints citation quotes its OWN enumerated case, not the first one", () => {
    const expected: Record<string, string> = {
      "pen-b2-no-stop": "не спре при наличието на пътен знак Б2",
      "pen-b2-no-stop-danger": "не спре при наличието на пътен знак Б2",
      "pen-red-light": "не изпълни забраняващ сигнал на светофар",
      "pen-crosswalk-no-yield": "създаде предпоставка за допускане на ПТП",
      "pen-speeding-urban-11-20": "превиши максимално допустимата скорост",
      "pen-speeding-urban-21-30": "превиши максимално допустимата скорост",
    };
    const seen: string[] = [];
    for (const p of listPenalties()) {
      if (!p.examPoints) continue;
      seen.push(p.id);
      const want = expected[p.id];
      expect(want, `${p.id} has an examPoints figure but no expected case here`).toBeDefined();
      const shown = `${p.examPoints.source.quoteBg} ${p.examPoints.source.contextQuoteBg ?? ""}`;
      expect(shown, p.id).toContain(want);
    }
    expect(seen.sort()).toEqual(Object.keys(expected).sort());
    // …and the header that carries the number is still the same one for all of
    // them, because the act really does state the figure once.
    for (const p of listPenalties()) {
      if (!p.examPoints) continue;
      expect(p.examPoints.source.quoteBg).toContain("10 наказателни точки в следните случаи:");
    }
  });

  it("verifyCitations refuses a grounded figure whose quotes are about another offence", () => {
    const { acts, penalties } = getLawCorpus();
    // Re-enter the defect exactly: give the speeding row the traffic-light case.
    const relapse = structuredClone(penalties.find((p) => p.id === "pen-speeding-urban-21-30")!);
    relapse.examPoints!.source.contextQuoteBg =
      "когато изпитваният не изпълни забраняващ сигнал на светофар или указания на регулировчик;";
    const problems = verifyCitations(acts, [relapse]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("the quotes shown never name the offence");
  });

  it("verifyCitations refuses a grounded figure that names no offence at all", () => {
    const { acts, penalties } = getLawCorpus();
    const bare = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    delete bare.controlPoints.source.offencePhraseBg;
    const problems = verifyCitations(acts, [bare]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("must name the offence it prices");
  });

  it("…and refuses an offence phrase that is our wording rather than the act's", () => {
    const { acts, penalties } = getLawCorpus();
    const paraphrase = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    paraphrase.controlPoints.source.offencePhraseBg = "минаване на червено";
    const problems = verifyCitations(acts, [paraphrase]);
    // Not in the наредба, and therefore not in the quotes either — two problems,
    // and either one alone would have stopped it.
    expect(problems.length).toBeGreaterThanOrEqual(1);
    expect(problems.join("\n")).toContain("offencePhrase is NOT in");
  });

  it("every grounded figure in the bank carries one, and it is the act's wording", () => {
    for (const p of listPenalties()) {
      for (const [field, fig] of [
        ["fine", p.fine],
        ["controlPoints", p.controlPoints],
        ["disqualification", p.disqualification],
        ...(p.examPoints ? ([["examPoints", p.examPoints]] as const) : []),
      ] as const) {
        if (fig.status !== "grounded") continue;
        expect(fig.source.offencePhraseBg, `${p.id}.${field}`).toBeTruthy();
      }
    }
  });
});

// --------------------------------------------------------------------------
// …and „the offence it names" must be THIS ROW'S offence.
//
// Everything above compares a citation with ITSELF. That is enough to catch a
// quote that is not in the act, a figure the quote does not state and a phrase
// the quotes do not contain — and it is not enough to catch the defect the
// phrase was added for, because the same hand writes the quote, the context
// AND the phrase. The row's `conduct` declaration is the first thing in this
// layer that a citation does not own.
// --------------------------------------------------------------------------

describe("the offence named must be the offence the ROW prices", () => {
  /**
   * THE FOUR ATTACKS, in one list, so the set is reviewable rather than
   * scattered. Each returns a tampered clone of a real row; each must be
   * refused, and the fragment says by which check.
   *
   * The fourth is the one that rode through the gate that was built to stop
   * the first three — a citation that is verbatim, states its figure, names an
   * offence, and is internally consistent about an offence this row does not
   * price. Before `conduct` existed it returned [].
   */
  const ATTACKS: Array<{
    name: string;
    row: string;
    tamper: (p: PenaltyEntry) => void;
    expect: string;
  }> = [
    {
      name: "1. the wrong enumerated case with the right header",
      row: "pen-speeding-urban-21-30",
      tamper: (p) => {
        p.examPoints!.source.contextQuoteBg =
          "когато изпитваният не изпълни забраняващ сигнал на светофар или указания на регулировчик;";
      },
      expect: "the quotes shown never name the offence",
    },
    {
      name: "2. the offence phrase deleted",
      row: "pen-red-light",
      tamper: (p) => {
        delete p.controlPoints.source.offencePhraseBg;
      },
      expect: "must name the offence it prices",
    },
    {
      name: "3. our paraphrase substituted for the act's wording",
      row: "pen-red-light",
      tamper: (p) => {
        p.controlPoints.source.offencePhraseBg = "минаване на червено";
      },
      expect: "offencePhrase is NOT in",
    },
    {
      name: "4. a COHERENT citation about a different offence",
      row: "pen-speeding-urban-21-30",
      tamper: (p) => {
        // Verbatim from приложение № 5, and the phrase agrees with the quote.
        // Every check that existed before `conduct` is satisfied.
        p.examPoints!.source.contextQuoteBg =
          "когато изпитваният не изпълни забраняващ сигнал на светофар или указания на регулировчик;";
        p.examPoints!.source.offencePhraseBg =
          "когато изпитваният не изпълни забраняващ сигнал на светофар или указания на регулировчик";
      },
      expect: "the offence named is not the offence this row prices",
    },
  ];

  it.each(ATTACKS)("refuses attack $name", ({ row, tamper, expect: fragment }) => {
    const { acts, penalties } = getLawCorpus();
    const tampered = structuredClone(penalties.find((p) => p.id === row)!);
    tamper(tampered);
    const problems = verifyCitations(acts, [tampered]);
    expect(problems.join("\n"), `attack was not refused: ${row}`).toContain(fragment);
  });

  /**
   * THE FIFTH, found by attacking the fix rather than reading it — and it is
   * the same defect one notch finer, so it is worth its own test.
   *
   * ЗДвП чл. 182 is ONE unit holding six tiers. „за превишаване от 21 до 30
   * km/h" is as verbatim as „от 11 до 20" and lives in the same article, so
   * moving it onto the 11–20 row keeps every earlier check green: the quote
   * that carries „50 лв." is a DIFFERENT string from the one that names the
   * offence, so the amount check never looks at the tier. The student is shown
   * 50 лв. under the sentence that prices 100.
   *
   * The tier anchor is what refuses it, which is why the two speeding rows'
   * declarations are written tight rather than as „превишаване на скоростта".
   */
  it("refuses the tier swap inside one article — 50 лв. under the 100 лв. sentence", () => {
    const { acts, penalties } = getLawCorpus();
    const tampered = structuredClone(penalties.find((p) => p.id === "pen-speeding-urban-11-20")!);
    tampered.fine.source.contextQuoteBg = "за превишаване от 21 до 30 km/h - с глоба 100 лв.;";
    tampered.fine.source.offencePhraseBg = "за превишаване от 21 до 30 km/h";
    expect(tampered.fine.amountBgn).toBe(50); // still the row's own figure
    const problems = verifyCitations(acts, [tampered]);
    expect(problems.join("\n")).toContain("the offence named is not the offence this row prices");
  });

  /**
   * THE DECLARATION IS NOT A FREE PASS. `conduct` only helps if it cannot be
   * moved to fit the citation someone wants to keep — otherwise the attacker
   * edits two fields instead of one and the gate is theatre. Each of these is a
   * separate rope tying the declaration to the law.
   */
  it("refuses a conduct declaration rewritten to fit the wrong citation", () => {
    const { acts, penalties } = getLawCorpus();
    const moved = structuredClone(penalties.find((p) => p.id === "pen-speeding-urban-21-30")!);
    // The full attack: change the citation AND re-declare the row as being
    // about traffic lights. ЗДвП чл. 182 — the row's own lawRef, the article
    // its fine is cut from — contains neither word.
    moved.examPoints!.source.contextQuoteBg =
      "когато изпитваният не изпълни забраняващ сигнал на светофар или указания на регулировчик;";
    moved.examPoints!.source.offencePhraseBg =
      "когато изпитваният не изпълни забраняващ сигнал на светофар или указания на регулировчик";
    moved.conduct = {
      statementBg: "Водачът преминава при сигнал на светофара, който не разрешава преминаването.",
      anchorsBg: [["светофар"], ["сигнал"]],
    };
    const problems = verifyCitations(acts, [moved]);
    expect(problems.join("\n")).toContain("occurs nowhere in ЗДвП чл. 182");
  });

  it("refuses a statement that has drifted from the anchors it is supposed to explain", () => {
    const { acts, penalties } = getLawCorpus();
    const drifted = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    drifted.conduct.statementBg = "Водачът навлиза в кръстовище, без да пропусне идващите отдясно.";
    expect(verifyCitations(acts, [drifted]).join("\n")).toContain("statementBg does not satisfy");
  });

  it("refuses a figure smuggled into the declaration (ADR-002 — where „50 метра“ would have lived)", () => {
    const { acts, penalties } = getLawCorpus();
    const invented = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    invented.conduct.statementBg =
      "Водачът преминава при сигнал на светофара, който не разрешава преминаването, на по-малко от 50 метра от кръстовището.";
    expect(verifyCitations(acts, [invented]).join("\n")).toContain("statementBg states „50");
  });

  /**
   * WIDENING is how a check like this dies — not by being deleted, but by
   * growing an anchor list that accepts everything. The rule and its LIMIT,
   * both measured, because the limit is the part worth knowing:
   *
   *   refused — an alternative NO phrase on the row uses. It cannot be doing
   *             anything today, so the only thing it can do is admit a phrase
   *             that is not here yet.
   *   allowed — an alternative that is merely redundant. „скорост" looks like
   *             a widening and is not caught, because Наредба № 38 really does
   *             say „максимално допустимата скорост" — the phrase uses it. The
   *             check measures dead weight, not looseness.
   */
  it("refuses a WIDENED anchor, and does not pretend to catch a redundant one", () => {
    const { acts, penalties } = getLawCorpus();
    const row = penalties.find((p) => p.id === "pen-speeding-urban-21-30")!;

    const dead = structuredClone(row);
    // Verbatim in чл. 182 (it is how т. 5 and т. 6 read), so the grounding
    // check would pass it. Nothing on THIS row says it: the 21–30 tier carries
    // no ban. An anchor group that accepts it is a group waiting for the wrong
    // sentence.
    dead.conduct.anchorsBg = [
      ["превишаване", "превиши", "лишаване от право"],
      ["от 21 до 30", "с повече от 10 km/h"],
    ];
    expect(verifyCitations(acts, [dead]).join("\n")).toContain(
      'offers "лишаване от право", which no offence phrase on this row uses',
    );

    const redundant = structuredClone(row);
    redundant.conduct.anchorsBg = [
      ["превишаване", "превиши", "скорост"],
      ["от 21 до 30", "с повече от 10 km/h"],
    ];
    expect(verifyCitations(acts, [redundant])).toEqual([]);
  });

  it("refuses a row whose lawRefs point away from the article its fine is cut from", () => {
    const { acts, penalties } = getLawCorpus();
    const detached = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    detached.lawRefs = [{ act: "ЗДвП", ref: "чл. 186" }];
    expect(verifyCitations(acts, [detached]).join("\n")).toContain("which is not in lawRefs");
  });

  it("the schema refuses a conduct with no anchors at all", () => {
    const empty = PenaltyConductSchema.safeParse({
      statementBg: "Водачът прави нещо, което не е описано с нито една дума.",
      anchorsBg: [],
    });
    expect(empty.success).toBe(false);
    expect(JSON.stringify(empty.error)).toContain("satisfied by every sentence");
    // …and a group of fragments too short to identify anything.
    const tiny = PenaltyConductSchema.safeParse({
      statementBg: "Водачът превишава разрешената максимална скорост в населено място.",
      anchorsBg: [["на", "по"]],
    });
    expect(tiny.success).toBe(false);
  });

  /**
   * HOW WELL DO THE ANCHORS ACTUALLY DISCRIMINATE? Measured, not asserted.
   *
   * For every pair of rows, does A's declaration accept a phrase B uses? Every
   * survivor is printed and the set is PINNED, because the honest answer is not
   * „none": two pairs of rows genuinely share a sentence, and in both cases it
   * is Наредба № 38's exam indent, which does not grade in tiers — приложение
   * № 5 marks „не спре при наличието на пътен знак Б2" whether or not danger
   * followed, and „превиши … с повече от 10 km/h" whether the excess was 15 or
   * 25. The rows differ on the road articles, not on the exam sheet.
   *
   * A NEW pair appearing here means one of two things, and both need a human:
   * an anchor set has been widened until it accepts someone else's offence, or
   * two rows have collapsed into the same conduct and one of them is redundant.
   */
  it("measures the cross-row confusions and pins the set", () => {
    const rows = listPenalties();
    const phrasesOf = (p: (typeof rows)[number]): string[] =>
      [p.fine, p.controlPoints, p.disqualification, p.examPoints]
        .filter((f) => f !== null && f !== undefined)
        .filter((f) => f!.status !== "unknown")
        .map((f) => f!.source.offencePhraseBg)
        .filter((q): q is string => q !== undefined);

    const confusions: string[] = [];
    for (const a of rows) {
      for (const b of rows) {
        if (a.id === b.id) continue;
        for (const phrase of phrasesOf(b)) {
          if (!offencePhraseMatchesConduct(phrase, a.conduct)) continue;
          confusions.push(`${a.id} accepts ${b.id}: „${phrase}"`);
        }
      }
    }
    console.log(`\n[conduct] cross-row confusions:\n  ${confusions.join("\n  ") || "(none)"}`);
    expect([...new Set(confusions)].sort()).toEqual([
      'pen-b2-no-stop accepts pen-b2-no-stop-danger: „когато изпитваният не спре при наличието на пътен знак Б2"',
      'pen-b2-no-stop-danger accepts pen-b2-no-stop: „когато изпитваният не спре при наличието на пътен знак Б2"',
      'pen-speeding-urban-11-20 accepts pen-speeding-urban-21-30: „когато изпитваният превиши максимално допустимата скорост за движение с повече от 10 km/h"',
      'pen-speeding-urban-21-30 accepts pen-speeding-urban-11-20: „когато изпитваният превиши максимално допустимата скорост за движение с повече от 10 km/h"',
    ]);
    // Both survivors are the exam sheet, and both rows really do carry that
    // exact citation today. Nothing from the ЗДвП or the контролни точки
    // наредба — the documents that price the difference — crosses a row.
    for (const c of confusions) expect(c).toContain("когато изпитваният");
  });

  it("every row declares its conduct in the act's words, and the bank passes", () => {
    const { acts, penalties } = getLawCorpus();
    expect(penalties.every((p) => p.conduct.anchorsBg.length > 0)).toBe(true);
    expect(verifyCitations(acts, penalties)).toEqual([]);
  });

  /**
   * THE FLOOR, PINNED SO NOBODY MISTAKES IT FOR COVERAGE.
   *
   * Every rope in this file ties one piece of the act to another piece of the
   * act. `titleBg` and `summaryBg` are OURS — the words a student reads in a
   * list before he opens anything — and nothing ties them to the conduct the
   * row declares. Rewrite the title of the speeding row to „Преминава на
   * червено" and the loader is silent, because every citation is still about
   * speeding and still verified.
   *
   * It is not closed here, and the reason is a content decision rather than a
   * gate one: the natural tie is „the title must satisfy the row's anchors",
   * and measured against today's titles it fails on both speeding rows —
   * „Превишена скорост … с 21 – 30 km/h" carries neither „превишаване" nor „от
   * 21 до 30". Closing it means rewriting student-facing titles into statutory
   * vocabulary, which is the founder's call, not a loader's.
   */
  it("does NOT check the row's own label — the last untied field", () => {
    const { acts, penalties } = getLawCorpus();
    const mislabelled = structuredClone(penalties.find((p) => p.id === "pen-speeding-urban-21-30")!);
    mislabelled.titleBg = "Преминава на червено";
    mislabelled.summaryBg = "Червеното е забрана за преминаване.";
    expect(verifyCitations(acts, [mislabelled])).toEqual([]);
    // …and here is why the obvious tie is not free: the real title satisfies
    // neither anchor group, so requiring it would fail the honest row too.
    const real = penalties.find((p) => p.id === "pen-speeding-urban-21-30")!;
    expect(offencePhraseMatchesConduct(real.titleBg, real.conduct)).toBe(false);
  });
});

// --------------------------------------------------------------------------
// The coordinates printed beside the quote — „чл. 182, ал. 1, т. 3" — are what
// a student is told to go and open. A unit is a whole ARTICLE, so until now
// every check searched the article and the „ал. 1" was simply believed.
// --------------------------------------------------------------------------

describe("the alinea in the citation is where the sentence actually is", () => {
  it("refuses a quote whose alinea coordinate points at a different alinea", () => {
    const { acts, penalties } = getLawCorpus();
    const misfiled = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    // The sentence is чл. 183, ал. 5 („глоба 150 лв."). ал. 4 is the 100 лв.
    // ladder — a student who opens it finds a different amount.
    misfiled.fine.source.paragraphRef = "ал. 4";
    const problems = verifyCitations(acts, [misfiled]);
    expect(problems.join("\n")).toContain("but NOT in ал. 4");
  });

  it("refuses an alinea the article does not have", () => {
    const { acts, penalties } = getLawCorpus();
    const invented = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    invented.fine.source.paragraphRef = "ал. 99";
    expect(verifyCitations(acts, [invented]).join("\n")).toContain("has no ал. 99");
  });

  it("refuses a point coordinate that names an offence the citation never quotes", () => {
    const { acts, penalties } = getLawCorpus();
    const misfiled = structuredClone(penalties.find((p) => p.id === "pen-b2-no-stop")!);
    // The Б2 offence is чл. 183, ал. 4, т. 14. т. 3 of the same alinea is a
    // different offence entirely, and before the point span was parsed the two
    // coordinates were the same claim: both „somewhere in чл. 183".
    misfiled.fine.source.pointRef = "т. 3";
    expect(verifyCitations(acts, [misfiled]).join("\n")).toContain("nothing in this citation is inside");
  });

  it("resolves the lettered alineas too — ал. 5г is where the 70 % discount lives", () => {
    const zdvp = getArticle("zdvp", "чл. 189");
    expect(zdvp.found).toBe(true);
    if (!zdvp.found) return;
    // If the run parser dropped lettered alineas it would report every citation
    // to one as „no such alinea", which is a false failure waiting for the next
    // row. чл. 189 has 4а–4д, 5а–5г, 6а and 13а.
    expect(normaliseForMatch(zdvp.unit.textBg)).toContain("(5г)");
  });

  /**
   * THE LIMIT, PINNED. This check compares the quote with the alinea it names;
   * it cannot tell two alineas apart when they contain THE SAME SENTENCE. ЗДвП
   * чл. 182 does exactly that: ал. 1 is the in-town speeding ladder and ал. 2
   * the out-of-town one, and their т. 3 is word-for-word identical („за
   * превишаване от 21 до 30 km/h - с глоба 100 лв."). So flipping the founder's
   * own row to ал. 2 is invisible here — and harmless at this tier, because the
   * two alineas agree on the amount.
   *
   * WHERE IT WOULD NOT BE HARMLESS: т. 4. In town 31–40 km/h is 400 лв.; out of
   * town it is 300. A future row for that tier can be cited to the wrong alinea
   * and only the amount check would notice, and only if the amount was right
   * for the OTHER alinea. Closing it needs the row to declare which ladder it
   * is on — the alinea's own opening words („в населено място" / „извън
   * населено място") are the discriminator, and no citation field carries them.
   */
  it("…and the limit: one sentence in two alineas is still indistinguishable", () => {
    const { acts, penalties } = getLawCorpus();
    const flipped = structuredClone(penalties.find((p) => p.id === "pen-speeding-urban-21-30")!);
    flipped.fine.source.paragraphRef = "ал. 2"; // out of town — the row says in town
    expect(verifyCitations(acts, [flipped])).toEqual([]);
    // The reason, stated as evidence rather than as a claim.
    const art = getArticle("zdvp", "чл. 182");
    expect(art.found).toBe(true);
    if (!art.found) return;
    const occurrences = normaliseForMatch(art.unit.textBg).split(
      "за превишаване от 21 до 30 km/h - с глоба 100 лв.",
    ).length - 1;
    expect(occurrences).toBe(2);
  });
});

// --------------------------------------------------------------------------
// Truncation — a prefix of the act is a substring of the act, and reads as a
// quotation while being none
// --------------------------------------------------------------------------

describe("no quote in the bank is a truncation", () => {
  /**
   * `build-penalties.mjs` used to widen a quote one character at a time until it
   * met a „;" or spent a 400-character budget, and then stop wherever it stood.
   * Six quotes in the shipped bank were the budget rather than the law — three
   * cut MID-WORD („…до 0,8 на хиляда в", „…на ползвателя, се из", „…1. над 0,5
   * на хиляда до 0,8") and three ran out of their own provision into the next
   * („…(6) (Нова - ДВ,"). Every one was rendered as verbatim statute, and
   * `verifyCitations` passed all six, because a prefix IS a substring.
   */
  const everyQuote = (): Array<[string, string]> => {
    const out: Array<[string, string]> = [];
    for (const p of listPenalties()) {
      const cites: Array<[string, { quoteBg: string; contextQuoteBg?: string } | null]> = [
        ["fine.source", p.fine.source],
        ["fine.instrumentSource", p.fine.instrumentSource],
        ["controlPoints.source", p.controlPoints.source],
        ["disqualification.source", p.disqualification.source],
        ["examPoints.source", p.examPoints?.source ?? null],
      ];
      for (const [where, c] of cites) {
        if (c === null) continue;
        out.push([`${p.id}.${where}.quoteBg`, c.quoteBg]);
        if (c.contextQuoteBg !== undefined) {
          out.push([`${p.id}.${where}.contextQuoteBg`, c.contextQuoteBg]);
        }
      }
    }
    return out;
  };

  it("every quote ends on a clause boundary, never mid-word", () => {
    for (const [where, quote] of everyQuote()) {
      expect(quote.trim(), where).toMatch(/[;:.]$/);
    }
  });

  it("no quote sits exactly on the old character budget", () => {
    // The tell of a budget cut. 395–401 is deliberately a band, not the number:
    // a quote that lands there by coincidence is worth a human look anyway.
    for (const [where, quote] of everyQuote()) {
      expect(quote.length < 395 || quote.length > 401, `${where} is ${quote.length} chars`).toBe(true);
    }
  });

  it("no quote runs past its own provision into the next alinea", () => {
    // „(6) (Нова - ДВ, …" inside a quote about ал. 5г means the cut overshot.
    for (const [where, quote] of everyQuote()) {
      expect(quote, where).not.toMatch(/\(\d{1,2}\)\s*\((?:Нова|Изм|Доп|Отм)/);
    }
  });
});

// --------------------------------------------------------------------------
// Two texts of one наредба, and the citation that has to say which
// --------------------------------------------------------------------------

describe("a superseded text may not be quoted as if it were current", () => {
  it("the whole bank now cites the consolidation, not the 2025 snapshot", () => {
    const stale = listPenalties().flatMap((p) =>
      [p.fine.source, p.controlPoints.source, p.disqualification.source, p.examPoints?.source]
        .filter((c) => c !== undefined)
        .filter((c) => c!.actId === "naredba-iz-2539")
        .map(() => p.id),
    );
    expect(stale).toEqual([]);
  });

  it("verifyCitations catches a quote the amendment rewrote", () => {
    const { acts, penalties } = getLawCorpus();
    // The 8 that became 10 — the exact figure the бр. 22/2026 ЗИД replaced.
    const relapse = structuredClone(penalties.find((p) => p.id === "pen-alcohol-05-08")!);
    relapse.controlPoints.source.actId = "naredba-iz-2539";
    relapse.controlPoints.source.quoteBg =
      "над 0,5 на хиляда до 0,8 на хиляда включително (чл. 174, ал. 1, т. 1 от ЗДвП) - 8 контролни точки;";
    relapse.controlPoints.points = 8;
    const problems = verifyCitations(acts, [relapse]);
    expect(problems.join("\n")).toContain("no longer contains it");
  });

  it("…but a passage the amendment left alone still resolves through the snapshot", () => {
    const { acts, penalties } = getLawCorpus();
    // чл. 6, ал. 1, т. 20 is word for word the same in both texts, so pointing
    // at the older file is merely old, not wrong. The guard must not fire.
    const older = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    older.controlPoints.source.actId = "naredba-iz-2539";
    expect(verifyCitations(acts, [older])).toEqual([]);
  });
});

describe("money is quoted in the currency a student can pay", () => {
  it("renders the euro first and keeps the statute's лв. beside it", () => {
    // The founder's own електронен фиш: 100 лв. under чл. 182, ал. 1, т. 3,
    // billed at 51,13 EUR. Both figures, one row, so the citation underneath —
    // which says „с глоба 100 лв." — cannot read as a contradiction.
    const shown = describeFine(getPenalty("pen-speeding-urban-21-30")!);
    expect(shown.valueBg).toContain("51,13 €");
    expect(shown.valueBg).toContain("100 лв.");
    expect(shown.quoteBg).toContain("100 лв.");
  });

  it("every rendered fine leads with the euro", () => {
    for (const p of listPenalties()) {
      const shown = describeFine(p);
      if (shown.valueBg === null) continue;
      expect(shown.valueBg, p.id).toMatch(/^\d+,\d{2} €/);
    }
  });

  /**
   * The defect that produced this whole wave, re-entered by hand. Before
   * `disqualification` existed, `instrument: "акт"` on pen-red-light parsed
   * cleanly — nothing in the file recorded the fact that decides it, so there
   * was nothing for a schema to check against.
   */
  it("the schema refuses the exact mistake three of six entries made", () => {
    const { penalties } = getLawCorpus();
    const relapse = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    expect(relapse.disqualification.status).toBe("not-listed"); // чл. 183, ал. 5 has no ban
    relapse.fine.instrument = "акт"; // …and this is what used to be written anyway
    relapse.fine.instrumentSource = {
      actId: "zdvp",
      ref: "чл. 189",
      paragraphRef: "ал. 1",
      quoteBg: "Актовете, с които се установяват нарушенията по този закон",
    };
    const result = PenaltyEntrySchema.safeParse(relapse);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("чл. 186, ал. 1 permits a фиш");
  });

  it("the schema refuses a фиш where лишаване от право IS provided", () => {
    const { penalties } = getLawCorpus();
    const wrong = structuredClone(penalties.find((p) => p.id === "pen-alcohol-05-08")!);
    wrong.fine.instrument = "електронен фиш";
    const result = PenaltyEntrySchema.safeParse(wrong);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("bar a фиш");
  });

  it("the schema refuses ANY instrument while the ban is unestablished", () => {
    const { penalties } = getLawCorpus();
    const unsure = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    unsure.disqualification = {
      system: "disqualification",
      status: "unknown",
      months: null,
      durationBg: null,
      source: unsure.disqualification.source,
      noteBg: "не е проверено",
    };
    // "фиш" is in fact the right answer here — but not on this evidence.
    expect(PenaltyEntrySchema.safeParse(unsure).success).toBe(false);
    unsure.fine.instrument = null;
    unsure.fine.instrumentSource = null;
    expect(PenaltyEntrySchema.safeParse(unsure).success).toBe(true);
    // …and the renderer then shows the money with no instrument attached.
    expect(describeFine(unsure).valueBg).toBe("76,69 € (150 лв.)");
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
