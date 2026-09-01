import { describe, expect, it } from "vitest";
import { codes, cruise, drive, tick } from "./fixtures";
import { DEFAULT_RULE_CONFIG } from "../types";
import type { RuleEngineConfig, SimTick } from "../types";

/**
 * THE STOP THAT HAD NO REASON — STOPPED_WITHOUT_CAUSE.
 *
 * WHAT WAS MEASURED (audit `sc-jx-priority-confidence:9c987e7b`). The lesson is
 * titled „По пътя с предимство — без излишни спирания" and its objective is one
 * sentence: cross the junction „равномерно и уверено… но не спирай без
 * причина". The credited drive of
 * `.audit-frames/w21/frames/sc-jx-priority-confidence__pc-right` (attested
 * b224c7e, 2026-08-31) covered 187 m of an open priority arm in 88 s against
 * the template's own 40 s par, standing still for most of it with a staged car
 * glued 9 m behind — and reached «Опасни 0 · Основни 0 · Второстепенни 0»,
 * ИЗДЪРЖАН, ★★★, +100 XP and a commendation. The behaviour the lesson is named
 * after was not graded leniently; nothing looked at it.
 *
 * WHY THE TWO CRAWL CODES COULD NOT. Both `DRIVING_TOO_SLOW_FOR_MOTORWAY` and
 * `DRIVING_TOO_SLOW_IN_TOWN` carry `moving` (v > `movingSpeedKmh`), so a car at
 * rest never accrues a millisecond on either ledger; and the town ledger is
 * zeroed by a genuine recovery, which that drive performed twice (it touched
 * 44 км/ч). Both are RIGHT — a driver who reaches 44 км/ч is not crawling. He
 * is stopping, which is a different act under a different article.
 *
 * THE LAW (ADR-002 — retrieved from `content/law/acts/zdvp.json`, чл. 24, and
 * quoted verbatim in `catalog.ts` / `consequences.ts`): ал. 2 — before reducing
 * speed significantly the driver must satisfy himself that he will not endanger
 * the others and will not „затрудни излишно тяхното движение". NOT чл. 22,
 * ал. 1, which governs a driver who „се движи" — this car is not moving at all.
 *
 * DEFAULTS THIS FILE PINS: OFF by default (armed per lesson) · a genuine full
 * stop (v ≤ `fullStopMaxSpeedKmh`) · held 6 s consecutively · re-grade +6 s ·
 * re-armed by driving on · every acquittal the town crawl already accepts, plus
 * a forbidding lamp anywhere in the watch window, a В27 span, fog and snow.
 */

const CODE = "STOPPED_WITHOUT_CAUSE";
const ARMED: Partial<RuleEngineConfig> = { needlessStopEnabled: true };

/** A rolling start — `s.moveOff.done` needs the session to have actually driven. */
const ROLL = (t0: number, t1: number, over: Partial<SimTick> = {}): SimTick[] =>
  cruise(t0, t1, { speedKmh: 40, ...over });

/** Standing dead still, in gear, on the fixtures' open street posted 50. */
const STAND = (t0: number, t1: number, over: Partial<SimTick> = {}): SimTick[] =>
  cruise(t0, t1, { speedKmh: 0, ...over });

/** Drive off, then freeze for `sec` seconds with the given world context. */
const rollThenFreeze = (sec: number, over: Partial<SimTick> = {}): SimTick[] => [
  ...ROLL(0, 4, over),
  ...STAND(5, 5 + sec, over),
];

describe("needless-stop detector (STOPPED_WITHOUT_CAUSE)", () => {
  it("ships DISARMED — a lesson must ask for it", () => {
    // The town crawl ships ON because a crawl has one innocent shape. A STOP has
    // dozens and most are the curriculum itself (stop marks, bays, the kerb-side
    // pull-over, the pre-drive procedure, every lesson that ends at rest), and
    // `rules/` cannot see an objective. Default-on would convict students for
    // finishing the exercise — see the field's note in types.ts.
    expect(DEFAULT_RULE_CONFIG.needlessStopEnabled).toBe(false);
    expect(codes(drive(rollThenFreeze(60)).events)).not.toContain(CODE);
  });

  it("fires on the measured fault: a held standstill on an open street with nothing ahead", () => {
    expect(codes(drive(rollThenFreeze(30), ARMED).events)).toContain(CODE);
  });

  it("says nothing before the sustain — a 4 s pause is traffic, not a fault", () => {
    expect(DEFAULT_RULE_CONFIG.needlessStopSustainSec).toBe(6);
    expect(codes(drive(rollThenFreeze(4), ARMED).events)).not.toContain(CODE);
  });

  it("leaves this template's own committed traces alone — 2.0 s and 1.5 s rests", () => {
    // `content/traces/sc-jx-priority-confidence/*`: the phantom-brake demo pauses
    // 2.0 s at the slam and 1.5 s at the end of the route; the shadow pauses 1.5 s.
    // The sustain is sized so that arming the detector cannot re-write a demo.
    expect(codes(drive(rollThenFreeze(2), ARMED).events)).not.toContain(CODE);
  });

  it("bills TWICE for one long freeze — the teach and the grade — and never a third time", () => {
    // The MOTORWAY_CRAWL_REGRADE_SEC argument, applied to a car that is not
    // moving at all: `policyForViolation` hands the FIRST bill of a
    // второстепенна to the teach-first free mini-lesson, so without the re-grade
    // a student who stops once and simply stays stopped is charged nothing.
    const all = drive(rollThenFreeze(600), ARMED).events.filter((e) => e.code === CODE);
    expect(all).toHaveLength(2);
    expect(all.map((e) => (e as { regrade?: true }).regrade === true)).toEqual([false, true]);
  });

  it("a second stop after genuinely driving on is a second ACT and bills unmarked", () => {
    // Each freeze is long enough for its own first bill and short of the
    // re-grade, so „two bills, neither marked" is the statement „these were two
    // separate stops" — which is what the audited drive did twice in 88 s.
    const ticks = [
      ...ROLL(0, 4),
      ...STAND(5, 14),
      ...ROLL(15, 20),
      ...STAND(21, 30),
    ];
    const all = drive(ticks, ARMED).events.filter((e) => e.code === CODE);
    expect(all).toHaveLength(2);
    expect(all.map((e) => (e as { regrade?: true }).regrade === true)).toEqual([false, false]);
  });

  // -------------------------------------------------------------------------
  // «БЕЗ ПРИЧИНА» — every acquittal, and the two the crawl grants that this
  // deliberately does not
  // -------------------------------------------------------------------------

  it("never convicts a session that has not driven yet — the briefing-card standstill", () => {
    // Every drive opens at rest while the student reads the instructions. Without
    // the `s.moveOff.done` latch the reducer would bill a car nobody has touched.
    expect(codes(drive(STAND(0, 120), ARMED).events)).not.toContain(CODE);
  });

  it("ANY vehicle ahead in the corridor acquits, near OR far — a queue is a reason", () => {
    expect(codes(drive(rollThenFreeze(60, { leadGapM: 6 }), ARMED).events)).not.toContain(CODE);
    expect(codes(drive(rollThenFreeze(60, { leadGapM: 120 }), ARMED).events)).not.toContain(CODE);
  });

  it("a junction, a stop line or a person inside the clear window acquits", () => {
    const near = DEFAULT_RULE_CONFIG.townCrawlClearAheadM - 1;
    expect(codes(drive(rollThenFreeze(60, { nextJunctionM: near }), ARMED).events)).not.toContain(CODE);
    expect(codes(drive(rollThenFreeze(60, { nextStopLineM: near }), ARMED).events)).not.toContain(CODE);
    expect(codes(drive(rollThenFreeze(60, { vruAheadM: near }), ARMED).events)).not.toContain(CODE);
  });

  it("a forbidding lamp acquits ANYWHERE in the watch window, not only inside it", () => {
    // Waiting out a red 60 m back in a queue is the most ordinary lawful stop
    // there is — the `banZoneControl` reading, mirrored. Green does NOT acquit:
    // a green light is the opposite of a reason to stand still (HESITATION_AT_
    // GREEN grades that case on its own terms).
    const far = { nextStopLineM: 60, nextStopLineControl: "trafficLight" as const };
    for (const state of ["red", "redYellow", "yellow"] as const) {
      expect(codes(drive(rollThenFreeze(60, { ...far, nextStopLineState: state }), ARMED).events))
        .not.toContain(CODE);
    }
    expect(codes(drive(rollThenFreeze(60, { ...far, nextStopLineState: "green" }), ARMED).events))
      .toContain(CODE);
  });

  it("an authored В27 span acquits — that rest is ILLEGAL_STOP_IN_BAN_ZONE's act", () => {
    // One act, one bill. The ban-zone code owns the rest inside its own span.
    expect(codes(drive(rollThenFreeze(60, { noStopZone: true }), ARMED).events)).not.toContain(CODE);
  });

  it("is silent where the plate is posted under 40, and inside a calmed zone tag", () => {
    expect(codes(drive(rollThenFreeze(60, { maxSpeedKmh: 20 }), ARMED).events)).not.toContain(CODE);
    expect(codes(drive(rollThenFreeze(60, { zone: "thirty" }), ARMED).events)).not.toContain(CODE);
  });

  it("is silent on a motorway, in reverse, and on a stalled car", () => {
    expect(codes(drive(rollThenFreeze(60, { motorway: true, maxSpeedKmh: 140 }), ARMED).events))
      .not.toContain(CODE);
    expect(codes(drive(rollThenFreeze(60, { gear: -1 }), ARMED).events)).not.toContain(CODE);
    // ENGINE_STALLED owns the stall; billing the restart seconds again here
    // would charge one mechanical event twice.
    expect(codes(drive(rollThenFreeze(60, { stalled: true }), ARMED).events)).not.toContain(CODE);
  });

  it("fog and snow acquit — чл. 20, ал. 2 can bottom out at a halt", () => {
    expect(codes(drive(rollThenFreeze(60, { fog: true }), ARMED).events)).not.toContain(CODE);
    expect(codes(drive(rollThenFreeze(60, { snow: true }), ARMED).events)).not.toContain(CODE);
  });

  it("rain and night do NOT — and that is a deliberate split from the crawl code", () => {
    // `DRIVING_TOO_SLOW_IN_TOWN` accepts both, because чл. 20, ал. 2 orders the
    // driver to fit his SPEED to the conditions and a slower speed in rain is
    // obedience. A dead stop in a live lane is not a slower speed. On the rung
    // this detector is armed for (sc-jx-priority-confidence L5 — rain, with the
    // лепка 9 m behind) it is the more dangerous choice, not the safer one.
    expect(codes(drive(rollThenFreeze(30, { rain: true }), ARMED).events)).toContain(CODE);
    expect(
      codes(drive(rollThenFreeze(30, { isNight: true, headlights: "low" }), ARMED).events),
    ).toContain(CODE);
  });

  it("an armed pedestrian-crossing zone acquits the whole rest inside it", () => {
    // `s.crossing` is the town crawl's own acquittal, reused rather than
    // restated; a hazard-shaped event also opens the harsh-brake cooldown, which
    // this block carries for the same reason.
    const ticks = [
      ...ROLL(0, 4),
      tick(5, {
        speedKmh: 0,
        events: [{ kind: "crossingZoneEntered", crossingId: "x1", pedestrianOnCrossing: true }],
      }),
      ...STAND(6, 30),
    ];
    expect(codes(drive(ticks, ARMED).events)).not.toContain(CODE);
  });

  it("does not double-bill with the crawl code — a standstill is not a crawl", () => {
    // Both codes are второстепенни and both answer „you were obstructing", so a
    // frame that produced both would charge one behaviour twice. It cannot: the
    // crawl needs `moving` and this needs `speed <= fullStopMaxSpeedKmh`, and the
    // two bands do not touch.
    const seen = codes(drive(rollThenFreeze(600), ARMED).events);
    expect(seen).not.toContain("DRIVING_TOO_SLOW_IN_TOWN");
  });
});
