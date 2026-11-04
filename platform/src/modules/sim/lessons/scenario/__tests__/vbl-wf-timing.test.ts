/**
 * sc-vu-bikelane-turn:9141072b clause (a) (lane vbltiming) — THE WITH-FLOW
 * RIDER COMES FROM BEHIND, on every rung.
 *
 * THE DEFECT (rig-w3n, re-measured in process on the base 69418cf): the
 * with-flow rider was held 30 m short of the node and cruised at 3.0 m/s, so on
 * every rung of every demo he was AHEAD of the car — +13.84 (L1) … +16.04 m
 * (L2) in front of its centre at the shadow's rest, everBehind false; on the
 * cut-path he was ahead-LEFT of the car at its turn latch (fwd +1.13 … +1.92).
 * Instruction 3, the objective and the moment «Огледало и рамо назад —
 * движещият се направо велосипедист» sent the student to look BEHIND for a
 * rider who never was.
 *
 * THE REPAIR (integrator rulings T1–T4): hold −73.5, cruise 5.0 m/s and the
 * authored footprint line guard (vbl-footprint-guard.test.ts) on him alone;
 * the shadow passes him standing with 2.80 m of room; the cut-path is re-timed
 * so he catches the slowing car from behind on its right and is cut off.
 *
 * WHAT IS PINNED — the drives are RECORDED HERE from the scripts (recorder,
 * seed 7: the drive the committed tapes are — the trace gate pins the bytes)
 * and replayed in the world LessonScene builds at L1–L5. Car frame from the
 * car's heading; fwd < 0 behind, left < 0 right.
 *   G1 shadow, at the car's first rest: WF behind (fwd ≤ −(2.02 + 1), within
 *      25 m), on its right, on his line.
 *   G2 he passes the car's centre while it STANDS.
 *   G3 the turn latches only after WF and CF are each ≥ 8 m past the mouth by
 *      ≥ 1 s; both runners «yielded»; no violation; under parTimeSec.
 *   G4 the shadow passes the standing rider at ≥ 2.75 m of centre lateral and
 *      earns exactly one vulnerable-pass commendation; the cut-path and
 *      only-behind keep the 2.6 m pass, silent.
 *   G5 the shadow carries nothing else new.
 *   G6 cut-path at the WF turn latch: behind-right, dPC ≤ 8.5, arc < 8, the
 *      car's body on his line before he reached it; «violation», the hook in
 *      the ledger at the latch; never a WF contact.
 *   G6b the hook is the cut-path's FIRST FAILED_TO_YIELD and first опасна
 *      event; no right-hand-rule bill on any rung; L4 ends at it.
 *   G7 only-behind keeps exactly FAILED_TO_YIELD + COLLISION, no WF hook, the
 *      WF passes the waiting car before its latch.
 *   G8 the riders' release steps are today's; the CF's ride is the free ride.
 */
import { describe, expect, it, vi } from "vitest";

const cap = vi.hoisted(() => ({ systems: [] as unknown[] }));
vi.mock("../../../traffic/system", async (orig) => {
  // The recorder builds its own traffic system and exposes no rider poses;
  // this keeps a handle on the one it built (read-only use).
  const mod = (await orig()) as Record<string, unknown>;
  const real = mod.createTrafficSystem as (...a: unknown[]) => unknown;
  return {
    ...mod,
    createTrafficSystem: (...a: unknown[]) => {
      const s = real(...a);
      cap.systems.push(s);
      return s;
    },
  };
});

import { obbSeparationM } from "../../../collision";
import { CLIP_PLAN } from "../../../../clips/clipPlan.generated";
import { FAILED_TO_YIELD_SITUATION_COPY } from "../../../rules/catalog";
import { compileScenario } from "../compile";
import { liveChainReplay } from "./liveChainReplay";
import type { TeachMoment } from "../../types";
import { VIOLATIONS } from "../../../rules/catalog";
import type { RuleEvent } from "../../../rules/types";
import { recordScVuBikelaneTurnDrive, type ScVuBikelaneTurnTraceName } from "../../../traces/scVuBikelaneTurn";
import type { ScenarioTrace } from "../../../traces/types";
import type { ScenarioLevel } from "../types";
import { SC_VU_BIKELANE_TURN } from "../templates-vru2";
import { loadDistrict } from "./witnessLiveRung";
import {
  bodyToLineM,
  carFrame,
  eventsList,
  firstRest,
  r2,
  rightLatch,
  vblDrive,
  VBL_WF_ID,
  VBL_CF_ID,
  VBL_WF_Y,
  type VblDrive,
  type VblFrame,
} from "./vblTimingDrive";

type Sys = {
  staged(id: string): { x: number; y: number; speedMps: number; s: number; nodeS: number[] } | null;
  conflictFromRight(jx: number, jy: number, px: number, py: number, h: number, r: number, s?: number): boolean;
};

interface Rec7 {
  trace: ScenarioTrace;
  frames: VblFrame[];
  ruleEvents: RuleEvent[];
  outcomes: Array<{ eventId: string; detail: string; tSec: number }>;
}

function rec7(name: ScVuBikelaneTurnTraceName): Rec7 {
  const frames: VblFrame[] = [];
  cap.systems.length = 0;
  const d = recordScVuBikelaneTurnDrive(loadDistrict("vu-bikelane-v1"), name, {
    onTick: (tick) => {
      const sys = cap.systems[cap.systems.length - 1] as Sys;
      const p = (id: string) => {
        const a = sys.staged(id);
        return a ? { x: a.x, y: a.y, v: a.speedMps, arc: a.s - a.nodeS[1] } : null;
      };
      frames.push({
        t: tick.t,
        car: { x: tick.position.x, y: tick.position.y, h: tick.headingDeg, kmh: tick.speedKmh },
        wf: p(VBL_WF_ID),
        cf: p(VBL_CF_ID),
        turns: tick.events.filter((e) => e.kind === "turnStarted").map((e) => (e as { direction: "left" | "right" }).direction),
        rc: sys.conflictFromRight(0, 0, tick.position.x, tick.position.y, tick.headingDeg, 26, Math.abs(tick.speedKmh)),
      });
    },
  });
  return {
    trace: d.trace,
    frames,
    ruleEvents: d.ruleEvents,
    outcomes: d.outcomes.map((o) => ({ eventId: o.eventId, detail: String(o.detail), tSec: o.tSec ?? NaN })),
  };
}

const LEVELS: ScenarioLevel[] = [1, 2, 3, 4, 5];
type Rung = "rec7" | `L${ScenarioLevel}`;
const RUNGS: Rung[] = ["rec7", "L1", "L2", "L3", "L4", "L5"];

interface RungRun {
  frames: VblFrame[];
  /** violations / commendations as `t code:detail` (rule log on rec7, the session ledger on L1–L5) */
  bills: Array<{ t: number; kind: string; code: string; detail?: string; situation?: string }>;
  outcomes: Array<{ eventId: string; detail: string; tSec: number }>;
  live?: VblDrive;
}

const recs = new Map<ScVuBikelaneTurnTraceName, Rec7>();
const runs = new Map<string, RungRun>();
function rec(name: ScVuBikelaneTurnTraceName): Rec7 {
  let r = recs.get(name);
  if (!r) {
    r = rec7(name);
    recs.set(name, r);
  }
  return r;
}
function run(name: ScVuBikelaneTurnTraceName, rung: Rung): RungRun {
  const key = `${name}@${rung}`;
  let r = runs.get(key);
  if (r) return r;
  const R = rec(name);
  if (rung === "rec7") {
    r = {
      frames: R.frames,
      bills: R.ruleEvents
        .filter((e) => e.kind === "violation" || e.kind === "commendation")
        .map((e) => ({ t: e.t, kind: e.kind, code: (e as { code: string }).code, detail: (e as { detail?: string }).detail, situation: (e as { situation?: string }).situation })),
      outcomes: R.outcomes,
    };
  } else {
    const L = Number(rung.slice(1)) as ScenarioLevel;
    const live = vblDrive(L, R.trace);
    r = {
      frames: live.frames,
      bills: live.out.session.events
        .filter((e) => e.kind === "violation" || e.kind === "commendation")
        .map((e) => ({ t: e.t, kind: e.kind, code: (e as { code: string }).code, detail: (e as { detail?: string }).detail, situation: (e as { situation?: string }).situation })),
      outcomes: live.out.outcomes.map((o) => ({ eventId: o.eventId, detail: String(o.detail), tSec: o.tSec ?? NaN })),
      live,
    };
  }
  runs.set(key, r);
  return r;
}

const fmt = (o: unknown) => JSON.stringify(o);

describe("the shadow — he comes from behind and passes the waiting car (G1–G5)", () => {
  for (const rung of RUNGS) {
    it(`${rung}: G1 behind-right at the car's rest · G2 passes it standing`, () => {
      const { frames, outcomes, bills } = run("shadow-correct", rung);
      const rest = firstRest(frames)!;
      expect(rest, "the shadow never came to rest").toBeDefined();
      const c = carFrame(rest, rest.wf!);
      const g1 = { t: r2(rest.t), carX: r2(rest.car.x), fwd: r2(c.fwd), left: r2(c.left), y: r2(rest.wf!.y) };
      console.log(`${rung} G1 ${fmt(g1)}`);
      expect(c.fwd, `WF rider not behind the car at its rest: ${fmt(g1)}`).toBeLessThanOrEqual(-(2.02 + 1));
      expect(c.fwd, `WF rider more than 25 m behind at the rest: ${fmt(g1)}`).toBeGreaterThanOrEqual(-25);
      expect(c.left, `WF rider not on the car's right: ${fmt(g1)}`).toBeLessThan(0);
      expect(Math.abs(rest.wf!.y - VBL_WF_Y)).toBeLessThanOrEqual(0.05);
      // G2 — he draws level with the car's centre while it stands.
      const passes = frames.find((f) => f.t >= rest.t && f.wf !== null && f.wf.x >= f.car.x);
      const g2 = passes ? { t: r2(passes.t), carKmh: r2(passes.car.kmh) } : null;
      console.log(`${rung} G2 ${fmt(g2)}`);
      expect(passes && Math.abs(passes.car.kmh) < 0.5, `WF rider never passed the standing car: ${fmt(g2)}`).toBe(true);
    }, 120_000);

    it(`${rung}: G3 both riders clear of the mouth before the turn; both runners «yielded»; no violation`, () => {
      const { frames, outcomes, bills } = run("shadow-correct", rung);
      // G3 — the turn latches after both riders are ≥ 8 m past, each by ≥ 1 s.
      const latch = rightLatch(frames)!;
      expect(latch, "the shadow never latched its right turn").toBeDefined();
      // A rider who never clears inside the drive clears at +∞.
      const wf8 = { t: frames.find((f) => f.wf && f.wf.arc >= 8)?.t ?? Infinity };
      const cf8 = { t: frames.find((f) => f.cf && f.cf.arc >= 8)?.t ?? Infinity };
      const g3 = { latch: r2(latch.t), wfArc8: r2(wf8.t), cfArc8: r2(cf8.t), wfMargin: r2(latch.t - wf8.t), cfMargin: r2(latch.t - cf8.t) };
      console.log(`${rung} G3 ${fmt(g3)} outcomes ${fmt(outcomes.map((o) => `${o.eventId}:${o.detail}@${r2(o.tSec)}`))}`);
      expect(latch.t - wf8.t, `the turn latched before the WF rider was 8 m past by 1 s: ${fmt(g3)}`).toBeGreaterThanOrEqual(1);
      expect(latch.t - cf8.t, `the turn latched before the CF rider was 8 m past by 1 s: ${fmt(g3)}`).toBeGreaterThanOrEqual(1);
      expect(latch.t).toBeLessThan(SC_VU_BIKELANE_TURN.rubric!.parTimeSec!);
      expect(outcomes.filter((o) => o.eventId === VBL_WF_ID).map((o) => o.detail)).toEqual(["yielded"]);
      expect(outcomes.filter((o) => o.eventId === VBL_CF_ID).map((o) => o.detail)).toEqual(["yielded"]);
      expect(bills.filter((b) => b.kind === "violation")).toEqual([]);
    }, 120_000);

    it(`${rung}: G4 the standing rider is passed at ≥ 2.75 m and praised once · G5 nothing else new`, () => {
      const { frames, bills } = run("shadow-correct", rung);
      let minLat = Infinity;
      let at = 0;
      for (const f of frames) {
        if (!f.wf || f.t > 12) continue;
        const c = carFrame(f, f.wf);
        if (Math.abs(c.fwd) <= 5.5 && Math.abs(c.left) < minLat) {
          minLat = Math.abs(c.left);
          at = f.t;
        }
      }
      const standing = frames.filter((f) => f.t <= at + 0.02 && f.t >= at - 2 && f.wf).every((f) => f.wf!.v === 0);
      const vp = bills.filter((b) => b.kind === "commendation" && b.situation === "vulnerable-pass");
      const list = bills.map((b) => `${r2(b.t)} ${b.code}${b.situation ? `:${b.situation}` : ""}`);
      console.log(`${rung} G4 min centre lateral ${r2(minLat)} m (rider standing: ${standing}) | G5 ${fmt(list)}`);
      expect(standing).toBe(true);
      expect(minLat, `pass under 2.75 m: ${r2(minLat)}`).toBeGreaterThanOrEqual(2.75);
      expect(vp.map((b) => r2(b.t)), `no vulnerable-pass commendation: ${fmt(list)}`).toEqual([8.18]);
      // G5 — the ledger is exactly the base's two junction credits plus G4's one.
      expect(list).toEqual(["8.18 YIELDED_TO_PRIORITY:vulnerable-pass", "36.57 YIELDED_TO_PRIORITY", "40.97 YIELDED_TO_PRIORITY"]);
      const live = run("shadow-correct", rung).live;
      if (live) {
        expect(live.out.nearMisses).toEqual([]);
        expect(live.out.teachMomentCodes).toEqual([]);
      }
    }, 120_000);
  }

  it("L3: three stars and score 0 (s-w8-bot-completion's rung, re-read here)", () => {
    const live = run("shadow-correct", "L3").live!;
    expect(live.out.rubric?.stars).toBe(3);
    expect(live.out.result.score).toBe(0);
  }, 120_000);
});

describe("the cut-path — the right hook on the rider coming from behind (G6, G6b, G6c)", () => {
  for (const rung of RUNGS) {
    it(`${rung}: G6b the hook is the first FAILED_TO_YIELD and the first опасна event; no right-hand-rule bill`, () => {
      const { bills } = run("mistake-cut-path", rung);
      const list = bills.map((b) => `${r2(b.t)} ${b.code}${b.detail ? `:${b.detail}` : ""}`);
      const firstFty = bills.find((b) => b.code === "FAILED_TO_YIELD");
      const firstOpasna = bills.find((b) => b.kind === "violation" && VIOLATIONS[b.code as keyof typeof VIOLATIONS]?.severityClass === "opasna");
      expect(firstFty?.detail, `right-hand-rule bill before the hook: ${fmt(list)}`).toBe("cyclist-right-hook");
      expect(bills.some((b) => b.detail === "right-hand-rule"), `right-hand-rule bill on the cut-path: ${fmt(list)}`).toBe(false);
      expect(firstOpasna).toBe(firstFty);
    }, 120_000);

    it(`${rung}: G6 behind-right at the latch, cut off, «violation», never touched`, () => {
      const { frames, bills, outcomes } = run("mistake-cut-path", rung);
      const latch = rightLatch(frames)!;
      expect(latch, "the cut-path never latched a right turn").toBeDefined();
      const c = carFrame(latch, latch.wf!);
      const g6 = { t: r2(latch.t), fwd: r2(c.fwd), left: r2(c.left), dPC: r2(c.dPC), arc: r2(latch.wf!.arc), y: r2(latch.wf!.y), v: r2(latch.wf!.v) };
      // The car's body on his line, and where he was then.
      const bodyOn = frames.find((f) => f.wf && bodyToLineM(f, VBL_WF_Y) === 0)!;
      const cutOff = { t: r2(bodyOn.t), riderX: r2(bodyOn.wf!.x), carX: r2(bodyOn.car.x) };
      let minSep = Infinity;
      for (const f of frames) {
        if (!f.wf) continue;
        const sep = obbSeparationM(
          { x: f.car.x, y: f.car.y, headingDeg: f.car.h, halfLengthM: 2.02, halfWidthM: 0.85 },
          { x: f.wf.x, y: f.wf.y, headingDeg: 90, halfLengthM: 0.4, halfWidthM: 0.4 },
        );
        if (sep < minSep) minSep = sep;
      }
      const core = frames.find((f) => Math.hypot(f.car.x, f.car.y) <= 18 && Math.abs(f.car.kmh) > 3)!;
      const lastRcBeforeCore = [...frames].reverse().find((f) => f.rc && f.t <= core.t);
      const list = bills.map((b) => `${r2(b.t)} ${b.code}${b.detail ? `:${b.detail}` : ""}`);
      console.log(
        `${rung} G6 ${fmt(g6)} cutOff ${fmt(cutOff)} min air rider proxy ↔ car ${r2(minSep)} | G6b core entry ${r2(core.t)} CF last right-conflict ${lastRcBeforeCore ? r2(lastRcBeforeCore.t) : "none"} | ${fmt(list)} | outcomes ${fmt(outcomes.map((o) => `${o.eventId}:${o.detail}@${r2(o.tSec)}`))}`,
      );
      const hookAtLatch = bills.some((b) => b.code === "FAILED_TO_YIELD" && b.detail === "cyclist-right-hook" && Math.abs(b.t - latch.t) < 0.02);
      expect(hookAtLatch && c.fwd < 0 && c.left < 0 && c.dPC <= 8.5, `no hook on a rider behind-right at the latch: ${fmt(g6)} ${fmt(list)}`).toBe(true);
      expect(c.dPC, `rider beyond 8.5 m of the car at the latch: ${fmt(g6)}`).toBeLessThanOrEqual(8.5);
      expect(latch.wf!.arc).toBeLessThan(8);
      expect(Math.abs(latch.wf!.y - VBL_WF_Y)).toBeLessThanOrEqual(0.05);
      expect(bodyOn.t).toBeLessThanOrEqual(latch.t);
      expect(bodyOn.wf!.x, `the car's body was not on his line before he reached it: ${fmt(cutOff)}`).toBeLessThan(bodyOn.car.x - 2.02);
      expect(minSep, `WF contact on the cut-path: ${r2(minSep)}`).toBeGreaterThan(0);
      const wf = outcomes.filter((o) => o.eventId === VBL_WF_ID);
      expect(wf.map((o) => `${o.detail}@${r2(o.tSec)}`)).toEqual([`violation@${r2(latch.t)}`]);
      const hook = bills.filter((b) => b.code === "FAILED_TO_YIELD" && b.detail === "cyclist-right-hook" && Math.abs(b.t - latch.t) < 0.02);
      expect(hook, `no hook bill at the latch: ${fmt(list)}`).toHaveLength(1);
      expect(bills.some((b) => b.code === "FOLLOWING_TOO_CLOSE")).toBe(false);
      expect(bills.some((b) => b.code === "COLLISION")).toBe(false);
    }, 120_000);
  }

  it("L4: the session ends AT the hook", () => {
    const live = run("mistake-cut-path", "L4").live!;
    const latch = rightLatch(live.frames)!;
    const last = live.frames[live.frames.length - 1];
    console.log(`L4 end ${r2(last.t)} phase ${live.out.session.phase} | hook ${r2(latch.t)} | ${fmt(eventsList(live.out))}`);
    expect(live.out.session.phase).toBe("completed");
    expect(Math.abs(last.t - latch.t)).toBeLessThan(0.02);
  }, 120_000);

  it("G6c — everything else the cut-path bills, credits or records, per rung (reported; follow and contact codes absent)", () => {
    for (const rung of RUNGS) {
      const r = run("mistake-cut-path", rung);
      const cf = r.outcomes.filter((o) => o.eventId === VBL_CF_ID).map((o) => `${o.detail}@${r2(o.tSec)}`);
      const nm = r.live ? r.live.out.nearMisses.map((n) => `${r2(n.tSec)} ${r2((n as { clearanceM: number }).clearanceM)} m`) : "(recorder: no meter)";
      const guardOn = r.frames.find((f, i) => i > 0 && f.wf && r.frames[i - 1].wf && f.t > 12 && f.wf.v < r.frames[i - 1].wf!.v - 0.01);
      console.log(
        `${rung} G6c CF ${fmt(cf)} | near-miss ${fmt(nm)} | guard first brakes him at ${guardOn ? r2(guardOn.t) : "-"} | ledger ${fmt(r.bills.map((b) => `${r2(b.t)} ${b.code}${b.detail ? `:${b.detail}` : ""}`))}`,
      );
      expect(r.bills.some((b) => b.code === "FOLLOWING_TOO_CLOSE")).toBe(false);
    }
  }, 120_000);
});

describe("the hook is the cut-path's beat — THEO-3 sandbox and clip m1 (STEP 3)", () => {
  it("sandbox sc-vu-bikelane-turn@L1~m1 latches the WF hook: mistakeMoment.t = the hook's latch, its title the row's", () => {
    const lesson = compileScenario(SC_VU_BIKELANE_TURN, 1, { mistakeExperience: { mistakeIndex: 1 } });
    expect(lesson.id).toBe("sc-vu-bikelane-turn@L1~m1");
    expect(lesson.mistakeExperience?.codes).toEqual(["FAILED_TO_YIELD"]);
    const moments: TeachMoment[] = [];
    liveChainReplay({
      lesson,
      districtRaw: loadDistrict("vu-bikelane-v1"),
      trace: rec("mistake-cut-path").trace,
      afterApply: (ctx) => {
        if (ctx.step.mistakeMoment !== undefined) moments.push(ctx.step.mistakeMoment);
      },
    });
    const hookT = rightLatch(run("mistake-cut-path", "L1").frames)!.t;
    const row = FAILED_TO_YIELD_SITUATION_COPY["cyclist-right-hook"];
    console.log(`sandbox moments ${fmt(moments.map((m) => `${r2(m.t)} ${m.code} «${m.titleBg}»`))} | hook latch L1 ${r2(hookT)}`);
    expect(moments).toHaveLength(1);
    expect(moments[0].titleBg, `sandbox latched the right-hand-rule bill, not the hook: ${fmt(moments.map((m) => `${r2(m.t)} «${m.titleBg}»`))}`).toBe(row.titleBg);
    expect(Math.abs(moments[0].t - hookT)).toBeLessThan(0.02);
  }, 120_000);

  it("clip m1's fault beat is the WF hook (clipPlan.generated.ts regenerated: 15.55 → 22.58)", () => {
    const m1 = CLIP_PLAN.find((c) => c.templateId === "sc-vu-bikelane-turn" && c.mistakeIndex === 1)!;
    const hookT = rightLatch(rec("mistake-cut-path").frames)!.t;
    console.log(`clip m1 faultTimeSec ${m1.faultTimeSec} | recorder hook ${r2(hookT)}`);
    expect(m1.faultTimeSec).toBe(r2(hookT));
  }, 120_000);
});

describe("only-behind keeps its codes, and the rear check now has its rider (G7)", () => {
  it("rec7 (the trace gate's grader): exactly FAILED_TO_YIELD + COLLISION", () => {
    const codes = [...new Set(rec("mistake-only-behind").ruleEvents.filter((e) => e.kind === "violation").map((e) => (e as { code: string }).code))].sort();
    expect(codes).toEqual(["COLLISION", "FAILED_TO_YIELD"]);
  }, 120_000);
  for (const rung of RUNGS) {
    it(`${rung}: no WF hook; he passes the waiting car before its latch`, () => {
      const { frames, outcomes } = run("mistake-only-behind", rung);
      expect(outcomes.filter((o) => o.eventId === VBL_WF_ID && o.detail !== "yielded")).toEqual([]);
      const rest = firstRest(frames);
      if (!rest) return; // L4: the session ended (opasna) before the car stood
      const passes = frames.find((f) => f.t >= rest.t && f.wf && f.wf.x >= f.car.x);
      const latch = rightLatch(frames);
      const c = carFrame(rest, rest.wf!);
      console.log(`${rung} G7 rest ${r2(rest.t)} WF fwd ${r2(c.fwd)} | passes ${passes ? r2(passes.t) : "never"} car ${passes ? r2(passes.car.kmh) : "-"} km/h | latch ${latch ? r2(latch.t) : "-"}`);
      expect(c.fwd).toBeLessThan(0);
      expect(passes && Math.abs(passes.car.kmh) < 0.5).toBe(true);
      expect(latch && passes!.t < latch.t).toBe(true);
    }, 120_000);
  }
});

describe("G8 — the riders are released on today's steps; the counter-flow ride is untouched", () => {
  // MEASURED ON THE BASE (69418cf, committed tapes, lane STEP 0): the grid
  // point index of each rider's first moving step. Release is the car's
  // distance to the node against the director's draw, so a staging change
  // cannot move it; G4's 0.2 m shift moves the car's dPJ by ≤ 0.013 m.
  const BASE: Record<Rung, { wf: number; cf: number }> = {
    rec7: { wf: 522, cf: 534 },
    L1: { wf: 546, cf: 524 },
    L2: { wf: 502, cf: 498 },
    L3: { wf: 533, cf: 511 },
    L4: { wf: 508, cf: 506 },
    L5: { wf: 520, cf: 544 },
  };
  for (const name of ["shadow-correct", "mistake-only-behind"] as const) {
    for (const rung of RUNGS) {
      it(`${name} ${rung}: release steps equal today's; the CF rides the same ride as on the untouched only-behind tape`, () => {
        const { frames } = run(name, rung);
        const wf = frames.findIndex((f) => (f.wf?.v ?? 0) > 1e-6);
        const cf = frames.findIndex((f) => (f.cf?.v ?? 0) > 1e-6);
        console.log(`${name} ${rung} G8 release steps WF ${wf} CF ${cf} (base ${BASE[rung].wf} / ${BASE[rung].cf})`);
        expect({ wf, cf }).toEqual(BASE[rung]);
        const ref = run("mistake-only-behind", rung).frames;
        let maxD = 0;
        for (let i = cf; i < Math.min(frames.length, ref.length); i++) {
          const p = frames[i].cf;
          const q = ref[i].cf;
          if (!p || !q || p.arc > 40) break;
          maxD = Math.max(maxD, Math.hypot(p.x - q.x, p.y - q.y));
        }
        expect(maxD).toBe(0);
      }, 120_000);
    }
  }
});
