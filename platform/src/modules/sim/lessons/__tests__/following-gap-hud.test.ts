/**
 * SPD (founder review R3 #39/#48): the FOLLOWING_TOO_CLOSE warnings fired
 * "while visibly far" — verified CORRECT (a 2-second gap at 40 km/h is 20 m;
 * the fire threshold ~14 m still reads far through a windshield), so the fix
 * is explanation, not weakening: the HUD/teach DISPLAY text appends the
 * measured time gap („Дистанция в момента: … с (… м) — дръж поне 2 с.").
 * These tests pin the seam: display carries the readout, the SCORED event
 * (state.events → wire → server) keeps the catalog copy byte-identically.
 */
import { describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "../../contracts";
import { applyTick, createLessonSession } from "../engine";
import type { LessonSessionState } from "../types";
import { makeTick } from "./fixtures";

/** Free-drive micro lesson (no objectives, no pre-drive). */
function lessonSpec(overrides: Partial<LessonSpec> = {}): LessonSpec {
  return {
    id: "t-follow-hud",
    order: 99,
    titleBg: "Тест дистанция",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    objectives: [],
    ...overrides,
  };
}

/** Drive 4 s at 40 km/h pinned 8 m behind a lead (fire threshold ≈ 14 m). */
function tailgate(s: LessonSessionState) {
  const hud: HudEvent[] = [];
  const teach: string[] = [];
  for (const t of [0, 1, 2, 3, 4]) {
    const r = applyTick(s, makeTick({ t, speedKmh: 40, leadGapM: 8 }));
    s = r.state;
    hud.push(...r.hudEvents);
    for (const m of r.teachMoments ?? []) teach.push(m.explanationBg);
  }
  return { state: s, hud, teach };
}

/** The violation-toast variant of the HUD union (narrowing helper). */
function violationToast(hud: HudEvent[]) {
  return hud.find(
    (e): e is Extract<HudEvent, { kind: "violation" }> => e.kind === "violation",
  );
}

describe("FOLLOWING_TOO_CLOSE HUD gap readout (founder R3 #39/#48)", () => {
  it("exam mode: the scored HUD toast carries the measured gap, the scored event does not", () => {
    const { state, hud } = tailgate(createLessonSession(lessonSpec({ examMode: true })));
    const toast = violationToast(hud);
    expect(toast).toBeDefined();
    // 8 m at 40 km/h = 0.72 s → „0,7 с (8 м)"; the taught dry target is 2 s
    // (ceil of the engine's 1.8 — the same number the catalog copy teaches).
    expect(toast!.explanationBg).toContain("Дистанция в момента: 0,7 с (8 м)");
    expect(toast!.explanationBg).toContain("дръж поне 2 с");
    // The SCORED event stays catalog-pure (the wire/server contract).
    const scored = state.events.find(
      (e) => e.kind === "violation" && e.code === "FOLLOWING_TOO_CLOSE",
    );
    expect(scored).toBeDefined();
    expect(scored!.explanationBg).not.toContain("Дистанция в момента");
  });

  it("training: the first-encounter teach card carries the same readout", () => {
    const { teach } = tailgate(createLessonSession(lessonSpec()));
    expect(teach.length).toBeGreaterThan(0);
    expect(teach[0]).toContain("Дистанция в момента: 0,7 с (8 м)");
    expect(teach[0]).toContain("дръж поне 2 с");
  });

  it("other violations pass through with untouched catalog copy", () => {
    let s = createLessonSession(lessonSpec({ examMode: true }));
    // Sustained 62 in a 50 zone → SPEEDING_DANGEROUS; no gap suffix anywhere.
    const hud: HudEvent[] = [];
    for (const t of [0, 0.5, 1, 1.5, 2]) {
      const r = applyTick(s, makeTick({ t, speedKmh: 62, maxSpeedKmh: 50 }));
      s = r.state;
      hud.push(...r.hudEvents);
    }
    const toast = violationToast(hud);
    expect(toast).toBeDefined();
    expect(toast!.explanationBg).not.toContain("Дистанция в момента");
  });
});
