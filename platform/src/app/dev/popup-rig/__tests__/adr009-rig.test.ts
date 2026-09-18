/**
 * =============================================================================
 * THE RIG'S OWN GATES — because a rig that lies is worse than no rig.
 * (doc 92 §7 lane P · audit row 17 · the lane-P verifier's F-P1/F-P2/F-P4)
 * =============================================================================
 *
 * Three things went wrong in this directory and none of them was visible to any
 * test in the repository:
 *
 *  1. `adr009-fixtures.ts` carried a hand-typed «authored briefing» whose
 *     docblock said it was copied from `templates-roundabout.ts`. None of its
 *     five sentences existed in any template, it was 247 characters against the
 *     real 920, and it taught the OPPOSITE rule. The frames that rested on it
 *     measured a card the product cannot paint.
 *  2. `popup-rig-client.tsx` printed the literal «Неиздържан» on a bar that now
 *     has four possible verdicts. That was repaired (audit row 17) and the
 *     verifier's own note is that re-typing it «goes red in nothing».
 *  3. §5.10's fit question was answered on the easiest rung in the corpus, and
 *     the four rungs the answer now rests on are named in a report — a report
 *     nothing re-derives.
 *
 * All three are the same shape: a claim about the PRODUCT made by a file that
 * had stopped asking it. So each is a case below, and each is asserted against
 * the product rather than against a copy of its output.
 *
 * ── THE SOURCE SCANNER REPORTS WHAT IT CANNOT READ ──────────────────────────
 *
 * A source-scanning test in this repo has been GREEN AND BLIND three times, and
 * each repair taught it only the one shape that had just escaped. So the
 * stripper below returns `unresolved` for any input it cannot tokenise to the
 * end — an unterminated string, template or block comment — the cases fail on
 * that, and `§0` mutation-tests the stripper against synthetic sources carrying
 * each shape it must see and each shape it must ignore. A matcher that has not
 * been shown to catch a plant is a matcher nobody has tested.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SESSION_VERDICT_LABEL_BG } from "@/modules/sim/hud/SessionEndScreen";
import {
  compileScenario,
  lessonMistakeRuleBg,
  lessonMistakeTargetCodes,
  scenarioById,
  SCENARIO_TEMPLATES,
  type LessonSpec,
  type ScenarioLevel,
} from "@/modules/sim/lessons";
import { sessionVerdict } from "@/modules/sim/hud/SessionEndScreen";

import {
  CREST_CURVE_L5,
  LANE_CHOICE_L3,
  LANE_CHOICE_L5,
  PASS_CLEARANCE_L3,
  ROADWORKS_SHIFT_L5,
  TRUCK_SPRAY_L3,
  notTakenResult,
} from "../adr009-fixtures";

const DIR = path.join(process.cwd(), "src", "app", "dev", "popup-rig");
const read = (file: string): string => {
  const p = path.join(DIR, file);
  // Throw rather than skip: a gate that cannot find its subject must fail, or
  // renaming the file silently retires the gate.
  return readFileSync(p, "utf8");
};

// ---------------------------------------------------------------------------
// The stripper
// ---------------------------------------------------------------------------

interface Stripped {
  /** Source with comments removed and every other byte in place. */
  code: string;
  /** Non-null when the input could not be tokenised — the caller must fail. */
  unresolved: string | null;
}

/**
 * Remove `//` and block comments, leaving strings and templates untouched.
 *
 * Comments are removed and NOT the reverse, because the thing being asserted is
 * about what the file prints; prose explaining the rule must not be able to
 * break it (nor to satisfy it — see `tools-tests.mjs`'s own note on the same
 * trap). Regex literals are not tracked: this directory contains none, and a
 * tokeniser that guessed at `/` would be a second thing to get wrong. If one
 * ever appears, the `/` opens no state here, so the worst case is a comment
 * that is not stripped — which fails loudly rather than passing quietly.
 */
/**
 * Decode `\uXXXX` and `\u{XXXX}` before the word check.
 *
 * FOUND BY A VERIFIER, 2026-09-18, and it is the blind spot this whole file
 * exists to not have: it planted the escaped form of «Неиздържан» in the
 * client's JSX, the page rendered the word, and all 27 cases here stayed green.
 * The scanner reads source bytes, and the word is simply not in them. Anything
 * that reaches the DOM through a computed string — `String.fromCharCode`,
 * base64, a catalogue lookup keyed by a typed literal — is still out of reach,
 * and that is stated here rather than implied: this file catches the shapes a
 * hand would write, not every shape a program could produce.
 */
export function decodeEscapes(src: string): string {
  return src
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_m, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

export function stripComments(src: string): Stripped {
  let out = "";
  let i = 0;
  let mode: "code" | "line" | "block" | '"' | "'" | "`" = "code";
  const tplDepth: number[] = [];
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") {
        mode = "line";
        i += 2;
        continue;
      }
      if (c === "/" && n === "*") {
        mode = "block";
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        mode = c;
        out += c;
        i += 1;
        continue;
      }
      if (c === "}" && tplDepth.length > 0 && tplDepth[tplDepth.length - 1] === 0) {
        tplDepth.pop();
        mode = "`";
        out += c;
        i += 1;
        continue;
      }
      if (tplDepth.length > 0) {
        if (c === "{") tplDepth[tplDepth.length - 1] += 1;
        else if (c === "}") tplDepth[tplDepth.length - 1] -= 1;
      }
      out += c;
      i += 1;
      continue;
    }
    if (mode === "line") {
      if (c === "\n") {
        mode = "code";
        out += c;
      }
      i += 1;
      continue;
    }
    if (mode === "block") {
      if (c === "*" && n === "/") {
        mode = "code";
        i += 2;
        continue;
      }
      if (c === "\n") out += c;
      i += 1;
      continue;
    }
    // inside a string or template
    if (c === "\\") {
      out += c + (n ?? "");
      i += 2;
      continue;
    }
    if (mode === "`" && c === "$" && n === "{") {
      tplDepth.push(0);
      mode = "code";
      out += "${";
      i += 2;
      continue;
    }
    if (c === mode) {
      mode = "code";
      out += c;
      i += 1;
      continue;
    }
    if ((mode === '"' || mode === "'") && c === "\n") {
      return { code: out, unresolved: `unterminated ${mode} string at offset ${i}` };
    }
    out += c;
    i += 1;
  }
  if (mode === "block") return { code: out, unresolved: "unterminated block comment" };
  if (mode !== "code" && mode !== "line") {
    return { code: out, unresolved: `unterminated ${mode} literal` };
  }
  if (tplDepth.length > 0) return { code: out, unresolved: "unclosed template expression" };
  return { code: out, unresolved: null };
}

const CYRILLIC = /[Ѐ-ӿ]/;

describe("§0 · the scanner, mutation-tested against synthetic sources", () => {
  it("strips comments and keeps strings", () => {
    const s = stripComments('const a = "кола"; // Неиздържан\n/* Издържан */ const b = `x`;');
    expect(s.unresolved).toBeNull();
    expect(s.code).toContain("кола");
    expect(s.code).not.toContain("Неиздържан");
    expect(s.code).not.toContain("Издържан");
  });

  it("sees a plant in every shape this directory can carry", () => {
    // Each of these is a way the verdict word could come back. A matcher that
    // misses one is a matcher that will be green the day it matters.
    const shapes = [
      'const a = "Неиздържан";',
      "const a = 'Неиздържан';",
      "const a = `Неиздържан`;",
      "const a = `x ${y} Неиздържан`;",
      'const a = <p title="Неиздържан" />;',
      "const a = <p>Неиздържан</p>;",
      'const a = { titleBg: "3e · Неиздържан" };',
      'const a = "Не" + "издържан";', // split — caught by the joined check below
      // ESCAPED. A verifier planted exactly this in the client's JSX on
      // 2026-09-18: it renders «Неиздържан» and all 27 cases stayed GREEN,
      // because the scanner reads the source bytes and this word is not in
      // them. `decodeEscapes` below is why it is now red — the one shape a
      // reader would assume was covered and was not.
      'const a = <p>{"\\u041d\\u0435\\u0438\\u0437\\u0434\\u044a\\u0440\\u0436\\u0430\\u043d"}</p>;',
    ];
    for (const src of shapes) {
      const s = stripComments(src);
      expect(s.unresolved, src).toBeNull();
      const joined = decodeEscapes(s.code).replace(/["'`+\s]/g, "");
      expect(joined.includes("Неиздържан"), src).toBe(true);
    }
  });

  it("ignores the same word in prose about the rule", () => {
    for (const src of [
      '// the bar used to print "Неиздържан"\nconst a = 1;',
      "/* «Неиздържан» is one of four now */ const a = 1;",
      "/**\n * «Неиздържан» — see audit row 17.\n */\nconst a = 1;",
    ]) {
      const s = stripComments(src);
      expect(s.unresolved, src).toBeNull();
      expect(s.code.includes("Неиздържан"), src).toBe(false);
    }
  });

  it("refuses to answer about a source it could not tokenise", () => {
    expect(stripComments('const a = "oops;').unresolved).not.toBeNull();
    expect(stripComments("const a = `oops;").unresolved).not.toBeNull();
    expect(stripComments("/* oops").unresolved).not.toBeNull();
    expect(stripComments("const a = `x ${y").unresolved).not.toBeNull();
  });
});

describe("§1 · audit row 17 — no verdict word is typed anywhere in the rig", () => {
  const WORDS = Object.values(SESSION_VERDICT_LABEL_BG);

  it("has four verdicts to check", () => {
    expect(WORDS).toHaveLength(4);
    expect(new Set(WORDS).size).toBe(4);
  });

  for (const file of ["popup-rig-client.tsx", "Adr009Gallery.tsx", "adr009-fixtures.ts"]) {
    it(`${file} contains no literal verdict word outside its comments`, () => {
      const { code, unresolved } = stripComments(read(file));
      expect(unresolved, `${file}: ${unresolved}`).toBeNull();
      // `\uXXXX` escapes are decoded first, then quote/plus/whitespace are
      // removed, so «"Не" + "издържан"», a word split across a wrapped template
      // and the escaped form all still read as the word.
      const joined = decodeEscapes(code).replace(/["'`+\s]/g, "");
      for (const w of WORDS) {
        expect(joined.includes(w.replace(/\s/g, "")), `${file} types «${w}»`).toBe(false);
      }
    });
  }
});

describe("§2 · F-P1 — the fixtures module composes no Bulgarian at all", () => {
  /**
   * The strongest form of the rule the invented briefing broke. Every string on
   * a frame is compiled, scored or retrieved (see the module's header), so
   * after comments are stripped there is no Cyrillic left in the file — and a
   * single hand-typed sentence coming back is a failure with the line in the
   * message rather than a docblock that quietly stops being true.
   *
   * `Adr009Gallery.tsx` is deliberately NOT under this rule: its section
   * headings are dev chrome and reach no student. It is under §1 instead.
   */
  it("adr009-fixtures.ts has no Cyrillic outside its comments", () => {
    const { code, unresolved } = stripComments(read("adr009-fixtures.ts"));
    expect(unresolved).toBeNull();
    const offenders = code
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter((r) => CYRILLIC.test(r.line));
    expect(
      offenders.map((r) => `${r.n}: ${r.line.trim()}`),
      "a fixture that types Bulgarian is measuring a string the product may not print",
    ).toEqual([]);
  });
});

describe("§3 · F-P2 — the four rungs the §5.10 answer is published on", () => {
  /**
   * The table in this lane's report says what the rule line costs on these four
   * rungs. The costs are pixel readings and cannot live here; their INPUTS can,
   * and if the corpus moves under them the published evidence is wrong. Each
   * row is the compiled rung, not a copy of it.
   */
  const rows: ReadonlyArray<{
    id: string;
    lesson: LessonSpec;
    steps: number;
    chars: number;
    longest: number;
    ruleChars: number;
    targets: number;
  }> = [
    { id: "sc-rb-lane-choice@L3", lesson: LANE_CHOICE_L3, steps: 5, chars: 920, longest: 336, ruleChars: 178, targets: 4 },
    { id: "sc-rb-lane-choice@L5", lesson: LANE_CHOICE_L5, steps: 6, chars: 1347, longest: 427, ruleChars: 178, targets: 4 },
    { id: "sc-ov-crest-curve@L5", lesson: CREST_CURVE_L5, steps: 8, chars: 1739, longest: 387, ruleChars: 79, targets: 1 },
    { id: "sc-merge-roadworks-shift@L5", lesson: ROADWORKS_SHIFT_L5, steps: 8, chars: 1520, longest: 446, ruleChars: 112, targets: 2 },
    { id: "sc-ac-truck-spray@L3", lesson: TRUCK_SPRAY_L3, steps: 10, chars: 662, longest: 79, ruleChars: 116, targets: 2 },
    { id: "sc-vu-pass-clearance@L3", lesson: PASS_CLEARANCE_L3, steps: 5, chars: 486, longest: 120, ruleChars: 85, targets: 1 },
  ];

  for (const r of rows) {
    it(`${r.id} still compiles to the briefing the table measured`, () => {
      const steps = r.lesson.briefingBg ?? [];
      const rule = lessonMistakeRuleBg(r.lesson);
      expect({
        steps: steps.length,
        chars: steps.reduce((a, s) => a + s.textBg.length, 0),
        longest: steps.reduce((a, s) => Math.max(a, s.textBg.length), 0),
        ruleChars: rule === null ? 0 : rule.length,
        targets: lessonMistakeTargetCodes(r.lesson)?.size ?? 0,
      }).toEqual({
        steps: r.steps,
        chars: r.chars,
        longest: r.longest,
        ruleChars: r.ruleChars,
        targets: r.targets,
      });
    });
  }
});

describe("§4 · F-P2 — and they really are the corpus's extremes", () => {
  /**
   * «Worst case» is the whole claim §5.10's answer rests on, and the first round
   * got it wrong by choosing the fixture before measuring the corpus. So the
   * ranking is recomputed here over every authored rung, restricted — as the
   * question requires — to the rungs that actually carry a rule line.
   */
  interface Row {
    id: string;
    steps: number;
    chars: number;
    targets: number;
    ruleChars: number;
  }
  const withRule: Row[] = [];
  let compiled = 0;
  for (const spec of SCENARIO_TEMPLATES) {
    for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
      let lesson: LessonSpec;
      try {
        lesson = compileScenario(spec, level);
      } catch {
        continue;
      }
      compiled += 1;
      const rule = lessonMistakeRuleBg(lesson);
      if (rule === null) continue;
      const steps = lesson.briefingBg ?? [];
      withRule.push({
        id: `${spec.id}@L${level}`,
        steps: steps.length,
        chars: steps.reduce((a, s) => a + s.textBg.length, 0),
        targets: lessonMistakeTargetCodes(lesson)?.size ?? 0,
        ruleChars: rule.length,
      });
    }
  }
  const top = (key: keyof Row): Row =>
    [...withRule].sort((a, b) => (b[key] as number) - (a[key] as number))[0];

  it("the corpus is the size the report says it is", () => {
    expect(compiled).toBe(808);
    expect(withRule.length).toBe(403);
  });

  it("sc-ov-crest-curve@L5 is the longest rule-carrying briefing by characters", () => {
    expect(top("chars").id).toBe("sc-ov-crest-curve@L5");
  });

  it("the longest by STEPS is a truck-spray/bridge-ice rung, not the longest by characters", () => {
    expect(top("steps").steps).toBe(11);
    expect(top("chars").steps).toBeLessThan(11);
  });

  it("sc-rb-lane-choice is the only four-target shape, and owns the longest rule line", () => {
    const four = withRule.filter((r) => r.targets === 4).map((r) => r.id);
    expect(four.sort()).toEqual([
      "sc-rb-lane-choice@L1",
      "sc-rb-lane-choice@L2",
      "sc-rb-lane-choice@L3",
      "sc-rb-lane-choice@L5",
    ]);
    expect(top("ruleChars").id.startsWith("sc-rb-lane-choice@")).toBe(true);
  });
});

describe("§5 · F-P3 — each result fixture lands on the verdict it is captioned with", () => {
  /**
   * The failure this pins is the one that produced F-P3: a fixture that reaches
   * a DIFFERENT branch than the caption on its frame claims. A photograph of the
   * wrong state is not weaker evidence than no photograph — it is the thing the
   * next reader cites.
   */
  const cases = [
    ["clean sheet, route finished", LANE_CHOICE_L3, { completedAll: true }, "lessonMistake", 0, true],
    ["clean sheet, route unfinished", LANE_CHOICE_L3, { completedAll: false }, "lessonMistake", 0, true],
    ["charged repeat", LANE_CHOICE_L3, { completedAll: true, sheet: "charged" as const }, "lessonMistake", 6, true],
    ["failed sheet (the 96)", LANE_CHOICE_L3, { completedAll: true, sheet: "failed" as const }, "failed", 10, false],
    ["aborted", PASS_CLEARANCE_L3, { completedAll: false, sheet: "aborted" as const }, "unfinished", 0, true],
  ] as const;

  for (const [label, lesson, opts, verdict, score, sheetPassed] of cases) {
    it(`${label} → «${SESSION_VERDICT_LABEL_BG[verdict]}», ${score} т.`, () => {
      const r = notTakenResult(lesson, opts);
      expect(sessionVerdict(r)).toBe(verdict);
      expect(r.score).toBe(score);
      expect(r.summary.passed).toBe(sheetPassed);
      expect(r.passed).toBe(false);
      expect(r.lessonMistakes?.length).toBeGreaterThan(0);
    });
  }

  it("the charged fixture charges exactly one hit, as Ruling A allows", () => {
    const r = notTakenResult(LANE_CHOICE_L3, { completedAll: true, sheet: "charged" });
    expect(r.lessonMistakes?.filter((h) => h.charged).length).toBe(1);
  });

  it("the demo title is the author's, retrieved from the rung's own target", () => {
    const target = (LANE_CHOICE_L3.lessonMistakeTargets ?? [])[0];
    const r = notTakenResult(LANE_CHOICE_L3, { completedAll: true });
    expect(r.lessonMistakes?.[0].demoTitleBg).toBe(target.demoTitleBg);
  });

  it("the history fixture's title is the compiled lesson's, not a shortened copy", () => {
    const spec = scenarioById("sc-rb-lane-choice");
    expect(spec).toBeDefined();
    expect(LANE_CHOICE_L3.titleBg.startsWith(`${spec!.titleBg} · Ниво 3`)).toBe(true);
  });
});
