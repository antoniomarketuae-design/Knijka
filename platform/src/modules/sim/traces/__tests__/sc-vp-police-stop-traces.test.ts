/**
 * ADR-006 stage 1c trace gate — „Спиране по полицейски сигнал"
 * (sc-vp-police-stop on ln-v1, doc 72 VP-11), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and RESTS in the curb-side stop
 *      zone at the officer (mirror, right indicator, eased right — the
 *      completion drill's whole graded contract; the policeStop runner's
 *      outcome records "yielded").
 *   2. MISTAKE DEMOS grade EXACTLY their shipped codes — the runner itself
 *      emits NOTHING (A12: no new detector, no new code):
 *      - „Подминаване на сигнала" → NOT_KEEPING_RIGHT (the clean-lane-change-
 *        then-hog evasion; the ignored signal shows as the unreached stop
 *        zone + the "passedWithoutStopping" outcome);
 *      - „Паника в лентата" → HARSH_BRAKING_NO_CAUSE (the doc-72 mistake
 *        verbatim: panic-brake in-lane instead of pulling right).
 *   3. COMMITTED FILES under content/traces/sc-vp-police-stop/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public
 *      copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-vp-police-stop-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_VP_POLICE_STOP } from "../../lessons/scenario/templates-cockpit";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScVpPoliceStopDrive, type ScVpPoliceStopTraceName } from "../scVpPoliceStop";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-vp-police-stop";
const NAMES: ScVpPoliceStopTraceName[] = ["shadow-correct", "mistake-drive-past", "mistake-panic-stop"];

/** The template's halt-zone contract (single truth asserted below). */
const STOP = { x: 13.9, y: 206, radiusM: 3 };

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("ln-v1");
const drives = new Map<ScVpPoliceStopTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScVpPoliceStopDrive(district, n)]),
);

describe("sc-vp-police-stop — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("rests in the curb-side stop zone at the officer, outcome 'yielded', Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.hypot(last.x - STOP.x, last.y - STOP.y)).toBeLessThan(STOP.radiusM);
    expect(last.x).toBeGreaterThan(13); // pulled RIGHT of the lane center (12.19)
    expect(Math.abs(last.speedKmh)).toBeLessThan(1); // fully stopped
    expect(shadow.outcomes).toHaveLength(1);
    expect(shadow.outcomes[0]).toMatchObject({
      eventId: "sc-vpps-officer",
      kind: "policeStop",
      success: true,
      detail: "yielded",
    });
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(3);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-vp-police-stop — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Подминаване на сигнала“: exactly NOT_KEEPING_RIGHT; the signal itself convicts NOTHING", () => {
    const drive = drives.get("mistake-drive-past")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VP_POLICE_STOP.mistakes[0].codeRefs].sort());
    // The evasion lane change is CLEAN — no lane-change code pollutes.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    // The ignored signal is measurement + failed completion, never a code
    // (the A12 law — the policeStop runner emits no events).
    expect(drive.outcomes).toHaveLength(1);
    expect(drive.outcomes[0]).toMatchObject({ success: false, detail: "passedWithoutStopping" });
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(Math.hypot(last.x - STOP.x, last.y - STOP.y)).toBeGreaterThan(STOP.radiusM); // never stopped there
  });

  it("„Паника в лентата“: exactly HARSH_BRAKING_NO_CAUSE, rests mid-lane short of the officer", () => {
    const drive = drives.get("mistake-panic-stop")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_VP_POLICE_STOP.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    // Stopped in the traffic lane, well short of the halt point: the officer
    // never falls behind, so the encounter stays UNRESOLVED (no outcome) and
    // the stop zone stays unreached — the honest completion failure.
    expect(drive.outcomes).toEqual([]);
    const last = drive.trace.samples[drive.trace.samples.length - 1];
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    expect(Math.hypot(last.x - STOP.x, last.y - STOP.y)).toBeGreaterThan(STOP.radiusM);
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
    const again = recordScVpPoliceStopDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_VP_POLICE_STOP.shadow, ...SC_VP_POLICE_STOP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_VP_POLICE_STOP.shadow.path, ...SC_VP_POLICE_STOP.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
