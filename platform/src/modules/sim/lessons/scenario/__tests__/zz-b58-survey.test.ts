// TEMPORARY SURVEY — delete after reading. Measures the blast radius of
// clamping a compiled reachZone speed cap to the map's posted limit (row B58).
import { describe, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import { compileScenario } from "../compile";
import type { ScenarioLevel } from "../types";

describe("b58 survey", () => {
  it("lists every reachZone cap against its posted limit", () => {
    const rows: string[] = [];
    let noPosted = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      const posted = spec.map.params["maxspeedKmh"];
      for (const rung of spec.levels) {
        const level = rung.level as ScenarioLevel;
        let lesson;
        try {
          lesson = compileScenario(spec, level);
        } catch {
          continue;
        }
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
          if (cap === undefined) continue;
          if (typeof posted !== "number") {
            noPosted += 1;
            continue;
          }
          const authored = (
            spec.success.find((s) => s.id === o.id)?.params as { maxSpeedKmh?: number } | undefined
          )?.maxSpeedKmh;
          if (cap > posted) {
            rows.push(
              `${spec.id} L${level} ${o.id} authored=${authored} compiled=${cap} posted=${posted} ${
                (authored ?? 0) > posted ? "AUTHOVER" : "LADDER"
              }`,
            );
          }
        }
      }
    }
    console.log(`GATES OVER POSTED: ${rows.length}   (gates with no posted param: ${noPosted})`);
    const authoredOver = rows.filter((r) => r.includes("AUTHOVER"));
    console.log(`AUTHORED OVER POSTED: ${authoredOver.length}`);
    const uniq = new Set(rows.map((r) => r.split(" ")[0]));
    console.log(`DISTINCT TEMPLATES: ${uniq.size} -> ${[...uniq].join(", ")}`);
    for (const r of rows) console.log("  " + r);
  });
});
