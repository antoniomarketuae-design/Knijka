/**
 * THEO-3 — the six founder-seeded mistake classes (doc 64 seed catalog):
 *
 *   1. zebra-no-stop      — непропускане на пешеходец на пътеката
 *   2. no-mirror-turn     — маневра без проверка в огледалото
 *   3. stop-sign-ignored  — незачитане на знак Стоп
 *   4. corner-speeding    — скорост в завой
 *   5. tailgating         — лепене за предния
 *   6. forbidden-overtake — изпреварване в зона на забрана
 *
 * The gate: every seed points at a SHIPPED template mistake with a RECORDED
 * red-ghost trace and catalog-valid codes, compiles into a playable sandbox,
 * and is reachable through the wired entry points (the why-panel card seam +
 * the /simulator deep link). The mechanism itself stays generic — any
 * template mistake compiles — but these six are the wired product surface.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "../../../rules";
import { scenarioForCode } from "../../../scenarios";
import {
  MISTAKE_EXPERIENCE_SEEDS,
  compileMistakeExperience,
  mistakeExperienceSeedForEvent,
  parseMistakeExperienceLessonId,
  scenarioEntryLevel,
} from "../mistakeExperience";
import { scenarioById } from "../templates";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

describe("the six founder-seeded classes", () => {
  it("is exactly the doc-64 seed list, one entry per class", () => {
    expect(MISTAKE_EXPERIENCE_SEEDS.map((s) => s.classId)).toEqual([
      "zebra-no-stop",
      "no-mirror-turn",
      "stop-sign-ignored",
      "corner-speeding",
      "tailgating",
      "forbidden-overtake",
    ]);
    const pairs = MISTAKE_EXPERIENCE_SEEDS.map((s) => `${s.templateId}#${s.mistakeIndex}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("every seed points at a shipped template mistake with a RECORDED trace and catalog codes", () => {
    for (const seed of MISTAKE_EXPERIENCE_SEEDS) {
      const spec = scenarioById(seed.templateId);
      expect(spec, seed.classId).toBeDefined();
      const mistake = spec!.mistakes[seed.mistakeIndex];
      expect(mistake, `${seed.classId}: mistake index ${seed.mistakeIndex}`).toBeDefined();
      // Recorded — the consequence overlay's red ghost must exist.
      expect(mistake.traceRef.pending === true, `${seed.classId}: pending trace`).toBe(false);
      expect(
        existsSync(path.join(REPO_ROOT, mistake.traceRef.path)),
        `${seed.classId}: ${mistake.traceRef.path}`,
      ).toBe(true);
      // Codes are catalog truth (the engine's targeted-detection input).
      expect(mistake.codeRefs.length).toBeGreaterThan(0);
      for (const code of mistake.codeRefs) {
        expect(code in VIOLATIONS, `${seed.classId}: ${code}`).toBe(true);
      }
      expect(mistake.whatWentWrongBg.length).toBeGreaterThan(0);
      expect(mistake.titleBg.length).toBeGreaterThan(0);
    }
  });

  it("every seed compiles into a playable sandbox at the entry rung", () => {
    for (const seed of MISTAKE_EXPERIENCE_SEEDS) {
      const spec = scenarioById(seed.templateId)!;
      const lesson = compileMistakeExperience(spec, seed.mistakeIndex);
      expect(lesson.mistakeExperience).toEqual({
        mistakeIndex: seed.mistakeIndex,
        codes: [...spec.mistakes[seed.mistakeIndex].codeRefs],
      });
      expect(lesson.examMode).toBeUndefined();
      // The id round-trips — the shell resolves the demo/district from it.
      expect(parseMistakeExperienceLessonId(lesson.id)).toEqual({
        templateId: seed.templateId,
        level: scenarioEntryLevel(spec),
        mistakeIndex: seed.mistakeIndex,
      });
      // The instruction copy carries the STORED mistake title.
      expect(lesson.descriptionBg).toContain(spec.mistakes[seed.mistakeIndex].titleBg);
    }
  });

  it("every seed is WIRED: reachable from its scenario event's code set (the why-panel card seam)", () => {
    for (const seed of MISTAKE_EXPERIENCE_SEEDS) {
      const spec = scenarioById(seed.templateId)!;
      const codes = spec.mistakes[seed.mistakeIndex].codeRefs;
      // Every targeted code maps to ONE scenario event, and all of a seed's
      // codes must share it — otherwise no why-panel card can surface it.
      const events = new Set(codes.map((c) => scenarioForCode(c)));
      expect(events.size, `${seed.classId}: codes span one event`).toBe(1);
      const [event] = events;
      expect(event, `${seed.classId}: unmapped code`).not.toBeNull();
      // The event's full catalog code set resolves back to THIS seed.
      const eventCodes = new Set(
        Object.keys(VIOLATIONS).filter((code) => scenarioForCode(code) === event),
      );
      const resolved = mistakeExperienceSeedForEvent(eventCodes);
      expect(resolved, `${seed.classId}: not resolvable from ${event}`).not.toBeNull();
      expect(resolved!.classId).toBe(seed.classId);
      expect(resolved!.titleBg).toBe(spec.mistakes[seed.mistakeIndex].titleBg);
    }
  });

  it("returns null for an event no seed targets", () => {
    expect(mistakeExperienceSeedForEvent(new Set(["SEATBELT_OFF_WHILE_MOVING"]))).toBeNull();
    expect(mistakeExperienceSeedForEvent(new Set())).toBeNull();
  });
});
