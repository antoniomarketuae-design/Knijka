/**
 * signFaces — the honesty rule, and the asset contract it stands on.
 *
 * Doc 86 T4: the 3D kit shipped ONE speed face, so 83 scenarios sat on a
 * 30/40/90/140 street wearing a „50" plate. signFaces.ts closes that by
 * rasterising the law-cited SVG and swapping the numeral, under one rule —
 * every failure path returns null, and a null face makes WorldProps drop the
 * KIND rather than post a plate that states the wrong limit.
 *
 * WHY THIS FILE EXISTS. The sweep-161 judge filed two BROKEN findings against
 * signFaces.ts for „a large blank grey triangular sign … no red border, no
 * glyph, no meaning" (sc-ed-poligon-chain 04-t112s, sc-zebra-approach
 * 04-t087s). Both are the BACK of a correctly built sign, measured three ways:
 * the pole (z 0.020…0.130) is drawn IN FRONT of the plate in both frames, which
 * is only possible from +Z; the Draco-decoded plate primitives of
 * sign_give_way / sign_pedestrian carry their whole area facing +Z while the
 * only -Z-facing primitive is the textured `face_*` quad; and props.ts posts
 * one А18 per DIRECTION (`for (const forward of [true, false])`), so the
 * opposing post shows the driver its back by construction — the В1 terminal
 * pass says as much in its own header.
 *
 * So neither finding was a defect. But the failure they DESCRIBE — a sign whose
 * front is a blank plate, or a plate stating a number the road does not carry —
 * is the founder's 150-review root cause, and none of it was guarded. These are
 * the guards:
 *
 *  1. the numeral swap can no longer certify a substitution that landed on the
 *     wrong element (the live defect this file was written to catch — see the
 *     mutation case below);
 *  2. intrinsic sizing can no longer emit a duplicate attribute, which would
 *     take a KIND off the map rather than merely mis-state it;
 *  3. the seven shipped faces still satisfy the preconditions the swap demands;
 *  4. every sign GLB still carries exactly one `face_*` primitive, in front of
 *     and covering its plate — the premise „only its face texture is swapped"
 *     rests on, and the thing that would actually produce the blank plate the
 *     judge thought he was looking at.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { __signFaceInternals, type SignFaceArt } from "../signFaces";

const { withNumeral, withIntrinsicSize } = __signFaceInternals;

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** …/src/modules/sim/world/components/__tests__ → platform/ */
const PLATFORM = path.resolve(HERE, "../../../../../..");
const FACE_DIR = path.join(PLATFORM, "public/sim/signs/faces");
const SIGN_DIR = path.join(PLATFORM, "public/sim/signs");
const CONTENT_SVG_DIR = path.resolve(PLATFORM, "../content/signs/svg");

/** Every art the module can be asked for (mirrors the SignFaceArt union). */
const ARTS: SignFaceArt[] = ["v26", "v33", "d4", "g2", "g3", "a19", "v28"];
/** The two that carry a substitutable numeral (WorldProps SIGN_FACE_OVERRIDE
 *  posts v26 at 20…140; v33's numerals are per-placement, so unbounded). */
const NUMERAL_ARTS: SignFaceArt[] = ["v26", "v33"];

const readFace = (art: SignFaceArt): string =>
  fs.readFileSync(path.join(FACE_DIR, `${art}.svg`), "utf8");

/** Read back what the ONE `<text>` element states, or null if there is not
 *  exactly one readable text node. The test's own eye — deliberately written
 *  from the SVG, never from the module's regex. */
function plateReads(svg: string): string | null {
  const nodes = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)];
  return nodes.length === 1 ? nodes[0]![1]!.trim() : null;
}

/** Count an attribute's occurrences inside the ROOT <svg …> tag only. */
function rootAttrCount(svg: string, attr: string): number {
  const root = /<svg\b[^>]*>/.exec(svg);
  if (!root) return 0;
  return [...root[0].matchAll(new RegExp(`\\s${attr}\\s*=`, "gi"))].length;
}

// ---------------------------------------------------------------------------
// 1. withNumeral — the plate must state the number the road is graded on
// ---------------------------------------------------------------------------

describe("withNumeral", () => {
  it("swaps the numeral on both shipped plates, for every limit the world can post", () => {
    for (const art of NUMERAL_ARTS) {
      const source = readFace(art);
      expect(plateReads(source)).toBe("60"); // the generic plate ships with 60
      for (let kmh = 5; kmh <= 200; kmh += 5) {
        const swapped = withNumeral(source, kmh);
        expect(swapped, `${art} @ ${kmh}`).not.toBeNull();
        expect(plateReads(swapped!), `${art} @ ${kmh}`).toBe(String(kmh));
      }
    }
  });

  it("refuses a face whose numeral element it cannot identify — the two-<text> case", () => {
    // THE MUTATION THAT PROVES THIS ASSERTION IS REAL.
    // The check used to be `swapped.includes(">" + numeral + "<")`, which is
    // satisfied by the substitution's OWN output: it could only ever fail when
    // the regex matched nothing, so a match on the WRONG element certified
    // itself. Measured 2026-08-19 against that code, this exact input returned
    // a face whose legend read „30" and whose plate still read „60" — on a road
    // the reducer grades at 30, i.e. doc 86 T4 restaged inside the function
    // written to close it.
    const twoTexts =
      '<svg viewBox="0 0 200 200">' +
      '<text class="legend" x="100" y="170">km/h</text>' +
      '<text class="numeral" x="100" y="126">60</text></svg>';
    const out = withNumeral(twoTexts, 30);
    expect(out).toBeNull();
    // …and state the property directly, so a future "clever" rewrite that
    // certifies again is caught by what it produced, not by how it looked:
    // whatever comes back must have its numeral element reading 30.
    if (out !== null) expect(plateReads(out)).toBe("30");
  });

  it("refuses a numeral wrapped in markup rather than guessing at it", () => {
    // `[^<]*` cannot reach past the `<`, so nothing matches. Dropping the kind
    // is the honest outcome: a numeral this code cannot read is one it must not
    // claim to have written.
    const nested = '<svg viewBox="0 0 200 200"><text x="100"><tspan>60</tspan></text></svg>';
    expect(withNumeral(nested, 30)).toBeNull();
  });

  it("refuses a face with no <text> at all", () => {
    expect(withNumeral('<svg viewBox="0 0 200 200"><circle r="88"/></svg>', 30)).toBeNull();
    // Every non-numeral face in the kit is exactly this shape — asking one for
    // a numeral must drop the kind, not post a blank plate.
    for (const art of ARTS.filter((a) => !NUMERAL_ARTS.includes(a))) {
      expect(withNumeral(readFace(art), 30), art).toBeNull();
    }
  });

  it("refuses a <text> that does not currently hold a bare number", () => {
    // A plate whose text node is a label, not a limit: swapping it would put a
    // speed where a word belongs and leave the real numeral untouched.
    const labelled = '<svg viewBox="0 0 200 200"><text x="100">СТОП</text></svg>';
    expect(withNumeral(labelled, 30)).toBeNull();
  });

  it("holds no regex state between calls", () => {
    // NUMERAL_TEXT_NODE is a module-level /g literal; a leaked `lastIndex`
    // would make the second call on identical input behave differently.
    const source = readFace("v26");
    const a = withNumeral(source, 40);
    const b = withNumeral(source, 40);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
  });
});

// ---------------------------------------------------------------------------
// 2. withIntrinsicSize — a face that cannot decode takes its KIND off the map
// ---------------------------------------------------------------------------

describe("withIntrinsicSize", () => {
  it("gives a viewBox-only root an intrinsic pixel size", () => {
    const out = withIntrinsicSize('<svg xmlns="x" viewBox="0 0 200 200"><circle/></svg>', 512);
    expect(out).toContain('width="512"');
    expect(out).toContain('height="512"');
    expect(out).toContain('viewBox="0 0 200 200"');
    expect(out).toContain("<circle/>");
  });

  it("replaces an existing width/height instead of emitting a second copy", () => {
    // THE MUTATION. The old body was `svg.replace(/<svg\b/, '<svg width=… height=…')`,
    // which on this input produced `<svg width="512" height="512" width="200"
    // height="200" …>`. A duplicate attribute makes the document unparseable,
    // <img> fails to decode it, the face comes back null and WorldProps drops
    // the KIND — a lesson narrating a sign the world never builds (O39/O40).
    const sized = "<svg width=\"200\" height='200' viewBox=\"0 0 200 200\"><circle/></svg>";
    const out = withIntrinsicSize(sized, 512);
    expect(rootAttrCount(out, "width")).toBe(1);
    expect(rootAttrCount(out, "height")).toBe(1);
    expect(out).toContain('width="512"');
    expect(out).toContain('height="512"');
    expect(out).not.toContain('width="200"');
    expect(out).not.toContain("height='200'");
  });

  it("leaves stroke-width alone (it is not a sizing attribute)", () => {
    const out = withIntrinsicSize('<svg viewBox="0 0 2 2"><circle stroke-width="16"/></svg>', 512);
    expect(out).toContain('stroke-width="16"');
    expect(rootAttrCount(out, "width")).toBe(1);
  });

  it("touches only the root tag, not a nested one", () => {
    const out = withIntrinsicSize('<svg viewBox="0 0 2 2"><svg id="inner"/></svg>', 512);
    expect([...out.matchAll(/width="512"/g)]).toHaveLength(1);
    expect(out).toContain('<svg id="inner"/>');
  });
});

// ---------------------------------------------------------------------------
// 3. The seven shipped faces still satisfy what the swap demands
// ---------------------------------------------------------------------------

describe("the shipped face artwork", () => {
  it("is a byte-copy of the reviewed, lawRefs-carrying content source", () => {
    // The whole argument for rasterising at load time is that the В26 a student
    // meets in the simulator is pixel-identical to the В26 in his theory
    // question. A drifted copy silently breaks that claim.
    for (const art of ARTS) {
      const served = fs.readFileSync(path.join(FACE_DIR, `${art}.svg`));
      const source = fs.readFileSync(path.join(CONTENT_SVG_DIR, `${art}.svg`));
      expect(served.equals(source), `${art}.svg drifted from content/signs/svg`).toBe(true);
    }
  });

  it("carries no root width/height, so intrinsic sizing is the only source", () => {
    for (const art of ARTS) {
      expect(rootAttrCount(readFace(art), "width"), art).toBe(0);
      expect(rootAttrCount(readFace(art), "height"), art).toBe(0);
    }
  });

  it("gives the two numeral plates exactly ONE swappable <text>", () => {
    // The precondition withNumeral now demands. If a future byte-copy adds a
    // second text node (a units legend, a supplementary line), every speed
    // plate in the product goes null and the world loses its limit signs —
    // this test names that at the copy, not at the frame.
    for (const art of NUMERAL_ARTS) {
      expect(plateReads(readFace(art)), art).toMatch(/^\d+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The GLB contract signFaces stands on — one face primitive, in front of
//    and covering the plate. This is what would actually produce the „blank
//    grey plate facing the driver" the sweep judge described.
// ---------------------------------------------------------------------------

interface Gltf {
  materials?: { name?: string }[];
  meshes?: { primitives: { material?: number; attributes: Record<string, number> }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
}

/** Read a .glb's JSON chunk. Draco compresses the BUFFERS, never this — the
 *  material names and the POSITION accessor min/max stay in clear, which is
 *  all this contract needs (and keeps the test WASM-free). */
function gltfJson(file: string): Gltf {
  const buf = fs.readFileSync(file);
  expect(buf.readUInt32LE(0), `${file} is not a GLB`).toBe(0x46546c67);
  let off = 12;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) return JSON.parse(buf.subarray(off + 8, off + 8 + len).toString("utf8")) as Gltf;
    off += 8 + len;
  }
  throw new Error(`${file}: no JSON chunk`);
}

/** Sign GLBs with no `face_*` primitive BY DESIGN (WorldProps SIGN_GLB says so):
 *  the Андреевски кръст is a geometry-only crossbuck, the barrier is an arm. */
const FACELESS = new Set(["sign_rail_cross.glb"]);

describe("the sign GLB kit", () => {
  // Read TOLERANTLY on purpose. A throw here happens while the describe body is
  // evaluated, and vitest reports that as „Test Files 1 failed · Tests: no
  // tests" — a red file that collected nothing, which is the exact shape this
  // project has already been burned by (a damaged node_modules once left two
  // expected-red files ABSENT while an alarm keyed on „are those two still
  // red?" answered yes). An unreadable kit must fail an ASSERTION, by name.
  let files: string[] = [];
  let readError: string | null = null;
  try {
    files = fs
      .readdirSync(SIGN_DIR)
      .filter((f) => f.startsWith("sign_") && f.endsWith(".glb"))
      .sort();
  } catch (err) {
    readError = String(err);
  }

  it("is present (a passing suite over an empty directory proves nothing)", () => {
    expect(readError, `cannot read ${SIGN_DIR}`).toBeNull();
    expect(files.length).toBeGreaterThanOrEqual(14);
  });

  it.each(files)("%s carries exactly one face primitive in front of its plate", (file) => {
    const json = gltfJson(path.join(SIGN_DIR, file));
    const mats = json.materials ?? [];
    const prims = (json.meshes ?? []).flatMap((m) => m.primitives);
    const named = (i?: number) => (i === undefined ? "" : (mats[i]?.name ?? ""));

    const faces = prims.filter((p) => named(p.material).startsWith("face_"));
    if (FACELESS.has(file)) {
      expect(faces).toHaveLength(0);
      return;
    }

    // ONE face, and it must be textured — a face primitive with no UVs cannot
    // carry the swapped art, and the kind would render as a bare plate.
    expect(faces).toHaveLength(1);
    expect(faces[0]!.attributes.TEXCOORD_0).toBeDefined();

    const plate = prims.find((p) => named(p.material) === "plate_front");
    expect(plate, `${file} has no plate_front`).toBeDefined();

    const box = (i: number) => {
      const a = (json.accessors ?? [])[i];
      expect(a?.min && a?.max, `${file}: POSITION accessor carries no min/max`).toBeTruthy();
      return { min: a!.min!, max: a!.max! };
    };
    const f = box(faces[0]!.attributes.POSITION!);
    const p = box(plate!.attributes.POSITION!);

    // The sign addresses local -Z, so "in front" is a SMALLER z. A face level
    // with or behind its plate z-fights or disappears — the blank-plate look.
    expect(f.max[2]!, `${file}: face is not in front of the plate`).toBeLessThan(p.min[2]!);
    // …and it must cover the plate, or grey backing shows around the art.
    expect(f.min[0]!).toBeLessThanOrEqual(p.min[0]!);
    expect(f.max[0]!).toBeGreaterThanOrEqual(p.max[0]!);
    expect(f.min[1]!).toBeLessThanOrEqual(p.min[1]!);
    expect(f.max[1]!).toBeGreaterThanOrEqual(p.max[1]!);
  });
});
