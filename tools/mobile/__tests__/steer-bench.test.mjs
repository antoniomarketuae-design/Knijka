/**
 * steer-bench.test.mjs — THE BENCH IS AN INSTRUMENT, AND AN INSTRUMENT THAT
 * NOBODY TESTS IS A NUMBER GENERATOR.
 *
 * This file defends the parts of `lib/steer-bench.mjs` that decide what its
 * numbers MEAN: the sign convention (a bench that reads every left turn as a
 * right one would report a beautiful, inverted drive), the perception model's
 * agreement with the corpus it was fitted to, the determinism that makes a
 * paired comparison paired, and the transcription of the law it is trying to
 * beat.
 *
 * It deliberately does NOT boot rapier or transpile the product — that costs
 * seconds and a wasm module, and the physics is the product's own and is
 * defended by the product's own `vehicle/harness.test.ts`. What is tested here
 * is everything this file added on top of it.
 *
 * Every assertion has been watched to fail; the mutation is named beside it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ABANDON_M,
  ABANDON_TICKS,
  LEGACY_TUNE,
  perceive,
  MEASURED_WRONG_WAY_15,
  RESIDUAL_QUANTILES,
  RESIDUAL_RHO,
  REGIMES,
  rng,
  roadAhead,
  STATE_BY_DEMAND,
  STATE_MARGINAL,
  STATE_STICK,
  STATE_TRANSITION,
  steerCommandLegacy,
} from "../lib/steer-bench.mjs";
import { TUNE } from "../lib/guidance.mjs";

/** A straight road along +x, then a left-hand bend. */
function line(pts) {
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { pts, cum, length: cum[cum.length - 1] };
}

describe("§1 the sign convention — the one error that would invert every verdict", () => {
  const straight = line(Array.from({ length: 200 }, (_, i) => ({ x: i * 0.5, y: 0 })));

  it("reads a road bending LEFT of the car as a NEGATIVE errDeg", () => {
    // `steerCommand`'s contract: positive = the ribbon is right of centre =
    // turn RIGHT. So a target to the left must be negative.
    // MUTATION: drop the leading minus in `roadAhead` and this flips — and so
    // does every drive the bench has ever reported.
    const bend = line([
      ...Array.from({ length: 60 }, (_, i) => ({ x: i * 0.5, y: 0 })),
      ...Array.from({ length: 60 }, (_, i) => ({ x: 30 + i * 0.5, y: (i * 0.5) * 0.6 })),
    ]);
    const r = roadAhead(bend, { x: 20, y: 0 }, { x: 1, y: 0 }, 15);
    assert.equal(r.done, false);
    assert.ok(r.errDeg < -1, `a left-hand bend must read negative, got ${r.errDeg.toFixed(1)}`);
    const rr = roadAhead(
      line([
        ...Array.from({ length: 60 }, (_, i) => ({ x: i * 0.5, y: 0 })),
        ...Array.from({ length: 60 }, (_, i) => ({ x: 30 + i * 0.5, y: -(i * 0.5) * 0.6 })),
      ]),
      { x: 20, y: 0 },
      { x: 1, y: 0 },
      15,
    );
    assert.ok(rr.errDeg > 1, `a right-hand bend must read positive, got ${rr.errDeg.toFixed(1)}`);
  });

  it("reads zero on a straight road it is sitting on, and the offset when it is not", () => {
    // MUTATION: measure the bearing from the world x-axis instead of the car's
    // own heading and the straight case stops reading zero.
    const on = roadAhead(straight, { x: 20, y: 0 }, { x: 1, y: 0 }, 15);
    assert.ok(Math.abs(on.errDeg) < 1e-6);
    assert.ok(Math.abs(on.offM) < 1e-9);
    const off = roadAhead(straight, { x: 20, y: 3 }, { x: 1, y: 0 }, 15);
    assert.ok(Math.abs(off.offM - 3) < 1e-6, `3 m off should read 3, got ${off.offM}`);
    assert.ok(off.errDeg > 0, "sitting left of the line, the road is to the right");
  });

  it("says `done` inside the look-ahead of the end rather than inventing a turn", () => {
    // MUTATION: clamp to the last trace point and a lane's final ticks
    // manufacture a demand out of the route running out.
    assert.equal(roadAhead(straight, { x: 95, y: 0 }, { x: 1, y: 0 }, 15).done, true);
  });
});

describe("§2 the perception model reproduces the corpus it was fitted to", () => {
  it("hits the measured marginal state mix", () => {
    // MUTATION: go back to re-weighting the transition row by
    // `mix / STATE_MARGINAL` — the construction that looks like importance
    // sampling and is not — and the blind share reads 0.092 against 0.277.
    // `STATE_STICK` is the fix and its own derivation is asserted below.
    const rand = rng("mix");
    const mem = { state: 2, z: 0 };
    const n = [0, 0, 0];
    // Demands drawn to look like the corpus's own: mostly small.
    for (let i = 0; i < 40000; i++) {
      const truth = (rand() < 0.75 ? 6 : 22) * (rand() < 0.5 ? 1 : -1);
      n[perceive(truth, "base", rand, mem).state] += 1;
    }
    const tot = n[0] + n[1] + n[2];
    for (const s of [0, 1, 2]) {
      assert.ok(
        Math.abs(n[s] / tot - STATE_MARGINAL[s]) < 0.06,
        `state ${s}: ${(n[s] / tot).toFixed(3)} vs measured ${STATE_MARGINAL[s]}`,
      );
    }
  });

  it("keeps the ANTI-CORRELATION with demand, which is the whole finding", () => {
    // At 40-49 deg the recorded loop is blind on 58 % of ticks and confident on
    // 19 %; at 0-9 deg it is 14 % / 39 %. A model that loses this is a model of
    // a different problem. MUTATION: clamp the mix lookup to bucket 0.
    const share = (truth) => {
      const rand = rng(`anti${truth}`);
      const mem = { state: 2, z: 0 };
      let conf = 0;
      const N = 20000;
      for (let i = 0; i < N; i++) if (perceive(truth, "base", rand, mem).state === 2) conf += 1;
      return conf / N;
    };
    const low = share(5);
    const high = share(45);
    assert.ok(high < low * 0.75, `confidence must collapse at a junction-sized demand: ${low.toFixed(3)} -> ${high.toFixed(3)}`);
  });

  it("produces WRONG-WAY RUNS, because an independent draw per tick produces none", () => {
    // This is the defect the second draft of the model had and it is the one
    // that mattered: with no correlation the bench never generated two
    // consecutive same-sign misreads, so it never authorised a wrong turn and
    // graded the ladder on a corpus with no misreads in it.
    // MUTATION: set RESIDUAL_RHO to 0 and `runs2` goes to ~0.
    assert.ok(RESIDUAL_RHO > 0.8, "the measured autocorrelation is 0.873");
    const rand = rng("runs");
    const mem = { state: 2, z: 0 };
    let runs2 = 0;
    let prevWrong = false;
    let wrong = 0;
    let n = 0;
    for (let i = 0; i < 30000; i++) {
      const truth = 22 * (i % 400 < 200 ? 1 : -1);
      const s = perceive(truth, "base", rand, mem);
      if (s.state !== 2) { prevWrong = false; continue; }
      n += 1;
      const w = Math.sign(s.errDeg) !== Math.sign(truth);
      if (w) wrong += 1;
      if (w && prevWrong) runs2 += 1;
      prevWrong = w;
    }
    assert.ok(wrong / n > 0.05, `the model must misread sometimes, got ${(100 * wrong / n).toFixed(1)}%`);
    assert.ok(runs2 >= 1, "misreads must be able to repeat at all");
  });

  it("REPRODUCES the measured wrong-way rate and the measured read-fraction", () => {
    // The two numbers the whole `base` regime is fitted to. A model that
    // misses either is grading the ladder against a perception nobody has.
    // MUTATION: go back to an ADDITIVE residual at a turn and the wrong-way
    // rate drops to 4 % while the read-fraction goes to 1.0 — which is how two
    // earlier drafts of this file flattered the ladder without noticing.
    const rand = rng("cal");
    const mem = { state: 2, z: 0 };
    let wrong = 0;
    let n = 0;
    const frac = [];
    for (let i = 0; i < 120000; i++) {
      const u = rand();
      const truth = (u < 0.75 ? rand() * 10 : u < 0.9 ? 10 + rand() * 10 : 20 + rand() * 25) * (rand() < 0.5 ? 1 : -1);
      const s = perceive(truth, "base", rand, mem);
      if (s.state !== 2 || Math.abs(truth) < 15) continue;
      n += 1;
      if (Math.sign(s.errDeg) !== Math.sign(truth)) wrong += 1;
      frac.push(s.errDeg / truth);
    }
    frac.sort((a, b) => a - b);
    const readFrac = frac[frac.length >> 1];
    assert.ok(
      Math.abs(wrong / n - MEASURED_WRONG_WAY_15) < 0.05,
      `wrong-way ${(100 * wrong / n).toFixed(1)}% vs the corpus's ${(100 * MEASURED_WRONG_WAY_15).toFixed(1)}%`,
    );
    assert.ok(readFrac > 0.15 && readFrac < 0.45, `the loop must read ~28 % of a turn, got ${(100 * readFrac).toFixed(0)}%`);
  });

  it("`abc` reproduces the PUBLISHED ratio and nothing stronger", () => {
    // The publication reported wrong-way 26.0 % -> 17.0 %, a ratio of 0.654.
    // This bench measures its own base at ~22 %, so what must be reproduced is
    // the RATIO, not the absolute. MUTATION: set residScale to 0.62 (an
    // earlier guess) and abc reads 3 % — a perception four times better than
    // anybody claimed, which would make every abc row a fabrication.
    const rate = (regime) => {
      const rand = rng(`abc${regime}`);
      const mem = { state: 2, z: 0 };
      let wrong = 0;
      let n = 0;
      for (let i = 0; i < 120000; i++) {
        const truth = (15 + rand() * 30) * (rand() < 0.5 ? 1 : -1);
        const s = perceive(truth, regime, rand, mem);
        if (s.state !== 2) continue;
        n += 1;
        if (Math.sign(s.errDeg) !== Math.sign(truth)) wrong += 1;
      }
      return wrong / n;
    };
    const ratio = rate("abc") / rate("base");
    assert.ok(Math.abs(ratio - 0.654) < 0.12, `published ratio 0.654, model gives ${ratio.toFixed(3)}`);
  });

  it("`perfect` is the truth and `abc` is strictly kinder than `base`", () => {
    // MUTATION: swap the residScale entries and abc becomes the harsher one,
    // which would make every „the perception now feeds it" claim backwards.
    const rand = rng("p");
    assert.equal(perceive(-33, "perfect", rand, { state: 2, z: 0 }).errDeg, -33);
    assert.ok(REGIMES.abc.residScale.confident < REGIMES.base.residScale.confident);
    assert.ok(REGIMES.abc.confBoost > 1);
  });

  it("is deterministic per seed, which is what makes a paired comparison paired", () => {
    // MUTATION: seed the PRNG from Date.now() and every „58 better / 16 worse"
    // becomes two unrelated drives compared to each other.
    const draw = () => {
      const rand = rng("same|sc-junction-left__pc-right");
      const mem = { state: 2, z: 0 };
      return Array.from({ length: 200 }, (_, i) => perceive(((i * 7) % 50) - 25, "base", rand, mem).errDeg);
    };
    assert.deepEqual(draw(), draw());
  });
});

describe("§3 the model's tables are the shape they claim to be", () => {
  it("every transition row is a distribution and every state is reachable", () => {
    // MUTATION: mistype a row so it sums to 1.4 and the chain silently
    // over-weights that state for the rest of the corpus.
    for (const row of STATE_TRANSITION) {
      assert.ok(Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 0.005, `row sums to ${row.reduce((a, b) => a + b, 0)}`);
      for (const p of row) assert.ok(p > 0 && p < 1);
    }
    // …and they are STICKY, which is the measured fact the model rests on.
    for (let s = 0; s < 3; s++) assert.ok(STATE_TRANSITION[s][s] > 0.7, `state ${s} must be sticky`);
  });

  it("STATE_STICK solves back to the measured self-transition", () => {
    // λ + (1 − λ)·π must return p_ss. MUTATION: mistype the solve (say
    // p_ss − π over π) and the chain reproduces one of the two measurements
    // instead of both, silently.
    for (let s = 0; s < 3; s++) {
      const back = STATE_STICK[s] + (1 - STATE_STICK[s]) * STATE_MARGINAL[s];
      assert.ok(Math.abs(back - STATE_TRANSITION[s][s]) < 1e-9, `state ${s}: solves back to ${back.toFixed(4)}, measured ${STATE_TRANSITION[s][s]}`);
    }
  });

  it("every demand bucket is a distribution", () => {
    for (const row of STATE_BY_DEMAND) {
      assert.ok(Math.abs(row[1] + row[2] + row[3] - 1) < 0.005, `bucket ${row[0]} sums to ${row[1] + row[2] + row[3]}`);
    }
  });

  it("every residual table is monotone in its quantile", () => {
    // MUTATION: transpose two rows and the inverse-CDF draw starts returning
    // the wrong tail for the right probability.
    for (const key of Object.keys(RESIDUAL_QUANTILES)) {
      const t = RESIDUAL_QUANTILES[key];
      for (let i = 1; i < t.length; i++) {
        assert.ok(t[i][0] > t[i - 1][0], `${key} quantiles out of order`);
        assert.ok(t[i][1] >= t[i - 1][1], `${key} values out of order`);
      }
    }
  });

  it("the abandon guard is far enough out to be a failure and not a threshold", () => {
    // `route-fidelity`'s own off-route band is 3 m; abandoning at 25 m for 5
    // consecutive ticks cannot rescue a lane that was going to fail.
    // MUTATION: drop ABANDON_M to 3 and the bench starts truncating lanes that
    // were still recoverable.
    assert.ok(ABANDON_M >= 20 && ABANDON_TICKS >= 3);
  });
});

describe("§4 the old law is transcribed, not remembered", () => {
  it("has the two rungs and nothing between them", () => {
    // The whole defect, in one assertion: a confirmed turn returned holdMs 0
    // with `sustain`, meaning the caller held the key across the scan, and
    // everything else was capped at 65 ms. MUTATION: give the legacy turn a
    // holdMs and the BEFORE stops being the before.
    const turn = steerCommandLegacy({ errDeg: -25, prevErrDeg: -23, kmh: 12, sustainRun: 2, confident: true });
    assert.equal(turn.sustain, true);
    assert.equal(turn.holdMs, 0);
    for (const errDeg of [-4, -8, -14, -25, -60]) {
      const c = steerCommandLegacy({ errDeg, prevErrDeg: errDeg, kmh: 12, sustainRun: 0, confident: true });
      assert.ok(c.holdMs <= LEGACY_TUNE.MAX_HOLD_MS, `an unconfirmed legacy command must be capped, got ${c.holdMs}`);
    }
  });

  it("keeps the OLD constants, so the before is not the after wearing a label", () => {
    // MUTATION: point LEGACY_TUNE at the live TUNE and every comparison
    // collapses to zero difference in the pulse band.
    assert.equal(LEGACY_TUNE.SUSTAIN_MAX, 4);
    assert.equal(LEGACY_TUNE.MIN_KMH, 2);
    assert.notEqual(LEGACY_TUNE.SUSTAIN_MAX, TUNE.SUSTAIN_MAX);
    assert.notEqual(LEGACY_TUNE.MIN_KMH, TUNE.MIN_KMH);
  });

  it("has no sub-floor bank, which is one of the things being measured", () => {
    // A demand under the floor was BINNED, not banked. MUTATION: return a
    // carryMs here and the bank stops being attributable.
    const small = steerCommandLegacy({ errDeg: -5, prevErrDeg: -5, kmh: 12, sustainRun: 0, confident: true });
    assert.equal(small.dir, null);
    assert.equal(small.carryMs, undefined);
  });
});
