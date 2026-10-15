/**
 * =============================================================================
 * NOTHING THE STUDENT IS JUDGED BY IS LOST WHILE HE READS AN EXPLANATION —
 * sc-roundabout-entry:fe081cf1 (major), ROUND 3 (2026-10-14), integrator
 * decision W5.
 *
 * WHAT ROUND 2 GOT WRONG, IN THE ROUND-2 VERIFIER'S OWN PROBE
 * (`scratch/whycut-verify/r2/zz-whycut-verify-r2.test.ts`, P1, reproduced
 * below as §0 on the same real queue hook). Round 2 stopped every other card's
 * clock while one was read (W1) — praise included — and exempted only the
 * opened card from the queue's cap (`MAX_QUEUED` = `TOAST_MAX_VISIBLE` + 2 =
 * 4). So four cards of ANY kind raised during a reading pushed a graded fault
 * raised before them out of the queue, unpainted: «+4» on the badge, and after
 * the close the fault was simply gone. And a second way to lose it, found
 * while building this: on release every waiting card started its clock at
 * once, so with more waiting than the column paints (2, quiet 1) the ones
 * below the column's capacity ran their lives out unseen.
 *
 * THE RULE AS BUILT (W5 — the smallest change that makes the sentence true):
 *   · a JUDGED card — a graded fault (`violation`) or a teach card
 *     (`lesson`, «Научи») — that waits behind an opened explanation keeps its
 *     clock stopped and is exempt from the cap, exactly like the opened card;
 *     it stays stopped until the column PAINTS it again (`painted`, the
 *     column's own report of what it rendered), so its whole remaining life is
 *     spent on the glass;
 *   · praise and info keep their OWN clocks while another card is read — they
 *     are not judged content, they may leave unread — and the cap may evict
 *     them, and only them, while judged cards wait;
 *   · the «+N» badge counts what waits: the judged cards;
 *   · they come back in the column's own order — newest on top, as every card
 *     has always been stacked — each as the cards above it leave.
 *   · with no explanation open nothing here changes anything: the queue, the
 *     cap and the clocks are the ones the product always had.
 *
 * WHAT IS TESTED, AND AT WHAT LEVEL. The REAL `useHudToastQueue` is mounted on
 * the project's hook harness and driven by an event clock that fires its real
 * timers; the column is the REAL `visibleToasts`, whose ids are what
 * `HudToasts` reports as painted; the reader is modelled exactly as
 * `useToastReader` derives it (the reading ends when the card leaves or is
 * closed) and in React's effect order (the column's report — a child — before
 * the reader's hold — the shell).
 *   §0  the round-2 verifier's P1, both variants (four «Браво», four faults).
 *   §1  the rule, row by row.
 *   §2  the census over arrival sequences during the longest reading (88 s).
 *   §3  the column reports what it painted.
 * =============================================================================
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HudEvent } from "../../contracts";
import * as Hud from "../HudToasts";
import { toastReadMs, useHudToastQueue, type HudToast } from "../HudToasts";
import { visibleToasts, waitingToasts } from "../hudPreferences";
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

type Queue = {
  toasts: HudToast[];
  push: (e: ReadonlyArray<HudEvent>, ttl?: number) => void;
  dismiss: (id: number) => void;
  clear: () => void;
  whyChanged: (id: number, open: boolean) => void;
  holdAllBut: (id: number | null) => void;
  /** Round 3: the column's report of the ids it painted. Optional so that a
   *  tree without it fails on the ASSERTIONS, not on a TypeError. */
  painted?: (ids: readonly number[]) => void;
};

// ── the cards ────────────────────────────────────────────────────────────────

type Kind = "praise" | "info" | "graded" | "teach";
const KINDS: readonly Kind[] = ["praise", "info", "graded", "teach"];

/** A graded fault of the row's own length (323 characters, 21.5 s of reading). */
const fault = (title: string, chars = 323): HudEvent => ({
  kind: "violation",
  titleBg: title,
  explanationBg: "Х".repeat(chars),
  peekBg: "Кратко.",
  points: 10,
  severity: "opasna",
  lawRef: "ЗДвП чл. 20, ал. 2",
});
const praise = (title: string): HudEvent => ({ kind: "commendation", titleBg: title });
const info = (title: string): HudEvent => ({ kind: "objectiveComplete", titleBg: title });
const teach = (title: string): HudEvent => ({ kind: "lesson", titleBg: title, explanationBg: "Обяснение." });
const make = (k: Kind, title: string): HudEvent =>
  k === "praise" ? praise(title) : k === "info" ? info(title) : k === "graded" ? fault(title) : teach(title);
const judged = (e: HudEvent) => e.kind === "violation" || e.kind === "lesson";
const titleOf = (e: HudEvent) => ("titleBg" in e ? e.titleBg : e.kind);
/** What a kind lives with nothing open — `useHudToastQueue`'s `ttlFor`. */
const lifeOf = (e: HudEvent) => (judged(e) ? 8_000 : 4_000);

/** The longest paragraph a card carries: 1 320 characters, 88 s of reading. */
const LONGEST_CHARS = 1_320;

/** The clock is replaced by assignment, not `vi.spyOn`: the census mounts the
 *  queue some 200 000 times, and a spy per mount is retained by the registry. */
const REAL_NOW = Date.now;
afterEach(() => {
  Date.now = REAL_NOW;
  vi.restoreAllMocks();
});

// ── the event clock ──────────────────────────────────────────────────────────

interface CardLog {
  id: number;
  event: HudEvent;
  raisedAt: number;
  /** Every interval it was in the painted set, summed. */
  glassMs: number;
  firstPaint: number | null;
  /** First paint AFTER the opened card left the column's reading. */
  firstPaintAfterRead: number | null;
  goneAt: number | null;
}

/**
 * One drive of the column: the real queue, its real timers fired when due, the
 * reader as `useToastReader` derives it, and the column's paint report.
 */
function drive(opts: { quiet: boolean; reportPaint?: boolean; holdBeforePaint?: boolean }) {
  const at = { now: 0 };
  Date.now = () => at.now;
  const m = mountHook(() => useHudToastQueue() as unknown as Queue);
  const due = new Map<number, number>();
  let q = m.rerender();
  let openId: number | null = null;
  let lastHold: number | null = null;
  let shown: HudToast[] = [];
  let reading: { id: number; held: boolean } | null = null;
  const log = new Map<number, CardLog>();
  let readEndedAt: number | null = null;

  const record = () => {
    for (const t of m.timers) if (!due.has(t.id)) due.set(t.id, at.now + t.ms);
  };
  /** What React does after a state change: re-render, the column's effect
   *  (child) reports its paint, then the shell's reader effect holds. */
  const commit = () => {
    q = m.rerender();
    for (const t of q.toasts)
      if (!log.has(t.id))
        log.set(t.id, { id: t.id, event: t.event, raisedAt: t.raisedAtMs ?? at.now, glassMs: 0, firstPaint: null, firstPaintAfterRead: null, goneAt: null });
    for (const [id, c] of log) if (c.goneAt === null && !q.toasts.some((t) => t.id === id)) c.goneAt = at.now;
    const readingId = openId !== null && q.toasts.some((t) => t.id === openId) ? openId : null;
    if (readingId === null && openId !== null) openId = null;
    reading = readingId === null ? null : { id: readingId, held: false };
    if (readingId === null && lastHold !== null && readEndedAt === null) readEndedAt = at.now;
    shown = visibleToasts(q.toasts, opts.quiet, reading);
    const report = () => {
      if (opts.reportPaint !== false) q.painted?.(shown.map((t) => t.id));
    };
    const hold = () => {
      if (readingId !== lastHold) {
        q.holdAllBut(readingId);
        lastHold = readingId;
      }
    };
    if (opts.holdBeforePaint === true) {
      hold();
      report();
    } else {
      report();
      hold();
    }
    record();
    for (const t of shown) {
      const c = log.get(t.id)!;
      if (c.firstPaint === null) c.firstPaint = at.now;
      if (readEndedAt !== null && c.firstPaintAfterRead === null && t.id !== lastOpened) c.firstPaintAfterRead = at.now;
    }
  };
  let lastOpened: number | null = null;

  /** Advance to `t`, firing every timer due on the way, in due order. */
  const advanceTo = (t: number) => {
    for (;;) {
      record();
      let next: { id: number; at: number } | null = null;
      for (const timer of m.timers) {
        const d = due.get(timer.id)!;
        if (d <= t && (next === null || d < next.at)) next = { id: timer.id, at: d };
      }
      if (next === null) break;
      accrue(next.at);
      at.now = next.at;
      const i = m.timers.findIndex((x) => x.id === next!.id);
      const [timer] = m.timers.splice(i, 1);
      due.delete(timer!.id);
      timer!.fn();
      commit();
    }
    accrue(t);
    at.now = t;
  };
  const accrue = (t: number) => {
    const dt = t - at.now;
    if (dt <= 0) return;
    for (const s of shown) {
      // `objectiveComplete` renders nothing (`ToastCard` returns null).
      if (s.event.kind === "objectiveComplete") continue;
      log.get(s.id)!.glassMs += dt;
    }
  };

  return {
    at,
    m,
    get q() {
      return q;
    },
    get shown() {
      return shown;
    },
    get reading() {
      return reading;
    },
    log,
    commit,
    advanceTo,
    push(t: number, events: HudEvent[]) {
      advanceTo(t);
      q.push(events);
      commit();
      return q.toasts.slice(0, events.length).map((x) => x.id);
    },
    open(t: number, id: number) {
      advanceTo(t);
      q.whyChanged(id, true);
      openId = id;
      lastOpened = id;
      commit();
    },
    close(t: number, id: number) {
      advanceTo(t);
      q.whyChanged(id, false);
      if (openId === id) openId = null;
      commit();
    },
    /** Run until the queue is empty (or `limit`). */
    drain(limit = 1_000_000) {
      advanceTo(limit);
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// §0  THE ROUND-2 VERIFIER'S PROBE — P1, both variants
// ═════════════════════════════════════════════════════════════════════════════

describe("§0 the round-2 verifier's P1 — a graded fault raised while an explanation is open is never dropped", () => {
  for (const [label, others] of [
    ["four praise cards after it", [praise("Браво 1"), praise("Браво 2"), praise("Браво 3"), praise("Браво 4")]],
    ["four more faults after it", [fault("F2"), fault("F3"), fault("F4"), fault("F5")]],
  ] as const) {
    it(`reading A, fault F arrives, then ${label}, one per second — F is still queued when A closes, and is then painted for its whole life`, () => {
      const d = drive({ quiet: false });
      const [a] = d.push(0, [fault("A — opened")]);
      d.open(1_000, a!);
      const [f] = d.push(2_000, [fault("F — graded, raised while A is read")]);
      let t = 2_000;
      for (const e of others) d.push((t += 1_000), [e]);

      const fWhileRead = {
        fStillQueued: d.q.toasts.some((x) => x.id === f),
        fPaintedWhileRead: d.log.get(f!)!.firstPaint !== null,
        badge: waitingToasts(d.q.toasts, false, d.reading),
      };
      // The badge counts what WAITS: judged cards. Praise keeps its own clock.
      const judgedOthers = others.filter(judged).length;
      expect(fWhileRead, "the graded fault F was dropped from the queue without ever being painted").toEqual({
        fStillQueued: true,
        fPaintedWhileRead: false,
        badge: 1 + judgedOthers,
      });

      // A is closed (the verifier closes it right after the last arrival).
      d.close(t, a!);
      d.drain();
      const F = d.log.get(f!)!;
      expect(F.firstPaint, "F never reached the glass after the explanation closed").not.toBeNull();
      expect(F.glassMs, "F reached the glass but not for its whole 8 s").toBeGreaterThanOrEqual(8_000);
      d.m.unmount();
    });
  }

  it("BASE CONTRAST: with nothing open the same arrivals paint F on its arrival", () => {
    const d = drive({ quiet: false });
    d.push(0, [fault("A")]);
    const [f] = d.push(2_000, [fault("F — graded")]);
    expect(d.log.get(f!)!.firstPaint).toBe(2_000);
    d.m.unmount();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §1  THE RULE, ROW BY ROW
// ═════════════════════════════════════════════════════════════════════════════

describe("§1 W5 — judged cards wait whole and uncapped; praise keeps its own clock", () => {
  it("THE CAP evicts only praise and info while judged cards wait: four «Браво» after a waiting fault cost the fault nothing", () => {
    const d = drive({ quiet: false });
    const [a] = d.push(0, [fault("A", LONGEST_CHARS)]);
    d.open(500, a!);
    const [f] = d.push(1_000, [fault("F")]);
    const [tc] = d.push(1_100, [teach("Научи")]);
    for (let i = 0; i < 8; i += 1) d.push(1_200 + i * 100, [praise(`Браво ${i}`)]);
    const ids = d.q.toasts.map((t) => t.id);
    expect(ids, "a graded fault was capped out of the queue while it waited").toContain(f);
    expect(ids, "a teach card was capped out of the queue while it waited").toContain(tc);
    expect(ids).toContain(a);
    // …and the cap is still the cap for what is not judged: never more than
    // MAX_QUEUED cards that may be evicted.
    const evictable = d.q.toasts.filter((t) => !judged(t.event));
    expect(evictable.length).toBeLessThanOrEqual(4);
    d.m.unmount();
  });

  it("PRAISE KEEPS ITS OWN CLOCK under a reading: raised at +2 s, gone at +6 s, never painted, never counted", () => {
    const d = drive({ quiet: false });
    const [a] = d.push(0, [fault("A")]);
    d.open(1_000, a!);
    const [p] = d.push(2_000, [praise("Браво")]);
    expect(waitingToasts(d.q.toasts, false, d.reading), "praise is counted as waiting — it is not: it is leaving").toBe(0);
    d.advanceTo(5_999);
    expect(d.q.toasts.some((t) => t.id === p)).toBe(true);
    d.advanceTo(6_000);
    expect(d.q.toasts.some((t) => t.id === p), "praise's clock stopped behind the explanation").toBe(false);
    expect(d.log.get(p!)!.firstPaint).toBeNull();
    d.m.unmount();
  });

  it("PRAISE ALREADY ON THE GLASS when «Защо» is pressed keeps its clock too: raised at 0, gone at +4 s, though the press came at +1 s", () => {
    const d = drive({ quiet: false });
    const [a] = d.push(0, [fault("A")]);
    const [p] = d.push(0, [praise("Браво")]);
    expect(d.shown.map((t) => t.id), "the praise is on the glass before the press").toContain(p);
    d.open(1_000, a!);
    d.advanceTo(3_999);
    expect(d.q.toasts.some((t) => t.id === p)).toBe(true);
    d.advanceTo(4_000);
    expect(d.q.toasts.some((t) => t.id === p), "the hold stopped a praise card that was already running").toBe(false);
    d.m.unmount();
  });

  it("A BATCH of eight judged cards raised in ONE tick behind the reading — none capped in that tick", () => {
    const d = drive({ quiet: false });
    const [a] = d.push(0, [fault("A")]);
    d.open(500, a!);
    d.advanceTo(1_000);
    d.q.push([1, 2, 3, 4, 5, 6, 7, 8].map((i) => (i % 2 === 0 ? teach(`Научи ${i}`) : fault(`F${i}`))));
    d.commit();
    expect(d.q.toasts.map((t) => t.id), "a judged card raised behind an explanation was capped in the tick it was raised").toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    d.close(2_000, a!);
    d.drain();
    for (let id = 2; id <= 9; id += 1) expect(d.log.get(id)!.glassMs, `#${id}`).toBeGreaterThanOrEqual(8_000);
    d.m.unmount();
  });

  it("…and info likewise", () => {
    const d = drive({ quiet: false });
    const [a] = d.push(0, [fault("A")]);
    d.open(1_000, a!);
    const [n] = d.push(2_000, [info("Целта е изпълнена")]);
    d.advanceTo(6_000);
    expect(d.q.toasts.some((t) => t.id === n), "info's clock stopped behind the explanation").toBe(false);
    d.m.unmount();
  });

  it("A JUDGED CARD raised under the reading keeps its clock stopped until the column PAINTS it — not merely until the reading ends", () => {
    const d = drive({ quiet: false });
    const [a] = d.push(0, [fault("A")]);
    d.open(500, a!);
    const ids = [1, 2, 3, 4].map((i) => d.push(1_000 + i * 100, [fault(`F${i}`)])[0]!);
    d.close(2_000, a!);
    // the column paints two (newest first): F4, F3. F2 and F1 wait, stopped.
    expect(d.shown.map((t) => t.id)).toEqual([ids[3], ids[2]]);
    const armed = d.m.timers.map((t) => t.ms).sort((x, y) => x - y);
    // A's extended clock + the two painted cards' whole 8 s; F2/F1 hold no clock.
    expect(armed.filter((ms) => ms === 8_000), "a card below the column's capacity started running its life out unseen").toHaveLength(2);
    d.drain();
    for (const id of ids) expect(d.log.get(id)!.glassMs, `F#${id} did not get its whole 8 s on the glass`).toBeGreaterThanOrEqual(8_000);
    d.m.unmount();
  });

  it("IN ORDER: the waiting cards come back in the column's own order — newest on top — none jumping another", () => {
    const d = drive({ quiet: false });
    const [a] = d.push(0, [fault("A")]);
    d.open(500, a!);
    const ids = [1, 2, 3, 4, 5].map((i) => d.push(1_000 + i * 100, [fault(`F${i}`)])[0]!);
    d.close(3_000, a!);
    d.drain();
    const first = ids.map((id) => d.log.get(id)!.firstPaint!);
    // newer first: F5 and F4 at the close, then F3 and F2, then F1
    expect(first, "the waiting faults were painted out of the column's order").toEqual([
      3_000 + 16_000,
      3_000 + 8_000,
      3_000 + 8_000,
      3_000,
      3_000,
    ]);
    d.m.unmount();
  });

  it("QUIET MODE: one card at a time, every waiting fault in turn, each for its whole life", () => {
    const d = drive({ quiet: true });
    const [a] = d.push(0, [fault("A")]);
    d.open(500, a!);
    const ids = [1, 2, 3].map((i) => d.push(1_000 + i * 100, [fault(`F${i}`)])[0]!);
    d.close(3_000, a!);
    expect(d.shown.map((t) => t.id)).toEqual([ids[2]]);
    d.drain();
    expect(ids.map((id) => d.log.get(id)!.firstPaint)).toEqual([3_000 + 16_000, 3_000 + 8_000, 3_000]);
    for (const id of ids) expect(d.log.get(id)!.glassMs).toBeGreaterThanOrEqual(8_000);
    d.m.unmount();
  });

  it("THE EFFECT ORDER does not matter: the column's report before the reader's release (React's child-first order) or after it", () => {
    for (const holdBeforePaint of [false, true]) {
      const d = drive({ quiet: false, holdBeforePaint });
      const [a] = d.push(0, [fault("A")]);
      d.open(500, a!);
      const [f] = d.push(1_000, [fault("F")]);
      d.close(2_000, a!);
      expect(d.m.timers.map((t) => t.ms), `holdBeforePaint=${holdBeforePaint}: F is on the glass with its clock stopped`).toContain(8_000);
      d.drain();
      expect(d.log.get(f!)!.goneAt).toBe(2_000 + 8_000);
      d.m.unmount();
    }
  });

  it("WITH NOTHING OPEN nothing changes: praise 4 s, faults 8 s from raise, the cap drops the oldest of seven", () => {
    const d = drive({ quiet: false });
    for (let i = 0; i < 7; i += 1) d.push(i * 10, [i % 2 === 0 ? fault(`F${i}`) : praise(`P${i}`)]);
    expect(d.q.toasts.map((t) => t.id)).toEqual([7, 6, 5, 4]);
    d.drain();
    for (const c of d.log.values()) if (c.goneAt !== null && c.id >= 4) expect(c.goneAt - c.raisedAt).toBe(lifeOf(c.event));
    d.m.unmount();
  });

  it("a waiting card dismissed with «Изчисти известията» (clear) does not come back", () => {
    const d = drive({ quiet: false });
    const [a] = d.push(0, [fault("A")]);
    d.open(500, a!);
    d.push(1_000, [fault("F")]);
    d.q.clear();
    d.commit();
    expect(d.q.toasts).toHaveLength(0);
    expect(d.m.timers).toHaveLength(0);
    d.m.unmount();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §2  THE CENSUS — arrival sequences during the longest reading
// ═════════════════════════════════════════════════════════════════════════════

/** Every sequence over KINDS of length n. */
function sequences(n: number): Kind[][] {
  if (n === 0) return [[]];
  const out: Kind[][] = [];
  for (const s of sequences(n - 1)) for (const k of KINDS) out.push([...s, k]);
  return out;
}
/** Every multiset over KINDS of size n, as a sorted sequence. */
function multisets(n: number, from = 0): Kind[][] {
  if (n === 0) return [[]];
  const out: Kind[][] = [];
  for (let i = from; i < KINDS.length; i += 1) for (const rest of multisets(n - 1, i)) out.push([KINDS[i]!, ...rest]);
  return out;
}
/** A fixed shuffle (no randomness in a census). */
function interleave<T>(xs: readonly T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < xs.length; i += 2) out.push(xs[i]!);
  for (let i = 1; i < xs.length; i += 2) out.push(xs[i]!);
  return out;
}

interface CensusCase {
  seq: Kind[];
  quiet: boolean;
  /** "expiry": the reading ends when the opened card's time is over; a number: the student closes it then. */
  end: "expiry" | number;
  /** "spread": one arrival every 9 s from +2 s (to the end of the 88 s); "batch": all in one tick at +5 s. */
  timing: "spread" | "batch";
}

/** Run one case; return the violations of the rule found, as strings. */
function runCase(c: CensusCase): string[] {
  const bad: string[] = [];
  const d = drive({ quiet: c.quiet });
  const [a] = d.push(0, [fault("A — opened", LONGEST_CHARS)]);
  d.open(0, a!);
  const raised: number[] = [];
  if (c.timing === "batch") {
    if (c.seq.length > 0) {
      d.advanceTo(5_000);
      // The ids the queue hands out are consecutive, so the batch's are known
      // BEFORE the push — a card the cap drops in the same tick is still a card
      // that was raised, and must be found missing, not overlooked.
      const first = Math.max(...d.log.keys()) + 1;
      d.q.push(c.seq.map((k, i) => make(k, `${k} ${i}`)));
      d.commit();
      raised.push(...c.seq.map((_, i) => first + i));
    }
  } else {
    c.seq.forEach((k, i) => raised.push(d.push(2_000 + i * 9_000, [make(k, `${k} ${i}`)])[0]!));
  }
  if (c.end !== "expiry") d.close(c.end, a!);
  d.drain();
  const readEnd = c.end === "expiry" ? toastReadMs(LONGEST_CHARS) : (c.end as number);
  // A card raised AFTER the reading is an ordinary arrival: it lands on top as
  // it always has and may push a card that is already running off the glass —
  // the column's behaviour with nothing open, not this rule's. With such
  // arrivals the census asks only that every waiting judged card IS painted;
  // without them, that it is painted for its whole life.
  const lateArrivals = raised.some((id) => (d.log.get(id)?.raisedAt ?? 0) >= readEnd);
  const kindOf = (id: number): Kind => c.seq[raised.indexOf(id)]!;
  for (const id of raised) {
    const card = d.log.get(id);
    if (card === undefined) {
      // capped in the very tick it was raised: allowed for praise and info
      // (the cap may evict them), never for a judged card
      const k = kindOf(id);
      if (k === "graded" || k === "teach") bad.push(`${k} #${id}: removed unpainted (capped on arrival)`);
      continue;
    }
    if (judged(card.event)) {
      if (card.firstPaint === null) bad.push(`${titleOf(card.event)}: removed unpainted`);
      else if (card.firstPaint < readEnd) bad.push(`${titleOf(card.event)}: painted while the explanation was read (${card.firstPaint})`);
      if (!lateArrivals && card.glassMs < lifeOf(card.event)) bad.push(`${titleOf(card.event)}: on the glass ${card.glassMs} ms of its ${lifeOf(card.event)}`);
    } else if (card.goneAt !== null && card.goneAt - card.raisedAt > lifeOf(card.event)) {
      bad.push(`${titleOf(card.event)}: praise/info outlived its own life (${card.goneAt - card.raisedAt} ms)`);
    }
  }
  // Order: judged cards that waited are first painted newest-first.
  const waited = raised
    .map((id) => d.log.get(id))
    .filter((x): x is CardLog => x !== undefined && judged(x.event) && x.raisedAt < readEnd)
    .sort((x, y) => y.id - x.id);
  for (let i = 1; i < waited.length; i += 1)
    if ((waited[i]!.firstPaint ?? Infinity) < (waited[i - 1]!.firstPaint ?? Infinity))
      bad.push(`${titleOf(waited[i]!.event)} painted before the newer ${titleOf(waited[i - 1]!.event)}`);
  // The opened card: whole reading, alone on the glass while read.
  const A = d.log.get(a!)!;
  if (c.end === "expiry" && A.goneAt !== toastReadMs(LONGEST_CHARS)) bad.push(`A left at ${A.goneAt}`);
  d.m.unmount();
  Date.now = REAL_NOW;
  return bad;
}

describe("§2 CENSUS — 0–8 arrivals of every mix of praise / info / graded / teach during the 88 s reading", () => {
  const cases: CensusCase[] = [];
  // every SEQUENCE up to 6 arrivals: quiet and not, the reading run out or
  // closed by the student at +40 s, arrivals spread or in one tick
  for (let n = 0; n <= 6; n += 1)
    for (const seq of sequences(n))
      for (const quiet of [false, true])
        for (const end of ["expiry", 40_000] as const)
          for (const timing of ["spread", "batch"] as const) cases.push({ seq, quiet, end, timing });
  // every SEQUENCE of 7 and 8 arrivals, spread over the reading, quiet and not
  for (let n = 7; n <= 8; n += 1)
    for (const seq of sequences(n))
      for (const quiet of [false, true]) cases.push({ seq, quiet, end: "expiry", timing: "spread" });
  // every MULTISET of 7 and 8 in three orders, for the other three variants
  for (let n = 7; n <= 8; n += 1)
    for (const ms of multisets(n))
      for (const seq of [ms, [...ms].reverse(), interleave(ms)])
        for (const quiet of [false, true])
          for (const [end, timing] of [["expiry", "batch"], [40_000, "spread"], [40_000, "batch"]] as const)
            cases.push({ seq, quiet, end, timing });

  it("every graded fault and teach card raised is painted after the opened card leaves, for its whole life, in the column's order; praise and info leave on their own life", () => {
    const examples: string[] = [];
    const byReason = new Map<string, number>();
    let broken = 0;
    let judgedRaised = 0;
    for (const c of cases) {
      judgedRaised += c.seq.filter((k) => k === "graded" || k === "teach").length;
      const bad = runCase(c);
      if (bad.length === 0) continue;
      broken += 1;
      for (const b of bad) {
        const reason = b.replace(/^[^:]*: /, "").replace(/[\d ]+ms.*$|\(.*\)$/, "").trim();
        byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
      }
      if (examples.length < 6) examples.push(`[${c.seq.join(",")}] quiet=${c.quiet} end=${c.end} ${c.timing}: ${bad.join("; ")}`);
    }
    process.stderr.write(
      `W5 census: ${cases.length} drives, ${judgedRaised} judged cards raised under a reading, ${broken} drives broke the rule` +
        (broken > 0 ? ` — ${JSON.stringify(Object.fromEntries(byReason))}` : "") +
        "\n",
    );
    expect({ broken, examples }, "a judged card was lost, cut short or painted out of order").toEqual({ broken: 0, examples: [] });
  }, 600_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// §3  THE COLUMN REPORTS WHAT IT PAINTED
// ═════════════════════════════════════════════════════════════════════════════

describe("§3 the column's paint report", () => {
  it("HudToasts reports the ids of the cards it renders, after the commit", () => {
    const reports: number[][] = [];
    const toast = (id: number, event: HudEvent): HudToast => ({ id, event, raisedAtMs: 0 });
    const toasts = [toast(3, fault("F3")), toast(2, praise("Браво")), toast(1, fault("F1"))];
    const m = mountHook(() =>
      Hud.HudToasts({ toasts, onPainted: (ids: readonly number[]) => reports.push([...ids]) } as unknown as Parameters<typeof Hud.HudToasts>[0]),
    );
    expect(reports, "the column never told the queue which cards are on the glass").toEqual([[3, 2]]);
    m.unmount();
    const r2: number[][] = [];
    const m2 = mountHook(() =>
      Hud.HudToasts({ toasts, reading: { id: 1, held: false }, onPainted: (ids: readonly number[]) => r2.push([...ids]) } as unknown as Parameters<typeof Hud.HudToasts>[0]),
    );
    expect(r2, "while a card is read, it is the one card painted").toEqual([[1]]);
    m2.unmount();
  });

  it("…an empty column reports an empty paint (it renders nothing)", () => {
    const reports: number[][] = [];
    const m = mountHook(() =>
      Hud.HudToasts({ toasts: [], onPainted: (ids: readonly number[]) => reports.push([...ids]) } as unknown as Parameters<typeof Hud.HudToasts>[0]),
    );
    expect(reports).toEqual([[]]);
    m.unmount();
  });

  it("the shell hands the queue's `painted` to the column", () => {
    const shell = code(SHELL_SRC);
    expect(shell).toMatch(/const \{[^}]*\bholdAllBut\b[^}]*\bpainted\b[^}]*\} = useHudToastQueue\(\)/);
    const mount = shell.slice(shell.indexOf("<HudToasts"), shell.indexOf("/>", shell.indexOf("<HudToasts")));
    expect(mount).toMatch(/onPainted=\{painted\}/);
    expect(code(HUD_SRC)).toMatch(/onPainted\?\.\(/);
  });
});
