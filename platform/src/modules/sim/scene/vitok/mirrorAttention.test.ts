import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOW_MIRROR_CADENCE,
  MIRROR_BIT,
  MIRROR_CADENCE,
  MIRROR_KINDS,
  doorLookPose,
  mirrorCadenceFor,
  mirrorIsAttended,
  mirrorKindsFor,
  selectMirrorPass,
  type MirrorKind,
  type MirrorQuality,
} from "./mirrorAttention";
import type { CabinLookPoseId } from "./cabinLook";
// The SHIPPED envelope. `GlanceHold` touches no DOM (only `CabinControls`'
// constructor does), so it can be driven directly in Node.
import { GlanceHold } from "../cabin";

/**
 * =============================================================================
 * THE LEFT DOOR MIRROR IS A MIRROR, ON THE PRESET A STUDENT ACTUALLY GETS.
 * 2026-08-16 — the founder's „featureless matte-black pod" row.
 *
 * EVERY TEST BELOW FAILS ON THE OLD CODE, and it is worth saying exactly how,
 * because the previous shape of this file would have been a test that passed
 * either way. The old rig had:
 *
 *     function activeKindsFor(preset) {
 *       if (preset === "high") return ["rear", "left", "right"];
 *       return ["rear"];            // medium AND low
 *     }
 *
 * so on `medium` (the DEFAULT, and the hard ceiling for every touch-only
 * device — `environment/quality.ts autoQualityCeiling`) the door glass never
 * received a render target and kept its authored dark gloss.
 *
 * MEASURED on the deployed build before the change, iPhone-16 landscape,
 * `sc-vp-handbrake` L1, the same 105 × 95 px rect of left-door glass at the
 * same held-left glance (the mirror is rigid to the car, so it lands on
 * identical screen pixels in every run):
 *
 *     medium (shipped)  mean L  23.3   median 0    near-black 73.9 %
 *     high              mean L 109.4   median 108  near-black  0.9 %
 *
 * The `mirrorKindsFor` test alone turns that from an opinion into a red suite.
 * =============================================================================
 */

const PRESETS: MirrorQuality[] = ["low", "medium", "high"];

/** Run the scheduler over `frames` frames and tally what it asked for. */
function sweep(
  frames: number,
  preset: MirrorQuality,
  glanceMirror: MirrorKind | null,
  glanceStrength: number,
  lookPose: CabinLookPoseId,
  { primed = true }: { primed?: boolean } = {},
): Record<MirrorKind, number> {
  const tally: Record<MirrorKind, number> = { rear: 0, left: 0, right: 0 };
  // `primed: true` is the steady state — the interesting one. Priming is
  // exercised on its own below.
  let unprimed = primed ? 0 : MIRROR_KINDS.reduce((m, k) => m | MIRROR_BIT[k], 0);
  for (let f = 0; f < frames; f++) {
    const kind = selectMirrorPass(f, preset, glanceMirror, glanceStrength, lookPose, unprimed);
    if (kind === null) continue;
    tally[kind] += 1;
    unprimed &= ~MIRROR_BIT[kind];
  }
  return tally;
}

describe("the door mirrors exist below `high` at all", () => {
  it("every preset gets a target for all three mirrors — the line that made the pod black", () => {
    for (const preset of PRESETS) {
      const kinds = mirrorKindsFor(preset);
      // OLD: ["rear"] for low and medium. This is the assertion that goes red.
      expect(kinds).toContain("left");
      expect(kinds).toContain("right");
      expect(kinds).toContain("rear");
      expect(kinds).toHaveLength(3);
    }
  });
});

describe("…but they only render while the driver is looking through them", () => {
  it("a HELD left glance refreshes the left glass, on low and on medium", () => {
    for (const preset of ["low", "medium"] as const) {
      const period = mirrorCadenceFor(preset, "left").interval;
      const t = sweep(period * 8, preset, "left", 1, "forward");
      // OLD: 0 on both presets, because there was no left entry at all.
      expect(t.left).toBe(8);
      // …and looking left does NOT start rendering the right-hand glass.
      expect(t.right).toBe(0);
    }
  });

  it("a HELD right glance refreshes the right glass and not the left", () => {
    for (const preset of ["low", "medium"] as const) {
      const period = mirrorCadenceFor(preset, "right").interval;
      const t = sweep(period * 8, preset, "right", 1, "forward");
      expect(t.right).toBe(8);
      expect(t.left).toBe(0);
    }
  });

  it("eyes forward and no glance = not one door pass — the budget half of the deal", () => {
    // This is the assertion that keeps the fix from being the 0d1c922 FPS
    // regression: one 256×96 rear pass measured 0.61–1.13 ms of a 2.4–3.2 ms
    // tier-low GPU frame, so two more free-running door passes are not
    // affordable. At the driving pose the doors are off-frame anyway
    // (cabinLook: frame-x −0.005 and 1.358), so this costs no fidelity.
    for (const preset of ["low", "medium"] as const) {
      const t = sweep(400, preset, null, 0, "forward");
      expect(t.left).toBe(0);
      expect(t.right).toBe(0);
      // Negative control: the sweep really did run and the rear really did
      // render, so the two zeros above are a decision and not an empty loop.
      expect(t.rear).toBeGreaterThan(0);
    }
  });

  it("the MOUSE cabin-look pose opens the glass too, with no glance at all", () => {
    // The half a glance-only gate would have missed. The right door mirror is
    // 1.358 of a frame off the right edge at the driving pose, so `cabinLook`'s
    // reach table sends the student there by pose — and a student who got there
    // with the mouse would have been shown dark gloss.
    for (const preset of ["low", "medium"] as const) {
      const t = sweep(64, preset, null, 0, doorLookPose("right"));
      expect(t.right).toBeGreaterThan(0);
      expect(t.left).toBe(0);
    }
    expect(doorLookPose("left")).toBe("mirrorLeft");
    expect(doorLookPose("right")).toBe("mirrorRight");
  });

  it("the glass stays live through the glance's ease-out, not only at full hold", () => {
    // `GLANCE_EASE_S` keeps the envelope non-zero while the head swings home and
    // the cabin keeps the mirror kind set through it. Gating on `=== 1` would
    // black the glass out under a still-moving eye.
    const t = sweep(64, "medium", "left", 0.04, "forward");
    expect(t.left).toBeGreaterThan(0);
    // …and a released glance (strength 0) really is off, so the predicate is
    // not simply "any mirror kind ever set".
    expect(sweep(64, "medium", "left", 0, "forward").left).toBe(0);
  });

  it("the REAR mirror is never gated — doc 62 #44, the tailgater instrument", () => {
    for (const preset of PRESETS) {
      expect(mirrorIsAttended("rear", null, 0, "forward")).toBe(true);
      expect(sweep(64, preset, null, 0, "forward").rear).toBeGreaterThan(0);
    }
  });
});

describe("`high` is untouched", () => {
  it("doors free-run with no attention, exactly as before this lane", () => {
    const t = sweep(64, "high", null, 0, "forward");
    expect(t.rear).toBe(32); // interval 2
    expect(t.left).toBe(16); // interval 4
    expect(t.right).toBe(16); // interval 4
  });

  it("high keeps the authored cadence table", () => {
    expect(MIRROR_CADENCE.rear).toEqual({ interval: 2, phase: 0 });
    expect(MIRROR_CADENCE.left).toEqual({ interval: 4, phase: 1 });
    expect(MIRROR_CADENCE.right).toEqual({ interval: 4, phase: 3 });
    // doc 91 §I21: the low rear stays at 8.
    expect(LOW_MIRROR_CADENCE.rear).toEqual({ interval: 8, phase: 0 });
  });
});

describe("at most ONE mirror pass per frame, on every preset", () => {
  it("no frame is ever claimed by two mirrors — including low's new door phases", () => {
    // The invariant the whole perf budget rests on. Adding two door entries to
    // low and medium is exactly the change that could break it, so it is swept
    // rather than argued: every preset, every attention state, 240 frames (the
    // cadences are 2/4/8, so 240 covers every phase alignment 30× over).
    //
    // Violations are COLLECTED and asserted once. The first draft put two
    // `expect`s inside the innermost loop and the matcher overhead alone timed
    // the test out at 5 s — a green suite that had stopped measuring would
    // have been the worse outcome, so the loop stays wide and the assert moves.
    const clashes: string[] = [];
    const offPhase: string[] = [];
    let framesChecked = 0;
    for (const preset of PRESETS) {
      for (const glance of [null, "left", "right", "rear"] as const) {
        for (const pose of ["forward", "mirrorLeft", "mirrorRight"] as CabinLookPoseId[]) {
          for (let f = 0; f < 240; f++) {
            framesChecked += 1;
            const matches = MIRROR_KINDS.filter((k) => {
              const c = mirrorCadenceFor(preset, k);
              return f % c.interval === c.phase;
            });
            if (matches.length > 1) clashes.push(`${preset} f${f}: ${matches.join("+")}`);
            const chosen = selectMirrorPass(f, preset, glance, 1, pose, 0);
            if (chosen !== null && !matches.includes(chosen)) {
              offPhase.push(`${preset} f${f} → ${chosen}`);
            }
          }
        }
      }
    }
    // Negative control: the sweep really ran. Without it both `toEqual([])`
    // below would pass just as happily on a loop that never executed.
    expect(framesChecked).toBe(PRESETS.length * 4 * 3 * 240);
    expect(clashes).toEqual([]);
    expect(offPhase).toEqual([]);
  });
});

describe("priming — the first glance of a lesson must not show an empty buffer", () => {
  it("every mirror gets exactly one unconditional pass, then the rule takes over", () => {
    // The RTT material is swapped onto the glass on mount, so a door target
    // that has never been rendered would show an uninitialised buffer for the
    // whole of the student's first glance — the black quad, surviving the fix.
    const t = sweep(400, "medium", null, 0, "forward", { primed: false });
    expect(t.left).toBe(1);
    expect(t.right).toBe(1);
    // The primed run above renders the doors zero times; this one renders them
    // once. That difference IS the priming pass, and nothing more.
    expect(sweep(400, "medium", null, 0, "forward").left).toBe(0);
  });

  it("the bitmask has one distinct bit per mirror", () => {
    const bits = MIRROR_KINDS.map((k) => MIRROR_BIT[k]);
    expect(new Set(bits).size).toBe(bits.length);
    for (const b of bits) expect(b & (b - 1)).toBe(0); // a single set bit
  });
});

/**
 * THE GATE, CHECKED AGAINST THE REAL ENVELOPE.
 *
 * Everything above feeds `mirrorIsAttended` numbers this file made up. The
 * predicate's whole value depends on what `GlanceHold` actually does with
 * `mirror` and `strength`, so these drive the SHIPPED class — if the envelope's
 * contract ever changes, the door mirrors go dark again and this is what says
 * so.
 */
describe("against the shipped GlanceHold, not against an assumption", () => {
  const FRAME = 1 / 60;

  it("a held glance is attended from the first update through the whole ease-out", () => {
    const g = new GlanceHold();
    g.start("left");
    // The press frame: `mirror` is set but `env` is still 0, so the gate says
    // no for exactly one frame. Deliberate — see the note on mirrorIsAttended.
    expect(g.mirror).toBe("left");
    expect(mirrorIsAttended("left", g.mirror, g.strength, "forward")).toBe(false);

    g.update(FRAME);
    expect(mirrorIsAttended("left", g.mirror, g.strength, "forward")).toBe(true);

    for (let i = 0; i < 30; i++) g.update(FRAME); // ≫ GLANCE_EASE_S
    expect(g.strength).toBe(1);
    expect(mirrorIsAttended("left", g.mirror, g.strength, "forward")).toBe(true);
    // …and looking left never opens the right-hand glass.
    expect(mirrorIsAttended("right", g.mirror, g.strength, "forward")).toBe(false);

    // Release: the glass must stay live for every frame of the swing home.
    g.end("left");
    let easeFrames = 0;
    while (g.mirror !== null && easeFrames < 200) {
      expect(mirrorIsAttended("left", g.mirror, g.strength, "forward")).toBe(true);
      g.update(FRAME);
      easeFrames += 1;
    }
    expect(g.mirror).toBeNull();
    expect(mirrorIsAttended("left", g.mirror, g.strength, "forward")).toBe(false);
    // GLANCE_EASE_S = 0.18 s ⇒ ~11 frames at 60 Hz. A gate that dropped at
    // release would be ~0 here and the glass would go black under a moving eye.
    expect(easeFrames).toBeGreaterThan(8);
  });

  it("a TAP glance keeps the glass live for ~1.1 s — and that IS the glance duration", () => {
    // THE NUMBER THE PREVIOUS WAVE NEEDED. It declared the glances dead while
    // photographing this event at one frame per 2.6 s. Measured here off the
    // shipped class instead of off a shutter: GLANCE_TAP_HOLD_S (0.9 s at full
    // deflection) + GLANCE_EASE_S (0.18 s easing home).
    const g = new GlanceHold();
    g.start("left", true); // tap — the touch button's path, no release edge
    const dt = 1 / 120;
    let attendedSec = 0;
    for (let i = 0; i < 5000; i++) {
      g.update(dt);
      if (mirrorIsAttended("left", g.mirror, g.strength, "forward")) attendedSec += dt;
      else if (g.mirror === null && i > 0) break;
    }
    expect(attendedSec).toBeGreaterThan(1.0);
    expect(attendedSec).toBeLessThan(1.2);
  });
});

/**
 * THE WIRING, READ OUT OF THE SOURCE.
 *
 * Everything above is about a pure function. If `MirrorRig` stopped calling it,
 * or `VitokCockpit` stopped handing it the cabin, the whole module would keep
 * passing while the founder's mirror went black again — and the failure would
 * be silent, which is the failure mode this codebase keeps writing tests about.
 */
describe("the rig actually uses it", () => {
  const read = (...p: string[]) =>
    fs.readFileSync(path.join(process.cwd(), "src", ...p), "utf8").replace(/\r\n/g, "\n");
  const RIG = read("components", "sim", "vitok", "MirrorRig.tsx");
  const COCKPIT = read("components", "sim", "vitok", "VitokCockpit.tsx");

  it("MirrorRig schedules through this module and not a local table", () => {
    expect(RIG).toContain("selectMirrorPass(");
    expect(RIG).toContain("mirrorKindsFor(preset)");
    // The old local tables are gone — a leftover copy is how two schedulers
    // start disagreeing about which frame is whose.
    expect(RIG).not.toContain("function activeKindsFor");
    expect(RIG).not.toMatch(/const\s+MIRROR_CADENCE\s*[:=]/);
    expect(RIG).not.toMatch(/const\s+LOW_REAR_CADENCE\s*[:=]/);
  });

  it("MirrorRig asks the cabin which mirror is being looked through", () => {
    expect(RIG).toContain("glanceMirror");
    expect(RIG).toContain("glanceStrength()");
    expect(RIG).toContain("getCabinLook()");
  });

  it("VitokCockpit hands the rig the cabin — without it the gate is half blind", () => {
    // `cabinRef` is optional on the prop so a headless mount still compiles;
    // that is exactly why the real mount has to be pinned here. With no cabin
    // the doors would fall back to the mouse pose alone and every Q/E glance
    // would look at dark gloss again.
    expect(COCKPIT).toMatch(/<MirrorRig[^>]*cabinRef=\{cabinRef\}/);
  });
});
