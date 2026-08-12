/**
 * S trace gate — „Разминаване в тясна улица" (sc-ov-narrow on ov-narrow-v1,
 * doc 72 OV-14), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns YIELDED_TO_PRIORITY
 *      (waited at the widening for the oncoming, then squeezed past).
 *   2. MISTAKE DEMOS grade EXACTLY FAILED_TO_YIELD — no COLLISION, no
 *      lane-keeping fault (the swing is centered in the oncoming lane).
 *   3. COMMITTED FILES under content/traces/sc-ov-narrow/ ARE the recordings of
 *      these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-ov-narrow-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_OV_NARROW } from "../../lessons/scenario/templates-lanes";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScOvNarrowDrive, type ScOvNarrowTraceName } from "../scOvNarrow";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-ov-narrow";
const NAMES: ScOvNarrowTraceName[] = ["shadow-correct", "mistake-barge", "mistake-force"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("ov-narrow-v1");
const drives = new Map<ScOvNarrowTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScOvNarrowDrive(district, n)]),
);

describe("sc-ov-narrow — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns YIELDED_TO_PRIORITY", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("waits, then squeezes past to the far end with Bulgarian annotations", () => {
    expect(shadow.outcomes.some((o) => o.detail === "yielded" && o.success)).toBe(true);
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(200);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-ov-narrow — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  // B81 — THIS BLOCK USED TO ASSERT `not.toContain("COLLISION")`, AND THAT WAS
  // NEVER TRUE OF THE DRIVE; it was only true of the grader.
  //
  // Both demos steer into the oncoming lane and stay there. Measured through
  // the production stack, on the committed scripts, with exact body geometry:
  //
  //   mistake-barge  first overlap t 23.25 s, 110 consecutive frames of it,
  //                  deepest at t 23.70: 2.25 m between centres, where two
  //                  4.1 × 1.84 m bodies touch nose-to-tail at 4.07 m and
  //                  flank-to-flank at 1.77 m. SAT depth 1.7675 m.
  //   mistake-force  first overlap t 25.77 s, 137 frames, same 1.7675 m depth
  //                  at t 26.35 (2.27 m of centres).
  //
  // NarrowMeetingRunner retired on FAILED_TO_YIELD at t 20.38 / 23.03 — two
  // and three seconds BEFORE the bodies met — and `step()` returns on its
  // `phase === "resolved"` guard, so nothing was watching. The contact watch
  // now lives in the director's ContactSentinel, outside any runner's
  // lifetime, and the crash is billed.
  //
  // COPY DEBT, owned by the copy lane, deliberately NOT closed here: the
  // demos' Bulgarian narration and the template's `codeRefs` still describe a
  // priority fault alone («Насрещният с предимство трябваше да спре заради
  // теб»), so a learner is now shown a crash the card does not mention. Either
  // the scripts stop short of contact or the copy owns the crash — both are
  // authoring calls. Pinned as MEASURED here so the gap cannot widen unseen.
  const MEASURED: Record<string, string[]> = {
    "mistake-barge": ["COLLISION", "FAILED_TO_YIELD"],
    "mistake-force": ["COLLISION", "FAILED_TO_YIELD"],
  };
  for (const [i, name] of (["mistake-barge", "mistake-force"] as ScOvNarrowTraceName[]).entries()) {
    it(`${name}: FAILED_TO_YIELD and the head-on it ends in, never a lane-keeping fault`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual(MEASURED[name]);
      // ONE accident, not one per frame of the overlap.
      expect(violationCodes(drive).filter((c) => c === "COLLISION")).toHaveLength(1);
      expect(codes).not.toContain("POOR_LANE_KEEPING");
      expect(codes).not.toContain("CENTER_LINE_TOUCHED");
      // The authored claim, pinned so the debt above is visible in the diff
      // the day someone closes it.
      expect([...SC_OV_NARROW.mistakes[i].codeRefs]).toEqual(["FAILED_TO_YIELD"]);
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
    const again = recordScOvNarrowDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_OV_NARROW.shadow, ...SC_OV_NARROW.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_OV_NARROW.shadow.path, ...SC_OV_NARROW.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
