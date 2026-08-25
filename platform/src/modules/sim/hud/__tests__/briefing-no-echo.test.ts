import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { briefingBodyBg, briefingLineBg, briefingLineOrdinal } from "../overlayQueue";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { compileScenario } from "../../lessons/scenario/compile";
import type { ScenarioLevel } from "../../lessons/scenario/types";

/**
 * =============================================================================
 * „THERE ARE TWO COPIES OF IT ON SCREEN, IN DIFFERENT STYLING, BOTH CUT."
 *
 * THE EVIDENCE THIS FILE EXISTS FOR is two frames from the founder's own
 * iPhone 16, 2026-08-14, and a device census that reproduced them on all six
 * profiles in both orientations:
 *
 *   PORTRAIT   bold white  «Потегли по улицата и се движи спокойно в своята
 *                           лента. По…»                       ← ellipsis
 *              grey below  «1. Потегли по улицата и се движи спокойно в своята
 *                           лента. По тъмно първо провери късите светлини
 *                           (чл. 70): пред пешеходна пътека…» ← ellipsis
 *   LANDSCAPE  the same two, the first sliced horizontally through the middle
 *              of its glyphs, the second cut at «пред пешеходна».
 *
 * ONE CARD. `LessonPlayShell` §4c set `lineBg = briefingBg[0].textBg` and
 * `detailBg = briefingBg.map(s => `${s.n}. ${s.textBg}`)` — the whole list,
 * step 1 INCLUDED — so `SimOverlay`'s row 2 and row 2b printed the identical
 * 219 characters, two millimetres apart, in two different typefaces, and
 * clamped both. The read sheet behind «ЗАЩО» inherited it: its <h2> and the
 * first line of its body were the same sentence.
 *
 * WHAT IT COST, IN THE ONLY UNITS THAT MATTER HERE. The compact column's cap in
 * landscape is 128 px (`100% − TOUCH_CONTROLS_FLOOR − top` at 852 × 393). The
 * echo was 219 of the 556 characters that card had to hold on
 * `sc-zebra-approach@L1` — 39 % — and 412 of 972 on the same scenario at L4,
 * where step 1 is the exam-protocol complication. Two fifths of a budget that
 * was already three times oversubscribed, spent saying the same thing twice.
 *
 * WHY NO TEST CAUGHT IT, AND WHY THIS ONE CAN. It was a single expression
 * inside a 4 000-line component: nothing importable, nothing assertable, and
 * every probe that looked at the screen counted CLIPPING rather than REPETITION
 * (`el.scrollWidth > el.clientWidth`, which cannot see either). The derivation
 * is two exported pure functions now, so this file can push every compiled rung
 * of all 167 shipped templates through the SAME code the card renders and fail
 * the moment the body starts echoing the line again.
 *
 * IT IS A REGRESSION OF THE THEO-4 FIX, not an ancient bug — which is the part
 * worth remembering. Until row 2b landed, `detailBg` rendered ONLY inside the
 * read sheet: a different surface, one tap away, where a header and its list
 * may legitimately repeat. The moment the body was brought onto the CARD to
 * stop the phone hiding the reasoning, the card began saying everything twice.
 * A fix that moves content between surfaces has to re-ask what each surface is
 * now holding, and that is exactly what this file makes unskippable.
 * =============================================================================
 */

const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4];

/**
 * Every compiled rung that actually ships, with its authored briefing.
 *
 * Only the levels a template AUTHORS — `compileScenario` throws on a rung that
 * does not exist (`sc-sign-warning` stops at L3), and a sweep that swallowed
 * that would quietly shrink its own corpus.
 */
const RUNGS = SCENARIO_TEMPLATES.flatMap((spec) =>
  LEVELS.filter((level) => spec.levels.some((l) => l.level === level)).map((level) => {
    const lesson = compileScenario(spec, level);
    return { id: `${spec.id}@L${level}`, steps: lesson.briefingBg ?? [] };
  }),
).filter((r) => r.steps.length > 0);

/** Bulgarian prose comparison: whitespace and case are not the point. */
function norm(s: string): string {
  return s.replace(/\s+/gu, " ").trim().toLocaleLowerCase("bg-BG");
}

describe("the briefing card never prints the same sentence twice", () => {
  it("has a corpus to assert against at all (the selectors.test.mjs lesson)", () => {
    // A rule that sweeps an empty list is the four-month `mustFit` selector
    // that vouched for a screen it had never looked at. 167 templates × 4 rungs.
    expect(RUNGS.length).toBeGreaterThan(600);
  });

  it("the body never repeats the line, on any rung of any shipped template", () => {
    const echoes: string[] = [];
    for (const rung of RUNGS) {
      const line = norm(briefingLineBg(rung.steps));
      const body = briefingBodyBg(rung.steps);
      if (line.length === 0 || body === null) continue;
      if (norm(body).includes(line)) echoes.push(rung.id);
    }
    expect(echoes).toEqual([]);
  });

  it("…and the OLD derivation still fails it, so the assertion has teeth", () => {
    // The exact expression that shipped until 2026-08-14. If this ever stops
    // failing, the test above has stopped testing anything.
    const oldBody = (steps: readonly { n: number; textBg: string }[]) =>
      steps.map((s) => `${s.n}. ${s.textBg}`).join("\n");
    const broken = RUNGS.filter((r) =>
      norm(oldBody(r.steps)).includes(norm(briefingLineBg(r.steps))),
    );
    expect(broken.length).toBe(RUNGS.length);
  });

  it("loses not one authored character: line + body === the whole briefing", () => {
    // The fix must be a DEDUPLICATION, never a truncation. THEO-4 does not
    // permit paying for a height budget with the lesson's own words, and the
    // clamp this replaced was doing precisely that (77 px of the headline and
    // 215 px of the body hidden behind „…", with the student told neither).
    for (const rung of RUNGS) {
      const rebuilt = [
        briefingLineBg(rung.steps),
        ...(briefingBodyBg(rung.steps) ?? "").split("\n").filter(Boolean),
      ]
        .map(norm)
        .join(" ");
      for (const step of rung.steps) {
        expect(rebuilt, `${rung.id} · step ${step.n} went missing`).toContain(norm(step.textBg));
      }
    }
  });

  it("keeps the authored numbering — the body starts at 2., never renumbered", () => {
    for (const rung of RUNGS) {
      if (rung.steps.length < 2) continue;
      const body = briefingBodyBg(rung.steps)!;
      expect(body.startsWith(`${rung.steps[1]!.n}. `), rung.id).toBe(true);
      expect(body.startsWith("1. "), rung.id).toBe(false);
    }
  });

  /* ─────────────────────────────────────────────────────────────────────────
     [MERGE NOTE, 2026-08-25. A sibling repair lane asserted the OTHER shape here —
     that briefingLineBg itself returns "N. text" — with a mutation case proving
     the old plain line fails it. Both were dropped, and the code with them: that
     shape spends three characters of the peek fold budget, and a verifier measured
     the cost over 663 rungs as 12 rungs falling to ZERO body and 1,190 body
     characters lost, the graded step among them. The ordinal travels as data.]

     …AND THE NUMBERING IT KEEPS HAS TO START SOMEWHERE VISIBLE.

     Round 10, 2026-08-24 — twenty-one BROKEN rows on one attested commit, all
     of them the same sentence, all of them a mobile `02-briefing.png`:
     sc-pe-school-patrol, sc-park-zebra, sc-park-left, sc-park-wall,
     sc-crossing-child-ball, sc-rb-busy-gap, sc-signal-dead, sc-speed-creep,
     sc-ov-solid-return … „a blocking modal on mobile whose numbered list starts
     at «2.» (step 1 is promoted to an unnumbered lead) and a side panel on pc
     that numbers 1–5."

     The test directly above is the reason the body opens at two, and it is the
     RIGHT rule — renumbering would make the body claim to be a different list.
     What nothing asserted is that the number it counts from is on the glass at
     all. `briefingLineOrdinal` is that number; these two rows are the sequence
     having no hole in it, and the negative control is the state the twenty-one
     frames photographed.
     ────────────────────────────────────────────────────────────────────────── */

  it("the visible sequence has no hole: the line's ordinal, then the body's first", () => {
    const holes: string[] = [];
    for (const rung of RUNGS) {
      if (rung.steps.length < 2) continue;
      const ordinal = briefingLineOrdinal(rung.steps);
      if (ordinal === null) {
        holes.push(`${rung.id}: the line carries no number at all`);
        continue;
      }
      // The body's own first number is read off the body STRING, not off
      // `steps[1].n` — the sheet paints the string, and a rule checked against
      // the array would pass through any future change to how the body is
      // built. This is the same instrument discipline as `rowsBelowFold`.
      const first = briefingBodyBg(rung.steps)!.split(".")[0];
      if (first !== String(ordinal + 1)) {
        holes.push(`${rung.id}: line is ${ordinal}. and the body opens at ${first}.`);
      }
    }
    expect(holes, holes.join("\n")).toEqual([]);
  });

  it("…and WITHOUT the ordinal every shipped rung opens its list at 2 (the frames)", () => {
    // MUTATION, written down rather than described: `briefingLineOrdinal`
    // returning `null` — „there is no number, the bold sentence speaks for
    // itself" — is exactly the build the twenty-one frames were taken on. If
    // this stops being the whole corpus, the row above has gone vacuous.
    const opensAtTwo = RUNGS.filter((r) => {
      if (r.steps.length < 2) return false;
      return briefingBodyBg(r.steps)!.startsWith("2. ");
    });
    expect(opensAtTwo.length).toBe(RUNGS.filter((r) => r.steps.length >= 2).length);
    // …and every one of them names 1 as the missing item, which is what makes
    // the hole closable at all: no shipped template starts its briefing at 0
    // or skips straight to 2 in the authored data.
    expect(RUNGS.every((r) => briefingLineOrdinal(r.steps) === 1)).toBe(true);
    expect(briefingLineOrdinal([])).toBeNull();
  });

  it("offers no «ПРОЧЕТИ» for a one-step briefing (a sheet onto nothing)", () => {
    expect(briefingBodyBg([{ n: 1, textBg: "Само това." }])).toBeNull();
    expect(briefingBodyBg([])).toBeNull();
    expect(briefingLineBg([])).toBe("");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   …AND THE OTHER HALF: THE CARD MAY NOT SLICE A GLYPH.

   The duplication is why there were two. This is why both were CUT.

   Measured on the deployed build (`wave11-why-sliced.mjs`, WebKit, real insets,
   sc-zebra-approach@L1, 852 × 393): the column caps the card at 128 px; the two
   text rows carried `line-clamp-3` / `line-clamp-6`; `line-clamp` compiles to
   `overflow: hidden`; and an overflow other than `visible` ZEROES a flex item's
   automatic minimum size. So the two text rows were the only shrinkable items
   in the card's column and absorbed the entire 353 px shortfall — the headline
   was given 19.1 px of the 96 px it wanted (1.38 line boxes of 13.75 px, so
   line 2 kept 0.38 of its height and was guillotined through the waist) and the
   body 41.9 px of 257 px. On the 780 × 360 Samsung the headline is a 2.6 px
   sliver: gone.

   The fix is structural — a scroll window that takes the shortfall, with the
   text rows `shrink-0` inside it so nothing is ever laid out at 1.38 lines —
   and a source scan is the only cheap net for it: a clamp reintroduced anywhere
   in this card looks perfectly reasonable in a diff and silently restores both
   the amputation and the silent ellipsis.
   ═══════════════════════════════════════════════════════════════════════════ */
const OVERLAY_SRC = readFileSync(join(__dirname, "..", "SimOverlay.tsx"), "utf8");

/**
 * The same helper `hud-card-fit.test.ts:110` uses, and for the same reason: a
 * source scan that can be satisfied by a COMMENT is not a gate. Block comments
 * are blanked rather than deleted so line numbers survive; line comments go.
 */
function stripComments(source: string): string {
  const blanked = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return blanked
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("SimOverlay's card cannot go back to clipping its own text", () => {
  it("has a scroll window that owns the shortfall", () => {
    expect(OVERLAY_SRC).toContain('data-sim-overlay-text=""');
    // `min-h-0` is what lets a flex item shrink below its content at all, and
    // `shrink` is what makes THIS the item that gives. Without both the card
    // overflows its cap and the control row leaves the screen.
    expect(OVERLAY_SRC).toMatch(/data-sim-overlay-text[\s\S]{0,220}min-h-0[\s\S]{0,120}overflow-y-auto/);
  });

  it("no `line-clamp` and no `truncate` on any authored sentence in this file", () => {
    // The chip («ИНСТРУКЦИИ», «Подготовка») is a LABEL and may still truncate —
    // it is short by construction and it is not the lesson. Every other clamp
    // in this file was hiding authored Bulgarian, and the student was told
    // nothing about any of it.
    const offenders = OVERLAY_SRC.split("\n")
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => /className=.*\b(line-clamp-\d+|truncate)\b/.test(text))
      .filter(({ text }) => !/tracking-wider/.test(text)); // the uppercase chips
    expect(offenders).toEqual([]);
  });

  it("the control row cannot shrink — it is the only way out of a blocking card", () => {
    expect(OVERLAY_SRC).toMatch(/mt-0\.5 flex shrink-0 items-center justify-end/);
  });

  /**
   * THE SHEET PAINTS THE ORDINAL — and this pins the surface it is on, not a
   * ban on the other one.
   *
   * WHAT THE ROW IS. All twenty-one round-10 frames are `02-briefing.png`, and
   * `tools/mobile/lesson-audit.mjs:1049-1055` clicks «ПРОЧЕТИ» and waits
   * 2 500 ms BEFORE that beat — so every one of them is the opened SHEET, the
   * element below `data-sim-overlay-sheet-text`, and it is the only surface
   * that shows the whole list. That is the reason the span lives there.
   *
   * WHAT THIS DELIBERATELY NO LONGER FORBIDS, and the measurement that took it
   * out — round 10 verification, 2026-08-25. This assertion used to have a
   * second half: the source above the sheet must NOT mention `shown.lineOrdinal`,
   * i.e. the peek may never number its lead. The stated ground was a sweep over
   * `briefing-card-budget.test.ts`'s FOLD_TABLE — „+3 authored characters moves
   * 29 of 663 rungs into a worse band and takes 12 to no body at all". The
   * frames contradict the model that sweep runs on: FOLD_TABLE's header
   * measures the peek's text window at 180 × 127 px and budgets a ≤ 42-character
   * line 110 visible body characters, while `sc-crossing-white-cane__mobile-
   * right/01-arrival.png` shows a ~44-character line with ZERO body and
   * «↓ ОЩЕ 17 РЕДА» — a real window of roughly 51 CSS px. The peek's body is at
   * zero with or without three characters, so the cost was never demonstrated.
   *
   * The sweep is still a good argument against prefixing „1. " onto the STRING
   * — `briefingLineBg` is the derivation both this file's corpus rows and
   * `briefing-card-budget` read, and a prefix there would make the numbering
   * rows assert against copy no author wrote. It was never an argument against
   * markup, which costs zero authored characters and which FOLD_TABLE cannot
   * see (it reads `spec.instructionsBg[].textBg`).
   *
   * So the peek's lead stays unnumbered on evidence rather than by gate: on
   * both peek frames opened this round the body is entirely below the fold
   * («↓ ОЩЕ 35 РЕДА», «↓ ОЩЕ 17 РЕДА»), so the peek displays no numbers at all
   * and there is no visible hole in a sequence for a student to hunt in — a
   * lone «1.» over nothing numbers a list of one. A later lane that re-derives
   * FOLD_TABLE against the shipped window may number it, and should argue with
   * a measurement, not with this test.
   *
   * Split on the sheet scroller's own hook, which the row below already treats
   * as this file's landmark. No literal newline is matched anywhere here: this
   * worktree checks out CRLF and the main tree is LF.
   */
  it("the sheet — the surface all twenty-one frames photographed — paints the ordinal", () => {
    // Comments stripped FIRST, and the anchor found in the stripped text: the
    // block above this element names the field, and a gate a comment can
    // satisfy is `queueTaskEcho`'s symbol-name match over again — it counted a
    // property read as a function call. (Stripping shifts offsets, so an index
    // taken from the raw source would point at the wrong byte here.)
    const SHEET_ANCHOR = "data-sim-overlay-sheet-text";
    const src = stripComments(OVERLAY_SRC);
    const at = src.indexOf(SHEET_ANCHOR);
    expect(at, "the sheet's scroller lost its hook").toBeGreaterThan(0);
    const sheet = src.slice(at);
    expect(sheet, "the sheet stopped painting the number the body counts from").toContain(
      "shown.lineOrdinal",
    );
  });

  it("the read sheet's own title is no longer a fragment", () => {
    // It used to be `<h2 class="… truncate …">{lineBg}</h2>` and ate 146 of 219
    // characters of the instruction it was heading — on the surface a student
    // is SENT TO because the peek could not finish printing.
    expect(OVERLAY_SRC).not.toMatch(/<h2[^>]*truncate/);
    // …and the sheet keeps the authored line breaks of a numbered briefing,
    // which it never did: the five steps arrived as one run-on paragraph.
    expect(OVERLAY_SRC).toMatch(/whitespace-pre-line[^\n]*\n?[^\n]*\{shown\.detailBg\}/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   …AND THE WIRE BETWEEN THE TWO, WHICH AN ADVERSARIAL VERIFIER CUT WITHOUT
   TURNING ANYTHING RED.

   Round 10, 2026-08-25. Two mutations were run when the ordinal landed and
   both went red as claimed: `briefingLineOrdinal` → `return null` (2 rows in
   this file), and deleting the sheet's `<span className="tabular-nums">` (1
   row). The verifier ran a third that nobody had. It deleted ONLY

       lineOrdinal: briefingLineOrdinal(briefing),

   from `LessonPlayShell.tsx` § 4c — the one line that carries the number from
   the module to the glass — and re-ran the same scope
   (`briefing-no-echo` + `sim-overlay-fold` + `overlay-queue`):
   **56 passed / 56, all green.** With that line gone the product renders no
   ordinal on any phone in any lesson, and `grep -rn lineOrdinal src` returns
   three hits of which not one is a consumer — a type field and two assertions
   that still pass, because the `<span>` is still there reading a property
   nobody sets.

   The two earlier mutations guard the two ENDS of the wire: a pure function
   that still returns 1, and markup that still reads a field. Neither guards
   the wire, and „shipped, gated, read by nobody" is this programme's most
   expensive recurring bill — `districtWorldEdge`, `worldEdgeClearanceM`,
   `touchHintShouldHide`, and round 8's value read only by its own test.

   Source-pinned because the briefing item is an object literal inside a
   5 000-line component: nothing importable, and nothing renderable without the
   whole 3-D stage. `hud-card-fit.test.ts:220` reads this same file the same
   way. Comments are stripped first, offsets are taken from the STRIPPED text,
   and the match is scoped to the briefing item itself — a hit anywhere else in
   5 000 lines would be some other card's field, not the sentence this number
   counts from.
   ═══════════════════════════════════════════════════════════════════════════ */
const SHELL_SRC = stripComments(
  readFileSync(
    join(__dirname, "..", "..", "..", "..", "components", "sim", "lesson-ui", "LessonPlayShell.tsx"),
    "utf8",
  ),
);

describe("the ordinal reaches the glass: § 4c wires it beside the line it numbers", () => {
  it("the briefing overlay item carries `lineOrdinal`, not only `lineBg`", () => {
    const at = SHELL_SRC.indexOf('id: "briefing",');
    expect(at, "§ 4c's briefing item lost its id — re-anchor this test").toBeGreaterThan(0);
    const end = SHELL_SRC.indexOf('openLabelBg: "Прочети"', at);
    expect(end, "the briefing item's «ПРОЧЕТИ» control moved — re-anchor this test").toBeGreaterThan(
      at,
    );
    const item = SHELL_SRC.slice(at, end);
    // Both halves of the split, from the module and not from an expression
    // written in the component — the reason `briefingLineBg`/`briefingBodyBg`
    // were extracted in the first place, and the reason the corpus rows at the
    // top of this file assert against the SAME code the card renders.
    expect(item, "the line stopped coming from the module").toContain(
      "lineBg: briefingLineBg(briefing)",
    );
    expect(
      item,
      "the wire is cut: the sheet would read a field nobody sets, and every gate would stay green",
    ).toContain("lineOrdinal: briefingLineOrdinal(briefing)");
  });
});
