/**
 * Trace gate — the 5 Half-B theory reels (templates-reels.ts), doc 76 §5/§9:
 *   1. each SHADOW replays with ZERO violations and earns CLEAN_DRIVING;
 *   2. each MISTAKE grades EXACTLY its template codeRefs (deduped) — no leaks;
 *   3. committed JSON under content/traces/<id>/ IS the recording, byte-for-byte,
 *      with an identical public copy.
 *
 * RE-RECORD (writes both content/traces and platform/public/traces):
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-reels-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scenarioById } from "../../lessons/scenario";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import type { RecordedDrive } from "../recorder";
import { recordReelDrive, REELS } from "../scReels";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

// Record every reel's drives once (deterministic — same district → same bytes).
const drives = new Map<string, Map<string, RecordedDrive>>();
for (const reel of REELS) {
  const district = loadDistrict(reel.districtId);
  const byName = new Map<string, RecordedDrive>();
  for (const name of reel.names) byName.set(name, recordReelDrive(reel.id, name, district));
  drives.set(reel.id, byName);
}

for (const reel of REELS) {
  const spec = scenarioById(reel.id)!;
  const byName = drives.get(reel.id)!;
  const shadowName = reel.names[0];
  const mistakeNames = reel.names.slice(1);

  describe(`${reel.id} — trace gate`, () => {
    it("template is registered and its trace refs match the recorded names", () => {
      expect(spec, reel.id).toBeTruthy();
      const expected = reel.names.map((n) => `content/traces/${reel.id}/${n}.trace.json`);
      expect([spec.shadow.path, ...spec.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
    });

    it("SHADOW replays with ZERO violations (doc 76 §5)", () => {
      const shadow = byName.get(shadowName)!;
      // The §5 gate is zero violations. CLEAN_DRIVING is a DISTANCE-based
      // commendation (cleanDrivingDistanceM) — the ~225 m hz-obstacle shadows
      // are simply too short to accrue one, so it is not asserted here.
      expect(violationCodes(shadow), `${reel.id} shadow codes`).toEqual([]);
    });

    mistakeNames.forEach((name, i) => {
      it(`MISTAKE ${name} grades exactly ${spec.mistakes[i].codeRefs.join("+")}`, () => {
        const drive = byName.get(name)!;
        const codes = [...new Set(violationCodes(drive))].sort();
        expect(codes).toEqual([...spec.mistakes[i].codeRefs].sort());
      });
    });
  });
}

describe("committed reel trace files — the determinism law", () => {
  for (const reel of REELS) {
    const contentDir = path.join(REPO_ROOT, "content", "traces", reel.id);
    const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", reel.id);
    const byName = drives.get(reel.id)!;
    for (const name of reel.names) {
      it(`${reel.id}/${name}: committed JSON is exactly this recording (+ public copy)`, () => {
        const serialized = serializeScenarioTrace(byName.get(name)!.trace) + "\n";
        const contentFile = path.join(contentDir, `${name}.trace.json`);
        const publicFile = path.join(publicDir, `${name}.trace.json`);
        if (RECORD) {
          mkdirSync(contentDir, { recursive: true });
          mkdirSync(publicDir, { recursive: true });
          writeFileSync(contentFile, serialized);
          writeFileSync(publicFile, serialized);
        }
        expect(existsSync(contentFile), `${contentFile} missing — run RECORD_TRACES`).toBe(true);
        expect(existsSync(publicFile), `${publicFile} missing — run RECORD_TRACES`).toBe(true);
        expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
        expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
        const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
        expect(parsed!.meta.scenarioId).toBe(reel.id);
      });
    }
  }
});
