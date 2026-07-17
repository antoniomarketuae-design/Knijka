/**
 * Wave-3 trace gate — „Стоповете два автомобила напред" (sc-fo-brakelight-chain
 * on fo-brake-v1, doc 72 FO-05 + FO-01), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns CLEAN_DRIVING — it reads the HEAD car's brake lights over the
 *      middle car, lifts early, and rolls to rest ~30 m short of the stopped
 *      chain (staged outcome "stoppedInTime"), then resumes with the queue.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs with NO extras.
 *   3. THE HONESTY PROBE proves the negative the demo pair rests on: a panic
 *      slam behind the chain grades NOTHING, because a lead inside 45 m IS a
 *      forward cause in the harsh-brake ledger (the sc-follow-cutin precedent).
 *   4. COMMITTED FILES under content/traces/sc-fo-brakelight-chain/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-fo-brakelight-chain-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_FO_BRAKELIGHT_CHAIN } from "../../lessons/scenario/templates-following2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScFoBrakelightChainDrive,
  recordScFoBrakelightChainPanicSlamProbe,
  type ScFoBrakelightChainTraceName,
} from "../scFoBrakelightChain";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-fo-brakelight-chain";
const NAMES: ScFoBrakelightChainTraceName[] = [
  "shadow-correct",
  "mistake-bumper-stare",
  "mistake-late-brake",
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

const district = loadDistrict("fo-brake-v1");
const drives = new Map<ScFoBrakelightChainTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScFoBrakelightChainDrive(district, n)]),
);

describe("sc-fo-brakelight-chain — the district contract (the pinned geometry is real)", () => {
  const doc = district as {
    meta: { scenario: { params: { lengthM: number; maxspeedKmh: number }; laneCenterRightM: number } };
    spawnPoints: { id: string; x: number; y: number; heading: number }[];
  };

  it("fo-brake-v1 carries the lane, limit and spawn the template pins by value", () => {
    expect(doc.meta.scenario.laneCenterRightM).toBe(4.06); // LANE_X in the template + trace script
    expect(doc.meta.scenario.params).toEqual(SC_FO_BRAKELIGHT_CHAIN.map.params);
    const spawn = doc.spawnPoints.find((s) => s.id === SC_FO_BRAKELIGHT_CHAIN.start.spawnPointId);
    expect(spawn, "template start.spawnPointId must exist in the district").toBeDefined();
    expect(spawn!.x).toBe(4.06);
    expect(spawn!.heading).toBe(0); // north — the whole drill runs on +y
  });

  it("both chain cars are staged in the PLAYER'S OWN lane, head beyond middle", () => {
    const mid = SC_FO_BRAKELIGHT_CHAIN.staged!.find((s) => s.id === "sc-fbc-mid")!;
    const head = SC_FO_BRAKELIGHT_CHAIN.staged!.find((s) => s.id === "sc-fbc-head")!;
    expect(mid.kind).toBe("cutInLeadCar");
    expect(head.kind).toBe("brakingLeadCar");
    // The chain reading only exists if the head paces BEYOND the middle car —
    // otherwise the "two cars ahead" sight line is a fiction.
    const midAhead = (mid as { paceAheadM: number }).paceAheadM;
    const headAhead = (head as { followGapM: number }).followGapM;
    expect(headAhead).toBeGreaterThan(midAhead + 20);
    // cutShiftM 0 = the middle car never leaves the lane (the "cut" is a pure
    // speed event — the chain stays a chain).
    expect((mid as { cutShiftM: number }).cutShiftM).toBe(0);
    // The slam fires ahead of the middle car's own reaction point — the whole
    // lesson is that the warning arrives one car early.
    expect((head as { slamAt: { y: number } }).slamAt.y).toBeGreaterThan(
      (mid as { cutAt: { y: number } }).cutAt.y,
    );
  });
});

describe("sc-fo-brakelight-chain — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("reads the HEAD's lights, stops short of the chain, then finishes the street", () => {
    const stop = shadow.outcomes.find((o) => o.eventId === "sc-fbc-head");
    expect(stop?.detail).toBe("stoppedInTime");
    expect(stop?.success).toBe(true);
    // The reward for reading the chain early: metres to spare, not centimetres.
    expect(stop?.stopGapM ?? 0).toBeGreaterThan(20);
    // The middle car's own panic NEVER fires for the shadow — it lifted below
    // the 33 km/h gate, so the cut-in runner never resolves at all.
    expect(shadow.outcomes.find((o) => o.eventId === "sc-fbc-mid")).toBeUndefined();
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(370); // resumed with the queue and reached the finish zone
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-fo-brakelight-chain — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Гледане само в бронята отпред“: exactly FOLLOWING_TOO_CLOSE", () => {
    const drive = drives.get("mistake-bumper-stare")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FO_BRAKELIGHT_CHAIN.mistakes[0].codeRefs].sort());
    // The SAME pinned metres as the shadow — only the speed is guilty.
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("COLLISION");
  });

  it("„Късно пълно спиране до сблъсък“: exactly COLLISION, no following extras", () => {
    const drive = drives.get("mistake-late-brake")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FO_BRAKELIGHT_CHAIN.mistakes[1].codeRefs].sort());
    // The approach gap is INNOCENT at 38 km/h — the fault is the eyes, not the
    // gap, so the demo must not smuggle in a following code as well.
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    // The contact is with the MIDDLE car (the head is never reachable past it).
    expect(drive.outcomes.find((o) => o.eventId === "sc-fbc-mid")?.detail).toBe("collision");
  });
});

describe("sc-fo-brakelight-chain — the honesty probe (why HARSH_BRAKING_NO_CAUSE is not a demo)", () => {
  it("a panic slam behind the chain grades NOTHING — the lead IS a forward cause", () => {
    const probe = recordScFoBrakelightChainPanicSlamProbe(district);
    // rules/engine.ts noBrakeCause: leadGapM <= harshBrakeClearLeadGapM (45 m)
    // positively rules the phantom out. Braking behind a car that is right
    // there is a RESPONSE, never a causeless slam — so no shipped code grades
    // this flavor and the committed pair is a gap demo + a contact demo.
    expect(violationCodes(probe)).toEqual([]);
    expect(
      SC_FO_BRAKELIGHT_CHAIN.mistakes.flatMap((m) => [...m.codeRefs]),
    ).not.toContain("HARSH_BRAKING_NO_CAUSE");
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
    const again = recordScFoBrakelightChainDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_FO_BRAKELIGHT_CHAIN.shadow, ...SC_FO_BRAKELIGHT_CHAIN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_FO_BRAKELIGHT_CHAIN.shadow.path,
      ...SC_FO_BRAKELIGHT_CHAIN.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
