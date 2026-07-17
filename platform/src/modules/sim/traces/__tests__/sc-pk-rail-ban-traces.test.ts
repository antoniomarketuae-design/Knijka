/**
 * Trace gate — „Никакъв престой около жп прелез" (sc-pk-rail-ban on pk-rail-v1,
 * doc 72 PK-06 + RX-03; ЗДвП чл. 98), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW crosses the whole zone without a single rest — no hesitation
 *      before the rails, one unbroken motion over the band, no relief stop after
 *      — and rests at the LEGAL bay 74 m past everything → ZERO violations.
 *   2. MISTAKE DEMOS grade their EXACT codes, ONCE each, and they are DIFFERENT
 *      codes 28 m apart: ILLEGAL_STOP_IN_BAN_ZONE in the чл. 98 approach span,
 *      RAIL_CROSSING_VIOLATION ("stopped-on-track") on the band no span reaches.
 *      That separation IS the template; the assert below is what defends it.
 *   3. COMMITTED FILES under content/traces/sc-pk-rail-ban/ ARE the recordings,
 *      byte-for-byte, with identical public copies.
 *
 * The INNOCENT side of both detectors on THIS map — the queue-lead asymmetry
 * (a lead acquits the ban rest and never the rails rest), the brief sub-sustain
 * stop, the legal bay, the barrier's real schedule — is locked end-to-end
 * through the reducer in world/__tests__/pk-rail-districts.test.ts.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pk-rail-ban-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_PK_RAIL_BAN } from "../../lessons/scenario/templates-parking2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPkRailBanDrive, type ScPkRailBanTraceName } from "../scPkRailBan";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-pk-rail-ban";
const NAMES: ScPkRailBanTraceName[] = [
  "shadow-correct",
  "mistake-stop-before-crossing",
  "mistake-stop-on-rails",
];

/** The authored spans, in district y (== edge arclength: one edge on x = 0). */
const BAN_BEFORE = { fromY: 150, toY: 200 };
const BAND = { fromY: 200, toY: 206 };
const BAN_AFTER = { fromY: 206, toY: 256 };
const BAY_Y = 330;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

const district = loadDistrict("pk-rail-v1");
const drives = new Map<ScPkRailBanTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPkRailBanDrive(district, n)]),
);

describe("sc-pk-rail-ban — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("crosses the whole zone and stops legally after it: ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("rests at the legal bay (~y = 330), 74 m past every span, with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.y - BAY_Y)).toBeLessThan(3);
    expect(last.y).toBeGreaterThan(BAN_AFTER.toY); // OUTSIDE the чл. 98 zone
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("never comes to rest anywhere in the zone — ban spans OR band (the honest zero)", () => {
    const forbidden = (y: number) => y >= BAN_BEFORE.fromY && y <= BAN_AFTER.toY;
    const restingInZone = shadow.trace.samples.filter(
      (s) => Math.abs(s.speedKmh) < 1 && forbidden(s.y),
    );
    expect(restingInZone).toHaveLength(0);
  });

  it("does not even HESITATE at the rails — the taught approach, not merely a legal one", () => {
    // „Премини на едно движение": чл. 52 asks no stop of a guarded-open crossing,
    // and a car that creeps onto the band shopping for confidence is the car that
    // gets caught on it. Every sample from the ban's start to the far side of the
    // band stays at cruise — the decision was made early, which is the objective.
    const inZone = shadow.trace.samples.filter(
      (s) => s.y >= BAN_BEFORE.fromY && s.y <= BAND.toY,
    );
    expect(inZone.length).toBeGreaterThan(0);
    for (const s of inZone) expect(s.speedKmh).toBeGreaterThan(25);
  });
});

describe("sc-pk-rail-ban — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (
    ["mistake-stop-before-crossing", "mistake-stop-on-rails"] as const
  ).entries()) {
    it(`${name}: exactly its authored code, ONCE (the later legal stop never double-bills)`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_PK_RAIL_BAN.mistakes[i].codeRefs].sort());
      expect(violationCodes(drive)).toHaveLength(1);
      // The near-miss codes a sloppy drive would smuggle in.
      expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
      expect(codes).not.toContain("POOR_LANE_KEEPING");
      expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    });
  }

  it("THE TEMPLATE: the two demos rest 28 m apart and bill DIFFERENT codes", () => {
    /** The y of the first rest the DRIVE demonstrates — i.e. after the car has
     *  actually moved off (the samples open at rest on the spawn). */
    const restY = (name: ScPkRailBanTraceName) => {
      let movedOff = false;
      for (const s of drives.get(name)!.trace.samples) {
        if (Math.abs(s.speedKmh) > 5) movedOff = true;
        else if (movedOff && Math.abs(s.speedKmh) < 1) return s.y;
      }
      throw new Error(`${name}: the drive never comes to rest after moving off`);
    };
    const inBan = restY("mistake-stop-before-crossing");
    const onRails = restY("mistake-stop-on-rails");
    // One rest per detector, each provably inside the right span…
    expect(inBan).toBeGreaterThanOrEqual(BAN_BEFORE.fromY);
    expect(inBan).toBeLessThan(BAND.fromY); // pkr-z-ban-before
    expect(onRails).toBeGreaterThanOrEqual(BAND.fromY);
    expect(onRails).toBeLessThanOrEqual(BAND.toY); // pkr-z-railcrossing
    expect(onRails - inBan).toBeGreaterThan(25);
    // …and the codes really are different, which is the whole point: a single
    // ban span laid over the rails would collapse this pair into one lesson.
    expect(violationCodes(drives.get("mistake-stop-before-crossing")!)).toEqual([
      "ILLEGAL_STOP_IN_BAN_ZONE",
    ]);
    expect(violationCodes(drives.get("mistake-stop-on-rails")!)).toEqual([
      "RAIL_CROSSING_VIOLATION",
    ]);
  });

  it("the rails demo bills the REST arm, not an entry arm — the barrier is up and А34 asks no stop", () => {
    // The rail code has three arms and only one of them may ever fire on this
    // map: "no-stop" is guarded-exempt (чл. 52), "entered-barred" is impossible
    // inside the authored open window. If either ever appeared here, the map's
    // barrier timetable or its guarded flag would have drifted.
    const rail = drives
      .get("mistake-stop-on-rails")!
      .ruleEvents.filter((e) => e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION");
    expect(rail).toHaveLength(1);
    expect((rail[0] as { detail?: string }).detail).toBe("stopped-on-track");
  });

  it("the ban demo crosses the rails cleanly — the fault is the rest, never the transit", () => {
    // It stops before the crossing and then drives over it: if the transit cost
    // anything, this demo's card would be teaching two faults at once.
    const codes = violationCodes(drives.get("mistake-stop-before-crossing")!);
    expect(codes).not.toContain("RAIL_CROSSING_VIOLATION");
  });

  it("both demos recover to the LEGAL bay — the fault is the rest, not the route", () => {
    for (const name of ["mistake-stop-before-crossing", "mistake-stop-on-rails"] as const) {
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
    const again = recordScPkRailBanDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("every drive finishes inside the authored barrier window — the recordings' precondition", () => {
    // The map's drillWindowSec (180 s) is a promise this file has to keep: the
    // barrier falls at t = 480 and a drive that ran that long would meet a train
    // the scripts never planned for. Cheap to check, and it fails loudly the day
    // someone lengthens a pause.
    for (const name of NAMES) {
      expect(drives.get(name)!.trace.meta.durationSec, name).toBeLessThan(180);
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PK_RAIL_BAN.shadow, ...SC_PK_RAIL_BAN.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_PK_RAIL_BAN.shadow.path,
      ...SC_PK_RAIL_BAN.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("pk-rail-v1 meta.scenario mirrors the template recipe (lane center, band, spans, bay)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          legalBayY?: number;
          railCrossing?: { fromM: number; toM: number; guarded: boolean; stopLineY: number };
          params?: {
            bandFromM?: number;
            bandToM?: number;
            banReachM?: number;
            legalBayY?: number;
            banBasis?: string;
            guarded?: string;
          };
        };
      };
      zones?: Array<{ id: string; kind: string; fromM: number; toM: number }>;
      intersections?: unknown[];
      crossings?: unknown[];
    };
    const p = SC_PK_RAIL_BAN.map.params as {
      bandFromM: number;
      bandToM: number;
      banReachM: number;
      legalBayY: number;
      banBasis: string;
      guarded: string;
    };
    expect(d.meta.zonesVersion).toBe(1);
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(d.meta.scenario?.params?.bandFromM).toBe(p.bandFromM);
    expect(d.meta.scenario?.params?.bandToM).toBe(p.bandToM);
    expect(d.meta.scenario?.params?.banReachM).toBe(p.banReachM);
    expect(d.meta.scenario?.params?.legalBayY).toBe(p.legalBayY);
    // The template's two structural claims: the ban comes from the LAW (no
    // plate), and the crossing is GUARDED — an А35 here would order a чл. 52
    // full stop inside the ban span the drill grades.
    expect(d.meta.scenario?.params?.banBasis).toBe("law");
    expect(p.banBasis).toBe("law");
    expect(d.meta.scenario?.params?.guarded).toBe("guarded");
    expect(d.meta.scenario?.railCrossing?.guarded).toBe(true);
    // The geography split, as committed data: ban / band / ban, abutting.
    expect(d.zones?.map((z) => z.id)).toEqual([
      "pkr-z-ban-before",
      "pkr-z-railcrossing",
      "pkr-z-ban-after",
    ]);
    expect(d.zones?.map((z) => z.kind)).toEqual(["noStopping", "railCrossing", "noStopping"]);
    // Why both ban spans convict here (the pk-busstop-v1 clean room, inherited):
    // this map has nothing that can arm the detector's armor.
    expect(d.intersections).toHaveLength(0);
    expect(d.crossings).toHaveLength(0);
  });
});
