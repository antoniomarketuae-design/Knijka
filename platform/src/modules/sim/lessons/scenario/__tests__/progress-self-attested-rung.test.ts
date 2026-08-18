/**
 * progress.ts — THE RUNG THE STUDENT ALREADY DROVE.
 *
 * SWEEP161 ROUTING NOTE, so the next reader does not go looking for a frame:
 * the 26 BROKEN findings filed against `scenario/progress.ts` in sweep161 are
 * all verdict/XP/briefing/mobile-drive findings and NONE of them is produced by
 * this fold (the sweep never opened the level picker — no audit log under
 * `.audit-frames/sweep161/**` contains „Отключва се" or „Заключено ниво").
 * The defect gated below was found by reading the fold against its own output,
 * not from a frame, and it is filed as such.
 *
 * THE DEFECT. `scenarioLevelProgress` decided a rung ONLY from the rung below
 * it. It never asked whether the student had driven THIS rung. So a row set
 * with an attempt at Ln and none at Ln-1 came out of the fold self-
 * contradictory in two directions at once:
 *
 *   L4  attempts 1 · bestStars 3 · passed TRUE  · unlocked FALSE   ← 🔒 on a
 *                                                                   rung taken
 *                                                                   with 3★
 *   L5  attempts 0 · bestStars null · passed false · unlocked TRUE ← opened by
 *                                                                   L4's own
 *                                                                   attempt
 *
 * i.e. the ladder was non-monotonic — the rung ABOVE the shut one was open, off
 * the very rows that were said to leave it shut — and `ScenarioCatalog.tsx:226`
 * paints that shut rung „Отключва се с ≥ 2★ на предишното ниво" over a 3★ pass.
 * Worse than the copy: `actions.ts:154` runs `isScenarioLevelUnlocked` as the
 * SAVE gate, so re-driving that rung answers `LEVEL_LOCKED` and the finished
 * drive is discarded.
 *
 * Reachable today through the admin gate (`{ unlockAll: user.isAdmin }` at both
 * call sites — an account that drove upper rungs as admin and is then demoted
 * keeps the rows and loses the override), and it is the exact failure
 * `lessons/store.ts:168` warns a windowed `listSessions` would manufacture for
 * everyone.
 *
 * THE FIX IS NOT A LOOSENING — the distinction this file lives or dies on. A
 * rung is credited by ITS OWN persisted attempt row and by nothing else, and
 * that row exists only because the save action already accepted the rung as
 * open at the time. Nobody is credited for a rung they never drove; the second
 * describe() below is the counter-direction and fails the moment that stops
 * being true.
 */

import { describe, expect, it } from "vitest";
import {
  isScenarioLevelUnlocked,
  scenarioLevelProgress,
  type ScenarioAttemptRow,
} from "../progress";
import { SC_PARK_PERP_REV } from "../templates";

const row = (level: number, stars: number | null): ScenarioAttemptRow => ({
  lessonId: `sc-park-perp-rev@L${level}`,
  rubricStars: stars,
});

describe("a rung the student has driven is never reported shut", () => {
  /** Measured on SC_PARK_PERP_REV (authors L1..L5) — the P0 five-rung ladder. */
  it("PASSED ⇒ UNLOCKED, with no rung below it attempted", () => {
    const p = scenarioLevelProgress(SC_PARK_PERP_REV, [row(4, 3)]);
    const l4 = p.find((l) => l.level === 4)!;

    expect(l4.attempts).toBe(1);
    expect(l4.bestStars).toBe(3);
    expect(l4.passed).toBe(true);
    // The whole point: before the fix this was `false` — 🔒 over a 3★ pass.
    expect(l4.unlocked).toBe(true);
    expect(l4.unlockedBy).toBe("played");
  });

  it("opens the driven rung WITHOUT opening the ones under it", () => {
    // The exact shape, because both halves matter and they pull opposite ways.
    // Before: [open, shut, shut, SHUT, open] — L5 open off L4's own attempt
    // while L4 was shut. After: L4 joins L5. L2 and L3 STAY SHUT — nothing
    // attests for them, and „he got past L4 somehow" is not evidence about L2.
    expect(
      scenarioLevelProgress(SC_PARK_PERP_REV, [row(4, 3)]).map((l) => [
        l.level,
        l.unlocked,
      ]),
    ).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, true],
      [5, true],
    ]);
  });

  it("the ONE state the fold must never emit: passed on a shut rung", () => {
    // Swept over every rung × every star value, because the contradiction was
    // never about one row — it was about which question the fold forgot to ask.
    for (const level of [1, 2, 3, 4, 5]) {
      for (const stars of [null, 1, 2, 3] as const) {
        const rows = [row(level, stars)];
        for (const l of scenarioLevelProgress(SC_PARK_PERP_REV, rows)) {
          const where = `L${level}@${stars}★ → rung ${l.level}`;
          if (l.passed) expect(l.unlocked, where).toBe(true);
          if (l.attempts > 0) expect(l.unlocked, where).toBe(true);
        }
      }
    }
  });

  it("the SAVE gate agrees, so a re-drive is no longer refused LEVEL_LOCKED", () => {
    // actions.ts:154 → isScenarioLevelUnlocked → `{ ok: false, code:
    // "LEVEL_LOCKED" }`, i.e. a completed drive thrown away on save.
    expect(isScenarioLevelUnlocked(SC_PARK_PERP_REV, 4, [row(4, 3)])).toBe(true);
    // …and an attempt with no stars at all is still the student's own drive.
    expect(isScenarioLevelUnlocked(SC_PARK_PERP_REV, 3, [row(3, null)])).toBe(true);
  });

  it("does not rename the reason on any rung that already had one", () => {
    // „played" is reported LAST — behind first/stars/attempt — so every rung
    // that was already open keeps the reason the catalog prints for it.
    const ladder = scenarioLevelProgress(SC_PARK_PERP_REV, [
      row(1, 3),
      row(2, 2),
      row(3, 1),
    ]);
    expect(ladder.map((l) => l.unlockedBy)).toEqual([
      "first", // L1
      "stars", // L2 — L1 took 3★
      "stars", // L3 — L2 took 2★
      "attempt", // L4 — L3 was driven at 1★
      null, // L5 — L4 never driven
    ]);
  });
});

describe("…and nobody is credited for a rung they never drove", () => {
  it("a virgin rung above a virgin rung stays shut", () => {
    const fresh = scenarioLevelProgress(SC_PARK_PERP_REV, []);
    expect(fresh.map((l) => l.unlocked)).toEqual([true, false, false, false, false]);
    expect(fresh.filter((l) => l.unlockedBy === "played")).toHaveLength(0);
  });

  it("a row for ANOTHER template never opens this template's rung", () => {
    const foreign: ScenarioAttemptRow[] = [
      { lessonId: "sc-other-template@L4", rubricStars: 3 },
      { lessonId: "l7-parking", rubricStars: 3 },
    ];
    const p = scenarioLevelProgress(SC_PARK_PERP_REV, foreign);
    expect(p.map((l) => l.unlocked)).toEqual([true, false, false, false, false]);
    expect(isScenarioLevelUnlocked(SC_PARK_PERP_REV, 4, foreign)).toBe(false);
  });

  it("a rung the template does not author is never invented", () => {
    // sc-pk-busstop-ban stops at L4 by review (lane15-parking-depth).
    const spec = { id: "sc-park-perp-rev", levels: SC_PARK_PERP_REV.levels.slice(0, 3) };
    const p = scenarioLevelProgress(spec, [row(4, 3), row(5, 3)]);
    expect(p.map((l) => l.level)).toEqual([1, 2, 3]);
    expect(p.map((l) => l.unlocked)).toEqual([true, false, false]);
    expect(isScenarioLevelUnlocked(spec, 4, [row(4, 3)])).toBe(false);
  });
});
