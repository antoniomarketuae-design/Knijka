/**
 * Trace gate — „Спирка не е паркинг" (sc-pk-busstop-ban on pk-busstop-v1,
 * doc 72 PK-06; ЗДвП чл. 98, ал. 1), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW transits the WHOLE stop zone without resting and stops at the
 *      LEGAL bay 40 m past it → ZERO violations.
 *   2. MISTAKE DEMOS grade EXACTLY ILLEGAL_STOP_IN_BAN_ZONE, ONCE each (the
 *      later legal stop must not double-bill), resting in DIFFERENT authored
 *      spans — in the pocket and on the зигзаг approach before it.
 *   3. COMMITTED FILES under content/traces/sc-pk-busstop-ban/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * The INNOCENT side of the detector on THIS map (queue-lead rest — which is
 * exactly why no bus is staged in the pocket — the brief 2 s stop, the legal
 * bay) is locked end-to-end in world/__tests__/pk-busstop-districts.test.ts.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pk-busstop-ban-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PK_BUSSTOP_BAN } from "../../lessons/scenario/templates-parking2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPkBusstopBanDrive, type ScPkBusstopBanTraceName } from "../scPkBusstopBan";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-pk-busstop-ban";
const NAMES: ScPkBusstopBanTraceName[] = [
  "shadow-correct",
  "mistake-stop-on-pocket",
  "mistake-stop-on-marking",
];

/** The authored spans, in district y (== edge arclength: one edge on x = 0). */
const MARKING = { fromY: 150, toY: 180 };
const POCKET = { fromY: 180, toY: 210 };
const BAY_Y = 250;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("pk-busstop-v1");
const drives = new Map<ScPkBusstopBanTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPkBusstopBanDrive(district, n)]),
);

describe("sc-pk-busstop-ban — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("passes the whole stop zone without resting, stops legally after: ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("rests at the legal bay (~y = 250), 40 m past the zone, with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.y - BAY_Y)).toBeLessThan(3);
    expect(last.y).toBeGreaterThan(POCKET.toY); // OUTSIDE the чл. 98 stop zone
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("never comes to rest inside the чл. 98 stop zone (the shadow earns its zero the honest way)", () => {
    const inBan = (y: number) => y >= MARKING.fromY && y <= POCKET.toY;
    const restingInBan = shadow.trace.samples.filter((s) => Math.abs(s.speedKmh) < 1 && inBan(s.y));
    expect(restingInBan).toHaveLength(0);
  });

  it("does not even SLOW into the pocket — the taught approach, not just a legal one", () => {
    // „Подмини спирката, без да намаляваш към джоба": the objective is a
    // decision made early, so the shadow must not creep through the bay
    // shopping for a gap. Every sample inside the zone stays at cruise.
    const inZone = shadow.trace.samples.filter(
      (s) => s.y >= MARKING.fromY && s.y <= POCKET.toY,
    );
    expect(inZone.length).toBeGreaterThan(0);
    for (const s of inZone) expect(s.speedKmh).toBeGreaterThan(25);
  });
});

describe("sc-pk-busstop-ban — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (
    ["mistake-stop-on-pocket", "mistake-stop-on-marking"] as const
  ).entries()) {
    it(`${name}: exactly ILLEGAL_STOP_IN_BAN_ZONE, ONCE (the later legal stop never double-bills)`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_PK_BUSSTOP_BAN.mistakes[i].codeRefs].sort());
      expect(violationCodes(drive).filter((c) => c === "ILLEGAL_STOP_IN_BAN_ZONE")).toHaveLength(1);
      // The near-miss codes a sloppy drive would smuggle in.
      expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
      expect(codes).not.toContain("POOR_LANE_KEEPING");
      expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    });
  }

  it("the two demos rest in DIFFERENT authored spans (in the pocket / on the зигзаг)", () => {
    /** The y of the first rest the DRIVE demonstrates — i.e. after the car has
     *  actually moved off (the samples open at rest on the spawn). */
    const restY = (name: ScPkBusstopBanTraceName) => {
      let movedOff = false;
      for (const s of drives.get(name)!.trace.samples) {
        if (Math.abs(s.speedKmh) > 5) movedOff = true;
        else if (movedOff && Math.abs(s.speedKmh) < 1) return s.y;
      }
      throw new Error(`${name}: the drive never comes to rest after moving off`);
    };
    const pocket = restY("mistake-stop-on-pocket");
    const marking = restY("mistake-stop-on-marking");
    expect(pocket).toBeGreaterThanOrEqual(POCKET.fromY);
    expect(pocket).toBeLessThan(POCKET.toY); // pkbs-z-stop-pocket
    expect(marking).toBeGreaterThanOrEqual(MARKING.fromY);
    expect(marking).toBeLessThan(MARKING.toY); // pkbs-z-stop-marking
  });

  it("both demos recover to the LEGAL bay — the fault is the rest, not the route", () => {
    for (const name of ["mistake-stop-on-pocket", "mistake-stop-on-marking"] as const) {
      const last = drives.get(name)!.trace.samples.at(-1)!;
      expect(Math.abs(last.y - BAY_Y), name).toBeLessThan(3);
    }
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
    const again = recordScPkBusstopBanDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PK_BUSSTOP_BAN.shadow, ...SC_PK_BUSSTOP_BAN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_PK_BUSSTOP_BAN.shadow.path,
      ...SC_PK_BUSSTOP_BAN.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("pk-busstop-v1 meta.scenario mirrors the template recipe (lane center + the stop zone)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          legalBayY?: number;
          busStopPocketY?: { fromY: number; toY: number };
          params?: {
            markingFromM?: number;
            pocketFromM?: number;
            pocketToM?: number;
            legalBayY?: number;
            banBasis?: string;
          };
        };
      };
      zones?: Array<{ id: string; kind: string; fromM: number; toM: number }>;
      intersections?: unknown[];
      crossings?: unknown[];
    };
    const p = SC_PK_BUSSTOP_BAN.map.params as {
      markingFromM: number;
      pocketFromM: number;
      pocketToM: number;
      legalBayY: number;
      banBasis: string;
    };
    expect(d.meta.zonesVersion).toBe(1);
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(d.meta.scenario?.params?.markingFromM).toBe(p.markingFromM);
    expect(d.meta.scenario?.params?.pocketFromM).toBe(p.pocketFromM);
    expect(d.meta.scenario?.params?.pocketToM).toBe(p.pocketToM);
    expect(d.meta.scenario?.params?.legalBayY).toBe(p.legalBayY);
    // The template's whole claim: this ban comes from the LAW + the зигзаг.
    expect(d.meta.scenario?.params?.banBasis).toBe("law");
    expect(p.banBasis).toBe("law");
    expect(d.zones?.map((z) => z.id)).toEqual(["pkbs-z-stop-marking", "pkbs-z-stop-pocket"]);
    for (const z of d.zones ?? []) expect(z.kind).toBe("noStopping");
    // Why BOTH spans convict here and the pk-banx zebra span does not: this map
    // has nothing that can arm the detector's armor.
    expect(d.intersections).toHaveLength(0);
    expect(d.crossings).toHaveLength(0);
  });
});
