/**
 * THE TASK CEILING, ROUND 14 — «CAP ADDS, NEVER REMOVES» (founder ruling 2026-10-03) at the reducer: hand-built and
 * committed-shape witnesses for the two-ledger property (`taskCapTwoLedgers.ts` — L1 the no-cap ledger untouched, L2
 * the cap bills only itself, L3 praise only withheld). The generated census over every family is
 * `task-cap-property-census.test.ts`; the cap ledger's own bills, two-sided, `task-cap-two-sided-census.test.ts`.
 *
 * A · THE ROUND-13 BOUNDARY DISSOLVES (round-13 verifier C3): family R's seeds 573 and 1219 — a sign-bound mark blown,
 *     backing, on the very frame an earlier speeding act's 4 s correction becomes held. Round 13 pinned them as the one
 *     place its oracle and its reducer read the act apart (absorbed by the speeding bill, or a new act). Under the
 *     ruling the cap's bill is never absorbed by a speeding bill: both programmes satisfy L1–L3, and the cap bill is
 *     there, plain.
 * B · THE ROUND-13 VERIFIER'S LONG ACT and ORDER PROBES, at the reducer: the weather/bend/speeding stream with the cap is
 *     the stream with no cap.
 * C · NO HAND-OVER MARK IS LEFT: the cross-ledger marks round 2–13 added (`kinOwner`, `kinSurface`, a kin bill
 *     `absorbedBy` another code) are produced by nothing.
 * D · THE WITNESS NET: every witness programme rounds 11–13 exported, under the two ledgers and the reference.
 * E · OB29 (round-13 verifier): the line it mutated (`signAbsorbedByKin = true`, the kin ledger taking a later
 *     sign-bound blow into a kin-billed act) went with the kin ledger. The drive on which it took a card away,
 *     `generateActProgramme(3267)`, is pinned here card by card; the cap ledger's own form of the guard (a sign-bound
 *     blow after its act has its bill names nothing, `taskSignLatches`) is mutant OB29r of the round-14 table.
 * F · R1 AS A CLASS IN THE RULES' CARD TEXT: the speeding arithmetic (`consequences.ts deriveSpeedingBand`, shown on the
 *     fault card and in the debrief) printed every term rounded on its own; above 100 km/h it stated false sums.
 *
 * Cases tagged RED-ON-R13 were run RED on round 13's tree (`scratchpad/cap/r14/red-on-r13*.txt`).
 */
import { describe, expect, it } from "vitest";
import type { SimTick } from "..";
import { tick } from "./fixtures";
import { generateActProgramme } from "./taskCapActProgrammes";
import { BEYOND_DELTAS, committedPairDeltas } from "./taskCapCommittedPairs";
import { generateProgramme } from "./taskCapProgrammes";
import { ledgerBreaches, runFrames, TASK } from "./taskCapTwoLedgers";
import { ORDER_PLACEMENTS, orderKin } from "./taskCapWitnesses13";

const deltas = () => [...new Set([...committedPairDeltas(), ...BEYOND_DELTAS])].sort((a, b) => a - b);

describe("A · the round-13 boundary dissolves — R573 and R1219 (a reverse blow on the frame a speeding correction becomes held)", () => {
  for (const seed of [573, 1219]) {
    it(`RED-ON-R13 · R ${seed}: the no-cap ledger is untouched, the cap bills only itself, and the blow's cap bill stands on its own`, () => {
      const f = generateActProgramme(seed, { pairs: deltas(), reverseBlows: true });
      expect(ledgerBreaches(f)).toEqual([]);
      // the reverse blow at 32.9 s is billed by the cap ledger, plain — not absorbed into the speeding bill
      const r = runFrames(f);
      const at = r.events.filter((x) => x.e.kind === "violation" && x.e.code === TASK && Math.abs(x.e.t - 32.9) < 0.05);
      expect(at.map((x) => (x.e as { absorbedBy?: string }).absorbedBy ?? "plain")).toEqual(["plain"]);
    });
  }
});

describe("B · the weather, bend and speeding stream with the cap is the stream with no cap", () => {
  it("RED-ON-R13 · the long act: a sign-bound ≤50 mark blown at 56.2, then 53 in the sign's grace band through three bends in the rain", () => {
    const f: SimTick[] = [];
    for (let i = 0; i < 460; i++) {
      const t = i / 10;
      const x: Record<string, unknown> = {};
      let v = t < 0.9 - 1e-9 ? 49 : t < 1.0 - 1e-9 ? 56.2 : 53;
      if (Math.abs(t - 1.0) < 1e-9) x.taskCapArrival = { capKmh: 50, shownKmh: 50, graceKmh: 5, blownAtSec: 1.0, arrivalKmh: 56.2 };
      if ([[6, 10], [20, 24], [34, 38]].some(([a, b]) => t >= a - 1e-9 && t < b - 1e-9)) x.curveAdvisoryKmh = 30;
      if (t >= 12 - 1e-9 && t < 30 - 1e-9) {
        x.rain = true;
        x.headlights = "low";
      }
      if (t >= 40 - 1e-9) v = 45;
      f.push(tick(t, { maxSpeedKmh: 50, speedKmh: v, ...x } as Partial<SimTick>));
    }
    expect(ledgerBreaches(f)).toEqual([]);
  });
  it("RED-ON-R13 · the order probe: a bend's or the rain's first bill at every placement around the stamp, 4 s and 12 s stretches", () => {
    const bad: string[] = [];
    for (const kind of ["BEND", "RAIN"] as const)
      for (const len of [4, 12])
        for (const p of ORDER_PLACEMENTS) for (const b of ledgerBreaches(orderKin(kind, p.off, len))) bad.push(`${kind} ${len} ${p.tag}: ${b.prop} ${b.note}`);
    expect(bad).toEqual([]);
  });
});

describe("C · no hand-over mark is produced by anything", () => {
  it("RED-ON-R13 · 400 generated programmes of every shape round 11 built: L1–L3 hold, and no event carries kinOwner or kinSurface", () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 400; seed++) for (const b of ledgerBreaches(generateProgramme(seed))) bad.push(`seed ${seed}: ${b.prop} @${b.t} ${b.note}`);
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

describe("D · THE WITNESS NET — every witness programme rounds 11–13 exported (the verifiers' named drives and their controls), under the two ledgers", () => {
  /** Every programme reachable in a module's exports: an array of ticks, or one nested in records and pairs. */
  function programmesOf(mod: Record<string, unknown>): Array<[string, SimTick[]]> {
    const out: Array<[string, SimTick[]]> = [];
    const isProg = (v: unknown): v is SimTick[] =>
      Array.isArray(v) && v.length > 0 && typeof (v[0] as { t?: unknown }).t === "number" && typeof (v[0] as { speedKmh?: unknown }).speedKmh === "number";
    const walk = (name: string, v: unknown, depth: number) => {
      if (isProg(v)) out.push([name, v]);
      else if (depth < 4 && v !== null && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) walk(`${name}.${k}`, x, depth + 1);
    };
    for (const [k, v] of Object.entries(mod)) walk(k, v, 0);
    return out;
  }
  it("each satisfies L1–L3 (the no-cap ledger untouched, the cap bills only itself, praise only withheld) and agrees EXACTLY with the two-ledger reference", async () => {
    const mods = [await import("./taskCapWitnesses11"), await import("./taskCapWitnesses12"), await import("./taskCapWitnesses13")] as unknown as Array<Record<string, unknown>>;
    const { checkExact } = await import("./taskCapExact");
    const w12 = mods[1] as unknown as { stretchPair: (len: number, v: number, raised: number) => { signBound: SimTick[]; graded: SimTick[] }; STRETCH_VARIANTS: ReadonlyArray<{ len: number; tag: string; v: number; raised: number }> };
    const progs = mods.flatMap(programmesOf);
    for (const sv of w12.STRETCH_VARIANTS) {
      const p = w12.stretchPair(sv.len, sv.v, sv.raised);
      progs.push([`stretchPair ${sv.tag} sign-bound`, p.signBound], [`stretchPair ${sv.tag} graded`, p.graded]);
    }
    for (const kind of ["BEND", "RAIN"] as const) for (const len of [4, 12]) for (const p of ORDER_PLACEMENTS) progs.push([`orderKin ${kind} ${len} ${p.tag}`, orderKin(kind, p.off, len)]);
    const bad: string[] = [];
    for (const [name, f] of progs) {
      for (const b of ledgerBreaches(f)) bad.push(`${name}: ${b.prop} @${b.t} ${b.note}`);
      for (const m of checkExact(name, f)) bad.push(`${name}: reference ${m.what} t=${m.t}: expected «${m.expected}» got «${m.actual}»`);
    }
    expect(bad.slice(0, 5).join(String.fromCharCode(10))).toBe("");
    expect(progs.length).toBeGreaterThan(60);
  }, 300_000);
});

describe("F · R1 AS A CLASS, in the rules' own card text — the speeding arithmetic holds between its printed numbers", () => {
  it("over every (speed in tenths, limit, alinea) a speeding bill can carry: «Измерено X …; минус … T = C …, тоест превишаване с E» is true as printed, and «няма превишаване» never stands beside an E of 1 or more (round 13 and base: 324 of 39,000 false above 100 km/h, e.g. «105 … минус 3,2 = 101,9»)", async () => {
    const { deriveSpeedingBand, encodeSpeedMeasurement, parseSpeedMeasurement } = await import("../consequences");
    const num = (s: string) => Number(s.replace(",", "."));
    const LINE = /Измерено ([0-9,]+) km\/h при ограничение ([0-9,]+) km\/h; минус максимално допустимата грешка на уреда ([0-9,]+) km\/h = ([0-9,]+) km\/h, тоест превишаване с ([0-9,]+) km\/h/;
    let n = 0;
    let percent = 0;
    const bad: string[] = [];
    for (const limit of [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140]) {
      for (let k = 1; k <= 1500; k++) {
        const m = parseSpeedMeasurement(encodeSpeedMeasurement(limit + k / 10, limit));
        if (m === null) continue;
        for (const scope of ["urban", "outsideUrban"] as const) {
          const b = deriveSpeedingBand({ ...m, scope });
          n++;
          if (m.measuredKmh > 100) percent++;
          const a = LINE.exec(b.arithmeticBg);
          if (a === null) {
            bad.push(`unparsed: ${b.arithmeticBg}`);
            continue;
          }
          const [x, y, t, c, e] = a.slice(1).map(num);
          if (Math.abs(x - t - c) > 1e-9 || Math.abs(Math.max(c - y, 0) - e) > 1e-9) bad.push(`${m.measuredKmh}/${limit}: ${b.arithmeticBg}`);
          if (/няма превишаване/.test(b.verdictBg) && e >= 1) bad.push(`${m.measuredKmh}/${limit}: «няма превишаване» beside «превишаване с ${a[5]}»`);
          // the tolerance line names the same figure the sum subtracts
          const lab = / = ([0-9,]+) km\/h$/.exec(b.tolerance.labelBg);
          if (lab !== null && lab[1] !== a[3]) bad.push(`${m.measuredKmh}/${limit}: the tolerance line says ${lab[1]}, the sum subtracts ${a[3]}`);
        }
      }
    }
    expect(bad.slice(0, 3)).toEqual([]);
    expect(n).toBe(39_000);
    expect(percent).toBeGreaterThan(20_000);
  }, 120_000);
});

describe("E · OB29 (round-13 verifier) — its line went with the kin ledger; the drive it took a card from", () => {
  it("generateActProgramme(3267): L1–L3 hold, the reducer agrees EXACTLY with the two-ledger reference, and every cap bill is where the cap ledger alone puts it", async () => {
    const f = generateActProgramme(3267);
    expect(ledgerBreaches(f)).toEqual([]);
    const { checkExact } = await import("./taskCapExact");
    expect(checkExact("A3267", f).map((m) => `${m.what} t=${m.t}`)).toEqual([]);
    const task = runFrames(f)
      .events.filter((x) => x.e.kind === "violation" && x.e.code === TASK)
      .map((x) => {
        const e = x.e as { t: number; absorbedBy?: string; regrade?: boolean; signBoundArrival?: unknown };
        return `${e.t}${e.absorbedBy !== undefined ? " absorbed" : ""}${e.regrade === true ? " regrade" : ""}${e.signBoundArrival !== undefined ? " sign-bound" : ""}`;
      });
    // the sign-bound blow at 1.0 waits and the graded mark at 4.2 takes its act's one bill; the stretches' later first
    // bills are their acts carrying on; 18.6 waits, 21.8 waits with it, both billed once on the held correction (25.9);
    // the graded mark at 26.0 is a new act; 27.1 waits and bills on its own held correction (31.2).
    expect(task).toEqual(["4.2", "7.2 absorbed", "7.4", "10.4 absorbed", "16.5 regrade", "25.9 sign-bound", "26", "31.2 sign-bound"]);
  });
});
