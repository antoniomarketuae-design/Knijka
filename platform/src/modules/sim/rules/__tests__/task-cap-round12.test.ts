/**
 * THE TASK CEILING, ROUND 12 — the reducer.
 *
 * A · F-STRETCH (the integrator's ruling for round 12: «must be settled and DISCLOSED»; its reading of the rulings,
 *     binding: «the blown arrival mark IS the offence; one bill per continuous act; the per-topic grace: the teach
 *     belongs AT THE BLOW, and the rest of the same continuous act adds no second bill»). The verifier's probe: a
 *     sign-bound ≤60 mark blown at 67.6 on a posted 60, the sign then raised past the cap with the ≤60 latch stamping
 *     the car at 66–68 for 6–30 s. Round 10 taught the STRETCH's first bill 3 s after the stamp (4.2) and charged its
 *     re-grade (10.2); round 11 joined the stretch to the wait, so the one card came at the held correction 15–34 s
 *     after the blow and nothing was charged (score 0) — while its GRADED TWIN (the same driving, the sign already
 *     raised at the blow) is taught at the blow and charged once (score 1). Round 12 — THE NAMED STRETCH ENDS THE WAIT
 *     (`rules/engine.ts`): the lesson stamps a latch only where its cap is under the sign, so the first stamped frame
 *     ends the one premise the arrival waited on; the arrival is billed THERE (1.1, the frame after the blow), quoting
 *     its blow, exactly as its graded twin is at its blow; the stretch's first bill is absorbed (one name) and the act
 *     keeps its one re-grade charge (one charge) — the twin's act, one frame later.
 * B · WHAT FOLLOWS FROM THE RULE, each the graded twin's rule, pinned both ways against its mirror order.
 * C · THE ROUND-11 VERIFIER'S WITNESSES for N8 (its programme 774), N28 and N30 — every bill exactly as the two-sided
 *     reference ledger derives it (`taskCapReference.ts`), and the decisive bill named.
 * D · THE COMPARISON IS TWO-SIDED: the exact comparator reports a dropped, moved, recoded, reclassed or added bill and
 *     a changed ending — it is not blind to a LOWER-bound breach.
 *
 * Cases marked RED-ON-R11 were run RED on round 11's engine (`scratchpad/cap/r12b/red-on-r11-*.txt`); the C witnesses
 * were run on round 11's engine WITH the mutant they name and are RED there (same directory).
 *
 * ROUND 14 — RETIRED HERE: 7 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
 * is an extra rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a
 * lesson with no cap. Blowing the cap can only add, never lower the score, and order never matters.»). Each pinned a
 * reading the ruling supersedes — a task-cap bill absorbing, or absorbed by, a weather, bend or SPEEDING_* bill, the kin
 * ledger's owners, lapses, surfaced cards and hand-overs, one bill per M-16 act — or read the state that carried them.
 * Their titles are in the round-14 hand-off log (`scratchpad/cap/r14/retired.txt`); what replaced them is the two-ledger
 * property (`rules/__tests__/taskCapTwoLedgers.ts`, `task-cap-property-census`), the two-ledger reference
 * (`task-cap-two-sided-census`), the lesson censuses and `task-cap-round14`. The tests left here pin readings the ruling
 * keeps (the cap ledger's own rules, the stretch of ruling 2, the card copy).
 */
import { describe, expect, it } from "vitest";
import type { RuleEvent, SimTick, ViolationEvent } from "..";
import { drive } from "./fixtures";
import { checkExact, runSystem } from "./taskCapExact";
import { billKey, expectedOutcome } from "./taskCapReference";
import { generateProgramme, labels } from "./taskCapProgrammes";
import { generateActProgramme, myProgramme } from "./taskCapActProgrammes";
import { CENSUS, ST } from "./taskCapWitnesses11";
import { PRIOR_STRETCH, R12, STRETCH_VARIANTS, stretchPair } from "./taskCapWitnesses12";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CURVE = "SPEED_TOO_FAST_FOR_CURVE";
const OVER = "SPEEDING_OVER_LIMIT";

const viol = (ev: readonly RuleEvent[]) => ev.filter((e): e is ViolationEvent => e.kind === "violation");
const taskLabels = (f: SimTick[]) => labels(drive(f).events).filter((x) => x.startsWith(TASK));
const kinds = (xs: string[]) => xs.map((x) => x.replace(/@[\d.]+$/, ""));
const times = (xs: string[]) => xs.map((x) => Number(x.slice(x.lastIndexOf("@") + 1)));
const praiseTimes = (ev: readonly RuleEvent[]) => ev.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING").map((e) => e.t);
const shownTask = (ev: readonly RuleEvent[]) =>
  viol(ev).filter((e) => e.code === TASK && e.absorbedBy === undefined && e.regrade !== true && (e as unknown as { kinSurface?: string }).kinSurface === undefined);

describe("A · F-STRETCH — from the first frame a waiting arrival's latch stamps, the arrival is billed there, as its graded twin is at its blow", () => {
  for (const { len, tag, v, raised } of STRETCH_VARIANTS) {
    const expected = len >= 10 ? [`${TASK}@1.1`, `${TASK}>${TASK}@4.2`, `${TASK}:rg@10.2`] : [`${TASK}@1.1`, `${TASK}>${TASK}@4.2`];
    it(`RED-ON-R11 · ${tag} ${len} s (${v} on a raised ${raised}) — ${expected.join(" ")}; the graded twin's bills one frame later; round 10 billed ${PRIOR_STRETCH.r10(len, tag).join(" ")}, round 11 ${PRIOR_STRETCH.r11(len, tag).join(" ")}`, () => {
      const { signBound, graded } = stretchPair(len, v, raised);
      const sb = taskLabels(signBound);
      const gr = taskLabels(graded);
      expect(sb).toEqual(expected);
      // THE GRADED TWIN: the same bills in the same order, each within two frames (the stamp starts one frame after
      // the blow; the task's 3 s sustain then lands on the float edge of the next frame).
      expect(kinds(sb)).toEqual(kinds(gr));
      times(sb).forEach((x, i) => expect(x - times(gr)[i]).toBeGreaterThanOrEqual(0.1 - 1e-9));
      times(sb).forEach((x, i) => expect(x - times(gr)[i]).toBeLessThanOrEqual(0.2 + 1e-9));
      // The card quotes its BLOW — the speed, the cap and the sign on the frame the mark was passed.
      const bill = shownTask(drive(signBound).events)[0];
      expect(bill?.signBoundArrival).toEqual({ arrivalKmh: 67.6, shownKmh: 60, postedKmh: 60 });
      // DISCLOSED: the change against rounds 10 and 11, measured on those trees.
      expect(sb).not.toEqual(PRIOR_STRETCH.r10(len, tag));
      expect(sb).not.toEqual(PRIOR_STRETCH.r11(len, tag));
    });
  }
  it("a waiting arrival whose latch never stamps still waits for its M-16 verdict (round 8 unchanged): the sign-bound mark blown and the car back under the sign bills on the held correction", () => {
    const f = R12.SECOND_MARK_NO_STAMP.filter((x) => x.t < 6.0 - 1e-9).concat(
      Array.from({ length: 100 }, (_, i) => ({ ...R12.SECOND_MARK_NO_STAMP[0], t: Math.round((6.0 + i / 10) * 10) / 10, speedKmh: 55 })),
    );
    expect(taskLabels(f)).toEqual([`${TASK}@10`]);
  });
});

describe("B · what follows from the rule — each the graded twin's rule, pinned against its mirror order", () => {
  it("RED-ON-R11 · STRETCH_SPEEDING (the round-11 witness it reverses, DISCLOSED) — the stamp at 1.0 teaches the arrival there; the SPEEDING_OVER_LIMIT at 6.6 co-bills («TWO LAWS, TWO BILLS»): after the stamp the task's cap is stricter than the sign. Round 11 billed only the speeding (the arrival absorbed by it)", () => {
    expect(labels(drive(CENSUS.STRETCH_SPEEDING).events)).toEqual([`${TASK}@1`, `${TASK}>${TASK}@4`, `${OVER}@6.6`]);
  });
  it("…its control, SECOND_MARK_NO_STAMP — the ≤60 latch never stamps, so its arrival still waits when the ≤45 mark is blown: the new mark's arrival takes the waiting act's one bill (round 7, unchanged)", () => {
    expect(labels(drive(R12.SECOND_MARK_NO_STAMP).events)).toEqual([`${TASK}@6`]);
  });
  it("RED-ON-R11 · KEPT_ACT_RESUMES — the arrival billed on its stamp names the act; the SAME latch's next stretch on the feature resumes it (round 6): absorbed, no second naming", () => {
    expect(labels(drive(R12.KEPT_ACT_RESUMES).events)).toEqual([`${TASK}@1.1`, `${TASK}>${TASK}@4.2`, `${TASK}>${TASK}@13`]);
  });
});

/** The round-11 verifier's generator programmes (`myProgramme`, ported verbatim) and the lane's census seeds. */
const WITNESS: Record<string, () => SimTick[]> = {
  M774: () => myProgramme(774),
  L397: () => generateProgramme(397),
  L1263: () => generateProgramme(1263),
  L2251: () => generateProgramme(2251),
  L2910: () => generateProgramme(2910),
  L275: () => generateProgramme(275),
  L1207: () => generateProgramme(1207),
  L2790: () => generateProgramme(2790),
  L3168: () => generateProgramme(3168),
  L3802: () => generateProgramme(3802),
};

describe("C · the round-11 verifier's witnesses — exactly as the reference ledger derives them, the decisive bill named", () => {
  for (const [k, gen] of Object.entries(WITNESS)) {
    it(`${k} — every bill, every frame's ending, equal to the reference`, () => {
      expect(checkExact(k, gen())).toEqual([]);
    });
  }
  it("N28 · act programme 849 — a kept act resumes ONLY on its own latch's stamp: the weather's first bill of a separate breach (82.2) names its own act and is shown, not surfaced inside a kept act another latch's stamp resumed. (Rounds 11–12 pinned seeds 397 and 2910 of the first family. Since round 13 an arrival's act is kept with the CURRENT latch and a mark blown inside an act that has its card restarts nothing, so a kept act and a stamp of ANOTHER latch meet far more rarely: of the 14,000 programmes of the census families L, A, M and P this is the one the latch test still decides.)", () => {
    expect(labels(drive(generateActProgramme(849)).events)).toContain(`${COND}@82.2`);
  });
  it("N30 · seeds 275, 1207, 2790, 3168, 3802 — a sign-bound blow inside an act whose TASK owner had lapsed is a NEW breach: it waits for its own verdict and bills itself (shown), never absorbed at the blow into the lapsed task act", () => {
    for (const [seed, t] of [
      [275, 22.5],
      [1207, 20.8],
      [2790, 16.6],
      [3168, 51.1],
      [3802, 43.3],
    ] as const) {
      const shown = shownTask(drive(generateProgramme(seed)).events).map((e) => e.t);
      expect(shown, `seed ${seed}`).toContain(t);
    }
  });
});

describe("D · the comparison is TWO-SIDED — it reports what is missing as well as what is extra", () => {
  it("every planted perturbation of the expected stream — a bill dropped, moved a frame, recoded, reclassed, added, or a changed ending — is reported at its frame", () => {
    const frames = generateProgramme(397);
    const exp = expectedOutcome(frames);
    const sut = runSystem(frames);
    const firstMismatch = (e: typeof exp): number | null => {
      for (let i = 0; i < frames.length; i++) {
        if (e.bills[i].map(billKey).join(" ") !== sut.bills[i].map(billKey).join(" ")) return i;
        if (JSON.stringify(e.endings[i]) !== JSON.stringify(sut.endings[i])) return i;
      }
      return null;
    };
    expect(firstMismatch(exp)).toBeNull();
    const i = exp.bills.findIndex((b) => b.some((x) => x.code === COND && x.kind === "shown"));
    expect(i).toBeGreaterThan(0);
    const clone = () => ({ bills: exp.bills.map((b) => b.map((x) => ({ ...x }))), endings: exp.endings.map((e) => ({ ...e })) });
    const perturb: Array<[string, (e: ReturnType<typeof clone>) => void]> = [
      ["drop", (e) => (e.bills[i] = e.bills[i].filter((x) => !(x.code === COND && x.kind === "shown")))],
      ["move", (e) => { const b = e.bills[i].find((x) => x.code === COND)!; e.bills[i] = e.bills[i].filter((x) => x !== b); e.bills[i + 1] = [...e.bills[i + 1], { ...b, t: frames[i + 1].t }]; }],
      ["recode", (e) => (e.bills[i] = e.bills[i].map((x) => (x.code === COND ? { ...x, code: TASK } : x)))],
      ["reclass", (e) => (e.bills[i] = e.bills[i].map((x) => (x.code === COND ? { ...x, kind: "absorbed" as const } : x)))],
      ["add", (e) => (e.bills[i] = [...e.bills[i], { t: frames[i].t, code: TASK, kind: "regrade" as const }])],
      ["ending", (e) => (e.endings[i] = { ...e.endings[i], task: "x" })],
    ];
    for (const [name, p] of perturb) {
      const e = clone();
      p(e);
      expect(firstMismatch(e), name).toBe(i);
    }
  });
});
