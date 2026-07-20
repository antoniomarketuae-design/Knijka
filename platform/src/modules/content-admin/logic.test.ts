/**
 * Unit tests for the pure content-review logic — schema validation, [REVIEW: …]
 * prefix handling, status transitions, wire parsing and house-style
 * serialisation. Entirely in-memory: no real /content files are read or
 * written.
 */
import { describe, expect, it } from "vitest";
import type { Question } from "@/lib/content/types";
import {
  applyDecision,
  detectLawRefsStyle,
  extractReviewNote,
  hasReviewPrefix,
  parseReviewRequest,
  serializeQuestionsFile,
  stripReviewPrefix,
  validateQuestion,
  validateQuestionsFile,
} from "./logic";

// A realistic flagged question: "single", with a leading [REVIEW: …] note.
function flaggedSingle(): Question {
  return {
    id: "q-osnovni-037",
    conceptIds: ["c-seatbelts"],
    type: "single",
    points: 2,
    textBg: "В кой случай водачът има право да е без предпазен колан?",
    options: [
      { id: "a", textBg: "При медицинско противопоказание с документ", correct: true },
      { id: "b", textBg: "При кратко пътуване", correct: false },
      { id: "c", textBg: "При скорост под 30 км/ч", correct: false },
      { id: "d", textBg: "Когато има въздушни възглавници", correct: false },
    ],
    explanationBg:
      "[REVIEW: да се потвърди чл. 137а, ал. 2 — заден ход НЕ фигурира сред изключенията.] Изключенията са броени на пръсти (ЗДвП, чл. 137а).",
    lawRefs: [{ act: "ЗДвП", ref: "чл. 137а, ал. 2?" }],
    media: null,
    status: "needs-review",
  };
}

// A flagged "multi" question WITHOUT any [REVIEW: …] note.
function flaggedMulti(): Question {
  return {
    id: "q-osnovni-005",
    conceptIds: ["c-road-elements"],
    type: "multi",
    points: 2,
    textBg: "Кои са елементи на пътя?",
    options: [
      { id: "a", textBg: "Платното", correct: true },
      { id: "b", textBg: "Банкетът", correct: true },
      { id: "c", textBg: "Дворовете край пътя", correct: false },
    ],
    explanationBg: "Пътят включва платно и банкет (§ 6 ДР ЗДвП).",
    lawRefs: [{ act: "ЗДвП", ref: "§ 6 ДР" }],
    media: null,
    status: "needs-review",
  };
}

describe("[REVIEW: …] prefix handling", () => {
  const withNote = flaggedSingle().explanationBg;

  it("extracts the note text", () => {
    expect(extractReviewNote(withNote)).toBe(
      "да се потвърди чл. 137а, ал. 2 — заден ход НЕ фигурира сред изключенията.",
    );
  });

  it("strips the note and its trailing whitespace", () => {
    expect(stripReviewPrefix(withNote)).toBe(
      "Изключенията са броени на пръсти (ЗДвП, чл. 137а).",
    );
  });

  it("is idempotent and a no-op when there is no note", () => {
    const clean = "Просто обяснение.";
    expect(stripReviewPrefix(clean)).toBe(clean);
    expect(stripReviewPrefix(stripReviewPrefix(withNote))).toBe(stripReviewPrefix(withNote));
    expect(extractReviewNote(clean)).toBeNull();
    expect(hasReviewPrefix(clean)).toBe(false);
    expect(hasReviewPrefix(withNote)).toBe(true);
  });

  it("handles a note ending in '?]'", () => {
    const text = "[REVIEW: точният член да се потвърди?] Основното правило важи.";
    expect(extractReviewNote(text)).toBe("точният член да се потвърди?");
    expect(stripReviewPrefix(text)).toBe("Основното правило важи.");
  });
});

describe("validateQuestion", () => {
  it("accepts a well-formed question", () => {
    const result = validateQuestion(flaggedMulti());
    expect(result.ok).toBe(true);
  });

  it("rejects a single question with no correct option", () => {
    const q = flaggedSingle();
    const broken = { ...q, options: q.options.map((o) => ({ ...o, correct: false })) };
    const result = validateQuestion(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/exactly 1 correct option/);
  });

  it("rejects unknown extra keys (strict schema)", () => {
    const result = validateQuestion({ ...flaggedMulti(), sneaky: true });
    expect(result.ok).toBe(false);
  });
});

describe("applyDecision — approve", () => {
  it("sets status approved and strips the [REVIEW: …] prefix", () => {
    const result = applyDecision(flaggedSingle(), { action: "approve" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.question.status).toBe("approved");
      expect(result.question.explanationBg).toBe(
        "Изключенията са броени на пръсти (ЗДвП, чл. 137а).",
      );
      // Non-editable fields are preserved.
      expect(result.question.id).toBe("q-osnovni-037");
      expect(result.question.conceptIds).toEqual(["c-seatbelts"]);
      expect(result.question.points).toBe(2);
    }
  });

  it("leaves a clean explanation untouched", () => {
    const q = flaggedMulti();
    const result = applyDecision(q, { action: "approve" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.question.status).toBe("approved");
      expect(result.question.explanationBg).toBe(q.explanationBg);
    }
  });
});

describe("applyDecision — reject", () => {
  it("sets status draft and preserves the note for the fixer", () => {
    const q = flaggedSingle();
    const result = applyDecision(q, { action: "reject" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.question.status).toBe("draft");
      expect(result.question.explanationBg).toBe(q.explanationBg); // note kept
    }
  });
});

describe("applyDecision — edit", () => {
  it("applies text/option/lawRef edits, approves and strips the prefix", () => {
    const result = applyDecision(flaggedSingle(), {
      action: "edit",
      patch: {
        textBg: "Поправен въпрос?",
        explanationBg: "Изчистено обяснение без бележка.",
        options: [
          { id: "a", textBg: "Верен", correct: true },
          { id: "b", textBg: "Грешен", correct: false },
        ],
        lawRefs: [{ act: "ЗДвП", ref: "чл. 137а" }],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.question.status).toBe("approved");
      expect(result.question.textBg).toBe("Поправен въпрос?");
      expect(result.question.explanationBg).toBe("Изчистено обяснение без бележка.");
      expect(result.question.options).toHaveLength(2);
      expect(result.question.lawRefs).toEqual([{ act: "ЗДвП", ref: "чл. 137а" }]);
    }
  });

  it("supports changing type single → multi", () => {
    const result = applyDecision(flaggedSingle(), {
      action: "edit",
      patch: {
        type: "multi",
        options: [
          { id: "a", textBg: "Верен 1", correct: true },
          { id: "b", textBg: "Верен 2", correct: true },
          { id: "c", textBg: "Грешен", correct: false },
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.question.type).toBe("multi");
      expect(result.question.options.filter((o) => o.correct)).toHaveLength(2);
    }
  });

  it("rejects an edit that violates the single-correct rule", () => {
    const result = applyDecision(flaggedSingle(), {
      action: "edit",
      patch: {
        options: [
          { id: "a", textBg: "Верен", correct: true },
          { id: "b", textBg: "Също верен", correct: true },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/exactly 1 correct option/);
  });

  it("strips a [REVIEW: …] prefix left inside an edited explanation", () => {
    const result = applyDecision(flaggedSingle(), {
      action: "edit",
      patch: { explanationBg: "[REVIEW: още се уточнява] Междувременно това важи." },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.question.explanationBg).toBe("Междувременно това важи.");
  });

  it("preserves option sign-face media across an options edit (THEO-1)", () => {
    const question = flaggedSingle();
    question.options[0].media = { kind: "sign", signRef: "Б2" };
    const result = applyDecision(question, {
      action: "edit",
      patch: {
        options: [
          { id: "a", textBg: "Верен (поправен)", correct: true },
          { id: "b", textBg: "Грешен", correct: false },
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.question.options[0].media).toEqual({ kind: "sign", signRef: "Б2" });
      expect(result.question.options[1].media).toBeUndefined();
    }
  });
});

describe("parseReviewRequest", () => {
  it("parses approve / reject", () => {
    expect(parseReviewRequest({ questionId: "q-1", action: "approve" })).toEqual({
      questionId: "q-1",
      decision: { action: "approve" },
    });
    expect(parseReviewRequest({ questionId: "q-1", action: "reject" })).toEqual({
      questionId: "q-1",
      decision: { action: "reject" },
    });
  });

  it("parses edit with a patch", () => {
    const parsed = parseReviewRequest({
      questionId: "q-1",
      action: "edit",
      patch: { textBg: "нов текст" },
    });
    expect(parsed).toEqual({
      questionId: "q-1",
      decision: { action: "edit", patch: { textBg: "нов текст" } },
    });
  });

  it("rejects malformed bodies", () => {
    expect(parseReviewRequest(null)).toBeNull();
    expect(parseReviewRequest({ action: "approve" })).toBeNull(); // no questionId
    expect(parseReviewRequest({ questionId: "q-1", action: "delete" })).toBeNull();
    expect(parseReviewRequest({ questionId: "q-1", action: "edit" })).toBeNull(); // missing patch
    // strict patch: unknown key rejected
    expect(
      parseReviewRequest({ questionId: "q-1", action: "edit", patch: { status: "approved" } }),
    ).toBeNull();
  });
});

describe("serializeQuestionsFile", () => {
  const questions = [flaggedMulti(), flaggedSingle()];

  it("round-trips without losing or reordering data", () => {
    const text = serializeQuestionsFile(questions);
    expect(JSON.parse(text)).toEqual(questions);
  });

  it("is stable / idempotent", () => {
    const once = serializeQuestionsFile(questions);
    const twice = serializeQuestionsFile(JSON.parse(once) as Question[]);
    expect(twice).toBe(once);
  });

  it("emits the house style: 2-space indent, inline lawRefs, one option per line", () => {
    const text = serializeQuestionsFile([flaggedMulti()]);
    expect(text.startsWith("[\n  {\n")).toBe(true);
    expect(text.endsWith("\n]\n")).toBe(true);
    expect(text).toContain('    "lawRefs": [{ "act": "ЗДвП", "ref": "§ 6 ДР" }]');
    expect(text).toContain('      { "id": "a", "textBg": "Платното", "correct": true }');
    expect(text).toContain('    "media": null');
  });

  it("serialises non-null media without dropping it", () => {
    const withMedia: Question = {
      ...flaggedMulti(),
      media: { type: "image", ref: "signs/svg/b2.svg" },
    };
    const text = serializeQuestionsFile([withMedia]);
    expect(JSON.parse(text)).toEqual([withMedia]);
  });

  it("serialises THEO-1 media kinds and option media without dropping them", () => {
    const base = flaggedMulti();
    const withMedia: Question = {
      ...base,
      options: [
        { ...base.options[0], media: { kind: "sign", signRef: "Б1" } },
        base.options[1],
        base.options[2],
      ],
      media: {
        kind: "sceneStill",
        districtId: "tj-stop-v1",
        focus: { x: 0, y: 0, zoomM: 60 },
        poses: [{ kind: "car", x: 0, y: -10, headingDeg: 0, variant: "ego" }],
        marks: [{ kind: "danger", x: 2, y: 2 }],
      },
    };
    const text = serializeQuestionsFile([withMedia]);
    expect(JSON.parse(text)).toEqual([withMedia]);
    // house style survives: option media inline on the option's line
    expect(text).toContain('"media": {"kind":"sign","signRef":"Б1"} }');
  });

  it("renders lawRefs one-per-line in block style and round-trips", () => {
    const q: Question = { ...flaggedMulti(), lawRefs: [{ act: "ЗДвП", ref: "чл. 6" }] };
    const text = serializeQuestionsFile([q], "block");
    expect(text).toContain('    "lawRefs": [\n      { "act": "ЗДвП", "ref": "чл. 6" }\n    ]');
    expect(JSON.parse(text)).toEqual([q]);
  });
});

describe("detectLawRefsStyle", () => {
  it("recognises inline vs block lawRefs", () => {
    expect(detectLawRefsStyle('  "lawRefs": [{ "act": "ЗДвП", "ref": "чл. 6" }],')).toBe("inline");
    expect(detectLawRefsStyle('  "lawRefs": [\n    { "act": "ЗДвП", "ref": "чл. 6" }\n  ],')).toBe(
      "block",
    );
  });
});

describe("validateQuestionsFile", () => {
  it("accepts a valid array and rejects an invalid one", () => {
    expect(validateQuestionsFile([flaggedMulti(), flaggedSingle()]).ok).toBe(true);
    const broken = [{ ...flaggedMulti(), points: 4 }];
    const result = validateQuestionsFile(broken);
    expect(result.ok).toBe(false);
  });
});
