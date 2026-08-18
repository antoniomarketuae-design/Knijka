import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { PadPointer, releaseTouchControls, TouchInputSource } from "@/modules/sim/engine";
import { AXIS_RECONCILE_MS, TouchControls, reconcileHeldAxes } from "./TouchControls";
import type { CabinControls } from "@/modules/sim/scene/cabin";

/**
 * =============================================================================
 * THE DEAD PEDAL — doc 91 §C1/§I1/§I3, and the test that would have caught it.
 *
 * HIS WORDS: „when the pop up pops up after that the buttons for gas, forward
 * backward are not working."
 *
 * MEASURED, iPhone 16 landscape, A/B with ONE variable, three runs an arm:
 * thumb HELD on the drive pad when the teach card fires → 3/3 dead. Thumb
 * LIFTED a beat earlier, everything else identical → 0/3 dead. In the dead
 * state the pad was mounted, on top, `elementFromPoint` returned the pad
 * itself, the sim clock was running, the STEERING pad still worked — and a
 * sweep of synthetic `pointerup` ids revived the throttle at exactly id 4, the
 * id the browser had given the thumb that was holding it when the sim paused.
 *
 * The chain, all of it inside TouchControls: `hidden` → the component returned
 * `null` → React removed the pad's node but the INSTANCE lived on (LessonScene
 * mounts it under a `touchCapable` flag that never changes) → every ref lived
 * on with it → the `pointerup` that clears the owning id was delivered to
 * nothing → the pad believed a finger that was long gone still owned it → and
 * „one finger owns this pad" refused every press for the rest of the session.
 *
 * AND THIS IS THE DEFAULT PATH, NOT AN EDGE CASE: the car spawns unbuckled and
 * the seatbelt teach moment pauses the sim ~1.2 s after it starts moving, in
 * every fresh run, at 18–51 km/h — i.e. necessarily with a thumb on the gas.
 *
 * ── WHY THIS FILE IS SHAPED THE WAY IT IS ───────────────────────────────────
 *
 * Three layers, because no one of them can carry the guarantee alone:
 *
 *   1. THE MECHANISM. The ownership is engine state (`PadPointer`) with no DOM
 *      in it, so the exact five-step sequence that killed the pad — press,
 *      hide, show, press again — runs here in microseconds instead of needing
 *      a phone, a card and a stopwatch.
 *   2. THE WIRING. A perfect state machine nobody calls is exactly the bug we
 *      just had: the component's release effect existed, and released half of
 *      what it should. So the effect's body is read from source and asserted.
 *   3. THE RENDER. `react-dom/server` proves the §I3 half — that a hidden
 *      overlay still renders its pads (the node the thumb is holding survives)
 *      and renders NO buttons at all (nothing tabbable, nothing announced).
 *
 * What none of them can do is fire a real finger; that was done in a browser,
 * pre-fix and post-fix, and is recorded in the wave report. This file is what
 * keeps it from coming back silently afterwards.
 * =============================================================================
 */

/** Line endings normalised: the working tree on the dev box is CRLF and CI is
 *  LF, and an assertion that depends on which one it got is not an assertion. */
const SRC = readFileSync(join(__dirname, "TouchControls.tsx"), "utf8").replace(/\r\n/g, "\n");

/** The same file with every comment removed. The assertions below are about
 *  what the component DOES, and this file quotes the old broken lines in its
 *  own prose — so a naive substring search would find the bug in the story
 *  about the bug. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The two files the `hidden` prop is plumbed through, whitespace-flattened —
 *  the seam §4 is about is a prop chain, and a prop chain that has only been
 *  reformatted has not changed. */
function flat(relPath: string): string {
  return readFileSync(join(__dirname, relPath), "utf8").replace(/\s+/g, " ");
}
const SCENE = flat("LessonScene.tsx");
const SHELL = flat("lesson-ui/LessonPlayShell.tsx");

/** The component's release effect, verbatim — the block §I1 lives in. */
function releaseEffectSource(): string {
  const start = SRC.indexOf("useEffect(() => {\n    if (!visible) {");
  expect(start, "the `!visible` release effect must still exist").toBeGreaterThan(0);
  return SRC.slice(start, start + 400);
}

/**
 * =============================================================================
 * THE LIVE HARNESS — and why a test file that already had a „§ THE WIRING"
 * needed one anyway.
 *
 * §2 and the old §6 assert against the SOURCE, with comments stripped. That is
 * a real technique and it is the right one for a prop chain in a file this test
 * does not own (§4). It is the wrong one for an effect, and 2026-08-18 measured
 * exactly how wrong: DELETING THE AXIS-WATCHDOG `useEffect` OUTRIGHT, with the
 * two strings the old rows grepped for left intact elsewhere in the file, ran
 * 54 files / 867 tests GREEN. The pure `reconcileHeldAxes` was covered five
 * ways; nothing anywhere executed the line that calls it.
 *
 * RE-MEASURED HERE BEFORE REPLACING THEM, because „this test is weak" is a
 * claim that has to be executed like any other. The effect was replaced with a
 * dead local of the same body — so `CODE` still contains both
 * `reconcileHeldAxes(touch, steerPad, drivePad)` and `AXIS_RECONCILE_MS` — and
 * the two old rows PASSED. §7's first row fails on it, on the value the car
 * would have driven on: `expected 0.9 to be +0`.
 *
 * There is no DOM in this project's vitest config (`environment: "node"`, and
 * no jsdom in the tree), so the usual answer — render it and let the effects
 * run — is not available. What IS available is that React's hooks are just
 * calls into a dispatcher slot, and the slot is reachable. So this mounts the
 * REAL component: its body runs, its `useState` lazy initialisers allocate the
 * REAL `PadPointer`s, its effects run in order against a fake `window`, and the
 * intervals they schedule can be fired on a fake clock.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: re-render. Every assertion below is about
 * the first commit, which is all the watchdog and the pad handlers need. A
 * setter here mutates the slot and returns; nothing re-renders, and a test that
 * depended on one would be testing this harness rather than the component.
 *
 * IF REACT MOVES THE SLOT, THIS FAILS LOUDLY (`expect(internals)`), which is the
 * only acceptable failure mode for a harness that reaches into internals: it
 * must never degrade into a test that quietly passes on nothing.
 * =============================================================================
 */
interface FakeTimer {
  id: number;
  fn: () => void;
  ms: number;
}

/** A pad's DOM node, as much of one as these handlers actually touch. */
interface FakePadEl {
  captured: number[];
  setPointerCapture(pointerId: number): void;
  getBoundingClientRect(): { top: number; height: number };
}

function fakePadEl(top = 100, height = 152): FakePadEl {
  const captured: number[] = [];
  return {
    captured,
    setPointerCapture(pointerId: number) {
      captured.push(pointerId);
    },
    getBoundingClientRect: () => ({ top, height }),
  };
}

/** The handler set a pad's `<div>` actually renders — read off the tree, not
 *  off the source, so a decoy string cannot satisfy it. */
type PadHandlers = Record<string, unknown>;

interface Mounted {
  touch: TouchInputSource;
  steerPad: PadPointer;
  drivePad: PadPointer;
  /** `[left = steering, right = drivetrain]`, in render order. */
  pads: [PadHandlers, PadHandlers];
  timers: FakeTimer[];
  /** One turn of the fake clock: every scheduled interval fires once. */
  tick(): void;
  /** Every effect cleanup, in order — what an unmount does. */
  unmount(): void;
}

const restoreGlobals: Array<() => void> = [];
afterEach(() => {
  while (restoreGlobals.length) restoreGlobals.pop()?.();
});

function mountOverlay(extra: { hidden: boolean }): Mounted {
  const touch = new TouchInputSource();
  const timers: FakeTimer[] = [];
  let nextTimerId = 1;
  const fakeWindow = {
    addEventListener() {},
    removeEventListener() {},
    setInterval(fn: () => void, ms: number) {
      const id = nextTimerId++;
      timers.push({ id, fn, ms });
      return id;
    },
    clearInterval(id: number) {
      const at = timers.findIndex((t) => t.id === id);
      if (at >= 0) timers.splice(at, 1);
    },
    localStorage: { getItem: () => null },
  };
  const fakeDocument = { documentElement: { dataset: {} as Record<string, string> } };
  const g = globalThis as Record<string, unknown>;
  const hadWindow = "window" in g;
  const hadDocument = "document" in g;
  const prevWindow = g.window;
  const prevDocument = g.document;
  g.window = fakeWindow;
  g.document = fakeDocument;
  restoreGlobals.push(() => {
    if (hadWindow) g.window = prevWindow;
    else delete g.window;
    if (hadDocument) g.document = prevDocument;
    else delete g.document;
  });

  // ── the dispatcher ────────────────────────────────────────────────────────
  const slots: Array<{ v: unknown }> = [];
  const effects: Array<() => (() => void) | void> = [];
  let cursor = 0;
  const slot = <T,>(init: () => T): { v: unknown } => {
    if (cursor === slots.length) slots.push({ v: init() });
    return slots[cursor++];
  };
  const dispatcher = {
    useState<T>(initial: T | (() => T)) {
      const s = slot(() => (typeof initial === "function" ? (initial as () => T)() : initial));
      return [
        s.v as T,
        (update: unknown) => {
          s.v = typeof update === "function" ? (update as (p: unknown) => unknown)(s.v) : update;
        },
      ];
    },
    useRef<T>(initial: T) {
      return slot(() => ({ current: initial })).v;
    },
    useCallback: <T,>(fn: T) => fn,
    useMemo: <T,>(fn: () => T) => fn(),
    useEffect(fn: () => (() => void) | void) {
      effects.push(fn);
    },
    useLayoutEffect(fn: () => (() => void) | void) {
      effects.push(fn);
    },
    useDebugValue() {},
    useId: () => ":r0:",
  };
  const internals = (
    React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H: unknown };
    }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  expect(internals, "React's dispatcher slot has moved — this harness is blind").toBeTruthy();
  const shared = internals as { H: unknown };
  const previousDispatcher = shared.H;
  let tree: unknown;
  try {
    shared.H = dispatcher;
    tree = TouchControls({
      touch,
      cabinRef: { current: null } as { current: CabinControls | null },
      onToggleCamera: () => undefined,
      onPause: () => undefined,
      onReset: () => undefined,
      onToggleFullscreen: null,
      ...extra,
    } as Parameters<typeof TouchControls>[0]);
  } finally {
    shared.H = previousDispatcher;
  }

  const cleanups = effects.map((run) => run());

  const pads = collectSliders(tree);
  expect(pads.length, "both pads must still render as sliders").toBe(2);
  const padPointers = slots
    .map((s) => s.v)
    .filter((v): v is PadPointer => v instanceof PadPointer);
  expect(padPointers.length, "the two PadPointers must be component state").toBe(2);

  return {
    touch,
    steerPad: padPointers[0],
    drivePad: padPointers[1],
    pads: [pads[0], pads[1]],
    timers,
    tick() {
      for (const t of [...timers]) t.fn();
    },
    unmount() {
      for (const c of cleanups) if (typeof c === "function") c();
    },
  };
}

/** Every `role="slider"` element's props, depth-first — i.e. in render order. */
function collectSliders(node: unknown, found: PadHandlers[] = []): PadHandlers[] {
  if (Array.isArray(node)) {
    for (const child of node) collectSliders(child, found);
    return found;
  }
  if (!React.isValidElement(node)) return found;
  const props = node.props as PadHandlers & { children?: unknown };
  if (props.role === "slider") found.push(props);
  if (props.children !== undefined) collectSliders(props.children, found);
  return found;
}

/** A brake key held flat out, as `SimInput.read()` hands it to the merge. */
function keyboardBrakingHard() {
  return { steer: 0, throttle: 0, brake: 1, handbrake: false, clutch: 0 };
}

describe("§1 THE MECHANISM — a hide lets go of the pointer, not only the axes", () => {
  it("refuses a second finger while one owns the pad (the guard that went wrong)", () => {
    const pad = new PadPointer();
    expect(pad.claim(4)).toBe(true);
    expect(pad.claim(9)).toBe(false); // a second thumb may not steal the axis
    expect(pad.pointerId).toBe(4);
  });

  it("ignores a release from any finger but the owner", () => {
    const pad = new PadPointer();
    pad.claim(4);
    expect(pad.release(9)).toBe(false);
    expect(pad.pointerId).toBe(4);
    expect(pad.release(4)).toBe(true);
    expect(pad.pointerId).toBeNull();
  });

  it("THE REGRESSION: press → card → dismiss → press again drives the car", () => {
    // The five steps of his session, in order, against the real objects.
    const touch = new TouchInputSource();
    const steer = new PadPointer();
    const drive = new PadPointer();

    // 1. His thumb is on the gas. The browser gives it pointerId 4.
    expect(drive.claim(4)).toBe(true);
    touch.setThrottle(0.8);

    // 2. The seatbelt teach moment pauses the sim. `hidden` goes true.
    //    His thumb never leaves the glass, so no pointerup is ever coming.
    releaseTouchControls(touch, steer, drive);

    // The car must STOP rather than run away — this half always worked.
    const input = { steer: 0, throttle: 0, brake: 0, handbrake: false, clutch: 0 };
    touch.mergeInto(input);
    expect(input.throttle).toBe(0);

    // 3. …and the pad must not still belong to a finger that can never let go.
    expect(drive.pointerId).toBeNull();

    // 4. He dismisses the card and presses the gas again. The browser hands
    //    the new press a NEW id (it handed id 4 to the finger that is still
    //    down), which is precisely the press that used to be refused.
    expect(drive.claim(7)).toBe(true);

    // 5. The car answers.
    touch.setThrottle(0.8);
    touch.mergeInto(input);
    expect(input.throttle).toBe(0.8);
  });

  it("a stale pointerup from the old finger cannot steal the new gesture", () => {
    // The finger held through the card eventually lifts, and its `pointerup`
    // arrives AFTER the student has taken the pad again. It must be inert.
    const drive = new PadPointer();
    drive.claim(4);
    releaseTouchControls(new TouchInputSource(), drive);
    drive.claim(7);
    expect(drive.release(4)).toBe(false); // the ghost is ignored
    expect(drive.pointerId).toBe(7); // …and the live gesture survives it
  });

  it("frees BOTH pads — the steering pad dies the same way when it is held", () => {
    const touch = new TouchInputSource();
    const steer = new PadPointer();
    const drive = new PadPointer();
    steer.claim(2);
    drive.claim(4);
    releaseTouchControls(touch, steer, drive);
    expect(steer.pointerId).toBeNull();
    expect(drive.pointerId).toBeNull();
  });
});

describe("§2 THE WIRING — the component actually performs the release", () => {
  it("the `!visible` effect releases the axes AND both pads, in one call", () => {
    const effect = releaseEffectSource();
    expect(effect).toContain("releaseTouchControls(touch, steerPad, drivePad)");
  });

  it("unmount releases the same list (a quiz mid-throttle, then a new scene)", () => {
    expect(SRC).toContain("() => () => releaseTouchControls(touch, steerPad, drivePad)");
  });

  it("no bare pointer-id refs are left to drift out of step with it", () => {
    // The defect was two vocabularies for one idea: `touch.releaseAll()` in one
    // place and `drivePointer.current = null` in another. There is now one.
    expect(CODE).not.toMatch(/(steer|drive)Pointer\.current\s*=/);
  });

  it("the overlay no longer answers a hide by destroying itself", () => {
    expect(CODE).not.toMatch(/if\s*\(!visible\)\s*return null/);
  });
});

describe("§3 THE RENDER — hidden is inert, and inert keeps the node", () => {
  const props = {
    touch: new TouchInputSource(),
    cabinRef: { current: null } as { current: CabinControls | null },
    onToggleCamera: () => undefined,
    onPause: () => undefined,
    onReset: () => undefined,
    onToggleFullscreen: null,
  };
  const shown = renderToStaticMarkup(<TouchControls {...props} hidden={false} />);
  const inert = renderToStaticMarkup(<TouchControls {...props} hidden />);

  it("keeps both pads mounted while a card is up (§I3 — the thumb keeps its node)", () => {
    expect((inert.match(/role="slider"/g) ?? []).length).toBe(2);
  });

  it("marks the whole overlay hidden from assistive tech — on the ROOT", () => {
    // Asserted on the opening tag, not anywhere in the markup: the ink inside
    // the pads has always carried `aria-hidden`, so a loose search would pass
    // on an overlay that announces every one of its controls.
    expect(inert).toMatch(/^<div [^>]*data-sim-touch-inert="on"[^>]*aria-hidden="true"/);
    expect(shown).not.toMatch(/^<div [^>]*aria-hidden/);
    expect(shown).not.toContain("data-sim-touch-inert");
  });

  it("leaves nothing tabbable: every button is gone, not merely aria-hidden", () => {
    // `aria-hidden` alone would hide these from a screen reader and LEAVE THEM
    // IN THE TAB ORDER — a different defect, not a fix.
    expect(inert).not.toContain("<button");
    expect(shown).toContain("<button");
  });

  it("makes the pads themselves untouchable — the root's own class says nothing", () => {
    // `pointer-events: none` does not inherit past a child that sets `auto`,
    // which is exactly how this overlay is built.
    expect(shown).toContain("pointer-events-auto absolute touch-none");
    expect(inert).not.toContain("pointer-events-auto");
  });

  it("paints nothing while inert, so the screen is as clear as it always was", () => {
    expect(inert).toContain("opacity:0");
  });
});

/**
 * §4 THE SEAM — every card kind must arrive by the SAME door.
 *
 * §1–§3 make the component safe against `hidden`. They say nothing about how
 * `hidden` is raised, and the defect's blast radius came entirely from that:
 * a teach moment, a micro-quiz, a consequence card, the end screen AND the
 * pause menu are five different features that all pause the sim, and they are
 * only all fixed because they all funnel into one boolean. A sixth card kind
 * wired to its own prop would be a fresh instance of the same bug in a place
 * nobody would think to look — so the funnel is asserted, not assumed.
 *
 * Measured on the real chain, not only read: on `/dev/drive-rig` (which mounts
 * the actual `LessonPlayShell`) the ‖ station took the overlay from
 * `pads 2 · buttons 8 · pointer-events auto` to `pads 2 · buttons 0 ·
 * inert=on · aria-hidden=true · pointer-events none`.
 */
describe("§4 THE SEAM — every card raises the same one boolean", () => {
  it("the scene hands TouchControls `physicsPaused`, and nothing else", () => {
    expect(SCENE).toMatch(/<TouchControls[^>]*hidden=\{physicsPaused\}/);
  });

  it("`physicsPaused` is the pause menu OR the shell's cards — the two sources", () => {
    expect(SCENE).toContain("physicsPaused={paused || menuPaused}");
  });

  it("the shell's `paused` still covers all four card kinds — and now the read mode", () => {
    // End screen · micro-quiz · teach moment · mistake consequence. If a sixth
    // is added it belongs in THIS expression; if one is moved out of it, that
    // card stops releasing the pads and the founder's session breaks again.
    //
    // A FIFTH ARRIVED ON 2026-08-13 and it is `overlaySheetOpen` — the read
    // mode. Asserted term-by-term rather than as one formatted line, because
    // the expression is now multi-line and an exact-string match on a
    // prettier-owned layout is a test about whitespace. What this row defends
    // is WHICH FACTS raise the flag.
    for (const term of [
      "ended",
      "activeQuiz !== null",
      "teachQueue.length > 0",
      "consequence !== null",
      "overlaySheetOpen",
    ]) {
      const paused = SHELL.slice(SHELL.indexOf("paused={"), SHELL.indexOf("driveLocked={"));
      expect(paused, `\`paused\` must still cover ${term}`).toContain(term);
    }
  });

  it("the overlay is mounted under a flag that never changes — the defect's premise", () => {
    // `touchCapable` is read once, at mount (`useState(() => hasTouchScreen())`).
    // That is WHY the refs survived a hide: the instance is never torn down.
    // Stated here so the next reader knows the release effect is the only thing
    // standing between a held finger and a dead pad.
    expect(SCENE).toContain("const [touchCapable] = useState(() => hasTouchScreen());");
    expect(SCENE).toMatch(/\{touchCapable \? \(? ?<TouchControls/);
  });
});

/**
 * =============================================================================
 * §5 THE STRANDED AXIS — a pad that lets go of the finger but not of the pedal.
 *
 * §1–§4 are about the pad being DEAD (it kept an id it should have dropped).
 * This is the same omission read the other way round: the pad drops the id and
 * keeps the AXIS, and because `TouchInputSource.mergeInto` is a priority
 * replace and not a max, that is not a pedal that stops working — it is a
 * pedal that outranks every other device for the rest of the session.
 *
 * `!! the brake is held and the car went 7 -> 10 км/ч — the sim never got the
 *  key; re-asserting it.`   — sweep161, mobile leg, 20 of 22 lessons in chunk F
 *
 * The runs that printed that line were captured before `keyboardTakeoverAllowed`
 * and had this overlay released and inert (the frame shows «МЕНЮ» alone), so
 * they are not this defect's evidence — they are the reason it was looked for.
 * What the takeover fix changed is that a stray drive key no longer sweeps a
 * stranded axis away every few seconds, so from 2026-08-17 a stranded axis is
 * permanent. Both halves below are the price of that.
 * =============================================================================
 */
describe("§5 THE STRANDED AXIS — an axis is held only while its pad owns a finger", () => {
  it("THE DEFECT: a capture lost without a pointerup vetoes the keyboard brake", () => {
    const touch = new TouchInputSource();
    const steer = new PadPointer();
    const drive = new PadPointer();

    // A thumb feathers the brake, then the browser takes the capture away and
    // no `pointerup` and no `pointercancel` is ever delivered to the pad.
    drive.claim(4);
    touch.setBrake(0.15);
    drive.release(4);

    // Every later read: the student's full brake key is replaced by 0.15.
    const vetoed = keyboardBrakingHard();
    touch.mergeInto(vetoed);
    expect(vetoed.brake).toBe(0.15);

    // …and the invariant check is what gives it back.
    reconcileHeldAxes(touch, steer, drive);
    const restored = keyboardBrakingHard();
    touch.mergeInto(restored);
    expect(restored.brake).toBe(1);
  });

  it("THE HARNESS'S OWN SENTENCE: a stranded throttle accelerates under a held brake", () => {
    const touch = new TouchInputSource();
    const drive = new PadPointer();
    drive.claim(4);
    touch.setThrottle(0.9); // the thumb was above centre when capture went
    drive.release(4);

    const braking = keyboardBrakingHard();
    touch.mergeInto(braking);
    expect(braking.brake).toBe(1); // the brake key does arrive…
    expect(braking.throttle).toBe(0.9); // …under a throttle nobody is holding

    reconcileHeldAxes(touch, new PadPointer(), drive);
    const after = keyboardBrakingHard();
    touch.mergeInto(after);
    expect(after.throttle).toBe(0);
  });

  it("THE OPPOSITE DIRECTION: a thumb that IS on the pedal keeps its axis", () => {
    // The crime a watchdog commits is releasing a live gesture — the student
    // presses the glass brake, a drive key is held from a hybrid keyboard or a
    // stuck key, and the check hands the car to the key mid-stop.
    const touch = new TouchInputSource();
    const steer = new PadPointer();
    const drive = new PadPointer();
    drive.claim(4);
    steer.claim(2);
    touch.setBrake(1);
    touch.setSteer(-0.6);

    reconcileHeldAxes(touch, steer, drive);

    const out = { steer: 0, throttle: 1, brake: 0, handbrake: false, clutch: 0 };
    touch.mergeInto(out);
    expect(out.brake).toBe(1); // the thumb still outranks the key
    expect(out.throttle).toBe(1); // …and it did not invent a throttle release
    expect(out.steer).toBe(-0.6);
  });

  it("frees one pad without touching the other's live axis", () => {
    const touch = new TouchInputSource();
    const steer = new PadPointer();
    const drive = new PadPointer();
    steer.claim(2);
    touch.setSteer(0.5);
    touch.setThrottle(0.7); // stranded: the drive pad owns nobody

    reconcileHeldAxes(touch, steer, drive);

    const out = { steer: 0, throttle: 0, brake: 0, handbrake: false, clutch: 0 };
    touch.mergeInto(out);
    expect(out.steer).toBe(0.5);
    expect(out.throttle).toBe(0);
  });

  it("is a no-op on a free, already-released overlay (it cannot fabricate input)", () => {
    const touch = new TouchInputSource();
    reconcileHeldAxes(touch, new PadPointer(), new PadPointer());
    const out = { steer: 0.3, throttle: 0.4, brake: 0.5, handbrake: true, clutch: 0 };
    touch.mergeInto(out);
    expect(out).toEqual({ steer: 0.3, throttle: 0.4, brake: 0.5, handbrake: true, clutch: 0 });
  });
});

describe("§6 THE WIRING — both pads carry all four release edges", () => {
  it.each([
    [0 as const, "the steering pad"],
    [1 as const, "the drivetrain pad"],
  ])("pad %i (%s) ends on up, cancel AND lost capture — one ender, three doors", (nth, _label) => {
    // Read off the RENDERED ELEMENT, not off the source text: the three
    // attributes have to be the SAME function, which is a fact about the tree
    // and cannot be satisfied by a string that merely spells it.
    const pad = mountOverlay({ hidden: false }).pads[nth];
    const end = pad.onPointerUp;
    expect(typeof end, "a pad must end on pointerup").toBe("function");
    expect(pad.onPointerCancel, "…and on pointercancel").toBe(end);
    // The edge that was missing until 2026-08-18. `setPointerCapture` is
    // released without a `pointerup` when the browser takes it back, and the
    // axis outlives the finger for the rest of the session when nothing
    // answers it.
    expect(pad.onLostPointerCapture, "…and on lost capture").toBe(end);
  });

  it("the horn keeps the four edges it has always had (they are not traded)", () => {
    // `useHoldButton` is where the four-edge idiom is written down; the pads
    // borrowed it. A future edit that "unifies" them must not unify downward.
    for (const edge of ["onPointerUp:", "onPointerCancel:", "onLostPointerCapture:"]) {
      expect(CODE).toContain(edge);
    }
  });

});

/**
 * =============================================================================
 * §7 THE WATCHDOG, RUN — the two rows that used to stand here were
 *
 *     expect(CODE).toContain("reconcileHeldAxes(touch, steerPad, drivePad)");
 *     expect(CODE).toContain("AXIS_RECONCILE_MS");
 *
 * and they are the reason the effect could be DELETED OUTRIGHT — 54 files /
 * 867 tests green, both strings left where a grep would still find them. A
 * `toContain` on source cannot tell a call from a spelling.
 *
 * Every row below mounts the real component through the harness at the top of
 * this file and turns a fake clock. Delete the `useEffect` and the first row
 * fails on the value the car would actually have driven on.
 * =============================================================================
 */
describe("§7 THE WATCHDOG, RUN — the effect, not the spelling of it", () => {
  it("THE MUTATION ROW: a live overlay sweeps a stranded throttle off the axis", () => {
    const m = mountOverlay({ hidden: false });

    // Nobody is on the pedals — and the overlay is nevertheless claiming a
    // throttle, which is the state a capture lost without a `pointerup` leaves
    // behind (§5). `mergeInto` is a priority REPLACE, so this is not a pedal
    // that fails to help: it is a pedal that outranks the brake key.
    expect(m.drivePad.pointerId).toBeNull();
    m.touch.setThrottle(0.9);
    const vetoed = keyboardBrakingHard();
    m.touch.mergeInto(vetoed);
    expect(vetoed.throttle, "the strand must really be live before the tick").toBe(0.9);

    m.tick();

    const after = keyboardBrakingHard();
    m.touch.mergeInto(after);
    expect(after.throttle, "the component's own clock must have released it").toBe(0);
    expect(after.brake, "…and handed the axis back to the key").toBe(1);
  });

  it("THE OPPOSITE DIRECTION: it cannot take an axis a finger is holding", () => {
    // The whole reason a watchdog is admissible on this screen is that it can
    // only ever RELEASE. A version of it that also swept a live gesture would
    // be a thumb whose throttle dies every 250 ms — a false failure and a false
    // pass are the same crime.
    const m = mountOverlay({ hidden: false });
    m.drivePad.claim(4);
    m.touch.setThrottle(0.9);
    m.steerPad.claim(2);
    m.touch.setSteer(-0.6);

    m.tick();
    m.tick();

    const out = { steer: 0, throttle: 0, brake: 1, handbrake: false, clutch: 0 };
    m.touch.mergeInto(out);
    expect(out.throttle, "a held pedal survives every tick").toBe(0.9);
    expect(out.steer, "…and so does a held wheel").toBe(-0.6);
  });

  it("runs on its OWN interval at AXIS_RECONCILE_MS, beside the cabin poll", () => {
    const m = mountOverlay({ hidden: false });
    // TWO intervals at this cadence, not one. The constant shares its VALUE
    // with the cabin poll and nothing else: this number is a stuck-pedal
    // window — the longest a phone can hold a pedal the student is not
    // touching — and the file says in as many words that it is „its own
    // constant and its own effect", so that a future „the cabin poll got
    // cheaper at 1 Hz" cannot silently make it four times longer. Folding the
    // two together is the drift that comment forbids, and this is the row that
    // notices.
    expect(m.timers.filter((t) => t.ms === AXIS_RECONCILE_MS).length).toBe(2);
    expect(AXIS_RECONCILE_MS).toBeLessThanOrEqual(250);
  });

  it("stops when the overlay goes — no interval outlives the scene", () => {
    const m = mountOverlay({ hidden: false });
    expect(m.timers.length).toBeGreaterThan(0);
    m.unmount();
    expect(m.timers.length, "every interval is cleared on teardown").toBe(0);
  });

  it("an inert overlay schedules nothing — the `!visible` guard is real", () => {
    // Documented and deliberate: while a card is up the pads are
    // `pointer-events: none`, so no gesture can start and no axis can be
    // stranded — and the hide has already released everything through
    // `releaseTouchControls`. A watchdog running there would be a timer with
    // nothing to do, on the one screen state that must stay cheap.
    const m = mountOverlay({ hidden: true });
    expect(m.timers.length).toBe(0);

    m.touch.setThrottle(0.9);
    m.tick();
    const out = keyboardBrakingHard();
    m.touch.mergeInto(out);
    expect(out.throttle, "nothing is scheduled while inert, so nothing sweeps").toBe(0.9);
  });

  it("the hide really does let go — mounting inert leaves both pads free", () => {
    const m = mountOverlay({ hidden: true });
    expect(m.steerPad.pointerId).toBeNull();
    expect(m.drivePad.pointerId).toBeNull();
  });
});

/**
 * =============================================================================
 * §8 THE SECOND DOOR — an adoption is a gesture, so it captures like one.
 *
 * `adoptable()` lets a FREE pad pick up a pointer that is already moving on it,
 * which is how the pedal answers again the instant a teach card is dismissed
 * without the student lifting and pressing. It is the other entrance to exactly
 * the same gesture `onPointerDown` opens — and only `onPointerDown` called
 * `capturePointer`.
 *
 * That asymmetry is what makes the fourth release edge conditional:
 * `lostpointercapture` is only ever fired for a pointer that HAS capture, so a
 * gesture that came through the adoption door had the two edges the pads had
 * before 2026-08-18, in a file whose §6 asserts they have three. And an
 * uncaptured pointer that lifts anywhere but on the pad never delivers its
 * `pointerup` here at all: the pad goes on owning it, the axis stays ACTIVE,
 * and `reconcileHeldAxes` cannot help because it only frees a pad that owns
 * NOBODY. That is a permanent veto of the brake key, by the same mechanism §5
 * is about, reached through a door §5 does not cover.
 * =============================================================================
 */
describe("§8 THE SECOND DOOR — an adopted pointer is captured, like a pressed one", () => {
  /** A `pointermove` from a pointer that is DOWN (`buttons`), which is the only
   *  kind `adoptable()` accepts. */
  function move(el: FakePadEl, pointerId: number, buttons: number) {
    return { pointerId, buttons, clientX: 40, clientY: 140, currentTarget: el };
  }

  it.each([
    [1 as const, "drivetrain"],
    [0 as const, "steering"],
  ])("the %s pad captures the pointer it adopts", (nth, _label) => {
    const m = mountOverlay({ hidden: false });
    const el = fakePadEl();
    const pad = m.pads[nth];
    (pad.onPointerMove as (e: unknown) => void)(move(el, 11, 1));

    const owner = nth === 0 ? m.steerPad : m.drivePad;
    expect(owner.pointerId, "the adoption itself still happens").toBe(11);
    expect(el.captured, "…and it is captured, exactly as a press would be").toEqual([11]);
  });

  it("a HOVERING pointer is neither adopted nor captured", () => {
    // `buttons === 0` is a mouse or pen passing over the corner. Capturing that
    // would take the pointer away from every control it is on its way to.
    const m = mountOverlay({ hidden: false });
    const el = fakePadEl();
    (m.pads[1].onPointerMove as (e: unknown) => void)(move(el, 11, 0));
    expect(m.drivePad.pointerId).toBeNull();
    expect(el.captured).toEqual([]);
  });

  it("an INERT overlay adopts nothing, and captures nothing", () => {
    const m = mountOverlay({ hidden: true });
    const el = fakePadEl();
    (m.pads[1].onPointerMove as (e: unknown) => void)(move(el, 11, 1));
    expect(m.drivePad.pointerId, "a resting thumb may not drive a frozen world").toBeNull();
    expect(el.captured).toEqual([]);
  });

  it("a pad that already owns a finger does not re-capture on every move", () => {
    // `setPointerCapture` per `pointermove` is a call at gesture rate on the
    // one path this component promises costs nothing.
    const m = mountOverlay({ hidden: false });
    const el = fakePadEl();
    const pad = m.pads[1];
    (pad.onPointerMove as (e: unknown) => void)(move(el, 11, 1));
    (pad.onPointerMove as (e: unknown) => void)(move(el, 11, 1));
    (pad.onPointerMove as (e: unknown) => void)(move(el, 11, 1));
    expect(el.captured).toEqual([11]);
  });

  it("THE CONSEQUENCE: the adopted gesture's lost capture now frees the pedal", () => {
    // With the capture in place the browser has an edge to report, and this is
    // what it reaches. Without it the pad below still owns pointer 11 and the
    // 0.62 brake outranks the key for the rest of the session.
    const m = mountOverlay({ hidden: false });
    const el = fakePadEl(100, 152); // centre y = 176; 140 is 36 px above it
    const pad = m.pads[1];
    (pad.onPointerMove as (e: unknown) => void)(move(el, 11, 1));
    expect(m.drivePad.pointerId).toBe(11);

    const held = keyboardBrakingHard();
    m.touch.mergeInto(held);
    expect(held.throttle, "the adopted thumb is above centre, so it is on the gas").toBeGreaterThan(
      0,
    );

    (pad.onLostPointerCapture as (e: unknown) => void)({ pointerId: 11 });

    expect(m.drivePad.pointerId).toBeNull();
    const after = keyboardBrakingHard();
    m.touch.mergeInto(after);
    expect(after.throttle).toBe(0);
    expect(after.brake).toBe(1);
  });
});
