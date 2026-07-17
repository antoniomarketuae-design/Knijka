/**
 * Trace gate — „Изход от кръгово с десен мигач“ (sc-rb-exit-signal on the
 * REUSED rb-mini-v1 district), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns YIELDED_TO_PRIORITY — the staged circulating car resolves
 *      "yielded" (waited it past the mouth, brisk flat-chord entry wins ring
 *      priority, then a matched 10.5 km/h circulation trails it ~190° to the
 *      THIRD exit without ever reeling it in).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — the unsignalled
 *      west exit grades only TURN_WITHOUT_INDICATOR (its ENTRY stays clean and
 *      still earns the commendation), and the barge grades only
 *      FAILED_TO_YIELD.
 *   3. COMMITTED FILES ARE the recordings, byte-for-byte, with public copies.
 *
 * Geometry the drills depend on is asserted against the generated district in
 * world/__tests__/rb-mini-district.test.ts (the west-exit battery).
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-rb-exit-signal-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_RB_EXIT_SIGNAL } from "../../lessons/scenario/templates-roundabout";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScRbExitSignalDrive, type ScRbExitSignalTraceName } from "../scRbExitSignal";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScRbExitSignalTraceName[] = [
  "shadow-correct",
  "mistake-exit-no-signal",
  "mistake-barge-entry",
];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("rb-mini-v1");
const drives = new Map<ScRbExitSignalTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScRbExitSignalDrive(district, n)]),
);

describe("sc-rb-exit-signal — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns the priority-yield commendation", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
  });

  it("the staged circulating car resolves 'yielded'", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-rbx-circulating");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("stays SILENT past the first two spokes, then signals RIGHT before the third exit", () => {
    const signalOn = shadow.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn).toBeDefined();
    expect(signalOn!.detail).toBe("right");
    // The lever comes up only AFTER the north mouth (the last approach before
    // this drill's west exit) — the RB-06 timing that is the whole lesson. The
    // sample nearest the signal is on the ring's north-west arc: x < 0 (past
    // φ = 180) and still at ring radius.
    const at = shadow.trace.samples.reduce((best, s) =>
      Math.abs(s.tSec - signalOn!.tSec) < Math.abs(best.tSec - signalOn!.tSec) ? s : best,
    );
    expect(at.x).toBeLessThan(0);
    expect(Math.abs(Math.hypot(at.x, at.y) - 18)).toBeLessThan(2);
    // Nothing is announced before that moment: no indicator sample while the
    // car is still on the east/north-east half of the ring (x > 0).
    for (const s of shadow.trace.samples) {
      if (s.x > 0) expect(s.indicator, `t=${s.tSec}`).toBe("off");
    }
  });

  it("leaves by the THIRD (west) exit and cancels the indicator, with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.x).toBeLessThan(-45); // west arm, well beyond the exit radius
    expect(Math.abs(last.y - 4.06)).toBeLessThan(1.5); // outbound west lane center
    expect(last.indicator).toBe("off"); // cancelled after the exit
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-rb-exit-signal — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Изход без мигач“: exactly TURN_WITHOUT_INDICATOR — the ENTRY stays clean", () => {
    const drive = drives.get("mistake-exit-no-signal")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RB_EXIT_SIGNAL.mistakes[0].codeRefs].sort());
    // ONE turn, one fault: the taught mistake is never double-counted.
    expect(violationCodes(drive).filter((c) => c === "TURN_WITHOUT_INDICATOR")).toHaveLength(1);
    // The demo isolates the exit fault: the entry still earns ring priority and
    // there is no rear-end contamination over the long circulation.
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(codes).not.toContain("COLLISION");
    expect(commendationCodes(drive)).toContain("YIELDED_TO_PRIORITY");
    // …and the lever really never came up.
    expect(drive.trace.events.some((e) => e.kind === "signal-on")).toBe(false);
  });

  it("„Нахлуване в кръга пред циркулираща кола“: exactly FAILED_TO_YIELD (roundabout tracker)", () => {
    const drive = drives.get("mistake-barge-entry")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RB_EXIT_SIGNAL.mistakes[1].codeRefs].sort());
    const failed = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    expect(failed.kind === "violation" ? failed.detail : undefined).toBe("roundabout");
    expect(drive.outcomes.find((o) => o.eventId === "sc-rbx-circulating")?.detail).toBe("violation");
    // The barger signals its intended exit — the ONLY graded fault is priority.
    expect(drive.trace.events.find((e) => e.kind === "signal-on")?.detail).toBe("right");
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-rb-exit-signal");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-rb-exit-signal");

  for (const name of NAMES) {
    it(`sc-rb-exit-signal/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-rb-exit-signal");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    for (const name of NAMES) {
      const again = recordScRbExitSignalDrive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_RB_EXIT_SIGNAL.shadow, ...SC_RB_EXIT_SIGNAL.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-rb-exit-signal/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-rb-exit-signal/${n}.trace.json`);
    expect([SC_RB_EXIT_SIGNAL.shadow.path, ...SC_RB_EXIT_SIGNAL.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
