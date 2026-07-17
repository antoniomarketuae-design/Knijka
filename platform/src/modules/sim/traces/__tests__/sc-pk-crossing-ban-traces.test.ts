/**
 * Trace gate — „Спиране до пешеходна пътека — къде е позволено"
 * (sc-pk-crossing-ban on pk-banx-v1, doc 72 PK-06; ЗДвП чл. 98, ал. 1),
 * doc 76 §5/§9 stages 3+5:
 *   1. SHADOW transits both чл. 98 ban groups without resting and stops at the
 *      LEGAL bay past the zebra → ZERO violations.
 *   2. MISTAKE DEMOS grade EXACTLY ILLEGAL_STOP_IN_BAN_ZONE, ONCE each (the
 *      later legal stop must not double-bill), resting in DIFFERENT authored
 *      spans — before the junction and on the corner past it.
 *   3. COMMITTED FILES under content/traces/sc-pk-crossing-ban/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * The INNOCENT side of the detector on THIS map (queue-lead rest, brief 2 s
 * stop, the legal bay) is locked end-to-end in
 * world/__tests__/pk-banx-districts.test.ts, which also pins the one fault this
 * map cannot yet grade (a rest at the zebra — the crossing-arm armor).
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pk-crossing-ban-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PK_CROSSING_BAN } from "../../lessons/scenario/templates-parking2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPkCrossingBanDrive, type ScPkCrossingBanTraceName } from "../scPkCrossingBan";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-pk-crossing-ban";
const NAMES: ScPkCrossingBanTraceName[] = [
  "shadow-correct",
  "mistake-stop-before-junction",
  "mistake-stop-on-corner",
];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("pk-banx-v1");
const drives = new Map<ScPkCrossingBanTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPkCrossingBanDrive(district, n)]),
);

describe("sc-pk-crossing-ban — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("passes the junction and the zebra without resting, stops legally after: ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("rests at the legal bay (~y = 300), past the zebra at 260, with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.y - 300)).toBeLessThan(3);
    expect(last.y).toBeGreaterThan(262.5); // OUTSIDE the чл. 98 т. 1 zebra span
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("never comes to rest inside ANY чл. 98 span (the shadow earns its zero the honest way)", () => {
    // Ban spans in district y: [136.87, 150] ∪ [150, 163.13] ∪ [255, 262.5].
    const inBan = (y: number) => (y >= 136.87 && y <= 163.13) || (y >= 255 && y <= 262.5);
    const restingInBan = shadow.trace.samples.filter((s) => Math.abs(s.speedKmh) < 1 && inBan(s.y));
    expect(restingInBan).toHaveLength(0);
  });
});

describe("sc-pk-crossing-ban — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (
    ["mistake-stop-before-junction", "mistake-stop-on-corner"] as const
  ).entries()) {
    it(`${name}: exactly ILLEGAL_STOP_IN_BAN_ZONE, ONCE (the later legal stop never double-bills)`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_PK_CROSSING_BAN.mistakes[i].codeRefs].sort());
      expect(violationCodes(drive).filter((c) => c === "ILLEGAL_STOP_IN_BAN_ZONE")).toHaveLength(1);
      // The near-miss codes a sloppy drive would smuggle in.
      expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
      expect(codes).not.toContain("POOR_LANE_KEEPING");
      expect(codes).not.toContain("FAILED_TO_YIELD");
    });
  }

  it("the two demos rest in DIFFERENT authored spans (before the junction / on the corner)", () => {
    /** The y of the first rest the DRIVE demonstrates — i.e. after the car has
     *  actually moved off (the samples open at rest on the spawn). */
    const restY = (name: ScPkCrossingBanTraceName) => {
      let movedOff = false;
      for (const s of drives.get(name)!.trace.samples) {
        if (Math.abs(s.speedKmh) > 5) movedOff = true;
        else if (movedOff && Math.abs(s.speedKmh) < 1) return s.y;
      }
      throw new Error(`${name}: the drive never comes to rest after moving off`);
    };
    const before = restY("mistake-stop-before-junction");
    const corner = restY("mistake-stop-on-corner");
    expect(before).toBeGreaterThanOrEqual(136.87);
    expect(before).toBeLessThan(150); // pkx-z-jx-before
    expect(corner).toBeGreaterThan(150);
    expect(corner).toBeLessThanOrEqual(163.13); // pkx-z-jx-after
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
    const again = recordScPkCrossingBanDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PK_CROSSING_BAN.shadow, ...SC_PK_CROSSING_BAN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_PK_CROSSING_BAN.shadow.path,
      ...SC_PK_CROSSING_BAN.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("pk-banx-v1 meta.scenario mirrors the template recipe (lane center + law-implied bans)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          params?: { junctionY?: number; zebraY?: number; legalBayY?: number; banBasis?: string };
        };
      };
      zones?: Array<{ id: string; kind: string; fromM: number; toM: number }>;
    };
    const p = SC_PK_CROSSING_BAN.map.params as {
      junctionY: number;
      zebraY: number;
      legalBayY: number;
      banBasis: string;
    };
    expect(d.meta.zonesVersion).toBe(1);
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(d.meta.scenario?.params?.junctionY).toBe(p.junctionY);
    expect(d.meta.scenario?.params?.zebraY).toBe(p.zebraY);
    expect(d.meta.scenario?.params?.legalBayY).toBe(p.legalBayY);
    // The template's whole claim: these bans come from the LAW, not a plate.
    expect(d.meta.scenario?.params?.banBasis).toBe("law");
    expect(p.banBasis).toBe("law");
    expect(d.zones?.map((z) => z.id)).toEqual([
      "pkx-z-jx-before",
      "pkx-z-jx-after",
      "pkx-z-zebra",
    ]);
    for (const z of d.zones ?? []) expect(z.kind).toBe("noStopping");
  });
});
