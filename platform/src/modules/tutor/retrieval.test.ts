import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "@/modules/sim/rules";
import {
  makeTutorFixtureRepo,
  CONCEPT_PRIORITY,
  CONCEPT_SPEED,
  QUESTION_PRIORITY,
  SIGN_STOP,
} from "./fixtures";
import {
  MAX_RETRIEVED_RULES,
  normalizeBg,
  parseCatalogLawRef,
  retrieveGrounding,
  retrieveGroundingForTurn,
  retrieveMaterials,
  retrieveRuleMaterials,
  tokenizeBg,
} from "./retrieval";

const repo = makeTutorFixtureRepo();

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
  it("finds the priority concept for a priority question", () => {
    const items = retrieveMaterials(repo, "Кога имам предимство?");
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((i) => i.id)).toContain(CONCEPT_PRIORITY.id);
    // The unrelated speed concept must not outrank priority material.
    expect(items[0].id).not.toBe(CONCEPT_SPEED.id);
  });

  it("matches inflected forms via prefix matching", () => {
    // "предимството" (definite form) vs "предимство" in the material.
    const items = retrieveMaterials(repo, "Обясни ми предимството");
    expect(items.map((i) => i.id)).toContain(CONCEPT_PRIORITY.id);
  });

  it("finds a sign by its official code", () => {
    const items = retrieveMaterials(repo, "Какво значи знак Б2?");
    expect(items.map((i) => i.id)).toContain(SIGN_STOP.id);
  });

  it("carries lawRefs through for citation grounding", () => {
    const items = retrieveMaterials(repo, "предимство на кръстовище");
    const priority = items.find((i) => i.id === CONCEPT_PRIORITY.id);
    expect(priority?.lawRefs).toEqual([{ act: "ЗДвП", ref: "чл. 47" }]);
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
    expect(yielded?.lawRefs).toEqual([{ act: "ЗДвП", ref: "чл. 119" }]);
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
    // "предимство" matches the concept, the exam question AND the catalog's
    // FAILED_TO_YIELD — the student must get both corpora, not the louder one.
    const items = retrieveGrounding(repo, "Кой има предимство на кръстовище?");
    expect(items.some((i) => i.kind === "concept")).toBe(true);
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
    expect(items.map((i) => i.id)).toContain(CONCEPT_PRIORITY.id);
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
    expect(inThread.map((i) => i.id)).toContain(CONCEPT_SPEED.id);
    expect(inThread.map((i) => i.id)).not.toContain(CONCEPT_PRIORITY.id);
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
