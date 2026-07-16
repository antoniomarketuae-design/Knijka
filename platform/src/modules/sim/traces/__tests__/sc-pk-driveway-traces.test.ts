/**
 * Trace gate — sc-pk-driveway (doc 72 PK-11 „Заден ход в алея"; the
 * reverse-into-a-driveway maneuver on pk-drive-v1), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations, threads BETWEEN the driveway walls
 *      and comes to rest dead-centre in the bay via reverse (the §5 pose).
 *   2. MISTAKE DEMOS grade EXACTLY COLLISION — the wide swing mounts the fence,
 *      the too-deep reverse hits the back wall; neither leaks another code.
 *   3. COMMITTED FILES under content/traces/sc-pk-driveway/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * Also pins the template bay ↔ trace bay single-truth (they must match value
 * for value or the parkInBay objective could never complete on this geometry).
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pk-driveway-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PK_DRIVEWAY, PK_DRIVE_TARGET_BAY as TEMPLATE_BAY } from "../../lessons/scenario/templates-pk";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  PK_DRIVE_TARGET_BAY as TRACE_BAY,
  recordScPkDrivewayDrive,
  type ScPkDrivewayTraceName,
} from "../scPkDriveway";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-pk-driveway";
const NAMES: ScPkDrivewayTraceName[] = ["shadow-correct", "mistake-wide", "mistake-deep"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("pk-drive-v1");
const drives = new Map<ScPkDrivewayTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPkDrivewayDrive(district, n)]),
);

describe("sc-pk-driveway — single truth: template bay == trace bay", () => {
  it("the parkInBay bay is pinned to the same value in the template and the trace", () => {
    expect(TEMPLATE_BAY).toEqual(TRACE_BAY);
  });
});

describe("sc-pk-driveway — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations, driveway walls armed at 0 km/h threshold", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("ends at rest centred in the driveway bay via reverse (the §5 completion pose)", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.hypot(last.x - TRACE_BAY.x, last.y - TRACE_BAY.y)).toBeLessThan(0.25);
    const axisDiff = Math.abs(((last.headingDeg - 90) % 180) + 180) % 180;
    expect(Math.min(axisDiff, 180 - axisDiff)).toBeLessThan(5);
    expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
    expect(last.brakeOn).toBe(true);
    // Actually reversed into the bay (gear -1 samples near the driveway).
    const reversing = shadow.trace.samples.filter((s) => s.gear === -1);
    expect(reversing.length).toBeGreaterThan(15);
    // Full observation ritual before the reverse.
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("glance-rear");
  });
});

describe("sc-pk-driveway — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Твърде широк замах“ mounts the fence: exactly COLLISION (staticObject) at creep speed", () => {
    const drive = drives.get("mistake-wide")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PK_DRIVEWAY.mistakes[0].codeRefs].sort());
    const collision = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("staticObject");
  });

  it("„Твърде дълбоко назад“ hits the back wall: exactly COLLISION (staticObject)", () => {
    const drive = drives.get("mistake-deep")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PK_DRIVEWAY.mistakes[1].codeRefs].sort());
    const collision = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
    expect(collision.kind === "violation" ? collision.detail : undefined).toBe("staticObject");
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
    const again = recordScPkDrivewayDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PK_DRIVEWAY.shadow, ...SC_PK_DRIVEWAY.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_PK_DRIVEWAY.shadow.path, ...SC_PK_DRIVEWAY.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
