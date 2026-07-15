/**
 * S2-C trace gate — „Пешеходна пътека" (sc-zebra-approach on zb-v1), doc 76
 * §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns PEDESTRIAN_YIELDED (the staged slow-crosser resolves "yielded").
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs.
 *   3. COMMITTED FILES under content/traces/sc-zebra-approach/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD (after ANY change to the script, recorder, district or rules):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-zebra-approach-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_ZEBRA_APPROACH } from "../../lessons/scenario/templates-flow";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScZebraApproachDrive, type ScZebraApproachTraceName } from "../scZebraApproach";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScZebraApproachTraceName[] = ["shadow-correct", "mistake-too-fast", "mistake-not-yielded"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("zb-v1");
const drives = new Map<ScZebraApproachTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScZebraApproachDrive(district, n)]),
);

describe("sc-zebra-approach — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns PEDESTRIAN_YIELDED", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("the staged crosser resolves 'yielded'", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-za-ped");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("stops before the zebra, waits, then clears it northbound with Bulgarian annotations", () => {
    // A real full stop short of the crossing (zb-x-1 at y = 90).
    const restedBeforeZebra = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 0.5 && s.y < 90 && s.y > 80,
    );
    expect(restedBeforeZebra.length).toBeGreaterThanOrEqual(20); // ≥ ~1 s at 20 Hz
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(120);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-zebra-approach — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Твърде бързо приближаване“: exactly PEDESTRIAN_CROSSING_TOO_FAST", () => {
    const drive = drives.get("mistake-too-fast")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ZEBRA_APPROACH.mistakes[0].codeRefs].sort());
    // The taught distinction: the approach fault, NOT a failure to yield.
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
  });

  it("„Непропускане на пешеходец“: exactly PEDESTRIAN_NOT_YIELDED, crosser conflict", () => {
    const drive = drives.get("mistake-not-yielded")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_ZEBRA_APPROACH.mistakes[1].codeRefs].sort());
    expect(drive.outcomes.find((o) => o.eventId === "sc-za-ped")?.detail).toBe("violation");
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-zebra-approach");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-zebra-approach");

  for (const name of NAMES) {
    it(`sc-zebra-approach/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-zebra-approach");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScZebraApproachDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_ZEBRA_APPROACH.shadow, ...SC_ZEBRA_APPROACH.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-zebra-approach/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-zebra-approach/${n}.trace.json`);
    expect([SC_ZEBRA_APPROACH.shadow.path, ...SC_ZEBRA_APPROACH.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
