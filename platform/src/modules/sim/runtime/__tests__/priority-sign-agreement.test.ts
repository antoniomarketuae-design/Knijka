/**
 * AUDIT C-4 REGRESSION NET — the graded line and the painted sign are one truth.
 *
 * The rule engine used to derive its graded stop lines from one heuristic
 * (always Б2 „Стоп" at a minor×arterial meeting) while the world builder
 * painted the VISIBLE sign from another (Б2 only against a primary, Б1
 * otherwise). On four approaches of the shipped district — including
 * n5063751788, which the practical-exam route crosses twice per lap — a
 * student read „Пропусни движението", correctly rolled through a clear mouth,
 * and was instant-failed for STOP_SIGN_NO_FULL_STOP (опасна, 10 points,
 * lessons/exam.ts terminates the exam) by a Б2 line nobody could see.
 *
 * A driving product survives being wrong about a junction. It does not survive
 * being wrong in two directions at once, contradicting the sign in front of the
 * student's eyes. So this file replays BOTH producers over EVERY shipped
 * district and asserts they cannot disagree:
 *
 *   1. every graded stopSign line stands under a painted Б2, and every graded
 *      giveWay line under a painted Б1 (the task's headline invariant: a graded
 *      full-stop demand ALWAYS has a Б2 above it);
 *   2. no graded priority line exists on an approach with no sign at all
 *      (d2-v1's primary_link ramps used to collect exactly that);
 *   3. the runtime and world-builder CLASS_RANK tables stay byte-equal — a
 *      class present in one and missing in the other is how (2) happened.
 *
 * Signalized lines are out of scope here: those are guarded by lamps, not signs.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { CLASS_RANK as RUNTIME_CLASS_RANK } from "../spatial";
import { CLASS_RANK as BUILDER_CLASS_RANK } from "../../world/builders/constants";
import { analyzeNetwork } from "../../world/builders/network";
import { buildProps } from "../../world/builders/props";
import { assertDistrict, type District } from "../../world/types";

const WORLD_DIR = ((): string => {
  const candidates = [
    path.join(process.cwd(), "content", "world"),
    path.resolve(process.cwd(), "..", "content", "world"),
  ];
  for (const dir of candidates) if (fs.existsSync(dir)) return dir;
  throw new Error(`content/world not found in: ${candidates.join(", ")}`);
})();

/** Every district JSON we ship — the test must not need a hand-kept list. */
const DISTRICT_IDS: readonly string[] = fs
  .readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length))
  .sort();

function loadDistrictById(id: string): District {
  return assertDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")));
}

/** "<nodeId>:<edgeId>" → the sign kind the world builder posts there. */
function paintedSigns(district: District): Map<string, "stopSign" | "giveWay"> {
  const network = analyzeNetwork(district);
  const props = buildProps(district, network, [], { treeDensity: 0, seed: 1 });
  const out = new Map<string, "stopSign" | "giveWay">();
  for (const key of props.stopSignApproaches) out.set(key, "stopSign");
  for (const key of props.giveWayApproaches) out.set(key, "giveWay");
  return out;
}

describe("priority signs and graded stop lines agree (audit C-4)", () => {
  it("ships at least the two hand-authored districts the exam and the Б1 lesson need", () => {
    // Guards the discovery above: an empty//misdirected WORLD_DIR would make
    // every per-district case below vacuously pass.
    expect(DISTRICT_IDS).toContain("district-v1");
    expect(DISTRICT_IDS).toContain("jxg-giveway-v1");
    expect(DISTRICT_IDS.length).toBeGreaterThan(50);
  });

  it("keeps the runtime and world-builder class-rank tables identical", () => {
    expect(RUNTIME_CLASS_RANK).toEqual(BUILDER_CLASS_RANK);
  });

  for (const id of DISTRICT_IDS) {
    it(`${id}: every graded priority line stands under the matching sign`, () => {
      const district = loadDistrictById(id);
      const signs = paintedSigns(district);
      const lines = createWorldRuntime(district)
        .debugStopLines()
        .filter((l) => l.control !== "trafficLight");
      for (const line of lines) {
        const edgeId = district.roads.edges[line.edgeIdx]!.id;
        const key = `${line.junctionNodeId}:${edgeId}`;
        const posted = signs.get(key);
        // An ungraded sign is fine (the graded subset is deliberately
        // conservative); a graded line with NO sign, or with the OTHER sign,
        // is the C-4 contradiction.
        expect(posted, `${key} is graded ${line.control} with no visible sign`).toBeDefined();
        expect(posted, `${key} is graded ${line.control} under a ${posted} sign`).toBe(line.control);
      }
    });
  }

  it("district-v1: the four C-4 approaches now grade the Б1 they post", () => {
    // The exact contradictions the audit reproduced. n5063751788 is the one on
    // the shipped practical-exam route (examBankData.ts P1_SITE); the others
    // are ул. Дъбница and two parking-aisle mouths. All four meet a SECONDARY,
    // never a primary — so Б1 „Пропусни движението" is the honest obligation
    // and a clear-mouth rolling entry must cost nothing.
    const district = loadDistrictById("district-v1");
    const signs = paintedSigns(district);
    const lines = createWorldRuntime(district).debugStopLines();
    const byKey = new Map(
      lines.map((l) => [`${l.junctionNodeId}:${district.roads.edges[l.edgeIdx]!.id}`, l]),
    );
    for (const key of [
      "n316056951:e1182196532.0",
      "n4372628948:e519275129.0",
      "n5063751788:e1375487707.0",
      "n9601848047:e1043264868.0",
    ]) {
      expect(byKey.get(key)?.control, key).toBe("giveWay");
      expect(signs.get(key), key).toBe("giveWay");
    }
  });

  it("d2-v1: the unauthored primary_link ramps carry no graded line", () => {
    // These approaches ranked 5 for the sign painter (no sign: an all-arterial
    // junction is равнозначно) and 2 for the runtime, whose rank table was
    // missing `primary_link` — so each collected a graded Б2 with nothing at
    // all posted above it. Same false-fail class as C-4. The third ramp,
    // n2945503673, is the one sc-ed-d2-priority-run needs, so it is now an
    // explicit STOP_LINE_OVERRIDES entry — a sign AND a line, not an accident.
    const district = loadDistrictById("d2-v1");
    const graded = new Set(
      createWorldRuntime(district)
        .debugStopLines()
        .filter((l) => l.control !== "trafficLight")
        .map((l) => `${l.junctionNodeId}:${district.roads.edges[l.edgeIdx]!.id}`),
    );
    expect(graded).not.toContain("n2952140105:e291106506.0");
    expect(graded).not.toContain("n3790209881:e677123791.0");
    expect(graded).toContain("n2945503673:e171919146.0");
    expect(paintedSigns(district).get("n2945503673:e171919146.0")).toBe("stopSign");
  });
});
