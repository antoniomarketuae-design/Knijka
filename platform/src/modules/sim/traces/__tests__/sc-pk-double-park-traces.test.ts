/**
 * Trace gate — „Двойното паркиране блокира улицата" (sc-pk-double-park on
 * pk-double-v1, doc 72 PK-06; ЗДвП чл. 98, ал. 1), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW transits the WHOLE parked row without resting beside it and parks
 *      AT THE CURB in the free bay 80 m past it → ZERO violations (with the
 *      27-car row armed as precise colliders).
 *   2. MISTAKE DEMOS grade EXACTLY their authored codes, resting at DIFFERENT
 *      marks inside the one чл. 98 span — and the squeeze demo bills its fault
 *      BEFORE its consequence, with the oncoming stream still live.
 *   3. COMMITTED FILES under content/traces/sc-pk-double-park/ ARE the
 *      recordings, byte-for-byte, with identical public copies.
 *
 * The INNOCENT side of the detector on THIS map (a REAL queue lead still
 * acquits; the row and the stream cannot; the brief stop; the free bay) is
 * locked end-to-end in world/__tests__/pk-double-districts.test.ts.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-pk-double-park-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { OncomingStreamSpec } from "../../contracts";
import { SC_PK_DOUBLE_PARK } from "../../lessons/scenario/templates-parking2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScPkDoubleParkDrive, type ScPkDoubleParkTraceName } from "../scPkDoublePark";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-pk-double-park";
const NAMES: ScPkDoubleParkTraceName[] = [
  "shadow-correct",
  "mistake-second-line",
  "mistake-oncoming-squeeze",
];

/** The authored span, in district y (== edge arclength: one edge on x = 0). */
const BAN = { fromY: 70, toY: 210 };
/** The parked row that CAUSES the span. */
const ROW = { fromY: 75, toY: 205 };
/** The free curb bay — the drill's answer. */
const BAY = { x: 6.8, y: 290 };
/** Where each demo rests. */
const REST_SECOND_LINE_Y = 130;
const REST_SQUEEZE_Y = 175;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function tOf(d: RecordedDrive, code: string): number {
  const e = d.ruleEvents.find((x) => x.kind === "violation" && x.code === code);
  if (!e) throw new Error(`${code} never fired`);
  return e.t;
}

const district = loadDistrict("pk-double-v1");
const drives = new Map<ScPkDoubleParkTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScPkDoubleParkDrive(district, n)]),
);

describe("sc-pk-double-park — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;
  it("passes the whole parked row and parks legally past it: ZERO violations", () => {
    expect(violationCodes(shadow)).toEqual([]);
  });

  it("parks AT THE CURB in the free bay (6.8, 290), outside the ban, with Bulgarian annotations", () => {
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(Math.abs(last.y - BAY.y)).toBeLessThan(3);
    expect(Math.abs(last.x - BAY.x)).toBeLessThan(0.5); // at the curb, not in the lane
    expect(last.y).toBeGreaterThan(BAN.toY); // OUTSIDE the чл. 98 span
    expect(Math.abs(last.speedKmh)).toBeLessThan(1);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("never comes to rest inside the чл. 98 span (the shadow earns its zero the honest way)", () => {
    const inBan = (y: number) => y >= BAN.fromY && y <= BAN.toY;
    const restingInBan = shadow.trace.samples.filter((s) => Math.abs(s.speedKmh) < 1 && inBan(s.y));
    expect(restingInBan).toHaveLength(0);
  });

  it("does not even SLOW beside the row — the taught approach, not just a legal one", () => {
    // „Подмини редицата, без да намаляваш до нея": the decision is made early,
    // so the shadow must not crawl the row shopping for a gap.
    const inRow = shadow.trace.samples.filter((s) => s.y >= ROW.fromY && s.y <= ROW.toY);
    expect(inRow.length).toBeGreaterThan(0);
    for (const s of inRow) expect(s.speedKmh).toBeGreaterThan(25);
  });

  it("threads the 27-car row without touching it — the colliders are ARMED, not decorative", () => {
    // The row is SAT-tested against the hero footprint every frame. A zero here
    // is only meaningful because the mistake demos prove contacts DO grade.
    expect(violationCodes(shadow)).not.toContain("COLLISION");
    // …and it does it from the lane, not by hugging the осева: the shadow never
    // needs the oncoming half to get past a legally parked street.
    const movingX = shadow.trace.samples.filter((s) => s.speedKmh > 5).map((s) => s.x);
    expect(Math.min(...movingX)).toBeGreaterThan(0);
  });

  it("the oncoming stream passes it cleanly and resolves (the squeeze is staged, not scored)", () => {
    // The actor exists to be SEEN. It emits no violation of its own and must
    // resolve as met-and-passed on a drive that simply keeps moving.
    const outcome = shadow.outcomes.find((o) => o.eventId === "sc-pkd-stream");
    expect(outcome?.success).toBe(true);
    expect(outcome?.detail).toBe("clear");
  });
});

describe("sc-pk-double-park — mistakes grade their exact codes (doc 76 §9 stage 5)", () => {
  for (const [i, name] of (
    ["mistake-second-line", "mistake-oncoming-squeeze"] as const
  ).entries()) {
    it(`${name}: exactly its authored codeRefs, ILLEGAL_STOP_IN_BAN_ZONE ONCE`, () => {
      const drive = drives.get(name)!;
      const codes = [...new Set(violationCodes(drive))].sort();
      expect(codes).toEqual([...SC_PK_DOUBLE_PARK.mistakes[i].codeRefs].sort());
      // The later legal park must not double-bill.
      expect(violationCodes(drive).filter((c) => c === "ILLEGAL_STOP_IN_BAN_ZONE")).toHaveLength(1);
      // The near-miss codes a sloppy drive would smuggle in.
      expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
      expect(codes).not.toContain("POOR_LANE_KEEPING");
      expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    });
  }

  it("„спиране на втора линия“ convicts on the REST alone — no collision, no drama", () => {
    // The first demo's whole point: nothing happens. No crash, no horn, no
    // near-miss — just a car standing where чл. 98 says it may not, and a
    // основна грешка for it. If this demo ever needed a consequence to grade,
    // the template would be teaching „don't get caught" instead of the rule.
    expect(violationCodes(drives.get("mistake-second-line")!)).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("the two demos rest at DIFFERENT marks, both inside the one чл. 98 span", () => {
    /** The y of the first rest the DRIVE demonstrates — i.e. after the car has
     *  actually moved off (the samples open at rest on the spawn). */
    const restY = (name: ScPkDoubleParkTraceName) => {
      let movedOff = false;
      for (const s of drives.get(name)!.trace.samples) {
        if (Math.abs(s.speedKmh) > 5) movedOff = true;
        else if (movedOff && Math.abs(s.speedKmh) < 1) return s.y;
      }
      throw new Error(`${name}: the drive never comes to rest after moving off`);
    };
    const secondLine = restY("mistake-second-line");
    const squeeze = restY("mistake-oncoming-squeeze");
    for (const [label, y] of [["second-line", secondLine], ["squeeze", squeeze]] as const) {
      expect(y, label).toBeGreaterThanOrEqual(BAN.fromY);
      expect(y, label).toBeLessThan(BAN.toY);
    }
    expect(Math.abs(secondLine - REST_SECOND_LINE_Y)).toBeLessThan(1);
    expect(Math.abs(squeeze - REST_SQUEEZE_Y)).toBeLessThan(1);
    // Distinct marks: the excuse alone, and the excuse with the bill.
    expect(Math.abs(squeeze - secondLine)).toBeGreaterThan(30);
  });

  it("both demos rest IN THE LANE (x = 4.06) — second line means beside the row, not on the curb", () => {
    for (const name of ["mistake-second-line", "mistake-oncoming-squeeze"] as const) {
      const s = drives.get(name)!.trace.samples.find(
        (x) => Math.abs(x.speedKmh) < 1 && x.y > BAN.fromY && x.y < BAN.toY,
      )!;
      expect(s, name).toBeDefined();
      // Beside the parked row (x = 6.8), in the live lane — which is exactly
      // what makes it чл. 98 rather than parking.
      expect(Math.abs(s.x - 4.06), name).toBeLessThan(0.5);
    }
  });

  it("the squeeze demo bills the FAULT first and the CONSEQUENCE second", () => {
    // The debrief card tells the story in this order, so the drive must too:
    // the rest is already основна грешка four seconds before anything hits it.
    const d = drives.get("mistake-oncoming-squeeze")!;
    expect(tOf(d, "ILLEGAL_STOP_IN_BAN_ZONE")).toBeLessThan(tOf(d, "COLLISION"));
  });

  it("the squeeze's AUTHORED contact fires while the stream is genuinely abreast", () => {
    // The template's honesty claim, pinned rather than trusted. The contact is a
    // scripted `collision` DriveStep (the oncoming bank sits 8.12 m over — well
    // outside VEHICLE_CONTACT_M — so no simulated contact can ever occur here;
    // see the trace header). It would be a LIE if it fired at a moment when no
    // oncoming car was there, so we reconstruct where car 1 actually is.
    //
    // The stream is pure clockwork once released, and its "clear" resolution is
    // an exact anchor: at outcome.tSec the LAST car (car 1 — held BEHIND the
    // head along travel, i.e. north of it) sits exactly STREAM_CLEAR_BEHIND_M
    // south of the player in its own travel frame. Everything else follows from
    // the template's own authored cruise speed.
    const STREAM_CLEAR_BEHIND_M = 25; // orchestrator/runners.ts (private const)
    const stream = SC_PK_DOUBLE_PARK.staged!.find(
      (s) => s.kind === "oncomingStream",
    ) as OncomingStreamSpec;
    const v = stream.actor.cruiseSpeedMps;

    const d = drives.get("mistake-oncoming-squeeze")!;
    const tClear = d.outcomes.find((o) => o.eventId === "sc-pkd-stream")!.tSec!;
    const at = (t: number) =>
      d.trace.samples.reduce((best, s) =>
        Math.abs(s.tSec - t) < Math.abs(best.tSec - t) ? s : best,
      );
    const car1YAtClear = at(tClear).y - STREAM_CLEAR_BEHIND_M;
    const car1Y = (t: number) => car1YAtClear + v * (tClear - t);

    const tHit = tOf(d, "COLLISION");
    const heroY = at(tHit).y;
    // Abreast: car 1 is level with the stopped hero (they are 8.12 m apart
    // ACROSS the street — which is the whole point: on a street this parked
    // there was nowhere else for it to be).
    expect(Math.abs(car1Y(tHit) - heroY)).toBeLessThan(4);
    // …and the encounter is still live when the beat fires.
    expect(tHit).toBeLessThan(tClear);
  });

  it("both demos recover to the free bay — the fault is the rest, not the route", () => {
    for (const name of ["mistake-second-line", "mistake-oncoming-squeeze"] as const) {
      const last = drives.get(name)!.trace.samples.at(-1)!;
      expect(Math.abs(last.y - BAY.y), name).toBeLessThan(3);
      expect(Math.abs(last.x - BAY.x), name).toBeLessThan(0.5);
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
    // The staged stream + 27 collider rects are the new determinism surface
    // here: a second pass must reproduce the drive bit for bit.
    for (const name of NAMES) {
      const again = recordScPkDoubleParkDrive(district, name);
      expect(serializeScenarioTrace(again.trace), name).toBe(
        serializeScenarioTrace(drives.get(name)!.trace),
      );
    }
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_PK_DOUBLE_PARK.shadow, ...SC_PK_DOUBLE_PARK.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_PK_DOUBLE_PARK.shadow.path,
      ...SC_PK_DOUBLE_PARK.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});

describe("pinned geometry — the template copies match the committed map", () => {
  it("pk-double-v1 meta.scenario mirrors the template recipe (the row, the ban, the bay)", () => {
    const d = district as {
      meta: {
        zonesVersion?: number;
        scenario?: {
          laneCenterRightM?: number;
          legalBayY?: number;
          parkedRowY?: { fromY: number; toY: number };
          bays?: Array<{ occupied: boolean }>;
          params?: {
            rowFromM?: number;
            rowToM?: number;
            banFromM?: number;
            banToM?: number;
            legalBayY?: number;
            banBasis?: string;
          };
        };
      };
      zones?: Array<{ id: string; kind: string; fromM: number; toM: number }>;
      intersections?: unknown[];
      crossings?: unknown[];
    };
    const p = SC_PK_DOUBLE_PARK.map.params as {
      rowFromM: number;
      rowToM: number;
      banFromM: number;
      banToM: number;
      legalBayY: number;
      banBasis: string;
    };
    expect(d.meta.zonesVersion).toBe(1);
    expect(d.meta.scenario?.laneCenterRightM).toBe(4.06);
    expect(d.meta.scenario?.params?.rowFromM).toBe(p.rowFromM);
    expect(d.meta.scenario?.params?.rowToM).toBe(p.rowToM);
    expect(d.meta.scenario?.params?.banFromM).toBe(p.banFromM);
    expect(d.meta.scenario?.params?.banToM).toBe(p.banToM);
    expect(d.meta.scenario?.params?.legalBayY).toBe(p.legalBayY);
    // The template's whole claim: this ban comes from the LAW and the parked
    // cars. There is no plate on this map to read.
    expect(d.meta.scenario?.params?.banBasis).toBe("law");
    expect(p.banBasis).toBe("law");
    expect(d.meta.scenario?.parkedRowY).toEqual({ fromY: ROW.fromY, toY: ROW.toY });
    expect(d.zones?.map((z) => z.id)).toEqual(["pkd-z-second-line"]);
    for (const z of d.zones ?? []) expect(z.kind).toBe("noStopping");
    // Why the span convicts at all: nothing on this map can arm the detector's
    // armor (the gen_pk_busstop clean-room law, inherited).
    expect(d.intersections).toHaveLength(0);
    expect(d.crossings).toHaveLength(0);
    // The row is real and the answer is single.
    expect(d.meta.scenario?.bays?.filter((b) => b.occupied).length).toBe(27);
    expect(d.meta.scenario?.bays?.filter((b) => !b.occupied).length).toBe(1);
  });

  it("the stream is authored under the gap ceiling its own hold arc imposes", () => {
    // runners.ts holds car i at holdArc − gapsM[i−1]: a gap wider than the head's
    // hold arc silently places car 1 off the path's start and collapses the
    // stream into a nose-to-tail pair (the ov-oncoming battery pins the same
    // law). This template's timing — car 1 abreast of the stopped hero at
    // t ≈ 27.7 — depends on the gap being REAL.
    const stream = SC_PK_DOUBLE_PARK.staged!.find(
      (s) => s.kind === "oncomingStream",
    ) as OncomingStreamSpec;
    expect(stream.gapsM).toHaveLength(stream.count - 1);
    for (const gap of stream.gapsM) {
      expect(stream.actor.hold.offsetM - gap).toBeGreaterThanOrEqual(0);
    }
    // The hold must also sit ON the path (0 ≤ arc ≤ the street's length).
    expect(stream.actor.hold.offsetM).toBeGreaterThan(0);
    expect(stream.actor.hold.offsetM).toBeLessThan(360);
  });
});
