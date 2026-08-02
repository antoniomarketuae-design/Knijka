import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hudToastCarriesWhy,
  parseStoredFlag,
  quietSuppresses,
  serializeFlag,
  shouldShowDebrief,
  shouldShowEndBar,
  toastCapacity,
  toastColumnFraction,
  visibleToasts,
  QUIET_SUPPRESSED_KINDS,
  ROOMY_MIN_WIDTH_PX,
  SESSION_END_AUTO_DEFAULT,
  SESSION_END_AUTO_STORAGE_KEY,
  SESSION_END_SKIP_HINT_BG,
  TOAST_CARD_WIDTH_CLASS,
  TOAST_CARD_WIDTH_PX,
  TOAST_COLUMN_MAX_FRACTION,
  TOAST_MAX_VISIBLE,
  TOAST_QUIET_DEFAULT,
  TOAST_QUIET_MAX_VISIBLE,
  TOAST_QUIET_STORAGE_KEY,
  type DebriefVisibility,
} from "../hudPreferences";

/**
 * DOC 86 · L14 + L15 — the DESKTOP half of the notification rework.
 *
 * The mobile wave (overlayQueue.ts, 2026-07-29) fixed phones and left the roomy
 * path untouched. Doc 86 L14 measured what was still shipping on the surface
 * the founder actually reviewed on:
 *
 *                                        BEFORE            AFTER
 *   toast column pointer events          none (:161)       cards auto, wrapper none
 *   cards clickable away                 no                yes (<button>, whole card)
 *   max stacked cards                    4                 2  (1 in quiet mode)
 *   card width                           288 px (w-72)     240 px (w-60)
 *   worst-case card width on screen      288 px            240 px
 *   worst-case COLUMN area, 1280×720     4 × 288 px wide   2 × 240 px wide
 *   width share at the narrowest roomy
 *     frame (641 px, isCompactViewport)  44.9 %            37.4 %
 *   user setting to quieten them         none              „По-тихи известия" (persisted)
 *   end-of-lesson popup: Space skips     no handler at all yes (capture phase)
 *   end-of-lesson popup: visible note    none              „Space = пропусни"
 *   end-of-lesson popup: turn it off     none              persisted, opt-out
 *
 * There is no DOM environment in this suite (vitest.config.ts `environment:
 * "node"`), so the behaviour is split in two on purpose: everything decidable
 * is a pure function tested directly, and the JSX that consumes it is held to
 * the contract by reading the source — the `checkControl.test.ts` precedent.
 */

const SRC = resolve(__dirname, "..");
const TOASTS = readFileSync(resolve(SRC, "HudToasts.tsx"), "utf8");
const END_SCREEN = readFileSync(resolve(SRC, "SessionEndScreen.tsx"), "utf8");
const SHELL = readFileSync(
  resolve(SRC, "../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
  "utf8",
);

/**
 * Comments in these files quote the BEFORE state on purpose („every card
 * `w-72`") — a source assertion about what still ships has to read the code,
 * not the history lesson above it.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
const TOASTS_CODE = code(TOASTS);

type Toast = { id: number; event: { kind: string } };
const toast = (id: number, kind: string): Toast => ({ id, event: { kind } });

// ---------------------------------------------------------------------------
// L14 — the column budget
// ---------------------------------------------------------------------------

describe("L14 · the roomy toast column is capped and narrow", () => {
  it("shows two cards, not the four the founder reviewed", () => {
    expect(TOAST_MAX_VISIBLE).toBe(2);
    expect(TOAST_QUIET_MAX_VISIBLE).toBe(1);
    expect(toastCapacity(false)).toBe(2);
    expect(toastCapacity(true)).toBe(1);
  });

  it("clips an eight-deep burst to the capacity, newest first", () => {
    const burst = [5, 4, 3, 2, 1, 0].map((i) => toast(i, "violation"));
    const shown = visibleToasts(burst, false);
    expect(shown).toHaveLength(2);
    expect(shown.map((t) => t.id)).toEqual([5, 4]);
    expect(visibleToasts(burst, true).map((t) => t.id)).toEqual([5]);
  });

  it("is 240 px wide, not 288 — and the class matches the number", () => {
    expect(TOAST_CARD_WIDTH_PX).toBe(240);
    // `w-60` = 60 × 4 px = 240 px. The rest of the string is the viewport clamp
    // and the word-break added for the founder's clipped-card photo — see
    // `__tests__/hud-card-fit.test.ts`, which owns those two assertions.
    expect(TOAST_CARD_WIDTH_CLASS.split(" ")).toContain("w-60");
  });

  it("fits the width budget at the narrowest roomy frame — the old width did not", () => {
    // isCompactViewport sends ≤ 640 px wide to the compact grammar, so 641 is
    // the worst case a roomy toast has to live in.
    expect(ROOMY_MIN_WIDTH_PX).toBe(641);
    const after = toastColumnFraction(ROOMY_MIN_WIDTH_PX);
    expect(after).toBeCloseTo(0.3744, 4);
    expect(after).toBeLessThan(TOAST_COLUMN_MAX_FRACTION);
    // The shipped-before number, for the record: 288 / 641 = 0.4493 — over.
    expect(288 / ROOMY_MIN_WIDTH_PX).toBeGreaterThan(TOAST_COLUMN_MAX_FRACTION);
  });
});

// ---------------------------------------------------------------------------
// L14 — THEO-4: quiet mode drops praise, never a teaching card
// ---------------------------------------------------------------------------

describe("L14 · quiet mode never silences the WHY (THEO-4)", () => {
  it("suppresses nothing that carries an authored explanation", () => {
    for (const kind of QUIET_SUPPRESSED_KINDS) {
      expect(hudToastCarriesWhy(kind)).toBe(false);
    }
  });

  it("keeps violations and teach cards in quiet mode", () => {
    expect(hudToastCarriesWhy("violation")).toBe(true);
    expect(hudToastCarriesWhy("lesson")).toBe(true);
    expect(quietSuppresses("violation", true)).toBe(false);
    expect(quietSuppresses("lesson", true)).toBe(false);
    expect(quietSuppresses("commendation", true)).toBe(true);
    expect(quietSuppresses("commendation", false)).toBe(false);
  });

  it("a quiet run of praise + a mistake still shows the mistake", () => {
    const queue = [toast(3, "commendation"), toast(2, "commendation"), toast(1, "violation")];
    expect(visibleToasts(queue, true).map((t) => t.event.kind)).toEqual(["violation"]);
    // …and normal mode shows the two newest, praise included.
    expect(visibleToasts(queue, false).map((t) => t.id)).toEqual([3, 2]);
  });
});

// ---------------------------------------------------------------------------
// L14 — the component honours the contract
// ---------------------------------------------------------------------------

describe("L14 · HudToasts.tsx implements it", () => {
  it("no card is 288 px wide any more, and none hard-codes a cap of 4", () => {
    expect(TOASTS_CODE).not.toMatch(/\bw-72\b/);
    expect(TOASTS_CODE).not.toMatch(/MAX_VISIBLE\s*=\s*4/);
  });

  it("the card is a real button with an accessible name, not an inert div", () => {
    expect(TOASTS).toMatch(/aria-label="Скрий известието"/);
    expect(TOASTS).toMatch(/pointer-events-auto/);
    // …and the wrapper stays inert so the column never eats a click on the road.
    expect(TOASTS).toMatch(/pointer-events-none flex flex-col items-end/);
  });

  it("the queue exposes a per-card dismiss, and the column a clear-all", () => {
    expect(TOASTS).toMatch(/dismiss:\s*\(id: number\) => void/);
    expect(TOASTS).toMatch(/Изчисти известията/);
  });

  it("the cap and the width come from the pure module, not from a literal", () => {
    expect(TOASTS).toMatch(/TOAST_CARD_WIDTH_CLASS/);
    expect(TOASTS).toMatch(/visibleToasts\(toasts, quiet\)/);
  });

  it("does NOT bind Space — that is the parking brake while the car moves", () => {
    // engine/input.ts:223. A toast fires mid-drive; SimOverlay may hijack Space
    // only because it does so while a blocking item holds the car still.
    expect(TOASTS_CODE).not.toMatch(/addEventListener\(\s*"keydown"/);
    expect(TOASTS_CODE).not.toMatch(/e\.code === "Space"/);
  });

  it("the shell passes the dismiss handlers and the setting through", () => {
    expect(SHELL).toMatch(/<HudToasts[\s\S]{0,240}?onDismiss=\{dismiss\}/);
    expect(SHELL).toMatch(/<HudToasts[\s\S]{0,240}?onDismissAll=\{clear\}/);
    expect(SHELL).toMatch(/<HudToasts[\s\S]{0,240}?quiet=\{toastsQuiet\}/);
    // …and there is a visible control for it in the roomy top bar.
    expect(SHELL).toMatch(/Известия \{toastsQuiet \? "тихо" : "нормално"\}/);
  });
});

// ---------------------------------------------------------------------------
// L15 — the end-of-lesson popup
// ---------------------------------------------------------------------------

const base: DebriefVisibility = {
  ended: true,
  compact: false,
  expanded: false,
  skipped: false,
  autoOpen: true,
  held: false,
};

describe("L15 · when the debrief opens", () => {
  it("nothing shows before the session ends", () => {
    expect(shouldShowDebrief({ ...base, ended: false })).toBe(false);
    expect(shouldShowEndBar({ ...base, ended: false })).toBe(false);
  });

  it("roomy still auto-opens by default — this is an opt-out, not an opt-in", () => {
    expect(SESSION_END_AUTO_DEFAULT).toBe(true);
    expect(TOAST_QUIET_DEFAULT).toBe(false);
    expect(shouldShowDebrief(base)).toBe(true);
    expect(shouldShowEndBar(base)).toBe(false);
  });

  it("a skip closes it for this run only", () => {
    const skipped = { ...base, skipped: true };
    expect(shouldShowDebrief(skipped)).toBe(false);
    expect(shouldShowEndBar(skipped)).toBe(true);
    // …and „Виж разбора" (expanded) beats the skip.
    expect(shouldShowDebrief({ ...skipped, expanded: true })).toBe(true);
  });

  it("the setting stops it opening itself, for good", () => {
    const off = { ...base, autoOpen: false };
    expect(shouldShowDebrief(off)).toBe(false);
    expect(shouldShowEndBar(off)).toBe(true);
    expect(shouldShowDebrief({ ...off, expanded: true })).toBe(true);
  });

  it("compact is untouched: tap-to-open, and never the roomy end bar", () => {
    for (const autoOpen of [true, false]) {
      for (const skipped of [true, false]) {
        const v = { ...base, compact: true, autoOpen, skipped, held: false };
        expect(shouldShowDebrief(v)).toBe(false);
        expect(shouldShowDebrief({ ...v, expanded: true })).toBe(true);
        expect(shouldShowEndBar(v)).toBe(false);
      }
    }
  });

  it("I1: the calibration gate outranks the setting — it is a required step", () => {
    // Without this, a student who once switched the popup off would silently
    // never be asked to self-assess again, and the end bar would summarise a
    // verdict the gate exists to hide.
    const held = { ...base, held: true, autoOpen: false, skipped: true };
    expect(shouldShowDebrief(held)).toBe(true);
    expect(shouldShowEndBar(held)).toBe(false);
  });

  it("THEO-4: on a roomy ended session exactly one of the two is on screen", () => {
    // The bar is the complement of the popup, so there is no state in which an
    // ended roomy session shows neither — i.e. no state in which the student is
    // left with a score and no route to the law-cited explanation.
    for (const expanded of [true, false]) {
      for (const skipped of [true, false]) {
        for (const autoOpen of [true, false]) {
          for (const held of [true, false]) {
            const v = { ...base, expanded, skipped, autoOpen, held };
            expect(shouldShowDebrief(v) !== shouldShowEndBar(v)).toBe(true);
          }
        }
      }
    }
  });
});

describe("L15 · SessionEndScreen.tsx implements the founder's three asks", () => {
  it("1 — Space (and Enter) activates Skip", () => {
    expect(END_SCREEN).toMatch(/e\.code !== "Space" && e\.key !== "Enter"/);
    // CAPTURE phase + stopPropagation, or the cabin's bubble-phase listener
    // yanks the parking brake on the way past (engine/input.ts:223).
    expect(END_SCREEN).toMatch(/addEventListener\("keydown", onKey, true\)/);
    expect(END_SCREEN).toMatch(/e\.stopPropagation\(\)/);
    // A focused control keeps its own activation.
    expect(END_SCREEN).toMatch(/tag === "BUTTON" \|\| tag === "A"/);
  });

  it("2 — the note is rendered, and it names the key", () => {
    expect(SESSION_END_SKIP_HINT_BG).toBe("Space = пропусни");
    expect(END_SCREEN).toMatch(/SESSION_END_SKIP_HINT_BG/);
    expect(END_SCREEN).toMatch(/<kbd/);
    expect(END_SCREEN).toMatch(/aria-keyshortcuts="Space"/);
    expect(END_SCREEN).toMatch(/Пропусни разбора/);
  });

  it("3 — the note carries the button that turns the popup off", () => {
    expect(END_SCREEN).toMatch(/Не показвай автоматично/);
    expect(END_SCREEN).toMatch(/onAutoOpenChange\(!autoOpen\)/);
    // …and says where the debrief went, so switching it off is not a THEO-4
    // trade („Виж разбора" is the bar the shell renders instead).
    expect(END_SCREEN).toMatch(/Виж разбора/);
  });

  it("the shell persists both settings under versioned keys", () => {
    expect(TOAST_QUIET_STORAGE_KEY).toBe("aidrive.sim.toasts.quiet.v1");
    expect(SESSION_END_AUTO_STORAGE_KEY).toBe("aidrive.sim.sessionEnd.auto.v1");
    expect(SHELL).toMatch(/readStoredFlag\(TOAST_QUIET_STORAGE_KEY, TOAST_QUIET_DEFAULT\)/);
    expect(SHELL).toMatch(
      /readStoredFlag\(SESSION_END_AUTO_STORAGE_KEY, SESSION_END_AUTO_DEFAULT\)/,
    );
    expect(SHELL).toMatch(/writeStoredFlag\(TOAST_QUIET_STORAGE_KEY, next\)/);
    expect(SHELL).toMatch(/writeStoredFlag\(SESSION_END_AUTO_STORAGE_KEY, next\)/);
  });

  it("the shell renders the end bar with a route to the explanation", () => {
    expect(SHELL).toMatch(/endBarVisible && result/);
    expect(SHELL).toMatch(/data-hud="end-bar"[\s\S]{0,2400}?Виж разбора/);
    // A fresh attempt clears the skip; only the persisted setting outlives a run.
    expect(SHELL).toMatch(/setEndSkipped\(false\)/);
  });

  it("the popup condition is the pure predicate, not an inline boolean", () => {
    expect(SHELL).toMatch(/const debriefOpen = shouldShowDebrief\(debriefVisibility\)/);
    expect(SHELL).toMatch(/\{debriefOpen && result \?/);
    // The pre-L15 condition is gone.
    expect(SHELL).not.toMatch(/ended && result && \(!compact \|\| endExpanded\)/);
  });
});

// ---------------------------------------------------------------------------
// Storage plumbing
// ---------------------------------------------------------------------------

describe("persisted flags round-trip and reject junk", () => {
  it("round-trips", () => {
    expect(parseStoredFlag(serializeFlag(true))).toBe(true);
    expect(parseStoredFlag(serializeFlag(false))).toBe(false);
  });

  it("null for anything the app did not write", () => {
    for (const junk of [null, undefined, "", "true", "1", 1, {}, "ON"]) {
      expect(parseStoredFlag(junk)).toBeNull();
    }
  });
});
