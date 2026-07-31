/** THROWAWAY PROBE — delete before gate. B-NEW-1 reproduction. */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyTick, createLessonSession } from "../engine";
import { compileScenario } from "../scenario";
import { SC_ROUNDABOUT_ENTRY, SC_ZEBRA_APPROACH } from "../scenario/templates-flow";
import { routeFinishZone, terminalRescueZone } from "../finish";
import { makeTick } from "./fixtures";
import type { ScenarioLevel, ScenarioSpec } from "../scenario/types";

const LOG: string[] = [];

const SPAWNS: Record<string, { x: number; y: number }> = {
  "sc-roundabout-entry": { x: 4.06, y: -93 },
  "sc-zebra-approach": { x: 4.06, y: 15 },
};

function probe(spec: ScenarioSpec, level: ScenarioLevel, originFrames: number) {
  const lesson = compileScenario(spec, level);
  let s = createLessonSession(lesson);
  const pos = SPAWNS[spec.id];
  const params = s.objectives.map((o) => o.params);
  LOG.push(
    `=== ${spec.id} L${level} originFrames=${originFrames}`,
    `    routeFinishZone=${JSON.stringify(routeFinishZone(params))}`,
    `    terminalRescueZone=${JSON.stringify(terminalRescueZone(params))}`,
  );
  for (let i = 1; i <= 120 * 30; i++) {
    const t = i / 30;
    const p = i <= originFrames ? { x: 0, y: 0 } : { ...pos };
    const r = applyTick(s, makeTick({ t, speedKmh: 0, position: p, gear: 0 }));
    s = r.state;
    if (s.phase !== "driving" && s.phase !== "preDrive") {
      LOG.push(
        `    *** ENDED at t=${t.toFixed(2)}s phase=${s.phase} gate=${JSON.stringify(s.finishGate)} rescue=${JSON.stringify(s.finishRescueGate)}`,
      );
      return t;
    }
  }
  LOG.push(`    survived 120 s (phase=${s.phase})`);
  return null;
}

describe("probe", () => {
  it("parked", () => {
    for (const n of [0, 1, 3]) {
      probe(SC_ZEBRA_APPROACH, 1, n);
      probe(SC_ROUNDABOUT_ENTRY, 1, n);
      probe(SC_ROUNDABOUT_ENTRY, 3, n);
    }
    writeFileSync("probe-out.txt", LOG.join("\n"), "utf8");
    expect(true).toBe(true);
  });
});
