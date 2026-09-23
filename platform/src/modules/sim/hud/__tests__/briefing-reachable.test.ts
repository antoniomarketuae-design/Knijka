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
 * Two facts, and only together do they make a dead end:
 *
 *   1. `[data-hud="briefing-recall"]` — the «ⓘ Инструкции · N стъпки ▸» pill —
 *      is HELD BUT NOT PAINTED on every mobile leg (11× on sc-signal-hesitation
 *      at 01/03/04-*, beside the same line for its parent `notify-column` and
 *      its sibling `objective-banner`). It is a child of the SHELL's notify
 *      column, and that column carries `hidden` on compact. It is the ROOMY
 *      leg's recall and always was; the shell now says so through
 *      `briefingRecallPillShown`, with the numbers for why the phone's column
 *      cannot afford a second 44 px tenant beside the mount.
 *
 *   2. So the phone's ONLY painted route is the МЕНЮ row «Инструкции · N
 *      стъпки» (`recallBriefing`). And that row died after ONE ✕:
 *
 *        · the recalled peek is non-blocking (`blocking: !briefingRecalled`),
 *          so unlike the arrival showing it paints a ✕ (`closable`);
 *        · `SimOverlay.dismiss()` writes its own private record AND calls
 *          `onDismiss`, so the decision is recorded TWICE;
 *        · `recallBriefing` undoes the shell's copy — that is what it is for,
 *          and its docblock says it undoes „both of the phone's exits" — but it
 *          could not reach SimOverlay's, which had no undo of any kind.
 *
 *      Second recall: the shell offers the item, `live` is null, nothing
 *      happens, and the student has no route to the lesson's authored steps for
 *      the rest of the session. Silent, and on the one surface the ruling was
 *      about.
 *
 * ── AND THE UNDO IS THE OWNER'S TO SPEND, NOT A GUESS ABOUT THE OWNER ───────
 *
 * The first repair suppressed the private record whenever `onDismiss` was
 * passed. `/dev/popup-rig` passes `onDismiss={() => undefined}` on FIVE mounts
 * — an owner that is told and does nothing — so that rule would have made the ✕
 * a dead control across the whole ADR-009 gallery, which is row A6 back. The
 * rule shipped instead is a RE-OFFER KEY: the ✕ always clears the card, and an
 * owner that offers the same item again bumps the key it was stamped under.
 * Both legs are driven below, including the rig's.
 *
 * ── WHY THIS FILE IS NOT ANOTHER SOURCE GREP ────────────────────────────────
 *
 * Because a grep is what let this through: every predicate above was already
 * pinned by name in three suites, and all three were green while the sequence
 * failed. The session below is DRIVEN — the start machine, the dismissal rule
 * and the peek's own candidate condition, in the order a thumb produces them —
 * so the mutation that matters (removing the undo) turns it red without anyone
 * having to think of it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
import { overlayLocallySuppressed, type OverlayLocalDismissal } from "../overlayQueue";

const SHELL_PATH = resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx");
const SHELL = readFileSync(SHELL_PATH, "utf8");
/** Code only — an assertion that cannot tell code from the paragraph beside it
 *  is not a guard, it is a ban on writing the reason down. */
const CODE = SHELL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---------------------------------------------------------------------------
// A PHONE SESSION, DRIVEN.
// ---------------------------------------------------------------------------

/**
 * The four pieces of state a recall has to move, held exactly as the product
 * holds them:
 *
 *   `start`            — `LessonPlayShell`'s `briefingStart` reducer (REAL).
 *   `shellDismissed`   — its `dismissedOverlayIds`, the owner's authoritative
 *                        list, which it filters the overlay candidates through.
 *   `reofferKey`       — its `overlayReofferKey`, bumped by every re-offer.
 *   `overlayDismissal` — `SimOverlay`'s private record of the ✕, stamped with
 *                        the key it was pressed under.
 *
 * The one thing written out here rather than imported is the shell's candidate
 * expression (`briefingOpen && !briefingFold.folded && briefing.length > 0 &&
 * !mistakeMode && !ended`), because it lives inside a 200-line array literal in
 * a component `node` cannot render. It is pinned against the shell's source in
 * the last describe, so this model cannot drift from it quietly.
 */
interface PhoneSession {
  readonly start: BriefingStartState;
  readonly shellDismissed: ReadonlySet<string>;
  readonly reofferKey: number;
  readonly overlayDismissal: OverlayLocalDismissal | null;
}

const FRESH_PHONE: PhoneSession = {
  start: BRIEFING_START_INITIAL,
  shellDismissed: new Set<string>(),
  reofferKey: 0,
  overlayDismissal: null,
};

/** The shell's mount + first-committed-render effect, with `compact` resolved. */
function mountOnPhone(s: PhoneSession, stored: boolean | null = null): PhoneSession {
  let start = s.start;
  for (let i = 0; i < 4; i += 1) {
    const event = nextBriefingStartEvent(start, true, stored);
    if (event === null) break;
    start = briefingStartReducer(start, event);
  }
  return { ...s, start };
}

/** Is the briefing item OFFERED by the shell this render? */
function offeredByShell(s: PhoneSession, steps = 7): boolean {
  const candidate = briefingIsOpen(s.start) && steps > 0; // !folded, !mistakeMode, !ended
  return candidate && !s.shellDismissed.has("briefing");
}

/** Is it actually LIVE inside SimOverlay — i.e. does the student see a peek? */
function peekIsUp(s: PhoneSession, steps = 7): boolean {
  if (!offeredByShell(s, steps)) return false;
  return !overlayLocallySuppressed("briefing", s.overlayDismissal, s.reofferKey);
}

/** МЕНЮ → «Инструкции · N стъпки» (`recallBriefing`): both undos, one gesture. */
function menuRecall(s: PhoneSession): PhoneSession {
  const shellDismissed = new Set(s.shellDismissed);
  shellDismissed.delete("briefing");
  return {
    ...s,
    start: briefingStartReducer(s.start, { type: "recall" }),
    shellDismissed,
    reofferKey: s.reofferKey + 1, // `reofferOverlay()`
  };
}

/** The ✕ on the recalled (non-blocking) peek: `SimOverlay.dismiss()`. */
function pressDismissGlyph(s: PhoneSession): PhoneSession {
  const shellDismissed = new Set(s.shellDismissed);
  shellDismissed.add("briefing"); // the owner's `onDismiss` → `dismissOverlayItem`
  return {
    ...s,
    shellDismissed,
    overlayDismissal: { id: "briefing", reofferKey: s.reofferKey },
  };
}

/** «Разбрах» on the peek: `onAck` → `closeBriefing`. Sets no dismissal at all. */
function pressAck(s: PhoneSession): PhoneSession {
  return { ...s, start: briefingStartReducer(s.start, { type: "dismiss" }) };
}

describe("a phone student can always get back to the authored steps (THEO-4)", () => {
  it("arrives with the card hidden — the ruling — and with the recall on offer", () => {
    const s = mountOnPhone(FRESH_PHONE);
    expect(briefingAutoDefault(true)).toBe(false);
    expect(briefingIsOpen(s.start)).toBe(false);
    expect(peekIsUp(s)).toBe(false);
    // `briefingRecallOffered` is the roomy pill's own term, and it is TRUE
    // here: the decision exists and the card is not up. The phone does not
    // paint the pill — `briefingRecallPillShown` says so, executed below — and
    // the МЕНЮ row is its surface, gated `compact`.
    expect(briefingRecallOffered(s.start)).toBe(true);
  });

  it("МЕНЮ → «Инструкции» brings the steps back", () => {
    const s = menuRecall(mountOnPhone(FRESH_PHONE));
    expect(briefingIsOpen(s.start)).toBe(true);
    expect(peekIsUp(s)).toBe(true);
  });

  it("…and again after «Разбрах», as many times as the student asks", () => {
    let s = mountOnPhone(FRESH_PHONE);
    for (let i = 0; i < 3; i += 1) {
      s = menuRecall(s);
      expect(peekIsUp(s), `recall ${i + 1} of 3 lost the steps`).toBe(true);
      s = pressAck(s);
      expect(peekIsUp(s)).toBe(false);
    }
  });

  it("THE REGRESSION — …and again after the ✕, which is where it died", () => {
    // The ✕ only exists on a RECALLED peek: the arrival showing is blocking and
    // `closable` requires `!blocking`. So this sequence needs the recall first,
    // which is exactly why no arrival-only census could photograph it.
    let s = menuRecall(mountOnPhone(FRESH_PHONE));
    expect(peekIsUp(s)).toBe(true);

    s = pressDismissGlyph(s);
    expect(peekIsUp(s), "the ✕ must clear the card").toBe(false);

    s = menuRecall(s);
    expect(
      offeredByShell(s),
      "the shell must re-offer the item — `recallBriefing` clears its own list",
    ).toBe(true);
    expect(
      peekIsUp(s),
      "the second МЕНЮ recall reached the student with nothing: the phone's only " +
        "painted route to the lesson's instructions is dead for the rest of the " +
        "session, which is the ruling's THEO-4 condition failing silently.",
    ).toBe(true);
  });

  it("and it keeps working for the whole drive, ✕ and «Разбрах» interleaved", () => {
    let s = mountOnPhone(FRESH_PHONE);
    for (const exit of [pressDismissGlyph, pressAck, pressDismissGlyph, pressDismissGlyph]) {
      s = menuRecall(s);
      expect(peekIsUp(s)).toBe(true);
      s = exit(s);
      expect(peekIsUp(s)).toBe(false);
    }
  });

  it("a student who opted IN still gets the card at arrival, and still gets it back", () => {
    let s = mountOnPhone(FRESH_PHONE, true);
    expect(briefingAutoSetting(true, true)).toBe(true);
    expect(peekIsUp(s)).toBe(true);
    s = pressDismissGlyph(pressAck(menuRecall(s)));
    expect(peekIsUp(s)).toBe(false);
    expect(peekIsUp(menuRecall(s))).toBe(true);
  });

  it("the ✕ still SENDS IT AWAY — a way back is not a refusal to go", () => {
    // The failure mode on the other side of this repair: an undo so eager that
    // the card returns on the next 150 ms HUD poll. It must not. Nothing
    // between the ✕ and the next re-offer may put it back up.
    let s = menuRecall(mountOnPhone(FRESH_PHONE));
    s = pressDismissGlyph(s);
    for (let poll = 0; poll < 20; poll += 1) {
      expect(peekIsUp(s), `poll ${poll} after the ✕ repainted a dismissed card`).toBe(false);
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

  it("the shell is the owner that IS told, and its recall spends BOTH undos", () => {
    expect(CODE).toContain("onDismiss={dismissOverlayItem}");
    expect(CODE).toContain("reofferKey={overlayReofferKey}");
    expect(CODE).toContain("const reofferOverlay = useCallback(() => {");
    expect(CODE).toContain("setOverlayReofferKey((n) => n + 1);");
    const at = CODE.indexOf("const recallBriefing = useCallback");
    expect(at, "unresolved: `recallBriefing` not found — re-anchor this file").toBeGreaterThan(-1);
    const body = CODE.slice(at, at + 900);
    expect(body).toContain('dispatchBriefingStart({ type: "recall" })');
    expect(body).toContain("setDismissedOverlayIds(");
    expect(body).toContain('next.delete("briefing")');
    expect(
      body,
      "`recallBriefing` clears the shell's own list and leaves SimOverlay's " +
        "record standing — the second МЕНЮ recall is then silent, which is the " +
        "dead end this whole file is about.",
    ).toContain("reofferOverlay();");
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
