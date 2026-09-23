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
 * THE WIRING, HELD — because a mutation proved nothing was holding it, and then
 * because the wiring it held was itself the defect.
 *
 * Round one (2026-09-20): `useState(() => briefingAutoOpen)` -> `useState(true)`
 * SURVIVED a green 41/41, so this block pinned the lazy initialiser. Round two
 * (w60): the pinned initialiser WAS the bug. It read the first render, where
 * `useCompactHud()` is still `useState(false)`, so every phone got the roomy
 * default and the card opened at arrival — the ruling never shipped, under a
 * green gate that asserted the very shape that broke it.
 *
 * The decision is now `hud/briefingStart.ts`, and `briefing-start.test.ts`
 * EXECUTES it through React's render sequence (first render → effects → the
 * render that carries the resolved compact value). What that file cannot see is
 * whether the shell still calls those functions, in that order — so this block
 * reads the shell for it, and REPORTS WHAT IT CANNOT READ: a matcher that finds
 * nothing fails with the reason instead of passing.
 */
describe("the shell decides against the RESOLVED surface (w60: the ruling did not ship)", () => {
  const SHELL = resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx");
  const src = readFileSync(SHELL, "utf8");
  const CODE = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("`briefingOpen` is derived from the start machine, never a lazy useState", () => {
    expect(
      /const briefingOpen = briefingIsOpen\(briefingStart\);/.test(CODE),
      "unresolved: `const briefingOpen = briefingIsOpen(briefingStart)` is gone from " +
        "LessonPlayShell.tsx. Re-anchor — do not assume the card still waits for the viewport.",
    ).toBe(true);
    expect(
      /\[briefingOpen,\s*setBriefingOpen\]\s*=\s*useState/.test(CODE),
      "`briefingOpen` is a useState again — a lazy initialiser reads the first render, " +
        "where every phone is a desktop (the w60 defect)",
    ).toBe(false);
  });

  it("the machine is the reducer from hud/briefingStart, seeded closed", () => {
    expect(CODE).toMatch(
      /const \[briefingStart, dispatchBriefingStart\] = useReducer\(\s*briefingStartReducer,\s*BRIEFING_START_INITIAL,?\s*\)/,
    );
  });

  it("its effect body is nextBriefingStartEvent over THIS render's compact + stored choice", () => {
    const hit =
      /useEffect\(\(\) => \{\s*const event = nextBriefingStartEvent\(briefingStart, compact, briefingAutoStored\);\s*if \(event !== null\) dispatchBriefingStart\(event\);\s*\}, \[briefingStart, compact, briefingAutoStored\]\);/.exec(
        CODE,
      );
    expect(
      hit,
      "unresolved: the start machine's effect changed shape. It must dispatch " +
        "`nextBriefingStartEvent(briefingStart, compact, briefingAutoStored)` and re-run on " +
        "all three — a missing `compact` dep is a decision that never sees the resolved value.",
    ).not.toBeNull();
  });

  it("the machine is declared AFTER useCompactHud (hook order is what the model relies on)", () => {
    const compactAt = CODE.indexOf("const compact = useCompactHud();");
    const machineAt = CODE.indexOf("const [briefingStart, dispatchBriefingStart]");
    expect(compactAt, "unresolved: `const compact = useCompactHud();` not found").toBeGreaterThan(-1);
    expect(machineAt, "unresolved: the start machine's declaration not found").toBeGreaterThan(-1);
    expect(machineAt).toBeGreaterThan(compactAt);
  });

  it("what is stored is the student's CHOICE, and the setting is derived per render", () => {
    expect(CODE).toMatch(
      /useState<boolean \| null>\(\(\) =>\s*readStoredFlagOrNull\(BRIEFING_AUTO_STORAGE_KEY\),?\s*\)/,
    );
    expect(CODE).toMatch(
      /const briefingAutoOpen = briefingAutoSetting\(compact, briefingAutoStored\);/,
    );
    // …and the frozen-default shape is gone everywhere, not just moved.
    expect(CODE).not.toMatch(/briefingAutoDefault\(compact\)/);
  });

  it("✕/«Разбрах», the МЕНЮ recall and a retry all go through the machine", () => {
    expect(CODE).toMatch(/const closeBriefing = useCallback\(\(\) => dispatchBriefingStart\(\{ type: "dismiss" \}\)/);
    const recall = CODE.slice(CODE.indexOf("const recallBriefing = useCallback"));
    expect(recall.slice(0, 200)).toContain('dispatchBriefingStart({ type: "recall" })');
    const at = CODE.indexOf("setBriefingRecalled(false)");
    expect(at, "unresolved: the retry's recall-latch reset is gone").toBeGreaterThan(-1);
    expect(CODE.slice(at, at + 400)).toContain(
      'dispatchBriefingStart({ type: "arrive", compact, stored: briefingAutoStored })',
    );
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

  it("the toggle's next value is briefingAutoToggled over (compact, stored) — never `!stored`", () => {
    // Round 2 of lane E: `!briefingAutoOpen` and the wrong `!briefingAutoStored`
    // were indistinguishable to the suite. The rule is now executed in
    // briefing-start.test.ts; this holds the shell to calling it.
    const at = CODE.indexOf("const toggleBriefingAutoOpen = useCallback");
    expect(at, "unresolved: `toggleBriefingAutoOpen` declaration not found").toBeGreaterThan(-1);
    const body = CODE.slice(at);
    const decl = body.slice(0, body.indexOf("]);") + 3);
    expect(decl).toMatch(/const next = briefingAutoToggled\(compact, briefingAutoStored\);/);
    expect(decl).toMatch(/writeStoredFlag\(BRIEFING_AUTO_STORAGE_KEY, next\);/);
    expect(decl).toMatch(/setBriefingAutoStored\(next\);/);
    expect(decl).toMatch(/\}, \[compact, briefingAutoStored\]\);$/);
    expect(decl).not.toMatch(/!briefingAutoStored|!briefingAutoOpen/);
  });

  it("the stored choice is read with readStoredFlagOrNull and handed to the start machine", () => {
    // stored-flag-read.test.ts executes the read; this pins the chain
    // read → `briefingAutoStored` → the machine's effect and the retry's arrive.
    expect(CODE).toMatch(
      /const \[briefingAutoStored, setBriefingAutoStored\] = useState<boolean \| null>\(\(\) =>\s*readStoredFlagOrNull\(BRIEFING_AUTO_STORAGE_KEY\)/,
    );
    expect(CODE).toContain("nextBriefingStartEvent(briefingStart, compact, briefingAutoStored)");
    expect(CODE).toContain('dispatchBriefingStart({ type: "arrive", compact, stored: briefingAutoStored })');
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
