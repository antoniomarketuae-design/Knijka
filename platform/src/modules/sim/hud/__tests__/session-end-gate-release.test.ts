/**
 * SWEEP 161 · THE RESULT SCREEN OPENED 64 px DOWN ITS OWN FIRST CONTROL.
 *
 * MEASURED · four frames, all mobile, all with the same slice:
 * sc-rb-exit-signal, sc-crossing-dart, sc-signal-flashing and
 * sc-ed-poligon-chain — `08-debrief.png` at 852 × 393 CSS px. Rows y≈0–25 of
 * the result screen are the BOTTOM HALVES of „Докосни „▾ Скрий разбора“, за да
 * пропуснеш разбора" and of the „Не показвай автоматично" pill beside it. The
 * 44 px control those two belong to is entirely above the top edge. The first
 * thing the student meets after a lesson is a sliced sentence and half a tap
 * target.
 *
 * THE CAUSE IS NOT ON THIS SCREEN, IT IS THE SCREEN BEFORE IT. Three facts,
 * one mechanism:
 *
 *   1. every one of the four has «Сесията завърши — първо се самооцени» on its
 *      `07-end.png` — the I1 gate (`calibrationLocked`) was the surface
 *      immediately before the result, and the thumb had to scroll it to reach
 *      «Пропусни» at the bottom of the gate card;
 *   2. the gate and the result are the SAME mounted subtree.
 *      `calibrationLocked` only changes what SessionEndScreen RETURNS — both
 *      branches return a `<div>` in the same position, so React reconciles them
 *      onto one DOM node and its `scrollTop` outlives the swap, applied now to
 *      a document five times as long;
 *   3. the PC leg of the same sweep shows no offset at all — at 900 px the gate
 *      fits and nothing ever had to scroll.
 *
 * WHICH BOX HOLDS THE OFFSET, AND WHY THE FIRST FIX COULD NOT CLEAR IT. The
 * first pass reached only for `scrollIntoView`, which is specified to move
 * every scrollable ANCESTOR and never the element's own `scrollTop` — and this
 * screen's root is itself a scroll container (`max-h-full … overflow-y-auto`),
 * the innermost one a thumb can grab. So the one box guaranteed to be carrying
 * the offset was the one box that call could not touch. `releaseGateScroll`
 * zeroes it AND asks the ancestors, in that order.
 *
 * WHY SOME OF THIS FILE READS SOURCE — AND WHY THAT WAS NOT ENOUGH.
 *
 * The whole suite is `environment: "node"` (vitest.config.ts) and no DOM
 * package is installed, so the two pure helpers were called for real and the
 * WIRING between them — that the release is performed by an effect, on the
 * edge, against the root's ref — was read off the file instead.
 *
 * ⚠ 2026-08-19: THAT WIRING BLOCK GUARDED NOTHING, AND IT WAS MEASURED RATHER
 * THAN SUSPECTED. The effect was replaced by a call to an inert local of the
 * same shape —
 *
 *     const noEffect = (_f: () => void, _d: unknown[]) => {};
 *     noEffect(() => {  … the body, character for character …  }, [calibrationLocked]);
 *
 * — so every string the three source rows grep for survived, including the
 * `}, [calibrationLocked])` tail the dependency row matches on. THE FILE RAN
 * 7/7 GREEN against a screen that no longer resets its scroll at all, i.e.
 * against the exact defect in the header: the debrief opening 64 px down its
 * own first control on sc-rb-exit-signal, sc-crossing-dart, sc-signal-flashing
 * and sc-ed-poligon-chain. A test that passes equally before and after guards
 * nothing.
 *
 * SO §WIRING NOW MOUNTS THE SCREEN AND RUNS ITS EFFECTS (`hookHarness.ts`, the
 * technique `touchPadRelease.test.tsx` §7 proved on TouchControls). React's
 * hooks are calls into a dispatcher slot and the slot is reachable, so the real
 * component body runs, its real `useRef`s allocate, and its effects fire in
 * order against a fake window. The ref is handed a recording stand-in and the
 * question becomes „did the screen scroll the element back to the top", which
 * is what the four frames were about.
 *
 * MUTATIONS THIS FILE IS PROVED AGAINST — every one of them run, not reasoned:
 *   · delete `el.scrollTop = 0`          → „zeroes the element's own scrollTop" red
 *   · delete the `scrollIntoView`        → „…and then asks every ancestor" red
 *   · `return wasLocked` in gateReleased → „never on a plain re-render" red
 *   · `return !isLocked`                 → „fires on the release edge" stays green,
 *                                          „never on a plain re-render" goes red
 *   · the effect made inert, body intact → §WIRING's first two rows red
 *                                          (was 7/7 GREEN before this change)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSessionSummary, type ViolationEvent } from "../../rules";
import { lessonById, type LessonResult } from "../../lessons";
import { gateReleased, releaseGateScroll, SessionEndScreen } from "../SessionEndScreen";
import { mountHook } from "./hookHarness";

const SRC = resolve(__dirname, "..");
const END_SCREEN = readFileSync(resolve(SRC, "SessionEndScreen.tsx"), "utf8");

/** Comments in this file quote the BEFORE state; assertions must read code. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
const END_SCREEN_CODE = code(END_SCREEN);

/** A stand-in for the root element: records both halves of the reset. */
function fakeRoot(scrollTop: number) {
  const calls: ScrollIntoViewOptions[] = [];
  return {
    scrollTop,
    scrollIntoView(opts: ScrollIntoViewOptions) {
      calls.push(opts);
    },
    calls,
  };
}

describe("the I1 gate's scroll offset does not survive into the result", () => {
  it("FAILS ON THE SHIPPED BUILD: it zeroes the element's own scrollTop", () => {
    // 64 px is the measured offset off sc-rb-exit-signal/mobile-right — the
    // 44 px control, the 4 px gap and the scrim's p-4.
    const root = fakeRoot(64);
    releaseGateScroll(root);
    expect(root.scrollTop).toBe(0);
  });

  it("…and then asks every ancestor, which is the half scrollIntoView owns", () => {
    // On our OWN root, so the browser picks whichever ancestor scrolls: this
    // component must not know that the shell's scrim is the scroll port today.
    const root = fakeRoot(64);
    releaseGateScroll(root);
    expect(root.calls).toEqual([{ block: "start" }]);
  });

  it("does nothing at all — and does not throw — before the ref is attached", () => {
    expect(() => releaseGateScroll(null)).not.toThrow();
  });

  it("THE OTHER DIRECTION: it fires on the RELEASE, never on every render", () => {
    // A reset with no edge test would yank a student back to the top every time
    // the shell's 150 ms HUD poll re-rendered this screen — i.e. it would make
    // the debrief unreadable while claiming to fix reading it.
    expect(gateReleased(true, false)).toBe(true);
    // Still held; nothing to put at the top yet.
    expect(gateReleased(true, true)).toBe(false);
    // A plain re-render of the released result — the 150 ms poll case.
    expect(gateReleased(false, false)).toBe(false);
    // The gate CLOSING over a result (a retry re-arming it) is not a release.
    expect(gateReleased(false, true)).toBe(false);
  });

  it("the reset is aimed at the root, and the root gives the scrim's p-4 back", () => {
    // `scroll-mt-4` is a Tailwind utility on the root's class list: the class
    // string IS the behaviour, so reading it is the assertion and not a proxy
    // for one. The two rows that used to sit beside this one were proxies, and
    // §WIRING below replaced them with the thing itself.
    expect(END_SCREEN_CODE).toContain("scroll-mt-4");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   §WIRING — THE SCREEN IS MOUNTED AND ITS EFFECTS ARE RUN.

   Everything above is `releaseGateScroll` and `gateReleased` called directly:
   a correct mechanism. This section answers the question those cannot, and the
   question the three deleted source rows only appeared to answer — DOES
   ANYTHING CALL IT. On 2026-08-19 the answer was no and the file was 7/7 green
   (see the header). The measurement is now the mount.

   `resultRef` is a `useRef(null)` inside the component, so the harness reaches
   into the slot React allocated and puts the recording stand-in there — the
   same thing the browser does when it attaches the DOM node. Then the effects
   run and the stand-in is asked what happened to it.
   ═══════════════════════════════════════════════════════════════════════════ */

const l0 = lessonById("l0-free-drive")!;

/** A real graded result: the summary is the ENGINE's, never hand-written. */
function resultOf(mistakes: ViolationEvent[] = []): LessonResult {
  const summary = buildSessionSummary(mistakes);
  return {
    lessonId: l0.id,
    summary,
    objectives: [],
    completedAll: true,
    aborted: false,
    passed: summary.passed,
    score: summary.score.totalPoints,
    effectiveScore: summary.score.totalPoints,
    escalations: [],
    durationSec: 90,
  };
}

/**
 * FIND THE TWO REFS THE EFFECT USES, AND FAIL LOUDLY IF THE PAIR MOVES.
 *
 * The component allocates several `useRef(null)`s; picking "the first null one"
 * silently chose the wrong slot on the first attempt and the mount reported
 * „scrollTop 64" as though the effect had not run. So the pair is identified by
 * the one relation the source guarantees and a reader can check in four lines:
 *
 *     const resultRef = useRef<HTMLDivElement>(null);
 *     const wasCalibrationLocked = useRef(calibrationLocked);
 *
 * — the element ref is the slot IMMEDIATELY BEFORE the boolean one. That
 * adjacency is asserted rather than assumed, so a hook inserted between them
 * turns this into a red test that names the problem instead of a green one that
 * seeds the wrong object.
 */
function gateRefs(slots: Array<{ v: unknown }>): {
  rootRef: { current: unknown };
  wasRef: { current: unknown };
} {
  const isRef = (v: unknown): v is { current: unknown } =>
    typeof v === "object" && v !== null && "current" in v;
  const at = slots.findIndex((s) => isRef(s.v) && typeof s.v.current === "boolean");
  expect(at, "the screen must still hold a boolean edge ref (wasCalibrationLocked)").toBeGreaterThan(0);
  const before = slots[at - 1]?.v;
  expect(
    isRef(before),
    "resultRef must still be declared immediately before wasCalibrationLocked",
  ).toBe(true);
  return { rootRef: before as { current: unknown }, wasRef: slots[at]!.v as { current: unknown } };
}

/**
 * Mount the real screen at a given lock state, with the root's ref pointing at
 * a recording stand-in that starts 64 px down — the measured offset off
 * sc-rb-exit-signal/mobile-right.
 *
 * `wasLocked` is what the PREVIOUS render left in `wasCalibrationLocked`, which
 * is the whole edge. It is written into the ref slot after the render and
 * before the effects run, exactly where React's own second render would leave
 * it, so the four corners of the edge are all reachable from a single commit.
 */
function mountAtGate(opts: { wasLocked: boolean; isLocked: boolean; scrollTop: number }) {
  const calls: ScrollIntoViewOptions[] = [];
  const root = {
    scrollTop: opts.scrollTop,
    scrollIntoView(o: ScrollIntoViewOptions) {
      calls.push(o);
    },
  };
  const mounted = mountHook(
    () =>
      SessionEndScreen({
        lessonTitleBg: "Тестов урок",
        result: resultOf(),
        debriefText: "разбор",
        concepts: [],
        xpEarned: null,
        onRetry: () => undefined,
        onExit: () => undefined,
        nextLessonTitleBg: null,
        onNextLesson: null,
        calibrationLocked: opts.isLocked,
      } as unknown as Parameters<typeof SessionEndScreen>[0]),
    {
      // The ref slots are populated during the render above, so they are
      // seeded here — between the render and the effect flush — by
      // `beforeEffects`. See `mountHook`'s contract.
      beforeEffects: (slots) => {
        const { rootRef, wasRef } = gateRefs(slots);
        // React has not attached the node yet at this point, and if that ever
        // stops being true the slot found above is not the element ref.
        expect(rootRef.current, "resultRef must arrive at the effect flush unattached").toBeNull();
        rootRef.current = root;
        wasRef.current = opts.wasLocked;
      },
    },
  );
  return { root, calls, mounted };
}

describe("§WIRING — the mounted screen really performs the release", () => {
  it("THE MUTATION ROW: a released gate puts the reader at the top of the result", () => {
    // This is the row that fails on an inert effect. Before this section the
    // whole file passed against one.
    const { root, calls, mounted } = mountAtGate({
      wasLocked: true,
      isLocked: false,
      scrollTop: 64,
    });
    expect(root.scrollTop, "the debrief opened 64 px down its own first control").toBe(0);
    expect(calls).toEqual([{ block: "start" }]);
    mounted.unmount();
  });

  it("THE OPPOSITE DIRECTION: a plain re-render of a released result does NOT", () => {
    // The 150 ms HUD poll. A reset here would yank a student back to the top
    // mid-sentence — a fix that makes the debrief unreadable while claiming to
    // fix reading it, which is the same crime pointing the other way.
    const { root, calls, mounted } = mountAtGate({
      wasLocked: false,
      isLocked: false,
      scrollTop: 210,
    });
    expect(root.scrollTop).toBe(210);
    expect(calls).toEqual([]);
    mounted.unmount();
  });

  it("…and a gate still HELD is not a release either", () => {
    const { root, calls, mounted } = mountAtGate({
      wasLocked: true,
      isLocked: true,
      scrollTop: 64,
    });
    expect(root.scrollTop).toBe(64);
    expect(calls).toEqual([]);
    mounted.unmount();
  });

  it("the edge ref is advanced on every run, or the release fires forever", () => {
    // Without the advance the second effect run would see `was=true` again and
    // reset the scroll on every poll. The ref is read back out of the slot.
    const { mounted } = mountAtGate({ wasLocked: true, isLocked: false, scrollTop: 64 });
    const { wasRef } = gateRefs(mounted.slots);
    expect(wasRef.current, "wasCalibrationLocked must have advanced to the new value").toBe(false);
    mounted.unmount();
  });

  it("does nothing at all — and does not throw — before the ref is attached", () => {
    // The first commit of a released result, with React yet to attach the node.
    const mounted = mountHook(
      () =>
        SessionEndScreen({
          lessonTitleBg: "Тестов урок",
          result: resultOf(),
          debriefText: "разбор",
          concepts: [],
          xpEarned: null,
          onRetry: () => undefined,
          onExit: () => undefined,
          nextLessonTitleBg: null,
          onNextLesson: null,
          calibrationLocked: false,
        } as unknown as Parameters<typeof SessionEndScreen>[0]),
      {
        // The edge is armed but `resultRef` is left null, which is what React
        // has done at the moment the first effect flushes.
        beforeEffects: (slots) => {
          gateRefs(slots).wasRef.current = true;
        },
      },
    );
    expect(() => mounted.unmount()).not.toThrow();
  });
});
