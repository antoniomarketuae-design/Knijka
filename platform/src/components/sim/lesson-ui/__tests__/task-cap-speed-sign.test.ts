/**
 * THE TASK CEILING, ROUND 15 — «LIKE A SPEED SIGN» (founder ruling 2026-10-03), through the REAL lesson session.
 *
 * THE RULING: a blown task cap is billed above the number the glass shows PLUS the same tolerance a posted limit gets
 * (`rules/types.ts` `speedingGraceRatio` 0,1 and `speedingGraceMaxKmh` 5 — so «≤36» bills above 39,6), on EVERY rung;
 * the rung ladder's grace stays for crediting the objective and for the coach's copy, NEVER for billing. Until round 15
 * the reducer billed above the objective's compiled gate plus its slack: L1 of `sc-follow-tailgater` showed «≤36» and
 * billed above 46 (36 + ladder 5 + slack 5), L5 above 41, L1 of `sc-ac-truck-spray` showed «≤80» and billed above 90.
 *
 * WHAT IS DRIVEN: the committed shadow route of each lesson (`taskCapGlassDrive.ts glassDrive`), the reported speed held
 * at X from 30 m before the capped mark to 30 m past it — so the car crosses the mark at X — at three speeds:
 *   the glass figure itself                 → no task bill;
 *   the glass figure + the sign's tolerance → no task bill (the A12 tie: the speeding gate bills strictly above too);
 *   0,1 km/h over that                       → billed: the first commission coached (ruling 16), its card quoting X.
 * The glass figure is read off the strip (the shell's snapshot), the tolerance off the rule config the session runs —
 * neither is re-typed here, and neither is the function under test.
 *
 * RED ON BASE 7c73590 (the line was gate + slack): every «just above» row on tailgater L1 and L5 and truck-spray L1 was
 * unbilled. Truck-spray L5 (gate 80 = glass 80, so the old line 85 and the new line coincide) is the guard that the
 * ruling moved nothing where the ladder adds nothing.
 */
import { describe, expect, it } from "vitest";
import { makeViolation, type ViolationCode } from "@/modules/sim/rules";
import { committedCappedRows, glassDrive, TASK, type CappedRow, type GlassDrive, type SpeedPlan, type Tap } from "./taskCapGlassDrive";

const ROWS = committedCappedRows();
const row = (id: string, lv: number, objectiveId: string): CappedRow => {
  const r = ROWS.find((x) => x.id === id && x.lv === lv && x.objectiveId === objectiveId);
  if (r === undefined) throw new Error(`no capped row ${id}@L${lv} ${objectiveId}`);
  return r;
};
/** Cross the mark at `v`: held from 30 m before the mark's acceptance to 30 m past it, whichever objective is active. */
const crossAt = (v: number): SpeedPlan => (c) => (c.win ? v : undefined);
const drive = (r: CappedRow, plan: SpeedPlan): GlassDrive => glassDrive(r, plan, { armed: false, calls: [] } as Tap);
const kmhTxt = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");

describe("«LIKE A SPEED SIGN» — the cap bills above the glass figure plus the sign's tolerance, on every rung", () => {
  // Where the ladder lets the objective CREDIT the speed (≤ the gate: tailgater L1 at 39,7 ≤ 41) it is credited a few
  // metres short of the mark and the mark is still decided where the car crosses it (`taskCapMarkWatch`); over the gate
  // it is never credited and the crossing is the active objective's own. Both paths are driven here.
  for (const [id, lv, obj, glass, gate] of [
    ["sc-follow-tailgater", 1, "sc-ftg-ease", 36, 41],
    ["sc-follow-tailgater", 5, "sc-ftg-ease", 36, 36],
    ["sc-ac-truck-spray", 1, "sc-acts-gap", 80, 85],
    ["sc-ac-truck-spray", 5, "sc-acts-gap", 80, 80],
  ] as const) {
    describe(`${id} L${lv} — the strip shows ≤${glass} (the compiled gate is ${gate})`, () => {
      // The glass figure the strip printed, and the line the session's own rule config gives it.
      const probe = drive(row(id, lv, obj), crossAt(glass));
      const cfg = probe.ended.rules.config;
      const line = glass + Math.min(glass * cfg.speedingGraceRatio, cfg.speedingGraceMaxKmh);

      it(`the strip printed ≤${glass}, and the bill line is ${glass} + min(${glass} × ${cfg.speedingGraceRatio}, ${cfg.speedingGraceMaxKmh}) = ${kmhTxt(line)}`, () => {
        expect(probe.err).toBeNull();
        expect(probe.glassBeforeBlow).toBe(glass);
        expect(probe.row.gate).toBe(gate);
        expect([cfg.speedingGraceRatio, cfg.speedingGraceMaxKmh]).toEqual([0.1, 5]);
      });
      it(`the mark passed AT the glass figure (${glass}) — no task bill, no breach row`, () => {
        expect(probe.coached.filter((c) => c.startsWith(TASK))).toEqual([]);
        expect(probe.mistakes.filter((c) => c.startsWith(TASK))).toEqual([]);
        expect(probe.breaches).toEqual([]);
      });
      it(`the mark passed EXACTLY on the line (${kmhTxt(line)}) — no task bill (the A12 tie, as at a posted limit)`, () => {
        const d = drive(row(id, lv, obj), crossAt(line));
        expect(d.coached.filter((c) => c.startsWith(TASK))).toEqual([]);
        expect(d.mistakes.filter((c) => c.startsWith(TASK))).toEqual([]);
        expect(d.breaches).toEqual([]);
      });
      it(`the mark passed 0,1 over the line (${kmhTxt(line + 0.1)}) — billed: the first commission is coached, its card quotes the speed at the mark and the glass figure, a breach row is written`, () => {
        const v = line + 0.1;
        const d = drive(row(id, lv, obj), crossAt(v));
        const rows = d.coached.filter((c) => c.startsWith(TASK));
        expect(rows).toHaveLength(1);
        // Teach-first (ruling 16): the first commission of the cap's own topic is a free lesson — no point charged at the mark.
        const at = Number(rows[0].slice(rows[0].indexOf("@") + 1));
        expect(d.mistakes.filter((m) => m.startsWith(`${TASK}@${at.toFixed(2)}`))).toEqual([]);
        const card = d.cards.find((c) => c.code === TASK);
        expect(card?.text.startsWith(`Мина точката на задачата с ${kmhTxt(v)} км/ч при таван на задачата ${glass} км/ч`)).toBe(true);
        expect(card?.text.endsWith(makeViolation(TASK as ViolationCode, 0).explanationBg)).toBe(true);
        expect(d.breaches).toEqual([`${obj}@${at.toFixed(2)}`]);
      });
    });
  }
});

describe("the coach's copy keeps the ladder (round 15 changed the bill line, not the objective)", () => {
  it("sc-follow-tailgater L1 crossed at 44 on the clean shadow route: the cap is billed (44 > 39,6) AND the objective's own card still offers the save that works there — 44 is inside the rung's slack, so slowing on the mark to the gate still credits the task", () => {
    const d = drive(row("sc-follow-tailgater", 1, "sc-ftg-ease"), crossAt(44));
    expect(d.coached.filter((c) => c.startsWith(TASK))).toHaveLength(1);
    const card = d.toasts.find((x) => x.titleBg === "Стигна точката, но твърде бързо");
    expect(card?.text).toContain("— затова още не се отчита. Намали СЕГА, докато си върху точката.");
    expect(card?.text).not.toContain("по-рано в този урок");
  });
});
