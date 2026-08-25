/**
 * A PARTIAL BAKE MUST SAY WHICH FRAME IT LANDS IN — sc-ov-night-gap:5085441f.
 *
 * `bakeVertexColored` (WorldProps.tsx) merges the selected primitives of a GLB
 * and then, BY DEFAULT, translates the result so its bounding box sits on
 * y = 0. For a whole prop that is the point: it grounds an export whose author
 * left it floating. For a bake filtered down to ONE elevated primitive it is a
 * silent 5.883-metre fall, and nothing about the call site says so — the flag
 * that stops it is optional and its absence looks exactly like a choice.
 *
 * It cost the night lessons their street lighting. `Streetlights` asks for
 * `emissiveIntensity: night ? 2.6 : 0` on an `0xffe6c2` lens; the audit
 * photographed every lamp head on the section dark
 * (`.audit-frames/w10-2/frames/sc-ov-night-gap__mobile-right/04-t055s.png`,
 * four posts down the left verge and one on the right, on the drill whose
 * whole subject is judging distance by lights). Both were true at once: the
 * lens WAS lit, at ankle height, behind the column that hides it.
 *
 * Two halves, because the defect needs both to come back:
 *
 *   1. THE MEASUREMENT — re-walked out of the shipped GLB, not quoted from the
 *      repair. It is what makes the flag load-bearing: if a future export
 *      grounds the lens, the flag becomes the wrong answer and this half says
 *      so before the frames do.
 *   2. THE GENERAL RULE — every filtered bake in the file must STATE its
 *      normalisation. Three of the six already needed the flag (the rail
 *      barrier's post and arm, the ad face); a rule with one enforced instance
 *      is a convention, and the corpus finds the next instance immediately.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORLD_PROPS = join(process.cwd(), "src", "modules", "sim", "world", "components", "WorldProps.tsx");
const LAMP_GLB = join(process.cwd(), "public", "sim", "streetscape", "street_lamp.glb");

// ---------------------------------------------------------------------------
// A five-hundred-byte glTF reader, deliberately not three.js
// ---------------------------------------------------------------------------

/**
 * Per-material world-space bounding boxes of a .glb, from the JSON chunk alone.
 *
 * glTF stores POSITION accessor `min`/`max` in the file, so the geometry bytes
 * never have to be decoded — the node transforms and eight corners per
 * primitive are the whole computation. Loading the real GLTFLoader here would
 * drag `three` and a DOM into a test whose entire question is arithmetic about
 * a number in a header, and the environment cannot mount that anyway (see the
 * source-walk note in demoDeckStandDown.test.tsx for the same trade).
 */
function materialBoxes(file: string): Record<string, { minY: number; maxY: number }> {
  const buf = readFileSync(file);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf-8"));

  const identity = () => {
    const m = new Float64Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  };
  const localMatrix = (n: Record<string, number[]>): Float64Array => {
    if (n.matrix) return Float64Array.from(n.matrix);
    const m = identity();
    const [tx, ty, tz] = n.translation ?? [0, 0, 0];
    const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = n.scale ?? [1, 1, 1];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    m[0] = (1 - (yy + zz)) * sx; m[1] = (xy + wz) * sx; m[2] = (xz - wy) * sx;
    m[4] = (xy - wz) * sy; m[5] = (1 - (xx + zz)) * sy; m[6] = (yz + wx) * sy;
    m[8] = (xz + wy) * sz; m[9] = (yz - wx) * sz; m[10] = (1 - (xx + yy)) * sz;
    m[12] = tx; m[13] = ty; m[14] = tz;
    return m;
  };
  const compose = (a: Float64Array, b: Float64Array): Float64Array => {
    const o = new Float64Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
        o[c * 4 + r] = s;
      }
    return o;
  };
  /** Only Y is ever asked for here — that is the axis the drop moves. */
  const worldY = (m: Float64Array, p: number[]): number =>
    m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!;

  const out: Record<string, { minY: number; maxY: number }> = {};
  const walk = (nodeIndex: number, parent: Float64Array) => {
    const node = json.nodes[nodeIndex];
    const world = compose(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        const name: string =
          prim.material !== undefined ? json.materials[prim.material].name : "(unnamed)";
        const acc = json.accessors[prim.attributes.POSITION];
        const box = (out[name] ??= { minY: Infinity, maxY: -Infinity });
        for (const cx of [acc.min[0], acc.max[0]])
          for (const cy of [acc.min[1], acc.max[1]])
            for (const cz of [acc.min[2], acc.max[2]]) {
              const y = worldY(world, [cx, cy, cz]);
              if (y < box.minY) box.minY = y;
              if (y > box.maxY) box.maxY = y;
            }
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  for (const root of json.scenes[json.scene ?? 0].nodes) walk(root, identity());
  return out;
}

// ---------------------------------------------------------------------------
// 1. The measurement the flag rests on
// ---------------------------------------------------------------------------

describe("street_lamp.glb — where the lens actually is", () => {
  const boxes = materialBoxes(LAMP_GLB);

  it("carries the four materials the two bakes are filtered on", () => {
    // The self-check. A re-export that renamed `lamp_lit` would make every
    // assertion below vacuous rather than false, and would ALSO silently empty
    // the glow bake — the include filter matches by material name.
    expect(Object.keys(boxes).sort()).toEqual([
      "lamp_head",
      "lamp_lit",
      "steel_black",
      "steel_dark",
    ]);
  });

  it("the lens hangs at the top of the mast, ~5.9 m up", () => {
    // 5.883 … 5.967 as measured 2026-08-25. The assertion is deliberately a
    // BAND and not the exact float: what matters is that the lens is nowhere
    // near the ground, so a normalising bake of it alone is a fall of metres.
    expect(boxes.lamp_lit!.minY).toBeGreaterThan(5);
    expect(boxes.lamp_lit!.maxY).toBeLessThan(6.3);
  });

  it("the lens sits INSIDE its housing — the frame the glow bake must keep", () => {
    // lamp_head 5.892 … 6.068 against lamp_lit 5.883 … 5.967. They overlap
    // because the lens is the underside of the housing; that overlap is the
    // whole reason the two bakes have to land in ONE frame.
    expect(boxes.lamp_lit!.minY).toBeLessThan(boxes.lamp_head!.maxY);
    expect(boxes.lamp_head!.minY).toBeLessThan(boxes.lamp_lit!.maxY);
  });

  it("everything BUT the lens reaches the ground, so its own drop is a no-op", () => {
    // steel_dark is the foot: 0.000 … 0.180. This is why the posts have always
    // stood correctly while the light they carry did not — the housing bake's
    // normalisation moves nothing, and only the filtered-down one falls.
    const housingMinY = Math.min(boxes.steel_dark!.minY, boxes.steel_black!.minY, boxes.lamp_head!.minY);
    expect(housingMinY).toBeCloseTo(0, 3);
    // And the drop the glow bake WOULD take is the whole height of the mast.
    expect(boxes.lamp_lit!.minY - housingMinY).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// 2. The general rule
// ---------------------------------------------------------------------------

/**
 * The source with every comment removed — and this is not tidiness.
 *
 * A gate that greps raw file text is satisfied by a line that has been COMMENTED
 * OUT, and this one was: commenting `normalize: false` out of the glow bake left
 * all seven rows green while every street lamp in the product went back to
 * burning at ankle height. Two gates in wave 2 of this programme failed the same
 * way (a regex over raw text that a commented-out interval satisfied, 43 tests
 * green while the card froze), which is why the mutation for a text gate is to
 * comment the line out and never to delete it.
 *
 * Quote-aware, because `include:` filters are full of string literals and a
 * naive `//` strip would cut one in half and take the rest of the call with it.
 */
function stripComments(source: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (quote !== null) {
      out += ch;
      if (ch === "\\") {
        out += source[i + 1] ?? "";
        i++;
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i++; // land on the `/`; the loop's own i++ steps past it
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

describe("the comment stripper is checked before it is believed", () => {
  it("removes both comment forms and keeps the strings that look like them", () => {
    expect(stripComments("a; // b\nc;")).toBe("a; \nc;");
    expect(stripComments("a; /* b */ c;")).toBe("a;   c;");
    // The case that makes it quote-aware: a literal containing the token.
    expect(stripComments('const u = "http://x"; // gone')).toBe('const u = "http://x"; \n');
    // And the case this whole function exists for.
    expect(stripComments("{ normalize: false }")).toContain("normalize: false");
    expect(stripComments("{ // normalize: false\n }")).not.toContain("normalize: false");
  });
});

/** Each `bakeVertexColored(...)` CALL in the file, sliced on balanced parens. */
function bakeCalls(source: string): string[] {
  const calls: string[] = [];
  const needle = "bakeVertexColored(";
  for (let at = source.indexOf(needle); at >= 0; at = source.indexOf(needle, at + 1)) {
    // Skip the declaration itself — `function bakeVertexColored(` is not a call.
    if (source.slice(Math.max(0, at - 9), at) === "function ") continue;
    let depth = 0;
    let end = at + needle.length - 1;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    calls.push(source.slice(at, end + 1));
  }
  return calls;
}

describe("a filtered bake states its normalisation", () => {
  // Comments OUT before the walk: see `stripComments`. Every assertion below is
  // then about source that runs, not source that is merely present in the file.
  const source = stripComments(readFileSync(WORLD_PROPS, "utf-8"));
  const calls = bakeCalls(source);

  it("the walk found the calls it is about to judge", () => {
    // The self-check again: a renamed helper or a moved file must fail loudly
    // here rather than pass an empty loop below.
    expect(calls.length).toBeGreaterThanOrEqual(10);
    expect(calls.some((c) => c.includes('n === "lamp_lit"'))).toBe(true);
  });

  it("every call carrying an `include` filter also carries `normalize`", () => {
    // The rule, and the reason it is general: a filter is the only way to make
    // a bake partial, and a partial bake is the only kind the default can move
    // off its body. Six calls are filtered today — the sign body, the signal
    // housing, the two streetlight halves, the two rail-barrier halves and the
    // two ad-prop halves; the flag is how each one says which frame it is in.
    const silent = calls.filter((c) => c.includes("include:") && !c.includes("normalize:"));
    expect(silent).toEqual([]);
  });

  it("the streetlight lens bakes UNNORMALISED and its housing normalised", () => {
    const glow = calls.find((c) => c.includes('n === "lamp_lit"'));
    const housing = calls.find((c) => c.includes('n !== "lamp_lit"'));
    expect(glow).toBeDefined();
    expect(housing).toBeDefined();
    // The fix itself. Reverting this line puts every night lamp out again, at
    // no cost to any other test in the suite — which is how it shipped.
    expect(glow).toContain("normalize: false");
    expect(housing).toContain("normalize: true");
  });
});
