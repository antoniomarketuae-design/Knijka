/**
 * =============================================================================
 * THE PHONE MUST ALWAYS BE ABLE TO REACH THE INSTRUCTIONS — THEO-4, the other
 * half of founder ruling 2026-09-20.
 * =============================================================================
 *
 * The ruling is «…taking alot of space on the screen so we have to hide it and
 * make it optional if the user wants it on», and its condition is stated with
 * it: HIDING THE CARD MUST NOT HIDE THE INSTRUCTIONS — the panel/sheet still
 * carries them and the setting stays discoverable. `briefing-auto-open.test.ts`
 * holds the hiding half and pins the two МЕНЮ rows that are the phone's way
 * back. This file holds the half that nothing held: that the way back still
 * WORKS on the second asking.
 *
 * ── WHAT WAS MEASURED (a0a3ac7, w61 sweep, `*mobile-right/run.log`) ─────────
 *
 *   1. `[data-hud="briefing-recall"]` — the «ⓘ Инструкции · N стъпки ▸» pill —
 *      is HELD BUT NOT PAINTED on every mobile leg. It is a child of the SHELL's
 *      notify column, and that column carries `hidden` on compact. It is the
 *      ROOMY leg's recall and always was; the shell says so through
 *      `briefingRecallPillShown`.
 *
 *   2. So the phone's ONLY painted route is the МЕНЮ row «Инструкции · N
 *      стъпки» (`recallBriefing`). And that row died after ONE ✕: the recalled
 *      PEEK was non-blocking, so it painted a ✕; `SimOverlay.dismiss()` kept a
 *      private record of it that `recallBriefing` could not reach; the second
 *      recall offered the item and nothing appeared.
 *
 * ── WHAT CHANGED 2026-10-08, AND WHY HALF OF THIS FILE WENT WITH IT ─────────
 *
 * The repair of (2) was a RE-OFFER KEY: the ✕ always clears the card, and an
 * owner that offers the same item again bumps the key it was stamped under.
 * That rule is still the overlay's and is still driven below — the rig's ✕, the
 * pure predicate, `recallPreDriveOverlay`.
 *
 * What is gone is the BRIEFING's use of it, because the surface that had the ✕
 * is gone: sc-vu-emergency:2e634d4d closed with the phone's briefing as the
 * read sheet from its first frame (`briefingSheetItem`; no peek, ONE exit,
 * «Разбрах»). A sheet-only item paints no dismiss control, so neither the
 * shell's `dismissedOverlayIds` nor `SimOverlay`'s private record can hold its
 * id, and `recallBriefing` no longer undoes two things that cannot happen. The
 * seven cases that drove „✕, then recall" on the briefing are replaced by the
 * ones below, which drive the session the product now has — and by
 * `briefing-sheet.test.tsx`, which reads the absence of that ✕ off the glass.
 *
 * ── WHY THIS FILE IS NOT ANOTHER SOURCE GREP ────────────────────────────────
 *
 * Because a grep is what let the dead end through: every predicate was pinned
 * by name in three suites, and all three were green while the sequence failed.
 * The session below is DRIVEN — the start machine, the producer and the queue,
 * in the order a thumb produces them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BRIEFING_START_INITIAL,
  briefingAutoSetting,
  briefingIsOpen,
  briefingRecallOffered,
  briefingRecallPillShown,
  briefingStartReducer,
  nextBriefingStartEvent,
  type BriefingStartState,
} from "../briefingStart";
import { briefingAutoDefault } from "../hudPreferences";
import {
  briefingSheetItem,
  overlayLocallySuppressed,
  selectOverlay,
  type BriefingStepBg,
  type OverlayLocalDismissal,
} from "../overlayQueue";
import { SimOverlay } from "../SimOverlay";

const SHELL_PATH = resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx");
const SHELL = readFileSync(SHELL_PATH, "utf8");
/** Code only — an assertion that cannot tell code from the paragraph beside it
 *  is not a guard, it is a ban on writing the reason down. */
const CODE = SHELL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---------------------------------------------------------------------------
// A PHONE SESSION, DRIVEN.
// ---------------------------------------------------------------------------

/**
 * The ONE piece of state a recall has to move now: `LessonPlayShell`'s
 * `briefingStart` reducer (REAL). The shell's `dismissedOverlayIds` and
 * `SimOverlay`'s private ✕ record used to be modelled here beside it; a
 * sheet-only item cannot enter either (no dismiss control is painted — asserted
 * off the markup below), so a model that carried them would be modelling a
 * gesture nobody can make.
 *
 * The one thing written out here rather than imported is the shell's candidate
 * gate (`briefingOpen && briefing.length > 0 && !mistakeMode && !ended`),
 * because it lives inside a 200-line array literal in a component `node` cannot
 * render. It is pinned against the shell's source in the last describe, so this
 * model cannot drift from it quietly.
 */
interface PhoneSession {
  readonly start: BriefingStartState;
}

const FRESH_PHONE: PhoneSession = { start: BRIEFING_START_INITIAL };

const STEPS: readonly BriefingStepBg[] = Array.from({ length: 7 }, (_, i) => ({
  n: i + 1,
  textBg: `Стъпка ${i + 1} от урока.`,
}));

/** The shell's mount + first-committed-render effect, with `compact` resolved. */
function mountOnPhone(s: PhoneSession, stored: boolean | null = null): PhoneSession {
  let start = s.start;
  for (let i = 0; i < 4; i += 1) {
    const event = nextBriefingStartEvent(start, true, stored);
    if (event === null) break;
    start = briefingStartReducer(start, event);
  }
  return { start };
}

/** What the student sees: the markup `SimOverlay` paints for the selection. */
function glass(s: PhoneSession, steps: readonly BriefingStepBg[] = STEPS): string {
  const candidate = briefingIsOpen(s.start) ? briefingSheetItem(steps) : null; // !mistakeMode, !ended
  const selection = selectOverlay([candidate]);
  return renderToStaticMarkup(
    createElement(SimOverlay, { item: selection.active, queued: selection.queued }),
  );
}

/** Are the authored steps on the glass — every one of them? */
function stepsAreUp(s: PhoneSession, steps: readonly BriefingStepBg[] = STEPS): boolean {
  const html = glass(s, steps);
  return (
    html.includes('data-sim-overlay-state="open"') && steps.every((st) => html.includes(st.textBg))
  );
}

/** МЕНЮ → «Инструкции · N стъпки» (`recallBriefing`). */
function menuRecall(s: PhoneSession): PhoneSession {
  return { start: briefingStartReducer(s.start, { type: "recall" }) };
}

/** «Разбрах» — `onAck` → `closeBriefing`. The sheet's one exit. */
function pressAck(s: PhoneSession): PhoneSession {
  return { start: briefingStartReducer(s.start, { type: "dismiss" }) };
}

describe("a phone student can always get back to the authored steps (THEO-4)", () => {
  it("arrives with the card hidden — the ruling — and with the recall on offer", () => {
    const s = mountOnPhone(FRESH_PHONE);
    expect(briefingAutoDefault(true)).toBe(false);
    expect(briefingIsOpen(s.start)).toBe(false);
    expect(glass(s)).toBe("");
    expect(briefingRecallOffered(s.start)).toBe(true);
  });

  it("МЕНЮ → «Инструкции» brings the steps back — all of them", () => {
    const s = menuRecall(mountOnPhone(FRESH_PHONE));
    expect(briefingIsOpen(s.start)).toBe(true);
    expect(stepsAreUp(s)).toBe(true);
  });

  it("…and again after «Разбрах», as many times as the student asks", () => {
    let s = mountOnPhone(FRESH_PHONE);
    for (let i = 0; i < 3; i += 1) {
      s = menuRecall(s);
      expect(stepsAreUp(s), `recall ${i + 1} of 3 lost the steps`).toBe(true);
      s = pressAck(s);
      expect(glass(s)).toBe("");
    }
  });

  it("THE DEAD END CANNOT BE REBUILT: the recalled sheet paints no ✕ to press", () => {
    // The regression this file was written for needed a dismiss control on the
    // RECALLED showing. Read off the glass, not off a flag: there is exactly one
    // button, it is the acknowledgement, and neither dismiss shape is painted.
    const html = glass(menuRecall(mountOnPhone(FRESH_PHONE)));
    expect(html.match(/<button\b/g) ?? []).toHaveLength(1);
    expect(html).toContain("Разбрах");
    expect(html).not.toContain("Скрий известието");
    expect(html).not.toContain('aria-label="Затвори"');
    expect(html).not.toContain("data-hud-close");
    expect(html).not.toContain("data-sim-overlay-dismiss-glyph");
  });

  it("a student who opted IN gets the sheet at arrival, and still gets it back", () => {
    let s = mountOnPhone(FRESH_PHONE, true);
    expect(briefingAutoSetting(true, true)).toBe(true);
    expect(stepsAreUp(s)).toBe(true);
    s = pressAck(s);
    expect(glass(s)).toBe("");
    expect(stepsAreUp(menuRecall(s))).toBe(true);
  });

  it("«Разбрах» still SENDS IT AWAY — a way back is not a refusal to go", () => {
    // The failure mode on the other side: an undo so eager that the sheet is
    // back on the next 150 ms HUD poll. Nothing between «Разбрах» and the next
    // recall may put it up again.
    const s = pressAck(menuRecall(mountOnPhone(FRESH_PHONE)));
    for (let poll = 0; poll < 20; poll += 1) {
      expect(glass(s), `poll ${poll} after «Разбрах» repainted the sheet`).toBe("");
    }
  });
});

// ---------------------------------------------------------------------------
// THE DEV RIG — the owner that is TOLD and does nothing, which is why the rule
// cannot be „does an owner exist".
// ---------------------------------------------------------------------------

describe("the ✕ is never a dead control — row A6, on every mount", () => {
  const GALLERY = readFileSync(
    resolve(__dirname, "../../../../app/dev/popup-rig/Adr009Gallery.tsx"),
    "utf8",
  );

  it("the ADR-009 gallery really is an owner that is told and does nothing", () => {
    // Five mounts, four of them mapped over the notify-teach fixtures. If this
    // stops being true the case below stops meaning anything, so it is measured
    // and not assumed.
    const noops = GALLERY.match(/onDismiss=\{\(\) => undefined\}/g) ?? [];
    expect(
      noops.length,
      "unresolved: the popup-rig's `onDismiss` handlers changed shape — " +
        "re-anchor this case before trusting its verdict.",
    ).toBeGreaterThanOrEqual(2);
    expect(GALLERY).not.toContain("reofferKey");
  });

  it("its ✕ removes the card and keeps it removed — no re-offer, no way back", () => {
    // This is the mount the first repair would have broken: `onDismiss` IS
    // passed, so „the owner owns the dismissal" made the glyph remove nothing
    // at all on all five fixtures.
    const rigKey = 0; // the prop's default: the rig passes none
    const after: OverlayLocalDismissal = { id: "notify-teach-free-first", reofferKey: rigKey };
    expect(overlayLocallySuppressed("notify-teach-free-first", after, rigKey)).toBe(true);
    // …and a neighbouring fixture is untouched, because it is by ID.
    expect(overlayLocallySuppressed("notify-teach-charged", after, rigKey)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE RULE ITSELF.
// ---------------------------------------------------------------------------

describe("overlayLocallySuppressed — a dismissal, and its undo", () => {
  const dismissedAt = (reofferKey: number, id = "briefing"): OverlayLocalDismissal => ({
    id,
    reofferKey,
  });

  it("the ✕ holds while the key it was pressed under still stands", () => {
    expect(overlayLocallySuppressed("briefing", dismissedAt(0), 0)).toBe(true);
    expect(overlayLocallySuppressed("briefing", dismissedAt(7), 7)).toBe(true);
  });

  it("a RE-OFFER — any bump of the key — stops it holding", () => {
    expect(overlayLocallySuppressed("briefing", dismissedAt(0), 1)).toBe(false);
    expect(overlayLocallySuppressed("briefing", dismissedAt(4), 5)).toBe(false);
  });

  it("and the next ✕ holds again, however many times the student asks", () => {
    let key = 0;
    let dismissal: OverlayLocalDismissal | null = null;
    for (let round = 0; round < 25; round += 1) {
      key += 1; // the owner re-offers
      expect(
        overlayLocallySuppressed("briefing", dismissal, key),
        `re-offer ${round + 1} was refused — the undo is not a nonce`,
      ).toBe(false);
      dismissal = dismissedAt(key); // the student presses ✕ again
      expect(overlayLocallySuppressed("briefing", dismissal, key)).toBe(true);
    }
  });

  it("is by ID, so a NEW line speaks immediately — A6's own reason", () => {
    expect(overlayLocallySuppressed("task:3/3", dismissedAt(0, "task:2/3"), 0)).toBe(false);
    expect(overlayLocallySuppressed("task:3/3", dismissedAt(2, "task:2/3"), 2)).toBe(false);
  });

  it("nothing dismissed suppresses nothing", () => {
    expect(overlayLocallySuppressed("briefing", null, 0)).toBe(false);
    expect(overlayLocallySuppressed("briefing", null, 9)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE PILL'S OWN STAGE, EXECUTED — the roomy half of the same route.
// ---------------------------------------------------------------------------

describe("briefingRecallPillShown — the roomy stage's pill, both directions", () => {
  const roomy = {
    compact: false,
    recallOffered: true,
    briefingSteps: 7,
    mistakeMode: false,
    ended: false,
    quizUp: false,
    teachQueued: 0,
  } as const;

  it("the roomy stage paints it, the phone never does", () => {
    expect(briefingRecallPillShown(roomy)).toBe(true);
    expect(briefingRecallPillShown({ ...roomy, compact: true })).toBe(false);
  });

  it("…and it is the panel's stand-in, so it obeys the panel's stand-downs", () => {
    expect(briefingRecallPillShown({ ...roomy, recallOffered: false })).toBe(false);
    expect(briefingRecallPillShown({ ...roomy, briefingSteps: 0 })).toBe(false);
    expect(briefingRecallPillShown({ ...roomy, mistakeMode: true })).toBe(false);
    expect(briefingRecallPillShown({ ...roomy, ended: true })).toBe(false);
    expect(briefingRecallPillShown({ ...roomy, quizUp: true })).toBe(false);
    expect(briefingRecallPillShown({ ...roomy, teachQueued: 2 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// …AND THE PRODUCT REALLY CALLS IT, on both sides of the wire.
// ---------------------------------------------------------------------------

describe("the wiring, held — a rule nothing calls is the failure this repo names most", () => {
  const OVERLAY = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");

  it("SimOverlay derives `live` through the rule and stamps the ✕ with the key", () => {
    expect(OVERLAY).toMatch(
      /const live =\s*item !== null && !overlayLocallySuppressed\(item\.id, dismissal, reofferKey\)/,
    );
    // The stamp, and the ref that lets the stable `dismiss` read the CURRENT
    // key rather than one closed over at mount.
    expect(OVERLAY).toContain("setDismissal({ id: it.id, reofferKey: reofferKeyRef.current })");
    expect(OVERLAY).toContain("reofferKeyRef.current = reofferKey;");
    // The prop exists and defaults, so an owner with no re-offer of its own
    // keeps the old permanence instead of suppressing nothing at all.
    expect(OVERLAY).toContain("reofferKey = 0,");
    expect(OVERLAY).toContain("reofferKey?: number;");
    // The shapes that were there before — a bare id comparison, and the
    // owner-ownership guess — must be GONE, not merely joined: „the same
    // decision in two places" is the defect, and „the owner exists" is the
    // repair that made the rig's ✕ dead.
    expect(OVERLAY).not.toMatch(/item\.id !== dismissedId \? item : null/);
    expect(OVERLAY).not.toContain("ownerOwnsDismissal");
  });

  it("the shell is the owner that IS told — and the briefing has nothing left to undo", () => {
    // The overlay's undo is still wired for every line that CAN be sent away…
    expect(CODE).toContain("onDismiss={dismissOverlayItem}");
    expect(CODE).toContain("reofferKey={overlayReofferKey}");
    expect(CODE).toContain("const reofferOverlay = useCallback(() => {");
    expect(CODE).toContain("setOverlayReofferKey((n) => n + 1);");
    // …and `recallBriefing` re-offers the steps through the start machine.
    const at = CODE.indexOf("const recallBriefing = useCallback");
    expect(at, "unresolved: `recallBriefing` not found — re-anchor this file").toBeGreaterThan(-1);
    const end = CODE.indexOf("}, [", at);
    expect(end, "unresolved: `recallBriefing` does not close — re-anchor").toBeGreaterThan(at);
    const body = CODE.slice(at, end);
    expect(body).toContain('dispatchBriefingStart({ type: "recall" })');
    // 2026-10-08: it spent TWO undos here for the recalled peek's ✕. The sheet
    // paints none (driven in the first describe), so a ✕-undo in this callback
    // would be an undo for a gesture that does not exist — and the day someone
    // puts a dismiss control back on the briefing, „THE DEAD END CANNOT BE
    // REBUILT" above is the case that goes red, not this one.
    expect(body).not.toContain("setDismissedOverlayIds(");
    expect(body).not.toContain("reofferOverlay();");
    // The candidate gate this file's model writes out by hand:
    expect(CODE).toMatch(
      /briefingOpen && briefing\.length > 0 && !mistakeMode && !ended\s*\?\s*briefingSheetItem\(briefing, closeBriefing\)/,
    );
  });

  it("the OTHER re-offer spends it too — `recallPreDriveOverlay`", () => {
    // §I5's rule is general and outlives one card: ANY LINE THE STUDENT CAN
    // SEND AWAY NEEDS A WAY BACK. The pre-drive checklist's recall is the other
    // caller, and it had the identical half-undo.
    const at = CODE.indexOf("const recallPreDriveOverlay = useCallback");
    expect(at, "unresolved: `recallPreDriveOverlay` not found").toBeGreaterThan(-1);
    expect(CODE.slice(at, at + 500)).toContain("reofferOverlay();");
  });

  it("the МЕНЮ row is the phone's route and is NOT gated on `!compact`", () => {
    // `briefing-auto-open.test.ts` pins the row's existence and its handler.
    // What is pinned HERE is the direction of the gate, because the mutation
    // this lane was asked about is exactly that inversion — and an inverted
    // gate leaves the phone with the pill it cannot paint and nothing else.
    const hit = /\.\.\.\(compact && !ended && !mistakeMode && briefing\.length > 0/.exec(CODE);
    expect(
      hit,
      "unresolved: the МЕНЮ briefing row's guard changed shape. It must be " +
        "`compact && …` — a phone is the surface that has no other route.",
    ).not.toBeNull();
    expect(CODE).not.toMatch(/\.\.\.\(!compact && !ended && !mistakeMode && briefing\.length > 0/);
    const row = /key: "briefing",[\s\S]{0,600}?onSelect: recallBriefing/.exec(CODE);
    expect(row, "unresolved: the row no longer calls `recallBriefing`").not.toBeNull();
  });

  it("the roomy pill's gate is the executed predicate, handed the live `compact`", () => {
    const at = CODE.indexOf('data-hud="briefing-recall"');
    expect(at).toBeGreaterThan(-1);
    const gate = CODE.slice(Math.max(0, at - 700), at);
    expect(gate).toMatch(/briefingRecallPillShown\(\{\s*compact,/);
    expect(gate.match(/\bcompact\b/g) ?? []).toHaveLength(1);
  });
});
