import { describe, expect, it } from "vitest";
import { parseTutorMessages } from "./store";

describe("parseTutorMessages", () => {
  it("parses a valid Json array", () => {
    expect(
      parseTutorMessages([
        { role: "user", content: "въпрос", ts: 1 },
        { role: "assistant", content: "отговор", ts: 2 },
      ]),
    ).toEqual([
      { role: "user", content: "въпрос", ts: 1 },
      { role: "assistant", content: "отговор", ts: 2 },
    ]);
  });

  it("drops malformed entries instead of crashing", () => {
    expect(
      parseTutorMessages([
        null,
        "junk",
        { role: "system", content: "x", ts: 1 },
        { role: "user", content: 42, ts: 1 },
        { role: "user", content: "ок", ts: 3 },
      ]),
    ).toEqual([{ role: "user", content: "ок", ts: 3 }]);
  });

  it("returns [] for non-array values", () => {
    expect(parseTutorMessages(null)).toEqual([]);
    expect(parseTutorMessages({})).toEqual([]);
    expect(parseTutorMessages("[]")).toEqual([]);
  });

  it("carries the validated citations through", () => {
    // The UI renders law chips from this list and from nothing else (ADR-002),
    // so losing it on read would demote every verified citation to plain text.
    const [msg] = parseTutorMessages([
      {
        role: "assistant",
        content: "Пропускаш идващите с предимство [ЗДвП чл. 47].",
        ts: 1,
        citations: [{ act: "ЗДвП", ref: "чл. 47" }],
      },
    ]);
    expect(msg.citations).toEqual([{ act: "ЗДвП", ref: "чл. 47" }]);
  });

  it("refuses to reconstruct a half-readable citation", () => {
    // A row this malformed is evidence of nothing. Approving the readable part
    // would hand the UI permission to draw a chip the server never granted.
    const [msg] = parseTutorMessages([
      {
        role: "assistant",
        content: "Виж [ЗДвП чл. 47].",
        ts: 1,
        citations: [{ act: "ЗДвП" }, "ЗДвП чл. 47", null, { ref: "чл. 47" }],
      },
    ]);
    expect(msg.citations).toEqual([]);
  });

  it("leaves citations absent when the stored value is not a list", () => {
    const [msg] = parseTutorMessages([
      { role: "assistant", content: "х", ts: 1, citations: "ЗДвП чл. 47" },
    ]);
    expect(msg.citations).toBeUndefined();
  });
});
