import { describe, expect, it } from "vitest";
import { shouldLockComposer } from "./composerLock";

describe("shouldLockComposer", () => {
  it("does not lock a normal answered turn", () => {
    expect(shouldLockComposer({ limited: false })).toBe(false);
  });

  it.each([
    "the burst guard",
    "the daily cap",
    "the pack allowance",
    "the site budget kill-switch",
    "the spent free trial",
  ])("locks for %s — terminal, so retrying now cannot help", () => {
    // The five terminal ceilings all send `limited` with no `retryable`.
    expect(shouldLockComposer({ limited: true })).toBe(true);
    expect(shouldLockComposer({ limited: true, retryable: false })).toBe(true);
  });

  it("does NOT lock for a provider fault — the reply says to try again", () => {
    expect(shouldLockComposer({ limited: true, retryable: true })).toBe(false);
  });

  it("ignores retryable when the turn was answered", () => {
    // Belt and braces: a provider cannot be both fine and faulty, but the
    // predicate should not invent a lock from a stray flag.
    expect(shouldLockComposer({ limited: false, retryable: true })).toBe(false);
  });
});
