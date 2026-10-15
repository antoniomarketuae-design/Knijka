/**
 * =============================================================================
 * AN EXPLANATION THE STUDENT ASKED FOR STAYS WHOLE, AND STAYS LONG ENOUGH TO
 * READ — sc-roundabout-entry:fe081cf1 (major), the clauses rig-w3d left open.
 * ROUND 2 (2026-10-13): rewritten on the integrator's decisions W1–W4 after
 * the round-1 verifier refuted the first hold. Its own probe is kept beside
 * this file's subject, in `components/sim/lesson-ui/__tests__/
 * whycut-verify-probe.test.ts` — the six product stages, the re-strike and the
 * end screen are there; this file holds the pieces.
 *
 * THE DRIVE THIS FILE IS BUILT ON. `.audit-frames/rig-w3d/sc-roundabout-entry/
 * fe081cf1/pc-L3-F-ON-WHY.json` — Chromium 1440 × 900, L3, advisor on, 8cb0707.
 * The island is struck at 50.68 s; «ЗАЩО» is pressed with a real pointer at
 * contact +2.233 s. Every length below is a box the sidecar recorded
 * (`island.why.columnBefore`, `island.why.shots[*].column`), not an estimate:
 *
 *   column                260.5 → 728          467.5 px, `gap-1.5` = 6
 *   banner, one line      260.5 → 309.2         48.7
 *   banner, pinned car    260.5 → 336.7         76.2   («Колата е притисната…»)
 *   advisor card          342.7 → 441           98.3
 *   recall pill           315.2 → 338.7         23.5
 *   fold row              704.5 → 728           23.5
 *   fault card, summary   116.5 · opened 295.5 · «НАУЧИ» under it 309.8
 *   inside the opened card: body 66.5 → 264.5, law chip 270.5 → 291.5
 *
 * WHAT THE JUDGE SAW (pc-L3-F-ON-WHY-28): from contact +5.03 s the opened card
 * stood 476.5 → 772 against a window that ended at 698.5 — body cut 42.5 px
 * mid-sentence, law chip 69.5 px below the window — and at +8.017 s it was
 * gone, 5.8 s after the press.
 *
 * WHAT IS TESTED, AND AT WHAT LEVEL.
 *   §1  the reading-time rule and the card's life after the press, and the
 *       hold on every OTHER card's clock — the queue hook itself is MOUNTED
 *       (`hookHarness`) and its timers are read.
 *   §2  which cards are on the glass while one is being read, and how many are
 *       counted behind it (`visibleToasts`, `waitingToasts`).
 *   §3  the pure half of the yield (`toastColumnYieldNext`) and the read it is
 *       decided on (`readOpenedToastShortPx`).
 *   §4  the yield itself, RUN: `useToastReader` is mounted against a stand-in
 *       column laid out with the sidecar's lengths, first held to the
 *       sidecar's own windows so it cannot drift from the frame.
 *   §5  the lines by which the shell spends it.
 *   §6  the column, MOUNTED: the press's report, the card's read layout (the
 *       box that scrolls, the floor, the fade), the «+N» badge.
 *
 * WHAT THIS CANNOT DO, stated: there is no layout engine here
 * (`environment: "node"`). That a browser shrinks the card and pins its law
 * chip was laid out in Chromium and WebKit with the product's compiled CSS
 * (lane scratch `r2/spike/`); what a student sees on the product is a device
 * claim, owed to the rig.
 * =============================================================================
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HudEvent } from "../../contracts";
import { makeViolation, violationPeekBg } from "../../rules";
import * as Hud from "../HudToasts";
import {
  TOAST_FIT_SLACK_PX,
  TOAST_MORE_SELECTOR,
  TOAST_WHY_ATTR,
  toastCardInWindow,
  useHudToastQueue,
  type HudToast,
} from "../HudToasts";
import * as Prefs from "../hudPreferences";
import { TOAST_MAX_VISIBLE, TOAST_QUIET_MAX_VISIBLE, visibleToasts } from "../hudPreferences";
import { mountHook } from "./hookHarness";

const HUD_SRC = readFileSync(resolve(__dirname, "../HudToasts.tsx"), "utf8");
const SHELL_SRC = readFileSync(
  resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
  "utf8",
);

/** Source with comments removed — a pin may never be satisfied by prose. */
function code(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

type Reader = {
  reading: { id: number; held: boolean } | null;
  held: boolean;
  bannerYields: boolean;
  onWhyChange: (id: number, open: boolean) => void;
  recheck: () => void;
};

/** The exports this repair adds, read structurally: on a tree without them a
 *  row fails on its ASSERTION (what the product does) and not on a link error. */
const NEW = Hud as unknown as {
  TOAST_READ_CHARS_PER_SEC?: number;
  TOAST_READ_ATTR?: string;
  TOAST_READ_SELECTOR?: string;
  TOAST_READ_FLOOR_PX?: number;
  TOAST_WAITING_ATTR?: string;
  toastReadMs?: (chars: number) => number;
  toastExpiryAfterWhy?: (expiresAtMs: number, nowMs: number, chars: number) => number;
  capToastQueue?: <T extends { id: number }>(t: readonly T[], max: number, keep: ReadonlySet<number>) => T[];
  toastColumnYieldNext?: (level: number, reading: boolean, short: boolean) => number;
  readOpenedToastShortPx?: (scroller: unknown) => number | null;
  toastWaitingLabelBg?: (n: number) => string;
  toastReadBoxStyle?: (mask: string | null) => Record<string, unknown>;
  useToastReader?: (args: {
    toasts: ReadonlyArray<{ id: number }>;
    scroller: { readonly current: unknown };
    whyChanged: (id: number, open: boolean) => void;
    holdAllBut: (id: number | null) => void;
  }) => Reader;
};
const NEW_PREFS = Prefs as unknown as {
  waitingToasts?: (
    toasts: ReadonlyArray<{ id?: number; event: { kind: string } }>,
    quiet: boolean,
    reading: { id: number; held: boolean } | null,
  ) => number;
};

/** The row's own fault, from the catalogue — never typed here (ADR-002). */
function staticObjectToast(): Extract<HudEvent, { kind: "violation" }> {
  const v = makeViolation("COLLISION", 50.68, { detail: "staticObject" });
  const peek = violationPeekBg("COLLISION", "staticObject");
  return {
    kind: "violation",
    titleBg: v.titleBg,
    explanationBg: v.explanationBg,
    points: v.points,
    severity: v.severityClass,
    lawRef: v.lawRef,
    ...(peek === null ? {} : { peekBg: peek }),
  };
}

const TEACH: HudEvent = { kind: "lesson", titleBg: "Интервалът беше добър", explanationBg: "…" };

afterEach(() => {
  vi.restoreAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// §1  THE PRESS BUYS THE TIME THE PARAGRAPH TAKES
// ═════════════════════════════════════════════════════════════════════════════

describe("§1 the reading-time rule is the one the teaching TTL was sized on", () => {
  it("the paragraph the rig pressed open is 323 characters — the sidecar's own count", () => {
    expect(staticObjectToast().explanationBg.length).toBe(323);
  });

  it("15 characters a second, and the 8 000 ms TTL is that rule at 120 characters", () => {
    const ttl = HUD_SRC.match(/\n\s*const TEACHING_TOAST_TTL_MS = (\d+);/);
    expect(ttl, "TEACHING_TOAST_TTL_MS literal in hud/HudToasts.tsx").not.toBeNull();
    expect(HUD_SRC).toContain("~15 chars/s reading speed at driving load");
    expect(NEW.TOAST_READ_CHARS_PER_SEC, "the product's reading pace is not a named number").toBe(15);
    expect(NEW.toastReadMs!(120)).toBe(Number(ttl![1]));
  });

  it("323 characters are 21.5 s of reading — not the 5.8 s the card had left", () => {
    expect(NEW.toastReadMs?.(323), "no reading-time rule to give the press").toBe(21_534);
    expect(NEW.toastReadMs!(323)).toBeGreaterThan(5_784 * 3);
  });

  it("an unreadable count asks for no time, and never for a negative one", () => {
    expect(typeof NEW.toastReadMs).toBe("function");
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(NEW.toastReadMs!(bad)).toBe(0);
  });

  it("the press never shortens a life, and always leaves the whole reading time", () => {
    expect(typeof NEW.toastExpiryAfterWhy).toBe("function");
    const f = NEW.toastExpiryAfterWhy!;
    // The rig: raised at 0, pressed at 2 233 → gone at 8 017. Now: 2 233 + 21 534.
    expect(f(8_000, 2_233, 323)).toBe(23_767);
    // A card already given longer than the text needs keeps what it had.
    expect(f(60_000, 2_233, 323)).toBe(60_000);
    // Pressed in its last instant: the whole reading time from the press.
    expect(f(8_000, 7_999, 323)).toBe(7_999 + 21_534);
  });
});

describe("§1 the queue, MOUNTED: a press on «Защо» re-arms that card's clock", () => {
  type Queue = ReturnType<typeof useHudToastQueue> & {
    whyChanged?: (id: number, open: boolean) => void;
    holdAllBut?: (id: number | null) => void;
    painted?: (ids: readonly number[]) => void;
  };

  function mountQueue(at: { now: number }) {
    vi.spyOn(Date, "now").mockImplementation(() => at.now);
    const m = mountHook(() => useHudToastQueue() as Queue);
    return m;
  }

  it("THE RIG'S PRESS: raised at 0, opened at +2 233 ms — the card may not leave before +23 767", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([staticObjectToast()]);
    expect(m.timers.map((t) => t.ms), "a violation card starts on the 8 s teaching TTL").toEqual([8_000]);
    const armedAtRaise = m.timers[0]!.id;
    const id = m.rerender().toasts[0]!.id;

    at.now = 2_233;
    m.value.whyChanged?.(id, true);

    expect(m.timers, "exactly one clock per card").toHaveLength(1);
    expect(
      m.timers[0]!.id,
      "the press left the card on the clock it was raised with — gone at +8 000, 5.8 s after he asked to read 323 characters",
    ).not.toBe(armedAtRaise);
    expect(at.now + m.timers[0]!.ms).toBe(23_767);

    // …and when that clock does run out, the card leaves like any other.
    m.tick();
    expect(m.rerender().toasts).toHaveLength(0);
    m.unmount();
  });

  it("closing it gives nothing back and takes nothing away; opening again reads from that moment", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([staticObjectToast()]);
    const id = m.rerender().toasts[0]!.id;
    at.now = 2_233;
    m.value.whyChanged?.(id, true);
    const afterOpen = m.timers.map((t) => t.id);
    at.now = 6_000;
    m.value.whyChanged?.(id, false);
    expect(m.timers.map((t) => t.id), "closing must not touch the clock").toEqual(afterOpen);
    at.now = 20_000;
    m.value.whyChanged?.(id, true);
    expect(m.timers).toHaveLength(1);
    expect(at.now + m.timers[0]!.ms, "re-opened at +20 s: the paragraph's time from there").toBe(20_000 + 21_534);
    m.unmount();
  });

  it("a card with a longer life than its text needs is left alone", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([staticObjectToast()], 60_000);
    const before = m.timers.map((t) => [t.id, t.ms]);
    const id = m.rerender().toasts[0]!.id;
    at.now = 2_233;
    m.value.whyChanged?.(id, true);
    expect(typeof m.value.whyChanged).toBe("function");
    expect(m.timers.map((t) => [t.id, t.ms])).toEqual(before);
    m.unmount();
  });

  it("a press on an id the queue does not hold arms nothing", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([staticObjectToast()]);
    const before = m.timers.map((t) => [t.id, t.ms]);
    expect(typeof m.value.whyChanged).toBe("function");
    m.value.whyChanged!(999, true);
    expect(m.timers.map((t) => [t.id, t.ms])).toEqual(before);
    m.unmount();
  });

  it("the card being read is not capped out of the queue by newer cards", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([staticObjectToast()]);
    const id = m.rerender().toasts[0]!.id;
    m.value.whyChanged?.(id, true);
    // Five newer cards: the cap (TOAST_MAX_VISIBLE + 2) drops the OLDEST.
    for (let i = 0; i < 5; i += 1) m.value.push([TEACH]);
    const held = m.rerender().toasts.map((t) => t.id);
    expect(held, "the paragraph he opened was deleted from the queue under him").toContain(id);
    // …and nothing newer was dropped to keep it: the newest cap-many are all there.
    const newest = held.filter((x) => x !== id);
    expect(newest).toHaveLength(TOAST_MAX_VISIBLE + 2);
    expect(Math.min(...newest)).toBeGreaterThan(id);
    m.unmount();
  });

  it("CLOSING «Защо» gives the cap back: a card nobody is reading is capped like any other (verifier mutant V03)", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([staticObjectToast()]);
    const id = m.rerender().toasts[0]!.id;
    m.value.whyChanged!(id, true);
    m.value.whyChanged!(id, false);
    for (let i = 0; i < 5; i += 1) m.value.push([TEACH]);
    expect(
      m.rerender().toasts.map((t) => t.id),
      "a closed explanation kept its exemption from the queue's cap",
    ).toEqual([6, 5, 4, 3]);
    m.unmount();
  });

  it("…and with nothing open the cap is the cap it always was", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    for (let i = 0; i < 7; i += 1) m.value.push([TEACH]);
    expect(m.rerender().toasts.map((t) => t.id)).toEqual([7, 6, 5, 4]);
    expect(NEW.capToastQueue?.([{ id: 3 }, { id: 2 }, { id: 1 }], 2, new Set([1]))).toEqual([{ id: 3 }, { id: 2 }, { id: 1 }]);
    expect(NEW.capToastQueue!([{ id: 3 }, { id: 2 }, { id: 1 }], 2, new Set())).toEqual([{ id: 3 }, { id: 2 }]);
    m.unmount();
  });

  it("EVERY OTHER CARD STOPS ITS CLOCK while one is read — older AND newer — and runs out what it had left when the column paints it again (W5)", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([TEACH]); // id 1, the «Научи» card — raised at 0, due at 8 000
    at.now = 3_000;
    m.value.push([staticObjectToast()]); // id 2, the fault he will open — due at 11 000
    at.now = 4_000;
    m.value.push([staticObjectToast()]); // id 3, a NEWER fault — due at 12 000
    expect(m.timers.map((t) => t.ms)).toEqual([8_000, 8_000, 8_000]);
    const readClock = m.timers[1]!.id;

    at.now = 5_000;
    expect(typeof m.value.holdAllBut, "the queue cannot stop the clocks of the cards that wait").toBe("function");
    m.value.holdAllBut!(2);
    expect(
      m.timers.map((t) => t.id),
      "a card that is off the glass kept spending its 8 s there",
    ).toEqual([readClock]);

    // Held for fifteen seconds — far past the 8 s the waiting cards started with.
    // Released with the column painting its two newest (React: the column's
    // report first, then the reader's release).
    at.now = 20_000;
    m.value.painted!([3, 2]);
    m.value.holdAllBut!(null);
    expect(m.timers).toHaveLength(2);
    expect(
      m.timers.filter((t) => t.id !== readClock).map((t) => t.ms),
      "the newer card had 7 000 ms left when it was made to wait — and the older one, below the column's two, may not spend its 3 000 unseen",
    ).toEqual([7_000]);
    expect(m.rerender().toasts.map((t) => t.id), "a card made to wait is not a card deleted").toEqual([3, 2, 1]);
    // the column paints it (the card above it has gone): its 3 000 run there
    at.now = 27_000;
    m.value.painted!([3, 1]);
    expect(m.timers.filter((t) => t.id !== readClock).map((t) => t.ms).sort((a, b) => a - b)).toEqual([3_000, 7_000]);
    m.unmount();
  });

  it("A FAULT RAISED WHILE AN EXPLANATION IS OPEN starts with its clock stopped, and gets its whole life when it reaches the glass", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([staticObjectToast()]); // id 1
    at.now = 2_233;
    m.value.whyChanged!(1, true);
    m.value.holdAllBut!(1);
    const readClock = m.timers.map((t) => t.id);

    at.now = 6_000;
    m.value.push([staticObjectToast()]); // id 2 — the rig's SC2 re-strike
    expect(
      m.timers.map((t) => t.id),
      "the re-strike's 8 s started running behind the explanation, where nobody can see the card",
    ).toEqual(readClock);
    expect(m.rerender().toasts.map((t) => t.id)).toEqual([2, 1]);

    at.now = 23_767;
    m.tick(); // the opened card's reading time is over
    m.value.painted!([2]); // the column paints the re-strike…
    m.value.holdAllBut!(null); // …and the reader releases its hold
    expect(m.rerender().toasts.map((t) => t.id)).toEqual([2]);
    expect(m.timers.map((t) => t.ms), "the waiting fault arrives with the 8 s it never spent").toEqual([8_000]);
    m.unmount();
  });

  it("the hold never stops the opened card's own clock", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([staticObjectToast()]); // id 1
    const before = m.timers.map((t) => t.id);
    m.value.holdAllBut!(1);
    expect(m.timers.map((t) => t.id)).toEqual(before);
    m.unmount();
  });

  it("a card opened while it WAITS has the reading time added to what it runs when it returns (verifier mutant V02)", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([staticObjectToast()]); // id 1
    m.value.push([staticObjectToast()]); // id 2
    at.now = 1_000;
    m.value.holdAllBut!(2); // id 1 waits with 7 000 ms left
    m.value.whyChanged!(1, true);
    at.now = 30_000;
    m.value.holdAllBut!(null);
    m.value.painted!([2, 1]);
    const mine = m.timers.map((t) => t.ms).sort((a, b) => a - b);
    expect(mine, "the press on a waiting card bought it nothing").toContain(21_534);
    expect(mine).not.toContain(7_000);
    m.unmount();
  });

  it("a card made to wait is no longer being read: once it is back on the glass and running, the cap may take it like any other", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([staticObjectToast()]); // id 1
    m.value.push([staticObjectToast()]); // id 2
    m.value.whyChanged!(1, true);
    m.value.whyChanged!(2, true);
    m.value.holdAllBut!(2);
    // While it waits it is kept (W5: a graded fault behind an explanation).
    for (let i = 0; i < 5; i += 1) m.value.push([{ kind: "commendation", titleBg: "Браво" }]); // ids 3..7
    expect(m.rerender().toasts.map((t) => t.id)).toContain(1);
    // Released and painted again: it runs, it is not being read — no exemption.
    m.value.painted!([7, 6]);
    m.value.holdAllBut!(null);
    m.value.painted!([2, 1]);
    for (let i = 0; i < 5; i += 1) m.value.push([{ kind: "commendation", titleBg: "Браво" }]); // ids 8..12
    const ids = m.rerender().toasts.map((t) => t.id);
    expect(ids, "the card still being read lost its exemption").toContain(2);
    expect(ids, "a card that waited kept an exemption only a card being read may have").not.toContain(1);
    m.unmount();
  });

  it("dismissing a card drops its clock; clearing drops them all", () => {
    const at = { now: 0 };
    const m = mountQueue(at);
    m.value.push([staticObjectToast()]);
    m.value.push([TEACH]);
    expect(m.timers).toHaveLength(2);
    m.value.dismiss(1);
    expect(m.rerender().toasts.map((t) => t.id)).toEqual([2]);
    m.value.clear();
    expect(m.rerender().toasts).toHaveLength(0);
    // A waiting card that was cleared may not come back when the hold is released.
    m.value.holdAllBut?.(null);
    expect(m.timers).toHaveLength(0);
    expect(code(HUD_SRC)).toMatch(/const dismiss = useCallback\(\s*\(id: number\) => \{\s*lives\.forget\(id\);/);
    m.unmount();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §2  WHICH CARDS ARE ON THE GLASS WHILE ONE IS BEING READ
// ═════════════════════════════════════════════════════════════════════════════

describe("§2 visibleToasts — an opened explanation is the ONE card on the glass; the rest wait and are counted", () => {
  const card = (id: number, kind: "violation" | "lesson" | "commendation" = "lesson") => ({ id, event: { kind } });
  /** Newest first, as the queue holds them. */
  const stack = [card(5), card(4), card(3, "violation"), card(2), card(1)];
  const ids = (list: Array<{ id: number }>) => list.map((t) => t.id);
  const waiting = (...a: Parameters<NonNullable<typeof NEW_PREFS.waitingToasts>>) => {
    expect(typeof NEW_PREFS.waitingToasts, "nothing counts the cards waiting behind an opened explanation").toBe("function");
    return NEW_PREFS.waitingToasts!(...a);
  };

  it("with nothing open it is the function it has always been", () => {
    expect(ids(visibleToasts(stack, false))).toEqual([5, 4]);
    expect(ids(visibleToasts(stack, true))).toEqual([5]);
    expect(ids(visibleToasts(stack, false, null))).toEqual([5, 4]);
    expect(waiting(stack, false, null)).toBe(0);
  });

  it("THE RE-STRIKE (verifier V3): a newer fault does not arrive on top of the opened card — it waits", () => {
    const sc2 = [card(2, "violation"), card(1, "violation")];
    expect(ids(visibleToasts(sc2, false)), "base: newest on top").toEqual([2, 1]);
    for (const held of [false, true]) {
      expect(
        ids(visibleToasts(sc2, false, { id: 1, held })),
        "the newer card is painted above the paragraph he is reading — 124.5 px of push on the rig stage",
      ).toEqual([1]);
      expect(waiting(sc2, false, { id: 1, held })).toBe(1);
    }
  });

  it("QUIET MODE (verifier V6): «едно по едно» stays true — one card, and it is the one he opened", () => {
    const sc2 = [card(2, "violation"), card(1, "violation")];
    expect(TOAST_QUIET_MAX_VISIBLE).toBe(1);
    const painted = ids(visibleToasts(sc2, true, { id: 1, held: false }));
    expect(painted, "two cards under a toggle whose tooltip says one at a time").toHaveLength(1);
    expect(painted).toEqual([1]);
    expect(waiting(sc2, true, { id: 1, held: false })).toBe(1);
  });

  it("the cards UNDER it wait too — the «Научи» card of the rig's column", () => {
    const rig = [card(2, "violation"), card(1)];
    expect(ids(visibleToasts(rig, false, { id: 2, held: false }))).toEqual([2]);
    expect(waiting(rig, false, { id: 2, held: false })).toBe(1);
  });

  it("an opened card newer cards have pushed past the cap is still the one on the glass", () => {
    expect(ids(visibleToasts(stack, false, { id: 3, held: false }))).toEqual([3]);
    expect(waiting(stack, false, { id: 3, held: false }), "every other card in the queue waits behind it").toBe(4);
  });

  it("praise that quiet mode drops is neither painted nor counted", () => {
    const mixed = [card(4, "commendation"), card(3, "violation"), card(2, "commendation"), card(1, "violation")];
    expect(ids(visibleToasts(mixed, true, { id: 1, held: false }))).toEqual([1]);
    expect(waiting(mixed, true, { id: 1, held: false })).toBe(1);
    // out of quiet mode the praise is not counted either (W5): its clock runs,
    // and «още N известия» may count only what will still be there
    expect(waiting(mixed, false, { id: 1, held: false })).toBe(1);
  });

  it("a reading id that is not in the column (expired, or praise in quiet mode) changes nothing", () => {
    expect(ids(visibleToasts(stack, false, { id: 99, held: true }))).toEqual([5, 4]);
    expect(waiting(stack, false, { id: 99, held: true })).toBe(0);
    const praise = [card(2, "commendation"), card(1)];
    expect(ids(visibleToasts(praise, true, { id: 2, held: true }))).toEqual([1]);
    expect(waiting(praise, true, { id: 2, held: true })).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §3  THE YIELD'S PURE HALF, AND THE READ IT IS DECIDED ON
// ═════════════════════════════════════════════════════════════════════════════

describe("§3 toastColumnYieldNext — one step further while the card is short, never back while he reads, nothing when nobody does", () => {
  const next = (...a: [number, boolean, boolean]) => {
    expect(typeof NEW.toastColumnYieldNext, "the column has no rule for what gives way to an opened explanation").toBe("function");
    return NEW.toastColumnYieldNext!(...a);
  };

  it("short → the advisor's card waits; still short → the banner goes to one line; and no further", () => {
    expect(next(0, true, true)).toBe(1);
    expect(next(1, true, true)).toBe(2);
    expect(next(2, true, true)).toBe(2);
  });

  it("a column with room for everything gives up nothing", () => {
    expect(next(0, true, false)).toBe(0);
  });

  it("LATCHED: a column that fits BECAUSE something waits does not get it back while he reads", () => {
    expect(next(1, true, false)).toBe(1);
    expect(next(2, true, false)).toBe(2);
  });

  it("released the moment nobody is reading — whatever the layout says", () => {
    for (const level of [0, 1, 2]) for (const short of [true, false]) expect(next(level, false, short)).toBe(0);
  });
});

// ── the stand-in: elements that answer the reads the product makes ───────────
class El {
  attrs: Record<string, string> = {};
  parentElement: El | null = null;
  children: El[] = [];
  style: Record<string, string> = { position: "" };
  offsetParent: El | null = null;
  clientTop = 0;
  scrollTop = 0;
  topFn: () => number = () => 0;
  heightFn: () => number = () => 0;
  clientFn: () => number = () => 0;
  scrollFn: () => number = () => 0;
  get offsetTop() {
    return Math.round(this.topFn());
  }
  get offsetHeight() {
    return Math.round(this.heightFn());
  }
  get clientHeight() {
    return Math.round(this.clientFn());
  }
  get scrollHeight() {
    return Math.round(this.scrollFn());
  }
  getAttribute(n: string) {
    return n in this.attrs ? this.attrs[n]! : null;
  }
  add(c: El) {
    c.parentElement = this;
    this.children.push(c);
    return c;
  }
  querySelector(sel: string): El | null {
    const m = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (m === null) throw new Error(`the stand-in cannot answer ${sel}`);
    const walk = (el: El): El | null => {
      for (const c of el.children) {
        const v = c.getAttribute(m[1]!);
        if (v !== null && (m[2] === undefined || v === m[2])) return c;
        const d = walk(c);
        if (d !== null) return d;
      }
      return null;
    };
    return walk(this);
  }
}

const RIG = {
  cap: 467.5,
  gap: 6,
  stackGap: 8,
  bannerOneLine: 48.7,
  bannerPinned: 76.2,
  advisor: 98.3,
  pill: 23.5,
  row: 23.5,
  summary: 116.5,
  opened: 295.5,
  teach: 309.8,
  /** header + title + footer of the opened card: 295.5 less its 198 px body (66.5 → 264.5). */
  pinned: 97.5,
} as const;

interface ModelCard {
  id: number;
  px: number;
  why?: "open" | "closed";
}

/**
 * The shell's roomy column as flexbox lays it out: banner, advisor card (when
 * it is mounted), recall pill, the toast scroller (its content's height, shrunk
 * to what the cap leaves), and the fold row when the shell's count says so.
 * The card being read shrinks to that window, down to its pinned rows plus the
 * one-line floor, and its body box reports what it cannot show.
 */
function column(start: { bannerPx: number; advisorPrompt: boolean; cards: ModelCard[]; capPx?: number }) {
  const s = { capPx: RIG.cap as number, ...start, rowUp: false, reader: null as Reader | null };
  const floor = () => NEW.TOAST_READ_FLOOR_PX ?? 16.5;
  const advisorMounted = () => s.advisorPrompt && s.reader?.held !== true;
  const bannerPx = () => (s.reader?.bannerYields === true ? Math.min(s.bannerPx, RIG.bannerOneLine) : s.bannerPx);
  const painted = () =>
    visibleToasts(
      s.cards.map((c) => ({ ...c, event: { kind: c.why === undefined ? "lesson" : "violation" } })),
      false,
      s.reader?.reading ?? null,
    );
  const readId = () => {
    const reading = s.reader?.reading ?? null;
    return reading !== null && painted().some((c) => c.id === reading.id) ? reading.id : null;
  };
  const above = () =>
    bannerPx() + RIG.gap + (advisorMounted() ? RIG.advisor + RIG.gap : 0) + RIG.pill + RIG.gap;
  const natural = () => {
    const c = painted();
    return c.reduce((a, x) => a + x.px, 0) + RIG.stackGap * Math.max(0, c.length - 1);
  };
  const windowPx = (withRow: boolean) =>
    Math.max(0, Math.min(natural(), s.capPx - above() - (withRow ? RIG.gap + RIG.row : 0)));
  const laidOut = (c: ModelCard, withRow: boolean) =>
    c.id === readId() ? Math.max(RIG.pinned + floor(), Math.min(c.px, windowPx(withRow))) : c.px;

  const columnEl = new El();
  const scroller = columnEl.add(new El());
  const stack = scroller.add(new El());
  stack.attrs["data-hud"] = "toasts";
  const row = new El();
  row.attrs[TOAST_MORE_SELECTOR.slice(1, -1)] = "";
  const rowInFlow = () => s.rowUp && row.style.position !== "absolute";
  scroller.offsetParent = columnEl;
  scroller.topFn = above;
  scroller.clientFn = () => windowPx(rowInFlow());
  let readBox: El | null = null;
  /** Lay the committed tree out — what React's commit does to the DOM. */
  const commit = () => {
    stack.children = [];
    readBox = null;
    columnEl.children = s.rowUp ? [scroller, row] : [scroller];
    row.parentElement = s.rowUp ? columnEl : null;
    const cards = painted();
    cards.forEach((c, i) => {
      const el = stack.add(new El());
      el.offsetParent = columnEl;
      el.topFn = () => above() + cards.slice(0, i).reduce((a, x) => a + laidOut(x, rowInFlow()) + RIG.stackGap, 0);
      el.heightFn = () => laidOut(c, rowInFlow());
      if (c.why === undefined) return;
      const box = el.add(new El());
      if (c.id === readId() && NEW.TOAST_READ_ATTR !== undefined) {
        box.attrs[NEW.TOAST_READ_ATTR] = "";
        box.clientFn = () => laidOut(c, rowInFlow()) - RIG.pinned;
        box.scrollFn = () => Math.max(c.px, laidOut(c, rowInFlow())) - RIG.pinned;
        readBox = box;
      }
      box.add(new El()).attrs[TOAST_WHY_ATTR] = c.why;
    });
  };
  /** The shell's fold probe, with the row out of the column. */
  const foldNeeded = () => {
    let top = 0;
    for (const c of painted()) {
      const h = laidOut(c, false);
      if (top + h > windowPx(false) + TOAST_FIT_SLACK_PX) return true;
      if (c.id === readId() && c.px - h > TOAST_FIT_SLACK_PX) return true;
      top += h + RIG.stackGap;
    }
    return false;
  };
  const cardAt = (id: number) => {
    let top = 0;
    for (const c of painted()) {
      const h = laidOut(c, s.rowUp);
      if (c.id === id) {
        const w = windowPx(s.rowUp);
        return { top, px: h, window: w, fit: toastCardInWindow(top, h, w), hiddenPx: Math.max(0, c.px - h) };
      }
      top += h + RIG.stackGap;
    }
    return null;
  };
  return { s, scroller, row, commit, foldNeeded, cardAt, advisorMounted, bannerPx, painted, windowPx, readBox: () => readBox };
}

function mountReader(model: ReturnType<typeof column>) {
  const calls = { why: [] as Array<[number, boolean]>, hold: [] as Array<number | null> };
  expect(typeof NEW.useToastReader, "there is no reader: nothing holds the column for an opened explanation").toBe("function");
  const m = mountHook(
    () => {
      const reader = NEW.useToastReader!({
        toasts: model.s.cards,
        scroller: { current: model.scroller },
        whyChanged: (id, open) => calls.why.push([id, open]),
        holdAllBut: (id) => calls.hold.push(id),
      });
      model.s.reader = reader;
      model.commit();
      return reader;
    },
    { globals: { HTMLElement: El } },
  );
  /** Commit → effects → the shell's own fold measure, until nothing moves. */
  const settle = () => {
    for (let i = 0; i < 6; i += 1) {
      m.settle(1);
      model.s.rowUp = model.foldNeeded();
    }
    return m.settle(1);
  };
  return { m, calls, settle };
}

describe("§3 readOpenedToastShortPx — how much of the opened paragraph its body box cannot show, asked of the column WITHOUT the fold row", () => {
  const read = (el: unknown) => {
    expect(typeof NEW.readOpenedToastShortPx, "nothing measures whether the opened card is short").toBe("function");
    return NEW.readOpenedToastShortPx!(el);
  };

  function cell(capPx: number) {
    const model = column({ bannerPx: RIG.bannerOneLine, advisorPrompt: false, capPx, cards: [{ id: 1, px: RIG.opened, why: "open" }] });
    model.s.reader = { reading: { id: 1, held: false }, held: false, bannerYields: false, onWhyChange: () => {}, recheck: () => {} };
    return model;
  }

  it("no card is being read in this scroller: no claim", () => {
    const model = column({ bannerPx: RIG.bannerOneLine, advisorPrompt: false, cards: [{ id: 1, px: RIG.summary, why: "closed" }] });
    model.commit();
    expect(read(model.scroller)).toBeNull();
  });

  it("the rig stage, one-line banner: the 295.5 px card is whole — 0 px short", () => {
    const model = cell(RIG.cap);
    model.commit();
    expect(read(model.scroller)).toBe(0);
  });

  it("the /simulator stage (cap 322): 58 px of the paragraph are below the box's foot", () => {
    const model = cell(322);
    model.commit();
    // window 322 − 54.7 − 29.5 = 237.8 → body 140.3 of 198
    expect(read(model.scroller)).toBe(58);
  });

  it("THE FOLD ROW IS NOT THE WINDOW: short 13 px without the row is what is reported, not the 42 with it — and the row is put back", () => {
    // cap 367 (an immersive 1366×768 viewport is 367.2): window 282.8 without the row, 253.3 with it
    const model = cell(367);
    model.s.rowUp = true;
    model.commit();
    const box = model.readBox()!;
    expect(box.scrollHeight - box.clientHeight, "as it stands, the row takes 29.5 px more").toBe(42);
    expect(read(model.scroller)).toBe(13);
    expect(model.row.style.position, "the probe left the fold row out of flow").toBe("");
    expect(box.scrollHeight - box.clientHeight).toBe(42);
  });

  it("…and the probe is not run for a card that is whole beside the row", () => {
    const model = cell(RIG.cap);
    model.s.rowUp = true;
    model.commit();
    let touched = 0;
    Object.defineProperty(model.row.style, "position", {
      get: () => "",
      set: () => {
        touched += 1;
      },
    });
    expect(read(model.scroller)).toBe(0);
    expect(touched).toBe(0);
  });

  it("a body box that has not been laid out (0 px) is no claim, never «everything is hidden»", () => {
    const model = cell(RIG.cap);
    model.commit();
    model.readBox()!.clientFn = () => 0;
    expect(read(model.scroller)).toBeNull();
  });

  it("where the student has paged to is not the column's room: a scrolled box reports the same shortage, and keeps its place", () => {
    const model = cell(322);
    model.s.rowUp = true;
    model.commit();
    model.readBox()!.scrollTop = 60;
    expect(read(model.scroller)).toBe(58);
    expect(model.readBox()!.scrollTop).toBe(60);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §4  THE YIELD, RUN — `useToastReader` on the sidecar's column
// ═════════════════════════════════════════════════════════════════════════════

describe("§4 the stand-in column IS the rig's column — held to the sidecar's own windows first", () => {
  it("at the press (no reader): scroller 344.7 → 698.5 with the fold row up for the «Научи» card", () => {
    const model = column({
      bannerPx: RIG.bannerOneLine,
      advisorPrompt: false,
      cards: [
        { id: 2, px: RIG.summary, why: "closed" },
        { id: 1, px: RIG.teach },
      ],
    });
    model.s.rowUp = model.foldNeeded();
    model.commit();
    expect(model.s.rowUp).toBe(true);
    expect(260.5 + model.scroller.offsetTop).toBeCloseTo(344.7, 0);
    expect(model.windowPx(true)).toBeCloseTo(698.5 - 344.7, 1);
  });

  it("after the crash pins the car, WITH the advisor's card and no reader: 476.5 → 698.5, the opened card cut 73.5 px", () => {
    const model = column({
      bannerPx: RIG.bannerPinned,
      advisorPrompt: true,
      cards: [{ id: 2, px: RIG.opened, why: "open" }],
    });
    model.s.rowUp = true;
    model.commit();
    expect(260.5 + model.scroller.offsetTop).toBeCloseTo(476.5, 0);
    const at = model.cardAt(2)!;
    expect(at.window).toBeCloseTo(222, 1);
    expect(at.fit).toBe("cut");
    expect(at.top + at.px - at.window).toBeCloseTo(73.5, 1);
  });
});

describe("§4 THE RIG'S DRIVE: press «ЗАЩО», then the crash pins the car and the advisor posts its card", () => {
  /** The column at the press: one-line banner, pill, the fault card, the «Научи» card under it. */
  function atThePress(capPx: number = RIG.cap) {
    const model = column({
      bannerPx: RIG.bannerOneLine,
      advisorPrompt: false,
      capPx,
      cards: [
        { id: 2, px: RIG.summary, why: "closed" },
        { id: 1, px: RIG.teach },
      ],
    });
    model.s.rowUp = model.foldNeeded();
    const r = mountReader(model);
    return { model, ...r };
  }
  function press(t: ReturnType<typeof atThePress>) {
    t.model.s.cards[0] = { id: 2, px: RIG.opened, why: "open" };
    t.m.value.onWhyChange(2, true);
    return t.settle();
  }
  function crashPins(t: ReturnType<typeof atThePress>) {
    t.model.s.bannerPx = RIG.bannerPinned;
    t.model.s.advisorPrompt = true;
    return t.settle();
  }

  it("the hook holds nothing while nothing is open", () => {
    const t = atThePress();
    const reader = t.settle();
    expect(reader.reading).toBeNull();
    expect(reader.held).toBe(false);
    expect(reader.bannerYields).toBe(false);
    expect(t.calls.hold.every((id) => id === null)).toBe(true);
    expect(t.model.painted().map((c) => c.id)).toEqual([2, 1]);
    t.m.unmount();
  });

  it("THE PRESS: reported to the queue; the opened card is alone on the glass and every other card's clock is stopped; nothing above it gives way", () => {
    const t = atThePress();
    const reader = press(t);
    expect(t.calls.why).toEqual([[2, true]]);
    expect(reader.reading).toEqual({ id: 2, held: false });
    expect(reader.bannerYields).toBe(false);
    expect(t.model.painted().map((c) => c.id), "the «Научи» card is still under the paragraph, and its fold row over it").toEqual([2]);
    expect(t.calls.hold[t.calls.hold.length - 1]).toBe(2);
    expect(t.model.s.rowUp, "the fold row raised for the card below outlived that card").toBe(false);
    const at = t.model.cardAt(2)!;
    expect(at.px).toBe(RIG.opened);
    expect(at.fit).toBe("whole");
    // the sidecar: 344.7 → 640.2
    expect(260.5 + t.model.scroller.offsetTop).toBeCloseTo(344.7, 0);
    t.m.unmount();
  });

  it("THE FRAME (pc-L3-F-ON-WHY-28): the advisor's card waits, the paragraph and its law chip are whole — and the banner KEEPS its recovery order", () => {
    const t = atThePress();
    press(t);
    const reader = crashPins(t);
    expect(reader.held, "the column cannot hold the paragraph beside the advisor's card and nothing gave way").toBe(true);
    expect(t.model.advisorMounted()).toBe(false);
    expect(reader.bannerYields, "the banner was cut to one line on a stage where the advisor's wait was enough").toBe(false);
    expect(t.model.bannerPx()).toBe(RIG.bannerPinned);
    const at = t.model.cardAt(2)!;
    // the round-1 arithmetic, kept: the card stands 372.2 → 667.7 in a window to 728
    expect(260.5 + t.model.scroller.offsetTop).toBeCloseTo(372.2, 0);
    expect(at.px).toBe(RIG.opened);
    expect(at.fit).toBe("whole");
    expect(at.hiddenPx).toBe(0);
    expect(t.model.s.rowUp).toBe(false);
    t.m.unmount();
  });

  it("LATCHED: the column now fits BECAUSE the card waits — re-asking does not bring it back", () => {
    const t = atThePress();
    press(t);
    crashPins(t);
    for (let i = 0; i < 4; i += 1) {
      const again = t.settle();
      expect(again.held).toBe(true);
      expect(t.model.advisorMounted()).toBe(false);
    }
    t.m.unmount();
  });

  it("he closes it: everything comes back — the advisor's card, the card below, every clock", () => {
    const t = atThePress();
    press(t);
    crashPins(t);
    t.model.s.cards[0] = { id: 2, px: RIG.summary, why: "closed" };
    t.m.value.onWhyChange(2, false);
    const reader = t.settle();
    expect(t.calls.why[t.calls.why.length - 1]).toEqual([2, false]);
    expect(reader.reading).toBeNull();
    expect(reader.held).toBe(false);
    expect(t.model.advisorMounted()).toBe(true);
    expect(t.model.painted().map((c) => c.id)).toEqual([2, 1]);
    expect(t.calls.hold[t.calls.hold.length - 1]).toBeNull();
    t.m.unmount();
  });

  it("the card leaves (expiry, ✕) while the column has yielded: the yield goes with it — no report needed", () => {
    const t = atThePress();
    press(t);
    crashPins(t);
    t.model.s.cards = [{ id: 1, px: RIG.teach }];
    const reader = t.settle();
    expect(reader.reading).toBeNull();
    expect(reader.held).toBe(false);
    expect(t.model.advisorMounted()).toBe(true);
    expect(t.calls.hold[t.calls.hold.length - 1]).toBeNull();
    t.m.unmount();
  });

  it("a yield taken for one card is not a measurement of the next one he opens", () => {
    const t = atThePress();
    press(t);
    expect(crashPins(t).held).toBe(true);
    // the crash is recovered, the first card is gone, a second fault is opened in a roomy column
    t.model.s.bannerPx = RIG.bannerOneLine;
    t.model.s.advisorPrompt = false;
    t.model.s.cards = [{ id: 3, px: RIG.opened, why: "open" }];
    t.m.value.onWhyChange(3, true);
    const reader = t.settle();
    expect(reader.reading).toEqual({ id: 3, held: false });
    t.m.unmount();
  });

  it("closing ANOTHER card's «Защо» does not end the reading of the open one (verifier mutant V07)", () => {
    const t = atThePress();
    press(t);
    t.m.value.onWhyChange(1, false);
    const reader = t.settle();
    expect(reader.reading, "a close reported for a different card closed this one").toEqual({ id: 2, held: false });
    t.m.unmount();
  });

  it("THE /simulator STAGE (cap 322): both steps are taken, the card still does not fit — and it SCROLLS INSIDE, announced, never cut", () => {
    const t = atThePress(322);
    press(t);
    const reader = crashPins(t);
    expect(reader.held).toBe(true);
    expect(reader.bannerYields, "the last step was not taken on a stage where the paragraph is still short").toBe(true);
    expect(t.model.advisorMounted()).toBe(false);
    expect(t.model.bannerPx()).toBe(RIG.bannerOneLine);
    const at = t.model.cardAt(2)!;
    expect(at.fit, "the opened card crosses the foot of its window").toBe("whole");
    expect(at.px).toBeLessThan(RIG.opened);
    expect(at.hiddenPx).toBeGreaterThan(TOAST_FIT_SLACK_PX);
    expect(t.model.s.rowUp, "a paragraph that does not fit is not announced").toBe(true);
    // with the row up: window 322 − 54.7 − 29.5 − 29.5 = 208.3, body 110.8 of 198
    expect(at.px).toBeCloseTo(208.3, 1);
    t.m.unmount();
  });

  it("ONE STEP AT A TIME, each before paint: the banner's lead is asked for only after the advisor's wait was not enough", () => {
    const t = atThePress(322);
    t.model.s.bannerPx = RIG.bannerPinned;
    t.model.s.advisorPrompt = true;
    t.model.s.cards[0] = { id: 2, px: RIG.opened, why: "open" };
    t.m.value.onWhyChange(2, true);
    const steps: Array<[boolean, boolean]> = [];
    for (let i = 0; i < 4; i += 1) {
      const reader = t.m.settle(1);
      steps.push([reader.held, reader.bannerYields]);
    }
    expect(steps[0]).toEqual([true, false]);
    expect(steps[1]).toEqual([true, true]);
    expect(steps[3]).toEqual([true, true]);
    t.m.unmount();
  });

  it("A LAYOUT CHANGE NO COMMIT ANNOUNCES is answered by `recheck` — the shell's ResizeObserver path (verifier mutant V08)", () => {
    const t = atThePress();
    press(t);
    // the window is resized: the column's cap falls to the /simulator stage's, with the advisor standing
    t.model.s.advisorPrompt = true;
    t.model.s.capPx = 322;
    t.model.commit();
    expect(t.m.value.held).toBe(false);
    // no commit — only the observer's call, against the reader as it last rendered
    t.model.s.reader!.recheck();
    const reader = t.m.rerender();
    expect(reader.held, "`recheck` read the column and changed nothing").toBe(true);
    t.m.unmount();
  });

  it("no scroller (the popup rig, a phone): nothing is read, nothing above yields — and the press still reaches the queue", () => {
    const calls: Array<[number, boolean]> = [];
    const holds: Array<number | null> = [];
    const m = mountHook(
      () =>
        NEW.useToastReader!({
          toasts: [{ id: 1 }],
          scroller: { current: null },
          whyChanged: (id, open) => calls.push([id, open]),
          holdAllBut: (id) => holds.push(id),
        }),
      { globals: { HTMLElement: El } },
    );
    m.value.onWhyChange(1, true);
    const reader = m.settle(2);
    expect(calls).toEqual([[1, true]]);
    expect(reader.reading).toEqual({ id: 1, held: false });
    expect(reader.bannerYields).toBe(false);
    expect(holds[holds.length - 1]).toBe(1);
    m.unmount();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §5  THE SHELL SPENDS IT — pinned by source, comments stripped
// ═════════════════════════════════════════════════════════════════════════════

describe("§5 the shell spends the reading in five places, and the card reports its press", () => {
  const SHELL = code(SHELL_SRC);
  const HUD = code(HUD_SRC);

  it("the shell mounts the reader on its own scroller and the queue's two levers", () => {
    expect(SHELL).toMatch(/const \{[^}]*\bwhyChanged\b[^}]*\bholdAllBut\b[^}]*\} = useHudToastQueue\(\)/);
    const mount = SHELL.match(/const toastReader = useToastReader\(\{([\s\S]*?)\}\);/);
    expect(mount, "the shell does not mount useToastReader").not.toBeNull();
    for (const arg of ["toasts", "scroller: toastScrollRef", "whyChanged", "holdAllBut"]) {
      expect(mount![1]).toContain(arg);
    }
  });

  it("1 · the advisor's card waits while the column has yielded", () => {
    const chain = SHELL.match(/\{advisorOn &&[\s\S]*?<AdvisorCard/);
    expect(chain).not.toBeNull();
    expect(chain![0]).toContain("!toastReader.held &&");
  });

  it("2 · the banner under a hold goes to ONE LINE at the last step — its sentence, and the field it reads, untouched", () => {
    // the base's expression, byte for byte: the banner and the follow-hint pill still read one field
    expect(SHELL).toContain("titleBg={objectiveTitleUnderHold(bannerObjectiveLineBg(snap), snap.objectiveHold)}");
    expect(SHELL).toContain("oneLine={bannerOneLineWhileReading(snap.objectiveHold, toastReader.bannerYields)}");
    expect(SHELL).toMatch(
      /export function bannerOneLineWhileReading\(hold: RouteHold \| null, bannerYields: boolean\): boolean \{\s*return bannerYields && hold !== null;\s*\}/,
    );
  });

  it("3 · HudToasts is told which card is being read, reports the press, and gets the fade for the box that scrolls", () => {
    const mount = SHELL.match(/<HudToasts[\s\S]*?\/>/);
    expect(mount).not.toBeNull();
    expect(mount![0]).toContain("reading={toastReader.reading}");
    expect(mount![0]).toContain("onWhyChange={toastReader.onWhyChange}");
    expect(mount![0]).toContain("readMaskCss={toastsBelowFold > 0 && toastFoldInRead ? TOAST_FADE_MASK_CSS : null}");
    // a `scroll` does not bubble: the wheel over the paragraph reaches the fold row only through this
    expect(mount![0]).toContain("onReadScroll={measureToastFold}");
    // …and the scroller's own fade is for the scroller's own fold only: its foot is then the pinned law chip
    expect(SHELL).toContain("WebkitMaskImage: toastFoldInRead ? undefined : TOAST_FADE_MASK_CSS,");
    expect(SHELL).toContain("maskImage: toastFoldInRead ? undefined : TOAST_FADE_MASK_CSS,");
    expect(SHELL).toContain("setToastFoldInRead(fold.belowFold > 0 && measureToastReadFold(el));");
  });

  it("4 · the fold row's own count uses the same rule for which cards are on the glass, and its press pages the box being read", () => {
    expect(SHELL).toContain("const toastsShownCount = visibleToasts(toasts, toastsQuiet, toastReader.reading).length;");
    const reveal = SHELL.match(/const revealMoreToasts = useCallback\(\(\) => \{([\s\S]*?)\}, \[measureToastFold\]\);/);
    expect(reveal).not.toBeNull();
    expect(reveal![1]).toMatch(
      /if \(!pageToastRead\(el\)\) \{\s*el\.scrollTop = toastPageScrollTop\(el\.scrollTop, el\.clientHeight, el\.scrollHeight\);\s*\}/,
    );
    expect(reveal![1]).toContain("measureToastFold();");
  });

  it("5 · the full-frame debrief waits for it — and that is the ONLY place the end of the session meets the reader", () => {
    expect(SHELL).toContain("reading: !compact && toastReader.reading !== null,");
    // the END itself: where it was, reading nothing of this
    expect(SHELL).toContain("const ended = result !== null;");
    const finalize = SHELL.match(/const finalize = useCallback\(([\s\S]*?)\n  \);/);
    expect(finalize).not.toBeNull();
    expect(finalize![1]).not.toMatch(/toastReader|reading/);
    const tick = SHELL.match(/const handleTick = useCallback\(([\s\S]*?)\n  \);/);
    expect(tick).not.toBeNull();
    expect(tick![1]).not.toMatch(/toastReader/);
    const uses = SHELL.split("toastReader.reading").length - 1;
    expect(uses, "the reader's `reading` is read somewhere this file does not know about").toBe(5);
  });

  it("…the column's ResizeObserver re-asks the reader, and the row is re-asked BEFORE PAINT when the reading changes", () => {
    const measure = SHELL.match(/const measureToastFold = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/);
    expect(measure).not.toBeNull();
    expect(measure![1]).toContain("toastReaderRecheckRef.current();");
    expect(SHELL).toMatch(
      /useLayoutEffect\(\(\) => \{\s*measureToastFold\(\);\s*\}, \[measureToastFold, toastReadingId, toastReader\.held, toastReader\.bannerYields\]\);/,
    );
    // …with the reader's CURRENT `recheck`, not the one of the render before: the ref is set in the layout phase too
    expect(SHELL).toMatch(/useLayoutEffect\(\(\) => \{\s*toastReaderRecheckRef\.current = toastReader\.recheck;\s*\}\);/);
    expect(SHELL.indexOf("toastReaderRecheckRef.current = toastReader.recheck;")).toBeLessThan(SHELL.indexOf("[measureToastFold, toastReadingId, toastReader.held, toastReader.bannerYields]"));
  });

  it("the card reports the value the press produced, from the handler — and every card passes it its own id", () => {
    expect(HUD).toMatch(
      /const toggleWhy = useCallback\(\(\) => \{\s*const open = !whyOpen;\s*setWhyOpen\(open\);\s*onWhyChange\?\.\(open\);\s*\}, \[whyOpen, onWhyChange\]\);/,
    );
    expect(HUD).toContain("onWhyChange={onWhyChange ? (open) => onWhyChange(t.id, open) : undefined}");
    expect(HUD).toContain("const shown = visibleToasts(toasts, quiet, reading);");
  });

  it("the reader's check runs after every commit, before paint — a layout effect with no dependency list", () => {
    expect(HUD).toMatch(/useLayoutEffect\(\(\) => \{\s*setYieldLevel\(yieldTarget\(scrollerRef\.current\)\);\s*\}\);/);
  });
});

/** The type of a queue toast is unchanged — the column still reads `HudToast[]`. */
const _typeCheck: HudToast[] = [];
void _typeCheck;

// ═════════════════════════════════════════════════════════════════════════════
// §6  THE COLUMN, MOUNTED — the press, the read layout, the count
// ═════════════════════════════════════════════════════════════════════════════

describe("§6 the column, MOUNTED", () => {
  type Tree = { type: unknown; props: Record<string, unknown> };
  const isElement = (n: unknown): n is Tree =>
    typeof n === "object" && n !== null && "type" in n && "props" in n;
  /** Depth-first: the first element of the tree that satisfies `pick`. */
  function find(node: unknown, pick: (el: Tree) => boolean): Tree | null {
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = find(child, pick);
        if (hit !== null) return hit;
      }
      return null;
    }
    if (!isElement(node)) return null;
    if (pick(node)) return node;
    return find(node.props.children, pick);
  }
  const call = (el: Tree) => (el.type as (p: unknown) => unknown)(el.props) as Tree;

  /**
   * `HudToasts` → its card component → `ViolationToast` → `ToastShell`, each
   * CALLED with the harness's dispatcher so their hooks run — the tree a
   * renderer would build, one level at a time.
   */
  function mountColumn(props: Parameters<typeof Hud.HudToasts>[0]) {
    const m = mountHook(() => {
      const root = Hud.HudToasts(props) as unknown as Tree | null;
      const wrapper = root;
      const stack = find(root, (el) => el.props["data-hud"] === "toasts");
      const cards = stack === null ? [] : (stack.props.children as Tree[]);
      const cardEl = find(root, (el) => typeof el.type === "function" && "event" in el.props);
      if (cardEl === null) return { wrapper, stack, cards, shell: null, card: null, chip: null, readBox: null, footer: null, badge: null };
      // `ToastCard` hands back the <ViolationToast> element; that one, called, the <ToastShell> element.
      const shell = call(call(cardEl));
      // the shell component rendered: the card's own root element (`<button>`)
      const card = call(shell);
      // The chip is its own component: call it too, so the attribute read below
      // is the one the DOM (and the reader's `querySelector`) would see.
      const chipEl = find(shell.props.children, (el) => typeof el.type === "function" && typeof el.props.open === "boolean");
      const chip = chipEl === null ? null : call(chipEl);
      const readBox = find(shell.props.children, (el) => el.type === "div" && el.props.className === "mt-1 flow-root");
      const footerEl = find(shell.props.children, (el) => typeof el.type === "function" && "lawRef" in el.props);
      const footer = footerEl === null ? null : (call(footerEl) as Tree | null);
      const badge = footer === null ? null : find(footer, (el) => "data-hud-toast-waiting" in el.props);
      return { wrapper, stack, cards, shell, card, chip, readBox, footer, badge };
    });
    /** The body-choice slot: the fit measurement has no card to read here, so the
     *  test puts the card where the product puts it when the paragraph is cut. */
    const summarise = () => {
      const slot = m.slots.find((s) => s.v === "pending" || s.v === "paragraph");
      expect(slot, "the card's body choice is not where this harness looks for it").toBeDefined();
      slot!.v = "summary";
      return m.rerender();
    };
    return { m, summarise };
  }

  const toast = (id: number): HudToast => ({ id, event: staticObjectToast(), raisedAtMs: 0 });
  type Props = Parameters<typeof Hud.HudToasts>[0];
  const withReader = (extra: Record<string, unknown>): Props => extra as unknown as Props;

  it("open, then close: (id, true), (id, false) — and the chip says which way it now goes", () => {
    const reported: Array<[number, boolean]> = [];
    const { m, summarise } = mountColumn(
      withReader({ toasts: [toast(7)], onDismiss: () => undefined, onWhyChange: (id: number, open: boolean) => reported.push([id, open]) }),
    );
    let v = summarise();
    expect(v.chip?.props[TOAST_WHY_ATTR], "a summarised card prints its chip closed").toBe("closed");
    expect(typeof v.shell!.props.onWhy).toBe("function");

    (v.shell!.props.onWhy as () => void)();
    v = m.rerender();
    expect(reported, "the press opened the paragraph and told nobody").toEqual([[7, true]]);
    expect(v.chip?.props[TOAST_WHY_ATTR]).toBe("open");

    (v.shell!.props.onWhy as () => void)();
    v = m.rerender();
    expect(reported).toEqual([
      [7, true],
      [7, false],
    ]);
    expect(v.chip?.props[TOAST_WHY_ATTR]).toBe("closed");
    m.unmount();
  });

  it("with no listener (the popup rig) the chip still toggles — the report is optional, the press is not", () => {
    const { m, summarise } = mountColumn({ toasts: [toast(3)], onDismiss: () => undefined });
    let v = summarise();
    (v.shell!.props.onWhy as () => void)();
    v = m.rerender();
    expect(v.chip?.props[TOAST_WHY_ATTR]).toBe("open");
    m.unmount();
  });

  it("the column paints `visibleToasts(toasts, quiet, reading)`: while one card is read it is the only card in the tree", () => {
    const older: HudToast = { id: 1, event: TEACH, raisedAtMs: 0 };
    const newer: HudToast = { id: 3, event: staticObjectToast(), raisedAtMs: 0 };
    const count = (reading: { id: number; held: boolean } | null, quiet = false) => {
      const m = mountHook(() => Hud.HudToasts(withReader({ toasts: [newer, toast(2), older], reading, quiet })));
      const stack = find(m.value, (el) => el.props["data-hud"] === "toasts");
      const n = (stack!.props.children as unknown[]).length;
      m.unmount();
      return n;
    };
    expect(count(null)).toBe(2);
    expect(count({ id: 2, held: false }), "a card stands above or below the explanation he is reading").toBe(1);
    expect(count({ id: 2, held: true })).toBe(1);
    expect(count({ id: 2, held: false }, true)).toBe(1);
  });

  // ── W2: the read layout ────────────────────────────────────────────────────
  const classes = (el: Tree | null) => String(el?.props.className ?? "").split(/\s+/);

  /** The column with card 7 summarised and its «Защо» pressed open. */
  function opened(extra: Record<string, unknown>) {
    const { m, summarise } = mountColumn(withReader({ toasts: [toast(9), toast(7)], onDismiss: () => undefined, ...extra }));
    let v = summarise();
    (v.shell!.props.onWhy as () => void)();
    v = m.rerender();
    return { m, v };
  }

  it("BEING READ: the wrapper, the stack and the card may shrink to the window (`min-h-0`), and the card is a flex column", () => {
    const { m, v } = opened({ reading: { id: 7, held: false } });
    expect(classes(v.wrapper), "the box between the shell's scroller and the stack cannot shrink").toContain("min-h-0");
    expect(classes(v.stack)).toContain("min-h-0");
    for (const c of ["flex", "min-h-0", "flex-col"]) expect(classes(v.card), `the card being read is missing ${c}`).toContain(c);
    m.unmount();
  });

  it("BEING READ: the body box is the ONE box that scrolls — named for the shell, floored at one line, the law chip's row outside it", () => {
    const onReadScroll = () => undefined;
    const { m, v } = opened({ reading: { id: 7, held: false }, onReadScroll });
    const box = v.readBox!;
    expect(NEW.TOAST_READ_ATTR, "the body box has no name the shell's fold row can find").toBe("data-hud-toast-read");
    expect(box.props[NEW.TOAST_READ_ATTR!]).toBe("");
    expect(box.props.className, "the body box no longer contains the chip's float").toBe("mt-1 flow-root");
    expect(NEW.TOAST_READ_FLOOR_PX, "one line of `text-xs leading-snug`: 12 px × 1.375").toBe(16.5);
    expect(box.props.style, "the body box is not a scroll container: the squeeze cuts the card instead").toEqual({
      minHeight: 16.5,
      overflowY: "auto",
      overscrollBehavior: "contain",
      scrollbarWidth: "thin",
      scrollbarColor: "var(--border-strong) transparent",
    });
    // a wheel or a drag of its bar is reported (it does not bubble to the shell's scroller)
    expect(box.props.onScroll, "the fold row cannot hear the paragraph being scrolled").toBe(onReadScroll);
    // the paragraph is inside the box, the footer (law chip, age, count) is not
    const body = find(box.props.children, (el) => el.type === "p");
    expect(body?.props["data-hud-toast-body"]).toBe("paragraph");
    expect(find(box.props.children, (el) => typeof el.type === "function" && "lawRef" in el.props)).toBeNull();
    expect(v.footer, "the law chip's row left the card").not.toBeNull();
    expect(classes(v.footer)).not.toContain("overflow-y-auto");
    m.unmount();
  });

  it("the fade is on the body box, and only while the shell says more of the paragraph is below", () => {
    expect(typeof NEW.toastReadBoxStyle).toBe("function");
    expect(NEW.toastReadBoxStyle!(null)).not.toHaveProperty("maskImage");
    const MASK = "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)";
    expect(NEW.toastReadBoxStyle!(MASK)).toMatchObject({ overflowY: "auto", WebkitMaskImage: MASK, maskImage: MASK });
    const a = opened({ reading: { id: 7, held: false }, readMaskCss: MASK });
    expect((a.v.readBox!.props.style as Record<string, unknown>).maskImage).toBe(MASK);
    a.m.unmount();
    const b = opened({ reading: { id: 7, held: false }, readMaskCss: null });
    expect((b.v.readBox!.props.style as Record<string, unknown>).maskImage).toBeUndefined();
    b.m.unmount();
  });

  it("NOT BEING READ — nothing changes: no reader (the popup rig), a closed chip, or another card's reading leave the card exactly as it shipped", () => {
    const asShipped = (v: ReturnType<ReturnType<typeof mountColumn>["m"]["rerender"]>) => {
      expect(classes(v.wrapper)).not.toContain("min-h-0");
      expect(classes(v.stack)).not.toContain("min-h-0");
      expect(v.wrapper!.props.className).toBe("pointer-events-none flex flex-col items-end gap-2 select-none");
      expect(v.stack!.props.className).toBe("flex w-full flex-col items-end gap-2");
      expect(classes(v.card)).not.toContain("min-h-0");
      expect(classes(v.card)).not.toContain("flex-col");
      expect(v.readBox!.props.className).toBe("mt-1 flow-root");
      expect(v.readBox!.props.style).toBeUndefined();
      expect(v.readBox!.props["data-hud-toast-read"]).toBeUndefined();
      expect(v.readBox!.props.onScroll).toBeUndefined();
      expect(v.badge).toBeNull();
    };
    // a pressed chip with no reader mounted
    const a = opened({});
    asShipped(a.v);
    a.m.unmount();
    // a reader, and this card summarised but never pressed
    const b = mountColumn(withReader({ toasts: [toast(7)], onDismiss: () => undefined, reading: null }));
    asShipped(b.summarise());
    b.m.unmount();
  });

  // ── W1: the count ──────────────────────────────────────────────────────────
  it("«+1»: the card waiting behind the explanation is counted on it, in the phone badge's own form", () => {
    const { m, v } = opened({ reading: { id: 7, held: false } });
    expect(v.badge, "a fault is waiting behind the explanation and nothing on the glass says so").not.toBeNull();
    expect(v.badge!.props.children).toEqual(["+", 1]);
    expect(NEW.toastWaitingLabelBg?.(1)).toBe("още 1 известие");
    expect(NEW.toastWaitingLabelBg!(3)).toBe("още 3 известия");
    expect(v.badge!.props["aria-label"]).toBe("още 1 известие");
    // class for class the phone card's «+N» (`SimOverlay`), so one product has one mark for it
    const overlay = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");
    expect(overlay).toContain('className="ml-auto shrink-0 rounded-full border border-border px-1.5 text-[10px] font-bold leading-[18px] text-muted"');
    expect(v.badge!.props.className).toBe("ml-auto shrink-0 rounded-full border border-border px-1.5 text-[10px] font-bold leading-[18px] text-muted");
    m.unmount();
  });

  it("nothing waiting, no badge — and never on a card that is not the one being read", () => {
    const alone = mountColumn(withReader({ toasts: [toast(7)], onDismiss: () => undefined, reading: { id: 7, held: false } }));
    let v = alone.summarise();
    (v.shell!.props.onWhy as () => void)();
    v = alone.m.rerender();
    expect(v.readBox!.props["data-hud-toast-read"]).toBe("");
    expect(v.badge).toBeNull();
    alone.m.unmount();
  });
});
