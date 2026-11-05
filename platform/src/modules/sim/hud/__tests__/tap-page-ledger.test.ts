import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { minusPointsBg } from "../../../../lib/content/pointScales";
import { selectOverlay, type SimOverlayItem } from "../overlayQueue";
import { cardTapAction, composeCardDismissHandlers, overlayHasDetail } from "../SimOverlay";
import {
  createTapActivationState,
  createTapClickLedger,
  createTapHandlers,
  TAP_CLICK_SUPPRESS_MS,
  type TapActivationHandlers,
  type TapClickLedger,
} from "../tapActivation";

/**
 * =============================================================================
 * ONE TOUCH TAP ACTS ONCE, ON THE CONTROL THE FINGER PRESSED — lane
 * «tapswallow», sc-roundabout-entry:b63a8fea (rig-w3b phone-L1-ION, iPhone 16
 * landscape, L1), 2026-11-05.
 *
 * THE ROW. The student strikes the island (COLLISION staticObject, опасна,
 * 10 т.). The phone pauses on «УЧЕБЕН МОМЕНТ +2 Удар в неподвижно препятствие …
 * ЗАЩО РАЗБРАХ». One tap on «РАЗБРАХ» clears it, and in the SAME rAF the peek
 * shows the OLDER hint «Интервалът беше добър» at «+0». The graded −10 card
 * never reached the phone glass. «РАЗБРАХ» acts in `pointerup`; the commit puts
 * the violation's ✕ under the finger; the touch's compatibility click (detail
 * 1) then lands on a DIFFERENT `useTapActivation` hook, which held no mark of
 * its own (the guard was per hook), and the ✕ removed the fault for good.
 *
 * WHAT THIS FILE DRIVES. The REAL exported composition — `createTapHandlers`
 * over `createTapActivationState(ledger)`, `composeCardDismissHandlers` for the
 * card, `cardTapAction`, `selectOverlay` over the row's own candidate list —
 * each test on its OWN explicit ledger and fake clock. No test touches the
 * page singleton; T8 pins, as source text, that `useTapActivation` binds it.
 *
 * WHAT IT CANNOT SEE, stated so nobody mistakes it for the device: the browser
 * re-targeting the click to the element committed in `pointerup`. The model
 * here CHOOSES where the click lands (the control now in the slot under
 * «РАЗБРАХ»: the right-most chip of the re-rendered row, or the card when the
 * card is the dismiss button). That half stays PROBABLE until the owed device
 * drive.
 * =============================================================================
 */

const RECT = { left: 660, top: 148, right: 704, bottom: 192 };
/** «РАЗБРАХ»'s centre on frame 13, in CSS px (852 × 393, DPR 3). */
const POINT = { x: 682, y: 170 };
const OUTSIDE = { x: 682, y: 260 };

type Ctl = "ack" | "x" | "why" | "card" | "sheetAck" | "menu";

const TEACH: SimOverlayItem = {
  id: "teach:COLLISION:51.3",
  kind: "teach",
  tone: "teach",
  lineBg: "Удар в неподвижно препятствие",
  detailBg: "Спирачният път не стигна.",
  blocking: true,
  onAck: () => {},
};
/** Mapped as `LessonPlayShell`'s compact `toasts.map` maps a violation. */
const VIOLATION: SimOverlayItem = {
  id: "toast:6",
  kind: "violation",
  tone: "danger",
  chipBg: minusPointsBg("exam", 10),
  lineBg: "Удар в неподвижно препятствие",
  detailBg: "Спирачният път не стигна за препятствието пред колата.",
  raisedAtMs: 0,
};
/** …and a lesson toast, which the shell maps to kind HINT. */
const HINT: SimOverlayItem = {
  id: "toast:5",
  kind: "hint",
  tone: "teach",
  lineBg: "Интервалът беше добър",
  detailBg: "Мярката: никой в кръга не намалява заради теб.",
  raisedAtMs: 0,
};
/** …and a commendation: kind praise, no detail — the dismiss-button card. */
const PRAISE: SimOverlayItem = { id: "toast:7", kind: "praise", tone: "good", chipBg: "Браво", lineBg: "Браво" };

/**
 * The shell and the overlay, reduced to what decides which card is on the
 * glass, over the REAL handlers. One ledger, one clock.
 */
function page(initial: { teach?: SimOverlayItem[]; toasts: SimOverlayItem[]; sheet?: SimOverlayItem | null }) {
  const ledger: TapClickLedger = createTapClickLedger();
  let clock = 0;
  const teach = [...(initial.teach ?? [])];
  const toasts = [...initial.toasts];
  const dismissed = new Set<string>();
  let sheet: SimOverlayItem | null = initial.sheet ?? null;
  const acted: string[] = [];
  const select = () =>
    selectOverlay([teach[0] ?? null, ...toasts].filter((c) => c === null || !dismissed.has(c.id)));
  let shownRef: SimOverlayItem | null = null;
  // F6: `shownRef` is refreshed by a passive effect that react-dom 19.2.4
  // flushes at the end of a Sync-lane commit — so every action below sees the
  // card its own commit put on the glass.
  const commit = () => {
    shownRef = sheet ?? select().active;
  };
  commit();
  const dismiss = () => {
    const it = shownRef;
    if (it === null) return;
    sheet = null;
    dismissed.add(it.id);
    acted.push(`dismiss ${it.id}`);
  };
  const acknowledge = () => {
    sheet = null;
    acted.push(`ack ${teach.shift()?.id ?? "(none)"}`);
  };
  // THE BINDING: every hook on this page obeys the page's one ledger, as
  // `useTapActivation` binds them in the product. The control is a parameter
  // so the binding can be narrowed in ONE place (T2's mutant: ✕ only).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const bind = (_c: Ctl): TapClickLedger => ledger;
  const hook = (c: Ctl, action: () => void): TapActivationHandlers =>
    createTapHandlers(createTapActivationState(bind(c)), action, () => clock);
  const onGlyph = { current: false };
  const h: Record<Ctl, TapActivationHandlers> = {
    ack: hook("ack", () => (acknowledge(), commit())),
    x: hook("x", () => (dismiss(), commit())),
    why: hook("why", () => {
      sheet = shownRef;
      acted.push(`why ${shownRef?.id}`);
      commit();
    }),
    card: composeCardDismissHandlers(
      hook("card", () => {
        const a = cardTapAction({ onDismissGlyph: onGlyph.current, window: null });
        onGlyph.current = false;
        if (a.kind === "dismiss") dismiss();
        commit();
      }),
      onGlyph,
    ) as unknown as TapActivationHandlers,
    sheetAck: hook("sheetAck", () => (acknowledge(), commit())),
    // A control elsewhere on the page (a play-menu row): it only counts.
    menu: hook("menu", () => acted.push("menu")),
  };
  const target = { getBoundingClientRect: () => RECT, querySelector: () => null };
  const ev = (id: number, kind: string, p = POINT) => ({
    pointerId: id,
    pointerType: kind,
    clientX: p.x,
    clientY: p.y,
    currentTarget: target,
  });
  return {
    ledger,
    acted,
    select,
    get sheet() {
      return sheet;
    },
    at(ms: number) {
      clock = ms;
    },
    /** A finger's whole tap: down, up inside. */
    touch(c: Ctl, id: number) {
      h[c].onPointerDown(ev(id, "touch"));
      h[c].onPointerUp(ev(id, "touch"));
    },
    /** A finger pressed on `c` and lifted just outside its rect. */
    touchOutside(c: Ctl, id: number) {
      h[c].onPointerDown(ev(id, "touch"));
      h[c].onPointerUp(ev(id, "touch", OUTSIDE));
    },
    /** A mouse press: down, up, click — the PC's only way in. */
    mouse(c: Ctl) {
      h[c].onPointerDown(ev(1, "mouse"));
      h[c].onPointerUp(ev(1, "mouse"));
      h[c].onClick({ detail: 1 });
    },
    click(c: Ctl, detail = 1) {
      h[c].onClick({ detail });
    },
    /** The control under «РАЗБРАХ»'s point after the re-render (model). */
    slot(): Ctl | null {
      const it = sheet ?? shownRef;
      if (it === null) return null;
      const blocking = it.blocking === true;
      const hasAck = typeof it.onAck === "function";
      const hasDetail = overlayHasDetail(it);
      const closable = !blocking && it.noDismiss !== true;
      if (closable && !hasDetail && !hasAck) return "card";
      if (closable) return "x";
      if (blocking || hasAck) return "ack";
      return hasDetail ? "why" : null;
    },
  };
}

describe("T1 — THE ROW: the ack's compatibility click acts on nothing else", () => {
  for (const landsOn of ["x", "why"] as const) {
    it(`teach → violation, the click delivered to the violation's ${landsOn === "x" ? "✕ (tapDismissChip)" : "ЗАЩО (tapWhy)"}`, () => {
      const p = page({ teach: [TEACH], toasts: [VIOLATION, HINT] });
      const before = p.select();
      expect(before.active?.id).toBe(TEACH.id);
      expect(before.queued, "the badge before the ack").toBe(2);
      p.at(1000);
      p.touch("ack", 7);
      const after = p.select();
      expect(after.active?.id, "after the ack the violation is the card").toBe(VIOLATION.id);
      expect(after.active?.chipBg).toBe(minusPointsBg("exam", 10));
      expect(after.queued, "with the hint queued behind it").toBe(1);
      // The slot model: the violation is a panel ([ЗАЩО][✕]); its ✕ is where
      // «РАЗБРАХ» was. ЗАЩО is driven too, because which of ITS controls sat
      // under the point is PROBABLE until the device frame (F3).
      expect(p.slot()).toBe("x");
      p.at(1008);
      p.click(landsOn);
      const fin = p.select();
      expect(p.acted, "nothing but the ack acted").toEqual([`ack ${TEACH.id}`]);
      expect(p.sheet, "no sheet opened").toBeNull();
      expect(fin.active?.id, "the violation is still the card").toBe(VIOLATION.id);
      expect(fin.queued, "at +1").toBe(1);
      expect(fin.active?.id, "the hint is NOT active").not.toBe(HINT.id);
    });
  }
});

describe("T2 — the same guard on every other transition", () => {
  it("teach → plain praise card: the click on the card body dismisses nothing", () => {
    const p = page({ teach: [TEACH], toasts: [PRAISE] });
    p.touch("ack", 7);
    expect(p.slot()).toBe("card");
    p.at(8);
    p.click("card");
    expect(p.acted).toEqual([`ack ${TEACH.id}`]);
    expect(p.select().active?.id, "the praise card survives").toBe(PRAISE.id);
  });

  it("teach → violation with the click on ЗАЩО: no sheet opens", () => {
    const p = page({ teach: [TEACH], toasts: [VIOLATION] });
    p.touch("ack", 7);
    p.at(8);
    p.click("why");
    expect(p.sheet).toBeNull();
    expect(p.acted).toEqual([`ack ${TEACH.id}`]);
  });

  it("a deliberate ✕ on card A → plain card B: B survives (one tap, one card)", () => {
    const p = page({ toasts: [HINT, PRAISE] });
    p.touch("x", 7);
    expect(p.select().active?.id).toBe(PRAISE.id);
    expect(p.slot()).toBe("card");
    p.at(8);
    p.click("card");
    expect(p.acted).toEqual([`dismiss ${HINT.id}`]);
    expect(p.select().active?.id, "B survives").toBe(PRAISE.id);
  });

  it("the briefing sheet's «Разбрах» (tapSheetAck) → the next peek keeps its card", () => {
    const p = page({ teach: [TEACH], toasts: [VIOLATION, HINT], sheet: TEACH });
    p.touch("sheetAck", 7);
    expect(p.select().active?.id).toBe(VIOLATION.id);
    p.at(8);
    p.click(p.slot() ?? "x");
    expect(p.acted).toEqual([`ack ${TEACH.id}`]);
    expect(p.select().active?.id).toBe(VIOLATION.id);
    expect(p.select().queued).toBe(1);
  });
});

describe("T3 — a deliberate fast second tap is a real press", () => {
  it("ack, then a touch on the next card's ✕ within 300 ms: the violation goes ONCE, the hint stays", () => {
    const p = page({ teach: [TEACH], toasts: [VIOLATION, HINT] });
    p.at(0);
    p.touch("ack", 7);
    p.at(250);
    p.touch("x", 8); // a second physical tap, on the violation's ✕
    // It acts ON ITS POINTERUP, with no click behind it: under a second finger
    // no click ever comes (doc 91 · C2), so a guard that made this press wait
    // for one would make the ✕ dead exactly while the student is driving.
    expect(p.acted, "the second tap acted on its own pointerup").toEqual([
      `ack ${TEACH.id}`,
      `dismiss ${VIOLATION.id}`,
    ]);
    // …and BOTH compatibility clicks now land on that hook, which renders
    // the hint's ✕.
    p.at(260);
    p.click("x");
    p.at(270);
    p.click("x");
    expect(p.acted).toEqual([`ack ${TEACH.id}`, `dismiss ${VIOLATION.id}`]);
    expect(p.select().active?.id, "the hint survives").toBe(HINT.id);
  });
});

describe("T4 — a mouse after an owed touch", () => {
  it("the touch ack's click never comes; a mouse click on ✕ at +100 ms dismisses once, and the owed click is still counted", () => {
    const p = page({ teach: [TEACH], toasts: [VIOLATION, HINT] });
    p.at(0);
    p.touch("ack", 7); // under a second finger: no compatibility click, ever
    p.at(100);
    p.mouse("x");
    expect(p.acted).toEqual([`ack ${TEACH.id}`, `dismiss ${VIOLATION.id}`]);
    expect(p.ledger.owed.length, "the ack's owed click is still counted").toBe(1);
    p.at(120);
    p.click("menu"); // a detail-1 click with no press of its own, elsewhere
    expect(p.acted, "suppressed by the owed entry").not.toContain("menu");
  });

  it("the PC with no touch at all: every control acts once on its mouse click", () => {
    const p = page({ teach: [TEACH], toasts: [VIOLATION, HINT, PRAISE] });
    p.mouse("ack");
    p.at(50);
    p.mouse("x"); // dismisses the violation
    p.at(100);
    p.mouse("menu");
    p.at(150);
    p.mouse("why"); // opens the hint's sheet
    expect(p.acted).toEqual([`ack ${TEACH.id}`, `dismiss ${VIOLATION.id}`, "menu", `why ${HINT.id}`]);
    p.at(200);
    p.mouse("x"); // closes the hint (the sheet is the hint)
    p.at(250);
    p.mouse("card"); // the praise card's body
    expect(p.acted.slice(4)).toEqual([`dismiss ${HINT.id}`, `dismiss ${PRAISE.id}`]);
  });
});

describe("T5 — keyboard and assistive activation (detail 0) is never eaten", () => {
  function counting() {
    const ledger = createTapClickLedger();
    let clock = 0;
    const n: Record<string, number> = { ack: 0, x: 0, card: 0 };
    const mk = (k: string) => createTapHandlers(createTapActivationState(ledger), () => (n[k] += 1), () => clock);
    const onGlyph = { current: false };
    const h = {
      ack: mk("ack"),
      x: mk("x"),
      card: composeCardDismissHandlers(mk("card"), onGlyph) as unknown as TapActivationHandlers,
    };
    const target = { getBoundingClientRect: () => RECT, querySelector: () => null };
    const tap = (c: keyof typeof h, id: number) => {
      const e = { pointerId: id, pointerType: "touch", clientX: POINT.x, clientY: POINT.y, currentTarget: target };
      h[c].onPointerDown(e);
      h[c].onPointerUp(e);
    };
    return { ledger, n, h, tap, at: (ms: number) => (clock = ms) };
  }

  it("acts under every ledger state — owed, consumed, expired — on «РАЗБРАХ», the ✕ and the card", () => {
    for (const state of ["owed", "consumed", "expired"] as const) {
      const c = counting();
      c.tap("ack", 7);
      const base = c.n.ack;
      if (state === "consumed") c.h.ack.onClick({ detail: 1 });
      if (state === "expired") c.at(TAP_CLICK_SUPPRESS_MS + 5);
      for (const k of ["ack", "x", "card"] as const) {
        const was = c.n[k];
        c.h[k].onClick({ detail: 0 });
        expect(c.n[k], `${state}: detail 0 on ${k}`).toBe(was + 1);
      }
      expect(c.n.ack).toBe(base + 1);
    }
  });

  it("a detail-0 click elsewhere while a click is owed acts, and the owed click is STILL suppressed", () => {
    const c = counting();
    c.tap("ack", 7);
    expect(c.n.ack).toBe(1);
    c.at(4);
    c.h.x.onClick({ detail: 0 });
    expect(c.n.x, "the keyboard press on ✕ acted").toBe(1);
    c.at(8);
    c.h.card.onClick({ detail: 1 }); // the ack's own click, on a re-rendered control
    expect(c.n.card, "the owed compatibility click is still suppressed").toBe(0);
  });
});

describe("T6 — the multi-touch case: the owed click never comes, and the debt expires", () => {
  it("an AT-like detail-1 click with no pointerdown acts at TAP_CLICK_SUPPRESS_MS + 1", () => {
    const p = page({ teach: [TEACH], toasts: [VIOLATION, HINT] });
    p.at(0);
    p.touch("ack", 7);
    p.at(TAP_CLICK_SUPPRESS_MS + 1);
    p.click("menu");
    expect(p.acted).toEqual([`ack ${TEACH.id}`, "menu"]);
  });
});

describe("T7 — two taps before either click: the ledger COUNTS", () => {
  it("both clicks land on hooks that saw neither pointerdown, both are suppressed, and a third tap acts", () => {
    const p = page({ teach: [TEACH], toasts: [VIOLATION, HINT, PRAISE] });
    p.at(0);
    p.touch("ack", 7);
    p.at(120);
    p.touch("x", 8); // the violation's ✕
    p.at(130);
    p.click("why"); // the hint's ЗАЩО
    p.at(131);
    p.click("card"); // a plain praise card's body
    expect(p.acted).toEqual([`ack ${TEACH.id}`, `dismiss ${VIOLATION.id}`]);
    expect(p.sheet).toBeNull();
    p.at(500);
    p.touch("x", 9); // a third deliberate tap
    expect(p.acted).toEqual([`ack ${TEACH.id}`, `dismiss ${VIOLATION.id}`, `dismiss ${HINT.id}`]);
  });
});

describe("T9 — the shared-hook cascade with an older owed entry", () => {
  it("✕ on A dismisses A once; the two clicks that follow on the same hook leave B", () => {
    const p = page({ toasts: [VIOLATION, HINT] });
    p.at(0);
    p.touch("menu", 5); // a tap elsewhere whose click has not come
    p.at(200);
    p.touch("x", 7); // ✕ of card A (the violation)
    p.at(210);
    p.click("x"); // now card B's ✕
    p.at(220);
    p.click("x");
    expect(p.acted).toEqual(["menu", `dismiss ${VIOLATION.id}`]);
    expect(p.select().active?.id, "B survives").toBe(HINT.id);
  });
});

describe("T10 — a touch released outside keeps its own click", () => {
  it("its click acts exactly once, and the other tap's owed entry is still counted", () => {
    const p = page({ toasts: [VIOLATION, HINT] });
    p.at(0);
    p.touch("menu", 5); // another tap, owed its click
    p.at(50);
    p.touchOutside("x", 7); // pressed the ✕, lifted just outside: nothing acted
    expect(p.acted).toEqual(["menu"]);
    p.at(110);
    p.click("x"); // that press's own click, on that same control
    expect(p.acted, "never an only").toEqual(["menu", `dismiss ${VIOLATION.id}`]);
    expect(p.ledger.owed.length, "the other tap is still owed").toBe(1);
    p.at(120);
    p.click("why");
    expect(p.acted).toEqual(["menu", `dismiss ${VIOLATION.id}`]);
  });
});

// ---------------------------------------------------------------------------
// T8 — THE CALL-SITE CENSUS PIN. The ledger is page-wide only if every hook
// binds it, and „binds" is source text: found by grep at test time, never typed.
// ---------------------------------------------------------------------------

const SRC = path.resolve(__dirname, "../../../..");

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function productionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...productionFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** The reviewed list, by file · enclosing function · symbol (not by line). */
const REVIEWED_CALL_SITES = [
  "components/sim/LessonScene.tsx · DemoDeck · tapToggle",
  "components/sim/LessonScene.tsx · ReadyScene · tapDismissTouchHint",
  "components/sim/LessonScene.tsx · ReadyScene · tapResume",
  "components/sim/TouchControls.tsx · GlyphButton · tap",
  "components/sim/TouchControls.tsx · RailButton · tap",
  "components/sim/TouchControls.tsx · SheetCell · tap",
  "components/sim/lesson-ui/LessonPlayShell.tsx · PlayMenu · tapToggle",
  "components/sim/lesson-ui/LessonPlayShell.tsx · PlayMenuRow · tap",
  "components/sim/lesson-ui/TraceTimeline.tsx · TraceTimeline · tapLoop",
  "components/sim/lesson-ui/TraceTimeline.tsx · TraceTimeline · tapNext",
  "components/sim/lesson-ui/TraceTimeline.tsx · TraceTimeline · tapPlay",
  "components/sim/lesson-ui/TraceTimeline.tsx · TraceTimeline · tapPrev",
  "components/sim/lesson-ui/TraceTimeline.tsx · TraceTimeline · tapSpeed",
  "modules/sim/hud/SimOverlay.tsx · SimOverlay · cardPress",
  "modules/sim/hud/SimOverlay.tsx · SimOverlay · tapAck",
  "modules/sim/hud/SimOverlay.tsx · SimOverlay · tapCloseSheet",
  "modules/sim/hud/SimOverlay.tsx · SimOverlay · tapCutText",
  "modules/sim/hud/SimOverlay.tsx · SimOverlay · tapDismissChip",
  "modules/sim/hud/SimOverlay.tsx · SimOverlay · tapSheetAck",
  "modules/sim/hud/SimOverlay.tsx · SimOverlay · tapWhy",
];

describe("T8 — every tap hook obeys the ONE page ledger", () => {
  const files = productionFiles(SRC);

  it("(a) the set of useTapActivation call sites equals the reviewed list", () => {
    const found: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      if (rel === "modules/sim/hud/tapActivation.ts") continue;
      const s = stripComments(readFileSync(file, "utf8"));
      for (const m of s.matchAll(/useTapActivation\(/g)) {
        const before = s.slice(0, m.index);
        const sym = /(?:const|let)\s+(?:\[[^\]]*\]|(\w+))\s*=\s*$/.exec(before)?.[1] ?? "(unassigned)";
        const fns = [...before.matchAll(/function\s+(\w+)\s*\(/g)];
        const fn = fns.length > 0 ? fns[fns.length - 1][1] : "(module)";
        found.push(`${rel} · ${fn} · ${sym}`);
      }
    }
    expect(found.sort(), "a new useTapActivation site must be reviewed against the page ledger").toEqual(
      [...REVIEWED_CALL_SITES].sort(),
    );
  });

  it("(b) useTapActivation binds the page singleton, made once at module scope", () => {
    const s = stripComments(readFileSync(path.join(SRC, "modules/sim/hud/tapActivation.ts"), "utf8"));
    const hookBody = s.slice(s.indexOf("export function useTapActivation("));
    expect(hookBody).toContain("createTapActivationState(PAGE_TAP_LEDGER)");
    expect(hookBody).not.toContain("createTapClickLedger(");
    expect(s.match(/^const PAGE_TAP_LEDGER: TapClickLedger = createTapClickLedger\(\);$/gm)?.length).toBe(1);
  });

  it("(c) nothing else in production makes a tap state, handlers or a ledger", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      if (rel === "modules/sim/hud/tapActivation.ts") continue;
      const s = stripComments(readFileSync(file, "utf8"));
      if (/\b(createTapHandlers|createTapActivationState|createTapClickLedger)\s*\(/.test(s)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * F3 (verifier, lane tapswallow) — pinned at integration, 2026-11-05. Four
 * mutants of the ordered rule survived the builder's suite; the verifier's
 * kill-probes K1, K5, K6 and K8 are committed here, each on its own ledger and
 * fake clock, over the real `createTapHandlers`:
 *  · MV1 clause 4 consumes the owed entry but leaves its owner's mark →
 *    the owner's own later click is eaten (a never-an-only breach) — K1;
 *  · MV5 a press released OUTSIDE never expires → a stale press authorizes a
 *    click long after it ended — K5;
 *  · MV6 pointercancel keeps the page's press → a cancelled press authorizes — K6;
 *  · MV8 clause 4 consumes the NEWEST owed entry, not the oldest — K8.
 */
describe("F3 — the ordered rule's remaining clauses (verifier kill-probes K1, K5, K6, K8)", () => {
  function rig() {
    const ledger = createTapClickLedger();
    let clock = 0;
    const acted: string[] = [];
    const target = { getBoundingClientRect: () => RECT };
    const mk = (name: string) =>
      createTapHandlers(createTapActivationState(ledger), () => acted.push(name), () => clock);
    const ev = (id: number, type: string, p = POINT) => ({
      pointerId: id,
      pointerType: type,
      clientX: p.x,
      clientY: p.y,
      currentTarget: target,
    });
    return { acted, mk, ev, at: (ms: number) => (clock = ms) };
  }

  it("K1 (MV1): a click consumed by clause 4 takes its owner's mark, so the owner's own released-outside click still acts", () => {
    const r = rig();
    const a = r.mk("A");
    const b = r.mk("B");
    a.onPointerDown(r.ev(7, "touch"));
    a.onPointerUp(r.ev(7, "touch")); // A acts, owed A1
    r.at(10);
    b.onClick({ detail: 1 }); // A's click re-targeted onto B: suppressed, A1 and A's mark gone
    r.at(100);
    a.onPointerDown(r.ev(8, "touch"));
    a.onPointerUp(r.ev(8, "touch", OUTSIDE)); // released outside: nothing acts, still authorizing
    r.at(110);
    a.onClick({ detail: 1 }); // its own click
    expect(r.acted, "K1 never an only").toEqual(["A", "A"]);
  });

  for (const mode of ["outside", "cancel"] as const) {
    it(`${mode === "outside" ? "K5 (MV5): a released-outside press expires" : "K6 (MV6): a cancelled press authorizes nothing"}`, () => {
      const r = rig();
      const a = r.mk("A");
      const x = r.mk("X");
      a.onPointerDown(r.ev(7, "touch")); // finger 1 held on A
      r.at(10);
      x.onPointerDown(r.ev(8, "touch")); // finger 2 on X: the page's latest press
      if (mode === "outside") x.onPointerUp(r.ev(8, "touch", OUTSIDE));
      else x.onPointerCancel(r.ev(8, "touch"));
      r.at(mode === "outside" ? 600 : 20);
      a.onPointerUp(r.ev(7, "touch")); // finger 1 acts on A: owed A1 until +700
      r.at(mode === "outside" ? 720 : 30); // outside: X's press expired at 710, A1 still owed
      x.onClick({ detail: 1 }); // a click with no live press of its own on X
      expect(r.acted, `K ${mode}: the stale press must not authorize`).toEqual(["A"]);
    });
  }

  it("K8 (MV8): clause 4 consumes the OLDEST owed entry", () => {
    const r = rig();
    const a = r.mk("A");
    const b = r.mk("B");
    const c = r.mk("C");
    const d = r.mk("D");
    a.onPointerDown(r.ev(7, "touch"));
    a.onPointerUp(r.ev(7, "touch")); // A1 expires 700
    r.at(300);
    b.onPointerDown(r.ev(8, "touch"));
    b.onPointerUp(r.ev(8, "touch")); // B1 expires 1000
    r.at(400);
    c.onClick({ detail: 1 }); // consumes A1 (the oldest)
    r.at(750);
    d.onClick({ detail: 1 }); // B1 still owed → suppressed
    expect(r.acted, "K8 oldest first").toEqual(["A", "B"]);
  });
});
