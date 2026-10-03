/**
 * THE TASK CEILING — THE TWO-SIDED CENSUS (round 12's F-CLASS and F-JOIN; round 14: TWO LEDGERS).
 *
 * WHAT. For every programme the reference ledger (`taskCapReference.ts`) derives, from the rulings alone, the EXPECTED
 * outcome — every rule event of every frame — and the real reducer is run as the system under test and compared
 * EXACTLY (`taskCapExact.ts checkExact`): no breach unbilled, no card without its breach, no missing or extra point, no
 * teach on the wrong topic or at the wrong moment, no praise paid or withheld against the rules, and what the ending of
 * a drive stopped on that very frame would settle — each a difference at its frame, reported with the seed.
 *
 * ROUND 14 — FOUNDER RULING 2026-10-03, «Cap adds, never removes». The reference now derives two ledgers that never
 * read each other: the NO-CAP ledger (the sign's bands, the weather envelope, the bend's advisory, the fog lamps, the
 * excursion off the carriageway — every bill pushed exactly as with no cap) and the CAP ledger (the latch, the arrival,
 * the stamp, the sign-bound wait and its three ends, the act of a mark and its stretch with one first bill and one
 * re-grade, round 7's marks inside one sign-bound act). Round 12–13's floors counted the kin ledger's shapes (restores,
 * joins, escalations, takeovers, surfaced cards, hand-overs, one-bill-per-act absorptions); none of those exists any
 * more, so the floors below count the two ledgers' own shapes — and, for each family, where they MEET (a cap bill
 * within 10 s of a weather or bend bill, of a speeding bill), which is what the ruling is about.
 *
 * THE PROGRAMMES (reproducible: the same seed is the same drive, byte for byte; the generators are unchanged):
 *  · L — `generateProgramme(1..4000)`, round 11's census seeds;
 *  · S — `generateProgramme(1..600, { speedBlow })`, the speed-blow family;
 *  · G — the round-10 verifier's 288-programme grid and its 288 controls;
 *  · A — `generateActProgramme(1..3000)`, the act-structure programmes (repeated latches, later blows in one act,
 *        waits taken by a stamp, a held correction or a graded mark, stretches long enough for the re-grade);
 *  · M — `myProgramme(1..3000)`, the round-11 verifier's own generator, ported verbatim;
 *  · P — `generateActProgramme(1..4000, { pairs })`, round 13's WIDENED DOMAIN: the glass figure and the gate drawn
 *        apart over the differences the committed capped objectives use (`taskCapCommittedPairs.ts`, derived, never
 *        typed) and four beyond, reversing, snow, night and the fog lamps, the kerb;
 *  · R — `generateActProgramme(1..2000, { pairs, reverseBlows })`, marks blown IN REVERSE (the evaluator judges a mark
 *        on |speed|, the sign's correction runs on the signed speed — the wait can end on the blow's own frame).
 *
 * RUNTIME (one worker, this machine): about 95 s for all 17,176 programmes / 10.3 M frames.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SimTick } from "..";
import { checkExact, type Mismatch } from "./taskCapExact";
import { emptyCoverage14, type Coverage14 } from "./taskCapReference";
import { generateProgramme, staleSurfaceGrid } from "./taskCapProgrammes";
import { generateActProgramme, myProgramme } from "./taskCapActProgrammes";
import { BEYOND_DELTAS, committedPairDeltas, committedPairs } from "./taskCapCommittedPairs";

const PAIR_DELTAS: number[] = [...new Set([...committedPairDeltas(), ...BEYOND_DELTAS])].sort((a, b) => a - b);

function census(tag: string, n: number, gen: (i: number) => SimTick[]): { mismatches: Mismatch[]; cov: Coverage14 } {
  const cov = emptyCoverage14();
  const mismatches: Mismatch[] = [];
  for (let i = 1; i <= n; i++) mismatches.push(...checkExact(`${tag}${i}`, gen(i), cov));
  // The coverage of the family, written where a census run asks for it (evidence for a report; never read back).
  if (process.env.TASK_CAP_CENSUS_OUT) appendFileSync(process.env.TASK_CAP_CENSUS_OUT, JSON.stringify({ census: "two-sided", family: tag, mismatches: mismatches.length, cov }) + "\n");
  return { mismatches, cov };
}
const said = (m: Mismatch[]): string[] => m.slice(0, 3).map((x) => `${x.seed} t=${x.t} ${x.what}: expected «${x.expected}» got «${x.actual}»`);
const floors = (cov: Coverage14, floor: Array<[keyof Coverage14, number]>) => {
  for (const [k, min] of floor) expect(cov[k], k).toBeGreaterThan(min);
};
/** Every family: both ledgers bill, and they MEET — a cap bill beside a weather/bend bill and beside a speeding bill. */
const BOTH_LEDGERS: Array<[keyof Coverage14, number]> = [
  ["condBills", 100],
  ["bendBills", 100],
  ["capActs", 100],
  ["absorbedStretchBills", 100],
  ["capRegrades", 50],
  ["capNearKin", 100],
];

describe("ROUND 14 — every generated programme's rule events, frame by frame, EXACTLY as the two-ledger reference derives them", () => {
  it("L · seeds 1..4000 — 0 differences; not vacuous (both ledgers bill, meet, and every kind of ending arises)", () => {
    const { mismatches, cov } = census("L", 4000, (i) => generateProgramme(i));
    expect(said(mismatches)).toEqual([]);
    expect(cov.frames).toBeGreaterThan(1_900_000);
    expect(cov.pairFrames).toBe(0);
    floors(cov, [
      ...BOTH_LEDGERS,
      ["speedingBills", 3500],
      ["condBills", 6000],
      ["bendBills", 7000],
      ["capActs", 4700],
      ["signBoundBlows", 3600],
      ["marksJoined", 140],
      ["stampEndsWait", 1900],
      ["heldEndsWait", 1300],
      ["absorbedStretchBills", 3800],
      ["capRegrades", 1250],
      ["capNearKin", 9000],
      ["capNearSpeeding", 2200],
      ["praises", 360],
      ["actHeldPraiseFrames", 130_000],
      ["speedingEndings", 59_000],
      ["pendingEndings", 100_000],
      ["taskEndings", 140_000],
      ["adaptationEndings", 560_000],
    ]);
  }, 600_000);
  it("S · the speed-blow family, seeds 1..600 — 0 differences", () => {
    const { mismatches, cov } = census("S", 600, (i) => generateProgramme(i, { speedBlow: true }));
    expect(said(mismatches)).toEqual([]);
    floors(cov, [...BOTH_LEDGERS, ["speedingBills", 700], ["marksJoined", 450], ["capNearSpeeding", 540]]);
  }, 300_000);
  it("G · the round-10 verifier's 288-programme grid and its 288 controls — 0 differences", () => {
    const flat = staleSurfaceGrid().flatMap((g) => [g.frames, g.control]);
    const { mismatches, cov } = census("G", flat.length, (i) => flat[i - 1]);
    expect(said(mismatches)).toEqual([]);
    expect(cov.programmes).toBe(576);
    floors(cov, [["stampEndsWait", 500], ["capNearKin", 3000], ["condBills", 1000]]);
  }, 300_000);
  it("A · the act-structure programmes, seeds 1..3000 — 0 differences, and the floor of every shape of the cap ledger", () => {
    const { mismatches, cov } = census("A", 3000, generateActProgramme);
    expect(said(mismatches)).toEqual([]);
    floors(cov, [
      ...BOTH_LEDGERS,
      ["capActs", 9500],
      ["gradedArrivals", 5600],
      ["signBoundBlows", 6600],
      ["marksJoined", 2100],
      ["gradedTakesWait", 600],
      ["stampEndsWait", 1700],
      ["heldEndsWait", 2100],
      ["absorbedStretchBills", 6500],
      ["capRegrades", 2250],
      ["capRegradesRefused", 150],
      ["capNearKin", 12_800],
      ["capNearSpeeding", 3400],
      ["praises", 360],
    ]);
  }, 600_000);
  it("M · the round-11 verifier's own generator, seeds 1..3000 — 0 differences", () => {
    const { mismatches, cov } = census("M", 3000, myProgramme);
    expect(said(mismatches)).toEqual([]);
    floors(cov, [...BOTH_LEDGERS, ["gradedTakesWait", 330], ["heldEndsWait", 800], ["capNearSpeeding", 4100], ["fogBills", 3000]]);
  }, 600_000);
  it("THE COMMITTED PAIRS — derived from the compiled lessons: 521 capped objectives, the glass figure under the gate on 300+ of them, 13 distinct differences", () => {
    const pairs = committedPairs();
    expect(pairs.length).toBe(521);
    // The product's own invariant (`advisor.ts spokenCapKmh` ends on a Math.min with the gate): the figure on the glass is never ABOVE the gate.
    expect(pairs.filter((p) => p.glass > p.gate)).toEqual([]);
    expect(pairs.filter((p) => p.glass < p.gate).length).toBeGreaterThan(300);
    const deltas = committedPairDeltas(pairs);
    expect(deltas[0]).toBe(0);
    expect(deltas.length).toBeGreaterThanOrEqual(10);
    expect(deltas.every((d) => d >= 0 && d <= 12)).toBe(true);
    // «…and beyond»: none of the extra differences is a committed one.
    expect(BEYOND_DELTAS.filter((d) => deltas.includes(d))).toEqual([]);
    expect(PAIR_DELTAS.length).toBe(deltas.length + BEYOND_DELTAS.length);
  });
  it("P · THE WIDENED DOMAIN, seeds 1..4000 — 0 differences, and the COVERAGE FLOOR of every dimension: the pair (the glass figure against the gate, in every regime against the sign), reversing, snow, night and the fog lamps, the car past the kerb — and the two ledgers meeting in all of them", () => {
    const { mismatches, cov } = census("P", 4000, (i) => generateActProgramme(i, { pairs: PAIR_DELTAS }));
    expect(said(mismatches)).toEqual([]);
    floors(cov, [
      ...BOTH_LEDGERS,
      // THE PAIR
      ["pairFrames", 900_000],
      ["signBoundBlowsGlassUnderGate", 7000],
      ["gradedBlowsGlassUnderGate", 6000],
      ["gradedBlowsGateAtOrAboveSign", 1500],
      ["betweenTheLinesFrames", 80_000],
      ["overGlassUnderGateFrames", 100_000],
      // REVERSING
      ["reversingFrames", 35_000],
      ["reversingOverTaskLineFrames", 20_000],
      ["reversingOverEnvelopeFrames", 10_000],
      // WEATHER AND LIGHT
      ["nightFrames", 35_000],
      ["snowFrames", 45_000],
      ["fogLampFrames", 12_000],
      ["fogBills", 500],
      // OFF THE CARRIAGEWAY
      ["offCarriagewayFrames", 35_000],
      ["offCarriagewayBills", 800],
      ["bendArmRefusedOffRoad", 15_000],
      ["bendBillsOffRoad", 300],
      // THE CAP LEDGER
      ["capActs", 11_300],
      ["gradedArrivals", 6100],
      ["signBoundBlows", 8000],
      ["marksJoined", 2000],
      ["gradedTakesWait", 740],
      ["stampEndsWait", 2400],
      ["heldEndsWait", 2700],
      ["absorbedStretchBills", 6300],
      ["capRegrades", 2350],
      ["capRegradesRefused", 110],
      // WHERE THEY MEET
      ["capNearKin", 14_200],
      ["capNearSpeeding", 5300],
      ["praises", 800],
    ]);
  }, 600_000);
  it("R · MARKS BLOWN IN REVERSE, seeds 1..2000 — 0 differences, and the floor: hundreds of marks blown backing, sign-bound and graded, and the wait ended on the blow's OWN frame (the round-13 verifier's C3 shape: R573 and R1219 among them)", () => {
    const { mismatches, cov } = census("R", 2000, (i) => generateActProgramme(i, { pairs: PAIR_DELTAS, reverseBlows: true }));
    expect(said(mismatches)).toEqual([]);
    floors(cov, [
      ...BOTH_LEDGERS,
      ["reverseBlows", 1500],
      ["reverseBlowsSignBound", 900],
      ["heldEndsWaitOnBlowFrame", 550],
      ["reverseBlowsWaited", 300],
      ["capNearSpeeding", 2700],
    ]);
  }, 600_000);
});
