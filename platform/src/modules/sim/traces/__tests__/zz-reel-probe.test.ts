/** TEMPORARY probe — deleted before the lane finishes. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { recordReelDrive } from "../scReels";
import { recordScSpeedRainDrive } from "../scSpeedRain";
import { recordScOvSolidLineDrive } from "../scOvSolidLine";
import { recordScPeZoneLivingDrive } from "../scPeZoneLiving";
import { recordScJunctionDrive } from "../scJunctions";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
function district(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

function dump(label: string, d: RecordedDrive, everyN = 10) {
  const v = d.ruleEvents.filter((e) => e.kind === "violation").map((e) => `${e.code}@${e.t.toFixed(2)}`);
  const c = d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => `${e.code}@${e.t.toFixed(2)}`);
  console.log(`\n### ${label}`);
  console.log(`  violations: ${v.join(", ") || "none"}`);
  console.log(`  commends:   ${c.join(", ") || "none"}`);
  console.log(`  outcomes:   ${d.outcomes.map((o) => `${o.eventId}=${o.detail}/${o.success}`).join(", ") || "none"}`);
  console.log(`  duration:   ${d.trace.samples[d.trace.samples.length-1].tSec.toFixed(2)} samples=${d.trace.samples.length}`);
  const rows: string[] = [];
  for (let i = 0; i < d.trace.samples.length; i += everyN) {
    const s = d.trace.samples[i];
    rows.push(`t=${s.tSec.toFixed(1)} (${s.x.toFixed(1)},${s.y.toFixed(1)}) ${s.speedKmh.toFixed(0)}`);
  }
  console.log("  " + rows.join(" | "));
}

describe("probe", () => {
  it("dumps", () => {
    dump("distraction/shadow", recordReelDrive("sc-driver-distraction", "shadow-correct", district("hz-obstacle-v1")));
    dump("distraction/late-react", recordReelDrive("sc-driver-distraction", "mistake-late-react", district("hz-obstacle-v1")));
    dump("accident/hit-and-flee", recordReelDrive("sc-accident-own-conduct", "mistake-hit-and-flee", district("hz-obstacle-v1")));
    dump("speed-rain/dry-speed", recordScSpeedRainDrive(district("sp-rain-v1"), "mistake-dry-speed"));
    dump("ov-solid/pullout", recordScOvSolidLineDrive(district("ov-solid-v1"), "mistake-pullout"));
    dump("pe-zone/city-speed", recordScPeZoneLivingDrive(district("pe-zone-v1"), "mistake-city-speed"), 20);
    dump("rhr/no-look", recordScJunctionDrive(district("tj-rhr-v1"), "sc-junction-rhr", "mistake-no-look"));
  });
});
