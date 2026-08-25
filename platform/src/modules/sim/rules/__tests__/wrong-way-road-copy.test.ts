/**
 * THE CARD NAMES THE ROAD HE IS ON — WRONG_WAY, w10-4, 2026-08-25
 * (sc-merge-accel-lane:93685d58).
 *
 * THE FRAME. `.audit-frames/w10-4/frames/sc-merge-accel-lane__mobile-wrong/
 * 08-debrief-p6.png` + `_audit-debrief.json`: SIX cards reading «Движение в
 * обратна посока по еднопосочна улица … Движеше се срещу платното на
 * еднопосочна улица», in «Включване в магистрала през лентата за ускоряване»,
 * on a sheet that also bills «Движение по аварийната лента». No street, no В2,
 * no one-way sign exists anywhere in that district.
 *
 * The MARK is not in dispute and is not touched here. Наредба № 38, прил. № 5,
 * т. 10, б. „в" names „пътен възел ИЛИ път с еднопосочно движение" — the
 * interchange first — so 10 изпитни точки, опасна, that citation, all stand.
 * What was wrong is the sentence: it was written for the other half of the
 * clause and describes a place the student was never in.
 *
 * ── AND THE CHANNEL, WHICH IS WHY THIS FILE HAS A §2 ──
 *
 * The first cut of this repair rode `makeViolation`'s `titleBg`/
 * `explanationBg` override. The verifier ran the wire and neither field is on
 * it: `serializeRuleEvents` carries `kind`, `code`, `t`, `detail`,
 * `penaltyMultiplier`, `x/y`, so `rebuildRuleEvents` reconstructed the pooled
 * street row server-side and ONE end screen printed «…по автомагистрала» in
 * «Грешки» (client events) beside «…по еднопосочна улица» in «Разбор» (server
 * rebuild). Every case in §1 was green while that was true, which is the whole
 * lesson: a copy test that never crosses the wire measures half a product.
 * §2 is the half that catches it, and it is the same round trip
 * `yield-praise-situation-copy` runs for the commendation that was burned
 * first.
 *
 * WHAT EACH CASE HOLDS, and each fails in one direction on the pre-fix build:
 *   1. a motorway bill says «автомагистрала» and never «еднопосочна улица»;
 *   2. a street bill is byte-identical to shipped (the catalogue row);
 *   3. `tick.motorway` ABSENT is „unknown", not „no" — it keeps the street
 *      copy AND stamps no `detail`, so every recorded trace and hand-built
 *      tick is unchanged on the wire as well as on glass;
 *   4. the mark itself did not move on either road — same code, same class,
 *      same points, same citation;
 *   5. the CATALOGUE corrective, which has no per-event channel, no longer
 *      orders a reverse. On a motorway that is ЗДвП чл. 58, т. 1 given as
 *      advice, and it is the one string both roads have to be true of;
 *   6. §2 — the server's rebuild of the same drive says the same sentence;
 *   7. §2 — an unknown road name falls back to the pooled row rather than to
 *      silence, on both sides, which is what makes the wire field safe to
 *      trust (a forged value can only pick another row of one table).
 */

import { describe, expect, it } from "vitest";

import { VIOLATIONS, WRONG_WAY_ROAD_MOTORWAY } from "../catalog";
import { createRuleEngine, reduceTick } from "../engine";
// Through the module's PUBLIC index, not `lessons/wire` directly — doc 05 §
// „modules talk only through their index.ts". Both names are exported there.
import { rebuildRuleEvents, serializeRuleEvents } from "../../lessons";
import type { RuleEngineState, SimTick, ViolationEvent } from "../index";

function tickAt(t: number, over: Partial<SimTick> = {}): SimTick {
  return {
    t,
    speedKmh: 60,
    maxSpeedKmh: 140,
    position: { x: 0, y: t * 16 },
    headingDeg: 0,
    laneOffsetM: 0,
    laneId: 0,
    gear: 1,
    seatbeltOn: true,
    handbrakeOn: false,
    headlights: "off",
    isNight: false,
    indicator: "off",
    events: [],
    ...over,
  } as SimTick;
}

/**
 * Drive the wrong way for longer than `wrongWaySustainSec` (1.5 s) and collect
 * what the reducer bills. `road` is the ONLY thing that differs between the
 * runs — same speed, same gear, same duration.
 */
function driveWrongWay(road: Partial<SimTick>): ViolationEvent[] {
  let s: RuleEngineState = createRuleEngine();
  const out: ViolationEvent[] = [];
  for (const t of [0, 0.5, 1, 1.5, 2, 2.5]) {
    const r = reduceTick(s, tickAt(t, { wrongWay: true, ...road }));
    s = r.state;
    for (const e of r.events) if (e.kind === "violation" && e.code === "WRONG_WAY") out.push(e);
  }
  return out;
}

describe("WRONG_WAY names the road the student is on", () => {
  it("bills the motorway wording on an authored motorway edge", () => {
    const bills = driveWrongWay({ motorway: true });
    expect(bills.length).toBeGreaterThan(0);
    const card = bills[0]!;
    expect(card.titleBg).toContain("автомагистрала");
    expect(card.titleBg).not.toContain("еднопосочна улица");
    expect(card.explanationBg).toContain("автомагистрала");
    expect(card.explanationBg).not.toContain("еднопосочна улица");
  });

  it("keeps the shipped street wording where the road is a street", () => {
    const bills = driveWrongWay({ motorway: false, maxSpeedKmh: 50 });
    expect(bills.length).toBeGreaterThan(0);
    expect(bills[0]!.titleBg).toBe(VIOLATIONS.WRONG_WAY.titleBg);
    expect(bills[0]!.explanationBg).toBe(VIOLATIONS.WRONG_WAY.explanationBg);
    expect(bills[0]!.detail).toBeUndefined();
  });

  it("treats an ABSENT `motorway` flag as unknown, not as motorway", () => {
    // Every hand-built tick, every recorded trace and every pre-slice map is in
    // this case; it must be bit-identical to shipped — including the wire,
    // where an added `detail` would be new bytes on drives that never had one.
    const bills = driveWrongWay({});
    expect(bills.length).toBeGreaterThan(0);
    expect(bills[0]!.titleBg).toBe(VIOLATIONS.WRONG_WAY.titleBg);
    expect(bills[0]!.detail).toBeUndefined();
    expect(serializeRuleEvents([bills[0]!])[0]).toEqual({
      kind: "violation",
      code: "WRONG_WAY",
      t: bills[0]!.t,
    });
  });

  it("moves the wording and NOTHING about the mark", () => {
    const mw = driveWrongWay({ motorway: true })[0]!;
    const street = driveWrongWay({ motorway: false })[0]!;
    for (const card of [mw, street]) {
      expect(card.code).toBe("WRONG_WAY");
      expect(card.severityClass).toBe(VIOLATIONS.WRONG_WAY.severityClass);
      expect(card.points).toBe(VIOLATIONS.WRONG_WAY.points);
      expect(card.lawRef).toBe(VIOLATIONS.WRONG_WAY.lawRef);
    }
  });

  it("never tells a student to reverse, because the corrective cannot split", () => {
    // `correctiveBg` is read from the catalogue BY CODE at display time, so the
    // motorway drive gets this exact string. „излез внимателно на заден ход" was
    // ЗДвП чл. 58, т. 1 handed over as advice at 140 км/ч closing speeds.
    const corrective = VIOLATIONS.WRONG_WAY.correctiveBg ?? "";
    expect(corrective).toContain("магистрала");
    expect(corrective).toContain("чл. 58");
    // The street half is still taught — the В2 read at the mouth of a street.
    expect(corrective).toContain("В2");
    // …and the reverse is now scoped to the street, never offered flat.
    expect(corrective).not.toContain("Влязъл ли си вече — спри веднага");
  });
});

// ---------------------------------------------------------------------------
// 2. THE WIRE — the half that made the first cut of this repair a PARTIAL
// ---------------------------------------------------------------------------

describe("and the server's rebuild says the same sentence, not a second one", () => {
  it("the road survives serialize → rebuild, title and explanation both", () => {
    // «Грешки» is built from the client's own events; «Разбор» (debrief.ts
    // `worst.titleBg`) and the session history are built from THIS rebuild. If
    // the two disagree the end screen prints two names for one act a few
    // centimetres apart — wire.ts's own words at its `situation` channel.
    const client = driveWrongWay({ motorway: true })[0]!;
    const wire = serializeRuleEvents([client]);
    expect(wire[0]!.detail).toBe(WRONG_WAY_ROAD_MOTORWAY);
    const rebuilt = rebuildRuleEvents(wire);
    expect(rebuilt).not.toBeNull();
    const server = rebuilt![0] as ViolationEvent;
    expect(server.titleBg).toBe(client.titleBg);
    expect(server.explanationBg).toBe(client.explanationBg);
    expect(server.titleBg).toContain("автомагистрала");
    // The mark is rebuilt from `code` alone, as it always was.
    expect(server.points).toBe(VIOLATIONS.WRONG_WAY.points);
    expect(server.severityClass).toBe(VIOLATIONS.WRONG_WAY.severityClass);
    expect(server.lawRef).toBe(VIOLATIONS.WRONG_WAY.lawRef);
  });

  it("a street drive rebuilds to the shipped row, byte for byte", () => {
    const client = driveWrongWay({ motorway: false })[0]!;
    const rebuilt = rebuildRuleEvents(serializeRuleEvents([client]));
    const server = rebuilt![0] as ViolationEvent;
    expect(server.titleBg).toBe(VIOLATIONS.WRONG_WAY.titleBg);
    expect(server.explanationBg).toBe(VIOLATIONS.WRONG_WAY.explanationBg);
  });

  it("an unknown road name lands on the pooled row on BOTH sides, never on silence", () => {
    // What makes this field safe to accept from a client: a forged `detail` can
    // only select another row of one table, and an unrecognised one falls back
    // to the catalogue row. It can never reach a point, a verdict or a penalty.
    const rebuilt = rebuildRuleEvents([
      { kind: "violation", code: "WRONG_WAY", t: 2, detail: "не-съществуващ-път" },
    ]);
    const server = rebuilt![0] as ViolationEvent;
    expect(server.titleBg).toBe(VIOLATIONS.WRONG_WAY.titleBg);
    expect(server.points).toBe(VIOLATIONS.WRONG_WAY.points);
  });
});
