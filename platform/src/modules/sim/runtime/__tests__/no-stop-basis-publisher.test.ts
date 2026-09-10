/**
 * THE PUBLISHER — the authored basis has to survive the world parse and reach
 * the tick, on the REAL shipped maps, or the copy split is a dead predicate.
 *
 * This project has measured the failure mode it is guarding against: 51 of 82
 * audited repairs shipped a measurement wired to no consumer. `signRef` is the
 * cautionary tale sitting in this very field — it is authored on every zone,
 * it looks like exactly the channel this repair needed, and `ZoneSpan`'s parse
 * loop drops it on the floor, so no card has ever been able to read it.
 *
 * So the chain is walked end to end here, off `content/world/*.json` rather
 * than a fixture: authored `basis` → `ZoneSpan.noStopBasis` → `tick.noStopBasis`
 * → (in `rules/__tests__/ban-zone-basis-copy.test.ts`) the card's lawRef.
 *
 * `orchestrator/__tests__/vru-ahead-publisher.test.ts` already fails the build
 * if `rules/engine.ts` reads a `tick.` field that `worldRuntime.ts` never
 * assigns, so the wiring is mechanically checked as well as asserted here.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime } from "../index";

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found in: ${candidates.join(", ")}`);
}

const sample = (x: number, y: number, headingDeg = 0, speedKmh = 0): VehicleSample => ({
  position: { x, y },
  headingDeg,
  speedKmh,
  indicator: "off",
  headlights: "off",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
});

/** Stand the car at a point and read the tick the rule engine would grade. */
function tickAt(id: string, x: number, y: number) {
  const rt = createWorldRuntime(loadRaw(id));
  rt.update(1 / 60);
  return rt.sample(sample(x, y), 1, false);
}

describe("the authored ban basis reaches the tick on the shipped maps", () => {
  it("pk-double-v1: inside the second-line span, basis = law-alongside", () => {
    const t = tickAt("pk-double-v1", 4.06, 130);
    expect(t.noStopZone).toBe(true);
    expect(t.noStopBasis).toBe("law-alongside");
  });

  it("pk-banx-v1: the junction span and the zebra span publish DIFFERENT bases", () => {
    // The whole reason the channel is a clause enum and not a sign/law bit:
    // one district, two spans, two different точки, metres apart.
    const jx = tickAt("pk-banx-v1", 4.06, 145);
    expect(jx.noStopZone).toBe(true);
    expect(jx.noStopBasis).toBe("law-junction");

    const zebra = tickAt("pk-banx-v1", 4.06, 258);
    expect(zebra.noStopZone).toBe(true);
    expect(zebra.noStopBasis).toBe("law-crossing");
  });

  it("pk-rail-v1: both spans flanking the band publish law-rail", () => {
    // 199 / 207 — inside the 2 m ЗДвП really names either side of the band
    // (чл. 51, ал. 4; чл. 53, ал. 2; чл. 54, ал. 1). These probes read 175 and
    // 230 until 2026-09-10, when the map still banned 50 m either side; that
    // distance appears in no article, and the content bank's own
    // q-spirane-i-parkirane-056 marks it as the WRONG answer.
    for (const y of [199, 207]) {
      const t = tickAt("pk-rail-v1", 4.06, y);
      expect(t.noStopZone, `y=${y}`).toBe(true);
      expect(t.noStopBasis, `y=${y}`).toBe("law-rail");
    }
    // …and the road the old probes stood on publishes NOTHING, because standing
    // there breaks nothing.
    for (const y of [175, 230]) {
      expect(tickAt("pk-rail-v1", 4.06, y).noStopZone, `y=${y}`).toBeUndefined();
    }
  });

  it("pk-ban-v1: a genuine В27 span publishes NO basis — the pooled card stands", () => {
    // The acquitting direction. A repair that made every ban zone cite чл. 98
    // would be the same miscitation mirrored onto the six plate maps.
    const t = tickAt("pk-ban-v1", 4.06, 130);
    expect(t.noStopZone).toBe(true);
    expect(t.noStopBasis).toBeUndefined();
  });

  it("pk-busstop-v1 publishes no basis either — it awaits a founder ruling", () => {
    const t = tickAt("pk-busstop-v1", 4.06, 165);
    expect(t.noStopZone).toBe(true);
    expect(t.noStopBasis).toBeUndefined();
  });

  it("OUTSIDE every span there is no zone and no basis", () => {
    const t = tickAt("pk-double-v1", 4.06, 40);
    expect(t.noStopZone).toBeUndefined();
    expect(t.noStopBasis).toBeUndefined();
  });

  it("an UNRECOGNISED authored basis is dropped, not carried to the card", () => {
    // The advisoryKmh / rail-timetable tolerance: a data slip must fall back to
    // the reviewed pooled row, never select a clause nobody wrote.
    const raw = loadRaw("pk-double-v1") as { zones: { kind: string; basis?: string }[] };
    for (const z of raw.zones) if (z.kind === "noStopping") z.basis = "law-invented";
    const rt = createWorldRuntime(raw);
    rt.update(1 / 60);
    const t = rt.sample(sample(4.06, 130), 1, false);
    expect(t.noStopZone).toBe(true);
    expect(t.noStopBasis).toBeUndefined();
  });
});
