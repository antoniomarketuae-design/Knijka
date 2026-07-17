/**
 * Wave-6 trace gate — „Къде обратният завой е забранен" (sc-mv-uturn-ban on
 * mv-uturn-v1, doc 72 OV-17 / PK-12; ЗДвП чл. 38), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations: it passes the В23/М1 stretch, changes
 *      to the inner lane on the dashed run-in, waits the whole oncoming stream
 *      out at the legal gap, and reverses direction in a SINGLE FORWARD arc (no
 *      reverse gear → movements = 1), at rest inside the turn corridor facing
 *      back.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs and nothing else —
 *      CROSSED_SOLID_LINE for the turn at the tempting spot, FAILED_TO_YIELD +
 *      COLLISION for the turn at the lawful gap in front of the stream. The two
 *      code sets are DISJOINT, which is the whole pedagogy: one demo is about
 *      WHERE, the other about WHEN, and neither may leak into the other.
 *   3. COMMITTED FILES under content/traces/sc-mv-uturn-ban/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-mv-uturn-ban-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_MV_UTURN_BAN } from "../../lessons/scenario/templates-parking2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScMvUturnBanDrive, type ScMvUturnBanTraceName } from "../scMvUturnBan";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-mv-uturn-ban";
const NAMES: ScMvUturnBanTraceName[] = [
  "shadow-correct",
  "mistake-cross-solid",
  "mistake-into-stream",
];

/** Authored geometry of mv-uturn-v1 (meta.scenario — pinned in the battery). */
const BAN_FROM_Y = 40;
const BAN_TO_Y = 220;
const TEMPTING_Y = 130;
const GAP_Y = 280;
const LANE_OUT = 12.19;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function uniqueSorted(d: RecordedDrive): string[] {
  return [...new Set(violationCodes(d))].sort();
}

const district = loadDistrict("mv-uturn-v1");
const drives = new Map<ScMvUturnBanTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScMvUturnBanDrive(district, n)]),
);

describe("sc-mv-uturn-ban — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("PASSES the banned stretch instead of turning in it — the drill's own claim", () => {
    // The load-bearing assertion of this template. Everything else here is
    // vehicle control the shipped OV-17 drill already teaches; the ONE thing
    // sc-mv-uturn-ban adds is that the car goes THROUGH y ∈ [40, 220] on its own
    // side of the осева and turns 150 m later. If a future re-tune let the
    // shadow drift left inside the span, this test fails before the trace does.
    const inBan = shadow.trace.samples.filter((s) => s.y >= BAN_FROM_Y && s.y <= BAN_TO_Y);
    expect(inBan.length).toBeGreaterThan(20);
    for (const s of inBan) {
      expect(s.x, `sample at y=${s.y.toFixed(1)} crossed the осева inside the М1 span`).toBeGreaterThan(0);
    }
    // …and it was travelling NORTH the whole way through — it never turned there.
    for (const s of inBan) expect(Math.abs(s.headingDeg) < 30 || Math.abs(s.headingDeg - 360) < 30).toBe(true);
    // The temptation was passed at cruise, not crawled past in doubt.
    const atTempting = inBan.reduce((best, s) =>
      Math.abs(s.y - TEMPTING_Y) < Math.abs(best.y - TEMPTING_Y) ? s : best,
    );
    expect(atTempting.speedKmh).toBeGreaterThan(35);
    expect(atTempting.x).toBeCloseTo(LANE_OUT, 1);
  });

  it("WAITS the whole stream out at the gap — patience is the graded act, not a detail", () => {
    // The shadow must be at a genuine standstill at the opening for long enough
    // that all three oncoming cars (gap arrivals ≈ 24 / 29 / 34 s) go by. A
    // drive that only let the FIRST car pass is precisely mistake-into-stream.
    const stopped = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 1 && s.y > 260 && s.y < 270 && s.x > 0,
    );
    expect(stopped.length).toBeGreaterThan(0);
    const waitSec = stopped[stopped.length - 1].tSec - stopped[0].tSec;
    expect(waitSec).toBeGreaterThan(10);
    // The stream's own runner agrees the road was clear when it ended, and the
    // wait outlasted its resolution — i.e. the car did not move first.
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-mvu-stream");
    expect(outcome).toBeDefined();
    expect(outcome!.detail).toBe("clear");
    expect(outcome!.success).toBe(true);
    expect(stopped[stopped.length - 1].tSec).toBeGreaterThan(outcome!.tSec);
  });

  it("reverses direction north → south in ONE forward arc, at rest in the corridor", () => {
    const samples = shadow.trace.samples;
    const first = samples[0];
    const last = samples[samples.length - 1];
    expect(Math.abs(first.headingDeg)).toBeLessThan(15); // started heading north
    expect(Math.abs(last.headingDeg - 180)).toBeLessThan(20); // ended facing south
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    // At rest inside the authored turn box (meta.scenario.uturnCorridor:
    // centre y = 280, halfLength 20, halfWidth 15) — the completeManeuver gate.
    expect(Math.abs(last.y - GAP_Y)).toBeLessThan(20);
    expect(Math.abs(last.x)).toBeLessThan(15);
    // A SINGLE-ARC U-turn: never used reverse gear (movements = reversals + 1 = 1).
    expect(samples.every((s) => s.gear >= 0)).toBe(true);
    // It finished on the correct side of the reversed carriageway.
    expect(last.x).toBeLessThan(-8);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("earns the yield commendation — the wait is credited, not merely tolerated", () => {
    // The mirror of mistake-into-stream's conviction, on the same tracker: the
    // JU-10 adjudicator saw a real conflict, saw the driver at rest for it, and
    // graded the resolution positive. If this ever flips to silence, the two
    // drives stop being a matched pair and the drill loses its contrast.
    const commended = shadow.ruleEvents
      .filter((e) => e.kind === "commendation")
      .map((e) => e.code);
    expect(commended).toContain("YIELDED_TO_PRIORITY");
    expect(commended).toContain("SAFE_LANE_CHANGE");
  });
});

describe("sc-mv-uturn-ban — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Обръщане през плътната линия“: exactly CROSSED_SOLID_LINE", () => {
    const drive = drives.get("mistake-cross-solid")!;
    expect(uniqueSorted(drive)).toEqual([...SC_MV_UTURN_BAN.mistakes[0].codeRefs].sort());
    // The demo is convicted for the LINE and nothing else: it indicated, it
    // checked its mirror, it used the inner lane, and there was no one coming.
    // That is the entire lesson — a textbook maneuver in a forbidden place.
    const codes = uniqueSorted(drive);
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(codes).not.toContain("COLLISION");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(
      drive.ruleEvents.some((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE"),
    ).toBe(true);
  });

  it("„Обръщане през плътната линия“: the crossing happens INSIDE the М1 span", () => {
    // Where the code lands matters as much as which code: the same arc 150 m on
    // is the shadow's lawful turn. Pin the excursion to the authored span so a
    // future map edit that moved the marking cannot quietly acquit this demo.
    const drive = drives.get("mistake-cross-solid")!;
    const hit = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "CROSSED_SOLID_LINE")!;
    const at = drive.trace.samples.reduce((best, s) =>
      Math.abs(s.tSec - hit.t) < Math.abs(best.tSec - hit.t) ? s : best,
    );
    expect(at.y).toBeGreaterThan(BAN_FROM_Y);
    expect(at.y).toBeLessThan(BAN_TO_Y);
    expect(Math.abs(at.y - TEMPTING_Y)).toBeLessThan(25);
    expect(at.x).toBeLessThan(0); // fully across the осева when it billed
  });

  it("„Обратен завой пред насрещния поток“: exactly FAILED_TO_YIELD + COLLISION", () => {
    const drive = drives.get("mistake-into-stream")!;
    expect(uniqueSorted(drive)).toEqual([...SC_MV_UTURN_BAN.mistakes[1].codeRefs].sort());
    const codes = uniqueSorted(drive);
    // The place was LAWFUL — this driver must never be told he turned somewhere
    // banned, or the pair collapses into one card and чл. 38's second half is
    // never taught.
    expect(codes).not.toContain("CROSSED_SOLID_LINE");
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
    // …and the corridor tracker's чл. 42 code must stay away: the junction area
    // disarms it by construction (worldRuntime ocArmed's nearestIx gate), which
    // is exactly why the gap is authored as a cross street.
    expect(codes).not.toContain("OVERTAKE_INSUFFICIENT_GAP");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
  });

  it("„Обратен завой пред насрещния поток“: the yield code is REAL, measured at the turn commit", () => {
    // The conviction rides the runtime's own JU-10 tracker: a turnStarted:left
    // inside the junction area, adjudicated against the measured arrival gap of
    // the staged stream. The COLLISION is the authored consequence
    // (OncomingStreamSpec stages playerGuard by contract, so the stream brakes
    // rather than land the hit) — so the ORDER is the proof: the law was broken
    // a second and a half before anything touched.
    const drive = drives.get("mistake-into-stream")!;
    const yielded = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")!;
    const crash = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION")!;
    expect(yielded.t).toBeLessThan(crash.t);
    const at = drive.trace.samples.reduce((best, s) =>
      Math.abs(s.tSec - yielded.t) < Math.abs(best.tSec - yielded.t) ? s : best,
    );
    // It happened at the LEGAL gap, inside the junction area…
    expect(Math.abs(at.y - GAP_Y)).toBeLessThan(20);
    // …and while MOVING: the JU-10 tracker only records a convict-tight gap
    // above RHR_YIELD_KMH (8), which is why this demo launches and the shadow
    // creeps. Under that floor the identical drive would be commended.
    expect(at.speedKmh).toBeGreaterThan(8);
  });

  it("the two demos fail DIFFERENTLY — disjoint codes, one law, two halves", () => {
    const where = uniqueSorted(drives.get("mistake-cross-solid")!);
    const when = uniqueSorted(drives.get("mistake-into-stream")!);
    expect(where.some((c) => when.includes(c))).toBe(false);
    // …and the shadow shares neither.
    expect(uniqueSorted(drives.get("shadow-correct")!)).toEqual([]);
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
    const again = recordScMvUturnBanDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_MV_UTURN_BAN.shadow, ...SC_MV_UTURN_BAN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_MV_UTURN_BAN.shadow.path, ...SC_MV_UTURN_BAN.mistakes.map((m) => m.traceRef.path)]).toEqual(
      expected,
    );
  });
});
