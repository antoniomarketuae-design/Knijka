import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WORLD_EDGE_REARM_M,
  WORLD_EDGE_WARN_M,
  worldEdgeWarning,
} from "../district";

/**
 * =============================================================================
 * THE RIM: A MEASURE THAT NOTHING READ
 * — sc-junction-rhr:ba47b518, critical, upheld under adversarial challenge.
 * =============================================================================
 *
 * `districtWorldEdge` measured, over all 105 committed districts, that a learner
 * reaches the end of the authored world 60–78 m past the last road on EVERY map
 * in the product. It was correct, it was gated by its own test, and on
 * 2026-08-24 it had **zero non-test consumers anywhere in the tree** — its own
 * docblock said so: «it draws nothing and it ends nothing». A mention inside a
 * comment in `notifyColumn.ts` was the closest thing to a caller.
 *
 * That is the shape this programme keeps paying for: repair round 7
 * mutation-proved a change in a module nothing imports; round 8 changed a value
 * read only by its own test; 16 findings (12 critical) blame
 * `devrig/driveScript.ts`, which 404s in production. **A repair is not finished
 * when it is measured and gated. It is finished when a path from /simulator
 * reaches it.**
 *
 * So this file gates two things, and the second is the unusual one:
 *   1. the trigger behaves (edges, hysteresis, and NaN is never a warning);
 *   2. the measure is still WIRED — if the consumer is deleted, this goes red.
 */

describe("the rim trigger", () => {
  it("speaks once on the way out, not every tick", () => {
    let armed = true;
    const a = worldEdgeWarning(WORLD_EDGE_WARN_M - 1, armed);
    expect(a.speak).toBe(true);
    armed = a.armed;
    // Still inside the band, drifting further out — silence.
    const b = worldEdgeWarning(WORLD_EDGE_WARN_M - 20, armed);
    expect(b.speak).toBe(false);
    const c = worldEdgeWarning(-5, b.armed);
    expect(c.speak).toBe(false);
  });

  it("does not re-arm until the student has demonstrably come back", () => {
    let s = worldEdgeWarning(WORLD_EDGE_WARN_M - 1, true);
    expect(s.armed).toBe(false);
    // Between WARN and REARM: the hysteresis band. Still disarmed.
    s = worldEdgeWarning((WORLD_EDGE_WARN_M + WORLD_EDGE_REARM_M) / 2, s.armed);
    expect(s.armed).toBe(false);
    expect(s.speak).toBe(false);
    // Past REARM: armed again, and silent about it.
    s = worldEdgeWarning(WORLD_EDGE_REARM_M + 1, s.armed);
    expect(s.armed).toBe(true);
    expect(s.speak).toBe(false);
    // …and it can speak a second time on a second excursion.
    expect(worldEdgeWarning(WORLD_EDGE_WARN_M - 1, s.armed).speak).toBe(true);
  });

  it("is silent exactly AT the warn threshold's outside edge and above it", () => {
    expect(worldEdgeWarning(WORLD_EDGE_WARN_M, true).speak).toBe(true);
    expect(worldEdgeWarning(WORLD_EDGE_WARN_M + 0.1, true).speak).toBe(false);
  });

  it("treats an unreadable clearance as no information at all", () => {
    // The same ruling touchHintStandsDown and controlsLegendStandsDown carry: a
    // number that cannot be read must never put a card on the glass, and must
    // not silently consume the latch either.
    expect(worldEdgeWarning(Number.NaN, true)).toEqual({ armed: true, speak: false });
    expect(worldEdgeWarning(Number.POSITIVE_INFINITY, true)).toEqual({
      armed: true,
      speak: false,
    });
    expect(worldEdgeWarning(Number.NaN, false)).toEqual({ armed: false, speak: false });
  });

  it("keeps the thresholds in the order the hysteresis needs", () => {
    expect(WORLD_EDGE_REARM_M).toBeGreaterThan(WORLD_EDGE_WARN_M);
    // 35 m against the 60.000 m minimum margin measured across the catalogue:
    // the car is at least 25 m past the last road before this can fire.
    expect(WORLD_EDGE_WARN_M).toBeLessThanOrEqual(35);
  });
});

/** Every product .ts/.tsx under src, excluding tests. */
function productSources(): string[] {
  const root = path.resolve(__dirname, "../../../..");
  const out: string[] = [];
  (function walk(d: string) {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) {
        if (n === "node_modules" || n === "__tests__") continue;
        walk(p);
      } else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) {
        out.push(p);
      }
    }
  })(root);
  return out;
}

/** Source with comments stripped — a symbol named only in prose is not a use. */
function code(file: string): string {
  return readFileSync(file, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

/**
 * A word boundary, BUILT rather than written, and the reason is a bug this
 * gate had on its first run.
 *
 * It was written  new RegExp(backtick \b ${symbol} \b backtick)  — and inside a TEMPLATE
 * LITERAL, JavaScript reads \b as the BACKSPACE escape, not as a regex word
 * boundary. The pattern compiled to <backspace>worldEdgeClearanceM<backspace>,
 * which matches nothing, so the gate reported that a symbol with five live
 * consumers had none.
 *
 * A dead-code gate that cannot see code is worse than no gate. Here it failed
 * in the ALARMING direction and was caught in a minute; the identical mistake
 * inside a presence check fails in the reassuring one, and that is the
 * direction every instrument bug in this audit has failed in.
 */
/**
 * A CALL, not a mention — and the difference is not pedantry.
 *
 * `worldEdgeClearanceM` names two things: the function in district.ts and the
 * SimTick field that carries its result. A gate matching the bare name counted
 * `tick.worldEdgeClearanceM` in the HUD as a use of the FUNCTION, so unwiring
 * the runtime that computes it left the gate green — proved by mutation, which
 * is the only reason this is written this way.
 *
 * So: the symbol must be followed by `(`. A property read is not a caller.
 */
function isCalledIn(src: string, symbol: string): boolean {
  let i = src.indexOf(symbol);
  while (i >= 0) {
    const before = i === 0 ? " " : src[i - 1]!;
    let j = i + symbol.length;
    // Whitespace without an escape sequence: a lone backslash-n in this file
    // has been destroyed twice by the tooling that writes it.
    while (j < src.length && src[j]!.trim() === "") j += 1;
    // Not part of a longer identifier, and the next thing is an open paren.
    if (!/[A-Za-z0-9_$.]/.test(before) && src[j] === "(") return true;
    i = src.indexOf(symbol, i + 1);
  }
  return false;
}

/** The symbol's own home and its barrel — neither is evidence of a consumer. */
const OWN = [
  // its own home
  "modules/sim/runtime/district.ts",
  // the barrel: a door, not a caller
  "modules/sim/runtime/index.ts",
  // the CONTRACT: `worldEdgeClearanceM?: number` on SimTick matches by name and
  // reads nothing. Declaring a field is how the measure travels, not how it is
  // used — and the mutation run proved the point: with both real consumers
  // unwired, this file alone kept the gate green.
  "modules/sim/rules/types.ts",
];

describe("the measure is wired to something a student can reach", () => {
  const sources = productSources();

  it("reads a meaningful number of product files — an empty sweep is not a pass", () => {
    expect(sources.length).toBeGreaterThan(200);
  });

  for (const symbol of ["worldEdgeClearanceM", "worldEdgeWarning"]) {
    it(`${symbol} has a consumer outside its own module`, () => {
      const users = sources.filter(
        (f) =>
          // Neither the definition nor the BARREL counts. A re-export is a door,
          // not a caller — and `runtime/index.ts` re-exporting the symbol was
          // exactly the state this gate exists to refuse.
          !OWN.some((own) => f.split(path.sep).join("/").endsWith(own)) &&
          isCalledIn(code(f), symbol),
      );
      expect(
        users.map((f) => f.split(path.sep).join("/").split("/src/")[1] ?? f),
        `${symbol} is exported, tested, and read by NOTHING — the exact defect ` +
          `this file was written for. Wire it or delete it.`,
      ).not.toEqual([]);
    });
  }
});
