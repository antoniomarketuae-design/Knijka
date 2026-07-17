/**
 * Trace gate — „Изпреварване на група велосипедисти" (sc-vu-cyclist-group on
 * vu-pass-v1, doc 72 VU-02 column variant), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns YIELDED_TO_PRIORITY — and
 *      earns it FIVE times: one verdict per rider is the whole reason this
 *      template exists, so the count is asserted, not just the presence.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs.
 *   3. COMMITTED FILES under content/traces/sc-vu-cyclist-group/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-vu-cyclist-group-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_VU_CYCLIST_GROUP } from "../../lessons/scenario/templates-vru2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScVuCyclistGroupDrive, type ScVuCyclistGroupTraceName } from "../scVuCyclistGroup";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-vu-cyclist-group";
const NAMES: ScVuCyclistGroupTraceName[] = ["shadow-correct", "mistake-narrow", "mistake-cut-in"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("vu-pass-v1");
const drives = new Map<ScVuCyclistGroupTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScVuCyclistGroupDrive(district, n)]),
);

describe("sc-vu-cyclist-group — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("earns a YIELDED_TO_PRIORITY for EVERY one of the five riders", () => {
    // The template's reason to exist: the vulnerable-pass tracker re-arms per
    // rider, so a single wide line past the column is five separate verdicts.
    // Fewer than five would mean the column spacing had drifted under the
    // tracker's per-rider resolution (see VUG_SPACING_M) and riders were being
    // silently skipped — the failure this assert is here to catch.
    const yielded = commendationCodes(shadow).filter((c) => c === "YIELDED_TO_PRIORITY");
    expect(yielded).toHaveLength(5);
  });

  it("holds the wide oncoming-bank line past the whole column, then comes home", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(320);
    expect(Math.abs(last.x - 4.06)).toBeLessThan(1.5);
    // The pass line is genuinely on the OTHER side of the crown (x < 0) for the
    // entire column, tail (y ≈ 100 + 3t) to lead — not an in-lane nudge.
    for (const y of [110, 160, 210, 250]) {
      const s = shadow.trace.samples.find((s) => s.y >= y)!;
      expect(s.x, `y=${y} should still be on the wide line`).toBeLessThan(-1.5);
    }
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-vu-cyclist-group — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Тесен просвет покрай колоната“: exactly VULNERABLE_PASS_TOO_CLOSE, once per rider it worms past", () => {
    const drive = drives.get("mistake-narrow")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VU_CYCLIST_GROUP.mistakes[0].codeRefs].sort());
    // The squeeze rides under followMinSpeedKmh (20) the whole way and never
    // touches: neither the follow detector nor the collision machinery may
    // pollute the clearance verdict.
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).not.toContain("COLLISION");
    // Every rider it actually gets past is billed — the group tax is the point.
    expect(violationCodes(drive).length).toBeGreaterThanOrEqual(3);
    expect(commendationCodes(drive)).not.toContain("YIELDED_TO_PRIORITY");
  });

  it("„Прибиране между велосипедистите“: exactly VULNERABLE_PASS_TOO_CLOSE + FOLLOWING_TOO_CLOSE + COLLISION", () => {
    const drive = drives.get("mistake-cut-in")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VU_CYCLIST_GROUP.mistakes[1].codeRefs].sort());
  });

  it("the cut-in demo's FIRST half is genuinely clean — riders 5 and 4 still earn their verdicts", () => {
    // Unlike the live sc-vu-pass-clearance demos, this one deliberately DOES
    // collect commendations: the lesson is that a correct start earns you
    // nothing if you abandon the maneuver half way. The assert pins that the
    // wide phase really was wide (a demo that squeezed from the outset would
    // teach a different fault and would show zero yields here).
    const drive = drives.get("mistake-cut-in")!;
    const yielded = commendationCodes(drive).filter((c) => c === "YIELDED_TO_PRIORITY");
    expect(yielded).toHaveLength(2);
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
    const again = recordScVuCyclistGroupDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_VU_CYCLIST_GROUP.shadow, ...SC_VU_CYCLIST_GROUP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_VU_CYCLIST_GROUP.shadow.path,
      ...SC_VU_CYCLIST_GROUP.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
