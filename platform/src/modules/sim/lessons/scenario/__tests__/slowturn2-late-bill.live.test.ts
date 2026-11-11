/**
 * T-LIVE — rig w4b's S12, the slowed oncoming car (sc-turn-left-oncoming:1613ef2c; lane slowturn2, integrator
 * rulings ST-LATE, ST-LATE-READ, ST-CARD, 2026-11-09).
 *
 * WHAT THE RIG DROVE (rig-w4b at 59be0de; re-measured by this lane at ab78b58). A slow left turn across the
 * oncoming car 1001 (sc-ltap-follow, straight on). The ADDED commit lands on grid point k 2802; on that point car
 * 1001 meets ruling R13''' (1) (straight on, from the opposite approach, approaching), (2) (its route across the
 * junction met his body) and (4), with his body on its route ahead of it — but its own `playerShedMps` account has
 * not yet grown for him (L1 0, L3 0.007 m/s), so at base nothing is billed and both drives PASS with «0 наказателни
 * точки» and the ✓ «Завърши левия завой на юг, след като пропуснеш насрещните». After the commit, while his body
 * still lies on its route, its account grows: L1 0.312 m/s by k 2824 (the line; his body leaves its route at k 2830,
 * a margin of 6 grid points), L3 0.336 m/s by k 2805 (margin 25). The late read bills it there, once.
 *
 * Replayed through the live chain (`liveChainReplay`: LessonScene's own stack — `wireTrafficQueries`, the grade
 * grid, the director, the session) from the rig's own per-step samples (ADR-017), fixture
 * slowturn2-s12-rig-w4b.fixture.json. The PHONE raws give the same ticks (measured: STEP 0(b)); reported, not pinned.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import { SC_TURN_LEFT_ONCOMING } from "../templates-junctions";
import { liveChainReplay } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";
import { FIXED_DT } from "../../../vehicle/tuning";
import type { ScenarioTrace, TraceEvent, TraceSample, TraceIndicator } from "../../../traces/types";
import type { ScenarioLevel } from "../types";
import type { SimTickEvent } from "../../../rules/types";
import { FAILED_TO_YIELD_SITUATION_COPY, FAILED_TO_YIELD_SITUATION_LEFT_TURN_FORCED } from "../../../rules/catalog";

const FIX = JSON.parse(readFileSync(path.join(__dirname, "slowturn2-s12-rig-w4b.fixture.json"), "utf-8")) as {
  drives: Record<string, { rows: Array<[number, number, number, number, number, number, TraceIndicator]>; cmd: Array<[number, number, number]>; keys: Array<[number, string]> }>;
};

function traceOf(cell: string): ScenarioTrace {
  const d = FIX.drives[cell];
  const brake = new Map<number, boolean>();
  const thr = new Map<number, boolean>();
  for (const [k, t, b] of d.cmd) {
    thr.set(k, t === 1);
    brake.set(k, b === 1);
  }
  const samples: TraceSample[] = d.rows.map(([k, x, y, headingDeg, speedKmh, gear, indicator]) => ({
    tSec: k * FIXED_DT,
    x,
    y,
    headingDeg,
    steerRad: 0,
    speedKmh,
    gear,
    indicator,
    brakeOn: brake.get(k) ?? false,
    throttleOn: thr.get(k) ?? false,
  }));
  samples.unshift({ ...samples[0], tSec: 0 });
  const kind: Record<string, TraceEvent["kind"]> = { KeyQ: "glance-left", KeyE: "glance-right", KeyF: "glance-rear" };
  const events: TraceEvent[] = d.keys.map(([step, code]) => ({ tSec: step * FIXED_DT, kind: kind[code] }));
  return { meta: { scenarioId: SC_TURN_LEFT_ONCOMING.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1].tSec }, samples, events };
}

function replay(cell: string, level: ScenarioLevel) {
  const lesson = compileScenario(SC_TURN_LEFT_ONCOMING, level);
  const evs: Array<{ k: number } & Record<string, unknown>> = [];
  const hud: Array<{ k: number; kind: string; title: string }> = [];
  const o = liveChainReplay({
    lesson,
    districtRaw: loadDistrict(SC_TURN_LEFT_ONCOMING.map.districtId),
    trace: traceOf(cell),
    applyOutcomes: true,
    holdAfterSec: 0,
    afterApply: ({ t, tick, step }) => {
      const k = Math.round(t / FIXED_DT);
      for (const e of tick.events as SimTickEvent[]) if (e.kind === "turnStarted" || e.kind === "prioritySituation") evs.push({ k, ...(e as object) });
      for (const h of step.hudEvents) if (h.kind === "lesson" || h.kind === "violation" || h.kind === "commendation") hud.push({ k, kind: h.kind, title: h.titleBg });
    },
  });
  return { o, evs, hud };
}

const COPY = FAILED_TO_YIELD_SITUATION_COPY[FAILED_TO_YIELD_SITUATION_LEFT_TURN_FORCED];

describe("T-LIVE — rig w4b S12: the braking car 1001's own account took for him after the added commit is billed late, once", () => {
  for (const [cell, level, lineK] of [
    ["L1", 1, 2824],
    ["L3", 3, 2805],
  ] as const) {
    it(`S12 PC ${cell}: FAILED_TO_YIELD on car 1001 at k ${lineK} (not at the commit, k 2802); the follow runner resolves «violation», the ✓ is refused, and the card is the forced-braking act`, () => {
      const { o, evs, hud } = replay(cell, level);
      expect(evs).toEqual([
        { k: 2802, kind: "turnStarted", direction: "left", addedPath: true },
        { k: lineK, kind: "prioritySituation", situation: "left-turn-oncoming", violated: true, addedPath: true, forcedById: 1001 },
      ]);
      const follow = o.outcomes.find((x) => x.eventId === "sc-ltap-follow");
      expect(follow?.success).toBe(false);
      expect(follow?.detail).toBe("violation");
      expect(o.result.objectives.find((x) => x.id === "sc-ltap-turn")?.done).toBe(false);
      expect(o.result.passed).toBe(false);
      expect(o.result.score).toBe(10);
      const bills = o.result.summary.mistakes.filter((m) => m.code === "FAILED_TO_YIELD");
      expect(bills).toHaveLength(1);
      expect(bills[0].detail).toBe(FAILED_TO_YIELD_SITUATION_LEFT_TURN_FORCED);
      expect(bills[0].titleBg).toBe(COPY.titleBg);
      expect(bills[0].explanationBg).toBe(COPY.explanationBg);
      // ruling ST-CARD-2: one card for a left turn and a turn-round, citing both articles
      expect(bills[0].lawRef).toBe("ЗДвП чл. 37, ал. 1; чл. 38, ал. 2");
      expect(bills[0].t).toBeCloseTo(lineK * FIXED_DT, 9);
      // THEO-4: the debrief names the act and its articles, and never the pooled right-hand-rule sentence
      expect(o.debrief).toContain("Непропускане на насрещния");
      expect(o.debrief).toContain("ЗДвП чл. 37, ал. 1; чл. 38, ал. 2");
      expect(o.debrief).not.toContain("пропускаш идващите отдясно");
      // ruling ST-VERDICT-HOLD (round 3): the oncoming-wait praise «Пропусна насрещните» — shown at k 2330, 22 m
      // before the node, before this ruling — is held while the turn can still be billed and dropped by the bill:
      // the student sees the forced card and no praise for the same turn.
      expect(hud.filter((h) => h.title === "Пропусна насрещните")).toEqual([]);
      expect(hud.filter((h) => h.kind === "violation")).toEqual([{ k: lineK, kind: "violation", title: COPY.titleBg }]);
      expect(o.debrief).not.toContain("Пропусна насрещните");
    });
  }
});
