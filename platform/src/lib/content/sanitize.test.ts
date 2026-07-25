/**
 * Tests for the staff-annotation sanitiser (audit M-6). The regression these
 * pin: a `[REVIEW: …]` note left in a content file must never survive as far
 * as a string a student can read — and ordinary bracketed Bulgarian prose must
 * survive untouched.
 */
import { describe, expect, it } from "vitest";
import {
  containsStaffAnnotation,
  sanitizeContentTree,
  stripStaffAnnotations,
} from "./sanitize";

describe("stripStaffAnnotations", () => {
  it("removes the leading [REVIEW: …] note the audit found in 58 explanations", () => {
    const text =
      "[REVIEW: да се потвърди точният член от ЗДвП за задълженията пред жп прелез — чл. 51–52?] " +
      "Б2 значи пълно спиране.";
    expect(stripStaffAnnotations(text)).toBe("Б2 значи пълно спиране.");
  });

  it("removes a note in the middle of a sentence and closes the gap", () => {
    expect(stripStaffAnnotations("Спираш винаги [TODO: пример] преди линията.")).toBe(
      "Спираш винаги преди линията.",
    );
  });

  it("removes several notes and every supported marker", () => {
    for (const marker of ["REVIEW", "TODO", "FIXME", "TBD", "XXX", "HACK", "NOTE", "CHECK", "VERIFY", "QA"]) {
      expect(stripStaffAnnotations(`Текст [${marker}: бележка] край.`)).toBe("Текст край.");
    }
    expect(stripStaffAnnotations("[TODO] Текст [REVIEW: x] край.")).toBe("Текст край.");
  });

  it("keeps paragraph structure — only horizontal whitespace is collapsed", () => {
    expect(stripStaffAnnotations("[REVIEW: x]\nПърви ред.\nВтори ред.")).toBe(
      "Първи ред.\nВтори ред.",
    );
  });

  it("leaves ordinary bracketed Bulgarian prose alone", () => {
    const clean = "Виж знак Б2 [виж чл. 5] и спри.";
    expect(stripStaffAnnotations(clean)).toBe(clean);
    expect(containsStaffAnnotation(clean)).toBe(false);
  });

  it("is case sensitive — lowercase brackets are author copy, not staff notes", () => {
    const clean = "Пример [note: това е бележка към ученика]";
    expect(stripStaffAnnotations(clean)).toBe(clean);
  });

  it("is idempotent and a no-op on clean text", () => {
    const clean = "Просто обяснение.";
    expect(stripStaffAnnotations(clean)).toBe(clean);
    const once = stripStaffAnnotations("[REVIEW: x] Обяснение.");
    expect(stripStaffAnnotations(once)).toBe(once);
  });

  it("reports annotations without stripping them", () => {
    expect(containsStaffAnnotation("[REVIEW: x] Обяснение.")).toBe(true);
    // Called twice: the shared /g/ regex must not carry lastIndex between calls.
    expect(containsStaffAnnotation("[REVIEW: x] Обяснение.")).toBe(true);
    expect(containsStaffAnnotation("Обяснение.")).toBe(false);
  });
});

describe("sanitizeContentTree", () => {
  it("strips annotations from every string at every depth", () => {
    const dirty = {
      id: "q-1",
      textBg: "[REVIEW: формулировка?] Какво значи Б2?",
      options: [
        { id: "a", textBg: "Спираш [TODO: пример]", correct: true },
        { id: "b", textBg: "Намаляваш", correct: false },
      ],
      lawRefs: [{ act: "ЗДвП", ref: "чл. 47 [CHECK: версия?]" }],
      media: null,
      points: 3,
    };
    expect(sanitizeContentTree(dirty)).toEqual({
      id: "q-1",
      textBg: "Какво значи Б2?",
      options: [
        { id: "a", textBg: "Спираш", correct: true },
        { id: "b", textBg: "Намаляваш", correct: false },
      ],
      lawRefs: [{ act: "ЗДвП", ref: "чл. 47" }],
      media: null,
      points: 3,
    });
  });

  it("returns the very same node when nothing needed cleaning", () => {
    const clean = { a: ["x", { b: 1 }], c: null };
    expect(sanitizeContentTree(clean)).toBe(clean);
  });

  it("preserves non-string leaves untouched", () => {
    expect(sanitizeContentTree([1, true, null, "[TODO: x] край"])).toEqual([
      1,
      true,
      null,
      "край",
    ]);
  });
});
