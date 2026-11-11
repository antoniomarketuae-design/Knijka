/**
 * ST-VERDICT-HOLD — «Пропусна насрещните» WAITS FOR THE LEFT TURN'S ADJUDICATION (integrator ruling 2026-11-10,
 * lane slowturn2 round 3; sc-turn-left-oncoming:1613ef2c; advisor.ts `YIELD_VOICE_ONCOMING_TURN_HOLD`).
 *
 * MEASURED before the hold (rig-w4b S12, PC and phone, L1 and L3, at 60 Hz, 30 Hz and phone cadence — 12 of 12):
 * «Пропусна насрещните — Изчака 5 с и зави чак когато интервалът стигна — без отчетено нарушение на предимството.
 * Точно това мери този урок…» at k2330, four seconds after he moved off and 22 m before the node, then for the SAME
 * turn «Непропускане на насрещния» (the R13''' late read) at k2824 / k2805. The ruling: hold the oncoming-wait verdict
 * while this junction visit's left turn can still be billed (`oncomingTurnOpen` ← `SimTick.leftTurnOncomingOpen`),
 * and DROP it for the visit if a left-turn-oncoming bill lands (`oncomingTurnBilled` ← `SimTick.leftTurnOncomingBilled`).
 * No string changes; no other duty changes; the time window stays the floor; the hold only ever delays.
 *
 * Pure folds of `stepYieldVoice` here; the runtime half is pinned in runtime/__tests__/left-turn-late-read.test.ts
 * («ST-VERDICT-HOLD»), the live chain in lessons/scenario/__tests__/slowturn2-verdict-hold.live.test.ts.
 */
import { describe, expect, it } from "vitest";
import { YIELD_VOICE_NAME_S, YIELD_VOICE_VERDICT_S, stepYieldVoice } from "../advisor";
import type { YieldReason, YieldVoiceState, YieldWaitState } from "../types";
import { applyTick, createLessonSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SC_TURN_LEFT_ONCOMING } from "../scenario/templates-junctions";
import { makeTick } from "./fixtures";

const VERDICT = "Пропусна насрещните";
const STEP = 0.1;
type Input = Parameters<typeof stepYieldVoice>[1];
type Extra = Partial<Pick<Input, "oncomingTurnOpen" | "oncomingTurnBilled" | "ringEntryOpen" | "violations">>;

const waiting = (reason: YieldReason, sinceSec: number): YieldWaitState => ({ holding: true, sinceSec, reason, pedestrianCrossingIds: [] });
const free: YieldWaitState = { holding: false, sinceSec: null, reason: null, pedestrianCrossingIds: [] };

class Voice {
  state: YieldVoiceState | undefined;
  t = 0;
  said: Array<{ t: number; title: string; body: string }> = [];
  frame(wait: YieldWaitState, speedKmh: number, extra: Extra = {}): this {
    this.t = +(this.t + STEP).toFixed(1);
    const r = stepYieldVoice(this.state, { t: this.t, speedKmh, wait, violations: extra.violations ?? [], ...extra });
    this.state = r.state;
    for (const n of r.notices) this.said.push({ t: this.t, title: n.titleBg, body: n.explanationBg });
    return this;
  }
  /** Stand `sec` seconds in a lawful wait for `reason`. */
  stand(reason: YieldReason, sec: number, extra: Extra = {}): this {
    const since = +(this.t + STEP).toFixed(1);
    for (let i = 0; i < Math.round(sec / STEP); i++) this.frame(waiting(reason, since), 0, extra);
    return this;
  }
  /** Drive `sec` seconds at `kmh`, the wait over. */
  roll(sec: number, kmh: number, extra: Extra = {}): this {
    for (let i = 0; i < Math.round(sec / STEP); i++) this.frame(free, kmh, extra);
    return this;
  }
  verdicts() {
    return this.said.filter((s) => s.title === VERDICT);
  }
}

describe("ST-VERDICT-HOLD — the oncoming-wait verdict waits for the left turn's adjudication", () => {
  it("the premise (the fold before this ruling, and every frame with nothing open): said once, YIELD_VOICE_VERDICT_S after the wheels turned", () => {
    const v = new Voice().stand("oncomingVehicle", 6).roll(10, 12);
    expect(v.said.map((s) => s.title)).toEqual(["Защо чакаш: завиващият наляво пропуска", VERDICT]);
    const went = 6 + STEP;
    expect(v.verdicts()[0].t).toBeCloseTo(went + YIELD_VOICE_VERDICT_S, 5);
    expect(YIELD_VOICE_NAME_S).toBeLessThan(6);
  });

  it("HELD while the turn can still be billed — past four seconds, for as long as that lasts — and said, unchanged, on the first frame it cannot", () => {
    const open = new Voice().stand("oncomingVehicle", 6).roll(12, 12, { oncomingTurnOpen: true });
    expect(open.verdicts()).toEqual([]);
    expect(open.state?.pending?.turnHeld).toBe(true);
    const closed = open.roll(0.1, 12);
    expect(closed.verdicts()).toHaveLength(1);
    expect(closed.verdicts()[0].t).toBeCloseTo(6 + 12 + 0.1, 5);
    // the copy is the base copy — the hold changes when, never what
    const base = new Voice().stand("oncomingVehicle", 6).roll(10, 12).verdicts()[0];
    expect(closed.verdicts()[0].body).toBe(base.body);
    expect(closed.state?.pending).toBeNull();
    // once
    expect(closed.roll(5, 12).verdicts()).toHaveLength(1);
  });

  it("A BILL DROPS IT: the turn is billed while the verdict is held — never said, not after the window closes, not later in the visit", () => {
    const v = new Voice()
      .stand("oncomingVehicle", 6)
      .roll(8, 12, { oncomingTurnOpen: true })
      .roll(0.1, 12, { oncomingTurnBilled: true }) // the bill's frame: the window has closed with it
      .roll(15, 12, { oncomingTurnBilled: true });
    expect(v.verdicts()).toEqual([]);
    expect(v.state?.pending).toBeNull();
  });

  it("…and a bill whose scored code never reached the voice (a withheld charge) drops it all the same — the latch is the tracker's, not the scorer's", () => {
    const v = new Voice().stand("oncomingVehicle", 6).roll(3, 12, { oncomingTurnOpen: true }).roll(10, 12, { oncomingTurnBilled: true });
    expect(v.verdicts()).toEqual([]);
  });

  it("FOR THE VISIT: a second wait in the same billed visit earns no verdict either", () => {
    const v = new Voice()
      .stand("oncomingVehicle", 6)
      .roll(6, 12, { oncomingTurnOpen: true })
      .roll(0.1, 0, { oncomingTurnBilled: true })
      .stand("oncomingVehicle", 15, { oncomingTurnBilled: true })
      .roll(10, 12, { oncomingTurnBilled: true });
    expect(v.verdicts()).toEqual([]);
  });

  it("IT ONLY DELAYS: a verdict held past its time survives a stop made inside the junction before the turn is read (the careful turner who waits again clear of the oncoming lane), and is said after the turn", () => {
    const v = new Voice()
      .stand("oncomingVehicle", 6)
      .roll(5, 8, { oncomingTurnOpen: true }) // due at +4 s, held
      .stand("oncomingVehicle", 20, { oncomingTurnOpen: true }) // stops again at arc vertex 3
      .roll(6, 8, { oncomingTurnOpen: true }) // turns; committed and read at the end of this
      .roll(1, 8);
    expect(v.verdicts()).toHaveLength(1);
    expect(v.verdicts()[0].t).toBeCloseTo(6 + 5 + 20 + 6 + 0.1, 5);
  });

  it("…and when the wait made inside the junction ENDS while he still stands (the oncoming car gone, he gathers himself past YIELD_VOICE_DEPART_GRACE_S), the held verdict is still said after the turn — it is not replaced by the second wait's", () => {
    const v = new Voice()
      .stand("oncomingVehicle", 6)
      .roll(5, 8, { oncomingTurnOpen: true })
      .stand("oncomingVehicle", 20, { oncomingTurnOpen: true });
    for (let i = 0; i < 120; i++) v.frame(free, 0, { oncomingTurnOpen: true }); // 12 s standing, the wait over
    v.roll(6, 8, { oncomingTurnOpen: true }).roll(1, 8);
    expect(v.verdicts()).toHaveLength(1);
    expect(v.verdicts()[0].body).toMatch(/^Изчака 6 с /);
  });

  it("…while a re-stop BEFORE the verdict was due drops it as it always did (a creep up a queue: nothing has been judged)", () => {
    const v = new Voice()
      .stand("oncomingVehicle", 6)
      .roll(1, 8, { oncomingTurnOpen: true })
      .stand("oncomingVehicle", 0.5, { oncomingTurnOpen: true });
    expect(v.state?.pending ?? null).toBeNull();
  });

  it("ONLY THE ONCOMING DUTY: a red-light verdict ignores the left-turn hold and the bill latch", () => {
    const v = new Voice().stand("redLight", 6).roll(10, 12, { oncomingTurnOpen: true, oncomingTurnBilled: true });
    expect(v.said.map((s) => s.title)).toEqual(["Защо чакаш: червен сигнал", "Изчака сигнала и тръгна чисто"]);
    expect(v.said[1].t).toBeCloseTo(6 + STEP + YIELD_VOICE_VERDICT_S, 5);
  });
});

/* The engine half: `applyTick` hands the voice the tick's two fields (lessons/engine.ts), on a real
   sc-turn-left-oncoming session — the wait at the mouth ltap-oncoming-wait.test.ts drives, then off at 12 km/h. */
describe("ST-VERDICT-HOLD — the wiring: applyTick reads SimTick.leftTurnOncomingOpen and SimTick.leftTurnOncomingBilled", () => {
  const LESSON = compileScenario(SC_TURN_LEFT_ONCOMING, 3);
  const LANE_Y = 4.06;
  const MOUTH = { x: 12, y: LANE_Y };
  /** 6 s at the mouth with the oncoming 1.4 s out, then `rollSec` rolling with `fields` on every rolling tick. */
  function drive(rollSec: number, fields: (t: number) => Record<string, unknown>): Array<{ t: number; title: string }> {
    let s = createLessonSession(LESSON);
    s = applyTick(s, makeTick({ t: 0, position: { x: 90, y: LANE_Y }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 0.1, position: { x: 45, y: LANE_Y }, speedKmh: 30 })).state;
    const said: Array<{ t: number; title: string }> = [];
    let t = 0.1;
    const push = (out: ReturnType<typeof applyTick>) => {
      for (const e of out.hudEvents) if (e.kind === "lesson") said.push({ t, title: e.titleBg });
    };
    for (let i = 0; i < 60; i++) {
      t = +(t + 0.1).toFixed(1);
      const out = applyTick(s, makeTick({ t, position: MOUTH, speedKmh: 0, oncomingVehicleGapSec: 1.4 }));
      s = out.state;
      push(out);
    }
    for (let i = 0; i < rollSec * 10; i++) {
      t = +(t + 0.1).toFixed(1);
      const out = applyTick(s, makeTick({ t, position: { x: 11 - i * 0.03, y: LANE_Y }, speedKmh: 12, ...fields(t) }));
      s = out.state;
      push(out);
    }
    return said.filter((x) => x.title === VERDICT);
  }
  it("the premise: nothing on the tick — said four seconds after the wheels turned", () => {
    const v = drive(10, () => ({}));
    expect(v).toHaveLength(1);
    // first rolling tick t 6.2; the fold records the departure one tick later (6.3), so 6.3 + 4 s
    expect(v[0].t).toBeCloseTo(6.3 + YIELD_VOICE_VERDICT_S, 5);
  });
  it("leftTurnOncomingOpen on the tick until t 14: held, and said on the first tick without it", () => {
    const v = drive(12, (t) => (t <= 14 ? { leftTurnOncomingOpen: true } : {}));
    expect(v.map((x) => x.t)).toEqual([14.1]);
  });
  it("leftTurnOncomingBilled on the tick (a bill the scored codes do not carry): never said", () => {
    const v = drive(12, (t) => (t <= 9 ? { leftTurnOncomingOpen: true } : { leftTurnOncomingBilled: true }));
    expect(v).toEqual([]);
  });
});
