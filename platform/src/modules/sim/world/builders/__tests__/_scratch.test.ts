import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertDistrict } from "../../types";
import { analyzeNetwork, junctionPriorityControls } from "../network";
import { buildMarkings } from "../markings";

function load(id: string) {
  const p = path.resolve(process.cwd(), "..", "content", "world", `${id}.json`);
  return assertDistrict(JSON.parse(fs.readFileSync(p, "utf8")));
}
const OUT = "C:/Users/Ljh/AppData/Local/Temp/claude/E--AI-driver/8942546c-780e-450f-ae95-3aa94e28222a/scratchpad/out.txt";

function controls(id: string) {
  const d = load(id);
  const net = analyzeNetwork(d);
  const stop = new Set<string>();
  const give = new Set<string>();
  for (const n of net.nodes.values()) {
    if (n.signalized) continue;
    const c = junctionPriorityControls(n.approaches.map((a) => ({ edgeId: a.edgeId, class: a.edge.class, incoming: a.incoming, roundabout: a.edge.roundabout })));
    for (const [eid, ctl] of c) (ctl === "stopSign" ? stop : give).add(`${n.id}:${eid}`);
  }
  return { d, net, stop, give };
}

describe("scratch", () => {
  it("dump", () => {
    const L: string[] = [];
    for (const id of ["jxg-giveway-v1", "tj-emerge-v1", "sx-v1", "jx-equal-v1", "tj-occluded-v1"]) {
      const { d, net, stop, give } = controls(id);
      const withSigns = buildMarkings(d, net, stop, give, []);
      const bare = buildMarkings(d, net, new Set(), new Set(), []);
      L.push(`${id}: stop=${[...stop].join(",")} give=${[...give].join(",")}`);
      L.push(`  withSigns quads=${withSigns.markingQuads} tris=${withSigns.markings.triangleCount} gwTri=${withSigns.giveWayTriangles} stopLines=${withSigns.stopLines} identity=${withSigns.markings.triangleCount === 2 * withSigns.markingQuads - withSigns.giveWayTriangles}`);
      L.push(`  bare      quads=${bare.markingQuads} tris=${bare.markings.triangleCount}`);
      L.push(`  delta quads=${withSigns.markingQuads - bare.markingQuads} for ${withSigns.stopLines} lines`);
    }
    fs.writeFileSync(OUT, L.join("\n"));
    expect(1).toBe(1);
  });
});
