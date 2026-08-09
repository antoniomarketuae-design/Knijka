/**
 * NO BARE „т." — the net under the repair, and the reason a fourteenth surface
 * cannot happen.
 *
 * The founder drove the simulator, went deliberately over the limit, met a card
 * reading „−10 т." and read it as his DRIVING LICENCE being docked. He is right
 * to: unqualified „точки" means КОНТРОЛНИ точки to a Bulgarian, and „т." names
 * nothing at all. The result screen was repaired by hand — and the defect was
 * still live on thirteen other surfaces, the worst of them the teach-moment card
 * he meets MINUTES EARLIER in the same drive.
 *
 * Repairing fourteen call sites by hand leaves the fifteenth free to regress, so
 * the repair is a vocabulary (`../scales.ts`) plus this file, which:
 *
 *   1. SCANS THE SOURCE of every directory that owns scored numbers — the sim
 *      HUD, the lesson shell, `/simulator`, and (added after ten bare „т."
 *      survived this suite) `/exams` and `components/exam` — and fails on any
 *      „т." that did not come out of that vocabulary. This is the test that
 *      would have caught the original bug, and the only one that catches the
 *      next one. See GUARDED_DIRS for what a missing directory costs.
 *   2. Checks the vocabulary itself: four scales, each naming what it counts,
 *      each agreeing with точка (feminine), and none of them collapsing to a
 *      bare „т.".
 *   3. Renders the surfaces that render without an app context and reads what
 *      a student would read.
 *
 * WHY THE SCAN IS NOT A FIND-AND-REPLACE CHECK. Four different scales are
 * printed on the SAME result screen — the exam sheet, the licence, the manoeuvre
 * rubric (out of 2, and not law at all) and the theory-question weight — so the
 * fix is never „append изпитни". The scan therefore does not look for a missing
 * word; it looks for a literal „т." that no scale produced, and leaves the
 * question of WHICH scale to the human writing the call.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import type { RubricBreakdownLine } from "../../lessons/scenario/types";
import { SEVERITY_POINTS, type SeverityClass } from "../types";
import {
  EXAM_PASS_RULE_BG,
  EXAM_POINTS_SHORT_NOTE_BG,
  EXAM_SCALE_SOURCE_BG,
  MANOEUVRE_MAX_PER_LINE,
  POINT_SCALES,
  controlPointsTightBg,
  examMarkCitationBg,
  examPointsForClassBg,
  minusPointsBg,
  pointsBg,
  pointsEachBg,
  pointsOutOfBg,
  pointsScaleLabelBg,
  pointsWordsBg,
  type PointScaleId,
} from "../scales";

// ---------------------------------------------------------------------------
// 1. The source scan
// ---------------------------------------------------------------------------

/** Repo-root-relative to `platform/src`. This file sits at rules/__tests__. */
const SRC = join(__dirname, "..", "..", "..", "..");

/**
 * Where a scored number can reach a student's eyes.
 *
 * The first two are the original brief's scope — the sim HUD and the lesson
 * shell. The third is `/simulator` itself, added after the frames were taken:
 * the session-history row on the page he LAUNCHES the drive from printed
 * „12 т." with nothing naming it, which is the same defect one click away, and
 * leaving it would have been a repair he could disprove by pressing Back.
 *
 * THE LAST TWO ARE THE THEORY EXAM, AND THIS LIST IS WHY THEY SURVIVED.
 * It used to end at three, with a note saying `app/(dashboard)/exams/*` was
 * „a fifth scale on another team's surface" and deliberately out of scope. The
 * refusal to mislabel it „изпитни т." was right — that is the PRACTICAL sheet
 * — but a scanner that cannot see a directory reports it clean, so the sim
 * lane's „0 bare hits across 56 files" was true and the product still had ten
 * of them, two on the screen a candidate looks at for forty timed minutes.
 *
 * It is not a fifth scale either. It is `theory`, which this vocabulary already
 * had: a mid-drive micro-quiz question is worth what it is worth on the
 * theoretical exam. What it lacked was its own act — Наредба № 38, чл. 39,
 * ал. 1 — and that is pinned in `components/exam/__tests__/theory-exam-scale.test.tsx`.
 */
const GUARDED_DIRS = [
  join(SRC, "modules", "sim", "hud"),
  join(SRC, "components", "sim", "lesson-ui"),
  join(SRC, "app", "(dashboard)", "simulator"),
  join(SRC, "app", "(dashboard)", "exams"),
  join(SRC, "components", "exam"),
];

/**
 * The vocabulary itself has to be able to write „т.". So do the tests that
 * assert on what it produced. (`lib/content/pointScales.ts`, where the four
 * scales now live, is not in any guarded directory and needs no exemption —
 * but it is named here so a future reader knows where to look.)
 */
const EXEMPT_FILES = new Set(["scales.ts", "pointScales.ts"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // __tests__ assert on rendered output and must be free to quote it.
      if (name === "__tests__") continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
    if (EXEMPT_FILES.has(name)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Comments out, string/JSX text in. A file header that RECOUNTS the defect
 * („the card said −10 т. and he read it as his licence") must stay writable —
 * that history is the most valuable thing in these files — so only executable
 * text is scanned.
 *
 * Replaces rather than deletes so line numbers survive into the failure message.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/**
 * „т." occurrences that are NOT a point unit at all and must not be flagged:
 *
 *  - a word that merely ENDS in т before a full stop — „памет.", „изпит.",
 *    „резултат.", „вариант.". Six of these were the scanner's first output and
 *    they are the reason the check tests for a „т" that STARTS a token;
 *  - „т. 10" / „т. 20" — the „точка N" of a statute, half of every citation
 *    this product prints („приложение № 5, т. 10, б. „в“");
 *  - „и т.н." — „and so on".
 *
 * Everything else — „−10 т.", „/ 9 т.", „{n} т." — is the defect.
 */
const LAW_ITEM = /т\.\s*\d/;
const AND_SO_ON = /и\s*т\.\s*н\./;
/** Any letter in any script — „т" after one of these is a word ending, not a unit. */
const LETTER = /\p{L}/u;

interface BarePoint {
  file: string;
  line: number;
  text: string;
}

function barePointsIn(file: string): BarePoint[] {
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  const hits: BarePoint[] = [];
  lines.forEach((line, i) => {
    let from = 0;
    for (;;) {
      const at = line.indexOf("т.", from);
      if (at === -1) break;
      from = at + 2;
      if (at > 0 && LETTER.test(line[at - 1])) continue; // „памет.", not a unit
      const window = line.slice(Math.max(0, at - 12), at + 6);
      if (LAW_ITEM.test(line.slice(at, at + 6))) continue;
      if (AND_SO_ON.test(window)) continue;
      hits.push({ file: relative(SRC, file).replace(/\\/g, "/"), line: i + 1, text: line.trim() });
    }
  });
  return hits;
}

// ---------------------------------------------------------------------------
// 1b. The same defect, SPELLED OUT
// ---------------------------------------------------------------------------

/**
 * THE HALF THE ABBREVIATION SCAN CANNOT SEE.
 *
 * „т." is only the short way to write it. „точки" with no qualifier is the SAME
 * sentence to a Bulgarian reader, and it is the one the founder's complaint is
 * literally about: unqualified „точки" means КОНТРОЛНИ точки, the licence.
 *
 * The theory-exam screens proved it. The disclosed inventory was „ten bare
 * „т."" and it was an undercount of the defect, not of the abbreviation:
 * alongside those ten sat TWELVE spelled-out ones — „точки максимум", „точки за
 * успех", „Загубени точки", „/ 97 точки", „{q.points} точки" on the question a
 * candidate is answering, and „Праг за успех 87 точки" read aloud by the screen
 * reader. Every one of them named nothing. A guard that catches „3 т." and
 * waves „3 точки" through is not a guard, it is a spelling preference.
 *
 * WHAT COUNTS AS QUALIFIED IS DERIVED FROM THE VOCABULARY, not listed here: a
 * scale's own adjective in front („изпитни точки", „контролни точки",
 * „наказателни точки") or its own qualifier behind („точки по теорията", „точки
 * за изпълнение", „точки от правилни отговори"). Add a scale to POINT_SCALES
 * and this guard learns it. Write a fifth wording by hand and it does not,
 * which is the point.
 */
const SCALE_PREFIX_STEMS: string[] = [];
const SCALE_SUFFIXES: string[] = [];
for (const scale of Object.values(POINT_SCALES)) {
  if (scale.afterBg) SCALE_SUFFIXES.push(scale.afterBg);
  for (const adj of [scale.beforeSingularBg, scale.beforePluralBg]) {
    // „изпитна"/„изпитни" → „изпитн": one stem covers both genders and numbers.
    if (adj) SCALE_PREFIX_STEMS.push(adj.replace(/.$/u, ""));
  }
  for (const phrase of [scale.wordSingularBg, scale.wordPluralBg, scale.nameBg]) {
    // „наказателни точки" → the adjective the abbreviation drops.
    const lead = /^(\p{L}+)\s+точк/u.exec(phrase);
    if (lead) SCALE_PREFIX_STEMS.push(lead[1].replace(/.$/u, ""));
    // „точки от правилни отговори" → the qualifier that follows the noun.
    const tail = /^точк\p{L}*\s+(.+)$/u.exec(phrase);
    if (tail) SCALE_SUFFIXES.push(tail[1]);
  }
}

/**
 * Two hand-maintained lists, both short on purpose — an exemption list that
 * grows is a guard that has stopped meaning anything.
 *
 * `EXTRA_PREFIXES`: „нак. точки" in LessonPlayShell is наказателни точки with
 * the adjective abbreviated rather than dropped. It is qualified to a reader;
 * the vocabulary would spell it out, and rewriting another lane's live surface
 * to satisfy a scanner is how the wrong repair gets made.
 *
 * `NOT_A_UNIT`: точка that is a POINT IN SPACE, not a score — „сляпа точка",
 * „мъртва точка", a decimal point. None are in the tree today; they are named
 * now so that the first person to write one gets a green build instead of a
 * mystery, and reaches for this list instead of deleting the check.
 */
const EXTRA_PREFIXES = ["нак\\."];
const NOT_A_UNIT = ["сляп\\p{L}*", "мъртв\\p{L}*", "десетичн\\p{L}*", "отправн\\p{L}*"];

const POINTS_WORD = /точк\p{L}*/gu;
const QUALIFIED_BEFORE = new RegExp(
  `(${[...new Set([...SCALE_PREFIX_STEMS, ...EXTRA_PREFIXES, ...NOT_A_UNIT])].join("|")})\\p{L}*\\s*$`,
  "u",
);
const QUALIFIED_AFTER = new RegExp(
  `^\\s*(${[...new Set(SCALE_SUFFIXES)].map((s) => s.replace(/\s+/g, "\\s+")).join("|")})`,
  "u",
);

function unqualifiedPointWordsIn(file: string): BarePoint[] {
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  const hits: BarePoint[] = [];
  lines.forEach((line, i) => {
    for (const m of line.matchAll(POINTS_WORD)) {
      const at = m.index ?? 0;
      // „сточки"? No such word — but a точк inside a longer token is not the
      // noun, so require a boundary in front of it.
      if (at > 0 && LETTER.test(line[at - 1])) continue;
      if (QUALIFIED_BEFORE.test(line.slice(0, at))) continue;
      if (QUALIFIED_AFTER.test(line.slice(at + m[0].length))) continue;
      hits.push({ file: relative(SRC, file).replace(/\\/g, "/"), line: i + 1, text: line.trim() });
    }
  });
  return hits;
}

describe("no surface writes a scored number without naming its scale", () => {
  it("the sim HUD and the lesson shell contain no bare „т.“", () => {
    const hits = GUARDED_DIRS.flatMap(sourceFiles).flatMap(barePointsIn);

    // The failure message has to say what to DO, because whoever trips it will
    // be someone adding a surface a year from now with no idea why.
    const report = hits.map((h) => `  ${h.file}:${h.line}\n    ${h.text}`).join("\n");
    expect(
      hits.length === 0
        ? ""
        : `A scored number is rendered with a bare „т.", which names none of the four\n` +
            `point-like scales in this product and reads as КОНТРОЛНИ точки — the licence.\n` +
            `Use lib/content/pointScales.ts: pointsBg / minusPointsBg / pointsOutOfBg /\n` +
            `pointsEachBg / pointsScaleLabelBg, with the scale this number is actually on\n` +
            `("exam" = the PRACTICAL sheet, "control" = the licence, "manoeuvre" = the\n` +
            `sim's own rubric, "theory" = the theoretical exam's точки от правилни\n` +
            `отговори). Naming the wrong one is as bad as naming none — „изпитни т."\n` +
            `means the practical sheet and nothing else.\n\n` +
            report,
    ).toBe("");
  });

  it("scans a real, non-trivial set of files (a broken walk would pass silently)", () => {
    const files = GUARDED_DIRS.flatMap(sourceFiles);
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith("SessionEndScreen.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("TeachMomentOverlay.tsx"))).toBe(true);
  });

  it("…and no unqualified „точки“ either, which is the same sentence spelled out", () => {
    const hits = GUARDED_DIRS.flatMap(sourceFiles).flatMap(unqualifiedPointWordsIn);

    const report = hits.map((h) => `  ${h.file}:${h.line}\n    ${h.text}`).join("\n");
    expect(
      hits.length === 0
        ? ""
        : `„точки“ is written with no scale in front of it and no qualifier behind it.\n` +
            `To a Bulgarian reader that is КОНТРОЛНИ точки — the 39-point licence budget —\n` +
            `which is the exact misreading this whole vocabulary exists to prevent. It is\n` +
            `not a milder version of a bare „т.": it is the same defect, spelled out.\n\n` +
            `Put the scale on it. „наказателни точки" / „контролни точки" /\n` +
            `„точки за изпълнение" / „точки по теорията" — or call\n` +
            `pointsScaleLabelBg(scale) for a heading and pointsWordsBg(scale, n) for a\n` +
            `sentence, both in lib/content/pointScales.ts.\n\n` +
            report,
    ).toBe("");
  });

  it("the „точки“ guard is built from the vocabulary and actually discriminates", () => {
    // A guard assembled at run time can silently degenerate into „accept
    // everything" — one bad stem („" matches at every position) and it would
    // report clean forever. So it is run against known-good and known-bad text.
    const bad = [
      `<RuleStat value="97" label="точки максимум" />`,
      `<SummaryStat label="Загубени точки" />`,
      `<span>/ {maxScore} точки</span>`,
      `ariaLabel={\`Праг за успех \${passPoints} точки.\`}`,
    ];
    const good = [
      `{examPointsWordBg(result.score)} наказателни точки`,
      `не са контролни точки по книжката`,
      `<span>{pointsScaleLabelBg("theory")}</span>`,
      `97 точки от правилни отговори`,
      `„1 / 2 точки за изпълнение"`,
      `{result.score} нак. точки`,
    ];
    const flags = (line: string) => {
      for (const m of line.matchAll(POINTS_WORD)) {
        const at = m.index ?? 0;
        if (at > 0 && LETTER.test(line[at - 1])) continue;
        if (QUALIFIED_BEFORE.test(line.slice(0, at))) continue;
        if (QUALIFIED_AFTER.test(line.slice(at + m[0].length))) continue;
        return true;
      }
      return false;
    };
    expect(bad.filter((l) => !flags(l))).toEqual([]);
    expect(good.filter(flags)).toEqual([]);

    // …and the derivation really did pick the words up out of POINT_SCALES.
    expect(SCALE_PREFIX_STEMS).toContain("изпитн");
    expect(SCALE_PREFIX_STEMS).toContain("контролн");
    expect(SCALE_PREFIX_STEMS).toContain("наказателн");
    expect(SCALE_SUFFIXES).toContain("по теорията");
    expect(SCALE_SUFFIXES).toContain("за изпълнение");
    expect(SCALE_SUFFIXES).toContain("от правилни отговори");
  });

  it("reaches the four theory-exam files the previous scanner could not see", () => {
    // Named individually, not counted. „files.length > 20" was already true
    // with the exam directories missing, which is exactly how ten bare „т."
    // survived a green suite: the walk was healthy and pointed at the wrong
    // half of the product. Two of these four were also missing from the sim
    // lane's own written disclosure.
    const walked = GUARDED_DIRS.flatMap(sourceFiles).map((f) =>
      relative(SRC, f).replace(/\\/g, "/"),
    );
    for (const f of [
      "app/(dashboard)/exams/page.tsx",
      "app/(dashboard)/exams/[attemptId]/page.tsx",
      "components/exam/ExamResultView.tsx",
      "components/exam/ExamRunner.tsx",
    ]) {
      expect(walked, f).toContain(f);
    }
  });

  it("catches the exact strings the founder photographed", () => {
    // The scanner is only worth having if it fails on the real defect, so it is
    // run against the code that shipped it. Line 1 is the teach card at t=22.
    const before = [
      `<strong>−{moment.points} т.</strong>`,
      `chipBg: \`−\${t.event.points} т.\`,`,
      `<span className="font-semibold text-muted">/ 9 т.</span>`,
      `{ label: "Опасни грешки", per: "10 т.", count: 1 },`,
      `{line.points} / 2 т.`,
      `{quiz.points} т.`,
      `{reveal.actualPoints} т.`,
    ].join("\n");
    const lines = stripComments(before).split("\n");
    const flagged = lines.filter((l) => {
      const at = l.indexOf("т.");
      if (at === -1) return false;
      if (at > 0 && LETTER.test(l[at - 1])) return false;
      return !LAW_ITEM.test(l.slice(at, at + 6));
    });
    expect(flagged).toHaveLength(7);
  });

  it("does not flag a statute citation, which is most of what these files print", () => {
    const citations = [
      `Наредба № 38 приложение № 5, т. 10, б. „в“`,
      `ЗДвП чл. 183, ал. 5, т. 1`,
      `Наредба № Iз-2539, чл. 6, ал. 1, т. 20`,
      examMarkCitationBg("opasna"),
      EXAM_SCALE_SOURCE_BG,
    ].join("\n");
    const flagged = citations.split("\n").filter((l) => {
      let from = 0;
      for (;;) {
        const at = l.indexOf("т.", from);
        if (at === -1) return false;
        from = at + 2;
        if (!LAW_ITEM.test(l.slice(at, at + 6))) return true;
      }
    });
    expect(flagged).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. The vocabulary
// ---------------------------------------------------------------------------

const ALL_SCALES = Object.keys(POINT_SCALES) as PointScaleId[];

describe("four scales, and every one of them says what it counts", () => {
  it("names all four the product actually renders", () => {
    expect(ALL_SCALES.sort()).toEqual(["control", "exam", "manoeuvre", "theory"]);
  });

  it("no formatter can produce a bare „т.“ for any scale", () => {
    for (const scale of ALL_SCALES) {
      for (const n of [0, 1, 2, 3, 9, 10, 20]) {
        for (const s of [
          pointsBg(scale, n),
          minusPointsBg(scale, n),
          pointsEachBg(scale, n),
          pointsOutOfBg(scale, n, 9),
        ]) {
          // The number, then „т.", then nothing — the shape of the defect.
          expect(s, `${scale} / ${n} → „${s}“`).not.toMatch(/^-?−?\d+(\s*\/\s*\d+)?\s*т\.$/);
          expect(s).toContain("т.");
        }
      }
    }
  });

  it("agrees with точка, which is feminine singular", () => {
    // „−1 изпитни т." reads as a machine talking; this product's whole claim is
    // that it reads as an instructor.
    expect(pointsBg("exam", 1)).toBe("1 изпитна т.");
    expect(pointsBg("exam", 3)).toBe("3 изпитни т.");
    expect(pointsBg("exam", 10)).toBe("10 изпитни т.");
    expect(pointsBg("control", 1)).toBe("1 контролна т.");
    expect(pointsBg("control", 18)).toBe("18 контролни т.");
    expect(pointsWordsBg("exam", 1)).toBe("1 наказателна точка");
    expect(pointsWordsBg("exam", 20)).toBe("20 наказателни точки");
    expect(pointsWordsBg("control", 1)).toBe("1 контролна точка");
  });

  it("the two product scales qualify themselves after the abbreviation", () => {
    // They have no adjective of their own, so the qualifier goes on the other
    // side — but it is still on the number.
    expect(pointsBg("manoeuvre", 2)).toBe("2 т. за изпълнение");
    expect(pointsOutOfBg("manoeuvre", 1, MANOEUVRE_MAX_PER_LINE)).toBe("1 / 2 т. за изпълнение");
    expect(pointsBg("theory", 3)).toBe("3 т. по теорията");
  });

  it("the three LEGAL scales carry an act and the one product scale says it is not law", () => {
    expect(POINT_SCALES.exam.isLaw).toBe(true);
    expect(POINT_SCALES.exam.sourceBg).toContain("Наредба № 38");
    expect(POINT_SCALES.control.isLaw).toBe(true);
    expect(POINT_SCALES.control.sourceBg).toContain("Наредба № Iз-2539");

    // THREE, not two. `theory` was declared „not law, no citation", which is
    // true of the per-question WEIGHT (чл. 38, ал. 1 delegates the question set
    // to the ИААА director and the наредба enumerates no weights) and false of
    // the SCALE: чл. 39, ал. 1 sets 45 questions, a ceiling of 97 and a pass
    // mark of 87 for категории В и В1 in the наредба's own sentence. Pinned to
    // the ingested act in components/exam/__tests__/theory-exam-scale.test.tsx.
    expect(POINT_SCALES.theory.isLaw).toBe(true);
    expect(POINT_SCALES.theory.sourceBg).toBe("Наредба № 38, чл. 39, ал. 1");

    // ADR-002 in the other direction: an invented article would be worse than
    // none, so the one counter this product made up says exactly that.
    expect(POINT_SCALES.manoeuvre.isLaw).toBe(false);
    expect(POINT_SCALES.manoeuvre.sourceBg).toContain("не е закон");
  });

  it("„изпитни“ stays welded to the PRACTICAL sheet and to nothing else", () => {
    // The one relabelling that would have been worse than the bare number.
    // The theory exam counts точки от правилни отговори; the practical sheet
    // counts наказателни (изпитни) точки; they are different acts, different
    // directions and different days.
    expect(pointsBg("exam", 10)).toContain("изпитни");
    for (const id of ["control", "manoeuvre", "theory"] as const) {
      expect(pointsBg(id, 10), id).not.toContain("изпитн");
      expect(pointsScaleLabelBg(id), id).not.toContain("изпитн");
      expect(POINT_SCALES[id].wordPluralBg, id).not.toContain("изпитн");
    }
    expect(POINT_SCALES.theory.wordPluralBg).toBe("точки от правилни отговори");
  });

  it("gives every scale a heading form with no number in it", () => {
    // For a <dt>, a caption, a column head — the places the number is already
    // on screen in its own element. Six labels on the theory-exam screens read
    // „точки максимум" / „Загубени точки", i.e. the founder's misreading with
    // the abbreviation spelled out.
    expect(pointsScaleLabelBg("exam")).toBe("изпитни точки");
    expect(pointsScaleLabelBg("control")).toBe("контролни точки");
    expect(pointsScaleLabelBg("manoeuvre")).toBe("точки за изпълнение");
    expect(pointsScaleLabelBg("theory")).toBe("точки по теорията");
    for (const id of ALL_SCALES) {
      expect(pointsScaleLabelBg(id), id).not.toMatch(/\d/);
      expect(pointsScaleLabelBg(id), id).not.toBe("точки");
    }
  });

  it("the manoeuvre rubric is marked as EARNED — it runs the other way", () => {
    // On the same screen: „20 наказателни точки" is bad, „2 / 2 т. за
    // изпълнение" is good. Getting this backwards is the second misreading.
    expect(POINT_SCALES.exam.direction).toBe("deducted");
    expect(POINT_SCALES.control.direction).toBe("deducted");
    expect(POINT_SCALES.manoeuvre.direction).toBe("earned");
    expect(POINT_SCALES.manoeuvre.noteBg).toContain("ПЕЧЕЛЯТ");
    expect(POINT_SCALES.manoeuvre.noteBg).toContain("не са контролни точки");
  });

  it("every scale's note says what the number is NOT", () => {
    // The reading everyone makes is „контролни точки". Three of the four notes
    // therefore have to rule it out by name; the licence's own note rules out
    // the opposite error — that the simulator can take them.
    for (const id of ["exam", "manoeuvre", "theory"] as const) {
      expect(POINT_SCALES[id].noteBg.toLowerCase(), id).toMatch(/контролни(те)? точки/);
    }
    expect(POINT_SCALES.control.noteBg).toContain("Симулаторът не отнема контролни точки");
  });

  it("the tariff is read off the engine's own table, not retyped", () => {
    const classes: SeverityClass[] = ["opasna", "osnovna", "vtorostepenna"];
    for (const c of classes) {
      expect(examPointsForClassBg(c)).toBe(pointsBg("exam", SEVERITY_POINTS[c]));
    }
    expect(examPointsForClassBg("opasna")).toBe("10 изпитни т.");
    expect(examPointsForClassBg("osnovna")).toBe("3 изпитни т.");
    expect(examPointsForClassBg("vtorostepenna")).toBe("1 изпитна т.");
  });

  it("the clause is derived from Наредба № 38's own class map", () => {
    // Not restated — inverted from n38.ts, so a re-ingest that moves a class
    // moves the citation with it.
    expect(examMarkCitationBg("opasna")).toBe("Наредба № 38 приложение № 5, т. 10, б. „в“");
    expect(examMarkCitationBg("osnovna")).toBe("Наредба № 38 приложение № 5, т. 10, б. „а“");
    expect(examMarkCitationBg("vtorostepenna")).toBe("Наредба № 38 приложение № 5, т. 10, б. „б“");
  });

  it("the pass rule is the наредба's own sentence, not a paraphrase", () => {
    expect(EXAM_PASS_RULE_BG).toContain("не повече от 9 наказателни точки");
    expect(EXAM_PASS_RULE_BG).toContain("не повече от 6 са от основни грешки");
  });

  it("the short note answers the misreading in one sentence", () => {
    expect(EXAM_POINTS_SHORT_NOTE_BG).toContain("Наредба № 38");
    expect(EXAM_POINTS_SHORT_NOTE_BG).toContain("НЕ са контролни точки");
  });

  it("keeps the abbreviated licence cell — and only that one — as an exception", () => {
    expect(controlPointsTightBg(18)).toBe("18 к.т.");
    expect(controlPointsTightBg(0)).toBe("0 к.т.");
  });

  it("the rubric denominator on screen is the union that produces the numerator", () => {
    // Compile-time: if RubricBreakdownLine.points stops admitting 2, this stops
    // type-checking rather than silently printing „2 / 3".
    const ceiling: RubricBreakdownLine["points"] = MANOEUVRE_MAX_PER_LINE;
    expect(ceiling).toBe(2);
  });
});

/*
 * 3. WHAT A STUDENT ACTUALLY READS lives next door, in
 *    `components/sim/lesson-ui/point-scales-rendered.test.tsx`: these are React
 *    surfaces, and a vocabulary test that never renders one cannot see the
 *    defect — the original „−10 т." was correct data rendered badly.
 */
