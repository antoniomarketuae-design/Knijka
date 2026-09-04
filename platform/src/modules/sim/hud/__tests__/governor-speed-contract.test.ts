import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GovernorCapMark } from "../StatusDashboard";
import { readSpeedContract } from "../../scene/lessonSpeedContract";
import { governorIsEasing } from "../../vehicle";

/**
 * =============================================================================
 * THREE NUMBERS ON THE GLASS, NO PRECEDENCE — AND THE BAR NOW ASKS ONE PLACE
 * WHICH ONE BINDS.  Sweep 161, 2026-08-19.
 * =============================================================================
 *
 * THE FRAMES, opened before anything was changed (iPhone 16 landscape unless
 * noted). Every one shows the same reading and not one of them resolves it:
 *
 *   sc-zebra-approach/mobile-right/04-t087s   instruction «под 40 км/ч» ·
 *                                             В26 disc 50 · «РЕЖИМ Нормален ≤60
 *                                             · знакът важи»
 *   sc-crossing-dart/mobile-right/01-arrival   disc 50 · «Нормален ≤60»
 *   sc-sp-curve/mobile-wrong/04-t030s          disc 90 · «Нормален ≤100»
 *   sc-park-bay-exit-rev/pc-wrong/04-t028s     disc 20 · «Нормален ≤50», and the
 *     (1440 × 900)                             run was then docked −10 for
 *                                              «Превишаване с повече от 10 км/ч»
 *
 * The zebra frame is the one that decides it: the student is BILLED against 40,
 * the smallest of the three, and 40 is the only one of the three with nothing
 * beside it saying so. He obeys the sign he can see and fails the drill.
 *
 * `scene/lessonSpeedContract.ts` wrote the resolution for exactly this and could
 * not spend it — „the three surfaces that must adopt it are
 * `hud/StatusDashboard.tsx` (`GovernorCapMark`) … none of which this lane owns
 * … Until they do, the glass is unchanged and the 22 rows stand." This file
 * holds the first adoption.
 *
 * WHY EVERY ASSERTION BELOW IS RUN AND NOT GREPPED. The mark's own suite says
 * why in its own words: „A grep cannot tell «the sign clause renders when the
 * cap is above the limit» from «the string exists somewhere in the file»." So
 * the component is rendered, and each rule is proved in BOTH directions — a
 * clause that always fired would be furniture, and one that never fired would
 * be the silence it replaces.
 */

const SRC = fs
  .readFileSync(
    path.join(process.cwd(), "src", "modules", "sim", "hud", "StatusDashboard.tsx"),
    "utf8",
  )
  .replace(/\r\n/g, "\n");

const mark = (args: {
  capKmh: number | null;
  limitKmh: number;
  taskCapKmh?: number;
  speedKmh?: number;
}) =>
  renderToStaticMarkup(
    createElement(GovernorCapMark, {
      capKmh: args.capKmh,
      limitKmh: args.limitKmh,
      taskCapKmh: args.taskCapKmh,
      speedKmh: args.speedKmh ?? 20,
      tierBg: "Нормален",
      size: "compact" as const,
    }),
  );

describe("the drill's own cap reaches the bar when it is the number that binds", () => {
  it("prints it — the zebra frame, 40 against a 50 sign and a 60 ceiling", () => {
    const html = mark({ capKmh: 60, limitKmh: 50, taskCapKmh: 40 });
    // The number the student is actually graded on is now on the same bar as
    // the two that are not.
    expect(html).toContain("задачата иска ≤40");
    // …and the precedence rides with it INSIDE THE CHIP, on the glass and not
    // only on `title` (the same words are in `explainBg`, so the anchor is the
    // chip's own handle rather than a bare substring of the markup).
    expect(html).toMatch(/governor-task-binds[\s\S]*?по-строгото важи/);
    // ── AND THE THIRD NUMERAL IS GONE (sc-sig-controller-postures:e245bd5c) ──
    // This block used to end „the other two are untouched", asserting «Нормален
    // ≤60» and «знакът важи» on the same markup. That was the reading the three
    // COUNT rows were filed against: three speed figures at once, of which the
    // governor is the only one that can neither convict nor acquit. At 20 км/ч
    // under a 60 cap it is easing nothing and it blocks no 40 km/h gate, so it
    // leaves and the strip states the two numbers that actually bill.
    expect(html).not.toContain("Нормален ≤60");
    expect(html).not.toContain("знакът важи");
    // …but the explanation is not what left: the element's accessible name
    // still carries all three ceilings and the precedence between them.
    expect(html).toContain("Знакът е 50 — това е законът.");
    expect(html).toContain("РЕЖИМ ≤60 е таван на колата, не разрешение.");
  });

  it("SAYS NOTHING when the drill is slack — B58, inherited whole", () => {
    // 32 gates in the catalogue are authored ABOVE their own street's limit as
    // grading slack. Slack is not a teaching instruction, and a bar that
    // printed „задачата иска ≤60" beside a 50 sign would be the world
    // instructing the fault it is about to bill — B58 verbatim, on a new
    // surface.
    // The governor is at 40 here, i.e. AT OR UNDER the sign, so it is the
    // operative ceiling and stays on the bar — which is what makes it a usable
    // negative control after the count repair. (At 60 the mark would be empty
    // for a reason that has nothing to do with B58, and a `not.toContain` on an
    // empty string proves nothing; that is the trap this pair now avoids.)
    const slack = mark({ capKmh: 40, limitKmh: 50, taskCapKmh: 60 });
    expect(slack).not.toContain("задачата иска");
    // Negative control: the mark rendered at all, so the `not` above is not
    // passing on an empty string.
    expect(slack).toContain("Нормален ≤40");

    // A tie is the law's, never the drill's — `readSpeedContract`'s own rule.
    expect(mark({ capKmh: 40, limitKmh: 50, taskCapKmh: 50 })).not.toContain("задачата иска");
  });

  it("is ABSENT on every mount that ships today, byte for byte", () => {
    // `LessonPlayShell` passes no task cap yet (see the ⚠ on the prop). The
    // undefined case must reproduce the old two-number bar exactly, or this
    // change would have altered 161 lessons on the strength of an unmerged
    // upstream edit.
    expect(mark({ capKmh: 60, limitKmh: 50 })).toBe(
      mark({ capKmh: 60, limitKmh: 50, taskCapKmh: undefined }),
    );
    expect(mark({ capKmh: 60, limitKmh: 50 })).not.toContain("задачата иска");
    // …on a pair that RENDERS, so the equality above is not two empty strings
    // agreeing with each other. (The 60-against-50 pair is empty since the count
    // repair — see the sweep below — which is exactly the vacuity this guards.)
    expect(mark({ capKmh: 40, limitKmh: 50 })).toBe(
      mark({ capKmh: 40, limitKmh: 50, taskCapKmh: undefined }),
    );
    expect(mark({ capKmh: 40, limitKmh: 50 })).toContain("Нормален ≤40");
  });

  it("MUTATION — the clause is driven by the resolver, not by a literal", () => {
    // The cheapest way to fake every assertion above is to hard-code the string
    // whenever a task cap is present. Drive the same component across the
    // decision boundary in ONE step: 49 binds (below the 50 sign), 51 does not.
    // A literal cannot tell those apart; the resolver is the only thing here
    // that can.
    expect(mark({ capKmh: 60, limitKmh: 50, taskCapKmh: 49 })).toContain("задачата иска ≤49");
    expect(mark({ capKmh: 60, limitKmh: 50, taskCapKmh: 51 })).not.toContain("задачата иска");
  });
});

describe("the sign-wins clause is no longer a second copy of the rule", () => {
  /**
   * `overLimit` used to be `cap > Math.round(limitKmh)` written out in the
   * component, while `SpeedContractReading.modeAboveLaw` is the same inequality
   * written out in `lessonSpeedContract.ts` under a docstring promising it
   * „Mirrors `GovernorCapMark`'s own `overLimit` … so the mark and this cannot
   * disagree". Two hand-kept copies of one rule is the arrangement this module
   * has been burned by twice (the two screen-owner lists; the two weather
   * vocabularies). The sweep below is what makes „one rule" checkable.
   */
  const GRID = [0, 0.4, 1, 19.6, 20, 30, 40, 49.5, 50, 60, 90, 140, 150];

  it("agrees with `readSpeedContract` on every pair, including the ugly ones", () => {
    // ── THE RULE GAINED ITS SECOND TERM (sc-sig-controller-postures:e245bd5c) ─
    // It used to be `includes("знакът важи") === modeAboveLaw` alone. The count
    // repair says a governor ABOVE the sign leaves the bar entirely unless it is
    // actually easing the throttle — so the clause that names what that numeral
    // loses to renders only where the numeral itself does. Both terms come from
    // shipped exports (`readSpeedContract`, `governorIsEasing`); neither is
    // restated here, which is what this sweep exists to guarantee.
    const SPEED = 20;
    let sawClause = false;
    let sawNoClause = false;
    let sawSpeakingAboveLaw = false;
    for (const limitKmh of GRID) {
      for (const capKmh of GRID) {
        if (capKmh <= 0) continue; // no cap is a separate case, asserted below
        const { modeAboveLaw } = readSpeedContract({
          postedKmh: limitKmh,
          modeCapKmh: capKmh,
        });
        const speaks = governorIsEasing(capKmh, SPEED) || !modeAboveLaw;
        const expected = modeAboveLaw && speaks;
        const html = mark({ capKmh, limitKmh, speedKmh: SPEED });
        expect(html.includes("знакът важи")).toBe(expected);
        // …and the numeral it qualifies obeys the same predicate, so the bar
        // can never carry one without the other.
        expect(html.includes(`Нормален ≤${Math.round(capKmh)}`)).toBe(speaks);
        if (expected) sawClause = true;
        else sawNoClause = true;
        if (modeAboveLaw && speaks) sawSpeakingAboveLaw = true;
      }
    }
    // The sweep must have exercised BOTH answers, or „they agree" is vacuous.
    expect(sawClause).toBe(true);
    expect(sawNoClause).toBe(true);
    // …and it must have found at least one governor that is above the sign AND
    // speaking, or the new term would be passing by never being true.
    expect(sawSpeakingAboveLaw).toBe(true);
  });

  it("MUTATION — a road with NO posted limit no longer claims a sign wins", () => {
    // This is the pair where the old hand-rolled inequality and the resolver
    // genuinely part, and it is the reason the de-duplication is a fix rather
    // than a tidy-up.
    //
    //   old:  cap > Math.round(0)  →  60 > 0  →  TRUE  → prints «знакът важи»
    //   new:  readSpeedContract drops a non-positive `postedKmh` entirely, so
    //         there is no law to win and the clause does not render.
    //
    // It matters on the glass: the disc beside this mark is
    // `Math.max(1, Math.round(limitKmh))`, so at `limitKmh = 0` the bar drew a
    // В26 reading **1** and this mark pointed at it and said the sign applies.
    // A fabricated 1 км/h prohibition, asserted by the HUD, next to a governor
    // of 60.
    expect(mark({ capKmh: 60, limitKmh: 0 })).not.toContain("знакът важи");
    // …and the mark itself still renders, so the assertion is about the clause
    // and not about the component vanishing.
    expect(mark({ capKmh: 60, limitKmh: 0 })).toContain("Нормален ≤60");
    // The old behaviour, stated as arithmetic so the divergence is legible
    // rather than asserted from memory.
    expect(60 > Math.round(0)).toBe(true);
    expect(readSpeedContract({ postedKmh: 0, modeCapKmh: 60 }).modeAboveLaw).toBe(false);
  });

  it("the component holds no inequality of its own any more", () => {
    // Belt and braces on the sweep above: the source may not re-derive what it
    // now asks for. Read off the component's own slice, prose stripped, so the
    // paragraphs that EXPLAIN the old rule do not count as the rule.
    const slice = SRC.slice(
      SRC.indexOf("export function GovernorCapMark"),
      SRC.indexOf("export function StatusDashboard"),
    );
    const code = slice.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).toContain("readSpeedContract({");
    expect(code).toContain("reading.modeAboveLaw");
    expect(code).not.toMatch(/cap\s*>\s*Math\.round\(limitKmh\)/);
  });
});

describe("nothing the mark already promised was spent to buy this", () => {
  it("still vanishes with no cap, still names whose ceiling it is", () => {
    expect(mark({ capKmh: null, limitKmh: 50, taskCapKmh: 40 })).toBe("");
    expect(mark({ capKmh: 40, limitKmh: 50 })).toContain("Нормален ≤40");
  });

  it("the new clause does not dress itself as a road sign", () => {
    // The В26 shape — a red annulus around a numeral — is reserved for the law.
    // `governor-cap.test.ts` forbids it to the governor mark by grepping this
    // slice for the two tokens that would build one; a third number added to the
    // same span must inherit that ban rather than slip under it. Asserted on the
    // RENDERED markup here so the two files check it from different sides, and
    // so that this file does not become a second thing whose own prose can trip
    // the other's grep.
    const html = mark({ capKmh: 60, limitKmh: 50, taskCapKmh: 40 });
    expect(html).toContain("задачата иска ≤40");
    expect(html).not.toContain("rounded-full");
    expect(html).not.toContain("--danger");
    // …and it IS toned, so the `not`s above are not passing on unstyled text.
    expect(html).toContain("--warning");
  });

  it("both variants are still told the posted limit, and now the task cap too", () => {
    expect(SRC.match(/limitKmh=\{limitKmh\}/g) ?? []).toHaveLength(2);
    expect(SRC.match(/taskCapKmh=\{taskCapKmh\}/g) ?? []).toHaveLength(2);
  });
});

describe("…and the shell HAS now threaded it — O51, round 11", () => {
  it("both mounts publish the snapshot's task cap", () => {
    /**
     * ── THIS BLOCK INVERTED, WHICH IS WHAT IT WAS FOR ─────────────────────────
     *
     * It used to read `expect(mount).not.toContain("taskCapKmh")` under the
     * heading „the shell has not threaded it yet". The `touchHintLifetime.ts` ⚠
     * discipline: the rule lives here, the edit that spends it lives in a file
     * this lane did not own, and the assertion was written against the CURRENT
     * call so it went red the moment that edit landed. It did, and it is
     * inverted here rather than deleted.
     *
     * WHAT THE SHELL PUBLISHES IS NOT `reachZone.maxSpeedKmh`, and the reason is
     * measured rather than argued — see `taskCapKmhFromPrompt`'s docstring in
     * `LessonPlayShell.tsx`. Short form: on 212 of the catalogue's 953 capped
     * cards the raw gate sits ABOVE the sentence the student is reading (up to
     * 8 km/h; sc-zebra-approach@L1 is gate 45 against card 40), so publishing it
     * would have put a fourth unexplained ceiling on the one surface whose whole
     * finding is unexplained ceilings. The shell publishes the figure the
     * advisor is speaking, which is ≤ the gate on all 953.
     *
     * THE MEASUREMENT LIVES WHERE IT CAN BE RUN, not here: this block pins
     * cross-file ROUTING STATE (the §7 B-R10 usage), and
     * `components/sim/lesson-ui/__tests__/taskCapThread.test.ts` drives the real
     * catalogue through the shell's own reader and renders `GovernorCapMark` on
     * both sides of the boundary.
     *
     * ⚠ THE WINDOW IS THE SELF-CHECK. `[\s\S]{0,900}?` is lazy up to the first
     * `/>`, so a mount that outgrows it stops matching and the length assertion
     * below fails — which is exactly how this block first went red (the compact
     * mount grew past 600 characters of comment). It cannot silently match
     * fewer mounts than exist.
     */
    const shell = fs
      .readFileSync(
        path.join(
          process.cwd(),
          "src",
          "components",
          "sim",
          "lesson-ui",
          "LessonPlayShell.tsx",
        ),
        "utf8",
      )
      .replace(/\r\n/g, "\n");
    const mounts = [...shell.matchAll(/<StatusDashboard[\s\S]{0,900}?\/>/g)].map((m) => m[0]);
    expect(mounts).toHaveLength(2);
    for (const mount of mounts) {
      expect(mount).toContain("limitKmh={snap.limitKmh}");
      // ← the line that inverted. Both mounts, or the phone and the desktop
      //   grade against different visible numbers.
      expect(mount).toContain("taskCapKmh={snap.taskCapKmh}");
    }
  });
});
