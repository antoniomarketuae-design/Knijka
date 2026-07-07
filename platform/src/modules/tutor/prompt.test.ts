import { describe, expect, it } from "vitest";
import type { RetrievedItem } from "./retrieval";
import {
  buildTutorSystemPrompt,
  extractCitations,
  formatLawRef,
  TUTOR_NO_MATERIAL_REPLY_BG,
} from "./prompt";

const MATERIAL: RetrievedItem = {
  kind: "concept",
  id: "c-predimstvo",
  titleBg: "Предимство на кръстовище",
  bodyBg: "Водачът е длъжен да пропусне превозните средства с предимство.",
  lawRefs: [{ act: "ЗДвП", ref: "чл. 47" }],
  score: 5,
};

describe("buildTutorSystemPrompt", () => {
  const prompt = buildTutorSystemPrompt({
    materials: [MATERIAL],
    weakestConceptTitlesBg: ["Ограничения на скоростта", "Пътни знаци"],
  });

  it("establishes the Учителят persona in Bulgarian", () => {
    expect(prompt).toContain("Учителят");
    expect(prompt).toContain("български");
  });

  it("injects the material with title, body and lawRef markers", () => {
    expect(prompt).toContain("Предимство на кръстовище");
    expect(prompt).toContain(MATERIAL.bodyBg);
    expect(prompt).toContain("[ЗДвП чл. 47]");
  });

  it("instructs strict grounding and the exact no-material reply", () => {
    expect(prompt).toContain("САМО въз основа на МАТЕРИАЛИТЕ");
    expect(prompt).toContain(TUTOR_NO_MATERIAL_REPLY_BG);
  });

  it("lists the student's weakest concepts", () => {
    expect(prompt).toContain("- Ограничения на скоростта");
    expect(prompt).toContain("- Пътни знаци");
  });

  it("handles the empty-materials and no-data cases", () => {
    const empty = buildTutorSystemPrompt({
      materials: [],
      weakestConceptTitlesBg: [],
    });
    expect(empty).toContain("(няма намерени материали по този въпрос)");
    expect(empty).toContain("(няма данни — ученикът тепърва започва)");
  });
});

describe("formatLawRef", () => {
  it("produces the chip-friendly marker", () => {
    expect(formatLawRef({ act: "ЗДвП", ref: "чл. 47" })).toBe("[ЗДвП чл. 47]");
  });
});

describe("extractCitations", () => {
  const known = [
    { act: "ЗДвП", ref: "чл. 47" },
    { act: "ППЗДвП", ref: "чл. 46" },
  ];

  it("extracts known citations in order of first appearance", () => {
    const reply =
      "Спираш на [ППЗДвП чл. 46] и пропускаш с предимство [ЗДвП чл. 47].";
    expect(extractCitations(reply, known)).toEqual([
      { act: "ППЗДвП", ref: "чл. 46" },
      { act: "ЗДвП", ref: "чл. 47" },
    ]);
  });

  it("drops markers that don't match an injected lawRef", () => {
    const reply = "Виж [ЗДвП чл. 999] и [нещо друго].";
    expect(extractCitations(reply, known)).toEqual([]);
  });

  it("deduplicates repeated citations", () => {
    const reply = "[ЗДвП чл. 47] ... пак [ЗДвП чл. 47].";
    expect(extractCitations(reply, known)).toEqual([
      { act: "ЗДвП", ref: "чл. 47" },
    ]);
  });

  it("tolerates whitespace and case wobble inside the marker", () => {
    const reply = "Основание: [здвп  ЧЛ. 47].";
    expect(extractCitations(reply, known)).toEqual([
      { act: "ЗДвП", ref: "чл. 47" },
    ]);
  });

  it("returns nothing when the reply has no markers", () => {
    expect(extractCitations(TUTOR_NO_MATERIAL_REPLY_BG, known)).toEqual([]);
  });
});
