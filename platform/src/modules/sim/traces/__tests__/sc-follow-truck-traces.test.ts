/**
 * Trace gate — „Зад камион" (sc-follow-truck on fo-follow-v1, doc 72 FO-06 —
 * the large-vehicle actor profile), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW: a calm ~20 km/h follow behind the pinned ~17 m truck (~3 s of
 *      gap — the increased blocked-vision distance) → ZERO violations +
 *      CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY FOLLOWING_TOO_CLOSE (steady tailgate at
 *      48 km/h, and the „doближаване за да виждаш" acceleration), never a
 *      rain-following / standstill-gap / collision code.
 *   3. COMMITTED FILES under content/traces/sc-follow-truck/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 * Plus the FO-06 data assert: the template's staged lead IS a truck-profile
 * brakingLeadCar (the profile is the whole point of the scenario).
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-follow-truck-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_FOLLOW_TRUCK } from "../../lessons/scenario/templates-following";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScFollowTruckDrive, type ScFollowTruckTraceName } from "../scFollowTruck";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-follow-truck";
const NAMES: ScFollowTruckTraceName[] = ["shadow-correct", "mistake-tailgate", "mistake-peek"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("fo-follow-v1");
const drives = new Map<ScFollowTruckTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScFollowTruckDrive(district, n)]),
);

describe("sc-follow-truck — the FO-06 profile is staged (doc 72 §9)", () => {
  it("the template's lead actor is a truck-profile brakingLeadCar", () => {
    const staged = SC_FOLLOW_TRUCK.staged ?? [];
    // Founder R3 #42 (doc 62): the truck lead PLUS the oncoming counter-flow
    // that makes overtaking visibly unsafe — two staged events, exactly.
    expect(staged.length).toBe(2);
    const lead = staged[0];
    expect(lead.kind).toBe("brakingLeadCar");
    if (lead.kind !== "brakingLeadCar") return;
    expect(lead.actor.profile).toBe("truck");
    // The slam tier is authored OUT of reach — pure gap management.
    expect(lead.minSlamSpeedKmh).toBeGreaterThan(200);
    expect(lead.slamAt.y).toBeGreaterThan(360);
  });

  it("the oncoming counter-flow occupies the opposite bank for the whole follow (R3 #42)", () => {
    const staged = SC_FOLLOW_TRUCK.staged ?? [];
    const stream = staged[1];
    expect(stream.kind).toBe("oncomingStream");
    if (stream.kind !== "oncomingStream") return;
    // Southbound = oncoming on fo-follow-v1; pressure scenery (learn-only).
    expect(stream.actor.pathNodes).toEqual(["fo-n-end", "fo-n-start"]);
    expect(stream.count).toBe(6);
    expect(stream.gapsM.length).toBe(stream.count - 1);
    // `gapsM[i-1]` is car i's extra hold arc vs **car 0** (OncomingStreamSpec;
    // runners.ts holds car i at `hold.offsetM - gapsM[i-1]` and does NOT
    // accumulate), so the HEADWAY between consecutive cars is the difference.
    // This block used to read the array as headways and assert Σ ≤ holdArc —
    // which is how `[45,45,45,45,45]` passed while parking five of the six
    // cars on ONE arc (y 169.7). Driven 2026-08-03: the "rolling counter-
    // column" was a head plus a clump, 2 s apart, and then an empty road.
    const headways = stream.gapsM.map((g, i) => g - (i === 0 ? 0 : stream.gapsM[i - 1]));
    for (const h of headways) {
      // strictly increasing hold arcs ⇒ no two cars can share a spot
      expect(h).toBeGreaterThan(0);
      // and every window stays far under an overtake around a 7.5 m truck
      expect(h).toBeLessThanOrEqual(50);
    }
    // Hold feasibility (the ov-oncoming battery law, in its per-car form —
    // the same shape nm-district / ov-oncoming-district assert): every
    // trailing car stays on-path.
    for (const g of stream.gapsM) {
      expect(stream.actor.hold.offsetM - g).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("sc-follow-truck — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("calm blocked-vision follow → ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });
});

describe("sc-follow-truck — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-tailgate", "mistake-peek"] as const).entries()) {
    it(`${name}: exactly FOLLOWING_TOO_CLOSE, no rain/standstill/collision code`, () => {
      const codes = [...new Set(violationCodes(drives.get(name)!))].sort();
      expect(codes).toEqual([...SC_FOLLOW_TRUCK.mistakes[i].codeRefs].sort());
      expect(codes).not.toContain("FOLLOWING_TOO_CLOSE_FOR_RAIN");
      expect(codes).not.toContain("STANDSTILL_GAP_TOO_CLOSE");
      expect(codes).not.toContain("COLLISION");
    });
  }
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
    const again = recordScFollowTruckDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_FOLLOW_TRUCK.shadow, ...SC_FOLLOW_TRUCK.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_FOLLOW_TRUCK.shadow.path, ...SC_FOLLOW_TRUCK.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
