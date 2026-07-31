/**
 * PARKING-DEPTH trace gates (doc 76 §5/§9) — the ten new „how to park" drills.
 *
 *  1. SHADOW: every one of the ten authored correct drives replays through the
 *     PRODUCTION stack, with the parked-car / van / wall rects armed at
 *     collisionMinKmh 0, and grades ZERO violations — and finishes at rest in
 *     its own bay, on the bay's axis. That second half matters as much as the
 *     first: a clean drive that stops somewhere else teaches nothing.
 *  2. MISTAKE DEMOS: each grades EXACTLY its template's codeRefs, in the gear
 *     the copy says it happens in — the reverse mistakes in reverse, the
 *     nose-in ones forward — so the red ghost and its explanation agree.
 *  3. COMMITTED FILES: content/traces/<drill>/*.trace.json ARE the recordings
 *     of these scripts, byte-for-byte, with public copies.
 *
 * RE-RECORD (after ANY change to the scripts, recorder, districts or rules):
 *
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-park-depth-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scenarioById } from "../../lessons/scenario/templates";
import type { ScenarioSpec } from "../../lessons/scenario/types";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { createTracePoint } from "../types";
import { sampleAt } from "../sample";
import {
  PARK_DEPTH_DRILLS,
  PARK_DEPTH_VAN,
  PARK_DEPTH_WALL,
  parkDepthObstacles,
  recordScParkDepthDrive,
  type ParkDepthDrillId,
} from "../scParkDepth";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";

const DRILL_IDS = Object.keys(PARK_DEPTH_DRILLS) as ParkDepthDrillId[];

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

const districts = new Map<ParkDepthDrillId, unknown>(
  DRILL_IDS.map((id) => [id, loadDistrict(PARK_DEPTH_DRILLS[id].districtId)]),
);

const drives = new Map<string, RecordedDrive>();
for (const drillId of DRILL_IDS) {
  for (const name of Object.keys(PARK_DEPTH_DRILLS[drillId].traces)) {
    drives.set(`${drillId}/${name}`, recordScParkDepthDrive(districts.get(drillId), drillId, name));
  }
}

const drive = (drillId: ParkDepthDrillId, name: string): RecordedDrive =>
  drives.get(`${drillId}/${name}`)!;

function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

function spec(drillId: ParkDepthDrillId): ScenarioSpec {
  const s = scenarioById(drillId);
  if (!s) throw new Error(`no template ${drillId}`);
  return s;
}

/** The template's terminal parkInBay rect (the single graded/painted truth). */
function targetBay(drillId: ParkDepthDrillId) {
  const last = spec(drillId).success[spec(drillId).success.length - 1].params;
  if (last.kind !== "completeManeuver" || last.maneuver !== "parkInBay") {
    throw new Error(`${drillId}: terminal objective is not parkInBay`);
  }
  return last;
}

// ---------------------------------------------------------------------------
// §5 — the shadow gate
// ---------------------------------------------------------------------------

describe("parking-depth shadows — zero violations, and they end IN the bay", () => {
  for (const drillId of DRILL_IDS) {
    it(`${drillId}: replays clean with every obstacle armed at 0 km/h`, () => {
      const codes = violationCodes(drive(drillId, "shadow-correct"));
      expect(codes, codes.join(", ")).toEqual([]);
    });

    it(`${drillId}: comes to rest inside its own graded bay, on the bay axis`, () => {
      const d = drive(drillId, "shadow-correct");
      const last = d.trace.samples[d.trace.samples.length - 1];
      const bay = targetBay(drillId);
      expect(Math.hypot(last.x - bay.bay.x, last.y - bay.bay.y)).toBeLessThan(bay.centerTolM);
      const diff = Math.abs(((last.headingDeg - bay.bay.headingDeg) % 180) + 180) % 180;
      expect(Math.min(diff, 180 - diff)).toBeLessThan(bay.headingTolDeg);
      expect(Math.abs(last.speedKmh)).toBeLessThan(0.5);
      expect(last.brakeOn).toBe(true);
    });

    it(`${drillId}: demonstrates the observation the drill teaches`, () => {
      const kinds = drive(drillId, "shadow-correct").trace.events.map((e) => e.kind);
      expect(kinds).toContain("signal-on");
      expect(kinds.some((k) => k.startsWith("glance-"))).toBe(true);
      const annotations = drive(drillId, "shadow-correct").trace.events.filter(
        (e) => e.kind === "annotation",
      );
      expect(annotations.length).toBeGreaterThanOrEqual(4);
      for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
    });
  }

  it("the reverse drills really use reverse, and the nose-in one never does", () => {
    for (const drillId of DRILL_IDS) {
      const usedReverse = drive(drillId, "shadow-correct").trace.samples.some((s) => s.gear < 0);
      const wantsForward = targetBay(drillId).entry === "forward";
      expect(usedReverse, `${drillId} reverse usage`).toBe(!wantsForward);
    }
  });
});

// ---------------------------------------------------------------------------
// §9 stage 5 — the mistake demos grade their exact codes
// ---------------------------------------------------------------------------

/** Which gear the demonstrated failure happens in, per the template's copy. */
const MISTAKE_GEAR: Record<string, 1 | -1> = {
  "sc-park-gap-short/mistake-shallow-angle": -1,
  "sc-park-gap-short/mistake-forward-hit": 1,
  "sc-park-gap-long/mistake-overrun": 1,
  "sc-park-gap-long/mistake-blind-reverse": -1,
  "sc-park-van/mistake-early-turn": -1,
  "sc-park-van/mistake-blind-reverse": -1,
  "sc-park-45-rev/mistake-nose-in": 1,
  "sc-park-45-rev/mistake-shallow-swing": -1,
  "sc-park-left/mistake-mirrored-habit": -1,
  "sc-park-left/mistake-cross-blind": 1,
  "sc-park-zebra/mistake-hidden-pedestrian": 1,
  "sc-park-wall/mistake-into-wall": 1,
  "sc-park-wall/mistake-clip-neighbour": -1,
  "sc-park-night/mistake-too-deep": -1,
  "sc-park-double/mistake-wide-run-up": 1,
  "sc-park-double/mistake-correct-backwards": -1,
  "sc-park-judge/mistake-try-short": -1,
  "sc-park-judge/mistake-short-forward": 1,
};

describe("parking-depth mistake demos — exactly the authored codes", () => {
  for (const drillId of DRILL_IDS) {
    const names = Object.keys(PARK_DEPTH_DRILLS[drillId].traces).filter((n) =>
      n.startsWith("mistake-"),
    );
    it(`${drillId}: two demos, each grading exactly its template codeRefs`, () => {
      const s = spec(drillId);
      expect(names).toHaveLength(2);
      expect(s.mistakes).toHaveLength(2);
      names.forEach((name, i) => {
        const codes = [...new Set(violationCodes(drive(drillId, name)))].sort();
        expect(codes, `${drillId}/${name}`).toEqual([...s.mistakes[i].codeRefs].sort());
      });
    });

    it(`${drillId}: each failure happens in the gear its explanation names`, () => {
      for (const name of names) {
        const want = MISTAKE_GEAR[`${drillId}/${name}`];
        if (want === undefined) continue; // non-kinematic codes (lights, ban zone)
        const d = drive(drillId, name);
        const at = createTracePoint();
        const gears = d.ruleEvents
          .filter((e) => e.kind === "violation" && e.code === "COLLISION")
          .map((e) => {
            sampleAt(d.trace, e.t, at);
            return at.gear;
          });
        expect(gears, `${drillId}/${name} gears ${gears.join(",")}`).toContain(want);
      }
    });
  }

  it("the wall demo hits the WALL and the van demo the VAN — detail, not luck", () => {
    const wall = drive("sc-park-wall", "mistake-into-wall").ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(wall.kind === "violation" ? wall.detail : undefined).toBe("staticObject");
    const van = drive("sc-park-van", "mistake-early-turn").ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    )!;
    expect(van.kind === "violation" ? van.detail : undefined).toBe("vehicle");
  });

  it("the чл. 98 demo grades the ban, and it grades it AFTER the crossing", () => {
    // Why after and not before: rules/engine.ts exempts a rest inside a ban
    // span while the crossing episode is live (a car stopped short of a zebra
    // can always be yielding). The drill therefore GRADES the slot past the
    // crossing and DEMONSTRATES the one before it through its consequence.
    const d = drive("sc-park-zebra", "mistake-park-after");
    expect([...new Set(violationCodes(d))]).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    const at = createTracePoint();
    const ev = d.ruleEvents.find((e) => e.kind === "violation")!;
    sampleAt(d.trace, ev.t, at);
    expect(at.y).toBeGreaterThan(0); // past the zebra at y = 0
    expect(at.y).toBeLessThan(8); // and still inside the [−8, 8] span
  });

  it("the night demo grades the lamps, and the shadow of the same drill does not", () => {
    expect([...new Set(violationCodes(drive("sc-park-night", "mistake-no-lights")))]).toEqual([
      "HEADLIGHTS_OFF_AT_NIGHT",
    ]);
    expect(violationCodes(drive("sc-park-night", "shadow-correct"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The obstacle sets are the districts' own truth, plus two authored bodies
// ---------------------------------------------------------------------------

describe("obstacles come from the map, never from a second copy of it", () => {
  it("every drill arms one rect per OCCUPIED bay of its own district", () => {
    for (const drillId of DRILL_IDS) {
      const raw = districts.get(drillId) as {
        meta: { scenario: { bays: Array<{ occupied: boolean; x: number; y: number }> } };
      };
      const occupied = raw.meta.scenario.bays.filter((b) => b.occupied);
      const extra = PARK_DEPTH_DRILLS[drillId].extraObstacles?.length ?? 0;
      const rects = parkDepthObstacles(districts.get(drillId), drillId);
      expect(rects.length, drillId).toBe(occupied.length + extra);
      for (const b of occupied) {
        expect(
          rects.some((r) => r.x === b.x && r.y === b.y),
          `${drillId}: no rect at the occupied bay (${b.x}, ${b.y})`,
        ).toBe(true);
      }
    }
  });

  it("the van sits in lot-van-v1's own bay 2, and the wall past the last bay", () => {
    const raw = districts.get("sc-park-van") as {
      meta: { scenario: { bays: Array<{ id: string; x: number; y: number; occupied: boolean }> } };
    };
    const bay2 = raw.meta.scenario.bays.find((b) => b.id === "lotvn-bay-2")!;
    expect(bay2.occupied).toBe(false); // free in DATA so no civilian car is drawn
    expect([PARK_DEPTH_VAN.x, PARK_DEPTH_VAN.y]).toEqual([bay2.x, bay2.y]);
    // Longer and wider than the fleet compacts (0.9 × 2.25) — that IS the drill.
    expect(PARK_DEPTH_VAN.halfWidthM).toBeGreaterThan(0.9);
    expect(PARK_DEPTH_VAN.halfLengthM).toBeGreaterThan(2.25);

    const wallRaw = districts.get("sc-park-wall") as {
      meta: { scenario: { bays: Array<{ id: string; y: number }> } };
    };
    const lastBay = wallRaw.meta.scenario.bays.find((b) => b.id === "lotwl-bay-5")!;
    // Clear of the bay's own rect (half-length 2.5) but close enough to close
    // the row: the whole point is that there is no overshoot room.
    const gap = PARK_DEPTH_WALL.y - PARK_DEPTH_WALL.halfWidthM - (lastBay.y + 2.5);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(2);
  });
});

// ---------------------------------------------------------------------------
// Committed files — the determinism law
// ---------------------------------------------------------------------------

describe("committed trace files", () => {
  for (const drillId of DRILL_IDS) {
    for (const name of Object.keys(PARK_DEPTH_DRILLS[drillId].traces)) {
      // 30 trace JSONs, written and re-read on a 7200 rpm spindle: the 5 s
      // default is an I/O budget, not a code budget (the s2-catalog-integrity
      // precedent, same reason).
      it(`${drillId}/${name}: the committed JSON is exactly this script's recording`, { timeout: 30_000 }, () => {
        const contentDir = path.join(REPO_ROOT, "content", "traces", drillId);
        const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", drillId);
        const contentFile = path.join(contentDir, `${name}.trace.json`);
        const publicFile = path.join(publicDir, `${name}.trace.json`);
        const serialized = serializeScenarioTrace(drive(drillId, name).trace) + "\n";
        if (RECORD) {
          mkdirSync(contentDir, { recursive: true });
          mkdirSync(publicDir, { recursive: true });
          writeFileSync(contentFile, serialized);
          writeFileSync(publicFile, serialized);
        }
        expect(existsSync(contentFile), `${contentFile} missing — run RECORD_TRACES=1`).toBe(true);
        expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
        expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
        const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
        expect(parsed).not.toBeNull();
        expect(parsed!.meta.scenarioId).toBe(drillId);
      });
    }
  }

  it("recording is deterministic: a second run serializes identically", () => {
    for (const drillId of DRILL_IDS) {
      const again = recordScParkDepthDrive(districts.get(drillId), drillId, "shadow-correct");
      expect(serializeScenarioTrace(again.trace), drillId).toBe(
        serializeScenarioTrace(drive(drillId, "shadow-correct").trace),
      );
    }
  });

  it("every template TraceRef points at exactly these files, none pending", () => {
    for (const drillId of DRILL_IDS) {
      const s = spec(drillId);
      const names = Object.keys(PARK_DEPTH_DRILLS[drillId].traces);
      expect(s.shadow.path).toBe(`content/traces/${drillId}/shadow-correct.trace.json`);
      expect(s.shadow.pending).not.toBe(true);
      expect(s.mistakes.map((m) => m.traceRef.path)).toEqual(
        names.filter((n) => n.startsWith("mistake-")).map((n) => `content/traces/${drillId}/${n}.trace.json`),
      );
      for (const m of s.mistakes) expect(m.traceRef.pending, drillId).not.toBe(true);
    }
  });
});
