import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";
import type { SimTick } from "../types";

/**
 * ONE ACT, ONE BILL — the 2026-08-22 lane on `rules/engine.ts`.
 *
 * The `collision` case spent three rewrites arriving at a sentence it then
 * wrote down as general: „a contract cannot be the only defence, because the
 * reducer is the one place that survives every reporter." Two whole families
 * had never been given that defence, and both were photographed:
 *
 *  1 · CONTACT WITH A BODY THE GAP CHANNEL CANNOT SPEAK FOR. The shunt fix
 *      (`CONTACT_LEAD_GAP_M`) proved that path length is not separation and
 *      replaced the proxy with a MEASUREMENT — `tick.leadGapM`, which is a
 *      statement about the in-lane vehicle ahead and about nothing else. So a
 *      wall, a pedestrian and a cyclist were sent back to „silence plus 2 m of
 *      path", the rule that had just been shown false, and — worse — to a
 *      daylight latch that reads an ABSENT gap channel as apart, which is the
 *      permanent state of a car grinding along a building.
 *      `.audit-frames/sweep161/sc-signal-flashing/mobile-right/04-t121s.png`:
 *      «Опасни грешки (по 10 изпитни т.) 4 40», three of the four bills being
 *      the same car against the same wall at 0–12 км/ч, printed under the
 *      card's own sentence that the ten points are the price of ONE act.
 *      `sc-ov-oncoming-gap / mobile-wrong` printed fourteen, 141 точки.
 *
 *  2 · A REPORTED JUNCTION ACT. `stopLineCrossed` and `prioritySituation`
 *      billed EVERY report, unconditionally.
 *      `.audit-frames/wave-c/frames/sc-junction-scan__pc-wrong/08-debrief.png`:
 *      «376 наказателни точки · Общо (допустими 9) 60», with «Неспиране на знак
 *      Б2» and «Непълно оглеждане при знак Б2» fourteen rows each — on
 *      `tj-stop-v1`, whose entire road network is four nodes and ONE
 *      intersection, so fourteen bills cannot be fourteen junctions.
 *
 * Every case below is paired with its opposite, so neither fix can be
 * satisfied by never billing anything again.
 */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const billsOf = (code: string, ticks: SimTick[]): number =>
  codes(drive(ticks).events).filter((c) => c === code).length;

/**
 * ONE unbroken contact with one body, `durSec` long, the car creeping forward
 * at `kmh` and the reporter re-firing only every `cadenceSec`. No `leadGapM`
 * channel at all — the normal state of a car against a wall or over a person,
 * and the state the old daylight latch read as „apart".
 */
function scrape(
  withWhat: "staticObject" | "pedestrian" | "cyclist",
  durSec: number,
  kmh: number,
  cadenceSec: number,
): SimTick[] {
  const out: SimTick[] = [];
  let nextReport = 0;
  for (let t = 0; t <= durSec; t += 0.25) {
    const reports = t >= nextReport;
    if (reports) nextReport = t + cadenceSec;
    out.push(
      tick(t, {
        speedKmh: kmh,
        events: reports ? [{ kind: "collision", withWhat }] : [],
      }),
    );
  }
  return out;
}

/**
 * ONE junction control, re-reported at `cadenceSec` for `durSec` while the car
 * drives on at `kmh` — with the road segment named, which is what the shipped
 * runtime does (`SimTick.edgeId`).
 */
function reReportedJunction(
  durSec: number,
  kmh: number,
  cadenceSec: number,
  edgeId: string | undefined = "tj-e-s",
): SimTick[] {
  const out: SimTick[] = [];
  let nextReport = 0;
  for (let t = 0; t <= durSec; t += 0.25) {
    const reports = t >= nextReport;
    if (reports) nextReport = t + cadenceSec;
    out.push(
      tick(t, {
        speedKmh: kmh,
        maxSpeedKmh: 140, // keep the speeding codes out of this suite's way
        ...(edgeId === undefined ? {} : { edgeId }),
        events: reports
          ? [
              { kind: "stopLineCrossed", control: "stopSign" },
              {
                kind: "prioritySituation",
                situation: "give-way",
                violated: true,
              },
            ]
          : [],
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1 · the scrape — one wall, one accident
// ---------------------------------------------------------------------------

describe("contact with a body the gap channel cannot speak for", () => {
  it("a wall scraped for a minute is ONE accident at every reporter cadence", () => {
    // MEASURED before the fix, 60 s of one unbroken contact at 12 км/ч:
    //   cadence  0.5 s → 1 bill · 2 s → 31 · 5 s → 13 · 11 s → 6.
    // The 13 is, to the row, the shape `sc-ov-oncoming-gap` photographed.
    for (const cadenceSec of [0.5, 2, 5, 11]) {
      expect(
        billsOf("COLLISION", scrape("staticObject", 60, 12, cadenceSec)),
      ).toBe(1);
    }
  });

  it("…and so is a person under the wheels, and a cyclist", () => {
    for (const withWhat of ["pedestrian", "cyclist"] as const) {
      for (const cadenceSec of [0.5, 2, 5, 11]) {
        expect(billsOf("COLLISION", scrape(withWhat, 60, 12, cadenceSec))).toBe(
          1,
        );
      }
    }
  });

  it("the verdict no longer depends on which device the student holds", () => {
    // The part-F claim in one assertion: the cadence is a property of the
    // reporter, i.e. of the phone, and the same drive scored 8 on mobile
    // against 1 on desktop because the bill was riding on it.
    const tallies = [0.5, 2, 5, 11].map((c) =>
      billsOf("COLLISION", scrape("staticObject", 60, 12, c)),
    );
    expect(new Set(tallies).size).toBe(1);
  });

  it("100 m of forward path inside the same wall still buys nothing", () => {
    // The direction the old rule got wrong: 60 s at 12 км/ч integrates to 200 m
    // of path, a hundred times COLLISION_REOPEN_TRAVEL_M, every metre of it
    // still against the body being billed for leaving.
    expect((12 / 3.6) * 60).toBeGreaterThan(50 * 2);
    expect(billsOf("COLLISION", scrape("staticObject", 60, 12, 5))).toBe(1);
  });

  // -- and the opposite direction, three ways --------------------------------

  it("a car that BACKS OUT of a wall and drives back in has had TWO accidents", () => {
    // The shipped case the 2 m floor was written to keep billing. Reversing is
    // the one motion a scrape cannot manufacture, so it is the one that still
    // re-arms a body with no gap channel.
    const ticks: SimTick[] = [
      tick(0, {
        speedKmh: 20,
        events: [{ kind: "collision", withWhat: "staticObject" }],
      }),
    ];
    for (let t = 0.25; t <= 3; t += 0.25) ticks.push(tick(t, { speedKmh: -3 }));
    ticks.push(
      tick(3.25, {
        speedKmh: 10,
        events: [{ kind: "collision", withWhat: "staticObject" }],
      }),
    );
    expect(billsOf("COLLISION", ticks)).toBe(2);
  });

  it("…and so has one whose road ahead was MEASURED clear in between", () => {
    // The other re-arm: an AFFIRMATIVE gap reading. This is the guardrail-scrape
    // drive of engine.test.ts — 30 км/ч with 40 m of open road ahead — and it
    // must keep costing its second ten, because the world really did say the
    // car was in the clear between the two reports.
    const ticks: SimTick[] = [
      tick(0, {
        speedKmh: 30,
        leadGapM: 40,
        events: [{ kind: "collision", withWhat: "staticObject" }],
      }),
      tick(0.5, {
        speedKmh: 30,
        leadGapM: 40,
        events: [{ kind: "collision", withWhat: "staticObject" }],
      }),
    ];
    for (let t = 1; t < 2.5; t += 0.5)
      ticks.push(tick(t, { speedKmh: 30, leadGapM: 40 }));
    ticks.push(
      tick(2.5, {
        speedKmh: 30,
        leadGapM: 40,
        events: [{ kind: "collision", withWhat: "staticObject" }],
      }),
    );
    expect(billsOf("COLLISION", ticks)).toBe(2);
  });

  it("a SECOND, different body billed inside the same scrape still costs its own ten", () => {
    // The acquittal a shared latch bought once already (the man dragged along
    // after a car crash). One long contact with a wall, and a person struck in
    // the middle of it: two rows, and the sheet names both.
    const ticks = scrape("staticObject", 60, 12, 5);
    ticks[80] = tick(ticks[80].t, {
      speedKmh: 12,
      events: [{ kind: "collision", withWhat: "pedestrian" }],
    });
    const rows = drive(ticks).events.filter(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => (r.kind === "violation" ? r.detail : null))).toEqual(
      ["staticObject", "pedestrian"],
    );
  });
});

// ---------------------------------------------------------------------------
// 2 · the junction act — one control, one bill
// ---------------------------------------------------------------------------

describe("a junction control re-reported", () => {
  it("one Б2 line re-reported for a whole lesson is ONE опасна, not fourteen", () => {
    // MEASURED before the fix, 205 s on ONE segment at 60 км/ч:
    //   cadence 0.25 s → 821 bills · 1 s → 206 · 4 s → 52 · 15 s → 14.
    // The 14 is the row count on the photographed sc-junction-scan debrief, on
    // a map with exactly one intersection in it.
    for (const cadenceSec of [0.25, 1, 4, 15]) {
      expect(
        billsOf(
          "STOP_SIGN_NO_FULL_STOP",
          reReportedJunction(205, 60, cadenceSec),
        ),
      ).toBe(1);
    }
  });

  it("…and the priority conflict at the same mouth is ONE опасна too", () => {
    for (const cadenceSec of [0.25, 1, 4, 15]) {
      expect(
        billsOf("FAILED_TO_YIELD", reReportedJunction(205, 60, cadenceSec)),
      ).toBe(1);
    }
  });

  it("the verdict no longer depends on the reporter's cadence", () => {
    const tallies = [0.25, 1, 4, 15].map((c) =>
      billsOf("STOP_SIGN_NO_FULL_STOP", reReportedJunction(205, 60, c)),
    );
    expect(new Set(tallies).size).toBe(1);
  });

  it("the COMMENDATION does not stack either — one stop, one БРАВО", () => {
    // Credit read off the debrief is the same defect pointed the other way: a
    // student who stopped once must not collect fourteen «Правилно спиране».
    const ticks: SimTick[] = [];
    for (let t = 0; t <= 8; t += 0.25) {
      ticks.push(
        tick(t, {
          speedKmh: t < 3 ? 0 : 4,
          edgeId: "tj-e-s",
          events:
            t >= 3 && t % 1 === 0
              ? [{ kind: "stopLineCrossed", control: "stopSign" }]
              : [],
        }),
      );
    }
    expect(billsOf("FULL_STOP_AT_STOP_SIGN", ticks)).toBe(1);
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", ticks)).toBe(0);
  });

  // -- and the opposite direction --------------------------------------------

  it("two REAL junctions, one per road segment, still bill twice", () => {
    // The guard against the naive fix. A junction IS a node and an edge runs
    // node to node, so two controlled approaches are never on one segment —
    // which is exactly why the segment can be asked the question.
    const ticks: SimTick[] = [];
    for (let t = 0; t <= 20; t += 0.25) {
      const atLine = t === 0 || t === 10;
      ticks.push(
        tick(t, {
          speedKmh: 40,
          maxSpeedKmh: 140,
          edgeId: t < 10 ? "edge-a" : "edge-b",
          events: atLine
            ? [
                { kind: "stopLineCrossed", control: "stopSign" },
                {
                  kind: "prioritySituation",
                  situation: "give-way",
                  violated: true,
                },
              ]
            : [],
        }),
      );
    }
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", ticks)).toBe(2);
    expect(billsOf("FAILED_TO_YIELD", ticks)).toBe(2);
  });

  it("a source that names no segment still bills two junctions a block apart", () => {
    // Legacy ticks (hand-built, recorded traces, the pre-C1 sources) assert
    // nothing about the road, so the distance floor is left in charge alone —
    // 111 m of driving between the two lines is far past ACT_REOPEN_TRAVEL_M.
    const ticks: SimTick[] = [];
    for (let t = 0; t <= 20; t += 0.25) {
      ticks.push(
        tick(t, {
          speedKmh: 40,
          maxSpeedKmh: 140,
          events:
            t === 0 || t === 10
              ? [{ kind: "stopLineCrossed", control: "stopSign" }]
              : [],
        }),
      );
    }
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", ticks)).toBe(2);
  });

  it("two DIFFERENT situations at one mouth remain two distinct faults", () => {
    // The act key carries the situation, because a give-way slip and a
    // right-hand-rule slip are two laws and two lessons — the OV-04/SPEEDING
    // precedent. Only the SAME situation re-reported is one act.
    const ticks: SimTick[] = [
      tick(0, {
        speedKmh: 20,
        edgeId: "edge-a",
        events: [
          { kind: "prioritySituation", situation: "give-way", violated: true },
          {
            kind: "prioritySituation",
            situation: "right-hand-rule",
            violated: true,
          },
        ],
      }),
    ];
    expect(billsOf("FAILED_TO_YIELD", ticks)).toBe(2);
  });

  it("a RE-STAGED encounter at the same junction convicts again", () => {
    // The drive the segment conjunct is false for, and the reason `restagedJump`
    // exists: the orchestrator retries an encounter by resetting the director
    // and dropping the driver back up the SAME approach arm, so the car is at a
    // junction it has not been graded at while every latch says otherwise
    // (`orchestrator/__tests__/oncoming-left-turn.test.ts`).
    const line = (t: number, y: number): SimTick =>
      tick(t, {
        speedKmh: 40,
        maxSpeedKmh: 140,
        edgeId: "east-arm",
        position: { x: 0, y },
        events: [{ kind: "stopLineCrossed", control: "stopSign" }],
      });
    const ticks: SimTick[] = [line(0, 0)];
    for (let t = 0.25; t <= 2; t += 0.25) {
      ticks.push(
        tick(t, {
          speedKmh: 40,
          maxSpeedKmh: 140,
          edgeId: "east-arm",
          position: { x: 0, y: t * 11 },
        }),
      );
    }
    // …the world puts the car back 112 m up the arm, and it drives up again.
    ticks.push(line(2.25, -112));
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", ticks)).toBe(2);

    // Counter-proof on the identical shape: WITHOUT the jump, the same second
    // report off the same segment fix is the same act and bills once.
    const noJump = [...ticks.slice(0, -1), line(2.25, 2 * 11)];
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", noJump)).toBe(1);
  });

  it("FIVE cyclists passed lawfully in one cluster are FIVE commendations", () => {
    // The floor's justification is „you cannot reach a second CONTROL without
    // driving the road between them" — a statement about PLACES. The four
    // manoeuvre situations are adjudicated against a BODY instead, and
    // `sc-vu-cyclist-group` rides five of them through one 40 m cluster. A
    // place-shaped latch collapsed them to one (measured: 1 instead of 5), and
    // the counter-proof lesson lost its VULNERABLE_PASS_TOO_CLOSE toasts with
    // it — credit and conviction both deleted for riders two through five.
    const ticks: SimTick[] = [];
    for (let t = 0; t <= 5; t += 0.5) {
      ticks.push(
        tick(t, {
          speedKmh: 30,
          edgeId: "edge-a",
          events:
            t % 1 === 0
              ? [
                  {
                    kind: "prioritySituation",
                    situation: "vulnerable-pass",
                    violated: false,
                    yielded: true,
                  },
                ]
              : [],
        }),
      );
    }
    expect(billsOf("YIELDED_TO_PRIORITY", ticks)).toBe(6);
    // …and the same for the conviction side of the same situation.
    const bad = ticks.map((f) => ({
      ...f,
      events: f.events.map((e) =>
        e.kind === "prioritySituation"
          ? { kind: "prioritySituation" as const, situation: "vulnerable-pass", violated: true }
          : e,
      ),
    }));
    expect(billsOf("VULNERABLE_PASS_TOO_CLOSE", bad)).toBe(6);
  });

  it("the SIGNAL verdicts are left exactly as they shipped", () => {
    // SCOPE DISCIPLINE. The latch answers a photographed defect, and the codes
    // it was photographed on are the Б2 verdict, the junction scan and the
    // junction priority — every repeat row in the sweep is one of those three.
    // A signal verdict billed twice for one crossing appears in no frame in the
    // catalogue, and latching it on suspicion deleted the second red of the
    // shipped repeat-penalty escalation (`lessons/__tests__/
    // teach-escalation.test.ts`). So the signal family is untouched, and this
    // pins that it stays untouched.
    const ticks: SimTick[] = [];
    for (let t = 0; t <= 6; t += 1) {
      ticks.push(
        tick(t, {
          speedKmh: 0,
          edgeId: "edge-a",
          events:
            t === 1 || t === 5
              ? [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }]
              : [],
        }),
      );
    }
    expect(billsOf("RED_LIGHT_CROSSED", ticks)).toBe(2);
    // …while the Б2 verdict on the identical, motionless shape is ONE act.
    const b2 = ticks.map((f) => ({
      ...f,
      events: f.events.map(() => ({
        kind: "stopLineCrossed" as const,
        control: "stopSign" as const,
      })),
    }));
    // (motionless at the line means the stop QUALIFIES, so the act's outcome
    // here is the commendation — one act, one verdict, whichever way it goes.)
    expect(billsOf("FULL_STOP_AT_STOP_SIGN", b2) + billsOf("STOP_SIGN_NO_FULL_STOP", b2)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3 · the parts of the latch nothing was watching (adversarial pass 2026-08-22)
// ---------------------------------------------------------------------------
//
// Every assertion below was written after breaking the shipped file and finding
// the suite still green, or after measuring a drive the suite never drove.
// MEASURED on the file as it arrived: `ACT_REOPEN_TRAVEL_M` set to 0, and the
// whole distance conjunct deleted (`if (sameEdge) return;`), each left all 798
// rules tests passing — the number carrying four hundred words of justification
// was guarded by nothing at all. And the re-approach below billed 1 instead of
// 2, and paid 0 commendations instead of 1.

describe("the act latch, pushed on", () => {
  /** One control, re-reported `n` times `gapSec` apart, from a source that
   *  names NO road segment — a recorded trace, a hand-built tick, any pre-C1
   *  engine. The distance floor is the entire defence these drives have. */
  function noSegmentReReport(gapSec: number, kmh: number, n: number): SimTick[] {
    const out: SimTick[] = [];
    const lines = new Set<number>();
    for (let i = 0; i < n; i += 1) lines.add(Number((i * gapSec).toFixed(2)));
    for (let t = 0; t <= (n - 1) * gapSec + 1; t = Number((t + 0.25).toFixed(2))) {
      out.push(
        tick(t, {
          speedKmh: kmh,
          maxSpeedKmh: 140,
          events: lines.has(t) ? [{ kind: "stopLineCrossed", control: "stopSign" }] : [],
        }),
      );
    }
    return out;
  }

  it("a segment-less source re-reporting inside the floor is still ONE act", () => {
    // 0.25 s apart at 36 км/ч = 2.5 m of path per report, 17.5 m across all
    // eight — inside ACT_REOPEN_TRAVEL_M. Nothing pinned this before: the
    // suite's only segment-less case drove 111 m between its two lines, i.e. it
    // pinned the floor being CLEARED and never once pinned it holding.
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", noSegmentReReport(0.25, 36, 8))).toBe(1);
  });

  it("and on a segment-less source that is ALL the latch is — say it out loud", () => {
    // THE RESIDUE, pinned rather than left to be rediscovered. „One act, one
    // bill" is a property of the SEGMENT conjunct; a source that names no road
    // keeps re-arming every ACT_REOPEN_TRAVEL_M of path, so the same control
    // re-reported down a long straight still stacks — 55 m of driving, three
    // bills. Live drives always carry `edgeId` (worldRuntime feeds the
    // locator's fix, string or null), so this is the recorded-trace and
    // hand-built-tick path only. If a replay source is ever graded for score,
    // this line is the one that will fail, and it should.
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", noSegmentReReport(0.5, 36, 12))).toBe(3);
  });

  it("…and the floor is a real number, not a formality", () => {
    // Straddles ACT_REOPEN_TRAVEL_M from both sides on one drive shape: 19 m of
    // path between reports is one act, 30 m is two. A floor of 0 fails the
    // first line; a floor big enough to hide the defect fails the second.
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", noSegmentReReport(1.9, 36, 2))).toBe(1);
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", noSegmentReReport(3, 36, 2))).toBe(2);
  });

  it("a car that is NOWHERE cannot be at a second junction, however far it drives", () => {
    // `edgeId: null` is the locator SAYING „more than 30 m from every
    // centerline" (locator.ts), and it is the shape of the photographed
    // runaway: `sc-junction-gap / mobile-wrong` leaves the district at 58 км/ч
    // and is sentenced out there for eighty seconds. The distance floor cannot
    // save that drive — 20 m of path costs it 1.2 s — so null matches null and
    // the act stays shut. This is behaviour the file must keep on purpose, not
    // an accident of `null === null`.
    const out: SimTick[] = [];
    for (let t = 0; t <= 100; t += 0.25) {
      out.push(
        tick(t, {
          speedKmh: 58,
          maxSpeedKmh: 140,
          edgeId: null,
          events: t % 5 === 0 ? [{ kind: "stopLineCrossed", control: "stopSign" }] : [],
        }),
      );
    }
    // 1.6 km of driving, twenty-one reports, one bill.
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", out)).toBe(1);
  });

  // -- the re-approach, which is the exercise in nineteen lessons -------------

  /** Roll through the Б2 at `kmh`, reverse `backM` back up the SAME arm, come
   *  forward and cross it again — `stopSec` of full stop at the line first. */
  function reApproach(backM: number, stopSec: number): SimTick[] {
    const out: SimTick[] = [];
    const line = (t: number, y: number, kmh: number): SimTick =>
      tick(t, {
        speedKmh: kmh,
        maxSpeedKmh: 140,
        edgeId: "east-arm",
        position: { x: 0, y },
        events: [{ kind: "stopLineCrossed", control: "stopSign" }],
      });
    out.push(line(0, 0, 20));
    let t = 0.5;
    let y = 0;
    const step = backM / 20;
    for (let i = 0; i < 20; i += 1, t += 0.5) {
      y -= step;
      out.push(
        tick(t, { speedKmh: -(step * 2 * 3.6), maxSpeedKmh: 140, edgeId: "east-arm", gear: -1, position: { x: 0, y } }),
      );
    }
    for (let i = 0; i < 20; i += 1, t += 0.5) {
      y += step;
      out.push(
        tick(t, { speedKmh: step * 2 * 3.6, maxSpeedKmh: 140, edgeId: "east-arm", position: { x: 0, y } }),
      );
    }
    for (let i = 0; i < stopSec * 2; i += 1, t += 0.5) {
      out.push(tick(t, { speedKmh: 0, maxSpeedKmh: 140, edgeId: "east-arm", position: { x: 0, y } }));
    }
    out.push(line(t, y, stopSec > 0 ? 5 : 20));
    return out;
  }

  it("rolling through the same Б2 TWICE, with a reverse in between, costs TWO", () => {
    // `STOP_LINE_REFIRE_SEC = 5` in worldRuntime says it out loud — „a genuine
    // re-approach takes longer anyway" — so the reporter fires again and the
    // reducer must not silently overrule it. The car is on the same segment
    // both times and the segment conjunct short-circuits the distance floor,
    // which is why the reverse odometer is the thing asked.
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", reApproach(25, 0))).toBe(2);
  });

  it("…and a student who backs up and then STOPS PROPERLY gets his «БРАВО»", () => {
    // THE ONE THAT MATTERS. Doc 64 THEO-4: the product is a virtual instructor
    // that explains every decision. It taught him at the line, he went back and
    // did it right, and a shared act key spent on the violation deleted the
    // commendation — the screen said nothing at all about the corrected act.
    const ticks = reApproach(25, 4);
    expect(billsOf("FULL_STOP_AT_STOP_SIGN", ticks)).toBe(1);
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", ticks)).toBe(1);
  });

  it("but jitter at the line is not a re-approach — 5 m of shunt buys nothing", () => {
    // The opposite direction, and the reason the reverse floor is 20 m rather
    // than the collision floor's 2: a car rolling back a car-length at a mouth
    // must not be able to re-arm the act it is standing on.
    expect(billsOf("STOP_SIGN_NO_FULL_STOP", reApproach(5, 0))).toBe(1);
  });
});
