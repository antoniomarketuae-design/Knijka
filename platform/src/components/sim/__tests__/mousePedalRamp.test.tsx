import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SimInput, TouchInputSource, type PedalStamp } from "@/modules/sim/engine";
import { sessionClockAdvance } from "../lesson-ui/sessionClock";
import { browserStubs, mountMousePedals } from "./overlayMount";

/**
 * =============================================================================
 * THE MOUSE PEDALS RAMP ON WORLD TIME — catalogue-mouse-pedals:def2df09
 * (filed 2026-10-10 at 59be0de; lane uismall, 2026-11-05).
 *
 * A held mouse pad ramps on its own rAF loop (`MousePedals.tsx`, `Pedal.press`
 * → `step`). Each callback used to advance the pedal by
 * `Math.min(0.1, (now - last) / 1000)` — while the world the pedal acts on
 * advances by rapier's own clamp, `sessionClockAdvance` (0 … 0.5 s per frame,
 * `lesson-ui/sessionClock.ts`). Above 10 fps the two agree; below it the pedal
 * got a fifth of the world's time on every frame. Measured on the REAL
 * component at 2ee2469 (this file's harness, exact frame grid): the brake
 * after the first frame that reaches 0.5 s of world read 0.917 at 60 / 30 /
 * 10 fps, 0.783 at 8, 0.650 at 5 (W = 0.6), 0.517 at 4 and 0.383 at 2; a
 * single 300 ms hitch right after the press left 0.383 where 0.650 is due; and
 * a first callback whose timestamp preceded the press's `performance.now()`
 * pulled the pedal BELOW its 0.25 start (0.2433).
 *
 * THE RULE AS BUILT: the ramp advances by the session clock's own advance, so a
 * held pad reaches the same pedal after the same world time at every frame
 * rate. What this file measures is the pad's own value, frame by frame,
 * against world time — the row's measure. The world still steps each frame
 * with the value the PREVIOUS frame's ramp wrote (R3F's loop requests its next
 * frame before the ramp does, so its callback, and the physics in it, run
 * first): ADR-014's stated frame-timed class, recorded, not built here.
 *
 * Harness: the REAL `MousePedals` (overlayMount.ts), a capturing
 * `requestAnimationFrame` that honours `cancelAnimationFrame`, a controlled
 * `performance.now`, and frames on an EXACT grid (frame k at t0 + k·1000/fps,
 * computed from k, never accumulated).
 * =============================================================================
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRINT_TO = process.env.PEDAL_RAMP_PRINT;
const note = (line: string): void => {
  if (PRINT_TO) appendFileSync(PRINT_TO, line + "\n");
};

/** The two rise times, read from the component's own source below (T7 holds
 *  the file); repeated here only as the oracle's inputs. */
const RISE = { brake: 0.75, throttle: 1.1 } as const;
type PedalName = keyof typeof RISE;
/** One 60 Hz ramp step of each pedal — the tolerance of every comparison. */
const STEP = { brake: 1 / 60 / RISE.brake, throttle: 1 / 60 / RISE.throttle } as const;
const START = 0.25;
const RATES = [60, 30, 10, 8, 5, 4, 2] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Write {
  ch: PedalName;
  v: number;
  atMs: number | undefined;
}

/** A touch source that logs every pedal write the pads make. */
class LoggingTouch extends TouchInputSource {
  readonly writes: Write[] = [];
  override setBrake(value: number, atMs?: number, sinceMs?: number): void {
    this.writes.push({ ch: "brake", v: value, atMs });
    super.setBrake(value, atMs, sinceMs);
  }
  override releaseBrake(atMs?: number, sinceMs?: number): void {
    this.writes.push({ ch: "brake", v: 0, atMs });
    super.releaseBrake(atMs, sinceMs);
  }
  override setThrottle(value: number, atMs?: number, sinceMs?: number): void {
    this.writes.push({ ch: "throttle", v: value, atMs });
    super.setThrottle(value, atMs, sinceMs);
  }
  override releaseThrottle(atMs?: number, sinceMs?: number): void {
    this.writes.push({ ch: "throttle", v: 0, atMs });
    super.releaseThrottle(atMs, sinceMs);
  }
}

/** A real SimInput that records its brake / throttle channel transitions. */
class RecordingInput extends SimInput {
  readonly edges: Array<{ channel: "brake" | "throttle"; down: boolean; atMs: number; earliestMs: number }> = [];
  protected override onPedalChannelEdge(channel: "brake" | "throttle", down: boolean, stamp: PedalStamp): void {
    this.edges.push({ channel, down, atMs: stamp.atMs, earliestMs: stamp.earliestMs });
  }
}

function rig() {
  for (const [name, value] of Object.entries(browserStubs())) vi.stubGlobal(name, value);
  vi.stubGlobal("navigator", { getGamepads: () => [] });
  const raf = new Map<number, (now: number) => void>();
  let nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => {
    const id = nextId++;
    raf.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    raf.delete(id);
  });
  const clock = { ms: 0 };
  vi.stubGlobal("performance", { now: () => clock.ms });
  const input = new RecordingInput({}, () => clock.ms);
  const touch = new LoggingTouch();
  input.attachTouch(touch);
  const pads = mountMousePedals(touch);
  const ev = (timeStamp: number) => ({
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    timeStamp,
    currentTarget: { setPointerCapture() {} },
    preventDefault() {},
  });
  return {
    touch,
    input,
    raf,
    /** One animation frame at `now`: every callback queued before it runs once. */
    frame(now: number) {
      clock.ms = now;
      const due = [...raf.entries()];
      for (const [id] of due) raf.delete(id);
      for (const [, cb] of due) cb(now);
    },
    press(pedal: PedalName, atMs: number) {
      clock.ms = atMs;
      pads[pedal].onPointerDown!(ev(atMs));
    },
    release(pedal: PedalName, atMs: number) {
      clock.ms = atMs;
      pads[pedal].onPointerUp!(ev(atMs));
    },
    value(pedal: PedalName): number | null {
      return pedal === "brake" ? touch.brakeAxis : touch.throttleAxis;
    },
  };
}

/** The exact grid: frame k of a `fps` cadence after `t0`. */
const gridNow = (t0: number, fps: number, k: number): number => t0 + (k * 1000) / fps;

describe("T1 — the ramp runs on world time: value_k = min(1, 0.25 + W_k / riseSec) after EVERY frame, at every frame rate", () => {
  for (const pedal of ["brake", "throttle"] as const) {
    for (const fps of RATES) {
      it(`${pedal} at ${fps} fps, 3 s of world`, () => {
        const r = rig();
        const t0 = 1000;
        r.press(pedal, t0);
        // W_k, independently of the product's line: the session clock's advance
        // summed over the rAF frame lengths since rafNow_0 = min(press, first rAF).
        const first = gridNow(t0, fps, 1);
        let prev = Math.min(t0, first);
        let W = 0;
        const rows: string[] = [];
        for (let k = 1; W < 3 - 1e-9; k++) {
          const now = gridNow(t0, fps, k);
          W += sessionClockAdvance((now - prev) / 1000);
          prev = now;
          r.frame(now);
          const v = r.value(pedal)!;
          const expected = Math.min(1, START + W / RISE[pedal]);
          rows.push(`${k}:${W.toFixed(4)}:${v.toFixed(4)}`);
          expect(
            Math.abs(v - expected),
            `${pedal} ${fps} fps frame ${k} (W = ${W.toFixed(4)} s of world): the pad reads ${v.toFixed(4)}, world time asks ${expected.toFixed(4)}`,
          ).toBeLessThanOrEqual(STEP[pedal]);
        }
        note(`T1 ${pedal} ${fps} fps k:W:v ${rows.join(" ")}`);
      });
    }
  }
});

describe("T2 — a hitch: the pedal takes the time the world took", () => {
  it("one 300 ms frame right after the press, then 60 fps: the brake reads 0.65 after the hitch (base: 0.383)", () => {
    const r = rig();
    r.press("brake", 1000);
    r.frame(1300);
    const after = r.value("brake")!;
    note(`T2 300 ms hitch: brake ${after.toFixed(4)} (W = 0.3)`);
    expect(Math.abs(after - (START + 0.3 / RISE.brake)), `after a 300 ms hitch the brake reads ${after.toFixed(4)}`).toBeLessThanOrEqual(
      STEP.brake,
    );
    for (let k = 1; k <= 60; k++) {
      r.frame(1300 + (k * 1000) / 60);
      const W = 0.3 + k / 60;
      const v = r.value("brake")!;
      expect(Math.abs(v - Math.min(1, START + W / RISE.brake)), `60 fps after the hitch, frame ${k}`).toBeLessThanOrEqual(STEP.brake);
    }
  });

  it("one 700 ms frame: the world takes 0.5 s and so does the pedal (0.917), never 0.7 s", () => {
    const r = rig();
    r.press("brake", 1000);
    r.frame(1700);
    const after = r.value("brake")!;
    note(`T2 700 ms hitch: brake ${after.toFixed(4)} (W = 0.5)`);
    expect(Math.abs(after - (START + 0.5 / RISE.brake)), `after a 700 ms hitch the brake reads ${after.toFixed(4)}`).toBeLessThanOrEqual(
      STEP.brake,
    );
    expect(after, "a 700 ms frame must not hand the pedal 0.7 s").toBeLessThan(START + 0.7 / RISE.brake - STEP.brake);
  });
});

describe("T3 — never backwards", () => {
  it("a first callback stamped BEFORE the press's performance.now() leaves the pedal at exactly 0.25 (base: 0.2433)", () => {
    const r = rig();
    r.press("brake", 1000);
    r.frame(995);
    expect(r.value("brake"), "a frame stamped before the press moved the pedal").toBe(START);
    expect(r.value("throttle")).toBeNull();
  });

  it("a NaN frame length leaves the value unchanged", () => {
    const r = rig();
    r.press("brake", 1000);
    r.frame(1000 + 1000 / 60);
    const before = r.value("brake")!;
    expect(before).toBeGreaterThan(START);
    r.frame(Number.NaN);
    expect(r.value("brake"), "a NaN frame length moved the pedal").toBe(before);
  });
});

/** The base build's ramp, computed — `Math.min(0.1, Δ)` per callback. */
function baseSequence(pressMs: number, frames: readonly number[], rise: number): number[] {
  const out = [START];
  let v = START;
  let last = pressMs;
  for (const now of frames) {
    if (v >= 1) break;
    v = Math.min(1, v + Math.min(0.1, (now - last) / 1000) / rise);
    last = now;
    out.push(v);
  }
  return out;
}

describe("T4 — at ≥ 10 fps nothing moves: the written sequence is the base build's, to 1e-12", () => {
  const cadences: Array<{ name: string; frames: (t0: number) => number[] }> = [
    ...[60, 30, 10].map((fps) => ({
      name: `${fps} fps`,
      frames: (t0: number) => Array.from({ length: Math.ceil(2 * fps) }, (_, i) => gridNow(t0, fps, i + 1)),
    })),
    {
      name: "a jittered 12–20 ms cadence",
      frames: (t0: number) => {
        let seed = 12345;
        const rnd = () => {
          seed = (seed * 1103515245 + 12345) % 2147483648;
          return seed / 2147483648;
        };
        const out: number[] = [];
        let now = t0;
        for (let i = 0; i < 150; i++) {
          now += 12 + 8 * rnd();
          out.push(now);
        }
        return out;
      },
    },
  ];
  for (const pedal of ["brake", "throttle"] as const) {
    for (const c of cadences) {
      it(`${pedal}, ${c.name}`, () => {
        const r = rig();
        const t0 = 1000;
        const frames = c.frames(t0);
        for (let i = 0; i < frames.length; i++) {
          expect(frames[i]! - (i === 0 ? t0 : frames[i - 1]!), "each frame ≤ 100 ms, after the press").toBeLessThanOrEqual(100);
          expect(frames[i]!).toBeGreaterThan(t0);
        }
        r.press(pedal, t0);
        for (const now of frames) r.frame(now);
        const written = r.touch.writes.filter((w) => w.ch === pedal);
        const base = baseSequence(t0, frames, RISE[pedal]);
        expect(written.map((w) => w.atMs)).toEqual([t0, ...base.slice(1).map(() => undefined)]);
        expect(written).toHaveLength(base.length);
        for (let i = 0; i < base.length; i++) {
          expect(Math.abs(written[i]!.v - base[i]!), `${pedal} ${c.name} write ${i}`).toBeLessThanOrEqual(1e-12);
        }
      });
    }
  }
});

describe("T5 — release is unchanged: 0 at the pointer's own time, the ramp cancelled, nothing written after it", () => {
  for (const pedal of ["brake", "throttle"] as const) {
    for (const fps of RATES) {
      it(`${pedal} at ${fps} fps`, () => {
        const r = rig();
        const t0 = 1000;
        r.press(pedal, t0);
        r.frame(gridNow(t0, fps, 1));
        expect(r.value(pedal)!, "mid-ramp").toBeLessThan(1);
        const upAt = gridNow(t0, fps, 1) + 7;
        r.release(pedal, upAt);
        const log = r.touch.writes.filter((w) => w.ch === pedal);
        expect(log[log.length - 1], "the release writes 0 at the pointer event's timeStamp").toEqual({ ch: pedal, v: 0, atMs: upAt });
        expect(r.raf.size, "the ramp's callback is still queued after the release").toBe(0);
        const count = r.touch.writes.length;
        for (let k = 2; k <= 5; k++) r.frame(gridNow(t0, fps, k));
        expect(r.value(pedal), "the pedal came back after the release").toBeNull();
        expect(r.touch.writes.length, "something was written after the release").toBe(count);
        const again = gridNow(t0, fps, 6);
        r.press(pedal, again);
        expect(r.touch.writes[r.touch.writes.length - 1], "a re-press restarts at 0.25").toEqual({ ch: pedal, v: START, atMs: again });
      });
    }
  }
});

describe("T6 — the channel does not move (479127b's stamps): a held brake at 2 fps is ONE down edge at the press and one up at the release", () => {
  it("2 fps, held 3 s", () => {
    const r = rig();
    r.press("brake", 1200);
    for (let k = 1; k <= 6; k++) r.frame(gridNow(1200, 2, k));
    r.release("brake", 4300);
    expect(r.input.edges.filter((e) => e.channel === "brake")).toEqual([
      { channel: "brake", down: true, atMs: 1200, earliestMs: 1200 },
      { channel: "brake", down: false, atMs: 4300, earliestMs: 4300 },
    ]);
  });
});

describe("T7 — ONE clamp: the ramp's step names the session clock and carries no second number for it", () => {
  const SRC = readFileSync(path.resolve(HERE, "../lesson-ui/MousePedals.tsx"), "utf-8");
  // Parsed, not grepped: a comment is trivia to the parser, so prose about the
  // rule can neither satisfy nor break these checks.
  const file = ts.createSourceFile("MousePedals.tsx", SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const printer = ts.createPrinter({ removeComments: true });
  const flat = (n: ts.Node) => printer.printNode(ts.EmitHint.Unspecified, n, file).replace(/\s+/g, "");

  const stepBodies: ts.Node[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "step" &&
      n.initializer !== undefined &&
      ts.isArrowFunction(n.initializer) &&
      n.initializer.parameters.length === 1 &&
      n.initializer.parameters[0]!.name.getText(file) === "now" &&
      n.initializer.parameters[0]!.type?.getText(file) === "number"
    ) {
      stepBodies.push(n.initializer.body);
    }
    ts.forEachChild(n, visit);
  };
  visit(file);

  it("there is exactly one `const step = (now: number) => {…}`", () => {
    expect(stepBodies).toHaveLength(1);
  });

  it("its body advances by sessionClockAdvance((now - last) / 1000)", () => {
    const calls: string[] = [];
    const find = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "sessionClockAdvance") calls.push(flat(n));
      ts.forEachChild(n, find);
    };
    find(stepBodies[0]!);
    expect(calls, "the ramp's step does not advance by the session clock").toContain("sessionClockAdvance((now-last)/1000)");
  });

  it('the file imports sessionClockAdvance from "./sessionClock"', () => {
    const imported = file.statements.some(
      (s) =>
        ts.isImportDeclaration(s) &&
        ts.isStringLiteral(s.moduleSpecifier) &&
        s.moduleSpecifier.text === "./sessionClock" &&
        s.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(s.importClause.namedBindings) &&
        s.importClause.namedBindings.elements.some((e) => e.name.text === "sessionClockAdvance" && !e.isTypeOnly),
    );
    expect(imported, 'MousePedals.tsx does not import sessionClockAdvance from "./sessionClock"').toBe(true);
  });

  it("no numeric literal in the step equals 0.1 or 0.5 (`.5`, `5e-1`, `0.50` included)", () => {
    const literals: string[] = [];
    const find = (n: ts.Node): void => {
      if (ts.isNumericLiteral(n)) literals.push(n.getText(file));
      ts.forEachChild(n, find);
    };
    find(stepBodies[0]!);
    const values = literals.map((l) => Number(l.replace(/_/g, "")));
    expect(values.every((v) => Number.isFinite(v)), literals.join(",")).toBe(true);
    const second = literals.filter((_, i) => values[i] === 0.1 || values[i] === 0.5);
    expect(second, `a second clamp number in the ramp's step: ${second.join(", ")}`).toEqual([]);
  });

  it("the parser technique itself can see each shape (synthetic sources)", () => {
    for (const [lit, val] of [
      ["0.1", 0.1],
      [".5", 0.5],
      ["5e-1", 0.5],
      ["0.50", 0.5],
      ["1e-1", 0.1],
    ] as const) {
      const f = ts.createSourceFile("x.ts", `const step = (now: number) => { /* 0.5 */ const dt = Math.min(${lit}, now); };`, ts.ScriptTarget.Latest, true);
      const nums: number[] = [];
      const find = (n: ts.Node): void => {
        if (ts.isNumericLiteral(n)) nums.push(Number(n.getText(f).replace(/_/g, "")));
        ts.forEachChild(n, find);
      };
      find(f);
      expect(nums, lit).toEqual([val]);
    }
  });
});
