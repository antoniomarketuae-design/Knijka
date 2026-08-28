/**
 * THE POOL BELONGS UNDER THE ARM, AND THE ARM REACHES OVER THE ROAD —
 * wave 8, sc-ov-night-gap:5085441f (critical), the second half of the repair.
 *
 * `Streetlights` in WorldProps.tsx bakes a 16 m additive disc into the lamp's
 * own frame and lets `createInstancedMesh` carry it out to each column with
 * that placement's yaw. The offset is therefore ONE SIGNED NUMBER on one axis,
 * and the comment above it says which way it must go: „the pool sits on the
 * ROAD under the arm, not under the column". It shipped pointing the other way.
 *
 * Nothing caught it. `grep -R 'LAMP_POOL\|streetlight-pools\|makeLampPoolTexture'`
 * over the whole test tree returned nothing before this file; the only gate the
 * pool had was `drawSlots`, which counts families and is blind to direction. So
 * the wrong sign cost the exact metres the right one buys — 2.2 m out instead of
 * 2.2 m in, a 4.4 m error — and put the only pool of light in the scene on the
 * pavement, on the one drill («тъмно е и си извън града») whose whole subject is
 * what a driver can see at night.
 *
 * WHY THIS FILE DERIVES INSTEAD OF ASSERTING A NUMBER. A one-character geometry
 * fix guarded by `expect(offset).toBe(2.2)` is not a gate: it pins today's
 * arithmetic and says nothing about the claim. Every step below is re-measured
 * off the shipped asset and the shipped source, so the chain that decides the
 * direction is the chain under test:
 *
 *   1. WHERE THE ARM IS — per-material bounds walked out of
 *      `public/sim/streetscape/street_lamp.glb`. The arm, head and lens all run
 *      out along local +X; the column is the only thing at the origin.
 *   2. WHERE THE BAKE PUTS IT — `rotateY` read from the two streetlight
 *      `bakeVertexColored` calls in WorldProps.tsx and applied to the measured
 *      lens centroid. A future re-export or a changed bake angle moves this
 *      step, and the assertion moves with it.
 *   3. WHICH WAY THE POOL IS PUSHED — the `geo.translate(...)` arguments read
 *      out of the same file and evaluated. §3 is the assertion the defect fails.
 *   4. AND WHAT THAT MEANS ON A REAL MAP — `buildWorldGeometry` on three
 *      shipped districts, including the drill's own `ov-oncoming-v1`, with the
 *      pool centre measured against the carriageway the column stands beside.
 *      §4 carries its own control: the opposite sign must make the same
 *      measurement worse, or the measurement is not direction-sensitive and
 *      §4 proves nothing.
 *
 * STILL OWED A LOOK (doc 66 R0). Geometry that reasons correctly can render
 * wrong — the disc is additive, depth-write-off and drawn at y = 0.05, and none
 * of that is decided here. This file says the light is pooled on the correct
 * SIDE; only a night frame says it looks like a street lamp.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildWorldGeometry } from "../../builders/buildWorldGeometry";
import { assertDistrict, type District } from "../../types";

const WORLD_PROPS = join(
  process.cwd(),
  "src",
  "modules",
  "sim",
  "world",
  "components",
  "WorldProps.tsx",
);
const LAMP_GLB = join(process.cwd(), "public", "sim", "streetscape", "street_lamp.glb");
const WORLD_DIR = join(process.cwd(), "..", "content", "world");

// ---------------------------------------------------------------------------
// 1. The asset: per-material boxes straight out of the glb header
// ---------------------------------------------------------------------------

type Box = { min: [number, number, number]; max: [number, number, number] };

/**
 * Per-material bounding boxes of a .glb in the scene's own frame, from the JSON
 * chunk alone.
 *
 * glTF stores the POSITION accessor's `min`/`max` in the file, so the geometry
 * bytes never have to be decoded: the node transforms and eight corners per
 * primitive are the whole computation. `prop-bake-normalisation.test.ts` walks
 * the same header for the Y axis and records why the real GLTFLoader is the
 * wrong tool here (it drags `three` and a DOM into a test whose question is
 * arithmetic about numbers in a header); this one needs all three axes,
 * because the defect is on X.
 */
function materialBoxes(file: string): Record<string, Box> {
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
    const x2 = x! + x!, y2 = y! + y!, z2 = z! + z!;
    const xx = x! * x2, xy = x! * y2, xz = x! * z2;
    const yy = y! * y2, yz = y! * z2, zz = z! * z2;
    const wx = w! * x2, wy = w! * y2, wz = w! * z2;
    m[0] = (1 - (yy + zz)) * sx!; m[1] = (xy + wz) * sx!; m[2] = (xz - wy) * sx!;
    m[4] = (xy - wz) * sy!; m[5] = (1 - (xx + zz)) * sy!; m[6] = (yz + wx) * sy!;
    m[8] = (xz + wy) * sz!; m[9] = (yz - wx) * sz!; m[10] = (1 - (xx + yy)) * sz!;
    m[12] = tx!; m[13] = ty!; m[14] = tz!;
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
  const applyTo = (m: Float64Array, p: number[]): [number, number, number] => [
    m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!,
    m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!,
    m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!,
  ];

  const out: Record<string, Box> = {};
  const walk = (nodeIndex: number, parent: Float64Array) => {
    const node = json.nodes[nodeIndex];
    const world = compose(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        const name: string =
          prim.material !== undefined ? json.materials[prim.material].name : "(unnamed)";
        const acc = json.accessors[prim.attributes.POSITION];
        const box = (out[name] ??= {
          min: [Infinity, Infinity, Infinity],
          max: [-Infinity, -Infinity, -Infinity],
        });
        for (const cx of [acc.min[0], acc.max[0]])
          for (const cy of [acc.min[1], acc.max[1]])
            for (const cz of [acc.min[2], acc.max[2]]) {
              const p = applyTo(world, [cx, cy, cz]);
              for (let k = 0; k < 3; k++) {
                if (p[k]! < box.min[k]!) box.min[k] = p[k]!;
                if (p[k]! > box.max[k]!) box.max[k] = p[k]!;
              }
            }
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  for (const root of json.scenes[json.scene ?? 0].nodes) walk(root, identity());
  return out;
}

// ---------------------------------------------------------------------------
// 2. The source: the two numbers the render actually uses
// ---------------------------------------------------------------------------

/**
 * The file with comments removed, quote-aware — the same discipline
 * `prop-bake-normalisation.test.ts` records and for the same reason: a gate
 * that greps raw text is satisfied by a line that has been COMMENTED OUT, and
 * a commented-out `geo.translate` would leave the pool centred on the column
 * with every row here green.
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
      i++;
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

const SOURCE = stripComments(readFileSync(WORLD_PROPS, "utf-8"));

/** Every `const NAME = <expr>;` in the file, as raw text. */
function constExpressions(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*([^;]+);/g;
  for (let m = re.exec(source); m; m = re.exec(source)) out[m[1]!] = m[2]!.trim();
  return out;
}
const CONSTS = constExpressions(SOURCE);

/**
 * Evaluate a numeric expression lifted out of the source, resolving the file's
 * own `const` names and `Math.PI` first. Anything that is not then plain
 * arithmetic throws rather than silently returning NaN — a `LAMP_POOL_*`
 * turned into a runtime expression must break this file loudly, because at
 * that point the direction is no longer decided at build time and none of the
 * reasoning below holds.
 */
function evalNumeric(expr: string, depth = 0): number {
  if (depth > 8) throw new Error(`const expressions nest too deep: ${expr}`);
  let e = expr.trim();
  // Longest first, so a name that is a prefix of another cannot shadow it.
  for (const name of Object.keys(CONSTS).sort((a, b) => b.length - a.length)) {
    if (!e.includes(name)) continue;
    e = e.split(name).join(`(${evalNumeric(CONSTS[name]!, depth + 1)})`);
  }
  e = e.split("Math.PI").join(`(${Math.PI})`);
  if (!/^[-+*/().\d\s]+$/.test(e)) throw new Error(`not a build-time number: ${expr} -> ${e}`);
  const value = Function(`"use strict"; return (${e});`)() as number;
  if (!Number.isFinite(value)) throw new Error(`not finite: ${expr}`);
  return value;
}

/** The text of every call to `fn(` in the source, sliced on balanced parens. */
function callsTo(fn: string, source: string): string[] {
  const calls: string[] = [];
  const needle = `${fn}(`;
  for (let at = source.indexOf(needle); at >= 0; at = source.indexOf(needle, at + 1)) {
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

/** Split a call's argument list on top-level commas. */
function args(call: string): string[] {
  const inner = call.slice(call.indexOf("(") + 1, call.lastIndexOf(")"));
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      out.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(inner.slice(start).trim());
  return out;
}

/** The two streetlight bakes, found by the material filter each is defined by. */
const BAKES = callsTo("bakeVertexColored", SOURCE);
const GLOW_BAKE = BAKES.find((c) => c.includes('n === "lamp_lit"'));
const HOUSING_BAKE = BAKES.find((c) => c.includes('n !== "lamp_lit"'));

function bakeRotateY(call: string): number {
  const m = /rotateY\s*:\s*([^,}]+)/.exec(call);
  if (!m) return 0;
  return evalNumeric(m[1]!);
}

/** The pool's baked offset, in the lamp's post-bake local frame. */
const POOL_TRANSLATE = (() => {
  const call = callsTo("geo.translate", SOURCE)[0];
  if (!call) throw new Error("no geo.translate call in WorldProps.tsx");
  const a = args(call);
  if (a.length !== 3) throw new Error(`geo.translate takes 3 args, found ${a.length}`);
  return { raw: call, x: evalNumeric(a[0]!), y: evalNumeric(a[1]!), z: evalNumeric(a[2]!) };
})();

/** Rotation about +Y, three.js convention: (x, z) -> (c·x + s·z, −s·x + c·z). */
function rotY(angle: number, x: number, z: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * x + s * z, -s * x + c * z];
}

// ---------------------------------------------------------------------------
// §0 — the walk found what it is about to judge
// ---------------------------------------------------------------------------

describe("§0 the parse is checked before it is believed", () => {
  it("found the streetlight bakes and the pool's translate", () => {
    // Without this the file passes vacuously on a rename: `find` returning
    // undefined and an empty parse are indistinguishable from agreement.
    expect(GLOW_BAKE, "the lamp_lit bake").toBeDefined();
    expect(HOUSING_BAKE, "the non-lamp_lit bake").toBeDefined();
    expect(POOL_TRANSLATE.raw).toContain("geo.translate(");
  });

  it("the pool's translate is the ONE the pool block owns", () => {
    // `callsTo` takes the first; assert there is only one, or "the first" is a
    // coincidence that a second baked offset elsewhere would quietly break.
    expect(callsTo("geo.translate", SOURCE)).toHaveLength(1);
  });

  it("the evaluator resolves the file's own constants, and refuses anything else", () => {
    expect(CONSTS.LAMP_POOL_ARM_REACH_M).toBeDefined();
    expect(evalNumeric("LAMP_POOL_ARM_REACH_M")).toBeGreaterThan(0);
    expect(evalNumeric("-Math.PI / 2")).toBeCloseTo(-Math.PI / 2, 12);
    expect(() => evalNumeric("someRuntimeValue")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// §1 — where the arm is, measured off the shipped asset
// ---------------------------------------------------------------------------

describe("§1 street_lamp.glb — the arm runs out along local +X", () => {
  const boxes = materialBoxes(LAMP_GLB);

  it("carries the four materials the bakes are filtered on", () => {
    expect(Object.keys(boxes).sort()).toEqual([
      "lamp_head",
      "lamp_lit",
      "steel_black",
      "steel_dark",
    ]);
  });

  it("the head and the lens sit entirely on the +X side of the column", () => {
    // Measured 2026-08-28: steel_black x −0.075 … 1.116 (column + arm),
    // lamp_head 0.741 … 1.299, lamp_lit 0.791 … 1.249. The assertions are the
    // SIGN and the ordering, not the floats — a re-export that lengthens the
    // arm keeps them, one that mirrors it does not.
    expect(boxes.lamp_head!.min[0]).toBeGreaterThan(0);
    expect(boxes.lamp_lit!.min[0]).toBeGreaterThan(0);
    expect(boxes.steel_black!.max[0]).toBeGreaterThan(boxes.lamp_head!.min[0]);
  });

  it("the arm is an X reach and NOT a Z one — the axis the pool is offset on", () => {
    // The column is thin in z (±0.075) and the head barely wider (±0.120): all
    // of the lamp's horizontal extent is on X. If a future export ran the arm
    // along Z instead, the bake rotation in §2 would stop being the thing that
    // aims it and this file must say so here rather than agree by accident.
    const lens = boxes.lamp_lit!;
    const reachX = (lens.min[0]! + lens.max[0]!) / 2;
    const reachZ = (lens.min[2]! + lens.max[2]!) / 2;
    expect(Math.abs(reachZ)).toBeLessThan(Math.abs(reachX) * 0.05);
  });

  it("the foot is at the origin, so the bake's frame is the COLUMN's", () => {
    // The pool offset is measured from the instance origin. That origin is the
    // foot of the mast only because neither streetlight bake centres XZ — if
    // one started to, the origin would slide out under the arm and the reach
    // would be counted twice.
    const foot = boxes.steel_dark!;
    expect((foot.min[0]! + foot.max[0]!) / 2).toBeCloseTo(0, 3);
    expect((foot.min[2]! + foot.max[2]!) / 2).toBeCloseTo(0, 3);
    expect(GLOW_BAKE).not.toContain("centerXZ");
    expect(HOUSING_BAKE).not.toContain("centerXZ");
  });
});

// ---------------------------------------------------------------------------
// §2 — where the bake puts it
// ---------------------------------------------------------------------------

/** The lens centroid in the lamp's POST-BAKE local frame, [x, z]. */
const ARM_LOCAL: [number, number] = (() => {
  const lens = materialBoxes(LAMP_GLB).lamp_lit!;
  const angle = bakeRotateY(GLOW_BAKE ?? "");
  return rotY(angle, (lens.min[0]! + lens.max[0]!) / 2, (lens.min[2]! + lens.max[2]!) / 2);
})();

describe("§2 the bake aims the arm at the road", () => {
  it("both streetlight halves are baked with the SAME rotation", () => {
    // They are two filtered bakes of one asset drawn at one set of transforms.
    // A divergence here would separate the lens from the head it hangs in, and
    // would also make „the arm direction" ambiguous for everything below.
    expect(bakeRotateY(GLOW_BAKE ?? "")).toBeCloseTo(bakeRotateY(HOUSING_BAKE ?? ""), 12);
  });

  it("after the bake the arm points along local +Z", () => {
    // rotateY(−π/2) sends +X to +Z, and `yawFromFacing` (builders/mesh.ts) is
    // defined as the yaw that points local +Z along a placement's facing. So
    // +Z is the axis the placement aims, and `props.ts` aims it at the
    // centreline: `facing = mul(r, -side)` against a column offset `+side`.
    const [ax, az] = ARM_LOCAL;
    expect(az).toBeGreaterThan(0);
    expect(Math.abs(ax)).toBeLessThan(Math.abs(az) * 0.05);
  });
});

// ---------------------------------------------------------------------------
// §3 — the assertion the defect fails
// ---------------------------------------------------------------------------

describe("§3 the pool is offset ALONG the arm, not away from it", () => {
  it("sits above the ground plane and on the column's own axis in X", () => {
    expect(POOL_TRANSLATE.x).toBe(0);
    expect(POOL_TRANSLATE.y).toBeGreaterThan(0);
  });

  it("THE GATE: the offset and the arm point the same way", () => {
    // This is the whole finding. `geo.translate(0, y, -REACH)` gives a negative
    // dot against an arm on +Z: the disc is pushed 2.2 m onto the FOOTWAY, a
    // 4.4 m error against the 2.2 m it was meant to reach over the carriageway.
    // Written as a dot product rather than as `toBe(2.2)` so that a changed
    // bake angle, a re-exported asset or a differently-authored offset axis all
    // still have to satisfy the claim the comment makes.
    const [ax, az] = ARM_LOCAL;
    const dot = ax * POOL_TRANSLATE.x + az * POOL_TRANSLATE.z;
    expect(dot).toBeGreaterThan(0);
  });

  it("and it is offset essentially straight down the arm", () => {
    // A pool square to the arm would be on the road too, by luck of the disc's
    // radius, and would still be wrong. Cross product ~ 0 relative to the
    // magnitudes: the offset is parallel to the reach, not merely not-opposed.
    const [ax, az] = ARM_LOCAL;
    const cross = ax * POOL_TRANSLATE.z - az * POOL_TRANSLATE.x;
    const scale = Math.hypot(ax, az) * Math.hypot(POOL_TRANSLATE.x, POOL_TRANSLATE.z);
    expect(Math.abs(cross)).toBeLessThan(scale * 0.05);
  });
});

// ---------------------------------------------------------------------------
// §4 — and what that means on a real map
// ---------------------------------------------------------------------------

function loadDistrict(id: string): District {
  return assertDistrict(JSON.parse(readFileSync(join(WORLD_DIR, `${id}.json`), "utf8")));
}

/** Distance from a district-space point to the nearest road centreline, m. */
function distanceToRoad(district: District, px: number, py: number): number {
  let best = Infinity;
  for (const edge of district.roads.edges) {
    const g = edge.geometry;
    for (let i = 1; i < g.length; i++) {
      const [ax, ay] = g[i - 1]!;
      const [bx, by] = g[i]!;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * `ov-oncoming-v1` is the drill's own map — the night gap is graded on it. The
 * other two are the residential scenario maps `props.ts` names when it explains
 * why `SCENARIO_LIT_CLASSES` exists at all, so the row is exercised on both
 * pitches (arterial and жилищна) and on curved geometry, not just the straight
 * corridor where any sign convention looks symmetric.
 */
const DISTRICTS = ["ov-oncoming-v1", "sp-creep-v1", "sp-zone30-v1"] as const;

describe("§4 on the shipped maps, the pool lands on the carriageway side", () => {
  for (const id of DISTRICTS) {
    const world = buildWorldGeometry(loadDistrict(id), { seed: 7 });
    const district = loadDistrict(id);
    const lamps = world.streetlights;

    it(`${id}: has lamps to judge at all`, () => {
      // The control that stops the loops below from passing on an empty list —
      // the „green by vacuum" trap this corpus keeps re-finding.
      expect(lamps.length).toBeGreaterThan(0);
    });

    it(`${id}: every pool centre is nearer its road than the column that carries it`, () => {
      const worse: string[] = [];
      for (const lamp of lamps) {
        // world [x, y, z] -> district (x, −z); the instance matrix is a plain
        // yaw about +Y, so the baked offset rotates with it and nothing else.
        const [ox, oz] = rotY(lamp.yaw, POOL_TRANSLATE.x, POOL_TRANSLATE.z);
        const colD = distanceToRoad(district, lamp.position[0], -lamp.position[2]);
        const poolD = distanceToRoad(
          district,
          lamp.position[0] + ox,
          -(lamp.position[2] + oz),
        );
        if (!(poolD < colD)) worse.push(`${colD.toFixed(2)} -> ${poolD.toFixed(2)}`);
      }
      expect(worse, `${worse.length}/${lamps.length} pools moved AWAY from the road`).toEqual([]);
    });

    it(`${id}: and the opposite sign measurably moves them away — the control`, () => {
      // Without this, §4 is satisfied by any measurement that happens to shrink
      // (a disc offset by nothing at all would tie, not fail). Flipping the
      // baked offset must make every one of them worse by the same metric, or
      // the metric is not sensitive to the thing this file is about.
      const better: string[] = [];
      for (const lamp of lamps) {
        const [ox, oz] = rotY(lamp.yaw, -POOL_TRANSLATE.x, -POOL_TRANSLATE.z);
        const colD = distanceToRoad(district, lamp.position[0], -lamp.position[2]);
        const poolD = distanceToRoad(
          district,
          lamp.position[0] + ox,
          -(lamp.position[2] + oz),
        );
        if (poolD <= colD) better.push(`${colD.toFixed(2)} -> ${poolD.toFixed(2)}`);
      }
      expect(better, `${better.length}/${lamps.length} pools were no worse when flipped`).toEqual(
        [],
      );
    });
  }
});
