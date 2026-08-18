/** SCRATCH — adversarial probe, delete after measuring. */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeViolation, type ScorableEvent } from "../../rules";
import { buildDebrief } from "../debrief";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { lessonById } from "../specs";
import type { LessonResult } from "../types";
import { makeTick } from "./fixtures";

const OUT =
  "C:/Users/Ljh/AppData/Local/Temp/claude/E--AI-driver/8942546c-780e-450f-ae95-3aa94e28222a/scratchpad/";
const l0 = lessonById("l0-free-drive")!;

function resultWithEvents(events: ScorableEvent[]): LessonResult {
  let s = createLessonSession(l0);
  s = applyTick(s, makeTick({ t: 1 })).state;
  s = { ...s, events: [...s.events, ...events] };
  return buildLessonResult(finishSession(s, 99));
}

describe("PROBE: grouped debrief text for a vehicle+pedestrian drive", () => {
  it("dumps the split version", () => {
    const d = buildDebrief(
      l0,
      resultWithEvents([
        makeViolation("COLLISION", 10, { detail: "vehicle" }),
        makeViolation("COLLISION", 40, { detail: "pedestrian" }),
      ]),
    );
    writeFileSync(OUT + "split.txt", d.text, "utf8");
    expect(d.text.length).toBeGreaterThan(0);
  });

  it("dumps the pooled version", () => {
    const d = buildDebrief(
      l0,
      resultWithEvents([makeViolation("COLLISION", 10), makeViolation("COLLISION", 40)]),
    );
    writeFileSync(OUT + "pooled.txt", d.text, "utf8");
    expect(d.text.length).toBeGreaterThan(0);
  });
});
