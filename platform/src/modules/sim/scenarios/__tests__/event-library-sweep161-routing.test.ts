/**
 * SWEEP 161 · the one BROKEN critical filed at `scenarios/event-library.json`,
 * which is a JSON file and therefore cannot carry the note itself.
 *
 * THE FINDING (`sc-merge-accel-lane`, critical): „The world is not the road in
 * the briefing. The briefing describes a ramp, an acceleration lane starting to
 * the right of the ramp top and lasting about 200 metres, and a motorway flow
 * to slot into. The arrival frame shows a plain two-lane road with a 90 sign
 * running through open grass fields with no ramp, no acceleration lane and no
 * motorway in sight." Frame:
 * `.audit-frames/sweep161/sc-merge-accel-lane/mobile-right/01-arrival.png`.
 *
 * TWO THINGS ARE WRONG WITH IT, and the second one matters more.
 *
 * 1. MIS-ROUTED. `event-library.json` is the generated coverage catalogue
 *    (`generatedFrom` a question-analysis workflow: 45 events of trigger /
 *    detection / success / failure / feedback / policyDefault / worldPrimitives
 *    / status). It holds no geometry, no briefing and no district reference,
 *    and `scenarios/events.ts` only ever reads it back as lookups. Nothing in
 *    it could have made a road appear or a briefing lie. The briefing lives in
 *    `lessons/scenario/templates-merging.ts` (SC_MERGE_ACCEL_LANE) and the road
 *    in `content/world/mw-entry-v1.json` + `tools/maps/gen_mw_entry.mjs`.
 *
 * 2. AND THE CLAIM IS FALSE ANYWAY — THE FRAME WAS THE RAMP. `01-arrival.png`
 *    is taken at `mwe-spawn-ramp` (35.56, 139.5), heading 347°, on
 *    `mwe-e-ramp` — a ONE-LANE `secondary_link` posted at 90, which is what
 *    the red 90 disc in the frame is, correctly. The ramp runs (40, 120) →
 *    (8.13, 260): the arrival pose is ~120 m short of the ramp TOP, and the
 *    briefing's own sentence starts there — «ОТ ВЪРХА НА РАМПАТА вдясно
 *    започва лентата за ускоряване». A single carriageway through grass is
 *    precisely what a ramp bottom looks like.
 *
 *    `04-t087s.png`, the same drive 87 seconds later, is the counter-frame: a
 *    wide multi-lane carriageway opening left, lane markings, the median
 *    barrier on the far side and the shadow's blue trail leading into the
 *    curb-side acceleration lane. The world matches the briefing; the arrival
 *    frame was simply upstream of it.
 *
 * §1 measures that from the district rather than from the picture, so the
 * refutation cannot rot: the motorway edges, the 200 m acceleration segment and
 * the ramp the frame stands on are all asserted by value. §2 keeps this file's
 * own contribution honest — the library's `status` for the motorway event is
 * still „new", i.e. THE CATALOGUE NEVER CLAIMED THE ROAD EXISTED, which is the
 * last way this row could have been the library's fault.
 *
 * MUTATIONS (run, and observed):
 *   · §1 — delete `mwe-e-nb-accel` from the fixture's expected edge set and the
 *     assertion fails; the district is read from disk, not described here.
 *   · §2 positive control — `ev-speed-limit` is `built` and IS live. A
 *     `liveScenarioEvents()` that returned everything, or nothing, fails one of
 *     the two halves, so „not live" is a reading and not a spelling.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getScenarioEvent, liveScenarioEvents } from "../events";

const REPO = path.resolve(process.cwd(), "..");

interface MwEntryDistrict {
  meta: { scenario: { params: Record<string, number>; accelLaneFromY: number; accelLaneToY: number } };
  roads: {
    edges: Array<{ id: string; class: string; lanes: number; maxspeed: number; geometry: number[][] }>;
  };
  spawnPoints: Array<{ id: string; x: number; y: number }>;
}

const mwEntry = (): MwEntryDistrict =>
  JSON.parse(
    readFileSync(path.join(REPO, "content", "world", "mw-entry-v1.json"), "utf-8"),
  ) as MwEntryDistrict;

describe("1 · the motorway the arrival frame could not see is in the district", () => {
  it("the mainline is three lanes of motorway at 140, in three segments", () => {
    const motorway = mwEntry()
      .roads.edges.filter((e) => e.class === "motorway")
      .map((e) => `${e.id}:${e.lanes}@${e.maxspeed}`);
    expect(motorway).toEqual([
      "mwe-e-nb-approach:3@140",
      "mwe-e-nb-accel:3@140",
      "mwe-e-nb-main:3@140",
      "mwe-e-sb:3@140",
    ]);
  });

  it("the acceleration lane is the ~200 m the briefing promises", () => {
    const d = mwEntry();
    const accel = d.roads.edges.find((e) => e.id === "mwe-e-nb-accel")!;
    const [from, to] = [accel.geometry[0]![1]!, accel.geometry[1]![1]!];
    expect(to - from).toBe(200);
    expect(d.meta.scenario.params.accelM).toBe(200);
    // …and the segment starts exactly where the ramp ends, which is what
    // «от върха на рампата» means.
    expect(d.meta.scenario.accelLaneFromY).toBe(from);
    expect(d.meta.scenario.accelLaneToY).toBe(to);
  });

  it("the arrival pose stands on the RAMP, ~120 m short of the top — the whole misreading", () => {
    const d = mwEntry();
    const ramp = d.roads.edges.find((e) => e.id === "mwe-e-ramp")!;
    // One lane, posted 90 — the red disc the finding read as the road's own
    // character is the ramp's limit, correctly rendered.
    expect(ramp.lanes).toBe(1);
    expect(ramp.maxspeed).toBe(90);
    const spawn = d.spawnPoints.find((s) => s.id === "mwe-spawn-ramp")!;
    const top = ramp.geometry[ramp.geometry.length - 1]!;
    const remaining = Math.hypot(top[0]! - spawn.x, top[1]! - spawn.y);
    expect(remaining).toBeGreaterThan(100);
    // The acceleration lane begins at the ramp top, so at the arrival pose it
    // is not merely hard to see — it is still ahead of the car.
    expect(top[1]).toBe(d.meta.scenario.accelLaneFromY);
  });
});

describe("2 · the library never claimed the motorway was built", () => {
  it("ev-motorway-entry-exit is still `new`, with the motorway map listed as owed", () => {
    const ev = getScenarioEvent("ev-motorway-entry-exit")!;
    expect(ev.status).toBe("new");
    expect(ev.worldPrimitives.join(" | ")).toMatch(/motorway map/i);
    expect(liveScenarioEvents().map((e) => e.id)).not.toContain("ev-motorway-entry-exit");
  });

  it("POSITIVE CONTROL: a `built` event IS live, so «not live» is a reading", () => {
    expect(getScenarioEvent("ev-speed-limit")!.status).toBe("built");
    expect(liveScenarioEvents().map((e) => e.id)).toContain("ev-speed-limit");
  });
});
