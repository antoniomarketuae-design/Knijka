/**
 * =============================================================================
 * THE CAP SPARES EVERY JUDGED CARD FOR ITS OWN LIFE — sc-roundabout-entry:
 * ad192bc4 (major), lane `wcafterpaint`, integrator decision W11 (2026-10-18,
 * R1; confirmed with R3, R4 and R7 on 2026-11-04).
 *
 * THE ROW. `useHudToastQueue.push` caps the STORE at `MAX_QUEUED` (4) on every
 * push (`capToastQueue`, positional: the four newest cards of any kind, plus the
 * ids in `keep`). Before W11 `keep` held only the card being read and the
 * judged cards WAITING with a stopped clock (W5), so a graded fault or «Научи»
 * card that was already painted, clock running, was dropped the moment four
 * newer cards of ANY kind stood above it — measured at 1f1536d and re-measured
 * on this lane's base (`tmp-step0-wcafterpaint`, never committed):
 *   · four «Браво» 300 ms apart after a fault: 0.6 s on the glass, gone at 1.2 s
 *     of its 8 s (`TEACHING_TOAST_TTL_MS`);
 *   · the same in quiet mode, where praise is never painted: the ONLY card on
 *     the glass removed at 1.2 s by four cards nobody can see;
 *   · S10 (A opened and closed, F waited behind it, then a burst): F 0.3 s,
 *     and the card A the student had opened was dropped with its 21.7 s of
 *     reading still running;
 *   · on the phone (`selectOverlay`, violation 80 > praise 50) the fault lost
 *     the peek to praise at 1.2 s.
 *
 * THE RULE AS BUILT (W11): `capExempt` keeps every life that `waits` — every
 * judged card (`hudToastCarriesWhy`: violation | lesson), running or stopped —
 * for as long as its own life runs. The `reading` set stays in it unchanged
 * (R3): the ledger's `whyChanged(id, true)` puts a live card of any kind there;
 * in the product only a graded fault is ever opened (`ToastCard` hands
 * `onWhyChange` to `ViolationToast` alone). The row that observes the set is
 * toast-why-room «an OPENED commendation…» (round 2, mutant V11).
 * Praise and info stay evictable by the positional rule. Bounded: judged lives
 * expire (T6 tests the bound). Nothing else moves: the TTLs, `toastReadMs`,
 * `MAX_QUEUED`, the column's capacities and order, the clocks.
 *
 * W12 (R2) — GLASS TIME BELOW THE COLUMN IS NOT THIS LANE'S. With nothing open
 * no clock is ever stopped: a judged card pushed below the roomy column's
 * capacity (2) by praise keeps running its life off the glass. T1 RECORDS that
 * glass time; it does not assert it.
 *
 * Display only: nothing graded reads the queue (T8).
 * =============================================================================
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HudEvent } from "../../contracts";
import { minusPointsBg, N38_CLASS_LABEL_BG } from "../../rules";
import * as Hud from "../HudToasts";
import { toastReadMs, useHudToastQueue, type HudToast } from "../HudToasts";
import { visibleToasts } from "../hudPreferences";
import { overlayPriority, selectOverlay, type SimOverlayItem } from "../overlayQueue";
import { mountHook } from "./hookHarness";

const SRC_ROOT = resolve(__dirname, "../../../..");
const SHELL_SRC = readFileSync(resolve(SRC_ROOT, "components/sim/lesson-ui/LessonPlayShell.tsx"), "utf8");
const OVERLAY_SRC = readFileSync(resolve(__dirname, "../overlayQueue.ts"), "utf8");

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
  painted: (ids: readonly number[]) => void;
};

const capToastQueue = (Hud as unknown as { capToastQueue: <T extends { id: number }>(t: readonly T[], max: number, keep: ReadonlySet<number>) => T[] })
  .capToastQueue;

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
/** `useHudToastQueue`'s `ttlFor`. */
const ttlOf = (e: HudEvent) => (judged(e) ? 8_000 : 4_000);
/** `toastParagraphChars`: only a violation's explanation is what «Защо» opens. */
const charsOf = (e: HudEvent) => (e.kind === "violation" ? e.explanationBg.length : 0);
const MAX_QUEUED = 4;

/** Test-local copy of LessonPlayShell.tsx's phone toast mapping (`toasts.map((t): SimOverlayItem | null => …)`);
 *  T7 pins the shell's kind mapping so this copy cannot drift silently. */
function phoneItems(toasts: readonly HudToast[]): Array<SimOverlayItem | null> {
  return toasts.map((t): SimOverlayItem | null => {
    if (t.event.kind === "violation") {
      return {
        id: `toast:${t.id}`,
        kind: "violation",
        tone: t.event.severity === "vtorostepenna" ? "warn" : "danger",
        chipBg: minusPointsBg("exam", t.event.points),
        markClassBg: N38_CLASS_LABEL_BG[t.event.severity],
        lineBg: t.event.titleBg,
        detailBg: t.event.explanationBg,
        peekBg: t.event.peekBg ?? null,
        lawRef: t.event.lawRef ?? null,
        raisedAtMs: t.raisedAtMs,
      } as SimOverlayItem;
    }
    if (t.event.kind === "lesson") {
      return {
        id: `toast:${t.id}`,
        kind: "hint",
        tone: "teach",
        lineBg: t.event.titleBg,
        detailBg: t.event.explanationBg,
        peekBg: t.event.peekBg ?? null,
        lawRef: t.event.lawRef ?? null,
        raisedAtMs: t.raisedAtMs,
      } as SimOverlayItem;
    }
    if (t.event.kind === "commendation") {
      return { id: `toast:${t.id}`, kind: "praise", tone: "good", chipBg: "Браво", lineBg: t.event.titleBg } as SimOverlayItem;
    }
    return null;
  });
}

const REAL_NOW = Date.now;
afterEach(() => {
  Date.now = REAL_NOW;
  vi.restoreAllMocks();
});

// ── the oracle: the W5 + W11 ledger, stated independently of the product ────
//
// Every call the harness makes into the queue is replayed here at the same
// moment. A judged card's life is raise + ttl, + the press extension
// (`toastExpiryAfterWhy`), + every interval its clock was stopped (W5: held
// behind another card's explanation, until the column paints it again). A
// card's life is NOT ended by the cap (F5): only by its own timer.

interface OLife {
  running: boolean;
  expiry: number;
  left: number;
  waits: boolean;
  chars: number;
}
class Oracle {
  lives = new Map<number, OLife>();
  reading = new Set<number>();
  heldFor: number | null = null;
  /** When each life ended, by id. */
  ended = new Map<number, number>();
  /** End every running life whose time is ≤ t, in time order. */
  to(t: number) {
    for (;;) {
      let next: [number, OLife] | null = null;
      for (const e of this.lives) if (e[1].running && e[1].expiry <= t && (next === null || e[1].expiry < next[1].expiry)) next = e;
      if (next === null) return;
      this.lives.delete(next[0]);
      this.reading.delete(next[0]);
      this.ended.set(next[0], next[1].expiry);
    }
  }
  add(t: number, id: number, e: HudEvent, ttl: number) {
    this.to(t);
    const waits = judged(e);
    const life: OLife = { running: true, expiry: t + ttl, left: 0, waits, chars: charsOf(e) };
    if (waits && this.heldFor !== null && this.heldFor !== id) {
      life.running = false;
      life.left = ttl;
    }
    this.lives.set(id, life);
  }
  why(t: number, id: number, open: boolean) {
    this.to(t);
    if (!open) {
      this.reading.delete(id);
      return;
    }
    const life = this.lives.get(id);
    if (life === undefined) return;
    this.reading.add(id);
    if (!life.running) life.left = Math.max(life.left, toastReadMs(life.chars));
    else life.expiry = Math.max(life.expiry, t + toastReadMs(life.chars));
  }
  hold(t: number, id: number | null) {
    this.to(t);
    if (this.heldFor === id) return;
    this.heldFor = id;
    if (id !== null) for (const r of [...this.reading]) if (r !== id) this.reading.delete(r);
    for (const [lid, life] of this.lives)
      if (id !== null && lid !== id && life.waits && life.running) {
        life.running = false;
        life.left = Math.max(0, life.expiry - t);
      }
  }
  painted(t: number, ids: readonly number[]) {
    this.to(t);
    for (const id of ids) {
      const life = this.lives.get(id);
      if (life !== undefined && !life.running) {
        life.running = true;
        life.expiry = t + life.left;
      }
    }
  }
  /** Due times strictly after t, sorted. */
  dueAfter(t: number): number[] {
    return [...this.lives.values()].filter((l) => l.running && l.expiry > t).map((l) => l.expiry).sort((a, b) => a - b);
  }
  liveJudged(): number[] {
    return [...this.lives].filter(([, l]) => l.waits).map(([id]) => id);
  }
}

// ── the event clock (toast-wait-never-dropped.test.ts's drive(), extended) ──

interface CardLog {
  id: number;
  event: HudEvent;
  raisedAt: number;
  glassMs: number;
  firstPaint: number | null;
  goneAt: number | null;
  /** What removed it: a push (the cap) or a timer (its own life). */
  goneBy: "push" | "timer" | "other" | null;
}
interface Commit {
  t: number;
  cause: "push" | "timer" | "open" | "close" | "other";
  store: number[];
  shown: number[];
  phone: { active: string | null; queued: number } | null;
}

function drive(opts: { quiet: boolean; phone?: boolean; checks?: boolean }) {
  const at = { now: 0 };
  Date.now = () => at.now;
  const m = mountHook(() => useHudToastQueue() as unknown as Queue);
  const due = new Map<number, number>();
  let q = m.rerender();
  let openId: number | null = null;
  let lastHold: number | null = null;
  let shown: HudToast[] = [];
  const log = new Map<number, CardLog>();
  const commits: Commit[] = [];
  const oracle = new Oracle();
  const bad: string[] = [];
  let maxStore = 0;
  const flag = (s: string) => {
    if (bad.length < 8) bad.push(s);
  };

  const record = () => {
    for (const t of m.timers) if (!due.has(t.id)) due.set(t.id, at.now + t.ms);
  };
  const commit = (cause: Commit["cause"]) => {
    q = m.rerender();
    for (const t of q.toasts)
      if (!log.has(t.id))
        log.set(t.id, { id: t.id, event: t.event, raisedAt: t.raisedAtMs ?? at.now, glassMs: 0, firstPaint: null, goneAt: null, goneBy: null });
    for (const [id, c] of log)
      if (c.goneAt === null && !q.toasts.some((t) => t.id === id)) {
        c.goneAt = at.now;
        c.goneBy = cause === "push" || cause === "timer" ? cause : "other";
      }
    const readingId = openId !== null && q.toasts.some((t) => t.id === openId) ? openId : null;
    if (readingId === null && openId !== null) openId = null;
    const reading = readingId === null ? null : { id: readingId, held: false };
    shown = visibleToasts(q.toasts, opts.quiet, reading);
    const ids = shown.map((t) => t.id);
    // React's order: the column's effect (a child) reports its paint, then the shell's reader holds.
    q.painted(ids);
    oracle.painted(at.now, ids);
    if (readingId !== lastHold) {
      q.holdAllBut(readingId);
      oracle.hold(at.now, readingId);
      lastHold = readingId;
    }
    record();
    for (const t of shown) {
      const c = log.get(t.id)!;
      if (c.firstPaint === null) c.firstPaint = at.now;
    }
    const store = q.toasts.map((t) => t.id);
    maxStore = Math.max(maxStore, store.length);
    commits.push({
      t: at.now,
      cause,
      store,
      shown: ids,
      phone: opts.phone === true ? (() => {
        const sel = selectOverlay(phoneItems(q.toasts));
        return { active: sel.active?.lineBg ?? null, queued: sel.queued };
      })() : null,
    });
    if (opts.checks !== false) {
      // (i) every judged life's id is in the store
      for (const id of oracle.liveJudged()) if (!store.includes(id)) flag(`(i) t=${at.now}: judged #${id} (${titleOf(log.get(id)?.event ?? praise("?"))}) is alive but not in the store`);
      // (ii) non-judged cards in the store ≤ MAX_QUEUED
      const nonJudged = q.toasts.filter((t) => !judged(t.event)).length;
      if (nonJudged > MAX_QUEUED) flag(`(ii) t=${at.now}: ${nonJudged} non-judged cards in the store`);
      // (v) the product's clocks are exactly the oracle's lives (orphan lives included)
      const mine = m.timers.map((x) => due.get(x.id)!).filter((d) => d > at.now).sort((a, b) => a - b);
      const want = oracle.dueAfter(at.now);
      if (mine.join(",") !== want.join(",")) flag(`(v) t=${at.now}: clocks [${mine}] ≠ lives [${want}]`);
    }
  };

  const accrue = (t: number) => {
    const dt = t - at.now;
    if (dt <= 0) return;
    for (const s of shown) {
      if (s.event.kind === "objectiveComplete") continue;
      log.get(s.id)!.glassMs += dt;
    }
  };
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
      commit("timer");
    }
    accrue(t);
    at.now = t;
  };

  const self = {
    at,
    m,
    get q() {
      return q;
    },
    get shown() {
      return shown;
    },
    log,
    commits,
    oracle,
    bad,
    get maxStore() {
      return maxStore;
    },
    advanceTo,
    push(t: number, events: HudEvent[], ttl?: number) {
      advanceTo(t);
      const first = Math.max(0, ...log.keys(), ...oracle.ended.keys(), ...oracle.lives.keys()) + 1;
      // the ids are consecutive: known before the push, so a card capped in its own tick is still found
      events.forEach((e, i) => oracle.add(at.now, first + i, e, ttl ?? ttlOf(e)));
      q.push(events, ttl);
      for (const [i, e] of events.entries())
        if (!log.has(first + i)) log.set(first + i, { id: first + i, event: e, raisedAt: at.now, glassMs: 0, firstPaint: null, goneAt: null, goneBy: null });
      commit("push");
      return events.map((_, i) => first + i);
    },
    open(t: number, id: number) {
      advanceTo(t);
      q.whyChanged(id, true);
      oracle.why(at.now, id, true);
      openId = id;
      commit("open");
    },
    close(t: number, id: number) {
      advanceTo(t);
      q.whyChanged(id, false);
      oracle.why(at.now, id, false);
      if (openId === id) openId = null;
      commit("close");
    },
    drain(limit = 1_000_000) {
      advanceTo(limit);
      oracle.to(limit);
    },
    /** (iii), (iv), (vi) over the whole drive — call after `drain`. */
    verdict(): string[] {
      for (const c of log.values()) {
        if (judged(c.event)) {
          const end = oracle.ended.get(c.id);
          if (c.goneAt !== end) flag(`(iii) judged #${c.id} ${titleOf(c.event)} left at ${c.goneAt}, its life ended at ${end}`);
        } else {
          const own = c.raisedAt + ttlOf(c.event);
          if (c.goneAt === own) continue;
          if (c.goneBy !== "push") {
            flag(`(iv) ${titleOf(c.event)} #${c.id} left at ${c.goneAt}, not at its own end ${own} nor on a push`);
            continue;
          }
          const after = commits.find((k) => k.t === c.goneAt && k.cause === "push" && !k.store.includes(c.id));
          const newer = after === undefined ? 0 : after.store.filter((id) => id > c.id).length;
          if (newer < MAX_QUEUED) flag(`(iv) ${titleOf(c.event)} #${c.id} capped at ${c.goneAt} with only ${newer} newer cards above it`);
        }
      }
      if (q.toasts.length !== 0 || m.timers.length !== 0) flag(`(vi) after the last life: store ${q.toasts.length}, timers ${m.timers.length}`);
      return bad;
    },
  };
  return self;
}
type Drive = ReturnType<typeof drive>;

const card = (d: Drive, id: number) => {
  const c = d.log.get(id)!;
  return { firstPaint: c.firstPaint, glassMs: c.glassMs, goneAt: c.goneAt };
};
const inStoreUntil = (d: Drive, id: number) => {
  const raisedAt = d.log.get(id)!.raisedAt;
  const missing = d.commits.find((c) => c.t >= raisedAt && !c.store.includes(id));
  return missing?.t ?? null;
};

/** BASE-4praise: the probe's first case. */
function fourPraise(F: HudEvent, quiet: boolean, phone = false) {
  const d = drive({ quiet, phone });
  const [f] = d.push(0, [F]);
  for (let i = 1; i <= 4; i += 1) d.push(i * 300, [praise(`Браво ${i}`)]);
  d.drain(60_000);
  return { d, f: f! };
}
/** S10: A opened at 200, F raised at 500 behind it, A closed at 1 500, four praise in one push at 1 800. */
function s10(F: HudEvent) {
  const d = drive({ quiet: false });
  const [a] = d.push(0, [fault("A")]);
  d.open(200, a!);
  const [f] = d.push(500, [F]);
  d.close(1_500, a!);
  d.push(1_800, [praise("Б1"), praise("Б2"), praise("Б3"), praise("Б4")]);
  d.drain(60_000);
  return { d, a: a!, f: f! };
}

// ═════════════════════════════════════════════════════════════════════════════
// T1–T5  THE PROBE'S CASES, ON THE REAL QUEUE
// ═════════════════════════════════════════════════════════════════════════════

const GRADED = () => fault("F");
const TEACH = () => teach("Научи F");

describe("T1–T4 a judged card is in the store for exactly its own life, whatever arrives above it", () => {
  for (const [label, F] of [
    ["graded fault", GRADED],
    ["«Научи» card", TEACH],
  ] as const) {
    it(`T1${label === "graded fault" ? "" : "/T4"} ROOMY, nothing opened: a ${label} at 0, four «Браво» 300 ms apart — in the store until exactly 8 000`, () => {
      const { d, f } = fourPraise(F(), false);
      process.stdout.write(`T1 ${label}: ${JSON.stringify(card(d, f))} (W12: glass time recorded, not asserted)\n`);
      expect(inStoreUntil(d, f), `the cap removed the ${label} from the store before its own 8 s life`).toBe(8_000);
      expect(card(d, f).goneAt, `the ${label} did not leave at exactly raise + 8 000`).toBe(8_000);
      expect(d.verdict()).toEqual([]);
      d.m.unmount();
    });

    it(`T2${label === "graded fault" ? "" : "/T4"} QUIET: the same inputs — the ${label} is the one painted card for its whole 8 s`, () => {
      const { d, f } = fourPraise(F(), true);
      expect(card(d, f), `praise nobody can see removed the only painted ${label}`).toEqual({ firstPaint: 0, glassMs: 8_000, goneAt: 8_000 });
      expect(d.verdict()).toEqual([]);
      d.m.unmount();
    });

    it(`T3${label === "graded fault" ? "" : "/T4"} S10: A opened and closed, a ${label} F waited behind it, then a burst — F to 9 500, A to 200 + toastReadMs(323)`, () => {
      const { d, a, f } = s10(F());
      process.stdout.write(`T3 ${label}: F ${JSON.stringify(card(d, f))} A ${JSON.stringify(card(d, a))}\n`);
      expect(card(d, f).goneAt, `a ${label} that waited behind a closed «ЗАЩО» was capped after its first paint`).toBe(9_500);
      expect(card(d, a).goneAt, "the card the student opened and closed was dropped with its reading time still running").toBe(200 + toastReadMs(323));
      expect(200 + toastReadMs(323)).toBe(21_734);
      expect(d.verdict()).toEqual([]);
      d.m.unmount();
    });
  }

  it("T4 a 3.5 s rejection hint (kind lesson, push(…, 3500)) followed by four «Браво» leaves at exactly 3 500", () => {
    const d = drive({ quiet: false });
    const [h] = d.push(0, [teach("Нямаш задна предавка")], 3_500);
    for (let i = 1; i <= 4; i += 1) d.push(i * 300, [praise(`Браво ${i}`)]);
    d.drain(60_000);
    expect(inStoreUntil(d, h!), "the cap removed a judged 3.5 s hint before its own life").toBe(3_500);
    expect(card(d, h!).goneAt).toBe(3_500);
    expect(d.verdict()).toEqual([]);
    d.m.unmount();
  });
});

describe("T5 four newer FAULTS change nothing on the glass — only F's goneAt moves", () => {
  it("glassMs (600, 600, 600, 8000, 8000), the painted set at every commit as on base; F leaves at 8 000 (base 1 200)", () => {
    const d = drive({ quiet: false });
    const [f] = d.push(0, [fault("F")]);
    const g = [1, 2, 3, 4].map((i) => d.push(i * 300, [fault(`G${i}`)])[0]!);
    d.drain(60_000);
    expect([f!, ...g].map((id) => card(d, id).glassMs)).toEqual([600, 600, 600, 8_000, 8_000]);
    // the painted set as a function of time — base, measured at STEP 0 (it changes only at these commits)
    const titles = (ids: number[]) => ids.map((id) => titleOf(d.log.get(id)!.event)).join(",");
    const changes: string[] = [];
    let last = "∅";
    for (const c of d.commits) {
      const s = titles(c.shown);
      if (s !== last) changes.push(`${c.t}:[${s}]`);
      last = s;
    }
    expect(changes, "the column painted something other than base").toEqual([
      "0:[F]",
      "300:[G1,F]",
      "600:[G2,G1]",
      "900:[G3,G2]",
      "1200:[G4,G3]",
      "8900:[G4]",
      "9200:[]",
    ]);
    expect(card(d, f!).goneAt, "a graded fault below the column was capped before its life").toBe(8_000);
    expect(g.map((id) => card(d, id).goneAt)).toEqual([8_300, 8_600, 8_900, 9_200]);
    expect(d.verdict()).toEqual([]);
    d.m.unmount();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T6  THE BOUND — every sequence of 0–6 cards × spacing × quiet × an opened-then-
//     closed judged card × a press held through the burst; and 7–8 cards as
//     multisets in three orders
// ═════════════════════════════════════════════════════════════════════════════

/** Every sequence over KINDS of length n (toast-wait-never-dropped.test.ts §2). */
function sequences(n: number): Kind[][] {
  if (n === 0) return [[]];
  const out: Kind[][] = [];
  for (const s of sequences(n - 1)) for (const k of KINDS) out.push([...s, k]);
  return out;
}
/** Every multiset over KINDS of size n, as a sorted sequence (§2). */
function multisets(n: number, from = 0): Kind[][] {
  if (n === 0) return [[]];
  const out: Kind[][] = [];
  for (let i = from; i < KINDS.length; i += 1) for (const rest of multisets(n - 1, i)) out.push([KINDS[i]!, ...rest]);
  return out;
}
/** A fixed shuffle (§2). */
function interleave<T>(xs: readonly T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < xs.length; i += 2) out.push(xs[i]!);
  for (let i = 1; i < xs.length; i += 2) out.push(xs[i]!);
  return out;
}

interface BoundCase {
  seq: Kind[];
  /** ms between arrivals; 0 = one tick raises them all (one push). */
  spacing: 0 | 100 | 300 | 1000;
  quiet: boolean;
  /** A judged card J raised at 0, opened at 200, closed at 1 500, before the burst. */
  openedThenClosed: boolean;
  /** A judged card H raised at 1 700, its «ЗАЩО» pressed at 1 750 and held through the burst, closed 500 ms after it. */
  pressHeld: boolean;
}
const BURST_AT = 1_800;

function runBound(c: BoundCase) {
  const d = drive({ quiet: c.quiet });
  if (c.openedThenClosed) {
    const [j] = d.push(0, [fault("J")]);
    d.open(200, j!);
    d.close(1_500, j!);
  }
  let h: number | undefined;
  if (c.pressHeld) {
    [h] = d.push(1_700, [fault("H")]);
    d.open(1_750, h!);
  }
  let last = BURST_AT;
  if (c.seq.length > 0) {
    if (c.spacing === 0) d.push(BURST_AT, c.seq.map((k, i) => make(k, `${k} ${i}`)));
    else
      c.seq.forEach((k, i) => {
        last = BURST_AT + i * c.spacing;
        d.push(last, [make(k, `${k} ${i}`)]);
      });
  }
  if (h !== undefined) d.close(last + 500, h);
  d.drain();
  const bad = d.verdict();
  let judgedEarly = 0;
  for (const card of d.log.values()) if (judged(card.event) && card.goneBy === "push") judgedEarly += 1;
  const out = { bad, judgedEarly, maxStore: d.maxStore };
  d.m.unmount();
  Date.now = REAL_NOW;
  return out;
}

describe("T6 THE BOUND — judged cards uncapped for their life; praise and info capped positionally; nothing outlives itself", () => {
  const cases: BoundCase[] = [];
  for (let n = 0; n <= 6; n += 1)
    for (const seq of sequences(n))
      for (const spacing of [0, 100, 300, 1_000] as const)
        for (const quiet of [false, true])
          for (const openedThenClosed of [false, true])
            for (const pressHeld of [false, true]) cases.push({ seq, spacing, quiet, openedThenClosed, pressHeld });
  for (let n = 7; n <= 8; n += 1)
    for (const ms of multisets(n))
      for (const seq of [ms, [...ms].reverse(), interleave(ms)])
        for (const quiet of [false, true])
          for (const openedThenClosed of [false, true])
            for (const pressHeld of [false, true]) cases.push({ seq, spacing: 300, quiet, openedThenClosed, pressHeld });

  it("(i)–(vi) on every drive; C2 printed per variant", () => {
    expect(cases.length, "the grid is not the one the brief names").toBe(5_461 * 32 + 285 * 3 * 8);
    const perVariant = new Map<string, { drives: number; judgedEarly: number; maxStore: number; broken: number }>();
    const byReason = new Map<string, number>();
    const examples: string[] = [];
    let broken = 0;
    for (const c of cases) {
      const r = runBound(c);
      const key = `n${c.seq.length <= 6 ? "≤6" : "7-8"} spacing=${c.spacing} quiet=${c.quiet} opened=${c.openedThenClosed} press=${c.pressHeld}`;
      const v = perVariant.get(key) ?? { drives: 0, judgedEarly: 0, maxStore: 0, broken: 0 };
      v.drives += 1;
      v.judgedEarly += r.judgedEarly;
      v.maxStore = Math.max(v.maxStore, r.maxStore);
      if (r.bad.length > 0) v.broken += 1;
      perVariant.set(key, v);
      if (r.bad.length === 0) continue;
      broken += 1;
      for (const b of r.bad) {
        const reason = b.slice(0, b.indexOf(")") + 1);
        byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
      }
      if (examples.length < 6) examples.push(`[${c.seq.join(",")}] ${key}: ${r.bad.slice(0, 3).join("; ")}`);
    }
    process.stdout.write(`T6 bound: ${cases.length} drives, ${broken} broke the rule ${JSON.stringify(Object.fromEntries(byReason))}\n`);
    for (const [k, v] of perVariant) process.stdout.write(`C2 ${k}: drives ${v.drives}, judged removed before their life ${v.judgedEarly}, max store ${v.maxStore}, broken ${v.broken}\n`);
    expect({ broken, examples }, "a judged card was capped inside its life, a card outlived itself, or the cap stopped capping praise").toEqual({ broken: 0, examples: [] });
  }, 600_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// T7  THE PHONE — the same queue feeds the peek (R4)
// ═════════════════════════════════════════════════════════════════════════════

describe("T7 the phone peek: a fault keeps it for its life against praise; four faults are as on base", () => {
  it("BASE-4praise: the active peek is F on every commit before 8 000 (base: «Браво 4» from 1 200)", () => {
    const { d } = fourPraise(fault("F"), false, true);
    const trace = d.commits.map((c) => `${c.t}:${c.phone!.active ?? "—"}+${c.phone!.queued}`);
    process.stdout.write(`T7 phone 4praise: ${trace.join(" ")}\n`);
    const before = d.commits.filter((c) => c.t < 8_000);
    expect(before.filter((c) => c.phone!.active !== "F").map((c) => `${c.t}:${c.phone!.active}`), "praise took the phone peek from a live fault").toEqual([]);
    d.m.unmount();
  });

  it("4faults: the active peek at every commit is base's (only «+N» moves: +4 from 1 200 to 8 000)", () => {
    const d = drive({ quiet: false, phone: true });
    d.push(0, [fault("F")]);
    for (let i = 1; i <= 4; i += 1) d.push(i * 300, [fault(`G${i}`)]);
    d.drain(60_000);
    const changes: string[] = [];
    let last = "";
    for (const c of d.commits) {
      if (c.phone!.active !== last) changes.push(`${c.t}:${c.phone!.active ?? "—"}`);
      last = c.phone!.active ?? "—";
    }
    process.stdout.write(`T7 phone 4faults: ${d.commits.map((c) => `${c.t}:${c.phone!.active ?? "—"}+${c.phone!.queued}`).join(" ")}\n`);
    expect(changes).toEqual(["0:F", "300:G1", "600:G2", "900:G3", "1200:G4", "9200:—"]);
    d.m.unmount();
  });

  it("source pin: the shell maps violation → violation, lesson → hint, commendation → praise, else null; PRIORITY is unchanged", () => {
    const shell = code(SHELL_SRC);
    const start = shell.indexOf("toasts.map((t): SimOverlayItem | null => {");
    expect(start, "the shell's phone toast mapping moved or changed shape").toBeGreaterThan(0);
    const block = shell.slice(start, shell.indexOf("return null;", start) + "return null;".length);
    const kinds = [...block.matchAll(/if \(t\.event\.kind === "(\w+)"\) \{\s*return \{\s*id: `toast:\$\{t\.id\}`,\s*kind: "(\w+)"/g)].map((x) => `${x[1]}→${x[2]}`);
    expect(kinds, "the phone's kind mapping changed — T7's copy must follow it").toEqual(["violation→violation", "lesson→hint", "commendation→praise"]);
    const table = code(OVERLAY_SRC).match(/const PRIORITY: Record<SimOverlayKind, number> = \{([^}]*)\}/);
    expect(table?.[1]?.replace(/\s+/g, " ").trim()).toBe(
      "end: 100, teach: 90, violation: 80, warning: 70, hint: 60, praise: 50, predrive: 40, advisor: 30, task: 20, legend: 10,",
    );
    expect([overlayPriority("violation"), overlayPriority("hint"), overlayPriority("praise")]).toEqual([80, 60, 50]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T8  NOTHING GRADED READS THE QUEUE — an allowlist (F8)
// ═════════════════════════════════════════════════════════════════════════════

describe("T8 the queue and its cap are read only by the HUD files and the shell", () => {
  it("every non-test file under platform/src that names useHudToastQueue | capToastQueue | capExempt | MAX_QUEUED is on the allowlist", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === "__tests__" || name === "node_modules") continue;
          walk(p);
        } else if (/\.(tsx?|mjs|cjs|js)$/.test(name) && !/\.test\./.test(name)) {
          if (/useHudToastQueue|capToastQueue|capExempt|MAX_QUEUED/.test(readFileSync(p, "utf8"))) hits.push(relative(SRC_ROOT, p).replace(/\\/g, "/"));
        }
      }
    };
    walk(SRC_ROOT);
    expect(hits.sort(), "a file outside the HUD and the shell reads the toast queue").toEqual([
      "components/sim/lesson-ui/LessonPlayShell.tsx",
      "modules/sim/hud/HudToasts.tsx",
      "modules/sim/hud/hudPreferences.ts",
      "modules/sim/hud/index.ts",
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T10  THE CAP IS POSITIONAL (M6's killers)
// ═════════════════════════════════════════════════════════════════════════════

describe("T10 capToastQueue keeps the first `max` cards of ANY kind plus `keep` — exempt cards count toward max", () => {
  it("pure: [5,4,3,2,1], max 2, keep {5,4} → [5,4] (a count-only-the-non-exempt cap would give [5,4,3,2])", () => {
    expect(capToastQueue([{ id: 5 }, { id: 4 }, { id: 3 }, { id: 2 }, { id: 1 }], 2, new Set([5, 4]))).toEqual([{ id: 5 }, { id: 4 }]);
  });

  it("queue: praise P, then four judged cards one per push — P is in the store after the 3rd and gone after the 4th", () => {
    const d = drive({ quiet: false });
    const [p] = d.push(0, [praise("P")]);
    const after: boolean[] = [];
    for (let i = 1; i <= 4; i += 1) {
      d.push(i * 100, [i % 2 === 0 ? teach(`Научи ${i}`) : fault(`F${i}`)]);
      after.push(d.q.toasts.some((t) => t.id === p));
    }
    expect(after, "four newer judged cards did not count toward the cap's four places").toEqual([true, true, true, false]);
    d.drain(60_000);
    expect(d.verdict()).toEqual([]);
    d.m.unmount();
  });
});
