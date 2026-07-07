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
});
