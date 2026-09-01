import { describe, expect, it } from "vitest";
import { codes, cruise, drive, tick } from "./fixtures";
import { DEFAULT_RULE_CONFIG } from "../types";
import { VIOLATIONS } from "../catalog";

/**
 * THE TOWN HALF OF THE SPEED ENVELOPE — DRIVING_TOO_SLOW_IN_TOWN.
 *
 * WHAT WAS MEASURED, AND WHY THE CODE EXISTS (audit
 * `sc-vu-emergency-junction:853790f7`). The reference „correct" leg of that
 * lesson held 10–11 км/ч for well over two minutes on a street posted 40 and
 * the engine said nothing anywhere — not too slow, not obstructing, not a word.
 * The flat-out leg of the SAME lesson was billed once a tick. Every speed
 * detector in `engine.ts` graded the fast half of the envelope only:
 * `DRIVING_TOO_SLOW_FOR_MOTORWAY` is gated on `tick.motorway === true`, and no
 * other reducer reads the low end at all. „Пълзи и минаваш" was therefore an
 * unbeaten strategy across every town lesson, which is the opposite of the
 * north star: a driver who cannot keep the flow is not a safe driver, he is a
 * mobile obstacle other people take risks to get around.
 *
 * THE LAW (ADR-002 — retrieved, `content/law/acts/zdvp.json` чл. 22, quoted
 * verbatim in `catalog.ts` and `consequences.ts`): ал. 1 forbids driving „без
 * основателна причина с твърде ниска скорост, когато по този начин пречи", and
 * ал. 2 states the duty a learner can act on — let the queue past. There is NO
 * general minimum speed, so the floor tested below is a DETECTION threshold
 * derived from the posted plate, and no number from it is ever shown to the
 * student as a limit he broke.
 *
 * DEFAULTS THIS FILE PINS: through road = posted >= 40 · floor =
 * min(limit × 0.3, 15) km/h · queue gap 30 m · clear-ahead 25 m · sustain 20 s
 * accrued · regrade +10 s · steadiness band shared with the motorway crawl.
 */

/** Floor on the fixtures' default 50 km/h street: min(50 × 0.3, 15) = 15. */
const FLOOR_50 = Math.min(
  50 * DEFAULT_RULE_CONFIG.townCrawlFractionOfLimit,
  DEFAULT_RULE_CONFIG.townCrawlFloorCapKmh,
);

const CODE = "DRIVING_TOO_SLOW_IN_TOWN";

describe("town crawl detector (DRIVING_TOO_SLOW_IN_TOWN)", () => {
  it("the floor is derived from the posted plate, not typed in", () => {
    // A guard on the fixture itself: if the config moves, the drives below stop
    // meaning what their names say, and this line says so first.
    expect(FLOOR_50).toBe(15);
    expect(DEFAULT_RULE_CONFIG.townCrawlMinPostedKmh).toBe(40);
  });

  it("fires on the measured fault: a steady 10 км/ч crawl on an open street posted 50", () => {
    const ticks = cruise(0, 25, { speedKmh: 10 });
    expect(codes(drive(ticks).events)).toContain(CODE);
  });

  it("…and on the frame the audit actually photographed — 11 км/ч on a road posted 40", () => {
    const ticks = cruise(0, 25, { speedKmh: 11, maxSpeedKmh: 40 });
    expect(codes(drive(ticks).events)).toContain(CODE);
  });

  it("says nothing before the sustain — a short slow stretch is not a crawl", () => {
    const ticks = cruise(0, 15, { speedKmh: 10 });
    expect(codes(drive(ticks).events)).not.toContain(CODE);
  });

  it("bills TWICE per episode — the teach and the grade — and never a third time", () => {
    // The MOTORWAY_CRAWL_REGRADE_SEC argument, one road over: the code is
    // второстепенна, so `policyForViolation` hands the FIRST bill to the
    // teach-first free mini-lesson. Without the re-grade a two-minute crawl
    // costs the student nothing at all, which is the defect this repair is for.
    const long = cruise(0, 600, { speedKmh: 10 });
    const all = drive(long).events.filter((e) => e.code === CODE);
    expect(all).toHaveLength(2);
    expect(all.map((e) => (e as { regrade?: true }).regrade === true)).toEqual([false, true]);
  });

  it("a second, distinct crawl after a genuine recovery is a second act and bills again", () => {
    // Each leg is long enough for the FIRST bill of its own episode and short
    // of the re-grade, so „two bills, neither of them a re-grade" is exactly the
    // statement „these were two separate acts" — not one act billed twice.
    const ticks = [
      ...cruise(0, 25, { speedKmh: 10 }),
      ...cruise(26, 40, { speedKmh: 45 }), // recovered — the episode re-arms
      ...cruise(41, 66, { speedKmh: 10 }),
    ];
    const all = drive(ticks).events.filter((e) => e.code === CODE);
    expect(all).toHaveLength(2);
    expect(all.map((e) => (e as { regrade?: true }).regrade === true)).toEqual([false, false]);
  });

  // -------------------------------------------------------------------------
  // «БЕЗ ОСНОВАТЕЛНА ПРИЧИНА» — every acquittal the article itself demands
  // -------------------------------------------------------------------------

  it("is silent where the plate is posted under 40 — a parking aisle, полигон or Зона 30", () => {
    // All fourteen `lot-*` maps are posted 20, `poligon-v1` 20/30, `pk-drive-v1`
    // and `sp-zone30-v1` 30. Crawling there is the exercise, not a fault, and
    // the manoeuvre drills are excluded STRUCTURALLY rather than by a list.
    expect(codes(drive(cruise(0, 60, { speedKmh: 5, maxSpeedKmh: 20 })).events)).not.toContain(CODE);
    expect(codes(drive(cruise(0, 60, { speedKmh: 8, maxSpeedKmh: 30 })).events)).not.toContain(CODE);
  });

  it("is silent on a motorway — that act has its own code (one act, one bill)", () => {
    const ticks = cruise(0, 60, { speedKmh: 10, maxSpeedKmh: 140, motorway: true });
    const seen = codes(drive(ticks).events);
    expect(seen).not.toContain(CODE);
    expect(seen).toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("is silent inside a calmed zone tag (Зона 30 / school / residential)", () => {
    const ticks = cruise(0, 60, { speedKmh: 10, zone: "thirty" });
    expect(codes(drive(ticks).events)).not.toContain(CODE);
  });

  it("ANY vehicle ahead in the corridor acquits, near OR far — the obstructer is the one in front", () => {
    // Not a threshold: чл. 22, ал. 1 forbids the crawl that „пречи на
    // движението на ДРУГИТЕ", and with a body ahead in my own lane I am not the
    // head of the queue and nobody is stuck behind me. Both distances acquit —
    // 18 m is congestion, 120 m is a car the student may simply be pacing, and
    // the engine cannot tell those apart from telemetry. It costs a false
    // negative and buys every following drill in the corpus.
    expect(codes(drive(cruise(0, 60, { speedKmh: 10, leadGapM: 18 })).events)).not.toContain(CODE);
    expect(codes(drive(cruise(0, 60, { speedKmh: 10, leadGapM: 120 })).events)).not.toContain(CODE);
  });

  it("a junction, a stop line or a pedestrian ahead IS the reason — all three acquit", () => {
    expect(codes(drive(cruise(0, 60, { speedKmh: 10, nextJunctionM: 12 })).events)).not.toContain(
      CODE,
    );
    expect(
      codes(
        drive(cruise(0, 60, { speedKmh: 10, nextStopLineM: 12, nextStopLineControl: "giveWay" }))
          .events,
      ),
    ).not.toContain(CODE);
    expect(codes(drive(cruise(0, 60, { speedKmh: 10, vruAheadM: 12 })).events)).not.toContain(CODE);
  });

  it("night, rain, fog and snow acquit — чл. 20, ал. 2 ORDERS the speed down", () => {
    // `sc-pe-night-unlit` ships a whole mistake demo called «mistake-city-speed»
    // for driving town speed on an unlit street. A detector that then punished
    // the correct answer would grade the lesson backwards.
    expect(codes(drive(cruise(0, 60, { speedKmh: 10, isNight: true })).events)).not.toContain(CODE);
    expect(codes(drive(cruise(0, 60, { speedKmh: 10, rain: true })).events)).not.toContain(CODE);
    expect(codes(drive(cruise(0, 60, { speedKmh: 10, fog: true })).events)).not.toContain(CODE);
    expect(codes(drive(cruise(0, 60, { speedKmh: 10, snow: true })).events)).not.toContain(CODE);
  });

  it("a signed curve advisory, a rail crossing and a narrow meeting acquit", () => {
    expect(
      codes(drive(cruise(0, 60, { speedKmh: 10, curveAdvisoryKmh: 30 })).events),
    ).not.toContain(CODE);
    expect(
      codes(drive(cruise(0, 60, { speedKmh: 10, railCrossing: "approach" })).events),
    ).not.toContain(CODE);
    expect(codes(drive(cruise(0, 60, { speedKmh: 10, narrowTwoWay: true })).events)).not.toContain(
      CODE,
    );
  });

  it("the standstill and reverse manoeuvring are exempt", () => {
    expect(codes(drive(cruise(0, 60, { speedKmh: 0 })).events)).not.toContain(CODE);
    expect(codes(drive(cruise(0, 60, { speedKmh: 8, gear: -1 })).events)).not.toContain(CODE);
  });

  it("accelerating up through the band, and braking down through it, are transitions", () => {
    // The steadiness test is shared with the motorway crawl verbatim: a
    // move-off and a brake toward a stop both carry |a| far above the band.
    const up = [0, 6, 12, 18, 24, 30, 36, 42, 48, 48].map((kmh, i) => tick(i, { speedKmh: kmh }));
    expect(codes(drive(up).events)).not.toContain(CODE);
    const down = [48, 42, 36, 30, 24, 18, 12, 6, 0, 0].map((kmh, i) => tick(i, { speedKmh: kmh }));
    expect(codes(drive(down).events)).not.toContain(CODE);
  });

  it("the config gate silences it entirely (townCrawlEnabled: false)", () => {
    const { events } = drive(cruise(0, 60, { speedKmh: 10 }), { townCrawlEnabled: false });
    expect(codes(events)).not.toContain(CODE);
  });

  // -------------------------------------------------------------------------
  // What reaches the student
  // -------------------------------------------------------------------------

  it("grades второстепенна (1 т.) on the retrieved чл. 22, ал. 1 basis", () => {
    const ev = drive(cruise(0, 25, { speedKmh: 10 })).events.find(
      (e) => e.kind === "violation" && e.code === CODE,
    );
    expect(ev).toBeDefined();
    if (ev && ev.kind === "violation") {
      expect(ev.severityClass).toBe("vtorostepenna");
      expect(ev.points).toBe(1);
      expect(ev.lawRef).toBe("ЗДвП чл. 22, ал. 1");
      expect(ev.conceptId).toBe("c-speed-limits");
    }
  });

  it("REQUIREMENT-ZERO: the card explains WHY it is dangerous and what to do instead", () => {
    // Doc 64 THEO-4 — never a bare verdict. The explanation has to name the
    // MECHANISM (the queue, and the overtake somebody else then attempts in the
    // wrong place), and the corrective has to give the чл. 22, ал. 2 action.
    const ev = drive(cruise(0, 25, { speedKmh: 10 })).events.find(
      (e) => e.kind === "violation" && e.code === CODE,
    );
    expect(ev).toBeDefined();
    if (ev && ev.kind === "violation") {
      expect(ev.explanationBg).toMatch(/колона/);
      expect(ev.explanationBg).toMatch(/изпревар/);
      // No invented statutory minimum anywhere in the copy (ADR-002).
      expect(ev.explanationBg).not.toMatch(/минимална скорост от/);
    }
    // `correctiveBg` rides the CATALOGUE row rather than the event (the event
    // shape carries no such field — see `ViolationEvent` in types.ts), so the
    // „what to do instead" half is asserted where it actually lives.
    const spec = VIOLATIONS[CODE];
    expect(spec.correctiveBg).toBeDefined();
    expect(spec.correctiveBg).toMatch(/пропусни|пусни/);
  });

  it("THE FINDING'S OWN SENTENCE: both ends of the envelope now grade", () => {
    // „The engine grades one side of the speed envelope only." It no longer
    // does: the same street, the same duration, the two opposite faults.
    const tooFast = codes(drive(cruise(0, 25, { speedKmh: 70 })).events);
    const tooSlow = codes(drive(cruise(0, 25, { speedKmh: 10 })).events);
    expect(tooFast).toContain("SPEEDING_DANGEROUS");
    expect(tooFast).not.toContain(CODE);
    expect(tooSlow).toContain(CODE);
    expect(tooSlow).not.toContain("SPEEDING_DANGEROUS");
  });
});
