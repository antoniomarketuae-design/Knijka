/**
 * sc-roundabout-entry:08a0b701 (lane npcstep, round 4; the round-3 verifier's
 * V3-1) — THE GRID'S CLOCK CANNOT BE SKIPPED, BY CONSTRUCTION.
 *
 * Which grid points have been handed out is the grid's own state, and a point
 * is handed out only by the path that grades it (`GradeGrid.stepPhysics` /
 * `stepFrame`). Through round 3 `GradeGrid.clock` WAS the `SessionGridClock`,
 * so any statement holding the grid could call `clock.advanceSteps(…)` and
 * move it past a point nobody graded — the verifier's R1b, one statement above
 * the region the harnesses ran, passed every test. Now:
 *
 *   §1 the TYPE the scene holds has no advance (a skip is a compile error —
 *      the `@ts-expect-error` lines below fail `tsc` the day it gets one);
 *   §2 the OBJECT has none either (a cast finds nothing to call), is frozen,
 *      and reads the grid's live state;
 *   §3 a SOURCE CENSUS over every product module: only scene/gradeGrid.ts
 *      calls `advanceSteps` or `.advance(` on a grid clock, and only it builds
 *      a `SessionGridClock` — so no module can hold an advanceable clock the
 *      grade runs on.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { GradeGrid, type GradeGridClock } from "../gradeGrid";
import { NO_PHYSICS_STEPS, PlayerStepTrackRecorder, type SessionGridSpan } from "@/modules/sim/traffic";
import { FIXED_DT } from "@/modules/sim/vehicle/tuning";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../../..");

describe("§1 the type: the grid's clock as the scene holds it has no way to move", () => {
  it("GradeGrid.clock is a GradeGridClock — stepSec, last, timeOf, indexAt — and nothing that advances", () => {
    const grid = new GradeGrid();
    const clock: GradeGridClock = grid.clock;
    const span: SessionGridSpan = { first: 0, last: -1 };
    // Each line below is a COMPILE ERROR today; `tsc` fails if one stops being.
    // @ts-expect-error — no advanceSteps on the grid's clock
    expect(() => clock.advanceSteps(3, span)).toThrow(TypeError);
    // @ts-expect-error — no advance on the grid's clock
    expect(() => clock.advance(1, span)).toThrow(TypeError);
    // @ts-expect-error — no reset on the grid's clock
    expect(() => clock.reset()).toThrow(TypeError);
    // @ts-expect-error — `last` is read-only
    expect(() => void (clock.last = 7)).toThrow(TypeError);
    expect(clock.last).toBe(0);
  });
});

describe("§2 the object: frozen, no advance to call even through a cast, and live", () => {
  it("has exactly the four read members, is frozen, and exposes no clock behind it", () => {
    const grid = new GradeGrid();
    const c = grid.clock as unknown as Record<string, unknown>;
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.keys(c).sort()).toEqual(["indexAt", "last", "stepSec", "timeOf"]);
    for (const k of ["advanceSteps", "advance", "reset", "handOut", "lastK"]) expect(k in c).toBe(false);
    expect(Object.getPrototypeOf(c)).toBe(Object.prototype);
    // Nothing on the grid itself hands out the clock behind the view.
    const own = Object.getOwnPropertyNames(grid).filter((k) => {
      const v = (grid as unknown as Record<string, unknown>)[k];
      return typeof v === "object" && v !== null && typeof (v as { advanceSteps?: unknown }).advanceSteps === "function";
    });
    // TypeScript `private` is not runtime-private: the one field is the grid's
    // own and named so, and the census in §3 keeps every other module off it.
    expect(own).toEqual(["gridClock"]);
  });

  it("reads the grid's state: `last` follows what the grid GRADED, timeOf/indexAt are the fixed step's", () => {
    const grid = new GradeGrid();
    const steps = new PlayerStepTrackRecorder();
    for (let k = 1; k <= 3; k++) steps.record(k, 0, 0, 0);
    const graded: number[] = [];
    const world = {
      runtime: { update: () => {}, signalPhase: () => "green", sample: (_v: unknown, t: number) => ({ t, position: { x: 0, y: 0 }, events: [] }) },
      traffic: { update: () => {}, leadGapMeters: () => Infinity, setRenderSessionTime: () => {}, vehicles: [], pedestrians: [], vehicleCollisionKind: () => "vehicle", staged: () => null },
      director: null,
    };
    const n = grid.stepPhysics(steps, null, null, world as never, { isNight: false, rain: false, fog: false, snow: false }, {
      student: () => 0,
      onPoint: (pt: { k: number }) => void graded.push(pt.k),
    } as never);
    expect(n).toBe(3);
    expect(graded).toEqual([1, 2, 3]);
    expect(grid.clock.last).toBe(3);
    expect(grid.clock.stepSec).toBe(FIXED_DT);
    expect(grid.clock.timeOf(60)).toBeCloseTo(1, 12);
    expect(grid.clock.indexAt(1)).toBe(60);
    // A step source that took nothing grades nothing and moves nothing.
    expect(grid.stepPhysics(NO_PHYSICS_STEPS, null, null, world as never, { isNight: false, rain: false, fog: false, snow: false }, { student: () => 0 } as never)).toBe(0);
    expect(grid.clock.last).toBe(3);
  });
});

/** Every product source file under src/ (no tests, no fixtures). */
function productFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      productFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

describe("§3 the source census: no product module but the grid's own moves a grid clock or builds one", () => {
  const files = productFiles(SRC);
  const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, "/");

  it(`reads the product tree (${">"}500 modules) — an unreadable census is red`, () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files.map(rel)).toContain("modules/sim/scene/gradeGrid.ts");
    expect(files.map(rel)).toContain("components/sim/LessonScene.tsx");
  });

  it("`advanceSteps(…)` is called in scene/gradeGrid.ts only (once), `new SessionGridClock` appears in scene/gradeGrid.ts only, and no module calls `.advance(…)` on anything named a clock", () => {
    const advanceStepsCalls: string[] = [];
    const clockAdvanceCalls: string[] = [];
    const clockBuilds: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      if (!/advanceSteps|SessionGridClock|\.advance\(/.test(text)) continue;
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
          const name = n.expression.name.text;
          const recv = n.expression.expression.getText(sf);
          if (name === "advanceSteps") advanceStepsCalls.push(`${rel(file)}: ${n.getText(sf).slice(0, 80)}`);
          if (name === "advance" && /clock/i.test(recv)) clockAdvanceCalls.push(`${rel(file)}: ${n.getText(sf).slice(0, 80)}`);
        }
        if (ts.isNewExpression(n) && n.expression.getText(sf) === "SessionGridClock") clockBuilds.push(rel(file));
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(advanceStepsCalls).toEqual([
      "modules/sim/scene/gradeGrid.ts: this.gridClock.advanceSteps(steps.stepCount - this.gridClock.last, this.span)",
    ]);
    expect(clockAdvanceCalls).toEqual(["modules/sim/scene/gradeGrid.ts: this.gridClock.advance(endSec, this.span, untilSec)"]);
    expect(clockBuilds).toEqual(["modules/sim/scene/gradeGrid.ts"]);
  });

  it("the grid's private clock field is read in scene/gradeGrid.ts only", () => {
    const readers = files.filter((f) => /\bgridClock\b/.test(readFileSync(f, "utf-8"))).map(rel);
    expect(readers).toEqual(["modules/sim/scene/gradeGrid.ts"]);
  });
});

/** The grid's methods — every function on its prototype but the constructor. */
const GRID_METHODS = Object.getOwnPropertyNames(GradeGrid.prototype).filter(
  (k) => k !== "constructor" && typeof Object.getOwnPropertyDescriptor(GradeGrid.prototype, k)?.value === "function",
);

describe("§4 N14 (d), round 6 — the grid's GRADING MACHINERY cannot be replaced: not on an instance, not on the class (the round-5 verifier's P7)", () => {
  it("the methods are the five the grid grades with — stepFrame, stepPhysics, run, hear, reset — on a FROZEN prototype", () => {
    expect([...GRID_METHODS].sort()).toEqual(["hear", "reset", "run", "stepFrame", "stepPhysics"]);
    expect(Object.isFrozen(GradeGrid.prototype)).toBe(true);
    for (const m of GRID_METHODS) {
      const d = Object.getOwnPropertyDescriptor(GradeGrid.prototype, m)!;
      expect(d.writable, m).toBe(false);
      expect(d.configurable, m).toBe(false);
    }
  });

  it("an ASSIGNMENT through a cast throws a TypeError and replaces nothing — P7's `gradeGrid.stepPhysics = () => 0`, and every other method", () => {
    const grid = new GradeGrid();
    const g = grid as unknown as Record<string, unknown>;
    for (const m of GRID_METHODS) {
      const before = g[m];
      expect(() => {
        "use strict";
        g[m] = () => 0;
      }, m).toThrow(TypeError);
      expect(g[m], m).toBe(before);
      expect(Object.prototype.hasOwnProperty.call(grid, m), m).toBe(false);
    }
    // …the computed spelling too, and on the class itself.
    expect(() => void ((grid as unknown as Record<string, unknown>)["stepPhysics"] = () => 0)).toThrow(TypeError);
    expect(() => void ((GradeGrid.prototype as unknown as Record<string, unknown>).stepPhysics = () => 0)).toThrow(TypeError);
    expect(grid.stepPhysics).toBe(GradeGrid.prototype.stepPhysics);
  });

  it("no own property can be DEFINED over a method (the instance is not extensible), and the clock fields are non-writable and non-configurable", () => {
    const grid = new GradeGrid();
    expect(Object.isExtensible(grid)).toBe(false);
    for (const m of GRID_METHODS) {
      expect(() => Object.defineProperty(grid, m, { value: () => 0 }), m).toThrow(TypeError);
    }
    const g = grid as unknown as Record<string, unknown>;
    for (const f of ["clock", "gridClock"]) {
      const d = Object.getOwnPropertyDescriptor(grid, f)!;
      expect(d.writable, f).toBe(false);
      expect(d.configurable, f).toBe(false);
      const before = g[f];
      expect(() => void (g[f] = { last: Infinity }), f).toThrow(TypeError);
      expect(g[f], f).toBe(before);
    }
    // The grid's own state still moves — through its own methods.
    grid.reset();
    expect(grid.pendingLooks).toBe(0);
  });

  it("source census: no product module assigns a grid method, `clock` or `gridClock` (by name or computed), or defines one with Object.defineProperty", () => {
    const files = productFiles(SRC);
    const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, "/");
    const hits: string[] = [];
    const NAME = /^(stepFrame|stepPhysics|run|hear|reset|clock|gridClock)$/;
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      if (!/stepPhysics|stepFrame|gridClock|GradeGrid|gradeGrid/.test(text)) continue;
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (n: ts.Node) => {
        if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
          const l = n.left;
          const key = ts.isPropertyAccessExpression(l) ? l.name.text : ts.isElementAccessExpression(l) && ts.isStringLiteralLike(l.argumentExpression) ? l.argumentExpression.text : null;
          const recv = ts.isPropertyAccessExpression(l) || ts.isElementAccessExpression(l) ? l.expression.getText(sf) : "";
          // `this.clock = …` inside GradeGrid's constructor is the grid's own.
          if (key && NAME.test(key) && /grid|Grid/.test(recv)) hits.push(`${rel(file)}: ${n.getText(sf).slice(0, 80)}`);
        }
        if (ts.isCallExpression(n) && /^(Object|Reflect)\.(defineProperty|defineProperties|assign|set|setPrototypeOf)$/.test(n.expression.getText(sf))) {
          const target = n.arguments[0]?.getText(sf) ?? "";
          if (/grid|Grid/.test(target) && rel(file) !== "modules/sim/scene/gradeGrid.ts") hits.push(`${rel(file)}: ${n.getText(sf).slice(0, 80)}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(hits).toEqual([]);
  });
});
