import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  overlayCarriesMoment,
  overlayMomentBg,
  OVERLAY_MOMENT_NOW_MAX_MS,
  whyIsReachable,
  WHY_REACHABLE_MIN_VISIBLE_FRACTION,
  hasWhy,
  itemEchoesLine,
  requiresWhy,
  type SimOverlayItem,
  type SimOverlayKind,
} from "../overlayQueue";

/**
 * =============================================================================
 * TWO THINGS THE PHONE'S CARD COULD NOT SAY, AND ONE INSTRUMENT THAT SAID
 * EVERYTHING WAS FINE.  Sweep 161, 2026-08-19.
 * =============================================================================
 *
 * (1) NO MOMENT — §2.6 O33, filed against this file by a lane that could not
 *     reach into it. `sc-sp-curve/mobile-wrong/04-t030s.png` (iPhone 16
 *     landscape) was opened: «Превишена скорост — Движеше се над разрешената
 *     скорост…» stands at the top right, the cluster beneath it reads 18 км/ч
 *     and the В26 disc beside it reads 90. The car was at 96 км/ч six seconds
 *     earlier. The card is telling the truth about a moment that has gone and
 *     nothing on the glass says which. The desktop leg has printed «преди 8 с»
 *     since the toast-moment lane landed; the phone leg re-maps each toast into
 *     a `SimOverlayItem`, and that shape carried no moment, so the stamp died at
 *     the boundary.
 *
 * (2) AN EXPLANATION NOBODY CAN READ — five frames, one shape. `hasWhy` asks
 *     „is there an authored `detailBg`" and is read as „can the student read
 *     it". Those came apart when the peek acquired a fold. Every frame below
 *     returns `hasWhy === true`:
 *
 *       sc-merge-motorway-exit/mobile-right/01-arrival   ↓ ОЩЕ 39 РЕДА
 *       sc-zebra-approach/mobile-right/04-t087s          ↓ ОЩЕ 15 РЕДА
 *       sc-crossing-dart/mobile-right/01-arrival         ↓ ОЩЕ 15 РЕДА
 *       sc-sp-curve/mobile-wrong/04-t129s                ↓ ОЩЕ  8 РЕДА
 *       sc-speed-transition/mobile-wrong/04-t018s        ↓ ОЩЕ  3 РЕДА
 *
 *     The zebra frame decides it: the peek prints one full line, step 2 in
 *     grey, then HALF of step 3 at ~50 % opacity across the face of the
 *     pedestrian-crossing sign it is about. Step 3 is the stop rule the lesson
 *     GRADES. A student can be convicted of breaking a rule the card cut in
 *     half, and every THEO-4 instrument in the tree called the card clean.
 *     That is an instrument lying in the reassuring direction, which is the
 *     first failure mode this programme's rules name.
 */

const item = (over: Partial<SimOverlayItem> = {}): SimOverlayItem => ({
  id: "x",
  kind: "violation",
  tone: "danger",
  lineBg: "Превишена скорост",
  detailBg: "Движеше се над разрешената скорост. Ограничението е таван, не цел.",
  ...over,
});

describe("the phone's card can carry the moment its verdict is about", () => {
  it("prints an age once the field is stamped — the O33 frame", () => {
    // 96 км/ч six seconds before the frame; the card now says so.
    expect(overlayMomentBg(item({ raisedAtMs: 1_000 }), 7_000)).toBe("преди 6 с");
  });

  it("says «сега» inside the band, and the band is the toast's own", () => {
    expect(overlayMomentBg(item({ raisedAtMs: 1_000 }), 1_000)).toBe("сега");
    expect(overlayMomentBg(item({ raisedAtMs: 1_000 }), 2_999)).toBe("сега");
    expect(overlayMomentBg(item({ raisedAtMs: 1_000 }), 3_001)).toBe("преди 2 с");
  });

  it("prints NOTHING when there is no stamp — the state every item ships in", () => {
    // The direction matters: inventing «сега» for an unstamped card would date a
    // fault that may be a minute old, i.e. reproduce the defect wearing the
    // costume of its fix.
    expect(overlayMomentBg(item(), 7_000)).toBeNull();
    expect(overlayMomentBg(item({ raisedAtMs: Number.NaN }), 7_000)).toBeNull();
  });

  it("a clock that ran backwards is uninformative, never wrong", () => {
    // `HudToasts.toastAgeBg` chose «сега» over a negative or a future age for a
    // mid-drive system-time change. Same choice here, or the two legs would
    // describe one event differently.
    expect(overlayMomentBg(item({ raisedAtMs: 9_000 }), 1_000)).toBe("сега");
    expect(overlayMomentBg(item({ raisedAtMs: 1_000 }), Number.NaN)).toBe("сега");
  });

  it("MUTATION — the seconds are ROUNDED, and floor would have been visible", () => {
    // `toastAgeBg` uses `Math.round`. A `Math.floor` here reads 7 where the
    // desktop reads 8 for the same fault on the same drive — the exact drift
    // this module has been burned by twice. 7 600 ms is the witness: round → 8,
    // floor → 7.
    expect(overlayMomentBg(item({ raisedAtMs: 0 }), 7_600)).toBe("преди 8 с");
    expect(Math.floor(7_600 / 1_000)).toBe(7); // what the wrong operator gives
  });

  it("the bands are pinned against `HudToasts.tsx` itself, not against memory", () => {
    // Copied by value (importing a .tsx client component into this pure leaf
    // would drag React into the selector), so the copy has to be checked
    // against the original on every run or it is just a second opinion.
    const toasts = fs
      .readFileSync(
        path.join(process.cwd(), "src", "modules", "sim", "hud", "HudToasts.tsx"),
        "utf8",
      )
      .replace(/\r\n/g, "\n");
    const band = toasts.match(/TOAST_AGE_NOW_MAX_MS\s*=\s*(\d+)/);
    expect(band).not.toBeNull();
    expect(Number(band?.[1])).toBe(OVERLAY_MOMENT_NOW_MAX_MS);
    // …and the operator, which is the half a constant check cannot see.
    expect(toasts).toContain("`преди ${Math.round(ms / 1000)} с`");
  });

  it("only the kinds that state a verdict about a past moment carry one", () => {
    // `toastCarriesAge` in this file's vocabulary. A dated task line or a dated
    // «Браво» would be furniture; a teach moment freezes the drive as it fires,
    // so there is no elapsed time to be wrong about.
    expect(overlayCarriesMoment("violation")).toBe(true);
    expect(overlayCarriesMoment("hint")).toBe(true);
    for (const k of ["task", "praise", "legend", "advisor", "predrive", "teach"] as const) {
      expect(overlayCarriesMoment(k satisfies SimOverlayKind)).toBe(false);
    }
  });
});

describe("THEO-4 can now see the fold that was hiding the graded rule", () => {
  it("`hasWhy` still says the zebra card is fine — the instrument is narrow, not broken", () => {
    // Stated as an assertion so nobody 'fixes' `hasWhy` into something quieter.
    // It measures what it always measured; the repair is the second predicate.
    const zebra = item({ kind: "hint", detailBg: "1. …\n2. …\n3. Спри на 5 метра преди…" });
    expect(hasWhy(zebra)).toBe(true);
  });

  it("…and `whyIsReachable` says it is not, on the frame's own numbers", () => {
    // 15 lines behind a peek printing about 2.5. 2.5 / 17.5 = 14 %.
    const zebra = item({ kind: "hint" });
    expect(whyIsReachable(zebra, { visibleLines: 2.5, detailLines: 17.5 })).toBe(false);
    // The other four frames, same reading.
    expect(whyIsReachable(item(), { visibleLines: 3, detailLines: 42 })).toBe(false); // 39 hidden
    expect(whyIsReachable(item(), { visibleLines: 2, detailLines: 17 })).toBe(false); // 15 hidden
    expect(whyIsReachable(item(), { visibleLines: 2, detailLines: 10 })).toBe(false); //  8 hidden
  });

  it("FALSE REFUSAL — a shallow fold and an unfolded card both PASS", () => {
    // A predicate that failed everything would be switched off within a round
    // and the graded step would go back behind the fold unnoticed. This is the
    // half that costs exactly as much as the false pass.
    expect(whyIsReachable(item(), { visibleLines: 5, detailLines: 8 })).toBe(true);
    expect(whyIsReachable(item(), { visibleLines: 9, detailLines: 9 })).toBe(true);
    expect(whyIsReachable(item(), { visibleLines: 40, detailLines: 3 })).toBe(true);
    // Exactly on the floor is reachable — the fold may hide as much as it shows,
    // never more.
    expect(whyIsReachable(item(), { visibleLines: 5, detailLines: 10 })).toBe(true);
    expect(whyIsReachable(item(), { visibleLines: 4.99, detailLines: 10 })).toBe(false);
  });

  it("items that owe no WHY are exempt, exactly as `hasWhy` exempts them", () => {
    // Praise, a task line and the ribbon legend are not verdicts. If they were
    // graded here, every clean frame in the catalogue would fail and the alarm
    // would be worthless.
    for (const kind of ["praise", "task", "legend", "predrive", "advisor"] as const) {
      expect(requiresWhy(kind)).toBe(false);
      expect(whyIsReachable(item({ kind, detailBg: null }), {
        visibleLines: 0,
        detailLines: 99,
      })).toBe(true);
    }
  });

  it("a card that owes a WHY and has none fails, fold or no fold", () => {
    expect(whyIsReachable(item({ detailBg: null }), { visibleLines: 99, detailLines: 0 })).toBe(
      false,
    );
    expect(whyIsReachable(item({ detailBg: "   " }), { visibleLines: 99, detailLines: 0 })).toBe(
      false,
    );
  });

  it("an unreadable count is FALSE — the direction that cannot credit a guess", () => {
    // A surface that cannot say how much it is showing has not shown that the
    // explanation arrived. `hasWhy`'s own NaN discipline, pointed the same way.
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(whyIsReachable(item(), { visibleLines: bad, detailLines: 10 })).toBe(false);
      expect(whyIsReachable(item(), { visibleLines: 3, detailLines: bad })).toBe(false);
    }
    expect(whyIsReachable(item(), { visibleLines: -1, detailLines: 10 })).toBe(false);
  });

  it("MUTATION — the floor is a RATIO, not a line count", () => {
    // The cheapest wrong implementation is „fail when more than N lines are
    // hidden". Drive two cases that share a hidden count and differ in ratio:
    // both hide 5 lines, one shows 1 and one shows 20.
    expect(whyIsReachable(item(), { visibleLines: 1, detailLines: 6 })).toBe(false);
    expect(whyIsReachable(item(), { visibleLines: 20, detailLines: 25 })).toBe(true);
    // …and two that share a RATIO and differ wildly in count, to prove the
    // converse: a constant-count rule would split these, the ratio does not.
    expect(whyIsReachable(item(), { visibleLines: 2, detailLines: 4 })).toBe(true);
    expect(whyIsReachable(item(), { visibleLines: 50, detailLines: 100 })).toBe(true);
    expect(WHY_REACHABLE_MIN_VISIBLE_FRACTION).toBe(0.5);
  });
});

describe("the no-echo rule is now a predicate over any card, not a briefing convention", () => {
  it("catches the shape that produced the founder's «two copies, both cut»", () => {
    // `briefingBodyBg` used to hand back the WHOLE list including step 1, so the
    // card printed 219 characters bold and then again grey-prefixed „1. ".
    expect(itemEchoesLine({ lineBg: "Потегли по улицата", detailBg: "1. Потегли по улицата\n2. …" })).toBe(true);
    expect(itemEchoesLine({ lineBg: "Потегли по улицата", detailBg: "Потегли по улицата и спри" })).toBe(true);
  });

  it("FALSE REFUSAL — a real elaboration is not an echo", () => {
    // The direction that would delete teaching. A body that merely SHARES words
    // with the line, or that starts somewhere else, must pass.
    expect(itemEchoesLine({ lineBg: "Превишена скорост", detailBg: "Ограничението е таван, не цел." })).toBe(false);
    // A numbered body whose FIRST step is a different sentence is the ordinary
    // briefing shape and must pass. (Written the other way round first — with
    // „2. Превишена скорост е…" — and the predicate was right and the case was
    // wrong: a body that opens by repeating the line IS the echo, whatever
    // number is glued to the front of it. Kept as the positive below.)
    expect(itemEchoesLine({ lineBg: "Превишена скорост", detailBg: "2. Вдигни крак от газта." })).toBe(false);
    expect(itemEchoesLine({ lineBg: "Превишена скорост", detailBg: "2. Превишена скорост е…" })).toBe(true);
    expect(itemEchoesLine({ lineBg: "Спри", detailBg: "" })).toBe(false);
    expect(itemEchoesLine({ lineBg: "", detailBg: "Спри" })).toBe(false);
  });

  it("case and outer whitespace are normalised — the vp-readiness pair", () => {
    // The frame: chip «Мини контролната зона с готов кокпит», box the same
    // sentence with „— дръж под 50 км/ч" appended. A prefix repeat is an echo
    // however the qualifier is punctuated.
    expect(itemEchoesLine({ lineBg: " Мини зоната ", detailBg: "мини зоната — дръж под 50" })).toBe(true);
    expect(itemEchoesLine({ lineBg: "Мини зоната", detailBg: "Мини зоната." })).toBe(true);
  });

  it("MUTATION — the repeat must END where the line ends", () => {
    /**
     * THE ASSERTION THIS BLOCK REPLACED GUARDED NOTHING, and that is recorded
     * rather than quietly corrected. It claimed „punctuation is not
     * normalised"; the function was then mutated to strip punctuation as well
     * and all eighteen tests stayed green — a test that passes equally before
     * and after. Chasing why exposed a real defect in the predicate: written as
     * a bare `startsWith`, it called «Спринтирай към целта» an echo of «Спри».
     * That is this predicate committing the false refusal it exists to prevent,
     * on a card whose body is a genuine elaboration.
     *
     * So the boundary is the rule, and this pair is the witness: both bodies
     * open with the same five characters and only one of them repeats the line.
     * Deleting the boundary check flips the second.
     */
    expect(itemEchoesLine({ lineBg: "Спри", detailBg: "Спри и се огледай" })).toBe(true);
    expect(itemEchoesLine({ lineBg: "Спри", detailBg: "Спринтирай към целта" })).toBe(false);
    // The same shape one word in, so the rule is not an artefact of the line
    // being a single short word.
    expect(itemEchoesLine({ lineBg: "Мини зоната", detailBg: "Мини зоната бавно" })).toBe(true);
    expect(itemEchoesLine({ lineBg: "Мини зона", detailBg: "Мини зоната бавно" })).toBe(false);
  });
});

describe("the field is declared here and NOT yet spent, which is asserted rather than hoped", () => {
  it("`SimOverlayItem` carries `raisedAtMs` and the phone card still does not print it", () => {
    /**
     * O33 asked for exactly this field, in these words: „so that whoever adds
     * the field to `SimOverlayItem` is told this file wants it."
     *
     * The two edits that SPEND it are both outside this lane and both are named
     * so neither can be lost — the shell's re-map (`LessonPlayShell.tsx`) and
     * the phone card's last row (`SimOverlay.tsx`). This block asserts the
     * CURRENT state of both, so it goes red the moment either lands and whoever
     * lands it inverts it in the same commit. A row parked in prose is a row
     * nobody finds again; this one fails.
     */
    const src = fs
      .readFileSync(
        path.join(process.cwd(), "src", "modules", "sim", "hud", "overlayQueue.ts"),
        "utf8",
      )
      .replace(/\r\n/g, "\n");
    expect(src).toMatch(/^\s*raisedAtMs\?: number;$/m);

    const overlay = fs
      .readFileSync(
        path.join(process.cwd(), "src", "modules", "sim", "hud", "SimOverlay.tsx"),
        "utf8",
      )
      .replace(/\r\n/g, "\n");
    // ← inverts when the phone card starts printing the age.
    expect(overlay).not.toContain("overlayMomentBg");
  });
});
