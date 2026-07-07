import { describe, expect, it } from "vitest";
import {
  makeTutorFixtureRepo,
  CONCEPT_PRIORITY,
  CONCEPT_SPEED,
  QUESTION_PRIORITY,
  SIGN_STOP,
} from "./fixtures";
import { normalizeBg, retrieveMaterials, tokenizeBg } from "./retrieval";

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
