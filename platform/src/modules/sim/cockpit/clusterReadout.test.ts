// The state→display law of the 3D „Виток" cluster.
//
// These are the founder's reel complaints written as assertions. He reviewed
// every reel and concluded the dashboard needed a complete 3D redesign; the
// three specific failures he named were (a) an unbelted driver signalled only
// by „some footer dashboard stating Belt in Red — unacceptable", and (b) three
// speed/gear reels that were unreadable because the clip had no instrument in
// it. The geometry answers those, but geometry is only as honest as the law
// that decides what lights up — so that law is pure and pinned here.
//
// Nothing in this file touches the rule engine. The cluster reads vehicle state
// that already existed and grades nothing; no verdict can move because of it.

import { describe, expect, it } from "vitest";
import {
  clusterReadout,
  clusterReadoutHash,
  createClusterInputs,
  createClusterReadout,
  gearGlyph,
  lampBank,
  litTickCount,
  speedDigits,
  type ClusterInputs,
  type LampBank,
} from "./clusterReadout";
import { DIAL_MAX_KMH, LAMP_KEYS, TICK_COUNT } from "./clusterLayout";

/** A car being driven normally: belted, running, rolling, nothing wrong. */
function nominal(): ClusterInputs {
  return {
    ...createClusterInputs(),
    speedKmh: 50,
    gearLabel: "D",
    seatbeltOn: true,
    parkingBrakeOn: false,
    engineOn: true,
  };
}

function bank(input: ClusterInputs): LampBank {
  return lampBank(input, createClusterReadout().lamps);
}

describe("speed digits", () => {
  it("right-aligns into exactly the cells the readout owns", () => {
    expect(speedDigits(7)).toEqual([" ", " ", "7"]);
    expect(speedDigits(48)).toEqual([" ", "4", "8"]);
    expect(speedDigits(130)).toEqual(["1", "3", "0"]);
  });

  it("never renders a sign — a speedometer shows magnitude, so reverse reads up", () => {
    // Reversing at 8 km/h is still „8" on the dial, exactly as in a real car.
    expect(speedDigits(-8)).toEqual([" ", " ", "8"]);
    expect(speedDigits(-14)).toEqual([" ", "1", "4"]);
  });

  it("never renders a minus-zero from physics drift around standstill", () => {
    // A stopped car jitters either side of zero; the cluster must read 0, and
    // the minus sign must never flicker into a digit cell.
    expect(speedDigits(-0.4)).toEqual([" ", " ", "0"]);
    expect(speedDigits(0.4)).toEqual([" ", " ", "0"]);
    expect(speedDigits(0)).toEqual([" ", " ", "0"]);
  });

  it("clamps rather than overflowing its cells", () => {
    // An absurd value must not push a fourth character into a three-cell
    // readout — the quads are built once and there is no fourth quad.
    expect(speedDigits(99_999)).toEqual(["9", "9", "9"]);
    expect(speedDigits(1000)).toEqual(["9", "9", "9"]);
  });

  it("rounds to the nearest whole km/h", () => {
    expect(speedDigits(49.6)).toEqual([" ", "5", "0"]);
    expect(speedDigits(49.4)).toEqual([" ", "4", "9"]);
  });
});

describe("gear glyph", () => {
  it("shows the selector gate the driver is in", () => {
    expect(gearGlyph("P")).toBe("P");
    expect(gearGlyph("R")).toBe("R");
    expect(gearGlyph("N")).toBe("N");
    expect(gearGlyph("D")).toBe("D");
  });

  it("manual mode shows the gate letter, not the ratio", () => {
    // „M2" → „M": the cluster's job is WHICH GATE, and the big letter must not
    // trade legibility for a detail. This is one of the unreadable reels.
    expect(gearGlyph("M2")).toBe("M");
    expect(gearGlyph("M4")).toBe("M");
  });

  it("an empty label falls back to N rather than drawing nothing", () => {
    // A blank gear cell reads as a broken instrument; neutral is the honest
    // default and the atlas has a cell for it.
    expect(gearGlyph("")).toBe("N");
  });
});

describe("dial tick fill", () => {
  it("tick 0 stays lit at standstill — the dial is never a dead instrument", () => {
    expect(litTickCount(0)).toBe(1);
  });

  it("fills proportionally, so a small reel frame still reads a RATE", () => {
    // 17 ticks over 160 km/h: 16 spans, one per 10 km/h, plus the always-lit 0.
    expect(litTickCount(10)).toBe(2);
    expect(litTickCount(50)).toBe(6);
    expect(litTickCount(80)).toBe(9);
  });

  it("saturates at full scale and clamps beyond it", () => {
    expect(litTickCount(DIAL_MAX_KMH)).toBe(TICK_COUNT);
    expect(litTickCount(DIAL_MAX_KMH * 3)).toBe(TICK_COUNT);
  });

  it("reverse fills by magnitude, matching the digits", () => {
    expect(litTickCount(-50)).toBe(litTickCount(50));
  });

  it("is monotonic across the whole range — the arc never runs backwards", () => {
    let prev = 0;
    for (let v = 0; v <= DIAL_MAX_KMH; v += 1) {
      const n = litTickCount(v);
      expect(n).toBeGreaterThanOrEqual(prev);
      expect(n).toBeLessThanOrEqual(TICK_COUNT);
      prev = n;
    }
  });
});

describe("telltale bank", () => {
  it("THE BELT LESSON: unbelted lights red AND pulses", () => {
    // The founder's „unacceptable" verdict was aimed at a footer label. A
    // warning has to behave like a warning: red tone, and pulsing, because a
    // pulsing lamp is an instruction where a steady one is only information.
    const lamps = bank({ ...nominal(), seatbeltOn: false });
    expect(lamps.belt.tone).toBe("warn");
    expect(lamps.belt.pulse).toBe(true);
  });

  it("belting up extinguishes the lamp completely", () => {
    const lamps = bank({ ...nominal(), seatbeltOn: true });
    expect(lamps.belt.tone).toBe("off");
    expect(lamps.belt.pulse).toBe(false);
  });

  it("READINESS: ignition on with the engine not running lights oil + battery red", () => {
    // Exactly what a real car does, and exactly the pre-drive fact the
    // readiness reel teaches — with no new data channel invented for it.
    const lamps = bank({ ...nominal(), engineOn: false });
    expect(lamps.oil.tone).toBe("warn");
    expect(lamps.battery.tone).toBe("warn");
    expect(lamps.engine.tone).toBe("caution");
  });

  it("firing the engine extinguishes oil, battery and the check-engine lamp", () => {
    const lamps = bank({ ...nominal(), engineOn: true });
    expect(lamps.oil.tone).toBe("off");
    expect(lamps.battery.tone).toBe("off");
    expect(lamps.engine.tone).toBe("off");
  });

  it("a stall pulses the check-engine lamp — it just happened to the driver", () => {
    const lamps = bank({ ...nominal(), engineOn: false, stalled: true });
    expect(lamps.engine.tone).toBe("caution");
    expect(lamps.engine.pulse).toBe(true);
  });

  it("the parking brake lamp is steady, not pulsing", () => {
    // Steady = a state you are in. Pulsing is reserved for the lamp that is the
    // LESSON, so overusing it would cost the belt warning its urgency.
    const lamps = bank({ ...nominal(), parkingBrakeOn: true });
    expect(lamps.brake.tone).toBe("warn");
    expect(lamps.brake.pulse).toBe(false);
  });

  it("THE STAGED TELLTALE (VP-06): the director's red lamp pulses", () => {
    const lamps = bank({ ...nominal(), tempWarnOn: true });
    expect(lamps.temp.tone).toBe("warn");
    expect(lamps.temp.pulse).toBe(true);
    expect(bank({ ...nominal(), tempWarnOn: false }).temp.tone).toBe("off");
  });

  it("turn arrows follow the cabin's own blink clock and are never re-pulsed", () => {
    // The lamp level for THIS frame already comes from the real 600 ms relay;
    // a second pulse here would beat against it and read as a fault.
    const left = bank({ ...nominal(), indicatorLeftLit: true });
    expect(left.arrowLeft.tone).toBe("go");
    expect(left.arrowLeft.pulse).toBe(false);
    expect(left.arrowRight.tone).toBe("off");

    const right = bank({ ...nominal(), indicatorRightLit: true });
    expect(right.arrowRight.tone).toBe("go");
    expect(right.arrowLeft.tone).toBe("off");
  });

  it("a nominal car shows a completely dark rail", () => {
    // „Nothing is wrong" has to be legible too, or every frame looks alarming
    // and no single lamp can carry a lesson.
    const lamps = bank(nominal());
    for (const key of LAMP_KEYS) expect(lamps[key].tone).toBe("off");
  });

  it("an extinguished lamp can never keep a stale pulse", () => {
    const lamps = createClusterReadout().lamps;
    lampBank({ ...nominal(), seatbeltOn: false }, lamps);
    expect(lamps.belt.pulse).toBe(true);
    // Same object reused (the allocation-free frame path) — buckling up must
    // clear both fields, not just the tone.
    lampBank({ ...nominal(), seatbeltOn: true }, lamps);
    expect(lamps.belt.tone).toBe("off");
    expect(lamps.belt.pulse).toBe(false);
  });

  it("covers every lamp the geometry builds a slot for", () => {
    // A lamp with a quad but no law would render permanently dark; a lamp with
    // a law but no quad would silently never appear.
    const lamps = bank(nominal());
    expect(Object.keys(lamps).sort()).toEqual([...LAMP_KEYS].sort());
  });
});

describe("full readout", () => {
  it("fills the caller's object and allocates nothing new", () => {
    // The frame loop calls this every frame; anything that allocates here shows
    // up as GC judder in a recorded reel.
    const out = createClusterReadout();
    const digits = out.digits;
    const lamps = out.lamps;
    const result = clusterReadout({ ...nominal(), speedKmh: 42 }, out);
    expect(result).toBe(out);
    expect(result.digits).toBe(digits);
    expect(result.lamps).toBe(lamps);
    expect(result.digits).toEqual([" ", "4", "2"]);
    expect(result.gearChar).toBe("D");
  });

  it("the cold-car default is the honest A1 spawn state", () => {
    // The frame or two before the scene first writes must not claim the car is
    // ready to drive: engine off, in P, brake on, unbelted.
    const out = clusterReadout(createClusterInputs(), createClusterReadout());
    expect(out.gearChar).toBe("P");
    expect(out.digits).toEqual([" ", " ", "0"]);
    expect(out.lamps.belt.tone).toBe("warn");
    expect(out.lamps.brake.tone).toBe("warn");
    expect(out.lamps.oil.tone).toBe("warn");
  });
});

describe("readout change detector", () => {
  it("moves when a digit, the gear or the tick fill moves", () => {
    const out = createClusterReadout();
    const base = clusterReadoutHash(clusterReadout(nominal(), out));
    expect(clusterReadoutHash(clusterReadout({ ...nominal(), speedKmh: 51 }, out))).not.toBe(base);
    expect(clusterReadoutHash(clusterReadout({ ...nominal(), gearLabel: "R" }, out))).not.toBe(base);
  });

  it("does NOT move for lamp changes — they repaint every frame anyway", () => {
    // The hash gates a UV upload. Lamps are vertex colours that pulse
    // continuously, so putting them in the hash would upload UVs every frame
    // for nothing.
    const out = createClusterReadout();
    const base = clusterReadoutHash(clusterReadout(nominal(), out));
    const belted = clusterReadoutHash(clusterReadout({ ...nominal(), seatbeltOn: false }, out));
    expect(belted).toBe(base);
  });

  it("is stable for identical state", () => {
    const a = clusterReadout(nominal(), createClusterReadout());
    const b = clusterReadout(nominal(), createClusterReadout());
    expect(clusterReadoutHash(a)).toBe(clusterReadoutHash(b));
  });
});
