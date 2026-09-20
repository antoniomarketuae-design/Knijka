/**
 * =============================================================================
 * THE PHONE'S BRIEFING OPENS ONLY IF THE STUDENT ASKED FOR IT
 * — FOUNDER RULING 2026-09-20, and the rows it settles.
 * =============================================================================
 *
 * THE RULING, VERBATIM, because it is not one of the three options it answered:
 * «In fact all this is causing huge issue for phone since its not working
 * properly and its taking alot of space on the screen to we have to hide it and
 * make it optional if the user wants it on».
 *
 * So the phone's start-of-lesson ИНСТРУКЦИИ card is OFF by default and the
 * student may switch it on; the roomy stage — whose side panel costs nobody any
 * world — is unchanged and stays ON by default. That is a DELIBERATE divergence
 * between the two surfaces, which matters because the rows this settles
 * (`sc-signal-hesitation:f5ffccf3` and the briefing clause of
 * `sc-rb-busy-gap:7bbdd45e` / `sc-sig-controller-postures:f7e046c4`) complain
 * that the two platforms differ. The founder was shown that framing and ruled
 * for the phone's screen space instead: the platforms SHOULD differ here.
 *
 * THEO-4 (requirement zero) IS WHY THIS IS A DEFAULT AND NOT A DELETION. The
 * authored steps are the lesson's own instructions; hiding them for good would
 * be a bare task with no explanation. They stay reachable for the WHOLE drive
 * through the МЕНЮ row «Инструкции · N стъпки» (`recallBriefing`), which is
 * already present on the compact surface and carries its own step count. The
 * last describe block below holds that route as a contract, so this default
 * cannot be shipped in a build where the way back has been removed.
 *
 * EXECUTED, NOT MATCHED. Every case here CALLS the predicate. A source-scanning
 * assertion would pass against a shell that had stopped consulting it at all,
 * which is this programme's most-repeated way of shipping a green test over a
 * dead rule.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRIEFING_AUTO_DEFAULT_COMPACT,
  BRIEFING_AUTO_DEFAULT_ROOMY,
  BRIEFING_AUTO_STORAGE_KEY,
  briefingAutoDefault,
  briefingOpensAtStart,
  parseStoredFlag,
  serializeFlag,
} from "../hudPreferences";

describe("the briefing's start-of-lesson default", () => {
  it("is OFF on the phone — the founder's ruling, stated as a value", () => {
    expect(BRIEFING_AUTO_DEFAULT_COMPACT).toBe(false);
    expect(briefingAutoDefault(true)).toBe(false);
  });

  it("is ON on the roomy stage — the side panel costs no world, so it is unchanged", () => {
    expect(BRIEFING_AUTO_DEFAULT_ROOMY).toBe(true);
    expect(briefingAutoDefault(false)).toBe(true);
  });

  it("the two surfaces genuinely disagree (a single constant for both would pass every other case here)", () => {
    expect(briefingAutoDefault(true)).not.toBe(briefingAutoDefault(false));
  });
});

describe("«optional if the user wants it on» — the stored choice wins on BOTH surfaces", () => {
  it("a phone student who switches it on gets the card", () => {
    expect(briefingOpensAtStart(true, "on")).toBe(true);
  });

  it("a roomy student who switches it off stops getting the panel", () => {
    expect(briefingOpensAtStart(false, "off")).toBe(false);
  });

  it("nothing stored falls back to the surface default, not to a fixed answer", () => {
    expect(briefingOpensAtStart(true, null)).toBe(false);
    expect(briefingOpensAtStart(false, null)).toBe(true);
  });

  it("a foreign value is not a choice — it falls back the same way", () => {
    expect(briefingOpensAtStart(true, "yes please")).toBe(false);
    expect(briefingOpensAtStart(false, "")).toBe(true);
  });

  it("round-trips through the wire format the store actually holds", () => {
    for (const on of [true, false]) {
      expect(parseStoredFlag(serializeFlag(on))).toBe(on);
      expect(briefingOpensAtStart(true, serializeFlag(on))).toBe(on);
      expect(briefingOpensAtStart(false, serializeFlag(on))).toBe(on);
    }
  });

  it("the key is versioned and namespaced like every other persisted sim setting", () => {
    expect(BRIEFING_AUTO_STORAGE_KEY).toMatch(/^aidrive\.sim\..+\.v\d+$/);
  });
});

/**
 * THE ROUTE BACK, HELD AS A CONTRACT — and it REPORTS WHAT IT CANNOT READ.
 *
 * This is the one assertion here that cannot be executed: the МЕНЮ row lives
 * inside a 200-line array literal in a component jsdom cannot lay out. So it
 * reads the shell's own source — with the discipline this repo learned three
 * times over: a matcher that finds nothing must FAIL, never quietly pass. If
 * the row is renamed or the anchor moves, `hit` is null and the test reds with
 * the reason, rather than certifying a build where hiding the card stranded the
 * student with no way back to the lesson's own instructions (THEO-4).
 */
describe("the phone keeps a route back to the steps (THEO-4)", () => {
  const SHELL = resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx");
  const src = readFileSync(SHELL, "utf8");

  it("the МЕНЮ recall row exists, is compact-only, and calls recallBriefing", () => {
    const hit = /key:\s*"briefing"[\s\S]{0,600}?onSelect:\s*recallBriefing/.exec(src);
    expect(
      hit,
      "unresolved: could not find the compact МЕНЮ row `key: \"briefing\"` calling " +
        "`recallBriefing` in LessonPlayShell.tsx. Either it was renamed (fix this " +
        "anchor) or the phone's route back to the authored steps is gone — in which " +
        "case the founder's hide-by-default ruling must NOT ship.",
    ).not.toBeNull();
    expect(hit![0]).toContain("recallBriefing");
  });

  it("the row is guarded by `compact` and by the drive still being live", () => {
    const hit = /\.\.\.\(compact && !ended && !mistakeMode && briefing\.length > 0/.exec(src);
    expect(
      hit,
      "unresolved: the guard in front of the МЕНЮ briefing row changed shape. Re-read " +
        "it before trusting this file — the row must stay present for the whole drive.",
    ).not.toBeNull();
  });
});

/**
 * THE WIRING, HELD — because a mutation proved nothing was holding it.
 *
 * Every case above passes against a shell that has stopped consulting the
 * setting entirely: the mutation `useState(() => briefingAutoOpen)` ->
 * `useState(true)` — which is the whole ruling undone, the card back on every
 * phone — SURVIVED a green 41/41 on 2026-09-20. That is this repo's most
 * expensive recurring shape: a predicate built, tested and wired to nothing.
 *
 * It cannot be closed by execution here (the shell is a 9,000-line component
 * with a live R3F canvas; jsdom will not mount it), so it is closed the only
 * other honest way — by reading the shell for BOTH halves: the initializer must
 * consult the setting, and the literal it replaced must be gone. The pair
 * matters: asserting only the presence of the good shape passes against a file
 * that contains both, and asserting only the absence of the bad one passes
 * against a file that contains neither.
 */
describe("the shell actually consults the setting (the mutation that survived)", () => {
  const SHELL = resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx");
  const src = readFileSync(SHELL, "utf8");

  it("`briefingOpen` is seeded from the stored preference, not from a literal", () => {
    const decl = /const \[briefingOpen, setBriefingOpen\] = useState\(([^;]*)\);/.exec(src);
    expect(
      decl,
      "unresolved: could not find the `briefingOpen` useState declaration in " +
        "LessonPlayShell.tsx. Re-anchor this test — do not assume it still reads the setting.",
    ).not.toBeNull();
    const init = decl![1];
    expect(
      init,
      `the briefing's initial state is \`useState(${init})\` — it no longer consults ` +
        "`briefingAutoOpen`, so the founder's hide-on-phone ruling is not in effect " +
        "whatever hudPreferences.ts says",
    ).toContain("briefingAutoOpen");
    expect(init.trim()).not.toBe("true");
  });

  it("the setting itself is read from the store under the right key and surface", () => {
    const hit =
      /const \[briefingAutoOpen, setBriefingAutoOpen\][\s\S]{0,300}?readStoredFlag\(\s*BRIEFING_AUTO_STORAGE_KEY,\s*briefingAutoDefault\(compact\)/.exec(
        src,
      );
    expect(
      hit,
      "unresolved: `briefingAutoOpen` is no longer initialised from " +
        "`readStoredFlag(BRIEFING_AUTO_STORAGE_KEY, briefingAutoDefault(compact))`. Either " +
        "it stopped being per-surface, or it stopped being persisted — both undo half the ruling.",
    ).not.toBeNull();
  });

  it("the student can reach the toggle — «optional» that no one can switch is not optional", () => {
    const hit = /key: "briefingAuto"[\s\S]{0,400}?onSelect: toggleBriefingAutoOpen/.exec(src);
    expect(
      hit,
      "unresolved: the МЕНЮ row `key: \"briefingAuto\"` calling `toggleBriefingAutoOpen` " +
        "is gone. Hiding the card by default without a way to turn it back on is not the " +
        "ruling that was given.",
    ).not.toBeNull();
  });

  it("the toggle persists the choice rather than only holding it for this drive", () => {
    const hit = /toggleBriefingAutoOpen[\s\S]{0,300}?writeStoredFlag\(BRIEFING_AUTO_STORAGE_KEY/.exec(src);
    expect(
      hit,
      "unresolved: `toggleBriefingAutoOpen` no longer calls " +
        "`writeStoredFlag(BRIEFING_AUTO_STORAGE_KEY, …)` — the student's choice would be " +
        "forgotten at the end of the lesson.",
    ).not.toBeNull();
  });
});
