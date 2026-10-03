/**
 * THE TASK CEILING, ROUND 14 — THE GENERATED PROPERTY CENSUS: «CAP ADDS, NEVER REMOVES» AS A PROPERTY OF THE REDUCER.
 *
 * FOUNDER RULING 2026-10-03, verbatim: «Cap adds, never removes. The task cap is an extra rule on top. Its bill stands
 * on its own; the bend/weather bills are charged exactly as they would be in a lesson with no cap. Blowing the cap can
 * only add, never lower the score, and order never matters.»
 *
 * Round 11–13's census checked an oracle of the „kin ledger" (P0–P7: one bill per act, nothing after an absorber, a
 * lapse behind every surfaced card, one bill of the law per M-16 act) — the readings the ruling supersedes. Its
 * acceptance is now a property that needs no model of what the reducer ought to bill: for EVERY generated drive, run it
 * twice through the real reducer — with the cap, and with the cap fields removed (`taskCapTwoLedgers.ts`):
 *  L1 THE NO-CAP LEDGER IS UNTOUCHED — every violation that is not the cap's is the same event, field for field, on the
 *     same frame, in the same order, in both runs;
 *  L2 THE CAP BILLS ONLY ITSELF — no cap bill without the cap, no hand-over mark on any bill, `absorbedBy` only on a cap
 *     bill and only naming the cap;
 *  L3 PRAISE CAN ONLY BE WITHHELD — by every frame, no more CLEAN_DRIVING with the cap than without.
 * And ORDER NEVER MATTERS (family O, `taskCapOrderProgrammes.ts`: each event of a generated act moved on its own by
 * fractions of a second): the cap's bills do not change when only a weather or bend event moves, and the other bills do
 * not change when only the cap's second mark moves. What the cap ledger itself bills is checked two-sided against the
 * reference in `task-cap-two-sided-census.test.ts`; what the lesson makes of both, through real lesson sessions, in the
 * lesson censuses.
 *
 * ROUND 13's C3 DISSOLVES (the round-13 verifier: «R573/R1219, a blow on the frame a speeding correction becomes held,
 * reverse only» — the one place round 13's oracle and its reducer read the act apart). The cap's bill is never absorbed
 * by a speeding bill, so there is nothing to read apart: family R is checked with NO pinned seed, and the two seeds are
 * named below.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleEvent, SimTick } from "..";
import { generateActProgramme, myProgramme } from "./taskCapActProgrammes";
import { BEYOND_DELTAS, committedPairDeltas } from "./taskCapCommittedPairs";
import { generateOrderAct } from "./taskCapOrderProgrammes";
import { generateProgramme, staleSurfaceGrid } from "./taskCapProgrammes";
import { emptyLedgerCoverage, ledgerBreaches, runFrames, TASK, type LedgerBreach, type LedgerCoverage } from "./taskCapTwoLedgers";

const DELTAS = [...new Set([...committedPairDeltas(), ...BEYOND_DELTAS])].sort((a, b) => a - b);

function family(tag: string, n: number, gen: (i: number) => SimTick[]): { breaches: string[]; cov: LedgerCoverage } {
  const cov = emptyLedgerCoverage();
  const breaches: string[] = [];
  for (let i = 1; i <= n; i++) for (const b of ledgerBreaches(gen(i), cov)) breaches.push(`${tag}${i} ${b.prop} @${b.t} ${b.note}`);
  if (process.env.TASK_CAP_CENSUS_OUT) appendFileSync(process.env.TASK_CAP_CENSUS_OUT, JSON.stringify({ census: "two-ledgers", family: tag, breaches: breaches.length, cov }) + "\n");
  return { breaches, cov };
}
const meets = (cov: LedgerCoverage, kin: number, speeding: number) => {
  expect(cov.capBills).toBeGreaterThan(100);
  expect(cov.capAndKin).toBeGreaterThan(kin);
  expect(cov.capAndSpeeding).toBeGreaterThan(speeding);
};

describe("THE TWO LEDGERS — every generated programme, with the cap and with the cap removed, through the real reducer", () => {
  it("L · seeds 1..4000: L1–L3 hold on every programme; the cap and the other codes meet in thousands of them", () => {
    const { breaches, cov } = family("L", 4000, (i) => generateProgramme(i));
    expect(breaches.slice(0, 5)).toEqual([]);
    expect(cov.programmes).toBe(4000);
    meets(cov, 2500, 1000);
  }, 600_000);
  it("S · the speed-blow family, seeds 1..600: L1–L3 hold", () => {
    const { breaches, cov } = family("S", 600, (i) => generateProgramme(i, { speedBlow: true }));
    expect(breaches.slice(0, 5)).toEqual([]);
    meets(cov, 300, 250);
  }, 300_000);
  it("A · the act-structure programmes, seeds 1..3000: L1–L3 hold", () => {
    const { breaches, cov } = family("A", 3000, generateActProgramme);
    expect(breaches.slice(0, 5)).toEqual([]);
    meets(cov, 2000, 1000);
  }, 600_000);
  it("M · the round-11 verifier's generator, seeds 1..3000: L1–L3 hold", () => {
    const { breaches, cov } = family("M", 3000, myProgramme);
    expect(breaches.slice(0, 5)).toEqual([]);
    meets(cov, 1500, 1000);
  }, 600_000);
  it("P · the widened domain, seeds 1..4000: L1–L3 hold", () => {
    const { breaches, cov } = family("P", 4000, (i) => generateActProgramme(i, { pairs: DELTAS }));
    expect(breaches.slice(0, 5)).toEqual([]);
    meets(cov, 2500, 1500);
  }, 600_000);
  it("R · marks blown IN REVERSE, seeds 1..2000: L1–L3 hold with NO pinned seed — round 13's boundary (R573, R1219) dissolves", () => {
    const { breaches, cov } = family("R", 2000, (i) => generateActProgramme(i, { pairs: DELTAS, reverseBlows: true }));
    expect(breaches.slice(0, 5)).toEqual([]);
    expect(cov.reverseBlows).toBeGreaterThan(800);
    meets(cov, 1200, 700);
    for (const seed of [573, 1219]) expect(ledgerBreaches(generateActProgramme(seed, { pairs: DELTAS, reverseBlows: true })), `R ${seed}`).toEqual([]);
  }, 600_000);
  it("G · the round-10 verifier's 288-programme grid and its controls: L1–L3 hold", () => {
    const flat = staleSurfaceGrid().flatMap((g) => [g.frames, g.control]);
    const { breaches, cov } = family("G", flat.length, (i) => flat[i - 1]);
    expect(breaches.slice(0, 5)).toEqual([]);
    expect(cov.programmes).toBe(576);
  }, 300_000);
});

const TASK_ONLY = (events: ReadonlyArray<{ i: number; e: RuleEvent }>) => JSON.stringify(events.filter((x) => x.e.kind === "violation" && x.e.code === TASK));
const OTHERS = (events: ReadonlyArray<{ i: number; e: RuleEvent }>) => JSON.stringify(events.filter((x) => !(x.e.kind === "violation" && x.e.code === TASK) && x.e.kind === "violation"));

describe("ORDER NEVER MATTERS — family O through the real reducer: the cap's bills do not move with a weather or bend event, nor theirs with the cap's mark", () => {
  it("acts 1..1500, every shift of every act: L1–L3 on every variant; the cap's events identical across weather/bend shifts, the other codes' identical across the cap's mark shifts; not vacuous", () => {
    const breaches: LedgerBreach[] = [];
    const where: string[] = [];
    let variants = 0;
    let kinGroups = 0;
    let markGroups = 0;
    let capKinSwaps = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const act = generateOrderAct(seed, DELTAS);
      const markIx = act.events.indexOf("MARK");
      const byMark = new Map<string, string>();
      const byKin = new Map<string, string>();
      const orders = new Set<string>();
      for (const shift of act.shifts) {
        const f = act.variant(shift);
        variants++;
        for (const b of ledgerBreaches(f)) {
          breaches.push(b);
          where.push(`act ${seed} shift ${shift.join(",")}: ${b.prop} @${b.t} ${b.note}`);
        }
        const r = runFrames(f);
        const markKey = markIx >= 0 ? String(shift[markIx]) : "-";
        const kinKey = shift.map((k, i) => (i === markIx ? 0 : k)).join(",");
        const tSig = TASK_ONLY(r.events);
        const oSig = OTHERS(r.events);
        const t0 = byMark.get(markKey);
        if (t0 === undefined) byMark.set(markKey, tSig);
        else if (t0 !== tSig) where.push(`act ${seed} shift ${shift.join(",")}: the cap's bills moved with a weather/bend event`);
        const o0 = byKin.get(kinKey);
        if (o0 === undefined) byKin.set(kinKey, oSig);
        else if (o0 !== oSig) where.push(`act ${seed} shift ${shift.join(",")}: the other codes' bills moved with the cap's mark`);
        const firstOf = (pred: (code: string) => boolean) => r.events.find((x) => x.e.kind === "violation" && pred(x.e.code))?.i ?? null;
        const ic = firstOf((c) => c === TASK);
        const ik = firstOf((c) => c === "SPEED_TOO_FAST_FOR_CONDITIONS" || c === "SPEED_TOO_FAST_FOR_CURVE");
        if (ic !== null && ik !== null) orders.add(ic < ik ? "C<K" : ic > ik ? "K<C" : "C=K");
      }
      kinGroups += byMark.size;
      markGroups += byKin.size;
      if (orders.size > 1) capKinSwaps++;
    }
    if (process.env.TASK_CAP_CENSUS_OUT) appendFileSync(process.env.TASK_CAP_CENSUS_OUT, JSON.stringify({ census: "two-ledgers", family: "O", breaches: where.length, variants, capKinSwaps }) + "\n");
    expect(where.slice(0, 5)).toEqual([]);
    expect(breaches).toEqual([]);
    expect(variants).toBeGreaterThan(25_000);
    expect(capKinSwaps).toBeGreaterThan(300);
    expect(kinGroups).toBeGreaterThan(1500);
    expect(markGroups).toBeGreaterThan(1500);
  }, 900_000);
});
