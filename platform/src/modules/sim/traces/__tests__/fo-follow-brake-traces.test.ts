/**
 * S3-C trace gate — „Внезапно спиране на предния" (sc-follow-brake on
 * fo-brake-v1, doc 72 FO-02), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns CLEAN_DRIVING — it reacts to the lead's brake-slam and stops
 *      WITHOUT contact (staged outcome "stoppedInTime"), then resumes.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs (COLLISION) with NO
 *      extras — the safe approach means neither collision demo also trips a
 *      following code.
 *   3. COMMITTED FILES under content/traces/sc-follow-brake/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/fo-follow-brake-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_FOLLOW_BRAKE } from "../../lessons/scenario/templates-following";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScFollowBrakeDrive, type ScFollowBrakeTraceName } from "../scFollowBrake";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-follow-brake";
const NAMES: ScFollowBrakeTraceName[] = ["shadow-correct", "mistake-late-reaction", "mistake-no-reaction"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("fo-brake-v1");
const drives = new Map<ScFollowBrakeTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScFollowBrakeDrive(district, n)]),
);

describe("sc-follow-brake — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("reacts to the slam and stops WITHOUT contact, then finishes the street", () => {
    const stop = shadow.outcomes.find((o) => o.eventId === "sc-fb-lead");
    expect(stop?.detail).toBe("stoppedInTime");
    expect(stop?.success).toBe(true);
    expect(stop?.stopGapM ?? 0).toBeGreaterThan(0);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(390); // resumed and reached the finish zone
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-follow-brake — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Закъсняла реакция“: exactly COLLISION, no following extras", () => {
    const drive = drives.get("mistake-late-reaction")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FOLLOW_BRAKE.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(drive.outcomes.find((o) => o.eventId === "sc-fb-lead")?.detail).toBe("hitLeadCar");
  });

  it("„Без реакция“: exactly COLLISION, no following extras", () => {
    const drive = drives.get("mistake-no-reaction")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FOLLOW_BRAKE.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(drive.outcomes.find((o) => o.eventId === "sc-fb-lead")?.detail).toBe("hitLeadCar");
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
    const again = recordScFollowBrakeDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_FOLLOW_BRAKE.shadow, ...SC_FOLLOW_BRAKE.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_FOLLOW_BRAKE.shadow.path, ...SC_FOLLOW_BRAKE.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
