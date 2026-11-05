/**
 * T9 — THE REVERSE WARNING'S MEASUREMENT IS GRADED BY NOTHING (lane rbreverse,
 * sc-roundabout-entry:9e85f27e; founder ruling Q2 2026-10-19 «WARN ONLY»: no
 * bill, no rule event, no points, no verdict change, no debrief row).
 *
 * `SimTick.reverseBrakedFor` is published by the runtime and read by exactly
 * one thing, the coach's advisor card (`lessons/advisor.ts
 * reverseWarningForSession`), through the session's fold of it
 * (`lessons/engine.ts`). Two pins:
 *
 *  1. SOURCE — no file under rules/ other than the contract (`types.ts`) names
 *     the field, and under lessons/ only the contract, the fold and the
 *     advisor do;
 *  2. EXECUTION — a reversing drive's rule events, state and session outcome
 *     are identical with the field absent, null, and set on every tick.
 *
 * `rules/__tests__/keep-right-arming-census.test.ts` §4 perturbs every SimTick
 * field too (this one included — it reads the interface).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRuleEngine, reduceTick } from "../engine";
import type { ReverseBrakedFor, SimTick } from "../types";
import { makeTick } from "../../lessons/__tests__/fixtures";
import { applyTick, createLessonSession, type LessonSessionState } from "../../lessons";
import { compileScenario } from "../../lessons/scenario/compile";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIM = path.resolve(HERE, "../..");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue;
      out.push(...sources(p));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const naming = (dir: string, re: RegExp) =>
  sources(dir)
    .filter((f) => re.test(readFileSync(f, "utf-8")))
    .map((f) => path.relative(SIM, f).replace(/\\/g, "/"))
    .sort();

describe("T9 · SimTick.reverseBrakedFor is graded by nothing", () => {
  it("SOURCE: under rules/ only the contract names the field (index.ts re-exports the TYPE only)", () => {
    expect(sources(path.join(SIM, "rules")).length).toBeGreaterThan(10);
    expect(naming(path.join(SIM, "rules"), /reverseBrakedFor/)).toEqual(["rules/types.ts"]);
    expect(naming(path.join(SIM, "rules"), /ReverseBrakedFor/)).toEqual(["rules/index.ts", "rules/types.ts"]);
  });

  it("SOURCE: under lessons/ only the contract, the session's fold and the coach name the field", () => {
    expect(naming(path.join(SIM, "lessons"), /reverseBrakedFor/)).toEqual(["lessons/advisor.ts", "lessons/engine.ts", "lessons/types.ts"]);
    // the fold is one expression, written and cleared — it reads nothing else off the field
    const engine = readFileSync(path.join(SIM, "lessons/engine.ts"), "utf-8");
    expect(engine.match(/reverseBrakedFor/g)?.length).toBe(4);
  });

  const ON: ReverseBrakedFor = { vehicleId: 1000, kind: "vehicle", fwdM: -3, leftM: 1 };
  /** Stand, shift to R, reverse 6 m, stop — with the field as `f(i)` on every tick. */
  const ticks = (f: (i: number) => ReverseBrakedFor | null | undefined): SimTick[] => {
    const out: SimTick[] = [];
    let y = 0;
    for (let i = 0; i < 600; i++) {
      const t = i / 60;
      const gear = i < 120 ? 1 : -1;
      const speedKmh = i < 180 ? 0 : i < 480 ? -4.3 : 0;
      y += (speedKmh / 3.6) / 60;
      const v = f(i);
      out.push(makeTick({ t, gear, speedKmh, position: { x: 4.06, y }, ...(v !== undefined ? { reverseBrakedFor: v } : {}) }));
    }
    return out;
  };

  it("EXECUTION: the rule engine's events and state are identical with the field absent, null, and set on every tick", () => {
    const run = (ts: SimTick[]) => {
      let s = createRuleEngine();
      const ev: unknown[] = [];
      for (const k of ts) {
        const r = reduceTick(s, k);
        s = r.state;
        ev.push(...r.events);
      }
      return JSON.stringify({ ev, s });
    };
    const base = run(ticks(() => undefined));
    expect(run(ticks(() => null))).toBe(base);
    expect(run(ticks(() => ON))).toBe(base);
    expect(run(ticks((i) => (i % 2 === 0 ? ON : { ...ON, kind: "cyclist", fwdM: -50 })))).toBe(base);
  });

  it("EXECUTION: a lesson session grades identically — events, objectives, phase, endedAtSec, crash pin — whatever the field says", () => {
    const lesson = compileScenario(SCENARIO_TEMPLATES.find((s) => s.id === "sc-roundabout-entry")!, 3);
    const run = (ts: SimTick[]) => {
      let s: LessonSessionState = createLessonSession(lesson);
      for (const k of ts) s = applyTick(s, k).state;
      const { reverseBrakedFor: _ignored, ...rest } = s;
      void _ignored;
      return JSON.stringify(rest);
    };
    const base = run(ticks(() => undefined));
    expect(run(ticks(() => null))).toBe(base);
    expect(run(ticks(() => ON))).toBe(base);
  });
});
