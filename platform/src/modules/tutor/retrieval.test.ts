import { beforeEach, describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { CARRIED_CONCEPT_SUMMARIES, summaryFingerprint } from "@/modules/lesson";
import { VIOLATIONS } from "@/modules/sim/rules";
import {
  makeTutorFixtureRepo,
  CONCEPT_PRIORITY,
  CONCEPT_SPEED,
  QUESTION_DRAFT,
  QUESTION_PRIORITY,
  QUESTION_SPEED,
  SIGN_DRAFT,
  SIGN_STOP,
} from "./fixtures";
import {
  MAX_RETRIEVED_RULES,
  MIN_QUESTION_COVERAGE,
  normalizeBg,
  parseCatalogLawRef,
  recentWithheldMaterials,
  resetWithheldMaterials,
  retrieveGrounding,
  retrieveGroundingForTurn,
  retrieveMaterials,
  retrieveMaterialsInTopic,
  retrieveRuleMaterials,
  tokenizeBg,
} from "./retrieval";

const repo = makeTutorFixtureRepo();

beforeEach(() => {
  resetWithheldMaterials();
});

describe("normalizeBg / tokenizeBg", () => {
  it("lowercases Cyrillic and strips punctuation", () => {
    expect(normalizeBg("Кога имам ПРЕДИМСТВО?!")).toBe("кога имам предимство");
  });

  it("folds ѝ to и", () => {
    expect(normalizeBg("неѝ")).toBe("неи");
  });

  it("drops stopwords and single characters", () => {
    expect(tokenizeBg("Кога имам предимство на кръстовище?")).toEqual([
      "предимство",
      "кръстовище",
    ]);
  });
});

describe("retrieveMaterials", () => {
  it("finds the priority material for a priority question", () => {
    const items = retrieveMaterials(repo, "Кога имам предимство?");
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((i) => i.id)).toContain(QUESTION_PRIORITY.id);
  });

  it("matches inflected forms via prefix matching", () => {
    // "предимството" (definite form) vs "предимство" in the material.
    // „Обясни" is imperative scaffolding and must not dilute the coverage of a
    // two-word request — this is the shape MIN_QUESTION_COVERAGE threatened.
    const items = retrieveMaterials(repo, "Обясни ми предимството");
    expect(items.map((i) => i.id)).toContain(QUESTION_PRIORITY.id);
  });

  it("finds a sign by its official code", () => {
    const items = retrieveMaterials(repo, "Какво значи знак Б2?");
    expect(items.map((i) => i.id)).toContain(SIGN_STOP.id);
  });

  it("carries lawRefs through for citation grounding", () => {
    const items = retrieveMaterials(repo, "предимство на кръстовище");
    const priority = items.find((i) => i.id === QUESTION_PRIORITY.id);
    expect(priority?.lawRefs).toEqual([{ act: "ЗДвП", ref: "чл. 48" }]);
  });

  it("includes exam questions as material", () => {
    const items = retrieveMaterials(repo, "нерегулирано кръстовище отдясно");
    expect(items.map((i) => i.id)).toContain(QUESTION_PRIORITY.id);
  });

  it("returns nothing for stopword-only input", () => {
    expect(retrieveMaterials(repo, "Какво е това?")).toEqual([]);
  });

  it("returns nothing for off-curriculum questions", () => {
    expect(retrieveMaterials(repo, "Каква е столицата на Франция?")).toEqual(
      [],
    );
  });

  it("respects the limit and sorts by score descending", () => {
    const items = retrieveMaterials(repo, "предимство кръстовище скорост", 2);
    expect(items.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].score).toBeGreaterThanOrEqual(items[i].score);
    }
  });
});

// ---------------------------------------------------------------------------
// THE GATE (the third door)
// ---------------------------------------------------------------------------

describe("clearance — retrieval hands the model nothing unreviewed", () => {
  it("withholds a concept summary: concepts.json has no status to check", () => {
    // Both fixture concepts are strong matches for these questions. Neither is
    // pinned in the classroom's carry, so neither may become grounding.
    const ids = [
      ...retrieveMaterials(repo, "Кога имам предимство?"),
      ...retrieveMaterials(repo, "Каква е скоростта в града?"),
    ].map((i) => i.id);
    expect(ids).not.toContain(CONCEPT_PRIORITY.id);
    expect(ids).not.toContain(CONCEPT_SPEED.id);
  });

  it("withholds a question that is not approved, and keeps its approved twin", () => {
    const ids = retrieveMaterials(repo, "предимство на кръстовище").map(
      (i) => i.id,
    );
    expect(ids).toContain(QUESTION_PRIORITY.id); // approved
    expect(ids).not.toContain(QUESTION_DRAFT.id); // needs-review
  });

  it("withholds a sign that is not approved, and keeps its approved twin", () => {
    const ids = retrieveMaterials(repo, "знак Б2 знак А1 завой").map((i) => i.id);
    expect(ids).toContain(SIGN_STOP.id); // approved
    expect(ids).not.toContain(SIGN_DRAFT.id); // draft
  });

  it("records every refusal, deduplicated, with no user or question attached", () => {
    retrieveMaterials(repo, "Кога имам предимство?");
    retrieveMaterials(repo, "Кога имам предимство?"); // twice — one record each
    const withheld = recentWithheldMaterials();

    // WHICH rows were refused is this module's claim. WHY is the lesson
    // module's — `WithheldReason` is its enum and it grows (a citation freeze
    // landed there while this was being written, and the tutor inherited it
    // for free by calling the same functions). Pinning its exact members here
    // would make every refinement over there a red test over here, for no
    // safety gained: what matters is that the row did not reach a model.
    expect(withheld.map((w) => `${w.kind}:${w.id}`).sort()).toEqual([
      "concept:c-predimstvo",
      "concept:c-skorost",
      "question:q-predimstvo-2",
      "sign:sign-a1",
    ]);
    for (const record of withheld) {
      expect(record.reason.length).toBeGreaterThan(0);
    }
    // ADR-004: these are minors. A record names a CONTENT ROW and nothing else.
    for (const record of withheld) {
      expect(Object.keys(record).sort()).toEqual(["id", "kind", "reason", "ts"]);
    }
  });
});

describe("clearance against the REAL bank (the measurement that found this)", () => {
  /**
   * Built from `content/`, never from the gate — the same discipline
   * lesson/__tests__/clearance.test.ts uses. If somebody deletes the filter,
   * this fails naming the actual row a 17-year-old would have been taught from.
   */
  function forbiddenRows(): Map<string, string> {
    const real = getContentRepo();
    const forbidden = new Map<string, string>();
    for (const c of real.concepts()) {
      const pinned = Object.hasOwn(CARRIED_CONCEPT_SUMMARIES, c.id)
        ? CARRIED_CONCEPT_SUMMARIES[c.id]
        : undefined;
      if (pinned === summaryFingerprint(c.summaryBg)) continue;
      forbidden.set(c.id, `concept ${c.id} (not carried)`);
    }
    for (const q of real.questions()) {
      if (q.status === "approved") continue;
      forbidden.set(q.id, `question ${q.id} (${q.status})`);
    }
    for (const s of real.signs()) {
      if (s.status === "approved") continue;
      forbidden.set(s.id, `sign ${s.code} (${s.status})`);
    }
    return forbidden;
  }

  /**
   * The questions a 17-year-old actually types. The first three are the ones
   * that FOUND this door: run against the pre-gate retriever they returned
   * c-victim-handling (10.00), c-bleeding-control (8.10) and c-cpr-basics
   * (6.00) — the three summaries the classroom refuses to speak because the
   * 2025 ERC/RCUK regrounding reversed what they teach.
   */
  const STUDENT_QUESTIONS = [
    "Как се мести пострадал в безсъзнание след катастрофа?",
    "Как се спира силно кръвотечение?",
    "Кога се прави сърдечен масаж?",
    "Колко натискания в минута при сърдечен масаж?",
    "Как се прави изкуствено дишане?",
    "Какво правя първо при катастрофа?",
    "Кой има предимство на кръстовище?",
    "Каква е скоростта в населено място?",
    "Колко е допустимият алкохол в кръвта?",
    "Кога се използват къси светлини?",
    "Какво е спирачният път?",
    "Кога трябва да пропусна пешеходец?",
    "Какво значи знак Б2?",
    "Обясни ми предимството",
    "Кажи ми за спирачния път",
  ];

  it("the corpus still has teeth — the forbidden set is large and includes the first-aid four", () => {
    const forbidden = forbiddenRows();
    expect(forbidden.size).toBeGreaterThan(300);
    for (const id of [
      "c-first-aid-priorities",
      "c-cpr-basics",
      "c-bleeding-control",
      "c-victim-handling",
    ]) {
      expect(forbidden.has(id), `${id} must be withheld`).toBe(true);
    }
  });

  it("never returns an ungated row for any question a student would ask", () => {
    const real = getContentRepo();
    const forbidden = forbiddenRows();
    const leaks: string[] = [];
    for (const question of STUDENT_QUESTIONS) {
      for (const item of retrieveGrounding(real, question)) {
        const why = forbidden.get(item.id);
        if (why !== undefined) leaks.push(`„${question}" → ${why}`);
      }
    }
    expect(leaks, `ungated material reached the model:\n${leaks.join("\n")}`).toEqual(
      [],
    );
  });

  it("hands the model NO first-aid material for a first-aid question", () => {
    // Every first-aid row in the bank is `q-ptp-*` or one of the four
    // first-aid concepts, and all of them are withheld. This is the assertion
    // that matters clinically: not merely „nothing ungated" but „nothing about
    // first aid at all", so no answer can be assembled about moving a casualty.
    const real = getContentRepo();
    const clinical: string[] = [];
    for (const question of STUDENT_QUESTIONS.slice(0, 6)) {
      for (const item of retrieveGrounding(real, question)) {
        if (item.id.startsWith("q-ptp-") || item.id.startsWith("c-first-aid")) {
          clinical.push(`„${question}" → ${item.id}`);
        }
      }
    }
    expect(clinical, `first-aid material reached the model:\n${clinical.join("\n")}`)
      .toEqual([]);
  });

  it("leaves the first-aid questions with almost nothing — and pins the residual", () => {
    // MEASURED, today: „мести пострадал" → 0, „сърдечен масаж" → 0, „спира
    // силно кръвотечение" → 3. The three survivors (q-predimstvo-067 Б1,
    // q-speed-036 ABS, q-alkohol-i-godnost-035) all score 1.70 and reach the
    // 0.5 coverage floor on „спира" + „силно" alone — two generic words out of
    // three, missing the only one that carries the subject.
    //
    // THIS IS A QUALITY RESIDUAL, NOT A SAFETY ONE, and the distinction is the
    // reason it is pinned rather than tuned away: nothing unreviewed and
    // nothing clinical is in those three rows, so what reaches the model is
    // visibly off-topic and rule 2 of the system prompt refuses on it. Killing
    // it needs term rarity (IDF) — „кръвотечение" is the subject and „спира" is
    // everywhere — and that is a scorer change with its own measurement, not a
    // floor tweak: raising the floor to 0.6 removes it AND silences „Кога
    // трябва да пропусна пешеходец?", which is a worse trade.
    //
    // The number is pinned so it can only fall. If a content wave makes it
    // rise, that is a signal, not a nuisance.
    const real = getContentRepo();
    const total = STUDENT_QUESTIONS.slice(0, 3)
      .map((q) => retrieveGrounding(real, q).filter((i) => i.kind !== "rule").length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(3);
  });

  it("still answers the questions the bank genuinely covers", () => {
    const real = getContentRepo();
    for (const question of STUDENT_QUESTIONS.slice(6)) {
      expect(
        retrieveGrounding(real, question).length,
        `„${question}" lost all grounding`,
      ).toBeGreaterThan(0);
    }
  });

  it("closes the classroom's Tier-2 leak: no first-aid beat can widen into ungated rows", () => {
    // service.ts lessonGrounding() fills the slots the beat's own (gated)
    // materials leave empty with retrieveMaterialsInTopic. Measured before the
    // fix, every one of the six beats of l-accidents-first-aid had tier1 = 0,
    // room = 6 and tier2 = 6, all six ungated.
    const real = getContentRepo();
    const forbidden = forbiddenRows();
    const leaks: string[] = [];
    for (const question of STUDENT_QUESTIONS.slice(0, 6)) {
      for (const item of retrieveMaterialsInTopic(real, question, "t-accidents")) {
        const why = forbidden.get(item.id);
        if (why !== undefined) leaks.push(`„${question}" → ${why}`);
      }
    }
    expect(leaks, `Tier 2 widened into:\n${leaks.join("\n")}`).toEqual([]);
  });
});

describe("MIN_QUESTION_COVERAGE — the floor the gate made necessary", () => {
  it("refuses material that shares only generic words with the question", () => {
    // Withholding the on-topic rows left the scorer free to promote whatever
    // was left. MEASURED right after the gate went in: „Как се спира силно
    // кръвотечение?" was answered with c-stopping-standing-rules („Как се спира
    // и престоява правилно"), a brakes question and two motorway questions —
    // six APPROVED rows carrying real lawRefs, none about bleeding. The model
    // is told to cite what it uses, so that is a whitelist-approved citation
    // under a clinical question, which the citation validator cannot catch.
    const real = getContentRepo();
    const ids = retrieveMaterials(real, "Как се спира силно кръвотечение?").map(
      (i) => i.id,
    );
    expect(ids).not.toContain("c-stopping-standing-rules");
  });

  it("keeps a strong hit whose match is concentrated in one long word", () => {
    const real = getContentRepo();
    // 1 content token after stopwording — a fraction, not a sum, is what makes
    // a one-word question survivable at all.
    expect(retrieveMaterials(real, "Разкажи ми за изпреварването").length)
      .toBeGreaterThan(0);
  });

  it("is a fraction of the QUESTION, so it does not punish long materials", () => {
    expect(MIN_QUESTION_COVERAGE).toBeGreaterThan(0);
    expect(MIN_QUESTION_COVERAGE).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Second corpus: the sim rule catalog (audit I-1)
// ---------------------------------------------------------------------------

describe("parseCatalogLawRef", () => {
  it("splits the authored string at the first reference token", () => {
    expect(parseCatalogLawRef("ЗДвП чл. 21")).toEqual({
      act: "ЗДвП",
      ref: "чл. 21",
    });
  });

  it("keeps a compound reference whole", () => {
    expect(parseCatalogLawRef("ЗДвП чл. 20, ал. 2")).toEqual({
      act: "ЗДвП",
      ref: "чл. 20, ал. 2",
    });
  });

  it("drops the engine's parenthetical gloss", () => {
    expect(
      parseCatalogLawRef("ППЗДвП чл. 63 (М1 — единична непрекъсната линия)"),
    ).toEqual({ act: "ППЗДвП", ref: "чл. 63" });
    expect(
      parseCatalogLawRef(
        "Наредба № 38 (второстепенни грешки — загасване на двигателя)",
      ),
    ).toEqual({ act: "Наредба", ref: "№ 38" });
  });

  it("refuses to invent a reference when the string has none", () => {
    expect(parseCatalogLawRef("ЗДвП")).toBeNull();
    expect(parseCatalogLawRef("чл. 21")).toBeNull();
  });

  it("parses every lawRef in the real catalog", () => {
    // A new violation whose lawRef this parser cannot read would ground the
    // tutor with no citable source — caught here, not in production.
    const unparsed = Object.entries(VIOLATIONS)
      .filter(([, spec]) => parseCatalogLawRef(spec.lawRef) === null)
      .map(([code]) => code);
    expect(unparsed).toEqual([]);
  });
});

describe("retrieveRuleMaterials", () => {
  it("retrieves the catalog entry for a driving-behaviour question", () => {
    const items = retrieveRuleMaterials(
      "Какво става, ако не пропусна пешеходец на пътеката?",
    );
    const yielded = items.find((i) => i.id === "rule:PEDESTRIAN_NOT_YIELDED");
    expect(yielded).toBeDefined();
    expect(yielded?.kind).toBe("rule");
    // The whole point of the corpus: the citation rides along with it.
    expect(yielded?.lawRefs).toEqual([{ act: "ЗДвП", ref: "чл. 119, ал. 1" }]);
  });

  it("carries the official severity, points and corrective into the body", () => {
    const items = retrieveRuleMaterials(
      "Какво става, ако не пропусна пешеходец на пътеката?",
    );
    const body = items.find((i) => i.id === "rule:PEDESTRIAN_NOT_YIELDED")
      ?.bodyBg;
    expect(body).toContain("опасна грешка");
    expect(body).toContain("10 наказателни точки");
    expect(body).toContain("Правилното действие:");
  });

  it("returns nothing for a driving question the catalog does not cover", () => {
    // Fines and insurance are real driving topics and completely absent from
    // the catalog — the tutor must stay silent rather than reason from it.
    expect(retrieveRuleMaterials("Каква е глобата за изтекла застраховка?")).toEqual(
      [],
    );
  });

  it("returns nothing for off-topic or stopword-only input", () => {
    expect(retrieveRuleMaterials("Каква е столицата на Франция?")).toEqual([]);
    expect(retrieveRuleMaterials("Какво е това?")).toEqual([]);
  });

  it("caps the corpus at MAX_RETRIEVED_RULES and sorts by score", () => {
    const items = retrieveRuleMaterials("мигач огледало скорост пешеходец");
    expect(items.length).toBeLessThanOrEqual(MAX_RETRIEVED_RULES);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].score).toBeGreaterThanOrEqual(items[i].score);
    }
  });
});

describe("retrieveGrounding", () => {
  it("reserves the rule slots so content matches cannot crowd them out", () => {
    // "предимство" matches the exam question, the sign AND the catalog's
    // FAILED_TO_YIELD — the student must get both corpora, not the louder one.
    const items = retrieveGrounding(repo, "Кой има предимство на кръстовище?");
    expect(items.some((i) => i.kind === "question")).toBe(true);
    expect(items.some((i) => i.kind === "rule")).toBe(true);
    expect(items.map((i) => i.id)).toContain("rule:FAILED_TO_YIELD");
  });

  it("stays empty when neither corpus covers the question", () => {
    expect(retrieveGrounding(repo, "Каква е глобата за изтекла застраховка?")).toEqual(
      [],
    );
  });
});

describe("retrieveGroundingForTurn (follow-ups, doc 81 D2)", () => {
  const PRIOR = "Кой има предимство на кръстовище?";

  it("grounds a bare „А защо?“ in the question it follows up on", () => {
    // Both words are stopwords, so on its own this retrieves NOTHING and the
    // system prompt forces the refusal — the second message of nearly every
    // conversation. This is the defect, asserted.
    expect(retrieveGrounding(repo, "А защо?")).toEqual([]);

    const items = retrieveGroundingForTurn(repo, "А защо?", PRIOR);
    expect(items.map((i) => i.id)).toContain(QUESTION_PRIORITY.id);
  });

  it("still refuses a follow-up when there is no previous question", () => {
    expect(retrieveGroundingForTurn(repo, "А защо?", null)).toEqual([]);
    expect(retrieveGroundingForTurn(repo, "А защо?")).toEqual([]);
  });

  it("leaves a question that stands on its own bit-identical", () => {
    // The fallback must not perturb any question that already worked: a new
    // topic mid-conversation gets exactly the materials it would have got as
    // the first message, in the same order.
    const alone = retrieveGrounding(repo, "Каква е скоростта в града?");
    const inThread = retrieveGroundingForTurn(
      repo,
      "Каква е скоростта в града?",
      PRIOR,
    );
    expect(inThread).toEqual(alone);
    expect(inThread.map((i) => i.id)).toContain(QUESTION_SPEED.id);
    expect(inThread.map((i) => i.id)).not.toContain(QUESTION_PRIORITY.id);
  });

  it("does not let the previous topic answer a new off-curriculum question", () => {
    // "глоба"/"застраховка" ARE content tokens — this is a genuinely new topic
    // our corpora do not cover, so it must keep refusing. Dragging the
    // previous question's materials under it is the ADR-002 failure the narrow
    // fallback exists to avoid.
    expect(
      retrieveGroundingForTurn(
        repo,
        "Каква е глобата за изтекла застраховка?",
        PRIOR,
      ),
    ).toEqual([]);
  });
});
