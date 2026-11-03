import { afterEach, describe, expect, it, vi } from "vitest";
import {
  driveAxisFromPadY,
  REVERSE_ASSIST_PEDAL_ON,
  SimInput,
  TouchInputSource,
  type PedalStamp,
} from "@/modules/sim/engine";
import {
  browserStubs,
  mountDrivePad,
  mountMousePedals,
  PAD_BRAKE_Y,
  PAD_MIDDLE_Y,
  PAD_THROTTLE_Y,
  type PadSample,
} from "./overlayMount";

/**
 * =============================================================================
 * THE OVERLAY'S PEDAL STAMPS — sc-turn-left-oncoming:d0017a65, integrator
 * rulings R7 / R8 / R10 (2026-11-01).
 *
 * The reverse assist times LAW 1's lift and its hold by the times the INPUT
 * gives each pedal transition (engine/pedalTiming.ts). For touch those times
 * exist only if the overlay passes them: the pointer event's `timeStamp` on a
 * press and a release, and — for the drive pad worked by SLIDING the thumb —
 * every coalesced sample of a `pointermove` at its own time (R7), each
 * transition stamped as the interval since the previous sample (R8).
 *
 * Round 2's verifier showed that nothing tested the overlay's half: dropping
 * the stamps at all seven sites (TouchControls ×5, MousePedals ×2 — mutant X1)
 * left every suite green, and 0.05–0.24 s lifts then armed the assist. So this
 * file mounts the REAL components (overlayMount.ts) and dispatches pointer
 * events with their own timeStamps and coalesced lists through the handlers
 * the pads actually render, into a REAL SimInput, and reads the brake and
 * throttle channels' stamped transitions off it.
 *
 * Each event is handled DISPATCH_LAG_MS after its own timeStamp (the input
 * clock is moved there first), so a stamp the overlay failed to pass shows up
 * as that later «now», never as the event's own time.
 * =============================================================================
 */

/** How long after its own timeStamp each event is handled, ms. */
const DISPATCH_LAG_MS = 3;
/** The input clock (SimInput's injected one), ms. */
const clock = { ms: 0 };

interface Edge {
  channel: "brake" | "throttle";
  down: boolean;
  atMs: number;
  earliestMs: number;
}

/** A real SimInput that records its channel transitions. */
class RecordingInput extends SimInput {
  readonly edges: Edge[] = [];
  protected override onPedalChannelEdge(channel: "brake" | "throttle", down: boolean, stamp: PedalStamp): void {
    this.edges.push({ channel, down, atMs: stamp.atMs, earliestMs: stamp.earliestMs });
  }
  channel(ch: "brake" | "throttle"): Array<Omit<Edge, "channel">> {
    return this.edges.filter((e) => e.channel === ch).map(({ down, atMs, earliestMs }) => ({ down, atMs, earliestMs }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  for (const [name, value] of Object.entries(browserStubs())) vi.stubGlobal(name, value);
  vi.stubGlobal("navigator", { getGamepads: () => [] });
  clock.ms = 0;
  const input = new RecordingInput({}, () => clock.ms);
  const touch = new TouchInputSource();
  input.attachTouch(touch);
  return { input, touch };
}

const handledAt = (timeStamp: number) => {
  clock.ms = timeStamp + DISPATCH_LAG_MS;
};

function drivePad() {
  const { input, touch } = setup();
  const pad = mountDrivePad(touch);
  return {
    input,
    down(s: PadSample, id = 1) {
      handledAt(s.timeStamp);
      pad.down(s, id);
    },
    move(samples: PadSample[], id = 1) {
      handledAt(samples[samples.length - 1]!.timeStamp);
      pad.move(samples, id);
    },
    moveNoList(s: PadSample) {
      handledAt(s.timeStamp);
      pad.move([s], 1, "absent");
    },
    moveEmptyList(s: PadSample) {
      handledAt(s.timeStamp);
      pad.move([s], 1, "empty");
    },
    up(s: PadSample, id = 1) {
      handledAt(s.timeStamp);
      pad.up(s, id);
    },
  };
}

/** px below the pad's middle where the brake crosses PEDAL_ON (bisected off
 *  the product's own driveAxisFromPadY). */
const BRAKE_BOUNDARY_DY = (() => {
  let lo = 0;
  let hi = PAD_BRAKE_Y - PAD_MIDDLE_Y;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (-driveAxisFromPadY(PAD_MIDDLE_Y + m, PAD_MIDDLE_Y) > REVERSE_ASSIST_PEDAL_ON) hi = m;
    else lo = m;
  }
  return hi;
})();

const B = (timeStamp: number): PadSample => ({ clientY: PAD_BRAKE_Y, timeStamp });
const N = (timeStamp: number): PadSample => ({ clientY: PAD_MIDDLE_Y, timeStamp });
const T = (timeStamp: number): PadSample => ({ clientY: PAD_THROTTLE_Y, timeStamp });

describe("R7 / R8 — the phone's drive pad stamps every pedal transition at the thumb", () => {
  it("a pointerdown and a pointerup are stamped exactly at their own timeStamp", () => {
    const pad = drivePad();
    pad.down(B(1000));
    pad.up(B(1450));
    expect(pad.input.channel("brake")).toEqual([
      { down: true, atMs: 1000, earliestMs: 1000 },
      { down: false, atMs: 1450, earliestMs: 1450 },
    ]);
  });

  it("R7: a lift and a re-press made INSIDE one coalesced move are both seen, each at its own sample", () => {
    const pad = drivePad();
    pad.down(B(1000));
    // One frame's move: the thumb slid up into the middle and back down. The
    // event itself (the last sample) is in the brake zone again — read alone,
    // it says «still braking» and the lift is invisible.
    pad.move([B(1008), N(1016), N(1024), B(1032)]);
    expect(pad.input.channel("brake")).toEqual([
      { down: true, atMs: 1000, earliestMs: 1000 },
      // R8: released somewhere in (1008, 1016]; re-pressed in (1024, 1032].
      { down: false, atMs: 1016, earliestMs: 1008 },
      { down: true, atMs: 1032, earliestMs: 1024 },
    ]);
  });

  it("R8: a slide's press is stamped [previous sample, this sample], so the lift before it is never over-credited", () => {
    const pad = drivePad();
    pad.down(N(2000));
    pad.move([N(2100)]);
    pad.move([B(2350)]);
    pad.move([B(2400), N(2408)]);
    expect(pad.input.channel("brake")).toEqual([
      // The crossing is somewhere between the 2100 and the 2350 sample.
      { down: true, atMs: 2350, earliestMs: 2100 },
      { down: false, atMs: 2408, earliestMs: 2400 },
    ]);
  });

  it("R7 fallback: no getCoalescedEvents, or an empty list — the event itself is the one sample, still interval-stamped", () => {
    const pad = drivePad();
    pad.down(B(3000));
    pad.moveNoList(N(3040));
    pad.moveEmptyList(B(3300));
    expect(pad.input.channel("brake")).toEqual([
      { down: true, atMs: 3000, earliestMs: 3000 },
      { down: false, atMs: 3040, earliestMs: 3000 },
      { down: true, atMs: 3300, earliestMs: 3040 },
    ]);
  });

  it("an ADOPTED pointer (a thumb already moving when the pad frees) gets an open interval: no lift is credited before it", () => {
    const pad = drivePad();
    // No pointerdown: pointer 7 is already on the glass, unowned.
    pad.move([B(4000)], 7);
    expect(pad.input.channel("brake")).toEqual([{ down: true, atMs: 4000, earliestMs: Number.NEGATIVE_INFINITY }]);
    // …and its later samples are intervals since the adopted one.
    pad.move([N(4016), B(4024)], 7);
    expect(pad.input.channel("brake").slice(1)).toEqual([
      { down: false, atMs: 4016, earliestMs: 4000 },
      { down: true, atMs: 4024, earliestMs: 4016 },
    ]);
  });

  it("the throttle channel is stamped the same way (in R it is the functional brake)", () => {
    const pad = drivePad();
    pad.down(T(1000));
    pad.move([T(1008), N(1016), T(1024)]);
    pad.up(T(1100));
    expect(pad.input.channel("throttle")).toEqual([
      { down: true, atMs: 1000, earliestMs: 1000 },
      { down: false, atMs: 1016, earliestMs: 1008 },
      { down: true, atMs: 1024, earliestMs: 1016 },
      { down: false, atMs: 1100, earliestMs: 1100 },
    ]);
  });

  it("a new gesture does not inherit the previous gesture's last sample", () => {
    const pad = drivePad();
    pad.down(N(1000));
    pad.move([N(1100)]);
    pad.up(N(1200));
    pad.down(N(2000));
    pad.move([B(2050)]);
    expect(pad.input.channel("brake")).toEqual([{ down: true, atMs: 2050, earliestMs: 2000 }]);
  });
});

/**
 * R11 / R12 / R14 (round 4, 2026-11-01). A digitizer scans at a fixed period
 * P and the browser sends a sample only when a scan saw a change — so a thumb
 * RESTING still sends nothing, and the first sample of the next slide at T
 * also says the scan at T − P saw no change: the crossing came after T − P.
 * Round 3 stamped that press from the previous sample (the last one of the
 * release slide, before the rest), which credited a real 0.3 s lift ≈ 0 s and
 * lost the ruled gesture (round-3 verifier F1: 9–10 of 40 at GAP 2 px). The
 * pad learns P as the smallest positive spacing between two consecutive
 * samples INSIDE ONE coalesced list (≥ the true period, so it can only
 * under-credit) and stamps a move-made transition [max(previous, T − P), T].
 */
describe("R11 / R12 — the drive pad learns the digitizer's scan period from its own coalesced lists", () => {
  it("R11: a resting thumb — after a list taught P = 8 ms, a press after 300 ms of silence is stamped [T − P, T], not [previous sample, T]", () => {
    const pad = drivePad();
    pad.down(B(1000));
    // The release slide: two scans 8 ms apart in one frame's list (P = 8).
    pad.move([B(1100), N(1108)]);
    // The thumb rests in the middle — no samples — then slides back down.
    pad.move([B(1408)]);
    expect(pad.input.channel("brake")).toEqual([
      { down: true, atMs: 1000, earliestMs: 1000 },
      { down: false, atMs: 1108, earliestMs: 1100 },
      // round 3 said 1108 here: a 300 ms lift credited 0 ms.
      { down: true, atMs: 1408, earliestMs: 1400 },
    ]);
  });

  it("R11: the period is the SMALLEST spacing seen, and it is the device's — it survives the gesture's end", () => {
    const pad = drivePad();
    pad.down(N(1000));
    pad.move([N(1100), N(1125)]); // 25 ms: an upper bound on P
    pad.move([N(1200), N(1216.5), N(1233)]); // 16.5 ms
    pad.up(N(1300));
    pad.down(N(2000));
    pad.move([N(2010)]);
    pad.move([B(2500)]);
    expect(pad.input.channel("brake")).toEqual([{ down: true, atMs: 2500, earliestMs: 2483.5 }]);
  });

  it("R11: P is never learned ACROSS events — two one-sample moves 8 ms apart teach nothing; the press after silence keeps round 3's interval", () => {
    const pad = drivePad();
    pad.down(B(1000));
    pad.move([B(1100)]);
    pad.move([N(1108)]);
    pad.move([B(1408)]);
    expect(pad.input.channel("brake")).toEqual([
      { down: true, atMs: 1000, earliestMs: 1000 },
      { down: false, atMs: 1108, earliestMs: 1100 },
      { down: true, atMs: 1408, earliestMs: 1108 },
    ]);
  });

  it("R11: right after a pointerdown silence proves nothing (touch slop can hold the first moves back) — the first move is stamped from the pointerdown", () => {
    const pad = drivePad();
    pad.down(N(500));
    pad.move([N(510), N(518)]); // P = 8
    pad.up(N(600));
    pad.down(N(1000));
    pad.move([B(1300)]);
    expect(pad.input.channel("brake")).toEqual([{ down: true, atMs: 1300, earliestMs: 1000 }]);
  });

  it("R15 / R19: KEPT under touch slop — the thumb lifted off the brake, put back 2 px inside the neutral side, its first moves within 8 px held back by the platform: the first delivered move, already past the boundary, is stamped from the pointerdown, not from T − P (that would credit the held-back moves as lift)", () => {
    const pad = drivePad();
    // P = 8 ms learned beforehand, and the brake held.
    pad.down(N(500));
    pad.move([N(510), N(518)]);
    pad.up(N(600));
    pad.down(B(700));
    // The thumb comes off the brake at 1000 (exact release) and is put back
    // down 2 px inside the neutral side 20 ms later. It rests, then slides in
    // at 0.5 px/ms and crosses PEDAL_ON at 1249 (a true lift of 0.249 s); the
    // platform holds back every move within 8 px of the pointerdown, so the
    // first move it delivers is the scan at 1265, 8 px past the boundary.
    const restY = PAD_MIDDLE_Y + BRAKE_BOUNDARY_DY - 2; // 2 px short of PEDAL_ON
    pad.up({ clientY: PAD_BRAKE_Y, timeStamp: 1000 });
    pad.down({ clientY: restY, timeStamp: 1020 });
    pad.move([{ clientY: restY + 10, timeStamp: 1265 }]);
    expect(pad.input.channel("brake")).toEqual([
      { down: true, atMs: 700, earliestMs: 700 },
      { down: false, atMs: 1000, earliestMs: 1000 },
      // [the pointerdown, T]: the lift is credited 20 ms. With the T − P
      // bound taken here it would be [1257, 1265]: 257 ms, past LIFT_S, for a
      // lift the student held 0.249 s.
      { down: true, atMs: 1265, earliestMs: 1020 },
    ]);
  });

  it("R11: the spacing taught is the list's OWN — a list whose first sample is not past the previous event's last teaches its own 8 ms, not the 6 ms to that earlier event", () => {
    const pad = drivePad();
    pad.down(N(1000));
    pad.move([N(1032)]);
    pad.move([N(1030), N(1038)]);
    pad.move([B(1500)]);
    expect(pad.input.channel("brake")).toEqual([{ down: true, atMs: 1500, earliestMs: 1492 }]);
  });

  it("R12: a list whose samples all carry the parent event's stamp — the release and the re-press inside it are bounded by the previous event's stamp, never the exact [T, T]", () => {
    const pad = drivePad();
    pad.down(B(1000));
    pad.move([B(1016)]);
    // A browser that gives every coalesced sample the parent's timeStamp.
    pad.move([B(1032), N(1032), N(1032), B(1032)]);
    expect(pad.input.channel("brake")).toEqual([
      { down: true, atMs: 1000, earliestMs: 1000 },
      { down: false, atMs: 1032, earliestMs: 1016 },
      { down: true, atMs: 1032, earliestMs: 1016 },
    ]);
  });

  it("R12: an equal-stamp pair never teaches P — not even beside an advancing pair in the same list", () => {
    const pad = drivePad();
    pad.down(B(1000));
    pad.move([B(1016), N(1016)]); // equal pair: no P
    pad.move([N(1100), N(1100), N(1108)]); // a list off the scan clock: no P
    pad.move([B(1500)]);
    expect(pad.input.channel("brake")).toEqual([
      { down: true, atMs: 1000, earliestMs: 1000 },
      { down: false, atMs: 1016, earliestMs: 1000 },
      // P unknown: the previous sample, as in round 3.
      { down: true, atMs: 1500, earliestMs: 1108 },
    ]);
  });
});

describe("R4 / R10 — the mouse pedals stamp the press and the release at the pointer event", () => {
  const pedals = () => {
    const { input, touch } = setup();
    const m = mountMousePedals(touch);
    const ev = (timeStamp: number) => ({
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      timeStamp,
      currentTarget: { setPointerCapture() {} },
      preventDefault() {},
    });
    const fire = (h: Record<string, (e: unknown) => void>, name: string, t: number) => {
      handledAt(t);
      h[name]!(ev(t));
    };
    return { input, m, fire };
  };

  it("brake pedal: pointerdown and pointerup at their own timeStamp", () => {
    const { input, m, fire } = pedals();
    fire(m.brake, "onPointerDown", 1200);
    fire(m.brake, "onPointerUp", 1330);
    expect(input.channel("brake")).toEqual([
      { down: true, atMs: 1200, earliestMs: 1200 },
      { down: false, atMs: 1330, earliestMs: 1330 },
    ]);
  });

  it("throttle pedal: the same", () => {
    const { input, m, fire } = pedals();
    fire(m.throttle, "onPointerDown", 2200);
    fire(m.throttle, "onPointerUp", 2410);
    expect(input.channel("throttle")).toEqual([
      { down: true, atMs: 2200, earliestMs: 2200 },
      { down: false, atMs: 2410, earliestMs: 2410 },
    ]);
  });
});
