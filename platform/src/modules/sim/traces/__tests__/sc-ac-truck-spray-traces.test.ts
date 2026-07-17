/**
 * Trace gate — „Водна пелена зад камиона" (sc-ac-truck-spray on mw-v1; doc 72
 * FO-04 × FO-06 × AC-02), doc 76 §5/§9 stages 3+5. The rain-following detector
 * ships config-OFF; the recorder enables it via ruleConfig (the per-lesson drill
 * opt-in) and records in DAY RAIN, so the gate replays with the drill ON:
 *   1. SHADOW: ~64 km/h at the pinned ~3.4 s behind the rig → ZERO violations +
 *      CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY their codeRefs — the 115 km/h dry-habit gap
 *      bills FOLLOWING_TOO_CLOSE_FOR_RAIN and NOTHING else (not the base
 *      following code, not a conditions/speeding code: 115 ≤ the 119 rain
 *      envelope ≤ 140), and the unlit drive bills HEADLIGHTS_OFF_IN_RAIN alone.
 *   3. COMMITTED FILES under content/traces/sc-ac-truck-spray/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * Because this template REUSES a committed district, the L7 copy truth is
 * asserted here rather than in a new world battery: every value the spec and the
 * scripts pin by hand (lane center, spawn, limit, length, the motorway tag, the
 * absence of junctions/crossings/zones-other-than-emergency) is checked against
 * content/world/mw-v1.json below. mw-v1's own contract battery lives in
 * world/__tests__/mw-district.test.ts.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ac-truck-spray-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_AC_TRUCK_SPRAY } from "../../lessons/scenario/templates-conditions2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScAcTruckSprayDrive, type ScAcTruckSprayTraceName } from "../scAcTruckSpray";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ac-truck-spray";
const NAMES: ScAcTruckSprayTraceName[] = ["shadow-correct", "mistake-dry-gap", "mistake-lights-off"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("mw-v1");
const drives = new Map<ScAcTruckSprayTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScAcTruckSprayDrive(district, n)]),
);

describe("sc-ac-truck-spray — the district the spec pins by hand (the L7 copy truth)", () => {
  const d = district as {
    meta: { scenario: { laneCruiseX: number; laneEmergencyX: number; params: Record<string, number> } };
    roads: { edges: Array<{ id: string; motorway?: boolean; maxspeed: number; length: number; lanes: number }> };
    intersections: unknown[];
    crossings: unknown[];
    spawnPoints: Array<{ id: string; x: number; y: number; heading: number }>;
    zones?: Array<{ kind: string }>;
  };

  it("the cruise lane the drives ride is mw-v1's own laneCruiseX", () => {
    // Every script coordinate and the template's two reachZones use x = 0. If a
    // re-generation ever moved the lane, these drives would silently record in
    // the wrong lane (or the median) — fail here instead.
    expect(d.meta.scenario.laneCruiseX).toBe(0);
    // The staged rig reaches the cruise lane by offsetting one drawn lane LEFT
    // of the traffic graph's curb-lane centerline: 8.13 − 8.125 ≈ 0. That single
    // subtraction is the whole reason this template can grade at all.
    expect(d.meta.scenario.laneEmergencyX).toBe(8.13);
  });

  it("the spawn the template starts from exists, in the cruise lane, facing north", () => {
    const spawn = d.spawnPoints.find((s) => s.id === "mw-spawn-approach")!;
    expect(spawn).toBeDefined();
    expect([spawn.x, spawn.y, spawn.heading]).toEqual([0, 15, 0]);
  });

  it("the motorway truths the grading leans on: the tag, the 140 limit, the kilometre", () => {
    const nb = d.roads.edges.find((e) => e.id === "mw-e-nb")!;
    // The motorway tag arms DRIVING_TOO_SLOW_FOR_MOTORWAY (kept silent by the
    // ≥ 50 km/h plateaus) and the emergencyLaneRight keep-right exemption that
    // makes laneId 1 innocent for the whole drill.
    expect(nb.motorway).toBe(true);
    expect(nb.lanes).toBe(3); // emergency + 2 travel
    // 140 is the number the lesson turns on: the rain envelope is 0.85 × 140 =
    // 119, so the 115 km/h demo is lawful for the conditions and convicted for
    // the gap alone. A different limit would silently rewrite the lesson.
    expect(nb.maxspeed).toBe(140);
    expect(nb.length).toBe(1000); // the scripts drive to y = 880
    expect(d.meta.scenario.params.maxspeedKmh).toBe(140);
    expect(d.meta.scenario.params.lengthM).toBe(1000);
  });

  it("nothing but the gap, the speed and the lamps is gradable on this map", () => {
    // The template's claim in the header, made checkable: no junction, no zebra
    // and no speed/curve span can attach a code to these drives.
    expect(d.intersections.length).toBe(0);
    expect(d.crossings.length).toBe(0);
    expect((d.zones ?? []).every((z) => z.kind === "emergencyLane")).toBe(true);
  });
});

describe("sc-ac-truck-spray — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("lit, wet-prudent and 3+ seconds back → ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("the rig is really there, really in-lane, and really pinned (else the drill grades nothing)", () => {
    // The failure this catches is SILENT and total: if the staged actor lands
    // outside the 4 m lead corridor (it does on this map without the
    // extraRightOffsetM — see the template header), tick.leadGapM stays
    // Infinity, the shadow still records ZERO violations, and the whole
    // template quietly becomes „drive a motorway in the rain". The shadow being
    // clean is therefore NOT evidence of a working drill; this is. The gap is a
    // TICK channel, not a trace field (the recording is kinematic), so it is
    // read back through the production onTick hook.
    const gaps: number[] = [];
    const lanes = new Set<number>();
    recordScAcTruckSprayDrive(district, "shadow-correct", {
      onTick: (tick) => {
        lanes.add(tick.laneId);
        if (tick.leadGapM !== undefined && Number.isFinite(tick.leadGapM)) gaps.push(tick.leadGapM);
      },
    });
    expect(gaps.length).toBeGreaterThan(100);
    for (const g of gaps) {
      expect(g).toBeGreaterThan(55);
      expect(g).toBeLessThan(65);
    }
    // …and the whole drive stays in the rightmost REQUIRED travel lane, which is
    // what keeps NOT_KEEPING_RIGHT and EMERGENCY_LANE_DRIVING off the sheet.
    expect([...lanes]).toEqual([1]);
  });
});

describe("sc-ac-truck-spray — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-dry-gap", "mistake-lights-off"] as const).entries()) {
    it(`${name}: exactly ${SC_AC_TRUCK_SPRAY.mistakes[i].codeRefs.join(" + ")}`, () => {
      const codes = [...new Set(violationCodes(drives.get(name)!))].sort();
      expect(codes).toEqual([...SC_AC_TRUCK_SPRAY.mistakes[i].codeRefs].sort());
    });
  }

  it("the dry-gap demo is convicted for the GAP alone — the motorway's whole point", () => {
    // 115 km/h is under the posted 140, under the 154 grace and under the 119
    // rain envelope; the gap (~1.9 s) is above the dry fire threshold (1.26 s)
    // and below the wet one (2.016 s). So exactly ONE code may attach. If a
    // re-tune ever let the base основна or a speed code in, the mistake card's
    // „скоростта беше в ограничението и въпреки това несъобразена" would become
    // a lie about its own trace.
    const codes = [...new Set(violationCodes(drives.get("mistake-dry-gap")!))];
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("NOT_KEEPING_RIGHT");
    expect(codes).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("the lights-off demo differs from the shadow ONLY by the lamp", () => {
    // One demo, one thing to fix: it drives the shadow's speed and the shadow's
    // gap, so no following/conditions code may ride along on the card.
    const codes = [...new Set(violationCodes(drives.get("mistake-lights-off")!))];
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE_FOR_RAIN");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("no demo resolves the staged rig — it is moving traffic, not a cut-in drill", () => {
    // The cut tier is authored out of reach (cutAt 400 m past the road end +
    // minCutSpeedKmh 250). If a re-tune ever fired it, the actor would swerve
    // and start adjudicating a cut-in the cards never mention.
    for (const name of NAMES) expect(drives.get(name)!.outcomes, name).toEqual([]);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", SCENARIO_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", SCENARIO_ID);
  for (const name of NAMES) {
    it(`${SCENARIO_ID}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
      const serialized = serializeScenarioTrace(drives.get(name)!.trace) + "\n";
      const contentFile = path.join(contentDir, `${name}.trace.json`);
      const publicFile = path.join(publicDir, `${name}.trace.json`);
      if (RECORD) {
        mkdirSync(contentDir, { recursive: true });
        mkdirSync(publicDir, { recursive: true });
        writeFileSync(contentFile, serialized);
        writeFileSync(publicFile, serialized);
      }
      expect(existsSync(contentFile), `${contentFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(existsSync(publicFile), `${publicFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
      expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
      const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.scenarioId).toBe(SCENARIO_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScAcTruckSprayDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_AC_TRUCK_SPRAY.shadow, ...SC_AC_TRUCK_SPRAY.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_AC_TRUCK_SPRAY.shadow.path,
      ...SC_AC_TRUCK_SPRAY.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
