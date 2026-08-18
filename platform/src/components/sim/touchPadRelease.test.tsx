import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PadPointer, releaseTouchControls, TouchInputSource } from "@/modules/sim/engine";
import { TouchControls, reconcileHeldAxes } from "./TouchControls";
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
  /** A brake key held flat out, as `SimInput.read()` hands it to the merge. */
  const keyboardBrakingHard = () => ({
    steer: 0,
    throttle: 0,
    brake: 1,
    handbrake: false,
    clutch: 0,
  });

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
  /** The pad's own JSX attribute list, from `role="slider"` to the `style`. */
  function padTag(nth: 0 | 1): string {
    const tags = CODE.split('role="slider"').slice(1);
    expect(tags.length, "both pads must still be sliders").toBe(2);
    return tags[nth].slice(0, tags[nth].indexOf("className="));
  }

  it.each([
    [0 as const, "onSteerEnd"],
    [1 as const, "onDriveEnd"],
  ])("pad %i ends on up, cancel AND lost capture — all three call %s", (nth, ender) => {
    const tag = padTag(nth);
    expect(tag).toContain(`onPointerUp={${ender}}`);
    expect(tag).toContain(`onPointerCancel={${ender}}`);
    // The edge that was missing. `setPointerCapture` is released without a
    // `pointerup` when the browser takes it back, and the axis outlives the
    // finger for the rest of the session when nothing answers it.
    expect(tag).toContain(`onLostPointerCapture={${ender}}`);
  });

  it("the horn keeps the four edges it has always had (they are not traded)", () => {
    // `useHoldButton` is where the four-edge idiom is written down; the pads
    // borrowed it. A future edit that "unifies" them must not unify downward.
    for (const edge of ["onPointerUp:", "onPointerCancel:", "onLostPointerCapture:"]) {
      expect(CODE).toContain(edge);
    }
  });

  it("the invariant is re-checked while the overlay is live, on its own clock", () => {
    expect(CODE).toContain("reconcileHeldAxes(touch, steerPad, drivePad)");
    expect(CODE).toContain("AXIS_RECONCILE_MS");
  });
});
