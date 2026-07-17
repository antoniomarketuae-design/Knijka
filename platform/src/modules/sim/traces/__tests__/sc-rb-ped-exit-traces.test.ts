/**
 * Trace gate — „Пешеходец на изхода от кръговото“ (sc-rb-ped-exit on the NEW
 * rb-ped-v1 district), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns BOTH commendations — YIELDED_TO_PRIORITY (waited the circulator
 *      past the mouth, brisk flat-chord entry wins ring priority) and
 *      PEDESTRIAN_YIELDED (stopped in the pocket between ring and zebra and
 *      waited the crosser off the carriageway). The drill has two halves and
 *      the shadow has to prove both.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs — the signalled exit
 *      driven over the occupied zebra grades only PEDESTRIAN_NOT_YIELDED (its
 *      entry stays clean and still earns the priority commendation), and the
 *      approach-arm phantom brake grades only HARSH_BRAKING_NO_CAUSE.
 *   3. COMMITTED FILES ARE the recordings, byte-for-byte, with public copies.
 *
 * Geometry the drills depend on — the ring, the exit zebra and above all the
 * 7.94 m STOP POCKET — is asserted against the generated district in
 * world/__tests__/rb-ped-district.test.ts.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-rb-ped-exit-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_RB_PED_EXIT } from "../../lessons/scenario/templates-roundabout2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScRbPedExitDrive, type ScRbPedExitTraceName } from "../scRbPedExit";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const NAMES: ScRbPedExitTraceName[] = [
  "shadow-correct",
  "mistake-exit-through-ped",
  "mistake-panic-brake",
];

/** rb-ped-v1 by value (meta.scenario.pocket + the crossing). */
const RING_OUTER_EDGE_M = 22.06;
const Y_CROSSING = 30;
const X_LANE = 4.06;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("rb-ped-v1");
const drives = new Map<ScRbPedExitTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScRbPedExitDrive(district, n)]),
);

describe("sc-rb-ped-exit — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns BOTH commendations — the drill's two halves", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("YIELDED_TO_PRIORITY");
    expect(commendationCodes(shadow)).toContain("PEDESTRIAN_YIELDED");
  });

  it("the staged circulating car resolves 'yielded'", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-rbp-circulating");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    expect(outcome!.detail).toBe("yielded");
  });

  it("the staged crosser resolves 'yielded' — the car actually waited for her", () => {
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-rbp-crosser");
    expect(outcome).toBeDefined();
    expect(outcome!.success).toBe(true);
    // "yielded", not "clear": the runner only stamps this when the player was
    // at/below 12 km/h while she was ON the carriageway.
    expect(outcome!.detail).toBe("yielded");
  });

  it("STOPS IN THE POCKET — between the ring band and the zebra", () => {
    // The whole template in one assertion. The wait that matters is the one
    // BEFORE the zebra is passed; scope to that rather than to the drive's
    // final rest at the finish reference.
    const tPass = shadow.trace.samples.find((s) => s.y >= Y_CROSSING)!.tSec;
    const pocketRest = shadow.trace.samples.filter(
      (s) => s.speedKmh < 1 && s.y > 0 && s.tSec < tPass,
    );
    expect(pocketRest.length, "the shadow must come to rest on the exit spoke").toBeGreaterThan(10);
    for (const s of pocketRest) {
      // Clear of the circulatory carriageway — the ring stays open behind it…
      expect(Math.hypot(s.x, s.y), `t=${s.tSec}`).toBeGreaterThan(RING_OUTER_EDGE_M);
      // …and short of the zebra — it yielded rather than crept onto it.
      expect(s.y, `t=${s.tSec}`).toBeLessThan(Y_CROSSING);
      // Straight in the outbound lane, not diagonally across the pocket.
      expect(Math.abs(s.x - X_LANE), `t=${s.tSec}`).toBeLessThan(1.5);
    }
  });

  it("NEVER stands still inside the ring — the pocket exists so the ring stays open", () => {
    // The other half of the pocket's reason to exist, asserted over the WHOLE
    // drive: not one standstill sample anywhere inside the circulatory
    // carriageway (the entry yield waits at r ≈ 27.8, outside the band).
    for (const s of shadow.trace.samples) {
      if (s.speedKmh >= 1) continue;
      expect(Math.hypot(s.x, s.y), `t=${s.tSec}`).toBeGreaterThan(RING_OUTER_EDGE_M);
    }
  });

  it("stays SILENT past the first exit, then signals RIGHT before the second", () => {
    const signalOn = shadow.trace.events.find((e) => e.kind === "signal-on");
    expect(signalOn).toBeDefined();
    expect(signalOn!.detail).toBe("right");
    // The lever comes up only AFTER the east mouth (the last approach before
    // this drill's north exit). The sample nearest the signal is on the ring's
    // north-east arc: past φ = 90, so y > 0, still at ring radius.
    const at = shadow.trace.samples.reduce((best, s) =>
      Math.abs(s.tSec - signalOn!.tSec) < Math.abs(best.tSec - signalOn!.tSec) ? s : best,
    );
    expect(at.y).toBeGreaterThan(0);
    expect(Math.abs(Math.hypot(at.x, at.y) - 18)).toBeLessThan(2);
  });

  it("leaves by the SECOND (north) exit past the cleared zebra, indicator cancelled", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(50); // north arm, well beyond the zebra
    expect(Math.abs(last.x - X_LANE)).toBeLessThan(1.5); // outbound north lane center
    expect(last.indicator).toBe("off"); // cancelled after the exit
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-rb-ped-exit — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Изход през пешеходеца“: exactly PEDESTRIAN_NOT_YIELDED — form was perfect, the person was not seen", () => {
    const drive = drives.get("mistake-exit-through-ped")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RB_PED_EXIT.mistakes[0].codeRefs].sort());
    // ONE crossing, one fault: the taught mistake is never double-counted.
    expect(violationCodes(drive).filter((c) => c === "PEDESTRIAN_NOT_YIELDED")).toHaveLength(1);
    // The demo isolates the exit fault: the entry still earns ring priority,
    // the exit IS signalled, and she is never actually struck.
    expect(codes).not.toContain("COLLISION");
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    expect(commendationCodes(drive)).toContain("YIELDED_TO_PRIORITY");
    expect(drive.trace.events.find((e) => e.kind === "signal-on")?.detail).toBe("right");
    expect(drive.outcomes.find((o) => o.eventId === "sc-rbp-crosser")?.detail).toBe("violation");
  });

  it("„Заковаване на спирачката заради пътеката“: exactly HARSH_BRAKING_NO_CAUSE, on the approach arm", () => {
    const drive = drives.get("mistake-panic-brake")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_RB_PED_EXIT.mistakes[1].codeRefs].sort());
    expect(violationCodes(drive).filter((c) => c === "HARSH_BRAKING_NO_CAUSE")).toHaveLength(1);
    // The honest-scope claim, asserted rather than asserted-in-prose: the fault
    // lands on the SOUTH APPROACH, well clear of the ring — because the ring's
    // junction-proximity armor makes it unfirable there (proven in
    // world/__tests__/rb-ped-district.test.ts).
    // RuleEvent stamps `t`; trace samples stamp `tSec`. (Reaching for `tSec`
    // here type-errors but does NOT fail: every comparison goes NaN, reduce
    // keeps sample[0] — the spawn — which satisfies both assertions below by
    // accident. The nearest-sample lookup has to be on `t`.)
    const brake = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE")!;
    const at = drive.trace.samples.reduce((best, s) =>
      Math.abs(s.tSec - brake.t) < Math.abs(best.tSec - brake.t) ? s : best,
    );
    // Pinned to the STAB WINDOW (the script brakes y = −68 → −60), not merely
    // "somewhere south": a loose bound here is satisfied by the spawn at −93,
    // which is what a broken nearest-sample lookup returns.
    expect(at.y).toBeGreaterThan(-70);
    expect(at.y).toBeLessThan(-58);
    // …and that window is > 35 m from the south node (0, −18) — the whole
    // reason the fault is provable here and nowhere on the ring.
    expect(Math.abs(at.y - -18)).toBeGreaterThan(35);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", "sc-rb-ped-exit");
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", "sc-rb-ped-exit");

  for (const name of NAMES) {
    it(`sc-rb-ped-exit/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
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
      expect(parsed!.meta.scenarioId).toBe("sc-rb-ped-exit");
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    for (const name of NAMES) {
      const again = recordScRbPedExitDrive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_RB_PED_EXIT.shadow, ...SC_RB_PED_EXIT.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith("content/traces/sc-rb-ped-exit/")).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/sc-rb-ped-exit/${n}.trace.json`);
    expect([SC_RB_PED_EXIT.shadow.path, ...SC_RB_PED_EXIT.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
