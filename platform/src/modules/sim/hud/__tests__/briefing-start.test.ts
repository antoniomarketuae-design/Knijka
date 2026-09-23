/**
 * THE FOUNDER'S RULING, EXECUTED THROUGH THE SHELL'S RENDER SEQUENCE.
 *
 * Ruling 2026-09-20: «…taking alot of space on the screen to we have to hide it
 * and make it optional if the user wants it on». `briefing-auto-open.test.ts`
 * proved the PREDICATE (`briefingOpensAtStart(true, null) === false`) for a
 * whole round while every phone still opened the card at arrival (w60
 * `*mobile-right/01-arrival.png`): the shell asked the predicate on its first
 * render, where `useCompactHud()` is still `useState(false)`, and froze the
 * answer in a lazy `useState`. A green predicate over a dead wire.
 *
 * So this file does not test the predicate. It runs the SAME functions the
 * shell calls (`briefingStartReducer`, `nextBriefingStartEvent`,
 * `briefingIsOpen`) through a model of the SAME React sequence the shell goes
 * through — vitest runs in node with no DOM, and the shell is a 9,000-line
 * component with a live canvas, so the sequence is modelled rather than
 * mounted:
 *
 *   render 1   useCompactHud → false (its useState(false)); machine: initial
 *   commit     effects run IN HOOK ORDER and their updates are batched:
 *                useCompactHud's effect  → setCompact(resolved)
 *                the machine's effect    → nextBriefingStartEvent(state,
 *                                          compact-as-seen-by-render-1, stored)
 *   render 2…  repeat until no effect produces an update
 *
 * `briefing-auto-open.test.ts` pins that the shell really does declare the
 * machine after `useCompactHud`, with exactly this effect body and deps.
 *
 * MUTATION (the acceptance test): restore the lazy-initialiser behaviour — let
 * the machine decide from the first render's `compact` — and the phone cases
 * below go red. Recorded in the lane report.
 */

import { describe, expect, it } from "vitest";
import {
  BRIEFING_START_INITIAL,
  briefingAutoSetting,
  briefingAutoToggled,
  briefingIsOpen,
  briefingRecallOffered,
  briefingStartReducer,
  nextBriefingStartEvent,
  type BriefingStartState,
} from "../briefingStart";

interface Frame {
  compact: boolean;
  open: boolean;
  phase: BriefingStartState["phase"];
}

/**
 * One shell mount, frame by frame. `resolvedCompact` is what the viewport hook
 * reads in its effect; `stored` is the student's persisted choice (null =
 * never chose).
 */
function mountShell(resolvedCompact: boolean, stored: boolean | null): Frame[] {
  let compact = false; // useCompactHud: useState(false)
  let state: BriefingStartState = BRIEFING_START_INITIAL;
  let hookEffectRan = false;
  const frames: Frame[] = [];
  for (let guard = 0; guard < 10; guard++) {
    // RENDER with this frame's values.
    frames.push({ compact, open: briefingIsOpen(state), phase: state.phase });
    // COMMIT: effects in hook order, reading THIS render's values.
    let nextCompact: boolean = compact;
    if (!hookEffectRan) {
      nextCompact = resolvedCompact; // useCompactHud's effect (mount only)
      hookEffectRan = true;
    }
    const event = nextBriefingStartEvent(state, compact, stored);
    const nextState = event === null ? state : briefingStartReducer(state, event);
    if (nextCompact === compact && nextState === state) return frames;
    compact = nextCompact;
    state = nextState;
  }
  throw new Error("the shell never settled — an effect loop");
}

const last = (f: Frame[]) => f[f.length - 1]!;

describe("the start decision waits for the resolved surface (w60)", () => {
  it("PHONE, nothing stored: ends CLOSED — the ruling", () => {
    const frames = mountShell(true, null);
    expect(last(frames)).toMatchObject({ compact: true, open: false, phase: "decided" });
  });

  it("PHONE, nothing stored: never open on ANY frame — no flash of the card", () => {
    const frames = mountShell(true, null);
    expect(frames.map((f) => f.open)).toEqual(frames.map(() => false));
  });

  it("ROOMY, nothing stored: ends OPEN — the stage's side panel is unchanged", () => {
    expect(last(mountShell(false, null))).toMatchObject({ compact: false, open: true, phase: "decided" });
  });

  it("the first render is closed on BOTH surfaces — nothing is decided before the viewport is known", () => {
    for (const c of [true, false]) {
      for (const s of [null, true, false]) {
        const [first] = mountShell(c, s);
        expect(first).toMatchObject({ compact: false, open: false, phase: "awaitingViewport" });
      }
    }
  });

  it("the decision is taken on the render that carries the resolved compact value", () => {
    const frames = mountShell(true, null);
    const decidedAt = frames.findIndex((f) => f.phase === "decided");
    expect(decidedAt).toBeGreaterThan(0);
    // The frame BEFORE the decision already had the resolved value — i.e. the
    // `resolve` event was built from it, not from render 1's `false`.
    expect(frames[decidedAt - 1]!.compact).toBe(true);
  });

  it("PHONE, stored opt-in («вкл.»): ends OPEN — «optional if the user wants it on»", () => {
    expect(last(mountShell(true, true))).toMatchObject({ compact: true, open: true });
  });

  it("ROOMY, stored opt-out («изкл.»): ends CLOSED — the choice wins on both surfaces", () => {
    expect(last(mountShell(false, false))).toMatchObject({ compact: false, open: false });
  });

  it("PHONE, stored opt-out and ROOMY, stored opt-in: the stored choice, verbatim", () => {
    expect(last(mountShell(true, false)).open).toBe(false);
    expect(last(mountShell(false, true)).open).toBe(true);
  });

  it("the МЕНЮ row prints what the machine does (one function for both)", () => {
    for (const c of [true, false]) {
      for (const s of [null, true, false]) {
        expect(briefingAutoSetting(c, s)).toBe(last(mountShell(c, s)).open);
      }
    }
  });
});

describe("the student's in-session choices are final for the showing", () => {
  it("a dismiss before the viewport resolved is not undone by a late resolve", () => {
    let s = briefingStartReducer(BRIEFING_START_INITIAL, { type: "dismiss" });
    s = briefingStartReducer(s, { type: "mounted" });
    s = briefingStartReducer(s, { type: "resolve", compact: false, stored: null });
    expect(briefingIsOpen(s)).toBe(false);
  });

  it("a recall opens it on a phone with no opt-in (THEO-4: the steps stay reachable)", () => {
    const settled = mountShell(true, null);
    expect(last(settled).open).toBe(false);
    let s: BriefingStartState = { phase: "decided", open: false };
    s = briefingStartReducer(s, { type: "recall" });
    expect(briefingIsOpen(s)).toBe(true);
    s = briefingStartReducer(s, { type: "dismiss" });
    expect(briefingIsOpen(s)).toBe(false);
  });

  it("a later compact flip (rotation) does not reopen or close a decided card", () => {
    const decided: BriefingStartState = { phase: "decided", open: false };
    expect(nextBriefingStartEvent(decided, false, null)).toBeNull();
    expect(briefingStartReducer(decided, { type: "resolve", compact: false, stored: null })).toBe(decided);
  });

  it("a retry is an arrival on this surface's terms", () => {
    const openRoomy: BriefingStartState = { phase: "decided", open: false };
    expect(briefingIsOpen(briefingStartReducer(openRoomy, { type: "arrive", compact: false, stored: null }))).toBe(true);
    expect(briefingIsOpen(briefingStartReducer(openRoomy, { type: "arrive", compact: true, stored: null }))).toBe(false);
    expect(briefingIsOpen(briefingStartReducer(openRoomy, { type: "arrive", compact: true, stored: true }))).toBe(true);
  });
});

/**
 * THE МЕНЮ TOGGLE'S NEXT VALUE — lane E round 2.
 *
 * The shell used to compute `const next = !briefingAutoOpen` inline, and the
 * wrong `!briefingAutoStored` survived the suite: they agree whenever a choice
 * is stored, and disagree exactly when nothing is — on the roomy stage the row
 * prints «вкл.» (the default) and `!null` writes «on» again, a tap that changes
 * nothing. `briefingAutoToggled` is the rule; the shell's call is pinned in
 * `briefing-auto-open.test.ts`.
 */
describe("briefingAutoToggled — the first tap flips what the row PRINTS", () => {
  it("ROOMY, nothing stored: the row says «вкл.», so the first tap turns it OFF", () => {
    expect(briefingAutoSetting(false, null)).toBe(true);
    expect(briefingAutoToggled(false, null)).toBe(false);
  });

  it("PHONE, nothing stored: the row says «изкл.», so the first tap turns it ON", () => {
    expect(briefingAutoSetting(true, null)).toBe(false);
    expect(briefingAutoToggled(true, null)).toBe(true);
  });

  it("a stored choice flips on both surfaces", () => {
    for (const c of [true, false]) {
      expect(briefingAutoToggled(c, true)).toBe(false);
      expect(briefingAutoToggled(c, false)).toBe(true);
    }
  });

  it("every tap changes what the row prints (never a no-op tap)", () => {
    for (const c of [true, false]) {
      for (const s of [null, true, false]) {
        const next = briefingAutoToggled(c, s);
        expect(briefingAutoSetting(c, next)).toBe(!briefingAutoSetting(c, s));
      }
    }
  });
});

/**
 * THE ROOMY RECALL PILL WAITS FOR THE DECISION — round-1 low finding.
 * `!briefingIsOpen` is true on the two frames before `decided`, so a pill gated
 * on it painted under the roomy card that was about to arrive.
 */
describe("briefingRecallOffered — no pill before the start decision exists", () => {
  it("ROOMY, nothing stored: the pill is never offered on ANY frame of the mount", () => {
    let state: BriefingStartState = BRIEFING_START_INITIAL;
    const offered: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      offered.push(briefingRecallOffered(state));
      const e = nextBriefingStartEvent(state, false, null);
      if (e === null) break;
      state = briefingStartReducer(state, e);
    }
    expect(briefingIsOpen(state)).toBe(true);
    expect(offered.length).toBeGreaterThan(2);
    expect(offered).toEqual(offered.map(() => false));
  });

  it("pre-decision phases never offer it, although the card is closed there", () => {
    const read: BriefingStartState = { phase: "viewportRead", open: false };
    expect(briefingIsOpen(BRIEFING_START_INITIAL)).toBe(false);
    expect(briefingRecallOffered(BRIEFING_START_INITIAL)).toBe(false);
    expect(briefingRecallOffered(read)).toBe(false);
  });

  it("offered once decided closed (phone default, or after a ✕), withdrawn on recall", () => {
    let s = briefingStartReducer(BRIEFING_START_INITIAL, { type: "mounted" });
    s = briefingStartReducer(s, { type: "resolve", compact: true, stored: null });
    expect(briefingRecallOffered(s)).toBe(true);
    s = briefingStartReducer(s, { type: "recall" });
    expect(briefingRecallOffered(s)).toBe(false);
    s = briefingStartReducer(s, { type: "dismiss" });
    expect(briefingRecallOffered(s)).toBe(true);
  });
});
