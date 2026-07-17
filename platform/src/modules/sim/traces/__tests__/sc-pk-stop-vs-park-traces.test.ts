/**
 * Trace gate — „В27 срещу В28 — престой и паркиране" (sc-pk-stop-vs-park on
 * pk-ban2-v1, doc 72 PK-06), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW rests 5 s at the curb under В28 (престой — разрешен, чл. 93),
 *      transits the В27 span without stopping and parks at the LEGAL mark past
 *      both plates → ZERO violations. The rest is the point: a shadow that
 *      merely avoided every stop would teach the В27 half and lose the В28 half.
 *   2. MISTAKE DEMOS grade EXACTLY ILLEGAL_STOP_IN_BAN_ZONE, ONCE each (the
 *      later legal park must not double-bill) — the permission carried past the
 *      seam, and the „минутка" mid-span.
 *   3. COMMITTED FILES under content/traces/sc-pk-stop-vs-park/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * THE PAIR THIS GATE EXISTS FOR: the shadow's 5 s rest and demo 2's 5 s rest are
 * the same maneuver, 110 m apart, on the same street, in the same clean room —
 * and one is lawful. Asserted head-on below („the same 5 s rest…"), because a
 * green shadow alone would not prove the template's thesis: it would be equally
 * green if the В28 span graded like В27 and the bot simply never stopped.
 *
 * The INNOCENT side of the detector (queue stop inside the zone, brief 2 s
 * stops, the ungraded В28 long stay) is locked end-to-end on this very map in
 * world/__tests__/pk-ban2-districts.test.ts.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pk-stop-vs-park-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PK_STOP_VS_PARK } from "../../lessons/scenario/templates-parking2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPkStopVsParkDrive, type ScPkStopVsParkTraceName } from "../scPkStopVsPark";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-pk-stop-vs-park";
const NAMES: ScPkStopVsParkTraceName[] = [
  "shadow-correct",
  "mistake-permission-past-seam",
  "mistake-minute-under-v27",
];

/** Authored geometry of pk-ban2-v1 (the district battery pins the map side). */
const SEAM_Y = 170;
const STOP_TO_Y = 290;
const DROPOFF_Y = 120;
const BAY_Y = 330;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("pk-ban2-v1");
const drives = new Map<ScPkStopVsParkTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPkStopVsParkDrive(district, n)]),
);

describe("sc-pk-stop-vs-park — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("drops the passenger under В28, transits В27 and parks after it: ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("really does REST inside the В28 span — the demonstration is the stop, not its absence", () => {
    // Without this, a shadow that simply drove the street at 30 km/h would pass
    // the gate above and teach half the template.
    const inSpan = shadow.trace.samples.filter(
      (s) => s.y > 70 && s.y < SEAM_Y && Math.abs(s.speedKmh) < 1,
    );
    expect(inSpan.length).toBeGreaterThan(0);
    // Around the authored drop-off mark, and long enough to be a real престой
    // (past the 4 s sustain the В27 detector would use on the other half).
    const ys = inSpan.map((s) => s.y);
    expect(Math.min(...ys)).toBeGreaterThan(DROPOFF_Y - 5);
    expect(Math.max(...ys)).toBeLessThan(DROPOFF_Y + 5);
    const span = Math.max(...inSpan.map((s) => s.tSec)) - Math.min(...inSpan.map((s) => s.tSec));
    expect(span).toBeGreaterThan(4);
  });

  it("never rests inside the В27 span — the half where the same stop is основна", () => {
    const restingUnderV27 = shadow.trace.samples.filter(
      (s) => s.y >= SEAM_Y && s.y <= STOP_TO_Y && Math.abs(s.speedKmh) < 1,
    );
    expect(restingUnderV27).toEqual([]);
  });

  it("parks at the legal mark (~y = 330), past the В27 end at 290, with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.y - BAY_Y)).toBeLessThan(3);
    expect(last.y).toBeGreaterThan(STOP_TO_Y); // the park is OUTSIDE every span
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-pk-stop-vs-park — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (["mistake-permission-past-seam", "mistake-minute-under-v27"] as const).entries()) {
    it(`${name}: exactly ILLEGAL_STOP_IN_BAN_ZONE, ONCE (the later legal park never double-bills)`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_PK_STOP_VS_PARK.mistakes[i].codeRefs].sort());
      expect(violationCodes(drive).filter((c) => c === "ILLEGAL_STOP_IN_BAN_ZONE")).toHaveLength(1);
      expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
      expect(codes).not.toContain("POOR_LANE_KEEPING");
      expect(codes).not.toContain("HESITATION_AT_GREEN");
    });
  }

  it("both demos rest INSIDE the В27 span (the fault is the place, not the maneuver)", () => {
    for (const name of ["mistake-permission-past-seam", "mistake-minute-under-v27"] as const) {
      // Every mid-drive rest, excluding the two that are not the demo: the
      // stationary frames at the spawn (y = 15) and the closing park (y = 330).
      const resting = drives
        .get(name)!
        .trace.samples.filter((s) => Math.abs(s.speedKmh) < 1 && s.y > 30 && s.y < BAY_Y - 5);
      expect(resting.length, name).toBeGreaterThan(0);
      for (const s of resting) {
        expect(s.y, `${name} rests at y=${s.y}`).toBeGreaterThan(SEAM_Y);
        expect(s.y, `${name} rests at y=${s.y}`).toBeLessThan(STOP_TO_Y);
      }
    }
  });

  it("THE THESIS: the same 5 s rest is ZERO violations under В28 and основна under В27", () => {
    // The shadow's drop-off (y = 120) and demo 2's „минутка" (y = 230) are the
    // same maneuver for the same duration on the same street. The verdicts
    // differ only because the plate does — which is the entire template, and
    // the reason this file asserts the pair rather than the two drives apart.
    expect(violationCodes(drives.get("shadow-correct")!)).toEqual([]);
    expect(violationCodes(drives.get("mistake-minute-under-v27")!)).toEqual([
      "ILLEGAL_STOP_IN_BAN_ZONE",
    ]);
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
    const again = recordScPkStopVsParkDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });
  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PK_STOP_VS_PARK.shadow, ...SC_PK_STOP_VS_PARK.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_PK_STOP_VS_PARK.shadow.path,
      ...SC_PK_STOP_VS_PARK.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("pk-ban2-v1 meta.scenario mirrors the template recipe (lane center + both spans)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          signSeamY?: number;
          legalBayY?: number;
          banZonesY?: Array<{ signRef?: string; fromY?: number; toY?: number; graded?: boolean }>;
        };
      };
      zones?: Array<{ kind: string; fromM: number; toM: number; signRef: string }>;
    };
    expect(d.meta.zonesVersion).toBe(1);
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(d.meta.scenario?.signSeamY).toBe(SC_PK_STOP_VS_PARK.map.params.parkToM);
    expect(d.meta.scenario?.legalBayY).toBe(SC_PK_STOP_VS_PARK.map.params.legalBayY);
    // The one district in content/world carrying both kinds — the reason this
    // template could not reuse pk-ban-v1.
    expect(d.zones?.map((z) => z.kind)).toEqual(["noParking", "noStopping"]);
    expect(d.zones?.map((z) => z.signRef)).toEqual(["В28", "В27"]);
    expect(d.zones?.[0]?.fromM).toBe(SC_PK_STOP_VS_PARK.map.params.parkFromM);
    expect(d.zones?.[0]?.toM).toBe(SEAM_Y);
    expect(d.zones?.[1]?.fromM).toBe(SEAM_Y);
    expect(d.zones?.[1]?.toM).toBe(SC_PK_STOP_VS_PARK.map.params.stopToM);
    // The В28 span is the ONLY one the engine reads without billing — stated in
    // the map so no future template mistakes it for a graded ban.
    expect(d.meta.scenario?.banZonesY?.map((z) => z.graded)).toEqual([false, true]);
  });
});
