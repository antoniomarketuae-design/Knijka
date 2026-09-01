/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SHOULDER CHECK CAN BE PERFORMED — sc-pk-move-off:6aa68f53 (critical),
 * sc-vp-handbrake:20bf57db, and the same gap stated from three other files'
 * own headers (`scene/cabin.ts`, `engine/reverseView.ts`, `TouchControls.tsx`).
 *
 * THE FINDING: „There is no shoulder-check control of any kind on either
 * platform, so the graded blind-spot step cannot be performed."
 *
 * It was true, and it was the worst shape a defect in this product can take:
 * `sc-pk-move-off` step 4 orders «Хвърли поглед и през ЛЯВОТО рамо — в мъртвата
 * зона, която огледалото не показва», the rule engine then billed an основна
 * for the omission, and the only thing the interface could accept in answer was
 * a MIRROR — which is by definition the one instrument that cannot see a blind
 * spot. The student was told to do something the product could not receive,
 * graded on it, and taught that the mirror discharges the duty.
 *
 * This file pins the whole chain, because any one link on its own is a dead
 * predicate: CONTROL (three input paths) → GRADED CHANNEL → LIVE CONSUMER.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TouchInputSource } from "@/modules/sim/engine";
import { CABIN_KEYS, DRIVELINE_KEYS, GlanceHold } from "@/modules/sim/scene/cabin";
import type { CabinControls } from "@/modules/sim/scene/cabin";
import { TouchControls } from "../TouchControls";
import {
  CHASE_GLANCE_ASPECT_RAD,
  CHASE_GLANCE_SIDE_ORBIT_RAD,
  CHASE_REVERSE_ORBIT_RAD,
  SHOULDER_GLANCE_ORBIT_RAD,
} from "@/modules/sim/engine";
import { mirrorIsAttended, selectMirrorPass } from "@/modules/sim/scene/vitok/mirrorAttention";
import { createPreDriveSignalTracker, observeControlSignal } from "@/modules/sim/procedures";
import { controlsHelpRows } from "../LessonScene";

const SRC = path.resolve(__dirname, "../../..");
const read = (rel: string): string => readFileSync(path.join(SRC, rel), "utf8");
/** Prose in these files quotes the very strings under test — strip it, or a
 *  search finds the story about the defect instead of the control. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

// ---------------------------------------------------------------------------
// §1 THE CONTROL EXISTS, ON EVERY INPUT PATH
// ---------------------------------------------------------------------------

describe("§1 a student can actually perform it — keyboard, mouse and touch", () => {
  it("the keyboard has a shoulder key, and it collides with nothing", () => {
    expect(CABIN_KEYS.glanceShoulder).toBe("KeyO");
    const bound = [
      ...Object.entries(CABIN_KEYS).filter(([k]) => k !== "glanceShoulder"),
      ...Object.entries(DRIVELINE_KEYS),
    ].map(([, v]) => v as string);
    expect(bound).not.toContain(CABIN_KEYS.glanceShoulder);
    // …and against the keys owned OUTSIDE the cabin: driving axes, camera,
    // reset, pause, fullscreen, the top-down aids, the reversing POV and the
    // minimap. A shoulder check that also cycled the top-down zoom would be a
    // control that fights the student mid-procedure.
    expect([
      "KeyW", "KeyA", "KeyS", "KeyD", "KeyC", "KeyR", "KeyG", "KeyN", "KeyK", "KeyP", "KeyX",
    ]).not.toContain(CABIN_KEYS.glanceShoulder);
  });

  it("the mouse cluster carries it, on the same self-ending hold as the mirrors", () => {
    const body = code(read("components/sim/lesson-ui/GlanceEdgePings.tsx"));
    expect(body).toContain('mirror="shoulder"');
    expect(body).toContain("Поглед през ляво рамо в мъртвата зона");
    // The cluster's buttons are hold-to-glance: a press with no release edge
    // would leave the head turned for ever (glanceStations.test.ts §1).
    expect(body).toContain("glanceStart(mirror)");
    expect(body).toContain("glanceEnd(mirror)");
  });

  it("the touch platform PAINTS it — read off the markup, not off the source", () => {
    // The finding is about what a phone shows, so this is a render and not a
    // grep: the project has shipped tests that guarded the spelling of a line
    // instead of what the overlay paints (touchFlankNaming.test.tsx's own
    // note). `node` runs no effects, so `snap` is null — the belt-off state,
    // in which this button must still be on the glass.
    const shown = renderToStaticMarkup(
      <TouchControls
        touch={new TouchInputSource()}
        cabinRef={{ current: null } as { current: CabinControls | null }}
        onToggleCamera={() => undefined}
        onPause={() => undefined}
        onReset={() => undefined}
        onToggleFullscreen={null}
        hidden={false}
      />,
    );
    expect(shown).toContain('aria-label="Поглед през ляво рамо в мъртвата зона"');
    expect(shown).toContain(">Рамо<");
    // …and it sits BEFORE «Пауза» in the rail, which is the wrap order: the
    // rail is `flex-wrap`, so whatever is last folds to a second row upright,
    // and Пауза is the control that may (it is also Esc and a ⚙ menu row).
    expect(shown.indexOf(">Рамо<")).toBeLessThan(shown.indexOf(">Пауза<"));
  });

  it("…and it is wired to the TAP path, which releases itself", () => {
    // `cabin.glance()` starts a hold that ends on its own timer; `glanceStart`
    // is the KEY path and has no timer, so a one-shot button wired to it never
    // lets go — measured at 4.5 % of road pixels against a 7.6 % noise floor
    // (glanceStations.test.ts §1). Both wrong answers look fine in a diff, so
    // this one assertion is a source read on purpose.
    const body = code(read("components/sim/TouchControls.tsx"));
    expect(body).toContain('glance("shoulder")');
    expect(body).not.toMatch(/glanceStart\("shoulder"\)/);
  });

  it("the legend advertises it — an unadvertised key is not a control", () => {
    const rows = controlsHelpRows({
      topdownAllowed: true,
      reverseAssistEnabled: true,
      reverseViewOn: true,
    });
    const row = rows.find((r) => r.id === "blind-spot");
    expect(row, "the controls sheet must name the shoulder key").toBeDefined();
    expect(row!.keys).toBe("O");
    expect(row!.what).toContain("рамо");
    expect(row!.essential).toBe(true);
  });

  it("the hold machine treats it exactly like a mirror hold", () => {
    const g = new GlanceHold();
    expect(g.start("shoulder")).toBe(true); // latches the graded sample once
    expect(g.mirror).toBe("shoulder");
    for (let i = 0; i < 30; i += 1) g.update(1 / 60);
    expect(g.strength).toBe(1); // held at full deflection, like Q/E/F
    g.end("shoulder");
    for (let i = 0; i < 30; i += 1) g.update(1 / 60);
    expect(g.mirror).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §2 IT IS A LOOK, NOT A FOURTH MIRROR
// ---------------------------------------------------------------------------

describe("§2 the blind spot is not glass, and nothing may pretend it is", () => {
  it("the chase orbit swings PAST the mirror quarter and short of the boot", () => {
    // The wedge no mirror shows: beyond the door mirror's aspect, inside the
    // over-the-boot one. Derived from `COCKPIT_SHOULDER_YAW`, not invented.
    expect(CHASE_GLANCE_ASPECT_RAD.shoulder).toBe(SHOULDER_GLANCE_ORBIT_RAD);
    expect(SHOULDER_GLANCE_ORBIT_RAD).toBeGreaterThan(CHASE_GLANCE_SIDE_ORBIT_RAD);
    expect(SHOULDER_GLANCE_ORBIT_RAD).toBeLessThan(CHASE_REVERSE_ORBIT_RAD);
    expect(SHOULDER_GLANCE_ORBIT_RAD).toBeGreaterThan(0); // toward car-LEFT
  });

  it("a held shoulder check marks no mirror attended and schedules no pass", () => {
    for (const kind of ["left", "right"] as const) {
      expect(mirrorIsAttended(kind, "shoulder", 1, "forward")).toBe(false);
    }
    // Every frame of a 4-frame cadence cycle: the doors must never be picked
    // for a look that goes past the B-pillar. (`rear` is free-running and is
    // not a door — it is excluded from the claim, not from the sweep below.)
    for (let frame = 0; frame < 16; frame += 1) {
      const picked = selectMirrorPass(frame, "medium", "shoulder", 1, "forward", 0);
      expect(picked === "left" || picked === "right").toBe(false);
    }
  });

  it("it does not count toward „Настройка на огледалата“", () => {
    // Three MIRRORS complete that step. A shoulder check may not stand in for
    // one the student never touched.
    const t = createPreDriveSignalTracker();
    expect(observeControlSignal(t, { kind: "glance", mirror: "left" })).toBeNull();
    expect(observeControlSignal(t, { kind: "glance", mirror: "right" })).toBeNull();
    expect(observeControlSignal(t, { kind: "glance", mirror: "shoulder" })).toBeNull();
    expect(t.mirrorsGlanced.has("shoulder" as never)).toBe(false);
    expect(observeControlSignal(t, { kind: "glance", mirror: "rear" })).toBe("adjust-mirrors");
    // …and once the mirrors ARE done it performs the final check, which is
    // authored as „Провери огледалата И МЪРТВАТА ЗОНА непосредствено преди
    // потегляне" (procedures/steps.ts).
    expect(observeControlSignal(t, { kind: "glance", mirror: "shoulder" })).toBe(
      "final-mirror-check",
    );
  });
});


// ---------------------------------------------------------------------------
// §3 THE LIVE CONSUMER
//
// The основна a student is actually billed lives in `rules/engine.ts` §1b, and
// the convict/acquit pairs that pin it are in the A12 battery beside every
// other move-off shape — `rules/__tests__/false-positives.test.ts`, „FP battery
// — move-off observation": a mirror-only pull-away CONVICTS, a shoulder-only
// pull-away CONVICTS, and mirror + shoulder is innocent. They are deliberately
// there and not duplicated here: that file owns the innocent-driving contract
// this change had to be measured against, and a second copy of the engine
// harness is a second thing to keep in step with the reducer.
//
// The other two consumers are pinned where they live too:
//   · `traces/__tests__/sc-pk-move-off-traces.test.ts` — the drill's own shadow
//     replays with ZERO violations only because it now performs the real act,
//     and both mistake demos still grade EXACTLY the one code they teach;
//   · `lessons/scenario/observation.ts` `momentRequiresShoulder` — the debrief's
//     „наблюдение" row, where a moment titled „…през ЛЯВО рамо в мъртвата зона"
//     is satisfied by the shoulder check and by no mirror.
// ---------------------------------------------------------------------------
