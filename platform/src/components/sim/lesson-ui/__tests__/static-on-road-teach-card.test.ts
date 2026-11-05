/**
 * THE PHONE'S PAUSED TEACH CARD AFTER A BODY ON THE ROAD IS STRUCK — lane
 * staticcardcopy, sc-hz-brake-dont-swerve:b7297cb7 (T6; integrator rulings C3,
 * S9).
 *
 * On the phone at L1 the fault surface is the paused teach card, and its one
 * line is `teachMomentOneLinerBg(moment)`: the moment's OWN line first, the
 * pooled «Спирачният път не стигна.» only as a fallback. For an on-road static
 * contact the moment must carry the act's own line — «Не остави място за
 * него.» — which the toast of the same tick prints too; never the pooled
 * fallback, and never «Не се появи внезапно.», which is false of a load fallen
 * into the lane. The strings are compared to the catalogue, never typed here
 * twice (ADR-002: retrieved, not written) — except the one literal the brief
 * pins, the new peek itself.
 */
import { describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "@/modules/sim/contracts";
import { applyTick, createLessonSession } from "@/modules/sim/lessons/engine";
import type { TeachMoment } from "@/modules/sim/lessons/types";
import { tickWithEvents } from "@/modules/sim/lessons/__tests__/fixtures";
import { COLLISION_CONTACT_COPY, VIOLATIONS } from "@/modules/sim/rules";
import { teachMomentOneLinerBg } from "../LessonPlayShell";

const PAUSING: LessonSpec = {
  id: "t-on-road-teach",
  order: 99,
  titleBg: "Тест",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [],
  aids: { pauseOnError: true },
};

function strike(onCarriageway: boolean) {
  const ev = onCarriageway
    ? ({ kind: "collision", withWhat: "staticObject", onCarriageway: true } as const)
    : ({ kind: "collision", withWhat: "staticObject" } as const);
  const r = applyTick(createLessonSession(PAUSING), tickWithEvents(1, [ev], { speedKmh: 31 }));
  const toast = r.hudEvents.find((e): e is Extract<HudEvent, { kind: "violation" }> => e.kind === "violation");
  const moment: TeachMoment | undefined = (r.teachMoments ?? [])[0];
  return { toast, moment };
}

describe("T6 — the phone teach card prints the act's line, not the pooled fallback", () => {
  it("an on-road static contact: the moment carries «Не остави място за него.», the toast prints the same", () => {
    const { toast, moment } = strike(true);
    expect(moment, "L1 pauses with the teach card").toBeDefined();
    expect(COLLISION_CONTACT_COPY.staticObjectOnRoad.peekBg).toBe("Не остави място за него.");
    expect(
      teachMomentOneLinerBg(moment!),
      "the phone's paused teach card fell back to the pooled line instead of the act's own",
    ).toBe(COLLISION_CONTACT_COPY.staticObjectOnRoad.peekBg);
    expect((moment as { peekBg?: string }).peekBg).toBe(COLLISION_CONTACT_COPY.staticObjectOnRoad.peekBg);
    expect(toast?.peekBg).toBe(COLLISION_CONTACT_COPY.staticObjectOnRoad.peekBg);
    expect(teachMomentOneLinerBg(moment!)).not.toBe(VIOLATIONS.COLLISION.peekBg);
    expect(teachMomentOneLinerBg(moment!)).not.toBe(COLLISION_CONTACT_COPY.staticObject.peekBg);
  });

  it("an off-road static contact keeps today's line, byte for byte", () => {
    const { toast, moment } = strike(false);
    expect(teachMomentOneLinerBg(moment!)).toBe(COLLISION_CONTACT_COPY.staticObject.peekBg);
    expect(toast?.peekBg).toBe(COLLISION_CONTACT_COPY.staticObject.peekBg);
    expect(toast?.explanationBg).toBe(COLLISION_CONTACT_COPY.staticObject.explanationBg);
  });
});
