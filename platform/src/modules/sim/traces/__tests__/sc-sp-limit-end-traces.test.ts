/**
 * S trace gate — „Докъде важи ограничението" (sc-sp-limit-end on sp-signs-v1,
 * doc 72 SP-03 read from its scope end), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays with ZERO violations and earns CLEAN_DRIVING.
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs against the PER-EDGE
 *      LOCAL limit, and each lands INSIDE the В26 span it belongs to: the early
 *      acceleration grades SPEEDING_OVER_LIMIT before the JUNCTION endpoint
 *      (never the dangerous band); the big overspeed grades SPEEDING_DANGEROUS
 *      before the END-PLATE endpoint (never the minor band).
 *   3. COMMITTED FILES under content/traces/sc-sp-limit-end/ ARE the recordings
 *      of these scripts, byte-for-byte, with identical public copies.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-sp-limit-end-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SC_SP_LIMIT_END } from "../../lessons/scenario/templates-speed2";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import { recordScSpLimitEndDrive, type ScSpLimitEndTraceName } from "../scSpLimitEnd";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-sp-limit-end";
/** The two В26-40 spans of sp-signs-v1 (meta.scenario.limit1 / limit2). */
const SPAN_1 = { fromY: 100, toY: 340 }; // dies at the JUNCTION
const SPAN_2 = { fromY: 460, toY: 700 }; // dies at the END PLATE
const LIMIT_KMH = 40;
const NAMES: ScSpLimitEndTraceName[] = ["shadow-correct", "mistake-early-accel", "mistake-big-overspeed"];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("sp-signs-v1");
const drives = new Map<ScSpLimitEndTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScSpLimitEndDrive(district, n)]),
);

/** Re-record with an onTick probe: where each violation landed + the local
 *  limit there (the recorder's serialized bytes never depend on onTick). */
function probe(name: ScSpLimitEndTraceName) {
  const ticks: { t: number; y: number; limit: number; speed: number }[] = [];
  const drive = recordScSpLimitEndDrive(district, name, {
    onTick: (tick) =>
      ticks.push({ t: tick.t, y: tick.position.y, limit: tick.maxSpeedKmh, speed: Math.abs(tick.speedKmh) }),
  });
  const at = (t: number) => ticks.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best));
  return { drive, ticks, at };
}

describe("sc-sp-limit-end — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("holds the В26 40 through BOTH spans, to the junction AND to the plate", () => {
    const samples = shadow.trace.samples;
    const last = samples[samples.length - 1];
    expect(last.y).toBeGreaterThan(780);
    // The whole lesson in one assert: the limit is honoured to the LAST metre of
    // each span — not to where the driver decided the zone was „basically over".
    for (const span of [SPAN_1, SPAN_2]) {
      const inSpan = samples.filter((s) => s.y > span.fromY && s.y < span.toY);
      expect(inSpan.length).toBeGreaterThan(0);
      expect(Math.max(...inSpan.map((s) => Math.abs(s.speedKmh))), `span ${span.fromY}..${span.toY}`).toBeLessThan(
        LIMIT_KMH,
      );
    }
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(4);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });

  it("resumes the base 50 only PAST each endpoint — the reward the scope rule earns", () => {
    const { ticks } = probe("shadow-correct");
    // Past the junction (span 1's endpoint) and past the plate (span 2's), the
    // local limit really is 50 again and the shadow uses it.
    for (const [lo, hi] of [
      [SPAN_1.toY + 20, SPAN_2.fromY - 30],
      [SPAN_2.toY + 20, 780],
    ] as const) {
      const band = ticks.filter((s) => s.y > lo && s.y < hi);
      expect(band.length, `band ${lo}..${hi}`).toBeGreaterThan(0);
      expect(band.every((s) => s.limit === 50), `band ${lo}..${hi} limit`).toBe(true);
      expect(Math.max(...band.map((s) => s.speed)), `band ${lo}..${hi} speed`).toBeGreaterThan(LIMIT_KMH);
    }
  });
});

describe("sc-sp-limit-end — per-endpoint grading (doc 76 §9 stage 5)", () => {
  it("„Ускоряване 200 м преди края на зоната“: exactly SPEEDING_OVER_LIMIT, inside span 1, against the LOCAL 40", () => {
    const { drive, at } = probe("mistake-early-accel");
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SP_LIMIT_END.mistakes[0].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    // The fault belongs to the span the driver cancelled early: it fires BEFORE
    // the junction endpoint, where the posted limit is still 40 — not on the 50
    // stretch beyond it, where the same 48 km/h is perfectly legal.
    const firstVio = drive.ruleEvents.find((e) => e.kind === "violation")! as { t: number };
    const where = at(firstVio.t);
    expect(where.y).toBeGreaterThan(SPAN_1.fromY);
    expect(where.y).toBeLessThan(SPAN_1.toY);
    expect(where.limit).toBe(LIMIT_KMH);
  });

  it("„Голямо превишение в зоната“: exactly SPEEDING_DANGEROUS, inside span 2, never the minor band", () => {
    const { drive, at } = probe("mistake-big-overspeed");
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_SP_LIMIT_END.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    // The other endpoint, the other rule: it fires before the END PLATE, where
    // the posted limit is still 40.
    const firstVio = drive.ruleEvents.find((e) => e.kind === "violation")! as { t: number };
    const where = at(firstVio.t);
    expect(where.y).toBeGreaterThan(SPAN_2.fromY);
    expect(where.y).toBeLessThan(SPAN_2.toY);
    expect(where.limit).toBe(LIMIT_KMH);
  });

  it("each demo breaks ONE endpoint's rule and drives the other span clean", () => {
    // Proof the two demos are two lessons, not one fault recorded twice: the
    // early-accel demo speeds only before the junction; the overspeed demo only
    // before the plate. Neither is a sloppy drive that happens to trip a code.
    const early = probe("mistake-early-accel");
    const big = probe("mistake-big-overspeed");
    const maxIn = (p: ReturnType<typeof probe>, span: { fromY: number; toY: number }) =>
      Math.max(...p.ticks.filter((s) => s.y > span.fromY && s.y < span.toY).map((s) => s.speed));
    expect(maxIn(early, SPAN_1)).toBeGreaterThan(LIMIT_KMH * 1.1); // over the graced 44
    expect(maxIn(early, SPAN_2)).toBeLessThan(LIMIT_KMH); // …but span 2 is clean
    expect(maxIn(big, SPAN_1)).toBeLessThan(LIMIT_KMH); // span 1 is clean…
    expect(maxIn(big, SPAN_2)).toBeGreaterThan(LIMIT_KMH + 10); // …and span 2 is опасна
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
    const again = recordScSpLimitEndDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(serializeScenarioTrace(drives.get("shadow-correct")!.trace));
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_SP_LIMIT_END.shadow, ...SC_SP_LIMIT_END.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([SC_SP_LIMIT_END.shadow.path, ...SC_SP_LIMIT_END.mistakes.map((m) => m.traceRef.path)]).toEqual(expected);
  });
});
