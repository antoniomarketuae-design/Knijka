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
// The dial does not get to invent its own definition of „stopped". This is the
// one every other machine in the sim uses (reverseAssist, reverseStuck,
// stuckStart, reverseView), and it is the band the STANDSTILL row below sweeps.
// A type-only-adjacent leaf module: reverseAssist imports nothing but types.
import { REVERSE_ASSIST_STANDSTILL_KMH } from "../engine/reverseAssist";

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
  it("the COLD instrument is lit, not dead — a blank dial reads as broken", () => {
    // An exact zero reaches this function from exactly one place: the cold-car
    // defaults (`createClusterInputs`) and `VitokCockpit`'s sampler, whose
    // `sim?.speedKmh ?? 0` runs on the frames before the scene first writes.
    // That is the COLD state. It is NOT what a stopped car feeds — see the next
    // row, which is where the standstill claim is actually pinned.
    expect(litTickCount(0)).toBe(1);
  });

  it("fills proportionally, so a small reel frame still reads a RATE", () => {
    // 17 ticks over 160 km/h: 16 spans, one per 10 km/h, plus the always-lit 0.
    expect(litTickCount(10)).toBe(2);
    expect(litTickCount(50)).toBe(6);
    expect(litTickCount(80)).toBe(9);
  });

  // ── sc-vp-readiness:14d53c24 ────────────────────────────────────────────
  // The cockpit mount ships `dialNumerals={false}` (measured: 5.6 px of ink),
  // so the ARC is the dial's rate channel there. These three pin the two
  // properties that channel has to have, and the first is the row itself.
  it("a moving car never draws the arc a stopped car draws", () => {
    // 8 km/h is the frame the row was filed on, and the car it was compared
    // against is the one waiting at the traffic light behind it.
    //
    // RE-PINNED 2026-08-28 (integrator, wave 8). This row first shipped as
    // `litTickCount(8) > litTickCount(0)`, and an exact 0 is NOT what that
    // second car feeds. `VehicleSim.speedKmh` is `forwardSpeedMs() * 3.6` off
    // the rigid body, and the two places this repo has MEASURED a stopped car
    // both put it strictly inside the standstill band, never on it:
    //
    //   · `engine/stuckStart.ts` (docblock) — drive rig, eight seconds of full
    //     throttle against PARKING_BRAKE_FORCE_N: a maximum of 0.32 km/h.
    //   · `vehicle/parking-envelope.test.ts` "Brake-hold in D" — three seconds
    //     of held brake at rest, asserting the peak stays under 0.6 km/h.
    //   · and this file's own `speedDigits(-0.4)` row: „a stopped car jitters
    //     either side of zero".
    //
    // So a pin on an exact 0 proves the property on the one input the running
    // sim does not produce, and the comparison the row was filed on — the dial
    // at 8 km/h against the dial at the light — goes unchecked.
    const STOPPED = 0.32; // measured, above
    expect(litTickCount(STOPPED)).toBe(1);
    expect(litTickCount(8)).toBeGreaterThan(litTickCount(STOPPED));

    // …and the whole band, not one sample: every speed the rest of the sim
    // calls a standstill must draw the standstill arc, or the instrument
    // contradicts the digits beside it, which round to «0» across all but the
    // top tenth of the same band (`speedDigits`, pinned above).
    // Stepped by integer index, never by `v += 0.02`: float accumulation would
    // walk the last sample onto or past the threshold, and this band is
    // half-open on purpose — 0.6 itself is the first speed that is NOT a
    // standstill anywhere in the engine.
    for (let i = 0; i * 0.02 < REVERSE_ASSIST_STANDSTILL_KMH; i++) {
      const v = i * 0.02;
      expect(litTickCount(v), `${v.toFixed(2)} km/h is a standstill`).toBe(1);
      expect(litTickCount(-v), `-${v.toFixed(2)} km/h is a standstill`).toBe(1);
    }
  });

  it("the head tick is the one the NEEDLE is nearest, so the two agree", () => {
    // `dialAngleRad` puts the needle at v/DIAL_MAX_KMH of the sweep; the lit
    // head must be the tick that angle lands closest to, never the last tick
    // fully passed (which read 10 km/h slow at the top of every band).
    for (const v of [15, 25, 45, 55, 95, 155]) {
      const needleSpan = (v / DIAL_MAX_KMH) * (TICK_COUNT - 1);
      expect(litTickCount(v) - 1).toBe(Math.round(needleSpan));
    }
  });

  it("the arc never trails the true speed by more than half a step", () => {
    // `floor` could only ever UNDER-read, by up to a full step (10 km/h): at
    // 59 km/h the head sat on the 50 tick. Rounding bounds the error both ways
    // at half a step, which is the most an arc of 17 ticks can promise.
    const step = DIAL_MAX_KMH / (TICK_COUNT - 1);
    for (let v = 0; v <= DIAL_MAX_KMH; v += 0.5) {
      const headKmh = (litTickCount(v) - 1) * step;
      // Only from one step up: below it the arc is at the standstill/first-tick
      // end, where the bound is not what the dial is claiming (see the row above).
      if (v >= step) expect(Math.abs(headKmh - v)).toBeLessThanOrEqual(step / 2);
    }
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

  it("THE STAGED AMBER TELLTALE (VP-06 triage): a mid-drive caution cue lights the check-engine lamp", () => {
    // sc-vp-telltale-red:775b58cc. This lamp is the cluster's ONLY „caution"
    // tone, and until the director could raise it mid-drive it was amber only
    // while the engine was OFF — so a MOVING car never showed one, and the
    // lesson whose whole subject is «цветът на лампата решава какво правиш»
    // could be read but not practised. The engine is ON in `nominal()`, which
    // is exactly the state the old law painted "off".
    const lamps = bank({ ...nominal(), cautionWarnOn: true });
    expect(lamps.engine.tone).toBe("caution");
    expect(lamps.engine.pulse).toBe(true);
    // Two colours at once is the point of the drill: the amber cue does not
    // borrow the red lamp, and the red one is still free to join it.
    expect(lamps.temp.tone).toBe("off");
    expect(bank({ ...nominal(), cautionWarnOn: true, tempWarnOn: true }).temp.tone).toBe("warn");
    expect(bank({ ...nominal(), cautionWarnOn: false }).engine.tone).toBe("off");
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
