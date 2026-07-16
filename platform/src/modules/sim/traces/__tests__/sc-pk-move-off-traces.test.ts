/**
 * Trace gate — sc-pk-move-off (doc 72 PK-05 „Потегляне от място без оглеждане";
 * the config-gated move-off-observation drill on vp-ready-v1), doc 76 §5/§9
 * stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING — rests at
 *      the curb, glances left + over the shoulder, then pulls away centered and
 *      legal (the move-off drill ENABLED via ruleConfig).
 *   2. MISTAKE DEMOS grade EXACTLY MOVE_OFF_WITHOUT_OBSERVATION — no-look pulls
 *      away blind; curb-glance looks only right; neither leaks a speed/lane code.
 *   3. COMMITTED FILES under content/traces/sc-pk-move-off/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pk-move-off-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PK_MOVE_OFF } from "../../lessons/scenario/templates-cockpit";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPkMoveOffDrive, type ScPkMoveOffTraceName } from "../scPkMoveOff";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-pk-move-off";
const NAMES: ScPkMoveOffTraceName[] = ["shadow-correct", "mistake-no-look", "mistake-curb-glance"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("vp-ready-v1");
const drives = new Map<ScPkMoveOffTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPkMoveOffDrive(district, n)]),
);

describe("sc-pk-move-off — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING (move-off drill enabled)", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("observes before moving off (a left AND a shoulder/rear glance while at rest)", () => {
    const kinds = shadow.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-left");
    expect(kinds).toContain("glance-rear");
    // Drives the whole street centered and legal.
    const maxKmh = Math.max(...shadow.trace.samples.map((s) => Math.abs(s.speedKmh)));
    expect(maxKmh).toBeLessThan(50);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(300);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5);
  });
});

describe("sc-pk-move-off — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Без оглеждане“: exactly MOVE_OFF_WITHOUT_OBSERVATION, never a speed/lane code", () => {
    const drive = drives.get("mistake-no-look")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PK_MOVE_OFF.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    // Really moved off blind: no left/rear glance anywhere in the demo.
    const kinds = drive.trace.events.map((e) => e.kind);
    expect(kinds).not.toContain("glance-left");
    expect(kinds).not.toContain("glance-rear");
  });

  it("„Само към бордюра“: exactly MOVE_OFF_WITHOUT_OBSERVATION (a right-only glance is not it)", () => {
    const drive = drives.get("mistake-curb-glance")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_PK_MOVE_OFF.mistakes[1].codeRefs].sort());
    const kinds = drive.trace.events.map((e) => e.kind);
    expect(kinds).toContain("glance-right");
    expect(kinds).not.toContain("glance-left");
    expect(kinds).not.toContain("glance-rear");
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
    const again = recordScPkMoveOffDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PK_MOVE_OFF.shadow, ...SC_PK_MOVE_OFF.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_PK_MOVE_OFF.shadow.path, ...SC_PK_MOVE_OFF.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
