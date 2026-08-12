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
  ungroundedLabelWords,
  verifyCitations,
  type PenaltyEntry,
} from "./index";
import {
  ControlPointsPenaltySchema,
  ExamPointsPenaltySchema,
  FinePenaltySchema,
  LawSourceRegisterSchema,
  LawSourceSchema,
  PenaltyBankSchema,
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

  /**
   * CHECK (11) — THE INSTRUMENT AGAINST THE ARTICLE BESIDE IT.
   *
   * Every schema in this directory could see that `instrument` and
   * `instrumentSource` were both present, and that the instrument agreed with
   * the ban. None of them read the provision. Measured on the shipped bank
   * before the check existed: pen-b2-no-stop with `instrument` flipped to
   * „електронен фиш" and its чл. 186, ал. 1 citation left in place gave
   * `FinePenaltySchema` ✓, `PenaltyEntrySchema` ✓, `PenaltyBankSchema` ✓,
   * `verifyCitations` → [] and `describeFine` → „51,13 € (100 лв.) (електронен
   * фиш)" — printed over a noteBg that ends „…затова може да се наложи с фиш".
   *
   * The three instruments differ in who may issue, whether a лишаване can ride
   * along, and the discount (80 % in 7 days against 70 % in 14), so the wrong
   * one is a real-world consequence the law behind it does not support.
   */
  const flipped = (id: string, mutate: (p: PenaltyEntry) => void): string[] => {
    const { acts, penalties } = getLawCorpus();
    const row = structuredClone(penalties.find((p) => p.id === id)!);
    mutate(row);
    return verifyCitations(acts, [row]);
  };

  it("refuses електронен фиш standing on the ordinary-фиш rule", () => {
    const problems = flipped("pen-b2-no-stop", (p) => {
      p.fine.instrument = "електронен фиш";
    }).join("\n");
    expect(problems).toContain("the provision it cites never names one");
    expect(problems).toContain('ЗДвП чл. 186, ал. 1 names „фиш"');
  });

  it("refuses an ordinary фиш standing on the camera rule", () => {
    const problems = flipped("pen-speeding-urban-21-30", (p) => {
      p.fine.instrument = "фиш";
    }).join("\n");
    // „фиш" is a SUBSTRING of „електронен фиш", so the naive includes() this
    // replaced would have called this pairing correct.
    expect(problems).toContain('ЗДвП чл. 189, ал. 4 names „електронен фиш"');
  });

  it("refuses an акт standing on the rule that BARS a фиш", () => {
    const fisher = getPenalty("pen-b2-no-stop")!.fine.instrumentSource!;
    const problems = flipped("pen-alcohol-05-08", (p) => {
      p.fine.instrumentSource = structuredClone(fisher);
    }).join("\n");
    expect(problems).toContain("is the rule that BARS a фиш here");
  });

  /**
   * The alineas that NAME an instrument and authorise none — the discount
   * (чл. 186, ал. 7 / чл. 189, ал. 5г), the unpaid фиш that becomes a
   * наказателно постановление (ал. 8), the уведомление that lists all three
   * (чл. 189, ал. 4а), the evidentiary force of an акт (чл. 189, ал. 2). Each
   * is verbatim, each is in ЗДвП, and none of them is why the paper exists.
   */
  it("refuses a provision that mentions the instrument without providing for one", () => {
    const problems = flipped("pen-b2-no-stop", (p) => {
      p.fine.instrumentSource = {
        actId: "zdvp",
        ref: "чл. 186",
        paragraphRef: "ал. 7",
        quoteBg:
          "В 7-дневен срок от налагането на глобата с фиш нарушителят може да заплати 80 на сто от размера й.",
      };
    }).join("\n");
    expect(problems).toContain("does not state that condition");
  });

  it("refuses a provision that names two instruments at once", () => {
    // чл. 186, ал. 2 — „…или откаже да подпише фиша, се съставя акт." Both
    // papers in one sentence, so it cannot be the rule that decides between
    // them; it is the exception for a driver who disputes.
    const problems = flipped("pen-alcohol-05-08", (p) => {
      p.fine.instrumentSource = {
        actId: "zdvp",
        ref: "чл. 186",
        paragraphRef: "ал. 2",
        quoteBg:
          "На лице, което оспорва извършеното от него нарушение или откаже да подпише фиша, се съставя акт.",
      };
    }).join("\n");
    expect(problems).toContain("names more than one instrument");
  });

  it("refuses a quote trimmed so the condition the instrument rests on disappears", () => {
    const problems = flipped("pen-b2-no-stop", (p) => {
      p.fine.instrumentSource!.quoteBg =
        "може да бъде наложена с фиш глоба в размера, посочен в административнонаказателната разпоредба за съответното нарушение.";
    }).join("\n");
    expect(problems).toContain("drops the condition the instrument rests on");
  });

  it("refuses a камера ticket whose quote no longer mentions a камера", () => {
    const problems = flipped("pen-speeding-urban-21-30", (p) => {
      p.fine.instrumentSource!.quoteBg =
        "за което не е предвидено наказание лишаване от право да се управлява моторно превозно средство, с изключение на нарушенията по чл. 179, ал. 3 - 3в, на собственика, на когото е регистрирано превозното средство, а когато в свидетелството за регистрация на превозното средство е вписан ползвател - на ползвателя, се издава електронен фиш в отсъствието на контролен орган и на нарушител";
    }).join("\n");
    expect(problems).toContain("установено и заснето с автоматизирано техническо средство");
  });

  /**
   * Found by attacking check (11) rather than by reading the code: the point
   * guard was written „points.size > 0 && …", so naming a point in an alinea
   * that has NONE switched it off. „ЗДвП, чл. 186, ал. 1, т. 1" then rendered
   * under the instrument — a coordinate чл. 186, ал. 1 does not have. Same
   * shape as the deleted `paragraphRef` the alinea checks already refuse.
   */
  it("refuses a т. N inside an alinea that has no numbered points", () => {
    const problems = flipped("pen-b2-no-stop", (p) => {
      p.fine.instrumentSource!.pointRef = "т. 1";
    }).join("\n");
    expect(problems).toContain("is not divided into numbered points");
  });

  it("refuses an instrument with no rule, and a rule with no instrument", () => {
    expect(
      flipped("pen-b2-no-stop", (p) => {
        p.fine.instrumentSource = null;
      }).join("\n"),
    ).toContain("cites no rule that permits it");
    expect(
      flipped("pen-b2-no-stop", (p) => {
        p.fine.instrument = null;
      }).join("\n"),
    ).toContain("stand or fall together");
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
   * THE FLOOR, RAISED — and the reason it took a different rule than the
   * obvious one.
   *
   * Every rope in this file ties one piece of the act to another piece of the
   * act. `titleBg` and `summaryBg` are OURS — the words a student reads in a
   * list before he opens anything — and until now nothing tied them to
   * anything at all: rewriting the speeding row's title to „Преминава на
   * червено" left every citation verified and the whole suite green.
   *
   * The obvious tie („the title must satisfy the row's anchors") was measured
   * and REFUSED, because it fails on honest data: „Превишена скорост … с 21 –
   * 30 km/h" carries neither „превишаване" (a participle against a verbal noun)
   * nor „от 21 до 30" (an en dash against a statutory range). A guard that
   * fails on correct data is turned off within a week, so that rule was not
   * shipped and the measurement that killed it is kept below.
   *
   * What IS shipped asks a weaker question with the same teeth: every WORD of
   * the title must occur, in some inflected form, inside text the loader has
   * already proved is in the act. Both failures dissolve — the en dash splits
   * „21 – 30" into numerals the statute writes as „от 21 до 30", and „превишена"
   * shares five characters with „превишаване" — and the moved title does not.
   */
  it("refuses a title moved to another offence, and the anchors could not have done it", () => {
    const { acts, penalties } = getLawCorpus();
    const mislabelled = structuredClone(penalties.find((p) => p.id === "pen-speeding-urban-21-30")!);
    mislabelled.titleBg = "Преминава на червено";
    expect(verifyCitations(acts, [mislabelled]).join("\n")).toContain(
      'occurs in none of this row\'s verified quotes',
    );

    // THE MEASUREMENT THAT KILLED THE OBVIOUS TIE, kept as evidence rather than
    // as a claim: the real title satisfies neither anchor group, so the rule
    // „titleBg must satisfy the anchors" would have reported the honest row.
    const real = penalties.find((p) => p.id === "pen-speeding-urban-21-30")!;
    expect(offencePhraseMatchesConduct(real.titleBg, real.conduct)).toBe(false);
    // …and the rule that IS shipped passes it, on the same data.
    expect(verifyCitations(acts, [real])).toEqual([]);
  });

  /**
   * THE TITLE ATTACKS, and the one that is NOT caught, kept in the same table
   * so the reader sees the shape of the rule rather than only its wins.
   */
  const TITLE_ATTACKS: Array<{ name: string; row: string; title: string; caught: string | null }> = [
    {
      name: "moved to another offence entirely",
      row: "pen-speeding-urban-21-30",
      title: "Преминава на червено",
      caught: "преминава, червено",
    },
    {
      name: "the WRONG TIER of the same offence — the sharpest one, and invisible to every other check",
      row: "pen-speeding-urban-21-30",
      title: "Превишена скорост в населено място с 11 – 20 km/h",
      caught: "„11, 20\"",
    },
    {
      name: "the wrong ladder — „извън“ is a word this row's evidence does not have",
      row: "pen-speeding-urban-21-30",
      title: "Превишена скорост извън населено място с 21 – 30 km/h",
      caught: "„извън\"",
    },
    {
      name: "a Latin label nobody would notice in a Cyrillic list",
      row: "pen-red-light",
      title: "Преминава при червен signal",
      caught: "signal",
    },
    {
      // Found by attacking the vocabulary rule, which passes it word for word:
      // „10" is in the exam quote and „контролни точки" in the наредба quote.
      // The row's контролни точки figure is 0 — this is the founder's own
      // complaint, printed in the one line every student reads.
      name: "a CONSEQUENCE the row does not carry, in vocabulary the row does",
      row: "pen-speeding-urban-21-30",
      title: "Превишена скорост в населено място с 21 – 30 km/h и 10 контролни точки",
      caught: "claims „10 контролни точки\", and this row's figure is 0",
    },
    {
      name: "LIMIT: a title that is merely VAGUER than the row — every word still the act's",
      row: "pen-speeding-urban-21-30",
      title: "Превишена скорост",
      caught: null,
    },
  ];

  it.each(TITLE_ATTACKS)("title attack: $name", ({ row, title, caught }) => {
    const { acts, penalties } = getLawCorpus();
    const tampered = structuredClone(penalties.find((p) => p.id === row)!);
    tampered.titleBg = title;
    const problems = verifyCitations(acts, [tampered]).join("\n");
    if (caught === null) expect(problems).toEqual("");
    else expect(problems).toContain(caught);
  });

  it("every honest title in the bank is already in the act's vocabulary", () => {
    // The number that decides whether this check survives contact with content.
    // Non-zero on data nobody tampered with means the RULE is wrong, not the
    // title — measured at 0 across all seven rows when it was written.
    for (const p of listPenalties()) {
      const evidence = [p.fine, p.controlPoints, p.disqualification, p.examPoints]
        .filter((f) => f !== null && f !== undefined)
        .flatMap((f) => [f!.source.quoteBg, f!.source.contextQuoteBg, f!.source.offencePhraseBg])
        .filter((q): q is string => q !== undefined);
      expect(ungroundedLabelWords(p.titleBg, evidence), p.id).toEqual([]);
    }
  });

  /**
   * `summaryBg` gets the OTHER rule, and the reason is measured rather than
   * argued. Run the title's vocabulary tie over the summaries and 7 of 7 go red
   * — „стъпалото, което камерите ловят най-често", „нула дни без книжка",
   * „учтивост" — because a summary explains where a title names. So what is
   * checked in a summary is the part that is a claim about the law: an article
   * number. „чл. 250" reads exactly like „чл. 183", and the numeral gate cannot
   * see it BY DESIGN — it classifies a citation coordinate as a locator rather
   * than a figure, which is right for „чл." and wrong for nothing else.
   */
  it("refuses an article number our prose invents, and keeps the one two acts away", () => {
    const { acts, penalties } = getLawCorpus();
    const invented = structuredClone(penalties.find((p) => p.id === "pen-b2-no-stop")!);
    invented.summaryBg = "Спирането е задължително — вж. чл. 250 от ЗДвП.";
    expect(verifyCitations(acts, [invented]).join("\n")).toContain(
      'names „чл. 250", which exists in none of the acts this row can reach',
    );

    // …and the honest opposite, which is why the check reads the sentence and
    // not just the row: the camera-tolerance note reaches чл. 425 of a наредба
    // this row does not cite, because the sentence names that наредба out loud.
    const camera = penalties.find((p) => p.id === "pen-speeding-urban-21-30")!;
    expect(camera.fine.noteBg).toContain("чл. 425");
    expect(verifyCitations(acts, [camera])).toEqual([]);
  });

  /**
   * THE SUMMARY'S LIMIT, WITH THE NUMBER THAT SETS IT. Swap one row's summary
   * for another's and nothing fires, because the vocabulary rule that catches a
   * moved TITLE cannot be applied to a summary: measured, 7 of 7 honest
   * summaries would go red under it, and the grounded fraction runs from 2/16
   * (pen-speeding-urban-21-30 — „контролни точки", and nothing else) to 9/15.
   * A threshold in that range is a number somebody picked, and it would be
   * tuned upward the first time it was inconvenient.
   *
   * What IS gated in a summary: its numerals, by the prose gate, and its
   * article numbers, above. What is not: its prose.
   */
  it("does NOT catch a summary swapped for another row's — measured, and why", () => {
    const { acts, penalties } = getLawCorpus();
    const swapped = structuredClone(penalties.find((p) => p.id === "pen-speeding-urban-21-30")!);
    swapped.summaryBg = penalties.find((p) => p.id === "pen-red-light")!.summaryBg;
    expect(verifyCitations(acts, [swapped])).toEqual([]);
    // The evidence for the refusal to ship the obvious rule here.
    const speeding = penalties.find((p) => p.id === "pen-speeding-urban-21-30")!;
    const evidence = [speeding.fine, speeding.controlPoints, speeding.disqualification, speeding.examPoints]
      .filter((f) => f !== null && f !== undefined)
      .flatMap((f) => [f!.source.quoteBg, f!.source.contextQuoteBg, f!.source.offencePhraseBg])
      .filter((q): q is string => q !== undefined);
    expect(ungroundedLabelWords(speeding.summaryBg, evidence).length).toBeGreaterThan(0);
  });

  /**
   * THE FLOOR, PINNED SO NOBODY MISTAKES IT FOR COVERAGE. `id` is Latin
   * kebab-case and no rope in this file can reach it from Cyrillic statute
   * text. It is never shown to a student; `PenaltyBankSchema` only guarantees
   * it is unique and prefixed.
   */
  it("does NOT check the row's id — the last untied field, and why", () => {
    const { acts, penalties } = getLawCorpus();
    const renamed = structuredClone(penalties.find((p) => p.id === "pen-red-light")!);
    renamed.id = "pen-something-else-entirely";
    expect(verifyCitations(acts, [renamed])).toEqual([]);
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
   * THE LIMIT THAT WAS PINNED HERE, NOW CLOSED — and the two halves of the fix,
   * because neither works alone.
   *
   * The alinea check compares the quote with the alinea it names, so it cannot
   * tell two alineas apart when they contain THE SAME SENTENCE. ЗДвП чл. 182
   * does exactly that: ал. 1 is the in-town speeding ladder and ал. 2 the
   * out-of-town one, and their т. 3 is word-for-word identical („за
   * превишаване от 21 до 30 km/h - с глоба 100 лв."). Flipping the founder's
   * own row to ал. 2 used to be invisible — harmless at this tier, where both
   * alineas say 100 лв., and 100 лв. of difference at т. 4, where in town is
   * 400 and out of town 300.
   *
   *  a. THE LOADER refuses a citation whose every quote also lives in another
   *     alinea. „Nothing this citation shows is unique to ал. 1" is a defect in
   *     the citation, not a fact about the article: the coordinate is being
   *     asserted rather than evidenced.
   *  b. THE ROW then has to quote the ladder's own opening — „който превиши
   *     разрешената максимална скорост в населено място, се наказва, както
   *     следва:" — and once it does, the ORIGINAL alinea check does the
   *     refusing, because ал. 2 does not contain that sentence.
   *
   * Both are tested, in that order, because (a) without (b) is a rule nobody
   * can satisfy and (b) without (a) is a courtesy the next row will skip.
   */
  it("refuses the alinea flip that used to be invisible — in town vs out of town", () => {
    const { acts, penalties } = getLawCorpus();
    const flipped = structuredClone(penalties.find((p) => p.id === "pen-speeding-urban-21-30")!);
    flipped.fine.source.paragraphRef = "ал. 2"; // out of town — the row says in town
    expect(verifyCitations(acts, [flipped]).join("\n")).toContain("but NOT in ал. 2");

    // The reason the tier alone could never have caught it, as evidence.
    const art = getArticle("zdvp", "чл. 182");
    expect(art.found).toBe(true);
    if (!art.found) return;
    const occurrences = normaliseForMatch(art.unit.textBg).split(
      "за превишаване от 21 до 30 km/h - с глоба 100 лв.",
    ).length - 1;
    expect(occurrences).toBe(2);
  });

  it("…and refuses the citation that made the flip possible: a coordinate with no unique evidence", () => {
    const { acts, penalties } = getLawCorpus();
    const bare = structuredClone(penalties.find((p) => p.id === "pen-speeding-urban-21-30")!);
    // Exactly the shipped citation before this wave: the tier, and nothing that
    // says which ladder. Every other check in the file passes it.
    delete bare.fine.source.contextQuoteBg;
    const problems = verifyCitations(acts, [bare]).join("\n");
    expect(problems).toContain("nothing this citation shows is unique to ЗДвП чл. 182, ал. 1");

    // …and it does NOT fire on an article whose alineas differ, which is every
    // other alinea-scoped citation in the bank.
    const redLight = penalties.find((p) => p.id === "pen-red-light")!;
    expect(verifyCitations(acts, [redLight])).toEqual([]);
  });

  /**
   * …AND THE ESCAPE HATCH, found by attacking the check above rather than by
   * reading it. A rule that only runs when a coordinate is present is switched
   * off by DELETING the coordinate: drop `paragraphRef` together with the
   * ladder's opening and the citation is back to „somewhere in чл. 182", which
   * is where this whole family of defects lives. Measured across the bank
   * before it was closed: every citation already names an alinea where the unit
   * has any, and приложение № 5 — which names none — parses to an alinea run of
   * length 0, so the exam citations are untouched.
   */
  it("refuses a citation that deletes the coordinate instead of proving it", () => {
    const { acts, penalties } = getLawCorpus();
    const evasive = structuredClone(penalties.find((p) => p.id === "pen-speeding-urban-21-30")!);
    delete evasive.fine.source.contextQuoteBg;
    delete evasive.fine.source.paragraphRef;
    delete evasive.fine.source.pointRef;
    expect(verifyCitations(acts, [evasive]).join("\n")).toContain(
      "is divided into alineas and the citation names none",
    );
  });

  /**
   * THE ROW THAT DOES NOT EXIST YET — built here, because т. 4 is the tier where
   * the flip stops being free. In town 31–40 km/h is 400 лв., out of town 300,
   * and both alineas write the sentence the same way apart from the amount. The
   * whole reason to close this now is that the row is not written yet: whoever
   * writes it inherits a loader that will not let the coordinate be guessed.
   *
   * Three states, and the third is where the honest limit is.
   */
  describe("the 31–40 tier, simulated before anybody writes it", () => {
    const LADDER_1 = "който превиши разрешената максимална скорост в населено място, се наказва, както следва:";
    const LADDER_2 = "който превиши разрешената скорост извън населено място, се наказва, както следва:";

    const urban31to40 = (): PenaltyEntry => {
      const row = structuredClone(getPenalty("pen-speeding-urban-21-30")!);
      row.id = "pen-speeding-urban-31-40";
      row.titleBg = "Превишена скорост в населено място с 31 – 40 km/h";
      row.conduct.statementBg =
        "Водачът превишава разрешената максимална скорост в населено място — превишаване от 31 до 40 km/h.";
      row.conduct.anchorsBg = [
        ["превишаване", "превиши"],
        ["от 31 до 40", "с повече от 10 km/h"],
      ];
      row.fine.amountBgn = 400;
      for (const c of [row.fine.source, row.disqualification.source]) {
        c.pointRef = "т. 4";
        c.quoteBg = "за превишаване от 31 до 40 km/h - с глоба 400 лв.";
        c.contextQuoteBg = LADDER_1;
        c.offencePhraseBg = "за превишаване от 31 до 40 km/h";
      }
      return row;
    };

    it("the honest in-town row loads clean", () => {
      const { acts } = getLawCorpus();
      expect(verifyCitations(acts, [urban31to40()])).toEqual([]);
    });

    it("flipping only the alinea is refused — the ladder's opening is not in ал. 2", () => {
      const { acts } = getLawCorpus();
      const flipped = urban31to40();
      flipped.fine.source.paragraphRef = "ал. 2";
      expect(verifyCitations(acts, [flipped]).join("\n")).toContain("but NOT in ал. 2");
    });

    it("flipping the alinea AND its opening together is refused by the figure — 300 is not 400", () => {
      const { acts } = getLawCorpus();
      const coherent = urban31to40();
      // The full attack: an internally perfect out-of-town citation. The alinea
      // check is satisfied (everything really is in ал. 2), the uniqueness check
      // is satisfied (ал. 2's opening is unique to ал. 2) — and the row still
      // says 400 лв., which is the in-town price.
      coherent.fine.source.paragraphRef = "ал. 2";
      coherent.fine.source.quoteBg = "за превишаване от 31 до 40 km/h - с глоба 300 лв.";
      coherent.fine.source.contextQuoteBg = LADDER_2;
      expect(verifyCitations(acts, [coherent]).join("\n")).toContain(
        "quote does not state the figure",
      );
    });

    /**
     * THE LIMIT, MEASURED AND PINNED. Move the amount to 300 as well and the
     * row is no longer mispriced — it is the out-of-town row wearing the
     * in-town row's title. Word-level grounding cannot see it, because „извън
     * населено място" contains both „населено" and „място": the discriminator
     * is a word the label OMITS, and no containment rule can require the
     * absence of a word. What is left is that the figure, the quote, the
     * coordinate and the ladder now all agree with each other and with the law,
     * and only the Bulgarian preposition in our own title disagrees.
     */
    it("…and the one that still gets through: the whole citation moved out of town, price included", () => {
      const { acts } = getLawCorpus();
      const moved = urban31to40();
      moved.fine.amountBgn = 300;
      moved.fine.source.paragraphRef = "ал. 2";
      moved.fine.source.quoteBg = "за превишаване от 31 до 40 km/h - с глоба 300 лв.";
      moved.fine.source.contextQuoteBg = LADDER_2;
      expect(verifyCitations(acts, [moved])).toEqual([]);
      // The reason, as evidence: the label's own words survive the move.
      expect(ungroundedLabelWords(moved.titleBg, [LADDER_2, moved.fine.source.quoteBg])).toEqual([]);
    });

    it("but writing „извън“ into an in-town title IS refused", () => {
      const { acts } = getLawCorpus();
      const mislabelled = urban31to40();
      mislabelled.titleBg = "Превишена скорост извън населено място с 31 – 40 km/h";
      expect(verifyCitations(acts, [mislabelled]).join("\n")).toContain("„извън\"");
    });
  });
});

// --------------------------------------------------------------------------
// THE DECLARATION HOLE — the two rows that differ ONLY by a conditional clause
//
// „Не спира на Б2" is 100 лв. and no контролни точки. The same manoeuvre „ако
// от това е създадена непосредствена опасност за движението" is 200 лв. and 10.
// Cut those eleven words out of the offence phrase and the row prices the
// second at the first's conduct — verbatim, inside the quotes, satisfying the
// row's own declaration. Nothing went red.
//
// THE REASON A MATCHER TWEAK COULD NOT DO IT, which is why these tests sit
// apart from the conduct block: check (5b) requires EVERY phrase on a row to
// satisfy EVERY anchor group, so a row's declaration can only ever be the
// weakest common denominator of its own figures. An „опасност" anchor on the
// danger row would refuse that row's контролни-точки and наказателни-точки
// citations, whose acts never use the word — приложение № 5 marks the Б2
// non-stop whether or not danger followed. The condition is therefore enforced
// from the ACT'S PUNCTUATION instead, one citation at a time.
// --------------------------------------------------------------------------

describe("an offence phrase may not stop before the act's „ако“", () => {
  it("refuses the truncation that was live on a shipped row", () => {
    const { acts, penalties } = getLawCorpus();
    const cut = structuredClone(penalties.find((p) => p.id === "pen-b2-no-stop-danger")!);
    // Verbatim. Inside the quotes. Satisfies both of the row's anchor groups
    // („пътните знаци" and „не спазва предписанието"). Prices 200 лв. + 10 к.т.
    // for conduct that costs 100 лв. and 0 к.т.
    cut.fine.source.offencePhraseBg = "не спазва предписанието на пътните знаци";
    expect(offencePhraseMatchesConduct(cut.fine.source.offencePhraseBg, cut.conduct)).toBe(true);
    expect(verifyCitations(acts, [cut]).join("\n")).toContain(
      "the offence phrase stops before the act does",
    );
  });

  it("…and the longer truncation, which stops one clause short", () => {
    const { acts, penalties } = getLawCorpus();
    const cut = structuredClone(penalties.find((p) => p.id === "pen-b2-no-stop-danger")!);
    cut.fine.source.offencePhraseBg =
      "не спазва предписанието на пътните знаци, пътната маркировка и другите средства за сигнализиране, правилата за предимство, за разминаване, за изпреварване или за заобикаляне";
    expect(verifyCitations(acts, [cut]).join("\n")).toContain(
      "the offence phrase stops before the act does",
    );
  });

  it("the same defect the check found in the shipped bank — Наредба № Iз-2539 чл. 6, ал. 1, т. 15", () => {
    // Measured, not hypothesised: 21 offence phrases in the bank, 20 clean, and
    // this one had dropped the identical clause from the наредба that prices
    // the 10 контролни точки. It was fixed rather than exempted, so the current
    // phrase carries the condition and the truncated one is refused.
    const row = getPenalty("pen-b2-no-stop-danger")!;
    expect(row.controlPoints.source.offencePhraseBg).toContain(
      "ако от това е създадена непосредствена опасност за движението",
    );
    const { acts, penalties } = getLawCorpus();
    const relapse = structuredClone(penalties.find((p) => p.id === "pen-b2-no-stop-danger")!);
    relapse.controlPoints.source.offencePhraseBg =
      'за неспиране на пътен знак "Спри! Пропусни движещите се по пътя с предимство!"';
    expect(verifyCitations(acts, [relapse]).join("\n")).toContain(
      "the offence phrase stops before the act does",
    );
  });

  it("does NOT fire on a phrase that legitimately opens with „когато“", () => {
    // приложение № 5's indents ARE conditions („когато изпитваният…"), and every
    // exam citation in the bank quotes one whole. A rule that read „the phrase
    // contains a condition" instead of „the act goes on with one" would report
    // all six of them, which is the shape of guard that gets switched off.
    const { acts, penalties } = getLawCorpus();
    for (const p of penalties) {
      if (p.examPoints === null) continue;
      expect(p.examPoints.source.offencePhraseBg, p.id).toContain("когато изпитваният");
    }
    expect(verifyCitations(acts, penalties)).toEqual([]);
  });

  /**
   * TWO ROWS THAT PRICE DIFFERENT MONEY MUST BE TELLABLE APART — the check that
   * looks at a PAIR, because every other one in this file looks at a row.
   *
   * Attacking it first showed how much the existing widening check already
   * does: collapsing the Б2 pair by adding „не спира" to the danger row's
   * anchors is refused by (d) before separation is even reached, since no
   * phrase on that row uses it. The collapse that (d) cannot see is a
   * NARROWING-BY-DELETION — drop the tier group from both speeding rows and
   * every remaining alternative is still earning its place, every phrase still
   * satisfies the declaration, and 50 лв. and 100 лв. become the same offence.
   */
  it("two rows that price different fines can be told apart by their declarations", () => {
    const { acts, penalties } = getLawCorpus();
    const pair = ["pen-speeding-urban-11-20", "pen-speeding-urban-21-30"].map((id) => {
      const row = structuredClone(penalties.find((p) => p.id === id)!);
      // The tier group deleted, and the statement rewritten so that (c) — every
      // digit in the declaration must be in an anchor — has nothing to say.
      row.conduct.anchorsBg = [["превишаване", "превиши"]];
      row.conduct.statementBg =
        "Водачът допуска превишаване на разрешената максимална скорост в населено място.";
      return row;
    });
    const problems = verifyCitations(acts, pair).join("\n");
    // Nothing ELSE objects — that is the point.
    expect(problems).not.toContain("which no offence phrase on this row uses");
    expect(problems).not.toContain("statementBg");
    expect(problems).toContain("each row's conduct accepts the other row's fine phrase");
  });

  it("…and the collapse the existing widening check catches first", () => {
    const { acts, penalties } = getLawCorpus();
    const collapsed = structuredClone(penalties.find((p) => p.id === "pen-b2-no-stop-danger")!);
    collapsed.conduct.anchorsBg = [
      ["пътен знак", "пътните знаци"],
      ["не спазва предписанието", "неспиране", "не спре", "не спира"],
    ];
    expect(verifyCitations(acts, [collapsed]).join("\n")).toContain(
      'offers "не спира", which no offence phrase on this row uses',
    );
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

  /**
   * „(електронен фиш)" is a real-world consequence — the ticket arrives by
   * post, weeks later, addressed to whoever owns the car — and the row used to
   * render it with no article beside it. THEO-4 says a screen explains what it
   * states, so the renderer is handed the authorising provision too.
   */
  it("hands the renderer the article the instrument stands on", () => {
    const camera = describeFine(getPenalty("pen-speeding-urban-21-30")!);
    expect(camera.valueBg).toContain("(електронен фиш)");
    expect(camera.instrumentBg).toBe("електронен фиш");
    expect(camera.instrumentCitationBg).toContain("чл. 189, ал. 4");
    expect(camera.instrumentQuoteBg).toContain("електронен фиш");

    const officer = describeFine(getPenalty("pen-b2-no-stop")!);
    expect(officer.instrumentBg).toBe("фиш");
    expect(officer.instrumentCitationBg).toContain("чл. 186, ал. 1");

    // Every other figure leaves the three fields empty — only money arrives on
    // a piece of paper.
    const p = getPenalty("pen-b2-no-stop")!;
    for (const shown of [describeControlPoints(p), describeDisqualification(p)]) {
      expect(shown.instrumentBg).toBeNull();
      expect(shown.instrumentCitationBg).toBeNull();
      expect(shown.instrumentQuoteBg).toBeNull();
    }
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

/**
 * ONE ID, ONE ROW — the `.find()` guard.
 *
 * `getPenalty`, `getSource` and the unit lookup are all `.find()` over an
 * array: with two rows sharing a key the first wins and the second is
 * unreachable, silently. `PenaltyBankSchema` and `LawActSchema` already refused
 * theirs (measured: both fire). `LawSourceRegisterSchema` did not, and it is
 * the worst of the three to lose, because a source row is WHICH FILE A QUOTE
 * CAME FROM — its sha256, its byte count, its ДВ version.
 */
describe("a lookup key names exactly one row", () => {
  it("the shipped register has no duplicate ids and no shadowed act", () => {
    const { sources } = getLawCorpus();
    const ids = sources.sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const fullTextActs = sources.sources
      .filter((s) => s.coverage === "full-text" && s.actId !== null)
      .map((s) => s.actId);
    expect(new Set(fullTextActs).size).toBe(fullTextActs.length);
    expect(LawSourceRegisterSchema.safeParse(sources).success).toBe(true);
  });

  it("refuses two sources with one id", () => {
    const { sources } = getLawCorpus();
    const shadow = structuredClone(sources.sources[0]);
    shadow.titleBg = "друг файл, същият id";
    const result = LawSourceRegisterSchema.safeParse({
      ...sources,
      sources: [...sources.sources, shadow],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("duplicate source id");
  });

  it("refuses two full-text sources claiming to be the same act", () => {
    const { sources } = getLawCorpus();
    const original = sources.sources.find((s) => s.coverage === "full-text")!;
    const shadow = structuredClone(original);
    shadow.id = `${original.id}-shadow`;
    const result = LawSourceRegisterSchema.safeParse({
      ...sources,
      sources: [...sources.sources, shadow],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("both claim to be the full text");
  });

  it("refuses two penalties with one id", () => {
    const { penalties } = getLawCorpus();
    const result = PenaltyBankSchema.safeParse({
      version: 1,
      penalties: [...penalties, structuredClone(penalties[0])],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("duplicate penalty id");
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
