/**
 * THE WINTER RULE HAS TO REACH THE FAST HALF OF ITS OWN LESSON.
 *
 * `sc-ac-snow:6ed473c3`, w11 — «The winter-speed rule the lesson exists to
 * teach is never booked.» `.audit-frames/w11/frames/sc-ac-snow__pc-wrong`:
 * top speed 59 км/ч against an on-screen «дръж под 25 км/ч» and an instruction
 * «зимният таван тук е 25», and `MISTAKES (4)` holds колан, «Движение в
 * снеговалеж без светлини» and two contacts — not one speed rule.
 *
 * THE CAUSE WAS ONE CONJUNCT. `engine.ts` armed the detector only while
 * `speed <= bands.gradedAbove`, i.e. only under the posted limit plus its
 * grace. On the shipped снеговалеж numbers that is 55 in a 50 — while the
 * envelope the lesson teaches is 25 — so the band in which the lesson could not
 * mark its own subject was everything from 55 upwards.
 *
 * FOUR DIRECTIONS ARE PINNED HERE, because a detector that only ever says
 * „guilty" is not a repair either:
 *   1. above the grace band, in snow          → CONVICTS (the filed defect)
 *   2. above the grace band, dry              → SILENT  (weather is the trigger)
 *   3. under the envelope, at any speed       → SILENT  (the taught drive)
 *   4. the fault is второстепенна and bounded → at most one bill + one re-grade
 *
 * `conditions.test.ts` keeps the whole envelope/MIN-composition family; this
 * file is only about the CAP, so the day somebody re-adds it the failure names
 * the frame it came from.
 */
import { describe, expect, it } from "vitest";
import { codes, cruise, drive, tick } from "./fixtures";

/** limit 50 · snow 0.5 → envelope 25 · grace band ends at 55 · sustain 3 s. */
const SNOW = { maxSpeedKmh: 50, snow: true, headlights: "low" } as const;

const conditionBills = (ticks: Parameters<typeof drive>[0]) =>
  drive(ticks)
    .events.filter((e) => e.kind === "violation" && e.code === "SPEED_TOO_FAST_FOR_CONDITIONS")
    .map((e) => [Number(e.t.toFixed(1)), e.kind === "violation" && e.regrade === true] as const);

describe("the conditions envelope is not switched off by the posted-limit grace", () => {
  it("CONVICTS the filed drive: 59 км/ч in snow against a 25 envelope", () => {
    const ticks = cruise(0, 20, { speedKmh: 59, ...SNOW });
    expect(codes(drive(ticks).events)).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("…and the speeding code bills its own act on the same drive — two laws, two lessons", () => {
    // чл. 21 (посоченото ограничение) and чл. 20, ал. 2 (да спреш пред всяко
    // предвидимо препятствие) are different duties. 59 in a 50 is over the
    // graced limit AND at 2.4× the winter envelope, and the sheet says both.
    const seen = codes(drive(cruise(0, 20, { speedKmh: 59, ...SNOW })).events);
    expect(seen).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(seen).toContain("SPEEDING_OVER_LIMIT");
  });

  it("stays SILENT at the same speed with no weather — the trigger is the world, not the speed", () => {
    const ticks = cruise(0, 20, { speedKmh: 59, maxSpeedKmh: 50, headlights: "low" });
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("stays SILENT on the taught winter drive (22 in a 50, snowing)", () => {
    const ticks = cruise(0, 20, { speedKmh: 22, ...SNOW });
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("bills once and re-grades once — never per minute, however long the breach runs", () => {
    // sustain 3 s → the teach at t=3; SPEED_REGRADE_SEC 6 → the charge at t=9;
    // then nothing for the remaining fifty seconds. Наредба № 38 prices the
    // fault once. Same shape `conditions.test.ts` pins for the 48-in-a-50 case,
    // asserted here at a speed the old cap made unreachable.
    expect(conditionBills(cruise(0, 60, { speedKmh: 59, ...SNOW }))).toEqual([
      [3, false],
      [9, true],
    ]);
  });

  it("the FILED LEG's own speed profile now reaches the charge, not just the teach", () => {
    /**
     * THE MECHANISM, READ OFF `.audit-frames/w11/frames/sc-ac-snow__pc-wrong`
     * rather than reasoned about. That debrief books four faults, none of them
     * a speed rule — AND its «Учебни моменти (не влизат в точките)» section
     * lists «Несъобразена с условията скорост» by name. So the detector DID
     * fire once, on the way up through 25–55, and the founder-approved
     * teach-first free lesson spent that single bill at zero точки. What could
     * then never happen is the RE-GRADE, the bill that exists only to reach the
     * charge the teach consumed:
     *
     *   run.log  t001 14 · t007 57 · t012 59 · t017 59 · t022 59 · t028 1 км/ч
     *
     * from t≈6 the speed is above the graced 55, so the old fourth conjunct
     * made `tooFastForConditions` FALSE — and `stepEpisode`'s `!cond` branch
     * nulls `activeSince` on every such frame, so the 9 s re-grade clock was
     * reset ~20 times and never once ran. `conditionsSpeedReset` (speed ≤ 25)
     * was false the whole time too, so the episode could not re-arm either.
     * The winter rule was taught and structurally could not be charged.
     *
     * This case replays that profile at 1 Hz. TWO bills, the second marked
     * `regrade`, is the row moving from «Учебни моменти» to «Грешки».
     */
    const ramp = [0, 14, 28, 42, 50, 55, 57].map((speedKmh, t) => ({ t, speedKmh }));
    const ticks = [
      ...ramp.map((r) => tick(r.t, { speedKmh: r.speedKmh, ...SNOW })),
      ...cruise(7, 27, { speedKmh: 59, ...SNOW }),
    ];
    const bills = conditionBills(ticks);
    expect(bills.map((b) => b[1])).toEqual([false, true]);
    // The teach bill lands on the way up; the charge lands while the car is
    // holding 59 — the stretch the old gate could not see at all.
    expect(bills[1][0]).toBeGreaterThan(7);
  });

  it("the same holds for fog (envelope 30) and rain (42.5) above the grace band", () => {
    const fog = codes(
      drive(cruise(0, 20, { speedKmh: 59, maxSpeedKmh: 50, fog: true, fogLightsOn: true, headlights: "low" }))
        .events,
    );
    const rain = codes(
      drive(cruise(0, 20, { speedKmh: 59, maxSpeedKmh: 50, rain: true, headlights: "low" })).events,
    );
    expect(fog).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(rain).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });
});
