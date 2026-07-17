/**
 * BUG-2 — the oncomingStream runner's stage-time collapse guard. A follower is
 * held gapsM[i-1] m BEHIND the head along the SAME path (runners.ts); a gap
 * wider than the head's own hold arc drives it to a negative path arc, which
 * clampArc pins to the start, silently collapsing the intended column to a
 * nose-to-tail clump that a gap-window drill then grades nothing on. The guard
 * throws at stage() (the ov-oncoming battery's static holdArc − gap ≥ 0 law,
 * enforced for every spec now). Site: ov-oncoming-v1 (the OVG path; nodeS
 * [0, 900], asserted by the probe in ov-oncoming-district.test.ts).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { OncomingStreamSpec } from "../../contracts";
import { createWorldRuntime } from "../../runtime";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { createScenarioDirector } from "../director";

const OVG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../content/world/ov-oncoming-v1.json",
);
const raw = JSON.parse(readFileSync(OVG_PATH, "utf-8")) as TrafficDistrict;

/** Stage a single stream through the real director (stages on construction). */
function stageStream(spec: OncomingStreamSpec): void {
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  createScenarioDirector([spec], traffic, { seed: 7, signals: runtime });
}

const BASE = {
  id: "test-stream",
  kind: "oncomingStream",
  actor: {
    pathNodes: ["ovg-n-end", "ovg-n-start"], // southbound, pathLen 900, nodeS [0, 900]
    hold: { nodeIndex: 0, offsetM: 618 },
    cruiseSpeedMps: 12,
    colorIndex: 1,
  },
  count: 2,
  gapsM: [66],
  releaseKmh: 3,
} satisfies OncomingStreamSpec;

describe("OncomingStreamRunner — stage-time collapse guard (BUG-2)", () => {
  it("a gap wider than a POSITIVE head hold arc throws, naming the event id", () => {
    const spec: OncomingStreamSpec = {
      ...BASE,
      id: "over-gapped",
      actor: { ...BASE.actor, hold: { nodeIndex: 0, offsetM: 100 } },
      gapsM: [200], // 100 − 200 < 0 ⇒ car 1 off the path start
    };
    expect(() => stageStream(spec)).toThrow(/over-gapped.*falls off the path start/);
  });

  it("a deep head with gaps that all fit stages cleanly (the shipped OVG shape)", () => {
    const spec: OncomingStreamSpec = { ...BASE, count: 3, gapsM: [66, 560] };
    expect(() => stageStream(spec)).not.toThrow();
  });

  it("a head AT the path origin (holdArc 0) is a deliberate spawn-clump — no throw", () => {
    // sc-mfp-stream's give-way pattern: the head sits at the spawn with no room
    // behind, so followers clamp to the start by construction and the drill
    // grades off ANY oncoming car, not a measured window. The guard only fires
    // for a gap wider than a REAL (positive) head arc.
    const spec: OncomingStreamSpec = {
      ...BASE,
      count: 3,
      actor: { ...BASE.actor, hold: { nodeIndex: 0, offsetM: 0 } },
      gapsM: [26, 26],
    };
    expect(() => stageStream(spec)).not.toThrow();
  });
});
