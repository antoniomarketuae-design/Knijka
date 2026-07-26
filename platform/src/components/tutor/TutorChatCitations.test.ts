import { describe, expect, it } from "vitest";
import { splitTutorMessage } from "./TutorChatCitations";

const VALID = [{ act: "ЗДвП", ref: "чл. 47" }];

/** The text a rendered part list puts on screen, in order. */
function rendered(parts: ReturnType<typeof splitTutorMessage>): string {
  return parts
    .map((p) => (p.kind === "citation" ? `[${p.label}]` : p.text))
    .join("");
}

describe("splitTutorMessage", () => {
  it("promotes a server-validated marker to a citation chip", () => {
    const parts = splitTutorMessage(
      "Пропускаш идващите с предимство [ЗДвП чл. 47].",
      VALID,
    );
    expect(parts).toContainEqual({ kind: "citation", label: "ЗДвП чл. 47" });
  });

  it("never renders an invented marker as a citation (ADR-002)", () => {
    // The whole defect in one assertion: the model emits a reference that was
    // never in the retrieved materials, so the server's whitelist refused it.
    // It must reach the student as ordinary text, not wearing a law chip.
    const parts = splitTutorMessage(
      "Виж [ЗДвП чл. 999] и [Наредба № 99].",
      VALID,
    );
    expect(parts.some((p) => p.kind === "citation")).toBe(false);
    expect(parts).toEqual([
      { kind: "text", text: "Виж [ЗДвП чл. 999] и [Наредба № 99]." },
    ]);
  });

  it("chips only the validated marker when a reply mixes both", () => {
    const parts = splitTutorMessage(
      "Вярно [ЗДвП чл. 47], измислено [ЗДвП чл. 999].",
      VALID,
    );
    const chips = parts.filter((p) => p.kind === "citation");
    expect(chips).toEqual([{ kind: "citation", label: "ЗДвП чл. 47" }]);
  });

  it("tolerates the same case/whitespace wobble the server accepted", () => {
    // extractCitations() validates on a lowercased, whitespace-collapsed
    // label. If this side were stricter, a citation the server approved would
    // silently lose its chip.
    const parts = splitTutorMessage("Основание: [здвп  ЧЛ. 47].", VALID);
    expect(parts).toContainEqual({ kind: "citation", label: "здвп  ЧЛ. 47" });
  });

  it("renders nothing as a chip when the message carries no citation list", () => {
    // User messages, and assistant replies persisted before the tutor stored
    // its validated list. Absent evidence must render as no chips, not all.
    const text = "Ама аз четох за [ЗДвП чл. 47], вярно ли е?";
    expect(splitTutorMessage(text)).toEqual([{ kind: "text", text }]);
    expect(splitTutorMessage(text, [])).toEqual([{ kind: "text", text }]);
  });

  it("keeps the student's text intact whatever the verdict", () => {
    const text = "Едно [ЗДвП чл. 47], две [измислено], три [ЗДвП чл. 999].";
    expect(rendered(splitTutorMessage(text, VALID))).toBe(text);
    expect(rendered(splitTutorMessage(text))).toBe(text);
  });

  it("merges rejected markers into the surrounding prose", () => {
    // A refused marker must not fragment the paragraph into stray spans.
    const parts = splitTutorMessage("а [x] б [ЗДвП чл. 47] в [y] г", VALID);
    expect(parts).toEqual([
      { kind: "text", text: "а [x] б " },
      { kind: "citation", label: "ЗДвП чл. 47" },
      { kind: "text", text: " в [y] г" },
    ]);
  });

  it("handles a reply with no markers at all", () => {
    const text = "Нямам материал за това — питай ме за правилата.";
    expect(splitTutorMessage(text, VALID)).toEqual([{ kind: "text", text }]);
  });
});
